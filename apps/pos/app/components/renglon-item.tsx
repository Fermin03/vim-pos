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
 */
export function RenglonItem({
  cantidad,
  nombre,
  modificadores,
  notaCocina,
  totalMxn,
}: {
  cantidad: number;
  nombre: string;
  modificadores: string[];
  notaCocina: string | null;
  totalMxn: number;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="font-display min-w-[28px] text-[16px] font-semibold tabular-nums text-ink-2">{cantidad}×</span>
      <div className="min-w-0 flex-1">
        <div className="text-[15.5px] font-semibold leading-tight text-ink">{nombre}</div>
        {modificadores.length > 0 && (
          <div className="mt-[3px] text-[13px] leading-[1.4] text-ink-2">{modificadores.join(" · ")}</div>
        )}
        {notaCocina && <div className="mt-1 text-[12.5px] italic text-ink-3">&quot;{notaCocina}&quot;</div>}
      </div>
      <span className="font-display whitespace-nowrap text-[15.5px] font-semibold tabular-nums text-ink">
        {fmtMxn(totalMxn)}
      </span>
    </div>
  );
}
