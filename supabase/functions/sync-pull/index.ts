// Edge Function: sync-pull  (Fase 1 · POS de escritorio local-first)
// Devuelve la "rebanada" de referencia del tenant (catálogo, config, org, empleados+PIN) para
// que el device local haga upsert idempotente. La arma la RPC sync_pull_snapshot (SECURITY
// DEFINER, service_role). Solo la puede llamar una cuenta de DISPOSITIVO (espeja pin-login).
//
// Llamada: POST /functions/v1/sync-pull   (Authorization: Bearer <JWT del dispositivo>)
// Respuesta: { snapshot: { <tabla>: [filas…], __watermark } }
import { clienteAdmin, servir } from "../_shared/http.ts";
import { bearerDe, claimsDe } from "../_shared/identidad.ts";
import { registrarError } from "../_shared/errores.ts";
import { cajaEnRegla, cajaIdDeEmail } from "../_shared/dispositivo.ts";

const admin = clienteAdmin();

// POR QUÉ SIGUE AQUÍ getUser. El 9 sep 2026 se intentó verificar la firma del token en local para
// ahorrarse este viaje a GoTrue. No se puede: este proyecto está migrado a CLAVES DE FIRMA
// ASIMÉTRICAS —su JWKS publica una ES256— así que los tokens que emite GoTrue NO van firmados con
// el JWT secret HS256. Que `pin-login` acuñe tokens HS256 y el RLS los acepte no significa que los
// emitidos sean HS256: aceptar no es emitir. Una verificación local solo de HS256 rechazaría todos
// los tokens de dispositivo reales. Si algún día se quiere el ahorro, hay que verificar ES256
// contra el JWKS (cacheando las claves) y dejar HS256 solo para lo de pin-login.

servir(async (req, json) => {
  // Autenticación del DISPOSITIVO llamante (espeja pin-login). La anon key no tiene usuario.
  const token = bearerDe(req);
  if (!token) return json({ error: "NO_AUTH" }, 401);
  const { data: u, error: uErr } = await admin.auth.getUser(token);
  if (uErr || !u?.user) return json({ error: "AUTH_INVALIDA" }, 401);

  const claims = claimsDe(token);
  const tenant = typeof claims.tenant_id === "string" ? claims.tenant_id : null;
  const cajaId = cajaIdDeEmail(u.user.email);
  if (claims.tipo_identidad !== "DISPOSITIVO" || !tenant || !cajaId) {
    return json({ error: "NO_ES_DISPOSITIVO" }, 403);
  }
  if (!await cajaEnRegla(admin, cajaId, tenant)) return json({ error: "CAJA_NO_EXISTE" }, 403);

  // La RPC (service_role) arma el snapshot del tenant (incluye pin_hash y auth.users).
  const { data, error } = await admin.rpc("sync_pull_snapshot", { p_tenant: tenant });
  if (error) { registrarError("sync-pull", "RPC_ERROR", error); return json({ error: "RPC_ERROR" }, 500); }

  return json({ snapshot: data });
});
