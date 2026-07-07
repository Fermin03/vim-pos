// Fase 0 · [2] Venta completa contra el Postgres EMBEBIDO (sin nube).
// Mismo patrón que tus 28 smokes (superusuario + claims JWT en el GUC), pero corriendo
// sobre el motor local: abrir turno → abrir_ticket → agregar_item → aplicar_pago → PAGADO.
// Prueba que TODA la lógica de dinero en plpgsql funciona 100% offline.
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(path.resolve(__dirname, ".."), "pgdata");
const PORT = 54329;

const database = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: "postgres", port: PORT, persistent: true });
await database.start();
const client = new pg.Client({ host: "localhost", port: PORT, user: "postgres", password: "postgres", database: "vimpos" });
await client.connect();
await client.query("SET client_encoding TO 'UTF8'");

const one = async (sql, params) => (await client.query(sql, params)).rows[0];

try {
  // Fixtures sembrados (los mismos que usa el POS del piloto).
  const tenant = (await one("SELECT id FROM tenants LIMIT 1")).id;
  const sucursal = (await one("SELECT id FROM sucursales WHERE tenant_id=$1 LIMIT 1", [tenant])).id;
  const caja = (await one("SELECT id FROM cajas WHERE sucursal_id=$1 LIMIT 1", [sucursal])).id;
  const cajero = (await one(
    "SELECT ua.usuario_id FROM usuarios_acceso ua JOIN roles r ON r.id=ua.rol_id WHERE r.codigo='CAJERO' AND ua.tenant_id=$1 LIMIT 1", [tenant])).usuario_id;
  const prod = await one("SELECT id, nombre, precio_base_mxn FROM productos WHERE tenant_id=$1 ORDER BY precio_base_mxn DESC LIMIT 1", [tenant]);
  console.log(`· tenant=${tenant.slice(0, 8)}… caja=${caja.slice(0, 8)}… cajero=${cajero.slice(0, 8)}… producto="${prod.nombre}" $${prod.precio_base_mxn}`);

  await client.query("BEGIN");
  // Claims del cajero en el GUC (como GoTrue en la nube o el pin-login local).
  const claims = JSON.stringify({ sub: cajero, tenant_id: tenant, role: "authenticated" });
  await client.query("SELECT set_config('request.jwt.claims', $1, true)", [claims]);

  // Turno abierto (fondo $500).
  await client.query("UPDATE turnos SET estado='CERRADO' WHERE caja_id=$1 AND estado='ABIERTO'", [caja]);
  const turno = (await one(
    `INSERT INTO turnos(tenant_id,sucursal_id,caja_id,codigo_turno,dia_contable,usuario_apertura_id,fondo_inicial_mxn,fondo_modo)
     VALUES($1,$2,$3,'SPIKE-F0',CURRENT_DATE,$4,500,'TOTAL') RETURNING id`, [tenant, sucursal, caja, cajero])).id;

  // Venta: 2 productos.
  const ticket = (await one(
    "SELECT abrir_ticket($1,$2,$3,'PARA_LLEVAR'::modo_servicio,NULL,NULL,$4,$5) AS id",
    [sucursal, caja, turno, "spike-f0-ticket", cajero])).id;
  await client.query("SELECT agregar_item_a_ticket($1,$2,2,NULL,'[]'::jsonb,$3)", [ticket, prod.id, "spike-f0-item"]);

  const antes = await one("SELECT folio_completo, total_mxn, estado_fiscal FROM tickets WHERE id=$1", [ticket]);
  console.log(`· ticket abierto: folio=${antes.folio_completo} total=$${antes.total_mxn} estado=${antes.estado_fiscal}`);

  // Cobro en efectivo por el total exacto.
  await client.query(
    "SELECT aplicar_pago($1,'EFECTIVO'::metodo_pago,$2,$2,NULL,NULL,NULL,false,NULL,$3)",
    [ticket, antes.total_mxn, "spike-f0-pago"]);

  const fin = await one("SELECT folio_completo, total_mxn, monto_pagado_mxn, estado_fiscal FROM tickets WHERE id=$1", [ticket]);
  await client.query("COMMIT");

  console.log(`· ticket cerrado: folio=${fin.folio_completo} total=$${fin.total_mxn} pagado=$${fin.monto_pagado_mxn} estado=${fin.estado_fiscal}`);
  if (fin.estado_fiscal !== "PAGADO") throw new Error(`esperaba PAGADO, quedó ${fin.estado_fiscal}`);
  console.log("\n✅ VENTA OK — abrir turno → ticket → ítem → pago → PAGADO, 100% sobre Postgres embebido local.");
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("\n❌ VENTA FALLÓ:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
  await database.stop();
}
