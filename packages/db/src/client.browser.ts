// Cliente Supabase para componentes de navegador (apps/pos, apps/admin).
// Usa la ANON key y RESPETA el RLS. Nunca usar service_role aquí.
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
