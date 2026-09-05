// Fase 1 · Verificación del sync PUSH en el device (sin depender de la nube).
// Usa las ventas REALES que ya están en la caja local: arma el snapshot pendiente, lo aplica
// por la RPC sync_push_snapshot (idempotente, verbatim) y comprueba que folios/estados no
// cambian y que el tracking _vim_push_ok evita re-subir. (El insert-fresco-conserva-folio ya
// quedó probado en smoke_sync_push contra el esquema canónico.)
import { startBackend } from "./backend.mjs";
import { construirSnapshotPush, marcarPushed, listarPendientes, marcarMovimientosPushed } from "./sync-push.mjs";

const CAJA = "99999999-0000-0000-0000-0000000000cc";

let backend;
try {
  backend = await startBackend({ log: () => {} });
  const pool = backend.pool;
  const q = async (sql, p) => (await pool.query(sql, p)).rows;

  // Ancla en la CAJA del fixture (fija): "LIMIT 1" sobre tenants es ambiguo en una base de dev que
  // ya tenga más de un tenant (p.ej. uso real de la app además del fixture sembrado) — ver el
  // mismo arreglo en verify-sync.mjs.
  const tenant = (await q("SELECT tenant_id FROM cajas WHERE id=$1", [CAJA]))[0].tenant_id;
  // Estado limpio de tracking para que las ventas terminales cuenten como pendientes.
  await pool.query("CREATE TABLE IF NOT EXISTS _vim_push_ok (ticket_id uuid PRIMARY KEY, pushed_at timestamptz DEFAULT now())");
  await pool.query("TRUNCATE _vim_push_ok");
  await pool.query("CREATE TABLE IF NOT EXISTS _vim_mov_ok (movimiento_id uuid PRIMARY KEY, subido_at timestamptz DEFAULT now())");
  await pool.query("TRUNCATE _vim_mov_ok");

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

  // Inventario (ADR 0013): los movimientos locales pendientes viajan y se marcan.
  const { movimientoIds } = await listarPendientes(pool);
  console.log(`· movimientos de inventario pendientes: ${movimientoIds.length}`);
  if (movimientoIds.length) {
    if (!snapshot.movimientos_inventario?.length) throw new Error("el snapshot no incluye movimientos_inventario");
    if ((res.movimientos_inventario ?? 0) !== 0) throw new Error("la RPC aplicó sobre la propia caja movimientos que ya existían: debía ser 0 (idempotencia por id)");
    // Espejo de producción (movimientosRechazados en sync-push.mjs): solo se marcan los que la
    // nube NO reportó en _errores. Marcar un id rechazado como subido lo perdería para siempre.
    const rechazados = new Set((res._errores ?? []).filter((e) => e?.tabla === "movimientos_inventario" && e.id).map((e) => e.id));
    await marcarMovimientosPushed(pool, movimientoIds.filter((id) => !rechazados.has(id)));
    const otra = await listarPendientes(pool);
    if (otra.movimientoIds.length !== rechazados.size) {
      throw new Error(`_vim_mov_ok no evitó re-subir movimientos: quedaron ${otra.movimientoIds.length} pendientes, esperaba ${rechazados.size} (los rechazados)`);
    }
    console.log(`· _vim_mov_ok evita re-subir movimientos (OK)${rechazados.size ? ` — ${rechazados.size} rechazado(s) quedaron pendientes para reintentar` : ""}`);
  }

  // 3) Folios/estados no cambiaron (verbatim, sin regenerar)
  const despues = await q("SELECT folio_completo,estado_fiscal FROM tickets WHERE id = ANY($1) ORDER BY folio_completo", [ids]);
  for (let i = 0; i < antes.length; i++) {
    if (antes[i].folio_completo !== despues[i].folio_completo || antes[i].estado_fiscal !== despues[i].estado_fiscal) {
      throw new Error(`ticket cambió tras push: ${JSON.stringify(antes[i])} → ${JSON.stringify(despues[i])}`);
    }
  }
  console.log(`· folios/estados intactos tras el push (verbatim). Ej: ${despues[0].folio_completo}=${despues[0].estado_fiscal}, ${despues[despues.length - 1].folio_completo}=${despues[despues.length - 1].estado_fiscal}`);

  // 3.bis) El armado POR LOTE contra el esquema real.
  //
  // El pool falso de verify-push-lotes prueba la política (cuántos, qué se marca, qué pasa si
  // uno falla), pero no puede probar el SQL. Esto sí: que pedir un subconjunto de ids devuelva
  // EXACTAMENTE ese subconjunto, que cada lote arrastre los turnos que sus tickets referencian
  // —sin eso la FK los rechaza en la nube— y que juntando los lotes no falte ni sobre una venta.
  const mitad = Math.ceil(ids.length / 2);
  const loteA = ids.slice(0, mitad);
  const loteB = ids.slice(mitad);
  const sA = await construirSnapshotPush(pool, { ticketIds: loteA, turnoIds: [] });
  const sB = await construirSnapshotPush(pool, { ticketIds: loteB, turnoIds: [] });

  if (sA.ids.length !== loteA.length || sB.ids.length !== loteB.length) {
    throw new Error(`el armado por lote no respetó la lista: pedí ${loteA.length}/${loteB.length}, vinieron ${sA.ids.length}/${sB.ids.length}`);
  }
  const juntos = new Set([...sA.ids, ...sB.ids]);
  if (juntos.size !== ids.length) throw new Error(`juntando los lotes hay ${juntos.size} ventas y deberían ser ${ids.length}`);

  for (const [nombre, s] of [["A", sA], ["B", sB]]) {
    const turnosDelLote = new Set((s.snapshot.turnos ?? []).map((t) => t.id));
    for (const t of s.snapshot.tickets ?? []) {
      if (!turnosDelLote.has(t.turno_id)) {
        throw new Error(`lote ${nombre}: el ticket ${t.folio_completo} viaja sin su turno (la nube lo rechazaría por FK)`);
      }
    }
    const idsLote = new Set(s.ids);
    for (const it of s.snapshot.ticket_items ?? []) {
      if (!idsLote.has(it.ticket_id)) throw new Error(`lote ${nombre}: llegó un renglón de un ticket que no va en el lote`);
    }
  }
  console.log(`· armado por lote OK: ${sA.ids.length}+${sB.ids.length} ventas, cada lote con sus turnos (${sA.snapshot.turnos?.length ?? 0} y ${sB.snapshot.turnos?.length ?? 0}) y sin renglones huérfanos`);

  // Y que un turno forzado (el caso "cerró el turno pero no vendió nada nuevo") sí se cuele.
  const turnoSuelto = (await q("SELECT id FROM turnos LIMIT 1"))[0].id;
  const sForzado = await construirSnapshotPush(pool, { ticketIds: [], turnoIds: [turnoSuelto] });
  if (!(sForzado.snapshot.turnos ?? []).some((t) => t.id === turnoSuelto)) {
    throw new Error("un turno pedido explícitamente no viajó en el lote");
  }
  if ((sForzado.snapshot.tickets ?? []).length !== 0) {
    throw new Error("un lote sin ventas trajo tickets de todos modos");
  }
  console.log("· lote de solo-turnos OK: viaja el turno pedido y ninguna venta");

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
