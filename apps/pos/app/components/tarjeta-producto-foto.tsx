"use client";
import { useState } from "react";

/**
 * Tarjeta de la vitrina de tienda (pos-retail.md, «Las tarjetas llevan foto»). La foto llena la
 * celda; sin foto, o si no carga, el color de la categoría y la inicial en grande. El texto va en
 * blanco sobre el degradado: la única excepción a los tokens de color.
 */
export function TarjetaProductoFoto({
  nombre,
  precioTexto,
  imagenUrl,
  colorCategoria,
  etiqueta,
  onToque,
  deshabilitada,
}: {
  nombre: string;
  precioTexto: string;
  imagenUrl: string | null;
  colorCategoria: string;
  etiqueta: "pocas" | "agotada" | null;
  onToque(): void;
  deshabilitada?: boolean;
}) {
  // Guarda la URL que falló, no un booleano: si la foto cambia, se intenta de nuevo.
  const [fallida, setFallida] = useState<string | null>(null);
  const foto = imagenUrl && imagenUrl !== fallida ? imagenUrl : null;
  return (
    <button
      type="button"
      disabled={deshabilitada}
      onClick={onToque}
      aria-label={`${nombre}, ${precioTexto}${etiqueta ? `, ${etiqueta === "agotada" ? "Agotada" : "Pocas"}` : ""}`}
      className={[
        "relative h-full w-full overflow-hidden rounded-lg border border-line-strong bg-surface text-left transition-[transform,border-color] duration-150 ease-vim",
        deshabilitada ? "cursor-not-allowed opacity-50" : "hover:border-ink active:scale-[.97]",
      ].join(" ")}
    >
      {foto ? (
        // eslint-disable-next-line @next/next/no-img-element -- fotos del storage del tenant, sin optimizador en la caja de escritorio
        <img src={foto} alt="" loading="lazy" decoding="async" onError={() => setFallida(foto)} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center font-display text-40 font-bold leading-none text-white/90"
          style={{ backgroundColor: colorCategoria }}
        >
          {nombre.trim().charAt(0).toUpperCase()}
        </span>
      )}
      <span aria-hidden="true" className="absolute inset-0" style={{ backgroundImage: "linear-gradient(to top, rgb(var(--ink)/.75), rgb(var(--ink)/0) 70%)" }} />
      {etiqueta && (
        <span className={["absolute right-2 top-2 rounded px-2 py-0.5 text-13 font-semibold", etiqueta === "agotada" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"].join(" ")}>
          {etiqueta === "agotada" ? "Agotada" : "Pocas"}
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-3 text-white">
        <span className="line-clamp-2 break-words text-14 font-semibold leading-tight">{nombre}</span>
        <span className="font-display text-13 font-bold tabular-nums">{precioTexto}</span>
      </span>
    </button>
  );
}
