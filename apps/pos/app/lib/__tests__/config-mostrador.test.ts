import { beforeEach, describe, expect, it, vi } from "vitest";

const doble = vi.hoisted(() => ({ resp: { data: null, error: null } as { data: unknown; error: { message: string } | null } }));

vi.mock("../supabase", () => ({
  employeeClient: () => ({ from: () => ({ select: () => ({ maybeSingle: async () => doble.resp }) }) }),
}));

import { leerConfigMostrador } from "../catalogo";

const APAGADO = { pedirNombre: false, tieneDondeComer: false };
beforeEach(() => { doble.resp = { data: null, error: null }; });

describe("leerConfigMostrador", () => {
  it("lee las dos casillas de la fila", async () => {
    doble.resp = { data: { pedir_nombre_cliente: true, tiene_donde_comer: false }, error: null };
    expect(await leerConfigMostrador("tok")).toEqual({ pedirNombre: true, tieneDondeComer: false });
  });
  it("sin fila, todo apagado", async () => {
    expect(await leerConfigMostrador("tok")).toEqual(APAGADO);
  });
  it("caja vieja sin las columnas (error) o columnas nulas, todo apagado", async () => {
    doble.resp = { data: null, error: { message: "column configuracion_tenant.pedir_nombre_cliente does not exist" } };
    expect(await leerConfigMostrador("tok")).toEqual(APAGADO);
    doble.resp = { data: { pedir_nombre_cliente: null }, error: null };
    expect(await leerConfigMostrador("tok")).toEqual(APAGADO);
  });
});
