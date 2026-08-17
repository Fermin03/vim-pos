"use client";
import Link from "next/link";
import { Fragment, type CSSProperties, type ReactNode } from "react";

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
    <header className="flex flex-shrink-0 flex-col gap-3 border-b border-line px-4 pb-4 pt-4 lg:flex-row lg:items-end lg:justify-between lg:gap-4 lg:px-8 lg:pt-5">
      <div className="min-w-0">
        {migas && migas.length > 0 && (
          <nav aria-label="Ruta" className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-3">
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
        <h1 className="font-display text-[21px] font-bold tracking-tight lg:text-[25px]">{titulo}</h1>
        {subtitulo && <p className="mt-[3px] text-[13px] text-ink-2 lg:text-[13.5px]">{subtitulo}</p>}
      </div>
      {/* En móvil las acciones bajan y se reparten el ancho; en escritorio quedan igual (fila derecha). */}
      {/* En móvil las acciones bajan y se reparten el ancho; los rótulos no se parten en dos
          líneas (si no caben, es el contenedor el que envuelve). En escritorio, igual que antes. */}
      {right && (
        <div className="flex flex-wrap items-center gap-2 [&>*]:min-h-[44px] [&>div]:flex-wrap [&_button]:whitespace-nowrap lg:flex-nowrap lg:[&>*]:min-h-0 lg:[&>div]:flex-nowrap lg:[&_button]:whitespace-normal">
          {right}
        </div>
      )}
    </header>
  );
}

/** Cuerpo scrolleable de página (mockup §body). */
export function PageBody({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-5 lg:px-8 lg:pb-8 lg:pt-6">
      <div className="mx-auto max-w-[1140px]">{children}</div>
    </div>
  );
}

/**
 * Envoltura de tablas. En móvil deja la tabla scrollear en horizontal sangrando hasta el
 * borde de la pantalla (para que se note que hay más columnas) y le pone un ancho mínimo;
 * a partir de `lg` no aplica nada, la tabla se ve exactamente igual que antes.
 */
export function TablaScroll({ children, min = 720 }: { children: ReactNode; min?: number }) {
  return (
    <div className="-mx-4 overflow-x-auto overscroll-x-contain px-4 lg:mx-0 lg:overflow-x-visible lg:px-0">
      {/* El min-width solo se aplica por debajo de `lg` (ver .tabla-min en globals.css). */}
      <div className="tabla-min" style={{ "--tabla-min": `${min}px` } as CSSProperties}>
        {children}
      </div>
    </div>
  );
}
