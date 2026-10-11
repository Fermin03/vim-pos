// Renueva los permisos de Mercado Pago de la TIENDA EN LÍNEA antes de que venzan (tienda_conexiones,
// 0173). Gemela de `terminal-mp-renovar`, con la aplicación de la tienda: otras credenciales, otra
// tabla, otros tokens en Vault. No lee ni toca nada de la terminal.
//
// La llama la base una vez al día (pg_cron → pg_net, `tienda_pedir_renovacion`) con el secreto
// interno `x-vim-interno`: no hay usuario, así que no lleva JWT (`verify_jwt = false` en config.toml).
// Qué conexiones tocan lo dice la base (`tienda_conexiones_por_renovar`); qué se hace con cada una
// y sus salvaguardas, `_shared/tienda/renovar-mp.ts`, que sí se prueba.
//
// SECRETOS: VIM_INTERNO_SECRET, MP_TIENDA_CLIENT_ID, MP_TIENDA_CLIENT_SECRET, VIM_AVISOS_A, VIM_SMTP_*.
import { clienteAdmin, servir } from "../_shared/http.ts";
import { registrarError, textoDeError } from "../_shared/errores.ts";
import { enviarCorreo } from "../_shared/correo.ts";
import { secretoInternoValido } from "../_shared/delivery/interno.ts";
import { pedirTokensDeTienda } from "../_shared/tienda/conexion-mp.ts";
import { avisoDeRenovacionFallida, type PuertoRenovacion, renovarConexiones } from "../_shared/tienda/renovar-mp.ts";

const FN = "tienda-mp-renovar";
const admin = clienteAdmin();
const INTERNO = Deno.env.get("VIM_INTERNO_SECRET") ?? "";
const CLIENT_ID = Deno.env.get("MP_TIENDA_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("MP_TIENDA_CLIENT_SECRET") ?? "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const puerto: PuertoRenovacion = {
  async leerRefresh(id) {
    const { data, error } = await admin.rpc("tienda_leer_tokens", { p_conexion: id });
    if (error) throw new Error(textoDeError(error));
    return (data as { refresh_token: string | null }[] | null)?.[0]?.refresh_token ?? null;
  },
  pedirTokens: (refreshToken) => pedirTokensDeTienda({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, refreshToken }),
  async guardar(id, t, publicKey) {
    const { error } = await admin.rpc("tienda_guardar_tokens", {
      p_conexion: id, p_access: t.access_token, p_refresh: t.refresh_token, p_vence: t.vence_at, p_public_key: publicKey,
    });
    return error ? textoDeError(error) : null;
  },
  async anotar(id, motivo, definitiva) {
    const { error } = await admin.from("tienda_conexiones")
      .update({ ultimo_error: motivo.slice(0, 300), ...(definitiva && { estado: "ERROR" }) }).eq("id", id);
    if (error) throw new Error(textoDeError(error));
  },
  async avisar(id, motivo) {
    const { data } = await admin.from("tienda_conexiones").select("cuenta_nombre, vence_at, negocio:tenants(nombre_comercial)").eq("id", id).maybeSingle();
    const f = data as { cuenta_nombre?: string | null; vence_at?: string | null; negocio?: { nombre_comercial?: string | null } | null } | null;
    const r = await enviarCorreo({
      to: Deno.env.get("VIM_AVISOS_A") ?? "hola@vimpos.com.mx",
      ...avisoDeRenovacionFallida({ negocio: f?.negocio?.nombre_comercial ?? "", cuenta: f?.cuenta_nombre ?? "Cuenta de Mercado Pago", conexionId: id, motivo, vence: f?.vence_at ?? null }),
    });
    if (!r.enviado) throw new Error("el correo no salió");
  },
  registrar: (codigo, detalle) => registrarError(FN, codigo, detalle),
};

servir(async (req, json) => {
  if (!secretoInternoValido((req.headers.get("x-vim-interno") ?? "").trim(), INTERNO)) return json({ error: "INTERNO_INVALIDO" }, 401);
  if (!CLIENT_ID || !CLIENT_SECRET) return json({ error: "MP_NO_CONFIGURADO" }, 503);
  try {
    // `conexion_id` y `dias` existen para probar una sola conexión sin esperar a que le falte un mes.
    const b = (await req.json().catch(() => ({}))) as { conexion_id?: unknown; dias?: unknown };
    const dias = Number.isInteger(b.dias) && (b.dias as number) > 0 && (b.dias as number) <= 365 ? b.dias as number : 30;
    const { data, error } = await admin.rpc("tienda_conexiones_por_renovar", { p_dias: dias, p_max: 50 });
    if (error) throw error;
    let ids = ((data ?? []) as unknown[]).filter((x): x is string => typeof x === "string");
    if (typeof b.conexion_id === "string" && UUID.test(b.conexion_id)) ids = ids.filter((id) => id === (b.conexion_id as string).toLowerCase());
    return json({ ok: true, ...(await renovarConexiones(puerto, ids)) });
  } catch (e) {
    registrarError(FN, "ERROR_INTERNO", textoDeError(e));
    return json({ error: "ERROR_INTERNO" }, 500);
  }
});
