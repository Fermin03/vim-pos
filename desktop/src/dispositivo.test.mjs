import { test } from "node:test";
import assert from "node:assert/strict";
import { cajaIdDeEmail, correoAlterno, loginDispositivoNube } from "./dispositivo.mjs";

const ID = "99999999-0000-0000-0000-0000000000cc";
const VIEJO = `caja-${ID}@dispositivos.vimpos.mx`;
const NUEVO = `caja-${ID}@dispositivos.vimpos.com.mx`;

test("reconoce los dos dominios y nada más", () => {
  assert.equal(cajaIdDeEmail(VIEJO), ID);
  assert.equal(cajaIdDeEmail(NUEVO), ID);
  assert.equal(cajaIdDeEmail(`caja-${ID}@dispositivos.vimpos.com.mx.evil.com`), null);
  assert.equal(cajaIdDeEmail("dueno@knockout.dev"), null);
});

test("el correo alterno cambia de dominio en los dos sentidos", () => {
  assert.equal(correoAlterno(VIEJO), NUEVO);
  assert.equal(correoAlterno(NUEVO), VIEJO);
  assert.equal(correoAlterno("dueno@knockout.dev"), null);
});

/** Una nube de mentira que solo acepta `acepta` con la clave "x". */
function nube(acepta) {
  const vistos = [];
  const fetchImpl = async (_url, init) => {
    const { email, password } = JSON.parse(init.body);
    vistos.push(email);
    const ok = email === acepta && password === "x";
    return { json: async () => (ok ? { access_token: "tok" } : { error: "invalid_grant" }) };
  };
  return { fetchImpl, vistos };
}
const base = { cloudUrl: "https://nube", anon: "a", pass: "x" };

test("si el correo guardado entra, no se prueba otro", async () => {
  const n = nube(VIEJO);
  assert.deepEqual(await loginDispositivoNube({ ...base, email: VIEJO, fetchImpl: n.fetchImpl }), { token: "tok", email: VIEJO });
  assert.deepEqual(n.vistos, [VIEJO]);
});

test("cuenta movida al dominio nuevo: entra con él y lo devuelve para guardarlo", async () => {
  const n = nube(NUEVO);
  assert.deepEqual(await loginDispositivoNube({ ...base, email: VIEJO, fetchImpl: n.fetchImpl }), { token: "tok", email: NUEVO });
  assert.deepEqual(n.vistos, [VIEJO, NUEVO]);
});

test("clave mala: no entra con ninguno", async () => {
  const n = nube(NUEVO);
  assert.deepEqual(await loginDispositivoNube({ ...base, pass: "mala", email: VIEJO, fetchImpl: n.fetchImpl }), { token: null });
});

test("un correo que no es de caja no se reintenta", async () => {
  const n = nube("nadie");
  assert.deepEqual(await loginDispositivoNube({ ...base, email: "dueno@knockout.dev", fetchImpl: n.fetchImpl }), { token: null });
  assert.deepEqual(n.vistos, ["dueno@knockout.dev"]);
});

test("un error de red se propaga (no es un rechazo)", async () => {
  const fetchImpl = async () => { throw new Error("sin red"); };
  await assert.rejects(loginDispositivoNube({ ...base, email: VIEJO, fetchImpl }), /sin red/);
});
