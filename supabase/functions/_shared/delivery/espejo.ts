// Ritmo del espejo de pedidos de apps: cada cuánto debe volver a preguntar la caja.
//
// POR QUÉ EXISTE. El agente del escritorio sondeaba cada 10 s SIEMPRE, tuviera el cliente
// delivery o no. Son 8 640 llamadas por caja al día, la mayoría para que la nube conteste que no
// hay nada — y a 200 clientes eso es lo que primero tumba la base. Aquí se decide el ritmo con lo
// que la propia función ya consulta, y la caja obedece: así se puede cambiar el ritmo de toda la
// flota sin publicar un instalador, que es la única forma realista de corregirlo en caliente
// (una caja rota no se auto-actualiza).
//
// Vive aparte del handler para poder probarla con `node --test`: supabase/functions es código
// Deno y no está en el workspace de pnpm (mismo patrón que `_shared/latido.ts`).

/** Sin nada que atender: el cliente no vende por apps, o su tienda está cerrada del lado de la app. */
export const REPOSO_MS = 300_000;
/** Hay por dónde entren pedidos, pero ninguno vivo. Un pedido nuevo se ve en ≤30 s. */
export const NORMAL_MS = 30_000;
/** Hay una ventana de aceptación corriendo: cada segundo cuenta para que la comanda entre a cocina. */
export const RAPIDA_MS = 10_000;

/** Estados de conexión por los que todavía pueden entrar pedidos (0090). */
const CONEXION_VIVA = new Set(["ACTIVA", "PENDIENTE"]);

/**
 * @param conexiones   TODAS las conexiones de la sucursal (son 1–3 filas; siempre se consultan).
 * @param pedidosVivos Los pedidos en estado activo de la sucursal. Ojo: se consultan aparte y
 *                     COMPLETOS, nunca desde el delta — si el ritmo se calculara con las filas
 *                     que cambiaron, un pedido RECIBIDO que lleva 20 s quieto dejaría de contar
 *                     y la caja frenaría justo mientras corre su ventana de aceptación.
 */
export function cadenciaEspejo(
  { conexiones = [], pedidosVivos = [] }: {
    conexiones?: { estado?: string | null }[];
    pedidosVivos?: { estado?: string | null }[];
  },
): number {
  if (pedidosVivos.some((p) => p.estado === "RECIBIDO")) return RAPIDA_MS;
  if (conexiones.some((c) => CONEXION_VIVA.has(String(c.estado ?? "")))) return NORMAL_MS;
  return REPOSO_MS;
}

/** Tope de filas por respuesta: una ráfaga rara no debe convertirse en un paquete enorme. */
export const TOPE_PEDIDOS = 200;

/**
 * Los pedidos que van en la respuesta: los vivos (siempre) más los que cambiaron desde el cursor.
 *
 * Los vivos van siempre aunque no hayan cambiado porque son los únicos sobre los que la caja
 * todavía tiene algo que hacer. Si solo se mandara el delta, un pedido ACEPTADO cuyo ticket local
 * falló al crearse no volvería a aparecer jamás —no cambia nada, así que ningún delta lo incluye—
 * y el reintento nunca ocurriría.
 */
export function unirPedidos<T extends { id: string; recibido_at?: string | null }>(
  vivos: T[] = [],
  delta: T[] = [],
  tope = TOPE_PEDIDOS,
): T[] {
  // El delta se escribe encima: se leyó después, así que su versión de la fila es la buena.
  const porId = new Map<string, T>();
  for (const p of vivos) porId.set(p.id, p);
  for (const p of delta) porId.set(p.id, p);
  return [...porId.values()]
    .sort((a, b) => String(b.recibido_at ?? "").localeCompare(String(a.recibido_at ?? "")))
    .slice(0, tope);
}

/**
 * El cursor que mandó la caja, normalizado, o null si no es una fecha usable — y entonces se le
 * responde en frío. Nada del cuerpo llega a una consulta sin pasar por aquí: se valida en vez de
 * confiar, aunque el cliente sea nuestro y la consulta vaya parametrizada.
 */
export function cursorPedido(x: unknown): string | null {
  if (typeof x !== "string") return null;
  const t = Date.parse(x);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
