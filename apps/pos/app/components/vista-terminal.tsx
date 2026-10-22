"use client";
import { useEffect, useRef, useState } from "react";
import { fmtMxn } from "../lib/turno";
import { nuevoClientId } from "../lib/carrito";
import { mensajeErrorCobro, mensajeFinal, montoTexto, pedirCobro, type CobroTerminal, type ProveedorTerminal } from "../lib/terminal";
import { ModalAutorizacionPin } from "./modal-autorizacion-pin";
import { BotonPrincipal, BotonSecundario, PantallaCobro } from "./cobro/pantalla-cobro";

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
 * «Cobra en la terminal» (ADR 0033): manda el monto, espera y avisa cuando el proveedor dice que
 * pasó. No aplica el pago: eso lo hace el modal de cobro con `onAprobado`. Mientras está abierta no
 * se sale con Escape; se sale cancelando.
 */
export function VistaTerminal({
  token, cajaId, turnoId, ejecutaNombre, ticketId, folio, monto, proveedor, propinaEnLector = false, contexto, onAprobado, onVolver,
}: {
  /** Centro de la cabecera («Tarjeta · Ticket #…»). */
  contexto?: string;
  token: string; cajaId: string; turnoId: string; ejecutaNombre: string;
  /** El lector le pregunta la propina al cliente (Clip); llega aparte en `propina_mxn`. `monto` va sin ella. */
  propinaEnLector?: boolean;
  /** Cambia la instrucción mientras espera; null = la de Mercado Pago, como siempre. */
  proveedor: ProveedorTerminal | null;
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
    pedirCobro(token, cajaId, {
      accion: "crear", cobro_id: id, ticket_id: ticketId, folio, monto: montoTexto(monto),
      ...(propinaEnLector ? { propina_en_lector: true } : {}),
    })
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

  const pin = fase.t === "revisar" && fase.pin && (
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
  );

  // Enviando o esperando: sin botón de regresar; de aquí se sale con «Cancelar cobro» (pos.md, ADR 0033).
  const cobrando = fase.t === "enviando" || fase.t === "esperando";
  const dos = (a: React.ReactNode, b: React.ReactNode) => <div className="grid grid-cols-2 gap-3">{a}{b}</div>;

  return (
    <PantallaCobro
      regresar={cobrando ? null : { icono: "atras", onClick: onVolver }}
      contexto={contexto ?? "Tarjeta"}
      pie={
        cobrando ? (
          <div className="mx-auto w-[360px]">
            <BotonSecundario onClick={cancelar} disabled={fase.t === "enviando" || fase.aviso === "Cancelando…"}>Cancelar cobro</BotonSecundario>
          </div>
        ) : fase.t === "revisar" ? (
          dos(
            <BotonSecundario onClick={onVolver}>No pasó, cambiar forma de pago</BotonSecundario>,
            <BotonPrincipal onClick={() => setFase({ ...fase, pin: true })}>Sí, dice aprobado</BotonPrincipal>,
          )
        ) : (
          dos(
            <BotonSecundario onClick={onVolver}>Cambiar forma de pago</BotonSecundario>,
            <BotonPrincipal onClick={() => setIntento((n) => n + 1)}>Volver a intentar</BotonPrincipal>,
          )
        )
      }
    >
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        {cobrando ? (
          <>
            {/* Pulso: dos ondas desfasadas que salen del círculo mientras la terminal espera la tarjeta. */}
            <div className="relative mb-7 flex h-24 w-24 items-center justify-center rounded-full bg-accent-soft" aria-hidden>
              <span className="absolute inset-0 animate-vim-pulso rounded-full bg-accent/35" />
              <span className="absolute inset-0 animate-vim-pulso rounded-full bg-accent/35 [animation-delay:.9s]" />
              <span className="relative h-10 w-10 rounded-full bg-accent" />
            </div>
            <div className="font-display text-[88px] font-bold leading-none tabular-nums text-ink">{fmtMxn(monto)}</div>
            {fase.t === "enviando" ? (
              <p className="mt-5 text-20 text-ink-2" role="status">Mandando el cobro a la terminal…</p>
            ) : (
              <>
                <p className="mt-5 font-display text-28 font-bold text-ink" role="status">Cobra en la terminal</p>
                <p className="mt-2 max-w-[520px] text-18 text-ink-3">
                  {proveedor === "CLIP"
                    ? "Pide al cliente que acerque o inserte su tarjeta en la terminal."
                    : "En la terminal, toca «Tarjeta» y acerca o inserta la tarjeta del cliente."}
                </p>
                {fase.aviso && <p className="mt-3 text-16 font-medium text-warning" role="status">{fase.aviso}</p>}
              </>
            )}
          </>
        ) : (
          <>
            <div className="font-display text-40 font-bold tabular-nums text-ink-3">{fmtMxn(monto)}</div>
            {fase.t === "revisar" ? (
              <>
                <p className="mt-4 font-display text-32 font-bold text-ink" role="alert">No pudimos confirmar el cobro</p>
                <p className="mt-2 max-w-[520px] text-18 text-ink-3">Mira la pantalla de la terminal. ¿Dice que el pago fue aprobado?</p>
              </>
            ) : (
              <>
                <p className="mt-4 font-display text-32 font-bold text-danger">El cobro no pasó</p>
                <p className="mt-2 max-w-[560px] text-18 text-ink-3" role="alert">{fase.mensaje}</p>
              </>
            )}
          </>
        )}
      </div>
      {pin}
    </PantallaCobro>
  );
}
