// Verifica que el CIERRE de un turno viaje aunque no haya ventas nuevas.
//
// El fallo que esto blinda: los turnos solo se enviaban si arrastraban una venta pendiente. Como
// el cierre ocurre DESPUÉS de la última venta, el turno se quedaba ABIERTO en la nube para
// siempre y el siguiente turno de esa caja chocaba contra `idx_turno_unico_activo_por_caja`,
// tumbando el push entero. En el piloto: 27 ventas retenidas y 16 reintentos.
//
// Clúster desechable con esquema MÍNIMO —solo lo que toca la consulta— para probar el SQL sin
// arrastrar 73 migraciones ni tocar la base real de la caja.
import EmbeddedPostgres from "embedded-postgres";
import path from "node:path";
import { rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { construirSnapshotPush, marcarPushed, marcarTurnosPushed } from "./sync-push.mjs";

const dir = mkdtempSync(path.join(tmpdir(), "vim-verify-"));
const pg = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "postgres", port: 54398, persistent: false });

let fallos = 0;
let pool = null;
const check = (nombre, cond, extra = "") => {
  if (cond) console.log(`  ok · ${nombre}`);
  else { console.log(`  FALLA · ${nombre} ${extra}`); fallos++; }
};

try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("prueba");
  pool = pg.getPgClient("prueba");
  await pool.connect();
  const q = async (s, p) => (await pool.query(s, p)).rows;

  await q(`
    CREATE TABLE turnos (
      id uuid PRIMARY KEY, caja_id uuid NOT NULL, estado text NOT NULL,
      fecha_apertura timestamptz NOT NULL DEFAULT now(), fecha_cierre timestamptz,
      efectivo_contado_mxn numeric(12,2));
    CREATE TABLE tickets (
      id uuid PRIMARY KEY, turno_id uuid NOT NULL REFERENCES turnos(id),
      estado_fiscal text NOT NULL, folio_completo text,
      -- El push ordena lo pendiente por esta fecha para subirlo en orden cronológico.
      fecha_apertura timestamptz NOT NULL DEFAULT now());
    CREATE TABLE ticket_items (id uuid PRIMARY KEY, ticket_id uuid REFERENCES tickets(id));
    CREATE TABLE ticket_item_modificadores (id uuid PRIMARY KEY, ticket_item_id uuid REFERENCES ticket_items(id));
    CREATE TABLE pagos (id uuid PRIMARY KEY, ticket_id uuid REFERENCES tickets(id));
    CREATE TABLE movimientos_caja (id uuid PRIMARY KEY, turno_id uuid REFERENCES turnos(id), monto numeric(12,2));
    -- Faltaba: se sumó a la rebanada del push después de escribirse esta prueba, y sin la tabla
    -- el snapshot ni siquiera se puede armar aquí. Si mañana el push aprende otra tabla, este
    -- laboratorio también tiene que aprenderla.
    CREATE TABLE delivery_asignaciones (id uuid PRIMARY KEY, ticket_id uuid REFERENCES tickets(id));
  `);

  const T1 = "11111111-1111-1111-1111-111111111111";
  const T2 = "22222222-2222-2222-2222-222222222222";
  const CAJA = "aaaaaaaa-0000-0000-0000-000000000001";
  await q(`INSERT INTO turnos(id,caja_id,estado) VALUES ($1,$2,'ABIERTO')`, [T1, CAJA]);
  await q(`INSERT INTO tickets(id,turno_id,estado_fiscal,folio_completo) VALUES ('aaaa1111-0000-0000-0000-000000000001',$1,'PAGADO','F-001')`, [T1]);

  console.log("\n1) Primer envío: la venta y su turno abierto");
  let s = await construirSnapshotPush(pool);
  check("manda 1 venta", s.ids.length === 1, `(mandó ${s.ids.length})`);
  check("manda su turno", s.turnos.length === 1, `(mandó ${s.turnos.length})`);
  await marcarPushed(pool, s.ids);
  await marcarTurnosPushed(pool, s.turnos);

  console.log("\n2) Sin cambios: no hay nada que mandar");
  s = await construirSnapshotPush(pool);
  check("no manda ventas", s.ids.length === 0, `(mandó ${s.ids.length})`);
  check("no manda turnos", s.turnos.length === 0, `(mandó ${s.turnos.length})`);

  console.log("\n3) EL CASO DEL PILOTO: se cierra el turno, sin ventas nuevas");
  await q(`UPDATE turnos SET estado='CERRADO', fecha_cierre=now(), efectivo_contado_mxn=1500 WHERE id=$1`, [T1]);
  s = await construirSnapshotPush(pool);
  check("el cierre SÍ viaja", s.turnos.length === 1, `(mandó ${s.turnos.length} turnos)`);
  check("sin ventas de por medio", s.ids.length === 0, `(mandó ${s.ids.length} ventas)`);
  check("el turno va como CERRADO", s.snapshot.turnos?.[0]?.estado === "CERRADO", `(iba ${s.snapshot.turnos?.[0]?.estado})`);
  check("lleva el efectivo contado", Number(s.snapshot.turnos?.[0]?.efectivo_contado_mxn) === 1500);
  await marcarTurnosPushed(pool, s.turnos);

  console.log("\n4) Ya enviado el cierre, deja de repetirse");
  s = await construirSnapshotPush(pool);
  check("no lo vuelve a mandar", s.turnos.length === 0, `(mandó ${s.turnos.length})`);

  console.log("\n5) Turno nuevo con SOLO movimientos de caja, sin vender nada");
  await q(`INSERT INTO turnos(id,caja_id,estado) VALUES ($1,$2,'ABIERTO')`, [T2, CAJA]);
  await q(`INSERT INTO movimientos_caja(id,turno_id,monto) VALUES ('bbbb2222-0000-0000-0000-000000000001',$1,300)`, [T2]);
  s = await construirSnapshotPush(pool);
  check("manda el turno", s.turnos.length === 1, `(mandó ${s.turnos.length})`);
  check("y su movimiento de caja", s.snapshot.movimientos_caja?.length === 1, `(mandó ${s.snapshot.movimientos_caja?.length ?? 0})`);

  console.log("\n6) Un cambio cualquiera del turno vuelve a viajar (huella de fila completa)");
  await marcarTurnosPushed(pool, s.turnos);
  await q(`UPDATE turnos SET efectivo_contado_mxn=999 WHERE id=$1`, [T2]);
  s = await construirSnapshotPush(pool);
  check("detecta el cambio", s.turnos.length === 1, `(mandó ${s.turnos.length})`);

  console.log(fallos === 0 ? "\n✅ CIERRE DE TURNO OK — el cierre viaja aunque no haya ventas" : `\n❌ ${fallos} comprobación(es) fallaron`);
} finally {
  // Cerrar el cliente ANTES de tumbar el servidor: si no, `pg` grita "Connection terminated"
  // al final de una corrida que salió bien, y un ruido así enseña a ignorar la salida.
  try { await pool.end(); } catch { /* */ }
  try { await pg.stop(); } catch { /* */ }
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
}
process.exit(fallos === 0 ? 0 : 1);
