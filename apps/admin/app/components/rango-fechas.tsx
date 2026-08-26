"use client";
import { useState } from "react";
import { hoyMx, sumarDias } from "@vim/fecha";

/** Selector compacto de rango de días contables con presets rápidos.
 *
 * Lo usan los trece reportes con rango, así que las dos reglas de abajo se
 * arreglan aquí una vez en lugar de trece veces.
 */
export function RangoFechas({
  desde,
  hasta,
  onCambio,
}: {
  desde: string;
  hasta: string;
  onCambio: (desde: string, hasta: string) => void;
}) {
  const [d, setD] = useState(desde);
  const [h, setH] = useState(hasta);

  // Tope: hoy. No hay día contable en el futuro, y pedirlo solo devolvía una
  // tabla vacía sin decir por qué.
  const tope = hoyMx();
  const invertido = d > h;

  function presetUltimos(n: number) {
    // Hora de México: con `toISOString()` el rango arrancaba en la fecha de mañana a partir de
    // las 18:00, y el reporte salía vacío justo en las horas de más venta.
    const hasta = hoyMx();
    const desde = sumarDias(hasta, -(n - 1));
    setD(desde);
    setH(hasta);
    onCambio(desde, hasta);
  }

  const input =
    "h-10 rounded border border-line-strong px-2.5 text-[12.5px] outline-none focus:border-ink lg:h-9";

  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Rango</span>
        <input
          type="date"
          className={input}
          value={d}
          max={tope}
          onChange={(e) => setD(e.target.value)}
        />
        <span className="text-ink-3">→</span>
        <input
          type="date"
          className={input}
          value={h}
          /* `min={d}` para que el calendario no deje elegir un fin anterior al inicio.
             No basta —la fecha también se puede teclear— y por eso además está el
             aviso de abajo: un rango invertido devuelve cero filas, y "Sin ventas en
             el rango" se lee como que no se vendió, no como que el rango está mal. */
          min={d}
          max={tope}
          onChange={(e) => setH(e.target.value)}
        />
        <button
          type="button"
          onClick={() => onCambio(d, h)}
          disabled={invertido}
          className="h-10 rounded bg-ink px-3.5 text-[12.5px] font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 lg:h-9 lg:px-3"
        >
          Aplicar
        </button>
        <div className="flex gap-1 lg:ml-1">
          {[
            { l: "Hoy", n: 1 },
            { l: "7 días", n: 7 },
            { l: "30 días", n: 30 },
            { l: "90 días", n: 90 },
          ].map((p) => (
            <button
              key={p.l}
              type="button"
              onClick={() => presetUltimos(p.n)}
              className="h-10 rounded border border-line-strong px-2.5 text-[12px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink lg:h-9"
            >
              {p.l}
            </button>
          ))}
        </div>
      </div>
      {invertido && (
        <p className="mt-2 text-[12px] font-medium text-danger" role="alert">
          La fecha de inicio es posterior a la de fin. Corrige el rango para poder aplicarlo.
        </p>
      )}
    </div>
  );
}
