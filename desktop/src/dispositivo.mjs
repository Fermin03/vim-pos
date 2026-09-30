// La identidad de esta caja en la nube: `caja-<caja_id>@dispositivos.<dominio>`.
//
// El dominio era `dispositivos.vimpos.mx`, que no es de VIM (nadie lo tiene registrado: quien lo
// hiciera recibiría el "restablecer contraseña" de las cajas). Pasa a `dispositivos.vimpos.com.mx`.
// Espejo de `supabase/functions/_shared/dispositivo.ts`.
//
// El cambio se hace sin corte:
//   1. Desde 0.4.97 la caja reconoce los dos dominios y, si la nube rechaza su correo, prueba el
//      otro con la misma contraseña; si entra, guarda el bueno (`loginDispositivoNube`).
//   2. Con todas las cajas en 0.4.97 o más, se mueven las cuentas en la nube
//      (`supabase/scripts/migrar-dominio-dispositivos.mjs`). Cada caja se entera sola en su
//      siguiente ciclo.
// Una caja anterior a 0.4.97 NO sabe reintentar: por eso el paso 2 espera a que se actualicen.

export const DOMINIO_DISPOSITIVOS = "dispositivos.vimpos.com.mx";
export const DOMINIO_DISPOSITIVOS_VIEJO = "dispositivos.vimpos.mx";

export const EMAIL_DISPOSITIVO =
  /^caja-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@dispositivos\.vimpos\.(?:com\.)?mx$/i;

/** El id de la caja de un correo de dispositivo (cualquiera de los dos dominios), o null. */
export function cajaIdDeEmail(email) {
  const m = EMAIL_DISPOSITIVO.exec(String(email ?? ""));
  return m ? m[1].toLowerCase() : null;
}

/** El mismo correo con el otro dominio, o null si no es de una caja. */
export function correoAlterno(email) {
  const id = cajaIdDeEmail(email);
  if (!id) return null;
  const viejo = String(email).toLowerCase().endsWith("@" + DOMINIO_DISPOSITIVOS_VIEJO);
  return `caja-${id}@${viejo ? DOMINIO_DISPOSITIVOS : DOMINIO_DISPOSITIVOS_VIEJO}`;
}

/**
 * Login del dispositivo contra la nube (GoTrue, grant_type=password).
 *
 * Si la nube dice que no y el correo es de una caja, prueba el mismo con el otro dominio: así la
 * caja sobrevive a que su cuenta se mueva de dominio sin que nadie la vuelva a vincular. Solo
 * reintenta ante un rechazo de la nube (respuesta sin token), no ante un error de red: ese se
 * propaga para que quien llama lo cuente como red.
 *
 * Devuelve `{ token, email }` con el correo que sí entró, o `{ token: null }`.
 */
export async function loginDispositivoNube({ cloudUrl, anon, email, pass, timeoutMs = 15000, fetchImpl = fetch }) {
  const intentar = async (correo) => {
    const r = await fetchImpl(`${cloudUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anon, "Content-Type": "application/json" },
      body: JSON.stringify({ email: correo, password: pass }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const s = await r.json().catch(() => ({}));
    return s?.access_token ?? null;
  };
  const token = await intentar(email);
  if (token) return { token, email };
  const otro = correoAlterno(email);
  if (!otro) return { token: null };
  const token2 = await intentar(otro);
  return token2 ? { token: token2, email: otro } : { token: null };
}
