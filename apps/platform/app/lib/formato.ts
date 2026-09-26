export const fmtMxn = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);
export const fmtInt = (n: number) => new Intl.NumberFormat("es-MX").format(n || 0);

/** Fecha corta. Las de contrato son `date` sin hora: se parte el ISO en vez de `new Date`, que en México restaría un día. */
export function fechaCorta(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  if (!a || !m || !d) return "—";
  return `${d}/${m}/${a}`;
}

/** Fecha y hora legibles en hora de México, para fechas con hora (bloqueos, accesos). */
export function fechaHoraMx(iso: string, estilo: "largo" | "corto" = "largo"): string {
  const f = new Date(iso);
  if (Number.isNaN(f.getTime())) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: estilo === "largo" ? "long" : "medium",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  }).format(f);
}

// Los mismos nombres que ve el dueño al registrarse (apps/admin/app/registro).
export const VERTICALES = [
  { v: "QUICK_SERVICE", l: "Comida rápida" },
  { v: "FULL_SERVICE", l: "Restaurante con meseros" },
  { v: "CAFE_BAR", l: "Cafetería o bar" },
  { v: "DARK_KITCHEN", l: "Cocina solo para apps" },
  { v: "FOODTRUCK", l: "Food truck" },
  { v: "ENTERPRISE", l: "Cadena" },
] as const;
export const nombreVertical = (v: string | null | undefined) => VERTICALES.find((x) => x.v === v)?.l ?? v ?? "—";

export const NOMBRE_SUSCRIPCION: Record<string, string> = {
  ACTIVA: "Cobrando", PAUSADA: "En pausa", CANCELADA: "Cancelada", EXPIRADA: "Vencida", TRIAL: "En prueba",
};

export const COLOR_ESTADO: Record<string, string> = {
  // Tokens de la paleta. "En prueba" iba en el azul de la marca, que es para acciones.
  ACTIVO: "bg-success-soft text-success",
  TRIAL: "bg-sel text-ink-2",
  SUSPENDIDO: "bg-warning-soft text-warning",
  CANCELADO: "bg-danger-soft text-danger",
  INTERNO: "bg-sel text-ink-2",
};
export const NOMBRE_ESTADO: Record<string, string> = {
  ACTIVO: "Activo", TRIAL: "En prueba", SUSPENDIDO: "Suspendido", CANCELADO: "Cancelado", INTERNO: "Interno",
};

/** Fases de onboarding (0012) en palabras. */
export const NOMBRE_FASE: Record<string, string> = {
  INVITADO: "Invitado", EN_CONFIGURACION: "En configuración", GO_LIVE: "En operación", ABANDONADO: "Abandonado",
};
export const nombreFase = (f: string | null | undefined) => (f ? NOMBRE_FASE[f] ?? f : "—");

export const input = "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
export const label = "mb-1.5 block text-[13px] font-medium text-ink-2";
