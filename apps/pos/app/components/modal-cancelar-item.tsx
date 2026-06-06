"use client";
import { useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { type Empleado } from "../lib/supabase";
import { cancelarItem, MOTIVOS_CANCELACION, type MotivoCancelacion } from "../lib/cancelacion";
import { autorizacionPropia, type Autorizacion, type PayloadAutorizacion } from "../lib/autorizacion";
import { ModalAutorizacionPin } from "./modal-autorizacion-pin";
import { fmtMxn } from "../lib/turno";

/** Roles que tienen `venta.cancelar_abierta` por defecto (matriz §2.2). */
const ROLES_CANCELAR = ["CAJERO", "SUPERVISOR", "ADMIN", "DUENO"];

export function ModalCancelarItem({
  token,
  empleado,
  ticketItemId,
  productoNombre,
  cantidad,
  totalItem,
  cajaId,
  turnoId,
  estadoCocina,
  onCancelado,
  onCerrar,
}: {
  token: string;
  empleado: Empleado;
  ticketItemId: string;
  productoNombre: string;
  cantidad: number;
  totalItem: number;
  cajaId: string;
  turnoId: string;
  /** Si el item ya está EN_COCINA/LISTO, la RPC exige PIN aunque el operador tenga el permiso. */
  estadoCocina: string | null;
  onCancelado: () => void;
  onCerrar: () => void;
}) {
  const [motivo, setMotivo] = useState<MotivoCancelacion>("ERROR_DEL_CAJERO");
  const [motivoTexto, setMotivoTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [pidiendoPin, setPidiendoPin] = useState(false);

  const enCocina = estadoCocina === "EN_COCINA" || estadoCocina === "LISTO";
  const tienePermisoRol = ROLES_CANCELAR.includes(empleado.rol);
  // Si el item está en cocina, SIEMPRE pide PIN (lo exige la RPC); si no, autorización propia.
  const requierePin = enCocina || !tienePermisoRol;

  function labelMotivo(): string {
    if (motivo === "OTRO") return motivoTexto.trim() || "Otro";
    return MOTIVOS_CANCELACION.find((m) => m.codigo === motivo)?.label ?? motivo;
  }

  function payload(): PayloadAutorizacion {
    return {
      accion: "cancelar_item",
      permisoCodigo: "venta.cancelar_abierta",
      entidadTipo: "ticket_item",
      entidadId: ticketItemId,
      monto: totalItem,
      motivo: labelMotivo(),
      cajaId,
      turnoId,
    };
  }

  async function ejecutarConAutorizacion(a: Autorizacion | null) {
    setProcesando(true);
    setError(null);
    try {
      await cancelarItem(token, {
        ticketItemId,
        motivo: labelMotivo(),
        autorizacionPinId: a?.autorizacionPinId ?? null,
      });
      onCancelado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cancelar el ítem");
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
    if (requierePin) {
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
        accion="cancelar_item"
        permisoCodigo="venta.cancelar_abierta"
        descripcion={`Cancelar ${cantidad}× ${productoNombre} · ${fmtMxn(totalItem)} · ${labelMotivo()}`}
        ejecutaNombre={empleado.nombre}
        monto={totalItem}
        entidadTipo="ticket_item"
        entidadId={ticketItemId}
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
      title="Cancelar ítem"
      hideTitle
      className="w-[440px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]"
    >
      <div className="mb-5">
        <h2 className="font-display text-xl font-semibold tracking-tight">Cancelar ítem</h2>
        <p className="mt-0.5 text-[13px] text-ink-3">
          {cantidad}× {productoNombre} · {fmtMxn(totalItem)}
        </p>
      </div>

      <div className="mb-1.5 text-[13px] font-medium text-ink-2">Motivo</div>
      <div className="mb-3 flex flex-wrap gap-2">
        {MOTIVOS_CANCELACION.map((m) => (
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
          requierePin
            ? "border-[#E8DCC0] bg-[#F6EEDD] text-warning"
            : "border-[#D6E8DD] bg-[#EAF3EE] text-success",
        ].join(" ")}
      >
        {enCocina
          ? "El ítem ya fue enviado a cocina · requiere PIN de supervisor."
          : requierePin
            ? "Requiere PIN de un supervisor."
            : "Dentro de tu rol · no requiere autorización."}
      </div>

      {error && <p className="mb-3 text-sm font-medium text-danger" role="alert">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onCerrar} disabled={procesando}>Volver</Button>
        <Button onClick={onConfirmar} disabled={procesando}>
          {procesando ? "Cancelando…" : "Cancelar ítem"}
        </Button>
      </div>
    </Modal>
  );
}
