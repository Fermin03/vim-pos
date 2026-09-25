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
  // Fechas editadas a mano y sin aplicar todavía.
  const pendiente = d !== desde || h !== hasta;

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
    "h-11 min-w-0 flex-1 rounded border border-line-strong px-2.5 text-[13px] outline-none focus:border-ink lg:h-9 lg:flex-none";
  const boton =
    "h-11 whitespace-nowrap rounded border px-2 text-[13px] font-semibold transition-[background-color,border-color,color,opacity,transform] duration-150 ease-vim active:scale-[.97] lg:h-9 lg:flex-none";

  return (
    <div className="w-full rounded-lg border border-line bg-surface p-3 lg:w-auto">
      <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
        {/* En el celular, las dos fechas lado a lado a todo el ancho y los atajos abajo: antes
            se partían en renglones con la flecha colgando al final de uno. */}
        <div className="flex items-center gap-2">
          <span className="hidden text-[12.5px] font-semibold text-ink-2 lg:inline">Rango</span>
          <input
            type="date"
            aria-label="Desde"
            className={input}
            value={d}
            max={tope}
            onChange={(e) => setD(e.target.value)}
          />
          <span className="text-ink-2" aria-hidden="true">→</span>
          <input
            type="date"
            aria-label="Hasta"
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
        </div>
        {/* En el celular: los cuatro atajos se reparten el ancho y «Aplicar» solo aparece si
            cambiaste una fecha a mano; con cinco botones en fila, "30 días" se partía en dos. */}
        <div className="grid grid-cols-4 gap-1.5 lg:ml-1 lg:flex">
          {[
            { l: "Hoy", n: 1 },
            { l: "7 días", n: 7 },
            { l: "30 días", n: 30 },
            { l: "90 días", n: 90 },
          ].map((p) => {
            // Marca el atajo que corresponde al rango de los campos: antes ninguno se veía
            // activo y no había forma de saber qué periodo se estaba mirando de un vistazo.
            const activo = h === tope && d === sumarDias(tope, -(p.n - 1));
            return (
              <button
                key={p.l}
                type="button"
                aria-pressed={activo}
                onClick={() => presetUltimos(p.n)}
                className={`${boton} ${activo ? "border-ink bg-ink text-white" : "border-line-strong text-ink-2 hover:border-ink hover:text-ink"}`}
              >
                {p.l}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => onCambio(d, h)}
            disabled={invertido}
            className={`${boton} col-span-4 whitespace-nowrap border-line-strong text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-40 ${pendiente ? "" : "hidden lg:block"}`}
          >
            Aplicar
          </button>
        </div>
      </div>
      {invertido && (
        <p className="mt-2 text-[13px] font-medium text-danger" role="alert">
          La fecha de inicio es posterior a la de fin. Corrige el rango para poder aplicarlo.
        </p>
      )}
    </div>
  );
}
