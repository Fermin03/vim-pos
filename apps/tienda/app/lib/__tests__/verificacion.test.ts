// La verificación del banco (3D Secure) en la tienda: qué dirección se abre en el marco, qué se le
// cree al mensaje de la página del reto, qué hace la pantalla con cada respuesta del servidor y cómo
// sobrevive a una recarga sin mandar otro pago.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Resultado } from "../api";
import { pedidoDe, verificacionDe, type PedidoCreado, type Verificacion } from "../contrato";
import type { Almacen } from "../carrito";
import { CLAVE_DEL_INTENTO, desenlaceDelError, dondeDelIntento, enviarPedido, intentoDeCompra, intentoDelNegocio, resolverDuda } from "../envio";
import { textoDeSeguimiento } from "../textos";
import { pasoDelDesenlace } from "../pasos";
import { textoDeRechazo } from "../tarjeta";
import { HOSTS_DEL_RETO, esFinDelReto, pasoDelReto, retoQueSigue, seOfreceCancelar, urlDeReto, vigilarReto, type PasoDelReto, type Reto } from "../verificacion";
import { CODIGO, cotizacionCruda, pedidoCrudo } from "./datos";

// La dirección REAL que devolvió Mercado Pago (12 oct 2026), con los identificadores cambiados.
const URL_RETO = "https://www.mercadopago.com.mx/auth/card/validation/pages/remedies/5f0c3c6e-1111-4222-8333-444455556666?display_mode=self_hosted&guest_token=9a8b7c6d-aaaa-4bbb-8ccc-ddddeeeeffff";
const MALAS = [
  "http://www.mercadopago.com.mx/auth/card/validation/pages/remedies/x", "https://www.mercadopago.com.mx.evil.example/reto",
  "https://evil.example/?u=https://www.mercadopago.com.mx/", "https://www.mercadopago.com.mx@evil.example/reto",
  "https://usuario:clave@www.mercadopago.com.mx/reto", "https://www.mercadopago.com.mx:8443/reto", "https://mercadopago.com.mx/reto",
  "https://www.mercadopago.com/reto", "javascript:alert(1)", "data:text/html,<p>hola</p>", "//www.mercadopago.com.mx/reto", "/reto", "", "   ",
  null, undefined, 7, { href: URL_RETO }, `https://www.mercadopago.com.mx/${"a".repeat(700)}`,
];
const ok = (datos: Verificacion): Resultado<Verificacion> => ({ ok: true, datos });
const fallo = (error: string, detalle: string | null = null): Resultado<Verificacion> => ({ ok: false, error, detalle });

describe("la dirección del reto", () => {
  it("solo se abre una https de Mercado Pago; cualquier otra cosa es null", () => {
    expect(urlDeReto(URL_RETO)).toBe(URL_RETO);
    for (const mala of MALAS) expect(urlDeReto(mala), String(mala).slice(0, 50)).toBeNull();
  });
  it("la CSP deja enmarcar exactamente los mismos orígenes (si cambia la lista, cambian las dos)", () => {
    const config = readFileSync(new URL("../../../next.config.mjs", import.meta.url), "utf8");
    const frame = /frame: \[([^\]]*)\]/.exec(config)?.[1] ?? "";
    for (const h of HOSTS_DEL_RETO) expect(frame).toContain(`"https://${h}"`);
    // Sin comodines: ni en los marcos ni en ningún otro origen de Mercado Pago.
    expect(config).not.toMatch(/https:\/\/\*\./);
  });
  it("`pedir` con VERIFICACION: pasa la dirección buena; una que no es de Mercado Pago no llega a la pantalla", () => {
    const con = (pago: unknown) => (pedidoDe({ ...(pedidoCrudo() as object), pago }) as PedidoCreado).pago;
    expect(con({ estado: "VERIFICACION", url: URL_RETO })).toEqual({ estado: "VERIFICACION", url: URL_RETO });
    // Sin dirección que se pueda abrir sigue siendo una verificación: la pantalla se la pide al servidor.
    for (const mala of MALAS) expect(con({ estado: "VERIFICACION", url: mala })).toEqual({ estado: "VERIFICACION", url: null });
    // Un estado que no es ese no arrastra ninguna dirección.
    expect(con({ estado: "PAGADO", url: URL_RETO })).toEqual({ estado: "PAGADO" });
    expect(con({ estado: "POR_CONFIRMAR", url: URL_RETO })).toEqual({ estado: "POR_CONFIRMAR" });
  });
  it("`verificacion`: el estado, de una lista cerrada; sin `pago` la respuesta no vale", () => {
    expect(verificacionDe({ pago: { estado: "VERIFICACION", url: URL_RETO } })).toEqual({ estado: "VERIFICACION", url: URL_RETO });
    expect(verificacionDe({ pago: { estado: "VERIFICACION" } })).toEqual({ estado: "VERIFICACION", url: null });
    expect(verificacionDe({ pago: { estado: "VERIFICACION", url: "https://evil.example/x" } })).toEqual({ estado: "VERIFICACION", url: null });
    expect(verificacionDe({ pago: { estado: "PAGADO" } })).toEqual({ estado: "PAGADO" });
    // Lo que no se reconoce nunca es «pagado».
    for (const raro of [{ estado: "APROBADO" }, { estado: "RECHAZADO" }, {}]) expect(verificacionDe({ pago: raro })).toEqual({ estado: "POR_CONFIRMAR" });
    for (const mala of [{}, { pago: null }, { pago: "PAGADO" }, null, "x"]) expect(verificacionDe(mala)).toBeNull();
  });
});

describe("el mensaje de la página del reto", () => {
  const MP = "https://www.mercadopago.com.mx";
  it("VERIFICADO: lo manda www.mercadopago.com.mx y su dato es el TEXTO {\"status\":\"COMPLETE\"}", () => {
    expect(esFinDelReto(MP, '{"status":"COMPLETE"}')).toBe(true);
    expect(esFinDelReto(MP, { status: "COMPLETE" })).toBe(true);
  });
  it("de otro origen no se oye, diga lo que diga", () => {
    for (const origen of ["https://evil.example", "http://www.mercadopago.com.mx", "https://www.mercadopago.com.mx.evil.example", "https://www.mercadopago.com.mx:8443",
                          "https://secure-fields.mercadopago.com", "https://challenges.cloudflare.com", "null", ""]) {
      expect(esFinDelReto(origen, '{"status":"COMPLETE"}'), origen).toBe(false);
    }
  });
  it("otro mensaje de Mercado Pago, o uno que no se puede leer, no es el fin del reto", () => {
    for (const dato of ['{"status":"PENDING"}', "COMPLETE", "{", "", null, undefined, 7, [], { status: "complete" }, { estado: "COMPLETE" }, '"COMPLETE"', "null"]) {
      expect(esFinDelReto(MP, dato), String(dato)).toBe(false);
    }
  });
});

describe("qué hace la pantalla con lo que contesta `verificacion`", () => {
  it("sigue, pagado, por confirmar, rechazado y sin respuesta", () => {
    expect(pasoDelReto(ok({ estado: "VERIFICACION", url: URL_RETO }))).toEqual({ tipo: "sigue", url: URL_RETO });
    expect(pasoDelReto(ok({ estado: "VERIFICACION", url: null }))).toEqual({ tipo: "sigue", url: null });
    expect(pasoDelReto(ok({ estado: "PAGADO" }))).toEqual({ tipo: "pedido" });
    expect(pasoDelReto(ok({ estado: "POR_CONFIRMAR" }))).toEqual({ tipo: "pedido" });
    expect(pasoDelReto(fallo("PAGO_RECHAZADO", "VERIFICACION"))).toEqual({ tipo: "rechazado", detalle: "VERIFICACION" });
    // El pedido ya no existe: solo se borra cuando el cobro no pasó.
    expect(pasoDelReto(fallo("PEDIDO_NO_ENCONTRADO"))).toEqual({ tipo: "rechazado", detalle: "SIN_VERIFICAR" });
    // Nada de esto prueba que no hubo cobro: se sigue preguntando, no se libera el formulario.
    for (const e of ["SIN_CONEXION", "DEMASIADOS_INTENTOS", "SERVICIO_NO_DISPONIBLE", "ERROR_INTERNO", "CANCELADA", "PAGO_NO_DISPONIBLE", "ALGO_NUEVO"]) {
      expect(pasoDelReto(fallo(e)), e).toEqual({ tipo: "sin-respuesta" });
    }
  });
  it("los textos: el banco no confirmó, no se completó y lo canceló el cliente; todos dicen que no se cobró", () => {
    expect(textoDeRechazo("VERIFICACION", false)).toEqual({ campo: null, texto: "Tu banco no confirmó el pago. Intenta de nuevo o usa otra tarjeta. No se te cobró nada." });
    expect(textoDeRechazo("SIN_VERIFICAR", false).texto).toBe("No se completó la verificación con tu banco. Intenta de nuevo o usa otra tarjeta. No se te cobró nada.");
    expect(textoDeRechazo("CANCELADO", true).texto).toBe("Cancelaste la verificación con tu banco. No se te cobró nada; también puedes elegir otra forma de pago.");
    // Ninguno promete tiempos.
    for (const m of ["VERIFICACION", "SIN_VERIFICAR", "CANCELADO"]) expect(textoDeRechazo(m, true).texto).not.toMatch(/minuto|segundo|hora|pronto|enseguida/i);
    // Y como rechazo de `pedir` (un reintento con el reto ya resuelto) salen junto a la tarjeta.
    expect(desenlaceDelError({ error: "PAGO_RECHAZADO", detalle: "VERIFICACION" }, { telefono: null, horario: {} })).toMatchObject({ tipo: "tarjeta", campo: null });
  });
});

describe("`pedir` contesta que el banco quiere verificar", () => {
  const c = { telefono: "4771234567", horario: {} };
  const cotizada = { ok: true as const, datos: JSON.parse(JSON.stringify(cotizacionCruda())) };
  const creado = (pago: PedidoCreado["pago"]): Resultado<PedidoCreado> =>
    ({ ok: true, datos: { codigo: CODIGO, folio_corto: "TAB12C", total_mxn: "305.00", vence_aceptacion: null, pago } });
  it("no es «hecho»: el pedido no está pagado; se abre el reto con su dirección y su código", async () => {
    const r = await enviarPedido({ cotizar: async () => cotizada, pedir: async () => creado({ estado: "VERIFICACION", url: URL_RETO }), totalVisto: cotizada.datos.total_mxn }, c);
    expect(r).toEqual({ desenlace: { tipo: "verificar", codigo: CODIGO, url: URL_RETO }, pidio: true, error: null });
    // No manda a ninguna pantalla: el reto se abre donde se está.
    expect(pasoDelDesenlace(r.desenlace, ["datos", "pago", "tarjeta"])).toBeNull();
  });
});

describe("recargar la página a medio reto", () => {
  const pedido = { negocio: "knockout", pago: "EN_LINEA", propina_pct: 10 };
  const enDuda = () => {
    let n = 0;
    const intento = intentoDeCompra(() => `clave-${++n}`.padEnd(22, "x"), () => null);
    const clave = intento.para(pedido);
    intento.dudar();
    return { intento, clave };
  };
  const existe = async () => ({ ok: true as const, datos: { existe: true as const, codigo: CODIGO } });

  it("el reto sigue vivo: se continúa ese, con la MISMA clave en duda (ni otro pedido ni otro cobro)", async () => {
    const { intento, clave } = enDuda();
    expect(await resolverDuda(intento, existe, async () => ok({ estado: "VERIFICACION", url: URL_RETO }))).toEqual({ tipo: "verificar", codigo: CODIGO, url: URL_RETO });
    expect(intento.enDuda()).toBe(clave);
    // Aunque el cliente cambie algo y reintente, la clave no cambia mientras siga la duda.
    expect(intento.para({ ...pedido, propina_pct: 20 })).toBe(clave);
  });
  it("ese pago ya no pasó (el servidor descartó el pedido): el formulario queda libre y se dice por qué", async () => {
    const { intento, clave } = enDuda();
    expect(await resolverDuda(intento, existe, async () => fallo("PAGO_RECHAZADO", "VERIFICACION"))).toEqual({ tipo: "libre", rechazo: "VERIFICACION" });
    expect(intento.enDuda()).toBeNull();
    expect(intento.para(pedido)).not.toBe(clave);
  });
  it("ya se pagó, o ya no espera el reto: a la página del pedido, como siempre", async () => {
    for (const estado of ["PAGADO", "POR_CONFIRMAR"] as const) {
      const { intento } = enDuda();
      expect(await resolverDuda(intento, existe, async () => ok({ estado }))).toEqual({ tipo: "hecho", codigo: CODIGO });
      expect(intento.enDuda()).toBeNull();
    }
  });
  it("si no se puede preguntar por la verificación, lo de antes: a la página del pedido (nunca «libre»)", async () => {
    const sinRed = enDuda();
    expect(await resolverDuda(sinRed.intento, existe, async () => fallo("SIN_CONEXION"))).toEqual({ tipo: "hecho", codigo: CODIGO });
    const revienta = enDuda();
    expect(await resolverDuda(revienta.intento, existe, async () => { throw new Error("sin red"); })).toEqual({ tipo: "hecho", codigo: CODIGO });
  });
  it("si para esa clave no hay pedido, ni se pregunta por la verificación", async () => {
    const { intento } = enDuda();
    let llamada = false;
    expect(await resolverDuda(intento, async () => ({ ok: true, datos: { existe: false } }), async () => { llamada = true; return ok({ estado: "PAGADO" }); })).toEqual({ tipo: "libre" });
    expect(llamada).toBe(false);
  });
});

describe("vigilar el reto", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  /** Un documento de mentira (para ocultar y mostrar la pestaña) y un servidor que contesta lo que se le deje en la cola. */
  function escena(respuestas: Resultado<Verificacion>[], opciones: { yaMismo?: boolean } = {}) {
    const pedidas: boolean[] = [], pasos: PasoDelReto[] = [];
    let alVolver: (() => void) | null = null;
    const doc = {
      hidden: false,
      addEventListener: (_: string, f: () => void) => { alVolver = f; },
      removeEventListener: () => { alVolver = null; },
    };
    const v = vigilarReto({
      preguntar: async (cancelar) => { pedidas.push(cancelar); return respuestas.shift() ?? ok({ estado: "VERIFICACION", url: null }); },
      alPaso: (p) => pasos.push(p), doc: doc as unknown as Document, ...opciones,
    });
    return { v, pedidas, pasos, doc, volver: () => alVolver?.(), oye: () => alVolver !== null };
  }

  it("pregunta cada 10 s, sin pedir cancelar, hasta que el servidor dice cómo acabó; ahí se detiene", async () => {
    const e = escena([ok({ estado: "VERIFICACION", url: URL_RETO }), ok({ estado: "PAGADO" })]);
    expect(e.pedidas).toEqual([]);   // la primera no es inmediata: `pedir` acaba de contestar
    await vi.advanceTimersByTimeAsync(9_999);
    expect(e.pedidas).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(e.pedidas).toEqual([false]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(e.pasos).toEqual([{ tipo: "sigue", url: URL_RETO, conPrisa: false }, { tipo: "pedido" }]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(e.pedidas).toEqual([false, false]);
    expect(e.oye()).toBe(false);
  });
  it("sin la dirección (se llegó recargando) pregunta ya, y seguido hasta tenerla", async () => {
    const e = escena([ok({ estado: "VERIFICACION", url: null })], { yaMismo: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(e.pedidas).toEqual([false]);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(e.pedidas).toEqual([false, false]);
    e.v.detener();
  });
  it("el aviso de que el reto terminó: pregunta en el acto y las siguientes vueltas van cada 3 s", async () => {
    const e = escena([ok({ estado: "VERIFICACION", url: null }), ok({ estado: "VERIFICACION", url: null }), fallo("PAGO_RECHAZADO", "VERIFICACION")]);
    e.v.ahora();
    await vi.advanceTimersByTimeAsync(0);
    expect(e.pedidas).toEqual([false]);
    await vi.advanceTimersByTimeAsync(3_000);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(e.pasos.at(-1)).toEqual({ tipo: "rechazado", detalle: "VERIFICACION" });
    expect(e.pedidas).toHaveLength(3);
  });
  it("cada «sigue» dice si todavía se pregunta con prisa: al acabarse las vueltas seguidas, ya no", async () => {
    const e = escena([]);
    e.v.ahora();
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 4; i++) await vi.advanceTimersByTimeAsync(3_000);
    // Cinco vueltas seguidas: las cuatro primeras con prisa; la quinta ya no (es la que decide si el aviso llegó antes de tiempo).
    expect(e.pasos.map((p) => p.tipo === "sigue" && p.conPrisa)).toEqual([true, true, true, true, false]);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(e.pasos).toHaveLength(5);   // la siguiente ya va a los 10 s
    e.v.detener();
  });
  it("cancelar: desde ahí TODAS las preguntas piden cancelar, hasta que el servidor confirma; sin respuesta no se da nada por cancelado", async () => {
    const e = escena([fallo("SIN_CONEXION"), ok({ estado: "VERIFICACION", url: null }), fallo("PAGO_RECHAZADO", "SIN_VERIFICAR")]);
    e.v.cancelar();
    await vi.advanceTimersByTimeAsync(0);
    expect(e.pedidas).toEqual([true]);
    expect(e.pasos).toEqual([{ tipo: "sin-respuesta" }]);
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(e.pedidas).toEqual([true, true, true]);
    expect(e.pasos.at(-1)).toEqual({ tipo: "rechazado", detalle: "SIN_VERIFICAR" });
  });
  it("una sola pregunta a la vez: lo que se pide con una en vuelo se hace al terminar esa", async () => {
    let soltar: (r: Resultado<Verificacion>) => void = () => {};
    const pedidas: boolean[] = [];
    const v = vigilarReto({
      preguntar: (cancelar) => { pedidas.push(cancelar); return new Promise((res) => { soltar = res; }); },
      alPaso: () => {}, doc: { hidden: false, addEventListener: () => {}, removeEventListener: () => {} } as unknown as Document,
    });
    v.ahora(); v.ahora(); v.cancelar();
    await vi.advanceTimersByTimeAsync(0);
    expect(pedidas).toEqual([false]);
    soltar(ok({ estado: "VERIFICACION", url: null }));
    await vi.advanceTimersByTimeAsync(0);
    expect(pedidas).toEqual([false, true]);
    v.detener();
  });
  it("al volver a la pestaña (el cliente salió a la aplicación de su banco) pregunta sin esperar su turno", async () => {
    const e = escena([ok({ estado: "PAGADO" })]);
    e.doc.hidden = true; e.volver();
    await vi.advanceTimersByTimeAsync(0);
    expect(e.pedidas).toEqual([]);
    e.doc.hidden = false; e.volver();
    await vi.advanceTimersByTimeAsync(0);
    expect(e.pasos).toEqual([{ tipo: "pedido" }]);
  });
  it("detenido no pregunta ni avisa, aunque llegue una respuesta tardía", async () => {
    const e = escena([ok({ estado: "PAGADO" })]);
    e.v.ahora();
    e.v.detener();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(e.pasos).toEqual([]);
    expect(e.oye()).toBe(false);
  });
});

describe("el intento en duda es de UN negocio (todas las tiendas viven en el mismo dominio)", () => {
  /** Un teléfono de mentira, compartido por las dos tiendas. */
  function telefono(): Almacen & { claves(): string[] } {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); }, claves: () => [...m.keys()] };
  }
  const pedido = { negocio: "knockout", pago: "EN_LINEA", propina_pct: 10 };
  const de = (a: Almacen, negocio: string, prefijo: string) => {
    let n = 0;
    return intentoDeCompra(() => `${prefijo}-${++n}`.padEnd(22, "x"), () => a, Date.now, negocio);
  };

  it("se guarda con el nombre del negocio; el de otro restaurante ni se ve", () => {
    const a = telefono();
    const ko = de(a, "knockout", "ko"), otro = de(a, "tacos-don-beto", "td");
    const clave = ko.para(pedido);
    ko.dudar();
    expect(a.claves()).toEqual([dondeDelIntento("knockout")]);
    expect(dondeDelIntento("knockout")).toBe(`${CLAVE_DEL_INTENTO}.knockout`);
    expect(otro.enDuda()).toBeNull();
    // El otro restaurante tiene su propio intento, con su propia clave.
    expect(otro.para({ ...pedido, negocio: "tacos-don-beto" })).not.toBe(clave);
    expect(ko.enDuda()).toBe(clave);
  });
  it("desde otro restaurante NO se consulta ni se suelta la duda del primero (era el camino a pagar dos veces)", async () => {
    const a = telefono();
    const ko = de(a, "knockout", "ko");
    const clave = ko.para(pedido);
    ko.dudar();
    // «Tus datos» se abre en otra tienda: resuelve SU duda (ninguna). El servidor ni se entera.
    const otro = de(a, "tacos-don-beto", "td");
    let preguntas = 0;
    expect(await resolverDuda(otro, async () => { preguntas++; return { ok: true, datos: { existe: false } }; })).toEqual({ tipo: "libre" });
    expect(preguntas).toBe(0);
    // Aunque en la otra tienda se pida, se dude y se aclare, o entre un pedido.
    otro.para({ negocio: "tacos-don-beto" }); otro.dudar(); otro.aclarar();
    otro.para({ negocio: "tacos-don-beto" }); otro.cerrar();
    // De vuelta en la primera (página recargada: se lee del teléfono): la duda sigue, con la MISMA clave.
    const deVuelta = de(a, "knockout", "nueva");
    expect(deVuelta.enDuda()).toBe(clave);
    expect(deVuelta.para({ ...pedido, propina_pct: 20 })).toBe(clave);
  });
  it("el cambio de nombre no suelta una duda en vuelo: lo guardado con la clave de antes se pasa a la de este negocio y la vieja se borra", () => {
    const a = telefono();
    const vieja = "v".repeat(22);
    a.setItem(CLAVE_DEL_INTENTO, JSON.stringify({ de: "x", clave: vieja, cuando: Date.now(), duda: true }));
    const ko = de(a, "knockout", "ko");
    // Quien recarga con la tienda nueva sigue en duda, con la MISMA clave: no puede pagar otra vez.
    expect(ko.enDuda()).toBe(vieja);
    expect(ko.para(pedido)).toBe(vieja);
    expect(a.claves()).toEqual([dondeDelIntento("knockout")]);
    expect(JSON.parse(a.getItem(dondeDelIntento("knockout"))!)).toMatchObject({ clave: vieja, duda: true });
    // Otra recarga (ya sin la clave vieja) la sigue viendo; y otra tienda, no.
    expect(de(a, "knockout", "otra").enDuda()).toBe(vieja);
    expect(de(a, "tacos-don-beto", "td").enDuda()).toBeNull();
  });
  it("si este negocio ya tiene su intento, el de la clave de antes no lo pisa (y se borra); basura en la clave vieja no es una duda", () => {
    const a = telefono();
    const ko = de(a, "knockout", "ko");
    const clave = ko.para(pedido);
    ko.dudar();
    a.setItem(CLAVE_DEL_INTENTO, JSON.stringify({ de: "x", clave: "v".repeat(22), cuando: Date.now(), duda: true }));
    expect(de(a, "knockout", "nueva").enDuda()).toBe(clave);
    expect(a.claves()).toEqual([dondeDelIntento("knockout")]);
    const b = telefono();
    b.setItem(CLAVE_DEL_INTENTO, "{ni json");
    expect(de(b, "knockout", "ko").enDuda()).toBeNull();
    expect(b.claves()).toEqual([]);
  });
  it("si el teléfono no deja guardar la copia, la clave vieja NO se borra (la duda no se pierde por el camino)", () => {
    const m = new Map<string, string>([[CLAVE_DEL_INTENTO, JSON.stringify({ de: "x", clave: "v".repeat(22), cuando: Date.now(), duda: true })]]);
    const soloLectura: Almacen = { getItem: (k) => m.get(k) ?? null, setItem: () => { throw new Error("cuota"); }, removeItem: (k) => { m.delete(k); } };
    expect(de(soloLectura, "knockout", "ko").enDuda()).toBe("v".repeat(22));
    expect(m.has(CLAVE_DEL_INTENTO)).toBe(true);
  });
  it("en la página hay uno por negocio, siempre el mismo", () => {
    expect(intentoDelNegocio("knockout")).toBe(intentoDelNegocio("knockout"));
    expect(intentoDelNegocio("knockout")).not.toBe(intentoDelNegocio("tacos-don-beto"));
  });
});

describe("la página del pedido cuyo reto se dejó", () => {
  const enLinea = (estado: "SIN_PAGO" | "DEVOLUCION_EN_PROCESO" | "DEVUELTO") => ({ estado, propina_mxn: "0.00", total_a_pagar_mxn: "240.00", dePrueba: false });
  it("dice que no se completó la verificación y que no se cobró (hoy es verdad); no es una alerta del restaurante", () => {
    expect(textoDeSeguimiento({ estado: "CANCELADO", motivo: "SIN_VERIFICAR", enLinea: enLinea("SIN_PAGO") })).toEqual({
      titulo: "No se completó el pago", alerta: false,
      apoyo: "No se completó la verificación con tu banco. Tu pedido no se envió al restaurante y no se te cobró nada.",
    });
    // El de siempre (venció sin pagarse) no cambia.
    expect(textoDeSeguimiento({ estado: "CANCELADO", motivo: "SIN_PAGO", enLinea: enLinea("SIN_PAGO") }).apoyo).toBe("Tu pedido no se envió al restaurante y no se te cobró nada.");
  });
  it("si el reto se contesta tarde y el pago se devuelve: lo dice con los textos de devolución, sin «no se te cobró» y sin culpar al restaurante", () => {
    for (const motivo of ["SIN_PAGO", "SIN_VERIFICAR"]) {
      const enProceso = textoDeSeguimiento({ estado: "CANCELADO", motivo, enLinea: enLinea("DEVOLUCION_EN_PROCESO") });
      expect(enProceso.apoyo).toMatch(/Estamos devolviendo tu pago completo\./);
      expect(enProceso.apoyo).not.toMatch(/No se te cobró|El restaurante no pudo/);
      expect(enProceso.alerta).toBe(false);
      expect(textoDeSeguimiento({ estado: "CANCELADO", motivo, enLinea: enLinea("DEVUELTO") }).apoyo).toMatch(/Te devolvimos tu pago completo\./);
    }
    // Un pedido que canceló el restaurante sigue diciendo lo suyo, en rojo.
    const agotado = textoDeSeguimiento({ estado: "CANCELADO", motivo: "AGOTADO", enLinea: enLinea("DEVOLUCION_EN_PROCESO") });
    expect(agotado.apoyo).toMatch(/^Se agotó algo de tu pedido\./);
    expect(agotado.alerta).toBe(true);
  });
});

describe("el reto a la vista: cuándo se quita el marco, cuándo vuelve y cuándo se ofrece «Cancelar»", () => {
  const URL2 = URL_RETO.replace("9a8b7c6d", "0b0b0b0b");
  const vivo: Reto = { codigo: CODIGO, url: URL_RETO, esperando: false, cancelado: false };
  it("«Cancelar» solo con el marco a la vista: tras el aviso de que el reto terminó NO se ofrece (el pago puede estar aprobándose)", () => {
    expect(seOfreceCancelar(vivo)).toBe(true);
    expect(seOfreceCancelar({ ...vivo, url: null })).toBe(true);
    expect(seOfreceCancelar({ ...vivo, esperando: true })).toBe(false);
    expect(seOfreceCancelar({ ...vivo, esperando: true, cancelado: true })).toBe(false);
  });
  it("el servidor dice «sigue» con el marco a la vista: nada cambia (recargar el marco reiniciaría el reto); si faltaba la dirección, llega", () => {
    expect(retoQueSigue(vivo, { url: URL2, conPrisa: false })).toBe(vivo);
    expect(retoQueSigue(vivo, { url: null })).toBe(vivo);
    expect(retoQueSigue({ ...vivo, url: null }, { url: URL2, conPrisa: true })).toEqual({ ...vivo, url: URL2 });
  });
  it("aviso de «terminó» antes de tiempo: mientras se pregunta seguido se espera; si al acabar el servidor sigue diciendo que no, el marco VUELVE (y con él «Cancelar»)", () => {
    const trasElAviso: Reto = { ...vivo, esperando: true };
    expect(retoQueSigue(trasElAviso, { url: URL2, conPrisa: true })).toBe(trasElAviso);
    const deVuelta = retoQueSigue(trasElAviso, { url: URL2, conPrisa: false });
    expect(deVuelta).toEqual({ ...vivo, url: URL2 });
    expect(seOfreceCancelar(deVuelta)).toBe(true);
    // Sin dirección en esa respuesta, la que ya se tenía.
    expect(retoQueSigue(trasElAviso, { url: null, conPrisa: false })).toEqual(vivo);
  });
  it("si lo dejó el cliente, el marco no vuelve aunque el servidor aún no lo confirme", () => {
    const dejado: Reto = { ...vivo, esperando: true, cancelado: true };
    expect(retoQueSigue(dejado, { url: URL2, conPrisa: false })).toBe(dejado);
  });
});
