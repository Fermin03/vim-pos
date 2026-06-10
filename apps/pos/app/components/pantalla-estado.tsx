import type { ReactNode } from "react";
import { BrandMark } from "./topbar-pos";

/**
 * Pantalla de estado a pantalla completa (P-216..219): error 404/500/403, mantenimiento.
 * Presentacional — las acciones (reintentar/volver) llegan como children desde el contenedor.
 */
export function PantallaEstado({
  codigo,
  icono,
  titulo,
  texto,
  acciones,
  referencia,
  pie,
}: {
  codigo?: string;
  icono?: ReactNode;
  titulo: string;
  texto: string;
  acciones?: ReactNode;
  referencia?: string;
  pie?: ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col bg-surface">
      <header className="flex h-[68px] flex-shrink-0 items-center gap-3 border-b border-line px-6">
        <BrandMark size={32} />
        <span className="font-display text-[15px] font-semibold tracking-tight">VIM POS</span>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
        <div className="relative mb-6 flex items-center justify-center">
          {codigo && (
            <span className="font-display text-[88px] font-bold leading-none tracking-tighter text-[#ECECE9] select-none">{codigo}</span>
          )}
          {icono && (
            <span className={["flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FBF0EC] text-accent", codigo ? "absolute" : ""].join(" ")}>
              {icono}
            </span>
          )}
        </div>

        <h1 className="max-w-md font-display text-[26px] font-semibold tracking-tight">{titulo}</h1>
        <p className="mt-2 max-w-md text-[14.5px] leading-relaxed text-ink-3">{texto}</p>

        {acciones && <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">{acciones}</div>}

        {referencia && (
          <div className="mt-8 rounded-lg border border-line bg-sel px-4 py-2.5">
            <div className="text-[11px] font-medium uppercase tracking-wide text-ink-3">Referencia</div>
            <code className="font-mono text-[13px] font-semibold text-ink-2">{referencia}</code>
          </div>
        )}

        {pie && <div className="mt-6 max-w-sm text-[12.5px] text-ink-3">{pie}</div>}
      </div>
    </main>
  );
}
