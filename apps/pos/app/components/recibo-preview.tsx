"use client";
import { useEffect, useRef, useState } from "react";
import type { DatosTicketImpresion } from "../lib/print/tipos";
import type { DatosComanda } from "../lib/print/comanda-builder";
import type { DatosReporteZ } from "../lib/print/reporte-z-builder";
import { ReciboTicket } from "./recibo-ticket";
import { ReciboComanda } from "./recibo-comanda";
import { ReciboZ } from "./recibo-z";

/**
 * Overlay del recibo en pantalla: renderiza componentes fieles a P-222/P-223/P-226
 * (ReciboTicket / ReciboComanda / ReciboZ) con los datos crudos. Toggle Cliente|Cocina
 * visible si hay datosComanda.
 *
 * El PrintJob/escpos sigue intacto para impresión real; este componente es solo
 * lo que ve el cajero en pantalla. Ambos parten de la misma fuente de datos.
 */
export function ReciboPreview({
  datosTicket,
  datosComanda,
  datosZ,
  onImprimir,
  onCerrar,
  onNuevoTicket,
  etiquetaCerrar = "Cerrar",
  autoImprimir = false,
}: {
  /** Camino preferido (P-222 fiel). */
  datosTicket?: DatosTicketImpresion;
  /** Comanda fiel (P-223); activa el toggle Cliente|Cocina si está presente. */
  datosComanda?: DatosComanda;
  /** Reporte Z fiel (P-226). Si se provee, se renderiza directamente. */
  datosZ?: DatosReporteZ;
  /** Recibe la vista activa para que el caller imprima ticket o comanda según el toggle. */
  onImprimir: (vista: "cliente" | "cocina") => void;
  onCerrar: () => void;
  /** Si se provee, muestra un botón primario "Nuevo ticket" para cerrar y arrancar la siguiente venta. */
  onNuevoTicket?: () => void;
  /** Texto del botón que cierra la vista. "Cerrar" sirve para un ticket que se está
   *  consultando; en el corte de turno lo que se hace es VOLVER, y decirlo así evita
   *  que el cajero dude de si "cerrar" le cierra algo más. */
  etiquetaCerrar?: string;
  /** Manda a imprimir sola al aparecer, una única vez.
   *
   *  Para el corte de turno: es un documento que SIEMPRE se imprime —se firma y se
   *  guarda con el efectivo— así que hacer que el cajero lo pida es un paso de más al
   *  final de la jornada, justo cuando tiene prisa. La vista queda en pantalla para
   *  poder reimprimir si la impresora falló. */
  autoImprimir?: boolean;
}) {
  const [vista, setVista] = useState<"cliente" | "cocina">("cliente");

  /* Una sola vez por montaje: un re-render no debe sacar un segundo papel. Mismo
     patrón que la apertura del cajón al abrir turno. */
  const yaImprimio = useRef(false);
  useEffect(() => {
    if (!autoImprimir || yaImprimio.current) return;
    yaImprimio.current = true;
    onImprimir("cliente");
    // `onImprimir` suele venir como función en línea (identidad nueva en cada render);
    // incluirla en las dependencias volvería a disparar la impresión. El ref ya
    // garantiza la vez única, y la intención es "al aparecer".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoImprimir]);
  const enCocina = vista === "cocina" && !!datosComanda;
  const titulo = datosZ ? "Reporte Z · 80mm" : enCocina ? "Comanda · 80mm" : "Ticket · 80mm";
  const usaDatos = !!datosTicket;
  const conToggle = !!(datosTicket && datosComanda);

  return (
    <div data-overlay-imprimible className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-ink/40 p-6" role="dialog" aria-modal="true">
      <div className="w-full max-w-[360px]">
        {/* Barra */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-13 font-semibold text-white">{titulo}</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => onImprimir(enCocina ? "cocina" : "cliente")} className="rounded border border-white/40 px-3 py-1.5 text-13 font-semibold text-white hover:bg-white/10">Imprimir</button>
            {onNuevoTicket ? (
              <button type="button" onClick={onNuevoTicket} className="rounded bg-accent px-3 py-1.5 text-13 font-semibold text-white hover:bg-accent-hover">Nuevo ticket</button>
            ) : (
              <button type="button" onClick={onCerrar} className="rounded bg-white px-3 py-1.5 text-13 font-semibold text-ink hover:bg-hover">{etiquetaCerrar}</button>
            )}
          </div>
        </div>

        {/* Toggle Cliente | Cocina (no aplica para Reporte Z) */}
        {conToggle && !datosZ && (
          <div className="mx-auto mb-3 inline-flex w-full overflow-hidden rounded-full border border-white/30 bg-ink/40 p-[3px]">
            <button
              type="button"
              onClick={() => setVista("cliente")}
              className={["flex-1 rounded-full px-3 py-1.5 text-13 font-semibold transition", vista === "cliente" ? "bg-white text-ink" : "text-white/85 hover:text-white"].join(" ")}
            >
              Cliente
            </button>
            <button
              type="button"
              onClick={() => setVista("cocina")}
              className={["flex-1 rounded-full px-3 py-1.5 text-13 font-semibold transition", vista === "cocina" ? "bg-white text-ink" : "text-white/85 hover:text-white"].join(" ")}
            >
              Cocina
            </button>
          </div>
        )}

        {/* Render — data-imprimible delimita lo que sale por window.print() (config Preview) */}
        <div data-imprimible>
          {datosZ
            ? <ReciboZ datos={datosZ} />
            : usaDatos
              ? (enCocina && datosComanda
                  ? <ReciboComanda datos={datosComanda} />
                  : <ReciboTicket datos={datosTicket!} />)
              : null}
        </div>
      </div>
    </div>
  );
}
