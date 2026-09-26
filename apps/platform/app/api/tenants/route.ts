import { NextResponse } from "next/server";
import { autorizar } from "../../lib/server";
import { LATIDO_EN_LINEA_MIN } from "../../lib/senal-caja";
import { compararVersiones } from "../../lib/fechas-panel";

// Lista los tenants (cross-tenant) para el panel de VIM. service_role server-side, gated por
// X-Platform-Key. Incluye plan y fase de onboarding para la tabla de Empresas, y un resumen de
// sus cajas por latido: la lista era solo comercial y para saber si un cliente estaba operando
// había que abrir su ficha uno por uno (revisión de diseño, sep 2026).

type ResumenCajas = {
  total: number;
  enLinea: number;
  /** Minutos que lleva callada la caja más callada (entre las que laten); null si ninguna late. */
  calladaMin: number | null;
  /** Cajas sin latido: versión anterior a 0.4.60. */
  sinReportar: number;
  /** La versión más vieja que reportan. */
  version: string | null;
};

export async function GET(req: Request) {
  const auth = autorizar(req);
  if ("error" in auth) return auth.error;
  const sb = auth.sb;

  const [{ data, error }, { data: cajasRaw }] = await Promise.all([
    sb
      .from("tenants")
      .select(
        "id, codigo, nombre_comercial, estado, vertical_principal, fecha_alta, bloqueo_desde, created_at, " +
          "plan:planes(codigo, nombre, precio_mensual_mxn), " +
          "onboarding:tenant_onboarding_estado(fase, fecha_go_live)",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(300),
    sb.from("cajas").select("tenant_id, activa, bloqueada, ultimo_latido, version_app").is("deleted_at", null).limit(3000),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ahora = Date.now();
  const resumen = new Map<string, ResumenCajas>();
  for (const c of (cajasRaw ?? []) as { tenant_id: string; activa: boolean; bloqueada: boolean; ultimo_latido: string | null; version_app: string | null }[]) {
    if (!c.activa) continue;
    const r = resumen.get(c.tenant_id) ?? { total: 0, enLinea: 0, calladaMin: null, sinReportar: 0, version: null };
    r.total += 1;
    const t = c.ultimo_latido ? new Date(c.ultimo_latido).getTime() : NaN;
    if (Number.isNaN(t)) {
      r.sinReportar += 1;
    } else {
      const min = Math.max(0, Math.floor((ahora - t) / 60_000));
      if (min < LATIDO_EN_LINEA_MIN && !c.bloqueada) r.enLinea += 1;
      else r.calladaMin = Math.max(r.calladaMin ?? 0, min);
    }
    if (c.version_app && (!r.version || compararVersiones(c.version_app, r.version) < 0)) r.version = c.version_app;
    resumen.set(c.tenant_id, r);
  }

  const tenants = ((data ?? []) as unknown as { id: string }[]).map((t) => ({ ...t, cajas: resumen.get(t.id) ?? null }));
  return NextResponse.json({ tenants });
}
