"use client";
import { useEffect, useRef } from "react";

/**
 * Captcha Cloudflare Turnstile: el registro público del admin (0142, ADR 0022) y, en la tienda en
 * línea, el envío de un pedido, el registro de una cuenta y el pedir recuperar la contraseña. Es UN solo widget de Cloudflare para las dos apps: las funciones
 * comparten `TURNSTILE_SECRET_KEY`.
 *
 * Sin `NEXT_PUBLIC_TURNSTILE_SITE_KEY` no pinta nada y no carga ningún script: el formulario manda
 * un token vacío y la Edge Function, sin su secreto, tampoco verifica (local y hasta que se creen
 * las llaves). Con la llave, el widget casi siempre se resuelve solo, sin que la persona haga nada.
 *
 * Un token sirve UNA vez. Quien lo usa sube `reinicio` después de cada envío para pedir otro.
 * CSP de la app que lo use: script-src y frame-src https://challenges.cloudflare.com (next.config.mjs).
 */
export const SITE_KEY_TURNSTILE = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

type Turnstile = {
  render(el: HTMLElement, o: Record<string, unknown>): string;
  reset(id?: string): void;
  remove(id?: string): void;
};
declare global {
  interface Window { turnstile?: Turnstile }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let cargando: Promise<void> | null = null;

function cargarScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (!cargando) {
    cargando = new Promise<void>((ok, mal) => {
      const s = document.createElement("script");
      s.src = SCRIPT;
      s.async = true;
      s.onload = () => ok();
      s.onerror = () => { cargando = null; mal(new Error("No cargó el captcha")); };
      document.head.appendChild(s);
    });
  }
  return cargando;
}

export type AccionCaptcha = "registro" | "reenvio" | "tienda_pedido" | "tienda_registro" | "tienda_recuperar";

/**
 * `accion` viaja dentro del token y la función la comprueba: un token resuelto para reenviar el
 * correo no sirve para dar de alta ni para mandar un pedido, y al revés.
 */
export function Captcha({ onToken, accion, reinicio = 0 }: { onToken: (token: string) => void; accion: AccionCaptcha; reinicio?: number }) {
  const caja = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const cb = useRef(onToken);
  cb.current = onToken;

  useEffect(() => {
    if (!SITE_KEY_TURNSTILE) return;
    let vivo = true;
    cargarScript()
      .then(() => {
        if (!vivo || !caja.current || !window.turnstile || id.current) return;
        id.current = window.turnstile.render(caja.current, {
          sitekey: SITE_KEY_TURNSTILE,
          action: accion,
          language: "es",
          theme: "light",   // ninguna app que lo usa tiene tema oscuro
          appearance: "interaction-only",
          callback: (t: string) => cb.current(t),
          "expired-callback": () => cb.current(""),
          "error-callback": () => cb.current(""),
        });
      })
      .catch(() => cb.current(""));
    return () => {
      vivo = false;
      if (id.current && window.turnstile) window.turnstile.remove(id.current);
      id.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- el widget se crea una vez; la acción no cambia
  }, []);

  // Pedir un token nuevo después de cada envío (el anterior ya se gastó).
  useEffect(() => {
    if (reinicio > 0 && id.current && window.turnstile) {
      cb.current("");
      window.turnstile.reset(id.current);
    }
  }, [reinicio]);

  if (!SITE_KEY_TURNSTILE) return null;
  return <div ref={caja} className="min-h-0" />;
}
