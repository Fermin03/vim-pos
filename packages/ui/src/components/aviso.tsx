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
 */
export function Aviso({
  tono = "warning",
  role,
  className,
  children,
}: {
  tono?: TonoAviso;
  role?: "alert" | "status";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role={role} className={cn("rounded border px-3 py-2 text-13 font-medium leading-snug", tonos[tono], className)}>
      {children}
    </div>
  );
}
