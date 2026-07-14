"use client";
import { useCallback, useEffect, useState } from "react";
import { fmtMxn, type DatosCaja } from "../lib/turno";
import { listarCuentasAbiertas, marcarSalidaDomicilio, minutosAbierta, type CuentaAbierta } from "../lib/cuentas-abiertas";

const REFRESCO_MS = 8000;

/** Tarjeta de un pedido a domicilio. */
function Tarjeta({
  c,
  ahora,
  onRetomar,
  onSalida,
  procesando,
}: {
  c: CuentaAbierta;
  ahora: Date;
  onRetomar: (id: string) => void;
  onSalida?: (id: string) => void;
  procesando: boolean;
}) {
  const min = minutosAbierta(c.desdeIso, ahora);
  const listo = c.estadoCocina === "LISTO" || c.estadoCocina === "ENTREGADO";
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line-strong bg-surface p-4">
      <div className="flex items-center justify-between">
        <span className="font-display text-[17px] font-bold tabular-nums">{c.folio ?? c.ticketId.slice(-6)}</span>
        <span className="font-display text-[15px] font-bold tabular-nums text-ink">{fmtMxn(c.total)}</span>
      </div>
      <div className="text-[13px] font-medium text-ink-2">{c.cliente ?? "Cliente sin nombre"}</div>
      <div className="flex items-center justify-between text-[12px] text-ink-3">
        <span>{c.nItems} {c.nItems === 1 ? "producto" : "productos"} · hace {min} min</span>
        {onSalida && <span className={listo ? "font-semibold text-success" : ""}>{listo ? "Listo en cocina" : "En cocina"}</span>}
      </div>
      <div className="mt-1 flex gap-2">
        <button
          type="button"
          onClick={() => onRetomar(c.ticketId)}
          className="flex-1 rounded border border-line-strong px-3 py-2 text-[12.5px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink"
        >
          {onSalida ? "Editar" : "Cobrar / editar"}
        </button>
        {onSalida ? (
          <button
            type="button"
            disabled={procesando}
            onClick={() => onSalida(c.ticketId)}
            className="flex-1 rounded bg-ink px-3 py-2 text-[12.5px] font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {procesando ? "…" : "Marcar salida"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Domicilio — tablero de cuentas abiertas en 2 etapas (sin repartidor específico):
 *  En preparación (comanda no impresa) → En entrega (ya salió/impreso). Se cobra al regresar el
 *  repartidor: "Cobrar/editar" retoma la orden en el POS y se cobra en el flujo normal → PAGADO. */
export function PantallaDomicilioCuentas({
  token,
  caja,
  onSalir,
  onRetomar,
}: {
  token: string;
  caja: DatosCaja;
  onSalir: () => void;
  onRetomar: (ticketId: string) => void;
}) {
  const [items, setItems] = useState<CuentaAbierta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => new Date());
  const [procesando, setProcesando] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    try {
      setItems(await listarCuentasAbiertas(token, caja.sucursal_id, "DELIVERY_PROPIO"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron leer los domicilios");
    }
  }, [token, caja.sucursal_id]);

  useEffect(() => {
    recargar();
    const id = setInterval(recargar, REFRESCO_MS);
    const tick = setInterval(() => setAhora(new Date()), 30000);
    return () => { clearInterval(id); clearInterval(tick); };
  }, [recargar]);

  const marcarSalida = useCallback(async (ticketId: string) => {
    setProcesando(ticketId);
    try {
      await marcarSalidaDomicilio(token, ticketId);
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo marcar la salida");
    } finally {
      setProcesando(null);
    }
  }, [token, recargar]);

  const preparacion = (items ?? []).filter((c) => !c.impresaAt);
  const entrega = (items ?? []).filter((c) => c.impresaAt);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-shrink-0 items-center justify-between border-b border-line bg-surface px-6 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink"><span className="font-display text-[15px] font-bold text-white">V</span></div>
          <div>
            <div className="font-display text-[16px] font-bold leading-tight">Domicilios · {caja.nombre}</div>
            <div className="text-[11.5px] text-ink-3">{(items?.length ?? 0)} pedidos activos</div>
          </div>
        </div>
        <button type="button" onClick={onSalir} className="flex h-9 items-center gap-1.5 rounded border border-line-strong px-3 text-[13px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          Salir
        </button>
      </header>

      {error && <div className="mx-6 mt-3 rounded border border-[#EDC4BE] bg-[#FBECEA] px-3 py-2 text-[13px] font-medium text-danger" role="alert">{error}</div>}

      {items === null ? (
        <p className="p-8 text-center text-ink-3">Cargando…</p>
      ) : items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-ink-3">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-12 w-12"><circle cx="12" cy="10" r="3" /><path d="M12 2a8 8 0 0 0-8 8c0 5.5 8 12 8 12s8-6.5 8-12a8 8 0 0 0-8-8z" /></svg>
          <p className="text-[17px] font-semibold text-ink-2">Sin pedidos a domicilio</p>
          <p className="text-[13px]">Los domicilios enviados a cocina aparecerán aquí hasta que se cobren.</p>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-y-auto p-6 md:grid-cols-2">
          {/* Columna: En preparación */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#B8651B]" />
              <h3 className="text-[13px] font-bold uppercase tracking-[0.04em] text-ink-2">En preparación</h3>
              <span className="text-[12px] text-ink-3">({preparacion.length})</span>
            </div>
            {preparacion.length === 0 && <p className="text-[13px] text-ink-3">Nada en preparación.</p>}
            {preparacion.map((c) => (
              <Tarjeta key={c.ticketId} c={c} ahora={ahora} onRetomar={onRetomar} onSalida={marcarSalida} procesando={procesando === c.ticketId} />
            ))}
          </section>
          {/* Columna: En entrega (salió/impreso) */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#2C5AA0]" />
              <h3 className="text-[13px] font-bold uppercase tracking-[0.04em] text-ink-2">En entrega · pagar al regreso</h3>
              <span className="text-[12px] text-ink-3">({entrega.length})</span>
            </div>
            {entrega.length === 0 && <p className="text-[13px] text-ink-3">Nada en entrega.</p>}
            {entrega.map((c) => (
              <Tarjeta key={c.ticketId} c={c} ahora={ahora} onRetomar={onRetomar} procesando={false} />
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
