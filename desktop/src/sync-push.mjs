// Fase 1 · Sync PUSH — sube a la nube las ventas que la caja generó offline.
// En el desktop las ventas se escriben directo al Postgres LOCAL (no al outbox de Dexie del POS
// web), así que el push LEE las filas operativas locales aún no subidas y las replica VERBATIM
// a la nube vía la RPC sync_push_snapshot (modo réplica → conserva folio/totales/PAGADO exactos).
// Solo sube tickets terminales (PAGADO/FACTURADO/CANCELADO): no cambian, así que subir una vez basta.
// Idempotente por id en el servidor; el device marca lo subido en _vim_push_ok para no re-trabajar.

const TERMINALES = ["PAGADO", "FACTURADO", "CANCELADO"];

async function asegurarTabla(pool) {
  await pool.query("CREATE TABLE IF NOT EXISTS _vim_push_ok (ticket_id uuid PRIMARY KEY, pushed_at timestamptz DEFAULT now())");
}

/** Arma el snapshot operativo pendiente (tickets terminales no subidos + sus hijos + turnos). */
export async function construirSnapshotPush(pool) {
  await asegurarTabla(pool);
  const { rows } = await pool.query(`
    WITH tk AS (
      SELECT id, turno_id FROM tickets
       WHERE estado_fiscal = ANY($1)
         AND id NOT IN (SELECT ticket_id FROM _vim_push_ok)
    )
    SELECT
      (SELECT array_agg(id) FROM tk) AS ids,
      jsonb_strip_nulls(jsonb_build_object(
        'turnos',                    (SELECT jsonb_agg(to_jsonb(x)) FROM turnos x WHERE x.id IN (SELECT DISTINCT turno_id FROM tk)),
        'tickets',                   (SELECT jsonb_agg(to_jsonb(x)) FROM tickets x WHERE x.id IN (SELECT id FROM tk)),
        'ticket_items',              (SELECT jsonb_agg(to_jsonb(x)) FROM ticket_items x WHERE x.ticket_id IN (SELECT id FROM tk)),
        'ticket_item_modificadores', (SELECT jsonb_agg(to_jsonb(x)) FROM ticket_item_modificadores x WHERE x.ticket_item_id IN (SELECT id FROM ticket_items WHERE ticket_id IN (SELECT id FROM tk))),
        'pagos',                     (SELECT jsonb_agg(to_jsonb(x)) FROM pagos x WHERE x.ticket_id IN (SELECT id FROM tk)),
        'movimientos_caja',          (SELECT jsonb_agg(to_jsonb(x)) FROM movimientos_caja x WHERE x.turno_id IN (SELECT DISTINCT turno_id FROM tk))
      )) AS snapshot
  `, [TERMINALES]);
  return { snapshot: rows[0].snapshot ?? {}, ids: rows[0].ids ?? [] };
}

/** Marca tickets como subidos (para no re-enviarlos). */
export async function marcarPushed(pool, ids) {
  if (!ids?.length) return;
  await pool.query(
    "INSERT INTO _vim_push_ok(ticket_id) SELECT unnest($1::uuid[]) ON CONFLICT (ticket_id) DO NOTHING", [ids]);
}

/**
 * PUSH a la nube: envía el snapshot pendiente a la Edge Function sync-push (autenticada como el
 * dispositivo). Al confirmar, marca los tickets como subidos. Best-effort. Devuelve el resumen.
 */
export async function pushToCloud(pool, { cloudUrl, anonKey, deviceToken }, log = () => {}) {
  const { snapshot, ids } = await construirSnapshotPush(pool);
  if (!ids.length) { log("nada pendiente por subir"); return { subidos: 0 }; }
  log(`subiendo ${ids.length} ventas…`);
  const res = await fetch(`${cloudUrl}/functions/v1/sync-push`, {
    method: "POST",
    headers: { apikey: anonKey, Authorization: `Bearer ${deviceToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ snapshot }),
  });
  if (!res.ok) throw new Error(`sync-push HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  await marcarPushed(pool, ids);
  return { subidos: ids.length, resultado: await res.json().catch(() => ({})) };
}
