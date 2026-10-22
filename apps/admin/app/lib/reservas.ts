"use client";
import { z } from "zod";
import { supabase } from "./supabase";
import { tenantId } from "./datos";
import { BASE_TIENDA } from "./tienda-reglas";

// Reservas en línea (belleza, entrega 3, 0224): el interruptor y las reglas viven en
// `configuracion_tenant`; la base deja cambiarlas solo al dueño o a un administrador (guardia de 0224).

export const INTERVALOS = [5, 10, 15, 20, 30, 60] as const;

const entero = (min: number, max: number, texto: string) =>
  z.number({ error: texto }).int(texto).min(min, texto).max(max, texto);

/** Las mismas reglas que los CHECK de la base. */
export const reglasReservasSchema = z.object({
  dias: entero(1, 120, "Los días hacia adelante van de 1 a 120"),
  intervalo: z.literal(INTERVALOS, { error: "Elige cada cuántos minutos" }),
  avisoHoras: entero(0, 72, "La anticipación mínima va de 0 a 72 horas"),
});
export type ReglasReservas = z.infer<typeof reglasReservasSchema>;
export type ConfigReservas = ReglasReservas & { activo: boolean };

/** Los valores por omisión de la base (0224): sin fila en `configuracion_tenant` rigen estos. */
export const RESERVAS_POR_OMISION: ConfigReservas = { activo: false, dias: 30, intervalo: 15, avisoHoras: 2 };

const ok = ({ error }: { error: { message: string } | null }) => { if (error) throw new Error(error.message); };

export async function leerConfigReservas(): Promise<ConfigReservas> {
  const r = await supabase.from("configuracion_tenant")
    .select("modulo_reservas_activo, agenda_dias_reserva, agenda_intervalo_min, agenda_aviso_min_horas")
    .eq("tenant_id", await tenantId()).maybeSingle();
  ok(r);
  const f = r.data as { modulo_reservas_activo: boolean; agenda_dias_reserva: number; agenda_intervalo_min: number; agenda_aviso_min_horas: number } | null;
  if (!f) return RESERVAS_POR_OMISION;
  const intervalo = INTERVALOS.find((n) => n === f.agenda_intervalo_min) ?? RESERVAS_POR_OMISION.intervalo;
  return { activo: f.modulo_reservas_activo, dias: f.agenda_dias_reserva, intervalo, avisoHoras: f.agenda_aviso_min_horas };
}

export async function encenderReservas(activo: boolean): Promise<void> {
  ok(await supabase.from("configuracion_tenant").upsert({ tenant_id: await tenantId(), modulo_reservas_activo: activo }, { onConflict: "tenant_id" }));
}

export async function guardarReglasReservas(input: ReglasReservas): Promise<void> {
  const d = reglasReservasSchema.parse(input);
  ok(await supabase.from("configuracion_tenant").upsert(
    { tenant_id: await tenantId(), agenda_dias_reserva: d.dias, agenda_intervalo_min: d.intervalo, agenda_aviso_min_horas: d.avisoHoras },
    { onConflict: "tenant_id" },
  ));
}

/** La página de reservas del negocio: la misma dirección que su tienda. */
export const enlaceReservas = (direccion: string): string => `https://${BASE_TIENDA}/${direccion}`;

/** WhatsApp sin destinatario: el dueño elige a quién (o a su estado) se lo manda. */
export const whatsappCompartir = (enlace: string): string =>
  `https://wa.me/?text=${encodeURIComponent(`Aparta tu cita en línea: ${enlace}`)}`;

// ── Reembolsos que Mercado Pago no pudo hacer ────────────────────────────────

/** Un anticipo en línea de una cita que quedó en DEVOLUCION_FALLIDA: el dueño lo devuelve a mano. */
export type ReembolsoPorResolver = { id: string; cita: string | null; clienta: string; monto: number; fecha: string };

/** Fila de `tienda_pagos` con su cita → lo que se enseña. Sin cita a la vista (RLS), queda sin fecha de cita. */
export function reembolsoDeFila(f: Record<string, unknown>): ReembolsoPorResolver {
  const c = (Array.isArray(f.cita) ? f.cita[0] : f.cita) as { inicia?: unknown; cliente_nombre?: unknown } | null | undefined;
  return {
    id: String(f.id),
    cita: typeof c?.inicia === "string" ? c.inicia : null,
    clienta: typeof c?.cliente_nombre === "string" && c.cliente_nombre.trim() ? c.cliente_nombre : "—",
    monto: Number(f.monto_mxn),
    fecha: String(f.created_at),
  };
}

// ponytail: solo lectura. La tienda tampoco tiene cómo marcar resuelta una DEVOLUCION_FALLIDA;
// cuando exista ese gesto (RPC con guardia de admin), se agrega aquí el botón.
export async function leerReembolsosPorResolver(): Promise<ReembolsoPorResolver[]> {
  const r = await supabase.from("tienda_pagos")
    .select("id, monto_mxn, created_at, cita:citas(inicia, cliente_nombre)")
    .eq("estado", "DEVOLUCION_FALLIDA").not("cita_id", "is", null)
    .order("created_at", { ascending: false });
  ok(r);
  return ((r.data ?? []) as Record<string, unknown>[]).map(reembolsoDeFila);
}
