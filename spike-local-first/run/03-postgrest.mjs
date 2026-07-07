// Fase 0 · [3] La ruta de datos REAL del POS, 100% local.
// PostgREST (lo mismo que usa Supabase por dentro) contra el Postgres embebido +
// un JWT firmado localmente. Hace una venta por REST como rol `authenticated`, o sea
// con RLS + auth de verdad: es EXACTAMENTE lo que hoy hace supabase-js contra la nube,
// pero apuntando a localhost. Prueba que el POS corre offline cambiando solo la URL.
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import jwt from "jsonwebtoken";
import { spawn } from "node:child_process";
import { writeFileSync, openSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "pgdata");
const PG_PORT = 54329;
const REST_PORT = 54331; // 54321 lo ocupa el Supabase local (Docker) del entorno de dev.
const SECRET = "spike-fase0-jwt-secret-local-de-32+chars-abc";
const REST = `http://localhost:${REST_PORT}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const database = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: "postgres", port: PG_PORT, persistent: true });
let rest;
let admin;

async function post(pathname, body, token) {
  const r = await fetch(`${REST}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`POST ${pathname} → ${r.status} ${txt}`);
  return txt ? JSON.parse(txt) : null;
}
async function get(pathname, token) {
  const r = await fetch(`${REST}${pathname}`, { headers: { Authorization: `Bearer ${token}` } });
  const txt = await r.text();
  if (!r.ok) throw new Error(`GET ${pathname} → ${r.status} ${txt}`);
  return JSON.parse(txt);
}

try {
  await database.start();
  // --- Setup mínimo por conexión directa (fixture ids + turno abierto) ---
  admin = new pg.Client({ host: "localhost", port: PG_PORT, user: "postgres", password: "postgres", database: "vimpos" });
  admin.on("error", () => {});
  await admin.connect();
  await admin.query("SET client_encoding TO 'UTF8'");
  const q = async (sql, p) => (await admin.query(sql, p)).rows[0];
  const tenant = (await q("SELECT id FROM tenants LIMIT 1")).id;
  const sucursal = (await q("SELECT id FROM sucursales WHERE tenant_id=$1 LIMIT 1", [tenant])).id;
  const caja = (await q("SELECT id FROM cajas WHERE sucursal_id=$1 LIMIT 1", [sucursal])).id;
  const cajero = (await q("SELECT ua.usuario_id FROM usuarios_acceso ua JOIN roles r ON r.id=ua.rol_id WHERE r.codigo='CAJERO' AND ua.tenant_id=$1 LIMIT 1", [tenant])).usuario_id;
  // Reusar un turno ABIERTO si existe (evita el trigger de cierre que exige fecha_cierre).
  const abierto = await q("SELECT id FROM turnos WHERE caja_id=$1 AND estado='ABIERTO' ORDER BY fecha_apertura DESC LIMIT 1", [caja]);
  const turno = abierto ? abierto.id : (await q(
    `INSERT INTO turnos(tenant_id,sucursal_id,caja_id,codigo_turno,dia_contable,usuario_apertura_id,fondo_inicial_mxn,fondo_modo)
     VALUES($1,$2,$3,'SPIKE-REST',CURRENT_DATE,$4,500,'TOTAL') RETURNING id`, [tenant, sucursal, caja, cajero])).id;
  await admin.end();
  admin = null;

  // --- Arrancar PostgREST ---
  const confPath = path.join(root, "bin", "postgrest.conf");
  writeFileSync(confPath, [
    `db-uri = "postgres://authenticator:postgres@localhost:${PG_PORT}/vimpos"`,
    `db-schemas = "public"`,
    `db-anon-role = "anon"`,
    `jwt-secret = "${SECRET}"`,
    `server-port = ${REST_PORT}`,
    ``,
  ].join("\n"));
  const logPath = path.join(root, "bin", "postgrest.log");
  const logFd = openSync(logPath, "w");
  // PostgREST enlaza libpq.dll dinámicamente; se la damos desde el propio Postgres embebido.
  const pgBin = path.join(root, "node_modules", "@embedded-postgres", "windows-x64", "native", "bin");
  rest = spawn(path.join(root, "bin", "postgrest.exe"), [confPath], {
    stdio: ["ignore", logFd, logFd],
    env: { ...process.env, PATH: `${pgBin}${path.delimiter}${process.env.PATH}` },
  });
  globalThis.__logPath = logPath;

  // Esperar a que PostgREST responda.
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${REST}/`); if (r.status < 500) { ready = true; break; } } catch { /* aún no */ }
    await sleep(500);
  }
  if (!ready) throw new Error("PostgREST no respondió en 20s");
  console.log(`· PostgREST arriba en ${REST} contra el Postgres embebido`);

  // JWT del cajero firmado localmente (lo que hará el pin-login local en Fase 1).
  const token = jwt.sign({ role: "authenticated", sub: cajero, tenant_id: tenant }, SECRET, { algorithm: "HS256", expiresIn: "1h" });

  // 1) LECTURA con RLS: solo debe ver productos de SU tenant.
  const productos = await get(`/productos?select=id,nombre,precio_base_mxn&order=precio_base_mxn.desc`, token);
  console.log(`· GET /productos (RLS) → ${productos.length} productos del tenant; top: "${productos[0].nombre}" $${productos[0].precio_base_mxn}`);
  const prod = productos[0];

  // 2) VENTA por RPC (idéntico a supabase.rpc(...) del POS).
  const ticketId = await post(`/rpc/abrir_ticket`, {
    p_sucursal_id: sucursal, p_caja_id: caja, p_turno_id: turno, p_modo_servicio: "PARA_LLEVAR",
    p_cliente_id: null, p_marca_virtual_id: null, p_client_id_local: "spike-rest-ticket", p_usuario_id: cajero,
  }, token);
  await post(`/rpc/agregar_item_a_ticket`, {
    p_ticket_id: ticketId, p_producto_id: prod.id, p_cantidad: 2, p_nota_cocina: null, p_modificadores: [], p_client_id_local: "spike-rest-item",
  }, token);

  const [antes] = await get(`/tickets?id=eq.${ticketId}&select=folio_completo,total_mxn,estado_fiscal`, token);
  console.log(`· ticket por REST: folio=${antes.folio_completo} total=$${antes.total_mxn} estado=${antes.estado_fiscal}`);

  await post(`/rpc/aplicar_pago`, {
    p_ticket_id: ticketId, p_metodo_pago: "EFECTIVO", p_monto_mxn: antes.total_mxn, p_monto_recibido_mxn: antes.total_mxn,
    p_es_pago_al_recibir: false, p_client_id_local: "spike-rest-pago",
  }, token);

  const [fin] = await get(`/tickets?id=eq.${ticketId}&select=folio_completo,total_mxn,monto_pagado_mxn,estado_fiscal`, token);
  console.log(`· ticket cerrado por REST: folio=${fin.folio_completo} pagado=$${fin.monto_pagado_mxn} estado=${fin.estado_fiscal}`);
  if (fin.estado_fiscal !== "PAGADO") throw new Error(`esperaba PAGADO, quedó ${fin.estado_fiscal}`);

  console.log("\n✅ POSTGREST OK — venta completa por REST (RLS + JWT + RPC) contra el Postgres embebido. Es la ruta real del POS, en localhost.");
} catch (e) {
  console.error("\n❌ POSTGREST FALLÓ:", e.message);
  try { console.error("--- log PostgREST ---\n" + readFileSync(globalThis.__logPath, "utf8").split("\n").slice(-20).join("\n")); } catch { /* */ }
  process.exitCode = 1;
} finally {
  if (admin) await admin.end().catch(() => {});
  if (rest) rest.kill();
  await database.stop();
}
