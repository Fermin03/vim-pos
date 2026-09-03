// Adaptador Uber Eats (Order Fulfillment API v1/delivery). Sin dependencias de Deno: `fetch` se
// inyecta para poder probarlo con node --test. Doc: docs/integraciones/delivery/03-uber-eats-resumen.md
import type { ItemNormalizado, ModificadorNormalizado, PedidoNormalizado, TipoEntrega } from "./tipos.ts";

const DOMINIOS = {
  sandbox: { auth: "https://sandbox-login.uber.com", api: "https://test-api.uber.com" },
  produccion: { auth: "https://auth.uber.com", api: "https://api.uber.com" },
} as const;

/** amount_e5 (valor × 100 000) → decimal en texto con dos decimales, redondeo a centavos. */
export function e5ADecimal(amountE5: number): string {
  const centavos = Math.round(amountE5 / 1000);
  const signo = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  return `${signo}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function segundosAReadyTime(ahora: Date, minutos: number): string {
  return new Date(ahora.getTime() + minutos * 60_000).toISOString();
}

type Dict = Record<string, unknown>;
const obj = (v: unknown): Dict => (v && typeof v === "object" && !Array.isArray(v) ? (v as Dict) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const grossE5 = (money: unknown): number | null => {
  const g = obj(obj(money).gross);
  return typeof g.amount_e5 === "number" ? g.amount_e5 : null;
};
const dec = (money: unknown): string | null => { const e5 = grossE5(money); return e5 === null ? null : e5ADecimal(e5); };

/** Alérgenos de Uber → español. OTHER se resuelve con el texto libre; lo desconocido se deja tal cual en minúsculas. */
const ALERGENOS: Record<string, string> = {
  DAIRY: "lácteos", EGG: "huevo", EGGS: "huevo", FISH: "pescado", SHELLFISH: "mariscos", TREENUTS: "frutos secos",
  TREE_NUTS: "frutos secos", PEANUTS: "cacahuate", GLUTEN: "gluten", SOY: "soya", SESAME: "ajonjolí", WHEAT: "trigo",
};
export function traducirAlergeno(codigo: string): string {
  const k = codigo.trim().toUpperCase();
  return ALERGENOS[k] ?? codigo.trim().toLowerCase();
}

/** customer_request.allergy de Uber (v1/delivery) → alérgenos en español + texto libre. */
export function alergiaDeItem(customerRequest: unknown): { alergenos: string[]; alergia_nota: string | null } {
  const a = obj(obj(customerRequest).allergy);
  const alergenos: string[] = [];
  for (const x of arr(a.allergens)) {
    if (typeof x === "string" && x.trim() !== "") {
      if (x.trim().toUpperCase() !== "OTHER") alergenos.push(traducirAlergeno(x));
      continue;
    }
    const o = obj(x);                                       // forma v2: { type, freeform_text }
    const tipo = str(o.type);
    const libre = str(o.freeform_text);
    if (tipo && tipo.toUpperCase() !== "OTHER") alergenos.push(traducirAlergeno(tipo));
    else if (libre) alergenos.push(libre.trim().toLowerCase());
  }
  const nota = str(a.instructions) ?? str(a.allergy_instructions);
  return { alergenos: [...new Set(alergenos)], alergia_nota: nota };
}

function tipoEntrega(f: unknown): TipoEntrega | null {
  switch (f) {
    case "DELIVERY_BY_UBER": return "APP_REPARTE";
    case "DELIVERY_BY_MERCHANT": return "RESTAURANTE_REPARTE";
    case "PICKUP": case "DINE_IN": return "RECOGE_CLIENTE";
    default: return null;
  }
}

/**
 * Convierte la respuesta de GET /v1/delivery/order/{id}?expand=carts,deliveries,payment al pedido
 * normalizado. `esUuidConocido` dice si un id de ítem/opción existe en el catálogo del tenant.
 * Precio unitario: `payment.payment_detail.item_charges.price_breakdown` (gross, con IVA), que es
 * lo que pagó el cliente; si no viene, 0.00 y el cajero lo ve.
 */
export function normalizarPedidoUber(orden: unknown, esUuidConocido: (id: string) => boolean): PedidoNormalizado {
  const o = obj(obj(orden).order);
  const detalle = obj(obj(o.payment).payment_detail);
  const breakdown = arr(obj(detalle.item_charges).price_breakdown).map(obj);
  const unitario = (cartItemId: string, tipo: "ITEM" | "OPTION"): string =>
    dec(breakdown.find((b) => b.cart_item_id === cartItemId && b.price_type === tipo)?.unit) ?? "0.00";

  const items: ItemNormalizado[] = [];
  const sinMapear: { nombre_app: string; id_app: string }[] = [];
  for (const cart of arr(o.carts).map(obj)) {
    for (const it of arr(cart.items).map(obj)) {
      const id = str(it.id) ?? "";
      const cartItemId = str(it.cart_item_id) ?? "";
      const nombre = str(it.title) ?? id;
      const conocido = id !== "" && esUuidConocido(id);
      if (!conocido) sinMapear.push({ nombre_app: nombre, id_app: id });
      const modificadores: ModificadorNormalizado[] = [];
      for (const g of arr(it.selected_modifier_groups).map(obj)) {
        for (const sel of arr(g.selected_items).map(obj)) {
          const oid = str(sel.id) ?? "";
          modificadores.push({
            opcion_modificador_id: oid !== "" && esUuidConocido(oid) ? oid : null,
            nombre_app: str(sel.title) ?? oid,
            cantidad: Math.max(1, num(obj(sel.quantity).amount) || 1),
            precio_extra_mxn: unitario(cartItemId, "OPTION"),
          });
        }
      }
      items.push({
        producto_id: conocido ? id : null,
        nombre_app: nombre,
        cantidad: Math.max(1, num(obj(it.quantity).amount) || 1),
        precio_unitario_mxn: unitario(cartItemId, "ITEM"),
        nota: str(obj(it.customer_request).special_instructions),
        ...alergiaDeItem(it.customer_request),
        modificadores,
      });
    }
  }

  const clientes = arr(o.customers).map(obj);
  const cliente = clientes.find((c) => c.is_primary_customer === true) ?? obj(clientes[0]);
  const telefono = obj(obj(cliente.contact).phone);
  const entrega = obj(arr(o.deliveries)[0]);
  const loc = obj(entrega.location);
  const direccion = [str(loc.street_address_line_one), str(loc.street_address_line_two), str(loc.city)].filter(Boolean).join(", ");
  const rango = obj(o.scheduled_order_target_delivery_time_range);
  const primerCarrito = obj(arr(o.carts)[0]);

  return {
    app: "APP_UBEREATS",
    id_externo: str(o.id) ?? "",
    folio_corto: str(o.display_id),
    estado_app: str(o.state),
    tipo_entrega: tipoEntrega(o.fulfillment_type),
    programado_para: o.status === "SCHEDULED" ? str(rango.start_time) : null,
    cliente_nombre: str(obj(cliente.name).display_name),
    cliente_telefono: str(telefono.number),
    cliente_telefono_pin: str(telefono.pin_code),
    direccion_texto: direccion || null,
    nota_cliente: str(primerCarrito.special_instructions) ?? str(o.store_instructions),
    items,
    items_sin_mapear: sinMapear,
    subtotal_mxn: dec(obj(detalle.item_charges).total),
    descuento_app_mxn: dec(obj(detalle.promotions).total),
    descuento_tienda_mxn: null,
    envio_mxn: dec(obj(detalle.fees).total),
    propina_mxn: dec(obj(detalle.tips).total),
    total_cliente_mxn: dec(detalle.order_total),
    total_restaurante_mxn: null,
    efectivo_a_cobrar_mxn: dec(detalle.cash_amount_due) ?? "0.00",
  };
}

export type MotivoRechazo = "AGOTADO" | "CERRADO" | "SATURADO" | "POS_OFFLINE" | "OTRO";
export function motivoRechazoUber(motivo: MotivoRechazo, detalle?: string): { deny_reason: { type: string; info?: string } } {
  const type = { AGOTADO: "ITEM_ISSUE", CERRADO: "STORE_CLOSED", SATURADO: "RESTAURANT_TOO_BUSY", POS_OFFLINE: "POS_OFFLINE", OTRO: "OTHER" }[motivo];
  return { deny_reason: detalle ? { type, info: detalle } : { type } };
}

/** Integración de una tienda (Integration Activation API). `crear` va con el token del dueño; el resto con el de aplicación. */
export type PosDataUber = {
  crear(tokenDueno: string, cuerpo: unknown): Promise<void>;
  actualizar(cuerpo: unknown): Promise<void>;
  leer(): Promise<unknown>;
  borrar(): Promise<void>;
};

export type ClienteUber = {
  obtenerToken(): Promise<string>;
  obtenerOrden(id: string): Promise<unknown>;
  aceptar(id: string, readyTime: string, folio: string): Promise<void>;
  rechazar(id: string, cuerpo: unknown): Promise<void>;
  marcarLista(id: string): Promise<void>;
  /** OAuth authorization_code (scope eats.pos_provisioning): code → token del dueño. */
  canjearCodigo(code: string, redirectUri: string): Promise<{ accessToken: string; venceAt: Date }>;
  /** GET /v1/delivery/stores con el token del dueño, todas las páginas; objetos crudos. */
  listarTiendas(tokenDueno: string): Promise<unknown[]>;
  posData(tiendaId: string): PosDataUber;
  estadoTienda(tiendaId: string): Promise<unknown>;
  /** POST …/update-store-status (pausar/reanudar). Requiere estrategia de estado "external" en Uber. */
  actualizarEstadoTienda(tiendaId: string, cuerpo: unknown): Promise<unknown>;
  /** POST …/update-store-prep-time (default_prep_time en segundos). */
  actualizarPrepTienda(tiendaId: string, cuerpo: unknown): Promise<unknown>;
};

export function crearClienteUber(cfg: {
  entorno: "sandbox" | "produccion";
  clientId: string;
  clientSecret: string;
  fetchFn?: typeof fetch;
  tokenCache?: { leer(): Promise<string | null>; guardar(token: string, venceAt: Date): Promise<void> };
}): ClienteUber {
  const f = cfg.fetchFn ?? fetch;
  const dom = DOMINIOS[cfg.entorno];
  let enMemoria: string | null = null;

  const obtenerToken = async (): Promise<string> => {
    if (enMemoria) return enMemoria;
    const cacheado = await cfg.tokenCache?.leer();
    if (cacheado) { enMemoria = cacheado; return cacheado; }
    const body = new URLSearchParams({
      client_id: cfg.clientId, client_secret: cfg.clientSecret,
      grant_type: "client_credentials", scope: "eats.store eats.order eats.store.status.write",
    });
    const r = await f(`${dom.auth}/oauth/v2/token`, { method: "POST", body });
    if (!r.ok) throw new Error(`UBER_TOKEN_${r.status}`);
    const j = obj(await r.json());
    const token = str(j.access_token);
    if (!token) throw new Error("UBER_TOKEN_SIN_ACCESS_TOKEN");
    // 30 días según Uber; se renueva un día antes para no operar con un token a punto de vencer.
    const vence = new Date(Date.now() + Math.max(60, num(j.expires_in) - 86_400) * 1000);
    await cfg.tokenCache?.guardar(token, vence);
    enMemoria = token;
    return token;
  };

  type Metodo = "GET" | "POST" | "PATCH" | "DELETE";
  const llamar = async (metodo: Metodo, ruta: string, cuerpo?: unknown, tokenExplicito?: string): Promise<Response> => {
    const token = tokenExplicito ?? await obtenerToken();
    const r = await f(`${dom.api}${ruta}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    if (r.status === 409) throw new Error(`YA_PROCESADA:${ruta}`);
    if (!r.ok) throw new Error(`UBER_HTTP_${r.status}:${ruta}:${(await r.text()).slice(0, 300)}`);
    return r;
  };

  const canjearCodigo = async (code: string, redirectUri: string) => {
    const body = new URLSearchParams({
      client_id: cfg.clientId, client_secret: cfg.clientSecret,
      grant_type: "authorization_code", code, redirect_uri: redirectUri,
    });
    const r = await f(`${dom.auth}/oauth/v2/token`, { method: "POST", body });
    if (!r.ok) throw new Error(`UBER_CANJE_${r.status}:${(await r.text()).slice(0, 300)}`);
    const j = obj(await r.json());
    const accessToken = str(j.access_token);
    if (!accessToken) throw new Error("UBER_CANJE_SIN_ACCESS_TOKEN");
    return { accessToken, venceAt: new Date(Date.now() + Math.max(60, num(j.expires_in)) * 1000) };
  };

  const listarTiendas = async (tokenDueno: string): Promise<unknown[]> => {
    const todas: unknown[] = [];
    let pagina: string | null = null;
    for (let i = 0; i < 20; i++) {
      const q = pagina ? `?page_size=50&next_page_token=${encodeURIComponent(pagina)}` : "?page_size=50";
      const j = obj(await (await llamar("GET", `/v1/delivery/stores${q}`, undefined, tokenDueno)).json());
      todas.push(...arr(j.stores));
      pagina = str(obj(j.pagination_data).next_page_token);
      if (!pagina) break;
    }
    return todas;
  };

  const posData = (tiendaId: string): PosDataUber => {
    const ruta = `/v1/eats/stores/${encodeURIComponent(tiendaId)}/pos_data`;
    return {
      crear: async (tokenDueno, cuerpo) => { await llamar("POST", ruta, cuerpo, tokenDueno); },
      actualizar: async (cuerpo) => { await llamar("PATCH", ruta, cuerpo); },
      leer: async () => (await llamar("GET", ruta)).json(),
      borrar: async () => { await llamar("DELETE", ruta); },
    };
  };

  return {
    obtenerToken,
    canjearCodigo,
    listarTiendas,
    posData,
    estadoTienda: async (tiendaId) => (await llamar("GET", `/v1/delivery/store/${encodeURIComponent(tiendaId)}/status`)).json(),
    actualizarEstadoTienda: async (tiendaId, cuerpo) => (await llamar("POST", `/v1/delivery/store/${encodeURIComponent(tiendaId)}/update-store-status`, cuerpo)).json(),
    actualizarPrepTienda: async (tiendaId, cuerpo) => (await llamar("POST", `/v1/delivery/store/${encodeURIComponent(tiendaId)}/update-store-prep-time`, cuerpo)).json(),
    obtenerOrden: async (id) => (await llamar("GET", `/v1/delivery/order/${encodeURIComponent(id)}?expand=carts,deliveries,payment`)).json(),
    aceptar: async (id, readyTime, folio) => {
      await llamar("POST", `/v1/delivery/order/${encodeURIComponent(id)}/accept`, { ready_for_pickup_time: readyTime, external_reference_id: folio });
    },
    rechazar: async (id, cuerpo) => { await llamar("POST", `/v1/delivery/order/${encodeURIComponent(id)}/deny`, cuerpo); },
    marcarLista: async (id) => { await llamar("POST", `/v1/delivery/order/${encodeURIComponent(id)}/ready`, {}); },
  };
}
