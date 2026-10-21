import { describe, expect, it, vi } from "vitest";

/** Cliente falso: anota los filtros de cada consulta y responde sin filas. */
const falso = vi.hoisted(() => {
  const filtros: [string, unknown, unknown][][] = [];
  const cliente = {
    from() {
      const f: [string, unknown, unknown][] = [];
      filtros.push(f);
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "is", "or", "order"]) {
        b[m] = (col: unknown, v: unknown) => { f.push([m, col, v]); return b; };
      }
      b.then = (ok: (r: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
      return b;
    },
  };
  return { filtros, cliente };
});
vi.mock("../supabase", () => ({ employeeClient: () => falso.cliente }));

import { contarCuentasDeMesa, listarCuentasAbiertas, MODOS_MESA } from "../cuentas-abiertas";

const porCaja = (f: [string, unknown, unknown][]) => f.filter(([m, col]) => m === "eq" && col === "caja_id");

describe("cuentas abiertas", () => {
  it("un restaurante sigue viendo las de toda la sucursal", async () => {
    await listarCuentasAbiertas("t", "s1", "PARA_LLEVAR");
    expect(porCaja(falso.filtros.at(-1)!)).toEqual([]);
  });
  it("con caja, solo las de esa caja (el pago se asienta en la caja del ticket)", async () => {
    await listarCuentasAbiertas("t", "s1", "PARA_LLEVAR", [], "c1");
    expect(porCaja(falso.filtros.at(-1)!)).toEqual([["eq", "caja_id", "c1"]]);
  });
});

describe("cuentas de mesa (comida rápida)", () => {
  it("cuenta exactamente lo que lista Comedor: MESA y COMER_AQUI, sin las de espera, de toda la sucursal", async () => {
    await listarCuentasAbiertas("t", "s1", MODOS_MESA);
    const lista = falso.filtros.at(-1)!.filter(([m]) => m === "eq" || m === "in" || m === "is");
    expect(await contarCuentasDeMesa("t", "s1")).toBe(0);
    const cuenta = falso.filtros.at(-1)!;
    for (const filtro of lista) expect(cuenta).toContainEqual(filtro);
    expect(cuenta).toContainEqual(["in", "modo_servicio", ["MESA", "COMER_AQUI"]]);
    expect(cuenta).toContainEqual(["eq", "en_espera", false]);
    expect(cuenta).toContainEqual(["in", "estado_fiscal", ["BORRADOR", "ABIERTO"]]);
  });
});
