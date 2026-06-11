"use client";
import { useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { calcularTotalesDisplay, type EstadoCarrito } from "../lib/carrito";
import { cobrarOffline, type CtxOffline } from "../lib/cobro-offline";
import { fmtMxn } from "../lib/turno";

// Fase 3 · cobro SIN conexión: encola la venta en el outbox (ticket+items+pago) y se
// sincroniza sola al volver la red. Sin descuentos/propina offline (requieren RPCs).

const METODOS = [
  { codigo: "EFECTIVO", label: "Efectivo" },
  { codigo: "TARJETA_DEBITO", label: "T. Débito" },
  { codigo: "TARJETA_CREDITO", label: "T. Crédito" },
  { codigo: "TRANSFERENCIA", label: "Transferencia" },
] as const;

export function ModalCobroOffline({
  ctx, carrito, onCobrado, onCerrar,
}: {
  ctx: CtxOffline;
  carrito: EstadoCarrito;
  onCobrado: () => void;
  onCerrar: () => void;
}) {
  const totales = calcularTotalesDisplay(carrito.lineas);
  const [metodo, setMetodo] = useState<string>("EFECTIVO");
  const [recibido, setRecibido] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  const montoRecibido = Number(recibido || 0);
  const cambio = metodo === "EFECTIVO" ? Math.max(0, Math.round((montoRecibido - totales.total) * 100) / 100) : 0;
  const valido = metodo !== "EFECTIVO" || montoRecibido >= totales.total;

  async function confirmar() {
    setProcesando(true);
    setError(null);
    try {
      await cobrarOffline(
        ctx,
        carrito.modoServicio,
        carrito.lineas,
        {
          metodo,
          montoMxn: totales.total,
          montoRecibidoMxn: metodo === "EFECTIVO" ? montoRecibido : null,
          cambioMxn: metodo === "EFECTIVO" ? cambio : null,
        },
        {
          clienteId: carrito.clienteDomicilio?.clienteId ?? null,
          direccionEntregaId: carrito.clienteDomicilio?.direccionId ?? null,
          notaOrden: carrito.notaOrden ?? null,
        },
      );
      setListo(true);
      setTimeout(onCobrado, 1400);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la venta offline");
      setProcesando(false);
    }
  }

  return (
    <Modal open onClose={listo ? onCobrado : onCerrar} title="Cobro sin conexión" hideTitle
      className="w-[420px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="font-display text-xl font-semibold tracking-tight">Cobro sin conexión</h2>
        <span className="rounded-full bg-[#F6EEDD] px-2.5 py-1 text-[11px] font-bold text-[#9A6B12]">OFFLINE</span>
      </div>
      <p className="mb-4 text-[12.5px] text-ink-3">
        La venta se guarda en este dispositivo y se sincroniza sola al volver la conexión.
      </p>

      {listo ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EAF3EE] text-success">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-6 w-6"><path d="M20 6 9 17l-5-5" /></svg>
          </div>
          <p className="text-[15px] font-semibold">Venta guardada</p>
          <p className="text-[12.5px] text-ink-3">Pendiente de sincronizar (verás el avance en la barra azul).</p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-line bg-sel px-5 py-4 text-center">
            <div className="text-[12px] font-medium uppercase tracking-wide text-ink-3">Total a cobrar</div>
            <div className="font-display text-[34px] font-bold tabular-nums">{fmtMxn(totales.total)}</div>
          </div>

          <div className="mt-4 grid grid-cols-4 gap-1.5">
            {METODOS.map((m) => (
              <button key={m.codigo} type="button" onClick={() => setMetodo(m.codigo)}
                className={["rounded-md px-1 py-2.5 text-[12px] font-semibold transition", metodo === m.codigo ? "bg-ink text-white" : "bg-sel text-ink-2 hover:bg-hover"].join(" ")}>
                {m.label}
              </button>
            ))}
          </div>

          {metodo === "EFECTIVO" && (
            <div className="mt-3">
              <label className="mb-1 block text-[12.5px] font-medium text-ink-2" htmlFor="recibido-off">Efectivo recibido</label>
              <input
                id="recibido-off"
                autoFocus
                inputMode="decimal"
                className="h-12 w-full rounded border border-line-strong px-3 text-center font-display text-xl font-bold tabular-nums outline-none focus:border-ink"
                value={recibido}
                onChange={(e) => setRecibido(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0.00"
              />
              <div className="mt-2 flex justify-between text-[13.5px]">
                <span className="text-ink-3">Cambio</span>
                <span className="font-display font-bold tabular-nums">{fmtMxn(cambio)}</span>
              </div>
            </div>
          )}

          <p className="mt-3 text-[11.5px] text-ink-3">
            Sin conexión no hay descuentos ni propina; la comanda llegará a cocina al sincronizar.
          </p>

          {error && <p className="mt-2 text-sm font-medium text-danger" role="alert">{error}</p>}

          <div className="mt-4 flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={onCerrar} disabled={procesando}>Cancelar</Button>
            <Button onClick={confirmar} disabled={!valido || procesando}>
              {procesando ? "Guardando…" : `Cobrar ${fmtMxn(totales.total)}`}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
