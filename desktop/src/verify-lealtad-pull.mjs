// Verifica contra Postgres embebido real lo que las pruebas unitarias no pueden: que al bajar el
// cliente real de la nube, el duplicado local se funde en él sin perder sus ventas ni sus puntos, y
// que ninguna colisión de índices únicos (direcciones principales) tumba el pull.
// Datos temporales y puertos propios (54398/54397): no toca la caja instalada (54329) ni los smokes.
// Uso: node src/verify-lealtad-pull.mjs
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import assert from "node:assert/strict";
import { startLocalBackend } from "./runtime.mjs";
import { pullSnapshot } from "./sync-pull.mjs";

const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vim-lealtad-pull-"));
let backend;
try {
  backend = await startLocalBackend({ dataRoot, pgPort: 54398, restPort: 54397, log: () => {} });
  const pool = backend.pool;
  const q = async (sql, p) => (await pool.query(sql, p)).rows;
  // Un negocio del fixture de desarrollo (la base temporal se siembra sola).
  const T = (await q("SELECT tenant_id FROM cajas WHERE id = '99999999-0000-0000-0000-0000000000cc'"))[0].tenant_id;
  const ahora = new Date().toISOString();
  const clienteNube = (id, telefono, nombre = "Cliente Nube") => ({
    id, tenant_id: T, nombre, telefono, tipo_fiscal: "EVENTUAL", estado: "ACTIVO",
    codigo_publico: id.replace(/-/g, "").padEnd(64, "a"), created_at: ahora, updated_at: ahora });
  const saldoNube = (id, saldo) => ({ cliente_id: id, tenant_id: T, saldo, programa_version: 1, updated_at: ahora });
  const dir = (cliente, principal, calle) => q(
    `INSERT INTO direcciones_cliente (tenant_id, cliente_id, etiqueta, calle, numero_exterior, colonia, codigo_postal, ciudad, estado_geo, es_principal)
     VALUES ($1, $2, 'Casa', $3, '1', 'Centro', '37000', 'León', 'Guanajuato', $4) RETURNING id`, [T, cliente, calle, principal]);

  // Qué apunta a clientes(id) y qué índices únicos hay sobre esas columnas (lista que va al reporte).
  const fks = await q(
    `SELECT cl.relname AS tabla, a.attname AS col
       FROM pg_constraint c JOIN pg_class cl ON cl.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
       JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1]
      WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1
        AND c.confrelid = 'public.clientes'::regclass AND ra.attname = 'id' AND c.conrelid <> c.confrelid
      ORDER BY 1, 2`);
  console.log("FK hacia clientes(id):", fks.map((r) => `${r.tabla}.${r.col}`).join(", "));
  for (const f of fks) {
    const ix = await q(`SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1
                          AND indexdef ILIKE 'CREATE UNIQUE%' AND indexdef ~ ('[(, ]"?' || $2 || '"?[,) ]')`, [f.tabla, f.col]);
    for (const i of ix) console.log(`  UNIQUE sobre ${f.tabla}.${f.col}: ${i.indexdef}`);
  }

  await pool.query("INSERT INTO lealtad_programa (tenant_id, mecanica, porcentaje) VALUES ($1, 'PUNTOS_DINERO', 10)", [T]);

  // (a) duplicado por teléfono: 12 pendientes + 30 de la nube = 42; y (e) repetir el pull no cambia nada.
  {
    const local = (await q("INSERT INTO clientes (tenant_id, nombre, telefono) VALUES ($1, 'Ana Caja', '4770001567') RETURNING id", [T]))[0].id;
    await pool.query("SELECT lealtad_registrar_movimiento(NULL, $1, $2, 'GANADO', 12, 1)", [T, local]);
    const real = "77777777-0000-0000-0000-000000000001";
    const snapshot = { clientes: [clienteNube(real, "4770001567", "Ana Nube")], lealtad_saldos: [saldoNube(real, 30)] };
    await pullSnapshot(pool, snapshot, () => {});
    const vivos = await q("SELECT id FROM clientes WHERE tenant_id = $1 AND telefono = '4770001567'", [T]);
    assert.deepEqual(vivos.map((r) => r.id), [real], "(a) queda un solo cliente y es el de la nube");
    const mov = await q("SELECT cliente_id FROM lealtad_movimientos WHERE tenant_id = $1", [T]);
    assert.ok(mov.length === 1 && mov.every((m) => m.cliente_id === real), "(a) los movimientos locales se mudaron al cliente real");
    assert.equal((await q("SELECT saldo FROM lealtad_saldos WHERE cliente_id = $1", [real]))[0].saldo, 42, "(a) saldo = 30 de la nube + 12 pendientes");
    assert.equal((await q("SELECT count(*)::int AS n FROM lealtad_saldos WHERE cliente_id = $1", [local]))[0].n, 0, "(a) el saldo del duplicado se fue");
    assert.equal((await q("SELECT count(*)::int AS n FROM _vim_clientes_ok WHERE cliente_id = $1", [local]))[0].n, 0, "(a) la libreta no guarda al duplicado");
    const foto = async () => JSON.stringify([
      await q("SELECT id, nombre, telefono FROM clientes WHERE tenant_id = $1 ORDER BY id", [T]),
      await q("SELECT cliente_id, saldo FROM lealtad_saldos ORDER BY cliente_id"),
      await q("SELECT cliente_id, huella FROM _vim_clientes_ok ORDER BY cliente_id"),
      await q("SELECT id, cliente_id, puntos FROM lealtad_movimientos ORDER BY id")]);
    const antes = await foto();
    await pullSnapshot(pool, snapshot, () => {});
    assert.equal(await foto(), antes, "(e) un segundo pull idéntico no cambia nada");
    assert.equal((await q("SELECT saldo FROM lealtad_saldos WHERE cliente_id = $1", [real]))[0].saldo, 42, "(e) el saldo sigue en 42");
  }

  // (b) el mismo caso con el teléfono formateado distinto en cada lado.
  {
    const local = (await q("INSERT INTO clientes (tenant_id, nombre, telefono) VALUES ($1, 'Beto Caja', '477 000-1568') RETURNING id", [T]))[0].id;
    await pool.query("SELECT lealtad_registrar_movimiento(NULL, $1, $2, 'GANADO', 5, 1)", [T, local]);
    const real = "77777777-0000-0000-0000-000000000002";
    await pullSnapshot(pool, { clientes: [clienteNube(real, "(477) 000.1568", "Beto Nube")], lealtad_saldos: [saldoNube(real, 10)] }, () => {});
    const vivos = await q("SELECT id FROM clientes WHERE tenant_id = $1 AND regexp_replace(telefono, '\\D', '', 'g') = '4770001568'", [T]);
    assert.deepEqual(vivos.map((r) => r.id), [real], "(b) con teléfonos formateados distinto también se funden");
    assert.equal((await q("SELECT saldo FROM lealtad_saldos WHERE cliente_id = $1", [real]))[0].saldo, 15, "(b) 10 de la nube + 5 pendientes");
  }

  // (c) el duplicado y el real tienen cada uno su dirección principal: antes esto era unique_violation.
  {
    const real = "77777777-0000-0000-0000-000000000003";
    await pullSnapshot(pool, { clientes: [clienteNube(real, "4770001569", "Carla Nube")] }, () => {});
    await dir(real, true, "Calle del real");
    const local = (await q("INSERT INTO clientes (tenant_id, nombre, telefono) VALUES ($1, 'Carla Caja', '(477) 000 1569') RETURNING id", [T]))[0].id;
    await dir(local, true, "Calle del duplicado");
    await dir(local, false, "Otra del duplicado");
    await pullSnapshot(pool, { clientes: [clienteNube(real, "4770001569", "Carla Nube")] }, () => {});
    const dirs = await q("SELECT cliente_id, es_principal, calle FROM direcciones_cliente WHERE tenant_id = $1 AND (calle LIKE '%real' OR calle LIKE '%duplicado')", [T]);
    assert.equal(dirs.length, 3, "(c) las tres direcciones se conservan");
    assert.ok(dirs.every((d) => d.cliente_id === real), "(c) todas pertenecen al cliente real");
    assert.equal(dirs.filter((d) => d.es_principal).length, 1, "(c) el real tiene exactamente una principal");
    assert.equal(dirs.find((d) => d.es_principal).calle, "Calle del real", "(c) la principal sigue siendo la del real");
    assert.equal((await q("SELECT count(*)::int AS n FROM clientes WHERE id = $1", [local]))[0].n, 0, "(c) el duplicado ya no existe");
  }

  // (d) una edición local pendiente no se pisa con el pull.
  {
    const real = "77777777-0000-0000-0000-000000000004";
    await pullSnapshot(pool, { clientes: [clienteNube(real, "4770001570", "Dora Nube")] }, () => {});
    await pool.query("UPDATE clientes SET nombre = 'Dora Editada en caja' WHERE id = $1", [real]);
    await pullSnapshot(pool, { clientes: [clienteNube(real, "4770001570", "Dora Nube Otra Vez")] }, () => {});
    assert.equal((await q("SELECT nombre FROM clientes WHERE id = $1", [real]))[0].nombre, "Dora Editada en caja", "(d) la edición local pendiente sobrevive al pull");
  }

  // (f) una nube vieja, sin ninguna de las cuatro llaves, se aplica limpio.
  {
    const resumen = await pullSnapshot(pool, { __watermark: "viejo" }, () => {});
    assert.deepEqual(resumen, {}, "(f) un snapshot sin llaves de lealtad ni de clientes no hace nada");
  }
  console.log("VERIFY LEALTAD PULL OK");
} finally {
  if (backend) await backend.stop();
  fs.rmSync(dataRoot, { recursive: true, force: true });
}
