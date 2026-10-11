"use client";
import { encabezadosFuncion, urlFuncion } from "./supabase";
import type { MetodoPago } from "./cobro";

// Cobro con terminal (ADR 0033). La caja le manda el monto a la terminal de Mercado Pago a través de
// la nube (`terminal-cobro`) y pregunta en qué va. El pago lo aplica la caja a su ticket, como
// cualquier otro; aquí no se toca el ticket.

export type EstadoCobro = "EN_TERMINAL" | "APROBADO" | "RECHAZADO" | "CANCELADO" | "VENCIDO" | "REVISAR" | "DEVUELTO";

export type CobroTerminal = {
  id: string; ticket_id: string; monto_mxn: number; estado: EstadoCobro; detalle: string | null;
  tipo_tarjeta: string | null; marca: string | null; referencia: string | null; aplicado_at: string | null;
};

type Peticion =
  | { accion: "disponible" | "pendientes" }
  | { accion: "crear"; cobro_id: string; ticket_id: string; folio: string | null; monto: string }
  | { accion: "estado" | "cancelar"; cobro_id: string }
  | { accion: "confirmar"; cobro_id: string; autorizo_id?: string };

type Respuesta = {
  ok?: boolean; error?: string; terminal?: boolean; cobro?: CobroTerminal; cobros?: CobroTerminal[];
  cancelacion?: "HECHA" | "PEDIDA" | "FALLO";
};

/**
 * Llama a `terminal-cobro`. `cajaId` solo lo usa el POS web: una caja instalada va como su
 * dispositivo y la nube saca la caja de ahí. Un fallo lanza Error con el CÓDIGO como mensaje.
 */
export async function pedirCobro(token: string, cajaId: string, p: Peticion): Promise<Respuesta> {
  let r: Response;
  try {
    r = await fetch(urlFuncion("terminal-cobro"), {
      method: "POST", headers: encabezadosFuncion(token), body: JSON.stringify({ ...p, caja_id: cajaId }),
    });
  } catch {
    throw new Error("SIN_RED");
  }
  const j = (await r.json().catch(() => ({}))) as Respuesta;
  if (!r.ok) throw new Error(j.error ?? `HTTP_${r.status}`);
  return j;
}

/** ¿Esta caja tiene terminal? Cualquier fallo (sin internet, sin nube) es «no»: queda el registro manual. */
export async function cajaTieneTerminal(token: string, cajaId: string): Promise<boolean> {
  return pedirCobro(token, cajaId, { accion: "disponible" }).then((r) => r.terminal === true).catch(() => false);
}

/** Mercado Pago dice qué tarjeta fue; lo que no sea débito se registra como crédito. */
export function metodoDeTarjeta(tipo: string | null): MetodoPago {
  return tipo === "debit_card" ? "TARJETA_DEBITO" : "TARJETA_CREDITO";
}

/** El monto como texto con dos decimales: nunca viaja un float. */
export const montoTexto = (monto: number): string => (Math.round(monto * 100) / 100).toFixed(2);

const RECHAZOS: Record<string, string> = {
  insufficient_amount: "La tarjeta no tiene fondos suficientes.",
  card_disabled: "La tarjeta está bloqueada o desactivada.",
  rejected_by_issuer: "El banco rechazó el cobro.",
  required_call_for_authorize: "El banco pide que el cliente llame para autorizar el cobro.",
  max_attempts_exceeded: "Se agotaron los intentos con esa tarjeta.",
  high_risk: "Mercado Pago rechazó el cobro por seguridad.",
  amount_limit_exceeded: "El monto supera el límite de la tarjeta.",
  bad_filled_card_data: "La terminal no pudo leer la tarjeta.",
};

/** Lo que se le dice a la cajera cuando el cobro terminó sin pagarse. */
export function mensajeFinal(c: Pick<CobroTerminal, "estado" | "detalle">): string {
  if (c.estado === "RECHAZADO") return RECHAZOS[c.detalle ?? ""] ?? "La terminal rechazó el cobro.";
  if (c.estado === "VENCIDO") return "Se acabó el tiempo para pagar en la terminal.";
  if (c.estado === "CANCELADO") return "El cobro se canceló.";
  return "El cobro no se completó.";
}

const ERRORES: Record<string, string> = {
  SIN_RED: "No hay internet. Cobra tecleando el monto en la terminal y registra el pago con «La cobré en otra terminal».",
  FUNCION_REQUIERE_NUBE: "No hay internet. Cobra tecleando el monto en la terminal y registra el pago con «La cobré en otra terminal».",
  TERMINAL_OCUPADA: "La terminal tiene otro cobro esperando. Termínalo o cancélalo en la terminal y vuelve a intentar.",
  SIN_TERMINAL: "Esta caja ya no tiene una terminal ligada. Revísalo en el panel, en Terminal de tarjetas.",
  CONEXION_INVALIDA: "Mercado Pago ya no reconoce la conexión. El dueño tiene que volver a conectarla en el panel.",
  TERMINAL_AJENA: "La terminal ya no pertenece a la cuenta conectada. Revísalo en el panel.",
};

export function mensajeErrorCobro(e: unknown): string {
  const codigo = e instanceof Error ? e.message : String(e);
  return ERRORES[codigo] ?? "No se pudo mandar el cobro a la terminal. Vuelve a intentar.";
}
