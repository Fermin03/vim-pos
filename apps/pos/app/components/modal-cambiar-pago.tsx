"use client";
import { useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { type Empleado } from "../lib/supabase";
import { autorizacionPropia, type Autorizacion, type PayloadAutorizacion } from "../lib/autorizacion";
import { ModalAutorizacionPin } from "./modal-autorizacion-pin";
import { cambiarFormaPago, METODOS_PAGO, labelMetodoPago } from "../lib/cuentas-acciones";
import { fmtMxn } from "../lib/turno";

const ROLES_POST_COBRO = ["SUPERVISOR", "ADMIN", "DUENO"];
const PERMISO = "venta.editar_post_cobro";

/** Cambia la forma de pago de una cuenta ya pagada. El corte recalcula el efectivo solo. */
export function ModalCambiarPago({
  token,
  empleado,
  ticketId,
  folio,
  total,
  metodoActual,
  cajaId,
  turnoId,
  onCambiado,
  onCerrar,
}: {
  token: string;
  empleado: Empleado;
  ticketId: string;
  folio: string | null;
  total: number;
  metodoActual: string | null;
  cajaId: string;
  turnoId: string;
  onCambiado: () => void;
  onCerrar: () => void;
}) {
  const opciones = METODOS_PAGO.filter((m) => m.codigo !== metodoActual);
  const [metodo, setMetodo] = useState<string>(opciones[0]?.codigo ?? "TARJETA_DEBITO");
  const [recibido, setRecibido] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [pidiendoPin, setPidiendoPin] = useState(false);

  const tienePermisoRol = ROLES_POST_COBRO.includes(empleado.rol);
  const montoRecibido = metodo === "EFECTIVO" && recibido.trim() !== "" ? Number(recibido) : null;

  function payload(): PayloadAutorizacion {
    return {
      accion: "cambiar_forma_pago",
      permisoCodigo: PERMISO,
      entidadTipo: "ticket",
      entidadId: ticketId,
      monto: total,
      motivo: `Cambio de forma de pago a ${labelMetodoPago(metodo)}`,
      cajaId,
      turnoId,
    };
  }

  async function ejecutar(a: Autorizacion) {
    setProcesando(true);
    setError(null);
    try {
      await cambiarFormaPago(token, {
        ticketId,
        nuevoMetodo: metodo,
        montoRecibidoMxn: montoRecibido,
        autorizacionPinId: a.autorizacionPinId,
        solicitanteId: empleado.id,
        autorizoId: a.autorizoId,
      });
      onCambiado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar la forma de pago");
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
        accion="cambiar_forma_pago"
        permisoCodigo={PERMISO}
        descripcion={`Cambiar forma de pago · folio ${folio ?? ""} · ${fmtMxn(total)} → ${labelMetodoPago(metodo)}`}
        ejecutaNombre={empleado.nombre}
        monto={total}
        entidadTipo="ticket"
        entidadId={ticketId}
        cajaId={cajaId}
        turnoId={turnoId}
        motivo={`Cambio de forma de pago a ${labelMetodoPago(metodo)}`}
        onAutorizado={(a) => ejecutar(a)}
        onCancelar={() => setPidiendoPin(false)}
      />
    );
  }

  const input =
    "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";

  return (
    <Modal open onClose={onCerrar} title="Cambiar forma de pago" hideTitle className="w-[480px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]">
      <div className="mb-5">
        <h2 className="font-display text-xl font-semibold tracking-tight">Cambiar forma de pago</h2>
        <p className="mt-0.5 text-[13px] text-ink-3">
          {folio ? `${folio} · ` : ""}{fmtMxn(total)} · actual: {labelMetodoPago(metodoActual ?? "—")}
        </p>
      </div>

      <div className="mb-1.5 text-[13px] font-medium text-ink-2">Nueva forma de pago</div>
      <div className="mb-3 flex flex-wrap gap-2">
        {opciones.map((m) => (
          <button
            key={m.codigo}
            type="button"
            onClick={() => setMetodo(m.codigo)}
            className={[
              "rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition",
              metodo === m.codigo ? "border-ink bg-ink text-white" : "border-line-strong text-ink-2 hover:border-ink",
            ].join(" ")}
          >
            {m.label}
          </button>
        ))}
      </div>

      {metodo === "EFECTIVO" && (
        <div className="mb-3">
          <label className="mb-1.5 block text-[13px] font-medium text-ink-2">Efectivo recibido (opcional)</label>
          <input className={input} value={recibido} inputMode="decimal" placeholder={fmtMxn(total)}
            onChange={(e) => setRecibido(e.target.value.replace(/[^0-9.]/g, ""))} />
        </div>
      )}

      <div className={[
        "mb-4 rounded border px-3 py-2 text-[12.5px] font-medium",
        tienePermisoRol ? "border-[#D6E8DD] bg-[#EAF3EE] text-success" : "border-[#E8DCC0] bg-[#F6EEDD] text-warning",
      ].join(" ")}>
        {tienePermisoRol ? "Dentro de tu rol · no requiere autorización." : "Requiere PIN de un supervisor."}
      </div>

      {error && <p className="mb-3 text-sm font-medium text-danger" role="alert">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onCerrar} disabled={procesando}>Volver</Button>
        <Button onClick={onConfirmar} disabled={procesando}>{procesando ? "Cambiando…" : "Cambiar forma de pago"}</Button>
      </div>
    </Modal>
  );
}
