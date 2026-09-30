// Auditoría integral 30/09/2026, D2 — el login local solo acepta cuentas de DISPOSITIVO.
//
// Contra un Postgres con el esquema y el seed de desarrollo (supabase/seed.sql: caja de
// Knock-Out y el dueño dueno@knockout.dev; las claves se leen del seed). Se activa con
// VIM_TEST_PG (superusuario) y VIM_TEST_PG_PLANTILLA (BD con shim + migraciones + seed); sin
// ellas se salta.
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import jwt from "jsonwebtoken";
import { readFileSync } from "node:fs";
import { deviceSignIn, refreshSession } from "./auth.mjs";

const URL_ADMIN = process.env.VIM_TEST_PG;
const PLANTILLA = process.env.VIM_TEST_PG_PLANTILLA;
const omitir = !URL_ADMIN || !PLANTILLA ? "sin VIM_TEST_PG/VIM_TEST_PG_PLANTILLA" : false;
const SECRET = "x".repeat(40);
const CAJA = "caja-99999999-0000-0000-0000-0000000000cc@dispositivos.vimpos.com.mx";
// Las claves del fixture salen de supabase/seed.sql, que es donde se definen: una sola fuente, y
// sin literales con cara de contraseña en las pruebas (los escáneres de secretos los marcan).
const SEED = readFileSync(new URL("../../supabase/seed.sql", import.meta.url), "utf8");
const CLAVE_CAJA = SEED.match(/v_disp_email,\s*crypt\('([^']+)'/)[1];
const CLAVE_DUENO = SEED.match(/'dueno@knockout\.dev',\s*crypt\('([^']+)'/)[1];

async function conPool(fn) {
  const u = new URL(URL_ADMIN);
  u.pathname = `/${PLANTILLA}`;
  const pool = new pg.Pool({ connectionString: u.toString(), max: 2 });
  try { await fn(pool); } finally { await pool.end(); }
}

test("la cuenta de la caja entra con su clave", { skip: omitir }, async () => {
  await conPool(async (pool) => {
    const r = await deviceSignIn(pool, SECRET, { email: CAJA, password: CLAVE_CAJA });
    assert.equal(r.error, undefined, JSON.stringify(r.body));
    assert.equal(r.body.user.app_metadata.tipo_identidad, "DISPOSITIVO");
    // Y con el dominio viejo (el POS puede traer apuntado el anterior).
    const viejo = await deviceSignIn(pool, SECRET, { email: CAJA.replace(".com.mx", ".mx"), password: CLAVE_CAJA });
    assert.equal(viejo.error, undefined);
  });
});

test("el dueño NO puede entrar al login local con su correo y contraseña (aunque sean correctos)", { skip: omitir }, async () => {
  await conPool(async (pool) => {
    const r = await deviceSignIn(pool, SECRET, { email: "dueno@knockout.dev", password: CLAVE_DUENO });
    assert.equal(r.error, 400);
    assert.equal(r.body.error, "invalid_grant");
  });
});

test("un refresh acuñado para un humano ya no se renueva", { skip: omitir }, async () => {
  await conPool(async (pool) => {
    const { rows } = await pool.query("SELECT id FROM auth.users WHERE email = 'dueno@knockout.dev'");
    const refresh = jwt.sign({ sub: rows[0].id, typ: "refresh" }, SECRET, { algorithm: "HS256", expiresIn: "7d" });
    const r = await refreshSession(pool, SECRET, refresh);
    assert.equal(r.error, 400);
  });
});

test("credenciales que no son texto no llegan a la BD", async () => {
  const pool = { query: async () => { throw new Error("no debió consultar"); } };
  assert.equal((await deviceSignIn(pool, SECRET, { email: ["a"], password: "x" })).error, 400);
  assert.equal((await deviceSignIn(pool, SECRET, {})).error, 400);
});

test("autorizar-pin: un supervisor bloqueado ('BLOQUEADO' de verificar_autorizacion_pin) sale 423, no 401", async () => {
  const { autorizarPin } = await import("./auth.mjs");
  const pool = { query: async () => ({ rows: [{ r: { ok: false, motivo: "BLOQUEADO" } }] }) };
  const tok = jwt.sign({ sub: "u1", role: "authenticated" }, SECRET, { algorithm: "HS256", expiresIn: 60 });
  const r = await autorizarPin(pool, SECRET, tok, { pin: "1234", accion: "CANCELAR", permiso_codigo: "x", caja_id: "c" });
  assert.equal(r.error, 423);
  assert.equal(r.body.error, "BLOQUEADO");
});
