import test from "node:test";
import assert from "node:assert/strict";
import { e5ADecimal, normalizarPedidoUber, motivoRechazoUber, crearClienteUber, segundosAReadyTime } from "./uber.ts";

const PROD = "11111111-1111-4111-8111-111111111111";
const OPCION = "22222222-2222-4222-8222-222222222222";

/** Orden de restaurante recortada de order-fulfillment-api.openapi.json (restaurant_order). */
const ORDEN = {
  order: {
    id: "bd1ed236-ee79-11ed-a05b-0242ac12A003",
    display_id: "2A003",
    state: "OFFERED",
    status: "ACTIVE",
    fulfillment_type: "DELIVERY_BY_UBER",
    store: { id: "store-1", name: "Knock-Out" },
    customers: [{ id: "c1", name: { display_name: "Uber L", first_name: "Uber", last_name: "L" },
      contact: { phone: { number: "+52-477-000-0000", pin_code: "888 52 337", country_iso2: "MX" } }, is_primary_customer: true }],
    deliveries: [{ id: "d1", status: "SCHEDULED", location: { street_address_line_one: "Blvd. Campestre 100", city: "León" } }],
    carts: [{
      id: "cart1",
      special_instructions: "Tocar el timbre",
      items: [
        { id: PROD, cart_item_id: "ci1", title: "Hamburguesa Clásica", quantity: { amount: 2 },
          customer_request: { special_instructions: "sin cebolla" },
          selected_modifier_groups: [{ id: "g1", title: "Extras",
            selected_items: [{ id: OPCION, title: "Extra queso", quantity: { amount: 1 } }] }] },
        { id: "no-existe", cart_item_id: "ci2", title: "Malteada", quantity: { amount: 1 }, selected_modifier_groups: [] },
      ],
    }],
    payment: { payment_detail: {
      currency_code: "MXN",
      order_total: { gross: { amount_e5: 34000000 } },
      item_charges: { total: { gross: { amount_e5: 32000000 } },
        price_breakdown: [
          { cart_item_id: "ci1", price_type: "ITEM", quantity: { amount: 2 }, unit: { gross: { amount_e5: 15000000 } } },
          { cart_item_id: "ci1", price_type: "OPTION", quantity: { amount: 1 }, unit: { gross: { amount_e5: 2000000 } } },
          { cart_item_id: "ci2", price_type: "ITEM", quantity: { amount: 1 }, unit: { gross: { amount_e5: 4500000 } } },
        ] },
      fees: { total: { gross: { amount_e5: 2500000 } } },
      tips: { total: { gross: { amount_e5: 1000000 } } },
      promotions: { total: { gross: { amount_e5: 500000 } } },
      cash_amount_due: { gross: { amount_e5: 0 } },
    } },
    created_time: "2026-09-02T10:00:00.000Z",
  },
};

test("e5ADecimal: 750000 → 7.50, redondeo a centavos, sin flotantes raros", () => {
  assert.equal(e5ADecimal(750000), "7.50");
  assert.equal(e5ADecimal(34000000), "340.00");
  assert.equal(e5ADecimal(123456), "1.23");
  assert.equal(e5ADecimal(0), "0.00");
});

test("normalizarPedidoUber: ítems por uuid, precio unitario de la app, sin mapear aparte", () => {
  const p = normalizarPedidoUber(ORDEN, (id) => id === PROD || id === OPCION);
  assert.equal(p.app, "APP_UBEREATS");
  assert.equal(p.id_externo, "bd1ed236-ee79-11ed-a05b-0242ac12A003");
  assert.equal(p.folio_corto, "2A003");
  assert.equal(p.tipo_entrega, "APP_REPARTE");
  assert.equal(p.cliente_nombre, "Uber L");
  assert.equal(p.cliente_telefono_pin, "888 52 337");
  assert.equal(p.nota_cliente, "Tocar el timbre");
  assert.equal(p.items.length, 2);
  assert.equal(p.items[0].producto_id, PROD);
  assert.equal(p.items[0].cantidad, 2);
  assert.equal(p.items[0].precio_unitario_mxn, "150.00");
  assert.equal(p.items[0].nota, "sin cebolla");
  assert.equal(p.items[0].modificadores[0].opcion_modificador_id, OPCION);
  assert.equal(p.items[0].modificadores[0].precio_extra_mxn, "20.00");
  assert.equal(p.items[1].producto_id, null);
  assert.equal(p.items[1].precio_unitario_mxn, "45.00");
  assert.deepEqual(p.items_sin_mapear, [{ nombre_app: "Malteada", id_app: "no-existe" }]);
  assert.equal(p.total_cliente_mxn, "340.00");
  assert.equal(p.subtotal_mxn, "320.00");
  assert.equal(p.propina_mxn, "10.00");
  assert.equal(p.envio_mxn, "25.00");
  assert.equal(p.descuento_app_mxn, "5.00");
  assert.equal(p.efectivo_a_cobrar_mxn, "0.00");
});

test("normalizarPedidoUber: pickup y BYOC se clasifican", () => {
  const pickup = structuredClone(ORDEN); pickup.order.fulfillment_type = "PICKUP";
  assert.equal(normalizarPedidoUber(pickup, () => true).tipo_entrega, "RECOGE_CLIENTE");
  const byoc = structuredClone(ORDEN); byoc.order.fulfillment_type = "DELIVERY_BY_MERCHANT";
  assert.equal(normalizarPedidoUber(byoc, () => true).tipo_entrega, "RESTAURANTE_REPARTE");
});

test("motivoRechazoUber mapea al catálogo de deny_reason.type", () => {
  assert.deepEqual(motivoRechazoUber("AGOTADO", "sin pan"), { deny_reason: { type: "ITEM_ISSUE", info: "sin pan" } });
  assert.equal(motivoRechazoUber("CERRADO").deny_reason.type, "STORE_CLOSED");
  assert.equal(motivoRechazoUber("SATURADO").deny_reason.type, "RESTAURANT_TOO_BUSY");
  assert.equal(motivoRechazoUber("POS_OFFLINE").deny_reason.type, "POS_OFFLINE");
  assert.equal(motivoRechazoUber("OTRO", "x").deny_reason.type, "OTHER");
});

test("segundosAReadyTime: ahora + minutos en RFC3339 UTC", () => {
  assert.equal(segundosAReadyTime(new Date("2026-09-02T10:00:00.000Z"), 15), "2026-09-02T10:15:00.000Z");
});

test("crearClienteUber: token client_credentials en el dominio del entorno, cacheado; aceptar manda ready time y folio", async () => {
  const llamadas: { url: string; init: RequestInit }[] = [];
  const fetchFn: typeof fetch = async (url, init) => {
    llamadas.push({ url: String(url), init: init ?? {} });
    if (String(url).endsWith("/oauth/v2/token")) {
      return new Response(JSON.stringify({ access_token: "TOK", expires_in: 2592000, token_type: "Bearer" }), { status: 200 });
    }
    return new Response("", { status: 200 });
  };
  let guardado: { t: string; v: Date } | null = null;
  const cliente = crearClienteUber({
    entorno: "sandbox", clientId: "id", clientSecret: "sec", fetchFn,
    tokenCache: { leer: async () => guardado?.t ?? null, guardar: async (t, v) => { guardado = { t, v }; } },
  });
  await cliente.aceptar("ord-1", "2026-09-02T10:15:00.000Z", "K-0001");
  assert.equal(llamadas[0].url, "https://sandbox-login.uber.com/oauth/v2/token");
  assert.equal(llamadas[1].url, "https://test-api.uber.com/v1/delivery/order/ord-1/accept");
  assert.equal((llamadas[1].init.headers as Record<string, string>).Authorization, "Bearer TOK");
  assert.deepEqual(JSON.parse(String(llamadas[1].init.body)), { ready_for_pickup_time: "2026-09-02T10:15:00.000Z", external_reference_id: "K-0001" });
  assert.ok(guardado, "guardó el token en el cache");
  await cliente.marcarLista("ord-1");
  assert.equal(llamadas.length, 3, "la segunda llamada reutiliza el token cacheado");
  assert.equal(llamadas[2].url, "https://test-api.uber.com/v1/delivery/order/ord-1/ready");
});

test("crearClienteUber: 409 al aceptar se reporta como YA_PROCESADA", async () => {
  const fetchFn: typeof fetch = async (url) =>
    String(url).endsWith("/token") ? new Response(JSON.stringify({ access_token: "T", expires_in: 100 }), { status: 200 })
      : new Response(JSON.stringify({ code: "resource_status_conflict" }), { status: 409 });
  const c = crearClienteUber({ entorno: "sandbox", clientId: "i", clientSecret: "s", fetchFn });
  await assert.rejects(() => c.aceptar("o", "2026-09-02T10:15:00.000Z", "f"), /YA_PROCESADA/);
});
