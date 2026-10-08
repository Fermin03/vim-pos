import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("../supabase", () => ({
  employeeClient: () => ({}),
  urlFuncion: (n: string) => `http://gw/functions/v1/${n}`,
  encabezadosFuncion: (t: string) => ({ apikey: "anon", Authorization: `Bearer ${t}`, "Content-Type": "application/json" }),
}));

import { autorizarConPin, subDeToken } from "../autorizacion";

const b64url = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const token = (claims: unknown) => `e30.${b64url(claims)}.firma`;

afterEach(() => vi.unstubAllGlobals());

describe("subDeToken", () => {
  it("devuelve el sub del token de empleado", () => {
    expect(subDeToken(token({ sub: "u-1", tenant_id: "t" }))).toBe("u-1");
  });

  it("cualquier token ilegible es TOKEN_INVALIDO, no un error de JSON", () => {
    for (const malo of ["", "sin-puntos", "a.%%%.c", `a.${btoa("no es json")}.c`]) {
      expect(() => subDeToken(malo)).toThrow("TOKEN_INVALIDO");
    }
  });
});

describe("autorizarConPin", () => {
  it("llama a la función por la URL de runtime: en una caja de la red, la del servidor", async () => {
    const llamadas: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      llamadas.push({ url, init });
      return new Response(JSON.stringify({ autorizacion_pin_id: "a-1", autorizo_id: "s-1" }), { status: 200 });
    });
    const r = await autorizarConPin("tok", "1234", {
      accion: "descuento", permisoCodigo: "ventas.descuento", entidadTipo: "ticket", entidadId: null,
      monto: 10, motivo: "cortesía", cajaId: "c-1", turnoId: null,
    });
    expect(r).toEqual({ autorizacionPinId: "a-1", autorizoId: "s-1" });
    expect(llamadas[0]!.url).toBe("http://gw/functions/v1/autorizar-pin");
    expect(llamadas[0]!.init.headers).toMatchObject({ Authorization: "Bearer tok", apikey: "anon" });
    expect(JSON.parse(String(llamadas[0]!.init.body))).toMatchObject({ pin: "1234", permiso_codigo: "ventas.descuento", caja_id: "c-1" });
  });
});
