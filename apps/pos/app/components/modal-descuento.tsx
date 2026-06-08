"use client";
import { useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { type Empleado } from "../lib/supabase";
import {
  MOTIVOS,
  aplicarDescuento,
  descuentoSchema,
  permisoDescuento,
  previewDescuento,
  type MotivoDescuento,
  type TipoDescuento,
} from "../lib/descuento";
import { autorizacionPropia, type Autorizacion, type PayloadAutorizacion } from "../lib/autorizacion";
import { ModalAutorizacionPin } from "./modal-autorizacion-pin";
import { fmtMxn } from "../lib/turno";

// Roles que tienen `descuento.manual_aplicar` por defecto (matriz §2.2).
const ROLES_DESCUENTO = ["SUPERVISOR", "ADMIN", "DUENO"];
// Roles que tienen `descuento.cortesia_total` (más restrictivo, supervisor+).
const ROLES_CORTESIA = ["SUPERVISOR", "ADMIN", "DUENO"];

export function ModalDescuento({
  token,
  empleado,
  ticketId,
  totalActual,
  cajaId,
  turnoId,
  onAplicado,
  onCerrar,
}: {
  token: string;
  empleado: Empleado;
  ticketId: string;
  totalActual: number;
  cajaId: string;
  turnoId: string;
  onAplicado: () => void;
  onCerrar: () => void;
}) {
  const [tipo, setTipo] = useState<TipoDescuento>("PORCENTAJE");
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState<MotivoDescuento>("CLIENTE_FRECUENTE");
  const [motivoTexto, setMotivoTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aplicando, setAplicando] = useState(false);
  const [pidiendoPin, setPidiendoPin] = useState(false);

  const tienePermiso = tipo === "CORTESIA_TOTAL"
    ? ROLES_CORTESIA.includes(empleado.rol)
    : ROLES_DESCUENTO.includes(empleado.rol);
  const valorNum = Number(valor || 0);
  const descuento = previewDescuento(tipo, valorNum, totalActual);
  const nuevoTotal = Math.max(0, Math.round((totalActual - descuento) * 100) / 100);

  function labelMotivo(): string {
    if (motivo === "OTRO") return motivoTexto.trim() || "Otro";
    return MOTIVOS.find((m) => m.codigo === motivo)?.label ?? motivo;
  }

  function payload(): PayloadAutorizacion {
    return {
      accion: tipo === "CORTESIA_TOTAL" ? "cortesia_total" : "descuento_manual",
      permisoCodigo: permisoDescuento(tipo),
      entidadTipo: "ticket",
      entidadId: ticketId,
      monto: descuento,
      motivo: labelMotivo(),
      cajaId,
      turnoId,
    };
  }

  async function ejecutarConAutorizacion(a: Autorizacion) {
    setAplicando(true);
    setError(null);
    try {
      await aplicarDescuento(token, {
        ticketId,
        input: { tipo, valor: valorNum, motivoCategoria: motivo, motivoTexto },
        autorizacionPinId: a.autorizacionPinId,
        solicitanteId: empleado.id,
        autorizoId: a.autorizoId,
      });
      onAplicado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo aplicar el descuento");
      setAplicando(false);
      setPidiendoPin(false);
    }
  }

  async function onAplicar() {
    setError(null);
    const parsed = descuentoSchema.safeParse({ tipo, valor: valorNum, motivoCategoria: motivo, motivoTexto });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    if (tienePermiso) {
      setAplicando(true);
      try {
        const a = await autorizacionPropia(token, payload());
        await ejecutarConAutorizacion(a);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo autorizar");
        setAplicando(false);
      }
    } else {
      setPidiendoPin(true);
    }
  }

  if (pidiendoPin) {
    return (
      <ModalAutorizacionPin
        token={token}
        accion={tipo === "CORTESIA_TOTAL" ? "cortesia_total" : "descuento_manual"}
        permisoCodigo={permisoDescuento(tipo)}
        descripcion={`Descuento de ${fmtMxn(descuento)} · ${labelMotivo()}`}
        ejecutaNombre={empleado.nombre}
        monto={descuento}
        entidadTipo="ticket"
        entidadId={ticketId}
        cajaId={cajaId}
        turnoId={turnoId}
        motivo={labelMotivo()}
        onAutorizado={ejecutarConAutorizacion}
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
      title="Aplicar descuento"
      hideTitle
      className="w-[440px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]"
    >
      <div className="mb-5">
        <h2 className="font-display text-xl font-semibold tracking-tight">Aplicar descuento</h2>
        <p className="mt-0.5 text-[13px] text-ink-3">Total actual {fmtMxn(totalActual)}</p>
      </div>

      {/* Tipo */}
      <div className="mb-4 inline-flex w-full gap-0.5 rounded border border-line bg-hover p-[3px]">
        {(["PORCENTAJE", "MONTO_FIJO", "CORTESIA_TOTAL"] as TipoDescuento[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTipo(t)}
            className={[
              "flex-1 rounded-[4px] px-3 py-2 text-[12.5px] font-semibold transition",
              tipo === t ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink",
            ].join(" ")}
          >
            {t === "PORCENTAJE" ? "Porcentaje" : t === "MONTO_FIJO" ? "Monto fijo" : "Cortesía 100%"}
          </button>
        ))}
      </div>

      {/* Valor (oculto para cortesía 100%) */}
      {tipo !== "CORTESIA_TOTAL" && (
        <>
          <label className="mb-1.5 block text-[13px] font-medium text-ink-2" htmlFor="d-valor">
            Valor del descuento
          </label>
          <div className="relative mb-4">
            <input
              id="d-valor"
              className={input}
              value={valor}
              inputMode="decimal"
              autoFocus
              onChange={(e) => setValor(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder={tipo === "PORCENTAJE" ? "10" : "50.00"}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink-3">
              {tipo === "PORCENTAJE" ? "%" : "MXN"}
            </span>
          </div>
        </>
      )}

      {/* Motivo */}
      <div className="mb-1.5 text-[13px] font-medium text-ink-2">Motivo</div>
      <div className="mb-3 flex flex-wrap gap-2">
        {MOTIVOS.map((m) => (
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

      {/* Preview */}
      <div className="mb-4 rounded-lg border border-line bg-hover p-3 text-[13.5px]">
        <div className="flex justify-between text-ink-2">
          <span>Total actual</span><span className="tabular-nums">{fmtMxn(totalActual)}</span>
        </div>
        <div className="mt-1 flex justify-between text-ink-2">
          <span>Descuento</span><span className="tabular-nums text-danger">−{fmtMxn(descuento)}</span>
        </div>
        <div className="mt-2 flex justify-between border-t border-line pt-2 font-display text-[16px] font-bold">
          <span>Nuevo total</span><span className="tabular-nums">{fmtMxn(nuevoTotal)}</span>
        </div>
      </div>

      {/* Banner de autorización */}
      <div className={["mb-4 rounded border px-3 py-2 text-[12.5px] font-medium",
        tienePermiso ? "border-[#D6E8DD] bg-[#EAF3EE] text-success" : "border-[#E8DCC0] bg-[#F6EEDD] text-warning"].join(" ")}>
        {tienePermiso ? "Dentro de tu rol · no requiere autorización." : "Requiere PIN de un supervisor."}
      </div>

      {error && <p className="mb-3 text-sm font-medium text-danger" role="alert">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onCerrar} disabled={aplicando}>Cancelar</Button>
        <Button onClick={onAplicar} disabled={aplicando || descuento <= 0}>
          {aplicando ? "Aplicando…" : "Aplicar descuento"}
        </Button>
      </div>
    </Modal>
  );
}
