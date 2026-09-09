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
//     simples, cada uno con su índice (migración 0110).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { cadenciaEspejo, cursorPedido, TOPE_PEDIDOS, unirPedidos } from "../_shared/delivery/espejo.ts";
import { crearVerificadorDispositivo } from "../_shared/auth-dispositivo.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

// La firma del token se verifica aquí en vez de preguntarle a GoTrue en cada llamada: es la
// función que más veces se llama de todo el proyecto. OJO: las Edge Functions no permiten
// secretos con prefijo SUPABASE_ (reservado), por eso el JWT secret se inyecta como
// VIM_JWT_SECRET — el mismo que usa pin-login para acuñar los tokens.
const JWT_SECRET = Deno.env.get("VIM_JWT_SECRET");
if (!JWT_SECRET) throw new Error("Falta VIM_JWT_SECRET en el entorno de la función.");
const verificarDispositivo = crearVerificadorDispositivo(JWT_SECRET);

/** Los cuatro estados del índice parcial `idx_delivery_pedidos_sucursal_activos` (0090). */
const ESTADOS_ACTIVOS = ["RECIBIDO", "ACEPTADO", "EN_PREPARACION", "LISTO"];
const COLS_CONEXION = "id, tenant_id, sucursal_id, marca_virtual_id, app, estado, tienda_id_externo, tienda_nombre_app, auto_aceptar, tiempo_prep_min, config, ultimo_evento_at, ultimo_error, conectada_at, desconectada_at, created_at, updated_at";
// `updated_at` va al final y NO se espeja en la caja: es el cursor del delta (el trigger
// set_updated_at lo pisaría con el reloj local si se guardara).
const COLS_PEDIDO = "id, tenant_id, sucursal_id, conexion_id, app, id_externo, folio_corto, estado, estado_app, tipo_entrega, programado_para, vence_aceptacion, cliente_nombre, cliente_telefono, cliente_telefono_pin, direccion_texto, nota_cliente, items, items_sin_mapear, subtotal_mxn, descuento_app_mxn, descuento_tienda_mxn, envio_mxn, propina_mxn, total_cliente_mxn, total_restaurante_mxn, efectivo_a_cobrar_mxn, ticket_id, repartidor_nombre, repartidor_telefono, repartidor_estado, recibido_at, aceptado_at, listo_at, entregado_at, cancelado_at, motivo_cancelacion, cancelado_por, ultimo_error, created_at, gestion, gestion_caja_id, updated_at";

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  // El detalle (vencido, firma mala) va al log de la caja; sin él el 6 sep 2026 no se pudo saber
  // por qué la caja de escritorio se quedaba sin espejo.
  const auth = await verificarDispositivo(req.headers.get("authorization"));
  if (!auth.ok) return json({ error: auth.error, ...(auth.detalle ? { detalle: auth.detalle } : {}) }, auth.status);
  const { tenantId, cajaId } = auth;

  const cuerpo = await req.json().catch(() => ({})) as { desde?: unknown };
  const desde = cursorPedido(cuerpo?.desde);

  // Latido y verificación de la caja en un solo viaje: si no vuelve fila, la caja no existe, no es
  // de este tenant o está desactivada. Con esto el webhook sabe que hay una caja instalada viva.
  const { data: cajaData } = await admin.from("cajas")
    .update({ espejo_apps_at: new Date().toISOString() })
    .eq("id", cajaId).eq("tenant_id", tenantId).eq("activa", true).is("deleted_at", null)
    .select("id, sucursal_id").maybeSingle();
  const caja = cajaData as { id: string; sucursal_id: string } | null;
  if (!caja) return json({ error: "CAJA_NO_EXISTE" }, 403);

  const pedidosDe = () => admin.from("delivery_pedidos").select(COLS_PEDIDO)
    .eq("tenant_id", tenantId).eq("sucursal_id", caja.sucursal_id)
    .order("recibido_at", { ascending: false }).limit(TOPE_PEDIDOS);
  const hace24h = new Date(Date.now() - 24 * 3600_000).toISOString();

  const [cx, viv, dlt] = await Promise.all([
    admin.from("delivery_conexiones").select(COLS_CONEXION)
      .eq("tenant_id", tenantId).eq("sucursal_id", caja.sucursal_id),
    // Los vivos van SIEMPRE, hayan cambiado o no: son los únicos sobre los que la caja tiene algo
    // pendiente que hacer, y un pedido que no cambia jamás vendría en un delta.
    pedidosDe().in("estado", ESTADOS_ACTIVOS),
    // Y lo que cambió desde el cursor. Sin cursor (arranque de la caja) va la ventana de 24 h.
    desde ? pedidosDe().gte("updated_at", desde) : pedidosDe().gte("recibido_at", hace24h),
  ]);
  for (const r of [cx, viv, dlt]) {
    if (r.error) return json({ error: "DB_ERROR", detalle: r.error.message }, 500);
  }

  const conexiones = cx.data ?? [];
  const vivos = viv.data ?? [];
  return json({
    ahora: new Date().toISOString(),
    caja_id: caja.id,
    sucursal_id: caja.sucursal_id,
    conexiones,
    pedidos: unirPedidos(vivos, dlt.data ?? []),
    siguiente_en_ms: cadenciaEspejo({ conexiones, pedidosVivos: vivos }),
  });
});
