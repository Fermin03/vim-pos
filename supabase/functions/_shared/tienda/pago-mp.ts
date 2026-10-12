// Orders API de Mercado Pago (`POST /v1/orders`, type "online") para el pago en línea de la tienda:
// la tarjeta se captura en la tienda (Secure Fields) y aquí solo llega su TOKEN.
//
// Fuente que manda: docs/integraciones/mercado-pago-checkout-pro/04-verificado-orders.md (llamadas
// reales del 11 oct 2026 contra la cuenta de prueba). Las formas de las respuestas de ese documento
// son los fixtures de pago-mp.test.ts. Lo que ahí figura como «sin probar» está marcado aquí.
//
// Puro: arma la orden y decide qué significa lo que contesta Mercado Pago. Lo que mueve el pedido es
// la base (tienda_pago_aplicar, 0173). Se prueba con `node --test`.
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
export type Tarjeta = {
  token: string; payment_method_id: string; type: TipoDeTarjeta;
  /** La huella del dispositivo que da MercadoPago.js (`MP_DEVICE_SESSION_ID`). No va en el cuerpo: viaja en la cabecera `X-Meli-Session-Id`. */
  dispositivo?: string | null;
};

/** Un renglón de la cotización del pedido: lo que el cliente pidió y lo que cuesta ese renglón entero. */
export type RenglonDePedido = { nombre: string; cantidad: number; total_mxn: string };
/** La dirección de entrega, con lo que Mercado Pago admite en `payer.address`. */
export type DireccionDePagador = { calle: string; numero_exterior: string; codigo_postal: string; ciudad: string; estado: string };
/**
 * Lo que se le cuenta a Mercado Pago del pedido, además del cobro: sirve a su antifraude («envía la
 * mayor cantidad posible de datos del comprador y del producto») y al correo que le manda al
 * comprador. Son DATOS PERSONALES: solo viajan a Mercado Pago, nunca a un log ni a tienda_eventos.
 */
export type DetalleDePedido = {
  /** «Pedido T1A2B3 en Knock-Out Burger». */
  descripcion: string;
  renglones: RenglonDePedido[];
  /** Lo que el envío le cuesta al cliente, y la propina; null o «0.00» = no hay. */
  envio: string | null; propina: string | null;
  pagador: { nombre: string; /** 10 dígitos. */ telefono: string | null; /** Solo a domicilio. */ direccion: DireccionDePagador | null };
};

export type DatosCobro = {
  /** El id de tienda_pagos: es la `external_reference`. */
  pagoId: string;
  /** Total + propina, como texto con dos decimales. Lo calculó la base, nunca el cliente. */
  monto: string;
  email: string;
  tarjeta: Tarjeta;
  /** Opcional: sin él, el cobro es el de siempre (solo el correo y la tarjeta). */
  detalle?: DetalleDePedido;
};

/**
 * El cuerpo de `POST /v1/orders`, tal como se verificó: un solo pago, sin meses, y los montos como
 * TEXTO con dos decimales. Sin `application_fee` ni `marketplace`: VIM no cobra comisión y el dinero
 * cae en la cuenta del restaurante (el token es el suyo). No lleva dirección de avisos: con Orders
 * llegan a la URL configurada en la aplicación.
 * VERIFICADO también con débito (`{ id: "debmaster", type: "debit_card" }`). Si `type` no corresponde
 * al `id`, Mercado Pago contesta 400 `property_value` (no crea nada).
 * OJO: la respuesta devuelve el token de la tarjeta en `transactions.payments[0].payment_method.token`.
 * De una orden solo se sacan los campos de `decidirOrden`; la respuesta cruda no se guarda ni se registra.
 */
export function cuerpoDeOrden(d: DatosCobro): Record<string, unknown> {
  const monto = montoTexto(d.monto);
  if (!monto) throw new Error("cuerpoDeOrden: monto inválido");
  const x = d.detalle;
  const telefono = x ? telefonoDePagador(x.pagador.telefono) : null, dir = x?.pagador.direccion;
  return {
    type: "online",
    processing_mode: "automatic",
    total_amount: monto,
    external_reference: d.pagoId,
    // VERIFICADO (12 oct 2026, cuenta de prueba): la orden acepta `description`, `items` y estos datos
    // del pagador, y contesta 201 `processed`.
    ...(x && { description: corto(x.descripcion, 150), items: articulosDeOrden({ ...x, total: monto }) }),
    payer: {
      email: d.email,
      ...(x && nombreDePagador(x.pagador.nombre)),
      ...(telefono && { phone: telefono }),
      ...(dir && { address: { street_name: corto(dir.calle, 100), street_number: corto(dir.numero_exterior, 20), zip_code: dir.codigo_postal, city: corto(dir.ciudad, 100), state: corto(dir.estado, 50) } }),
    },
    transactions: { payments: [{
      amount: monto,
      payment_method: { id: d.tarjeta.payment_method_id, type: d.tarjeta.type, token: d.tarjeta.token, installments: 1 },
    }] },
  };
}

const corto = (s: string, n: number): string => Array.from(s.trim()).slice(0, n).join("");
const aCentavos = (s: string | null | undefined): number | null => {
  const m = typeof s === "string" ? /^(\d+)\.(\d{2})$/.exec(s) : null;
  return m ? Number(m[1]) * 100 + Number(m[2]) : null;
};
const dePesos = (c: number): string => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;

export type Articulo = { title: string; unit_price: string; quantity: number };

/**
 * Los `items` de la orden: los renglones del pedido, el envío y la propina, cada uno como artículo.
 * REGLA: la suma de `unit_price × quantity` es EXACTAMENTE el total que se cobra, en centavos
 * enteros. Si no lo es (un renglón que no se lee, un pedido que ya no es el de esta cotización, un
 * redondeo), va UN solo artículo con la descripción y el total: nunca una lista que no cuadra.
 *   · un renglón cuyo total se reparte exacto entre su cantidad va con su precio unitario;
 *     si no (el IVA se redondea por renglón), va como una pieza: «3 × Clásica» por el total;
 *   · los modificadores ya están dentro del total de su renglón (así lo cotiza la base);
 *   · un renglón de $0 no se manda (no cambia la suma).
 */
export function articulosDeOrden(d: Pick<DetalleDePedido, "descripcion" | "renglones" | "envio" | "propina"> & { total: string }): Articulo[] {
  const uno: Articulo[] = [{ title: corto(d.descripcion, 150), unit_price: d.total, quantity: 1 }];
  const total = aCentavos(d.total);
  if (total === null) return uno;
  const articulos: Articulo[] = [];
  let suma = 0;
  for (const r of d.renglones) {
    const c = aCentavos(r.total_mxn);
    if (c === null || !Number.isInteger(r.cantidad) || r.cantidad < 1 || !r.nombre.trim()) return uno;
    if (c === 0) continue;
    suma += c;
    articulos.push(c % r.cantidad === 0
      ? { title: corto(r.nombre, 120), unit_price: dePesos(c / r.cantidad), quantity: r.cantidad }
      : { title: corto(`${r.cantidad} × ${r.nombre}`, 120), unit_price: r.total_mxn, quantity: 1 });
  }
  for (const [title, importe] of [["Envío", d.envio], ["Propina", d.propina]] as const) {
    if (importe === null) continue;
    const c = aCentavos(importe);
    if (c === null) return uno;
    if (c === 0) continue;
    suma += c;
    articulos.push({ title, unit_price: importe, quantity: 1 });
  }
  return articulos.length > 0 && suma === total ? articulos : uno;
}

/**
 * De lo que devuelve `tienda_cotizar`, lo que hace falta para los artículos: los renglones (nombre,
 * cantidad y total de cada uno) y lo que el envío le cuesta al cliente. Lo que no se pueda leer sale
 * vacío, y entonces `articulosDeOrden` manda un solo artículo con el total.
 */
export function partesDeCotizacion(x: unknown): Pick<DetalleDePedido, "renglones" | "envio"> {
  const q = obj(x);
  const renglones = (Array.isArray(q.renglones) ? q.renglones : []).map(obj).map((r) => ({
    nombre: typeof r.nombre === "string" ? r.nombre : "", cantidad: typeof r.cantidad === "number" ? r.cantidad : 0,
    total_mxn: typeof r.total_mxn === "string" ? r.total_mxn : "",
  }));
  return { renglones, envio: txt(q.envio_total_mxn) };
}

/**
 * El nombre que escribió el cliente, partido para Mercado Pago: la primera palabra es el nombre y el
 * resto, el apellido. Con una sola palabra todo va en `first_name` y no se manda apellido.
 */
export function nombreDePagador(nombre: string): { first_name?: string; last_name?: string } {
  const [primero, ...resto] = nombre.trim().split(/\s+/).filter(Boolean);
  if (!primero) return {};
  return { first_name: corto(primero, 60), ...(resto.length > 0 && { last_name: corto(resto.join(" "), 100) }) };
}

/**
 * El teléfono (10 dígitos de México) partido en lada y número. Las ladas de DOS dígitos son solo
 * las de Ciudad de México (55 y 56), Guadalajara (33) y Monterrey (81); todas las demás son de
 * tres. Lo que no sean 10 dígitos no se manda.
 */
export function telefonoDePagador(telefono: string | null): { area_code: string; number: string } | null {
  if (!telefono || !/^\d{10}$/.test(telefono)) return null;
  const n = /^(55|56|33|81)/.test(telefono) ? 2 : 3;
  return { area_code: telefono.slice(0, n), number: telefono.slice(n) };
}

/**
 * Un texto que va a un log, sin los datos personales de ese cobro: si Mercado Pago, al no aceptar una
 * orden, repite en su mensaje un valor que se le mandó (un nombre, el teléfono, la calle), no se
 * escribe. Los nombres de las propiedades sí quedan: son lo que hace falta para arreglarlo.
 */
export function sinDatosPersonales(texto: string, d: Pick<DatosCobro, "email" | "tarjeta" | "detalle">): string {
  const p = d.detalle?.pagador, tel = telefonoDePagador(p?.telefono ?? null);
  const valores = [d.email, d.tarjeta.token, d.tarjeta.dispositivo, p?.telefono, tel?.number, ...(p?.nombre.trim().split(/\s+/) ?? []),
                   p?.direccion?.calle, p?.direccion?.numero_exterior, p?.direccion?.codigo_postal, p?.direccion?.ciudad, p?.direccion?.estado]
    .filter((v): v is string => typeof v === "string" && v.trim().length >= 3)
    .sort((a, b) => b.length - a.length);
  let limpio = texto;
  // Sin expresiones regulares: lo que escribió el cliente se busca tal cual, sin distinguir mayúsculas.
  for (const v of valores) {
    const aguja = v.trim().toLowerCase();
    for (let i = limpio.toLowerCase().indexOf(aguja); i !== -1; i = limpio.toLowerCase().indexOf(aguja, i + 3)) {
      limpio = limpio.slice(0, i) + "•••" + limpio.slice(i + aguja.length);
    }
  }
  return limpio;
}

/** Por qué no pasó un cobro, en familias: lo que la tienda le puede decir al cliente. */
export const MOTIVOS_DE_RECHAZO = ["FONDOS", "DATOS", "LLAMAR_BANCO", "TARJETA_DESHABILITADA", "RIESGO", "OTRO"] as const;
export type MotivoDeRechazo = (typeof MOTIVOS_DE_RECHAZO)[number];

// VERIFICADO con los titulares de prueba (FUND, SECU, EXPI, CALL, LOCK). El código y la fecha mal
// escritos llegan IGUAL (`bad_filled_card_data`): no se distinguen, y la tienda dice una sola cosa.
const FAMILIAS: Record<string, MotivoDeRechazo> = {
  insufficient_amount: "FONDOS",
  bad_filled_card_data: "DATOS",
  required_call_for_authorize: "LLAMAR_BANCO",
  card_disabled: "TARJETA_DESHABILITADA",
  // VISTO EN PRODUCCIÓN (12 oct 2026): el antifraude de Mercado Pago, no el banco. Mercado Pago pide
  // sugerir otro medio de pago y no reintentar enseguida con los mismos datos.
  high_risk: "RIESGO",
};
/**
 * La familia de un motivo de rechazo. Todo lo que no se reconoce —`rejected_by_issuer`, un
 * código nuevo, o ninguno— es OTRO: el cliente lee «tu banco no lo aprobó», que siempre es verdad,
 * y no un motivo inventado.
 */
export function motivoDeRechazo(detalle: string | null | undefined): MotivoDeRechazo {
  return (detalle && Object.hasOwn(FAMILIAS, detalle) ? FAMILIAS[detalle] : undefined) ?? "OTRO";
}

/**
 * VERIFICADO: un token de tarjeta inventado o ya usado contesta 402 `failed` con este motivo (no un
 * 400). No hay tarjeta ni banco de por medio: no es «tu banco no lo aprobó», y no cuenta como una
 * tarjeta rechazada del negocio (sí para el tope de la IP, que es quien lo manda).
 */
export const esTokenInvalido = (detalle: string | null | undefined): boolean => detalle === "invalid_card_token";

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
  /** `tienda_conexiones.cuenta_id_externo`: el user_id de Mercado Pago de la cuenta que cobra. */
  cuentaVendedora: string;
};

type DatosDeOrden = { ordenIdExterno: string; pagoIdExterno: string | null; monto: string;
                      tipoTarjeta: string | null; marca: string | null; detalle: string | null };
export type Decision =
  | ({ tipo: "APROBADO" | "DEVUELTO" } & DatosDeOrden)
  | ({ tipo: "RECHAZADO" } & Omit<DatosDeOrden, "monto"> & { monto: string | null })
  /** PENDIENTE: todavía no hay resultado (en revisión). AJENO: no es nuestra, se ignora. INCIDENTE: es nuestra y no sabemos tratarla; al log. */
  | { tipo: "PENDIENTE" | "AJENO" | "INCIDENTE"; motivo: string; ordenIdExterno: string | null };

/**
 * Qué significa una orden de Mercado Pago (la respuesta de crearla, de `GET /v1/orders/{id}` o de
 * la búsqueda) para el pago que esperamos.
 *
 * QUÉ GARANTIZA QUE EL DINERO CAYÓ DONDE DEBE (VERIFICADO, documento 04): la orden trae `user_id`,
 * el id de la cuenta vendedora, como texto. Antes de mirar su estado tiene que ser NUESTRA:
 *   · `external_reference` es el id de tienda_pagos que esperamos;
 *   · `user_id` es la cuenta de la conexión que cobra ese pago (se compara como texto);
 * y para darla por cobrada, además: `currency` es `MXN`, está `processed`/`accredited`, y el monto
 * es el esperado (eso lo comprueba la base, en la misma transacción que mueve el pedido).
 * Además se creó o se consultó con el access token de esa misma conexión.
 *
 * La orden NO trae `live_mode` (verificado): aquí no se mira. Que una conexión de prueba no cobre
 * en un negocio real lo decide solo la marca de la conexión (`tienda_conexion_cobro`, 0173).
 * Un estado que no conocemos nunca es «aprobado».
 */
export function decidirOrden(e: Esperado, orden: unknown): Decision {
  const o = obj(orden);
  const ordenIdExterno = idDe(o.id);
  if (!ordenIdExterno) return { tipo: "AJENO", motivo: "sin id de orden", ordenIdExterno: null };
  if (o.external_reference !== e.pagoId) return { tipo: "AJENO", motivo: "otra referencia", ordenIdExterno };
  // Como texto: Mercado Pago lo manda así ("3754297554"); si un día llegara como número, vale igual.
  const vendedor = typeof o.user_id === "string" ? o.user_id : typeof o.user_id === "number" && Number.isSafeInteger(o.user_id) ? String(o.user_id) : "";
  if (vendedor === "" || vendedor !== e.cuentaVendedora) return { tipo: "AJENO", motivo: "otra cuenta vendedora", ordenIdExterno };

  const d = datosDeOrden(o);
  const estado = String(o.status ?? ""), detalle = txt(o.status_detail);
  // VERIFICADO: en revisión contesta `processing` / `in_process`, y no se puede cancelar.
  // VISTO EN PRODUCCIÓN (12 oct 2026): también `in_review` (el antifraude la está mirando); segundos
  // después llegó el aviso con su final (`order.failed`). Es una orden viva y sin resultado todavía.
  if (estado === "processing" || estado === "in_review" || estado === "created" || estado === "action_required") return { tipo: "PENDIENTE", motivo: estado, ordenIdExterno };

  const pagos = obj(o.transactions).payments;
  const pago = obj(Array.isArray(pagos) ? pagos[0] : null);
  const comunes = { ordenIdExterno, pagoIdExterno: idDe(d.pago_id_externo), tipoTarjeta: d.tipo_tarjeta, marca: d.marca };
  if (estado === "failed" || estado === "canceled" || estado === "expired") {
    return { tipo: "RECHAZADO", ...comunes, monto: montoTexto(o.total_amount), detalle: txt(pago.status_detail) ?? detalle };
  }
  // El monto que manda es lo que Mercado Pago COBRÓ, no lo que se le pidió.
  const monto = montoTexto(o.total_paid_amount);
  if (estado === "refunded") {
    // VERIFICADO: `refunded` / `refunded`, y el pago trae `refunded_amount`.
    const devuelto = monto ?? montoTexto(pago.refunded_amount) ?? montoTexto(o.total_amount);
    return devuelto ? { tipo: "DEVUELTO", ...comunes, monto: devuelto, detalle } : { tipo: "INCIDENTE", motivo: "monto ilegible", ordenIdExterno };
  }
  if (estado !== "processed") return { tipo: "INCIDENTE", motivo: `estado desconocido: ${estado.slice(0, 30)}`, ordenIdExterno };
  if (detalle !== "accredited") return { tipo: "INCIDENTE", motivo: `procesada sin acreditar: ${(detalle ?? "").slice(0, 40)}`, ordenIdExterno };
  if (!monto) return { tipo: "INCIDENTE", motivo: "monto ilegible", ordenIdExterno };
  if (Array.isArray(pagos) && pagos.length !== 1) return { tipo: "INCIDENTE", motivo: `${pagos.length} pagos en la orden`, ordenIdExterno };
  if (pago.status !== undefined && pago.status !== "processed") return { tipo: "INCIDENTE", motivo: `pago ${String(pago.status).slice(0, 30)}`, ordenIdExterno };
  // VERIFICADO: la orden trae `currency`. Sin ella, o con otra, no se da por cobrada en pesos.
  if (o.currency !== "MXN") return { tipo: "INCIDENTE", motivo: "moneda distinta de MXN", ordenIdExterno };
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

/** Las órdenes de la búsqueda. VERIFICADO: `{ data: [orden…], paging: {…} }`. Cualquier otra forma, ninguna. */
export function ordenesDeBusqueda(cuerpo: unknown): unknown[] {
  const r = obj(cuerpo).data;
  return Array.isArray(r) ? r : [];
}

/**
 * La ruta de la búsqueda por referencia. VERIFICADO (documento 04): Mercado Pago exige `begin_date`
 * y `end_date` en RFC 3339, con o sin milisegundos (`2026-10-11T18:00:00.000Z`); solo la fecha da
 * 400 `invalid_search_params`. Solo se usa cuando al crear la orden no hubo respuesta y no se sabe su id.
 */
export function rutaDeBusqueda(pagoId: string, desde: Date, hasta: Date): string {
  const q = new URLSearchParams({ external_reference: pagoId, begin_date: desde.toISOString(), end_date: hasta.toISOString() });
  return `/v1/orders?${q}`;
}

export type ClienteMpTienda = ReturnType<typeof clienteMpTienda>;

/** Cliente mínimo. `token` es el Access Token de la conexión de la tienda del restaurante. Un fallo de red es `status: 0`, no una excepción. */
export function clienteMpTienda(token: string, pedir: typeof fetch = fetch) {
  const llamar = async (metodo: string, ruta: string, cuerpo?: unknown, llave?: string, dispositivo?: string | null): Promise<RespuestaMp> => {
    try {
      const r = await pedir(API + ruta, {
        method: metodo,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(llave && { "X-Idempotency-Key": llave }),
                   // La huella del dispositivo del comprador, para el antifraude de Mercado Pago (VERIFICADO: la acepta).
                   ...(dispositivo && { "X-Meli-Session-Id": dispositivo }) },
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
    crearOrden: (cuerpo: Record<string, unknown>, llave: string, dispositivo?: string | null) => llamar("POST", "/v1/orders", cuerpo, llave, dispositivo),
    /** VERIFICADO. Solo ve las órdenes de la cuenta dueña del token. */
    leerOrden: (ordenIdExterno: string) => llamar("GET", `/v1/orders/${encodeURIComponent(ordenIdExterno)}`),
    /** Las órdenes con nuestra referencia, en una ventana de fechas (VERIFICADO: 200 `{ data: […] }`). */
    buscarOrdenes: (pagoId: string, desde: Date, hasta: Date) => llamar("GET", rutaDeBusqueda(pagoId, desde, hasta)),
    /**
     * Devolución TOTAL (sin cuerpo). VERIFICADO: repetir con la MISMA llave devuelve el mismo error
     * guardado, así que la llave tiene que ser NUEVA en cada intento. Quien llama mira antes si la
     * orden ya está devuelta: eso, y no la llave, es lo que evita devolver dos veces.
     */
    /**
     * Cancela una orden que Mercado Pago abrió y no procesó. VERIFICADO (11 oct 2026): solo se deja en
     * `created` o `action_required`; con `processing` contesta 409 `cannot_cancel_order`.
     */
    cancelarOrden: (ordenIdExterno: string, llave: string) => llamar("POST", `/v1/orders/${encodeURIComponent(ordenIdExterno)}/cancel`, undefined, llave),
    devolver: (ordenIdExterno: string, llave: string) => llamar("POST", `/v1/orders/${encodeURIComponent(ordenIdExterno)}/refund`, undefined, llave),
  };
}

/** Lo que se deja en el log de un fallo de Mercado Pago: el estado HTTP y su código, nunca el cuerpo. */
/**
 * Qué campo no le gustó a Mercado Pago en un 400/422 (`errors[0].message` y sus `details`, que nombran
 * la propiedad, no su valor). Solo para el rastro de un cobro que no se aceptó: sin esto no se puede
 * arreglar. No es el cuerpo: una orden creada (la que devuelve el token de tarjeta) nunca pasa por aquí.
 */
export function motivoDeNoAceptado(r: RespuestaMp): string {
  const e0 = obj(Array.isArray(obj(r.cuerpo).errors) ? (obj(r.cuerpo).errors as unknown[])[0] : null);
  const detalles = Array.isArray(e0.details) ? e0.details.filter((d): d is string => typeof d === "string").join(" | ") : "";
  return [txt(e0.message) ?? txt(obj(r.cuerpo).message), detalles].filter(Boolean).join(": ").slice(0, 220);
}

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
/**
 * ¿Mercado Pago abrió la orden y la dejó sin procesar? VERIFICADO (11 oct 2026, en producción): un
 * cobro que contesta 422 `unprocessable_content` deja la orden en `created`, sin `status_detail` y
 * sin cobrar; ahí se queda para siempre. Se da un minuto de margen: una orden recién nacida puede
 * estar todavía procesándose en la petición que la creó.
 */
export function ordenAtascada(orden: unknown, ahora: Date): boolean {
  const o = obj(orden);
  const nacio = Date.parse(String(o.created_date ?? ""));
  return o.status === "created" && Number.isFinite(nacio) && ahora.getTime() - nacio > 60_000;
}

export function ordenViva(orden: unknown): boolean {
  const estado = String(obj(orden).status ?? "");
  return estado !== "failed" && estado !== "canceled" && estado !== "expired" && estado !== "refunded";
}
