// Quién llama: el tenant del token YA verificado, en un solo sitio.
//
// Auditoría integral 30/09/2026 (C2-6). enviar-push, delivery-accion, delivery-uber-conexion,
// crear-empleado y provisionar-dispositivo resolvían el tenant del llamante con
// `usuarios_acceso ... .limit(1)` o `.find()` sobre TODOS sus accesos, sin mirar el tenant del JWT.
// Con un usuario que tuviera acceso a dos negocios, la función actuaba sobre el que Postgres
// devolviera primero —no necesariamente el de la sesión— y, en crear-empleado, comprobaba el rol
// de ADMIN en un negocio y creaba al empleado en ese mismo negocio aunque la sesión fuera de otro.
//
// Ahora: el tenant sale del claim `tenant_id` que puso el hook de GoTrue (0006) o pin-login, y el
// rol se comprueba con `.eq("tenant_id", tenant)` — el acceso tiene que ser de ESE negocio.
//
// `claimsDe` NO verifica la firma: solo se usa DESPUÉS de `admin.auth.getUser(token)`, que sí la
// verifica (ver el comentario de sync-pull sobre por qué no se verifica aquí en local).
//
// Módulo puro: se prueba con `node --test` (identidad.test.ts).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Los claims de un JWT cuya firma YA validó getUser. `{}` si no se puede leer. */
export function claimsDe(token: string): Record<string, unknown> {
  try {
    const p = token.split(".")[1] ?? "";
    const b64 = p.replace(/-/g, "+").replace(/_/g, "/");
    const v: unknown = JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)));
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** El tenant del claim `tenant_id`, si es un uuid; si no, null. */
export function tenantDeClaims(claims: Record<string, unknown>): string | null {
  const t = claims.tenant_id;
  return typeof t === "string" && UUID.test(t) ? t.toLowerCase() : null;
}

/** Atajo: el tenant de un token ya verificado. */
export function tenantDelToken(token: string): string | null {
  return tenantDeClaims(claimsDe(token));
}

/** El token del encabezado `Authorization: Bearer …` ("" si no hay). */
export function bearerDe(req: { headers: { get(n: string): string | null } }): string {
  return (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
}
