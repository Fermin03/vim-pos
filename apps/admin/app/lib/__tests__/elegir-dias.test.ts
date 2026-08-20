import { describe, it, expect } from "vitest";
import { elegirDias } from "../reportes";

// Resumidor de juguete: solo el total, que es lo que decide la regla.
const resumir = (filas: number[], dia: string) => ({ dia, total: filas.reduce((a, b) => a + b, 0) });
const mapa = (o: Record<string, number[]>) => new Map(Object.entries(o));
const tend = (o: Record<string, number[]>) =>
  Object.entries(o).map(([dia, v]) => ({ dia, total: v.reduce((a, b) => a + b, 0) })).sort((a, b) => a.dia.localeCompare(b.dia));

describe("elegirDias", () => {
  it("EL BUG DEL PILOTO: sin ventas hoy, el panel NO enseña las del 17 como si fueran de hoy", () => {
    const datos = { "2026-08-17": [1080] };
    const r = elegirDias(mapa(datos), tend(datos), "2026-08-19", resumir);
    expect(r.hoy).toEqual({ dia: "2026-08-19", total: 0 });
    expect(r.ultimoDiaConVentas).toBe("2026-08-17");
  });

  it("con ventas hoy, muestra las de hoy", () => {
    const datos = { "2026-08-18": [500], "2026-08-19": [1760] };
    const r = elegirDias(mapa(datos), tend(datos), "2026-08-19", resumir);
    expect(r.hoy.total).toBe(1760);
    expect(r.ayer?.total).toBe(500);
  });

  it("'ayer' es el día anterior REAL, no el previo con ventas", () => {
    // Vendió el 15 y hoy 19. Ayer (18) no vendió: el comparativo debe quedar vacío, no traerse
    // el 15 — compararse contra la semana pasada disfraza la caída.
    const datos = { "2026-08-15": [900], "2026-08-19": [100] };
    const r = elegirDias(mapa(datos), tend(datos), "2026-08-19", resumir);
    expect(r.ayer).toBeNull();
    expect(r.ultimoDiaConVentas).toBe("2026-08-19");
  });

  it("un día presente pero en cero no cuenta como última venta", () => {
    const datos = { "2026-08-17": [500], "2026-08-19": [0] };
    const r = elegirDias(mapa(datos), tend(datos), "2026-08-19", resumir);
    expect(r.ultimoDiaConVentas).toBe("2026-08-17");
  });

  it("sin ningún dato no inventa una última venta", () => {
    const r = elegirDias(mapa({}), tend({}), "2026-08-19", resumir);
    expect(r.hoy.total).toBe(0);
    expect(r.ayer).toBeNull();
    expect(r.ultimoDiaConVentas).toBeNull();
  });
});
