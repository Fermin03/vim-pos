// Conectar Clip PinPad desde el admin. El dueño pega la API key y la clave secreta de su Panel de
// Desarrollador de Clip; se prueban contra Clip, se guardan solo en Vault y se liga cada lector (por
// número de serie) a una caja. Mismo control de acceso que terminal-mp-conexion: Dueño/Administrador
// (jerarquía >= 4) y todo filtra por el negocio del JWT.
//
// Las claves nunca van a registrarError, a console ni a ninguna tabla: de Clip solo se registra el
// HTTP y el código de error. `cuenta_id_externo` es el sha256 de la API key, no la clave.
import { clienteAdmin, servir } from "../_shared/http.ts";
import { registrarError, textoDeError } from "../_shared/errores.ts";
import { bearerDe, tenantDelToken } from "../_shared/identidad.ts";
import { clienteClip, lectoresDe, type RespuestaClip } from "../_shared/terminal/clip.ts";
import { cuentaDeClave, nombreDeCuenta, timeoutDelLector, validarConfiguracion, validarCredenciales } from "../_shared/terminal/clip-conexion.ts";
import { ESPERA_CLIP } from "../_shared/terminal/proveedor.ts";

const admin = clienteAdmin();
const JERARQUIA_MINIMA = 4;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOTE_LECTORES = 25; // máximo de lectores por petición a /devices

type Rol = { jerarquia?: number };
const uuid = (v: unknown): string | null => (typeof v === "string" && UUID.test(v) ? v.toLowerCase() : null);
const cliente = (apiKey: string, secreto: string) => clienteClip(apiKey, secreto, fetch, ESPERA_CLIP.resto);
const ok2xx = (r: RespuestaClip) => r.status >= 200 && r.status < 300;
const logClip = (codigo: string, r: RespuestaClip) => registrarError("terminal-clip-conexion", codigo, `HTTP ${r.status} ${r.codigo ?? ""}`);

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

    // Los lectores de la cuenta según Clip, o la respuesta de error ya armada.
    const lectoresDeClip = async (clip: ReturnType<typeof cliente>, rechazo: "CLAVE_RECHAZADA" | "CONEXION_INVALIDA") => {
      const r = await clip.estadoLectores();
      if (ok2xx(r)) return { lectores: lectoresDe(r.cuerpo) };
      const error = r.status === 401 ? rechazo : r.status === 0 ? "CLIP_SIN_RESPUESTA" : "CLIP_ERROR";
      logClip(error, r);
      return { fallo: json({ error }, r.status === 401 ? 409 : r.status === 0 ? 504 : 502) };
    };

    // La conexión de Clip pedida, siempre de ESTE negocio y viva; con su cliente ya armado.
    const conexionDe = async (id: unknown) => {
      const cid = uuid(id);
      if (!cid) return null;
      const { data } = await admin.from("terminal_conexiones").select("id")
        .eq("id", cid).eq("tenant_id", tenantId).eq("proveedor", "CLIP").neq("estado", "DESCONECTADA").maybeSingle();
      if (!data) return null;
      const { data: tk, error } = await admin.rpc("terminal_leer_tokens", { p_conexion: cid });
      if (error) throw error;
      const t = (tk as { access_token: string | null; refresh_token: string | null }[] | null)?.[0];
      return t?.access_token && t.refresh_token ? { id: cid, clip: cliente(t.access_token, t.refresh_token) } : null;
    };

    if (b.accion === "conectar") {
      const v = validarCredenciales(b);
      if (!v.ok) return json({ error: v.error }, 400);
      // Clave mala (401) o Clip mudo: no se guarda nada.
      const l = await lectoresDeClip(cliente(v.api_key, v.secreto), "CLAVE_RECHAZADA");
      if (l.fallo) return l.fallo;
      const { data: fila, error } = await admin.from("terminal_conexiones").upsert({
        tenant_id: tenantId, proveedor: "CLIP", cuenta_id_externo: await cuentaDeClave(v.api_key),
        cuenta_nombre: nombreDeCuenta(v.api_key), de_prueba: false, estado: "ACTIVA", ultimo_error: null,
        vence_at: null, conectada_at: new Date().toISOString(),
      }, { onConflict: "tenant_id,proveedor,cuenta_id_externo" }).select("id").single();
      if (error) throw error;
      const conexionId = (fila as { id: string }).id;
      const { error: eTok } = await admin.rpc("terminal_guardar_tokens", {
        p_conexion: conexionId, p_access: v.api_key, p_refresh: v.secreto, p_vence: null,
      });
      if (eTok) throw eTok;
      return json({ ok: true, conexion_id: conexionId, lectores: l.lectores });
    }

    if (b.accion === "lectores") {
      const c = await conexionDe(b.conexion_id);
      if (!c) return json({ error: "CONEXION_NO_EXISTE" }, 404);
      const l = await lectoresDeClip(c.clip, "CONEXION_INVALIDA");
      return l.fallo ?? json({ ok: true, lectores: l.lectores });
    }

    if (b.accion === "sucursal") {
      // Clip no tiene sucursales: solo se anota que esta sucursal cobra con esa cuenta.
      const sucursalId = uuid(b.sucursal_id);
      if (!sucursalId) return json({ error: "FALTAN_CAMPOS" }, 400);
      const c = await conexionDe(b.conexion_id);
      if (!c) return json({ error: "CONEXION_NO_EXISTE" }, 404);
      const { data: s } = await admin.from("sucursales").select("id").eq("id", sucursalId).eq("tenant_id", tenantId).maybeSingle();
      if (!s) return json({ error: "SUCURSAL_NO_EXISTE" }, 404);
      // La propina en el lector se enciende en la sección de Clip: no se hereda la de Mercado Pago.
      const { error } = await admin.from("terminal_config_sucursal").upsert(
        { sucursal_id: sucursalId, tenant_id: tenantId, conexion_id: c.id, propina_en_terminal: false }, { onConflict: "sucursal_id" });
      if (error) throw error;
      // Si venía de otra cuenta (Mercado Pago), sus terminales dejan de recibir el cobro desde la caja.
      // La fila se queda (con su terminal) por si se regresa; la caja liga después su lector de Clip.
      const { error: eDisp } = await admin.from("terminal_dispositivos").update({ activa: false })
        .eq("tenant_id", tenantId).eq("sucursal_id", sucursalId).neq("conexion_id", c.id);
      if (eDisp) throw eDisp;
      return json({ ok: true });
    }

    if (b.accion === "caja") {
      const cajaId = uuid(b.caja_id);
      const serie = typeof b.serie === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(b.serie) ? b.serie : null;
      if (!cajaId || !serie) return json({ error: "FALTAN_CAMPOS" }, 400);
      const { data: k } = await admin.from("cajas").select("id, sucursal_id")
        .eq("id", cajaId).eq("tenant_id", tenantId).eq("activa", true).is("deleted_at", null).maybeSingle();
      const caja = k as { id: string; sucursal_id: string } | null;
      if (!caja) return json({ error: "CAJA_NO_EXISTE" }, 404);
      const { data: g } = await admin.from("terminal_config_sucursal").select("conexion_id")
        .eq("sucursal_id", caja.sucursal_id).eq("tenant_id", tenantId).maybeSingle();
      const c = g ? await conexionDe((g as { conexion_id: string }).conexion_id) : null;
      if (!c) return json({ error: "SUCURSAL_SIN_CONECTAR" }, 409);
      const l = await lectoresDeClip(c.clip, "CONEXION_INVALIDA");
      if (l.fallo) return l.fallo;
      if (!l.lectores.some((x) => x.serie === serie)) return json({ error: "LECTOR_NO_ES_DE_LA_CUENTA" }, 409);
      // terminal_id_externo es UNIQUE: si el lector estaba en otra caja (de este negocio, o de otro que
      // ya lo soltó: fila inactiva o conexión DESCONECTADA), se le quita; un lector cobra para una sola
      // caja. Solo un lector activo en otro negocio bloquea.
      const { data: o, error: eOtra } = await admin.from("terminal_dispositivos").select("caja_id, tenant_id, activa, conexion_id")
        .eq("terminal_id_externo", serie).maybeSingle();
      if (eOtra) throw eOtra;
      const otra = o as { caja_id: string; tenant_id: string; activa: boolean; conexion_id: string } | null;
      if (otra && otra.tenant_id !== tenantId && otra.activa) {
        const { data: cx, error: eCx } = await admin.from("terminal_conexiones").select("estado").eq("id", otra.conexion_id).maybeSingle();
        if (eCx) throw eCx;
        if ((cx as { estado: string } | null)?.estado !== "DESCONECTADA") return json({ error: "LECTOR_EN_OTRO_NEGOCIO" }, 409);
      }
      if (otra && otra.caja_id !== caja.id) {
        const { error } = await admin.from("terminal_dispositivos").update({ terminal_id_externo: null, activa: false })
          .eq("caja_id", otra.caja_id).eq("tenant_id", otra.tenant_id);
        if (error) throw error;
      }
      const { error } = await admin.from("terminal_dispositivos").upsert({
        caja_id: caja.id, tenant_id: tenantId, sucursal_id: caja.sucursal_id, conexion_id: c.id,
        caja_id_externo: null, terminal_id_externo: serie, activa: true, modo: null,
      }, { onConflict: "caja_id" });
      if (error) throw error;
      return json({ ok: true });
    }

    if (b.accion === "configurar") {
      const v = validarConfiguracion(b);
      if (!v.ok) return json({ error: v.error }, 400);
      const { data: g } = await admin.from("terminal_config_sucursal").select("conexion_id")
        .eq("sucursal_id", v.sucursal_id).eq("tenant_id", tenantId).maybeSingle();
      const c = g ? await conexionDe((g as { conexion_id: string }).conexion_id) : null;
      if (!c) return json({ error: "SUCURSAL_SIN_CONECTAR" }, 409);
      const { error } = await admin.from("terminal_config_sucursal")
        .update({
          espera_segundos: v.espera_segundos, imprime_terminal: v.imprime_terminal,
          propina_opciones: v.propina_opciones, propina_en_terminal: v.propina_en_terminal,
        })
        .eq("sucursal_id", v.sucursal_id).eq("tenant_id", tenantId);
      if (error) throw error;
      // La espera vive en el lector (`timeout_seg`), no en cada cobro. Si Clip falla, lo guardado
      // queda y se avisa: se vuelve a mandar al guardar otra vez.
      const { data: disp, error: eDisp } = await admin.from("terminal_dispositivos").select("terminal_id_externo")
        .eq("tenant_id", tenantId).eq("sucursal_id", v.sucursal_id).eq("conexion_id", c.id).eq("activa", true)
        .not("terminal_id_externo", "is", null);
      if (eDisp) throw eDisp;
      const series = ((disp ?? []) as { terminal_id_externo: string }[]).map((d) => d.terminal_id_externo);
      let fallo = false;
      for (let i = 0; i < series.length; i += LOTE_LECTORES) {
        const r = await c.clip.configurarLectores(series.slice(i, i + LOTE_LECTORES), timeoutDelLector(v.espera_segundos));
        if (!ok2xx(r)) { logClip("CONFIGURAR_LECTORES", r); fallo = true; }
      }
      return json(fallo ? { ok: true, aviso: "LECTORES_SIN_CONFIGURAR" } : { ok: true });
    }

    if (b.accion === "desconectar") {
      // Clip no tiene modo «PDV» que apagar: se sueltan los lectores (sin serie, para que otra cuenta
      // o negocio pueda ligarlos) y se borran las claves. La conexión se marca DESCONECTADA ANTES de
      // borrar Vault: nunca queda una ACTIVA sin credencial.
      const c = await conexionDe(b.conexion_id);
      if (!c) return json({ error: "CONEXION_NO_EXISTE" }, 404);
      const { error } = await admin.from("terminal_dispositivos").update({ activa: false, terminal_id_externo: null })
        .eq("tenant_id", tenantId).eq("conexion_id", c.id);
      if (error) throw error;
      const { error: eCx } = await admin.from("terminal_conexiones").update({ estado: "DESCONECTADA" }).eq("id", c.id);
      if (eCx) throw eCx;
      const { error: eTok } = await admin.rpc("terminal_borrar_tokens", { p_conexion: c.id });
      if (eTok) throw eTok;
      return json({ ok: true });
    }

    return json({ error: "ACCION_INVALIDA" }, 400);
  } catch (e) {
    // Solo errores de la base o de la red llegan aquí; nunca el cuerpo de la petición.
    registrarError("terminal-clip-conexion", "ERROR_INTERNO", textoDeError(e));
    return json({ error: "ERROR_INTERNO" }, 500);
  }
});
