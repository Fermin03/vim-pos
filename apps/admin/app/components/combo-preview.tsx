"use client";
import { useEffect, useState } from "react";
import { slotsConOpciones, vistaPrevia, type SlotConOpciones } from "../lib/combos";
import { precioMxn } from "../lib/catalogo";
import { mensajeError } from "../lib/errores";

/**
 * Vista previa de precio del combo, en vivo. `refreshToken` sube cada vez que el editor de
 * slots cambia algo (agregar/editar/quitar slot u opción): eso es lo que dispara el refetch,
 * no un timer ni un polling.
 */
export function ComboPreview({ comboId, base, refreshToken }: { comboId: string; base: number; refreshToken: number }) {
  const [slots, setSlots] = useState<SlotConOpciones[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    slotsConOpciones(comboId)
      .then((s) => { if (!cancelado) setSlots(s); })
      .catch((e) => { if (!cancelado) setError(mensajeError(e, "No se pudo calcular la vista previa")); });
    return () => {
      cancelado = true;
    };
  }, [comboId, refreshToken]);

  if (error) {
    return (
      <p className="rounded-lg border border-line bg-surface p-4 text-sm font-medium text-danger" role="alert">
        {error}
      </p>
    );
  }
  if (slots === null) {
    return <p className="rounded-lg border border-line bg-surface p-4 text-sm text-ink-2">Calculando el precio…</p>;
  }

  const { principales, deltas } = vistaPrevia(base, slots);
  const primero = slots[0];
  // Si el primer slot no suma el precio del producto, todas sus opciones cuestan lo mismo dentro
  // del combo (el precio del producto elegido nunca entra a la cuenta): casi siempre es un error
  // de configuración, así que se avisa en vez de mostrarlo como si nada.
  const avisoPrimerSlot = !!primero && primero.modo_precio !== "SUMA_PRECIO_PRODUCTO";

  return (
    <div className="rounded-lg border border-line bg-surface p-4" aria-live="polite">
      <h2 className="font-display text-base font-semibold">Cuánto va a pagar el cliente</h2>
      <p className="mb-3 text-[13px] text-ink-2">Tal como lo calcula la caja. Se actualiza con cada cambio.</p>

      {avisoPrimerSlot && (
        <p className="mb-3 rounded border border-warning/30 bg-warning-soft px-3 py-2 text-[13px] font-medium text-warning">
          El primer paso ({primero.nombre}) no cobra el producto elegido: todas sus opciones costarán lo mismo dentro
          del combo. Si es la hamburguesa (o el producto principal), elige «Se cobra el precio del producto elegido».
        </p>
      )}

      {slots.length === 0 && <p className="text-sm text-ink-2">Agrega pasos para ver el precio.</p>}

      {/* Un renglón por opción principal: en línea, con varias hamburguesas, era un párrafo. */}
      {principales.length > 0 && (
        <ul className="flex flex-col gap-1">
          {principales.map((p) => (
            <li key={p.nombre} className="flex items-baseline justify-between gap-3 font-display text-[15px] tabular-nums">
              <span className="font-sans text-[14px]">Con {p.nombre}</span>
              <span className="font-semibold">{precioMxn(p.precio)}</span>
            </li>
          ))}
        </ul>
      )}

      {deltas.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="mb-1 text-[13px] font-medium text-ink-2">Cambios que cuestan distinto</p>
          <ul className="flex flex-col gap-0.5 text-[13.5px] tabular-nums text-ink-2">
            {deltas.map((d) => (
              <li key={d.slot + d.nombre} className="flex justify-between gap-3">
                <span>{d.nombre}</span>
                <span>
                  {d.delta > 0 ? "+" : ""}
                  {precioMxn(d.delta)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
