"use client";
// Identidad del dispositivo de cocina recordada entre recargas.
//
// SEC CN-006 — CERRADO (auditoría integral 30/09/2026, B2-5). Antes aquí vivía `{ email, password }`
// en claro en localStorage. Esa contraseña vale también contra la nube, donde habilita sync-pull
// (snapshot del tenant con los pin_hash de toda la plantilla): cualquier XSS o cualquiera con la
// tele y las devtools se la llevaba. Se había dejado a propósito porque el arranque hacía un
// deviceSignIn FRESCO en cada boot para no colgarse cuando el hub no responde (getSession() y el
// refresh de supabase-js no aceptaban timeout).
//
// Cómo se cerró, igual que en apps/pos/app/lib/device-creds.ts:
//  - Aquí solo se guarda el EMAIL. La sesión viva la sostiene supabase-js (`persistSession` +
//    `autoRefreshToken` en deviceClient).
//  - El cuelgue se resolvió en cliente.ts: el deviceClient de cocina usa un `fetch` con timeout en
//    las llamadas de /auth/v1, así que getSession()/refresh ya no pueden colgarse (y liberan su
//    candado), y `sesionDispositivo()` distingue "no hay sesión" (→ vincular) de "el hub no
//    responde" (→ reconectando, que reintenta solo).
//  - Migración: una tele ya instalada trae la contraseña guardada. `leerCredsLegadas()` la entrega
//    UNA vez para abrir sesión si no hay una viva, y `leerIdent()`/`guardarIdent()` la borran del
//    disco en cuanto hay sesión.

const KEY = "vimpos.device.creds";

export type DeviceCreds = { email: string; password: string };
/** Lo que SÍ se persiste. La contraseña nunca toca el almacenamiento del navegador. */
export type DeviceIdent = { email: string };

function leerCrudo(): Partial<DeviceCreds> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? (v as Partial<DeviceCreds>) : null;
  } catch {
    return null;
  }
}

/** Email del dispositivo vinculado, si lo hay. NO borra una contraseña legada: eso lo hace
 *  `guardarIdent` cuando ya hay sesión (si no, una tele con el hub caído perdería su única
 *  forma de volver a entrar). */
export function leerIdent(): DeviceIdent | null {
  const v = leerCrudo();
  return typeof v?.email === "string" && v.email ? { email: v.email } : null;
}

/** Credenciales del formato VIEJO (con contraseña), solo para migrar una tele ya instalada. */
export function leerCredsLegadas(): DeviceCreds | null {
  const v = leerCrudo();
  return typeof v?.email === "string" && v.email && typeof v.password === "string" && v.password
    ? { email: v.email, password: v.password }
    : null;
}

/** Guarda SOLO el correo (y con eso borra cualquier contraseña legada). */
export function guardarIdent(ident: DeviceIdent): void {
  window.localStorage.setItem(KEY, JSON.stringify({ email: ident.email }));
}

export function olvidarCreds(): void {
  window.localStorage.removeItem(KEY);
}

/**
 * Prellenado SOLO para DEV: la cuenta de dispositivo del fixture (seed.sql).
 * En producción es `null` para que la credencial del fixture nunca viaje en el bundle.
 */
export const CREDS_DEV_FIXTURE: DeviceCreds | null =
  process.env.NODE_ENV === "production"
    ? null
    : {
        email: "caja-99999999-0000-0000-0000-0000000000cc@dispositivos.vimpos.com.mx",
        password: "vim-device-dev",
      };
