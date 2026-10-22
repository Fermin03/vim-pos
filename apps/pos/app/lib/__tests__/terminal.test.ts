import { describe, it, expect, vi, afterEach } from "vitest";
import { terminalDeCaja, etiquetaTarjeta, pagoDeCobro, propinaDeCobro, mensajeErrorCobro, mensajeFinal, metodoDeTarjeta, montoTexto, motivoReembolso, pedirCobro, reembolsarTicket } from "../terminal";

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

  it("la tarjeta se imprime como marca y terminación; sin terminación no se inventa nada", () => {
    expect(etiquetaTarjeta({ marca: "debmaster", tarjeta_ultimos4: "1447" })).toBe("Mastercard **** 1447");
    expect(etiquetaTarjeta({ marca: "deb_visa", tarjeta_ultimos4: "0214" })).toBe("Visa **** 0214"); // Clip
    expect(etiquetaTarjeta({ marca: "naranja", tarjeta_ultimos4: "0001" })).toBe("Tarjeta **** 0001");
    expect(etiquetaTarjeta({ marca: "visa", tarjeta_ultimos4: null })).toBeNull();
    const base = { id: "c", ticket_id: "t", monto_mxn: 110, estado: "APROBADO" as const, detalle: null, aplicado_at: null };
    expect(pagoDeCobro({ ...base, tipo_tarjeta: "debit_card", marca: "debmaster", referencia: "183406721568", tarjeta_ultimos4: "1447" }))
      .toEqual({ metodo: "TARJETA_DEBITO", monto: 110, referencia: "Mastercard **** 1447", terminalAprobacion: "183406721568" });
    // Aceptado a mano con PIN: ni tarjeta ni autorización.
    expect(pagoDeCobro({ ...base, tipo_tarjeta: null, marca: null, referencia: null }))
      .toEqual({ metodo: "TARJETA_CREDITO", monto: 110, referencia: undefined, terminalAprobacion: undefined });
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
    expect(mensajeErrorCobro(new Error("TERMINAL_NO_DISPONIBLE"))).toBe("La terminal no está lista. Revisa que esté encendida, con internet y con Clip PinPad abierta.");
    expect(mensajeErrorCobro(new Error("SIN_RESPUESTA"))).toBe("La terminal no contestó. Vuelve a intentar.");
    expect(mensajeFinal({ estado: "RECHAZADO", detalle: "SIN_RESPUESTA" })).toBe("La terminal no contestó. Vuelve a intentar.");
    expect(mensajeFinal({ estado: "RECHAZADO", detalle: "high_risk" })).not.toContain("Mercado Pago");
    expect(mensajeFinal({ estado: "RECHAZADO", detalle: "CD-PROCESS-AS-CHIP" })).toContain("chip");
    expect(mensajeFinal({ estado: "RECHAZADO", detalle: "TX-CANCELLED-BY-PAUSE" })).toContain("otra tarjeta");
    expect(mensajeErrorCobro(new Error("CONEXION_INVALIDA"))).not.toContain("Mercado Pago");
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
    expect(motivoReembolso(new Error("algo_nuevo"))).toBe("el proveedor de la terminal no aceptó la devolución");
    expect(motivoReembolso(new Error("CONEXION_INVALIDA"))).not.toContain("Mercado Pago");
  });

  it("sin internet o sin nube, la caja no ofrece terminal", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("failed to fetch"); }));
    const sin = { hay: false, lista: false, proveedor: null, propina_en_lector: false };
    expect(await terminalDeCaja("tok", "caja-1")).toEqual(sin);
    responde(503, { error: "FUNCION_REQUIERE_NUBE" });
    expect(await terminalDeCaja("tok", "caja-1")).toEqual(sin);
    responde(200, { ok: true, terminal: true, lista: true, proveedor: "MERCADO_PAGO" });
    expect(await terminalDeCaja("tok", "caja-1")).toEqual({ hay: true, lista: true, proveedor: "MERCADO_PAGO", propina_en_lector: false });
    responde(200, { ok: true, terminal: true, lista: false, proveedor: "CLIP" });
    expect(await terminalDeCaja("tok", "caja-1")).toEqual({ hay: true, lista: false, proveedor: "CLIP", propina_en_lector: false });
    // Un proveedor que la caja no conoce no se cree: cae al texto de siempre.
    responde(200, { ok: true, terminal: true, lista: true, proveedor: "OTRO" });
    expect(await terminalDeCaja("tok", "caja-1")).toEqual({ hay: true, lista: true, proveedor: null, propina_en_lector: false });
    // Una nube sin `lista` (anterior a Clip) es Mercado Pago: lista.
    responde(200, { ok: true, terminal: true });
    expect(await terminalDeCaja("tok", "caja-1")).toEqual({ hay: true, lista: true, proveedor: null, propina_en_lector: false });
  });

  it("la propina en el lector solo vale con Clip", async () => {
    responde(200, { ok: true, terminal: true, lista: true, proveedor: "CLIP", propina_en_lector: true });
    expect((await terminalDeCaja("tok", "caja-1")).propina_en_lector).toBe(true);
    responde(200, { ok: true, terminal: true, lista: true, proveedor: "MERCADO_PAGO", propina_en_lector: true });
    expect((await terminalDeCaja("tok", "caja-1")).propina_en_lector).toBe(false);
    responde(200, { ok: true, terminal: true, lista: true, proveedor: "CLIP", propina_en_lector: "true" });
    expect((await terminalDeCaja("tok", "caja-1")).propina_en_lector).toBe(false);
  });

  it("la propina del lector se suma al pago en centavos; sin propina, el monto de siempre", () => {
    const c = { id: "c", ticket_id: "t", monto_mxn: 100.1, estado: "APROBADO" as const, detalle: null, aplicado_at: null, tipo_tarjeta: null, marca: null, referencia: null };
    expect(propinaDeCobro({ propina_mxn: "10.20" })).toBe(10.2);
    expect(propinaDeCobro({ propina_mxn: null })).toBe(0);
    expect(propinaDeCobro({})).toBe(0);
    expect(propinaDeCobro({ propina_mxn: -5 })).toBe(0);
    expect(pagoDeCobro(c, 10.2).monto).toBe(110.3); // 100.1 + 10.2 = 110.29999999999998 en float
    expect(pagoDeCobro({ ...c, propina_mxn: "10.20" }).monto).toBe(100.1); // sin pasarla, no se suma
  });
});
