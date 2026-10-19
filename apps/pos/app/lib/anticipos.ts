"use client";
import { employeeClient } from "./supabase";
import { motivoDeLaBase } from "./credito";
import { redondearCentavos } from "./dinero";

// Anticipos de cita en la caja de belleza (0222). La base decide todo: aquí se leen, se llaman sus RPC
// y se arma la sugerencia de devolver o retener.

// PAGO_EN_LINEA (0225): lo pagó la clienta al reservar en línea; la caja no lo recibe, solo lo aplica,
// lo devuelve (por Mercado Pago, sin cajón ni referencia) o lo retiene.
export type MetodoAnticipo = "EFECTIVO" | "TARJETA_DEBITO" | "TARJETA_CREDITO" | "TRANSFERENCIA" | "PAGO_EN_LINEA";
export const METODOS_ANTICIPO: MetodoAnticipo[] = ["EFECTIVO", "TARJETA_DEBITO", "TARJETA_CREDITO", "TRANSFERENCIA"];
/** Devolverlo pide la referencia de la terminal o del banco: el efectivo sale del cajón y el de línea lo devuelve Mercado Pago. */
export const pideReferencia = (m: MetodoAnticipo): boolean => m !== "EFECTIVO" && m !== "PAGO_EN_LINEA";

export type EstadoAnticipo = "VIGENTE" | "APLICADO" | "DEVUELTO" | "RETENIDO";
export type Anticipo = { id: string; monto: number; metodo: MetodoAnticipo; estado: EstadoAnticipo; ticketId: string | null };

export type CobroModo = "AL_FINAL" | "ANTICIPO" | "TODO";
export type ConfigCobroAgenda = { modo: CobroModo; cancelarHoras: number };

type FilaAnticipo = { id: string; monto_mxn: number | string; metodo_pago: string; estado: string; ticket_id: string | null };
const aAnticipo = (f: FilaAnticipo): Anticipo => ({
  id: f.id, monto: Number(f.monto_mxn), metodo: f.metodo_pago as MetodoAnticipo, estado: f.estado as EstadoAnticipo, ticketId: f.ticket_id,
});

/** Suma los montos (en centavos exactos). */
export const sumaAnticipos = (a: Anticipo[]): number => redondearCentavos(a.reduce((s, x) => s + x.monto, 0));
export const vigentes = (a: Anticipo[]): Anticipo[] => a.filter((x) => x.estado === "VIGENTE");

/** Los anticipos de una cita, del más viejo al más nuevo. */
export async function leerAnticipos(token: string, citaId: string): Promise<Anticipo[]> {
  const { data, error } = await employeeClient(token)
    .from("anticipos_cita").select("id, monto_mxn, metodo_pago, estado, ticket_id")
    .eq("cita_id", citaId).order("created_at").order("id");
  if (error) throw new Error(error.message);
  return ((data ?? []) as FilaAnticipo[]).map(aAnticipo);
}

/** Cómo cobra el negocio sus citas y hasta cuántas horas antes se cancela con devolución. */
export async function configCobroAgenda(token: string): Promise<ConfigCobroAgenda> {
  const { data } = await employeeClient(token).from("configuracion_tenant").select("agenda_cobro_modo, agenda_cancelar_horas").maybeSingle();
  return { modo: (data?.agenda_cobro_modo as CobroModo | undefined) ?? "AL_FINAL", cancelarHoras: data?.agenda_cancelar_horas ?? 24 };
}

export async function anticipoSugerido(token: string, citaId: string): Promise<number> {
  const { data, error } = await employeeClient(token).rpc("anticipo_sugerido", { p_cita: citaId });
  if (error) throw new Error(motivoDeLaBase(error.message));
  return Number(data ?? 0);
}

export async function registrarAnticipo(
  token: string,
  a: { citaId: string; monto: number; metodo: MetodoAnticipo; cajaId: string; turnoId: string; clientId: string },
): Promise<void> {
  const { error } = await employeeClient(token).rpc("registrar_anticipo", {
    p_cita: a.citaId, p_monto: a.monto, p_metodo: a.metodo, p_caja_id: a.cajaId, p_turno_id: a.turnoId, p_client_id_local: a.clientId,
  });
  if (error) throw new Error(motivoDeLaBase(error.message));
}

/** Sin el permiso `venta.devolucion` la base pide el PIN (`pideAutorizacionAnticipo`), con cualquier método. */
export async function devolverAnticipo(
  token: string,
  a: { anticipoId: string; cajaId: string; turnoId: string; referencia: string | null; autorizacionPinId: string | null },
): Promise<void> {
  const { error } = await employeeClient(token).rpc("devolver_anticipo", {
    p_anticipo: a.anticipoId, p_caja_id: a.cajaId, p_turno_id: a.turnoId,
    p_referencia: a.referencia ?? undefined, p_autorizacion_pin_id: a.autorizacionPinId ?? undefined,
  });
  if (error) throw new Error(motivoDeLaBase(error.message));
}

/** Igual que devolver: sin `venta.devolucion`, la base pide el PIN; el turno es el abierto de esta caja. */
export async function retenerAnticipo(
  token: string,
  a: { anticipoId: string; cajaId: string; turnoId: string; autorizacionPinId: string | null },
): Promise<void> {
  const { error } = await employeeClient(token).rpc("retener_anticipo", {
    p_anticipo: a.anticipoId, p_caja_id: a.cajaId, p_turno_id: a.turnoId, p_autorizacion_pin_id: a.autorizacionPinId ?? undefined,
  });
  if (error) throw new Error(motivoDeLaBase(error.message));
}

/** La base pidió el PIN de `venta.devolucion` para devolver o retener. */
export const pideAutorizacionAnticipo = (mensaje: string) => /requiere autorizaci[oó]n/i.test(mensaje);

// ── Cobro de la venta de una cita ────────────────────────────────────────────

/** La cita de una venta y sus anticipos: lo que aún se puede usar y lo que ya pagó esta venta. */
export type AnticipoVenta = { citaId: string; vigente: number; aplicado: number };

/** null = la venta no es de una cita o la cita no tiene anticipos. */
export async function leerAnticipoVenta(token: string, ticketId: string): Promise<AnticipoVenta | null> {
  const sb = employeeClient(token);
  // ponytail: una venta carga una sola cita (carrito.citaId); si algún día lleva varias, recorrerlas.
  const { data: c, error } = await sb.from("citas").select("id").eq("ticket_id", ticketId).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!c) return null;
  const lista = await leerAnticipos(token, c.id);
  if (lista.length === 0) return null;
  return {
    citaId: c.id,
    vigente: sumaAnticipos(vigentes(lista)),
    aplicado: sumaAnticipos(lista.filter((x) => x.estado === "APLICADO" && x.ticketId === ticketId)),
  };
}

/**
 * El cobro de belleza no ofrece formas de pago hasta saber si la cita dejó anticipo: si la lectura
 * falla, falla cerrado (error y «Reintentar»), nunca cobra el total completo.
 */
export const cobroEsperaAnticipo = (conCitas: boolean, anticipoLeido: boolean): boolean => conCitas && !anticipoLeido;

/** Lo que el cobro aplica con anticipo: lo vigente, hasta lo que falta. 0 = no hay «Anticipo». */
export function anticipoPorAplicar(a: AnticipoVenta | null, pendiente: number): number {
  if (!a || !(a.vigente > 0) || !(pendiente > 0)) return 0;
  return redondearCentavos(Math.min(a.vigente, pendiente));
}

/**
 * Lo que enseña el cobro antes de aplicar nada. `pendiente` = lo que falta de la venta (con propina).
 * `anticipo`: lo ya aplicado a esta venta más lo que se aplicará; `porCobrar`: lo que se cobra con
 * otra forma de pago (0 = el anticipo cubre todo).
 */
export function resumenAnticipoCobro(a: AnticipoVenta | null, pendiente: number): { porAplicar: number; anticipo: number; porCobrar: number } {
  const porAplicar = anticipoPorAplicar(a, pendiente);
  return {
    porAplicar,
    anticipo: redondearCentavos((a?.aplicado ?? 0) + porAplicar),
    porCobrar: redondearCentavos(Math.max(0, pendiente) - porAplicar),
  };
}

/** Aplica los anticipos vigentes de la cita a su venta (como pago ANTICIPO). Devuelve lo aplicado. */
export async function pagarConAnticipo(token: string, ticketId: string, citaId: string, clientId: string): Promise<number> {
  const { data, error } = await employeeClient(token).rpc("pagar_con_anticipo", { p_ticket_id: ticketId, p_cita_id: citaId, p_client_id_local: clientId });
  if (error) throw new Error(motivoDeLaBase(error.message));
  return Number(data ?? 0);
}

// ── Cancelar o «No llegó» ────────────────────────────────────────────────────

/** Quién deja la cita: el salón la cancela, la clienta la cancela o no llegó. */
export type CausaCancelacion = "SALON" | "CLIENTA" | "NO_LLEGO";
export type DecisionAnticipo = "DEVOLVER" | "RETENER";

/**
 * La opción sugerida (el cajero decide): si cancela el salón, o la clienta con más de
 * `agenda_cancelar_horas` de anticipación, se devuelve; si no llegó o canceló tarde, se retiene.
 * Una cita sin hora (en espera) que cancela la clienta se devuelve: no hubo lugar apartado.
 */
export function decisionSugerida(causa: CausaCancelacion, inicia: Date | null, ahora: Date, cancelarHoras: number): DecisionAnticipo {
  if (causa === "SALON") return "DEVOLVER";
  if (causa === "NO_LLEGO") return "RETENER";
  if (!inicia) return "DEVOLVER";
  return inicia.getTime() - ahora.getTime() > cancelarHoras * 3_600_000 ? "DEVOLVER" : "RETENER";
}

/** La base solo retiene el anticipo de una cita cancelada o que no llegó; el sobrante de una cobrada, solo se devuelve. */
export const permiteRetener = (estado: string): boolean => estado === "CANCELADA" || estado === "NO_LLEGO";

/**
 * La sugerida del aviso «pendiente» (la cita ya se cerró): no llegó → Retener; sobrante de una cobrada →
 * Devolver; cancelada → la regla del límite con la hora en que se canceló (quién canceló no se guarda:
 * se toma como la clienta). Sin esa hora, sin sugerencia.
 */
export function sugerenciaPendiente(c: { estado: string; inicia: Date | null; canceladaAt?: Date | null }, cancelarHoras: number): DecisionAnticipo | null {
  if (c.estado === "NO_LLEGO") return "RETENER";
  if (c.estado === "CANCELADA") return c.canceladaAt ? decisionSugerida("CLIENTA", c.inicia, c.canceladaAt, cancelarHoras) : null;
  return "DEVOLVER";
}

/** Textos de la caja (los dice el brief; las pruebas los fijan). */
export const TEXTO_ANTICIPO = {
  cobrar: "Cobrar anticipo",
  pagado: (monto: string) => `Anticipo pagado ${monto}`,
  pregunta: (monto: string) => `¿Qué hacemos con el anticipo de ${monto}?`,
  devolver: "Devolver",
  retener: "Retener",
  pendiente: "Anticipo pendiente de devolver o retener",
  sinUsar: (monto: string) => `Anticipo sin usar ${monto}`,
  /** Marca de la tarjeta en el calendario y título del grupo en «Citas de hoy». */
  marcaPendiente: "Anticipo pendiente",
  grupoPendientes: "Anticipos pendientes",
  lineaCobro: "Anticipo",
  porCobrar: "Por cobrar",
} as const;
