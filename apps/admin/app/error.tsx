"use client";
import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[Admin error boundary]", error); }, [error]);
  const referencia = error.digest ? `ERR-${error.digest.slice(0, 8).toUpperCase()}` : null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 text-center">
      <div className="font-display text-[88px] font-bold leading-none tracking-tighter text-[#ECECE9] select-none">500</div>
      <h1 className="mt-2 max-w-md font-display text-[26px] font-semibold tracking-tight">Algo salió mal de nuestro lado</h1>
      <p className="mt-2 max-w-md text-[14.5px] leading-relaxed text-ink-3">
        Tuvimos un problema técnico al procesar tu solicitud. Vuelve a intentarlo en un momento.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
        <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-[14px] font-semibold text-white transition hover:brightness-95">
          Reintentar
        </button>
        <a href="mailto:soporte@vimpos.com.mx" className="inline-flex items-center gap-2 rounded-lg border border-line-strong px-5 py-2.5 text-[14px] font-semibold text-ink-2 transition hover:border-ink">
          Reportar a soporte
        </a>
      </div>
      {referencia && (
        <div className="mt-8 rounded-lg border border-line bg-sel px-4 py-2.5">
          <div className="text-[11px] font-medium uppercase tracking-wide text-ink-3">Referencia</div>
          <code className="font-mono text-[13px] font-semibold text-ink-2">{referencia}</code>
        </div>
      )}
    </main>
  );
}
