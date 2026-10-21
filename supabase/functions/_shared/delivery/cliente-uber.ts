// El cliente de Uber que arman igual el webhook, `delivery-accion` y `delivery-uber-conexion`:
// las credenciales de la app y el token de aplicación guardado en `delivery_credenciales_app`,
// para no pedirle uno nuevo a Uber en cada arranque en frío.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { crearClienteUber } from "./uber.ts";

export const ENTORNO = (Deno.env.get("UBER_ENTORNO") ?? "sandbox") === "produccion" ? "produccion" : "sandbox";

export const clienteUberDeApp = (admin: SupabaseClient) =>
  crearClienteUber({
    entorno: ENTORNO,
    clientId: Deno.env.get("UBER_CLIENT_ID") ?? "",
    clientSecret: Deno.env.get("UBER_CLIENT_SECRET") ?? "",
    tokenCache: {
      leer: async () => {
        const { data } = await admin.from("delivery_credenciales_app").select("access_token, vence_at")
          .eq("app", "APP_UBEREATS").eq("entorno", ENTORNO).maybeSingle();
        const f = data as { access_token: string; vence_at: string } | null;
        return f && new Date(f.vence_at) > new Date() ? f.access_token : null;
      },
      guardar: async (token, venceAt) => {
        await admin.from("delivery_credenciales_app").upsert({
          app: "APP_UBEREATS", entorno: ENTORNO, access_token: token,
          vence_at: venceAt.toISOString(), updated_at: new Date().toISOString(),
        });
      },
    },
  });
