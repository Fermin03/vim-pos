// Lo que la caja le pide a terminal-cobro. Módulo puro (node --test).
import { montoTexto } from "./mercado-pago.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: unknown): string | null => (typeof v === "string" && UUID.test(v) ? v.toLowerCase() : null);

export type Cuerpo =
  | { accion: "crear"; cobro_id: string; ticket_id: string; folio: string | null; monto: string; caja_id: string | null; usuario_id: string | null }
  | { accion: "estado" | "cancelar" | "confirmar"; cobro_id: string; caja_id: string | null }
  | { accion: "pendientes"; caja_id: string | null };

export function validarCuerpo(crudo: unknown): { ok: true; cuerpo: Cuerpo } | { ok: false; error: string } {
  const b = (crudo && typeof crudo === "object" ? crudo : {}) as Record<string, unknown>;
  const caja_id = uuid(b.caja_id);
  if (b.accion === "pendientes") return { ok: true, cuerpo: { accion: "pendientes", caja_id } };
  const cobro_id = uuid(b.cobro_id);
  if (!cobro_id) return { ok: false, error: "COBRO_ID_INVALIDO" };
  if (b.accion === "estado" || b.accion === "cancelar" || b.accion === "confirmar") {
    return { ok: true, cuerpo: { accion: b.accion, cobro_id, caja_id } };
  }
  if (b.accion !== "crear") return { ok: false, error: "ACCION_INVALIDA" };
  const ticket_id = uuid(b.ticket_id);
  const monto = montoTexto(b.monto);
  if (!ticket_id) return { ok: false, error: "TICKET_ID_INVALIDO" };
  if (!monto) return { ok: false, error: "MONTO_INVALIDO" };
  // El folio va a la descripción del cobro en Mercado Pago: solo lo que parece un folio, sin datos personales.
  const folio = typeof b.folio === "string" && /^[A-Za-z0-9 #-]{1,30}$/.test(b.folio) ? b.folio : null;
  return { ok: true, cuerpo: { accion: "crear", cobro_id, ticket_id, folio, monto, caja_id, usuario_id: uuid(b.usuario_id) } };
}
