import { describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => ({ error: null as { message: string; code?: string } | null, llamada: null as { fn: string; args: Record<string, unknown> } | null }));
vi.mock("../supabase", () => ({
  employeeClient: () => ({ rpc: async (fn: string, args: Record<string, unknown>) => { rpc.llamada = { fn, args }; return { data: 2, error: rpc.error }; } }),
}));

import { avisoCantidad, ExistenciasApagadas, masUna, recibirEnCaja, SinPermisoRecibir } from "../recibir-caja";

describe("masUna", () => {
  it("suma 1 sin ruido del flotante", () => {
    expect(masUna("1")).toBe("2");
    expect(masUna("0.1")).toBe("1.1");
    expect(masUna("2.675")).toBe("3.675");
    expect(masUna(".5")).toBe("1.5");
  });
  it("una cantidad rota vuelve a 1", () => expect(masUna("")).toBe("1"));
});

describe("avisoCantidad", () => {
  it.each(["1", "5.0000", "2.5", ".5", "5.", "1.500", "0.001", "999999999"])("acepta %s", (q) => expect(avisoCantidad(q)).toBeNull());
  it.each(["", " ", "0", "0.000", "abc", "NaN", "-1", "1.2345", "1e3", "1000000000"])("rechaza %j", (q) => expect(avisoCantidad(q)).not.toBeNull());
});

describe("recibirEnCaja", () => {
  const args = { token: "t", sucursalId: "s", lineas: [{ productoId: "p", cantidad: 3 }], referencia: "  F-1  " };

  it("manda renglones sin costo y sin proveedor", async () => {
    rpc.error = null;
    expect(await recibirEnCaja(args)).toBe(2);
    expect(rpc.llamada).toEqual({ fn: "recibir_mercancia", args: { p_sucursal: "s", p_proveedor: null, p_lineas: [{ producto_id: "p", cantidad: 3 }], p_referencia: "F-1" } });
  });

  it("un error de permiso se distingue del resto", async () => {
    rpc.error = { message: "SIN_PERMISO: tu rol no puede mover existencias", code: "42501" };
    await expect(recibirEnCaja(args)).rejects.toBeInstanceOf(SinPermisoRecibir);
    rpc.error = { message: "MODULO_APAGADO: existencias no está encendido para este negocio", code: "42501" };
    await expect(recibirEnCaja(args)).rejects.toBeInstanceOf(ExistenciasApagadas);
    rpc.error = { message: "DATOS_INVALIDOS: la cantidad admite máximo 3 decimales" };
    await expect(recibirEnCaja(args)).rejects.toThrow("la cantidad admite máximo 3 decimales");
  });
});
