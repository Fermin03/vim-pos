// La identidad de una caja en Supabase Auth: una cuenta sintética `caja-<caja_id>@<dominio>`.
//
// El dominio era `dispositivos.vimpos.mx`, y `vimpos.mx` no es de VIM: no está registrado por
// nadie. Quien lo registrara podría recibir el correo de "restablecer contraseña" de una caja y
// entrar como ella. El de VIM es `vimpos.com.mx`, y `dispositivos.vimpos.com.mx` no tiene MX: un
// correo a esas cuentas es inentregable por diseño, que es justo lo que se quiere.
//
// Las cuentas se crean ya con el dominio nuevo, y las viejas se mueven con
// `supabase/scripts/migrar-dominio-dispositivos.mjs`. Mientras tanto se aceptan los dos:
// dejar de reconocer el viejo antes de mover las cuentas dejaría a las cajas sin entrar.
//
// Módulo puro (se prueba con `node --test`); lo usan pin-login, el latido y provisionar-dispositivo.

export const DOMINIO_DISPOSITIVOS = "dispositivos.vimpos.com.mx";
export const DOMINIO_DISPOSITIVOS_VIEJO = "dispositivos.vimpos.mx";

const EMAIL_DISPOSITIVO = /^caja-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@dispositivos\.vimpos\.(?:com\.)?mx$/i;

/** El correo de la cuenta de una caja. */
export function correoDispositivo(cajaId: string): string {
  return `caja-${cajaId.toLowerCase()}@${DOMINIO_DISPOSITIVOS}`;
}

/** El id de la caja de un correo de dispositivo (cualquiera de los dos dominios), o null. */
export function cajaIdDeEmail(email: string | null | undefined): string | null {
  const m = EMAIL_DISPOSITIVO.exec(String(email ?? ""));
  return m ? m[1]!.toLowerCase() : null;
}

/** ¿Este correo es de una cuenta de caja con el dominio viejo? */
export function esDominioViejo(email: string | null | undefined): boolean {
  return cajaIdDeEmail(email) !== null && String(email).toLowerCase().endsWith("@" + DOMINIO_DISPOSITIVOS_VIEJO);
}
