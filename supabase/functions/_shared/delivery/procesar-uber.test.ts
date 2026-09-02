import test from "node:test";
import assert from "node:assert/strict";
import { procesarNotificacionUber, type DepsProceso } from "./procesar-uber.ts";

const PROD = "11111111-1111-4111-8111-111111111111";
const ORDEN = { order: { id: "ord-1", display_id: "2A003", state: "OFFERED", status: "ACTIVE", fulfillment_type: "DELIVERY_BY_UBER",
  store: { id: "store-1" }, customers: [], deliveries: [],
  carts: [{ id: "c", items: [{ id: PROD, cart_item_id: "ci1", title: "Hamburguesa", quantity: { amount: 1 }, selected_modifier_groups: [] }] }],
  payment: { payment_detail: { order_total: { gross: { amount_e5: 15000000 } }, item_charges: { total: { gross: { amount_e5: 15000000 } },
    price_breakdown: [{ cart_item_id: "ci1", price_type: "ITEM", quantity: { amount: 1 }, unit: { gross: { amount_e5: 15000000 } } }] } } } } };

type Fila = Record<string, unknown>;

/** BD de mentira: tablas en memoria y RPCs contadas. Imita solo las cadenas de supabase-js que usa el proceso. */
function dbFalsa(opts: { conexion: Fila | null; turnoAbierto: boolean; productos: string[] }) {
  const pedidos: Fila[] = [];
  const rpcs: { fn: string; args: unknown }[] = [];
  const consulta = (tabla: string, filtros: Fila) => {
    const resolver = () => {
      if (tabla === "delivery_conexiones") return opts.conexion && opts.conexion.tienda_id_externo === filtros.tienda_id_externo ? [opts.conexion] : [];
      if (tabla === "delivery_pedidos") return pedidos.filter((p) => p.id_externo === filtros.id_externo);
      if (tabla === "turnos") return opts.turnoAbierto ? [{ id: "t1" }] : [];
      if (tabla === "productos") return opts.productos.filter((id) => (filtros.__in as unknown[]).includes(id)).map((id) => ({ id }));
      return [];
    };
    const cadena = {
      eq: (col: string, val: unknown) => consulta(tabla, { ...filtros, [col]: val }),
      in: (_col: string, vals: unknown[]) => ({ data: consulta(tabla, { ...filtros, __in: vals }).__rows(), error: null }),
      maybeSingle: async () => ({ data: resolver()[0] ?? null, error: null }),
      limit: async () => ({ data: resolver(), error: null }),
      __rows: () => resolver(),
    };
    return cadena;
  };
  const db = {
    from: (tabla: string) => ({
      select: () => consulta(tabla, {}),
      insert: (fila: Fila) => ({ select: () => ({ single: async () => { const f = { id: `ped-${pedidos.length + 1}`, ...fila }; pedidos.push(f); return { data: f, error: null }; } }) }),
      update: (cambios: Fila) => ({ eq: async (_c: string, id: unknown) => { const p = pedidos.find((x) => x.id === id); if (p) Object.assign(p, cambios); return { error: null }; } }),
    }),
    rpc: async (fn: string, args: unknown) => { rpcs.push({ fn, args }); return { data: "ticket-1", error: null }; },
  };
  return { db: db as unknown as DepsProceso["db"], pedidos, rpcs };
}

const uberFalso = (hooks: { aceptar?: (id: string) => void; obtener?: () => void } = {}): DepsProceso["uber"] => ({
  obtenerToken: async () => "t",
  obtenerOrden: async () => { hooks.obtener?.(); return ORDEN; },
  aceptar: async (id) => { hooks.aceptar?.(id); },
  rechazar: async () => {},
  marcarLista: async () => {},
});

const evento = { event_id: "ev-1", event_type: "orders.notification", event_time: 1, meta: { user_id: "store-1", resource_id: "ord-1", status: "pos" },
  resource_href: "https://test-api.uber.com/v1/delivery/order/ord-1" };
const conexionActiva = { id: "cx", tenant_id: "T", sucursal_id: "S", estado: "ACTIVA", tienda_id_externo: "store-1", auto_aceptar: true, tiempo_prep_min: 12, config: {} };

test("con conexión activa, auto_aceptar y turno abierto: crea el pedido, el ticket y acepta en Uber", async () => {
  const falsa = dbFalsa({ conexion: conexionActiva, turnoAbierto: true, productos: [PROD] });
  const aceptadas: string[] = [];
  const r = await procesarNotificacionUber({ db: falsa.db, uber: uberFalso({ aceptar: (id) => aceptadas.push(id) }), ahora: () => new Date("2026-09-02T10:00:00Z") }, evento);
  assert.equal(r.accion, "ACEPTADO_AUTO");
  assert.deepEqual(aceptadas, ["ord-1"]);
  assert.equal(falsa.rpcs[0].fn, "crear_ticket_desde_app");
  assert.equal(falsa.pedidos[0].estado, "RECIBIDO");
  assert.equal(falsa.pedidos[0].vence_aceptacion, "2026-09-02T10:11:00.000Z");
  assert.equal((falsa.pedidos[0].items as { producto_id: string }[])[0].producto_id, PROD);
});

test("sin turno abierto: el pedido queda RECIBIDO para el cajero y NO se acepta en Uber", async () => {
  const falsa = dbFalsa({ conexion: conexionActiva, turnoAbierto: false, productos: [PROD] });
  let acepto = false;
  const r = await procesarNotificacionUber({ db: falsa.db, uber: uberFalso({ aceptar: () => { acepto = true; } }), ahora: () => new Date() }, evento);
  assert.equal(r.accion, "PENDIENTE_CAJERO");
  assert.equal(acepto, false);
  assert.equal(falsa.rpcs.length, 0);
  assert.equal(falsa.pedidos.length, 1);
});

test("producto desconocido y sin genérico: pendiente del cajero, con items_sin_mapear", async () => {
  const falsa = dbFalsa({ conexion: conexionActiva, turnoAbierto: true, productos: [] });
  const r = await procesarNotificacionUber({ db: falsa.db, uber: uberFalso(), ahora: () => new Date() }, evento);
  assert.equal(r.accion, "PENDIENTE_CAJERO");
  assert.deepEqual(falsa.pedidos[0].items_sin_mapear, [{ nombre_app: "Hamburguesa", id_app: PROD }]);
});

test("tienda desconocida: SIN_CONEXION y no se llama a Uber", async () => {
  const falsa = dbFalsa({ conexion: null, turnoAbierto: true, productos: [] });
  let llamo = false;
  const r = await procesarNotificacionUber({ db: falsa.db, uber: uberFalso({ obtener: () => { llamo = true; } }), ahora: () => new Date() }, evento);
  assert.equal(r.accion, "SIN_CONEXION");
  assert.equal(llamo, false);
});

test("el mismo pedido dos veces: DUPLICADO sin volver a insertar", async () => {
  const falsa = dbFalsa({ conexion: conexionActiva, turnoAbierto: true, productos: [PROD] });
  const deps = { db: falsa.db, uber: uberFalso(), ahora: () => new Date() };
  await procesarNotificacionUber(deps, evento);
  const r = await procesarNotificacionUber(deps, evento);
  assert.equal(r.accion, "DUPLICADO");
  assert.equal(falsa.pedidos.length, 1);
});
