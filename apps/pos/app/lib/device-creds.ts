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

/**
 * Prellenado SOLO para DEV: la cuenta de dispositivo del fixture (seed.sql).
 *
 * El email es público por diseño (es un identificador, no un secreto).
 * El password se lee de NEXT_PUBLIC_VIM_DEV_DEVICE_PASSWORD (apps/pos/.env.local)
 * para no tener un string-que-parece-credencial commiteado al repo. Default:
 * `change_me_local_dev_only` (alineado con vim.dev_password de seed.sql).
 * En producción esta constante NO se usa: el dispositivo se provisiona en setup.
 */
export const CREDS_DEV_FIXTURE: DeviceCreds = {
  email: "caja-99999999-0000-0000-0000-0000000000cc@dispositivos.vimpos.mx",
  password: process.env.NEXT_PUBLIC_VIM_DEV_DEVICE_PASSWORD ?? "change_me_local_dev_only",
};
