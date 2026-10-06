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
  const clienteNube = (id, telefono, nombre = "Cliente Nube", extra = {}) => ({
    id, tenant_id: T, nombre, telefono, rfc: null, tipo_fiscal: "EVENTUAL", estado: "ACTIVO",
    codigo_publico: id.replace(/-/g, "").padEnd(64, "a"), created_at: ahora, updated_at: ahora, ...extra });
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

  const nombreDe = async (id) => (await q("SELECT nombre FROM clientes WHERE id = $1", [id]))[0]?.nombre;
  const telDe = async (id) => (await q("SELECT telefono FROM clientes WHERE id = $1", [id]))[0]?.telefono;
  const rfcDe = async (id) => (await q("SELECT rfc FROM clientes WHERE id = $1", [id]))[0]?.rfc;

  // (F1) premios: el dueño borra un premio y lo recrea para el mismo producto; el snapshot trae la fila
  // viva NUEVA antes que la borrada vieja (orden que antes daba unique_violation y ROLLBACK).
  {
    const prod = (await q("SELECT id FROM productos WHERE tenant_id = $1 LIMIT 1", [T]))[0].id;
    const premio = (id, borrado) => ({ id, tenant_id: T, producto_id: prod, costo: 50, activo: true, created_at: ahora, updated_at: ahora, deleted_at: borrado ? ahora : null });
    const P1 = "88888888-0000-0000-0000-000000000001", P2 = "88888888-0000-0000-0000-000000000002";
    await pullSnapshot(pool, { lealtad_premios: [premio(P1, false)] }, () => {});
    await pullSnapshot(pool, { lealtad_premios: [premio(P2, false), premio(P1, true)] }, () => {});
    const vivos = await q("SELECT id FROM lealtad_premios WHERE tenant_id = $1 AND deleted_at IS NULL", [T]);
    assert.deepEqual(vivos.map((r) => r.id), [P2], "(F1) un solo premio vivo para el producto y es el nuevo");
    assert.equal((await q("SELECT count(*)::int AS n FROM lealtad_premios WHERE tenant_id = $1", [T]))[0].n, 2, "(F1) y la fila borrada también bajó");
    // El programa llega con otro id para el mismo negocio (UNIQUE tenant_id).
    const G2 = "88888888-0000-0000-0000-0000000000a2";
    await pullSnapshot(pool, { lealtad_programa: [{ id: G2, tenant_id: T, mecanica: "PUNTOS_DINERO", version: 1, porcentaje: 12, compra_minima_mxn: 0, tope_compras_dia: 3, created_at: ahora, updated_at: ahora }] }, () => {});
    const prog = await q("SELECT id, porcentaje FROM lealtad_programa WHERE tenant_id = $1", [T]);
    assert.deepEqual(prog.map((r) => r.id), [G2], "(F1) el programa con otro id reemplaza al local");
    assert.equal(Number(prog[0].porcentaje), 12);
  }

  // (F2) un RFC pasa de un cliente a otro: el snapshot trae primero al que lo recibe.
  {
    const X = "99999999-1111-0000-0000-000000000001", W = "99999999-1111-0000-0000-000000000002";
    const RFC = "XAXX010101000";
    await pullSnapshot(pool, { clientes: [clienteNube(X, "4771110001", "Xavier", { rfc: RFC }), clienteNube(W, "4771110002", "Wendy")] }, () => {});
    await pullSnapshot(pool, { clientes: [clienteNube(W, "4771110002", "Wendy", { rfc: RFC }), clienteNube(X, "4771110001", "Xavier")] }, () => {});
    assert.equal(await rfcDe(W), RFC, "(F2) Wendy recibió el RFC");
    assert.equal(await rfcDe(X), null, "(F2) Xavier lo soltó");
    // Un teléfono que pasa de un cliente a otro, en el mismo orden.
    await pullSnapshot(pool, { clientes: [clienteNube(W, "4771110001", "Wendy", { rfc: RFC }), clienteNube(X, "4771110003", "Xavier")] }, () => {});
    assert.equal(await telDe(W), "4771110001", "(F2) Wendy recibió el teléfono");
    assert.equal(await telDe(X), "4771110003", "(F2) Xavier tiene el nuevo");
    assert.equal((await q("SELECT count(*)::int AS n FROM _vim_clientes_ok WHERE cliente_id IN ($1, $2)", [X, W]))[0].n, 2, "(F2) ambos anotados");
  }

  // (F3) Z (ya bajado, con dirección) pasa del teléfono B al C y X recibe B: ninguno es duplicado del otro.
  {
    const X = "99999999-3333-0000-0000-000000000001", Z = "99999999-3333-0000-0000-000000000002";
    await pullSnapshot(pool, { clientes: [clienteNube(Z, "4773330001", "Zoe")] }, () => {});
    const dz = (await dir(Z, true, "Calle de Zoe"))[0].id;
    await pullSnapshot(pool, { clientes: [clienteNube(X, "4773330001", "Xime"), clienteNube(Z, "4773330002", "Zoe")] }, () => {});
    const d = (await q("SELECT cliente_id FROM direcciones_cliente WHERE id = $1", [dz]))[0];
    assert.equal(d.cliente_id, Z, "(F3) la dirección sigue con Zoe");
    assert.equal((await q("SELECT count(*)::int AS n FROM direcciones_cliente WHERE cliente_id = $1", [X]))[0].n, 0, "(F3) Xime no recibió nada");
    assert.equal(await telDe(Z), "4773330002");
    assert.equal(await telDe(X), "4773330001");
    // Dos clientes vivos de la nube con los mismos dígitos y distinto formato: ninguno absorbe al otro (1.ª y 2.ª vez).
    const A = "99999999-3333-0000-0000-000000000003", B = "99999999-3333-0000-0000-000000000004";
    const snap = { clientes: [clienteNube(A, "4773330777", "Ana 1"), clienteNube(B, "(477) 333-0777", "Ana 2")] };
    for (const vez of [1, 2]) {
      await pullSnapshot(pool, snap, () => {});
      assert.equal((await q("SELECT count(*)::int AS n FROM clientes WHERE id IN ($1, $2)", [A, B]))[0].n, 2, `(F3) los dos siguen vivos en el pull ${vez}`);
    }
  }

  // (F2, capa 2) colisión que no se puede arreglar: L tiene una edición local pendiente (no se reescribe)
  // y conserva el teléfono crudo que trae otro cliente entrante. Se salta ESE cliente y el pull termina.
  {
    const L = "99999999-2222-0000-0000-000000000001", N = "99999999-2222-0000-0000-000000000002", M = "99999999-2222-0000-0000-000000000003";
    await pullSnapshot(pool, { clientes: [clienteNube(L, "4772220001", "Luis")] }, () => {});
    await pool.query("UPDATE clientes SET telefono = '4772220009' WHERE id = $1", [L]); // edición local pendiente
    const lineas = [];
    const resumen = await pullSnapshot(pool, { clientes: [clienteNube(L, "4772220001", "Luis"), clienteNube(N, "4772220009", "Nora"), clienteNube(M, "4772220003", "Mario")] }, (m) => lineas.push(m));
    assert.equal(await nombreDe(M), "Mario", "(F2b) el resto de los clientes se aplicó");
    assert.equal(await nombreDe(N), undefined, "(F2b) el cliente que choca no se insertó");
    assert.equal(await telDe(L), "4772220009", "(F2b) la edición pendiente sigue");
    assert.ok(lineas.some((l) => l.includes(N) && l.includes("idx_clientes_telefono_unico")), "(F2b) una línea de log con el id y el error");
    assert.equal((await q("SELECT count(*)::int AS n FROM _vim_clientes_ok WHERE cliente_id = $1", [N]))[0].n, 0, "(F2b) el fallido no está en la libreta");
    assert.equal((await q("SELECT count(*)::int AS n FROM _vim_clientes_ok WHERE cliente_id = $1", [M]))[0].n, 1, "(F2b) el aplicado sí");
    assert.equal(resumen.clientes, 1);
  }

  // (saldo) duplicado con 12 puntos pendientes y la nube sin ningún saldo: el real muestra 12.
  {
    const local = (await q("INSERT INTO clientes (tenant_id, nombre, telefono) VALUES ($1, 'Sara Caja', '4774440001') RETURNING id", [T]))[0].id;
    await pool.query("SELECT lealtad_registrar_movimiento(NULL, $1, $2, 'GANADO', 12, 1)", [T, local]);
    const real = "99999999-4444-0000-0000-000000000001";
    await pullSnapshot(pool, { clientes: [clienteNube(real, "(477) 444-0001", "Sara Nube")], lealtad_saldos: [] }, () => {});
    assert.equal((await q("SELECT saldo FROM lealtad_saldos WHERE cliente_id = $1", [real]))[0]?.saldo, 12, "(saldo) el real muestra los 12 pendientes");
  }

  // ¿Cambió el cliente en la caja desde la última vez que se anotó en la libreta? (misma huella que usa el push)
  const pendientePush = async (id) => (await q(
    `SELECT count(*)::int AS n FROM _vim_clientes_ok o JOIN clientes x ON x.id = o.cliente_id
      WHERE o.cliente_id = $1 AND o.huella IS DISTINCT FROM md5(to_jsonb(x)::text)`, [id]))[0].n === 1;

  // (N1) la fila falla Y su restauración también: X (teléfono A, RFC R1) pasa a D con RFC R2, D lo tiene L
  // (edición local pendiente) y A lo recibe W. El teléfono no puede volver (choca con W); el RFC sí, y X
  // no debe quedar como "edición local" que el push subiría con NULL.
  {
    const X = "99999999-5555-0000-0000-000000000001", W = "99999999-5555-0000-0000-000000000002", L = "99999999-5555-0000-0000-000000000003";
    const R1 = "BBBB010101BBB", R2 = "CCCC010101CCC";
    await pullSnapshot(pool, { clientes: [clienteNube(X, "4776660001", "Xenia", { rfc: R1 }), clienteNube(W, "4776660002", "Walter"), clienteNube(L, "4776660003", "Lalo")] }, () => {});
    await pool.query("UPDATE clientes SET telefono = '4776660009' WHERE id = $1", [L]); // edición pendiente: tiene D
    const lineas = [];
    await pullSnapshot(pool, { clientes: [clienteNube(W, "4776660001", "Walter"), clienteNube(X, "4776660009", "Xenia", { rfc: R2 }), clienteNube(L, "4776660003", "Lalo")] }, (m) => lineas.push(m));
    assert.equal(await rfcDe(X), R1, "(N1) el RFC, que no chocó con nada, volvió");
    assert.equal(await telDe(X), null, "(N1) el teléfono no pudo volver (lo tiene W)");
    assert.ok(lineas.some((l) => l.includes("no se pudo devolver telefono") && l.includes(X)), "(N1) una línea dice qué llave no volvió");
    assert.equal(await pendientePush(X), false, "(N1) X NO queda pendiente de subir con la llave en NULL");
    // Sin la colisión, el siguiente pull deja a X exactamente como dice la nube.
    await pool.query("UPDATE clientes SET telefono = '4776660003' WHERE id = $1", [L]); // L vuelve a su valor: nada choca
    await pullSnapshot(pool, { clientes: [clienteNube(W, "4776660001", "Walter"), clienteNube(X, "4776660007", "Xenia", { rfc: R2 }), clienteNube(L, "4776660003", "Lalo")] }, () => {});
    assert.equal(await telDe(X), "4776660007", "(N1) 2.º pull: teléfono como dice la nube");
    assert.equal(await rfcDe(X), R2, "(N1) 2.º pull: RFC como dice la nube");
  }

  // (N2) la fusión y el upsert van en el MISMO savepoint: V (solo local, con dirección y 12 puntos) es duplicado
  // de N, pero N no puede entrar (L, con edición pendiente, tiene su teléfono crudo). Todo de V sigue en V.
  {
    const V = (await q("INSERT INTO clientes (tenant_id, nombre, telefono) VALUES ($1, 'Vera Caja', '(477) 555-0001') RETURNING id", [T]))[0].id;
    const dv = (await dir(V, true, "Calle de Vera"))[0].id;
    await pool.query("SELECT lealtad_registrar_movimiento(NULL, $1, $2, 'GANADO', 12, 1)", [T, V]);
    const L = "99999999-6666-0000-0000-000000000001", N = "99999999-6666-0000-0000-000000000002";
    await pullSnapshot(pool, { clientes: [clienteNube(L, "4775550002", "Lola")] }, () => {});
    await pool.query("UPDATE clientes SET telefono = '4775550001' WHERE id = $1", [L]); // edición pendiente con el teléfono de N
    const snap = { clientes: [clienteNube(L, "4775550002", "Lola"), clienteNube(N, "4775550001", "Nando")] };
    await pullSnapshot(pool, snap, () => {});
    assert.equal((await q("SELECT count(*)::int AS n FROM clientes WHERE id = $1", [V]))[0].n, 1, "(N2) V sigue existiendo");
    assert.equal((await q("SELECT cliente_id FROM direcciones_cliente WHERE id = $1", [dv]))[0].cliente_id, V, "(N2) su dirección sigue con V");
    assert.equal((await q("SELECT count(*)::int AS n FROM lealtad_movimientos WHERE cliente_id = $1 AND puntos = 12", [V]))[0].n, 1, "(N2) su movimiento sigue con V");
    assert.equal((await q("SELECT saldo FROM lealtad_saldos WHERE cliente_id = $1", [V]))[0].saldo, 12, "(N2) sus puntos siguen con V");
    assert.equal((await q("SELECT count(*)::int AS n FROM clientes WHERE id = $1", [N]))[0].n, 0, "(N2) N no se insertó");
    for (const tabla of ["direcciones_cliente", "lealtad_movimientos", "lealtad_saldos"]) {
      assert.equal((await q(`SELECT count(*)::int AS n FROM ${tabla} WHERE cliente_id = $1`, [N]))[0].n, 0, `(N2) nada de ${tabla} cuelga de N`);
    }
    // Quitada la colisión, la fusión ocurre normal en el siguiente pull.
    await pool.query("UPDATE clientes SET telefono = '4775550003' WHERE id = $1", [L]);
    await pullSnapshot(pool, snap, () => {});
    assert.equal((await q("SELECT count(*)::int AS n FROM clientes WHERE id = $1", [V]))[0].n, 0, "(N2) ahora V se fundió");
    assert.equal((await q("SELECT cliente_id FROM direcciones_cliente WHERE id = $1", [dv]))[0].cliente_id, N, "(N2) su dirección ya es de N");
    assert.equal((await q("SELECT saldo FROM lealtad_saldos WHERE cliente_id = $1", [N]))[0]?.saldo, 12, "(N2) y N muestra los 12 puntos");
  }

  // (N3) escala: 2,000 clientes en el snapshot, dos pulls; el segundo (todo ya existe) no debe ser cuadrático.
  {
    const clientes = Array.from({ length: 2000 }, (_, i) => clienteNube(`aaaaaaaa-7777-0000-0000-${String(i).padStart(12, "0")}`, `477${String(8000000 + i)}`, `Masivo ${i}`));
    const t1 = Date.now();
    await pullSnapshot(pool, { clientes }, () => {});
    const ms1 = Date.now() - t1;
    const t2 = Date.now();
    await pullSnapshot(pool, { clientes }, () => {});
    const ms2 = Date.now() - t2;
    console.log(`N3: 2000 clientes — 1.er pull ${ms1} ms, 2.º pull ${ms2} ms`);
    assert.equal((await q("SELECT count(*)::int AS n FROM clientes WHERE nombre LIKE 'Masivo %'"))[0].n, 2000, "(N3) los 2,000 bajaron");
    assert.ok(ms2 < 10000, `(N3) el segundo pull de 2,000 clientes tardó ${ms2} ms (tope 10,000)`);
  }

  // (f) una nube vieja: trae otras tablas y ninguna de las cuatro llaves nuevas.
  {
    const fila = async (tabla, donde = "true") => (await q(`SELECT to_jsonb(x) AS r FROM ${tabla} x WHERE ${donde} LIMIT 2`)).map((r) => r.r);
    const snapshot = { __watermark: "viejo", tenants: await fila("tenants", `id = '${T}'`), sucursales: await fila("sucursales", `tenant_id = '${T}'`), productos: await fila("productos", `tenant_id = '${T}'`) };
    assert.ok(snapshot.tenants.length && snapshot.sucursales.length && snapshot.productos.length, "(f) hay datos reales que aplicar");
    const resumen = await pullSnapshot(pool, snapshot, () => {});
    assert.deepEqual(Object.keys(resumen).sort(), ["productos", "sucursales", "tenants"], "(f) se aplican esas tablas y nada de clientes ni lealtad");
  }

  console.log("VERIFY LEALTAD PULL OK");
} finally {
  if (backend) await backend.stop();
  fs.rmSync(dataRoot, { recursive: true, force: true });
}
