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
      <p className="mt-8 border-t border-line pt-6 text-sm font-medium text-danger" role="alert">
        {error}
      </p>
    );
  }
  if (slots === null) {
    return <p className="mt-8 border-t border-line pt-6 text-sm text-ink-3">Calculando vista previa…</p>;
  }

  const { principales, deltas } = vistaPrevia(base, slots);
  const primero = slots[0];
  // Si el primer slot no suma el precio del producto, todas sus opciones cuestan lo mismo dentro
  // del combo (el precio del producto elegido nunca entra a la cuenta): casi siempre es un error
  // de configuración, así que se avisa en vez de mostrarlo como si nada.
  const avisoPrimerSlot = !!primero && primero.modo_precio !== "SUMA_PRECIO_PRODUCTO";

  return (
    <div className="mt-8 max-w-[640px] border-t border-line pt-6">
      <h2 className="font-display text-base font-semibold">Vista previa de precio</h2>
      <p className="mb-3 text-[12.5px] text-ink-3">Lo que realmente pagará el cliente, tal como lo calcula la caja.</p>

      {avisoPrimerSlot && (
        <p className="mb-3 rounded border border-info/40 bg-info-soft px-3 py-2 text-[12.5px] font-medium text-info">
          El primer slot ({primero.nombre}) no suma el precio del producto: todas sus opciones costarán lo mismo dentro
          del combo. Si el primer slot es la hamburguesa (o el producto principal), probablemente quieras &quot;Se suma
          el precio del producto elegido&quot;.
        </p>
      )}

      {slots.length === 0 && <p className="text-sm text-ink-3">Agrega slots para ver el precio.</p>}

      {principales.length > 0 && (
        <p className="font-display text-[17px] font-semibold tabular-nums">
          {principales.map((p, i) => (
            <span key={p.nombre}>
              {i > 0 && " · "}
              Con {p.nombre} {precioMxn(p.precio)}
            </span>
          ))}
        </p>
      )}

      {deltas.length > 0 && (
        <p className="mt-1.5 tabular-nums text-[13.5px] text-ink-2">
          {deltas.map((d, i) => (
            <span key={d.slot + d.nombre}>
              {i > 0 && " · "}
              {d.nombre} {d.delta > 0 ? "+" : ""}
              {precioMxn(d.delta)}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
