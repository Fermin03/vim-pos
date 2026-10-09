// Pedidos de la tienda en línea (canal TIENDA de delivery_pedidos): etiquetas, timbre, comandas, aceptación
// automática y la pausa de la tienda. Lógica pura salvo las cuatro llamadas a delivery-accion.
import { etiquetaApp, type PedidoApp } from "./pedidos-apps";
import { encabezadosFuncion, urlFuncion } from "./supabase";

export function etiquetaOrigen(p: PedidoApp): string {
  return etiquetaApp(p.app);
}

export function etiquetaPago(p: PedidoApp): string | null {
  if (!p.pago) return null;
  if (p.pago.forma === "TARJETA") return "Tarjeta";
  return p.pago.pagaCon == null ? "Efectivo" : `Efectivo, paga con $${p.pago.pagaCon.toFixed(2)}`;
}

export function etiquetaEntrega(p: PedidoApp): string {
  if (p.canal === "TIENDA") return p.app === "DELIVERY_PROPIO" ? "A domicilio" : "Para recoger";
  return p.tipoEntrega === "RECOGE_CLIENTE" ? "Recoge en tienda" : "Reparto de la app";
}

/** Timbre: suena al llegar un pedido nuevo por aceptar y se repite cada 20 s mientras quede alguno. */
export const TIMBRE_CADA_MS = 20_000;
export function debeSonar(d: { hayNuevoPorAceptar: boolean; hayPorAceptar: boolean; ultimoTimbre: number | null; ahora: number }): boolean {
  if (d.hayNuevoPorAceptar) return true;
  return d.hayPorAceptar && (d.ultimoTimbre === null || d.ahora - d.ultimoTimbre >= TIMBRE_CADA_MS);
}

const CON_COMANDA = new Set(["ACEPTADO", "EN_PREPARACION", "LISTO"]);
/** Qué pedidos de la tienda necesitan que ESTE dispositivo imprima sus comandas. */
export function comandasPendientes(pedidos: PedidoApp[], cajaDelTurnoId: string, yaIntentadas: ReadonlySet<string>): { pedidoId: string; ticketId: string }[] {
  return pedidos.flatMap((p) =>
    p.canal === "TIENDA" && CON_COMANDA.has(p.estado) && p.ticketId && p.ticketCajaId === cajaDelTurnoId && !p.comandaImpresa && !yaIntentadas.has(p.id)
      ? [{ pedidoId: p.id, ticketId: p.ticketId }]
      : [],
  );
}

/** POS web con aceptación automática: qué pedidos aceptar solos (en escritorio acepta el agente de la caja). */
export function aceptablesSolos(
  pedidos: PedidoApp[],
  d: { esEscritorio: boolean; aceptacion: "MANUAL" | "AUTO" | null; hayTurno: boolean },
  yaIntentados: ReadonlySet<string>,
): string[] {
  if (d.esEscritorio || d.aceptacion !== "AUTO" || !d.hayTurno) return [];
  return pedidos
    .filter((p) => p.canal === "TIENDA" && p.estado === "RECIBIDO" && p.gestion === "NUBE" && !yaIntentados.has(p.id))
    .map((p) => p.id);
}

// ── Estado y pausa de la tienda, vía delivery-accion ──

export type EstadoEnLinea = { participa: boolean; aceptacion: "MANUAL" | "AUTO"; pausaHasta: string | null; motivo: string | null };

/** Error de una llamada: el mensaje es el código, para pasarlo a mensajeErrorEnLinea. */
export class ErrorEnLinea extends Error {
  constructor(readonly codigo: string, readonly causa?: string) { super(codigo); }
}

type RespEstado = { participa?: boolean; aceptacion?: "MANUAL" | "AUTO"; pausa_hasta?: string | null; motivo?: string | null; error?: string; causa?: string };

async function llamar(token: string, cuerpo: Record<string, unknown>): Promise<{ status: number; j: RespEstado }> {
  try {
    const r = await fetch(urlFuncion("delivery-accion"), { method: "POST", headers: encabezadosFuncion(token), body: JSON.stringify(cuerpo) });
    return { status: r.status, j: (await r.json().catch(() => ({}))) as RespEstado };
  } catch {
    return { status: 0, j: { error: "SIN_RED" } };
  }
}

function comoEstado({ status, j }: { status: number; j: RespEstado }): EstadoEnLinea {
  if (status < 200 || status >= 300 || j.error) throw new ErrorEnLinea(j.error ?? `HTTP_${status}`, j.causa);
  // Una respuesta que no dice si la tienda participa no es "apagada": es una respuesta rota.
  if (typeof j.participa !== "boolean") throw new ErrorEnLinea("RESPUESTA_INVALIDA");
  return { participa: j.participa, aceptacion: j.aceptacion === "AUTO" ? "AUTO" : "MANUAL", pausaHasta: j.pausa_hasta ?? null, motivo: j.motivo ?? null };
}

/** null = esta sucursal no tiene tienda (o el negocio no tiene el módulo). */
export async function leerEstadoEnLinea(token: string, sucursalId: string): Promise<EstadoEnLinea | null> {
  const r = await llamar(token, { accion: "enlinea_estado", sucursal_id: sucursalId });
  if (r.j.error === "SUCURSAL_SIN_TIENDA" || r.j.error === "SIN_MODULO_TIENDA") return null;
  return comoEstado(r);
}
export async function pausarEnLinea(token: string, sucursalId: string, duracion: "30m" | "1h" | "indefinida"): Promise<EstadoEnLinea> {
  return comoEstado(await llamar(token, { accion: "enlinea_pausar", sucursal_id: sucursalId, duracion }));
}
export async function reanudarEnLinea(token: string, sucursalId: string): Promise<EstadoEnLinea> {
  return comoEstado(await llamar(token, { accion: "enlinea_reanudar", sucursal_id: sucursalId }));
}
/**
 * Avisa a la nube que hay un POS web con turno abierto. Con `cajaId` (la caja de ese turno) la nube
 * sella solo esa caja. Nunca lanza: es un latido, si falla se repite.
 */
export async function avisarPresente(token: string, sucursalId: string, cajaId?: string): Promise<void> {
  await llamar(token, { accion: "enlinea_presente", sucursal_id: sucursalId, ...(cajaId ? { caja_id: cajaId } : {}) });
}

/** "2:30 p. m." en hora de México. */
function horaMx(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const partes = new Intl.DateTimeFormat("en-US", { timeZone: "America/Mexico_City", hour: "numeric", minute: "2-digit", hourCycle: "h12" }).formatToParts(d);
  const v = (t: string) => partes.find((x) => x.type === t)?.value ?? "";
  return `${v("hour")}:${v("minute")} ${v("dayPeriod").toUpperCase() === "AM" ? "a. m." : "p. m."}`;
}

export function etiquetaEstadoEnLinea(e: EstadoEnLinea, ahora: Date): { texto: string; tono: "ok" | "aviso" } {
  switch (e.motivo) {
    case null: return { texto: "Tienda: recibiendo pedidos", tono: "ok" };
    case "EN_PAUSA": {
      // Sin hora si es indefinida o si la hora ya pasó (el estado se leyó antes de que venciera):
      // prometer "hasta las 8:05" a las 9 es mentirle al cajero; la siguiente lectura lo corrige.
      const hasta = e.pausaHasta ? new Date(e.pausaHasta) : null;
      const h = !hasta || hasta.getUTCFullYear() >= 2999 || hasta.getTime() <= ahora.getTime() ? null : horaMx(e.pausaHasta!);
      return { texto: h ? `Tienda: en pausa hasta las ${h}` : "Tienda: en pausa", tono: "aviso" };
    }
    case "FUERA_DE_HORARIO": return { texto: "Tienda: fuera de horario", tono: "aviso" };
    case "CAJA_NO_LISTA": return { texto: "Tienda: sin turno abierto", tono: "aviso" };
    default: return { texto: "Tienda: apagada", tono: "aviso" };
  }
}

export function mensajeErrorEnLinea(codigo: string, _causa?: string): string {
  switch (codigo) {
    case "SIN_TURNO_ABIERTO": return "Abre un turno para aceptar pedidos.";
    case "PEDIDO_CANCELADO": return "Este pedido ya no coincide con tu menú o tus zonas de envío. Se canceló y tu cliente ya lo sabe.";
    case "ACCION_INVALIDA": return "Este pedido ya fue atendido.";
    case "RECLAMADO_POR_OTRA_CAJA": return "Otra caja ya tomó este pedido.";
    case "SIN_RED": case "FUNCION_REQUIERE_NUBE": return "Sin internet no se pueden atender pedidos en línea.";
    default: return "No se pudo completar. Inténtalo de nuevo.";
  }
}
