// Fase 1 · Verificación del sync PUSH en el device (sin depender de la nube).
// Usa las ventas REALES que ya están en la caja local: arma el snapshot pendiente, lo aplica
// por la RPC sync_push_snapshot (idempotente, verbatim) y comprueba que folios/estados no
// cambian y que el tracking _vim_push_ok evita re-subir. (El insert-fresco-conserva-folio ya
// quedó probado en smoke_sync_push contra el esquema canónico.)
import { startBackend } from "./backend.mjs";
import { construirSnapshotPush, marcarPushed } from "./sync-push.mjs";

let backend;
try {
  backend = await startBackend({ log: () => {} });
  const pool = backend.pool;
  const q = async (sql, p) => (await pool.query(sql, p)).rows;

  const tenant = (await q("SELECT id FROM tenants LIMIT 1"))[0].id;
  // Estado limpio de tracking para que las ventas terminales cuenten como pendientes.
  await pool.query("CREATE TABLE IF NOT EXISTS _vim_push_ok (ticket_id uuid PRIMARY KEY, pushed_at timestamptz DEFAULT now())");
  await pool.query("TRUNCATE _vim_push_ok");

  // 1) Armar el snapshot pendiente (ventas terminales de la caja)
  const { snapshot, ids } = await construirSnapshotPush(pool);
  console.log(`· pendientes por subir: ${ids.length} tickets`);
  if (ids.length === 0) throw new Error("no hay ventas terminales en la caja para probar el push");
  console.log(`· snapshot: ${snapshot.tickets?.length ?? 0} tickets, ${snapshot.pagos?.length ?? 0} pagos, ${snapshot.turnos?.length ?? 0} turnos`);

  // Folios/estados ANTES
  const antes = await q("SELECT folio_completo,estado_fiscal FROM tickets WHERE id = ANY($1) ORDER BY folio_completo", [ids]);

  // 2) Aplicar el snapshot por la MISMA RPC de la nube (idempotente sobre el propio device)
  const res = (await q("SELECT sync_push_snapshot($1::uuid, $2::jsonb) AS r", [tenant, JSON.stringify(snapshot)]))[0].r;
  console.log(`· sync_push_snapshot aplicó: ${JSON.stringify(res)}`);

  // 3) Folios/estados no cambiaron (verbatim, sin regenerar)
  const despues = await q("SELECT folio_completo,estado_fiscal FROM tickets WHERE id = ANY($1) ORDER BY folio_completo", [ids]);
  for (let i = 0; i < antes.length; i++) {
    if (antes[i].folio_completo !== despues[i].folio_completo || antes[i].estado_fiscal !== despues[i].estado_fiscal) {
      throw new Error(`ticket cambió tras push: ${JSON.stringify(antes[i])} → ${JSON.stringify(despues[i])}`);
    }
  }
  console.log(`· folios/estados intactos tras el push (verbatim). Ej: ${despues[0].folio_completo}=${despues[0].estado_fiscal}, ${despues[despues.length - 1].folio_completo}=${despues[despues.length - 1].estado_fiscal}`);

  // 4) Marcar subidos y confirmar que ya no hay pendientes (no re-sube)
  await marcarPushed(pool, ids);
  const otra = await construirSnapshotPush(pool);
  if (otra.ids.length !== 0) throw new Error(`tras marcar subidos, aún quedan ${otra.ids.length} pendientes`);
  console.log("· tras marcar subidos → 0 pendientes (no re-sube)");

  console.log(`\n✅ SYNC PUSH OK — ${ids.length} ventas de la caja armadas en snapshot y aplicadas por sync_push_snapshot`);
  console.log("   sin alterar folios/estados; tracking evita re-subir. Cierra el ciclo: pull baja referencia, push sube ventas.");
} catch (e) {
  console.error("\n❌ SYNC PUSH FALLÓ:", e.message);
  process.exitCode = 1;
} finally {
  if (backend) await backend.stop();
}
