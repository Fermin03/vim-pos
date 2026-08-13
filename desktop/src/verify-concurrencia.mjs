// Fase 2 (remediación) · Test de concurrencia de aplicar_pago.
//
// Prueba REAL (dos conexiones que compiten) de que el FOR UPDATE de la migración 0060 impide el
// doble cobro. Una prueba pgTAP no sirve: corre en una sola sesión y no puede simular concurrencia.
//
// Escenario: un ticket ABIERTO con total > 0 recibe DOS pagos por el total, a la vez.
//   - Conexión A abre transacción y aplica el pago (toma el lock del ticket vía FOR UPDATE).
//   - Conexión B intenta el mismo pago → DEBE BLOQUEARSE en el lock (no cobra en paralelo).
//   - Al confirmar A, B se desbloquea, relee el ticket ya PAGADO y su guard RECHAZA el segundo pago.
// Sin FOR UPDATE ambos leerian monto_pagado=0, pasarian el guard y cobrarian doble.
//
// Uso (con Postgres del dev en 54329):  node src/verify-concurrencia.mjs
import pg from "pg";
import { readFileSync } from "node:fs";
// SEC CN-018 — la contraseña del Postgres local ya no es fija: runtime.mjs genera una por
// instalación y la guarda en bin/.pg-password. Se lee de ahí; 'postgres' solo cubre un clúster
// anterior a la rotación.
function passLocal() {
  try { return readFileSync(new URL("../bin/.pg-password", import.meta.url), "utf8").trim() || "postgres"; }
  catch { return "postgres"; }
}


const PG = { host: "127.0.0.1", port: 54329, user: "postgres", password: passLocal(), database: "vimpos" };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function claims(client, sub, tenant) {
  await client.query(`SELECT set_config('request.jwt.claims', $1, false)`,
    [JSON.stringify({ sub, tenant_id: tenant, role: "authenticated" })]);
}

async function main() {
  const setup = new pg.Client(PG);
  await setup.connect();

  // Contexto del fixture: un turno ABIERTO + un usuario + un producto con precio.
  const ctx = (await setup.query(`
    SELECT tu.id AS turno_id, tu.caja_id, tu.tenant_id, tu.sucursal_id,
           (SELECT up.id FROM usuarios_perfil up JOIN usuarios_acceso ua ON ua.usuario_id=up.id
             WHERE ua.tenant_id=tu.tenant_id AND up.pin_hash IS NOT NULL LIMIT 1) AS usuario_id,
           (SELECT p.id FROM productos p WHERE p.tenant_id=tu.tenant_id AND p.precio_base_mxn>0 LIMIT 1) AS producto_id,
           (SELECT p.precio_base_mxn FROM productos p WHERE p.tenant_id=tu.tenant_id AND p.precio_base_mxn>0 LIMIT 1) AS precio
    FROM turnos tu WHERE tu.estado='ABIERTO' LIMIT 1`)).rows[0];
  if (!ctx?.turno_id) throw new Error("no hay turno ABIERTO en el fixture; abre uno primero");

  await claims(setup, ctx.usuario_id, ctx.tenant_id);
  // Crear un ticket ABIERTO con un item (para que total_mxn > 0).
  const t = (await setup.query(`
    INSERT INTO tickets (tenant_id, sucursal_id, caja_id, turno_id, modo_servicio, estado_fiscal, dia_contable, created_by)
    VALUES ($1,$2,$3,$4,'COMER_AQUI','BORRADOR', CURRENT_DATE, $5) RETURNING id`,
    [ctx.tenant_id, ctx.sucursal_id, ctx.caja_id, ctx.turno_id, ctx.usuario_id])).rows[0];
  await setup.query(`
    INSERT INTO ticket_items
      (tenant_id, ticket_id, producto_id, cantidad,
       producto_nombre_snapshot, precio_unitario_snapshot, tasa_iva_snapshot, iva_incluido_en_precio_snapshot)
    VALUES ($1,$2,$3,1,'Item de prueba',$4,16,true)`,
    [ctx.tenant_id, t.id, ctx.producto_id, ctx.precio]);
  await setup.query(`UPDATE tickets SET estado_fiscal='ABIERTO' WHERE id=$1`, [t.id]);
  const total = Number((await setup.query(`SELECT total_mxn FROM tickets WHERE id=$1`, [t.id])).rows[0].total_mxn);
  console.log(`Ticket de prueba ${t.id.slice(0, 8)}… total=$${total}`);

  // ── La carrera ──────────────────────────────────────────────────────────
  const A = new pg.Client(PG); await A.connect(); await claims(A, ctx.usuario_id, ctx.tenant_id);
  const B = new pg.Client(PG); await B.connect(); await claims(B, ctx.usuario_id, ctx.tenant_id);

  await A.query("BEGIN");
  await A.query(`SELECT aplicar_pago($1,'EFECTIVO',$2,$2)`, [t.id, total]); // toma el lock
  console.log("A: pago aplicado (lock tomado, sin confirmar)");

  await B.query("BEGIN");
  let bResuelto = false, bError = null;
  const bPromesa = B.query(`SELECT aplicar_pago($1,'EFECTIVO',$2,$2)`, [t.id, total])
    .then(() => { bResuelto = true; })
    .catch((e) => { bError = e.message.split("\n")[0]; });

  await espera(1200);
  const bBloqueado = !bResuelto && !bError;
  console.log(`B: ${bBloqueado ? "BLOQUEADO esperando el lock ✓" : "NO se bloqueó ✗"}`);

  await A.query("COMMIT");                 // libera el lock
  await bPromesa;                          // B se desbloquea y su guard actúa
  await B.query("ROLLBACK").catch(() => {});
  console.log(`B: tras confirmar A → ${bError ? "RECHAZADO ✓ (" + bError + ")" : "cobró igual ✗"}`);

  // ── Veredicto ───────────────────────────────────────────────────────────
  const nPagos = Number((await setup.query(
    `SELECT count(*) n FROM pagos WHERE ticket_id=$1 AND estado='APLICADO' AND deleted_at IS NULL`, [t.id])).rows[0].n);
  const pagado = Number((await setup.query(`SELECT monto_pagado_mxn FROM tickets WHERE id=$1`, [t.id])).rows[0].monto_pagado_mxn);
  const ok = bBloqueado && bError && nPagos === 1 && pagado === total;
  console.log(`\nPagos aplicados: ${nPagos} (esperado 1) · total pagado: $${pagado} (esperado $${total})`);
  console.log(ok ? "✅ PASA — no hubo doble cobro" : "❌ FALLA — el ticket se cobró de más");

  // limpieza
  await setup.query(`DELETE FROM pagos WHERE ticket_id=$1`, [t.id]);
  await setup.query(`DELETE FROM ticket_items WHERE ticket_id=$1`, [t.id]);
  await setup.query(`DELETE FROM tickets WHERE id=$1`, [t.id]);
  await A.end(); await B.end(); await setup.end();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error("error del test:", e.message); process.exit(2); });
