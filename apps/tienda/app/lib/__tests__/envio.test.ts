// «Enviar»: de cada respuesta a lo que hace la pantalla, la cotización fresca antes de pedir y el
// candado del doble toque.
import { describe, expect, it, vi } from "vitest";
import type { Resultado } from "../api";
import { cotizacionDe, pedidoDe, type Cotizacion, type PedidoCreado } from "../contrato";
import { candadoDeEnvio, desenlaceDelError, enviarPedido, type ContextoDeEnvio } from "../envio";
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
  it("SESION_INVALIDA al pedir: aviso propio con dos salidas (entrar otra vez o enviar como invitado), nunca un reintento ciego", () => {
    expect(desenlaceDelError(e("SESION_INVALIDA"), c)).toEqual({
      tipo: "aviso", tono: "warning", sigue: "sesion",
      texto: "Tu sesión terminó. Entra otra vez o envía tu pedido como invitado.",
    });
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
    // La sesión se acabó: el antirobot se gastó (hay que pedir otro token) y no se reenvía solo como invitado.
    const sinSesion = vi.fn(async () => fallo("SESION_INVALIDA"));
    expect(await enviarPedido({ cotizar: async () => cotizada, pedir: sinSesion, totalVisto: "305.00" }, c)).toMatchObject({ pidio: true, desenlace: { tipo: "aviso", sigue: "sesion" } });
    expect(sinSesion).toHaveBeenCalledTimes(1);
  });
});

describe("enviarPedido nunca lanza", () => {
  it("si cotizar truena, no se pidió nada: un aviso que se puede reintentar", async () => {
    const pedir = vi.fn(async () => creado);
    const r = await enviarPedido({ cotizar: async () => { throw new Error("x"); }, pedir, totalVisto: "305.00" }, c);
    expect(r).toMatchObject({ pidio: false, desenlace: { tipo: "aviso", sigue: "reintentar" } });
    expect(pedir).not.toHaveBeenCalled();
  });
  it("si pedir truena, el pedido PUDO haber entrado: llamar antes, y el antirobot se da por gastado", async () => {
    const r = await enviarPedido({ cotizar: async () => cotizada, pedir: async () => { throw new Error("x"); }, totalVisto: "305.00" }, c);
    expect(r).toMatchObject({ pidio: true, desenlace: { tipo: "aviso", sigue: "llamar-antes" } });
  });
});

describe("candadoDeEnvio: un solo envío en vuelo, viva o no la pantalla que lo lanzó", () => {
  /** Un envío que termina cuando la prueba quiere. */
  const pendiente = () => {
    let soltar: (v: string) => void = () => {}, fallar: (e: Error) => void = () => {};
    const envio = vi.fn(() => new Promise<string>((ok, mal) => { soltar = ok; fallar = mal; }));
    return { envio, soltar: (v: string) => soltar(v), fallar: (e: Error) => fallar(e) };
  };
  const unTick = () => new Promise((ok) => setTimeout(ok, 0));

  it("el segundo toque, con el primero en vuelo, no envía; al terminar se puede otra vez", async () => {
    const candado = candadoDeEnvio<string>(), a = pendiente(), b = pendiente();
    expect(candado.ocupado()).toBe(false);
    expect(candado.lanzar(a.envio)).toBe(true);
    expect(candado.ocupado()).toBe(true);
    expect(candado.lanzar(b.envio)).toBe(false);
    expect(b.envio).not.toHaveBeenCalled();
    a.soltar("listo");
    await unTick();
    expect(candado.ocupado()).toBe(false);
    expect(candado.lanzar(b.envio)).toBe(true);
    expect(b.envio).toHaveBeenCalledTimes(1);
  });
  it("otra pantalla (la de «Tus datos» vuelta a montar) NO puede enviar mientras el primero sigue en vuelo", async () => {
    const candado = candadoDeEnvio<string>(), a = pendiente(), b = pendiente();
    const primera = vi.fn(), segunda = vi.fn();
    const baja = candado.recibir(primera);
    candado.lanzar(a.envio);
    baja();                                    // la pantalla que lanzó se desmonta
    candado.recibir(segunda);                  // y se monta otra
    expect(candado.ocupado()).toBe(true);      // que nace sabiendo que hay un envío en vuelo
    expect(candado.lanzar(b.envio)).toBe(false);
    a.soltar("SIN_CONFIRMAR");
    await unTick();
    expect(primera).not.toHaveBeenCalled();
    expect(segunda).toHaveBeenCalledWith("SIN_CONFIRMAR");   // el resultado llega a la que está viva
  });
  it("si no hay pantalla cuando termina, el resultado se guarda y se entrega a la siguiente, una sola vez", async () => {
    const candado = candadoDeEnvio<string>(), a = pendiente();
    const baja = candado.recibir(vi.fn());
    candado.lanzar(a.envio);
    baja();
    a.soltar("SIN_CONFIRMAR");
    await unTick();
    expect(candado.ocupado()).toBe(false);
    const siguiente = vi.fn(), otra = vi.fn();
    candado.recibir(siguiente)();
    expect(siguiente).toHaveBeenCalledTimes(1);
    expect(siguiente).toHaveBeenCalledWith("SIN_CONFIRMAR");
    candado.recibir(otra);
    expect(otra).not.toHaveBeenCalled();
  });
  it("darse de baja no quita a la pantalla que llegó después", async () => {
    const candado = candadoDeEnvio<string>(), a = pendiente();
    const vieja = vi.fn(), nueva = vi.fn();
    const bajaDeLaVieja = candado.recibir(vieja);
    candado.recibir(nueva);
    bajaDeLaVieja();
    candado.lanzar(a.envio);
    a.soltar("listo");
    await unTick();
    expect(nueva).toHaveBeenCalledWith("listo");
  });
  it("el candado se suelta SIEMPRE: si el envío lanza y si la pantalla lanza al recibir", async () => {
    const ruido = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const candado = candadoDeEnvio<string>(), a = pendiente(), b = pendiente();
      candado.lanzar(a.envio);
      a.fallar(new Error("x"));
      await unTick();
      expect(candado.ocupado()).toBe(false);
      candado.recibir(() => { throw new Error("la pantalla"); });
      candado.lanzar(b.envio);
      b.soltar("listo");
      await unTick();
      expect(candado.ocupado()).toBe(false);
      expect(candado.lanzar(async () => "otro")).toBe(true);
    } finally {
      ruido.mockRestore();
    }
  });
  it("avisa a quien mira cada vez que se ocupa o se libera (la tienda no deja cerrar la hoja mientras)", async () => {
    const candado = candadoDeEnvio<string>(), a = pendiente();
    const visto: boolean[] = [];
    const dejarDeMirar = candado.suscribir(() => visto.push(candado.ocupado()));
    candado.lanzar(a.envio);
    a.soltar("listo");
    await unTick();
    expect(visto).toEqual([true, false]);
    dejarDeMirar();
    candado.lanzar(async () => "otro");
    expect(visto).toHaveLength(2);
  });
  it("la pantalla recibe el resultado ANTES de que el candado se libere (no hay un instante con el botón vivo)", async () => {
    const candado = candadoDeEnvio<string>(), a = pendiente();
    const orden: string[] = [];
    candado.recibir(() => orden.push(`resultado:${candado.ocupado()}`));
    candado.suscribir(() => orden.push(`candado:${candado.ocupado()}`));
    candado.lanzar(a.envio);
    a.soltar("listo");
    await unTick();
    expect(orden).toEqual(["candado:true", "resultado:true", "candado:false"]);
  });
});
