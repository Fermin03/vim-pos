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
// Módulo puro salvo por el cliente que recibe `cajaEnRegla` (se prueba con `node --test`); lo usan
// pin-login, el latido, la sincronización y provisionar-dispositivo.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

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

/**
 * La caja tiene que existir, ser de este tenant y estar activa.
 *
 * Esto ANTES NO SE COMPROBABA: con getUser bastaba que el usuario del dispositivo siguiera vivo
 * en auth, así que una caja desactivada seguía subiendo ventas y bajando el catálogo, y la única
 * forma de pararla era borrarle el usuario a mano. Ahora `activa = false` corta en el acto — que
 * además es lo correcto para el límite del plan: desactivar una caja libera su lugar (0103), y
 * sin este candado se podían operar dos con un plan de una.
 */
export async function cajaEnRegla(admin: SupabaseClient, cajaId: string, tenantId: string): Promise<boolean> {
  const { data } = await admin.from("cajas").select("id")
    .eq("id", cajaId).eq("tenant_id", tenantId).eq("activa", true).is("deleted_at", null)
    .maybeSingle();
  return Boolean(data);
}
