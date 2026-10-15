// «Enviar»: qué hace la pantalla con cada respuesta. Antes de pedir se cotiza OTRA vez (no vale la
// cotización de hace minutos) y ese total viaja como `total_esperado`. El pedido nunca se reintenta
// solo, pero reintentarlo a mano es seguro (entrega 7): cada intento de compra lleva una `clave` y,
// si el pedido ya había entrado, el servidor devuelve ese mismo en vez de crear otro.
import type { Resultado } from "./api";
import type { Campo } from "./cliente";
import type { Cotizacion, ErrorDeTienda, PedidoCreado, Verificacion } from "./contrato";
import type { Horario } from "@vim/fecha";
import type { Momento } from "./horario";
import { almacenDelNavegador, type Almacen } from "./carrito";
import { textoDeRechazo, type CampoDeTarjeta } from "./tarjeta";
import { textoCerrada, textoDeError } from "./textos";
import { pasoDelReto } from "./verificacion";

export type Desenlace =
  /** El pedido existe (también si vino sin folio ni total): vaciar el carrito e ir al seguimiento. */
  | { tipo: "hecho"; codigo: string }
  /**
   * El banco quiere confirmar el pago con el cliente (3D Secure) antes de cobrar. El pedido existe,
   * pero NO está pagado ni rechazado: la pantalla de la tarjeta abre el reto (`url`, o lo que diga el
   * servidor si no vino) y el intento sigue en duda hasta saber cómo acabó.
   */
  | { tipo: "verificar"; codigo: string; url: string | null }
  /**
   * La tarjeta: un dato que no cuadra o el banco no aprobó el cobro. No se creó ningún pedido y no
   * se cobró nada: se dice junto a la tarjeta (en su campo, si el motivo es de uno) y se puede
   * reintentar con la misma o con otra.
   */
  | { tipo: "tarjeta"; campo: CampoDeTarjeta | null; texto: string }
  /**
   * El pago en línea quedó en PAUSA para este cliente: el antifraude de Mercado Pago rechazó el cobro
   * por riesgo (`rechazado`: acaba de pasar) o ya estaba en pausa y lo intentó otra vez. No se cobró
   * nada. NO se ofrece repetir el cobro: otra forma de pago si la hay, o más tarde. `hasta`: hasta
   * cuándo (ISO), si el servidor lo dijo.
   */
  | { tipo: "pausa"; hasta: string | null; rechazado: boolean }
  /** Un renglón ya no se puede pedir: de vuelta al carrito, que lo marca. */
  | { tipo: "carrito"; error: ErrorDeTienda }
  /** El total ya no es el que vio: se enseña el nuevo y se pide confirmar antes de enviar con él. */
  | { tipo: "total"; total: string }
  /** El error es de un campo (o de la forma de pago): se marca ahí y se le da el foco. */
  | { tipo: "campo"; campo: Campo | "pago" | "ubicacion"; texto: string }
  | {
    tipo: "aviso"; tono: "danger" | "warning"; texto: string;
    /**
     * Qué se ofrece después:
     *  · `reintentar`  — el botón de enviar sigue ahí;
     *  · `volver`      — se arregla en el carrito (zona, modo, productos);
     *  · `llamar`      — por aquí no se va a poder: llamar al restaurante;
     *  · `reintentar-seguro` — el pedido PUDO haber entrado: «Reintentar» (misma clave: no se duplica)
     *                    y, en secundario, llamar al restaurante;
     *  · `sesion`      — la sesión de su cuenta terminó (el servidor ya borró la cookie): entrar otra
     *                    vez, o enviar el pedido como invitado. No se creó nada.
     */
    sigue: "reintentar" | "volver" | "llamar" | "reintentar-seguro" | "sesion";
  };

export type ContextoDeEnvio = {
  telefono: string | null; horario: Horario; ahora?: Momento;
  /** Hay otra forma de pago además de la elegida: si el pago en línea no pasa, se ofrece. */
  otrasFormas?: boolean;
};

const DE_RENGLON = new Set(["PRODUCTO_NO_DISPONIBLE", "MODIFICADORES_INVALIDOS", "COMBO_INVALIDO"]);
const DE_CAMPO: Record<string, Campo | "pago" | "ubicacion"> = {
  CLIENTE_INVALIDO: "nombre", DIRECCION_INVALIDA: "calle", PAGO_INVALIDO: "pago",
  // Envío por distancia (0185): se corrige en el mapa de «¿Quién recibe?».
  UBICACION_INVALIDA: "ubicacion", FUERA_DE_AREA: "ubicacion",
};
const DEL_CARRITO = new Set(["ZONA_INVALIDA", "MODO_INVALIDO", "CARRITO_INVALIDO", "PRECIO_INVALIDO", "SUCURSAL_INVALIDA", "SUCURSAL_DE_OTRO_NEGOCIO", "CUERPO_DEMASIADO_GRANDE"]);
const SOLO_LLAMAR = new Set(["NO_SE_PUDO_CREAR", "TIENDA_NO_DISPONIBLE"]);

/** De un rechazo (de cotizar o de pedir) a lo que hace la pantalla. */
export function desenlaceDelError(e: ErrorDeTienda, c: ContextoDeEnvio): Desenlace {
  if (DE_RENGLON.has(e.error) && e.detalle) return { tipo: "carrito", error: e };
  if (e.error === "TOTAL_CAMBIO" && e.detalle && /^\d+\.\d{2}$/.test(e.detalle)) return { tipo: "total", total: e.detalle };
  // El antifraude (no el banco): el pago en línea queda en pausa. No es un rechazo que se corrija y se reintente.
  if (e.error === "PAGO_EN_PAUSA" || (e.error === "PAGO_RECHAZADO" && e.detalle === "RIESGO")) {
    return { tipo: "pausa", hasta: e.hasta ?? null, rechazado: e.error === "PAGO_RECHAZADO" };
  }
  if (e.error === "PAGO_RECHAZADO") return { tipo: "tarjeta", ...textoDeRechazo(e.detalle, c.otrasFormas === true) };
  // No fue el banco: Mercado Pago no pudo procesar ese cobro (y no se cobró). Junto a la tarjeta, sin culpar a nadie.
  if (e.error === "PAGO_NO_PROCESADO") {
    const t = textoDeError("PAGO_NO_PROCESADO");
    return { tipo: "tarjeta", campo: null, texto: `${t.texto} ${t.hacer}` };
  }
  const t = textoDeError(e.error, { telefono: c.telefono, detalle: e.detalle, otrasFormas: c.otrasFormas });
  const texto = `${t.texto} ${t.hacer}`;
  // El restaurante no puede cobrar en línea ahora y hay otra forma de pagar: se dice junto a «¿Cómo pagas?».
  const campo = DE_CAMPO[e.error] ?? (e.error === "PAGO_NO_DISPONIBLE" && c.otrasFormas ? "pago" : undefined);
  if (campo) return { tipo: "campo", campo, texto };
  if (e.error === "TIENDA_CERRADA") return { tipo: "aviso", tono: "warning", texto: textoCerrada(e.detalle ?? "", c.horario, c.ahora), sigue: "reintentar" };
  // No se degrada a invitado en silencio: el pedido no quedaría en su cuenta, y eso lo decide él.
  if (e.error === "SESION_INVALIDA") return { tipo: "aviso", tono: "warning", texto: "Tu sesión terminó. Entra otra vez o envía tu pedido como invitado.", sigue: "sesion" };
  if (e.error === "SIN_CONFIRMAR") return { tipo: "aviso", tono: "warning", texto, sigue: "reintentar-seguro" };
  return {
    tipo: "aviso", tono: "danger", texto,
    sigue: SOLO_LLAMAR.has(e.error) ? "llamar" : DEL_CARRITO.has(e.error) || DE_RENGLON.has(e.error) ? "volver" : "reintentar",
  };
}

/**
 * Un intento de envío, de principio a fin: cotiza y, solo si el total es el que el cliente vio
 * (`totalVisto`), pide con ese total. `pidio` dice si se llegó a llamar a `pedir`: el token del
 * antirobot ya se gastó y hay que pedir otro antes del siguiente intento.
 */
export async function enviarPedido(d: {
  cotizar: () => Promise<Resultado<Cotizacion>>;
  pedir: (totalEsperado: string) => Promise<Resultado<PedidoCreado>>;
  /** El total del botón que tocó (o el que confirmó tras un cambio). null = no vio ninguno. */
  totalVisto: string | null;
}, c: ContextoDeEnvio): Promise<ResultadoDeEnvio> {
  // Nunca lanza: quien espera el resultado siempre recibe qué decirle al cliente. `cotizar` y `pedir`
  // tampoco deberían lanzar; si un día lo hacen, antes de pedir no se creó nada y, pidiendo, no se
  // sabe: se trata como «no supimos si entró».
  let pidio = false;
  try {
    const cot = await d.cotizar();
    if (!cot.ok) return { desenlace: desenlaceDelError(cot, c), pidio, error: null };
    if (cot.datos.total_mxn !== d.totalVisto) return { desenlace: { tipo: "total", total: cot.datos.total_mxn }, pidio, error: null };
    pidio = true;
    const r = await d.pedir(cot.datos.total_mxn);
    if (!r.ok) return { desenlace: desenlaceDelError(r, c), pidio, error: r.error };
    // El banco pide confirmar: todavía no hay cobro ni pedido para el restaurante. No es «hecho».
    if (r.datos.pago?.estado === "VERIFICACION") return { desenlace: { tipo: "verificar", codigo: r.datos.codigo, url: r.datos.pago.url }, pidio, error: null };
    // Pagado, o «no se supo si el cobro pasó»: en los dos casos el pedido existe y su página dice cómo va.
    return { desenlace: { tipo: "hecho", codigo: r.datos.codigo }, pidio, error: null };
  } catch {
    const error = pidio ? "SIN_CONFIRMAR" : "ERROR_INTERNO";
    return { desenlace: desenlaceDelError({ error, detalle: null }, c), pidio, error: pidio ? error : null };
  }
}

/** `error`: el código con que contestó `pedir`, si se llegó a pedir y no entró (para saber si prueba que no hubo cobro). */
export type ResultadoDeEnvio = { desenlace: Desenlace; pidio: boolean; error: string | null };

/**
 * El candado del envío. Vive FUERA de la pantalla (uno por página): un candado dentro del componente
 * se perdía si «Tus datos» se desmontaba a medio envío, y al volver a entrar se podía mandar el
 * mismo pedido otra vez con el primero todavía en vuelo.
 *  · `lanzar` es síncrono: el segundo toque (o la segunda pantalla) recibe `false` y no envía. El
 *    estado de React llega un render tarde para esto.
 *  · El resultado se entrega a la pantalla que esté viva (`recibir`); si no hay ninguna, se guarda
 *    para la siguiente. Un «no pudimos confirmar tu pedido» nunca se queda sin decir.
 *  · Se libera siempre, también si el envío o la pantalla lanzan, y DESPUÉS de entregar el resultado:
 *    no hay un instante con el botón vivo y el aviso sin pintar.
 * ponytail: un resultado guardado no sabe de qué negocio era; si un día se pudiera cambiar de
 * negocio sin recargar con un envío en vuelo, etiquetarlo.
 */
export function candadoDeEnvio<R>() {
  let enVuelo = false, guardado: { r: R } | null = null, pantalla: ((r: R) => void) | null = null;
  const atentos = new Set<() => void>();
  const cambiar = (v: boolean) => { enVuelo = v; for (const a of atentos) a(); };
  return {
    ocupado: (): boolean => enVuelo,
    /** Avisa cada vez que se ocupa o se libera. Devuelve cómo dejar de mirar. */
    suscribir(atento: () => void): () => void {
      atentos.add(atento);
      return () => { atentos.delete(atento); };
    },
    /** Arranca el envío si no hay otro en vuelo. `false` = ya había uno: este no se manda. */
    lanzar(envio: () => Promise<R>): boolean {
      if (enVuelo) return false;
      cambiar(true);
      void (async () => {
        try {
          const r = await envio();
          if (pantalla) pantalla(r);
          else guardado = { r };
        } catch (e) {
          console.error("[tienda] el envío terminó sin resultado", e);
        } finally {
          cambiar(false);
        }
      })();
      return true;
    },
    /** La pantalla viva se apunta: recibe lo que quedó guardado y lo que venga. Devuelve cómo darse de baja. */
    recibir(p: (r: R) => void): () => void {
      pantalla = p;
      if (guardado) { const { r } = guardado; guardado = null; p(r); }
      return () => { if (pantalla === p) pantalla = null; };
    },
  };
}

/** El de la página: lo comparten «Tus datos» (que envía) y la tienda (que no deja salir mientras). */
export const envioDeLaPagina = candadoDeEnvio<ResultadoDeEnvio>();

/** Una clave de intento: 16 bytes al azar en base64url, 22 caracteres (la forma de `FORMA_CODIGO`). */
export function claveNueva(): string {
  const b = new Uint8Array(16);
  // ponytail: sin `crypto` (ningún navegador vigente) vale `Math.random`: la clave solo evita el
  // duplicado; el código de seguimiento lo deriva el servidor con su secreto.
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(b);
  else for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").slice(0, 22);
}

/**
 * Dónde se guarda el intento en el teléfono, junto al carrito: UNO POR NEGOCIO (`dondeDelIntento`).
 * Todas las tiendas viven en el mismo dominio; con una sola clave para todas, abrir «Tus datos» en
 * otro restaurante preguntaba por un intento en duda que no era suyo, el servidor contestaba «no
 * existe» y la duda del primero se soltaba: se podía pagar dos veces allá.
 */
export const CLAVE_DEL_INTENTO = "vim.tienda.intento";
export const dondeDelIntento = (negocio: string): string => (negocio ? `${CLAVE_DEL_INTENTO}.${negocio}` : CLAVE_DEL_INTENTO);
/** Un intento de más de 15 minutos ya no se reutiliza: su pedido, si esperaba pago, ya venció. */
const VIDA_DEL_INTENTO_MS = 15 * 60_000;

/**
 * La huella de un texto (cyrb53, 53 bits): lo que se guarda del pedido para reconocerlo después. No
 * es el pedido ni se puede leer de vuelta: en el teléfono no queda ni el nombre, ni el teléfono, ni
 * la dirección, ni la nota. Dos pedidos distintos con la misma huella es, para esto, imposible.
 */
function huellaDe(texto: string): string {
  let a = 0xdeadbeef, b = 0x41c6ce57;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    a = Math.imul(a ^ c, 2654435761);
    b = Math.imul(b ^ c, 1597334677);
  }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return (4294967296 * (2097151 & b) + (a >>> 0)).toString(36);
}

/**
 * La clave del intento de compra: la MISMA mientras se reintente el mismo pedido sin saber si entró
 * (así el servidor devuelve el que ya existe en vez de crear otro), y una nueva en cuanto el pedido
 * es otro —cambió el carrito, el modo o la zona, los datos de entrega, el pago, la propina o la nota— o el
 * anterior ya entró (`cerrar`). «El mismo pedido» se decide por contenido: lo que se manda en
 * `pedir`, sin el antirobot ni el total esperado, que cambian en cada intento.
 *
 * EN DUDA (pago en línea). Desde que se manda un `pedir` que cobra (`dudar`) y hasta que el servidor
 * diga qué pasó con él, la clave NO cambia por nada: ni porque el cliente toque la propina, la nota o
 * el teléfono, ni porque pasen 15 minutos. Otra clave sería otro pedido y OTRO COBRO. La duda se
 * quita solo de dos formas: el pedido entró (`cerrar`), o el servidor confirmó que para esa clave
 * no hay pedido ni cobro (`aclarar`). Ver `resolverDuda`.
 *
 * ES DE UN NEGOCIO (`negocio`, su slug): se guarda con su nombre, y el intento en duda de otro
 * restaurante ni se lee, ni se consulta, ni se suelta desde este.
 *
 * Se guarda en el teléfono, donde vive el carrito: recargar la página y volver a enviar NO crea otro
 * pedido, y la duda sobrevive a la recarga. Se guarda la clave y la HUELLA del pedido, nunca el pedido. Con el almacén
 * bloqueado (modo privado) vive en memoria, como antes. Sin duda, caduca a los 15 minutos.
 */
export function intentoDeCompra(nueva: () => string = claveNueva, almacen: () => Almacen | null = almacenDelNavegador, ahora: () => number = Date.now, negocio = "") {
  type Intento = { de: string; clave: string; cuando: number; duda: boolean };
  const donde = dondeDelIntento(negocio);
  /** undefined = todavía no se ha mirado el teléfono (se mira al primer uso: al importar no hay navegador). */
  let actual: Intento | null | undefined;
  /** Lo guardado es texto de fuera: solo vale con su forma exacta. */
  const deTexto = (crudo: string | null | undefined): Intento | null => {
    try {
      const x: unknown = JSON.parse(crudo ?? "null");
      const o = typeof x === "object" && x !== null ? (x as Record<string, unknown>) : {};
      return typeof o.de === "string" && typeof o.clave === "string" && /^[A-Za-z0-9_-]{22}$/.test(o.clave) && typeof o.cuando === "number"
        ? { de: o.de, clave: o.clave, cuando: o.cuando, duda: o.duda === true } : null;
    } catch {
      return null;
    }
  };
  const leer = (): Intento | null => {
    if (actual !== undefined) return actual;
    try { actual = deTexto(almacen()?.getItem(donde)); } catch { actual = null; }
    // EL CAMBIO DE NOMBRE (oct 2026). Antes había una sola clave para todo el dominio, sin negocio.
    // Quien tenga ahí un intento —quizá EN DUDA, con un cobro en vuelo— no puede perderlo al
    // actualizarse la tienda: recargar y pagar otra vez sería un segundo cobro. De quién era no se
    // puede saber (no lo guardaba), así que la primera tienda que lo lee lo toma como suyo: lo pasa
    // a su clave y borra el viejo. Si no era de aquí, el servidor dirá que no existe y se suelta.
    if (negocio) {
      try {
        const viejo = deTexto(almacen()?.getItem(CLAVE_DEL_INTENTO));
        const adoptado = viejo !== null && !actual;
        if (adoptado) { actual = viejo; guardar(); }
        // El viejo se borra solo si su copia quedó guardada (o si no se adoptó): nunca se pierde por el camino.
        if (!adoptado || almacen()?.getItem(donde) != null) almacen()?.removeItem(CLAVE_DEL_INTENTO);
      } catch { /* almacén bloqueado: se queda como estaba */ }
    }
    return actual;
  };
  const guardar = (): void => {
    try {
      if (actual) almacen()?.setItem(donde, JSON.stringify(actual));
      else almacen()?.removeItem(donde);
    } catch { /* cuota llena o modo privado: se queda en memoria */ }
  };
  return {
    para(pedido: unknown): string {
      const previo = leer(), de = huellaDe(JSON.stringify(pedido)), t = ahora();
      // En duda, la misma clave pase lo que pase (ver arriba).
      if (previo?.duda) return previo.clave;
      if (previo && previo.de === de && t - previo.cuando >= 0 && t - previo.cuando <= VIDA_DEL_INTENTO_MS) return previo.clave;
      actual = { de, clave: nueva(), cuando: t, duda: false };
      guardar();
      return actual.clave;
    },
    /** Se va a mandar un `pedir` que cobra: hasta saber qué pasó con él, la clave no cambia. Se guarda ANTES de mandar. */
    dudar(): void {
      const previo = leer();
      if (previo && !previo.duda) { actual = { ...previo, duda: true }; guardar(); }
    },
    /** La clave de un intento de pago del que todavía no se sabe el resultado, o null. */
    enDuda(): string | null {
      const previo = leer();
      return previo?.duda ? previo.clave : null;
    },
    /** El servidor confirmó que para esa clave no hay pedido ni cobro: el siguiente intento es libre. */
    aclarar(): void { actual = null; guardar(); },
    /** El pedido entró (o su pago quedó aprobado): el siguiente, aunque sea idéntico, es otro. */
    cerrar(): void { actual = null; guardar(); },
  };
}

const delNegocio = new Map<string, ReturnType<typeof intentoDeCompra>>();
/** El de ESTE negocio en esta página (uno por slug: recuerda en memoria si el teléfono no deja guardar). */
export function intentoDelNegocio(negocio: string): ReturnType<typeof intentoDeCompra> {
  let i = delNegocio.get(negocio);
  if (!i) delNegocio.set(negocio, (i = intentoDeCompra(claveNueva, almacenDelNavegador, Date.now, negocio)));
  return i;
}

/**
 * Los rechazos de `pedir` que, por sí solos, prueban que para esa clave NO quedó pedido ni cobro: el
 * servidor los contesta después de intentar el cobro y de descartar el pedido. Cualquier otro error
 * (sin respuesta, el antirobot, un tope, un fallo del servidor) pudo salir ANTES de mirar si un
 * intento anterior con esa clave ya había entrado: no prueba nada, y hay que preguntar.
 */
const SIN_PEDIDO_NI_COBRO = new Set(["PAGO_RECHAZADO", "PAGO_NO_PROCESADO", "PAGO_NO_DISPONIBLE"]);
export const pruebaQueNoHuboCobro = (error: string): boolean => SIN_PEDIDO_NI_COBRO.has(error);

export type Duda =
  /**
   * No había duda, o el servidor confirmó que no hay pedido ni cobro: se puede intentar de nuevo.
   * `rechazo`: el pedido existía esperando el reto del banco y el pago no pasó; la familia del motivo
   * (y, si fue por riesgo, `hasta` cuándo queda en pausa el pago en línea).
   */
  | { tipo: "libre"; rechazo?: string | null; hasta?: string | null }
  /** El pedido sí había entrado: a su página, que dice cómo va el pago. */
  | { tipo: "hecho"; codigo: string }
  /** El pedido existe y su pago sigue esperando el reto del banco: se continúa ese reto (la duda sigue). */
  | { tipo: "verificar"; codigo: string; url: string | null }
  /** No se pudo preguntar: sigue sin saberse. El formulario sigue bloqueado. */
  | { tipo: "duda" };

/**
 * Resuelve un intento de pago en duda preguntándole al servidor por su clave (`intento`, que no crea
 * ni cobra nada). Solo libera el formulario con un «no existe» del servidor; si no contesta, la duda sigue.
 * Si el pedido existe y se puede preguntar por su verificación (`verificar`): con el reto del banco
 * todavía vivo se continúa ese reto, en vez de mandar al cliente a esperar en la página del pedido; y
 * si ese pago ya no pasó (el servidor descartó el pedido), el formulario queda libre.
 */
export async function resolverDuda(
  intento: Pick<ReturnType<typeof intentoDeCompra>, "enDuda" | "aclarar" | "cerrar">,
  preguntar: (clave: string) => Promise<{ ok: true; datos: { existe: false } | { existe: true; codigo: string } } | { ok: false }>,
  verificar?: (codigo: string) => Promise<Resultado<Verificacion>>,
): Promise<Duda> {
  const clave = intento.enDuda();
  if (!clave) return { tipo: "libre" };
  let r: Awaited<ReturnType<typeof preguntar>>;
  try { r = await preguntar(clave); } catch { return { tipo: "duda" }; }
  if (!r.ok) return { tipo: "duda" };
  if (r.datos.existe) {
    const { codigo } = r.datos;
    let paso: ReturnType<typeof pasoDelReto> = { tipo: "pedido" };
    // Si no se puede preguntar, lo de siempre: a la página del pedido, que dice cómo va.
    if (verificar) { try { paso = pasoDelReto(await verificar(codigo)); } catch { /* como si no hubiera contestado */ } }
    if (paso.tipo === "sigue") return { tipo: "verificar", codigo, url: paso.url };
    if (paso.tipo === "rechazado") { intento.aclarar(); return { tipo: "libre", rechazo: paso.detalle, ...(paso.hasta && { hasta: paso.hasta }) }; }
    intento.cerrar();
    return { tipo: "hecho", codigo };
  }
  intento.aclarar();
  return { tipo: "libre" };
}
