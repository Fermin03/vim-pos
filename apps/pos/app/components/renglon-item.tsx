"use client";
import { fmtMxn } from "../lib/turno";

/**
 * Una línea de pedido: cantidad, nombre, modificadores, nota y total.
 *
 * Vive aparte porque se pinta en dos sitios —el carrito de la pantalla de venta y el panel de
 * "Agregar productos"— y hasta ahora cada uno la dibujaba a su manera: en el segundo no salían
 * los modificadores, así que "1× Chiken Crunch" se veía idéntico con o sin Papas Grandes y
 * Extra Cebolla. Con un solo componente no pueden volver a divergir.
 *
 * El total lo recibe ya calculado: quien llama sabe si viene del carrito o de la BD, y el
 * precio con modificadores NO es el precio base del producto.
 *
 * `hijos` son los componentes de un combo (uno por slot elegido): se pintan indentados bajo
 * el nombre del padre, con su propio nombre de slot, modificadores y el extra que sumaron.
 */
export type HijoRenglon = { slot: string; nombre: string; detalle: string | null; extraMxn: number };

export function RenglonItem({
  cantidad,
  nombre,
  modificadores,
  notaCocina,
  totalMxn,
  hijos = [],
}: {
  cantidad: number;
  nombre: string;
  modificadores: string[];
  notaCocina: string | null;
  totalMxn: number;
  hijos?: HijoRenglon[];
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="font-display min-w-[28px] text-[16px] font-semibold tabular-nums text-ink-2">{cantidad}×</span>
      <div className="min-w-0 flex-1">
        <div className="text-[15.5px] font-semibold leading-tight text-ink">{nombre}</div>
        {modificadores.length > 0 && (
          <div className="mt-[3px] text-[13px] leading-[1.4] text-ink-2">{modificadores.join(" · ")}</div>
        )}
        {hijos.length > 0 && (
          <div className="mt-1.5 flex flex-col gap-1 border-l-2 border-line-strong pl-2.5">
            {hijos.map((h, i) => (
              <div key={i} className="flex items-baseline gap-2 text-[13px] leading-[1.35]">
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  <span className="mr-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-ink-3">{h.slot}</span>{" "}
                  <span className="font-medium text-ink">{h.nombre}</span>
                  {h.detalle && <span className="text-ink-2"> · {h.detalle}</span>}
                </span>
                {h.extraMxn > 0 && <span className="font-display whitespace-nowrap text-[13px] font-semibold tabular-nums text-ink-2">+{fmtMxn(h.extraMxn)}</span>}
              </div>
            ))}
          </div>
        )}
        {notaCocina && <div className="mt-1 text-[12.5px] italic text-ink-3">&quot;{notaCocina}&quot;</div>}
      </div>
      <span className="font-display whitespace-nowrap text-[15.5px] font-semibold tabular-nums text-ink">
        {fmtMxn(totalMxn)}
      </span>
    </div>
  );
}
