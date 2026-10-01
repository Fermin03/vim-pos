"use client";
import { useEffect, useState } from "react";
import { LogoVim } from "@vim/ui/styles";

/** Marca VIM: el isotipo vigente (`LogoVim`). Era el último sitio que aún dibujaba a mano el cuadro
 *  negro con la "V" de los mockups: topbar del selector de cajero, vincular y pantalla de estado. */
export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <span className="block flex-shrink-0" style={{ width: size, height: size }}>
      <LogoVim className="h-full w-full" />
    </span>
  );
}

/** Reloj vivo HH:MM (se actualiza cada 20 s). Devuelve null hasta el primer tick (SSR-safe). */
export function useReloj(): Date | null {
  const [ahora, setAhora] = useState<Date | null>(null);
  useEffect(() => {
    setAhora(new Date());
    const id = setInterval(() => setAhora(new Date()), 20000);
    return () => clearInterval(id);
  }, []);
  return ahora;
}

/** Header fijo del POS: marca + negocio/sucursal/caja + reloj (mockup P-002 §topbar).
 *
 * `negocio` llegó tarde y hasta entonces aquí decía "Knock-Out Burger" escrito a
 * mano. En un producto multi-tenant eso significa que el segundo cliente ve el
 * nombre del primero en su propia caja — y en las capturas del sitio habría
 * publicado el nombre de un cliente real.
 *
 * El valor por omisión es la marca del producto, nunca un cliente: si un día
 * vuelve a faltar el dato, se ve "VIM POS" y no el negocio de otro. */
export function TopbarPos({
  negocio = "VIM POS",
  sucursal,
  caja,
}: {
  negocio?: string;
  sucursal: string;
  caja: string;
}) {
  const ahora = useReloj();
  return (
    <header className="flex h-[68px] flex-shrink-0 items-center justify-between border-b border-line px-8">
      <div className="flex items-center gap-4">
        <BrandMark />
        <div className="h-[26px] w-px bg-line-strong" />
        <div>
          <div className="font-display text-15 font-semibold tracking-tight">{negocio}</div>
          <div className="mt-px text-xs text-ink-3">
            {sucursal} · {caja}
          </div>
        </div>
      </div>
      <div className="font-display text-15 font-semibold tabular-nums text-ink-2">
        {ahora ? ahora.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—"}
      </div>
    </header>
  );
}
