"use client";

/**
 * Paginador de las cuadrículas que no scrollean.
 *
 * Aparece **solo cuando hace falta**: con un menú normal no se ve nunca. Va abajo a la derecha, con
 * objetivos de 46×58 —el doc de diseño pide 44 mínimo— y el indicador a la izquierda, porque lo que
 * el cajero necesita saber de un vistazo es si queda algo más, no en cuál está.
 *
 * Lo comparten el catálogo, los slots de combo y los modificadores para que cambiar de página se
 * sienta igual en los tres sitios.
 */
export function Paginador({
  pagina,
  paginas,
  onIr,
  compacto = false,
}: {
  pagina: number;
  paginas: number;
  onIr: (n: number) => void;
  /** Dentro de un drawer el renglón va más apretado que en la pantalla completa. */
  compacto?: boolean;
}) {
  if (paginas < 2) return null;
  return (
    <div
      className={[
        "flex flex-shrink-0 items-center justify-end gap-2 border-t border-line bg-surface",
        compacto ? "px-5 py-1.5" : "px-5 py-2",
      ].join(" ")}
    >
      <span className="mr-1 text-[13px] font-semibold tabular-nums text-ink-3">
        {pagina} / {paginas}
      </span>
      <Boton etiqueta="Página anterior" onClick={() => onIr(pagina - 1)} disabled={pagina === 1} compacto={compacto}>
        <path d="M15 18l-6-6 6-6" />
      </Boton>
      <Boton etiqueta="Página siguiente" onClick={() => onIr(pagina + 1)} disabled={pagina === paginas} compacto={compacto}>
        <path d="M9 18l6-6-6-6" />
      </Boton>
    </div>
  );
}

function Boton({
  etiqueta,
  onClick,
  disabled,
  compacto,
  children,
}: {
  etiqueta: string;
  onClick: () => void;
  disabled: boolean;
  compacto: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={etiqueta}
      className={[
        "flex items-center justify-center rounded-lg border border-line-strong text-ink transition hover:border-ink hover:bg-hover active:scale-[.97] disabled:cursor-not-allowed disabled:border-line disabled:text-ink-3",
        compacto ? "h-[44px] w-[52px]" : "h-[46px] w-[58px]",
      ].join(" ")}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}
