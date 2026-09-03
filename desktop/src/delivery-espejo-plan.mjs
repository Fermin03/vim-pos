// Planificador del espejo de pedidos de apps (spec 2026-09-03). Puro: decide qué filas espejar,
// qué tickets crear en la caja y qué avisos dejar. Sin I/O, se prueba con node --test.

/** Columnas de delivery_pedidos que se espejan (0090 + 0096). ticket_id y payload_raw se tratan aparte. */
export const COLUMNAS_PEDIDO = [
  "id", "tenant_id", "sucursal_id", "conexion_id", "app", "id_externo", "folio_corto", "estado", "estado_app",
  "tipo_entrega", "programado_para", "vence_aceptacion", "cliente_nombre", "cliente_telefono", "cliente_telefono_pin",
  "direccion_texto", "nota_cliente", "items", "items_sin_mapear", "subtotal_mxn", "descuento_app_mxn",
  "descuento_tienda_mxn", "envio_mxn", "propina_mxn", "total_cliente_mxn", "total_restaurante_mxn",
  "efectivo_a_cobrar_mxn", "repartidor_nombre", "repartidor_telefono", "repartidor_estado", "recibido_at",
  "aceptado_at", "listo_at", "entregado_at", "cancelado_at", "motivo_cancelacion", "cancelado_por", "ultimo_error",
  "created_at", "gestion", "gestion_caja_id",
];

/** Columnas de delivery_conexiones que se espejan (sin credenciales). */
export const COLUMNAS_CONEXION = [
  "id", "tenant_id", "sucursal_id", "marca_virtual_id", "app", "estado", "tienda_id_externo", "tienda_nombre_app",
  "auto_aceptar", "tiempo_prep_min", "config", "ultimo_evento_at", "ultimo_error", "conectada_at", "desconectada_at",
  "created_at", "updated_at",
];

const CERRADOS_POR_LA_APP = new Set(["CANCELADO", "EXPIRADO"]);

/** Fila local a partir de la fila de la nube: conserva el ticket local, payload vacío. */
export function filaLocal(pedido, local) {
  const fila = {};
  for (const c of COLUMNAS_PEDIDO) fila[c] = pedido[c] === undefined ? null : pedido[c];
  fila.items = pedido.items ?? [];
  fila.payload_raw = {};
  fila.ticket_id = local?.ticket_id ?? null;
  return fila;
}

/** ¿Se puede crear el ticket local? Todos los ítems mapeados o hay producto genérico. */
export function puedeCrear(pedido, conexion) {
  const sinMapear = Array.isArray(pedido.items_sin_mapear) ? pedido.items_sin_mapear.length : 0;
  const generico = conexion?.config && typeof conexion.config === "object" ? conexion.config.producto_generico_id : null;
  return sinMapear === 0 || (typeof generico === "string" && generico.length > 0);
}

/**
 * planificarEspejo({ conexiones, pedidos, localPedidos, turnoAbierto, cajaId })
 *  → { upserts, aCrear, avisos }
 *  - upserts: filas locales de todos los pedidos recibidos de la nube.
 *  - aCrear: ids de pedidos ESCRITORIO (de esta caja o sin reclamar) sin ticket local, que toca
 *    crear ya: ACEPTADO (lo aceptó la nube por orden del cajero) o RECIBIDO con auto-aceptar,
 *    turno abierto y posibilidad de crearlo. Ordenados por vencimiento.
 *  - avisos: pedidos que la app cerró (CANCELADO/EXPIRADO) y que tienen ticket local.
 */
export function planificarEspejo({ conexiones = [], pedidos = [], localPedidos = [], turnoAbierto = false, cajaId }) {
  const porId = new Map(localPedidos.map((l) => [l.id, l]));
  const conexionDe = new Map(conexiones.map((c) => [c.id, c]));
  const upserts = [];
  const candidatos = [];
  const avisos = [];
  for (const p of pedidos) {
    const local = porId.get(p.id);
    upserts.push(filaLocal(p, local));
    const conTicketLocal = Boolean(local?.ticket_id);
    if (CERRADOS_POR_LA_APP.has(p.estado) && conTicketLocal) {
      avisos.push({ pedidoId: p.id, motivo: "La app canceló este pedido: cancela el ticket en caja" });
      continue;
    }
    if (p.gestion !== "ESCRITORIO" || conTicketLocal) continue;
    if (p.gestion_caja_id && p.gestion_caja_id !== cajaId) continue;
    const cx = conexionDe.get(p.conexion_id);
    const porCajero = p.estado === "ACEPTADO";
    const autoOk = p.estado === "RECIBIDO" && cx?.auto_aceptar === true && turnoAbierto && puedeCrear(p, cx);
    if (porCajero || autoOk) candidatos.push(p);
  }
  candidatos.sort((a, b) => String(a.vence_aceptacion ?? "").localeCompare(String(b.vence_aceptacion ?? "")));
  return { upserts, aCrear: candidatos.map((p) => p.id), avisos };
}
