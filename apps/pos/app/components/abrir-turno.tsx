"use client";
import { useEffect, useRef, useState } from "react";
import { obtenerImpresora } from "../lib/print/adapter";
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
  negocioLabel,
  vertical,
  onTurnoAbierto,
  onVolver,
}: {
  empleado: Empleado;
  token: string;
  cajaId: string;
  cajaNumero: number;
  cajaLabel: string;
  sucursalLabel: string;
  negocioLabel?: string;
  /** Vertical del negocio: decide si se ofrece el bloque de evento (solo foodtruck). */
  vertical?: string | null;
  onTurnoAbierto: (t: Turno) => void;
  /** Regresa a la pantalla anterior sin abrir nada. */
  onVolver: () => void;
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

  // El cajón se abre AL ENTRAR, no al terminar.
  //
  // Antes se abría después de declarar el fondo, y el orden real es el contrario: el cajero
  // necesita el cajón abierto para contar lo que hay dentro —o meter lo que trae— y ESO es lo
  // que luego escribe. Abrirlo al final lo obligaba a declarar de memoria y corregir después.
  //
  // Una sola vez por montaje: un re-render no debe volver a abrirlo. Best-effort — si la
  // impresora no responde el cajero lo ve al instante, porque está parado frente al cajón.
  const cajonAbierto = useRef(false);
  useEffect(() => {
    if (cajonAbierto.current) return;
    cajonAbierto.current = true;
    obtenerImpresora("CAJA", { onMostrar: () => {} }).abrirCajon().catch(() => {});
  }, []);

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

  /* El bloque de evento es de la vertical FOODTRUCK (Flujos B3 §4): un camión que hoy
     vende en una feria y mañana en otra. A un local fijo no le aplica nunca, y le
     ocupaba sitio en la pantalla que más prisa tiene del turno. */
  const ofreceEvento = vertical === "FOODTRUCK";

  return (
    <div className="flex h-screen flex-col">
      <TopbarPos negocio={negocioLabel} sucursal={sucursalLabel} caja={cajaLabel} />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-[560px]">
          <div className="mb-6 text-center">
            <h1 className="font-display text-2xl font-semibold tracking-tight">Abrir turno</h1>
            <p className="mt-1 text-sm text-ink-2">
              Cuenta el efectivo con el que arranca la caja. El turno queda a nombre de{" "}
              <b className="font-semibold text-ink">{empleado.nombre}</b>
              {empleado.nombre.endsWith(".") ? "" : "."}
            </p>
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
            {ofreceEvento && (
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
            )}

            {error && (
              <p className="mt-3 text-sm font-medium text-danger" role="alert">{error}</p>
            )}
          </div>

          {/* Acciones */}
          <div className="mt-5 flex items-center justify-between">
            {/* Volver, no "cambiar cajero": desde aquí lo que se necesita es salir sin
                abrir nada y regresar a donde estabas. Cambiar de usuario sigue estando
                en el menú del inicio, que es su sitio. */}
            <button
              type="button"
              onClick={onVolver}
              className="flex h-11 items-center gap-2 rounded border border-line-strong px-4 text-[13.5px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
              Volver
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
