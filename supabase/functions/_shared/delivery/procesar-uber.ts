// Qué hacer con un webhook de Uber ya autenticado. Separado del handler HTTP para probarlo con una
// BD de mentira. Regla: primero persistir (idempotente por id_externo), luego decidir.
import type { ClienteUber } from "./uber.ts";
import { normalizarPedidoUber, segundosAReadyTime } from "./uber.ts";
import type { PedidoNormalizado } from "./tipos.ts";

type Dict = Record<string, unknown>;
type Resultado = { data: unknown; error: unknown };

// Subconjunto de supabase-js que usamos; permite el doble de pruebas sin arrastrar el cliente real.
export type DbMinima = {
  from(tabla: string): {
    select(cols?: string): {
      eq(col: string, val: unknown): {
        eq(col: string, val: unknown): {
          maybeSingle(): Promise<Resultado>;
          limit(n: number): Promise<Resultado>;
        };
        in(col: string, vals: unknown[]): Promise<Resultado> | Resultado;
        maybeSingle(): Promise<Resultado>;
      };
    };
    insert(fila: Dict): { select(cols?: string): { single(): Promise<Resultado> } };
    update(cambios: Dict): { eq(col: string, val: unknown): Promise<{ error: unknown }> };
  };
  rpc(fn: string, args: Dict): Promise<Resultado>;
};
export type DepsProceso = { db: DbMinima; uber: ClienteUber; ahora: () => Date };
export type ResultadoProceso = {
  pedido_id: string | null;
  accion: "ACEPTADO_AUTO" | "PENDIENTE_CAJERO" | "PENDIENTE_ESCRITORIO" | "DUPLICADO" | "SIN_CONEXION" | "ERROR";
  detalle?: string;
};

const VENTANA_UBER_MIN = 11; // 11.5 según Uber; 30 s de margen

const obj = (v: unknown): Dict => (v && typeof v === "object" && !Array.isArray(v) ? (v as Dict) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const errMsg = (e: unknown): string => (e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function filaPedido(p: PedidoNormalizado, cx: Dict, recibidoAt: Date, payloadRaw: unknown): Dict {
  return {
    tenant_id: cx.tenant_id, sucursal_id: cx.sucursal_id, conexion_id: cx.id, app: "APP_UBEREATS",
    id_externo: p.id_externo, folio_corto: p.folio_corto, estado: "RECIBIDO", estado_app: p.estado_app,
    tipo_entrega: p.tipo_entrega, programado_para: p.programado_para,
    vence_aceptacion: new Date(recibidoAt.getTime() + VENTANA_UBER_MIN * 60_000).toISOString(),
    cliente_nombre: p.cliente_nombre, cliente_telefono: p.cliente_telefono, cliente_telefono_pin: p.cliente_telefono_pin,
    direccion_texto: p.direccion_texto, nota_cliente: p.nota_cliente,
    items: p.items, items_sin_mapear: p.items_sin_mapear.length ? p.items_sin_mapear : null,
    subtotal_mxn: p.subtotal_mxn, descuento_app_mxn: p.descuento_app_mxn, descuento_tienda_mxn: p.descuento_tienda_mxn,
    envio_mxn: p.envio_mxn, propina_mxn: p.propina_mxn, total_cliente_mxn: p.total_cliente_mxn,
    total_restaurante_mxn: p.total_restaurante_mxn, efectivo_a_cobrar_mxn: p.efectivo_a_cobrar_mxn,
    payload_raw: payloadRaw, recibido_at: recibidoAt.toISOString(),
  };
}

/** Ids de ítem y de opción que trae la orden, para preguntar al catálogo de una sola vez. */
function idsDeLaOrden(orden: unknown): string[] {
  const ids = new Set<string>();
  for (const cart of arr(obj(obj(orden).order).carts).map(obj)) {
    for (const it of arr(cart.items).map(obj)) {
      if (typeof it.id === "string") ids.add(it.id);
      for (const g of arr(it.selected_modifier_groups).map(obj)) {
        for (const s of arr(g.selected_items).map(obj)) if (typeof s.id === "string") ids.add(s.id);
      }
    }
  }
  return [...ids].filter((id) => UUID_RE.test(id));
}

export async function procesarNotificacionUber(deps: DepsProceso, evento: unknown): Promise<ResultadoProceso> {
  const ev = obj(evento);
  const meta = obj(ev.meta);
  const storeId = typeof meta.user_id === "string" ? meta.user_id : "";
  const orderId = typeof meta.resource_id === "string" ? meta.resource_id : "";
  if (!storeId || !orderId) return { pedido_id: null, accion: "ERROR", detalle: "evento sin meta.user_id/resource_id" };

  // 1) ¿A qué sucursal pertenece la tienda?
  const { data: cxData } = await deps.db.from("delivery_conexiones").select("*").eq("app", "APP_UBEREATS").eq("tienda_id_externo", storeId).maybeSingle();
  const cx = obj(cxData);
  if (!cx.id) return { pedido_id: null, accion: "SIN_CONEXION", detalle: `store ${storeId}` };

  // 2) ¿Ya lo teníamos? (reintentos de Uber, eventos fuera de orden)
  const { data: existente } = await deps.db.from("delivery_pedidos").select("id, estado").eq("app", "APP_UBEREATS").eq("id_externo", orderId).maybeSingle();
  if (obj(existente).id) return { pedido_id: String(obj(existente).id), accion: "DUPLICADO" };

  // 3) Traer la orden completa y normalizar contra el catálogo del tenant.
  let orden: unknown;
  try { orden = await deps.uber.obtenerOrden(orderId); }
  catch (e) { return { pedido_id: null, accion: "ERROR", detalle: `obtenerOrden: ${errMsg(e)}` }; }
  const uuids = idsDeLaOrden(orden);
  const conocidos = new Set<string>();
  if (uuids.length) {
    const r1 = await deps.db.from("productos").select("id").eq("tenant_id", cx.tenant_id).in("id", uuids);
    for (const f of arr(obj(r1).data).map(obj)) if (typeof f.id === "string") conocidos.add(f.id);
    const r2 = await deps.db.from("opciones_modificador").select("id").eq("tenant_id", cx.tenant_id).in("id", uuids);
    for (const f of arr(obj(r2).data).map(obj)) if (typeof f.id === "string") conocidos.add(f.id);
  }
  const pedido = normalizarPedidoUber(orden, (id) => conocidos.has(id));

  // 4) Persistir el pedido (RECIBIDO) antes de cualquier decisión.
  const ahora = deps.ahora();
  const { data: insertado, error: errIns } = await deps.db.from("delivery_pedidos").insert(filaPedido(pedido, cx, ahora, orden)).select("id").single();
  if (errIns || !obj(insertado).id) return { pedido_id: null, accion: "ERROR", detalle: `insert pedido: ${errMsg(errIns)}` };
  const pedidoId = String(obj(insertado).id);

  // 4b) ¿Hay una caja instalada viva en la sucursal? Entonces el ticket se crea allá (espejo,
  // spec 2026-09-03): la nube no auto-acepta ni crea ticket; el agente de la caja lo hace.
  const { data: espejo } = await deps.db.rpc("sucursal_con_espejo", { p_sucursal: cx.sucursal_id });
  if (espejo === true) {
    await deps.db.from("delivery_pedidos").update({ gestion: "ESCRITORIO" }).eq("id", pedidoId);
    return { pedido_id: pedidoId, accion: "PENDIENTE_ESCRITORIO" };
  }

  // 5) ¿Auto-aceptar? Solo con turno abierto en la sucursal; si no, que decida el cajero.
  const { data: turnos } = await deps.db.from("turnos").select("id").eq("sucursal_id", cx.sucursal_id).eq("estado", "ABIERTO").limit(1);
  const hayTurno = arr(turnos).length > 0;
  const generico = typeof obj(cx.config).producto_generico_id === "string";
  const puedeCrear = pedido.items_sin_mapear.length === 0 || generico;
  if (cx.auto_aceptar !== true || !hayTurno || !puedeCrear) return { pedido_id: pedidoId, accion: "PENDIENTE_CAJERO" };

  const { error: errRpc } = await deps.db.rpc("crear_ticket_desde_app", { p_pedido_id: pedidoId });
  if (errRpc) {
    await deps.db.rpc("delivery_pedido_transicion", { p_pedido_id: pedidoId, p_estado: "ERROR", p_detalle: errMsg(errRpc) });
    return { pedido_id: pedidoId, accion: "ERROR", detalle: `crear_ticket_desde_app: ${errMsg(errRpc)}` };
  }
  try {
    await deps.uber.aceptar(orderId, segundosAReadyTime(ahora, Number(cx.tiempo_prep_min) || 15), pedido.folio_corto ?? pedidoId);
  } catch (e) {
    if (!errMsg(e).startsWith("YA_PROCESADA")) {
      await deps.db.rpc("delivery_pedido_transicion", { p_pedido_id: pedidoId, p_estado: "ERROR", p_detalle: `aceptar en Uber: ${errMsg(e)}` });
      return { pedido_id: pedidoId, accion: "ERROR", detalle: errMsg(e) };
    }
  }
  return { pedido_id: pedidoId, accion: "ACEPTADO_AUTO" };
}
