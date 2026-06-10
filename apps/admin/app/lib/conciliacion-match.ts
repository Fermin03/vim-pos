// B2 Dark Kitchen · motor de conciliación (lógica pura, testeable sin BD).
// Empareja los registros de la liquidación de la app contra los tickets del POS:
//   1) FOLIO_EXACTO: folio_externo_app idéntico (normalizado).
//   2) MONTO_FECHA: mismo monto (±tolerancia) y mismo día, entre los que quedaron sin folio.
// Cada ticket se empareja una sola vez. Devuelve el match por ítem + un resumen para el reporte.

export type LiqItem = {
  id: string;
  folioExternoApp: string;
  montoVentaMxn: number;
  fechaOrden: string | null; // ISO; solo se usa el día
};

export type TicketPos = {
  id: string;
  folioExternoApp: string | null;
  totalMxn: number;
  fecha: string; // ISO
};

export type MatchMetodo = "FOLIO_EXACTO" | "MONTO_FECHA";

export type MatchResultado = {
  itemId: string;
  ticketId: string | null;
  metodo: MatchMetodo | null;
  diferenciaMxn: number | null; // monto_venta_app - ticket.total (con signo); null si sin match
};

export type ResumenConciliacion = {
  totalItems: number;
  conMatch: number;
  sinMatch: number;
  ticketsSinLiquidar: number; // tickets POS del período que la app no reportó
  totalPosMxn: number; // suma de los tickets emparejados
  diferenciaTotalMxn: number; // suma de diferencias de los emparejados
  porcentajeMatch: number; // 0..100
  estado: "CONCILIADA" | "CONCILIADA_CON_DIFERENCIAS";
};

const TOLERANCIA_MXN = 1; // centavos de redondeo entre app y POS

function norm(folio: string | null): string {
  return (folio ?? "").trim().toUpperCase();
}
function dia(iso: string | null): string {
  return (iso ?? "").slice(0, 10);
}
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Empareja items de la liquidación con tickets del POS. No muta las entradas. */
export function conciliarItems(items: LiqItem[], tickets: TicketPos[]): MatchResultado[] {
  const usados = new Set<string>();
  const porFolio = new Map<string, TicketPos>();
  for (const t of tickets) {
    const f = norm(t.folioExternoApp);
    if (f && !porFolio.has(f)) porFolio.set(f, t);
  }

  const resultados: MatchResultado[] = [];

  // Pasada 1 — folio exacto
  const pendientes: LiqItem[] = [];
  for (const it of items) {
    const t = porFolio.get(norm(it.folioExternoApp));
    if (t && !usados.has(t.id)) {
      usados.add(t.id);
      resultados.push({ itemId: it.id, ticketId: t.id, metodo: "FOLIO_EXACTO", diferenciaMxn: r2(it.montoVentaMxn - t.totalMxn) });
    } else {
      pendientes.push(it);
    }
  }

  // Pasada 2 — monto + día, entre tickets aún libres
  for (const it of pendientes) {
    const t = tickets.find(
      (tk) => !usados.has(tk.id) && Math.abs(tk.totalMxn - it.montoVentaMxn) <= TOLERANCIA_MXN && dia(tk.fecha) === dia(it.fechaOrden),
    );
    if (t) {
      usados.add(t.id);
      resultados.push({ itemId: it.id, ticketId: t.id, metodo: "MONTO_FECHA", diferenciaMxn: r2(it.montoVentaMxn - t.totalMxn) });
    } else {
      resultados.push({ itemId: it.id, ticketId: null, metodo: null, diferenciaMxn: null });
    }
  }

  // Devolver en el orden original de items
  const porId = new Map(resultados.map((r) => [r.itemId, r]));
  return items.map((it) => porId.get(it.id)!);
}

/** Resumen para apps_liquidaciones (total_pos, diferencia, % match, estado). */
export function resumenConciliacion(items: LiqItem[], tickets: TicketPos[], resultados: MatchResultado[]): ResumenConciliacion {
  const conMatch = resultados.filter((r) => r.ticketId).length;
  const ticketsMatch = new Set(resultados.map((r) => r.ticketId).filter(Boolean) as string[]);
  const totalPos = r2(tickets.filter((t) => ticketsMatch.has(t.id)).reduce((s, t) => s + t.totalMxn, 0));
  const diferenciaTotal = r2(resultados.reduce((s, r) => s + (r.diferenciaMxn ?? 0), 0));
  const ticketsSinLiquidar = tickets.filter((t) => !ticketsMatch.has(t.id)).length;
  const pct = items.length === 0 ? 0 : r2((conMatch / items.length) * 100);
  const cuadra = conMatch === items.length && ticketsSinLiquidar === 0 && Math.abs(diferenciaTotal) <= TOLERANCIA_MXN;
  return {
    totalItems: items.length,
    conMatch,
    sinMatch: items.length - conMatch,
    ticketsSinLiquidar,
    totalPosMxn: totalPos,
    diferenciaTotalMxn: diferenciaTotal,
    porcentajeMatch: pct,
    estado: cuadra ? "CONCILIADA" : "CONCILIADA_CON_DIFERENCIAS",
  };
}
