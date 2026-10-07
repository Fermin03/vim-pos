"use client";
import { useEffect, useRef, useState } from "react";
import { obtenerImpresora } from "../lib/print/adapter";
import { Button, Modal } from "@vim/ui/styles";
import { abrirTurno, eventosRecientes, fmtMxn, type Turno } from "../lib/turno";

const SUGERENCIAS = [200, 500, 1000, 1500];

/**
 * Apertura de turno: un modal con una sola pregunta, el efectivo con el que arranca la caja.
 *
 * Era una pantalla completa (mockup P-058) con barra superior, notas y un pie con el total
 * repetido. Para escribir un número era mucho: tapaba el inicio entero y obligaba a leer antes de
 * teclear. Las notas se quitaron con ella — nadie las llenaba y el corte no las usa.
 *
 * Modo TOTAL (suma directa). El conteo por denominación sigue pendiente.
 */
export function ModalAbrirTurno({
  token,
  cajaId,
  cajaNumero,
  vertical,
  onTurnoAbierto,
  onCerrar,
}: {
  token: string;
  cajaId: string;
  cajaNumero: number;
  /** Vertical del negocio: decide si se ofrece el bloque de evento (solo foodtruck). */
  vertical?: string | null;
  onTurnoAbierto: (t: Turno) => void;
  /** Cierra sin abrir nada. */
  onCerrar: () => void;
}) {
  const [fondo, setFondo] = useState<string>("500");
  const [error, setError] = useState<string | null>(null);
  const [abriendo, setAbriendo] = useState(false);
  // B3 Foodtruck — evento como contexto del turno (Flujos §4)
  const [esEvento, setEsEvento] = useState(false);
  const [eventoNombre, setEventoNombre] = useState("");
  const [eventoNotas, setEventoNotas] = useState("");
  const [sugerenciasEvento, setSugerenciasEvento] = useState<string[]>([]);

  /* El bloque de evento es de la vertical FOODTRUCK (Flujos B3 §4): un camión que hoy
     vende en una feria y mañana en otra. A un local fijo no le aplica nunca. */
  const ofreceEvento = vertical === "FOODTRUCK";

  useEffect(() => {
    if (!ofreceEvento) return;
    eventosRecientes(token).then(setSugerenciasEvento).catch(() => {});
  }, [token, ofreceEvento]);

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
    if (!valido || abriendo) return;
    setError(null);
    setAbriendo(true);
    try {
      const t = await abrirTurno(token, {
        cajaId,
        cajaNumero,
        fondoInicial: monto,
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

  return (
    <Modal
      open
      // Con el turno a medio abrir no se cierra: ni con el botón ni con Escape.
      onClose={() => { if (!abriendo) onCerrar(); }}
      title="Abrir turno"
      hideTitle
      className="w-[420px] max-w-full rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]"
    >
      <h2 className="font-display text-xl font-semibold tracking-tight">Abrir turno</h2>
      <label className="mt-1 block text-13 text-ink-3" htmlFor="fondo">
        Efectivo con el que arranca la caja
      </label>

      <input
        id="fondo"
        className="mt-4 h-14 w-full rounded border border-line-strong px-4 text-center font-display text-2xl font-bold tabular-nums outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]"
        value={fondo}
        inputMode="decimal"
        autoFocus
        onFocus={(e) => e.target.select()}
        onChange={(e) => setFondo(e.target.value.replace(/[^0-9.]/g, ""))}
        onKeyDown={(e) => { if (e.key === "Enter") void abrir(); }}
        placeholder="0.00"
      />

      <div className="mt-3 grid grid-cols-4 gap-2">
        {SUGERENCIAS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFondo(String(s))}
            className="h-11 rounded border border-line-strong bg-hover text-13 font-semibold tabular-nums text-ink-2 transition hover:border-ink hover:text-ink"
          >
            {fmtMxn(s)}
          </button>
        ))}
      </div>

    {/* B3 — ¿Es un evento o ubicación especial? (Foodtruck §4) */}
    {ofreceEvento && (
    <div className="mt-5 border-t border-line pt-4">
      <label className="flex cursor-pointer items-center gap-2.5 text-14 font-medium text-ink-2">
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
                  className="rounded-full bg-sel px-3 py-1 text-12 font-semibold text-ink-2 transition hover:bg-hover"
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
          <p className="mt-1.5 text-12 text-ink-3">
            Si el organizador cobra comisión, la capturas al cerrar el turno. Las ventas se reportan por evento.
          </p>
        </div>
      )}
    </div>
    )}

      {error && (
        <p className="mt-3 text-sm font-medium text-danger" role="alert">{error}</p>
      )}

      <div className="mt-6 flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onCerrar} disabled={abriendo}>Cancelar</Button>
        <Button onClick={() => void abrir()} disabled={!valido || abriendo}>
          {abriendo ? "Abriendo…" : "Abrir turno"}
        </Button>
      </div>
    </Modal>
  );
}
