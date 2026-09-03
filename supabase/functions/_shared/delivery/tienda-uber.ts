// Lógica pura del estado de tienda y tiempo de preparación en Uber (spec A6). Sin I/O: se prueba
// con node --test. Doc: docs/integraciones/delivery/03-uber-eats-resumen.md §8.

export type EstadoTienda = {
  estado: "EN_LINEA" | "PAUSADA" | "DESCONOCIDO";
  hasta: string | null;
  motivo: string | null;
  consultado_at: string;
};
export type DuracionPausa = "30m" | "1h" | "dia";

type Dict = Record<string, unknown>;
const obj = (v: unknown): Dict => (v && typeof v === "object" && !Array.isArray(v) ? (v as Dict) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

/** GET /v1/delivery/store/{id}/status (o la respuesta de update-store-status) → estado normalizado. */
export function normalizarEstadoTienda(respuesta: unknown, ahora: Date): EstadoTienda {
  const r = obj(respuesta);
  const consultado_at = ahora.toISOString();
  if (r.status === "ONLINE") return { estado: "EN_LINEA", hasta: null, motivo: null, consultado_at };
  if (r.status === "OFFLINE") return { estado: "PAUSADA", hasta: str(r.is_offline_until), motivo: str(r.offline_reason), consultado_at };
  return { estado: "DESCONOCIDO", hasta: null, motivo: null, consultado_at };
}

/** Lee `config.tienda` si tiene forma válida y no es más viejo que maxSeg. */
export function estadoCacheVigente(config: unknown, ahora: Date, maxSeg = 60): EstadoTienda | null {
  const t = obj(obj(config).tienda);
  const estado = t.estado;
  const consultado = str(t.consultado_at);
  if (!consultado || (estado !== "EN_LINEA" && estado !== "PAUSADA" && estado !== "DESCONOCIDO")) return null;
  const edad = (ahora.getTime() - new Date(consultado).getTime()) / 1000;
  if (!Number.isFinite(edad) || edad < 0 || edad > maxSeg) return null;
  return { estado, hasta: str(t.hasta), motivo: str(t.motivo), consultado_at: consultado };
}

/** 23:59:59 del día local de la sucursal, expresado en UTC. */
export function finDelDia(ahora: Date, zonaHoraria: string): Date {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: zonaHoraria, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(ahora).reduce<Record<string, number>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = Number(p.value);
    return acc;
  }, {});
  // Desplazamiento de la zona en ese instante = (hora local leída como UTC) − instante real.
  const localComoUtc = Date.UTC(partes.year, partes.month - 1, partes.day, partes.hour % 24, partes.minute, partes.second);
  const offsetMs = localComoUtc - ahora.getTime();
  const finLocalComoUtc = Date.UTC(partes.year, partes.month - 1, partes.day, 23, 59, 59);
  return new Date(finLocalComoUtc - offsetMs);
}

/** Cuerpo de POST …/update-store-status para pausar. */
export function cuerpoPausarTienda(ahora: Date, duracion: DuracionPausa, zonaHoraria = "America/Mexico_City", motivo = "Pausada desde el POS") {
  const hasta = duracion === "30m" ? new Date(ahora.getTime() + 30 * 60_000)
    : duracion === "1h" ? new Date(ahora.getTime() + 60 * 60_000)
    : finDelDia(ahora, zonaHoraria);
  return { status: "OFFLINE" as const, is_offline_until: hasta.toISOString(), reason: motivo };
}

export function cuerpoReanudarTienda() {
  return { status: "ONLINE" as const };
}

/** Cuerpo de POST …/update-store-prep-time. Uber recibe segundos, máximo 3 h. */
export function cuerpoPrepTime(minutos: number) {
  if (!Number.isInteger(minutos) || minutos < 1 || minutos > 180) throw new Error("PREP_FUERA_DE_RANGO");
  return { default_prep_time: minutos * 60 };
}

/** Uber: la tienda no tiene estrategia de estado "external"; solo se pausa desde Uber Eats Manager. */
export function esErrorEstrategiaExterna(mensaje: string): boolean {
  return mensaje.startsWith("UBER_HTTP_403") && mensaje.includes("resource_update_not_allowed");
}
