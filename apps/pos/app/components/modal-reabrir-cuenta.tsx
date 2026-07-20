"use client";
import { useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { type Empleado } from "../lib/supabase";
import { autorizacionPropia, type Autorizacion, type PayloadAutorizacion } from "../lib/autorizacion";
import { ModalAutorizacionPin } from "./modal-autorizacion-pin";
import { reabrirCuenta } from "../lib/cuentas-acciones";
import { fmtMxn } from "../lib/turno";

const ROLES_POST_COBRO = ["SUPERVISOR", "ADMIN", "DUENO"];
const PERMISO = "venta.editar_post_cobro";

/** Reabre una cuenta pagada: la vuelve a ABIERTO para editar/re-cobrar. Anula los pagos y reversa
 *  el inventario; el efectivo sale del esperado hasta que se vuelva a cobrar. */
export function ModalReabrirCuenta({
  token,
  empleado,
  ticketId,
  folio,
  total,
  cajaId,
  turnoId,
  onReabierto,
  onCerrar,
}: {
  token: string;
  empleado: Empleado;
  ticketId: string;
  folio: string | null;
  total: number;
  cajaId: string;
  turnoId: string;
  onReabierto: () => void;
  onCerrar: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [pidiendoPin, setPidiendoPin] = useState(false);

  const tienePermisoRol = ROLES_POST_COBRO.includes(empleado.rol);
  const motivoFinal = motivo.trim() || "Reapertura de cuenta";

  function payload(): PayloadAutorizacion {
    return {
      accion: "reabrir_cuenta",
      permisoCodigo: PERMISO,
      entidadTipo: "ticket",
      entidadId: ticketId,
      monto: total,
      motivo: motivoFinal,
      cajaId,
      turnoId,
    };
  }

  async function ejecutar(a: Autorizacion) {
    setProcesando(true);
    setError(null);
    try {
      await reabrirCuenta(token, {
        ticketId,
        motivo: motivoFinal,
        autorizacionPinId: a.autorizacionPinId,
        solicitanteId: empleado.id,
        autorizoId: a.autorizoId,
      });
      onReabierto();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo reabrir la cuenta");
      setProcesando(false);
      setPidiendoPin(false);
    }
  }

  async function onConfirmar() {
    setError(null);
    if (!tienePermisoRol) { setPidiendoPin(true); return; }
    setProcesando(true);
    try {
      const a = await autorizacionPropia(token, payload());
      await ejecutar(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo autorizar");
      setProcesando(false);
    }
  }

  if (pidiendoPin) {
    return (
      <ModalAutorizacionPin
        token={token}
        accion="reabrir_cuenta"
        permisoCodigo={PERMISO}
        descripcion={`Reabrir cuenta · folio ${folio ?? ""} · ${fmtMxn(total)}`}
        ejecutaNombre={empleado.nombre}
        monto={total}
        entidadTipo="ticket"
        entidadId={ticketId}
        cajaId={cajaId}
        turnoId={turnoId}
        motivo={motivoFinal}
        onAutorizado={(a) => ejecutar(a)}
        onCancelar={() => setPidiendoPin(false)}
      />
    );
  }

  const input =
    "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";

  return (
    <Modal open onClose={onCerrar} title="Reabrir cuenta" hideTitle className="w-[480px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]">
      <div className="mb-5">
        <h2 className="font-display text-xl font-semibold tracking-tight">Reabrir cuenta</h2>
        <p className="mt-0.5 text-[13px] text-ink-3">{folio ? `${folio} · ` : ""}{fmtMxn(total)}</p>
      </div>

      <div className="mb-4 rounded border border-[#E8DCC0] bg-[#F6EEDD] px-3 py-2 text-[12.5px] font-medium text-warning">
        La cuenta vuelve a <b>abierta</b> para editarla o volver a cobrarla. Se <b>anula el pago</b> registrado y el efectivo deja de contar en el corte hasta que se cobre de nuevo. El folio se conserva.
      </div>

      <label className="mb-1.5 block text-[13px] font-medium text-ink-2">Motivo (opcional)</label>
      <input className={`${input} mb-3`} value={motivo} maxLength={200}
        onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. corregir productos, cobro equivocado…" />

      <div className={[
        "mb-4 rounded border px-3 py-2 text-[12.5px] font-medium",
        tienePermisoRol ? "border-[#D6E8DD] bg-[#EAF3EE] text-success" : "border-[#E8DCC0] bg-[#F6EEDD] text-warning",
      ].join(" ")}>
        {tienePermisoRol ? "Dentro de tu rol · no requiere autorización." : "Requiere PIN de un supervisor."}
      </div>

      {error && <p className="mb-3 text-sm font-medium text-danger" role="alert">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onCerrar} disabled={procesando}>Volver</Button>
        <Button onClick={onConfirmar} disabled={procesando}>{procesando ? "Reabriendo…" : "Reabrir cuenta"}</Button>
      </div>
    </Modal>
  );
}
