"use client";
import { useCallback, useEffect, useState } from "react";
import { fmtMxn, type DatosCaja } from "../lib/turno";
import { listarCuentasAbiertas, minutosAbierta, type CuentaAbierta } from "../lib/cuentas-abiertas";

const REFRESCO_MS = 8000;

/** Etiqueta de la etapa de cocina, para saber si ya está listo para recoger. */
function estadoLabel(estadoCocina: string): { txt: string; color: string } {
  if (estadoCocina === "LISTO" || estadoCocina === "ENTREGADO") return { txt: "Listo para recoger", color: "#2E7D52" };
  if (estadoCocina === "EN_COCINA") return { txt: "En preparación", color: "#B8651B" };
  return { txt: "Por enviar", color: "#6E6E74" };
}

/** Pick-up — órdenes por recolectar (cuentas abiertas DRIVE_THRU). Se cobran al recoger:
 *  "Retomar" carga la orden en el POS y desde ahí se cobra (flujo normal). */
export function PantallaPickup({
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

  const recargar = useCallback(async () => {
    try {
      const c = await listarCuentasAbiertas(token, caja.sucursal_id, "DRIVE_THRU");
      setItems(c);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron leer las cuentas");
    }
  }, [token, caja.sucursal_id]);

  useEffect(() => {
    recargar();
    const id = setInterval(recargar, REFRESCO_MS);
    const tick = setInterval(() => setAhora(new Date()), 30000);
    return () => { clearInterval(id); clearInterval(tick); };
  }, [recargar]);

  const activos = items?.length ?? 0;

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-shrink-0 items-center justify-between border-b border-line bg-surface px-6 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink"><span className="font-display text-[15px] font-bold text-white">V</span></div>
          <div>
            <div className="font-display text-[16px] font-bold leading-tight">Pick-up · {caja.nombre}</div>
            <div className="text-[11.5px] text-ink-3">{activos} {activos === 1 ? "orden por recolectar" : "órdenes por recolectar"}</div>
          </div>
        </div>
        <button type="button" onClick={onSalir} className="flex h-9 items-center gap-1.5 rounded border border-line-strong px-3 text-[13px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          Salir
        </button>
      </header>

      {error && <div className="mx-6 mt-3 rounded border border-[#EDC4BE] bg-[#FBECEA] px-3 py-2 text-[13px] font-medium text-danger" role="alert">{error}</div>}

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {items === null && <p className="text-center text-ink-3">Cargando…</p>}
        {items !== null && items.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-ink-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-12 w-12"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><path d="M3 6h18M16 10a4 4 0 0 1-8 0" /></svg>
            <p className="text-[17px] font-semibold text-ink-2">Sin órdenes por recolectar</p>
            <p className="text-[13px]">Las órdenes de Pick-up enviadas a cocina aparecerán aquí hasta que se recojan.</p>
          </div>
        )}
        {items !== null && items.length > 0 && (
          <div className="mx-auto grid max-w-[900px] grid-cols-1 gap-3 sm:grid-cols-2">
            {items.map((c) => {
              const est = estadoLabel(c.estadoCocina);
              const min = minutosAbierta(c.desdeIso, ahora);
              return (
                <button
                  key={c.ticketId}
                  type="button"
                  onClick={() => onRetomar(c.ticketId)}
                  className="flex flex-col gap-2 rounded-xl border border-line-strong bg-surface p-4 text-left transition hover:border-ink"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display text-[18px] font-bold tabular-nums">{c.folio ?? c.ticketId.slice(-6)}</span>
                    <span className="rounded-full px-2.5 py-0.5 text-[11.5px] font-bold text-white" style={{ background: est.color }}>{est.txt}</span>
                  </div>
                  <div className="flex items-center justify-between text-[12.5px] text-ink-3">
                    <span>{c.nItems} {c.nItems === 1 ? "producto" : "productos"} · hace {min} min</span>
                    <span className="font-display text-[16px] font-bold tabular-nums text-ink">{fmtMxn(c.total)}</span>
                  </div>
                  <span className="mt-1 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-2">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M9 14l-4-4 4-4M5 10h11a4 4 0 0 1 0 8h-1" /></svg>
                    Retomar y cobrar
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
