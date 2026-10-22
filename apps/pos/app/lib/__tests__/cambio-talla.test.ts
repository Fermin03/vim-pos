import { describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => ({ error: null as { message: string } | null }));
const llamadas = vi.hoisted(() => ({ de: [] as [string, unknown][], es: false as unknown }));
vi.mock("../supabase", () => ({
  employeeClient: () => ({
    rpc: async (fn: string, args: unknown) => {
      llamadas.de.push([fn, args]);
      return fn === "_ticket_es_de_cambio" ? { data: llamadas.es, error: null } : { data: null, error: rpc.error };
    },
  }),
}));

import { CambioRechazado, esVentaDeCambio, registrarCambio, resumenCambio } from "../cambio-talla";
import { fmtMxn } from "../turno";

describe("resumenCambio", () => {
  it("mismo precio: sin diferencia", () => {
    expect(resumenCambio(349, 349)).toEqual({ diferencia: 0, texto: "Sin diferencia" });
  });

  it("la nueva cuesta más: el cliente paga la diferencia", () => {
    expect(resumenCambio(349, 399)).toEqual({ diferencia: 50, texto: `El cliente paga ${fmtMxn(50)}` });
  });

  it("la nueva cuesta menos: se le regresa en efectivo", () => {
    expect(resumenCambio(349, 299)).toEqual({ diferencia: -50, texto: `Le regresas ${fmtMxn(50)} en efectivo` });
  });

  it("los centavos se redondean sin ruido del flotante", () => {
    const r = resumenCambio(349.5, 349.49);
    expect(r.diferencia).toBe(-0.01);
    expect(r.texto).toBe(`Le regresas ${fmtMxn(0.01)} en efectivo`);
    expect(resumenCambio(0.1, 0.3).diferencia).toBe(0.2);
    expect(resumenCambio(10.005, 10.005).texto).toBe("Sin diferencia");
  });
});

describe("registrarCambio: rechazo definitivo o en duda", () => {
  const args = {
    token: "t", ticketOrigen: "v", regresa: { ticketItemId: "i", cantidad: 1 }, lleva: { productoId: "p", cantidad: 1 },
    cajaId: "c", turnoId: "u", usuarioId: "e", autorizacion: { autorizacionPinId: "a", autorizoId: "e" }, clientId: "k",
  };

  it("DATOS_INVALIDOS es CambioRechazado, con el motivo sin prefijo", async () => {
    rpc.error = { message: "DATOS_INVALIDOS: esa venta es de otra sucursal" };
    const e = await registrarCambio(args).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(CambioRechazado);
    expect((e as Error).message).toBe("esa venta es de otra sucursal");
  });

  it("otro error (la red) no lo es: la llave se conserva", async () => {
    rpc.error = { message: "Failed to fetch" };
    const e = await registrarCambio(args).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(CambioRechazado);
  });
});

describe("esVentaDeCambio", () => {
  it("pregunta a la base con su criterio (_ticket_es_de_cambio, 0200)", async () => {
    llamadas.de.length = 0;
    llamadas.es = true;
    expect(await esVentaDeCambio("tok", "t1")).toBe(true);
    expect(llamadas.de).toEqual([["_ticket_es_de_cambio", { p_ticket: "t1" }]]);
    llamadas.es = false;
    expect(await esVentaDeCambio("tok", "t1")).toBe(false);
  });
});
