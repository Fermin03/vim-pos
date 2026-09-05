import type { ReactNode } from "react";

/** Tarjeta de sección de la ficha de cliente, con ancla para la cabecera. */
export function Seccion({ id, titulo, descripcion, peligrosa, children }: { id: string; titulo: string; descripcion?: string; peligrosa?: boolean; children: ReactNode }) {
  return (
    <section id={id} className={["scroll-mt-28 rounded-lg border p-5", peligrosa ? "mt-6 border-danger/30 bg-danger/5" : "border-line bg-surface"].join(" ")}>
      <div className="mb-4">
        <h2 className={["font-display text-[16px] font-semibold tracking-tight", peligrosa ? "text-danger" : ""].join(" ")}>{titulo}</h2>
        {descripcion && <p className="mt-0.5 text-[12.5px] text-ink-3">{descripcion}</p>}
      </div>
      {children}
    </section>
  );
}
