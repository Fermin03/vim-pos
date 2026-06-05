"use client";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { Bloque, DatosTicketImpresion, PrintJob } from "../lib/print/tipos";
import type { DatosComanda } from "../lib/print/comanda-builder";
import { ReciboTicket } from "./recibo-ticket";
import { ReciboComanda } from "./recibo-comanda";

/**
 * Overlay del recibo en pantalla. Hay dos caminos:
 *   1) Cliente/Cocina con datos crudos → renderiza componentes fieles a P-222/P-223
 *      (vía ReciboTicket / ReciboComanda). Toggle visible si hay datosComanda.
 *   2) Fallback `job` (PrintJob): renderiza bloque a bloque (estilo genérico).
 *      Lo usa el Reporte Z (que aún no tiene componente fiel a P-226).
 *
 * El PrintJob/escpos sigue intacto para impresión real; este componente es solo
 * lo que ve el cajero en pantalla. Ambos caminos parten de la misma fuente de datos.
 */
export function ReciboPreview({
  datosTicket,
  datosComanda,
  job,
  onImprimir,
  onCerrar,
  onNuevoTicket,
}: {
  /** Camino preferido (P-222 fiel). */
  datosTicket?: DatosTicketImpresion;
  /** Comanda fiel (P-223); activa el toggle Cliente|Cocina si está presente. */
  datosComanda?: DatosComanda;
  /** Fallback genérico (e.g. Reporte Z) — usado solo si no hay datosTicket. */
  job?: PrintJob;
  onImprimir: () => void;
  onCerrar: () => void;
  /** Si se provee, muestra un botón primario "Nuevo ticket" para cerrar y arrancar la siguiente venta. */
  onNuevoTicket?: () => void;
}) {
  const [vista, setVista] = useState<"cliente" | "cocina">("cliente");
  const enCocina = vista === "cocina" && !!datosComanda;
  const titulo = enCocina ? "Comanda · 80mm" : "Ticket · 80mm";
  const usaDatos = !!datosTicket;
  const conToggle = !!(datosTicket && datosComanda);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-ink/40 p-6" role="dialog" aria-modal="true">
      <div className="w-full max-w-[360px]">
        {/* Barra */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-white">{titulo}</span>
          <div className="flex gap-2">
            <button type="button" onClick={onImprimir} className="rounded border border-white/40 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-white/10">Imprimir</button>
            {onNuevoTicket ? (
              <button type="button" onClick={onNuevoTicket} className="rounded bg-accent px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-accent-hover">Nuevo ticket</button>
            ) : (
              <button type="button" onClick={onCerrar} className="rounded bg-white px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-hover">Cerrar</button>
            )}
          </div>
        </div>

        {/* Toggle Cliente | Cocina */}
        {conToggle && (
          <div className="mx-auto mb-3 inline-flex w-full overflow-hidden rounded-full border border-white/30 bg-ink/40 p-[3px]">
            <button
              type="button"
              onClick={() => setVista("cliente")}
              className={["flex-1 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition", vista === "cliente" ? "bg-white text-ink" : "text-white/85 hover:text-white"].join(" ")}
            >
              Cliente
            </button>
            <button
              type="button"
              onClick={() => setVista("cocina")}
              className={["flex-1 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition", vista === "cocina" ? "bg-white text-ink" : "text-white/85 hover:text-white"].join(" ")}
            >
              Cocina
            </button>
          </div>
        )}

        {/* Render */}
        {usaDatos
          ? (enCocina && datosComanda
              ? <ReciboComanda datos={datosComanda} />
              : <ReciboTicket datos={datosTicket!} />)
          : job
            ? <PrintJobFallback job={job} />
            : null}
      </div>
    </div>
  );
}

// ─── Fallback genérico desde PrintJob (Reporte Z, etc.) ──────────────────────

function PrintJobFallback({ job }: { job: PrintJob }) {
  return (
    <div className="mx-auto w-[302px] bg-white px-5 py-6 font-mono text-[#1a1a1a] shadow-[0_4px_24px_rgba(0,0,0,.25)]">
      {job.bloques.map((bl, i) => <BloqueView key={i} bl={bl} />)}
    </div>
  );
}

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
