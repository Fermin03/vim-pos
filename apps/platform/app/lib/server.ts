import { NextResponse } from "next/server";
import { permitida } from "./ip-allowlist";
import { createHash, timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@vim/db/service";

// Capa server-side del panel de plataforma. Corre con service_role, FUERA de RLS (doc 12 §9).
//
// A8 — quién entra. Cada operador de VIM tiene su cuenta (Supabase Auth: contraseña + segundo
// factor TOTP) y la lista de operadores vive en `plataforma_operadores` (0128). El navegador
// manda su token como `Authorization: Bearer`; aquí se exige que sea válido, que venga con el
// segundo factor (`aal2`) y que la cuenta sea un operador activo.
//
// La clave compartida (PLATFORM_PROVISION_KEY en `X-Platform-Key`) queda para el arranque: sirve
// solo mientras NO haya ningún operador activado. En cuanto el primero entra con su segundo
// factor deja de servir sola — sin tocar variables en Vercel —, y si un día se desactiva a todos
// (o se restablece al único), vuelve a servir para no dejar a VIM fuera de su propio panel.
//
// SEC CN-003 — se conservan para los dos caminos: allowlist de IP opcional
// (PLATFORM_IP_ALLOWLIST), límite de intentos por IP y registro de los fallidos.

/** UUID de sistema: lo que se hizo con la clave compartida, sin persona detrás. */
export const SYSTEM_ADMIN_ID = "00000000-0000-0000-0000-0000000000a1";

export type SbClient = ReturnType<typeof createServiceClient>;

/** Quién está haciendo la petición. `via: "clave"` = la clave compartida del arranque. */
export type Actor = { id: string; nombre: string; via: "cuenta" | "clave" };

/**
 * El operador de cada petición, pegado a SU cliente service_role (cada `autorizar` crea uno
 * nuevo). Así `auditar(sb, …)` sabe a quién atribuir sin que cada una de sus llamadas en las
 * rutas tenga que pasarlo a mano — y ninguna puede olvidarlo.
 */
const actores = new WeakMap<SbClient, Actor>();

/** El operador de la petición a la que pertenece este cliente. */
export function actorDe(sb: SbClient): Actor {
  return actores.get(sb) ?? { id: SYSTEM_ADMIN_ID, nombre: "Clave compartida", via: "clave" };
}

const MAX_INTENTOS = 5;
const VENTANA_MS = 15 * 60 * 1000;

/**
 * Contador de fallos por IP. En memoria a propósito: el panel lo usa una persona, y una
 * dependencia externa (Redis) para esto sería desproporcionada.
 *
 * Límite conocido: en serverless el estado es POR INSTANCIA y se pierde en cada arranque en frío,
 * así que sube el costo de la fuerza bruta pero no la impide del todo. El control duro es la
 * allowlist de IP de abajo (o Cloudflare Access delante).
 */
const intentos = new Map<string, { fallos: number; desde: number }>();

/**
 * IP del cliente para la allowlist y el contador de fallos. Primero las cabeceras que escribe la
 * plataforma y el cliente no puede fijar (`x-vercel-forwarded-for`, `x-real-ip`); la primera
 * entrada de `x-forwarded-for` solo como último recurso: fuera de Vercel la escribe quien llama
 * (auditoría integral 30/09/2026). En Vercel las tres dicen lo mismo.
 */
function ipDe(req: Request): string {
  const propia = req.headers.get("x-vercel-forwarded-for") ?? req.headers.get("x-real-ip");
  if (propia) return propia.split(",")[0]!.trim();
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return "desconocida";
}

/**
 * Compara en tiempo constante. Hashea primero para que las longitudes no difieran nunca.
 *
 * Recorta espacios en LOS DOS lados antes de comparar. No debilita nada —un secreto no tiene
 * espacios significativos al principio ni al final— y elimina un modo de fallo invisible: un
 * salto de línea al pegar el valor en el panel de Vercel o de Supabase rompe la comparación para
 * siempre, y el síntoma es un 401 que parece de permisos. Costó un rato de diagnóstico.
 */
function igualSeguro(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a.trim(), "utf8").digest();
  const hb = createHash("sha256").update(b.trim(), "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/** ¿La IP está bloqueada ahora mismo? Limpia la ventana vencida de paso. */
function bloqueada(ip: string): boolean {
  const e = intentos.get(ip);
  if (!e) return false;
  if (Date.now() - e.desde > VENTANA_MS) {
    intentos.delete(ip);
    return false;
  }
  return e.fallos >= MAX_INTENTOS;
}

function registrarFallo(ip: string): void {
  const e = intentos.get(ip);
  if (!e || Date.now() - e.desde > VENTANA_MS) intentos.set(ip, { fallos: 1, desde: Date.now() });
  else e.fallos += 1;
}

/** Lee los claims de un JWT cuya firma YA validó `auth.getUser` (no re-verifica). */
function claimsDe(token: string): Record<string, unknown> {
  try {
    const p = token.split(".")[1] ?? "";
    return JSON.parse(Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    return {};
  }
}

const IP_POR_CLIENTE = new WeakMap<SbClient, string>();

/** ¿Hay algún operador activo que ya entró con su segundo factor? Entonces la clave ya no sirve. */
async function hayOperadorActivado(sb: SbClient): Promise<boolean> {
  const { count, error } = await sb
    .from("plataforma_operadores")
    .select("usuario_id", { count: "exact", head: true })
    .eq("activo", true)
    .not("activado_at", "is", null);
  // Si la consulta falla, se trata como "sí hay": ante la duda, la clave compartida NO abre.
  if (error) {
    console.error(`[A8] no se pudo saber si hay operadores activados: ${error.message}`);
    return true;
  }
  return (count ?? 0) > 0;
}

/**
 * Valida quién pide. Devuelve el cliente service_role (con su operador pegado) o una respuesta de
 * error.
 *
 * Orden deliberado: allowlist → bloqueo por intentos → cuenta o clave. Así una IP no autorizada
 * nunca llega a consumir el comparador ni a GoTrue, y una IP bloqueada no puede seguir probando.
 */
export async function autorizar(req: Request): Promise<{ sb: SbClient; actor: Actor } | { error: NextResponse }> {
  const ip = ipDe(req);

  // Acepta IPs exactas y prefijos CIDR. Lo segundo no es un lujo: los proveedores entregan IPv6
  // cuya segunda mitad rota a diario por privacidad, y los navegadores prefieren IPv6, así que
  // una lista de direcciones exactas deja fuera al dueño del panel en cuestión de horas.
  if (!permitida(ip, process.env.PLATFORM_IP_ALLOWLIST)) {
    console.warn(`[SEC CN-003] acceso al panel desde IP fuera de la allowlist: ${ip}`);
    // 403 y no 401: con la clave correcta, desde casa o el teléfono, el panel decía "Clave
    // incorrecta" y se perdía el rato buscando el problema en la clave. La IP que se devuelve es la
    // de quien pregunta: no revela nada que no sepa.
    return { error: NextResponse.json({ error: "IP_NO_PERMITIDA", ip }, { status: 403 }) };
  }

  if (bloqueada(ip)) {
    console.warn(`[SEC CN-003] IP bloqueada por exceso de intentos: ${ip}`);
    return {
      error: NextResponse.json(
        { error: "DEMASIADOS_INTENTOS", detalle: "Espera 15 minutos." },
        { status: 429, headers: { "Retry-After": String(VENTANA_MS / 1000) } },
      ),
    };
  }

  const sb = createServiceClient();
  IP_POR_CLIENTE.set(sb, ip);
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();

  // ── Camino 1: la cuenta del operador ──────────────────────────────────────────────────────
  if (bearer) {
    const { data, error } = await sb.auth.getUser(bearer);
    if (error || !data?.user) {
      registrarFallo(ip);
      return { error: NextResponse.json({ error: "SESION_INVALIDA", detalle: "Tu sesión venció. Vuelve a entrar." }, { status: 401 }) };
    }
    // Contraseña sola no basta: el token tiene que traer el segundo factor verificado.
    if (claimsDe(bearer).aal !== "aal2") {
      return { error: NextResponse.json({ error: "FALTA_SEGUNDO_FACTOR", detalle: "Falta el código de tu app autenticadora." }, { status: 401 }) };
    }
    const { data: op } = await sb
      .from("plataforma_operadores")
      .select("usuario_id, nombre, activo, activado_at")
      .eq("usuario_id", data.user.id)
      .maybeSingle();
    const fila = op as { usuario_id: string; nombre: string; activo: boolean; activado_at: string | null } | null;
    if (!fila || !fila.activo) {
      registrarFallo(ip);
      console.warn(`[A8] cuenta sin acceso al panel: ${data.user.email ?? data.user.id} desde ${ip}`);
      return { error: NextResponse.json({ error: "NO_ES_OPERADOR", detalle: "Esta cuenta no tiene acceso al panel." }, { status: 403 }) };
    }
    // Primera entrada con segundo factor: queda activado, y con él se retira la clave compartida.
    if (!fila.activado_at) {
      await sb.from("plataforma_operadores").update({ activado_at: new Date().toISOString() }).eq("usuario_id", fila.usuario_id);
      console.log(`[A8] operador activado: ${fila.nombre}. La clave compartida deja de servir.`);
    }
    intentos.delete(ip);
    const actor: Actor = { id: fila.usuario_id, nombre: fila.nombre, via: "cuenta" };
    actores.set(sb, actor);
    return { sb, actor };
  }

  // ── Camino 2: la clave compartida, solo para el arranque ──────────────────────────────────
  const key = process.env.PLATFORM_PROVISION_KEY;
  if (!key) return { error: NextResponse.json({ error: "NO_AUTORIZADO", detalle: "Entra con tu cuenta." }, { status: 401 }) };

  // Una clave corta en producción es tan grave como no tenerla: se avisa fuerte en el log del
  // servidor. No se bloquea el arranque para no tumbar el panel por una config heredada.
  if (process.env.NODE_ENV === "production" && key.length < 32) {
    console.warn(
      "[SEC CN-003] PLATFORM_PROVISION_KEY tiene menos de 32 caracteres. " +
        "Genera una con `openssl rand -hex 32` y rótala.",
    );
  }

  const recibida = req.headers.get("x-platform-key") ?? "";
  if (!igualSeguro(recibida, key)) {
    registrarFallo(ip);
    const e = intentos.get(ip);
    // Antes un intento fallido no dejaba NINGÚN rastro: no había forma de notar una fuerza bruta.
    console.warn(`[SEC CN-003] clave de plataforma inválida desde ${ip} (intento ${e?.fallos ?? 1}/${MAX_INTENTOS})`);
    return { error: NextResponse.json({ error: "NO_AUTORIZADO" }, { status: 401 }) };
  }

  if (await hayOperadorActivado(sb)) {
    console.warn(`[A8] intento con la clave compartida ya retirada desde ${ip}`);
    return {
      error: NextResponse.json(
        { error: "CLAVE_RETIRADA", detalle: "La clave compartida ya no sirve: entra con tu cuenta." },
        { status: 401 },
      ),
    };
  }

  intentos.delete(ip); // clave correcta → se limpia el contador de esa IP
  const actor: Actor = { id: SYSTEM_ADMIN_ID, nombre: "Clave compartida", via: "clave" };
  actores.set(sb, actor);
  return { sb, actor };
}

/**
 * Registra una acción de plataforma en super_admin_accesos (auditoría, doc 12 §9.2), a nombre del
 * operador de la petición (`actorDe(sb)`) y con su IP.
 *
 * SEC CN-003 — antes esta función perdía la mayoría de los registros en silencio: la tabla declara
 * `motivo text NOT NULL` y `payload jsonb NOT NULL` (0012), pero aquí se insertaban `null` y el error
 * del insert nunca se revisaba. Desde 0128 `tenant_id` admite NULL: lo que no es de un negocio
 * (invitar o desactivar a un operador) también se asienta.
 */
export async function auditar(
  sb: SbClient,
  args: { accion: string; tenantId?: string | null; motivo?: string | null; payload?: Record<string, unknown> },
): Promise<boolean> {
  const actor = actorDe(sb);
  const { error } = await sb.from("super_admin_accesos").insert({
    super_admin_id: actor.id,
    tenant_id: args.tenantId ?? null,
    accion: args.accion,
    // NOT NULL en el esquema: sin un texto explícito el insert se caía y la acción quedaba sin rastro.
    motivo: args.motivo?.trim() || "Acción desde el panel de plataforma (sin motivo capturado)",
    payload: args.payload ?? {},
    ip_address: ipValida(IP_POR_CLIENTE.get(sb)),
  });
  // La auditoría no debe tumbar la operación, pero su fallo TIENE que ser visible. Devuelve si
  // quedó asentada: lo que no se puede deshacer (borrar un prospecto) la escribe ANTES de actuar
  // y no sigue si esto contesta `false`.
  if (error) console.error(`[auditoría] no se pudo asentar "${args.accion}": ${error.message}`);
  return !error;
}

/**
 * La IP de la petición a la que pertenece este cliente, lista para una columna `inet` (o null).
 * Para las RPC que asientan su propia fila de bitácora dentro de su transacción (eliminar_tenant).
 */
export function ipDeCliente(sb: SbClient): string | null {
  return ipValida(IP_POR_CLIENTE.get(sb));
}

/** `inet` rechaza "desconocida": mejor sin IP que perder el registro entero. */
function ipValida(ip: string | undefined): string | null {
  if (!ip) return null;
  return /^[0-9a-f.:]+$/i.test(ip) ? ip : null;
}
