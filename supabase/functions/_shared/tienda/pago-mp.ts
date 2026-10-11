// Orders API de Mercado Pago (`POST /v1/orders`, type "online") para el pago en línea de la tienda:
// la tarjeta se captura en la tienda (Secure Fields) y aquí solo llega su TOKEN.
//
// Fuente que manda: docs/integraciones/mercado-pago-checkout-pro/04-verificado-orders.md (llamadas
// reales del 11 oct 2026 contra la cuenta de prueba). Las formas de las respuestas de ese documento
// son los fixtures de pago-mp.test.ts. Lo que ahí figura como «sin probar» está marcado aquí.
//
// Puro: arma la orden y decide qué significa lo que contesta Mercado Pago. Lo que mueve el pedido es
// la base (tienda_pago_aplicar, 0172). Se prueba con `node --test`.
//
// El token de la tarjeta es de un solo uso y no se escribe en ningún log.
//
// El cliente HTTP es propio (el de _shared/terminal/mercado-pago.ts crea órdenes de Point). De allá
// se reutiliza, sin tocarlo, lo que ya está verificado: `datosDeOrden` (la misma forma de orden),
// `montoTexto` y `firmaValida`.
import { datosDeOrden, montoTexto } from "../terminal/mercado-pago.ts";

const API = "https://api.mercadopago.com";

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {});
const txt = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
/** Un id de Mercado Pago (orden `ORD…`, pago `PAY…`): letras, números, guion; o nada. Es lo que acepta la base. */
const idDe = (v: unknown): string | null => (typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null);

/** Los tipos de tarjeta que se cobran. Lista cerrada: viaja tal cual a Mercado Pago. */
export const TIPOS_DE_TARJETA = ["credit_card", "debit_card"] as const;
export type TipoDeTarjeta = (typeof TIPOS_DE_TARJETA)[number];

/** Lo que la tienda manda de la tarjeta: nunca el número, solo su token, su marca y si es crédito o débito. */
export type Tarjeta = { token: string; payment_method_id: string; type: TipoDeTarjeta };

export type DatosCobro = {
  /** El id de tienda_pagos: es la `external_reference`. */
  pagoId: string;
  /** Total + propina, como texto con dos decimales. Lo calculó la base, nunca el cliente. */
  monto: string;
  email: string;
  tarjeta: Tarjeta;
};

/**
 * El cuerpo de `POST /v1/orders`, tal como se verificó: un solo pago, sin meses, y los montos como
 * TEXTO con dos decimales. Sin `application_fee` ni `marketplace`: VIM no cobra comisión y el dinero
 * cae en la cuenta del restaurante (el token es el suyo). No lleva dirección de avisos: con Orders
 * llegan a la URL configurada en la aplicación.
 * Sin probar: `type: "debit_card"` (supuesto del documento 04).
 */
export function cuerpoDeOrden(d: DatosCobro): Record<string, unknown> {
  const monto = montoTexto(d.monto);
  if (!monto) throw new Error("cuerpoDeOrden: monto inválido");
  return {
    type: "online",
    processing_mode: "automatic",
    total_amount: monto,
    external_reference: d.pagoId,
    payer: { email: d.email },
    transactions: { payments: [{
      amount: monto,
      payment_method: { id: d.tarjeta.payment_method_id, type: d.tarjeta.type, token: d.tarjeta.token, installments: 1 },
    }] },
  };
}

/** Por qué no pasó un cobro, en familias: lo que la tienda le puede decir al cliente. */
export const MOTIVOS_DE_RECHAZO = ["FONDOS", "DATOS", "LLAMAR_BANCO", "TARJETA_DESHABILITADA", "OTRO"] as const;
export type MotivoDeRechazo = (typeof MOTIVOS_DE_RECHAZO)[number];

// VERIFICADO con los titulares de prueba (FUND, SECU, EXPI, CALL, LOCK). El código y la fecha mal
// escritos llegan IGUAL (`bad_filled_card_data`): no se distinguen, y la tienda dice una sola cosa.
const FAMILIAS: Record<string, MotivoDeRechazo> = {
  insufficient_amount: "FONDOS",
  bad_filled_card_data: "DATOS",
  required_call_for_authorize: "LLAMAR_BANCO",
  card_disabled: "TARJETA_DESHABILITADA",
};
/**
 * La familia de un motivo de rechazo. Todo lo que no se reconoce —`rejected_by_issuer`, riesgo, un
 * código nuevo, o ninguno— es OTRO: el cliente lee «tu banco no lo aprobó», que siempre es verdad,
 * y no un motivo inventado.
 */
export function motivoDeRechazo(detalle: string | null | undefined): MotivoDeRechazo {
  return (detalle && Object.hasOwn(FAMILIAS, detalle) ? FAMILIAS[detalle] : undefined) ?? "OTRO";
}

/**
 * El motivo de un rechazo que llegó como 402: `errors[].details[]` trae `"<id del pago>: <motivo>"`.
 * null si no viene con esa forma (el rechazo sigue siendo un rechazo: la familia será OTRO).
 */
function detalleDeRechazo(error: Record<string, unknown>): string | null {
  const d = Array.isArray(error.details) ? error.details.find((x): x is string => typeof x === "string") : undefined;
  const motivo = d?.split(": ").pop()?.trim() ?? "";
  return /^[a-z0-9_]{1,60}$/.test(motivo) ? motivo : null;
}

export type Esperado = {
  /** El id de tienda_pagos: la referencia que tiene que traer la orden. */
  pagoId: string;
  /** `tienda_conexiones.de_prueba`: la conexión con la que se consultó es de prueba. */
  dePrueba: boolean;
};

type DatosDeOrden = { ordenIdExterno: string; pagoIdExterno: string | null; monto: string;
                      tipoTarjeta: string | null; marca: string | null; detalle: string | null };
export type Decision =
  | ({ tipo: "APROBADO" | "DEVUELTO" } & DatosDeOrden)
  | ({ tipo: "RECHAZADO" } & Omit<DatosDeOrden, "monto"> & { monto: string | null })
  /** PENDIENTE: todavía no hay resultado (en revisión). AJENO: no es nuestra, se ignora. INCIDENTE: es nuestra y no sabemos tratarla; al log. */
  | { tipo: "PENDIENTE" | "AJENO" | "INCIDENTE"; motivo: string; ordenIdExterno: string | null };

/**
 * Qué significa una orden de Mercado Pago (la respuesta de crearla o de `GET /v1/orders/{id}`) para
 * el pago que esperamos.
 *
 * QUÉ GARANTIZA QUE EL DINERO CAYÓ DONDE DEBE. No está probado que la orden traiga un campo que
 * identifique a la cuenta vendedora (documento 04, «sin probar»), así que aquí no se compara ninguno.
 * La garantía es otra: la orden se creó o se consultó con el access token de ESA conexión (Mercado
 * Pago solo deja ver las órdenes de la cuenta dueña del token), trae NUESTRA referencia —el id de
 * tienda_pagos, que nace ligado a esa conexión— y el monto es el esperado (lo comprueba la base, en
 * la misma transacción que mueve el pedido). Una orden de otra cuenta contestaría 404 a ese token.
 *
 * El modo: si la orden trae `live_mode` (tampoco está probado que lo traiga), tiene que casar con el
 * de la conexión, en los dos sentidos: ni una orden de prueba en una cuenta real, ni al revés.
 * Un estado que no conocemos nunca es «aprobado».
 */
export function decidirOrden(e: Esperado, orden: unknown): Decision {
  const o = obj(orden);
  const ordenIdExterno = idDe(o.id);
  if (!ordenIdExterno) return { tipo: "AJENO", motivo: "sin id de orden", ordenIdExterno: null };
  if (o.external_reference !== e.pagoId) return { tipo: "AJENO", motivo: "otra referencia", ordenIdExterno };
  if (typeof o.live_mode === "boolean" && o.live_mode !== !e.dePrueba) {
    return { tipo: "AJENO", motivo: e.dePrueba ? "orden real en una conexión de prueba" : "orden de prueba en una cuenta real", ordenIdExterno };
  }

  const d = datosDeOrden(o);
  const estado = String(o.status ?? ""), detalle = txt(o.status_detail);
  // VERIFICADO: en revisión contesta `processing` / `in_process`, y no se puede cancelar.
  if (estado === "processing" || estado === "created" || estado === "action_required") return { tipo: "PENDIENTE", motivo: estado, ordenIdExterno };

  const pagos = obj(o.transactions).payments;
  const pago = obj(Array.isArray(pagos) ? pagos[0] : null);
  const comunes = { ordenIdExterno, pagoIdExterno: idDe(d.pago_id_externo), tipoTarjeta: d.tipo_tarjeta, marca: d.marca };
  if (estado === "failed" || estado === "canceled" || estado === "expired") {
    return { tipo: "RECHAZADO", ...comunes, monto: montoTexto(o.total_amount), detalle: txt(pago.status_detail) ?? detalle };
  }
  // El monto que manda es lo que Mercado Pago COBRÓ, no lo que se le pidió.
  const monto = montoTexto(o.total_paid_amount);
  if (estado === "refunded") {
    const devuelto = monto ?? montoTexto(o.total_amount);
    return devuelto ? { tipo: "DEVUELTO", ...comunes, monto: devuelto, detalle } : { tipo: "INCIDENTE", motivo: "monto ilegible", ordenIdExterno };
  }
  if (estado !== "processed") return { tipo: "INCIDENTE", motivo: `estado desconocido: ${estado.slice(0, 30)}`, ordenIdExterno };
  if (detalle !== "accredited") return { tipo: "INCIDENTE", motivo: `procesada sin acreditar: ${(detalle ?? "").slice(0, 40)}`, ordenIdExterno };
  if (!monto) return { tipo: "INCIDENTE", motivo: "monto ilegible", ordenIdExterno };
  if (Array.isArray(pagos) && pagos.length !== 1) return { tipo: "INCIDENTE", motivo: `${pagos.length} pagos en la orden`, ordenIdExterno };
  if (pago.status !== undefined && pago.status !== "processed") return { tipo: "INCIDENTE", motivo: `pago ${String(pago.status).slice(0, 30)}`, ordenIdExterno };
  // Si la orden dice su moneda, es pesos. (La cuenta es mexicana y el cobro no la elige.)
  const moneda = o.currency ?? o.currency_id;
  if (moneda !== undefined && moneda !== "MXN") return { tipo: "INCIDENTE", motivo: "moneda distinta de MXN", ordenIdExterno };
  return { tipo: "APROBADO", ...comunes, monto, detalle };
}

export type RespuestaMp = { status: number; cuerpo: unknown };

export type RespuestaDeCobro =
  /** Mercado Pago creó la orden (201): hay que leerla. */
  | { tipo: "ORDEN"; decision: Decision }
  /** 402 con `errors[].code === "failed"`: el banco dijo que no. Es un NO seguro: no hay orden ni cobro. */
  | { tipo: "RECHAZADO"; detalle: string | null }
  /**
   * 401: Mercado Pago no dejó usar esas credenciales. No creó nada. NO es un rechazo de la tarjeta.
   */
  | { tipo: "SIN_PERMISO" }
  /** 400 o 422: la petición no pasó la validación (token de tarjeta inválido o usado, datos que no cuadran). No creó nada. */
  | { tipo: "NO_ACEPTADO" }
  /** Sin respuesta, 5xx, 409, 429 o cualquier otra cosa: pudo o no cobrarse. NUNCA se trata como rechazo. */
  | { tipo: "NO_SE_SABE" };

/**
 * Qué significa lo que Mercado Pago contestó a `POST /v1/orders`.
 * VERIFICADO: aprobado → 201 con la orden; rechazado → 402 SIN orden, con
 * `{errors: [{code: "failed", details: ["PAY…: <motivo>"]}]}`; en revisión → 201 `processing`.
 * Un 402 que no trae ese código no se entiende: no se sabe.
 */
export function respuestaDeCobro(e: Esperado, r: RespuestaMp): RespuestaDeCobro {
  if (r.status === 201 || r.status === 200) return { tipo: "ORDEN", decision: decidirOrden(e, r.cuerpo) };
  if (r.status === 401) return { tipo: "SIN_PERMISO" };
  const errores = obj(r.cuerpo).errors;
  if (r.status === 402) {
    const fallo = (Array.isArray(errores) ? errores : []).map(obj).find((x) => x.code === "failed");
    return fallo ? { tipo: "RECHAZADO", detalle: detalleDeRechazo(fallo) } : { tipo: "NO_SE_SABE" };
  }
  if (r.status === 400 || r.status === 422) return { tipo: "NO_ACEPTADO" };
  return { tipo: "NO_SE_SABE" };
}

/** Las órdenes de `GET /v1/orders?…` (la búsqueda). Cualquier otra forma, ninguna. */
export function ordenesDeBusqueda(cuerpo: unknown): unknown[] {
  const c = obj(cuerpo);
  const r = c.data ?? c.results ?? c.elements ?? c.orders;
  return Array.isArray(r) ? r : [];
}

/**
 * La ruta de la búsqueda por referencia. Mercado Pago exige `begin_date` y `end_date`
 * (VERIFICADO: sin ellas, 400 `missing_required_params`). SIN PROBAR: el formato de esas fechas; se
 * usa ISO 8601 en UTC con milisegundos (`2026-10-11T18:00:00.000Z`), que es el de la referencia
 * oficial de la API. Solo se usa cuando al crear la orden no hubo respuesta y no se sabe su id.
 */
export function rutaDeBusqueda(pagoId: string, desde: Date, hasta: Date): string {
  const q = new URLSearchParams({ external_reference: pagoId, begin_date: desde.toISOString(), end_date: hasta.toISOString() });
  return `/v1/orders?${q}`;
}

export type ClienteMpTienda = ReturnType<typeof clienteMpTienda>;

/** Cliente mínimo. `token` es el Access Token de la conexión de la tienda del restaurante. Un fallo de red es `status: 0`, no una excepción. */
export function clienteMpTienda(token: string, pedir: typeof fetch = fetch) {
  const llamar = async (metodo: string, ruta: string, cuerpo?: unknown, llave?: string): Promise<RespuestaMp> => {
    try {
      const r = await pedir(API + ruta, {
        method: metodo,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(llave && { "X-Idempotency-Key": llave }) },
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
     */
    crearOrden: (cuerpo: Record<string, unknown>, llave: string) => llamar("POST", "/v1/orders", cuerpo, llave),
    /** VERIFICADO. Solo ve las órdenes de la cuenta dueña del token. */
    leerOrden: (ordenIdExterno: string) => llamar("GET", `/v1/orders/${encodeURIComponent(ordenIdExterno)}`),
    /** Las órdenes con nuestra referencia. Formato de las fechas SIN PROBAR (ver `rutaDeBusqueda`). */
    buscarOrdenes: (pagoId: string, desde: Date, hasta: Date) => llamar("GET", rutaDeBusqueda(pagoId, desde, hasta)),
    /**
     * Devolución TOTAL (sin cuerpo). VERIFICADO: repetir con la MISMA llave devuelve el mismo error
     * guardado, así que la llave tiene que ser NUEVA en cada intento. Quien llama mira antes si la
     * orden ya está devuelta: eso, y no la llave, es lo que evita devolver dos veces.
     */
    devolver: (ordenIdExterno: string, llave: string) => llamar("POST", `/v1/orders/${encodeURIComponent(ordenIdExterno)}/refund`, undefined, llave),
  };
}

/** Lo que se deja en el log de un fallo de Mercado Pago: el estado HTTP y su código, nunca el cuerpo. */
export function resumenDeFallo(r: RespuestaMp): string {
  const c = obj(r.cuerpo);
  const codigo = txt(obj(Array.isArray(c.errors) ? c.errors[0] : null).code) ?? txt(c.error) ?? txt(c.code);
  return `HTTP ${r.status}${codigo ? ` ${codigo.slice(0, 60)}` : ""}`;
}

/**
 * ¿Esa orden de Mercado Pago está «viva»: cobrada o por cobrarse? Sirve para no dar por conciliado
 * un pago cuando hay una orden con nuestra referencia que no se pudo aplicar (`decidirOrden` la dejó
 * como ajena, incidente o pendiente): ahí puede haber dinero del cliente, y nadie debe leer «sin
 * pago». Un estado que no se conoce cuenta como vivo.
 */
export function ordenViva(orden: unknown): boolean {
  const estado = String(obj(orden).status ?? "");
  return estado !== "failed" && estado !== "canceled" && estado !== "expired" && estado !== "refunded";
}
