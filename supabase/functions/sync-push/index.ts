// Edge Function: sync-push  (Fase 1 · POS de escritorio local-first)
// Recibe la "rebanada operativa" que la caja generó offline (turnos, tickets, items, pagos…) y
// la replica VERBATIM en la nube vía la RPC sync_push_snapshot (modo réplica → conserva folios/
// totales/PAGADO exactos; no re-genera folios). Solo la puede llamar una cuenta de DISPOSITIVO.
//
// Llamada: POST /functions/v1/sync-push  (Authorization: Bearer <JWT del dispositivo>)
//   body: { snapshot: { <tabla>: [filas…] } }
// Respuesta: { resultado: { <tabla>: n } }
import { clienteAdmin, servir } from "../_shared/http.ts";
import { bearerDe, claimsDe } from "../_shared/identidad.ts";
import { registrarError } from "../_shared/errores.ts";
import { cajaEnRegla, cajaIdDeEmail } from "../_shared/dispositivo.ts";

const admin = clienteAdmin();

// getUser sigue aquí a propósito: el porqué está en sync-pull.

servir(async (req, json) => {
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

  let body: { snapshot?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json({ error: "BAD_JSON" }, 400);
  }
  if (!body.snapshot) return json({ error: "FALTA_SNAPSHOT" }, 400);

  // La RPC (service_role) aplica el snapshot en modo réplica, forzando tenant_id = tenant.
  const { data, error } = await admin.rpc("sync_push_snapshot", { p_tenant: tenant, p_snapshot: body.snapshot });
  if (error) { registrarError("sync-push", "RPC_ERROR", error); return json({ error: "RPC_ERROR" }, 500); }

  // Espejo de apps (spec 2026-09-03): los tickets creados en la caja para pedidos de apps suben
  // aquí; se enlazan al pedido por folio_externo_app. Best-effort: no puede tirar el push.
  let enlazados = 0;
  try {
    const { data: n } = await admin.rpc("delivery_enlazar_tickets", { p_tenant: tenant });
    enlazados = Number(n ?? 0);
  } catch { /* la siguiente subida lo reintenta */ }

  return json({ resultado: data, enlazados });
});
