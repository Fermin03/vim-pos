// ⚠️ Cliente con SERVICE_ROLE — IGNORA EL RLS.
// SOLO server-side de apps/platform y Edge Functions (doc 12 §9, doc 11 §4.4).
// PROHIBIDO importar desde apps/pos o apps/admin, ni en código de cliente.
// Una regla de ESLint debe bloquear este import fuera de los paths permitidos.
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente administrativo de VIM. Salta el RLS. Toda acción sobre un tenant
 * debe registrarse en `super_admin_accesos` (doc 12 §9.2).
 *
 * Sin el genérico <Database>: igual que los clientes de pos/admin, las
 * operaciones no se tipan contra el esquema (se validan en el borde con Zod).
 * Mantiene consistencia con el resto del monorepo y evita falsos `never`.
 */
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente (solo server).");
  return createSupabaseClient(
    process.env.SUPABASE_URL!,
    key,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
