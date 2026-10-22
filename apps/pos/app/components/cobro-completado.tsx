"use client";
import { useCallback, useEffect, useState } from "react";
import { fmtMxn } from "../lib/turno";
import { BotonPrincipal, BotonSecundario, PantallaCobro } from "./cobro/pantalla-cobro";

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
  aCredito = false,
  estadoTicket,
  puedeImprimir,
  sinImpresora = false,
  pausa,
  onImprimirCopia,
  onNuevoTicket,
}: {
  folio: string | null;
  cambio: number;
  /** null = la cuenta se cerró sin cobrar nada (ya estaba cubierta): «Sin cobro». */
  total: number | null;
  /** Venta a crédito: no entró dinero, y en vez de «Sin cobro» dice «A crédito». */
  aCredito?: boolean;
  estadoTicket: "idle" | "lista" | "error";
  /** El recibo ya se armó. */
  puedeImprimir: boolean;
  /** La caja no tiene impresora: no hay copia que sacar (y ya no se abre el recibo en pantalla). */
  sinImpresora?: boolean;
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

  // Pantalla completa como el resto del cobro (spec 2026-10-21): sin palomita y sin botón arriba a
  // la derecha (pedido de Fermín); el cambio es lo más grande de la pantalla.
  return (
    <PantallaCobro
      regresar={null}
      contexto={folio ? `Ticket ${folio}` : "Cobro completado"}
      pie={
        <>
          {estadoTicket === "error" && (
            <p className="mb-3 text-center text-16 font-medium text-danger" role="alert">
              El ticket del cliente no se pudo armar.
            </p>
          )}
          {sinImpresora ? (
            <BotonPrincipal onClick={onNuevoTicket}>Nueva venta</BotonPrincipal>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <BotonSecundario
                onClick={() => {
                  setDetenida(true);
                  onImprimirCopia();
                }}
                disabled={!puedeImprimir}
              >
                {puedeImprimir || estadoTicket === "error" ? "Imprimir copia" : "Preparando…"}
              </BotonSecundario>
              <BotonPrincipal onClick={onNuevoTicket}>Nueva venta</BotonPrincipal>
            </div>
          )}
          {!parada && !pausa && (
            <div className="mt-4 flex flex-col gap-2">
              <div className="h-1 overflow-hidden rounded-sm bg-line">
                <div ref={barra} className="h-1 origin-left bg-ink-3" />
              </div>
              <div className="text-center text-15 font-medium tabular-nums text-ink-3">
                {restante > 0 ? `Nueva venta en ${restante} s` : "Terminando el ticket…"}
              </div>
            </div>
          )}
        </>
      }
    >
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <h2 className="sr-only">Cobro completado</h2>
        {conCambio ? (
          <>
            {total != null && (
              <div className="font-display text-28 font-bold tabular-nums text-ink-2">Recibió {fmtMxn(total + cambio)}</div>
            )}
            <div className="mt-1 font-display text-[88px] font-bold leading-tight tracking-[-0.03em] tabular-nums text-success">
              {fmtMxn(cambio)} de cambio
            </div>
          </>
        ) : (
          <div className="font-display text-40 font-bold tabular-nums text-ink">
            {total != null ? `Total ${fmtMxn(total)} · sin cambio` : aCredito ? "A crédito" : "Sin cobro"}
          </div>
        )}
      </div>
    </PantallaCobro>
  );
}
