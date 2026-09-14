// Conectar / pausar / desconectar tiendas de Uber Eats desde el admin (spec F1b, ADR 0011).
// El dueño autoriza en Uber; aquí se canjea el code (el client secret nunca sale de Supabase),
// se listan sus tiendas y se activa la integración con integrator_store_id = uuid de la sucursal.
// Solo Dueño/Administrador (jerarquía >= 4); todo filtra por el tenant del JWT — salvo el camino
// interno de "pausar" (Task 6, ver `INTERNO` más abajo), que usa `x-vim-interno` en vez de JWT.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  armarCombosCarta, armarGruposModificadorCarta, construirMenuUber, type CategoriaCarta, type ProductoCarta,
} from "../_shared/delivery/menu-uber.ts";
import { crearClienteUber } from "../_shared/delivery/uber.ts";
import { cuerpoPosData, normalizarTiendasUber, transicionConexion, type EstadoConexion } from "../_shared/delivery/uber-activacion.ts";
import { cambiarPrepTienda, consultarEstadoTienda, type ConexionTienda } from "../_shared/delivery/tienda-uber-acciones.ts";
import type { DbMinima } from "../_shared/delivery/procesar-uber.ts";
import { accionInternaPermitida, secretoInternoValido } from "../_shared/delivery/interno.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const ENTORNO = (Deno.env.get("UBER_ENTORNO") ?? "sandbox") === "produccion" ? "produccion" : "sandbox";
const REDIRECT_URI = Deno.env.get("UBER_REDIRECT_URI") ?? "";
const uber = crearClienteUber({
  entorno: ENTORNO,
  clientId: Deno.env.get("UBER_CLIENT_ID") ?? "",
  clientSecret: Deno.env.get("UBER_CLIENT_SECRET") ?? "",
  tokenCache: {
    leer: async () => {
      const { data } = await admin.from("delivery_credenciales_app").select("access_token, vence_at")
        .eq("app", "APP_UBEREATS").eq("entorno", ENTORNO).maybeSingle();
      const f = data as { access_token: string; vence_at: string } | null;
      return f && new Date(f.vence_at) > new Date() ? f.access_token : null;
    },
    guardar: async (token, venceAt) => {
      await admin.from("delivery_credenciales_app").upsert({
        app: "APP_UBEREATS", entorno: ENTORNO, access_token: token,
        vence_at: venceAt.toISOString(), updated_at: new Date().toISOString(),
      });
    },
  },
});

type Cuerpo = {
  accion?: string; code?: string; tienda_id?: string; sucursal_id?: string; conexion_id?: string;
  auto_aceptar?: boolean; tiempo_prep_min?: number; terminos_aceptados?: boolean; minutos?: number;
};
type Conexion = {
  id: string; tenant_id: string; sucursal_id: string; estado: EstadoConexion;
  tienda_id_externo: string | null; tienda_nombre_app: string | null; config: Record<string, unknown>;
};
type Rol = { jerarquia?: number };
type Acceso = { tenant_id: string; rol: Rol | Rol[] | null };
type FilaConexionTienda = { tienda_id_externo: string | null; sucursal_id: string; sucursal: { nombre: string } | { nombre: string }[] | null };
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const JERARQUIA_MINIMA = 4;
const ESTADOS_CONECTADA = ["ACTIVA", "PAUSADA", "ERROR"];

// Camino interno (Task 6): apps/platform lo usa para avisarle a Uber cuando VIM retira el add-on
// de un tenant — ahí no hay dueño con sesión abierta, así que el JWT de usuario que exige el resto
// de esta función no aplica. Mismo ESQUEMA que cargar-csd/enviar-push (cabecera `x-vim-interno`,
// comparación en tiempo constante — nunca `===`, que filtra el prefijo por temporización, el mismo
// defecto que server.ts de platform documenta y corrige), pero con secreto PROPIO: compartir
// `VIM_INTERNO_SECRET` con esas dos funciones habría hecho que un mismo secreto filtrado sirviera
// también para pausar CUALQUIER conexión de Uber de CUALQUIER tenant sin JWT ni módulo — tres
// poderes muy distintos colgando de una sola credencial. `verify_jwt` normal sigue activo para
// esta función completa (spec 2026-09-02-delivery-f1b-conectar-uber-design.md:81): el camino
// interno manda además `Authorization: Bearer` con la `service_role key` para pasar esa puerta del
// gateway (igual que ya hace apps/admin/app/lib/integraciones.ts con su JWT de usuario); esta
// cabecera es la valla de la función, no la del gateway.
const INTERNO = Deno.env.get("VIM_DELIVERY_INTERNO_SECRET") ?? "";

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  // Puerta interna (Task 6): si trae `x-vim-interno`, tiene que coincidir con el secreto — si no
  // coincide, 401 `INTERNO_INVALIDO` explícito. Sin este chequeo, un secreto mal puesto en Vercel
  // o en Supabase caía en silencio al flujo de JWT (que tampoco tiene) y salía como `NO_AUTH`,
  // indistinguible de cualquier otro problema; exactamente el fallo silencioso que este camino
  // interno existe para evitar. Se comprueba ANTES de leer `Authorization`/parsear el cuerpo:
  // identificar quién llama es lo primero, no un paso más dentro del cuerpo ya parseado.
  const internoRecibido = (req.headers.get("x-vim-interno") ?? "").trim();
  const esInterno = internoRecibido !== "";
  if (esInterno && !secretoInternoValido(internoRecibido, INTERNO)) {
    return json({ error: "INTERNO_INVALIDO" }, 401);
  }

  let tenantId: string;
  let usuarioId: string | null;
  if (!esInterno) {
    // 1) JWT del admin → tenant y jerarquía del rol.
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "NO_AUTH" }, 401);
    const { data: userResp, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userResp?.user) return json({ error: "AUTH_INVALIDA" }, 401);
    usuarioId = userResp.user.id;
    const { data: accesoData } = await admin.from("usuarios_acceso").select("tenant_id, rol:roles(jerarquia)")
      .eq("usuario_id", usuarioId).eq("activo", true).limit(1).maybeSingle();
    const acceso = accesoData as unknown as Acceso | null;
    if (!acceso) return json({ error: "SIN_TENANT" }, 403);
    tenantId = acceso.tenant_id;
    const rol = Array.isArray(acceso.rol) ? acceso.rol[0] : acceso.rol;
    if ((rol?.jerarquia ?? 0) < JERARQUIA_MINIMA) return json({ error: "SIN_PERMISO" }, 403);
  } else {
    tenantId = ""; // se resuelve abajo, desde la conexión — hace falta el cuerpo, que aún no existe.
    usuarioId = null; // actor de sistema, no una persona con fila en auth.users.
  }

  let body: Cuerpo;
  try { body = await req.json(); } catch { return json({ error: "BAD_JSON" }, 400); }
  if (!body.accion) return json({ error: "FALTAN_CAMPOS" }, 400);

  if (esInterno) {
    // Acotado a "pausar": es la única acción que el panel necesita para avisarle a Uber cuando VIM
    // retira el add-on de un tenant. El tenant sale de la CONEXIÓN, no de un JWT que aquí no
    // existe — eso es lo que acota el alcance: esta puerta no da acceso a otro tenant que el dueño
    // de la fila que se le pasa por id, y ninguna otra acción entra por ella.
    if (!accionInternaPermitida(body.accion)) return json({ error: "ACCION_NO_PERMITIDA" }, 403);
    if (!body.conexion_id) return json({ error: "FALTAN_CAMPOS" }, 400);
    const { data: cxRaw } = await admin.from("delivery_conexiones").select("tenant_id").eq("id", body.conexion_id).maybeSingle();
    const cxTenantId = (cxRaw as { tenant_id: string } | null)?.tenant_id;
    if (!cxTenantId) return json({ error: "CONEXION_NO_EXISTE" }, 404);
    tenantId = cxTenantId;
  }

  const registrar = async (tipo: string, ok: boolean, detalle: unknown, conexionId: string | null, tiendaId: string | null) => {
    await admin.from("delivery_eventos").insert({
      tenant_id: tenantId, conexion_id: conexionId, app: "APP_UBEREATS", direccion: "SALIDA", tipo,
      id_externo: tiendaId, procesado: ok, respuesta: ok ? detalle : null, error: ok ? null : String(detalle),
      http_status: ok ? 200 : null,
    });
  };

  const leerAutorizacion = async (): Promise<string | null> => {
    const { data } = await admin.from("delivery_autorizaciones").select("access_token, vence_at")
      .eq("tenant_id", tenantId).eq("app", "APP_UBEREATS").eq("entorno", ENTORNO).maybeSingle();
    const f = data as { access_token: string; vence_at: string } | null;
    return f && new Date(f.vence_at) > new Date() ? f.access_token : null;
  };

  const tiendasConEstado = async (tokenDueno: string) => {
    const tiendas = normalizarTiendasUber({ stores: await uber.listarTiendas(tokenDueno) });
    const { data: cxs } = await admin.from("delivery_conexiones")
      .select("tienda_id_externo, sucursal_id, sucursal:sucursales(nombre)")
      .eq("tenant_id", tenantId).eq("app", "APP_UBEREATS").in("estado", ESTADOS_CONECTADA);
    const porTienda = new Map<string, { sucursal_id: string; sucursal_nombre: string }>();
    for (const c of (cxs ?? []) as unknown as FilaConexionTienda[]) {
      if (!c.tienda_id_externo) continue;
      const s = Array.isArray(c.sucursal) ? c.sucursal[0] : c.sucursal;
      porTienda.set(c.tienda_id_externo, { sucursal_id: c.sucursal_id, sucursal_nombre: s?.nombre ?? "" });
    }
    return tiendas.map((t) => ({ ...t, conectada_a: porTienda.get(t.id) ?? null }));
  };

  const comoTienda = async (cx: Conexion): Promise<ConexionTienda> => {
    const { data: fila } = await admin.from("delivery_conexiones").select("tiempo_prep_min").eq("id", cx.id).maybeSingle();
    return {
      id: cx.id, tenant_id: cx.tenant_id, sucursal_id: cx.sucursal_id, tienda_id_externo: cx.tienda_id_externo ?? "",
      tiempo_prep_min: Number((fila as { tiempo_prep_min?: number } | null)?.tiempo_prep_min ?? 15), config: cx.config,
    };
  };
  const depsTienda = () => ({ db: admin as unknown as DbMinima, uber, ahora: () => new Date() });

  const conexionDelTenant = async (id: string | undefined): Promise<Conexion | null> => {
    if (!id) return null;
    const { data } = await admin.from("delivery_conexiones")
      .select("id, tenant_id, sucursal_id, estado, tienda_id_externo, tienda_nombre_app, config").eq("id", id).maybeSingle();
    const c = data as Conexion | null;
    return c && c.tenant_id === tenantId ? c : null;
  };

  // Guard del módulo: todas las acciones salvo "desconectar" quedan cerradas sin el add-on
  // (se lee `efectivos`, no `permitidos` — el dueño también tuvo que encenderlo). Fail-closed: si
  // el RPC falla o no devuelve fila, `efectivos` queda `{}` y `!== true` bloquea igual.
  // "desconectar" queda AFUERA a propósito: esa acción solo quita capacidad, nunca la concede, así
  // que dejarla pasar sin módulo es seguro. Y hace falta: un dueño al que se le retiró el add-on
  // tiene que poder soltar su tienda de Uber, y la Task 6 usa este mismo camino para cortar el
  // servicio cuando VIM retira el add-on.
  // El "pausar" del camino interno queda AFUERA por la misma razón que "desconectar": el panel lo
  // invoca JUSTO cuando (o después de) quitar el módulo, así que exigirlo aquí volvería a la
  // llamada imposible de cumplir y Uber nunca se enteraría de la baja.
  if (body.accion !== "desconectar" && !esInterno) {
    const { data: mod } = await admin.rpc("modulos_efectivos", { p_tenant: tenantId });
    const efectivos = (mod as { efectivos?: Record<string, boolean> } | null)?.efectivos ?? {};
    if (efectivos.delivery_apps !== true) return json({ error: "SIN_MODULO_DELIVERY" }, 403);
  }

  try {
    switch (body.accion) {
      case "intercambiar": {
        if (!body.code) return json({ error: "FALTAN_CAMPOS" }, 400);
        if (!REDIRECT_URI) return json({ error: "UBER_ERROR", detalle: "UBER_REDIRECT_URI no configurado" }, 502);
        let canje: { accessToken: string; venceAt: Date };
        try { canje = await uber.canjearCodigo(body.code, REDIRECT_URI); }
        catch (e) { await registrar("oauth_canje", false, msg(e), null, null); return json({ error: "UBER_ERROR", detalle: msg(e) }, 502); }
        await admin.from("delivery_autorizaciones").upsert({
          tenant_id: tenantId, app: "APP_UBEREATS", entorno: ENTORNO, access_token: canje.accessToken,
          vence_at: canje.venceAt.toISOString(), creado_por: usuarioId, created_at: new Date().toISOString(),
        }, { onConflict: "tenant_id,app,entorno" });
        const tiendas = await tiendasConEstado(canje.accessToken);
        await registrar("oauth_canje", true, { tiendas: tiendas.length }, null, null);
        return json({ tiendas });
      }
      case "tiendas": {
        const tok = await leerAutorizacion();
        if (!tok) return json({ error: "SIN_AUTORIZACION" }, 409);
        return json({ tiendas: await tiendasConEstado(tok) });
      }
      case "activar": {
        if (!body.tienda_id || !body.sucursal_id) return json({ error: "FALTAN_CAMPOS" }, 400);
        if (body.terminos_aceptados !== true) return json({ error: "TERMINOS_NO_ACEPTADOS" }, 400);
        const tok = await leerAutorizacion();
        if (!tok) return json({ error: "SIN_AUTORIZACION" }, 409);
        const { data: suc } = await admin.from("sucursales").select("id, tenant_id, nombre").eq("id", body.sucursal_id).is("deleted_at", null).maybeSingle();
        const sucursal = suc as { id: string; tenant_id: string; nombre: string } | null;
        if (!sucursal || sucursal.tenant_id !== tenantId) return json({ error: "SUCURSAL_NO_EXISTE" }, 404);
        const { data: existente } = await admin.from("delivery_conexiones").select("id, estado")
          .eq("sucursal_id", sucursal.id).eq("app", "APP_UBEREATS").maybeSingle();
        const cx = existente as { id: string; estado: EstadoConexion } | null;
        let nuevoEstado: EstadoConexion;
        try { nuevoEstado = transicionConexion(cx?.estado ?? null, "activar"); }
        catch { return json({ error: "SUCURSAL_YA_CONECTADA", estado: cx?.estado }, 409); }
        const { data: otra } = await admin.from("delivery_conexiones").select("id").eq("app", "APP_UBEREATS")
          .eq("tienda_id_externo", body.tienda_id).in("estado", ESTADOS_CONECTADA).neq("sucursal_id", sucursal.id).limit(1);
        if ((otra ?? []).length > 0) return json({ error: "TIENDA_YA_CONECTADA" }, 409);

        const autoAceptar = body.auto_aceptar !== false;
        const prep = Math.min(180, Math.max(1, Number(body.tiempo_prep_min) || 15));
        const cuerpo = cuerpoPosData({ sucursalId: sucursal.id, autoAceptar });
        try { await uber.posData(body.tienda_id).crear(tok, cuerpo); }
        catch (e) {
          // 409 = la tienda ya estaba asociada a nuestra app: se toma como éxito y se sigue.
          if (!msg(e).startsWith("YA_PROCESADA")) {
            await registrar("pos_data_crear", false, msg(e), cx?.id ?? null, body.tienda_id);
            return json({ error: "UBER_ERROR", detalle: msg(e) }, 502);
          }
        }
        const tiendas = normalizarTiendasUber({ stores: await uber.listarTiendas(tok).catch(() => []) });
        const nombre = tiendas.find((t) => t.id === body.tienda_id)?.nombre ?? body.tienda_id;
        const ahora = new Date().toISOString();
        const fila = {
          tenant_id: tenantId, sucursal_id: sucursal.id, app: "APP_UBEREATS", estado: nuevoEstado,
          tienda_id_externo: body.tienda_id, tienda_nombre_app: nombre, auto_aceptar: autoAceptar, tiempo_prep_min: prep,
          conectada_at: ahora, desconectada_at: null, ultimo_error: null, updated_by: usuarioId,
          config: { terminos_aceptados_at: ahora, terminos_aceptados_por: usuarioId, webhooks_version: "1.0.0" },
        };
        const { data: guardada, error: errCx } = cx
          ? await admin.from("delivery_conexiones").update(fila).eq("id", cx.id).select("id").single()
          : await admin.from("delivery_conexiones").insert({ ...fila, created_by: usuarioId }).select("id").single();
        if (errCx) return json({ error: "INTERNO", detalle: errCx.message }, 500);
        const conexionId = (guardada as { id: string }).id;
        await registrar("pos_data_crear", true, cuerpo, conexionId, body.tienda_id);
        return json({ conexion_id: conexionId });
      }
      case "pausar":
      case "reanudar": {
        const cx = await conexionDelTenant(body.conexion_id);
        if (!cx || !cx.tienda_id_externo) return json({ error: "CONEXION_NO_EXISTE" }, 404);
        let nuevo: EstadoConexion;
        // El camino interno usa `pausar_vim`, que alcanza también a una conexión en ERROR: cuando
        // VIM retira el add-on hay que cerrar la tienda esté como esté, o al cliente final le sigue
        // apareciendo abierta mientras el POS rechaza cada pedido. El dueño conserva `pausar` a
        // secas (solo desde ACTIVA): darle la versión ancha le abriría el atajo
        // ERROR → PAUSADA → ACTIVA, que devuelve al aire una tienda rota sin reaprovisionarla.
        const regla = body.accion === "pausar" && esInterno ? "pausar_vim" : body.accion;
        try { nuevo = transicionConexion(cx.estado, regla as "pausar" | "pausar_vim" | "reanudar"); }
        catch { return json({ error: "ACCION_INVALIDA", estado: cx.estado }, 409); }
        const habilitar = body.accion === "reanudar";
        try { await uber.posData(cx.tienda_id_externo).actualizar({ integration_enabled: habilitar }); }
        catch (e) {
          await registrar("pos_data_actualizar", false, msg(e), cx.id, cx.tienda_id_externo);
          return json({ error: "UBER_ERROR", detalle: msg(e) }, 502);
        }
        await admin.from("delivery_conexiones").update({ estado: nuevo, ultimo_evento_at: new Date().toISOString(), ultimo_error: null, updated_by: usuarioId }).eq("id", cx.id);
        await registrar("pos_data_actualizar", true, { integration_enabled: habilitar }, cx.id, cx.tienda_id_externo);
        return json({ estado: nuevo });
      }
      case "desconectar": {
        const cx = await conexionDelTenant(body.conexion_id);
        if (!cx || !cx.tienda_id_externo) return json({ error: "CONEXION_NO_EXISTE" }, 404);
        let nuevo: EstadoConexion;
        try { nuevo = transicionConexion(cx.estado, "desconectar"); } catch { return json({ error: "ACCION_INVALIDA", estado: cx.estado }, 409); }
        try { await uber.posData(cx.tienda_id_externo).borrar(); }
        catch (e) {
          // 404 = Uber ya no la tiene asociada: queda desconectada igual.
          if (!msg(e).startsWith("UBER_HTTP_404")) {
            await registrar("pos_data_borrar", false, msg(e), cx.id, cx.tienda_id_externo);
            return json({ error: "UBER_ERROR", detalle: msg(e) }, 502);
          }
        }
        await admin.from("delivery_conexiones").update({ estado: nuevo, desconectada_at: new Date().toISOString(), updated_by: usuarioId }).eq("id", cx.id);
        await registrar("pos_data_borrar", true, {}, cx.id, cx.tienda_id_externo);
        return json({ estado: nuevo });
      }
      case "prep": {
        const cx = await conexionDelTenant(body.conexion_id);
        if (!cx || !cx.tienda_id_externo) return json({ error: "CONEXION_NO_EXISTE" }, 404);
        try {
          return json(await cambiarPrepTienda(depsTienda(), await comoTienda(cx), Number(body.minutos)));
        } catch (e) {
          const m = msg(e);
          return m === "PREP_FUERA_DE_RANGO" ? json({ error: "PREP_FUERA_DE_RANGO" }, 400) : json({ error: "UBER_ERROR", detalle: m }, 502);
        }
      }
      case "verificar": {
        const cx = await conexionDelTenant(body.conexion_id);
        if (!cx || !cx.tienda_id_externo) return json({ error: "CONEXION_NO_EXISTE" }, 404);
        let pos: Record<string, unknown> = {};
        let tienda: Awaited<ReturnType<typeof consultarEstadoTienda>>;
        try {
          pos = (await uber.posData(cx.tienda_id_externo).leer()) as Record<string, unknown>;
          tienda = await consultarEstadoTienda(depsTienda(), await comoTienda(cx), true);
        } catch (e) {
          await admin.from("delivery_conexiones").update({ ultimo_error: msg(e), ultimo_evento_at: new Date().toISOString() }).eq("id", cx.id);
          await registrar("verificar", false, msg(e), cx.id, cx.tienda_id_externo);
          return json({ error: "UBER_ERROR", detalle: msg(e) }, 502);
        }
        const integracionActiva = pos.integration_enabled === true && pos.integrator_store_id === cx.sucursal_id;
        const tiendaOnline = tienda.estado === "EN_LINEA";
        const detalle = integracionActiva ? null
          : pos.integrator_store_id !== cx.sucursal_id ? `El integrator_store_id en Uber (${String(pos.integrator_store_id)}) no es esta sucursal`
          : "La integración está apagada en Uber";
        await admin.from("delivery_conexiones").update({
          ultimo_evento_at: new Date().toISOString(), ultimo_error: detalle,
          estado: integracionActiva ? (cx.estado === "ERROR" ? "ACTIVA" : cx.estado) : "ERROR",
        }).eq("id", cx.id);
        await registrar("verificar", true, { integracionActiva, tiendaOnline, offline_reason: tienda.motivo }, cx.id, cx.tienda_id_externo);
        return json({ integracion_activa: integracionActiva, tienda_online: tiendaOnline, offline_reason: tienda.motivo, detalle, tienda });
      }
      case "menu": {
        // Manda la carta de VIM a la tienda: el id de cada ítem en Uber es el uuid del producto,
        // que es lo que permite reconocer los pedidos sin tabla de mapeo. Reemplaza la carta entera.
        const cx = await conexionDelTenant(body.conexion_id);
        if (!cx || !cx.tienda_id_externo) return json({ error: "CONEXION_NO_EXISTE" }, 404);
        const [
          { data: prods }, { data: cats }, { data: gruposModificador }, { data: opcionesModificador },
          { data: vinculosProductoGrupo }, { data: comboGrupos }, { data: comboOpciones },
        ] = await Promise.all([
          admin.from("productos")
            .select("id, nombre, descripcion, precio_base_mxn, tasa_iva, categoria_id, agotado_manual, agotado_automatico, visible_en_pos, es_combo")
            .eq("tenant_id", tenantId).eq("estado", "ACTIVO").is("deleted_at", null),
          admin.from("categorias").select("id, nombre, orden_visualizacion").eq("tenant_id", tenantId).eq("activa", true).is("deleted_at", null),
          admin.from("grupos_modificadores").select("id, nombre, tipo_seleccion, minimo_selecciones, maximo_selecciones")
            .eq("tenant_id", tenantId).eq("activo", true).is("deleted_at", null),
          admin.from("opciones_modificador").select("id, grupo_id, nombre, precio_extra_mxn, agotada")
            .eq("tenant_id", tenantId).eq("activa", true).is("deleted_at", null),
          admin.from("productos_grupos_modificadores").select("producto_id, grupo_id, orden_visualizacion")
            .eq("tenant_id", tenantId),
          admin.from("combo_grupos").select("id, combo_producto_id, nombre, orden_visualizacion, minimo_selecciones, maximo_selecciones, modo_precio, categoria_id")
            .eq("tenant_id", tenantId).eq("activo", true).is("deleted_at", null),
          admin.from("combo_opciones").select("grupo_id, producto_id, precio_delta_mxn, activa")
            .eq("tenant_id", tenantId).is("deleted_at", null),
        ]);
        // Un combo sin slots configurados no se puede vender: cuenta cuántos grupos tiene cada
        // combo para que construirMenuUber lo excluya (ver "combo sin slots").
        const slotsPorCombo = new Map<string, number>();
        for (const g of ((comboGrupos ?? []) as Record<string, unknown>[])) {
          const k = String(g.combo_producto_id);
          slotsPorCombo.set(k, (slotsPorCombo.get(k) ?? 0) + 1);
        }
        const productos: ProductoCarta[] = ((prods ?? []) as Record<string, unknown>[]).map((p) => ({
          id: String(p.id), nombre: String(p.nombre ?? ""), descripcion: (p.descripcion as string | null) ?? null,
          precio_base_mxn: p.precio_base_mxn as number | string, tasa_iva: p.tasa_iva as number | null,
          categoria_id: (p.categoria_id as string | null) ?? null,
          agotado: p.agotado_manual === true || p.agotado_automatico === true, visible: p.visible_en_pos !== false,
          es_combo: p.es_combo === true,
          n_slots: slotsPorCombo.get(String(p.id)) ?? 0,
        }));
        const categorias: CategoriaCarta[] = ((cats ?? []) as Record<string, unknown>[]).map((c) => ({
          id: String(c.id), nombre: String(c.nombre ?? ""), orden: (c.orden_visualizacion as number | null) ?? 0,
        }));
        const gruposCarta = armarGruposModificadorCarta(
          (gruposModificador ?? []) as Record<string, unknown>[],
          (opcionesModificador ?? []) as Record<string, unknown>[],
          (vinculosProductoGrupo ?? []) as Record<string, unknown>[],
        );
        const combosCarta = armarCombosCarta(
          productos,
          (comboGrupos ?? []) as Record<string, unknown>[],
          (comboOpciones ?? []) as Record<string, unknown>[],
        );
        const carta = construirMenuUber(productos, categorias, {
          titulo: cx.tienda_nombre_app ? `Carta · ${cx.tienda_nombre_app}` : "Carta",
          grupos: gruposCarta, combos: combosCarta,
        });
        if (carta.items === 0) return json({ error: "CARTA_VACIA", excluidos: carta.excluidos }, 409);
        try { await uber.reemplazarMenu(cx.tienda_id_externo, carta.menu); }
        catch (e) {
          await registrar("menu", false, msg(e), cx.id, cx.tienda_id_externo);
          return json({ error: "UBER_ERROR", detalle: msg(e) }, 502);
        }
        const ahora = new Date().toISOString();
        await admin.from("delivery_conexiones").update({
          ultimo_evento_at: ahora,
          config: {
            ...(cx.config ?? {}), carta_enviada_at: ahora, carta_items: carta.items, carta_categorias: carta.categorias,
            carta_grupos: carta.grupos, carta_opciones: carta.opcionesModificador,
          },
        }).eq("id", cx.id);
        await registrar("menu", true, {
          items: carta.items, categorias: carta.categorias, grupos: carta.grupos, opciones: carta.opcionesModificador,
          combos: carta.combos, excluidos: carta.excluidos.length,
        }, cx.id, cx.tienda_id_externo);
        return json({
          items: carta.items, categorias: carta.categorias, grupos: carta.grupos, opciones: carta.opcionesModificador,
          excluidos: carta.excluidos,
        });
      }
      default:
        return json({ error: "ACCION_DESCONOCIDA" }, 400);
    }
  } catch (e) {
    return json({ error: "INTERNO", detalle: msg(e) }, 500);
  }
});
