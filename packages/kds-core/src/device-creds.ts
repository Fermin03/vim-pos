"use client";
// Credenciales del dispositivo. En producción se provisionan en el setup y viven en el
// almacenamiento del dispositivo; aquí usamos localStorage como stand-in.

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
