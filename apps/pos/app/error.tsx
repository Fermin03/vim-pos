"use client";
import { useEffect } from "react";
import { PantallaEstado } from "./components/pantalla-estado";

const btnAccent = "inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-[14px] font-semibold text-white transition hover:brightness-95";
const btnGhost = "inline-flex items-center gap-2 rounded-lg border border-line-strong px-5 py-2.5 text-[14px] font-semibold text-ink-2 transition hover:border-ink";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Telemetría mínima en consola; en prod lo recoge Vercel.
    console.error("[POS error boundary]", error);
  }, [error]);

  const referencia = error.digest ? `ERR-${error.digest.slice(0, 8).toUpperCase()}` : undefined;

  return (
    <PantallaEstado
      codigo="500"
      titulo="Algo salió mal de nuestro lado"
      texto="No es por algo que hayas hecho. Tuvimos un problema técnico al procesar tu solicitud. Vuelve a intentarlo en un momento."
      acciones={
        <>
          <button type="button" onClick={reset} className={btnAccent}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
            Reintentar
          </button>
          <a href="mailto:soporte@vimpos.com.mx" className={btnGhost}>Reportar a soporte</a>
        </>
      }
      referencia={referencia}
      pie={referencia ? "Si el problema continúa, comparte la referencia con soporte." : "Si el problema continúa, contacta a soporte."}
    />
  );
}
