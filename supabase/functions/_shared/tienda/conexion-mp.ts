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
import { registrarError } from "../errores.ts";
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
 */
export async function conexionDeTienda(admin: Admin, tenantId: string, b: Record<string, unknown>, json: Json): Promise<Response> {
  const env = (k: string) => (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get(k) ?? "";

  if (b.accion === "canjear") {
    const clientId = env("MP_TIENDA_CLIENT_ID"), clientSecret = env("MP_TIENDA_CLIENT_SECRET");
    if (!clientId || !clientSecret) return json({ error: "MP_NO_CONFIGURADO" }, 503);
    if (typeof b.code !== "string" || b.code === "" || b.code.length > 200) return json({ error: "FALTAN_CAMPOS" }, 400);
    // La misma URL de regreso que la terminal: es la que está registrada en la aplicación de la tienda.
    const redirectUri = env("MP_REDIRECT_URI") || "https://admin.vimpos.com.mx/integraciones/mercado-pago/callback";
    const r = await pedirTokensDeTienda({ clientId, clientSecret, code: b.code, redirectUri });
    if (!r.tokens) {
      registrarError("terminal-mp-conexion", "TIENDA_CANJE_RECHAZADO", `HTTP ${r.status} ${r.codigo ?? ""}`);
      return json({ error: "CANJE_RECHAZADO" }, 409);
    }
    // Sin public key la tienda no puede convertir la tarjeta en token: no hay conexión que guardar.
    if (!r.publicKey) {
      registrarError("terminal-mp-conexion", "TIENDA_SIN_PUBLIC_KEY", `cuenta ${r.tokens.user_id}`);
      return json({ error: "SIN_PUBLIC_KEY" }, 409);
    }
    const t = r.tokens;
    const nombre = await clienteMpConfig(t.access_token).nombre();
    const { data: fila, error } = await admin.from("tienda_conexiones").upsert({
      tenant_id: tenantId, cuenta_id_externo: t.user_id, cuenta_nombre: nombre, public_key: r.publicKey,
      de_prueba: t.de_prueba, estado: "ACTIVA", ultimo_error: null, conectada_at: new Date().toISOString(),
    }, { onConflict: "tenant_id,cuenta_id_externo" }).select("id").single();
    if (error) throw error;
    const conexionId = (fila as { id: string }).id;
    const { error: eTok } = await admin.rpc("tienda_guardar_tokens", {
      p_conexion: conexionId, p_access: t.access_token, p_refresh: t.refresh_token, p_vence: t.vence_at,
    });
    if (eTok) throw eTok;
    return json({ ok: true, conexion_id: conexionId, cuenta_nombre: nombre, de_prueba: t.de_prueba });
  }

  if (b.accion === "desconectar") {
    const id = typeof b.conexion_id === "string" && UUID.test(b.conexion_id) ? b.conexion_id.toLowerCase() : null;
    if (!id) return json({ error: "FALTAN_CAMPOS" }, 400);
    const { data } = await admin.from("tienda_conexiones").select("id, estado").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    const cx = data as { id: string; estado: string } | null;
    if (!cx || cx.estado === "DESCONECTADA") return json({ error: "CONEXION_NO_EXISTE" }, 404);
    // Con los tokens se van las devoluciones: mientras haya un cobro sin resolver o una devolución
    // pendiente con esta cuenta, no se desconecta (el dinero de un cliente depende de ese token).
    const { count, error: ePend } = await admin.from("tienda_pagos").select("id", { count: "exact", head: true })
      .eq("conexion_id", cx.id).in("estado", ["CREADO", "POR_DEVOLVER"]);
    if (ePend) throw ePend;
    if ((count ?? 0) > 0) return json({ error: "PAGOS_PENDIENTES" }, 409);
    const { error: eTok } = await admin.rpc("tienda_borrar_tokens", { p_conexion: cx.id });
    if (eTok) throw eTok;
    const { error } = await admin.from("tienda_conexiones").update({ estado: "DESCONECTADA" }).eq("id", cx.id).eq("tenant_id", tenantId);
    if (error) throw error;
    return json({ ok: true });
  }

  return json({ error: "ACCION_INVALIDA" }, 400);
}
