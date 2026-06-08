import { NextResponse } from "next/server";
import { createServiceClient } from "@vim/db/service";

// Capa server-side del panel de plataforma. Corre con service_role, FUERA de RLS (doc 12 §9).
// Gated por el secreto PLATFORM_PROVISION_KEY (header X-Platform-Key) — mismo modelo que el
// provisioning. A8 del roadmap reemplazará esto por login individual de super-admin.

/** UUID de sistema que representa al operador VIM mientras la auth es por clave compartida. */
export const SYSTEM_ADMIN_ID = "00000000-0000-0000-0000-0000000000a1";

type SbClient = ReturnType<typeof createServiceClient>;

/** Valida la clave de plataforma. Devuelve el cliente service_role o una respuesta de error. */
export function autorizar(req: Request): { sb: SbClient } | { error: NextResponse } {
  const key = process.env.PLATFORM_PROVISION_KEY;
  if (!key) return { error: NextResponse.json({ error: "PROVISION_DESHABILITADO" }, { status: 503 }) };
  if (req.headers.get("x-platform-key") !== key) {
    return { error: NextResponse.json({ error: "NO_AUTORIZADO" }, { status: 401 }) };
  }
  return { sb: createServiceClient() };
}

/** Registra una acción de plataforma en super_admin_accesos (auditoría, doc 12 §9.2). */
export async function auditar(
  sb: SbClient,
  args: { accion: string; tenantId?: string | null; motivo?: string | null; payload?: Record<string, unknown> },
): Promise<void> {
  await sb.from("super_admin_accesos").insert({
    super_admin_id: SYSTEM_ADMIN_ID,
    tenant_id: args.tenantId ?? null,
    accion: args.accion,
    motivo: args.motivo ?? null,
    payload: args.payload ?? null,
  });
}
