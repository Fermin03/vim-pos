// Cliente Supabase para Server Components / Server Actions (apps/admin).
// ANON key + cookies de sesión → RESPETA el RLS con el JWT del usuario.
import { createServerClient } from "@supabase/ssr";
import type { Database } from "./database.types";

type CookieStore = {
  getAll: () => { name: string; value: string }[];
  set: (name: string, value: string, options?: Record<string, unknown>) => void;
};

export function createClient(cookies: CookieStore) {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookies.getAll(),
        setAll: (toSet) =>
          toSet.forEach(({ name, value, options }) => cookies.set(name, value, options)),
      },
    },
  );
}
