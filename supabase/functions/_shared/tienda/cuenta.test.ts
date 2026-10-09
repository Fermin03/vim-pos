import { test } from "node:test";
import assert from "node:assert/strict";
import { cuentaDe, cuentaPublica, direccionesPublicas, leerRegistro, leerSesion, pedidosPublicos } from "./cuenta.ts";

const TOKEN = "Ab3_-".repeat(4) + "Zz";   // 22 caracteres con la forma de un código
const CUENTA = { nombre: "Ana", apellido: "López", email: "ana@example.com", telefono: "4771112233", fecha_nacimiento: "1990-05-17" };
const ID = "11111111-2222-3333-4444-555555555555";

// ── La sesión de la cabecera ────────────────────────────────────────────────────────────────────
test("sesión: sin cabecera o vacía es «sin»", () => {
  for (const v of [null, "", "   "]) assert.deepEqual(leerSesion(v), { estado: "sin" }, JSON.stringify(v));
});
test("sesión: 22 caracteres con forma de código es «ok» y trae el token tal cual", () => {
  assert.deepEqual(leerSesion(TOKEN), { estado: "ok", token: TOKEN });
});
test("sesión: cualquier otra cosa presente es «mala»", () => {
  for (const v of ["corto", TOKEN + "x", TOKEN.slice(1), ` ${TOKEN}`, TOKEN.replace("A", "="), `${TOKEN},${TOKEN}`, "a".repeat(5000)]) {
    assert.deepEqual(leerSesion(v), { estado: "mala" }, JSON.stringify(v.slice(0, 40)));
  }
});

// ── La cuenta que sale ──────────────────────────────────────────────────────────────────────────
test("cuenta: salen los cinco campos y nada más (ni id, ni tenant, ni hash)", () => {
  const cruda = { ...CUENTA, id: ID, tenant_id: ID, password_hash: "$2a$10$x", intentos_fallidos: 2, bloqueada_hasta: null };
  assert.deepEqual(cuentaPublica(cruda), CUENTA);
});
test("cuenta: apellido y fecha de nacimiento pueden ser null", () => {
  assert.deepEqual(cuentaPublica({ ...CUENTA, apellido: null, fecha_nacimiento: null }), { ...CUENTA, apellido: null, fecha_nacimiento: null });
  assert.deepEqual(cuentaPublica({ nombre: "Ana", email: "a@b.mx", telefono: "4771112233" }),
    { nombre: "Ana", apellido: null, email: "a@b.mx", telefono: "4771112233", fecha_nacimiento: null });
});
test("cuenta: una forma inesperada es null", () => {
  for (const x of [null, undefined, "x", [], {}, { ...CUENTA, nombre: 5 }, { ...CUENTA, email: null }, { ...CUENTA, telefono: undefined }, { ...CUENTA, fecha_nacimiento: 19900517 }]) {
    assert.equal(cuentaPublica(x), null, JSON.stringify(x));
  }
});

test("cuenta: de un `{ cuenta }` sale la cuenta pública; de NULL o de otra forma, null", () => {
  assert.deepEqual(cuentaDe({ cuenta: { ...CUENTA, id: ID }, sesion_id: ID }), CUENTA);
  for (const x of [null, undefined, [], {}, { cuenta: null }, CUENTA]) assert.equal(cuentaDe(x), null, JSON.stringify(x));
});

// ── Lo que devuelve tienda_cuenta_registrar ─────────────────────────────────────────────────────
test("registro: creada trae la cuenta pública; ya existía no trae nada", () => {
  assert.deepEqual(leerRegistro({ creada: true, cuenta: { ...CUENTA, id: ID } }), { creada: true, cuenta: CUENTA });
  assert.deepEqual(leerRegistro({ creada: false, cuenta: CUENTA }), { creada: false });
});
test("registro: una forma inesperada es null", () => {
  for (const x of [null, "x", [], {}, { creada: "true", cuenta: CUENTA }, { creada: true }, { creada: true, cuenta: { nombre: "Ana" } }]) {
    assert.equal(leerRegistro(x), null, JSON.stringify(x));
  }
});

// ── Las direcciones guardadas ───────────────────────────────────────────────────────────────────
const DIR = { id: ID, etiqueta: "Casa", calle: "Av. Siempre Viva", numero_exterior: "742", numero_interior: null, colonia: "Centro",
              codigo_postal: "37000", ciudad: "León", estado: "Guanajuato", referencias: null };
test("direcciones: sale su id y sus campos; no la cuenta ni el negocio", () => {
  const cruda = { ...DIR, cuenta_id: ID, tenant_id: ID, created_at: "2026-10-09" };
  assert.deepEqual(direccionesPublicas([cruda]), [DIR]);
  assert.deepEqual(direccionesPublicas({ direcciones: [cruda] }), [DIR]);
  assert.deepEqual(direccionesPublicas([]), []);
});
test("direcciones: lo que no es un objeto se descarta; lo que no es una lista es null", () => {
  assert.deepEqual(direccionesPublicas([null, "x", DIR]), [DIR]);
  for (const x of [null, undefined, "x", 5, {}, { direcciones: "x" }]) assert.equal(direccionesPublicas(x), null, JSON.stringify(x));
});

// ── Mis pedidos ─────────────────────────────────────────────────────────────────────────────────
const PEDIDO = { folio_corto: "TAB12C", recibido_at: "2026-10-08T20:00:00+00:00", modo: "RECOGER", estado: "ENTREGADO", total_mxn: "120.00",
                 renglones: [{ nombre: "Clásica", cantidad: 1, detalle: null }], items: [{ producto_id: ID, cantidad: 1 }] };
test("pedidos: salen los siete campos; ni el id del pedido, ni el negocio, ni datos del cliente", () => {
  const crudo = { ...PEDIDO, id: ID, tenant_id: ID, tienda_cuenta_id: ID, cliente_telefono: "4771112233",
                  renglones: [{ nombre: "Clásica", cantidad: 1, detalle: null, producto_id: ID }] };
  assert.deepEqual(pedidosPublicos([crudo]), [PEDIDO]);
  assert.deepEqual(pedidosPublicos({ pedidos: [crudo] }), [PEDIDO]);
});
test("pedidos: un pedido ya anonimizado sale con items null; sin renglones, lista vacía", () => {
  assert.deepEqual(pedidosPublicos([{ ...PEDIDO, items: null, renglones: null }]), [{ ...PEDIDO, items: null, renglones: [] }]);
  assert.deepEqual(pedidosPublicos([{ ...PEDIDO, items: "x" }])![0]!.items, null);
});
test("pedidos: lo que no es una lista es null", () => {
  for (const x of [null, undefined, "x", {}, { pedidos: 5 }]) assert.equal(pedidosPublicos(x), null, JSON.stringify(x));
});
