import { NextResponse } from "next/server";
import { permitida } from "./ip-allowlist";
import { createHash, timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@vim/db/service";

// Capa server-side del panel de plataforma. Corre con service_role, FUERA de RLS (doc 12 §9).
// Gated por el secreto PLATFORM_PROVISION_KEY (header X-Platform-Key) — mismo modelo que el
// provisioning. A8 del roadmap reemplazará esto por login individual de super-admin.
//
// SEC CN-003 — endurecimiento de la clave compartida. Lo que concede una sola cadena es enorme
// (listar todos los tenants, impersonar a cualquier dueño, mover planes y folios), así que hasta
// que llegue A8 se le ponen los controles que sí caben hoy:
//   · comparación en tiempo constante (antes `!==`, que filtra el prefijo por temporización),
//   · límite de intentos por IP (frena la fuerza bruta contra /api/tenants),
//   · allowlist de IP opcional (PLATFORM_IP_ALLOWLIST) para cerrar el panel a la red de VIM,
//   · registro de los intentos FALLIDOS, que antes no dejaban ningún rastro.
//
// Lo que esto NO arregla, y sigue pendiente de A8: no hay cuentas individuales, ni MFA, ni
// expiración de sesión, y la bitácora atribuye todo al mismo UUID de sistema. El control con
// mejor relación esfuerzo/beneficio sigue siendo poner el panel detrás de Cloudflare Access.

/** UUID de sistema que representa al operador VIM mientras la auth es por clave compartida. */
export const SYSTEM_ADMIN_ID = "00000000-0000-0000-0000-0000000000a1";

type SbClient = ReturnType<typeof createServiceClient>;

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

function ipDe(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "desconocida";
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

/**
 * Valida la clave de plataforma. Devuelve el cliente service_role o una respuesta de error.
 *
 * Orden deliberado: allowlist → bloqueo por intentos → clave. Así una IP no autorizada nunca llega
 * a consumir el comparador, y una IP ya bloqueada no puede seguir probando claves.
 */
export function autorizar(req: Request): { sb: SbClient } | { error: NextResponse } {
  const key = process.env.PLATFORM_PROVISION_KEY;
  if (!key) return { error: NextResponse.json({ error: "PROVISION_DESHABILITADO" }, { status: 503 }) };

  // Una clave corta en producción es tan grave como no tenerla: se avisa fuerte en el log del
  // servidor. No se bloquea el arranque para no tumbar el panel por una config heredada.
  if (process.env.NODE_ENV === "production" && key.length < 32) {
    console.warn(
      "[SEC CN-003] PLATFORM_PROVISION_KEY tiene menos de 32 caracteres. " +
        "Genera una con `openssl rand -hex 32` y rótala.",
    );
  }

  const ip = ipDe(req);

  // Acepta IPs exactas y prefijos CIDR. Lo segundo no es un lujo: los proveedores entregan IPv6
  // cuya segunda mitad rota a diario por privacidad, y los navegadores prefieren IPv6, así que
  // una lista de direcciones exactas deja fuera al dueño del panel en cuestión de horas.
  if (!permitida(ip, process.env.PLATFORM_IP_ALLOWLIST)) {
    console.warn(`[SEC CN-003] acceso al panel desde IP fuera de la allowlist: ${ip}`);
    return { error: NextResponse.json({ error: "NO_AUTORIZADO" }, { status: 401 }) };
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

  const recibida = req.headers.get("x-platform-key") ?? "";
  if (!igualSeguro(recibida, key)) {
    registrarFallo(ip);
    const e = intentos.get(ip);
    // Antes un intento fallido no dejaba NINGÚN rastro: no había forma de notar una fuerza bruta.
    console.warn(`[SEC CN-003] clave de plataforma inválida desde ${ip} (intento ${e?.fallos ?? 1}/${MAX_INTENTOS})`);
    return { error: NextResponse.json({ error: "NO_AUTORIZADO" }, { status: 401 }) };
  }

  intentos.delete(ip); // clave correcta → se limpia el contador de esa IP
  return { sb: createServiceClient() };
}

/**
 * Registra una acción de plataforma en super_admin_accesos (auditoría, doc 12 §9.2).
 *
 * SEC CN-003 — antes esta función perdía la mayoría de los registros en silencio: la tabla declara
 * `tenant_id NOT NULL REFERENCES tenants(id)` y `motivo text NOT NULL` (migración 0012), pero aquí
 * se insertaban `null` en ambos y el error del insert nunca se revisaba. En la práctica solo
 * quedaban asentadas `impersonar` y `ajustar_folios` (las dos que traen motivo por defecto);
 * cambiar el estado de un tenant, su plan o su suscripción no dejaba rastro alguno.
 */
export async function auditar(
  sb: SbClient,
  args: { accion: string; tenantId?: string | null; motivo?: string | null; payload?: Record<string, unknown> },
): Promise<void> {
  if (!args.tenantId) {
    console.warn(`[auditoría] acción "${args.accion}" sin tenant_id: no se puede asentar (columna NOT NULL).`);
    return;
  }
  const { error } = await sb.from("super_admin_accesos").insert({
    super_admin_id: SYSTEM_ADMIN_ID,
    tenant_id: args.tenantId,
    accion: args.accion,
    // NOT NULL en el esquema: sin un texto explícito el insert se caía y la acción quedaba sin rastro.
    motivo: args.motivo?.trim() || "Acción desde el panel de plataforma (sin motivo capturado)",
    payload: args.payload ?? null,
  });
  // La auditoría no debe tumbar la operación, pero su fallo TIENE que ser visible.
  if (error) console.error(`[auditoría] no se pudo asentar "${args.accion}": ${error.message}`);
}
