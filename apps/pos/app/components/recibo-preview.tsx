"use client";
import { QRCodeSVG } from "qrcode.react";
import type { Bloque, PrintJob } from "../lib/print/tipos";

function BloqueView({ bl }: { bl: Bloque }) {
  switch (bl.t) {
    case "texto": {
      const align = bl.align === "centro" ? "text-center" : bl.align === "der" ? "text-right" : "text-left";
      const size = bl.size === 3 ? "text-[18px]" : bl.size === 2 ? "text-[15px]" : "text-[10px]";
      return <div className={`${align} ${bl.bold ? "font-bold" : ""} ${size} whitespace-pre-wrap leading-snug`}>{bl.valor}</div>;
    }
    case "fila":
      return (
        <div className="flex justify-between gap-2 text-[11px]">
          <span className="whitespace-pre-wrap">{bl.izq}</span>
          <span className="whitespace-nowrap font-semibold">{bl.der}</span>
        </div>
      );
    case "separador":
      return <div className={`my-2 border-t ${bl.estilo === "solido" ? "border-[#888]" : "border-dashed border-[#B0B0B0]"}`} />;
    case "qr":
      return (
        <div className="my-2 flex justify-center">
          <QRCodeSVG value={bl.valor} size={92} level="M" />
        </div>
      );
    case "corte":
      return <div className="mt-3 text-center text-[9px] tracking-[0.3em] text-[#999]">— — — — — — — —</div>;
  }
}

export function ReciboPreview({
  job,
  onImprimir,
  onCerrar,
  onNuevoTicket,
}: {
  job: PrintJob;
  onImprimir: () => void;
  onCerrar: () => void;
  /** Si se provee, muestra un botón primario "Nuevo ticket" para cerrar y arrancar la siguiente venta. */
  onNuevoTicket?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-ink/40 p-6" role="dialog" aria-modal="true">
      <div className="w-full max-w-[360px]">
        {/* Barra */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-white">Ticket · 80mm</span>
          <div className="flex gap-2">
            <button type="button" onClick={onImprimir} className="rounded border border-white/40 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-white/10">Imprimir</button>
            {onNuevoTicket ? (
              <button type="button" onClick={onNuevoTicket} className="rounded bg-accent px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-accent-hover">Nuevo ticket</button>
            ) : (
              <button type="button" onClick={onCerrar} className="rounded bg-white px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-hover">Cerrar</button>
            )}
          </div>
        </div>
        {/* Papel */}
        <div className="mx-auto w-[302px] bg-white px-5 py-6 font-mono text-[#1a1a1a] shadow-[0_4px_24px_rgba(0,0,0,.25)]">
          {job.bloques.map((bl, i) => (
            <BloqueView key={i} bl={bl} />
          ))}
        </div>
      </div>
    </div>
  );
}
