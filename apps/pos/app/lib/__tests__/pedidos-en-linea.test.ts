import { describe, it, expect, vi, afterEach } from "vitest";
import type { PedidoApp } from "../pedidos-apps";
import {
  etiquetaOrigen, etiquetaPago, etiquetaEntrega, debeSonar, TIMBRE_CADA_MS, comandasPendientes, aceptablesSolos,
  etiquetaEstadoEnLinea, mensajeErrorEnLinea, avisoDeTienda, timbrarHasta, faltaComanda, leerEstadoEnLinea, pausarEnLinea, reanudarEnLinea, avisarPresente,
  type EstadoEnLinea,
} from "../pedidos-en-linea";

vi.mock("../supabase", () => ({
  employeeClient: vi.fn(),
  urlFuncion: (n: string) => `https://x.test/functions/v1/${n}`,
  encabezadosFuncion: (t: string) => ({ Authorization: `Bearer ${t}` }),
}));

const ped = (extra: Partial<PedidoApp> = {}): PedidoApp => ({
  id: "p1", app: "DRIVE_THRU", canal: "TIENDA", idExterno: "e", folioCorto: null, estado: "RECIBIDO", tipoEntrega: null,
  clienteNombre: "Ana", clienteTelefono: "4771112233", notaCliente: null, items: [], totalCliente: 100, venceAceptacion: null,
  recibidoAt: "2026-10-09T10:00:00Z", ticketId: null, ticketFolio: null, ultimoError: null, direccion: null, pago: null,
  envio: null, gestion: "NUBE", gestionCajaId: null, ticketCajaId: null, comandaImpresa: false, ...extra,
});
const uber = (extra: Partial<PedidoApp> = {}) => ped({ app: "APP_UBEREATS", canal: "APP", gestion: null, ...extra });

describe("etiquetas", () => {
  it("origen", () => {
    expect(etiquetaOrigen(ped())).toBe("Tienda");
    expect(etiquetaOrigen(uber())).toBe("Uber Eats");
  });
  it("pago con y sin 'paga con', tarjeta y sin dato", () => {
    expect(etiquetaPago(ped({ pago: { forma: "EFECTIVO", pagaCon: 500 } }))).toBe("Efectivo, paga con $500.00");
    expect(etiquetaPago(ped({ pago: { forma: "EFECTIVO", pagaCon: null } }))).toBe("Efectivo");
    expect(etiquetaPago(ped({ pago: { forma: "TARJETA", pagaCon: null } }))).toBe("Tarjeta");
    expect(etiquetaPago(ped())).toBeNull();
  });
  it("entrega", () => {
    expect(etiquetaEntrega(ped({ app: "DRIVE_THRU" }))).toBe("Para recoger");
    expect(etiquetaEntrega(ped({ app: "DELIVERY_PROPIO" }))).toBe("A domicilio");
    expect(etiquetaEntrega(uber({ tipoEntrega: "RECOGE_CLIENTE" }))).toBe("Recoge en tienda");
    expect(etiquetaEntrega(uber({ tipoEntrega: "REPARTO_APP" }))).toBe("Reparto de la app");
  });
});

describe("debeSonar", () => {
  const d = { hayNuevoPorAceptar: false, hayPorAceptar: true, ultimoTimbre: 0, ahora: 0 };
  it("suena al llegar uno nuevo", () => {
    expect(debeSonar({ ...d, hayNuevoPorAceptar: true, ultimoTimbre: 100, ahora: 101 })).toBe(true);
  });
  it("se repite cada 20 s: frontera 19 999 / 20 000", () => {
    expect(TIMBRE_CADA_MS).toBe(20_000);
    expect(debeSonar({ ...d, ahora: 19_999 })).toBe(false);
    expect(debeSonar({ ...d, ahora: 20_000 })).toBe(true);
  });
  it("sin pendientes no suena; sin timbre previo suena", () => {
    expect(debeSonar({ ...d, hayPorAceptar: false, ahora: 99_999 })).toBe(false);
    expect(debeSonar({ ...d, ultimoTimbre: null, ahora: 5 })).toBe(true);
  });
});

describe("comandasPendientes", () => {
  const ok = ped({ estado: "ACEPTADO", ticketId: "t1", ticketCajaId: "c1" });
  const no = new Set<string>();
  it("devuelve el pedido con su ticket", () => {
    expect(comandasPendientes([ok], "c1", no)).toEqual([{ pedidoId: "p1", ticketId: "t1" }]);
    expect(comandasPendientes([{ ...ok, estado: "EN_PREPARACION" }, { ...ok, id: "p2", estado: "LISTO", ticketId: "t2" }], "c1", no)).toHaveLength(2);
  });
  it("descarta ticket de otra caja, ya impresa, ya intentada, sin ticket, de Uber o en otro estado", () => {
    expect(comandasPendientes([{ ...ok, ticketCajaId: "c2" }], "c1", no)).toEqual([]);
    expect(comandasPendientes([{ ...ok, ticketCajaId: null }], "c1", no)).toEqual([]);
    expect(comandasPendientes([{ ...ok, comandaImpresa: true }], "c1", no)).toEqual([]);
    expect(comandasPendientes([ok], "c1", new Set(["p1"]))).toEqual([]);
    expect(comandasPendientes([{ ...ok, ticketId: null }], "c1", no)).toEqual([]);
    expect(comandasPendientes([{ ...ok, canal: "APP" }], "c1", no)).toEqual([]);
    expect(comandasPendientes([{ ...ok, estado: "RECIBIDO" }, { ...ok, estado: "ENTREGADO" }], "c1", no)).toEqual([]);
  });
});

describe("aceptablesSolos", () => {
  const d = { esEscritorio: false, aceptacion: "AUTO" as const, hayTurno: true };
  const no = new Set<string>();
  it("acepta los RECIBIDO de la nube en POS web con AUTO y turno", () => {
    expect(aceptablesSolos([ped()], d, no)).toEqual(["p1"]);
  });
  it("no en escritorio, MANUAL, null, sin turno, ESCRITORIO, ya intentado, Uber o no RECIBIDO", () => {
    expect(aceptablesSolos([ped()], { ...d, esEscritorio: true }, no)).toEqual([]);
    expect(aceptablesSolos([ped()], { ...d, aceptacion: "MANUAL" }, no)).toEqual([]);
    expect(aceptablesSolos([ped()], { ...d, aceptacion: null }, no)).toEqual([]);
    expect(aceptablesSolos([ped()], { ...d, hayTurno: false }, no)).toEqual([]);
    expect(aceptablesSolos([ped({ gestion: "ESCRITORIO" })], d, no)).toEqual([]);
    expect(aceptablesSolos([ped()], d, new Set(["p1"]))).toEqual([]);
    expect(aceptablesSolos([uber()], d, no)).toEqual([]);
    expect(aceptablesSolos([ped({ estado: "ACEPTADO" }), ped({ estado: "ERROR" })], d, no)).toEqual([]);
  });
});

describe("etiquetaEstadoEnLinea", () => {
  const e = (extra: Partial<EstadoEnLinea>): EstadoEnLinea => ({ participa: true, aceptacion: "MANUAL", pausaHasta: null, motivo: null, ...extra });
  const ahora = new Date("2026-10-09T18:00:00Z");
  it("recibiendo", () => {
    expect(etiquetaEstadoEnLinea(e({}), ahora)).toEqual({ texto: "Tienda: recibiendo pedidos", tono: "ok" });
  });
  it("pausa con hora de México (20:30 UTC = 2:30 p. m.)", () => {
    expect(etiquetaEstadoEnLinea(e({ motivo: "EN_PAUSA", pausaHasta: "2026-10-09T20:30:00Z" }), ahora))
      .toEqual({ texto: "Tienda: en pausa hasta las 2:30 p. m.", tono: "aviso" });
    expect(etiquetaEstadoEnLinea(e({ motivo: "EN_PAUSA", pausaHasta: "2026-10-09T14:05:00Z" }), new Date("2026-10-09T13:00:00Z")).texto)
      .toBe("Tienda: en pausa hasta las 8:05 a. m.");
  });
  it("una pausa cuya hora ya pasó no promete una hora vencida", () => {
    // El estado se leyó antes de que venciera; la siguiente lectura trae el motivo real.
    expect(etiquetaEstadoEnLinea(e({ motivo: "EN_PAUSA", pausaHasta: "2026-10-09T14:05:00Z" }), ahora))
      .toEqual({ texto: "Tienda: en pausa", tono: "aviso" });
    expect(etiquetaEstadoEnLinea(e({ motivo: "EN_PAUSA", pausaHasta: "2026-10-09T18:00:00Z" }), ahora).texto).toBe("Tienda: en pausa");
  });
  it("pausa indefinida o sin hora", () => {
    expect(etiquetaEstadoEnLinea(e({ motivo: "EN_PAUSA", pausaHasta: "2999-12-31T00:00:00Z" }), ahora).texto).toBe("Tienda: en pausa");
    expect(etiquetaEstadoEnLinea(e({ motivo: "EN_PAUSA" }), ahora).texto).toBe("Tienda: en pausa");
  });
  it("otros motivos", () => {
    expect(etiquetaEstadoEnLinea(e({ motivo: "FUERA_DE_HORARIO" }), ahora)).toEqual({ texto: "Tienda: fuera de horario", tono: "aviso" });
    expect(etiquetaEstadoEnLinea(e({ motivo: "CAJA_NO_LISTA" }), ahora).texto).toBe("Tienda: sin turno abierto");
    for (const m of ["NO_PARTICIPA", "MODO_NO_DISPONIBLE", "TIENDA_NO_DISPONIBLE"]) {
      expect(etiquetaEstadoEnLinea(e({ motivo: m }), ahora).texto).toBe("Tienda: apagada");
    }
  });
});

describe("mensajeErrorEnLinea", () => {
  it("mensajes", () => {
    expect(mensajeErrorEnLinea("SIN_TURNO_ABIERTO")).toBe("Abre un turno para aceptar pedidos.");
    expect(mensajeErrorEnLinea("PEDIDO_CANCELADO")).toBe("Este pedido ya no coincide con tu menú o tus zonas de envío. Se canceló y tu cliente ya lo sabe.");
    expect(mensajeErrorEnLinea("ACCION_INVALIDA")).toBe("Este pedido ya fue atendido.");
    expect(mensajeErrorEnLinea("RECLAMADO_POR_OTRA_CAJA")).toBe("Otra caja ya tomó este pedido.");
    expect(mensajeErrorEnLinea("SIN_RED")).toBe("Sin internet no se pueden atender pedidos en línea.");
    expect(mensajeErrorEnLinea("FUNCION_REQUIERE_NUBE")).toBe("Sin internet no se pueden atender pedidos en línea.");
    expect(mensajeErrorEnLinea("LO_QUE_SEA", "x")).toBe("No se pudo completar. Inténtalo de nuevo.");
  });
});

describe("llamadas a delivery-accion", () => {
  afterEach(() => vi.unstubAllGlobals());
  const resp = (status: number, cuerpo: unknown) => vi.fn(async () => new Response(JSON.stringify(cuerpo), { status }));
  const estadoNube = { participa: true, aceptacion: "AUTO", pausa_hasta: null, motivo: null };

  it("leerEstadoEnLinea manda enlinea_estado y traduce a camelCase", async () => {
    const f = resp(200, estadoNube); vi.stubGlobal("fetch", f);
    expect(await leerEstadoEnLinea("tok", "s1")).toEqual({ participa: true, aceptacion: "AUTO", pausaHasta: null, motivo: null });
    expect(JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ accion: "enlinea_estado", sucursal_id: "s1" });
  });
  it("leerEstadoEnLinea devuelve null sin tienda", async () => {
    vi.stubGlobal("fetch", resp(404, { error: "SUCURSAL_SIN_TIENDA" }));
    expect(await leerEstadoEnLinea("tok", "s1")).toBeNull();
    vi.stubGlobal("fetch", resp(403, { error: "SIN_MODULO_TIENDA" }));
    expect(await leerEstadoEnLinea("tok", "s1")).toBeNull();
  });
  it("leerEstadoEnLinea lanza con otros errores y sin red", async () => {
    vi.stubGlobal("fetch", resp(500, { error: "BOOM" }));
    await expect(leerEstadoEnLinea("tok", "s1")).rejects.toThrow("BOOM");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("net"); }));
    await expect(leerEstadoEnLinea("tok", "s1")).rejects.toThrow("SIN_RED");
  });
  it("una respuesta 2xx sin `participa` es un error, no una tienda apagada", async () => {
    vi.stubGlobal("fetch", resp(200, {}));
    await expect(leerEstadoEnLinea("tok", "s1")).rejects.toThrow("RESPUESTA_INVALIDA");
    vi.stubGlobal("fetch", resp(200, { participa: "si" }));
    await expect(pausarEnLinea("tok", "s1", "30m")).rejects.toThrow("RESPUESTA_INVALIDA");
  });
  it("pausar y reanudar mandan su acción", async () => {
    const f = resp(200, { ...estadoNube, motivo: "EN_PAUSA", pausa_hasta: "2026-10-09T20:30:00Z" }); vi.stubGlobal("fetch", f);
    expect((await pausarEnLinea("tok", "s1", "30m")).motivo).toBe("EN_PAUSA");
    expect(JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ accion: "enlinea_pausar", sucursal_id: "s1", duracion: "30m" });
    await reanudarEnLinea("tok", "s1");
    expect(JSON.parse((f.mock.calls[1] as unknown as [string, RequestInit])[1].body as string)).toEqual({ accion: "enlinea_reanudar", sucursal_id: "s1" });
  });
  it("pausar lanza si la nube rechaza", async () => {
    vi.stubGlobal("fetch", resp(403, { error: "SIN_MODULO_TIENDA" }));
    await expect(pausarEnLinea("tok", "s1", "1h")).rejects.toThrow("SIN_MODULO_TIENDA");
  });
  it("avisarPresente nunca lanza", async () => {
    const f = resp(200, { ok: true, sellado: true }); vi.stubGlobal("fetch", f);
    await expect(avisarPresente("tok", "s1")).resolves.toBeUndefined();
    expect(JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ accion: "enlinea_presente", sucursal_id: "s1" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("net"); }));
    await expect(avisarPresente("tok", "s1")).resolves.toBeUndefined();
  });
  it("avisarPresente manda la caja del turno cuando se conoce", async () => {
    const f = resp(200, { ok: true, sellado: true }); vi.stubGlobal("fetch", f);
    await avisarPresente("tok", "s1", "c1");
    expect(JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ accion: "enlinea_presente", sucursal_id: "s1", caja_id: "c1" });
  });
});

describe("timbrarHasta", () => {
  const vence = "2026-10-09T18:05:00Z";
  it("sin pedidos por aceptar no hay timbre", () => {
    expect(timbrarHasta([], "c1")).toBeNull();
    expect(timbrarHasta([ped({ estado: "ACEPTADO" }), ped({ estado: "ERROR" }), ped({ estado: "EXPIRADO" })], "c1")).toBeNull();
  });
  it("suena hasta que venza el último pedido por aceptar, de cualquier canal", () => {
    expect(timbrarHasta([ped({ venceAceptacion: vence })], "c1")).toBe(Date.parse(vence));
    expect(timbrarHasta([ped({ venceAceptacion: vence }), uber({ id: "u", venceAceptacion: "2026-10-09T18:09:00Z" })], "c1")).toBe(Date.parse("2026-10-09T18:09:00Z"));
  });
  it("un pedido sin hora de vencimiento suena mientras siga por aceptar", () => {
    expect(timbrarHasta([ped()], "c1")).toBe(Infinity);
  });
  it("un pedido que ya tomó otra caja no suena aquí; el de esta caja sí", () => {
    expect(timbrarHasta([ped({ venceAceptacion: vence, gestionCajaId: "c2" })], "c1")).toBeNull();
    expect(timbrarHasta([ped({ venceAceptacion: vence, gestionCajaId: "c1" })], "c1")).toBe(Date.parse(vence));
  });
  it("con debeSonar: uno cuya hora de aceptar ya pasó no hace sonar (copia local pegada sin internet)", () => {
    const hasta = timbrarHasta([ped({ venceAceptacion: vence })], "c1")!;
    const sonar = (ahora: number) => debeSonar({ hayNuevoPorAceptar: false, hayPorAceptar: ahora < hasta, ultimoTimbre: null, ahora });
    expect(sonar(Date.parse(vence) - 1)).toBe(true);
    expect(sonar(Date.parse(vence))).toBe(false);
  });
});

describe("avisoDeTienda", () => {
  const texto = "El pedido en línea se canceló: cancela el ticket en caja";
  it("muestra lo que la caja dejó dicho en un pedido cerrado", () => {
    for (const estado of ["CANCELADO", "RECHAZADO", "EXPIRADO"] as const) {
      expect(avisoDeTienda(ped({ estado, ultimoError: texto }))).toBe(texto);
    }
  });
  it("nunca un código interno, ni en un pedido vivo, ni de una app, ni vacío", () => {
    expect(avisoDeTienda(ped({ estado: "CANCELADO", ultimoError: "SIN_TURNO_ABIERTO" }))).toBeNull();
    expect(avisoDeTienda(ped({ estado: "CANCELADO", ultimoError: "HTTP_500" }))).toBeNull();
    expect(avisoDeTienda(ped({ estado: "RECIBIDO", ultimoError: texto }))).toBeNull();
    expect(avisoDeTienda(ped({ estado: "ACEPTADO", ultimoError: texto }))).toBeNull();
    expect(avisoDeTienda(uber({ estado: "CANCELADO", ultimoError: texto }))).toBeNull();
    expect(avisoDeTienda(ped({ estado: "CANCELADO", ultimoError: null }))).toBeNull();
  });
});

describe("faltaComanda", () => {
  const ok = ped({ estado: "ACEPTADO", ticketId: "t1" });
  it("pedido de la tienda aceptado, con ticket y sin comanda impresa — sea de la caja que sea", () => {
    expect(faltaComanda(ok)).toBe(true);
    expect(faltaComanda({ ...ok, estado: "LISTO", ticketCajaId: "otra" })).toBe(true);
  });
  it("no si ya se imprimió, no hay ticket, no está aceptado o es de una app", () => {
    expect(faltaComanda({ ...ok, comandaImpresa: true })).toBe(false);
    expect(faltaComanda({ ...ok, ticketId: null })).toBe(false);
    expect(faltaComanda({ ...ok, estado: "RECIBIDO" })).toBe(false);
    expect(faltaComanda({ ...ok, estado: "ENTREGADO" })).toBe(false);
    expect(faltaComanda({ ...ok, canal: "APP" })).toBe(false);
  });
});
