import { describe, it, expect } from "vitest";
import { variacionPct, agregarTiemposCocina } from "../reportes";

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
