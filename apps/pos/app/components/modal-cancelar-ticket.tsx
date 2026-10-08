"use client";
import { useState } from "react";
import { DialogoPeligro } from "@vim/ui/styles";
import { type Empleado } from "../lib/supabase";
import { cancelarTicket, MOTIVOS_TICKET, type MotivoTicket } from "../lib/cancelacion";
import { autorizacionPropia, type Autorizacion, type PayloadAutorizacion } from "../lib/autorizacion";
import { ModalAutorizacionPin } from "./modal-autorizacion-pin";
import { AvisoAutorizacion, MotivoChips, etiquetaMotivo } from "./motivo-y-autorizacion";
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

  const labelMotivo = () => etiquetaMotivo(MOTIVOS_TICKET, motivo, motivoTexto);

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
        payload={payload()}
        descripcion={`Cancelar folio ${folio ?? ""} · ${fmtMxn(totalActual)} · ${labelMotivo()}`}
        ejecutaNombre={empleado.nombre}
        onAutorizado={(a) => ejecutarConAutorizacion(a)}
        onCancelar={() => setPidiendoPin(false)}
      />
    );
  }

  return (
    <DialogoPeligro
      titulo={pagada ? "Cancelar folio" : "Cancelar ticket"}
      contexto={`${folio ? `${folio} · ` : ""}${fmtMxn(totalActual)}`}
      consecuencia={pagada
        ? <>Se registra una <b className="text-ink">devolución total</b> (el dinero se devuelve) y la cuenta queda cancelada. <b className="text-ink">No se puede deshacer.</b> El inventario regresa al stock.</>
        : <>Se cancela el ticket completo. <b className="text-ink">No se puede deshacer.</b> El inventario regresa al stock.</>}
      error={error}
      boton={pagada ? "Cancelar folio" : "Cancelar ticket"}
      ocupado={procesando}
      textoOcupado="Cancelando…"
      onConfirmar={() => void onConfirmar()}
      onCerrar={onCerrar}
    >
      <MotivoChips opciones={MOTIVOS_TICKET} valor={motivo} onCambiar={setMotivo} texto={motivoTexto} onTexto={setMotivoTexto} />
      <AvisoAutorizacion propia={tienePermisoRol} />
    </DialogoPeligro>
  );
}
