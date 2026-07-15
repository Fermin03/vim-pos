"use client";
import { useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { type Empleado } from "../lib/supabase";
import { cancelarTicket, MOTIVOS_TICKET, type MotivoTicket } from "../lib/cancelacion";
import { autorizacionPropia, type Autorizacion, type PayloadAutorizacion } from "../lib/autorizacion";
import { ModalAutorizacionPin } from "./modal-autorizacion-pin";
import { fmtMxn } from "../lib/turno";

/** Roles con `venta.cancelar_abierta` por defecto (matriz §2.2). */
const ROLES_CANCELAR = ["CAJERO", "SUPERVISOR", "ADMIN", "DUENO"];

/**
 * Modal P-083 — Cancelar ticket completo.
 * Para ticket ABIERTO no se cobró nada: solo se marca CANCELADO y se reversa inventario.
 * (La devolución de ticket PAGADO va por otra ruta, F6.3, hasta que exista la pantalla
 * "tickets cobrados hoy".)
 */
export function ModalCancelarTicket({
  token,
  empleado,
  ticketId,
  folio,
  totalActual,
  cajaId,
  turnoId,
  pagada = false,
  onCancelado,
  onCerrar,
}: {
  token: string;
  empleado: Empleado;
  ticketId: string;
  folio: string | null;
  totalActual: number;
  cajaId: string;
  turnoId: string;
  /** El ticket ya está PAGADO (Consulta de cuentas): cancelar devuelve el dinero (devolución total)
   *  y requiere permiso venta.cancelar_pagada (más restringido). */
  pagada?: boolean;
  onCancelado: () => void;
  onCerrar: () => void;
}) {
  const rolesPermiso = pagada ? ["SUPERVISOR", "ADMIN", "DUENO"] : ROLES_CANCELAR;
  const permisoCancelar = pagada ? "venta.cancelar_pagada" : "venta.cancelar_abierta";
  const [motivo, setMotivo] = useState<MotivoTicket>("CLIENTE_DESISTIO");
  const [motivoTexto, setMotivoTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [pidiendoPin, setPidiendoPin] = useState(false);

  const tienePermisoRol = rolesPermiso.includes(empleado.rol);

  function labelMotivo(): string {
    if (motivo === "OTRO") return motivoTexto.trim() || "Otro";
    return MOTIVOS_TICKET.find((m) => m.codigo === motivo)?.label ?? motivo;
  }

  function payload(): PayloadAutorizacion {
    return {
      accion: "cancelar_ticket",
      permisoCodigo: permisoCancelar,
      entidadTipo: "ticket",
      entidadId: ticketId,
      monto: totalActual,
      motivo: labelMotivo(),
      cajaId,
      turnoId,
    };
  }

  async function ejecutarConAutorizacion(a: Autorizacion) {
    setProcesando(true);
    setError(null);
    try {
      await cancelarTicket(token, {
        ticketId,
        cajaId,
        turnoId,
        motivo,
        motivoTexto: motivo === "OTRO" ? motivoTexto.trim() : null,
        autorizacionPinId: a.autorizacionPinId,
        solicitanteId: empleado.id,
        autorizoId: a.autorizoId,
        devolverDinero: pagada,
        reversarInventario: true,
      });
      onCancelado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cancelar el ticket");
      setProcesando(false);
      setPidiendoPin(false);
    }
  }

  async function onConfirmar() {
    setError(null);
    if (motivo === "OTRO" && motivoTexto.trim().length === 0) {
      setError("Describe el motivo");
      return;
    }
    if (!tienePermisoRol) {
      setPidiendoPin(true);
      return;
    }
    setProcesando(true);
    try {
      const a = await autorizacionPropia(token, payload());
      await ejecutarConAutorizacion(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo autorizar la cancelación");
      setProcesando(false);
    }
  }

  if (pidiendoPin) {
    return (
      <ModalAutorizacionPin
        token={token}
        accion="cancelar_ticket"
        permisoCodigo={permisoCancelar}
        descripcion={`Cancelar folio ${folio ?? ""} · ${fmtMxn(totalActual)} · ${labelMotivo()}`}
        ejecutaNombre={empleado.nombre}
        monto={totalActual}
        entidadTipo="ticket"
        entidadId={ticketId}
        cajaId={cajaId}
        turnoId={turnoId}
        motivo={labelMotivo()}
        onAutorizado={(a) => ejecutarConAutorizacion(a)}
        onCancelar={() => setPidiendoPin(false)}
      />
    );
  }

  const input =
    "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";

  return (
    <Modal
      open
      onClose={onCerrar}
      title="Cancelar ticket"
      hideTitle
      className="w-[480px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]"
    >
      <div className="mb-5">
        <h2 className="font-display text-xl font-semibold tracking-tight">{pagada ? "Cancelar folio" : "Cancelar ticket"}</h2>
        <p className="mt-0.5 text-[13px] text-ink-3">
          {folio ? `${folio} · ` : ""}{fmtMxn(totalActual)}
        </p>
      </div>

      <div className="mb-4 rounded border border-[#E8DCC0] bg-[#F6EEDD] px-3 py-2 text-[12.5px] font-medium text-warning">
        {pagada
          ? <>Cancela el folio <b>pagado</b>: se registra una <b>devolución total</b> (el dinero se devuelve) y la cuenta queda cancelada. Es <b>irreversible</b>. El inventario regresa al stock.</>
          : <>Esta acción cancela el ticket completo. Es <b>irreversible</b>. El inventario regresa al stock.</>}
      </div>

      <div className="mb-1.5 text-[13px] font-medium text-ink-2">Motivo</div>
      <div className="mb-3 flex flex-wrap gap-2">
        {MOTIVOS_TICKET.map((m) => (
          <button
            key={m.codigo}
            type="button"
            onClick={() => setMotivo(m.codigo)}
            className={[
              "rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition",
              motivo === m.codigo ? "border-ink bg-ink text-white" : "border-line-strong text-ink-2 hover:border-ink",
            ].join(" ")}
          >
            {m.label}
          </button>
        ))}
      </div>
      {motivo === "OTRO" && (
        <input
          className={`${input} mb-3`}
          value={motivoTexto}
          maxLength={200}
          onChange={(e) => setMotivoTexto(e.target.value)}
          placeholder="Describe el motivo"
        />
      )}

      <div
        className={[
          "mb-4 rounded border px-3 py-2 text-[12.5px] font-medium",
          tienePermisoRol
            ? "border-[#D6E8DD] bg-[#EAF3EE] text-success"
            : "border-[#E8DCC0] bg-[#F6EEDD] text-warning",
        ].join(" ")}
      >
        {tienePermisoRol ? "Dentro de tu rol · no requiere autorización." : "Requiere PIN de un supervisor."}
      </div>

      {error && <p className="mb-3 text-sm font-medium text-danger" role="alert">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onCerrar} disabled={procesando}>Volver</Button>
        <Button onClick={onConfirmar} disabled={procesando}>
          {procesando ? "Cancelando…" : pagada ? "Cancelar folio" : "Cancelar ticket"}
        </Button>
      </div>
    </Modal>
  );
}
