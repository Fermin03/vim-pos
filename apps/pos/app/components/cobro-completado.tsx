"use client";
import { useCallback, useEffect, useState } from "react";
import { fmtMxn } from "../lib/turno";

/** Segundos antes de abrir el ticket nuevo solo. */
export const SEGUNDOS_REGRESO = 5;

/**
 * "Cobro completado": el cambio en grande y el regreso SOLO a un ticket nuevo.
 *
 * Antes la ventana esperaba a que alguien tocara "Nuevo ticket", y el cambio salía a 20px en una
 * caja con borde: justo el número con el que la cajera cuenta el dinero, y el más chico de la
 * pantalla. Ahora el cambio va a 72px y la venta se cierra sola a los 5 s (decisión de Fermín,
 * 25 sep 2026), con una barra que dice cuánto falta.
 *
 * La cuenta se DETIENE, y no vuelve a correr, en cuanto la cajera toma el control: "Imprimir copia",
 * el recibo en pantalla que se abre solo cuando no hay impresora, el aviso de un reparto sin
 * repartidor, o un ticket que no se pudo armar. Cerrarle a alguien lo que está viendo es peor que
 * hacerle tocar un botón.
 *
 * Si la cuenta llega a cero mientras el ticket todavía se arma, espera a que termine: el ticket
 * nuevo limpia el recibo, y un recibo a medio armar se quedaría sin imprimir.
 */
export function CobroCompletado({
  folio,
  cambio,
  total,
  estadoTicket,
  puedeImprimir,
  pausa,
  onImprimirCopia,
  onNuevoTicket,
}: {
  folio: string | null;
  cambio: number;
  total: number | null;
  estadoTicket: "idle" | "lista" | "error";
  /** El recibo ya se armó. */
  puedeImprimir: boolean;
  /** Algo se abrió encima (recibo, aviso): la cuenta se detiene. */
  pausa: boolean;
  onImprimirCopia: () => void;
  onNuevoTicket: () => void;
}) {
  const [restante, setRestante] = useState(SEGUNDOS_REGRESO);
  const [detenida, setDetenida] = useState(false);
  const parada = detenida || estadoTicket === "error";

  useEffect(() => {
    if (pausa) setDetenida(true);
  }, [pausa]);

  useEffect(() => {
    if (parada || pausa) return;
    if (restante <= 0) {
      if (estadoTicket !== "idle") onNuevoTicket();
      return;
    }
    const t = setTimeout(() => setRestante((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [parada, pausa, restante, estadoTicket, onNuevoTicket]);

  // La barra se vacía con WAAPI: transform en el compositor, lineal porque es un reloj. Arranca
  // con el componente, igual que el conteo.
  const barra = useCallback((el: HTMLDivElement | null) => {
    el?.animate([{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], {
      duration: SEGUNDOS_REGRESO * 1000,
      easing: "linear",
      fill: "forwards",
    });
  }, []);

  const conCambio = cambio > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-labelledby="cobro-completado-titulo">
      <section className="flex w-full max-w-[560px] flex-col items-center gap-1.5 rounded-lg bg-surface px-8 pb-6 pt-8 text-center shadow-xl">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-soft text-success">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h2 id="cobro-completado-titulo" className="mt-2.5 font-display text-[22px] font-semibold tracking-[-0.02em]">
          Cobro completado
        </h2>
        {folio && <div className="text-[13px] text-ink-3">Ticket {folio}</div>}

        {conCambio ? (
          <>
            <div className="mt-3 text-[16px] font-semibold text-success">Entrega de cambio</div>
            <div className="font-display text-[72px] font-bold leading-none tracking-[-0.03em] tabular-nums text-success">
              {fmtMxn(cambio)}
            </div>
            {total != null && (
              <div className="mt-2 text-[16px] font-medium tabular-nums text-ink-2">
                Recibió {fmtMxn(total + cambio)} · Total {fmtMxn(total)}
              </div>
            )}
          </>
        ) : (
          total != null && (
            <div className="mt-2 text-[16px] font-medium tabular-nums text-ink-2">Total {fmtMxn(total)} · sin cambio</div>
          )
        )}

        {estadoTicket === "error" && (
          <p className="mt-2 text-[14px] font-medium text-danger" role="alert">
            El ticket del cliente no se pudo armar.
          </p>
        )}

        <div className="mt-5 flex w-full gap-2.5">
          <button
            type="button"
            onClick={() => {
              setDetenida(true);
              onImprimirCopia();
            }}
            disabled={!puedeImprimir}
            className="h-14 w-[180px] flex-shrink-0 rounded-lg border border-line-strong bg-surface text-[16px] font-semibold text-ink transition-[transform,border-color] duration-150 ease-vim hover:border-ink active:scale-[.98] disabled:cursor-default disabled:opacity-50"
          >
            {puedeImprimir || estadoTicket === "error" ? "Imprimir copia" : "Preparando…"}
          </button>
          <button
            type="button"
            onClick={onNuevoTicket}
            className="h-14 min-w-0 flex-1 rounded-lg bg-accent font-display text-[18px] font-bold text-white transition-[transform,background-color] duration-150 ease-vim hover:bg-accent-hover active:scale-[.98]"
          >
            Nuevo ticket ahora
          </button>
        </div>

        {!parada && !pausa && (
          <div className="mt-3.5 flex w-full flex-col gap-2">
            <div className="text-[15px] font-medium tabular-nums text-ink-2">
              {restante > 0 ? (
                <>
                  Se abre un ticket nuevo en <b className="text-ink">{restante} s</b>
                </>
              ) : (
                "Terminando el ticket…"
              )}
            </div>
            <div className="h-1 overflow-hidden rounded-sm bg-line">
              <div ref={barra} className="h-1 origin-left bg-accent" />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
