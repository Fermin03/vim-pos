// El cliente del navegador hacia /api/tienda, y las cabeceras de seguridad compartidas.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cabecerasSeguridad } from "@vim/config/cabeceras-seguridad.mjs";
import { cotizar, pedir, seguimiento, type CuerpoPedido } from "../api";
import { CODIGO, ID, cotizacionCruda, pedidoCrudo, seguimientoCrudo } from "./datos";

let llamadas: { url: string; init: RequestInit }[] = [];
let responder: () => Response | Promise<Response>;
const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status });
const carrito = { sucursal_id: ID.sucursal, modo: "RECOGER" as const, zona_id: null, items: [{ producto_id: ID.refresco, cantidad: 1, modificadores: [] }] };
const pedido: CuerpoPedido = {
  ...carrito, cliente: { nombre: "Ana", telefono: "4771234567", email: null }, direccion: null,
  pago: "EFECTIVO", paga_con: null, nota: null, captcha: "token", total_esperado: "30.00",
};

beforeEach(() => {
  llamadas = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    llamadas.push({ url: String(url), init });
    return responder();
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("api del navegador", () => {
  it("cotizar: POST a /api/tienda con la acción, el negocio y el carrito", async () => {
    responder = () => json(cotizacionCruda());
    expect(await cotizar("knockout", carrito)).toEqual({ ok: true, datos: cotizacionCruda() });
    expect(llamadas[0]!.url).toBe("/api/tienda");
    expect(llamadas[0]!.init.method).toBe("POST");
    expect(JSON.parse(llamadas[0]!.init.body as string)).toEqual({ accion: "cotizar", negocio: "knockout", ...carrito });
  });
  it("seguimiento y pedir", async () => {
    responder = () => json(seguimientoCrudo());
    expect(await seguimiento("knockout", CODIGO)).toEqual({ ok: true, datos: seguimientoCrudo() });
    expect(JSON.parse(llamadas[0]!.init.body as string)).toEqual({ accion: "seguimiento", negocio: "knockout", codigo: CODIGO });
    responder = () => json(pedidoCrudo());
    expect(await pedir("knockout", pedido)).toEqual({ ok: true, datos: pedidoCrudo() });
    expect(JSON.parse(llamadas[1]!.init.body as string)).toEqual({ accion: "pedir", negocio: "knockout", ...pedido });
  });
  it("un rechazo trae su código y su detalle", async () => {
    responder = () => json({ error: "TOTAL_CAMBIO", detalle: "35.00" }, 409);
    expect(await pedir("knockout", pedido)).toEqual({ ok: false, error: "TOTAL_CAMBIO", detalle: "35.00" });
    responder = () => json({ error: "PEDIDO_NO_ENCONTRADO" }, 404);
    expect(await seguimiento("knockout", CODIGO)).toEqual({ ok: false, error: "PEDIDO_NO_ENCONTRADO", detalle: null });
  });
  it("un 200 que no tiene la forma no se pinta a medias", async () => {
    responder = () => json({ total_mxn: "30.00" });
    expect(await cotizar("knockout", carrito)).toEqual({ ok: false, error: "SERVICIO_NO_DISPONIBLE", detalle: null });
    responder = () => new Response("<html>", { status: 200 });
    expect(await seguimiento("knockout", CODIGO)).toEqual({ ok: false, error: "SERVICIO_NO_DISPONIBLE", detalle: null });
  });
  it("un error sin forma (página de error del hosting) es servicio no disponible", async () => {
    responder = () => new Response("<html>502</html>", { status: 502 });
    expect(await cotizar("knockout", carrito)).toEqual({ ok: false, error: "SERVICIO_NO_DISPONIBLE", detalle: null });
  });
  it("sin red: cotizar y seguimiento dicen «sin conexión»", async () => {
    responder = () => { throw new TypeError("Failed to fetch"); };
    expect(await cotizar("knockout", carrito)).toEqual({ ok: false, error: "SIN_CONEXION", detalle: null });
    expect(await seguimiento("knockout", CODIGO)).toEqual({ ok: false, error: "SIN_CONEXION", detalle: null });
  });
  it("pedir NUNCA reintenta, y si no supo qué pasó lo dice: el pedido pudo haber entrado", async () => {
    const SIN_CONFIRMAR = { ok: false, error: "SIN_CONFIRMAR", detalle: null };
    responder = () => { throw new TypeError("Failed to fetch"); };
    expect(await pedir("knockout", pedido)).toEqual(SIN_CONFIRMAR);
    responder = () => json({ error: "SERVICIO_NO_DISPONIBLE", detalle: "SIN_RESPUESTA" }, 503);
    expect(await pedir("knockout", pedido)).toEqual(SIN_CONFIRMAR);
    responder = () => json({ folio_corto: "TAB12C" });            // un 200 sin código
    expect(await pedir("knockout", pedido)).toEqual(SIN_CONFIRMAR);
    responder = () => new Response("<html>504</html>", { status: 504 });
    expect(await pedir("knockout", pedido)).toEqual(SIN_CONFIRMAR);
    expect(llamadas).toHaveLength(4);                             // una llamada por intento, ni una más
    // Un 503 «de verdad» (la función contestó que no pudo) sí deja volver a intentar.
    responder = () => json({ error: "SERVICIO_NO_DISPONIBLE" }, 503);
    expect(await pedir("knockout", pedido)).toEqual({ ok: false, error: "SERVICIO_NO_DISPONIBLE", detalle: null });
  });
  it("pedir, caso degradado: con el código basta", async () => {
    responder = () => json({ codigo: CODIGO, folio_corto: null, total_mxn: null, vence_aceptacion: null });
    expect(await pedir("knockout", pedido)).toEqual({ ok: true, datos: { codigo: CODIGO, folio_corto: null, total_mxn: null, vence_aceptacion: null } });
  });
  it("se puede cancelar una cotización que ya no interesa", async () => {
    const corte = new AbortController();
    responder = () => { throw new DOMException("Aborted", "AbortError"); };
    corte.abort();
    expect(await cotizar("knockout", carrito, corte.signal)).toEqual({ ok: false, error: "CANCELADA", detalle: null });
  });
});

describe("cabeceras de seguridad compartidas", () => {
  const csp = (o?: Parameters<typeof cabecerasSeguridad>[0]) => cabecerasSeguridad(o).find((h) => h.key === "Content-Security-Policy")!.value;
  const CONNECT = "connect-src 'self' https://*.supabase.co https://*.supabase.in http://127.0.0.1:54321 ws://localhost:* http://localhost:*";
  beforeEach(() => vi.stubEnv("NODE_ENV", "production"));
  afterEach(() => vi.unstubAllEnvs());

  it("sin imgSrc, la CSP de las demás apps es exactamente la de siempre", () => {
    expect(csp()).toBe(
      "default-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; img-src 'self' data: blob:; "
      + "font-src 'self' data: https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
      + `script-src 'self' 'unsafe-inline'; ${CONNECT}`);
    // el admin, con su captcha
    expect(csp({ scriptExtra: "https://challenges.cloudflare.com", frameSrc: "https://challenges.cloudflare.com" })).toBe(
      "default-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; img-src 'self' data: blob:; "
      + "font-src 'self' data: https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
      + `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; ${CONNECT}`);
    expect(cabecerasSeguridad().map((h) => h.key)).toEqual([
      "X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy", "Strict-Transport-Security", "Permissions-Policy", "Content-Security-Policy",
    ]);
  });
  it("imgSrc solo añade orígenes a img-src", () => {
    const con = csp({ imgSrc: ["https://abc.supabase.co"] });
    expect(con).toContain("img-src 'self' data: blob: https://abc.supabase.co;");
    expect(con.replace(" https://abc.supabase.co;", ";")).toBe(csp());
    expect(csp({ imgSrc: [] })).toBe(csp());
  });
});
