"use client";
import { esEscritorio } from "./actualizacion";

/**
 * "El menú cambió": aviso del escritorio y actualización a petición del cajero.
 *
 * El problema que resuelve: el catálogo se cargaba una sola vez, al abrir la caja. Un producto
 * dado de alta en /admin no aparecía hasta reiniciar la aplicación, aunque el escritorio ya lo
 * hubiera bajado a su Postgres local. Ahora el escritorio avisa (SSE) y la pantalla lo relee.
 *
 * Todo esto es EXCLUSIVO del escritorio: en el POS web el catálogo se lee directo de la nube y no
 * hay nada que sincronizar. Fuera de la caja las dos funciones no hacen nada, en vez de fallar —
 * es la misma pantalla corriendo en dos sitios.
 */

/**
 * Llama `alCambiar` cada vez que el escritorio termina de bajar un menú nuevo.
 *
 * Va por el mismo stream SSE que ya usa la cocina: es HTTP simple, atraviesa la LAN sin WebSocket
 * y `EventSource` reconecta solo si el hub se reinicia. Devuelve la función para desuscribirse.
 */
export function alCambiarCatalogo(alCambiar: () => void): () => void {
  const w = typeof window !== "undefined"
    ? (window as unknown as { __VIM_SUPABASE_URL?: string })
    : undefined;
  if (!esEscritorio() || !w?.__VIM_SUPABASE_URL || typeof EventSource === "undefined") {
    return () => {};
  }
  // Sin `?sucursal=`: un cambio de menú es del negocio entero, no de una sucursal.
  const es = new EventSource(`${w.__VIM_SUPABASE_URL}/kds/stream`);
  es.addEventListener("catalogo", () => alCambiar());
  es.onerror = () => {
    // EventSource reconecta solo. Y si no lo consigue, el hueco lo cubre el sondeo del escritorio:
    // la próxima carga de la pantalla trae el menú al día de todas formas.
  };
  return () => es.close();
}

export type ResultadoMenu = { ok: boolean; error?: string };

/**
 * "Actualizar menú": le pide al escritorio que baje el catálogo YA, sin esperar al sondeo.
 *
 * Para cuando el dueño acaba de dar de alta un producto y lo quiere en pantalla con el cliente
 * delante. No refresca la pantalla por su cuenta: el escritorio avisa por SSE cuando terminó, y
 * ahí es donde se recarga — así la segunda caja y la cocina se enteran por el mismo camino.
 */
export async function pedirActualizacionCatalogo(): Promise<ResultadoMenu> {
  if (!esEscritorio()) return { ok: false, error: "Solo disponible en la caja de escritorio." };
  try {
    const r = await fetch("/__sincronizar-catalogo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      cache: "no-store",
    });
    const j: unknown = await r.json().catch(() => ({}));
    const cuerpo = (j ?? {}) as { ok?: unknown; error?: unknown };
    if (cuerpo.ok === true) return { ok: true };
    return {
      ok: false,
      error: typeof cuerpo.error === "string" ? cuerpo.error : "No se pudo actualizar el menú.",
    };
  } catch {
    // Sin red o sin escritorio detrás. El menú que hay en pantalla sigue sirviendo para cobrar,
    // que es lo único que no se puede interrumpir.
    return { ok: false, error: "No se pudo contactar a la caja." };
  }
}
