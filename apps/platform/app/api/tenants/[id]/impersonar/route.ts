import { NextResponse } from "next/server";
import { autorizar, auditar } from "../../../../lib/server";

// A7 — Impersonación de soporte (doc 12 §9.2). Genera un magic-link para el DUEÑO del tenant
// para que VIM entre a su admin y diagnostique. SIEMPRE auditado en super_admin_accesos.
// service_role server-side, gated por X-Platform-Key.

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = autorizar(req);
  if ("error" in auth) return auth.error;
  const sb = auth.sb;
  const { id } = await ctx.params;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* motivo opcional */ }
  const motivo = (body.motivo as string | undefined)?.trim() || "Soporte / diagnóstico";

  const { data: tenant } = await sb.from("tenants").select("usuario_dueno_id, nombre_comercial").eq("id", id).maybeSingle();
  const ownerId = (tenant as { usuario_dueno_id?: string } | null)?.usuario_dueno_id;
  if (!ownerId) return NextResponse.json({ error: "TENANT_SIN_DUENO" }, { status: 400 });

  const { data: userRes, error: e1 } = await sb.auth.admin.getUserById(ownerId);
  if (e1 || !userRes?.user?.email) return NextResponse.json({ error: "DUENO_SIN_EMAIL" }, { status: 400 });
  const email = userRes.user.email;

  const redirectTo = process.env.ADMIN_APP_URL ?? "http://localhost:3001";
  const { data: link, error: e2 } = await sb.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo } });
  if (e2 || !link?.properties?.action_link) return NextResponse.json({ error: e2?.message ?? "NO_LINK" }, { status: 500 });

  // Auditoría OBLIGATORIA del acceso de soporte.
  await auditar(sb, { accion: "tenant.impersonar", tenantId: id, motivo, payload: { email } });

  return NextResponse.json({ ok: true, link: link.properties.action_link, email });
}
