import { describe, it, expect, vi, afterEach } from "vitest";
import { cajaTieneTerminal, mensajeErrorCobro, mensajeFinal, metodoDeTarjeta, montoTexto, motivoReembolso, pedirCobro, reembolsarTicket } from "../terminal";

afterEach(() => vi.unstubAllGlobals());
const responde = (status: number, cuerpo: unknown) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(cuerpo), { status })));

describe("cobro con terminal", () => {
  it("registra débito como débito y todo lo demás como crédito", () => {
    expect(metodoDeTarjeta("debit_card")).toBe("TARJETA_DEBITO");
    expect(metodoDeTarjeta("credit_card")).toBe("TARJETA_CREDITO");
    expect(metodoDeTarjeta("prepaid_card")).toBe("TARJETA_CREDITO");
    expect(metodoDeTarjeta(null)).toBe("TARJETA_CREDITO");
  });

  it("el monto viaja como texto con dos decimales", () => {
    expect(montoTexto(348)).toBe("348.00");
    expect(montoTexto(10.1 + 10.2)).toBe("20.30"); // 20.299999999999997 en float
  });

  it("dice por qué no pasó", () => {
    expect(mensajeFinal({ estado: "RECHAZADO", detalle: "insufficient_amount" })).toContain("fondos");
    expect(mensajeFinal({ estado: "RECHAZADO", detalle: "algo_nuevo" })).toBe("La terminal rechazó el cobro.");
    expect(mensajeFinal({ estado: "VENCIDO", detalle: "expired" })).toContain("tiempo");
    expect(mensajeErrorCobro(new Error("TERMINAL_OCUPADA"))).toContain("otro cobro");
    expect(mensajeErrorCobro(new Error("ERROR_INTERNO"))).toBe("No se pudo mandar el cobro a la terminal. Vuelve a intentar.");
  });

  it("manda la caja en el cuerpo y lanza el código cuando la nube dice que no", async () => {
    responde(409, { ok: false, error: "TERMINAL_OCUPADA" });
    await expect(pedirCobro("tok", "caja-1", { accion: "estado", cobro_id: "c" })).rejects.toThrow("TERMINAL_OCUPADA");
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ accion: "estado", cobro_id: "c", caja_id: "caja-1" });
  });

  it("el reembolso dice cuánto regresó, o cero cobros si el ticket no pasó por la terminal", async () => {
    responde(200, { ok: true, n_cobros: 1, devuelto_mxn: "110.00" });
    expect(await reembolsarTicket("tok", "caja-1", "t-1")).toEqual({ cobros: 1, devuelto: 110 });
    responde(200, { ok: true, n_cobros: 0, devuelto_mxn: "0.00" });
    expect(await reembolsarTicket("tok", "caja-1", "t-1")).toEqual({ cobros: 0, devuelto: 0 });
    responde(409, { ok: false, n_cobros: 1, devuelto_mxn: "0.00", error: "CONEXION_INVALIDA" });
    await expect(reembolsarTicket("tok", "caja-1", "t-1")).rejects.toThrow("CONEXION_INVALIDA");
    expect(motivoReembolso(new Error("SIN_RED"))).toBe("no hay internet");
    expect(motivoReembolso(new Error("algo_nuevo"))).toBe("Mercado Pago no aceptó la devolución");
  });

  it("sin internet o sin nube, la caja no ofrece terminal", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("failed to fetch"); }));
    expect(await cajaTieneTerminal("tok", "caja-1")).toBe(false);
    responde(503, { error: "FUNCION_REQUIERE_NUBE" });
    expect(await cajaTieneTerminal("tok", "caja-1")).toBe(false);
    responde(200, { ok: true, terminal: true });
    expect(await cajaTieneTerminal("tok", "caja-1")).toBe(true);
  });
});
