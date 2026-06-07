"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { type DatosCaja, type Turno } from "../lib/turno";
import { type Empleado } from "../lib/supabase";
import {
  confirmarEntrega,
  confirmarSalida,
  labelDeliveryEstado,
  leerDeliveries,
  siguienteAccionDelivery,
  type DeliveryAsignacion,
  type DeliveryEstado,
} from "../lib/delivery";
import { ModalLiquidarDelivery } from "./modal-liquidar-delivery";

const REFRESCO_MS = 8000;

const ESTADO_COLOR: Record<DeliveryEstado, string> = {
  ASIGNADO: "#9A6B12", EN_RUTA: "#2C5AA0", EN_DESTINO: "#2C5AA0", ENTREGADO: "#2E7D52",
  NO_ENTREGADO: "#C0392B", EN_REGRESO: "#9A6B12", LIQUIDADO: "#6E6E73", CANCELADO: "#6E6E73",
};

function fmtMxn(n: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
}

export function PantallaDelivery({
  token,
  caja,
  turno,
  empleado,
  onSalir,
}: {
  token: string;
  caja: DatosCaja;
  turno: Turno;
  empleado: Empleado;
  onSalir: () => void;
}) {
  const [items, setItems] = useState<DeliveryAsignacion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState<Set<string>>(new Set());
  const [liquidando, setLiquidando] = useState<DeliveryAsignacion | null>(null);
  const montado = useRef(true);

  const recargar = useCallback(async () => {
    try {
      const d = await leerDeliveries(token, caja.sucursal_id);
      if (montado.current) {
        setItems(d);
        setError(null);
      }
    } catch (e) {
      if (montado.current) setError(e instanceof Error ? e.message : "No se pudieron leer los domicilios");
    }
  }, [token, caja.sucursal_id]);

  useEffect(() => {
    montado.current = true;
    recargar();
    const id = setInterval(recargar, REFRESCO_MS);
    return () => {
      montado.current = false;
      clearInterval(id);
    };
  }, [recargar]);

  async function avanzar(d: DeliveryAsignacion) {
    const acc = siguienteAccionDelivery(d.estado);
    if (!acc) return;
    setProcesando((p) => new Set(p).add(d.id));
    try {
      if (acc.destino === "salida") await confirmarSalida(token, d.id);
      else if (acc.destino === "entrega") await confirmarEntrega(token, d.id, 0);
      else if (acc.destino === "liquidar") {
        // F19.2: la liquidación abre un modal para desglosar efectivo/tarjeta.
        setLiquidando(d);
        setProcesando((p) => {
          const n = new Set(p);
          n.delete(d.id);
          return n;
        });
        return;
      }
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar el domicilio");
    } finally {
      setProcesando((p) => {
        const n = new Set(p);
        n.delete(d.id);
        return n;
      });
    }
  }

  const activos = items?.length ?? 0;

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-shrink-0 items-center justify-between border-b border-line bg-surface px-6 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink"><span className="font-display text-[15px] font-bold text-white">V</span></div>
          <div>
            <div className="font-display text-[16px] font-bold leading-tight">Domicilios · {caja.nombre}</div>
            <div className="text-[11.5px] text-ink-3">{activos} {activos === 1 ? "pedido en curso" : "pedidos en curso"}</div>
          </div>
        </div>
        <button type="button" onClick={onSalir} className="flex h-9 items-center gap-1.5 rounded border border-line-strong px-3 text-[13px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          Salir
        </button>
      </header>

      {error && <div className="mx-6 mt-3 rounded border border-[#EDC4BE] bg-[#FBECEA] px-3 py-2 text-[13px] font-medium text-danger" role="alert">{error}</div>}

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {items === null && <p className="text-center text-ink-3">Cargando domicilios…</p>}
        {items !== null && items.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-ink-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-12 w-12"><circle cx="12" cy="10" r="3" /><path d="M12 2a8 8 0 0 0-8 8c0 5.5 8 12 8 12s8-6.5 8-12a8 8 0 0 0-8-8z" /></svg>
            <p className="text-[17px] font-semibold text-ink-2">Sin pedidos a domicilio</p>
            <p className="text-[13px]">Los domicilios asignados a repartidores aparecerán aquí.</p>
          </div>
        )}
        {items !== null && items.length > 0 && (
          <div className="mx-auto flex max-w-[760px] flex-col gap-2.5">
            {items.map((d) => {
              const acc = siguienteAccionDelivery(d.estado);
              const enProceso = procesando.has(d.id);
              return (
                <div key={d.id} className="flex items-center gap-4 rounded-lg border border-line bg-surface p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-[16px] font-bold">{d.ticketFolio ?? d.ticketId.slice(-6)}</span>
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: ESTADO_COLOR[d.estado] }}>
                        {labelDeliveryEstado(d.estado)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[12.5px] text-ink-2">
                      Repartidor: <span className="font-medium">{d.repartidorNombre}</span>
                      {d.tiempoPromesa != null && <span className="text-ink-3"> · promesa {d.tiempoPromesa} min</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11.5px] uppercase tracking-wide text-ink-3">A liquidar</div>
                    <div className="font-display text-[16px] font-bold tabular-nums">{fmtMxn(d.montoALiquidar)}</div>
                  </div>
                  {acc && (
                    <button
                      type="button"
                      disabled={enProceso}
                      onClick={() => avanzar(d)}
                      className="h-10 rounded bg-ink px-4 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                    >
                      {enProceso ? "…" : acc.label}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {liquidando && (
        <ModalLiquidarDelivery
          token={token}
          asignacion={liquidando}
          liquidadoPorId={empleado.id}
          onLiquidado={() => {
            setLiquidando(null);
            recargar();
          }}
          onCerrar={() => setLiquidando(null)}
        />
      )}
    </div>
  );
}
