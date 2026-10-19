"use client";
import { employeeClient } from "./supabase";
import { redondearCentavos } from "./dinero";
import { fmtMxn } from "./turno";

// Venta a crédito, abonos y saldo a favor en la caja (retail 2, entrega 2; 0208–0210). Todo se
// decide en la base: aquí solo se lee lo que la caja enseña y se llaman sus RPC.

export type CreditoCliente = {
  activo: boolean;
  limite: number;
  plazoDias: number;
  /** Lo que debe, contando las ventas de otras cajas (0210). */
  deuda: number;
  /** Lo que le queda del límite; ya descuenta la deuda de otras cajas. */
  disponible: number;
  tieneVencido: boolean;
  /** La parte de `deuda` que se vendió en otra caja: aquí no se puede abonar. */
  deudaOtrasCajas: number;
};

type FilaCredito = {
  cliente_id: string; activo: boolean | null; limite_mxn: number | string | null; plazo_dias: number | null;
  deuda_mxn: number | string | null; disponible_mxn: number | string | null; tiene_vencido: boolean | null;
  deuda_otras_cajas_mxn: number | string | null;
};
const COLUMNAS_CREDITO = "cliente_id, activo, limite_mxn, plazo_dias, deuda_mxn, disponible_mxn, tiene_vencido, deuda_otras_cajas_mxn";

function aCredito(f: FilaCredito): CreditoCliente {
  return {
    activo: f.activo === true,
    limite: Number(f.limite_mxn ?? 0),
    plazoDias: Number(f.plazo_dias ?? 0),
    deuda: Number(f.deuda_mxn ?? 0),
    disponible: Number(f.disponible_mxn ?? 0),
    tieneVencido: f.tiene_vencido === true,
    deudaOtrasCajas: Number(f.deuda_otras_cajas_mxn ?? 0),
  };
}

/** Lo que el cobro necesita saber del cliente de la cuenta: su crédito (o null) y su saldo a favor. */
export type CuentaCredito = { clienteId: string; credito: CreditoCliente | null; saldoFavor: number };

/** Lee el cliente del ticket y, si tiene, su crédito y su saldo a favor. null = la cuenta no tiene cliente. */
export async function leerCuentaCredito(token: string, ticketId: string): Promise<CuentaCredito | null> {
  const sb = employeeClient(token);
  const { data: t, error } = await sb.from("tickets").select("cliente_id").eq("id", ticketId).maybeSingle();
  if (error) throw new Error(error.message);
  const clienteId = (t as { cliente_id: string | null } | null)?.cliente_id ?? null;
  if (!clienteId) return null;
  const [cr, sf] = await Promise.all([
    sb.from("vw_creditos_cliente").select(COLUMNAS_CREDITO).eq("cliente_id", clienteId).maybeSingle(),
    sb.from("vw_saldo_favor_cliente").select("saldo_mxn").eq("cliente_id", clienteId).maybeSingle(),
  ]);
  if (cr.error) throw new Error(cr.error.message);
  if (sf.error) throw new Error(sf.error.message);
  return {
    clienteId,
    credito: cr.data ? aCredito(cr.data as FilaCredito) : null,
    saldoFavor: Number((sf.data as { saldo_mxn: number | string | null } | null)?.saldo_mxn ?? 0),
  };
}

/**
 * Qué formas de pago nuevas enseña el cobro. «A crédito» va con el módulo encendido, un cliente con
 * crédito activo y la venta sin pagos (a crédito va completa). «Saldo a favor» va con saldo, y cubre
 * hasta lo que falta: el resto se cobra con otra forma de pago.
 */
export function opcionesCredito(e: {
  moduloCredito: boolean;
  cuenta: CuentaCredito | null;
  pendiente: number;
  montoPagado: number;
}): { aCredito: CreditoCliente | null; saldoFavor: number } {
  if (!e.moduloCredito || !e.cuenta || !(e.pendiente > 0)) return { aCredito: null, saldoFavor: 0 };
  const cr = e.cuenta.credito;
  return {
    aCredito: cr?.activo && e.montoPagado <= 0 ? cr : null,
    saldoFavor: redondearCentavos(Math.max(0, Math.min(e.cuenta.saldoFavor, e.pendiente))),
  };
}

/** La base pide el PIN de `venta.credito_excedido` (límite rebasado o pagos vencidos). */
export const pideAutorizacionCredito = (mensaje: string) => /pide autorizaci[oó]n/i.test(mensaje);

/** Quita el «DATOS_INVALIDOS: » de un rechazo de la base: lo de después es para el cajero. */
export const motivoDeLaBase = (mensaje: string) => mensaje.replace(/^DATOS_INVALIDOS:\s*/, "");

/** Cobra la venta completa a crédito. Con `autorizacionPinId` null, la base puede pedir el PIN. */
export async function pagarACredito(token: string, ticketId: string, autorizacionPinId: string | null, clientId: string): Promise<void> {
  const { error } = await employeeClient(token).rpc("pagar_a_credito", {
    p_ticket_id: ticketId,
    p_autorizacion_pin_id: autorizacionPinId,
    p_client_id_local: clientId,
  });
  if (error) throw new Error(motivoDeLaBase(error.message));
}

/** Paga parte o toda la venta con el saldo a favor del cliente asignado. */
export async function pagarConSaldoFavor(token: string, ticketId: string, monto: number, clientId: string): Promise<void> {
  const { error } = await employeeClient(token).rpc("pagar_con_saldo_favor", {
    p_ticket_id: ticketId,
    p_monto: monto,
    p_client_id_local: clientId,
  });
  if (error) throw new Error(motivoDeLaBase(error.message));
}

// ─── Créditos: quién debe y abonos ───────────────────────────────────────────

export type Deudor = CreditoCliente & { clienteId: string; nombre: string; telefono: string | null };

/** Los clientes que deben algo, con nombre y teléfono, el que más debe primero. */
export async function listarDeudores(token: string): Promise<Deudor[]> {
  const sb = employeeClient(token);
  const { data, error } = await sb.from("vw_creditos_cliente").select(COLUMNAS_CREDITO).gt("deuda_mxn", 0);
  if (error) throw new Error(error.message);
  const filas = (data ?? []) as FilaCredito[];
  if (filas.length === 0) return [];
  const { data: cl, error: e2 } = await sb
    .from("clientes")
    .select("id, nombre, apellido_paterno, telefono")
    .in("id", filas.map((f) => f.cliente_id));
  if (e2) throw new Error(e2.message);
  const porId = new Map(((cl ?? []) as { id: string; nombre: string; apellido_paterno: string | null; telefono: string | null }[])
    .map((c) => [c.id, c]));
  return filas
    .map((f) => {
      const c = porId.get(f.cliente_id);
      return {
        ...aCredito(f),
        clienteId: f.cliente_id,
        nombre: c ? [c.nombre, c.apellido_paterno].filter(Boolean).join(" ").trim() : "Cliente",
        telefono: c?.telefono ?? null,
      };
    })
    .sort((a, b) => b.deuda - a.deuda);
}

/** Busca por nombre (sin acentos ni mayúsculas) o por los dígitos del teléfono. */
export function filtrarDeudores(lista: Deudor[], texto: string): Deudor[] {
  const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = plano(texto.trim());
  if (!q) return lista;
  const digitos = q.replace(/\D/g, "");
  return lista.filter((d) => plano(d.nombre).includes(q) || (digitos.length >= 3 && (d.telefono ?? "").replace(/\D/g, "").includes(digitos)));
}

export type VentaConSaldo = { ticketId: string; folio: string | null; fecha: string; saldo: number; fechaLimite: string; vencida: boolean };

/** Día de México (YYYY-MM-DD) de un instante. México no tiene horario de verano. */
function diaMexico(iso: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(typeof iso === "string" ? new Date(iso) : iso);
}

/** Fecha límite de una venta a crédito: el día (en México) de la venta más el plazo. YYYY-MM-DD. */
export function fechaLimiteCredito(fechaVentaIso: string, plazoDias: number): string {
  const [a, m, d] = diaMexico(fechaVentaIso).split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d + plazoDias)).toISOString().slice(0, 10);
}

/**
 * Lo que se debe de cada venta: su pago CREDITO menos sus abonos y ajustes (como `credito_saldo_ticket`).
 * Solo las que deben algo, de la más vieja a la más nueva (el orden en que se reparte un abono).
 */
export function ventasConSaldo(
  pagos: { ticketId: string; folio: string | null; fecha: string; monto: number }[],
  abonos: { ticketId: string; monto: number }[],
  plazoDias: number,
  hoy: Date = new Date(),
): VentaConSaldo[] {
  const abonado = new Map<string, number>();
  for (const a of abonos) abonado.set(a.ticketId, (abonado.get(a.ticketId) ?? 0) + a.monto);
  const credito = new Map<string, { folio: string | null; fecha: string; monto: number }>();
  for (const p of pagos) {
    const v = credito.get(p.ticketId);
    credito.set(p.ticketId, v ? { ...v, monto: v.monto + p.monto } : { folio: p.folio, fecha: p.fecha, monto: p.monto });
  }
  const dia = diaMexico(hoy);
  return [...credito.entries()]
    .map(([ticketId, v]) => {
      const fechaLimite = fechaLimiteCredito(v.fecha, plazoDias);
      return { ticketId, folio: v.folio, fecha: v.fecha, saldo: redondearCentavos(v.monto - (abonado.get(ticketId) ?? 0)), fechaLimite, vencida: fechaLimite < dia };
    })
    .filter((v) => v.saldo > 0)
    .sort((x, y) => x.fecha.localeCompare(y.fecha) || x.ticketId.localeCompare(y.ticketId));
}

/**
 * Las ventas a crédito con saldo que `registrar_abono` ve aquí: las mismas a las que reparte un abono
 * (todas las del cliente en esta base). En la caja instalada son las de su base local; las de otras
 * cajas van en `deudaOtrasCajas`. En el POS web (la nube) son las de todas las cajas del negocio.
 */
export async function leerVentasConSaldo(token: string, clienteId: string, plazoDias: number): Promise<VentaConSaldo[]> {
  const sb = employeeClient(token);
  const [p, a] = await Promise.all([
    sb.from("pagos")
      .select("ticket_id, monto_mxn, ticket:tickets!inner(folio_completo, fecha_pago, created_at, cliente_id)")
      .eq("metodo_pago", "CREDITO").eq("estado", "APLICADO").is("deleted_at", null)
      .eq("ticket.cliente_id", clienteId),
    sb.from("abonos_credito").select("ticket_id, monto_mxn").eq("cliente_id", clienteId).eq("estado", "APLICADO"),
  ]);
  if (p.error) throw new Error(p.error.message);
  if (a.error) throw new Error(a.error.message);
  type FilaPago = { ticket_id: string; monto_mxn: number | string; ticket: { folio_completo: string | null; fecha_pago: string | null; created_at: string } | null };
  const pagos = ((p.data ?? []) as unknown as FilaPago[]).map((f) => ({
    ticketId: f.ticket_id,
    folio: f.ticket?.folio_completo ?? null,
    fecha: f.ticket?.fecha_pago ?? f.ticket?.created_at ?? new Date().toISOString(),
    monto: Number(f.monto_mxn),
  }));
  const abonos = ((a.data ?? []) as { ticket_id: string; monto_mxn: number | string }[]).map((f) => ({ ticketId: f.ticket_id, monto: Number(f.monto_mxn) }));
  return ventasConSaldo(pagos, abonos, plazoDias);
}

export type MetodoAbono = "EFECTIVO" | "TARJETA_DEBITO" | "TARJETA_CREDITO" | "TRANSFERENCIA";

/** Registra un abono en el turno abierto de esta caja; la base lo reparte de la venta más vieja a la más nueva. */
export async function registrarAbono(
  token: string,
  a: { clienteId: string; monto: number; metodo: MetodoAbono; cajaId: string; turnoId: string; clientId: string },
): Promise<{ abonado: number; deudaRestante: number }> {
  const { data, error } = await employeeClient(token).rpc("registrar_abono", {
    p_cliente_id: a.clienteId,
    p_monto: a.monto,
    p_metodo: a.metodo,
    p_caja_id: a.cajaId,
    p_turno_id: a.turnoId,
    p_client_id_local: a.clientId,
  });
  if (error) throw new Error(motivoDeLaBase(error.message));
  const r = (data ?? {}) as { abonado?: number | string; deuda_restante?: number | string };
  return { abonado: Number(r.abonado ?? 0), deudaRestante: Number(r.deuda_restante ?? 0) };
}

/** El aviso al terminar un abono. `restante` es lo de esta caja; `otrasCajas`, lo que se debe en otras. */
export function avisoAbono(abonado: number, restante: number, otrasCajas = 0): string {
  const queda = redondearCentavos(restante + otrasCajas);
  return queda > 0
    ? `Abono de ${fmtMxn(abonado)} registrado. Queda por pagar ${fmtMxn(queda)}.`
    : `Abono de ${fmtMxn(abonado)} registrado. Ya no debe nada.`;
}
