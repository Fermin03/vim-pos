"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@vim/ui/styles";
import { leerDeliveries } from "../lib/delivery";
import { agruparViajes, minutosFuera, viajeTarde, type Viaje } from "../lib/viajes";
import { fmtMxn } from "../lib/turno";

/**
 * Quién anda repartiendo ahora mismo: qué lleva, desde hace cuánto y con cuánto dinero encima.
 *
 * Hasta la 0114 esto no existía en ninguna pantalla. `leerDeliveries` llevaba meses escrita y no la
 * llamaba nadie, así que el dinero del domicilio no se cuadraba contra nadie: no había a quién.
 *
 * Va en su propio archivo porque `pantalla-cuentas-modo.tsx` ya pasa de 500 líneas y meterle otra
 * vista entera la volvería difícil de leer y de editar sin romper algo de al lado.
 */
export function PanelEnReparto({
  token,
  sucursalId,
  onCobrar,
}: {
  token: string;
  sucursalId: string;
  /** El cobro de siempre. Liquidar al repartidor ya ocurre ahí dentro (`cerrarRepartoAlCobrar`). */
  onCobrar: (ticketId: string) => void;
}) {
  const [viajes, setViajes] = useState<Viaje[] | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Reloj propio: sin esto los minutos se quedan congelados en lo que decían al abrir la pantalla,
  // y son justo el dato por el que se mira aquí.
  const [ahora, setAhora] = useState(() => new Date());

  const recargar = useCallback(async () => {
    try {
      setViajes(agruparViajes(await leerDeliveries(token, sucursalId)));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer quién anda repartiendo");
    }
  }, [token, sucursalId]);

  useEffect(() => { void recargar(); }, [recargar]);

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => { void recargar(); }, 30_000);
    return () => clearInterval(t);
  }, [recargar]);

  const sel = viajes?.find((v) => v.id === selId) ?? null;

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex w-[clamp(18rem,30vw,24rem)] flex-shrink-0 flex-col border-r border-line">
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {viajes === null && <p className="p-3 text-sm text-ink-3">Cargando…</p>}

          {viajes?.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
              <p className="text-[14px] font-semibold text-ink-2">Nadie anda repartiendo</p>
              <p className="text-[12.5px] text-ink-3">
                Los pedidos que salgan con un repartidor aparecen aquí.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {viajes?.map((v) => {
              const activa = v.id === selId;
              // Tarde = se pasó de lo que se le prometió al cliente. Misma señal naranja que ya usa
              // la lista de cuentas para lo que va en camino.
              const tarde = viajeTarde(v, ahora);
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelId(v.id)}
                  className={[
                    "w-full rounded-lg border p-3 text-left transition",
                    tarde
                      ? `bg-accent text-white ${activa ? "border-ink" : "border-accent hover:brightness-105"}`
                      : activa
                        ? "border-ink bg-sel"
                        : "border-line-strong bg-surface hover:border-ink",
                  ].join(" ")}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-display text-[15px] font-semibold">{v.repartidorNombre}</span>
                    <span className="flex-shrink-0 font-display text-[15px] font-bold tabular-nums">{fmtMxn(v.efectivo)}</span>
                  </div>
                  <div className={["mt-0.5 flex items-center justify-between gap-2 text-[12px]", tarde ? "text-white/75" : "text-ink-3"].join(" ")}>
                    <span className="truncate">
                      {v.pedidos.length} {v.pedidos.length === 1 ? "pedido" : "pedidos"}
                    </span>
                    <span className="flex-shrink-0">{minutosFuera(v, ahora)} min</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {error && <p className="flex-shrink-0 bg-[#FBF1EF] px-4 py-2 text-[13px] font-medium text-danger" role="alert">{error}</p>}

        {!sel ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-[14px] font-semibold text-ink-2">Elige un repartidor</p>
            <p className="text-[12.5px] text-ink-3">Verás qué lleva y podrás cobrar cada pedido.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-shrink-0 items-center gap-2 border-b border-line px-4 py-3">
              <div className="mr-auto min-w-0">
                <div className="truncate font-display text-[16px] font-semibold">{sel.repartidorNombre}</div>
                <div className="text-[12px] text-ink-3">
                  {minutosFuera(sel, ahora)} min fuera · {fmtMxn(sel.efectivo)} a cobrar
                  {sel.promesaMin != null ? ` · prometido en ${sel.promesaMin} min` : ""}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {sel.pedidos.map((p) => (
                <div key={p.id} className="flex items-center gap-3 border-b border-line px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold text-ink">{p.ticketFolio ?? "Pedido"}</div>
                    <div className="text-[12px] text-ink-3">{fmtMxn(p.montoALiquidar)}</div>
                  </div>
                  {/* El mismo cobro de siempre: al cobrar se liquida solo al repartidor y el pedido
                      sale del viaje. No hay un paso aparte de "entregar el dinero". */}
                  <Button onClick={() => onCobrar(p.ticketId)}>Cobrar {fmtMxn(p.montoALiquidar)}</Button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
