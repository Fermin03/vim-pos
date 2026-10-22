import { describe, expect, it, vi } from "vitest";
import { hoyMx } from "@vim/fecha";

// periodo_comisiones simulado en semanas de lunes a domingo; se anota con qué fecha se pidió.
const pedidas: string[] = [];
function semanaDe(fecha: string) {
  const d = new Date(`${fecha}T12:00:00Z`);
  const lunes = new Date(d);
  lunes.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const domingo = new Date(lunes);
  domingo.setUTCDate(lunes.getUTCDate() + 6);
  return { desde: lunes.toISOString().slice(0, 10), hasta: domingo.toISOString().slice(0, 10) };
}
vi.mock("../supabase", () => ({
  supabase: {
    rpc: (_f: string, a: { p_fecha: string }) => {
      pedidas.push(a.p_fecha);
      return Promise.resolve({ data: [semanaDe(a.p_fecha)], error: null });
    },
  },
}));

const { leerPeriodosComision } = await import("../reportes");

describe("leerPeriodosComision", () => {
  it("el actual contiene hoy y el anterior es el que contiene el día previo a su inicio", async () => {
    pedidas.length = 0;
    const { actual, anterior } = await leerPeriodosComision();
    expect(pedidas[0]).toBe(hoyMx());
    expect(actual.desde <= hoyMx() && hoyMx() <= actual.hasta).toBe(true);
    const previo = new Date(`${actual.desde}T12:00:00Z`);
    previo.setUTCDate(previo.getUTCDate() - 1);
    expect(pedidas[1]).toBe(previo.toISOString().slice(0, 10));
    expect(anterior.hasta).toBe(pedidas[1]);
    expect(semanaDe(anterior.desde)).toEqual(anterior);
  });
});
