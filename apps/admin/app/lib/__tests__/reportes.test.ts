import { describe, it, expect } from "vitest";
import { variacionPct, agregarTiemposCocina, agruparVentasVariantes } from "../reportes";

describe("variacionPct (deltas del dashboard P-177)", () => {
  it("calcula subidas y bajadas redondeadas a entero", () => {
    expect(variacionPct(16550 * 1.12, 16550)).toBe(12);
    expect(variacionPct(1240, 1280)).toBe(-3);
    expect(variacionPct(290, 280)).toBe(4);
  });

  it("devuelve 0 cuando no hubo cambio", () => {
    expect(variacionPct(500, 500)).toBe(0);
  });

  it("devuelve null sin base de comparación — nunca Infinity ni NaN", () => {
    // Primer día del negocio: no hay día previo.
    expect(variacionPct(18540, null)).toBeNull();
    expect(variacionPct(18540, undefined)).toBeNull();
    // Día previo cerrado en 0: "subió infinito%" no informa nada al dueño.
    expect(variacionPct(18540, 0)).toBeNull();
  });
});

describe("agregarTiemposCocina (P-190)", () => {
  const fila = (dia: Record<string, unknown>) => ({
    modo_servicio: "PARA_LLEVAR",
    tickets_total: 0,
    minutos_cocina_promedio: 0,
    minutos_cocina_p95: 0,
    tickets_cocina_bajo_15min: 0,
    tickets_cocina_16_30min: 0,
    tickets_cocina_mayor_30min: 0,
    ...dia,
  });

  it("pondera el promedio por comandas, no promedia los promedios", () => {
    // Día flojo: 2 comandas a 30 min. Sábado: 200 comandas a 10 min.
    // Promedio real = (2*30 + 200*10) / 202 = 10.19 min.
    // Promediar promedios daría (30+10)/2 = 20 min: el doble de lo real.
    const filas = [
      fila({ tickets_total: 2, minutos_cocina_promedio: 30 }),
      fila({ tickets_total: 200, minutos_cocina_promedio: 10 }),
    ];
    const [r] = agregarTiemposCocina(filas);
    expect(r!.tickets).toBe(202);
    expect(r!.promedio).toBeCloseTo(10.198, 2);
    expect(r!.promedio).toBeLessThan(11); // y NO 20
  });

  it("toma el peor p95 del rango (no se puede recomponer un percentil desde percentiles)", () => {
    const filas = [
      fila({ tickets_total: 10, minutos_cocina_p95: 14 }),
      fila({ tickets_total: 10, minutos_cocina_p95: 31 }),
      fila({ tickets_total: 10, minutos_cocina_p95: 22 }),
    ];
    expect(agregarTiemposCocina(filas)[0]!.p95).toBe(31);
  });

  it("separa por modo de servicio y no divide entre cero sin comandas", () => {
    const filas = [
      fila({ modo_servicio: "PARA_LLEVAR", tickets_total: 5, minutos_cocina_promedio: 12 }),
      fila({ modo_servicio: "COMER_AQUI", tickets_total: 0, minutos_cocina_promedio: 0 }),
    ];
    const res = agregarTiemposCocina(filas);
    expect(res).toHaveLength(2);
    const comerAqui = res.find((r) => r.modo === "COMER_AQUI")!;
    expect(comerAqui.promedio).toBe(0);
    expect(Number.isNaN(comerAqui.promedio)).toBe(false);
  });
});

describe("agruparVentasVariantes", () => {
  const prod = (id: string, extra: Partial<Parameters<typeof agruparVentasVariantes>[1][number]> = {}) => ({
    id, nombre: `Prod ${id}`, padre_nombre: null, variante_ejes: null, variante_valores: null,
    codigo_interno: null, costo_mxn: null, controla_existencias: true, ...extra,
  });
  const productos = [
    prod("m", { nombre: "Playera M Negra", padre_nombre: "Playera", variante_ejes: ["Talla", "Color"], variante_valores: { Talla: "M", Color: "Negra" }, codigo_interno: "PL-M-N", costo_mxn: 80 }),
    prod("burger", { nombre: "Hamburguesa", controla_existencias: false, costo_mxn: 40 }),
    prod("gorra", { nombre: "Gorra" }),
  ];
  const ventas = [
    { producto_id: "m", unidades_vendidas: 2, total_mxn: 348, subtotal_mxn: 300 },
    { producto_id: "m", unidades_vendidas: 1, total_mxn: 174, subtotal_mxn: 150 },
    { producto_id: "burger", unidades_vendidas: 5, total_mxn: 500, subtotal_mxn: 431.03 },
    { producto_id: "gorra", unidades_vendidas: 1, total_mxn: 116, subtotal_mxn: 100 },
  ];

  it("suma los días de la misma variante y arma su texto", () => {
    const m = agruparVentasVariantes(ventas, productos).find((f) => f.producto_id === "m")!;
    expect(m).toMatchObject({ producto: "Playera", variante: "M · Negra", sku: "PL-M-N", unidades: 3, venta_mxn: 522, subtotal_mxn: 450 });
    expect(m.costo_mxn).toBe(240);
    expect(m.margen_mxn).toBe(210);
    expect(m.margen_pct).toBeCloseTo(46.667, 2);
  });

  it("deja fuera lo que no lleva existencias (un producto de restaurante)", () => {
    expect(agruparVentasVariantes(ventas, productos).map((f) => f.producto_id)).not.toContain("burger");
  });

  it("sin costo, costo y margen son null, nunca 0", () => {
    const g = agruparVentasVariantes(ventas, productos).find((f) => f.producto_id === "gorra")!;
    expect(g).toMatchObject({ producto: "Gorra", variante: "", costo_mxn: null, margen_mxn: null, margen_pct: null });
  });

  it("redondea el dinero a centavos y ordena por venta", () => {
    const filas = agruparVentasVariantes(
      [{ producto_id: "m", unidades_vendidas: 1, total_mxn: 0.1, subtotal_mxn: 0.1 }, { producto_id: "m", unidades_vendidas: 1, total_mxn: 0.2, subtotal_mxn: 0.2 }, ...ventas.slice(3)],
      productos,
    );
    expect(filas[0]!.producto_id).toBe("gorra");
    expect(filas[1]!.venta_mxn).toBe(0.3);
  });
});
