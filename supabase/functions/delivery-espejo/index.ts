// Espejo de pedidos de apps para la caja de escritorio (spec 2026-09-03; delta y ritmo 2026-09-09).
// Solo dispositivos: sella el latido de la caja (cajas.espejo_apps_at) y devuelve las conexiones y
// los pedidos de SU sucursal, sin credenciales ni payload crudo.
//
// QUÉ CAMBIÓ EL 9 SEP 2026 Y POR QUÉ. Antes el agente llamaba cada 10 s y esto devolvía TODOS los
// pedidos de las últimas 24 h, cada vez, tuviera el cliente delivery o no: 8 640 llamadas por caja
// al día, casi todas para contestar lo mismo. Ahora:
//   · la respuesta dice cada cuánto volver (`siguiente_en_ms`), según haya conexiones vivas y
//     pedidos corriendo — así se cambia el ritmo de la flota sin publicar un instalador;
//   · el agente manda `desde` y solo recibe lo que cambió después de ese instante;
//   · la consulta perdió el `OR` que la obligaba a recorrer la tabla entera. Son tres filtros
//     simples, cada uno con su índice (migración 0110). Desde la tienda en línea (0161) hay hasta
//     cinco consultas por sondeo: la de `tienda_sucursales` y la de `tienda_config` (una fila cada
//     una, por llave) solo si la caja declara la tienda y el negocio la tiene encendida.
import { clienteAdmin, servir } from "../_shared/http.ts";
import { bearerDe, claimsDe } from "../_shared/identidad.ts";
import { registrarError } from "../_shared/errores.ts";
import { cajaIdDeEmail } from "../_shared/latido.ts";
import { alcanceEspejo, cadenciaEspejo, cursorPedido, respuestaSinModulo, selloLatido, TOPE_PEDIDOS, unirPedidos } from "../_shared/delivery/espejo.ts";

const admin = clienteAdmin();

// getUser sigue aquí a propósito: el porqué está en sync-pull.

/** Los cuatro estados del índice parcial `idx_delivery_pedidos_sucursal_activos` (0090). */
const ESTADOS_ACTIVOS = ["RECIBIDO", "ACEPTADO", "EN_PREPARACION", "LISTO"];
const COLS_CONEXION = "id, tenant_id, sucursal_id, marca_virtual_id, app, estado, tienda_id_externo, tienda_nombre_app, auto_aceptar, tiempo_prep_min, config, ultimo_evento_at, ultimo_error, conectada_at, desconectada_at, created_at, updated_at";
// `updated_at` va al final y NO se espeja en la caja: es el cursor del delta (el trigger
// set_updated_at lo pisaría con el reloj local si se guardara).
const COLS_PEDIDO = "id, tenant_id, sucursal_id, conexion_id, app, id_externo, folio_corto, estado, estado_app, tipo_entrega, programado_para, vence_aceptacion, cliente_nombre, cliente_telefono, cliente_telefono_pin, direccion_texto, nota_cliente, items, items_sin_mapear, subtotal_mxn, descuento_app_mxn, descuento_tienda_mxn, envio_mxn, propina_mxn, total_cliente_mxn, total_restaurante_mxn, efectivo_a_cobrar_mxn, ticket_id, repartidor_nombre, repartidor_telefono, repartidor_estado, recibido_at, aceptado_at, listo_at, entregado_at, cancelado_at, motivo_cancelacion, cancelado_por, ultimo_error, created_at, gestion, gestion_caja_id, updated_at";
// Las columnas del canal Tienda solo viajan a las cajas que lo entienden (ver alcanceEspejo).
const COLS_PEDIDO_TIENDA = `${COLS_PEDIDO}, canal, cliente_email, tienda_cuenta_id, zona_envio_id, direccion, pago_al_recibir, paga_con_mxn`;

servir(async (req, json) => {
  const token = bearerDe(req);
  if (!token) return json({ error: "NO_AUTH" }, 401);
  const { data: userResp, error: userErr } = await admin.auth.getUser(token);
  // El detalle va al log de la caja; sin él el 6 sep 2026 no se pudo saber por qué la caja de
  // escritorio se quedaba sin espejo. Desde la auditoría del 30/09/2026 (C2-9) ya no es el texto
  // crudo de GoTrue sino una clasificación fija: lo que el log necesitaba (¿expiró o es inválido?)
  // sin repetir mensajes internos. El texto completo queda en el log de la función.
  if (userErr || !userResp?.user) {
    const crudo = userErr?.message ?? "sin usuario";
    registrarError("delivery-espejo", "AUTH_INVALIDA", crudo);
    const detalle = /expired|expirad/i.test(crudo) ? "token expirado"
      : /session|sesi/i.test(crudo) ? "sesión inexistente"
      : userErr ? "token inválido" : "sin usuario";
    return json({ error: "AUTH_INVALIDA", detalle }, 401);
  }
  const claims = claimsDe(token);
  if (claims.tipo_identidad !== "DISPOSITIVO") return json({ error: "SOLO_DISPOSITIVO" }, 403);
  const tenantId = typeof claims.tenant_id === "string" ? claims.tenant_id : null;
  const cajaId = cajaIdDeEmail(userResp.user.email);
  if (!tenantId || !cajaId) return json({ error: "DISPOSITIVO_SIN_CAJA" }, 403);

  const cuerpo = (await req.json().catch(() => ({})) ?? {}) as { desde?: unknown; turno_abierto?: unknown; tienda?: unknown };
  const desde = cursorPedido(cuerpo.desde);

  // Latido y verificación de la caja en un solo viaje: si no vuelve fila, la caja no existe, no es
  // de este tenant o está desactivada. Con esto el webhook sabe que hay una caja instalada viva.
  const { data: cajaData } = await admin.from("cajas")
    // Una caja que no declara la tienda manda el mismo UPDATE de siempre: así esta función no
    // depende de la migración 0161 para las cajas que hoy están en servicio (si el despliegue
    // llegara antes, un UPDATE con la columna nueva fallaría y toda caja recibiría CAJA_NO_EXISTE).
    // La que la declara Y reporta turno abierto sella además espejo_turno_abierto_at, la marca de
    // tiempo que lee sucursal_recibe_pedidos (mig. 0161). Si deja de reportarlo no se escribe
    // nada: la marca envejece sola y la tienda de esa sucursal se cierra (ver selloLatido).
    .update(selloLatido(cuerpo, new Date().toISOString()))
    .eq("id", cajaId).eq("tenant_id", tenantId).eq("activa", true).is("deleted_at", null)
    .select("id, sucursal_id").maybeSingle();
  const caja = cajaData as { id: string; sucursal_id: string } | null;
  if (!caja) return json({ error: "CAJA_NO_EXISTE" }, 403);

  // Guard del módulo: el dueño tiene que haberlo encendido, no solo que VIM se lo haya concedido
  // (por eso se lee `efectivos`, no `permitidos`). Va aquí, ANTES de las consultas de abajo,
  // para que una caja que todavía no se enteró de que perdió el módulo —o que nunca se
  // actualice— deje de costarle a la base ni una lectura en cuanto se apague el módulo, sin
  // publicar un instalador (una caja rota no se auto-actualiza y el parque no se mueve en bloque).
  const { data: mod } = await admin.rpc("modulos_efectivos", { p_tenant: tenantId });
  const efectivos = (mod as { efectivos?: Record<string, boolean> } | null)?.efectivos ?? {};
  const alcance = alcanceEspejo({ efectivos, cuerpo });
  // La clave `tienda` solo existe para la caja que la declara (desde la 0.8.0). Una caja anterior,
  // que manda solo `{desde}`, recibe byte a byte la respuesta de siempre.
  const declaraTienda = cuerpo.tienda === true;
  if (alcance.canales.length === 0) {
    return json({ ...respuestaSinModulo(caja.id, caja.sucursal_id), ...(declaraTienda && { tienda: null }) });
  }

  const pedidosDe = () => admin.from("delivery_pedidos")
    .select(alcance.conTienda ? COLS_PEDIDO_TIENDA : COLS_PEDIDO)
    .eq("tenant_id", tenantId).eq("sucursal_id", caja.sucursal_id)
    .in("canal", alcance.canales)
    .order("recibido_at", { ascending: false }).limit(TOPE_PEDIDOS);
  const hace24h = new Date(Date.now() - 24 * 3600_000).toISOString();

  const sinFila = Promise.resolve({ data: null, error: null });
  const [cx, viv, dlt, tie, cfg] = await Promise.all([
    alcance.conApps
      ? admin.from("delivery_conexiones").select(COLS_CONEXION)
          .eq("tenant_id", tenantId).eq("sucursal_id", caja.sucursal_id)
      : Promise.resolve({ data: [], error: null }),
    // Los vivos van SIEMPRE, hayan cambiado o no: son los únicos sobre los que la caja tiene algo
    // pendiente que hacer, y un pedido que no cambia jamás vendría en un delta.
    pedidosDe().in("estado", ESTADOS_ACTIVOS),
    // Y lo que cambió desde el cursor. Sin cursor (arranque de la caja) va la ventana de 24 h.
    desde ? pedidosDe().gte("updated_at", desde) : pedidosDe().gte("recibido_at", hace24h),
    // ¿Esta sucursal vende en la tienda, y está en pausa? Solo se pregunta si la caja y el negocio la tienen.
    alcance.conTienda
      ? admin.from("tienda_sucursales").select("participa, pausa_hasta")
          .eq("tenant_id", tenantId).eq("sucursal_id", caja.sucursal_id).maybeSingle()
      : sinFila,
    // Y cómo acepta el negocio (manual o sola): la caja lo necesita para aceptar por su cuenta.
    alcance.conTienda
      ? admin.from("tienda_config").select("aceptacion").eq("tenant_id", tenantId).maybeSingle()
      : sinFila,
  ]);
  for (const r of [cx, viv, dlt, tie, cfg]) {
    if (r.error) { registrarError("delivery-espejo", "DB_ERROR", r.error); return json({ error: "DB_ERROR" }, 500); }
  }

  const conexiones = cx.data ?? [];
  // `recibido_at` ya viene en COLS_PEDIDO: con él la cadencia deja de contar los pedidos de la tienda atascados.
  const vivos = viv.data ?? [];
  const filaTienda = tie.data as { participa?: boolean; pausa_hasta?: string | null } | null;
  const tiendaViva = filaTienda?.participa === true;
  return json({
    ahora: new Date().toISOString(),
    caja_id: caja.id,
    sucursal_id: caja.sucursal_id,
    conexiones,
    pedidos: unirPedidos(vivos, dlt.data ?? []),
    siguiente_en_ms: cadenciaEspejo({ conexiones, pedidosVivos: vivos, tienda: tiendaViva }),
    ...(declaraTienda && {
      tienda: alcance.conTienda
        ? {
            participa: tiendaViva,
            // Sin fila de configuración (o con un valor que no conocemos), manual: nada se acepta solo.
            aceptacion: (cfg.data as { aceptacion?: string } | null)?.aceptacion === "AUTO" ? "AUTO" : "MANUAL",
            pausa_hasta: filaTienda?.pausa_hasta ?? null,
          }
        : null,
    }),
  });
});
