"use client";
import { useState } from "react";
import { DialogoPeligro } from "@vim/ui/styles";
import { type Empleado } from "../lib/supabase";
import { cancelarItem, MOTIVOS_CANCELACION, type MotivoCancelacion } from "../lib/cancelacion";
import { autorizacionPropia, type Autorizacion, type PayloadAutorizacion } from "../lib/autorizacion";
import { ModalAutorizacionPin } from "./modal-autorizacion-pin";
import { AvisoAutorizacion, MotivoChips } from "./motivo-y-autorizacion";
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
        payload={payload()}
        descripcion={`Cancelar ${cantidad}× ${productoNombre} · ${fmtMxn(totalItem)} · ${labelMotivo()}`}
        ejecutaNombre={empleado.nombre}
        onAutorizado={(a) => ejecutarConAutorizacion(a)}
        onCancelar={() => setPidiendoPin(false)}
      />
    );
  }

  return (
    <DialogoPeligro
      titulo="Cancelar ítem"
      contexto={`${cantidad}× ${productoNombre} · ${fmtMxn(totalItem)}`}
      error={error}
      boton="Cancelar ítem"
      ocupado={procesando}
      textoOcupado="Cancelando…"
      onConfirmar={() => void onConfirmar()}
      onCerrar={onCerrar}
    >
      <MotivoChips opciones={MOTIVOS_CANCELACION} valor={motivo} onCambiar={setMotivo} texto={motivoTexto} onTexto={setMotivoTexto} />
      <AvisoAutorizacion
        propia={!requierePin}
        texto={enCocina ? "El ítem ya fue enviado a cocina · requiere PIN de supervisor." : undefined}
      />
    </DialogoPeligro>
  );
}
