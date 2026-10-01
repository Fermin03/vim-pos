// ¿Este negocio todavía puede mandar un comprobante al SAT?
//
// Un cliente CANCELADO se puede ELIMINAR por completo desde el panel (0144, ADR 0023), y eliminar
// borra sus filas de `tickets_cfdi`. Si en ese momento hay un timbrado en vuelo —el borrador ya
// salió al PAC y la respuesta tarda unos segundos— el PAC devuelve un UUID y ya no hay fila donde
// guardarlo: un CFDI válido en el SAT del que no queda registro.
//
// Dos capas lo cierran. Esta es la primera: las tres funciones que timbran (timbrar-cfdi,
// timbrar-global, autofacturar) se niegan cuando la baja YA ESTÁ EN VIGOR, al entrar y OTRA VEZ
// justo antes de llamar al PAC. La segunda está en `eliminar_tenant`: no se elimina a nadie en
// sus días de gracia, y un negocio que pudo facturar espera 15 minutos desde que dejó de poder
// — más de lo que vive cualquier llamada que hubiera pasado esta comprobación.
//
// "En vigor" es el bloqueo efectivo, no el estado a secas: un negocio cancelado con días de
// gracia (`tenants.bloqueo_desde` en el futuro) sigue vendiendo en su caja (ADR 0014) y por lo
// mismo sigue facturando hasta esa fecha. La regla:
//
//     no timbra  ⇔  estado = CANCELADO  y  (bloqueo_desde es NULL  o  bloqueo_desde <= ahora)
//
// Los demás estados no se deciden aquí: a SUSPENDIDO lo frena `mi_acceso()` cuando vence su
// gracia. Esta comprobación existe porque autofacturar no tiene sesión del negocio (no hay
// `mi_acceso()`), y porque las tres necesitan la segunda mirada justo antes del PAC.
//
// Módulo puro: la lectura se inyecta, así se prueba con `node --test` sin Deno ni Supabase.

/** Las columnas que hay que leer de `tenants`: se pasa tal cual a `.select(...)`. */
export const COLUMNAS_NEGOCIO = "estado, bloqueo_desde";

/**
 * Cómo se lee el negocio: lo da quien llama, con SU cliente de service_role —
 * `() => admin.from("tenants").select(COLUMNAS_NEGOCIO).eq("id", tenantId).maybeSingle()`. Así
 * este módulo no depende de los tipos del SDK.
 */
export type LectorEstado = () => PromiseLike<{ data: unknown; error: { message: string } | null }>;

/** El rechazo, igual en las tres funciones. */
export const NEGOCIO_DADO_DE_BAJA = {
  error: "NEGOCIO_DADO_DE_BAJA",
  detalle: "Este negocio está dado de baja: ya no puede emitir facturas. Contacta a VIM.",
} as const;

/**
 * Sin fila (el negocio ya no existe): no. CANCELADO con el bloqueo en vigor —o sin fecha de
 * bloqueo, que es no tener gracia—: no. CANCELADO todavía en gracia y cualquier otro estado: sí.
 */
export function negocioPermiteTimbrar(
  fila: { estado?: string | null; bloqueo_desde?: string | null } | null | undefined,
  ahora: Date = new Date(),
): boolean {
  if (!fila?.estado) return false;
  if (fila.estado !== "CANCELADO") return true;
  if (!fila.bloqueo_desde) return false;
  const desde = new Date(fila.bloqueo_desde).getTime();
  // Una fecha ilegible no es una gracia: ante la duda no se manda nada al SAT.
  return Number.isFinite(desde) && desde > ahora.getTime();
}

/**
 * Lee el negocio AHORA. Si la lectura falla devuelve false: ante la duda no se manda nada al SAT
 * (el usuario reintenta; un CFDI huérfano no se puede deshacer).
 */
export async function negocioPuedeTimbrar(leerEstado: LectorEstado, ahora: Date = new Date()): Promise<boolean> {
  const { data, error } = await leerEstado();
  if (error) return false;
  return negocioPermiteTimbrar(data as { estado?: string; bloqueo_desde?: string | null } | null, ahora);
}
