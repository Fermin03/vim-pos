// Renueva los permisos de Mercado Pago antes de que venzan (ADR 0033). El access token del
// restaurante dura 180 días; con su refresh token se saca otro sin molestar al dueño. La llama la
// base una vez al día (pg_cron → pg_net, migración 0171) con el secreto interno `x-vim-interno`:
// no hay usuario, así que no lleva JWT (`verify_jwt = false` en config.toml).
//
// Cada renovación CAMBIA también el refresh token y el viejo deja de servir: se guarda el par nuevo
// en cuanto llega. Si la renovación falla, la conexión no se toca (su token actual sigue cobrando
// hasta que venza): solo se anota el motivo, y se reintenta al día siguiente.
import { clienteAdmin, servir } from "../_shared/http.ts";
import { registrarError, textoDeError } from "../_shared/errores.ts";
import { secretoInternoValido } from "../_shared/delivery/interno.ts";
import { pedirTokens } from "../_shared/terminal/mercado-pago-conexion.ts";

const admin = clienteAdmin();
const INTERNO = Deno.env.get("VIM_INTERNO_SECRET") ?? "";
const CLIENT_ID = Deno.env.get("MP_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("MP_CLIENT_SECRET") ?? "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIAS_ANTES = 30;
const POR_PASADA = 50;

servir(async (req, json) => {
  if (!secretoInternoValido((req.headers.get("x-vim-interno") ?? "").trim(), INTERNO)) return json({ error: "INTERNO_INVALIDO" }, 401);
  if (!CLIENT_ID || !CLIENT_SECRET) return json({ error: "MP_NO_CONFIGURADO" }, 503);
  try {
    // `conexion_id` y `dias` existen para probar una sola conexión sin esperar a que le falte un mes.
    const b = (await req.json().catch(() => ({}))) as { conexion_id?: unknown; dias?: unknown };
    const dias = Number.isInteger(b.dias) && (b.dias as number) > 0 && (b.dias as number) <= 365 ? b.dias as number : DIAS_ANTES;
    let q = admin.from("terminal_conexiones").select("id")
      .eq("proveedor", "MERCADO_PAGO").eq("estado", "ACTIVA")
      .lt("vence_at", new Date(Date.now() + dias * 86_400_000).toISOString())
      .order("vence_at").limit(POR_PASADA);
    if (typeof b.conexion_id === "string" && UUID.test(b.conexion_id)) q = q.eq("id", b.conexion_id);
    const { data, error } = await q;
    if (error) throw error;

    let renovadas = 0, fallidas = 0;
    for (const { id } of (data ?? []) as { id: string }[]) {
      const anotar = async (motivo: string) => {
        fallidas++;
        registrarError("terminal-mp-renovar", "NO_RENOVADA", `${id}: ${motivo}`);
        await admin.from("terminal_conexiones").update({ ultimo_error: `No se pudo renovar el permiso: ${motivo}` }).eq("id", id);
      };
      try {
        const { data: tk, error: eTk } = await admin.rpc("terminal_leer_tokens", { p_conexion: id });
        if (eTk) throw eTk;
        const refresh = (tk as { refresh_token: string | null }[] | null)?.[0]?.refresh_token;
        if (!refresh) { await anotar("no hay refresh token guardado"); continue; }
        const r = await pedirTokens({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, refreshToken: refresh });
        if (!r.tokens) { await anotar(`Mercado Pago respondió ${r.status} ${r.codigo ?? ""}`.trim()); continue; }
        const { error: eG } = await admin.rpc("terminal_guardar_tokens", {
          p_conexion: id, p_access: r.tokens.access_token, p_refresh: r.tokens.refresh_token, p_vence: r.tokens.vence_at,
        });
        // Lo peor que puede pasar: Mercado Pago ya invalidó el par viejo y el nuevo no se guardó.
        // Esa conexión hay que volver a autorizarla desde el panel; que quede dicho bien claro.
        if (eG) { await anotar(`el permiso nuevo NO se pudo guardar (${textoDeError(eG)}); hay que volver a conectar`); continue; }
        renovadas++;
      } catch (e) {
        await anotar(textoDeError(e));
      }
    }
    return json({ ok: true, revisadas: (data ?? []).length, renovadas, fallidas });
  } catch (e) {
    registrarError("terminal-mp-renovar", "ERROR_INTERNO", textoDeError(e));
    return json({ error: "ERROR_INTERNO" }, 500);
  }
});
