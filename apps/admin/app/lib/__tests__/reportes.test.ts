import { describe, it, expect } from "vitest";
import {
  variacionPct, agregarTiemposCocina, agruparVentasVariantes, agruparCitas, agruparOcupacion, ocupacionTotal, recortarRango, tasaFalta,
  type RenglonCitas, type RenglonOcupacion,
} from "../reportes";

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
  // Como la vista: total_mxn con IVA y ya con el descuento del renglón; iva_mxn aparte.
  const ventas = [
    { producto_id: "m", unidades_vendidas: 1, total_mxn: 116, iva_mxn: 16 },
    // Otro día, con 10 % de descuento en el renglón: el bruto sería 116, el total queda en 104.40.
    { producto_id: "m", unidades_vendidas: 1, total_mxn: 104.4, iva_mxn: 14.4 },
    { producto_id: "burger", unidades_vendidas: 5, total_mxn: 500, iva_mxn: 68.97 },
    { producto_id: "gorra", unidades_vendidas: 1, total_mxn: 116, iva_mxn: 16 },
  ];

  it("una venta de 116 con IVA incluido: neto 100, costo 80, margen 20 (20 %)", () => {
    const [m] = agruparVentasVariantes(ventas.slice(0, 1), productos);
    expect(m).toMatchObject({ producto: "Playera", variante: "M · Negra", sku: "PL-M-N", unidades: 1, venta_mxn: 116, neto_mxn: 100, costo_mxn: 80, margen_mxn: 20 });
    expect(m!.margen_pct).toBeCloseTo(20, 5);
  });

  it("suma los días; el descuento del renglón baja el neto, no el costo", () => {
    const m = agruparVentasVariantes(ventas, productos).find((f) => f.producto_id === "m")!;
    expect(m).toMatchObject({ unidades: 2, venta_mxn: 220.4, neto_mxn: 190, costo_mxn: 160, margen_mxn: 30 });
    expect(m.margen_pct).toBeCloseTo(15.789, 2);
  });

  it("deja fuera lo que no lleva existencias (un producto de restaurante)", () => {
    expect(agruparVentasVariantes(ventas, productos).map((f) => f.producto_id)).not.toContain("burger");
  });

  it("sin costo, costo y margen son null, nunca 0", () => {
    const g = agruparVentasVariantes(ventas, productos).find((f) => f.producto_id === "gorra")!;
    expect(g).toMatchObject({ producto: "Gorra", variante: "", neto_mxn: 100, costo_mxn: null, margen_mxn: null, margen_pct: null });
  });

  it("con neto en 0 (todo regalado) el margen % es null, no Infinity", () => {
    const [m] = agruparVentasVariantes([{ producto_id: "m", unidades_vendidas: 1, total_mxn: 0, iva_mxn: 0 }], productos);
    expect(m).toMatchObject({ neto_mxn: 0, margen_mxn: -80, margen_pct: null });
  });

  it("redondea el dinero a centavos y ordena por venta", () => {
    const filas = agruparVentasVariantes(
      [{ producto_id: "m", unidades_vendidas: 1, total_mxn: 0.1, iva_mxn: 0 }, { producto_id: "m", unidades_vendidas: 1, total_mxn: 0.2, iva_mxn: 0 }, ...ventas.slice(3)],
      productos,
    );
    expect(filas[0]!.producto_id).toBe("gorra");
    expect(filas[1]!.venta_mxn).toBe(0.3);
    expect(filas[1]!.neto_mxn).toBe(0.3);
  });
});

describe("reportes de la agenda (belleza, 0227)", () => {
  const r = (x: Partial<RenglonCitas>): RenglonCitas => ({
    usuario_id: "u1", colaborador: "Diego", producto_id: "p1", servicio: "Corte",
    atendidas: 0, canceladas_clienta: 0, canceladas_negocio: 0, no_llego: 0, total: 0, ...x,
  });

  it("tasa de falta = no llegó / total, 0 sin citas", () => {
    expect(tasaFalta(1, 4)).toBe(25);
    expect(tasaFalta(0, 0)).toBe(0);
  });

  it("citas por colaborador suma sus servicios; sin colaborador va en su propia fila", () => {
    const filas = agruparCitas([
      r({ atendidas: 3, no_llego: 1, total: 4 }),
      r({ producto_id: "p2", servicio: "Tinte", canceladas_clienta: 1, canceladas_negocio: 1, no_llego: 2, total: 4 }),
      r({ usuario_id: null, colaborador: null, canceladas_clienta: 1, total: 1 }),
    ], "colaborador");
    expect(filas).toEqual([
      { clave: "u1", nombre: "Diego", atendidas: 3, canceladasClienta: 1, canceladasNegocio: 1, noLlego: 3, total: 8, tasa: 37.5 },
      { clave: "", nombre: "Sin colaborador", atendidas: 0, canceladasClienta: 1, canceladasNegocio: 0, noLlego: 0, total: 1, tasa: 0 },
    ]);
  });

  it("citas por servicio junta a todos los colaboradores", () => {
    const filas = agruparCitas([
      r({ atendidas: 1, total: 1 }),
      r({ usuario_id: "u2", colaborador: "Ana", atendidas: 1, no_llego: 2, total: 3 }),
    ], "servicio");
    expect(filas).toEqual([{ clave: "p1", nombre: "Corte", atendidas: 2, canceladasClienta: 0, canceladasNegocio: 0, noLlego: 2, total: 4, tasa: 50 }]);
  });

  const o = (usuario_id: string, dia: string, minutos_horario: number, minutos_agendados: number): RenglonOcupacion =>
    ({ usuario_id, colaborador: usuario_id === "u1" ? "Diego" : "Ana", dia, minutos_horario, minutos_agendados });
  const renglones = [o("u1", "2030-01-14", 480, 240), o("u1", "2030-01-15", 0, 60), o("u1", "2030-01-16", 0, 0), o("u2", "2030-01-14", 0, 0)];

  it("ocupación por colaborador: el % solo cuenta lo agendado en días con horario; sin horario, null", () => {
    expect(agruparOcupacion(renglones, "colaborador")).toEqual([
      { clave: "u1", colaborador: "Diego", dia: null, horario: 480, agendados: 300, pct: 50 },
      { clave: "u2", colaborador: "Ana", dia: null, horario: 0, agendados: 0, pct: null },
    ]);
    expect(ocupacionTotal(renglones)).toBe(50);
    expect(ocupacionTotal([o("u2", "2030-01-14", 0, 0)])).toBeNull();
  });

  it("ocupación por día omite los días vacíos; un día sin horario sale sin %", () => {
    expect(agruparOcupacion(renglones, "dia")).toEqual([
      { clave: "u1|2030-01-14", colaborador: "Diego", dia: "2030-01-14", horario: 480, agendados: 240, pct: 50 },
      { clave: "u1|2030-01-15", colaborador: "Diego", dia: "2030-01-15", horario: 0, agendados: 60, pct: null },
    ]);
  });

  it("recortarRango deja los últimos N días (contando ambos extremos) y avisa", () => {
    expect(recortarRango("2030-01-01", "2030-01-31", 93)).toEqual({ desde: "2030-01-01", hasta: "2030-01-31", recortado: false });
    expect(recortarRango("2030-01-01", "2030-04-03", 93)).toEqual({ desde: "2030-01-01", hasta: "2030-04-03", recortado: false });
    expect(recortarRango("2029-12-31", "2030-04-03", 93)).toEqual({ desde: "2030-01-01", hasta: "2030-04-03", recortado: true });
  });
});
