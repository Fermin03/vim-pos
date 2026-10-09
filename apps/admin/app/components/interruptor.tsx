"use client";
import { useId, type ReactNode } from "react";
import { cn } from "@vim/ui/styles";

/**
 * El interruptor del panel: encender o apagar UNA cosa (la tienda, un programa).
 *
 * Sale del que Lealtad dibuja a mano. La etiqueta es un <label> de verdad —tocarla también cambia el
 * interruptor— y la descripción se le anuncia al lector de pantalla junto con el estado.
 * La pista mide 24 px; el `before` estira la zona de toque a 44 sin agrandar el dibujo.
 *
 * `deshabilitado` = no se puede cambiar (falta algo, solo lectura): `disabled` de verdad.
 * `ocupado` = se está guardando: se ve igual de atenuado y no responde, pero SIN `disabled`, porque
 * un botón deshabilitado suelta el foco del teclado y lo manda al inicio de la página (igual que
 * en campo-imagen.tsx). Se anuncia con `aria-disabled`.
 */
export function Interruptor({
  encendido,
  onCambiar,
  etiqueta,
  descripcion,
  deshabilitado = false,
  ocupado = false,
  nombreAccesible,
}: {
  encendido: boolean;
  onCambiar: (encendido: boolean) => void;
  etiqueta: string;
  /** El estado en palabras, debajo de la etiqueta. */
  descripcion?: ReactNode;
  deshabilitado?: boolean;
  /** Algo se está guardando: no responde, pero conserva el foco. */
  ocupado?: boolean;
  /** Cuando hay varios con la misma etiqueta: el nombre que oye el lector de pantalla. */
  nombreAccesible?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={encendido}
        aria-label={nombreAccesible}
        aria-describedby={descripcion ? `${id}-d` : undefined}
        disabled={deshabilitado}
        aria-disabled={ocupado || undefined}
        onClick={() => { if (!ocupado) onCambiar(!encendido); }}
        className={cn(
          "relative mt-0.5 h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-150 disabled:opacity-50",
          "before:absolute before:-inset-2.5 before:content-['']",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
          ocupado && "opacity-50",
          encendido ? "bg-accent" : "bg-line-strong",
        )}
      >
        <span
          className={cn(
            "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform duration-150 ease-vim",
            encendido && "translate-x-5",
          )}
        />
      </button>
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="text-sm font-semibold">{etiqueta}</label>
        {descripcion && <div id={`${id}-d`} className="mt-0.5 text-13 text-ink-2">{descripcion}</div>}
      </div>
    </div>
  );
}
