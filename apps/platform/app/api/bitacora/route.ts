import { NextResponse } from "next/server";
import { autorizar, SYSTEM_ADMIN_ID } from "../../lib/server";

/**
 * Bitácora de accesos de super admin.
 *
 * `super_admin_accesos` ya se escribía en cada acción sensible —entrar como el cliente, cambiar
 * su plan, abonarle folios— pero no había forma de leerla. Un registro que nadie mira no
 * protege a nadie: el valor de auditar el impersonar es poder demostrar después qué se hizo y
 * por qué, sobre todo cuando un cliente pregunta quién tocó su información.
 */

/**
 * Las filas de un negocio eliminado (0144) ya no tienen `tenant_id`: `eliminar_tenant` les deja
 * quién era en `payload.tenant_eliminado`, y de ahí sale el nombre.
 */
function eliminado(payload: unknown): string | null {
  const t = (payload as { tenant_eliminado?: { nombre_comercial?: unknown } } | null)?.tenant_eliminado;
  return typeof t?.nombre_comercial === "string" ? `${t.nombre_comercial} (eliminado)` : null;
}

export async function GET(req: Request) {
  const auth = await autorizar(req);
  if ("error" in auth) return auth.error;
  const sb = auth.sb;

  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenant");

  let q = sb
    .from("super_admin_accesos")
    .select("id, accion, tenant_id, super_admin_id, motivo, ip_address, payload, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (tenantId) q = q.eq("tenant_id", tenantId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const filas = (data ?? []) as {
    id: string; accion: string; tenant_id: string | null; super_admin_id: string; motivo: string | null;
    ip_address: string | null; payload: unknown; created_at: string;
  }[];

  // Se resuelven los nombres aquí y no con un join: `super_admin_accesos` guarda el tenant_id
  // aunque la empresa se borre después, y un join interno haría desaparecer justo los registros
  // de las bajas — que son los que más importa poder revisar.
  const ids = [...new Set(filas.map((f) => f.tenant_id).filter((x): x is string => !!x))];
  const nombres = new Map<string, string>();
  if (ids.length > 0) {
    const { data: ts } = await sb.from("tenants").select("id, nombre_comercial").in("id", ids);
    for (const t of (ts ?? []) as { id: string; nombre_comercial: string }[]) nombres.set(t.id, t.nombre_comercial);
  }

  // Quién (A8): el operador de cada acción. Lo de antes de las cuentas —y lo que se haga con la
  // clave compartida mientras siga sirviendo— queda como "Clave compartida".
  const operadores = new Map<string, string>();
  const { data: ops } = await sb.from("plataforma_operadores").select("usuario_id, nombre");
  for (const o of (ops ?? []) as { usuario_id: string; nombre: string }[]) operadores.set(o.usuario_id, o.nombre);

  return NextResponse.json({
    accesos: filas.map((f) => ({
      id: f.id,
      accion: f.accion,
      tenantId: f.tenant_id,
      tenant: f.tenant_id ? (nombres.get(f.tenant_id) ?? "(empresa eliminada)") : (eliminado(f.payload) ?? "—"),
      quien: f.super_admin_id === SYSTEM_ADMIN_ID ? "Clave compartida" : (operadores.get(f.super_admin_id) ?? "(operador eliminado)"),
      motivo: f.motivo,
      ip: f.ip_address,
      fecha: f.created_at,
    })),
  });
}
