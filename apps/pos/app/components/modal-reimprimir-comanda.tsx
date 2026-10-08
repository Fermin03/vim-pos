"use client";
import { useState } from "react";
import { DialogoPeligro } from "@vim/ui/styles";
import { type Empleado } from "../lib/supabase";
import { autorizacionPropia, type PayloadAutorizacion } from "../lib/autorizacion";
import {
  MOTIVOS_REIMPRESION_COMANDA,
  ROLES_REIMPRIMIR_COMANDA,
  type MotivoReimpresionComanda,
} from "../lib/impresiones";
import { ModalAutorizacionPin } from "./modal-autorizacion-pin";
import { AvisoAutorizacion, MotivoChips, etiquetaMotivo } from "./motivo-y-autorizacion";

const PERMISO = "cocina.reimprimir_comanda";

/**
 * Reimprimir una comanda pide motivo y autorización (0126).
 *
 * Es la forma más barata de sacar comida sin cobrar: un segundo papel en la cocina y alguien
 * prepara el pedido otra vez. Supervisor, administrador y dueño tienen el permiso y se autorizan
 * solos; un cajero necesita el PIN de uno de ellos. En los dos casos queda quién, cuándo y por qué
 * en `comanda_impresiones`, y sale en el reporte "Reimpresiones por cajero".
 */
export function ModalReimprimirComanda({
  token,
  empleado,
  ticketId,
  folio,
  cajaId,
  turnoId,
  onAutorizado,
  onCerrar,
}: {
  token: string;
  empleado: Empleado;
  ticketId: string;
  folio: string | null;
  cajaId: string;
  turnoId: string;
  onAutorizado: (r: { motivo: string; autorizacionPinId: string }) => void;
  onCerrar: () => void;
}) {
  const [motivo, setMotivo] = useState<MotivoReimpresionComanda>("IMPRESORA");
  const [motivoTexto, setMotivoTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [pidiendoPin, setPidiendoPin] = useState(false);

  const tienePermisoRol = ROLES_REIMPRIMIR_COMANDA.includes(empleado.rol);

  const labelMotivo = () => etiquetaMotivo(MOTIVOS_REIMPRESION_COMANDA, motivo, motivoTexto);

  function payload(): PayloadAutorizacion {
    return {
      accion: "reimprimir_comanda",
      permisoCodigo: PERMISO,
      entidadTipo: "ticket",
      entidadId: ticketId,
      monto: null,
      motivo: labelMotivo(),
      cajaId,
      turnoId,
    };
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
      onAutorizado({ motivo: labelMotivo(), autorizacionPinId: a.autorizacionPinId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo autorizar la reimpresión");
      setProcesando(false);
    }
  }

  if (pidiendoPin) {
    return (
      <ModalAutorizacionPin
        token={token}
        payload={payload()}
        descripcion={`Reimprimir la comanda ${folio ?? ""} · ${labelMotivo()}`}
        ejecutaNombre={empleado.nombre}
        capa="z-[70]"
        onAutorizado={(a) => onAutorizado({ motivo: labelMotivo(), autorizacionPinId: a.autorizacionPinId })}
        onCancelar={() => setPidiendoPin(false)}
      />
    );
  }

  return (
    <DialogoPeligro
      titulo="Reimprimir comanda"
      contexto={folio ?? undefined}
      consecuencia="La comanda vuelve a salir en cocina y en barra. Queda registrado quién la reimprimió y por qué."
      peligrosa={false}
      // Se abre sobre el recibo (z-[60]): sin esto el papel lo tapa.
      backdropClassName="z-[70]"
      error={error}
      boton="Reimprimir"
      ocupado={procesando}
      textoOcupado="Autorizando…"
      onConfirmar={() => void onConfirmar()}
      onCerrar={onCerrar}
    >
      <MotivoChips opciones={MOTIVOS_REIMPRESION_COMANDA} valor={motivo} onCambiar={setMotivo} texto={motivoTexto} onTexto={setMotivoTexto} />
      <AvisoAutorizacion propia={tienePermisoRol} />
    </DialogoPeligro>
  );
}
