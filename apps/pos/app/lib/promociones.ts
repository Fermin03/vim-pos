"use client";
import { employeeClient } from "./supabase";

/**
 * Promociones aplicables al ticket que se está cobrando.
 *
 * QUÉ CAMBIA RESPECTO DE UN DESCUENTO MANUAL
 *
 * Una promoción ya viene autorizada: la registró el dueño en el panel, con su
 * vigencia. Por eso **no pide PIN** — a diferencia del descuento a mano, que sí
 * necesita que alguien lo firme. Pedir la firma del gerente en cada ticket del
 * martes convierte la promoción en un estorbo y deja de usarse a la segunda
 * hora pico.
 *
 * Y por eso también va por su propio carril en la base: `promociones_mxn`, no
 * `descuentos_manuales_mxn`. El reporte «Descuentos por usuario» existe para
 * detectar a un cajero que regala comida; si cada promoción del martes entrara
 * ahí, quedaría sepultado en ruido legítimo.
 *
 * DÓNDE SE DECIDE QUÉ APLICA
 *
 * `evaluar_promociones_aplicables()` (migración 0008) filtra en SQL lo que se
 * puede filtrar ahí: vigencia, usos, sucursal, modo de servicio, monto mínimo y
 * si pide cliente identificado. Lo que queda —horario y días de la semana, que
 * viven en el jsonb de condiciones— se filtra aquí, tal como previó el
 * comentario de esa función. La caja es quien sabe qué hora es en el local.
 */

export type PromoAplicable = {
  id: string;
  nombre: string;
  tipo: string;
  /** Lo que descontaría, estimado por la base. El monto real lo fija `aplicar_promocion`. */
  descuentoEstimado: number;
};

export type PromoAplicada = {
  /** Id del renglón en `ticket_promociones_aplicadas`, que es lo que se cancela. */
  aplicacionId: string;
  nombre: string;
  monto: number;
};

type Condiciones = {
  horario?: { desde?: string; hasta?: string };
  dias_semana?: number[];
};

/**
 * ¿La promoción está dentro de su horario y su día?
 *
 * Función PURA para poder probarla sin base ni reloj del sistema.
 *
 * Contempla el horario que cruza la medianoche —«de 22:00 a 02:00»— porque un
 * bar es justo el negocio que pone ese horario, y con una comparación simple
 * (`desde <= hora <= hasta`) esa promoción no se activaría nunca.
 */
export function vigenteAhora(condiciones: unknown, ahora: Date): boolean {
  const c = (condiciones ?? {}) as Condiciones;

  const dias = c.dias_semana;
  if (Array.isArray(dias) && dias.length > 0 && !dias.includes(ahora.getDay())) return false;

  const h = c.horario;
  if (!h?.desde || !h?.hasta) return true;
  const min = ahora.getHours() * 60 + ahora.getMinutes();
  const aMin = (s: string): number => {
    const [hh, mm] = s.split(":");
    return Number(hh ?? 0) * 60 + Number(mm ?? 0);
  };
  const d = aMin(h.desde);
  const f = aMin(h.hasta);
  return d <= f ? min >= d && min <= f : min >= d || min <= f;
}

/** Promociones que la caja puede ofrecer para este ticket, ya filtradas por horario y día. */
export async function leerPromosAplicables(token: string, ticketId: string): Promise<PromoAplicable[]> {
  const { data, error } = await employeeClient(token).rpc("evaluar_promociones_aplicables", {
    p_ticket_id: ticketId,
  });
  if (error) throw new Error(error.message);

  const ahora = new Date();
  return ((data ?? []) as Record<string, unknown>[])
    .filter((p) => vigenteAhora(p.condiciones, ahora))
    .map((p) => ({
      // La columna se llama `promocion_id`, no `id`: `evaluar_promociones_aplicables`
      // devuelve una TABLE con nombres propios. Leerla como `id` mandaba la cadena
      // "undefined" al RPC de aplicar, y el error que salía en pantalla era
      // «invalid input syntax for type uuid», que no le dice nada a un cajero.
      id: String(p.promocion_id),
      nombre: String(p.nombre ?? ""),
      tipo: String(p.tipo ?? ""),
      descuentoEstimado: Number(p.monto_descuento_estimado_mxn ?? 0),
    }));
}

/** Las que YA están puestas en este ticket, para poder mostrarlas y quitarlas. */
export async function leerPromosAplicadas(token: string, ticketId: string): Promise<PromoAplicada[]> {
  const { data, error } = await employeeClient(token)
    .from("ticket_promociones_aplicadas")
    .select("id, promocion_nombre_snapshot, monto_descontado_mxn")
    .eq("ticket_id", ticketId)
    .eq("cancelada_por_cajero", false)
    .order("aplicado_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    aplicacionId: String(r.id),
    nombre: String(r.promocion_nombre_snapshot ?? ""),
    monto: Number(r.monto_descontado_mxn ?? 0),
  }));
}

/**
 * Aplica la promoción. La base revalida vigencia y usos antes de descontar, así
 * que un botón pintado hace un minuto no puede colar una promoción ya vencida.
 *
 * `clientIdLocal` da idempotencia: si el envío se repite —doble toque, reintento
 * de red— no descuenta dos veces.
 */
export async function aplicarPromo(
  token: string,
  args: { ticketId: string; promocionId: string; clientIdLocal?: string | null },
): Promise<string> {
  const { data, error } = await employeeClient(token).rpc("aplicar_promocion", {
    p_ticket_id: args.ticketId,
    p_promocion_id: args.promocionId,
    p_client_id_local: args.clientIdLocal ?? null,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

/** La quita del ticket. No se borra el renglón: queda marcado con su motivo. */
export async function quitarPromo(
  token: string,
  args: { aplicacionId: string; motivo: string; usuarioId?: string | null },
): Promise<void> {
  const { error } = await employeeClient(token).rpc("cancelar_promocion_ticket", {
    p_aplicacion_id: args.aplicacionId,
    p_motivo: args.motivo,
    p_usuario_id: args.usuarioId ?? null,
  });
  if (error) throw new Error(error.message);
}
