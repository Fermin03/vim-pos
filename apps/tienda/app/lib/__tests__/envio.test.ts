// «Enviar»: de cada respuesta a lo que hace la pantalla, la cotización fresca antes de pedir y el
// candado del doble toque.
import { describe, expect, it, vi } from "vitest";
import type { Resultado } from "../api";
import { cotizacionDe, pedidoDe, type Cotizacion, type PedidoCreado } from "../contrato";
import { desenlaceDelError, enviarPedido, unaALaVez, type ContextoDeEnvio } from "../envio";
import { CODIGOS_DE_ERROR } from "../textos";
import { CODIGO, ID, cotizacionCruda, pedidoCrudo } from "./datos";

const c: ContextoDeEnvio = { telefono: "4771234567", horario: { "1": ["13:00", "22:00"] }, ahora: { dia: "1", hora: "10:00" } };
const e = (error: string, detalle: string | null = null) => ({ error, detalle });
const cotizada: Resultado<Cotizacion> = { ok: true, datos: cotizacionDe(cotizacionCruda()) as Cotizacion };   // total 305.00
const creado: Resultado<PedidoCreado> = { ok: true, datos: pedidoDe(pedidoCrudo()) as PedidoCreado };
const fallo = (error: string, detalle: string | null = null) => ({ ok: false as const, error, detalle });

describe("desenlaceDelError", () => {
  it("SIN_CONFIRMAR: el pedido pudo entrar → llamar antes, sin reintento inmediato", () => {
    expect(desenlaceDelError(e("SIN_CONFIRMAR"), c)).toEqual({
      tipo: "aviso", tono: "danger", sigue: "llamar-antes",
      texto: "No pudimos confirmar tu pedido. Antes de volver a intentarlo, llama al restaurante: 477 123 4567.",
    });
    expect(desenlaceDelError(e("SIN_CONFIRMAR"), { ...c, telefono: null })).toMatchObject({ sigue: "llamar-antes", texto: "No pudimos confirmar tu pedido. Antes de volver a intentarlo, llama al restaurante." });
  });
  it("lo que se puede reintentar: sin conexión, antirobot, demasiados intentos, servicio caído", () => {
    for (const codigo of ["SIN_CONEXION", "CAPTCHA_INVALIDO", "DEMASIADOS_INTENTOS", "SERVICIO_NO_DISPONIBLE", "ERROR_INTERNO", "UN_CODIGO_NUEVO"]) {
      expect(desenlaceDelError(e(codigo), c), codigo).toMatchObject({ tipo: "aviso", sigue: "reintentar" });
    }
    expect(desenlaceDelError(e("SIN_CONEXION"), c)).toMatchObject({ texto: "No pudimos conectar. Revisa tu conexión a internet y vuelve a intentar." });
  });
  it("TOTAL_CAMBIO con su total → confirmar; sin un total legible, un aviso que se reintenta (se cotiza otra vez)", () => {
    expect(desenlaceDelError(e("TOTAL_CAMBIO", "310.00"), c)).toEqual({ tipo: "total", total: "310.00" });
    for (const detalle of [null, "310", "abc"]) expect(desenlaceDelError(e("TOTAL_CAMBIO", detalle), c), String(detalle)).toMatchObject({ tipo: "aviso", sigue: "reintentar" });
  });
  it("TIENDA_CERRADA: el texto de tienda cerrada de su motivo", () => {
    expect(desenlaceDelError(e("TIENDA_CERRADA", "FUERA_DE_HORARIO"), c)).toEqual({ tipo: "aviso", tono: "warning", sigue: "reintentar", texto: "Cerrado ahora. Abre hoy a la 1:00 p. m." });
    expect(desenlaceDelError(e("TIENDA_CERRADA", "EN_PAUSA"), c)).toMatchObject({ texto: "No estamos tomando pedidos en este momento. Vuelve a intentar en unos minutos." });
    expect(desenlaceDelError(e("TIENDA_CERRADA"), c)).toMatchObject({ tono: "warning", texto: "Esta tienda no está disponible por ahora." });
  });
  it("los errores de renglón vuelven al carrito con su producto; sin saber cuál, se manda a revisar el pedido", () => {
    for (const codigo of ["PRODUCTO_NO_DISPONIBLE", "MODIFICADORES_INVALIDOS", "COMBO_INVALIDO"]) {
      expect(desenlaceDelError(e(codigo, ID.hamburguesa), c), codigo).toEqual({ tipo: "carrito", error: e(codigo, ID.hamburguesa) });
      expect(desenlaceDelError(e(codigo), c), codigo).toMatchObject({ tipo: "aviso", sigue: "volver" });
    }
  });
  it("los de un campo van a su campo con su texto", () => {
    expect(desenlaceDelError(e("CLIENTE_INVALIDO"), c)).toMatchObject({ tipo: "campo", campo: "nombre" });
    expect(desenlaceDelError(e("DIRECCION_INVALIDA"), c)).toMatchObject({ tipo: "campo", campo: "calle", texto: "Revisa tu dirección. Faltan datos o el código postal no tiene 5 dígitos." });
    expect(desenlaceDelError(e("PAGO_INVALIDO"), c)).toMatchObject({ tipo: "campo", campo: "pago" });
  });
  it("la zona y el modo se arreglan en el carrito", () => {
    expect(desenlaceDelError(e("ZONA_INVALIDA"), c)).toMatchObject({ tipo: "aviso", sigue: "volver", texto: "Esa zona de entrega ya no está disponible. Elige tu zona de nuevo." });
    expect(desenlaceDelError(e("MODO_INVALIDO"), c)).toMatchObject({ sigue: "volver" });
  });
  it("NO_SE_PUDO_CREAR: llamar al restaurante, con su teléfono", () => {
    expect(desenlaceDelError(e("NO_SE_PUDO_CREAR"), c)).toEqual({ tipo: "aviso", tono: "danger", sigue: "llamar", texto: "No pudimos tomar tu pedido. Llama al restaurante: 477 123 4567." });
  });
  it("ningún código conocido se queda sin texto ni enseña el código", () => {
    for (const codigo of CODIGOS_DE_ERROR) {
      const d = desenlaceDelError(e(codigo), c);
      const texto = d.tipo === "aviso" || d.tipo === "campo" ? d.texto : "";
      expect(texto.length, codigo).toBeGreaterThan(10);
      expect(texto, codigo).not.toMatch(/[A-Z]{3,}_[A-Z]/);
    }
  });
});

describe("enviarPedido", () => {
  it("cotiza, y con el total que el cliente vio pide con ese total", async () => {
    const cotizar = vi.fn(async () => cotizada), pedir = vi.fn(async (_total: string) => creado);
    expect(await enviarPedido({ cotizar, pedir, totalVisto: "305.00" }, c)).toEqual({ desenlace: { tipo: "hecho", codigo: CODIGO }, pidio: true });
    expect(cotizar).toHaveBeenCalledTimes(1);
    expect(pedir).toHaveBeenCalledTimes(1);
    expect(pedir).toHaveBeenCalledWith("305.00");
  });
  it("el caso degradado (sin folio ni total) también es un pedido hecho", async () => {
    const degradado: Resultado<PedidoCreado> = { ok: true, datos: { codigo: CODIGO, folio_corto: null, total_mxn: null, vence_aceptacion: null } };
    const r = await enviarPedido({ cotizar: async () => cotizada, pedir: async () => degradado, totalVisto: "305.00" }, c);
    expect(r.desenlace).toEqual({ tipo: "hecho", codigo: CODIGO });
  });
  it("si la cotización fresca trae otro total, NO pide: enseña el nuevo para confirmar", async () => {
    const pedir = vi.fn(async () => creado);
    for (const totalVisto of ["300.00", null]) {
      expect(await enviarPedido({ cotizar: async () => cotizada, pedir, totalVisto }, c)).toEqual({ desenlace: { tipo: "total", total: "305.00" }, pidio: false });
    }
    expect(pedir).not.toHaveBeenCalled();
  });
  it("si no se pudo cotizar, NO pide y no gasta el antirobot", async () => {
    const pedir = vi.fn(async () => creado);
    const r = await enviarPedido({ cotizar: async () => fallo("SIN_CONEXION"), pedir, totalVisto: "305.00" }, c);
    expect(r).toMatchObject({ pidio: false, desenlace: { tipo: "aviso", sigue: "reintentar" } });
    const agotado = await enviarPedido({ cotizar: async () => fallo("PRODUCTO_NO_DISPONIBLE", ID.hamburguesa), pedir, totalVisto: "305.00" }, c);
    expect(agotado).toMatchObject({ pidio: false, desenlace: { tipo: "carrito" } });
    expect(pedir).not.toHaveBeenCalled();
  });
  it("un rechazo de pedir gasta el antirobot y NUNCA se reintenta solo", async () => {
    const pedir = vi.fn(async () => fallo("SIN_CONFIRMAR"));
    const r = await enviarPedido({ cotizar: async () => cotizada, pedir, totalVisto: "305.00" }, c);
    expect(r).toMatchObject({ pidio: true, desenlace: { tipo: "aviso", sigue: "llamar-antes" } });
    expect(pedir).toHaveBeenCalledTimes(1);
    const cambio = await enviarPedido({ cotizar: async () => cotizada, pedir: async () => fallo("TOTAL_CAMBIO", "310.00"), totalVisto: "305.00" }, c);
    expect(cambio).toEqual({ desenlace: { tipo: "total", total: "310.00" }, pidio: true });
  });
});

describe("unaALaVez", () => {
  it("el segundo toque, con el primero en vuelo, no hace nada; al terminar se puede otra vez", async () => {
    let soltar: (v: string) => void = () => {};
    const f = vi.fn(() => new Promise<string>((ok) => { soltar = ok; }));
    const una = unaALaVez(f);
    const primero = una();
    expect(await una()).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
    soltar("listo");
    expect(await primero).toBe("listo");
    void una();
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("si falla, el candado se suelta", async () => {
    const f = vi.fn(async () => { throw new Error("x"); });
    const una = unaALaVez(f);
    await expect(una()).rejects.toThrow("x");
    await expect(una()).rejects.toThrow("x");
    expect(f).toHaveBeenCalledTimes(2);
  });
});
