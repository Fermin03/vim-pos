"use client";
// Credenciales del dispositivo. En producción se provisionan en el setup y viven en el
// almacenamiento del dispositivo; aquí usamos localStorage como stand-in.
//
// ⚠️ SEC CN-006 — PENDIENTE A PROPÓSITO. En apps/pos ya no se guarda la contraseña (solo el
// correo): esa credencial vale también contra la nube, donde habilita sync-pull, que devuelve el
// snapshot del tenant con los pin_hash de toda la plantilla. Aquí NO se ha quitado porque el
// arranque de la cocina depende de ella: apps/kds/app/page.tsx hace un deviceSignIn FRESCO en cada
// boot, con timeout, precisamente para no colgarse cuando el hub no responde (getSession() y el
// refresh de supabase-js no aceptan timeout). Quitar la contraseña sin resolver antes ese cuelgue
// dejaría la pantalla de cocina en negro cuando la caja tarda en levantar — peor que el riesgo que
// se quiere cerrar.
//
// Para cerrarlo: dar a la sesión persistida un camino con timeout propio (p. ej. una llamada
// directa a /auth/v1/user con AbortSignal en vez de getSession()) y entonces guardar solo el
// correo, como en apps/pos/app/lib/device-creds.ts.

const KEY = "vimpos.device.creds";

export type DeviceCreds = { email: string; password: string };

export function leerCreds(): DeviceCreds | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DeviceCreds) : null;
  } catch {
    return null;
  }
}

export function guardarCreds(creds: DeviceCreds): void {
  window.localStorage.setItem(KEY, JSON.stringify(creds));
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
        email: "caja-99999999-0000-0000-0000-0000000000cc@dispositivos.vimpos.mx",
        password: "vim-device-dev",
      };
