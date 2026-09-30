import { cn } from "../cn";

export type TonoEstado = "success" | "warning" | "danger" | "info" | "neutral";

/** Los tonos suaves de la paleta (tokens.css), no el color al 10 %: así el chip se ve igual que los
 *  avisos y bandas del resto del producto. */
const tones: Record<TonoEstado, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  neutral: "bg-sel text-ink-2",
};

/**
 * La etiqueta de estado de todo el producto ("En línea", "Sin folios", "Conciliada"…).
 *
 * Existía sin un solo uso y cada pantalla dibujaba la suya, con tamaños y colores ligeramente
 * distintos (revisión de diseño, sep 2026). `punto` agrega el círculo de color para los estados
 * "vivos" (una caja en línea); en una lista de estados de papeleo sobra.
 */
export function StatusChip({
  tone = "neutral",
  punto = false,
  className,
  children,
}: {
  tone?: TonoEstado;
  punto?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-12 font-semibold leading-5",
        tones[tone],
        className,
      )}
    >
      {punto && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}
