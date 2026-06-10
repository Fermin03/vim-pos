"use client";
import { useEffect, useState } from "react";
import { Button } from "@vim/ui/styles";
import { TopbarPos } from "./topbar-pos";
import { abrirTurno, eventosRecientes, fmtMxn, type Turno } from "../lib/turno";
import { type Empleado } from "../lib/supabase";

const SUGERENCIAS = [200, 500, 1000, 1500];

/** Apertura de turno (mockup P-058) — modo TOTAL (suma directa). El modo
 *  DENOMINACION queda como deuda para enriquecer cuando se priorice. */
export function AbrirTurno({
  empleado,
  token,
  cajaId,
  cajaNumero,
  cajaLabel,
  sucursalLabel,
  onTurnoAbierto,
  onCambiarCajero,
}: {
  empleado: Empleado;
  token: string;
  cajaId: string;
  cajaNumero: number;
  cajaLabel: string;
  sucursalLabel: string;
  onTurnoAbierto: (t: Turno) => void;
  onCambiarCajero: () => void;
}) {
  const [fondo, setFondo] = useState<string>("500");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [abriendo, setAbriendo] = useState(false);
  // B3 Foodtruck — evento como contexto del turno (Flujos §4)
  const [esEvento, setEsEvento] = useState(false);
  const [eventoNombre, setEventoNombre] = useState("");
  const [eventoNotas, setEventoNotas] = useState("");
  const [sugerenciasEvento, setSugerenciasEvento] = useState<string[]>([]);

  useEffect(() => {
    eventosRecientes(token).then(setSugerenciasEvento).catch(() => {});
  }, [token]);

  const monto = Number(fondo || 0);
  const valido = monto > 0 && (!esEvento || eventoNombre.trim().length > 0);

  async function abrir() {
    setError(null);
    setAbriendo(true);
    try {
      const t = await abrirTurno(token, {
        cajaId,
        cajaNumero,
        fondoInicial: monto,
        notas: notas.trim() || undefined,
        eventoNombre: esEvento ? eventoNombre : null,
        eventoNotas: esEvento ? eventoNotas : null,
      });
      onTurnoAbierto(t);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      setError(
        msg === "YA_HAY_TURNO_ABIERTO"
          ? "Ya hay un turno abierto en esta caja."
          : msg === "FONDO_INVALIDO"
            ? "El fondo no puede ser negativo."
            : msg,
      );
      setAbriendo(false);
    }
  }

  const ahora = new Date();
  const fechaHora = ahora.toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return (
    <div className="flex h-screen flex-col">
      <TopbarPos sucursal={sucursalLabel} caja={cajaLabel} />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-[560px]">
          <div className="mb-6 text-center">
            <h1 className="font-display text-2xl font-semibold tracking-tight">Abrir turno</h1>
            <p className="mt-1 text-sm text-ink-2">
              Cuenta el efectivo con el que inicia la caja para registrar el fondo.
            </p>
          </div>

          {/* Resumen del turno */}
          <div className="mb-6 grid grid-cols-3 divide-x divide-line rounded-lg border border-line bg-surface">
            <div className="p-4">
              <div className="text-[11px] font-bold uppercase tracking-wide text-ink-3">Cajero</div>
              <div className="mt-1 text-[14px] font-semibold">{empleado.nombre}</div>
            </div>
            <div className="p-4">
              <div className="text-[11px] font-bold uppercase tracking-wide text-ink-3">Caja</div>
              <div className="mt-1 text-[14px] font-semibold">{cajaLabel}</div>
            </div>
            <div className="p-4">
              <div className="text-[11px] font-bold uppercase tracking-wide text-ink-3">Fecha y hora</div>
              <div className="mt-1 text-[14px] font-semibold tabular-nums">{fechaHora}</div>
            </div>
          </div>

          {/* Captura del fondo */}
          <div className="rounded-lg border border-line bg-surface p-5">
            <label className="block text-[13px] font-medium text-ink-2" htmlFor="fondo">
              Fondo inicial (MXN)
            </label>
            <p className="mb-2 text-[12px] text-ink-3">Suma total del efectivo con el que abres la caja.</p>
            <input
              id="fondo"
              className="h-14 w-full rounded border border-line-strong px-4 text-center font-display text-2xl font-bold tabular-nums outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]"
              value={fondo}
              inputMode="decimal"
              onChange={(e) => setFondo(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0.00"
            />

            <div className="mt-3 flex flex-wrap gap-2">
              {SUGERENCIAS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFondo(String(s))}
                  className="rounded border border-line-strong bg-hover px-3 py-1.5 text-[13px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink"
                >
                  {fmtMxn(s)}
                </button>
              ))}
            </div>

            <label className="mt-5 block text-[13px] font-medium text-ink-2" htmlFor="notas">
              Notas <span className="text-ink-3">· opcional</span>
            </label>
            <input
              id="notas"
              className="h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink"
              value={notas}
              maxLength={200}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="p.ej. cambio recibido del turno anterior"
            />

            {/* B3 — ¿Es un evento o ubicación especial? (Foodtruck §4) */}
            <div className="mt-5 border-t border-line pt-4">
              <label className="flex cursor-pointer items-center gap-2.5 text-[13.5px] font-medium text-ink-2">
                <input
                  type="checkbox"
                  checked={esEvento}
                  onChange={(e) => setEsEvento(e.target.checked)}
                  className="h-4 w-4 accent-ink"
                />
                ¿Es un evento o ubicación especial?
              </label>
              {esEvento && (
                <div className="mt-3">
                  <input
                    className="h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink"
                    value={eventoNombre}
                    maxLength={150}
                    onChange={(e) => setEventoNombre(e.target.value)}
                    placeholder="Nombre del evento, p.ej. Feria de León 2026"
                    autoFocus
                  />
                  {sugerenciasEvento.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {sugerenciasEvento.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setEventoNombre(s)}
                          className="rounded-full bg-sel px-3 py-1 text-[12px] font-semibold text-ink-2 transition hover:bg-hover"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  <input
                    className="mt-2 h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink"
                    value={eventoNotas}
                    maxLength={300}
                    onChange={(e) => setEventoNotas(e.target.value)}
                    placeholder="Notas del evento · opcional (contacto, stand, condiciones)"
                  />
                  <p className="mt-1.5 text-[11.5px] text-ink-3">
                    Si el organizador cobra comisión, la capturas al cerrar el turno. Las ventas se reportan por evento.
                  </p>
                </div>
              )}
            </div>

            {error && (
              <p className="mt-3 text-sm font-medium text-danger" role="alert">{error}</p>
            )}
          </div>

          {/* Acciones */}
          <div className="mt-5 flex items-center justify-between">
            <button
              type="button"
              onClick={onCambiarCajero}
              className="text-[13px] font-medium text-ink-3 transition-colors hover:text-ink-2"
            >
              ← Cambiar cajero
            </button>
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-ink-3">Total fondo</span>
              <span className="font-display text-xl font-bold tabular-nums">{fmtMxn(monto)}</span>
              <Button size="lg" onClick={abrir} disabled={!valido || abriendo}>
                {abriendo ? "Abriendo…" : "Abrir turno"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
