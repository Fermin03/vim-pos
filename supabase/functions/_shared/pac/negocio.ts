// ¿Este negocio todavía puede mandar un comprobante al SAT?
//
// Un cliente CANCELADO se puede ELIMINAR por completo desde el panel (0144, ADR 0023), y eliminar
// borra sus filas de `tickets_cfdi`. Si en ese momento hay un timbrado en vuelo —el borrador ya
// salió al PAC y la respuesta tarda unos segundos— el PAC devuelve un UUID y ya no hay fila donde
// guardarlo: un CFDI válido en el SAT del que no queda registro.
//
// Dos capas lo cierran. Esta es la primera: las tres funciones que timbran (timbrar-cfdi,
// timbrar-global, autofacturar) se niegan con el negocio CANCELADO, al entrar y OTRA VEZ justo
// antes de llamar al PAC. La segunda está en `eliminar_tenant`: un negocio que pudo facturar no
// se elimina hasta 15 minutos después de la baja — más de lo que vive cualquier llamada que
// hubiera pasado esta comprobación antes de cancelarlo.
//
// Ojo: `mi_acceso()` NO sirve para esto. Bloquea a SUSPENDIDO/CANCELADO solo cuando ya pasó la
// gracia (`bloqueo_desde`), y autofacturar ni siquiera la consulta (no hay sesión del negocio).
//
// Módulo puro: la lectura se inyecta, así se prueba con `node --test` sin Deno ni Supabase.

/**
 * Cómo se lee el estado: lo da quien llama, con SU cliente de service_role —
 * `() => admin.from("tenants").select("estado").eq("id", tenantId).maybeSingle()`. Así este módulo
 * no depende de los tipos del SDK.
 */
export type LectorEstado = () => PromiseLike<{ data: unknown; error: { message: string } | null }>;

/** El rechazo, igual en las tres funciones. */
export const NEGOCIO_DADO_DE_BAJA = {
  error: "NEGOCIO_DADO_DE_BAJA",
  detalle: "Este negocio está dado de baja: ya no puede emitir facturas. Contacta a VIM.",
} as const;

/** Sin estado (el negocio ya no existe) o CANCELADO: no se timbra. */
export function estadoPermiteTimbrar(estado: string | null | undefined): boolean {
  return Boolean(estado) && estado !== "CANCELADO";
}

/**
 * Lee el estado AHORA. Si la lectura falla devuelve false: ante la duda no se manda nada al SAT
 * (el usuario reintenta; un CFDI huérfano no se puede deshacer).
 */
export async function negocioPuedeTimbrar(leerEstado: LectorEstado): Promise<boolean> {
  const { data, error } = await leerEstado();
  if (error) return false;
  return estadoPermiteTimbrar((data as { estado?: string } | null)?.estado);
}
