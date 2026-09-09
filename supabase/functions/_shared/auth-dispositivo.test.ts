// Pruebas de la verificación local del token de dispositivo.
//
// Las que de verdad importan aquí son las de ataque: si esto acepta un token que no debería, se
// abre la puerta a subir ventas y bajar el catálogo de CUALQUIER tenant. Antes de este módulo la
// firma la validaba GoTrue en cada llamada; ahora la validamos nosotros, así que la trampa
// clásica —cambiar el algoritmo a "none" y quitar la firma— tiene que estar cubierta por prueba.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  crearVerificadorDispositivo, identidadDeDispositivo, verificarHS256,
} from "./auth-dispositivo.ts";

const SECRETO = "un-secreto-de-pruebas-de-al-menos-32-caracteres";
const OTRO_SECRETO = "otro-secreto-distinto-de-al-menos-32-caracteres";
const CAJA = "99999999-0000-0000-0000-0000000000cc";
const TENANT = "11111111-2222-3333-4444-555555555555";

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const texto = (s: string) => b64url(new TextEncoder().encode(s));

/** Firma un JWT de verdad, para no probar contra un doble que no comparte la criptografía. */
async function firmar(carga: Record<string, unknown>, secreto = SECRETO, cabecera = { alg: "HS256", typ: "JWT" }) {
  const cuerpo = `${texto(JSON.stringify(cabecera))}.${texto(JSON.stringify(carga))}`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const firma = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(cuerpo)));
  return `${cuerpo}.${b64url(firma)}`;
}

const dentroDeUnaHora = () => Math.floor(Date.now() / 1000) + 3600;
const cargaValida = (extra: Record<string, unknown> = {}) => ({
  sub: "aaaaaaaa-0000-0000-0000-00000000aaaa",
  email: `caja-${CAJA}@dispositivos.vimpos.mx`,
  aud: "authenticated",
  role: "authenticated",
  tenant_id: TENANT,
  tipo_identidad: "DISPOSITIVO",
  exp: dentroDeUnaHora(),
  ...extra,
});

// ── Firma ────────────────────────────────────────────────────────────────────

test("acepta un token bien firmado y devuelve sus claims", async () => {
  const carga = await verificarHS256(await firmar(cargaValida()), SECRETO);
  assert.equal(carga?.tenant_id, TENANT);
  assert.equal(carga?.tipo_identidad, "DISPOSITIVO");
});

test("rechaza un token al que le cambiaron la carga después de firmarlo", async () => {
  const bueno = await firmar(cargaValida());
  const [cab, , firma] = bueno.split(".");
  const otroTenant = texto(JSON.stringify(cargaValida({ tenant_id: "00000000-0000-0000-0000-000000000000" })));
  assert.equal(await verificarHS256(`${cab}.${otroTenant}.${firma}`, SECRETO), null);
});

test("rechaza un token firmado con otro secreto", async () => {
  assert.equal(await verificarHS256(await firmar(cargaValida(), OTRO_SECRETO), SECRETO), null);
});

test("rechaza el truco de alg:none — sin firma no se entra", async () => {
  const carga = cargaValida();
  const sinFirma = `${texto(JSON.stringify({ alg: "none", typ: "JWT" }))}.${texto(JSON.stringify(carga))}.`;
  assert.equal(await verificarHS256(sinFirma, SECRETO), null);
});

test("rechaza un algoritmo que no sea HS256, aunque la firma cuadre", async () => {
  // Firmado con HMAC de verdad pero anunciando otro alg: si no se comprobara la cabecera, esto
  // pasaría y abriría la puerta a confusión de algoritmos.
  const token = await firmar(cargaValida(), SECRETO, { alg: "RS256", typ: "JWT" });
  assert.equal(await verificarHS256(token, SECRETO), null);
});

test("rechaza un token expirado", async () => {
  const token = await firmar(cargaValida({ exp: Math.floor(Date.now() / 1000) - 1 }));
  assert.equal(await verificarHS256(token, SECRETO), null);
});

test("rechaza un token sin exp: un token eterno no existe", async () => {
  const carga = cargaValida();
  delete (carga as Record<string, unknown>).exp;
  assert.equal(await verificarHS256(await firmar(carga), SECRETO), null);
});

test("rechaza basura sin reventar", async () => {
  for (const basura of ["", "no-es-un-token", "a.b", "a.b.c.d", "...", "a.b.c"]) {
    assert.equal(await verificarHS256(basura, SECRETO), null, `con "${basura}"`);
  }
});

// ── Identidad ────────────────────────────────────────────────────────────────

test("saca tenant y caja de un token de dispositivo", () => {
  const d = identidadDeDispositivo(cargaValida());
  assert.equal(d?.tenantId, TENANT);
  assert.equal(d?.cajaId, CAJA);
});

test("un token de empleado no es un dispositivo", () => {
  assert.equal(identidadDeDispositivo(cargaValida({ tipo_identidad: "EMPLEADO" })), null);
});

test("sin tenant_id no hay identidad: el RLS no tendría por dónde acotar", () => {
  const carga = cargaValida();
  delete (carga as Record<string, unknown>).tenant_id;
  assert.equal(identidadDeDispositivo(carga), null);
});

test("un correo que no es de dispositivo no da caja", () => {
  assert.equal(identidadDeDispositivo(cargaValida({ email: "dueno@negocio.mx" })), null);
});

// ── Verificador completo ─────────────────────────────────────────────────────

test("el verificador dice POR QUÉ falló, para que cada función conteste como siempre", async () => {
  const verificar = crearVerificadorDispositivo(SECRETO);
  assert.equal((await verificar("")).motivo, "SIN_TOKEN");
  assert.equal((await verificar(await firmar(cargaValida(), OTRO_SECRETO))).motivo, "AUTH_INVALIDA");
  assert.equal((await verificar(await firmar(cargaValida({ tipo_identidad: "EMPLEADO" })))).motivo, "NO_ES_DISPOSITIVO");
});

test("el verificador acepta el token bueno y entrega la identidad", async () => {
  const verificar = crearVerificadorDispositivo(SECRETO);
  const r = await verificar(await firmar(cargaValida()));
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.cajaId, CAJA);
  assert.equal(r.ok && r.tenantId, TENANT);
});

test("el verificador quita el prefijo Bearer", async () => {
  const verificar = crearVerificadorDispositivo(SECRETO);
  const r = await verificar(`Bearer ${await firmar(cargaValida())}`);
  assert.equal(r.ok, true);
});

test("el fallo trae ya el código y el texto con los que contesta la función", async () => {
  const verificar = crearVerificadorDispositivo(SECRETO);
  const sinToken = await verificar("");
  assert.deepEqual(sinToken, { ok: false, motivo: "SIN_TOKEN", status: 401, error: "NO_AUTH" });

  const malaFirma = await verificar(await firmar(cargaValida(), OTRO_SECRETO));
  assert.equal(malaFirma.ok, false);
  assert.equal(!malaFirma.ok && malaFirma.status, 401, "401 para que la caja pida token nuevo");

  const empleado = await verificar(await firmar(cargaValida({ tipo_identidad: "EMPLEADO" })));
  assert.equal(!empleado.ok && empleado.status, 403, "403 para que la caja deje de insistir");
  assert.equal(!empleado.ok && empleado.error, "NO_ES_DISPOSITIVO");
});

test("el fallo distingue firma de vencimiento: es lo que faltó para diagnosticar el 6 de septiembre", async () => {
  const verificar = crearVerificadorDispositivo(SECRETO);
  const vencido = await verificar(await firmar(cargaValida({ exp: Math.floor(Date.now() / 1000) - 5 })));
  assert.match(!vencido.ok ? vencido.detalle ?? "" : "", /vencid/i);

  const malaFirma = await verificar(await firmar(cargaValida(), OTRO_SECRETO));
  assert.match(!malaFirma.ok ? malaFirma.detalle ?? "" : "", /firma/i);
});

test("cuando la identidad no cuadra, el fallo dice QUÉ claim faltó", async () => {
  const verificar = crearVerificadorDispositivo(SECRETO);
  const sinEmail = cargaValida();
  delete (sinEmail as Record<string, unknown>).email;
  const r = await verificar(await firmar(sinEmail));
  assert.equal(!r.ok && r.error, "NO_ES_DISPOSITIVO");
  assert.match(!r.ok ? r.detalle ?? "" : "", /email/i);

  const sinTenant = cargaValida();
  delete (sinTenant as Record<string, unknown>).tenant_id;
  assert.match(!(await verificar(await firmar(sinTenant))).ok ? (await verificar(await firmar(sinTenant)) as { detalle?: string }).detalle ?? "" : "", /tenant_id/i);

  const empleado = await verificar(await firmar(cargaValida({ tipo_identidad: "EMPLEADO" })));
  assert.match(!empleado.ok ? empleado.detalle ?? "" : "", /tipo_identidad/i);
});

test("el correo tiene que ser del dominio de dispositivos, como en el resto del repo", () => {
  // latido.ts, pin-login y desktop/src/auth.mjs anclan los tres al dominio. Sin el anclaje, un
  // correo con la forma `caja-<uuid>@lo-que-sea` daría caja: hoy nadie puede provocarlo
  // (provisionar-dispositivo genera el correo server-side), pero es una capa que el repo ya
  // tenía y no hay motivo para perderla aquí.
  assert.equal(identidadDeDispositivo(cargaValida({ email: `caja-${CAJA}@otro-dominio.com` })), null);
  assert.equal(identidadDeDispositivo(cargaValida({ email: `caja-${CAJA}@dispositivos.vimpos.mx.malo.com` })), null);
  assert.equal(identidadDeDispositivo(cargaValida())?.cajaId, CAJA, "el dominio bueno sigue pasando");
});
