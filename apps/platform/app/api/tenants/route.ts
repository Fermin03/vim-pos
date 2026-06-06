import { NextResponse } from "next/server";
import { createServiceClient } from "@vim/db/service";

// Lista los tenants (cross-tenant) para el dashboard de VIM. service_role server-side.
// Protegido por el mismo secreto que el provisioning (header X-Platform-Key) para no exponer
// el catálogo de clientes sin autorización.

export async function GET(req: Request) {
  const key = process.env.PLATFORM_PROVISION_KEY;
  if (!key) return NextResponse.json({ error: "PROVISION_DESHABILITADO" }, { status: 503 });
  if (req.headers.get("x-platform-key") !== key) {
    return NextResponse.json({ error: "NO_AUTORIZADO" }, { status: 401 });
  }

  const sb = createServiceClient();
  const { data, error } = await sb
    .from("tenants")
    .select("id, codigo, nombre_comercial, estado, vertical_principal, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tenants: data ?? [] });
}
