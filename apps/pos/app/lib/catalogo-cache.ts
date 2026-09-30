/**
 * Caché de lectura del catálogo (Dexie, ver outbox.ts): de quién es y cuándo se usa.
 *
 * Auditoría integral 30/09/2026 (B2-6). Antes la clave era fija, `"catalogo"`, y se servía ante
 * CUALQUIER error de la consulta:
 *  - una caja revinculada a otra sucursal (u otro negocio) podía pintar el menú —y los precios—
 *    de la anterior, porque la clave no decía de quién era;
 *  - un error que no es de red (RLS, sesión vencida, columna renombrada) se tapaba con un menú
 *    viejo en vez de verse.
 * Ahora la clave lleva tenant y sucursal, solo se sirve sin red, y se borra al desvincular.
 */

export function claveCatalogo(tenantId: string, sucursalId: string): string {
  return `catalogo:${tenantId}:${sucursalId}`;
}

// Mensajes con que fetch / supabase-js reportan que la petición ni siquiera llegó: Chromium
// ("Failed to fetch"), Firefox ("NetworkError when attempting…"), Safari ("Load failed"),
// Node/undici ("fetch failed"), React Native ("Network request failed"), y los cortes típicos.
const PATRON_RED = /failed to fetch|fetch failed|networkerror|network request failed|load failed|econnrefused|econnreset|enotfound|etimedout|timed? ?out|aborted/i;

/**
 * ¿Este fallo es "no hay red" (y entonces vale servir la caché) o un error real que hay que ver?
 * `online` es lo que dice el monitor de conexión de la caja; si ya sabe que no hay red, basta.
 */
export function esErrorDeRed(e: unknown, online: boolean): boolean {
  if (!online) return true;
  const mensaje = e instanceof Error ? `${e.name} ${e.message}` : typeof e === "string" ? e : "";
  return PATRON_RED.test(mensaje);
}
