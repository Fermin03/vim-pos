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

export const VERTICALES = [
  { v: "QUICK_SERVICE", l: "Quick Service" },
  { v: "FULL_SERVICE", l: "Full Service" },
  { v: "CAFE_BAR", l: "Café & Bar" },
  { v: "DARK_KITCHEN", l: "Dark Kitchen" },
  { v: "FOODTRUCK", l: "Foodtruck" },
  { v: "ENTERPRISE", l: "Enterprise" },
] as const;

export const COLOR_ESTADO: Record<string, string> = {
  ACTIVO: "bg-[#EAF3EE] text-success",
  TRIAL: "bg-[#EAF3FB] text-[#0063A8]",
  SUSPENDIDO: "bg-[#FCF3E6] text-warning",
  CANCELADO: "bg-[#FBECEA] text-danger",
  INTERNO: "bg-sel text-ink-3",
};
export const NOMBRE_ESTADO: Record<string, string> = {
  ACTIVO: "Activo", TRIAL: "En prueba", SUSPENDIDO: "Suspendido", CANCELADO: "Cancelado", INTERNO: "Interno",
};

export const input = "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
export const label = "mb-1.5 block text-[13px] font-medium text-ink-2";
