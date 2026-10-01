import type { ReactNode } from "react";
import { cn } from "../cn";

export type TonoAviso = "success" | "warning" | "danger" | "info";

const tonos: Record<TonoAviso, string> = {
  success: "border-success-line bg-success-soft text-success",
  warning: "border-warning-line bg-warning-soft text-warning",
  danger: "border-danger-line bg-danger-soft text-danger",
  info: "border-info-line bg-info-soft text-info",
};

/**
 * La tarjeta de aviso: "Requiere PIN de un supervisor", "Esta caja no tiene impresora", el error
 * de un diálogo. Cada pantalla la dibujaba a mano, con el borde en hexadecimal y tres tonos de
 * ámbar distintos (revisión de diseño, sep 2026).
 *
 * Con `onCerrar` lleva una "×" a la derecha. Quién recuerda que se cerró lo decide quien la usa
 * (el panel lo guarda por navegador, ver `useAvisoCerrado` en apps/admin).
 */
export function Aviso({
  tono = "warning",
  role,
  className,
  children,
  onCerrar,
}: {
  tono?: TonoAviso;
  role?: "alert" | "status";
  className?: string;
  children: ReactNode;
  onCerrar?: () => void;
}) {
  const base = cn("rounded border px-3 py-2 text-13 font-medium leading-snug", tonos[tono], className);
  if (!onCerrar) {
    return (
      <div role={role} className={base}>
        {children}
      </div>
    );
  }
  return (
    <div role={role} className={cn(base, "flex items-start gap-2 pr-1.5")}>
      <div className="min-w-0 flex-1">{children}</div>
      {/* -my-1: el botón mide 32 px para el dedo sin hacer más alta la tarjeta de un renglón. */}
      <button
        type="button"
        onClick={onCerrar}
        aria-label="Cerrar aviso"
        className="-my-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-current"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
