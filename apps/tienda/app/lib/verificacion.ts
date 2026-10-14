// La verificación del banco (3D Secure) al pagar en línea. Cuando Mercado Pago duda de un cobro, en
// vez de rechazarlo le pide al cliente confirmarlo con su banco: `pedir` contesta
// `pago: { estado: "VERIFICACION", url }` y la tienda abre esa dirección en un marco, dentro de la
// pantalla de la tarjeta. Mientras, NO se ha cobrado nada y el pedido no existe para el restaurante.
//
// Qué pasó lo dice SIEMPRE el servidor (acción `verificacion`, que le pregunta a Mercado Pago). El
// mensaje que la página del reto manda al terminar solo sirve para preguntar antes.
//
// Puro: qué dirección se puede abrir, qué significa cada respuesta y cada cuánto se pregunta. El
// marco y los botones son de `components/reto.tsx`.
import type { Resultado } from "./api";
import type { Verificacion } from "./contrato";

/**
 * Dónde vive la página del reto. Lista CERRADA, la misma del servidor (`HOSTS_DEL_RETO`, pago-mp.ts)
 * y de la CSP (`frame-src`, next.config.mjs): VERIFICADO el 12 oct 2026, Mercado Pago la sirve desde
 * aquí. La tienda no abre en un marco ninguna dirección que no sea de esta lista, la mande quien la mande.
 */
export const HOSTS_DEL_RETO: readonly string[] = ["www.mercadopago.com.mx"];

/** La dirección del reto si se puede abrir (https, sin usuario ni puerto, de un host de la lista), o null. */
export function urlDeReto(x: unknown): string | null {
  if (typeof x !== "string" || x.length > 600) return null;
  try {
    const u = new URL(x);
    return u.protocol === "https:" && HOSTS_DEL_RETO.includes(u.hostname) && u.port === "" && u.username === "" && u.password === "" ? u.href : null;
  } catch {
    return null;
  }
}

/**
 * ¿Ese mensaje (`postMessage`) es la página del reto avisando que terminó? VERIFICADO (12 oct 2026):
 * lo manda `https://www.mercadopago.com.mx` y su `data` es el TEXTO `{"status":"COMPLETE"}`.
 * «Terminó» no dice si se aprobó: solo sirve para preguntarle ya al servidor. Un mensaje de
 * cualquier otro origen (los campos de la tarjeta, el antirobot, una extensión) no es de aquí.
 */
export function esFinDelReto(origen: string, datos: unknown): boolean {
  if (!HOSTS_DEL_RETO.some((h) => origen === `https://${h}`)) return false;
  let d: unknown = datos;
  if (typeof d === "string") {
    try { d = JSON.parse(d); } catch { return false; }
  }
  return typeof d === "object" && d !== null && (d as { status?: unknown }).status === "COMPLETE";
}

export type PasoDelReto =
  /**
   * El reto sigue vivo. `url`: su dirección, si el servidor la consultó en esta vuelta. `conPrisa`:
   * todavía se está preguntando seguido (tras el aviso de que terminó, o buscando la dirección).
   */
  | { tipo: "sigue"; url: string | null; conPrisa?: boolean }
  /** Ya no es de esta pantalla: se pagó, o ya no espera el reto y falta saber el resultado. A la página del pedido. */
  | { tipo: "pedido" }
  /**
   * No se cobró nada y el pedido se descartó: se puede pagar otra vez. `detalle`: la familia del
   * motivo. `hasta`: solo con RIESGO, hasta cuándo queda en pausa el pago en línea.
   */
  | { tipo: "rechazado"; detalle: string | null; hasta?: string | null }
  /** No se pudo preguntar (sin red, demasiadas preguntas, el servidor): se vuelve a preguntar. */
  | { tipo: "sin-respuesta" };

/** Lo que contestó `verificacion` → qué hace la pantalla. */
export function pasoDelReto(r: Resultado<Verificacion>): PasoDelReto {
  if (r.ok) return r.datos.estado === "VERIFICACION" ? { tipo: "sigue", url: r.datos.url } : { tipo: "pedido" };
  if (r.error === "PAGO_RECHAZADO") return { tipo: "rechazado", detalle: r.detalle, ...(r.hasta && { hasta: r.hasta }) };
  // El pedido ya no existe: solo se borra cuando el cobro no pasó (lo descartó otra respuesta, que
  // no llegó). Es lo mismo que le contesta `intento` a quien pregunta por esa clave.
  if (r.error === "PEDIDO_NO_ENCONTRADO") return { tipo: "rechazado", detalle: "SIN_VERIFICAR" };
  return { tipo: "sin-respuesta" };
}

/**
 * El reto a la vista en «Tu tarjeta». `url`: su página (null mientras el servidor la dice).
 * `esperando`: el marco se quitó —la página avisó que terminó, o el cliente tocó «Cancelar»— y falta
 * lo que diga el servidor. `cancelado`: fue el cliente quien lo dejó.
 */
export type Reto = { codigo: string; url: string | null; esperando: boolean; cancelado: boolean };

/**
 * El servidor dice que el reto SIGUE. Lo normal: nada cambia (la dirección no se toca una vez
 * abierta: volver a cargar el marco reiniciaría el reto), salvo que faltara la dirección.
 * Pero si el marco se había quitado porque la página avisó que terminó, y pasadas las vueltas
 * seguidas el servidor sigue diciendo que no, ese aviso llegó ANTES DE TIEMPO (solo está verificado
 * en el ambiente de prueba; un banco real puede mandarlo a medio camino): el marco vuelve, con la
 * dirección de esa respuesta, para que el cliente pueda terminar. Si lo dejó el cliente, no vuelve.
 */
export function retoQueSigue(r: Reto, p: { url: string | null; conPrisa?: boolean }): Reto {
  if (r.esperando && !r.cancelado && !p.conPrisa) return { ...r, esperando: false, url: p.url ?? r.url };
  return !r.url && p.url ? { ...r, url: p.url } : r;
}

/**
 * ¿Se ofrece «Cancelar»? Solo con el marco a la vista. Desde que la página del reto avisa que
 * terminó, NO: el pago puede estar aprobándose, y dejarlo ahí acabaría en un cobro que se devuelve
 * con el cliente leyendo «Cancelaste». Si el marco vuelve (`retoQueSigue`), vuelve el botón.
 */
export const seOfreceCancelar = (r: Reto): boolean => !r.esperando;

/** El ritmo del seguimiento (10 s). Tras el aviso de que el reto terminó, unas vueltas más seguidas. */
const ESPERA_MS = 10_000, CON_PRISA_MS = 3_000, VUELTAS_CON_PRISA = 5;

type Documento = Pick<Document, "hidden" | "addEventListener" | "removeEventListener">;

/**
 * Le pregunta al servidor cómo va el reto hasta que termina: cada 10 s, al volver a la pestaña (en
 * el teléfono el cliente sale a la aplicación de su banco y regresa) y en cuanto se le pide
 * (`ahora`: la página del reto avisó que terminó; Mercado Pago tarda unos segundos en reflejarlo,
 * así que las siguientes vueltas van cada 3 s). `cancelar`: el cliente abandona el reto; desde ahí
 * TODAS las preguntas piden cancelar la orden, hasta que el servidor confirme cómo quedó.
 * Solo una pregunta a la vez. Devuelve cómo pedirle cosas y cómo detenerlo.
 */
export function vigilarReto(d: {
  preguntar: (cancelar: boolean, signal: AbortSignal) => Promise<Resultado<Verificacion>>;
  alPaso: (p: PasoDelReto) => void;
  /** Preguntar de inmediato (no se tiene la dirección del reto: se llegó recargando la página). */
  yaMismo?: boolean;
  doc?: Documento;
}): { ahora(): void; cancelar(): void; detener(): void } {
  const doc = d.doc ?? document;
  let reloj: ReturnType<typeof setTimeout> | undefined, corte: AbortController | null = null;
  let detenido = false, cancelando = false, prisa = 0, otra = false;

  const programar = () => {
    clearTimeout(reloj);
    if (!detenido) reloj = setTimeout(() => void preguntar(), prisa > 0 ? CON_PRISA_MS : ESPERA_MS);
  };
  const preguntar = async () => {
    if (detenido) return;
    // Ya hay una en vuelo: se hace otra al terminar (puede traer una respuesta de antes del aviso).
    if (corte) { otra = true; return; }
    clearTimeout(reloj);
    const mia = (corte = new AbortController());
    let r: Resultado<Verificacion>;
    try { r = await d.preguntar(cancelando, mia.signal); } catch { r = { ok: false, error: "SIN_CONEXION", detalle: null }; }
    corte = null;
    if (detenido) return;
    if (prisa > 0) prisa--;
    const paso = pasoDelReto(r);
    if (paso.tipo === "pedido" || paso.tipo === "rechazado") { detener(); d.alPaso(paso); return; }
    d.alPaso(paso.tipo === "sigue" ? { ...paso, conPrisa: prisa > 0 } : paso);
    if (otra) { otra = false; void preguntar(); } else programar();
  };
  const alVolver = () => { if (!doc.hidden) void preguntar(); };
  const detener = () => { detenido = true; clearTimeout(reloj); corte?.abort(); doc.removeEventListener("visibilitychange", alVolver); };

  doc.addEventListener("visibilitychange", alVolver);
  // Sin dirección todavía: se pregunta ya y, si esa vuelta no la trae, las siguientes van seguidas.
  if (d.yaMismo) { prisa = VUELTAS_CON_PRISA; void preguntar(); } else programar();
  return {
    ahora() { prisa = VUELTAS_CON_PRISA; void preguntar(); },
    cancelar() { cancelando = true; void preguntar(); },
    detener,
  };
}
