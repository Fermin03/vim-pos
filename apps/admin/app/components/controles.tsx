import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@vim/ui/styles";

/**
 * Control segmentado: elegir UNA de pocas opciones (el filtro de una lista, "agrupar por").
 *
 * En celular se desliza de lado si no cabe. `grande` es el de las barras de reporte, que va junto
 * al rango de fechas y mide lo mismo que sus botones.
 */
export function Segmentos<V extends string | boolean>({
  etiqueta,
  opciones,
  valor,
  onCambiar,
  grande = false,
  deshabilitado = false,
  className,
}: {
  /** Qué se está eligiendo; lo lee el lector de pantalla. */
  etiqueta: string;
  opciones: readonly { v: V; l: ReactNode }[];
  valor: V;
  onCambiar: (v: V) => void;
  grande?: boolean;
  /** Solo lectura: las opciones no responden ni reciben el foco. */
  deshabilitado?: boolean;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={etiqueta}
      className={cn(
        "scroll-x-limpio inline-flex max-w-full gap-0.5 overflow-x-auto rounded border border-line bg-hover p-[3px] lg:max-w-none lg:overflow-x-visible",
        className,
      )}
    >
      {opciones.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          aria-pressed={valor === o.v}
          disabled={deshabilitado}
          onClick={() => onCambiar(o.v)}
          className={cn(
            "flex-shrink-0 whitespace-nowrap rounded-[4px] px-3 text-13 font-semibold transition-colors disabled:opacity-50",
            grande ? "min-h-[40px]" : "py-[11px] lg:py-1.5",
            valor === o.v ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink",
          )}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

/**
 * Acción de texto al final de una fila de tabla (Editar, Pausar, Eliminar).
 * La que destruye va en rojo en reposo, no solo al pasar el mouse (nucleo.md §4).
 */
export function AccionFila({ peligro = false, className, ...resto }: ButtonHTMLAttributes<HTMLButtonElement> & { peligro?: boolean }) {
  return (
    <button
      type="button"
      {...resto}
      className={cn("text-13 font-semibold", peligro ? "text-danger hover:underline" : "text-ink-2 hover:text-ink", className)}
    />
  );
}
