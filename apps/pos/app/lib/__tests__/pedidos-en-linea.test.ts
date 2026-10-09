import { describe, it, expect, vi, afterEach } from "vitest";
import type { PedidoApp } from "../pedidos-apps";
import {
  etiquetaOrigen, etiquetaPago, etiquetaEntrega, debeSonar, TIMBRE_CADA_MS, comandasPendientes, aceptablesSolos,
  etiquetaEstadoEnLinea, mensajeErrorEnLinea, avisoDeTienda, timbrarHasta, faltaComanda, soloInformativo, leerEstadoEnLinea, pausarEnLinea, reanudarEnLinea, avisarPresente,
  puedeAtender, porQueNoSeAtiende, conAtendidos, cuentaDe, avisosDeCanal, porAceptarDeCanal, contarPorAceptar, colaDeAvisos, recienAceptados, textoPedidoEnCanal, sinComanda, MARGEN_COMANDA_MS,
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
  it("con la caja instalada sin actualizar, «sin turno abierto» pasa a decir qué hacer", () => {
    expect(etiquetaEstadoEnLinea(e({ motivo: "CAJA_NO_LISTA" }), ahora, true))
      .toEqual({ texto: "Tienda: actualiza la caja de esta sucursal para recibir pedidos en línea.", tono: "aviso" });
    // Solo cambia ese caso: lo demás se dice igual (una pausa sigue siendo una pausa).
    expect(etiquetaEstadoEnLinea(e({}), ahora, true).texto).toBe("Tienda: recibiendo pedidos");
    expect(etiquetaEstadoEnLinea(e({ motivo: "FUERA_DE_HORARIO" }), ahora, true).texto).toBe("Tienda: fuera de horario");
    expect(etiquetaEstadoEnLinea(e({ motivo: "EN_PAUSA" }), ahora, true).texto).toBe("Tienda: en pausa");
    expect(etiquetaEstadoEnLinea(e({ motivo: "NO_PARTICIPA" }), ahora, true).texto).toBe("Tienda: apagada");
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
    await expect(avisarPresente("tok", "s1")).resolves.toBe(false);
    expect(JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ accion: "enlinea_presente", sucursal_id: "s1" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("net"); }));
    await expect(avisarPresente("tok", "s1")).resolves.toBe(false);
  });
  it("avisarPresente dice si la nube no selló porque la caja instalada de la sucursal está sin actualizar", async () => {
    vi.stubGlobal("fetch", resp(200, { ok: true, sellado: false, motivo: "CAJA_SIN_ACTUALIZAR" }));
    expect(await avisarPresente("tok", "s1", "c1")).toBe(true);
    // Sin turno abierto tampoco sella, pero eso no es una caja vieja.
    vi.stubGlobal("fetch", resp(200, { ok: true, sellado: false }));
    expect(await avisarPresente("tok", "s1", "c1")).toBe(false);
    vi.stubGlobal("fetch", resp(500, { error: "INTERNO" }));
    expect(await avisarPresente("tok", "s1", "c1")).toBe(false);
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

describe("soloInformativo: en la caja instalada, lo que se atiende desde el POS web", () => {
  it("solo un pedido de la tienda de gestión NUBE, y solo dentro de la caja", () => {
    expect(soloInformativo(ped({ gestion: "NUBE" }), true)).toBe(true);
    expect(soloInformativo(ped({ gestion: "NUBE" }), false)).toBe(false);
    expect(soloInformativo(ped({ gestion: "ESCRITORIO" }), true)).toBe(false);
    expect(soloInformativo(ped({ gestion: null }), true)).toBe(false);
    expect(soloInformativo(uber({ gestion: "NUBE" }), true)).toBe(false);
  });
  it("quitados esos, la caja no timbra por ellos ni los cuenta por aceptar", () => {
    const vence = "2026-10-09T18:05:00Z";
    const ps = [ped({ gestion: "NUBE", venceAceptacion: vence })].filter((p) => !soloInformativo(p, true));
    expect(timbrarHasta(ps, "c1")).toBeNull();
  });
});

// ── Cada pedido de la tienda en su canal (Pick-up / Domicilio) y el aviso grande ──

describe("puedeAtender: si ESTE dispositivo puede aceptar o rechazar el pedido", () => {
  const d = { cajaId: "c1", enEscritorio: false, ahora: Date.parse("2026-10-09T10:05:00Z") };
  it("un pedido de la tienda por aceptar, sin dueño o de esta caja, y sin vencer", () => {
    expect(puedeAtender(ped(), d)).toBe(true);
    expect(puedeAtender(ped({ gestionCajaId: "c1" }), d)).toBe(true);
    expect(puedeAtender(ped({ venceAceptacion: "2026-10-09T10:05:01Z" }), d)).toBe(true);
    expect(puedeAtender(ped({ estado: "ERROR", venceAceptacion: "2026-10-09T10:00:00Z" }), d)).toBe(true);
  });
  it("no el que tomó otra caja, ni el vencido, ni el ya atendido, ni uno de Uber", () => {
    expect(puedeAtender(ped({ gestionCajaId: "c2" }), d)).toBe(false);
    expect(puedeAtender(ped({ venceAceptacion: "2026-10-09T10:05:00Z" }), d)).toBe(false);
    for (const estado of ["ACEPTADO", "RECHAZADO", "EXPIRADO", "CANCELADO", "ENTREGADO"] as const) expect(puedeAtender(ped({ estado }), d), estado).toBe(false);
    expect(puedeAtender(uber(), d)).toBe(false);
  });
  it("dentro de la caja instalada, el que se atiende desde el POS web es solo informativo", () => {
    expect(puedeAtender(ped({ gestion: "NUBE" }), { ...d, enEscritorio: true })).toBe(false);
    expect(puedeAtender(ped({ gestion: "ESCRITORIO" }), { ...d, enEscritorio: true })).toBe(true);
  });
});

describe("porQueNoSeAtiende: lo que se le dice al cajero en vez de los botones", () => {
  const d = { cajaId: "c1", enEscritorio: false, ahora: Date.parse("2026-10-09T10:05:00Z") };
  it("cada caso con su motivo; null cuando sí se puede atender", () => {
    expect(porQueNoSeAtiende(ped(), d)).toBeNull();
    expect(porQueNoSeAtiende(ped(), { ...d, enEscritorio: true })).toBe("Se atiende desde el POS web.");
    expect(porQueNoSeAtiende(ped({ gestionCajaId: "c2" }), d)).toBe("Otra caja ya tomó este pedido.");
    expect(porQueNoSeAtiende(ped({ venceAceptacion: "2026-10-09T10:00:00Z" }), d)).toBe("Se venció sin aceptar.");
  });
});

describe("conAtendidos: lo que se aceptó o rechazó aquí se ve así desde ya", () => {
  it("la caja instalada tarda unos segundos en traer el cambio; mientras, manda lo que se hizo aquí", () => {
    const hecho = new Map([["a", "aceptar" as const], ["r", "rechazar" as const]]);
    const r = conAtendidos([ped({ id: "a" }), ped({ id: "r" }), ped({ id: "x" })], hecho);
    expect(r.map((p) => p.estado)).toEqual(["ACEPTADO", "RECHAZADO", "RECIBIDO"]);
  });
  it("no pisa lo que la base ya dice (el pedido se canceló, o ya trae su cuenta)", () => {
    const hecho = new Map([["a", "aceptar" as const]]);
    expect(conAtendidos([ped({ id: "a", estado: "CANCELADO" })], hecho)[0]!.estado).toBe("CANCELADO");
    const conCuenta = ped({ id: "a", estado: "ACEPTADO", ticketId: "t1" });
    expect(conAtendidos([conCuenta], hecho)[0]).toBe(conCuenta);
  });
});

describe("cuentaDe: la cuenta de un pedido ya aceptado", () => {
  it("su ticket mientras está vivo; null si no hay ticket, sigue por aceptar o ya cerró", () => {
    expect(cuentaDe(ped({ estado: "ACEPTADO", ticketId: "t1" }))).toBe("t1");
    expect(cuentaDe(ped({ estado: "LISTO", ticketId: "t1" }))).toBe("t1");
    expect(cuentaDe(ped({ estado: "ACEPTADO" }))).toBeNull();
    expect(cuentaDe(ped({ estado: "RECIBIDO", ticketId: "t1" }))).toBeNull();
    expect(cuentaDe(ped({ estado: "ENTREGADO", ticketId: "t1" }))).toBeNull();
  });
});

describe("avisosDeCanal: lo que se cerró solo, dicho en su canal", () => {
  it("el vencido y lo que la caja dejó dicho, cada uno en su canal", () => {
    const ps = [
      ped({ id: "v", estado: "EXPIRADO", folioCorto: "T1" }),
      ped({ id: "c", estado: "CANCELADO", folioCorto: "T2", ultimoError: "Un producto ya no está en tu menú." }),
      ped({ id: "d", app: "DELIVERY_PROPIO", estado: "EXPIRADO", folioCorto: null }),
    ];
    expect(avisosDeCanal(ps, "DRIVE_THRU")).toEqual([
      { id: "v", texto: "El pedido T1 se venció sin aceptar." },
      { id: "c", texto: "Pedido T2: Un producto ya no está en tu menú." },
    ]);
    expect(avisosDeCanal(ps, "DELIVERY_PROPIO")).toEqual([{ id: "d", texto: "Un pedido se venció sin aceptar." }]);
  });
  it("nada de un pedido vivo, rechazado a mano, cancelado sin explicación o de una app", () => {
    const ps = [ped(), ped({ estado: "ACEPTADO" }), ped({ estado: "RECHAZADO" }), ped({ estado: "CANCELADO" }), ped({ estado: "CANCELADO", ultimoError: "TOTAL_NO_COINCIDE" }), uber({ estado: "EXPIRADO" })];
    expect(avisosDeCanal(ps, "DRIVE_THRU")).toEqual([]);
  });
});

describe("porAceptarDeCanal", () => {
  it("los de recoger van a Pick-up y los de domicilio a Domicilio, del más antiguo al más nuevo", () => {
    const ps = [
      ped({ id: "nuevo", recibidoAt: "2026-10-09T10:02:00Z" }),
      ped({ id: "dom", app: "DELIVERY_PROPIO" }),
      ped({ id: "viejo", recibidoAt: "2026-10-09T10:01:00Z" }),
      ped({ id: "aceptado", estado: "ACEPTADO" }),
      uber({ id: "u" }),
    ];
    expect(porAceptarDeCanal(ps, "DRIVE_THRU").map((p) => p.id)).toEqual(["viejo", "nuevo"]);
    expect(porAceptarDeCanal(ps, "DELIVERY_PROPIO").map((p) => p.id)).toEqual(["dom"]);
  });
  it("incluye lo que aquí solo se puede ver (lo tomó otra caja): la lista lo enseña sin botones", () => {
    expect(porAceptarDeCanal([ped({ gestionCajaId: "c2" })], "DRIVE_THRU")).toHaveLength(1);
  });
});

describe("contarPorAceptar: los contadores del inicio", () => {
  const d = { cajaId: "c1", enEscritorio: false, ahora: Date.parse("2026-10-09T10:05:00Z") };
  it("la tienda suma a su canal; «Pedidos en línea» cuenta solo las apps", () => {
    const ps = [ped({ id: "a" }), ped({ id: "b" }), ped({ id: "c", app: "DELIVERY_PROPIO" }), uber({ id: "u" }), uber({ id: "e", estado: "ERROR" }), uber({ id: "x", estado: "ACEPTADO" })];
    expect(contarPorAceptar(ps, d)).toEqual({ pickup: 2, domicilio: 1, apps: 2 });
  });
  it("no cuenta lo que este dispositivo no puede atender", () => {
    const nada = { pickup: 0, domicilio: 0, apps: 0 };
    expect(contarPorAceptar([ped({ gestionCajaId: "c2" }), ped({ id: "v", venceAceptacion: "2026-10-09T10:00:00Z" })], d)).toEqual(nada);
    expect(contarPorAceptar([ped()], { ...d, enEscritorio: true })).toEqual(nada);
  });
});

describe("colaDeAvisos: el aviso grande, uno por pedido", () => {
  const d = { cajaId: "c1", enEscritorio: false, ahora: Date.parse("2026-10-09T10:05:00Z"), aceptacion: "MANUAL" as const };
  const nada = new Set<string>();
  it("los pedidos por aceptar que este dispositivo puede atender, del más antiguo al más nuevo", () => {
    const ps = [ped({ id: "b", recibidoAt: "2026-10-09T10:03:00Z" }), ped({ id: "a", app: "DELIVERY_PROPIO", recibidoAt: "2026-10-09T10:01:00Z" }), uber({ id: "u" })];
    expect(colaDeAvisos(ps, d, nada).map((p) => p.id)).toEqual(["a", "b"]);
  });
  it("cerrarlo no lo hace reaparecer, y el siguiente pasa al frente", () => {
    const ps = [ped({ id: "a", recibidoAt: "2026-10-09T10:01:00Z" }), ped({ id: "b", recibidoAt: "2026-10-09T10:03:00Z" })];
    expect(colaDeAvisos(ps, d, new Set(["a"])).map((p) => p.id)).toEqual(["b"]);
  });
  it("se quita solo cuando deja de estar por aceptar: aceptado, rechazado, vencido o tomado por otra caja", () => {
    for (const fuera of [ped({ estado: "ACEPTADO" }), ped({ estado: "RECHAZADO" }), ped({ estado: "EXPIRADO" }), ped({ venceAceptacion: "2026-10-09T10:04:59Z" }), ped({ gestionCajaId: "c2" })]) {
      expect(colaDeAvisos([fuera], d, nada), fuera.estado).toEqual([]);
    }
  });
  it("no avisa de un pedido con error (no es «nuevo»), ni de lo que en la caja solo se informa", () => {
    expect(colaDeAvisos([ped({ estado: "ERROR" })], d, nada)).toEqual([]);
    expect(colaDeAvisos([ped()], { ...d, enEscritorio: true }, nada)).toEqual([]);
    expect(colaDeAvisos([ped({ gestion: "ESCRITORIO" })], { ...d, enEscritorio: true }, nada)).toHaveLength(1);
  });
  it("con aceptación automática en el POS web no hay aviso: el pedido se acepta solo", () => {
    expect(colaDeAvisos([ped()], { ...d, aceptacion: "AUTO" }, nada)).toEqual([]);
    // Uno que NO se va a aceptar solo (es de una caja instalada) sí avisa.
    expect(colaDeAvisos([ped({ gestion: "ESCRITORIO" })], { ...d, aceptacion: "AUTO" }, nada)).toHaveLength(1);
  });
});

describe("recienAceptados: el aviso breve de un pedido que entró a su canal", () => {
  it("en la primera lectura no avisa de nada", () => {
    expect(recienAceptados(null, [ped({ estado: "ACEPTADO" })])).toEqual([]);
  });
  it("uno que llega ya aceptado, o que estaba por aceptar y ya se aceptó", () => {
    expect(recienAceptados(new Map([["p1", "RECIBIDO" as const]]), [ped({ estado: "ACEPTADO" })])).toHaveLength(1);
    expect(recienAceptados(new Map(), [ped({ estado: "ACEPTADO" })])).toHaveLength(1);
  });
  it("no repite el que ya estaba aceptado, ni avisa de Uber ni de lo que sigue por aceptar", () => {
    expect(recienAceptados(new Map([["p1", "ACEPTADO" as const]]), [ped({ estado: "ACEPTADO" })])).toEqual([]);
    expect(recienAceptados(new Map(), [uber({ estado: "ACEPTADO" }), ped()])).toEqual([]);
  });
  it("el texto dice el canal y el folio", () => {
    expect(textoPedidoEnCanal(ped({ folioCorto: "T1234" }))).toBe("Pedido nuevo en Pick-up · T1234");
    expect(textoPedidoEnCanal(ped({ app: "DELIVERY_PROPIO", folioCorto: null }))).toBe("Pedido nuevo en Domicilio");
  });
});

describe("sinComanda: avisar de la comanda que no salió, con margen", () => {
  const aceptado = ped({ estado: "ACEPTADO", ticketId: "t1", gestion: "ESCRITORIO" });
  it("avisa hasta pasado el margen desde que se vio sin comanda", () => {
    const desde = new Map<string, number>();
    expect(sinComanda(desde, [aceptado], 1000, false).size).toBe(0);
    expect(sinComanda(desde, [aceptado], 1000 + MARGEN_COMANDA_MS, false).size).toBe(0);
    expect([...sinComanda(desde, [aceptado], 1001 + MARGEN_COMANDA_MS, false)]).toEqual(["p1"]);
  });
  it("al salir el papel deja de avisar y la cuenta empieza de cero", () => {
    const desde = new Map([["p1", 0]]);
    expect(sinComanda(desde, [{ ...aceptado, comandaImpresa: true }], 99_999, false).size).toBe(0);
    expect(desde.has("p1")).toBe(false);
  });
  it("dentro de la caja no avisa de lo que se atiende desde el POS web", () => {
    expect(sinComanda(new Map([["p1", 0]]), [{ ...aceptado, gestion: "NUBE" }], 99_999, true).size).toBe(0);
  });
});
