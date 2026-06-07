"use client";
import { useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { type Empleado } from "../lib/supabase";
import { fmtMxn } from "../lib/turno";
import {
  aplicarDescuento,
  MOTIVOS,
  permisoDescuento,
  previewDescuento,
  type MotivoDescuento,
  type TipoDescuento,
} from "../lib/descuento";
import { autorizacionPropia, type Autorizacion, type PayloadAutorizacion } from "../lib/autorizacion";
import { ModalAutorizacionPin } from "./modal-autorizacion-pin";

// Descuento por ítem (F6.5): el cajero ajusta UN ítem del ticket persistido. Override de precio
// requiere un permiso más alto. Roles con permiso de descuento/override por defecto (§2.2).
const ROLES_DESCUENTO = ["SUPERVISOR", "ADMIN", "DUENO"];

const TIPOS: { v: TipoDescuento; l: string }[] = [
  { v: "PORCENTAJE", l: "Porcentaje" },
  { v: "MONTO_FIJO", l: "Monto fijo" },
  { v: "OVERRIDE_PRECIO", l: "Precio fijo" },
];

export function ModalDescuentoItem({
  token,
  empleado,
  ticketId,
  ticketItemId,
  productoNombre,
  cantidad,
  totalItem,
  cajaId,
  turnoId,
  onAplicado,
  onCerrar,
}: {
  token: string;
  empleado: Empleado;
  ticketId: string;
  ticketItemId: string;
  productoNombre: string;
  cantidad: number;
  totalItem: number;
  cajaId: string;
  turnoId: string;
  onAplicado: () => void;
  onCerrar: () => void;
}) {
  const [tipo, setTipo] = useState<TipoDescuento>("PORCENTAJE");
  const [valorStr, setValorStr] = useState("");
  const [motivo, setMotivo] = useState<MotivoDescuento>("CLIENTE_FRECUENTE");
  const [motivoTexto, setMotivoTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [pidiendoPin, setPidiendoPin] = useState(false);

  const valor = Number(valorStr || 0);
  const descuento = previewDescuento(tipo, valor, totalItem);
  const nuevoTotal = Math.max(0, Math.round((totalItem - descuento) * 100) / 100);
  const tienePermiso = ROLES_DESCUENTO.includes(empleado.rol);

  function labelMotivo(): string {
    if (motivo === "OTRO") return motivoTexto.trim() || "Otro";
    return MOTIVOS.find((m) => m.codigo === motivo)?.label ?? motivo;
  }

  function payload(): PayloadAutorizacion {
    return {
      accion: tipo === "OVERRIDE_PRECIO" ? "override_precio" : "descuento_item",
      permisoCodigo: permisoDescuento(tipo),
      entidadTipo: "ticket_item",
      entidadId: ticketItemId,
      monto: descuento,
      motivo: labelMotivo(),
      cajaId,
      turnoId,
    };
  }

  async function ejecutar(a: Autorizacion) {
    setProcesando(true);
    setError(null);
    try {
      await aplicarDescuento(token, {
        ticketId,
        ticketItemId,
        input: { tipo, valor, motivoCategoria: motivo, motivoTexto },
        autorizacionPinId: a.autorizacionPinId,
        solicitanteId: empleado.id,
        autorizoId: a.autorizoId,
      });
      onAplicado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo aplicar");
      setProcesando(false);
      setPidiendoPin(false);
    }
  }

  async function onConfirmar() {
    setError(null);
    if (valor <= 0) {
      setError(tipo === "OVERRIDE_PRECIO" ? "Indica el nuevo precio" : "Indica el valor");
      return;
    }
    if (motivo === "OTRO" && motivoTexto.trim().length === 0) {
      setError("Describe el motivo");
      return;
    }
    if (!tienePermiso) {
      setPidiendoPin(true);
      return;
    }
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
        accion={payload().accion}
        permisoCodigo={permisoDescuento(tipo)}
        descripcion={`${tipo === "OVERRIDE_PRECIO" ? "Precio fijo" : "Descuento"} en ${productoNombre} · ${labelMotivo()}`}
        ejecutaNombre={empleado.nombre}
        monto={descuento}
        entidadTipo="ticket_item"
        entidadId={ticketItemId}
        cajaId={cajaId}
        turnoId={turnoId}
        motivo={labelMotivo()}
        onAutorizado={(a) => ejecutar(a)}
        onCancelar={() => setPidiendoPin(false)}
      />
    );
  }

  const input =
    "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";

  return (
    <Modal open onClose={onCerrar} title="Descuento por ítem" hideTitle
      className="w-[440px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]">
      <div className="mb-5">
        <h2 className="font-display text-xl font-semibold tracking-tight">Ajustar ítem</h2>
        <p className="mt-0.5 text-[13px] text-ink-3">{cantidad}× {productoNombre} · {fmtMxn(totalItem)}</p>
      </div>

      <div className="mb-4 inline-flex w-full gap-0.5 rounded border border-line bg-hover p-[3px]">
        {TIPOS.map((t) => (
          <button key={t.v} type="button" onClick={() => setTipo(t.v)}
            className={["flex-1 rounded-[4px] px-3 py-2 text-[12.5px] font-semibold transition", tipo === t.v ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink"].join(" ")}>
            {t.l}
          </button>
        ))}
      </div>

      <label className="mb-1.5 block text-[13px] font-medium text-ink-2" htmlFor="di-valor">
        {tipo === "OVERRIDE_PRECIO" ? "Nuevo precio del ítem" : "Valor del descuento"}
      </label>
      <div className="relative mb-3">
        <input id="di-valor" className={input} value={valorStr} inputMode="decimal" autoFocus
          onChange={(e) => setValorStr(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder={tipo === "PORCENTAJE" ? "10" : tipo === "OVERRIDE_PRECIO" ? "30.00" : "20.00"} />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink-3">
          {tipo === "PORCENTAJE" ? "%" : "MXN"}
        </span>
      </div>

      {valor > 0 && (
        <div className="mb-4 rounded border border-line bg-sel px-3 py-2 text-[12.5px] text-ink-2">
          {tipo === "OVERRIDE_PRECIO" ? "Ahorro" : "Descuento"}: <b>{fmtMxn(descuento)}</b> · Nuevo total del ítem: <b>{fmtMxn(nuevoTotal)}</b>
        </div>
      )}

      <div className="mb-1.5 text-[13px] font-medium text-ink-2">Motivo</div>
      <div className="mb-3 flex flex-wrap gap-2">
        {MOTIVOS.map((m) => (
          <button key={m.codigo} type="button" onClick={() => setMotivo(m.codigo)}
            className={["rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition", motivo === m.codigo ? "border-ink bg-ink text-white" : "border-line-strong text-ink-2 hover:border-ink"].join(" ")}>
            {m.label}
          </button>
        ))}
      </div>
      {motivo === "OTRO" && (
        <input className={`${input} mb-3`} value={motivoTexto} maxLength={200}
          onChange={(e) => setMotivoTexto(e.target.value)} placeholder="Describe el motivo" />
      )}

      <div className={["mb-4 rounded border px-3 py-2 text-[12.5px] font-medium", tienePermiso ? "border-[#D6E8DD] bg-[#EAF3EE] text-success" : "border-[#E8DCC0] bg-[#F6EEDD] text-warning"].join(" ")}>
        {tienePermiso ? "Dentro de tu rol · no requiere autorización." : "Requiere PIN de un supervisor."}
      </div>

      {error && <p className="mb-3 text-sm font-medium text-danger" role="alert">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onCerrar} disabled={procesando}>Volver</Button>
        <Button onClick={onConfirmar} disabled={procesando}>{procesando ? "Aplicando…" : "Aplicar"}</Button>
      </div>
    </Modal>
  );
}
