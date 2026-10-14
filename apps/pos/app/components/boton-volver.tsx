"use client";
import { Icono } from "@vim/ui/styles";

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
      className="flex h-10 flex-shrink-0 items-center gap-2 rounded border border-line-strong px-3 text-14 font-semibold text-ink transition hover:border-ink hover:bg-hover"
    >
      <Icono nombre="flecha-izquierda" className="h-4 w-4" />
      {etiqueta}
    </button>
  );
}
