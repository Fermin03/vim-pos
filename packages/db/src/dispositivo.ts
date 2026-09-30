/** La cuenta de una caja en Supabase Auth: `caja-<caja_id>@dispositivos.<dominio>`.
 *
 * El dominio pasó de `dispositivos.vimpos.mx` (que no es de VIM: nadie lo tiene registrado) a
 * `dispositivos.vimpos.com.mx`. Mientras haya credenciales viejas apuntadas en algún lado, el
 * login prueba el otro dominio si el primero no entra. Espejo de
 * `supabase/functions/_shared/dispositivo.ts` y `desktop/src/dispositivo.mjs`.
 */
const EMAIL_DISPOSITIVO =
  /^caja-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@dispositivos\.vimpos\.(?:com\.)?mx$/i;

/** El mismo correo de caja con el otro dominio, o null si no es de una caja. */
export function correoAlternoDispositivo(email: string): string | null {
  const m = EMAIL_DISPOSITIVO.exec(email.trim());
  if (!m) return null;
  const id = m[1]!.toLowerCase();
  return email.trim().toLowerCase().endsWith("@dispositivos.vimpos.mx")
    ? `caja-${id}@dispositivos.vimpos.com.mx`
    : `caja-${id}@dispositivos.vimpos.mx`;
}
