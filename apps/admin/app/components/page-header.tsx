"use client";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";

export type Miga = { label: string; href?: string };

/** Encabezado de página del admin (mockup P-177 §header): breadcrumbs + título + slot derecho. */
export function PageHeader({
  titulo,
  subtitulo,
  migas,
  right,
}: {
  titulo: string;
  subtitulo?: string;
  migas?: Miga[];
  right?: ReactNode;
}) {
  return (
    <header className="flex flex-shrink-0 items-end justify-between gap-4 border-b border-line px-8 pb-4 pt-5">
      <div>
        {migas && migas.length > 0 && (
          <nav aria-label="Ruta" className="mb-1.5 flex items-center gap-1.5 text-[12.5px] text-ink-3">
            {migas.map((m, i) => (
              <Fragment key={i}>
                {i > 0 && <span aria-hidden="true">/</span>}
                {m.href ? (
                  <Link href={m.href} className="transition-colors hover:text-ink-2">
                    {m.label}
                  </Link>
                ) : (
                  <span className="text-ink-2">{m.label}</span>
                )}
              </Fragment>
            ))}
          </nav>
        )}
        <h1 className="font-display text-[25px] font-bold tracking-tight">{titulo}</h1>
        {subtitulo && <p className="mt-[3px] text-[13.5px] text-ink-2">{subtitulo}</p>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </header>
  );
}

/** Cuerpo scrolleable de página (mockup §body). */
export function PageBody({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto px-8 pb-8 pt-6">
      <div className="mx-auto max-w-[1140px]">{children}</div>
    </div>
  );
}
