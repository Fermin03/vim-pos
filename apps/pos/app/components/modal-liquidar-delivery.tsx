"use client";
import { useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { fmtMxn } from "../lib/turno";
import { liquidarDelivery, type DeliveryAsignacion } from "../lib/delivery";

/**
 * F19.2 — Liquidación de domicilio con desglose efectivo/tarjeta.
 * El repartidor regresa con dinero: parte en efectivo, parte aprobada por terminal.
 * efectivo + tarjeta deben sumar el monto a liquidar; la diferencia la calcula la BD.
 */
export function ModalLiquidarDelivery({
  token,
  asignacion,
  liquidadoPorId,
  onLiquidado,
  onCerrar,
}: {
  token: string;
  asignacion: DeliveryAsignacion;
  liquidadoPorId: string;
  onLiquidado: () => void;
  onCerrar: () => void;
}) {
  const monto = asignacion.montoALiquidar;
  const [efectivoStr, setEfectivoStr] = useState(String(monto));
  const [tarjetaStr, setTarjetaStr] = useState("0");
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  const efectivo = Number(efectivoStr || 0);
  const tarjeta = Number(tarjetaStr || 0);
  const suma = Math.round((efectivo + tarjeta) * 100) / 100;
  const diferencia = Math.round((suma - monto) * 100) / 100;

  function setSoloEfectivo() {
    setEfectivoStr(String(monto));
    setTarjetaStr("0");
  }

  async function confirmar() {
    setError(null);
    if (efectivo < 0 || tarjeta < 0) {
      setError("Los montos no pueden ser negativos");
      return;
    }
    setProcesando(true);
    try {
      await liquidarDelivery(token, {
        asignacionId: asignacion.id,
        efectivo,
        tarjeta,
        liquidadoPorId,
        nota: nota.trim() || null,
      });
      onLiquidado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo liquidar");
      setProcesando(false);
    }
  }

  const input =
    "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
  const label = "mb-1.5 block text-[13px] font-medium text-ink-2";

  return (
    <Modal open onClose={onCerrar} title="Liquidar domicilio" hideTitle
      className="w-[440px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]">
      <div className="mb-5">
        <h2 className="font-display text-xl font-semibold tracking-tight">Liquidar domicilio</h2>
        <p className="mt-0.5 text-[13px] text-ink-3">
          {asignacion.ticketFolio ?? asignacion.ticketId.slice(-6)} · {asignacion.repartidorNombre}
        </p>
      </div>

      <div className="mb-4 flex items-center justify-between rounded border border-line bg-sel px-3 py-2.5">
        <span className="text-[13px] font-medium text-ink-2">A liquidar</span>
        <span className="font-display text-[18px] font-bold tabular-nums">{fmtMxn(monto)}</span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-4">
        <div>
          <label className={label} htmlFor="lq-efe">Efectivo</label>
          <input id="lq-efe" className={input} value={efectivoStr} inputMode="decimal" autoFocus
            onChange={(e) => setEfectivoStr(e.target.value.replace(/[^0-9.]/g, ""))} />
        </div>
        <div>
          <label className={label} htmlFor="lq-tar">Tarjeta</label>
          <input id="lq-tar" className={input} value={tarjetaStr} inputMode="decimal"
            onChange={(e) => setTarjetaStr(e.target.value.replace(/[^0-9.]/g, ""))} />
        </div>
      </div>

      <button type="button" onClick={setSoloEfectivo}
        className="mb-3 text-[12px] font-semibold text-ink-3 underline-offset-2 hover:text-ink hover:underline">
        Todo en efectivo
      </button>

      <div className={["mb-4 rounded border px-3 py-2 text-[12.5px] font-medium",
        diferencia === 0 ? "border-[#D6E8DD] bg-[#EAF3EE] text-success"
          : diferencia > 0 ? "border-[#E8DCC0] bg-[#F6EEDD] text-warning"
          : "border-[#EDC4BE] bg-[#FBECEA] text-danger"].join(" ")}>
        Suma: <b>{fmtMxn(suma)}</b>
        {diferencia === 0 && " · cuadra exacto"}
        {diferencia > 0 && ` · sobran ${fmtMxn(diferencia)}`}
        {diferencia < 0 && ` · faltan ${fmtMxn(-diferencia)}`}
      </div>

      <div className="mb-4">
        <label className={label} htmlFor="lq-nota">Nota <span className="text-ink-3">· opcional</span></label>
        <input id="lq-nota" className={input} value={nota} maxLength={200}
          onChange={(e) => setNota(e.target.value)} placeholder="Ej. propina incluida" />
      </div>

      {error && <p className="mb-3 text-sm font-medium text-danger" role="alert">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onCerrar} disabled={procesando}>Cancelar</Button>
        <Button onClick={confirmar} disabled={procesando}>{procesando ? "Liquidando…" : "Liquidar"}</Button>
      </div>
    </Modal>
  );
}
