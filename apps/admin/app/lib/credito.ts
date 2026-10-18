"use client";
import { z } from "zod";
import { supabase } from "./supabase";
import { tenantId } from "./datos";

// Crédito por cliente (retail 2, 0208–0210). El dueño lo enciende, se lo da a un cliente con límite
// y plazo, y ve quién debe. Las reglas de dinero viven en la base; aquí solo se lee y se arma.

/** Los centavos de un monto que llega de la base como texto o número: la suma no arrastra floats. */
const cent = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const pesos = (c: number) => c / 100;

// ── Configuración del negocio ────────────────────────────────────────────────

export type AbonosAlCancelar = "SALDO_FAVOR" | "EFECTIVO";
export type ConfigCredito = { activo: boolean; abonosAlCancelar: AbonosAlCancelar };

/** Sin fila en `configuracion_tenant` el crédito está apagado y lo abonado va a saldo a favor. */
export async function leerConfigCredito(): Promise<ConfigCredito> {
  const tid = await tenantId();
  const { data, error } = await supabase
    .from("configuracion_tenant")
    .select("modulo_credito_activo, credito_abonos_al_cancelar")
    .eq("tenant_id", tid)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const c = data as { modulo_credito_activo?: boolean; credito_abonos_al_cancelar?: string } | null;
  return {
    activo: c?.modulo_credito_activo === true,
    abonosAlCancelar: c?.credito_abonos_al_cancelar === "EFECTIVO" ? "EFECTIVO" : "SALDO_FAVOR",
  };
}

/**
 * Mismo upsert que la lealtad (`activarModuloLealtad`): la mayoría de los negocios no tiene fila
 * hasta su primer ajuste. La base deja cambiarlo solo al dueño o a un administrador (0208).
 */
export async function guardarConfigCredito(cambio: Partial<ConfigCredito>): Promise<void> {
  const tid = await tenantId();
  const fila: Record<string, unknown> = { tenant_id: tid };
  if (cambio.activo !== undefined) fila.modulo_credito_activo = cambio.activo;
  if (cambio.abonosAlCancelar !== undefined) fila.credito_abonos_al_cancelar = cambio.abonosAlCancelar;
  const { error } = await supabase.from("configuracion_tenant").upsert(fila, { onConflict: "tenant_id" });
  if (error) throw new Error(error.message);
}

// ── Crédito de un cliente ────────────────────────────────────────────────────

export const creditoClienteSchema = z.object({
  activo: z.boolean(),
  limite: z.string().trim()
    .regex(/^\d+(\.\d{1,2})?$/, "El límite va en pesos, con dos decimales como mucho.")
    .refine((v) => Number(v) > 0, "El límite debe ser mayor a cero."),
  plazo: z.string().trim()
    .regex(/^\d+$/, "El plazo va en días enteros.")
    .refine((v) => Number(v) > 0 && Number(v) <= 3650, "El plazo debe ser de 1 a 3650 días."),
});
export type FormCredito = z.infer<typeof creditoClienteSchema>;

type FilaCredito = { activo: boolean; limite_mxn: string | number; plazo_dias: number };

export function formDeCredito(c: FilaCredito | null): FormCredito {
  if (!c) return { activo: false, limite: "", plazo: "" };
  return { activo: c.activo, limite: String(Number(c.limite_mxn)), plazo: String(c.plazo_dias) };
}

/** null = el cliente nunca tuvo crédito. */
export async function leerCreditoCliente(clienteId: string): Promise<FilaCredito | null> {
  const { data, error } = await supabase
    .from("clientes_credito")
    .select("activo, limite_mxn, plazo_dias")
    .eq("cliente_id", clienteId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FilaCredito | null) ?? null;
}

/**
 * Da, cambia o apaga el crédito. No se borra nunca (puede haber deuda): se apaga con activo=false.
 * Un cliente sin crédito que se deja apagado no crea fila.
 */
export async function guardarCreditoCliente(clienteId: string, f: FormCredito, existia: boolean): Promise<void> {
  if (!existia && !f.activo) return;
  const d = creditoClienteSchema.parse(f);
  const tid = await tenantId();
  const { error } = await supabase.from("clientes_credito").upsert(
    { tenant_id: tid, cliente_id: clienteId, activo: d.activo, limite_mxn: d.limite, plazo_dias: Number(d.plazo) },
    { onConflict: "tenant_id,cliente_id" },
  );
  if (error) throw new Error(error.message);
}

// ── Quién debe ───────────────────────────────────────────────────────────────

export type Deudor = {
  clienteId: string;
  nombre: string;
  deuda: number;
  disponible: number;
  vencido: boolean;
  /** Fecha de la venta más vieja que aún debe. */
  desde: string | null;
  saldoFavor: number;
  activo: boolean;
};

type FilaVista = {
  cliente_id: string; deuda_mxn: unknown; disponible_mxn: unknown;
  venta_mas_vieja_fecha: string | null; tiene_vencido: boolean; activo: boolean;
};
type FilaSaldo = { cliente_id: string; saldo_mxn: unknown };

/**
 * Los clientes que deben o tienen saldo a favor: vencidos primero, luego la deuda más vieja y, al
 * final, quien solo tiene saldo a favor.
 */
export function armarDeudores(creditos: FilaVista[], saldos: FilaSaldo[], nombres: Map<string, string>): Deudor[] {
  const saldo = new Map(saldos.map((s) => [s.cliente_id, cent(s.saldo_mxn)]));
  const filas = new Map<string, Deudor>();
  for (const c of creditos) {
    filas.set(c.cliente_id, {
      clienteId: c.cliente_id, nombre: nombres.get(c.cliente_id) ?? "Cliente",
      deuda: pesos(cent(c.deuda_mxn)), disponible: pesos(cent(c.disponible_mxn)),
      vencido: c.tiene_vencido, desde: cent(c.deuda_mxn) > 0 ? c.venta_mas_vieja_fecha : null,
      saldoFavor: pesos(saldo.get(c.cliente_id) ?? 0), activo: c.activo,
    });
  }
  for (const [id, c] of saldo) {
    if (!filas.has(id)) {
      filas.set(id, { clienteId: id, nombre: nombres.get(id) ?? "Cliente", deuda: 0, disponible: 0, vencido: false, desde: null, saldoFavor: pesos(c), activo: false });
    }
  }
  return [...filas.values()]
    .filter((d) => d.deuda > 0 || d.saldoFavor > 0)
    .sort((a, b) =>
      Number(b.vencido) - Number(a.vencido)
      || (a.desde ?? "￿").localeCompare(b.desde ?? "￿")
      || b.deuda - a.deuda
      || a.nombre.localeCompare(b.nombre, "es"));
}

export async function listarDeudores(): Promise<Deudor[]> {
  const tid = await tenantId();
  const [cr, sf] = await Promise.all([
    supabase.from("vw_creditos_cliente")
      .select("cliente_id, deuda_mxn, disponible_mxn, venta_mas_vieja_fecha, tiene_vencido, activo")
      .eq("tenant_id", tid),   // todos: quien no debe pero tiene saldo a favor conserva su disponible
    supabase.from("vw_saldo_favor_cliente").select("cliente_id, saldo_mxn").eq("tenant_id", tid).gt("saldo_mxn", 0),
  ]);
  if (cr.error) throw new Error(cr.error.message);
  if (sf.error) throw new Error(sf.error.message);
  const creditos = (cr.data ?? []) as FilaVista[];
  const saldos = (sf.data ?? []) as FilaSaldo[];
  const ids = [...new Set([...creditos, ...saldos].map((f) => f.cliente_id))];
  const nombres = new Map<string, string>();
  if (ids.length > 0) {
    const { data, error } = await supabase.from("clientes").select("id, nombre, apellido_paterno").in("id", ids);
    if (error) throw new Error(error.message);
    for (const c of (data ?? []) as { id: string; nombre: string; apellido_paterno: string | null }[]) {
      nombres.set(c.id, [c.nombre, c.apellido_paterno].filter(Boolean).join(" "));
    }
  }
  return armarDeudores(creditos, saldos, nombres);
}

// ── Detalle de un cliente ────────────────────────────────────────────────────

export type MovimientoCredito = { id: string; tipo: "ABONO" | "AJUSTE_CANCELACION"; metodo: string | null; monto: number; fecha: string };
export type VentaCredito = { ticketId: string; folio: string; fecha: string | null; total: number; saldo: number; abonos: MovimientoCredito[] };

type FilaPago = { ticket_id: string; monto_mxn: unknown; tickets: { folio_completo: string | null; fecha_pago: string | null } | null };
type FilaAbono = { id: string; ticket_id: string; tipo: string; metodo_pago: string | null; monto_mxn: unknown; estado: string; created_at: string };

/** Lo de `credito_saldo_ticket` (0208), por venta: su CREDITO menos sus abonos y ajustes aplicados. */
export function armarVentasCredito(pagos: FilaPago[], abonos: FilaAbono[]): VentaCredito[] {
  const ventas = new Map<string, VentaCredito & { c: number }>();
  for (const p of pagos) {
    const v = ventas.get(p.ticket_id) ?? {
      ticketId: p.ticket_id, folio: p.tickets?.folio_completo ?? "Sin folio", fecha: p.tickets?.fecha_pago ?? null,
      total: 0, saldo: 0, abonos: [], c: 0,
    };
    v.c += cent(p.monto_mxn);
    ventas.set(p.ticket_id, v);
  }
  const aplicados = abonos.filter((a) => a.estado === "APLICADO").sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const a of aplicados) {
    const v = ventas.get(a.ticket_id);
    if (!v) continue;
    v.abonos.push({ id: a.id, tipo: a.tipo === "ABONO" ? "ABONO" : "AJUSTE_CANCELACION", metodo: a.metodo_pago, monto: pesos(cent(a.monto_mxn)), fecha: a.created_at });
  }
  return [...ventas.values()]
    .map(({ c, ...v }) => ({ ...v, total: pesos(c), saldo: pesos(c - v.abonos.reduce((s, a) => s + cent(a.monto), 0)) }))
    .sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""));
}

export async function ventasCreditoCliente(clienteId: string): Promise<VentaCredito[]> {
  const [p, a] = await Promise.all([
    supabase.from("pagos")
      .select("ticket_id, monto_mxn, tickets!inner(folio_completo, fecha_pago, cliente_id)")
      .eq("metodo_pago", "CREDITO").eq("estado", "APLICADO").is("deleted_at", null)
      .eq("tickets.cliente_id", clienteId),
    supabase.from("abonos_credito")
      .select("id, ticket_id, tipo, metodo_pago, monto_mxn, estado, created_at")
      .eq("cliente_id", clienteId),
  ]);
  if (p.error) throw new Error(p.error.message);
  if (a.error) throw new Error(a.error.message);
  return armarVentasCredito((p.data ?? []) as unknown as FilaPago[], (a.data ?? []) as FilaAbono[]);
}
