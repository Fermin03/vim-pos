import { NextResponse } from "next/server";
import { autorizar } from "../../lib/server";

// Lista los tenants (cross-tenant) para el panel de VIM. service_role server-side, gated por
// X-Platform-Key. Incluye plan y fase de onboarding para la tabla de Empresas.

export async function GET(req: Request) {
  const auth = autorizar(req);
  if ("error" in auth) return auth.error;
  const sb = auth.sb;

  const { data, error } = await sb
    .from("tenants")
    .select(
      "id, codigo, nombre_comercial, estado, vertical_principal, fecha_alta, created_at, " +
        "plan:planes(codigo, nombre, precio_mensual_mxn), " +
        "onboarding:tenant_onboarding_estado(fase, fecha_go_live)",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tenants: data ?? [] });
}
