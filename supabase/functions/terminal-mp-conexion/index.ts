// Conectar Mercado Pago desde el admin (ADR 0033). El dueño autoriza en Mercado Pago; aquí se canjea
// el code (el client secret nunca sale de Supabase), se guardan sus tokens en Vault y se refleja su
// sucursal → caja → terminal. Solo Dueño/Administrador (jerarquía >= 4); todo filtra por el negocio
// del JWT.
import { clienteAdmin, servir } from "../_shared/http.ts";
import { registrarError, textoDeError } from "../_shared/errores.ts";
import { bearerDe, tenantDelToken } from "../_shared/identidad.ts";
import { clienteMpConfig, pedirTokens } from "../_shared/terminal/mercado-pago-conexion.ts";

const admin = clienteAdmin();
const CLIENT_ID = Deno.env.get("MP_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("MP_CLIENT_SECRET") ?? "";
const REDIRECT_URI = Deno.env.get("MP_REDIRECT_URI") ?? "https://admin.vimpos.com.mx/integraciones/mercado-pago/callback";
const JERARQUIA_MINIMA = 4;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Rol = { jerarquia?: number };
type Conexion = { id: string; cuenta_id_externo: string; estado: string };
const uuid = (v: unknown): string | null => (typeof v === "string" && UUID.test(v) ? v.toLowerCase() : null);

servir(async (req, json) => {
  try {
    const token = bearerDe(req);
    if (!token) return json({ error: "NO_AUTH" }, 401);
    const { data: userResp, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userResp?.user) return json({ error: "AUTH_INVALIDA" }, 401);
    const tenantId = tenantDelToken(token);
    if (!tenantId) return json({ error: "SIN_TENANT" }, 403);
    const { data: accesos } = await admin.from("usuarios_acceso").select("rol:roles(jerarquia)")
      .eq("usuario_id", userResp.user.id).eq("tenant_id", tenantId).eq("activo", true);
    const jerarquia = Math.max(0, ...((accesos ?? []) as unknown as { rol: Rol | Rol[] | null }[])
      .map((a) => (Array.isArray(a.rol) ? a.rol[0] : a.rol)?.jerarquia ?? 0));
    if (jerarquia < JERARQUIA_MINIMA) return json({ error: "SIN_PERMISO" }, 403);

    let b: Record<string, unknown>;
    try { b = await req.json(); } catch { return json({ error: "BAD_JSON" }, 400); }

    // La conexión pedida, siempre de ESTE negocio; con su cliente de Mercado Pago ya armado.
    const conexionDe = async (id: unknown) => {
      const cid = uuid(id);
      if (!cid) return null;
      const { data } = await admin.from("terminal_conexiones").select("id, cuenta_id_externo, estado")
        .eq("id", cid).eq("tenant_id", tenantId).maybeSingle();
      const cx = data as Conexion | null;
      if (!cx || cx.estado === "DESCONECTADA") return null;
      const { data: tk, error } = await admin.rpc("terminal_leer_tokens", { p_conexion: cx.id });
      if (error) throw error;
      const acceso = (tk as { access_token: string | null }[] | null)?.[0]?.access_token;
      return acceso ? { cx, mp: clienteMpConfig(acceso) } : null;
    };

    if (b.accion === "canjear") {
      if (!CLIENT_ID || !CLIENT_SECRET) return json({ error: "MP_NO_CONFIGURADO" }, 503);
      if (typeof b.code !== "string" || b.code === "" || b.code.length > 200) return json({ error: "FALTAN_CAMPOS" }, 400);
      const r = await pedirTokens({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, code: b.code, redirectUri: REDIRECT_URI });
      if (!r.tokens) {
        registrarError("terminal-mp-conexion", "CANJE_RECHAZADO", `HTTP ${r.status} ${r.codigo ?? ""}`);
        return json({ error: "CANJE_RECHAZADO" }, 409);
      }
      const t = r.tokens;
      const nombre = await clienteMpConfig(t.access_token).nombre();
      const { data: fila, error } = await admin.from("terminal_conexiones").upsert({
        tenant_id: tenantId, proveedor: "MERCADO_PAGO", cuenta_id_externo: t.user_id, cuenta_nombre: nombre,
        de_prueba: t.de_prueba, estado: "ACTIVA", ultimo_error: null, conectada_at: new Date().toISOString(),
      }, { onConflict: "tenant_id,proveedor,cuenta_id_externo" }).select("id").single();
      if (error) throw error;
      const conexionId = (fila as { id: string }).id;
      const { error: eTok } = await admin.rpc("terminal_guardar_tokens", {
        p_conexion: conexionId, p_access: t.access_token, p_refresh: t.refresh_token, p_vence: t.vence_at,
      });
      if (eTok) throw eTok;
      return json({ ok: true, conexion_id: conexionId, cuenta_nombre: nombre, de_prueba: t.de_prueba });
    }

    if (b.accion === "sucursal") {
      // Liga una sucursal de VIM a la cuenta y la crea en Mercado Pago, que exige dirección y coordenadas.
      const sucursalId = uuid(b.sucursal_id);
      const lat = Number(b.latitud), lng = Number(b.longitud);
      if (!sucursalId || !(Math.abs(lat) <= 90) || !(Math.abs(lng) <= 180) || (lat === 0 && lng === 0)) return json({ error: "FALTAN_CAMPOS" }, 400);
      const c = await conexionDe(b.conexion_id);
      if (!c) return json({ error: "CONEXION_NO_EXISTE" }, 404);
      const { data: s } = await admin.from("sucursales").select("nombre, direccion_calle, direccion_numero, ciudad, estado_geo")
        .eq("id", sucursalId).eq("tenant_id", tenantId).maybeSingle();
      const suc = s as { nombre: string; direccion_calle: string | null; direccion_numero: string | null; ciudad: string | null; estado_geo: string | null } | null;
      if (!suc) return json({ error: "SUCURSAL_NO_EXISTE" }, 404);
      if (!suc.direccion_calle || !suc.ciudad || !suc.estado_geo) return json({ error: "SUCURSAL_SIN_DIRECCION" }, 409);
      const storeId = await c.mp.sucursal(c.cx.cuenta_id_externo, sucursalId, {
        nombre: suc.nombre, calle: suc.direccion_calle, numero: suc.direccion_numero ?? "S/N",
        ciudad: suc.ciudad, estado: suc.estado_geo, latitud: lat, longitud: lng,
      });
      if (!storeId) return json({ error: "MP_ERROR" }, 502);
      await admin.from("sucursales").update({ geo_lat: lat, geo_lng: lng }).eq("id", sucursalId).eq("tenant_id", tenantId);
      const { error } = await admin.from("terminal_config_sucursal").upsert(
        { sucursal_id: sucursalId, tenant_id: tenantId, conexion_id: c.cx.id, sucursal_id_externo: storeId }, { onConflict: "sucursal_id" });
      if (error) throw error;
      return json({ ok: true });
    }

    if (b.accion === "caja") {
      // Crea la caja en Mercado Pago. Después el dueño liga la terminal a mano y se detecta con «terminales».
      const cajaId = uuid(b.caja_id);
      if (!cajaId) return json({ error: "FALTAN_CAMPOS" }, 400);
      const { data: k } = await admin.from("cajas").select("id, nombre, sucursal_id")
        .eq("id", cajaId).eq("tenant_id", tenantId).eq("activa", true).is("deleted_at", null).maybeSingle();
      const caja = k as { id: string; nombre: string; sucursal_id: string } | null;
      if (!caja) return json({ error: "CAJA_NO_EXISTE" }, 404);
      const { data: g } = await admin.from("terminal_config_sucursal").select("conexion_id, sucursal_id_externo")
        .eq("sucursal_id", caja.sucursal_id).eq("tenant_id", tenantId).maybeSingle();
      const cfg = g as { conexion_id: string; sucursal_id_externo: string | null } | null;
      if (!cfg?.sucursal_id_externo) return json({ error: "SUCURSAL_SIN_CONECTAR" }, 409);
      const c = await conexionDe(cfg.conexion_id);
      if (!c) return json({ error: "CONEXION_NO_EXISTE" }, 404);
      const posId = await c.mp.caja(cfg.sucursal_id_externo, caja.id, caja.nombre);
      if (!posId) return json({ error: "MP_ERROR" }, 502);
      const { error } = await admin.from("terminal_dispositivos").upsert({
        caja_id: caja.id, tenant_id: tenantId, sucursal_id: caja.sucursal_id, conexion_id: c.cx.id, caja_id_externo: posId,
      }, { onConflict: "caja_id" });
      if (error) throw error;
      return json({ ok: true });
    }

    if (b.accion === "terminales") {
      // Qué terminal quedó ligada a cada caja (lo decide el dueño en la terminal) y en qué modo está.
      const c = await conexionDe(b.conexion_id);
      if (!c) return json({ error: "CONEXION_NO_EXISTE" }, 404);
      const lista = await c.mp.terminales();
      const { data: disp } = await admin.from("terminal_dispositivos").select("caja_id, caja_id_externo")
        .eq("tenant_id", tenantId).eq("conexion_id", c.cx.id);
      for (const d of (disp ?? []) as { caja_id: string; caja_id_externo: string }[]) {
        const t = lista.find((x) => x.pos_id === d.caja_id_externo);
        await admin.from("terminal_dispositivos")
          .update({ terminal_id_externo: t?.id ?? null, modo: t?.modo ?? null, activa: t?.modo === "PDV" }).eq("caja_id", d.caja_id);
      }
      return json({ ok: true, terminales: lista.length });
    }

    if (b.accion === "modo") {
      const cajaId = uuid(b.caja_id);
      const modo = b.modo === "PDV" || b.modo === "STANDALONE" ? b.modo : null;
      if (!cajaId || !modo) return json({ error: "FALTAN_CAMPOS" }, 400);
      const { data: d } = await admin.from("terminal_dispositivos").select("conexion_id, terminal_id_externo")
        .eq("caja_id", cajaId).eq("tenant_id", tenantId).maybeSingle();
      const disp = d as { conexion_id: string; terminal_id_externo: string | null } | null;
      if (!disp?.terminal_id_externo) return json({ error: "SIN_TERMINAL" }, 409);
      const c = await conexionDe(disp.conexion_id);
      if (!c) return json({ error: "CONEXION_NO_EXISTE" }, 404);
      if (!(await c.mp.modo(disp.terminal_id_externo, modo))) return json({ error: "MP_ERROR" }, 502);
      await admin.from("terminal_dispositivos").update({ modo, activa: modo === "PDV" }).eq("caja_id", cajaId);
      return json({ ok: true, modo });
    }

    if (b.accion === "configurar") {
      const sucursalId = uuid(b.sucursal_id);
      const espera = Number(b.espera_segundos);
      if (!sucursalId || !Number.isInteger(espera) || espera < 30 || espera > 10800
        || typeof b.imprime_terminal !== "boolean" || typeof b.propina_en_terminal !== "boolean") return json({ error: "FALTAN_CAMPOS" }, 400);
      const { data, error } = await admin.from("terminal_config_sucursal")
        .update({ espera_segundos: espera, imprime_terminal: b.imprime_terminal, propina_en_terminal: b.propina_en_terminal })
        .eq("sucursal_id", sucursalId).eq("tenant_id", tenantId).select("sucursal_id");
      if (error) throw error;
      return (data ?? []).length ? json({ ok: true }) : json({ error: "SUCURSAL_SIN_CONECTAR" }, 409);
    }

    if (b.accion === "desconectar") {
      // Las terminales vuelven a teclear el monto a mano, se borran los tokens y la caja regresa sola
      // al registro manual. Si Mercado Pago no contesta, se desconecta igual: el modo se cambia en la terminal.
      const c = await conexionDe(b.conexion_id);
      if (!c) return json({ error: "CONEXION_NO_EXISTE" }, 404);
      const { data: disp } = await admin.from("terminal_dispositivos").select("terminal_id_externo")
        .eq("tenant_id", tenantId).eq("conexion_id", c.cx.id).not("terminal_id_externo", "is", null);
      for (const d of (disp ?? []) as { terminal_id_externo: string }[]) {
        await c.mp.modo(d.terminal_id_externo, "STANDALONE").catch(() => false);
      }
      await admin.from("terminal_dispositivos").update({ activa: false, modo: "STANDALONE" }).eq("tenant_id", tenantId).eq("conexion_id", c.cx.id);
      const { error: eTok } = await admin.rpc("terminal_borrar_tokens", { p_conexion: c.cx.id });
      if (eTok) throw eTok;
      await admin.from("terminal_conexiones").update({ estado: "DESCONECTADA" }).eq("id", c.cx.id);
      return json({ ok: true });
    }

    return json({ error: "ACCION_INVALIDA" }, 400);
  } catch (e) {
    registrarError("terminal-mp-conexion", "ERROR_INTERNO", textoDeError(e));
    return json({ error: "ERROR_INTERNO" }, 500);
  }
});
