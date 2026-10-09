// Planificador del espejo de pedidos de apps (spec 2026-09-03). Puro: decide qué filas espejar,
// qué tickets crear en la caja y qué avisos dejar. Sin I/O, se prueba con node --test.

/**
 * Columnas de delivery_pedidos que se espejan (0090 + 0096, y las de la tienda en línea de la
 * 0161). ticket_id y payload_raw se tratan aparte.
 */
export const COLUMNAS_PEDIDO = [
  "id", "tenant_id", "sucursal_id", "conexion_id", "app", "id_externo", "folio_corto", "estado", "estado_app",
  "tipo_entrega", "programado_para", "vence_aceptacion", "cliente_nombre", "cliente_telefono", "cliente_telefono_pin",
  "direccion_texto", "nota_cliente", "items", "items_sin_mapear", "subtotal_mxn", "descuento_app_mxn",
  "descuento_tienda_mxn", "envio_mxn", "propina_mxn", "total_cliente_mxn", "total_restaurante_mxn",
  "efectivo_a_cobrar_mxn", "repartidor_nombre", "repartidor_telefono", "repartidor_estado", "recibido_at",
  "aceptado_at", "listo_at", "entregado_at", "cancelado_at", "motivo_cancelacion", "cancelado_por", "ultimo_error",
  "created_at", "gestion", "gestion_caja_id",
  "canal", "cliente_email", "tienda_cuenta_id", "zona_envio_id", "direccion", "pago_al_recibir", "paga_con_mxn",
];

/** Columnas de delivery_conexiones que se espejan (sin credenciales). */
export const COLUMNAS_CONEXION = [
  "id", "tenant_id", "sucursal_id", "marca_virtual_id", "app", "estado", "tienda_id_externo", "tienda_nombre_app",
  "auto_aceptar", "tiempo_prep_min", "config", "ultimo_evento_at", "ultimo_error", "conectada_at", "desconectada_at",
  "created_at", "updated_at",
];

const CERRADOS_POR_LA_APP = new Set(["CANCELADO", "EXPIRADO"]);
/** Un pedido de la tienda también se cierra por rechazo (del cajero en otro equipo, o de la nube). */
const CERRADOS_DE_TIENDA = new Set(["CANCELADO", "EXPIRADO", "RECHAZADO"]);
const TICKET_CERRADO = new Set(["CANCELADO", "PAGADO", "FACTURADO"]);

/** Fila local a partir de la fila de la nube: conserva el ticket local, payload vacío. */
export function filaLocal(pedido, local) {
  const fila = {};
  for (const c of COLUMNAS_PEDIDO) fila[c] = pedido[c] === undefined ? null : pedido[c];
  fila.items = pedido.items ?? [];
  // Una nube anterior a la tienda no manda `canal`, y en la base local es NOT NULL.
  fila.canal = pedido.canal ?? "APP";
  // Lo que la caja le explicó al cajero al cancelar un pedido de la tienda vive solo aquí: la
  // nube lo manda vacío, y sin esto el siguiente espejo lo borraría.
  if (fila.canal === "TIENDA" && CERRADOS_DE_TIENDA.has(pedido.estado)) fila.ultimo_error = pedido.ultimo_error ?? local?.ultimo_error ?? null;
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
 *  - aAceptar: pedidos ESCRITORIO de esta caja que SIGUEN en RECIBIDO en la nube pero ya tienen
 *    ticket local: el accept en la app falló después de crear el ticket (red, Uber caído). Antes
 *    el `conTicketLocal` los saltaba para siempre y la cocina preparaba un pedido que Uber acababa
 *    cancelando por no aceptado (Auditoría integral 30/09/2026, D7). Se reintenta el accept.
 *  - avisos: pedidos que la app cerró (CANCELADO/EXPIRADO) y que tienen ticket local.
 *
 * Los pedidos de la tienda en línea (`canal === 'TIENDA'`) siguen el mismo recorrido con tres
 * diferencias: no tienen conexión, así que quien dice si se aceptan solos es `tienda.aceptacion`
 * (la clave `tienda` de la respuesta del sondeo; `null` en una nube vieja o sin tienda → nunca
 * solos); un rechazo también los cierra; y el aviso solo sale si el ticket local sigue abierto
 * (`ticket_estado` de la fila local), porque casi siempre quien lo canceló fue esta misma caja.
 */
export function planificarEspejo({ conexiones = [], pedidos = [], localPedidos = [], turnoAbierto = false, cajaId, tienda = null }) {
  const porId = new Map(localPedidos.map((l) => [l.id, l]));
  const conexionDe = new Map(conexiones.map((c) => [c.id, c]));
  const upserts = [];
  const candidatos = [];
  const avisos = [];
  const aAceptar = [];
  for (const p of pedidos) {
    const local = porId.get(p.id);
    upserts.push(filaLocal(p, local));
    const conTicketLocal = Boolean(local?.ticket_id);
    const esTienda = p.canal === "TIENDA";
    if (esTienda && CERRADOS_DE_TIENDA.has(p.estado)) {
      if (conTicketLocal && !TICKET_CERRADO.has(local.ticket_estado)) {
        avisos.push({ pedidoId: p.id, motivo: AVISO_TIENDA_CERRADO });
      }
      continue;
    }
    if (!esTienda && CERRADOS_POR_LA_APP.has(p.estado) && conTicketLocal) {
      avisos.push({ pedidoId: p.id, motivo: "La app canceló este pedido: cancela el ticket en caja" });
      continue;
    }
    if (p.gestion !== "ESCRITORIO") continue;
    if (p.gestion_caja_id && p.gestion_caja_id !== cajaId) continue;
    if (conTicketLocal) {
      if (p.estado === "RECIBIDO") aAceptar.push(p);
      continue;
    }
    const cx = conexionDe.get(p.conexion_id);
    const porCajero = p.estado === "ACEPTADO";
    const autoOk = p.estado === "RECIBIDO" && turnoAbierto
      && (esTienda ? tienda?.aceptacion === "AUTO" : cx?.auto_aceptar === true && puedeCrear(p, cx));
    if (porCajero || autoOk) candidatos.push(p);
  }
  candidatos.sort((a, b) => String(a.vence_aceptacion ?? "").localeCompare(String(b.vence_aceptacion ?? "")));
  aAceptar.sort((a, b) => String(a.vence_aceptacion ?? "").localeCompare(String(b.vence_aceptacion ?? "")));
  return { upserts, aCrear: candidatos.map((p) => p.id), aAceptar: aAceptar.map((p) => p.id), avisos };
}

/**
 * Qué estado le reporta la caja a la nube de un pedido de la tienda, mirando su ticket LOCAL
 * (diseño §8). De arriba hacia abajo; `null` = todavía no hay nada que decir.
 * El cajero no marca nada: imprimir el ticket o asignar repartidor es «listo», cobrar es
 * «entregado», cancelar es «cancelado».
 */
export function estadoAReportar({ ticket_estado, ticket_impreso_at, asignado } = {}) {
  if (ticket_estado === "CANCELADO") return "CANCELADO";
  if (ticket_estado === "PAGADO" || ticket_estado === "FACTURADO") return "ENTREGADO";
  if (ticket_impreso_at || asignado === true) return "LISTO";
  return null;
}

/** Lo que lee el cajero cuando la nube cerró un pedido de la tienda que aquí ya tiene ticket. */
export const AVISO_TIENDA_CERRADO = "El pedido en línea se canceló: cancela el ticket en caja";

// Errores al crear el ticket de un pedido de la tienda que no se arreglan reintentando: lo que el
// cliente pidió ya no se puede vender tal como se le cotizó. [texto que trae el mensaje, código].
// Se reconocen con `includes`, igual que la nube. Los textos son los literales de los RAISE.
const FALLAS_SIN_REMEDIO = [
  // crear_ticket_desde_tienda y _delivery_items_a_ticket (0161): traen su código.
  ...[
    "TOTAL_NO_COINCIDE", "ENVIO_NO_COINCIDE", "DIRECCION_INVALIDA", "CLIENTE_BLOQUEADO", "PRODUCTO_DE_OTRO_NEGOCIO",
    "OPCION_DE_OTRO_NEGOCIO", "ITEM_SIN_MAPEAR", "COMBO_ELECCION_SIN_MAPEAR", "COMBO_ELECCION_AMBIGUA", "SUCURSAL_DE_OTRO_NEGOCIO",
  ].map((c) => [c, c]),
  // agregar_item_a_ticket (0152): «Producto % no existe o está eliminado», «Opción de modificador % no existe».
  ["no existe o está eliminado", "PRODUCTO_NO_EXISTE"],
  ["Opción de modificador", "OPCION_NO_EXISTE"],
  // fijar_envio_ticket (0116): «Zona de envío % no existe, está inactiva o no es de esta sucursal».
  ["Zona de envío", "ZONA_NO_DISPONIBLE"],
  // agregar_combo_a_ticket (0152): el combo o uno de sus componentes ya no se vende así.
  ["no está disponible", "PRODUCTO_NO_DISPONIBLE"],            // El combo "%" no está disponible
  ["está agotado o pausado", "PRODUCTO_NO_DISPONIBLE"],        // El producto "%" está agotado o pausado
  ["no se vende en esta sucursal", "PRODUCTO_NO_DISPONIBLE"],  // El producto "%" no se vende en esta sucursal
  ["no es un combo de este negocio", "PRODUCTO_NO_DISPONIBLE"],
  ["no es válido como componente", "PRODUCTO_NO_DISPONIBLE"],
  ["requiere entre", "PRODUCTO_NO_DISPONIBLE"],                // El slot "%" requiere entre % y % selecciones
  ["está excluido del slot", "PRODUCTO_NO_DISPONIBLE"],
  ["no es opción del slot", "PRODUCTO_NO_DISPONIBLE"],
];

/**
 * Clasifica el fallo al crear el ticket de un pedido de la tienda. Es la MISMA tabla que usa la
 * nube (`_shared/delivery/enlinea.ts`, `fallaDeTicket`): si cambia una, cambia la otra.
 *  - no reintentable → el pedido se cancela solo (decisión 3 del plan de la entrega 4);
 *  - sin turno, o el cliente se creó dos veces a la vez (23505) → se reintenta;
 *  - cualquier otra cosa (turno que se cerró en la carrera, 23503, timeout, backend local
 *    reiniciándose) → se reintenta: a nadie se le cancela por un error que no conocemos.
 */
export function fallaDeTicket(mensaje, codigoPg) {
  const m = String(mensaje ?? "");
  const fatal = FALLAS_SIN_REMEDIO.find(([texto]) => m.includes(texto));
  if (fatal) return { reintentable: false, codigo: fatal[1] };
  if (m.includes("SIN_TURNO_ABIERTO")) return { reintentable: true, codigo: "SIN_TURNO_ABIERTO" };
  if (codigoPg === "23505") return { reintentable: true, codigo: "DUPLICADO" };
  return { reintentable: true, codigo: "RPC_ERROR" };
}

/** Cuánto se le espera al catálogo local antes de creer que algo «no existe». */
export const GRACIA_CATALOGO_MS = 3 * 60_000;
const ESPERAN_AL_CATALOGO = new Set(["PRODUCTO_NO_EXISTE", "OPCION_NO_EXISTE", "ZONA_NO_DISPONIBLE"]);

/**
 * En la caja, «no existe» puede querer decir «todavía no bajó»: el catálogo (productos, opciones,
 * zonas) llega por su sondeo en un minuto, a veces más. Un producto recién dado de alta y pedido
 * enseguida no debe cancelarse: mientras el pedido tenga menos de GRACIA_CATALOGO_MS (por su
 * `recibido_at`) esas tres fallas se reintentan; después, cancelan. Sin fecha legible no hay gracia.
 */
export function fallaConGracia(falla, recibidoAt, ahora = Date.now()) {
  if (falla.reintentable || !ESPERAN_AL_CATALOGO.has(falla.codigo)) return falla;
  const edad = ahora - Date.parse(recibidoAt);   // NaN si la fecha no sirve → sin gracia
  return edad < GRACIA_CATALOGO_MS ? { ...falla, reintentable: true } : falla;
}

/** Lo que lee el cajero en el pedido que la caja canceló sola. Sin palabras internas. */
export function avisoDeFalla(codigo) {
  const zona = "la dirección o la zona de envío ya no sirve";
  const porque = new Map([
    ["TOTAL_NO_COINCIDE", "el precio cambió desde que el cliente lo pidió"],
    ["ENVIO_NO_COINCIDE", "el costo de envío cambió desde que el cliente lo pidió"],
    ["DIRECCION_INVALIDA", zona],
    ["ZONA_NO_DISPONIBLE", zona],
    ["CLIENTE_BLOQUEADO", "el cliente está bloqueado"],
  ]).get(codigo) ?? "un producto del pedido ya no está en el menú";
  return `Este pedido se canceló solo: ${porque}. Avísale al cliente.`;
}

/**
 * El cursor para el siguiente delta: el instante más nuevo entre lo que acaba de llegar y lo que
 * ya se tenía. Nunca retrocede, y una fila con fecha ilegible se ignora en vez de tirarlo.
 *
 * Se compara por instante y no por texto porque las fechas llegan con precisiones y husos
 * distintos según quién escribió la fila; "…04:00:00-06:00" es más viejo que "…10:05:00+00:00"
 * aunque ordenado como cadena parezca lo contrario.
 */
export function cursorDe(filas = [], previo = null) {
  let mejor = previo;
  let mejorT = typeof previo === "string" ? Date.parse(previo) : NaN;
  for (const f of filas) {
    const v = f?.updated_at;
    const t = typeof v === "string" ? Date.parse(v) : NaN;
    if (!Number.isFinite(t)) continue;
    if (!Number.isFinite(mejorT) || t > mejorT) { mejor = v; mejorT = t; }
  }
  return mejor;
}
