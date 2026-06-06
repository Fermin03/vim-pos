"use client";
import { useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { type Empleado } from "../lib/supabase";
import { type DatosCaja, type Turno, fmtMxn } from "../lib/turno";
import { registrarMovimiento, TIPOS_MOVIMIENTO, type DefMovimiento, type TipoMovimiento } from "../lib/movimientos";
import { autorizacionPropia, type Autorizacion, type PayloadAutorizacion } from "../lib/autorizacion";
import { ModalAutorizacionPin } from "./modal-autorizacion-pin";

/** Roles que tienen `caja.sangria` y `caja.deposito` (matriz §2.2). */
const ROLES_CAJA = ["SUPERVISOR", "ADMIN", "DUENO"];
// El cajero normalmente NO tiene caja.sangria — solo supervisor+. Verificar con BD.

export function ModalMovimientoCaja({
  token,
  empleado,
  caja,
  turno,
  onRegistrado,
  onCerrar,
}: {
  token: string;
  empleado: Empleado;
  caja: DatosCaja;
  turno: Turno;
  onRegistrado: (mov: { id: string; folio: string; tipo: TipoMovimiento; monto: number }) => void;
  onCerrar: () => void;
}) {
  const [tipo, setTipo] = useState<TipoMovimiento>("SANGRIA");
  const [montoStr, setMontoStr] = useState("");
  const [motivoTexto, setMotivoTexto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [pidiendoPin, setPidiendoPin] = useState(false);

  const def: DefMovimiento = TIPOS_MOVIMIENTO.find((t) => t.codigo === tipo) ?? TIPOS_MOVIMIENTO[0]!;
  const monto = Number(montoStr || 0);
  const tienePermiso = ROLES_CAJA.includes(empleado.rol);

  function labelMotivo(): string {
    return motivoTexto.trim() || def.label;
  }

  function payload(): PayloadAutorizacion {
    return {
      accion: `movimiento_${def.codigo.toLowerCase()}`,
      permisoCodigo: def.permiso,
      entidadTipo: "movimiento_caja",
      entidadId: null,
      monto,
      motivo: labelMotivo(),
      cajaId: turno.caja_id,
      turnoId: turno.id,
    };
  }

  async function ejecutarConAutorizacion(a: Autorizacion | null) {
    setProcesando(true);
    setError(null);
    try {
      const mov = await registrarMovimiento(token, {
        tenantId: caja.tenant_id,
        sucursalId: caja.sucursal_id,
        cajaId: turno.caja_id,
        turnoId: turno.id,
        diaContable: turno.dia_contable,
        tipo,
        montoMxn: monto,
        motivo: labelMotivo(),
        descripcion: descripcion.trim() || null,
        usuarioSolicitanteId: empleado.id,
        autorizacionPinId: a?.autorizacionPinId ?? null,
      });
      onRegistrado({ id: mov.id, folio: mov.folio, tipo, monto });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el movimiento");
      setProcesando(false);
      setPidiendoPin(false);
    }
  }

  async function onConfirmar() {
    setError(null);
    if (monto <= 0) {
      setError("El monto debe ser mayor a 0");
      return;
    }
    if (motivoTexto.trim().length === 0) {
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
      await ejecutarConAutorizacion(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo autorizar el movimiento");
      setProcesando(false);
    }
  }

  if (pidiendoPin) {
    return (
      <ModalAutorizacionPin
        token={token}
        accion={payload().accion}
        permisoCodigo={def.permiso}
        descripcion={`${def.label} · ${fmtMxn(monto)} · ${labelMotivo()}`}
        ejecutaNombre={empleado.nombre}
        monto={monto}
        entidadTipo="movimiento_caja"
        entidadId={null}
        cajaId={turno.caja_id}
        turnoId={turno.id}
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
      title="Movimiento de caja"
      hideTitle
      className="w-[500px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]"
    >
      <div className="mb-5">
        <h2 className="font-display text-xl font-semibold tracking-tight">Movimiento de caja</h2>
        <p className="mt-0.5 text-[13px] text-ink-3">Turno {turno.codigo_turno} · {caja.nombre}</p>
      </div>

      {/* Selector tipo */}
      <div className="mb-1.5 text-[13px] font-medium text-ink-2">Tipo de movimiento</div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {TIPOS_MOVIMIENTO.map((t) => (
          <button
            key={t.codigo}
            type="button"
            onClick={() => setTipo(t.codigo)}
            className={[
              "rounded-lg border px-3 py-3 text-left transition",
              tipo === t.codigo ? "border-ink bg-sel shadow-[inset_0_0_0_1.5px_#16161A]" : "border-line bg-surface hover:border-line-strong",
            ].join(" ")}
          >
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-semibold">{t.label}</span>
              <span className={["text-[11px] font-bold tabular-nums", t.signo > 0 ? "text-success" : "text-danger"].join(" ")}>
                {t.signo > 0 ? "+" : "−"}
              </span>
            </div>
            <div className="mt-0.5 text-[11.5px] leading-tight text-ink-3">{t.descripcion}</div>
          </button>
        ))}
      </div>

      {/* Monto */}
      <label className="mb-1.5 block text-[13px] font-medium text-ink-2" htmlFor="mov-monto">
        Monto
      </label>
      <div className="relative mb-3">
        <input
          id="mov-monto"
          className={input}
          value={montoStr}
          inputMode="decimal"
          autoFocus
          onChange={(e) => setMontoStr(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0.00"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink-3">MXN</span>
      </div>

      {/* Motivo (texto libre) */}
      <label className="mb-1.5 block text-[13px] font-medium text-ink-2" htmlFor="mov-motivo">
        Motivo
      </label>
      <input
        id="mov-motivo"
        className={`${input} mb-3`}
        value={motivoTexto}
        maxLength={100}
        onChange={(e) => setMotivoTexto(e.target.value)}
        placeholder={def.codigo === "PAGO_PROVEEDOR" ? "Refrescos La Norteña" : "Refuerzo a caja fuerte"}
      />

      {/* Descripción opcional */}
      <label className="mb-1.5 block text-[13px] font-medium text-ink-2" htmlFor="mov-desc">
        Descripción · <span className="text-ink-3">opcional</span>
      </label>
      <textarea
        id="mov-desc"
        className={`${input} mb-4 h-20 resize-none py-2`}
        value={descripcion}
        maxLength={300}
        onChange={(e) => setDescripcion(e.target.value)}
        placeholder="Detalles del movimiento (folio de factura, beneficiario, etc.)"
      />

      <div
        className={[
          "mb-4 rounded border px-3 py-2 text-[12.5px] font-medium",
          tienePermiso
            ? "border-[#D6E8DD] bg-[#EAF3EE] text-success"
            : "border-[#E8DCC0] bg-[#F6EEDD] text-warning",
        ].join(" ")}
      >
        {tienePermiso ? "Dentro de tu rol · no requiere autorización." : "Requiere PIN de un supervisor."}
      </div>

      {error && <p className="mb-3 text-sm font-medium text-danger" role="alert">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onCerrar} disabled={procesando}>Volver</Button>
        <Button onClick={onConfirmar} disabled={procesando || monto <= 0}>
          {procesando ? "Registrando…" : "Registrar movimiento"}
        </Button>
      </div>
    </Modal>
  );
}
