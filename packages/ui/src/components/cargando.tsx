import { cn } from "../cn";

/**
 * Lo que se ve mientras algo carga, en todo el producto: el círculo que gira del cobro a pantalla
 * completa (oct 2026). Antes cada pantalla escribía su propio «Cargando…» de texto. Cambiar el
 * aspecto de la carga es cambiar este archivo.
 *
 *  - `bloque` (por defecto): centrado, con el texto debajo. Pantallas, paneles y secciones.
 *  - `linea`: chico y con el texto al lado. Un renglón, una celda o junto a un título.
 *
 * El texto es opcional; sin él, el lector de pantalla oye «Cargando».
 */
export function Cargando({
  texto,
  en = "bloque",
  className,
}: {
  texto?: string;
  en?: "bloque" | "linea";
  className?: string;
}) {
  const linea = en === "linea";
  return (
    <div
      role="status"
      className={cn(
        linea ? "inline-flex items-center gap-2 text-14 text-ink-3" : "flex flex-col items-center justify-center gap-3 py-8 text-15 text-ink-3",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "animate-spin rounded-full border-line border-t-accent",
          linea ? "h-4 w-4 border-2" : "h-8 w-8 border-[3px]",
        )}
      />
      {texto ? <span>{texto}</span> : <span className="sr-only">Cargando</span>}
    </div>
  );
}
