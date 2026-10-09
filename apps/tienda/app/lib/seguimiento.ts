// El seguimiento de un pedido: el sondeo (cada cuánto se pregunta, cuándo se deja de preguntar y qué
// se enseña cuando falla) y los pasos del recorrido según cómo se recibe. Sin Realtime: se pregunta
// cada 10 s mientras el pedido esté vivo y la pestaña a la vista.
import type { Resultado } from "./api";
import type { EstadoDePedido, Modo, Seguimiento } from "./contrato";
import { textoDeEstado } from "./textos";

export type Sondeo = {
  /** Lo último que se supo. Un fallo NO lo borra. */
  pedido: Seguimiento | null;
  /** Lecturas fallidas seguidas. */
  fallos: number;
  /** El servidor pidió ir más despacio (demasiadas lecturas desde esta red). No es un error que se enseñe. */
  lento: boolean;
  /** El enlace no lleva a ningún pedido: vencido o mal copiado. Ya no se pregunta más. */
  noEncontrado: boolean;
};

export const SONDEO_INICIAL: Sondeo = { pedido: null, fallos: 0, lento: false, noEncontrado: false };

const FINALES: readonly EstadoDePedido[] = ["ENTREGADO", "CANCELADO"];
// Respuestas que no van a cambiar por insistir.
const NO_EXISTE = new Set(["PEDIDO_NO_ENCONTRADO", "CODIGO_INVALIDO", "NEGOCIO_INVALIDO", "TIENDA_NO_DISPONIBLE"]);
const ESPERAS_MS = [10_000, 10_000, 20_000, 40_000, 60_000];
const TOPE_MS = 60_000;

/** El sondeo después de una lectura. */
export function alLeer(s: Sondeo, r: Resultado<Seguimiento>): Sondeo {
  if (r.ok) return { pedido: r.datos, fallos: 0, lento: false, noEncontrado: false };
  if (r.error === "CANCELADA") return s;
  if (NO_EXISTE.has(r.error)) return { ...s, noEncontrado: true };
  if (r.error === "DEMASIADOS_INTENTOS") return { ...s, lento: true };
  return { ...s, fallos: s.fallos + 1 };
}

export const terminado = (s: Sondeo): boolean => s.noEncontrado || (!!s.pedido && FINALES.includes(s.pedido.estado));

/**
 * Cuánto falta para la siguiente lectura, o null si ya no hay que leer. 10 s con todo bien; tras
 * fallos seguidos 20 s, 40 s y 60 s de tope; 60 s si el servidor pidió calma.
 */
export function esperaDe(s: Sondeo): number | null {
  if (terminado(s)) return null;
  return s.lento ? TOPE_MS : ESPERAS_MS[Math.min(s.fallos, ESPERAS_MS.length - 1)]!;
}

/**
 * «Sin conexión. Reintentando…»: con dos fallos seguidos (uno suelto no asusta a nadie), o con uno
 * si todavía no hay nada que enseñar.
 */
export const sinConexion = (s: Sondeo): boolean => !terminado(s) && (s.fallos >= 2 || (s.fallos >= 1 && !s.pedido));

type Documento = Pick<Document, "hidden" | "addEventListener" | "removeEventListener">;

/**
 * Sondea hasta que el pedido termina. Lee de inmediato; con la pestaña oculta no pregunta (y suelta
 * la lectura en vuelo) y al volver relee sin esperar. Devuelve cómo detenerlo.
 */
export function sondear(
  leer: (signal: AbortSignal) => Promise<Resultado<Seguimiento>>,
  alCambiar: (s: Sondeo) => void,
  doc: Documento = document,
): () => void {
  let s = SONDEO_INICIAL, reloj: ReturnType<typeof setTimeout> | undefined, corte: AbortController | null = null, detenido = false;

  const soltar = () => { clearTimeout(reloj); corte?.abort(); corte = null; };
  const leerAhora = async () => {
    soltar();
    if (detenido || doc.hidden || terminado(s)) return;
    const mio = (corte = new AbortController());
    const r = await leer(mio.signal);
    if (mio.signal.aborted) return;   // se ocultó la pestaña o se detuvo: esta respuesta ya no cuenta
    corte = null;
    s = alLeer(s, r);
    alCambiar(s);
    const espera = esperaDe(s);
    if (espera !== null) reloj = setTimeout(leerAhora, espera);
  };
  const alCambiarVisibilidad = () => { if (doc.hidden) soltar(); else void leerAhora(); };

  doc.addEventListener("visibilitychange", alCambiarVisibilidad);
  void leerAhora();
  return () => { detenido = true; soltar(); doc.removeEventListener("visibilitychange", alCambiarVisibilidad); };
}

// ── El recorrido ─────────────────────────────────────────────────────────────────────────────────
const PASOS: Record<Modo, readonly Exclude<EstadoDePedido, "CANCELADO">[]> = {
  RECOGER: ["EN_PROCESO", "EN_PREPARACION", "LISTO_PARA_RECOGER", "ENTREGADO"],
  DOMICILIO: ["EN_PROCESO", "EN_PREPARACION", "EN_CAMINO", "ENTREGADO"],
};

export type Paso = { estado: EstadoDePedido; titulo: string; fase: "hecho" | "actual" | "pendiente" };

/**
 * Los pasos de SU modo, con cuál va. Un cancelado rompe el recorrido: null (se enseña el motivo, no
 * una fila de pasos que ya no van a pasar). Entregado deja todos hechos.
 */
export function recorrido(modo: Modo, estado: EstadoDePedido): Paso[] | null {
  if (estado === "CANCELADO") return null;
  const pasos = PASOS[modo];
  // Un estado del otro modo (no debería llegar) se lee como «en preparación»: nunca adelanta de más.
  const i0 = pasos.indexOf(estado);
  const actual = estado === "ENTREGADO" ? pasos.length : i0 === -1 ? 1 : i0;
  return pasos.map((p, i) => ({
    estado: p, titulo: textoDeEstado(p, null).titulo,
    fase: i < actual ? "hecho" : i === actual ? "actual" : "pendiente",
  }));
}
