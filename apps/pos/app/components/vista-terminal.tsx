"use client";
import { useEffect, useRef, useState } from "react";
import { fmtMxn } from "../lib/turno";
import { nuevoClientId } from "../lib/carrito";
import { mensajeErrorCobro, mensajeFinal, montoTexto, pedirCobro, type CobroTerminal } from "../lib/terminal";
import { ModalAutorizacionPin } from "./modal-autorizacion-pin";

const CADA_MS = 2500;
// Aceptar a mano un cobro que la terminal no confirmó es corregir un pago: mismo permiso.
const PERMISO_ACEPTAR = "venta.editar_post_cobro";

type Fase =
  | { t: "enviando" }
  | { t: "esperando"; aviso?: string }
  | { t: "fin"; mensaje: string }        // rechazado, vencido o cancelado: se puede reintentar
  | { t: "revisar"; cobro: CobroTerminal; pin?: boolean }
  | { t: "error"; mensaje: string };     // ni siquiera llegó a la terminal

/**
 * «Cobra en la terminal» (ADR 0033): manda el monto, espera y avisa cuando Mercado Pago dice que
 * pasó. No aplica el pago: eso lo hace el modal de cobro con `onAprobado`. Mientras está abierta no
 * se sale con Escape; se sale cancelando.
 */
export function VistaTerminal({
  token, cajaId, turnoId, ejecutaNombre, ticketId, folio, monto, onAprobado, onVolver,
}: {
  token: string; cajaId: string; turnoId: string; ejecutaNombre: string;
  ticketId: string; folio: string | null; monto: number;
  /** `autorizoId` viene cuando un encargado aceptó con su PIN un cobro que quedó sin confirmar. */
  onAprobado: (cobro: CobroTerminal, autorizoId?: string) => void;
  onVolver: () => void;
}) {
  const [fase, setFase] = useState<Fase>({ t: "enviando" });
  const [intento, setIntento] = useState(0);
  // Un id por INTENTO, no por ejecución del efecto: si React lo corre dos veces (modo estricto, o un
  // remontaje), el segundo «crear» lleva el mismo id y la nube devuelve el mismo cobro en vez de
  // mandar otro a la terminal.
  const ids = useRef<string[]>([]);
  const cobroId = useRef("");
  const aprobado = useRef(onAprobado);
  aprobado.current = onAprobado;

  useEffect(() => {
    let vivo = true;
    let reloj: ReturnType<typeof setTimeout> | undefined;
    const id = (cobroId.current = (ids.current[intento] ??= nuevoClientId()));

    /** Lleva la pantalla a donde diga el cobro; devuelve true si ya no hay que seguir preguntando. */
    const atender = (c: CobroTerminal): boolean => {
      if (c.estado === "EN_TERMINAL") { setFase((f) => (f.t === "esperando" ? f : { t: "esperando" })); return false; }
      if (c.estado === "APROBADO") aprobado.current(c);
      else if (c.estado === "REVISAR") setFase({ t: "revisar", cobro: c });
      else setFase({ t: "fin", mensaje: mensajeFinal(c) });
      return true;
    };
    const preguntar = () => {
      reloj = setTimeout(async () => {
        try {
          const r = await pedirCobro(token, cajaId, { accion: "estado", cobro_id: id });
          if (!vivo) return;
          if (r.cobro && atender(r.cobro)) return;
        } catch {
          // Un tropiezo de red no cancela nada: el cobro sigue en la terminal y se vuelve a preguntar.
          if (vivo) setFase((f) => (f.t === "esperando" ? { t: "esperando", aviso: "Sin respuesta, reintentando…" } : f));
        }
        if (vivo) preguntar();
      }, CADA_MS);
    };

    setFase({ t: "enviando" });
    pedirCobro(token, cajaId, { accion: "crear", cobro_id: id, ticket_id: ticketId, folio, monto: montoTexto(monto) })
      .then((r) => { if (vivo && r.cobro && !atender(r.cobro)) preguntar(); })
      .catch((e) => { if (vivo) setFase({ t: "error", mensaje: mensajeErrorCobro(e) }); });
    return () => { vivo = false; clearTimeout(reloj); };
    // Un intento = un cobro: el monto y el ticket se fijan al empezarlo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intento]);

  async function cancelar() {
    setFase({ t: "esperando", aviso: "Cancelando…" });
    try {
      const r = await pedirCobro(token, cajaId, { accion: "cancelar", cobro_id: cobroId.current });
      if (r.cancelacion === "FALLO") setFase((f) => (f.t === "esperando" ? { t: "esperando", aviso: "No se pudo cancelar desde la caja. Cancélalo en la terminal." } : f));
    } catch {
      setFase((f) => (f.t === "esperando" ? { t: "esperando", aviso: "No se pudo cancelar desde la caja. Cancélalo en la terminal." } : f));
    }
    // El resultado (cancelado, o pagado si el cliente se adelantó) llega por la pregunta de siempre.
  }

  const boton = "w-full rounded-lg py-[16px] font-sans text-16 font-bold transition-colors";
  const primario = `${boton} bg-accent text-white hover:bg-accent-hover`;
  const secundario = `${boton} border border-line-strong text-ink-2 hover:bg-hover hover:text-ink`;

  return (
    <div className="flex flex-col items-center gap-2 py-4 text-center">
      <div className="text-12 font-bold uppercase tracking-widest text-ink-3">Cobro con tarjeta</div>
      <div className="font-display text-40 font-bold tabular-nums leading-none">{fmtMxn(monto)}</div>

      {fase.t === "enviando" && <p className="mt-4 text-15 text-ink-2" role="status">Mandando el cobro a la terminal…</p>}

      {fase.t === "esperando" && (
        <>
          <p className="mt-4 font-display text-20 font-semibold" role="status">Cobra en la terminal</p>
          <p className="max-w-[380px] text-15 text-ink-2">En la terminal, toca «Tarjeta» y acerca o inserta la tarjeta del cliente.</p>
          {fase.aviso && <p className="mt-2 text-14 font-medium text-warning" role="status">{fase.aviso}</p>}
          <div className="mt-6 w-full max-w-[380px]">
            <button type="button" className={secundario} onClick={cancelar} disabled={fase.aviso === "Cancelando…"}>Cancelar cobro</button>
          </div>
        </>
      )}

      {(fase.t === "fin" || fase.t === "error") && (
        <>
          <p className="mt-4 max-w-[420px] text-15 font-medium text-danger" role="alert">{fase.mensaje}</p>
          <div className="mt-6 flex w-full max-w-[380px] flex-col gap-2">
            <button type="button" className={primario} onClick={() => setIntento((n) => n + 1)}>Volver a intentar</button>
            <button type="button" className={secundario} onClick={onVolver}>Cambiar forma de pago</button>
          </div>
        </>
      )}

      {fase.t === "revisar" && (
        <>
          <p className="mt-4 font-display text-20 font-semibold" role="alert">No pudimos confirmar el cobro</p>
          <p className="max-w-[420px] text-15 text-ink-2">Mira la pantalla de la terminal. ¿Dice que el pago fue aprobado?</p>
          <div className="mt-6 flex w-full max-w-[380px] flex-col gap-2">
            <button type="button" className={primario} onClick={() => setFase({ ...fase, pin: true })}>Sí, dice aprobado</button>
            <button type="button" className={secundario} onClick={onVolver}>No pasó, cambiar forma de pago</button>
          </div>
          {fase.pin && (
            <ModalAutorizacionPin
              token={token}
              capa="z-[70]"
              descripcion={`Registrar ${fmtMxn(monto)} con tarjeta sin la confirmación de la terminal`}
              ejecutaNombre={ejecutaNombre}
              payload={{
                accion: "aceptar_cobro_terminal", permisoCodigo: PERMISO_ACEPTAR, entidadTipo: "ticket", entidadId: ticketId,
                monto, motivo: "La terminal mostró aprobado y la caja no recibió la confirmación", cajaId, turnoId,
              }}
              onAutorizado={(a) => aprobado.current(fase.cobro, a.autorizoId)}
              onCancelar={() => setFase({ t: "revisar", cobro: fase.cobro })}
            />
          )}
        </>
      )}
    </div>
  );
}
