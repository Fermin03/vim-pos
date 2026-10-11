// Checkout API de Mercado Pago (Payments API, `POST /v1/payments`) para el pago en línea de la
// tienda: la tarjeta se captura en la tienda (Secure Fields) y aquí solo llega su TOKEN.
// Fuente: docs/integraciones/mercado-pago-checkout-pro/03-resumen-checkout-api.md. Diseño: 02-diseno.md.
//
// Puro: arma el cobro y decide qué significa un pago. Lo que mueve el pedido es la base
// (tienda_pago_aplicar, 0172); aquí solo se lee lo que dice Mercado Pago y se descarta lo que no es
// nuestro. Se prueba con `node --test`.
//
// NADA DE ESTO ESTÁ PROBADO CONTRA MERCADO PAGO todavía (ver «Sin confirmar» en el diseño): los
// campos son los de la documentación.
//
// El token de la tarjeta es de un solo uso y no se escribe en ningún log.
//
// El cliente HTTP es propio y no el de _shared/terminal/mercado-pago.ts: aquel solo expone las
// llamadas de Point, y ese archivo lo está tocando el trabajo de la terminal. De allá se reutiliza
// lo que ya está verificado con avisos reales (`firmaValida`) y `montoTexto`.
import { montoTexto } from "../terminal/mercado-pago.ts";

const API = "https://api.mercadopago.com";

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {});
const txt = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
/** Un id de Mercado Pago llega como número o como texto: se guarda como texto de dígitos, o nada. */
const idDe = (v: unknown): string | null => {
  const s = typeof v === "number" && Number.isSafeInteger(v) ? String(v) : typeof v === "string" ? v.trim() : "";
  return /^\d{1,30}$/.test(s) ? s : null;
};

/** Lo que la tienda manda de la tarjeta: nunca el número, solo su token y de qué marca y banco es. */
export type Tarjeta = { token: string; payment_method_id: string; issuer_id: string | null; dispositivo: string | null };

export type DatosCobro = {
  /** El id de tienda_pagos: es la `external_reference`. */
  pagoId: string;
  /** Total + propina, como texto con dos decimales. Lo calculó la base, nunca el cliente. */
  monto: string;
  folio: string;
  negocio: string;
  /** La función que recibe los avisos, con la referencia en la query (https). */
  aviso: string;
  email: string;
  tarjeta: Tarjeta;
};

/**
 * El cuerpo de `POST /v1/payments`. Un solo pago, sin meses, y `binary_mode`: aprobado o rechazado
 * en la misma respuesta, nada «pendiente». Sin 3DS (es el valor por omisión). Sin `application_fee`:
 * VIM no cobra comisión y el dinero cae en la cuenta del restaurante (el token es el suyo).
 * Sin `statement_descriptor`: el estudio no dice que haga falta, y lo que sale en el estado de
 * cuenta ya es el nombre de la cuenta del restaurante.
 */
export function cuerpoDeCobro(d: DatosCobro): Record<string, unknown> {
  const monto = montoTexto(d.monto);
  if (!monto) throw new Error("cuerpoDeCobro: monto inválido");
  if (!d.aviso.startsWith("https://")) throw new Error("cuerpoDeCobro: el aviso va en https");
  return {
    // La API pide un número. Sale del texto con dos decimales en el último momento y no se opera con él.
    transaction_amount: Number(monto),
    token: d.tarjeta.token,
    payment_method_id: d.tarjeta.payment_method_id,
    ...(d.tarjeta.issuer_id && { issuer_id: d.tarjeta.issuer_id }),
    installments: 1,
    binary_mode: true,
    capture: true,
    description: `Pedido ${d.folio} en ${d.negocio}`.slice(0, 250),
    external_reference: d.pagoId,
    notification_url: d.aviso,
    payer: { email: d.email },
  };
}

/** Por qué no pasó un cobro, en familias: lo que la tienda le puede decir al cliente. */
export const MOTIVOS_DE_RECHAZO = ["FONDOS", "CODIGO", "FECHA", "NUMERO", "LLAMAR_BANCO", "TARJETA_DESHABILITADA", "VERIFICACION", "OTRO"] as const;
export type MotivoDeRechazo = (typeof MOTIVOS_DE_RECHAZO)[number];

const FAMILIAS: Record<string, MotivoDeRechazo> = {
  cc_rejected_insufficient_amount: "FONDOS",
  cc_amount_rate_limit_exceeded: "FONDOS",
  cc_rejected_bad_filled_security_code: "CODIGO",
  cc_rejected_bad_filled_date: "FECHA",
  cc_rejected_bad_filled_card_number: "NUMERO",
  cc_rejected_call_for_authorize: "LLAMAR_BANCO",
  cc_rejected_card_disabled: "TARJETA_DESHABILITADA",
  cc_rejected_3ds_mandatory: "VERIFICACION",
};
/**
 * La familia de un `status_detail` de rechazo. Todo lo que no se reconoce —riesgo, lista negra,
 * intentos, «otro motivo» del banco, un código nuevo— es OTRO: el cliente lee «tu banco no lo
 * aprobó», que siempre es verdad, y no un motivo inventado.
 */
export function motivoDeRechazo(detalle: string | null | undefined): MotivoDeRechazo {
  return (detalle && Object.hasOwn(FAMILIAS, detalle) ? FAMILIAS[detalle] : undefined) ?? "OTRO";
}

/**
 * Qué significa el estado HTTP con que Mercado Pago contestó al crear el cobro, antes de leer el pago:
 *   · CREADO      contestó con un pago (200/201): hay que leerlo (`decidirPago`);
 *   · SIN_PERMISO 401: el token del restaurante ya no sirve. No se cobró;
 *   · NO_ACEPTADO un 4xx de validación (token de tarjeta inválido o usado, datos que no cuadran):
 *                 Mercado Pago no creó ningún pago. No se cobró;
 *   · NO_SE_SABE  sin respuesta, 5xx, 409, 423, 429: pudo o no cobrarse. NUNCA se trata como rechazo.
 */
export function respuestaDeCobro(status: number): "CREADO" | "SIN_PERMISO" | "NO_ACEPTADO" | "NO_SE_SABE" {
  if (status === 200 || status === 201) return "CREADO";
  if (status === 401) return "SIN_PERMISO";
  if (status === 400 || status === 402 || status === 403 || status === 404 || status === 422) return "NO_ACEPTADO";
  return "NO_SE_SABE";
}

export type Esperado = {
  /** El id de tienda_pagos: la referencia que tiene que traer el pago. */
  pagoId: string;
  /** `terminal_conexiones.cuenta_id_externo`: el user_id de Mercado Pago del restaurante. */
  cuentaVendedora: string;
  /** La conexión es de la cuenta de prueba: se admiten pagos que no son `live_mode`. */
  dePrueba: boolean;
};

export type Decision =
  | { tipo: "APROBADO" | "RECHAZADO" | "DEVUELTO"; pagoIdExterno: string; monto: string;
      tipoTarjeta: string | null; marca: string | null; detalle: string | null }
  /** PENDIENTE: todavía no hay resultado. AJENO: no es nuestro, se ignora. INCIDENTE: es nuestro y no sabemos tratarlo; al log. */
  | { tipo: "PENDIENTE" | "AJENO" | "INCIDENTE"; motivo: string };

/**
 * Qué significa un pago de Mercado Pago (`GET /v1/payments/{id}`) para el pago que esperamos.
 * Antes de mirar su estado tiene que ser NUESTRO: la referencia es la del pago esperado y lo cobró
 * la cuenta del restaurante dueño del pedido. Un pago de prueba en una cuenta real no cuenta.
 * El monto se devuelve tal cual lo cobró Mercado Pago: que sea el esperado lo decide la base, en la
 * misma transacción que mueve el pedido (si no lo es, ese pago se devuelve).
 * Un estado que no conocemos nunca es «aprobado».
 */
export function decidirPago(e: Esperado, pago: unknown): Decision {
  const p = obj(pago);
  const pagoIdExterno = idDe(p.id);
  if (!pagoIdExterno) return { tipo: "AJENO", motivo: "sin id de pago" };
  if (p.external_reference !== e.pagoId) return { tipo: "AJENO", motivo: "otra referencia" };
  const cuenta = idDe(p.collector_id) ?? idDe(obj(p.collector).id);
  if (!cuenta || cuenta !== e.cuentaVendedora) return { tipo: "AJENO", motivo: "otra cuenta vendedora" };
  if (!e.dePrueba && p.live_mode !== true) return { tipo: "AJENO", motivo: "pago de prueba en una cuenta real" };

  const estado = String(p.status ?? ""), detalle = txt(p.status_detail);
  if (estado === "pending" || estado === "in_process" || estado === "authorized") return { tipo: "PENDIENTE", motivo: estado };
  if (estado === "charged_back" || estado === "in_mediation") return { tipo: "INCIDENTE", motivo: estado };

  const monto = montoTexto(p.transaction_amount);
  if (!monto) return { tipo: "INCIDENTE", motivo: "monto ilegible" };
  const datos = { pagoIdExterno, monto, tipoTarjeta: txt(p.payment_type_id), marca: txt(p.payment_method_id), detalle };
  if (estado === "rejected" || estado === "cancelled") return { tipo: "RECHAZADO", ...datos };
  if (estado === "refunded") return { tipo: "DEVUELTO", ...datos };
  if (estado !== "approved") return { tipo: "INCIDENTE", motivo: `estado desconocido: ${estado.slice(0, 30)}` };
  if (detalle !== "accredited") return { tipo: "INCIDENTE", motivo: `aprobado sin acreditar: ${(detalle ?? "").slice(0, 40)}` };
  if (p.currency_id !== "MXN") return { tipo: "INCIDENTE", motivo: "moneda distinta de MXN" };
  return { tipo: "APROBADO", ...datos };
}

/** Los pagos de `GET /v1/payments/search`. Cualquier otra forma, ninguno. */
export function pagosDeBusqueda(cuerpo: unknown): unknown[] {
  const r = obj(cuerpo).results;
  return Array.isArray(r) ? r : [];
}

/**
 * El id del pago del que habla un aviso, y solo si el aviso es de un pago. Llega en la query
 * (`?data.id=…&type=payment`, o en el formato viejo `?topic=payment&id=…`) y en el cuerpo
 * (`{type: "payment", data: {id}}`). Es solo una pista: la verdad sale de consultarlo.
 */
export function pagoDelAviso(query: URLSearchParams, cuerpo: unknown): string | null {
  const c = obj(cuerpo);
  const tipo = query.get("type") ?? query.get("topic") ?? txt(c.type) ?? txt(c.topic);
  if (tipo !== "payment") return null;
  return idDe(query.get("data.id")) ?? idDe(obj(c.data).id) ?? (query.get("topic") === "payment" ? idDe(query.get("id")) : null);
}

export type RespuestaMp = { status: number; cuerpo: unknown };
export type ClienteMpTienda = ReturnType<typeof clienteMpTienda>;

/** Cliente mínimo. `token` es el Access Token del restaurante. Un fallo de red es `status: 0`, no una excepción. */
export function clienteMpTienda(token: string, pedir: typeof fetch = fetch) {
  const llamar = async (metodo: string, ruta: string, cuerpo?: unknown, extra: Record<string, string> = {}): Promise<RespuestaMp> => {
    try {
      const r = await pedir(API + ruta, {
        method: metodo,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...extra },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(10_000),
      });
      const texto = await r.text();
      let json: unknown = null;
      try { json = texto ? JSON.parse(texto) : null; } catch { /* cuerpo no JSON */ }
      return { status: r.status, cuerpo: json };
    } catch {
      return { status: 0, cuerpo: null };
    }
  };
  return {
    /**
     * El cobro. La llave de idempotencia es fija por renglón de tienda_pagos, y cada renglón se cobra
     * UNA vez (tienda_pago_tomar_cobro): si la petición se repite en la red, Mercado Pago no cobra dos veces.
     * `dispositivo` es el Device ID que genera MercadoPago.js en el navegador (ayuda a la aprobación).
     */
    cobrar: (cuerpo: Record<string, unknown>, llave: string, dispositivo?: string | null) =>
      llamar("POST", "/v1/payments", cuerpo, { "X-Idempotency-Key": llave, ...(dispositivo && { "X-meli-session-id": dispositivo }) }),
    leerPago: (pagoIdExterno: string) => llamar("GET", `/v1/payments/${encodeURIComponent(pagoIdExterno)}`),
    /** Los pagos hechos con nuestra referencia: el respaldo cuando el aviso no llegó. */
    buscarPagos: (pagoId: string) =>
      llamar("GET", `/v1/payments/search?external_reference=${encodeURIComponent(pagoId)}&sort=date_created&criteria=desc&limit=20`),
    /** Devolución TOTAL (sin cuerpo). La llave es fija por pago: repetirla no devuelve dos veces. */
    devolver: (pagoIdExterno: string, llave: string) =>
      llamar("POST", `/v1/payments/${encodeURIComponent(pagoIdExterno)}/refunds`, undefined, { "X-Idempotency-Key": llave }),
  };
}

/** Lo que se deja en el log de un fallo de Mercado Pago: el estado HTTP y su código, nunca el cuerpo. */
export function resumenDeFallo(r: RespuestaMp): string {
  const c = obj(r.cuerpo);
  const codigo = txt(c.error) ?? txt(c.code) ?? txt(obj(Array.isArray(c.cause) ? c.cause[0] : null).code) ?? (typeof c.status === "number" ? String(c.status) : "");
  return `HTTP ${r.status}${codigo ? ` ${codigo.slice(0, 60)}` : ""}`;
}
