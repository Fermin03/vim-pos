// C3 — Config de impresora POR DISPOSITIVO (la IP de la impresora es local a cada caja, no
// global del tenant). Se guarda en localStorage como las credenciales del dispositivo.

export type TipoImpresora = "preview" | "epson";
export type ConfigImpresora = { tipo: TipoImpresora; ip?: string; ancho?: 58 | 80 };

const KEY = "vim_impresora";

export function leerConfigImpresora(): ConfigImpresora {
  if (typeof window === "undefined") return { tipo: "preview" };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { tipo: "preview" };
    const c = JSON.parse(raw) as ConfigImpresora;
    return c.tipo === "epson" || c.tipo === "preview" ? c : { tipo: "preview" };
  } catch {
    return { tipo: "preview" };
  }
}

export function guardarConfigImpresora(c: ConfigImpresora): void {
  if (typeof window !== "undefined") window.localStorage.setItem(KEY, JSON.stringify(c));
}
