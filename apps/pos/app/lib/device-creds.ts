"use client";
// Identidad del dispositivo recordada entre recargas.
//
// SEC CN-006 — antes aquí vivía `{ email, password }` en claro en localStorage. Esa contraseña no
// solo abre la sesión local: es la MISMA credencial que vale contra la nube, donde habilita
// sync-pull (snapshot completo del tenant, con los pin_hash de toda la plantilla) y sync-push
// (reescritura del histórico de ventas). Cualquier XSS en el POS —la CSP de producción todavía
// permite 'unsafe-inline', ver CN-012— o cualquiera con la tablet y las devtools se la llevaba.
//
// Ahora solo se recuerda el EMAIL. La sesión viva la sostiene supabase-js (`persistSession` +
// `autoRefreshToken` en deviceClient), así que en operación normal esto no cambia nada: la caja
// arranca con su sesión y no vuelve a pedir credenciales. Si la sesión sí se pierde (caja apagada
// más allá del refresh), la pantalla de vinculación aparece con el correo puesto y solo hay que
// teclear la contraseña — que es exactamente lo que debe costar recuperar una credencial de nube.

const KEY = "vimpos.device.creds";

export type DeviceCreds = { email: string; password: string };
/** Lo que SÍ se persiste. La contraseña nunca toca el almacenamiento del navegador. */
export type DeviceIdent = { email: string };

/**
 * Email del dispositivo vinculado, si lo hay.
 * Tolera el formato viejo `{email, password}` y, al encontrarlo, borra la contraseña del disco:
 * las cajas ya instaladas se limpian solas en el primer arranque con esta versión.
 */
export function leerIdent(): DeviceIdent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<DeviceCreds>;
    if (!v?.email) return null;
    if ("password" in v) guardarIdent({ email: v.email }); // migración: reescribe sin contraseña
    return { email: v.email };
  } catch {
    return null;
  }
}

export function guardarIdent(ident: DeviceIdent): void {
  window.localStorage.setItem(KEY, JSON.stringify({ email: ident.email }));
}

export function olvidarCreds(): void {
  window.localStorage.removeItem(KEY);
}

/**
 * Prellenado SOLO para DEV: la cuenta de dispositivo del fixture (seed.sql).
 * SEC CN-011 (Cyber Neo): en producción es `null` para que la credencial del fixture
 * nunca viaje en el bundle. El gate por NODE_ENV permite tree-shaking del literal.
 */
export const CREDS_DEV_FIXTURE: DeviceCreds | null =
  process.env.NODE_ENV === "production"
    ? null
    : {
        email: "caja-99999999-0000-0000-0000-0000000000cc@dispositivos.vimpos.mx",
        password: "vim-device-dev",
      };
