"use client";
import { encabezadosFuncion, urlFuncion } from "./supabase";
import type { MetodoPago } from "./cobro";

// Cobro con terminal (ADR 0033). La caja le manda el monto a la terminal (Mercado Pago o Clip) a través de
// la nube (`terminal-cobro`) y pregunta en qué va. El pago lo aplica la caja a su ticket, como
// cualquier otro; aquí no se toca el ticket.

export type EstadoCobro = "EN_TERMINAL" | "APROBADO" | "RECHAZADO" | "CANCELADO" | "VENCIDO" | "REVISAR" | "DEVUELTO";

export type CobroTerminal = {
  id: string; ticket_id: string; monto_mxn: number; estado: EstadoCobro; detalle: string | null;
  tipo_tarjeta: string | null; marca: string | null; referencia: string | null; aplicado_at: string | null;
  tarjeta_ultimos4?: string | null;
  /** La propina que el cliente eligió en el lector (Clip), aparte de `monto_mxn`. */
  propina_mxn?: number | string | null;
};

export type ProveedorTerminal = "MERCADO_PAGO" | "CLIP";
/**
 * `lista`: el lector puede recibir el cobro ahora (Clip lo pregunta; Mercado Pago siempre lo está).
 * `propina_en_lector`: el lector de Clip le pregunta la propina al cliente (Mercado Pago, nunca).
 */
export type TerminalCaja = { hay: boolean; lista: boolean; proveedor: ProveedorTerminal | null; propina_en_lector: boolean };

type Peticion =
  | { accion: "disponible" | "pendientes" }
  | { accion: "crear"; cobro_id: string; ticket_id: string; folio: string | null; monto: string; propina_en_lector?: boolean }
  | { accion: "estado" | "cancelar"; cobro_id: string }
  | { accion: "confirmar"; cobro_id: string; autorizo_id?: string }
  | { accion: "reembolsar"; ticket_id: string };

type Respuesta = {
  ok?: boolean; error?: string; terminal?: boolean; lista?: boolean; proveedor?: unknown; propina_en_lector?: boolean;
  cobro?: CobroTerminal; cobros?: CobroTerminal[];
  cancelacion?: "HECHA" | "PEDIDA" | "FALLO";
  /** De `reembolsar`: cuántos pagos de ese ticket pasaron por la terminal y cuánto regresó. */
  n_cobros?: number; devuelto_mxn?: string;
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

/** ¿Esta caja tiene terminal, y está lista? Cualquier fallo (sin internet, sin nube) es «no»: queda el registro manual. */
export async function terminalDeCaja(token: string, cajaId: string): Promise<TerminalCaja> {
  return pedirCobro(token, cajaId, { accion: "disponible" })
    .then((r): TerminalCaja => ({
      hay: r.terminal === true, lista: r.lista !== false,
      proveedor: r.proveedor === "CLIP" || r.proveedor === "MERCADO_PAGO" ? r.proveedor : null,
      propina_en_lector: r.terminal === true && r.proveedor === "CLIP" && r.propina_en_lector === true,
    }))
    .catch(() => ({ hay: false, lista: false, proveedor: null, propina_en_lector: false }));
}

const MARCAS: Record<string, string> = {
  visa: "Visa", debvisa: "Visa", master: "Mastercard", debmaster: "Mastercard", amex: "American Express", carnet: "Carnet",
};

/**
 * «Mastercard **** 1447»: lo que se imprime en el ticket. Con asteriscos porque la impresora no
 * tiene el punto medio. null si la terminal no dijo la terminación (cobro aceptado a mano).
 */
export function etiquetaTarjeta(c: Pick<CobroTerminal, "marca" | "tarjeta_ultimos4">): string | null {
  if (!c.tarjeta_ultimos4) return null;
  // Débito llega como «debvisa» (Mercado Pago) o «deb_visa» (Clip): se quita el prefijo.
  return `${MARCAS[(c.marca ?? "").replace(/^deb_?/, "")] ?? "Tarjeta"} **** ${c.tarjeta_ultimos4}`;
}

const centavos = (v: unknown): number => Math.round(Number(v ?? 0) * 100) || 0;

/** La propina que el cliente eligió en el lector (0 si no hubo), a dos decimales. */
export function propinaDeCobro(c: Pick<CobroTerminal, "propina_mxn">): number {
  return Math.max(centavos(c.propina_mxn), 0) / 100;
}

/**
 * Cómo entra al ticket un cobro de terminal: la tarjeta en `referencia` y la autorización del
 * banco en `terminal_aprobacion`, que es para lo que nacieron esas dos columnas de `pagos` (0008).
 * `propina`: la del lector, que el pago trae además del monto (ya fijada en el ticket); se suma en
 * centavos.
 */
export function pagoDeCobro(c: CobroTerminal, propina = 0): { metodo: MetodoPago; monto: number; referencia?: string; terminalAprobacion?: string } {
  return {
    metodo: metodoDeTarjeta(c.tipo_tarjeta), monto: (centavos(c.monto_mxn) + centavos(propina)) / 100,
    referencia: etiquetaTarjeta(c) ?? undefined, terminalAprobacion: c.referencia ?? undefined,
  };
}

/** La terminal dice qué tarjeta fue; lo que no sea débito se registra como crédito. */
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
  high_risk: "El cobro se rechazó por seguridad.",
  amount_limit_exceeded: "El monto supera el límite de la tarjeta.",
  bad_filled_card_data: "La terminal no pudo leer la tarjeta.",
  SIN_RESPUESTA: "La terminal no contestó. Vuelve a intentar.",
  // Clip (vistos con el lector, 21 oct 2026).
  "CD-PROCESS-AS-CHIP": "Esa tarjeta pide chip: que el cliente la inserte en la terminal.",
  "TX-CANCELLED-BY-PAUSE": "La app de la terminal se cerró a medio cobro. Déjala abierta y vuelve a intentar.",
};

/** Lo que se le dice a la cajera cuando el cobro terminó sin pagarse. */
export function mensajeFinal(c: Pick<CobroTerminal, "estado" | "detalle">): string {
  if (c.estado === "RECHAZADO") return RECHAZOS[c.detalle ?? ""] ?? "La terminal rechazó el cobro.";
  if (c.estado === "VENCIDO") return "Se acabó el tiempo para pagar en la terminal.";
  if (c.estado === "CANCELADO") return "El cobro se canceló.";
  return "El cobro no se completó.";
}

/**
 * Devuelve a la tarjeta lo que ese ticket se cobró en la terminal. `cobros: 0` = nada pasó por la
 * terminal (se cobró en otra, o a mano): el reembolso se hace como siempre, fuera de VIM.
 * Lanza Error con el código si el proveedor de la terminal no devolvió el dinero.
 */
export async function reembolsarTicket(token: string, cajaId: string, ticketId: string): Promise<{ cobros: number; devuelto: number }> {
  const r = await pedirCobro(token, cajaId, { accion: "reembolsar", ticket_id: ticketId });
  return { cobros: r.n_cobros ?? 0, devuelto: Number(r.devuelto_mxn ?? 0) };
}

const REEMBOLSOS: Record<string, string> = {
  SIN_RED: "no hay internet",
  FUNCION_REQUIERE_NUBE: "no hay internet",
  CONEXION_INVALIDA: "la conexión de la terminal ya no es válida",
  refund_amount_exceeds: "ese cobro ya se había devuelto",
  SIN_DEVOLUCION: "la devolución no quedó registrada en la caja",
};

/** Por qué no regresó el dinero a la tarjeta, para completar «…no regresó a la tarjeta: ___». */
export function motivoReembolso(e: unknown): string {
  const codigo = e instanceof Error ? e.message : String(e);
  return REEMBOLSOS[codigo] ?? "el proveedor de la terminal no aceptó la devolución";
}

const ERRORES: Record<string, string> = {
  SIN_RED: "No hay internet. Cobra tecleando el monto en la terminal y registra el pago con «La cobré en otra terminal».",
  FUNCION_REQUIERE_NUBE: "No hay internet. Cobra tecleando el monto en la terminal y registra el pago con «La cobré en otra terminal».",
  TERMINAL_OCUPADA: "La terminal tiene otro cobro esperando. Termínalo o cancélalo en la terminal y vuelve a intentar.",
  SIN_TERMINAL: "Esta caja ya no tiene una terminal ligada. Revísalo en el panel, en Terminal de tarjetas.",
  CONEXION_INVALIDA: "La conexión de la terminal ya no es válida. El dueño tiene que volver a conectarla en el panel.",
  TERMINAL_AJENA: "La terminal ya no pertenece a la cuenta conectada. Revísalo en el panel.",
  TERMINAL_NO_DISPONIBLE: "La terminal no está lista. Revisa que esté encendida, con internet y con Clip PinPad abierta.",
  SIN_RESPUESTA: "La terminal no contestó. Vuelve a intentar.",
};

export function mensajeErrorCobro(e: unknown): string {
  const codigo = e instanceof Error ? e.message : String(e);
  return ERRORES[codigo] ?? "No se pudo mandar el cobro a la terminal. Vuelve a intentar.";
}
