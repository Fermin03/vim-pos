"use client";
import { useEffect, useState } from "react";

/** Marca VIM (cuadro tinta con "V" y punto de acento), igual a los mockups. */
export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <div
      className="relative flex items-center justify-center rounded-lg bg-ink"
      style={{ width: size, height: size }}
    >
      <span className="font-display font-bold leading-none tracking-tight text-white" style={{ fontSize: size * 0.5 }}>
        V
      </span>
      <span className="absolute bottom-1.5 right-1.5 h-1 w-1 rounded-full bg-accent" aria-hidden="true" />
    </div>
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

/** Header fijo del POS: marca + sucursal/caja + reloj (mockup P-002 §topbar). */
export function TopbarPos({ sucursal, caja }: { sucursal: string; caja: string }) {
  const ahora = useReloj();
  return (
    <header className="flex h-[68px] flex-shrink-0 items-center justify-between border-b border-line px-8">
      <div className="flex items-center gap-4">
        <BrandMark />
        <div className="h-[26px] w-px bg-line-strong" />
        <div>
          <div className="font-display text-[15px] font-semibold tracking-tight">Knock-Out Burger</div>
          <div className="mt-px text-xs text-ink-3">
            {sucursal} · {caja}
          </div>
        </div>
      </div>
      <div className="font-display text-[15px] font-semibold tabular-nums text-ink-2">
        {ahora ? ahora.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—"}
      </div>
    </header>
  );
}
