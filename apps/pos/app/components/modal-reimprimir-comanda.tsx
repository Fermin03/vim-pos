"use client";
import { useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { type Empleado } from "../lib/supabase";
import { autorizacionPropia, type PayloadAutorizacion } from "../lib/autorizacion";
import {
  MOTIVOS_REIMPRESION_COMANDA,
  ROLES_REIMPRIMIR_COMANDA,
  type MotivoReimpresionComanda,
} from "../lib/impresiones";
import { ModalAutorizacionPin } from "./modal-autorizacion-pin";

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

  function labelMotivo(): string {
    if (motivo === "OTRO") return motivoTexto.trim() || "Otro";
    return MOTIVOS_REIMPRESION_COMANDA.find((m) => m.codigo === motivo)?.label ?? motivo;
  }

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
        accion="reimprimir_comanda"
        permisoCodigo={PERMISO}
        descripcion={`Reimprimir la comanda ${folio ?? ""} · ${labelMotivo()}`}
        ejecutaNombre={empleado.nombre}
        monto={null}
        entidadTipo="ticket"
        entidadId={ticketId}
        cajaId={cajaId}
        turnoId={turnoId}
        motivo={labelMotivo()}
        capa="z-[70]"
        onAutorizado={(a) => onAutorizado({ motivo: labelMotivo(), autorizacionPinId: a.autorizacionPinId })}
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
      title="Reimprimir comanda"
      hideTitle
      // Se abre sobre el recibo (z-[60]): sin esto el papel lo tapa.
      backdropClassName="z-[70]"
      className="w-[480px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]"
    >
      <div className="mb-5">
        <h2 className="font-display text-xl font-semibold tracking-tight">Reimprimir comanda</h2>
        <p className="mt-0.5 text-[13px] text-ink-3">{folio ?? ""}</p>
      </div>

      <p className="mb-4 text-[13px] text-ink-2">
        La comanda vuelve a salir en cocina y en barra. Queda registrado quién la reimprimió y por qué.
      </p>

      <div className="mb-1.5 text-[13px] font-medium text-ink-2">Motivo</div>
      <div className="mb-3 flex flex-wrap gap-2">
        {MOTIVOS_REIMPRESION_COMANDA.map((m) => (
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
            ? "border-[#D6E8DD] bg-success-soft text-success"
            : "border-[#E8DCC0] bg-warning-soft text-warning",
        ].join(" ")}
      >
        {tienePermisoRol ? "Dentro de tu rol · no requiere autorización." : "Requiere PIN de un supervisor."}
      </div>

      {error && <p className="mb-3 text-sm font-medium text-danger" role="alert">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onCerrar} disabled={procesando}>Volver</Button>
        <Button onClick={onConfirmar} disabled={procesando}>
          {procesando ? "Autorizando…" : "Reimprimir"}
        </Button>
      </div>
    </Modal>
  );
}
