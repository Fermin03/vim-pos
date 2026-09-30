// Ninguna Edge Function llama con el cliente DEL USUARIO una RPC que los usuarios no pueden ejecutar.
//
// Auditoría integral 30/09/2026: la 0132 le quitó EXECUTE de `tenant_addon_activo` a
// `authenticated` (era un oráculo), y timbrar-cfdi, timbrar-global y cargar-csd la seguían llamando
// con `sb` —el cliente con el token del usuario—. La llamada fallaba, `addonActivo` quedaba en null
// y TODA la facturación respondía 403 SIN_ADDON_CFDI. Ninguna prueba lo vio: las de pgTAP no leen
// TypeScript y las de las funciones no hablan con la base. Esta prueba lee el código.
//
// Si agregas una RPC exclusiva de service_role, súmala a SOLO_SERVICE_ROLE (y a
// supabase/tests/0003_grants_secdef.test.sql).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const SOLO_SERVICE_ROLE = new Set([
  "tenant_addon_activo", "ticket_autofacturable", "consumir_folio_cfdi", "cfdi_marcar_timbrado",
  "cfdi_marcar_error", "cfdi_marcar_cancelado_sat", "cfdi_registrar_cancelacion", "consumir_cupo",
  "cupo_agotado", "sync_pull_snapshot", "sync_push_snapshot", "verificar_pin_login",
  "verificar_autorizacion_pin", "resetear_pin_empleado", "crear_perfil_con_pin",
  "crear_tenant_con_owner", "activar_suscripcion", "registrar_pago_suscripcion",
  "anular_pago_suscripcion", "caja_latido", "delivery_pedido_transicion",
]);

const RAIZ = new URL("..", import.meta.url).pathname;

/** Variables que el archivo crea con `createClient(...)` SIN la llave de service_role. */
function clientesDeUsuario(src: string): Set<string> {
  const vars = new Set<string>();
  const re = /const\s+(\w+)\s*=\s*createClient\(([\s\S]*?)\);/g;
  for (const m of src.matchAll(re)) {
    if (!/SERVICE_ROLE/.test(m[2])) vars.add(m[1]);
  }
  return vars;
}

test("ninguna función llama una RPC solo-service_role con el cliente del usuario", () => {
  const faltas: string[] = [];
  for (const dir of readdirSync(RAIZ)) {
    const archivo = join(RAIZ, dir, "index.ts");
    if (dir.startsWith("_") || !existsSync(archivo)) continue;
    const src = readFileSync(archivo, "utf8");
    const usuario = clientesDeUsuario(src);
    for (const m of src.matchAll(/\b(\w+)\.rpc\(\s*"([a-z_]+)"/g)) {
      if (usuario.has(m[1]) && SOLO_SERVICE_ROLE.has(m[2])) faltas.push(`${dir}: ${m[1]}.rpc("${m[2]}")`);
    }
  }
  assert.deepEqual(faltas, [], "usa el cliente admin (service_role) para estas llamadas");
});

test("el detector reconoce un cliente de usuario y uno de service_role", () => {
  const src = `const sb = createClient(url, anon, { global: {} });\nconst admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);`;
  assert.deepEqual([...clientesDeUsuario(src)], ["sb"]);
});
