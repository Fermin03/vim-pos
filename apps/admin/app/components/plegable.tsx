"use client";
import type { ReactNode } from "react";

/**
 * Una sección que se abre y se cierra, con un resumen de lo que trae cuando está cerrada.
 * Para lo que no se toca al dar de alta algo (datos fiscales, código interno…): el formulario
 * de producto mostraba 13 campos de golpe, y en el celular eso son cuatro pantallas.
 */
export function Plegable({
  titulo,
  resumen,
  abierto,
  children,
}: {
  titulo: string;
  resumen?: string;
  abierto?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={abierto} className="group rounded-lg border border-line bg-surface">
      <summary className="flex min-h-[48px] cursor-pointer list-none items-center gap-3 rounded-lg px-4 py-2.5 [&::-webkit-details-marker]:hidden">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true" className="h-4 w-4 flex-shrink-0 text-ink-2 transition-transform duration-150 ease-vim group-open:rotate-90 motion-reduce:transition-none">
          <path d="M9 6l6 6-6 6" />
        </svg>
        <span className="text-[14px] font-semibold">{titulo}</span>
        {resumen && <span className="ml-auto truncate text-[13px] text-ink-2 group-open:hidden">{resumen}</span>}
      </summary>
      <div className="flex flex-col gap-4 border-t border-line px-4 pb-4 pt-4">{children}</div>
    </details>
  );
}
