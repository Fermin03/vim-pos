// Checkout Pro de Mercado Pago (Preferences API) para el pago en línea de la tienda.
// Fuente: docs/integraciones/mercado-pago-checkout-pro/01-resumen-api.md. Diseño: 02-diseno.md.
//
// Puro: arma la preferencia y decide qué significa un pago. Lo que mueve el pedido es la base
// (tienda_pago_aplicar, 0172); aquí solo se lee lo que dice Mercado Pago y se descarta lo que no es
// nuestro. Se prueba con `node --test`.
//
// NADA DE ESTO ESTÁ PROBADO CONTRA MERCADO PAGO todavía (ver «Prueba corta» en el diseño): los
// campos son los de la documentación.
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

/** ISO 8601 con zona explícita, como lo pide la referencia (`2022-11-17T09:37:52.000-04:00`). */
const fechaMp = (d: Date): string => d.toISOString().replace("Z", "+00:00");

export type DatosPreferencia = {
  /** El id de tienda_pagos: es la `external_reference`. */
  pagoId: string;
  /** Total + propina, como texto con dos decimales. Lo calculó la base, nunca el cliente. */
  monto: string;
  folio: string;
  negocio: string;
  /** La página de seguimiento del pedido en la tienda (https). */
  regreso: string;
  /** La función que recibe los avisos, con la referencia en la query (https). */
  aviso: string;
  ahora: Date;
  /** Hasta cuándo se puede pagar (tienda_pagos.vence_at). */
  vence: Date;
  email: string | null;
};

/**
 * El cuerpo de `POST /checkout/preferences`. Un solo renglón por el total: no hay campo de monto
 * total, sale de `unit_price × quantity`. Sin `marketplace_fee`: VIM no cobra comisión y el dinero
 * cae en la cuenta del restaurante (el token es el suyo).
 * Solo medios que se aprueban al instante: fuera efectivo, cajero, transferencia y billeteras; sin
 * meses; y `binary_mode`, para que nada quede «pendiente».
 */
export function cuerpoDePreferencia(d: DatosPreferencia): Record<string, unknown> {
  const monto = montoTexto(d.monto);
  if (!monto) throw new Error("cuerpoDePreferencia: monto inválido");
  for (const u of [d.regreso, d.aviso]) if (!u.startsWith("https://")) throw new Error("cuerpoDePreferencia: las URL van en https");
  return {
    items: [{
      id: d.folio,
      title: `Pedido ${d.folio} en ${d.negocio}`.slice(0, 250),
      quantity: 1,
      currency_id: "MXN",
      // La API pide un número. Sale del texto con dos decimales en el último momento y no se opera con él.
      unit_price: Number(monto),
    }],
    external_reference: d.pagoId,
    back_urls: { success: d.regreso, pending: d.regreso, failure: d.regreso },
    auto_return: "approved",
    notification_url: d.aviso,
    binary_mode: true,
    expires: true,
    expiration_date_from: fechaMp(d.ahora),
    expiration_date_to: fechaMp(d.vence),
    payment_methods: {
      excluded_payment_types: [{ id: "ticket" }, { id: "atm" }, { id: "bank_transfer" }, { id: "digital_currency" }],
      installments: 1,
    },
    ...(d.email && { payer: { email: d.email } }),
  };
}

/** De la respuesta de crear la preferencia, lo que se guarda. `init_point` tiene que ser https. */
export function leerPreferencia(cuerpo: unknown): { id: string; init_point: string } | null {
  const c = obj(cuerpo);
  const id = txt(c.id), init_point = txt(c.init_point);
  return id && init_point && init_point.startsWith("https://") ? { id, init_point } : null;
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
    crearPreferencia: (cuerpo: Record<string, unknown>) => llamar("POST", "/checkout/preferences", cuerpo),
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
