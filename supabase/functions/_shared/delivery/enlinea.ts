// La tienda en línea propia en `delivery-accion` (entrega 4): lo que se puede decidir sin tocar la
// base. Vive aparte del handler para probarlo con `node --test` (mismo patrón que `modulo.ts`).
//
// OJO CON LOS NOMBRES. `tienda_*` (en `modulo.ts`) es la tienda DE UBER de una sucursal y exige el
// módulo de apps. Lo de aquí es la tienda PROPIA y se llama `enlinea_*`: un negocio puede tener una
// sin la otra, y por eso cada una se guarda con su módulo.

/** Acciones por sucursal de la tienda propia: leer cómo está, pausarla, reanudarla y el latido del POS web. */
export const ACCIONES_ENLINEA = ["enlinea_estado", "enlinea_pausar", "enlinea_reanudar", "enlinea_presente"] as const;

/** Motivos de rechazo o cancelación de un pedido de la tienda. Lista cerrada: el cliente los ve. */
export const MOTIVOS_TIENDA = ["AGOTADO", "SATURADO", "CERRADO", "OTRO"] as const;

/** Cualquier motivo fuera de la lista (incluido POS_OFFLINE y texto libre) es OTRO. */
export function motivoDeTienda(x: unknown): (typeof MOTIVOS_TIENDA)[number] {
  return MOTIVOS_TIENDA.find((m) => m === x) ?? "OTRO";
}

const PAUSAS_MS: Record<string, number> = { "30m": 30 * 60_000, "1h": 60 * 60_000 };

/**
 * Hasta cuándo queda en pausa. "indefinida" → 2999-12-31T00:00:00Z (una fecha, no `infinity`: lo
 * lee `tienda_estado_sucursal` y lo pinta el POS). null si la duración no es de la lista.
 */
export function pausaHasta(duracion: unknown, ahora: Date): string | null {
  if (duracion === "indefinida") return "2999-12-31T00:00:00Z";
  const ms = typeof duracion === "string" && Object.hasOwn(PAUSAS_MS, duracion) ? PAUSAS_MS[duracion] : undefined;
  return ms === undefined ? null : new Date(ahora.getTime() + ms).toISOString();
}

/** Lo que reintentar no arregla: el pedido ya no se puede convertir en ticket tal como se cotizó. */
const NO_REINTENTABLES: [texto: string, codigo: string][] = [
  ...[
    "TOTAL_NO_COINCIDE", "ENVIO_NO_COINCIDE", "DIRECCION_INVALIDA", "CLIENTE_BLOQUEADO", "PRODUCTO_DE_OTRO_NEGOCIO",
    "OPCION_DE_OTRO_NEGOCIO", "ITEM_SIN_MAPEAR", "COMBO_ELECCION_SIN_MAPEAR", "COMBO_ELECCION_AMBIGUA", "SUCURSAL_DE_OTRO_NEGOCIO",
  ].map((c): [string, string] => [c, c]),
  // Estos los lanzan agregar_item y fijar_envio_ticket sin código: se reconocen por el texto.
  // «Opción de modificador % no existe» va DESPUÉS de «no existe o está eliminado» y no choca: no
  // trae «o está eliminado».
  ["no existe o está eliminado", "PRODUCTO_NO_EXISTE"],
  ["no está disponible", "PRODUCTO_NO_DISPONIBLE"],
  ["no se vende en esta sucursal", "PRODUCTO_NO_DISPONIBLE"],
  // El resto de lo que lanza el armado de un combo (0152:416-470), igual que en la caja: el menú
  // cambió desde que se cotizó, y el pedido tal como está ya no se puede armar.
  ...["está agotado o pausado", "no es un combo de este negocio", "no es válido como componente",
    "requiere entre", "está excluido del slot", "no es opción del slot",
  ].map((t): [string, string] => [t, "PRODUCTO_NO_DISPONIBLE"]),
  // fijar_envio_ticket (0116): la zona del pedido se borró, se apagó o ya no es de la sucursal.
  ["Zona de envío", "ZONA_NO_DISPONIBLE"],
  ["Opción de modificador", "OPCION_NO_EXISTE"],
];

/**
 * Clasifica el error de `crear_ticket_desde_tienda` (tabla «Clasificación de un fallo» del plan de
 * la entrega 4; la caja instalada aplica la misma).
 *
 * Lo desconocido es reintentable a propósito: cancelarle el pedido a un cliente por un error que
 * no entendemos (un timeout, un bloqueo) es peor que volver a intentarlo.
 */
export function fallaDeTicket(mensaje: string, codigoPg?: string): { reintentable: boolean; codigo: string } {
  const fatal = NO_REINTENTABLES.find(([texto]) => mensaje.includes(texto));
  if (fatal) return { reintentable: false, codigo: fatal[1] };
  if (mensaje.includes("SIN_TURNO_ABIERTO")) return { reintentable: true, codigo: "SIN_TURNO_ABIERTO" };
  // Dos cajas (o la caja y la nube) crearon a la vez al mismo cliente: a la segunda vuelta ya existe.
  if (codigoPg === "23505") return { reintentable: true, codigo: "DUPLICADO" };
  return { reintentable: true, codigo: "RPC_ERROR" };
}

/**
 * Lee `efectivos.tienda` de lo que devuelve el RPC `modulos_efectivos`. Falla cerrado, igual y por
 * lo mismo que `moduloDeliveryActivo`: sin respuesta, sin módulo.
 */
export function moduloTiendaActivo(mod: unknown): boolean {
  const efectivos = (mod as { efectivos?: Record<string, unknown> } | null | undefined)?.efectivos;
  return efectivos?.tienda === true;
}
