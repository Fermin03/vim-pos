// El puente de lealtad, probado sin red y sin Postgres. Lo que importa es la política: qué se
// reenvía, qué se asienta en local, con los datos de quién, y qué se anota en la libreta.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { atenderLealtad, ERRORES_DE_ASENTAR } from "./lealtad-puente.mjs";

const NUBE = { cloudUrl: "https://nube.test", anonKey: "anon", deviceToken: "disp" };
const EMPLEADO = "22222222-2222-4222-8222-222222222222";
const TENANT = "99999999-0000-0000-0000-0000000000aa";
const sinLog = () => {};

function poolFalso() {
  const consultas = [];
  return { consultas, query: async (sql, params) => { consultas.push({ sql, params }); return { rows: [{ r: "ok" }], rowCount: 1 }; } };
}
function nubeFalsa(respuestas) {
  const llamadas = [];
  const fetchFalso = async (url, init) => {
    const cuerpo = JSON.parse(init.body);
    llamadas.push({ url, cuerpo, auth: init.headers.Authorization });
    const r = respuestas[cuerpo.accion] ?? { status: 500, json: { error: "SIN_GUION" } };
    return { status: r.status, ok: r.status < 300, text: async () => JSON.stringify(r.json), json: async () => r.json };
  };
  return { llamadas, fetchFalso };
}
const args = (extra) => ({ nube: NUBE, usuarioId: EMPLEADO, tenantId: TENANT, tipoIdentidad: "EMPLEADO", log: sinLog, ...extra });

test("canjear se reenvía con el token del dispositivo y el empleado de la sesión local", async () => {
  const pool = poolFalso();
  const { llamadas, fetchFalso } = nubeFalsa({ canjear: { status: 200, json: { ok: true, canje_id: "c1", saldo: 60 } } });
  const r = await atenderLealtad(args({ pool, fetchFn: fetchFalso, cuerpo: { accion: "canjear", canje_id: "c1", puntos: 40, ticket_id: "t1", usuario_id: "suplantado" } }));
  assert.equal(r.status, 200);
  assert.equal(llamadas[0].url, "https://nube.test/functions/v1/lealtad-canje");
  assert.equal(llamadas[0].auth, "Bearer disp");
  assert.equal(llamadas[0].cuerpo.usuario_id, EMPLEADO, "el empleado sale de la sesión local, no del navegador");
  assert.equal(pool.consultas.length, 0, "canjear no toca la base local");
});

test("saldo también se reenvía con el token del dispositivo y el empleado de la sesión local", async () => {
  const { llamadas, fetchFalso } = nubeFalsa({ saldo: { status: 200, json: { ok: true, saldo: 60 } } });
  const r = await atenderLealtad(args({ pool: poolFalso(), fetchFn: fetchFalso, cuerpo: { accion: "saldo", telefono: "4770001234", usuario_id: "suplantado" } }));
  assert.equal(r.status, 200);
  assert.equal(llamadas[0].auth, "Bearer disp");
  assert.deepEqual(llamadas[0].cuerpo, { accion: "saldo", telefono: "4770001234", usuario_id: EMPLEADO });
});

test("a la nube no viaja sucursal, caja ni tenant del navegador: los pone la identidad del dispositivo", async () => {
  const pool = poolFalso();
  const { llamadas, fetchFalso } = nubeFalsa({ canjear: { status: 200, json: { ok: true, canje_id: "c1" } } });
  await atenderLealtad(args({
    pool, fetchFn: fetchFalso,
    cuerpo: { accion: "canjear", canje_id: "c1", puntos: 5, ticket_id: "t1", sucursal_id: "otra", caja_id: "otra", tenant_id: "otro", tenant: "otro", monto_mxn: 1 },
  }));
  assert.deepEqual(llamadas[0].cuerpo, { accion: "canjear", canje_id: "c1", puntos: 5, ticket_id: "t1", usuario_id: EMPLEADO });
});

test("asentar pregunta a la nube y asienta en local CON SUS DATOS, no con los del navegador", async () => {
  const pool = poolFalso();
  const deLaNube = { ok: true, canje_id: "c1", ticket_id: "t1", caja_id: "cj1", cliente_id: "cli-real", telefono: "4771112233", puntos: 40, monto_mxn: 40, premio_id: null, programa_version: 3 };
  const { llamadas, fetchFalso } = nubeFalsa({ asentar: { status: 200, json: deLaNube } });
  const r = await atenderLealtad(args({
    pool, fetchFn: fetchFalso,
    cuerpo: {
      accion: "asentar", canje_id: "c1", ticket_id: "t1", ticket_item_id: "i1",
      puntos: 9999, monto_mxn: 9999, cliente_id: "otro", telefono: "0000000000", premio_id: "p-falso", programa_version: 99,
      tenant_id: "otro-tenant", usuario_id: "suplantado",
    },
  }));
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, canje_id: "c1" });
  assert.equal(llamadas.length, 1);
  assert.deepEqual(llamadas[0].cuerpo, { accion: "asentar", canje_id: "c1", ticket_id: "t1", ticket_item_id: "i1", usuario_id: EMPLEADO });
  const asiento = pool.consultas.find((c) => /lealtad_asentar_canje/.test(c.sql));
  const asentado = JSON.parse(asiento.params[0]);
  assert.deepEqual(asentado, {
    canje_id: "c1", cliente_id: "cli-real", telefono: "4771112233", puntos: 40, monto_mxn: 40, premio_id: null,
    programa_version: 3, tenant_id: TENANT, usuario_id: EMPLEADO, ticket_id: "t1", ticket_item_id: "i1",
  });
  const marca = pool.consultas.find((c) => /INSERT INTO _vim_lealtad_mov_ok/.test(c.sql));
  assert.ok(marca, "la copia local del canje se anota como ya subida");
  assert.deepEqual(marca.params, [["c1"]]);
  assert.ok(pool.consultas.indexOf(marca) > pool.consultas.indexOf(asiento), "se anota DESPUÉS de asentar");
});

test("si la nube no reconoce el canje, no se asienta nada", async () => {
  const pool = poolFalso();
  const { fetchFalso } = nubeFalsa({ asentar: { status: 409, json: { ok: false, error: "CANJE_NO_EXISTE" } } });
  const r = await atenderLealtad(args({ pool, fetchFn: fetchFalso, cuerpo: { accion: "asentar", canje_id: "falso", ticket_id: "t1" } }));
  assert.equal(r.status, 409);
  assert.equal(r.body.error, "CANJE_NO_EXISTE");
  assert.equal(pool.consultas.length, 0);
});

test("si la nube contesta otro canje distinto al pedido, no se asienta nada", async () => {
  const pool = poolFalso();
  const { fetchFalso } = nubeFalsa({ asentar: { status: 200, json: { ok: true, canje_id: "otro", ticket_id: "t1", cliente_id: "c", puntos: 5, monto_mxn: 5, programa_version: 1 } } });
  const r = await atenderLealtad(args({ pool, fetchFn: fetchFalso, cuerpo: { accion: "asentar", canje_id: "c1", ticket_id: "t1" } }));
  assert.equal(r.status, 502);
  assert.equal(pool.consultas.length, 0);
});

test("una acción desconocida no sale a la nube", async () => {
  const r = await atenderLealtad(args({ pool: poolFalso(), cuerpo: { accion: "regalar" }, fetchFn: async () => { throw new Error("no debe llamarse"); } }));
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "ACCION_INVALIDA");
});

test("sin nube o sin red responde 503 con el vocabulario del gateway", async () => {
  const pool = poolFalso();
  const sinNube = await atenderLealtad(args({ pool, nube: null, cuerpo: { accion: "saldo" }, fetchFn: async () => { throw new Error("no debe llamarse"); } }));
  assert.equal(sinNube.status, 503);
  assert.equal(sinNube.body.error, "FUNCION_REQUIERE_NUBE");
  const sinRed = await atenderLealtad(args({ pool, cuerpo: { accion: "saldo" }, fetchFn: async () => { throw new Error("ECONNRESET"); } }));
  assert.equal(sinRed.status, 503);
  assert.equal(sinRed.body.error, "SIN_RED");
  assert.equal(JSON.stringify(sinRed.body).includes("ECONNRESET"), false, "el detalle técnico no llega al navegador");
});

const respuestaDeLaNube = { asentar: { status: 200, json: { ok: true, canje_id: "c1", ticket_id: "t1", cliente_id: "cli", puntos: 5, monto_mxn: 5, programa_version: 1 } } };

test("un código de negocio al asentar en local da 409 y no se anota la libreta", async () => {
  const consultas = [];
  const pool = { query: async (sql) => { consultas.push(sql); throw new Error("TICKET_NO_ABIERTO"); } };
  const { fetchFalso } = nubeFalsa(respuestaDeLaNube);
  const r = await atenderLealtad(args({ pool, fetchFn: fetchFalso, cuerpo: { accion: "asentar", canje_id: "c1", ticket_id: "t1" } }));
  assert.equal(r.status, 409);
  assert.equal(r.body.error, "TICKET_NO_ABIERTO");
  assert.equal(consultas.length, 1, "no llegó a tocar la libreta");
});

test("cada código que lealtad_asentar_canje lanza es un 409, también los que el brief original no listaba", async () => {
  for (const codigo of ERRORES_DE_ASENTAR) {
    const pool = { query: async () => { throw new Error(codigo); } };
    const { fetchFalso } = nubeFalsa(respuestaDeLaNube);
    const r = await atenderLealtad(args({ pool, fetchFn: fetchFalso, cuerpo: { accion: "asentar", canje_id: "c1", ticket_id: "t1" } }));
    assert.deepEqual([r.status, r.body], [409, { ok: false, error: codigo }], codigo);
  }
});

test("un error que no es un código: 500 genérico, sin el mensaje de SQL en la respuesta, y al log", async () => {
  const consultas = [];
  const pool = { query: async (sql) => { consultas.push(sql); throw new Error('duplicate key value violates "ticket_canjes_lealtad_pkey"'); } };
  const { fetchFalso } = nubeFalsa(respuestaDeLaNube);
  const logs = [];
  const r = await atenderLealtad(args({ pool, fetchFn: fetchFalso, log: (m) => logs.push(m), cuerpo: { accion: "asentar", canje_id: "c1", ticket_id: "t1" } }));
  assert.equal(r.status, 500);
  assert.deepEqual(r.body, { error: "ERROR_INTERNO" });
  assert.equal(consultas.length, 1);
  assert.match(logs.join("\n"), /duplicate key/);
});

test("un mensaje que solo CONTIENE un código no se toma por código de negocio", async () => {
  const pool = { query: async () => { throw new Error("syntax error near TICKET_NO_ABIERTO"); } };
  const { fetchFalso } = nubeFalsa(respuestaDeLaNube);
  const r = await atenderLealtad(args({ pool, fetchFn: fetchFalso, cuerpo: { accion: "asentar", canje_id: "c1", ticket_id: "t1" } }));
  assert.equal(r.status, 500);
});

test("si falla la libreta tras asentar, la venta no se cae (el asiento ya quedó)", async () => {
  const pool = { query: async (sql) => { if (/_vim_lealtad_mov_ok/.test(sql)) throw new Error("disco lleno"); return { rows: [], rowCount: 0 }; } };
  const { fetchFalso } = nubeFalsa(respuestaDeLaNube);
  const r = await atenderLealtad(args({ pool, fetchFn: fetchFalso, cuerpo: { accion: "asentar", canje_id: "c1", ticket_id: "t1" } }));
  assert.equal(r.status, 200);
});

test("ERRORES_DE_ASENTAR contiene exactamente los códigos que lealtad_asentar_canje lanza en el SQL", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/0156_lealtad.sql", import.meta.url), "utf8");
  const ini = sql.indexOf("CREATE OR REPLACE FUNCTION lealtad_asentar_canje(");
  assert.ok(ini > 0, "no se encontró la función en la migración");
  const cuerpo = sql.slice(ini, sql.indexOf("END $$;", ini));
  const delSql = new Set([...cuerpo.matchAll(/RAISE EXCEPTION '([A-Z_]+)'/g)].map((m) => m[1]));
  assert.ok(delSql.size >= 10, "la extracción no encontró los códigos");
  assert.deepEqual([...ERRORES_DE_ASENTAR].sort(), [...delSql].sort());
});

test("una sesión de DISPOSITIVO no canjea: 403 en cada acción, sin tocar la nube ni la base", async () => {
  for (const accion of ["saldo", "canjear", "asentar"]) {
    const pool = poolFalso();
    let fetches = 0;
    const r = await atenderLealtad(args({
      pool, tipoIdentidad: "DISPOSITIVO", fetchFn: async () => { fetches++; throw new Error("no debe llamarse"); },
      cuerpo: { accion, canje_id: "c1", ticket_id: "t1", telefono: "4770001234", puntos: 5 },
    }));
    assert.deepEqual([r.status, r.body], [403, { error: "SOLO_EMPLEADO" }], accion);
    assert.equal(fetches, 0, accion);
    assert.equal(pool.consultas.length, 0, accion);
  }
  for (const t of [undefined, null, "", "empleado"]) {
    const r = await atenderLealtad(args({ pool: poolFalso(), tipoIdentidad: t, cuerpo: { accion: "saldo" }, fetchFn: async () => { throw new Error("no"); } }));
    assert.equal(r.status, 403, String(t));
  }
});

test("asentar: si la cuenta de la nube no es la que se está asentando en local, no se asienta nada", async () => {
  const pool = poolFalso();
  const { fetchFalso } = nubeFalsa({ asentar: { status: 200, json: { ok: true, canje_id: "c1", ticket_id: "otra", cliente_id: "c", puntos: 5, monto_mxn: 5, programa_version: 1 } } });
  const r = await atenderLealtad(args({ pool, fetchFn: fetchFalso, cuerpo: { accion: "asentar", canje_id: "c1", ticket_id: "t1" } }));
  assert.equal(r.status, 502);
  assert.equal(pool.consultas.length, 0);
  const sin = nubeFalsa({ asentar: { status: 200, json: { ok: true, canje_id: "c1", cliente_id: "c", puntos: 5, monto_mxn: 5, programa_version: 1 } } });
  const r2 = await atenderLealtad(args({ pool, fetchFn: sin.fetchFalso, cuerpo: { accion: "asentar", canje_id: "c1", ticket_id: "t1" } }));
  assert.equal(r2.status, 502, "una respuesta sin ticket_id tampoco");
  assert.equal(pool.consultas.length, 0);
});

test("asentar: los ids se comparan sin distinguir mayúsculas", async () => {
  const pool = poolFalso();
  const { fetchFalso } = nubeFalsa({ asentar: { status: 200, json: { ok: true, canje_id: "abc-1", ticket_id: "abc-2", cliente_id: "c", puntos: 5, monto_mxn: 5, programa_version: 1 } } });
  const r = await atenderLealtad(args({ pool, fetchFn: fetchFalso, cuerpo: { accion: "asentar", canje_id: "ABC-1", ticket_id: "ABC-2" } }));
  assert.equal(r.status, 200);
  const asentado = JSON.parse(pool.consultas.find((c) => /lealtad_asentar_canje/.test(c.sql)).params[0]);
  assert.equal(asentado.ticket_id, "abc-2");
  assert.equal(asentado.canje_id, "abc-1");
});

test("un corte a media respuesta es SIN_RED; un 200 que no es JSON es RESPUESTA_INVALIDA", async () => {
  const cortada = async () => ({ status: 200, text: async () => { throw new Error("socket hang up"); } });
  const r1 = await atenderLealtad(args({ pool: poolFalso(), fetchFn: cortada, cuerpo: { accion: "saldo" } }));
  assert.deepEqual([r1.status, r1.body], [503, { error: "SIN_RED" }]);
  const html = async () => ({ status: 200, text: async () => "<html>proxy</html>" });
  const r2 = await atenderLealtad(args({ pool: poolFalso(), fetchFn: html, cuerpo: { accion: "saldo" } }));
  assert.deepEqual([r2.status, r2.body], [502, { error: "RESPUESTA_INVALIDA" }]);
});
