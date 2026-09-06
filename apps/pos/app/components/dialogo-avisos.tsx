"use client";
import { useState } from "react";
import { marcarAvisoVisto, type Aviso, type NivelAviso } from "../lib/directivas";

/** Colores por nivel. `danger` es lo que impide o rompe algo; `warning`, lo que hay que atender. */
const ESTILO: Record<NivelAviso, { cabecera: string; texto: string; etiqueta: string }> = {
  info: { cabecera: "bg-[#EAF3FB]", texto: "text-[#0063A8]", etiqueta: "Aviso de VIM" },
  warning: { cabecera: "bg-[#F6EEDD]", texto: "text-warning", etiqueta: "Atención" },
  danger: { cabecera: "bg-[#FBECEA]", texto: "text-danger", etiqueta: "Importante" },
};

/**
 * Avisos de VIM, de uno en uno (ADR 0014, entrega 3).
 *
 * De uno en uno y no en lista: un cajero con prisa cierra una lista sin leer nada, y el acuse
 * diría que la leyó. Así cada aviso cuesta un toque y el acuse significa algo.
 *
 * Nunca impide vender: el diálogo se cierra siempre, incluso si el acuse no se pudo registrar.
 * Lo peor que pasa entonces es que el aviso vuelva a salir en el siguiente turno.
 */
export function DialogoAvisos({ avisos, onCerrar }: { avisos: Aviso[]; onCerrar: () => void }) {
  const [i, setI] = useState(0);
  const [pasando, setPasando] = useState(false);
  const aviso = avisos[i];
  if (!aviso) return null;

  const e = ESTILO[aviso.nivel];

  async function siguiente() {
    if (pasando || !aviso) return;
    setPasando(true);
    await marcarAvisoVisto(aviso.id);   // no lanza nunca
    if (i + 1 < avisos.length) { setI(i + 1); setPasando(false); }
    else onCerrar();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-6" role="dialog" aria-modal="true" aria-label={aviso.titulo}>
      <div className="w-full max-w-lg overflow-hidden rounded-lg bg-surface shadow-xl">
        <div className={["px-6 py-3", e.cabecera].join(" ")}>
          <div className={["text-[11.5px] font-bold uppercase tracking-wide", e.texto].join(" ")}>{e.etiqueta}</div>
          <h2 className="mt-0.5 font-display text-[19px] font-bold tracking-tight">{aviso.titulo}</h2>
        </div>
        {/* Texto plano: el cuerpo lo escribe VIM y se renderiza como texto, nunca como HTML. */}
        <p className="whitespace-pre-wrap px-6 py-5 text-[15px] leading-relaxed text-ink-2">{aviso.cuerpo}</p>
        <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
          {avisos.length > 1 ? (
            <span className="text-[12.5px] text-ink-3">{i + 1} de {avisos.length}</span>
          ) : <span />}
          <button
            type="button"
            onClick={siguiente}
            disabled={pasando}
            className="h-12 min-w-[140px] rounded bg-ink px-6 text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
          >
            {aviso.requiere_confirmacion ? "Entendido" : "Cerrar"}
          </button>
        </div>
      </div>
    </div>
  );
}
