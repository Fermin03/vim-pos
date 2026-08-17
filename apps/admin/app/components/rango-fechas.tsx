"use client";
import { useState } from "react";

/** Selector compacto de rango de días contables con presets rápidos. */
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

  function presetUltimos(n: number) {
    const hoy = new Date();
    const hasta = hoy.toISOString().slice(0, 10);
    const inicio = new Date(hoy);
    inicio.setDate(inicio.getDate() - (n - 1));
    const desde = inicio.toISOString().slice(0, 10);
    setD(desde);
    setH(hasta);
    onCambio(desde, hasta);
  }

  const input =
    "h-10 rounded border border-line-strong px-2.5 text-[12.5px] outline-none focus:border-ink lg:h-9";

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface p-3">
      <span className="text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Rango</span>
      <input type="date" className={input} value={d} onChange={(e) => setD(e.target.value)} />
      <span className="text-ink-3">→</span>
      <input type="date" className={input} value={h} onChange={(e) => setH(e.target.value)} />
      <button
        type="button"
        onClick={() => onCambio(d, h)}
        className="h-10 rounded bg-ink px-3.5 text-[12.5px] font-semibold text-white transition hover:opacity-90 lg:h-9 lg:px-3"
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
  );
}
