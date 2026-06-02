"use client";
// Credenciales del dispositivo. En producción se provisionan en el setup (doc 10) y
// viven en el almacenamiento SEGURO del dispositivo. Aquí (F3, web/dev) usamos
// localStorage como stand-in: el flujo real de provisión solo reemplaza este origen.

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

/** Prellenado SOLO para DEV: la cuenta de dispositivo del fixture (seed.sql). */
export const CREDS_DEV_FIXTURE: DeviceCreds = {
  email: "caja-99999999-0000-0000-0000-0000000000cc@dispositivos.vimpos.mx",
  password: "vim-device-dev",
};
