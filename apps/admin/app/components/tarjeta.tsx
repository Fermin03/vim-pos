import { useId, type ReactNode } from "react";

/** La tarjeta de un bloque de formulario del panel: título, una línea opcional y el contenido. */
export function Tarjeta({ titulo, descripcion, children }: { titulo: string; descripcion?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="max-w-[720px] rounded-lg border border-line bg-surface p-5">
      <h2 id={id} className={`font-display text-16 font-semibold tracking-tight ${descripcion ? "" : "mb-4"}`}>{titulo}</h2>
      {descripcion && <p className="mb-4 mt-1 text-13 text-ink-2">{descripcion}</p>}
      {children}
    </section>
  );
}
