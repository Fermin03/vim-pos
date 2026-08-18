import { NextResponse } from "next/server";
import { autorizar } from "../../lib/server";

/**
 * Bitácora de errores de las aplicaciones de los clientes.
 *
 * Antes, cuando el POS tronaba en un restaurante, el error moría en la consola de ESA
 * computadora. VIM se enteraba por teléfono, sin saber qué pasó ni poder reproducirlo. Ahora
 * las apps reportan a `errores_app` y la caja los sube en su ciclo de sync.
 */

export async function GET(req: Request) {
  const auth = autorizar(req);
  if ("error" in auth) return auth.error;
  const sb = auth.sb;

  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenant");

  let q = sb
    .from("errores_app")
    .select("id, tenant_id, app, version, mensaje, stack, contexto, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (tenantId) q = q.eq("tenant_id", tenantId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const filas = (data ?? []) as {
    id: string; tenant_id: string; app: string; version: string | null;
    mensaje: string; stack: string | null; contexto: unknown; created_at: string;
  }[];

  const ids = [...new Set(filas.map((f) => f.tenant_id))];
  const nombres = new Map<string, string>();
  if (ids.length > 0) {
    const { data: ts } = await sb.from("tenants").select("id, nombre_comercial").in("id", ids);
    for (const t of (ts ?? []) as { id: string; nombre_comercial: string }[]) nombres.set(t.id, t.nombre_comercial);
  }

  // Se agrupa por mensaje: veinte veces el mismo fallo es UN problema, no veinte. Sin esto la
  // lista se vuelve ilegible justo cuando algo se rompe en serie, que es cuando más urge leerla.
  const grupos = new Map<string, {
    clave: string; mensaje: string; app: string; tenant: string; tenantId: string;
    veces: number; ultima: string; primera: string; stack: string | null; version: string | null;
  }>();
  for (const f of filas) {
    const clave = `${f.tenant_id}|${f.app}|${f.mensaje}`;
    const g = grupos.get(clave);
    if (g) {
      g.veces++;
      if (f.created_at < g.primera) g.primera = f.created_at;
    } else {
      grupos.set(clave, {
        clave,
        mensaje: f.mensaje,
        app: f.app,
        tenant: nombres.get(f.tenant_id) ?? "—",
        tenantId: f.tenant_id,
        veces: 1,
        ultima: f.created_at,
        primera: f.created_at,
        stack: f.stack,
        version: f.version,
      });
    }
  }

  const lista = [...grupos.values()].sort((a, b) => b.ultima.localeCompare(a.ultima));
  return NextResponse.json({ errores: lista, total: filas.length });
}
