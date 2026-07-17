// C3 — Config de impresora POR DISPOSITIVO (la IP de la impresora es local a cada caja, no
// global del tenant). Se guarda en localStorage como las credenciales del dispositivo.

// 'epson'    → Epson de red, protocolo ePOS-Print por HTTP (/cgi-bin/epos).
// 'generica' → cualquier impresora ESC/POS por el puerto RAW 9100 (Soluciones MyPOS, Xprinter,
//              3nStar, etc.). El navegador no abre sockets TCP, así que el envío lo hace el proceso
//              de Electron vía el relay local (ui-server /__imprimir → main).
export type TipoImpresora = "preview" | "epson" | "generica";
export type ConfigImpresora = { tipo: TipoImpresora; ip?: string; puerto?: number; ancho?: 58 | 80 };

/** Puerto RAW por defecto de las impresoras de tickets (JetDirect/RAW). */
export const PUERTO_RAW = 9100;

const KEY = "vim_impresora";

export function leerConfigImpresora(): ConfigImpresora {
  if (typeof window === "undefined") return { tipo: "preview" };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { tipo: "preview" };
    const c = JSON.parse(raw) as ConfigImpresora;
    return c.tipo === "epson" || c.tipo === "generica" || c.tipo === "preview" ? c : { tipo: "preview" };
  } catch {
    return { tipo: "preview" };
  }
}

export function guardarConfigImpresora(c: ConfigImpresora): void {
  if (typeof window !== "undefined") window.localStorage.setItem(KEY, JSON.stringify(c));
}
