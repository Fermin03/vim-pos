// La conexión de la TIENDA EN LÍNEA con Mercado Pago: la aplicación «VIM POS Tienda» (Pagos online
// → Checkout API → API de Orders), que es OTRA que la de la terminal Point. Otro client id y secret,
// otros tokens (Vault `tienda:<id>:access`), otra public key, otra tabla (tienda_conexiones, 0173).
// Por qué otra: docs/integraciones/mercado-pago-checkout-pro/04-verificado-orders.md.
//
// El OAuth es el mismo flujo que el de la terminal (el dueño autoriza, se canjea el `code`), entra
// por la misma función (`terminal-mp-conexion`, que lo despacha aquí por `destino`) y vuelve a la
// misma URL del admin, que es la registrada en las dos aplicaciones. De la terminal se reutiliza,
// sin tocarlo, `pedirTokens` y `clienteMpConfig().nombre()`. Nada de aquí lee ni escribe
// terminal_conexiones.
//
// SIN PROBAR contra Mercado Pago (documento 04): este flujo con el OAuth de un restaurante real, y
// que `/oauth/token` de la aplicación nueva traiga `public_key` (la de Point la trae).
import type { clienteAdmin, Json } from "../http.ts";
import { registrarError, textoDeError } from "../errores.ts";
import { clienteMpConfig, pedirTokens, type Tokens } from "../terminal/mercado-pago-conexion.ts";

type Admin = ReturnType<typeof clienteAdmin>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A qué producto va una petición de `terminal-mp-conexion`. Lista cerrada; sin `destino`, la terminal (como siempre). */
export const DESTINOS = ["terminal", "tienda"] as const;
export type Destino = (typeof DESTINOS)[number];
export function destinoDe(v: unknown): Destino | null {
  if (v === undefined) return "terminal";
  return typeof v === "string" && (DESTINOS as readonly string[]).includes(v) ? v as Destino : null;
}

/** La public key de la respuesta de `/oauth/token`, solo si tiene su forma (`APP_USR-…` o `TEST-…`): va tal cual al navegador de los clientes. */
export function publicKeyDe(cuerpo: unknown): string | null {
  const pk = cuerpo && typeof cuerpo === "object" ? (cuerpo as Record<string, unknown>).public_key : null;
  return typeof pk === "string" && /^[A-Za-z0-9_-]{20,100}$/.test(pk) ? pk : null;
}

/**
 * Canjea el `code` (al conectar) o el refresh token (al renovar) con las credenciales de la
 * aplicación de la tienda, y devuelve los tokens y la public key si la respuesta la trae. Reutiliza
 * `pedirTokens` de la terminal tal cual; la public key se lee de la misma respuesta (aquel no la
 * devuelve, y no se le cambia nada). Una respuesta a medias (sin access, sin refresh o sin
 * vencimiento) no es un par: `tokens` es null y no hay nada que guardar.
 */
export async function pedirTokensDeTienda(
  c: Parameters<typeof pedirTokens>[0],
  pedir: typeof fetch = fetch,
): Promise<{ tokens: Tokens; publicKey: string | null } | { tokens: null; status: number; codigo: string | null }> {
  let publicKey: string | null = null;
  const leyendo: typeof fetch = async (entrada, opciones) => {
    const r = await pedir(entrada, opciones);
    if (r.ok) publicKey = publicKeyDe(await r.clone().json().catch(() => null));
    return r;
  };
  const r = await pedirTokens(c, leyendo);
  return r.tokens ? { tokens: r.tokens, publicKey } : { tokens: null, status: r.status, codigo: r.codigo };
}

/**
 * Las acciones de la conexión de la tienda. Quien llama (`terminal-mp-conexion`) ya comprobó la
 * sesión, el negocio del token y que es Dueño o Administrador. Solo corre en Deno.
 *   · `canjear` {code}: guarda la cuenta, su public key y si es de prueba; los tokens, en Vault;
 *   · `desconectar` {conexion_id}: borra los tokens y la deja DESCONECTADA.
 * LA CONEXIÓN DE PRUEBA NO ES DEL DUEÑO (modo de prueba, 0177): la pone VIM. Desde aquí no se puede
 * conectar nada con el negocio en modo de prueba (`MODO_DE_PRUEBA`), ni pisar con un canje una fila
 * `de_prueba` que ya existe (`CUENTA_DE_PRUEBA`), ni desconectarla (`CONEXION_DE_PRUEBA`).
 */
export async function conexionDeTienda(admin: Admin, tenantId: string, b: Record<string, unknown>, json: Json): Promise<Response> {
  const env = (k: string) => (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get(k) ?? "";

  // Por qué no se pudo conectar, a la vista en tienda_eventos (el log de la función no se lee a mano).
  // Nunca el código ni los tokens: solo el estado HTTP y el motivo que da Mercado Pago.
  const rastro = (motivo: string, detalle: string) =>
    admin.from("tienda_eventos").insert({ accion: `conexion:${motivo}`, error: detalle.slice(0, 300), payload: { tenant_id: tenantId } });

  if (b.accion === "canjear") {
    // En modo de prueba la conexión real no se usa y la de prueba la pone VIM: no se conecta nada.
    const modo = await admin.from("tienda_config").select("pago_de_prueba").eq("tenant_id", tenantId).maybeSingle();
    if (modo.error) throw modo.error;
    if ((modo.data as { pago_de_prueba?: unknown } | null)?.pago_de_prueba === true) return json({ error: "MODO_DE_PRUEBA" }, 409);
    const clientId = env("MP_TIENDA_CLIENT_ID"), clientSecret = env("MP_TIENDA_CLIENT_SECRET");
    if (!clientId || !clientSecret) return json({ error: "MP_NO_CONFIGURADO" }, 503);
    if (typeof b.code !== "string" || b.code === "" || b.code.length > 200) return json({ error: "FALTAN_CAMPOS" }, 400);
    // La misma URL de regreso que la terminal: es la que está registrada en la aplicación de la tienda.
    const redirectUri = env("MP_REDIRECT_URI") || "https://admin.vimpos.com.mx/integraciones/mercado-pago/callback";
    const r = await pedirTokensDeTienda({ clientId, clientSecret, code: b.code, redirectUri });
    if (!r.tokens) {
      registrarError("terminal-mp-conexion", "TIENDA_CANJE_RECHAZADO", `HTTP ${r.status} ${r.codigo ?? ""}`);
      await rastro("canje_rechazado", `HTTP ${r.status} ${r.codigo ?? ""}`);
      return json({ error: "CANJE_RECHAZADO" }, 409);
    }
    // Sin public key la tienda no puede convertir la tarjeta en token: no hay conexión que guardar.
    if (!r.publicKey) {
      registrarError("terminal-mp-conexion", "TIENDA_SIN_PUBLIC_KEY", `cuenta ${r.tokens.user_id}`);
      await rastro("sin_public_key", `cuenta ${r.tokens.user_id}`);
      return json({ error: "SIN_PUBLIC_KEY" }, 409);
    }
    const t = r.tokens;
    // Una conexión de prueba que ya existe para esa cuenta no se pisa (su token de Vault es el de
    // prueba que puso VIM, o es la marca `de_prueba` lo que se cambiaría): se dice, y no se toca.
    const previa = await admin.from("tienda_conexiones").select("id, de_prueba").eq("tenant_id", tenantId).eq("cuenta_id_externo", t.user_id).maybeSingle();
    if (previa.error) throw previa.error;
    if ((previa.data as { de_prueba?: unknown } | null)?.de_prueba === true) {
      await rastro("cuenta_de_prueba", `cuenta ${t.user_id}`);
      return json({ error: "CUENTA_DE_PRUEBA" }, 409);
    }
    const { nombre } = await clienteMpConfig(t.access_token).cuenta();
    const { data: fila, error } = await admin.from("tienda_conexiones").upsert({
      tenant_id: tenantId, cuenta_id_externo: t.user_id, cuenta_nombre: nombre, public_key: r.publicKey,
      de_prueba: t.de_prueba, estado: "ACTIVA", ultimo_error: null, conectada_at: new Date().toISOString(),
    }, { onConflict: "tenant_id,cuenta_id_externo" }).select("id").single();
    if (error) { await rastro("no_se_guardo", textoDeError(error)); throw error; }
    const conexionId = (fila as { id: string }).id;
    const { error: eTok } = await admin.rpc("tienda_guardar_tokens", {
      p_conexion: conexionId, p_access: t.access_token, p_refresh: t.refresh_token, p_vence: t.vence_at,
    });
    if (eTok) { await rastro("tokens_no_guardados", textoDeError(eTok)); throw eTok; }
    return json({ ok: true, conexion_id: conexionId, cuenta_nombre: nombre, de_prueba: t.de_prueba });
  }

  if (b.accion === "desconectar") {
    const id = typeof b.conexion_id === "string" && UUID.test(b.conexion_id) ? b.conexion_id.toLowerCase() : null;
    if (!id) return json({ error: "FALTAN_CAMPOS" }, 400);
    const { data } = await admin.from("tienda_conexiones").select("id, estado, de_prueba").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    const cx = data as { id: string; estado: string; de_prueba?: boolean } | null;
    if (!cx || cx.estado === "DESCONECTADA") return json({ error: "CONEXION_NO_EXISTE" }, 404);
    // La conexión de prueba la pone y la quita VIM: el dueño no la desconecta.
    if (cx.de_prueba === true) return json({ error: "CONEXION_DE_PRUEBA" }, 409);
    // Con los tokens se van las devoluciones: no se desconecta mientras el dinero de un cliente
    // dependa de ellos. La regla vive en la base (`tienda_conexion_ocupada`, 0173): un cobro sin
    // resolver, una devolución por hacer o fallida, o un cobro de las últimas 48 horas (la ventana
    // en la que cancelar la cuenta todavía devuelve el pago). Se le dice al dueño por qué y hasta cuándo.
    const { data: ocupada, error: eOcu } = await admin.rpc("tienda_conexion_ocupada", { p_conexion: cx.id });
    if (eOcu) throw eOcu;
    const o = ocupada as { motivo?: unknown; hasta?: unknown } | null;
    if (o) {
      return o.motivo === "RECIENTES" && typeof o.hasta === "string"
        ? json({ error: "PAGOS_RECIENTES", hasta: o.hasta }, 409)
        : json({ error: "PAGOS_PENDIENTES" }, 409);
    }
    const { error: eTok } = await admin.rpc("tienda_borrar_tokens", { p_conexion: cx.id });
    if (eTok) throw eTok;
    const { error } = await admin.from("tienda_conexiones").update({ estado: "DESCONECTADA" }).eq("id", cx.id).eq("tenant_id", tenantId);
    if (error) throw error;
    return json({ ok: true });
  }

  return json({ error: "ACCION_INVALIDA" }, 400);
}
