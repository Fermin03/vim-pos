"use client";

/**
 * Botón "Volver", único para todo el POS.
 *
 * Cada pantalla tenía el suyo: unas lo ponían arriba a la derecha con el rótulo "Salir", otras
 * a la izquierda, y de tres tamaños distintos. En una caja el cajero no lee la pantalla, va al
 * lugar donde SABE que está el botón; si cambia de sitio entre pantallas, cada regreso cuesta
 * una búsqueda. Aquí se fija posición (extremo izquierdo de la cabecera) y tamaño para todas.
 *
 * La referencia es la barra de la pantalla de captura, que es la que más se usa.
 */
export function BotonVolver({ onClick, etiqueta = "Volver" }: { onClick: () => void; etiqueta?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-10 flex-shrink-0 items-center gap-2 rounded border border-line-strong px-3 text-[13.5px] font-semibold text-ink transition hover:border-ink hover:bg-hover"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      {etiqueta}
    </button>
  );
}
