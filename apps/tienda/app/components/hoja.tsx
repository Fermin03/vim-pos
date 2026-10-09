"use client";
// La hoja: sube desde abajo en el teléfono y es un diálogo centrado en escritorio (globals.css,
// `.hoja`). Es un <dialog> nativo abierto con showModal(): el navegador atrapa el foco, cierra con
// Escape, devuelve el foco a quien la abrió y deja inerte lo de atrás. Aquí solo se añade lo que el
// navegador no trae: cerrar tocando el velo y cerrar arrastrando hacia abajo.
//
// No es el `Modal` de @vim/ui porque ese manda el foco al primer CAMPO: en un teléfono eso abre el
// teclado encima del producto que se acaba de tocar. Aquí el foco cae en «Cerrar».
import { useEffect, useId, useRef, type PointerEvent, type ReactNode } from "react";
import { cn } from "@vim/ui/styles";
import { FOCO, IconoCerrar } from "./piezas";

/** La parte que se desplaza y el pie fijo: el contenido de una hoja se arma con estos dos. */
export const CUERPO = "min-h-0 flex-1 overflow-y-auto overscroll-contain";
export const PIE = "border-t border-line bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]";

export function Hoja({ abierta, alCerrar, fija = false, titulo, children }: {
  abierta: boolean; alCerrar: () => void;
  /**
   * No se puede cerrar ahora (hay un pedido enviándose): ni Escape, ni el velo, ni «Cerrar», ni
   * arrastrando. Salir a medio envío dejaba mandar el mismo pedido dos veces.
   */
  fija?: boolean;
  titulo: string; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  const arrastre = useRef<{ y: number; t: number } | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierta && !d.open) d.showModal();
    else if (!abierta && d.open) d.close();
  }, [abierta]);

  const cerrar = () => { if (!fija) alCerrar(); };

  // Arrastrar la cabecera hacia abajo cierra (solo como hoja, en teléfono). Se mueve el `transform`
  // del propio elemento, sin variables: nada más se recalcula.
  const mover = (e: PointerEvent<HTMLElement>) => {
    const a = arrastre.current, d = ref.current;
    if (!a || !d) return;
    d.style.transition = "none";
    d.style.transform = `translateY(${Math.max(0, e.clientY - a.y)}px)`;
  };
  const soltar = (e: PointerEvent<HTMLElement>) => {
    const a = arrastre.current, d = ref.current;
    arrastre.current = null;
    if (!a || !d) return;
    const dy = e.clientY - a.y, velocidad = dy / Math.max(1, e.timeStamp - a.t);
    d.style.transition = "";
    d.style.transform = "";
    // Un tirón corto y rápido basta; no hace falta arrastrarla media pantalla.
    if (e.type === "pointerup" && (dy > 120 || (dy > 24 && velocidad > 0.5))) cerrar();
  };

  return (
    <dialog
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={idTitulo}
      className="hoja"
      // Escape pide cancelar; fija, se le dice que no.
      onCancel={(e) => { if (fija) e.preventDefault(); }}
      // Chrome no deja impedir un segundo Escape seguido: si aun así se cerró estando fija, se reabre.
      onClose={() => { if (fija && abierta) ref.current?.showModal(); else alCerrar(); }}
      // El velo es el propio <dialog>: un toque que cae en él y no en su contenido es «afuera».
      onClick={(e) => { if (e.target === e.currentTarget) cerrar(); }}
    >
      <header
        className="relative flex touch-none items-center gap-2 border-b border-line py-1 pl-4 pr-1 sm:touch-auto"
        onPointerDown={(e) => {
          if (fija || (e.target as HTMLElement).closest("button") || matchMedia("(min-width: 640px)").matches) return;
          arrastre.current = { y: e.clientY, t: e.timeStamp };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerCancel={soltar}
      >
        <span aria-hidden="true" className="absolute left-1/2 top-1.5 h-1 w-9 -translate-x-1/2 rounded-full bg-line-strong sm:hidden" />
        <h2 id={idTitulo} className="min-w-0 flex-1 truncate pt-2 font-display text-18 font-semibold sm:pt-0">{titulo}</h2>
        <button type="button" onClick={cerrar} disabled={fija} aria-label="Cerrar"
          className={cn("flex h-11 w-11 flex-shrink-0 items-center justify-center rounded text-ink-2 hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-30", FOCO)}>
          <IconoCerrar />
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </dialog>
  );
}
