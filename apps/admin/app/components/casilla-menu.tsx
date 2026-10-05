"use client";

/**
 * Casilla «se vende en este menú» de las listas del Catálogo (Productos y Combos). El área de toque
 * es la etiqueta (44 px en táctil, 40 en escritorio); la casilla visible sigue en 20 px. Mientras
 * guarda no se usa `disabled`: deshabilitar el elemento enfocado le quita el foco al teclado.
 */
export function CasillaMenu({ marcada, ocupada, etiqueta, onCambiar }: { marcada: boolean; ocupada: boolean; etiqueta: string; onCambiar: (v: boolean) => void }) {
  return (
    <label className={["flex h-11 w-11 items-center justify-center lg:h-10 lg:w-10", ocupada ? "cursor-wait" : "cursor-pointer"].join(" ")}>
      <input
        type="checkbox"
        className="h-5 w-5 accent-ink"
        aria-label={etiqueta}
        aria-disabled={ocupada}
        checked={marcada}
        onChange={(e) => {
          if (!ocupada) onCambiar(e.target.checked);
        }}
      />
    </label>
  );
}
