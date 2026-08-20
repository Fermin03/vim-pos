// Verifica que UNA fila conflictiva no tumbe el envío completo (migración 0074).
//
// El fallo que esto blinda: `_vim_apply_rows` aplicaba cada tabla con un INSERT masivo. Una sola
// fila que violara una restricción hacía caer la sentencia, la transacción y el snapshot entero
// —ni una venta se guardaba—. En el piloto: 27 ventas retenidas 16 reintentos por un turno viejo.
import EmbeddedPostgres from "embedded-postgres";
import path from "node:path";
import { readFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const sql = readFileSync(path.join(raiz, "supabase/migrations/0074_push_aisla_fila_conflictiva.sql"), "utf8");
// Solo el helper: `sync_push_snapshot` arrastra medio esquema y aquí se prueba el aislamiento.
const fn = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION _vim_apply_rows_detalle"), sql.indexOf("REVOKE EXECUTE ON FUNCTION _vim_apply_rows_detalle"));

const dir = mkdtempSync(path.join(tmpdir(), "vim-aisl-"));
const pg = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "postgres", port: 54397, persistent: false });
let fallos = 0, pool = null;
const check = (n, c, extra = "") => { if (c) console.log(`  ok · ${n}`); else { console.log(`  FALLA · ${n} ${extra}`); fallos++; } };

try {
  await pg.initialise(); await pg.start(); await pg.createDatabase("prueba");
  pool = pg.getPgClient("prueba"); await pool.connect();
  const q = async (s, p) => (await pool.query(s, p)).rows;

  await q(`CREATE TABLE turnos (
     id uuid PRIMARY KEY, tenant_id uuid NOT NULL, caja_id uuid NOT NULL, estado text NOT NULL);
   CREATE UNIQUE INDEX idx_turno_unico_activo_por_caja ON turnos(caja_id) WHERE estado = 'ABIERTO';`);
  await q(fn);

  const TEN = "eeeeeeee-0000-0000-0000-000000000001";
  const CAJA = "cccccccc-0000-0000-0000-000000000001";
  // Ya hay un turno ABIERTO: el mismo escenario que bloqueó al piloto.
  await q(`INSERT INTO turnos VALUES ('99999999-0000-0000-0000-000000000001',$1,$2,'ABIERTO')`, [TEN, CAJA]);

  const filas = [
    { id: "11111111-0000-0000-0000-000000000001", tenant_id: TEN, caja_id: CAJA, estado: "CERRADO" },
    { id: "22222222-0000-0000-0000-000000000002", tenant_id: TEN, caja_id: CAJA, estado: "ABIERTO" }, // choca
    { id: "33333333-0000-0000-0000-000000000003", tenant_id: TEN, caja_id: CAJA, estado: "CERRADO" },
  ];

  console.log("\n1) Sin conflictos: entra todo por el camino rápido");
  const buenas = [filas[0], filas[2]];
  let r = (await q(`SELECT _vim_apply_rows_detalle('turnos',$1::jsonb,$2) AS r`, [JSON.stringify(buenas), TEN]))[0].r;
  check("aplica las 2", r.aplicadas === 2, `(aplicó ${r.aplicadas})`);
  check("sin errores", r.errores.length === 0);
  await q(`DELETE FROM turnos WHERE id <> '99999999-0000-0000-0000-000000000001'`);

  console.log("\n2) EL CASO DEL PILOTO: una fila choca entre tres");
  r = (await q(`SELECT _vim_apply_rows_detalle('turnos',$1::jsonb,$2) AS r`, [JSON.stringify(filas), TEN]))[0].r;
  check("las 2 buenas SÍ entran", r.aplicadas === 2, `(aplicó ${r.aplicadas})`);
  check("reporta 1 error", r.errores.length === 1, `(reportó ${r.errores.length})`);
  check("dice cuál fue", r.errores[0]?.id === filas[1].id, `(dijo ${r.errores[0]?.id})`);
  check("y por qué", /idx_turno_unico_activo_por_caja/.test(r.errores[0]?.error ?? ""), `(${r.errores[0]?.error})`);
  const n = (await q(`SELECT count(*)::int c FROM turnos`))[0].c;
  check("quedaron guardadas en la tabla", n === 3, `(hay ${n} de 3 esperadas)`);

  console.log("\n3) Filtro por tenant: no se cuela lo de otro cliente");
  const ajena = [{ id: "44444444-0000-0000-0000-000000000004", tenant_id: "ffffffff-0000-0000-0000-000000000009", caja_id: CAJA, estado: "CERRADO" }];
  r = (await q(`SELECT _vim_apply_rows_detalle('turnos',$1::jsonb,$2) AS r`, [JSON.stringify(ajena), TEN]))[0].r;
  check("no aplica nada ajeno", r.aplicadas === 0, `(aplicó ${r.aplicadas})`);

  console.log("\n4) Array vacío y nulo no truenan");
  r = (await q(`SELECT _vim_apply_rows_detalle('turnos','[]'::jsonb,$1) AS r`, [TEN]))[0].r;
  check("vacío devuelve 0", r.aplicadas === 0);
  r = (await q(`SELECT _vim_apply_rows_detalle('turnos',NULL,$1) AS r`, [TEN]))[0].r;
  check("nulo devuelve 0", r.aplicadas === 0);

  console.log(fallos === 0 ? "\n✅ AISLAMIENTO OK — lo bueno entra, lo conflictivo se reporta" : `\n❌ ${fallos} comprobación(es) fallaron`);
} finally {
  try { await pool?.end(); } catch { /* */ }
  try { await pg.stop(); } catch { /* */ }
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
}
process.exit(fallos === 0 ? 0 : 1);
