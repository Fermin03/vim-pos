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
 * @param tienda       La sucursal vende en la tienda en línea y esta caja la entiende. Sin una
 *                     conexión de app nada más la sacaría del reposo, y con sondeos cada 300 s la
 *                     señal de caja lista (ventana de 90 s) no se cumpliría nunca.
 */
export function cadenciaEspejo(
  { conexiones = [], pedidosVivos = [], tienda = false }: {
    conexiones?: { estado?: string | null }[];
    pedidosVivos?: { estado?: string | null; canal?: string | null; gestion?: string | null }[];
    tienda?: boolean;
  },
): number {
  // Un pedido vivo de la TIENDA que atiende la caja (gestión ESCRITORIO) acelera en cualquier
  // estado, no solo por aceptar: su cliente mira el seguimiento y «listo» o «entregado» le tienen
  // que llegar en segundos. Los de gestión NUBE no: nadie escribe su estado de vuelta, se quedan
  // en ACEPTADO para siempre y dejarían a la caja sondeando cada 10 s sin fin. Los de APP, como siempre.
  if (pedidosVivos.some((p) => p.estado === "RECIBIDO" || (p.canal === "TIENDA" && p.gestion === "ESCRITORIO"))) return RAPIDA_MS;
  if (tienda || conexiones.some((c) => CONEXION_VIVA.has(String(c.estado ?? "")))) return NORMAL_MS;
  return REPOSO_MS;
}

/**
 * Qué le toca a esta caja en este sondeo.
 *
 * `conTienda` exige las dos cosas: que el negocio tenga la tienda encendida Y que la caja diga que
 * la entiende (`tienda: true` en el cuerpo, que solo mandan las cajas desde la 0.8.0). Sin lo
 * segundo, una caja vieja recibiría pedidos con `conexion_id` nulo que su tabla local rechaza, y
 * el espejo entero —pedidos de Uber incluidos— fallaría en cada vuelta.
 *
 * Solo un `true` estricto cuenta: nada del cuerpo se da por bueno sin mirarlo.
 */
export function alcanceEspejo(
  { efectivos, cuerpo }: {
    efectivos: Record<string, unknown>;
    cuerpo: { tienda?: unknown; turno_abierto?: unknown };
  },
): { conApps: boolean; conTienda: boolean; canales: ("APP" | "TIENDA")[]; turnoAbierto: boolean } {
  const conApps = efectivos.delivery_apps === true;
  const conTienda = efectivos.tienda === true && cuerpo.tienda === true;
  const canales: ("APP" | "TIENDA")[] = [];
  if (conApps) canales.push("APP");
  if (conTienda) canales.push("TIENDA");
  return { conApps, conTienda, canales, turnoAbierto: cuerpo.turno_abierto === true };
}

/**
 * Lo que el sondeo escribe en `cajas`: siempre el latido y, solo si la caja declara la tienda Y
 * reporta turno abierto, la marca `espejo_turno_abierto_at` que lee `sucursal_recibe_pedidos`
 * (mig. 0161 §6).
 *
 * Es una marca de tiempo para que falle cerrada: quien deja de afirmar el turno no escribe nada y
 * la marca envejece sola. Y una caja que no declara la tienda manda el UPDATE de siempre, así que
 * las que hoy están en servicio no dependen de que la columna exista.
 */
export function selloLatido(
  cuerpo: { tienda?: unknown; turno_abierto?: unknown },
  ahora: string,
): Record<string, string> {
  return {
    espejo_apps_at: ahora,
    ...(cuerpo.tienda === true && cuerpo.turno_abierto === true && { espejo_turno_abierto_at: ahora }),
  };
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
 * Lo que se le contesta a una caja cuyo tenant no tiene el módulo encendido.
 *
 * Vacía y en reposo. Importa que exista como función y no como un objeto suelto en el handler
 * porque es la única parte del corte que se puede probar: el handler no se prueba (toca la base).
 * Y va ANTES de las tres consultas del handler, así que un tenant sin delivery no le cuesta a la
 * base ni una lectura.
 */
export function respuestaSinModulo(cajaId: string, sucursalId: string) {
  return {
    ahora: new Date().toISOString(),
    caja_id: cajaId,
    sucursal_id: sucursalId,
    conexiones: [] as unknown[],
    pedidos: [] as unknown[],
    siguiente_en_ms: REPOSO_MS,
  };
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
