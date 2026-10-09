import { test } from "node:test";
import assert from "node:assert/strict";
import { esUuid, leerCuerpo, leerFecha, normalizarTelefono, textoLimpio, tieneNul } from "./validar.ts";

const SUC = "99999999-0000-0000-0000-0000000000bb";

test("teléfono: 10 dígitos tal cual", () => {
  assert.equal(normalizarTelefono("4771112233"), "4771112233");
});
test("teléfono: se quitan espacios, guiones y paréntesis", () => {
  assert.equal(normalizarTelefono("(477) 111-22 33"), "4771112233");
});
test("teléfono: se quita el prefijo de México, con y sin el 1 de celular", () => {
  assert.equal(normalizarTelefono("+52 477 111 2233"), "4771112233");
  assert.equal(normalizarTelefono("5214771112233"), "4771112233");
});
test("teléfono: cualquier otra longitud se rechaza", () => {
  for (const t of ["477111223", "47711122334", "", "abc", null, undefined, 4771112233]) {
    assert.equal(normalizarTelefono(t), null);
  }
});
test("texto: recorta, colapsa espacios y quita caracteres de control", () => {
  assert.equal(textoLimpio("  Ana \u0000 María\n\tLópez  ", 50), "Ana María López");
});
test("texto: vacío o no texto es null; lo largo se corta", () => {
  assert.equal(textoLimpio("   ", 10), null);
  assert.equal(textoLimpio(42, 10), null);
  assert.equal(textoLimpio("abcdefghijkl", 5), "abcde");
});
test("uuid", () => {
  assert.equal(esUuid(SUC), true);
  assert.equal(esUuid("99999999-0000-0000-0000-0000000000b"), false);
  assert.equal(esUuid(null), false);
});

test("cuerpo: acción desconocida o cuerpo que no es objeto", () => {
  assert.deepEqual(leerCuerpo(null), { ok: false, error: "CUERPO_INVALIDO" });
  assert.deepEqual(leerCuerpo([]), { ok: false, error: "CUERPO_INVALIDO" });
  assert.deepEqual(leerCuerpo({ accion: "borrar", negocio: "x" }), { ok: false, error: "ACCION_INVALIDA" });
});
test("cuerpo: el negocio es un slug en minúsculas", () => {
  assert.deepEqual(leerCuerpo({ accion: "negocio", negocio: "Knock-Out" }), { ok: true, valor: { accion: "negocio", negocio: "knock-out" } });
  assert.deepEqual(leerCuerpo({ accion: "negocio", negocio: "con espacios" }), { ok: false, error: "NEGOCIO_INVALIDO" });
  assert.deepEqual(leerCuerpo({ accion: "negocio" }), { ok: false, error: "NEGOCIO_INVALIDO" });
});
test("cuerpo: menu exige una sucursal uuid", () => {
  assert.deepEqual(leerCuerpo({ accion: "menu", negocio: "knockout", sucursal_id: "x" }), { ok: false, error: "SUCURSAL_INVALIDA" });
  assert.equal(leerCuerpo({ accion: "menu", negocio: "knockout", sucursal_id: SUC }).ok, true);
});
test("cuerpo: cotizar valida modo, zona e items como arreglo acotado", () => {
  const base = { accion: "cotizar", negocio: "knockout", sucursal_id: SUC, modo: "RECOGER", items: [{}] };
  assert.equal(leerCuerpo(base).ok, true);
  assert.deepEqual(leerCuerpo({ ...base, modo: "MESA" }), { ok: false, error: "MODO_INVALIDO" });
  assert.deepEqual(leerCuerpo({ ...base, zona_id: "x" }), { ok: false, error: "ZONA_INVALIDA" });
  assert.deepEqual(leerCuerpo({ ...base, items: "x" }), { ok: false, error: "CARRITO_INVALIDO" });
  assert.deepEqual(leerCuerpo({ ...base, items: [] }), { ok: false, error: "CARRITO_INVALIDO" });
  assert.deepEqual(leerCuerpo({ ...base, items: Array(41).fill({}) }), { ok: false, error: "CARRITO_INVALIDO" });
});

const pedir = {
  accion: "pedir", negocio: "knockout", sucursal_id: SUC, modo: "DOMICILIO",
  zona_id: "99999999-0000-0000-0000-0000000000aa", items: [{}],
  cliente: { nombre: " Ana ", telefono: "(477) 111 2233", email: "ANA@Example.com " },
  direccion: { calle: "Av. Siempre Viva", numero_exterior: "742", colonia: "Centro",
               codigo_postal: "37000", ciudad: "León", estado: "Guanajuato" },
  pago: "EFECTIVO", paga_con: 500, nota: " tocar el timbre ", captcha: "tok",
};
test("cuerpo: pedir normaliza cliente, dirección, pago y nota", () => {
  const r = leerCuerpo(pedir);
  assert.equal(r.ok, true);
  if (!r.ok || r.valor.accion !== "pedir") return;
  assert.deepEqual(r.valor.cliente, { nombre: "Ana", telefono: "4771112233", email: "ana@example.com" });
  assert.equal(r.valor.direccion?.numero_interior, null);
  assert.equal(r.valor.direccion?.referencias, null);
  assert.equal(r.valor.paga_con, "500.00");
  assert.equal(r.valor.nota, "tocar el timbre");
  assert.equal(r.valor.captcha, "tok");
});
test("cuerpo: pedir rechaza lo que no cuadra", () => {
  const con = (cambio: object) => leerCuerpo({ ...pedir, ...cambio });
  assert.deepEqual(con({ cliente: { ...pedir.cliente, telefono: "123" } }), { ok: false, error: "CLIENTE_INVALIDO" });
  assert.deepEqual(con({ cliente: { ...pedir.cliente, nombre: "  " } }), { ok: false, error: "CLIENTE_INVALIDO" });
  assert.deepEqual(con({ cliente: { ...pedir.cliente, email: "sin-arroba" } }), { ok: false, error: "CLIENTE_INVALIDO" });
  assert.deepEqual(con({ direccion: null }), { ok: false, error: "DIRECCION_INVALIDA" });
  assert.deepEqual(con({ direccion: { ...pedir.direccion, codigo_postal: "3700" } }), { ok: false, error: "DIRECCION_INVALIDA" });
  assert.deepEqual(con({ modo: "RECOGER" }), { ok: false, error: "DIRECCION_INVALIDA" });
  assert.deepEqual(con({ pago: "CHEQUE" }), { ok: false, error: "PAGO_INVALIDO" });
  assert.deepEqual(con({ pago: "TARJETA" }), { ok: false, error: "PAGO_INVALIDO" });
  assert.deepEqual(con({ paga_con: -1 }), { ok: false, error: "PAGO_INVALIDO" });
  assert.deepEqual(con({ paga_con: "mucho" }), { ok: false, error: "PAGO_INVALIDO" });
});
test("cuerpo: pedir para recoger no lleva dirección ni zona; correo y paga_con son opcionales", () => {
  const r = leerCuerpo({ ...pedir, modo: "RECOGER", zona_id: null, direccion: null, paga_con: null,
                         cliente: { nombre: "Ana", telefono: "4771112233" } });
  assert.equal(r.ok, true);
  if (!r.ok || r.valor.accion !== "pedir") return;
  assert.equal(r.valor.cliente.email, null);
  assert.equal(r.valor.paga_con, null);
});
test("cuerpo: seguimiento exige un código con forma de código", () => {
  assert.equal(leerCuerpo({ accion: "seguimiento", negocio: "knockout", codigo: "A".repeat(22) }).ok, true);
  assert.deepEqual(leerCuerpo({ accion: "seguimiento", negocio: "knockout", codigo: "corto" }), { ok: false, error: "CODIGO_INVALIDO" });
});

// ---- Ronda 1 de revisión: lo que NO debe pasar ----

test("teléfono: las letras no son adorno; números triviales o con lada imposible se rechazan", () => {
  for (const t of ["abc4771112233", "0000000000", "1234567890", "477-111-2233x"]) assert.equal(normalizarTelefono(t), null);
  assert.equal(normalizarTelefono("477.111.2233"), "4771112233");
});
test("texto: solo caracteres invisibles es null", () => {
  assert.equal(textoLimpio("\u200B\u200C\u200D\u2060\uFEFF", 10), null);
  assert.equal(textoLimpio("\u0085\u2028\u2029", 10), null);
});
test("texto: caracteres bidi, de ancho cero y C1 se quitan", () => {
  const r = textoLimpio("Ana\u202EodnuM\u2066x\u2069\u200Bz\u0085w", 50);
  assert.ok(r !== null && !/[\u202A-\u202E\u2066-\u2069\u200B\u0085]/.test(r), String(r));
});
test("texto: un separador invisible entre palabras no las pega", () => {
  assert.equal(textoLimpio("Ana\u2028María", 50), "Ana María");
});
test("texto: se corta por carácter, no deja medio emoji ni pasa medio emoji de la entrada", () => {
  const r = textoLimpio("abc😀def", 4);
  assert.equal(r, "abc😀");
  assert.equal(r!.isWellFormed(), true);
  const c = textoLimpio("abcde😀", 5);
  assert.equal(c, "abcde");
  assert.equal(textoLimpio("ab\uD800cd", 10)!.isWellFormed(), true);
  assert.equal(textoLimpio("\uD800", 10), null);
});

const comoPedido = (cliente: object) => leerCuerpo({ ...pedir, cliente: { nombre: "Ana", telefono: "4771112233", ...cliente } });
test("cuerpo: el correo es ASCII y sin caracteres peligrosos", () => {
  for (const email of ["a\u0000b@x.com", "a,b@x.com", "a<b@x.com", "ñandú@x.com", "a@x.c", "a@@x.com", "a b@x.com", "a@x.com;b@y.com", '"a"@x.com', "a\u200B@x.com", "a@x_y.com"]) {
    assert.deepEqual(comoPedido({ email }), { ok: false, error: "CLIENTE_INVALIDO" }, JSON.stringify(email));
  }
  const r = comoPedido({ email: "Ana+tienda@mail.sub.example.com" });
  assert.equal(r.ok, true);
  if (r.ok && r.valor.accion === "pedir") assert.equal(r.valor.cliente.email, "ana+tienda@mail.sub.example.com");
});
test("cuerpo: un correo vacío es un correo ausente", () => {
  const r = comoPedido({ email: "  " });
  assert.equal(r.ok, true);
  if (r.ok && r.valor.accion === "pedir") assert.equal(r.valor.cliente.email, null);
});
test("cuerpo: pago con tarjeta sin paga_con pasa; importes raros no", () => {
  const t = leerCuerpo({ ...pedir, pago: "TARJETA", paga_con: null });
  assert.equal(t.ok, true);
  if (t.ok && t.valor.accion === "pedir") { assert.equal(t.valor.pago, "TARJETA"); assert.equal(t.valor.paga_con, null); }
  for (const paga_con of ["1e3", "Infinity", 12.345, "12.345", NaN, Infinity, " "]) {
    assert.deepEqual(leerCuerpo({ ...pedir, paga_con }), { ok: false, error: "PAGO_INVALIDO" }, String(paga_con));
  }
  const cero = leerCuerpo({ ...pedir, paga_con: -0 });
  assert.equal(cero.ok, true);
  if (cero.ok && cero.valor.accion === "pedir") assert.equal(cero.valor.paga_con, "0.00");
  const dec = leerCuerpo({ ...pedir, paga_con: 12.5 });
  if (dec.ok && dec.valor.accion === "pedir") assert.equal(dec.valor.paga_con, "12.50");
});

// ---- Revisión final: la nota del renglón también es texto del público, y el NUL no llega a la base ----

const cotizar = { accion: "cotizar", negocio: "knockout", sucursal_id: SUC, modo: "RECOGER", items: [{}] };
const itemsDe = (cuerpo: object): unknown[] => {
  const r = leerCuerpo(cuerpo);
  assert.equal(r.ok, true, JSON.stringify(r));
  if (!r.ok || (r.valor.accion !== "cotizar" && r.valor.accion !== "pedir")) throw new Error("no es un carrito");
  return r.valor.items;
};
test("renglones: un elemento que no es objeto es CARRITO_INVALIDO, en cotizar y en pedir", () => {
  for (const base of [cotizar, pedir]) {
    for (const malo of ["x", 1, null, true, [], [{}]]) {
      assert.deepEqual(leerCuerpo({ ...base, items: [{ producto_id: "p", cantidad: 1 }, malo] }), { ok: false, error: "CARRITO_INVALIDO" }, JSON.stringify(malo));
    }
  }
});
test("renglones: la nota sale limpia (sin bidi ni saltos de línea) y recortada a 200", () => {
  for (const base of [cotizar, pedir]) {
    const [a, b] = itemsDe({ ...base, items: [
      { producto_id: "p", cantidad: 1, nota: "  sin\ncebolla \u202Eatodot\u202C\u0007 " },
      { producto_id: "p", cantidad: 1, nota: "x".repeat(250) },
    ] }) as { nota: string }[];
    assert.equal(a!.nota, "sin cebolla atodot");
    assert.equal(b!.nota, "x".repeat(200));
  }
});
test("renglones: una nota vacía, invisible o que no es texto se quita del renglón", () => {
  for (const nota of ["", "   ", "\u200B\u202E", 7, null, { a: 1 }]) {
    assert.deepEqual(itemsDe({ ...cotizar, items: [{ producto_id: "p", cantidad: 1, nota }] }), [{ producto_id: "p", cantidad: 1 }], JSON.stringify(nota));
  }
});
test("renglones: los demás campos pasan intactos (lo demás lo valida SQL)", () => {
  const renglon = {
    producto_id: "NO-ES-UUID", cantidad: "2", otra: { x: [1, null] },
    modificadores: [{ opcion_id: "o", cantidad: 1.5, nota: "esta no se toca\n" }],
    componentes: [{ grupo_id: "g", producto_id: "p", cantidad: 1 }],
  };
  assert.deepEqual(itemsDe({ ...cotizar, items: [renglon, {}] }), [renglon, {}]);
  assert.deepEqual(itemsDe({ ...pedir, items: [{ ...renglon, nota: " ok " }] }), [{ ...renglon, nota: "ok" }]);
});
// String.raw: lo que hay entre las comillas invertidas es, letra por letra, el cuerpo que llega.
const NUL = String.fromCharCode(0);
test("cuerpo crudo: un NUL, literal o como escape, se detecta en cualquier parte del JSON", () => {
  assert.equal(tieneNul(`{"a":"x${NUL}y"}`), true);                              // el carácter NUL
  assert.equal(tieneNul(String.raw`{"a":"x\u0000y"}`), true);                    // el escape, en un valor
  assert.equal(tieneNul(String.raw`{"x\u0000":1}`), true);                       // el escape, en una clave
  assert.equal(tieneNul(String.raw`{"items":[{"producto_id":"\u0000"}]}`), true);
  assert.equal(tieneNul(String.raw`{"a":"x\\\u0000"}`), true);                   // barra escapada + escape de NUL
  assert.equal(tieneNul(JSON.stringify({ a: `x${NUL}y` })), true);               // como lo serializa un cliente
});
test("cuerpo crudo: sin NUL pasa, también la barra escapada seguida de u0000 y otros escapes", () => {
  assert.equal(tieneNul(""), false);
  assert.equal(tieneNul(String.raw`{"a":"hola\ná \u0001 Ā"}`), false);
  assert.equal(tieneNul(String.raw`{"a":"\\u0000"}`), false);      // barra + «u0000»: seis caracteres visibles, no un NUL
  assert.equal(tieneNul(String.raw`{"a":"\\\\u0000"}`), false);    // dos barras escapadas
  assert.equal(tieneNul(JSON.stringify({ a: String.raw`\u0000` })), false);
  assert.equal(tieneNul(JSON.stringify(pedir)), false);
});

// ---- Revisión final: el total que el cliente vio ----

const totalDe = (cambio: object): unknown => {
  const r = leerCuerpo({ ...pedir, ...cambio });
  return r.ok && r.valor.accion === "pedir" ? r.valor.total_esperado : r;
};
test("cuerpo: pedir acepta total_esperado opcional y lo deja como importe con dos decimales", () => {
  assert.equal(totalDe({}), null);
  assert.equal(totalDe({ total_esperado: null }), null);
  assert.equal(totalDe({ total_esperado: "" }), null);
  assert.equal(totalDe({ total_esperado: 155 }), "155.00");
  assert.equal(totalDe({ total_esperado: "155.5" }), "155.50");
  assert.equal(totalDe({ total_esperado: " 155.00 " }), "155.00");
  assert.equal(totalDe({ total_esperado: 0 }), "0.00");
  // No depende de la forma de pago: con tarjeta también se compara el total.
  assert.equal(totalDe({ pago: "TARJETA", paga_con: null, total_esperado: "155.00" }), "155.00");
});
test("cuerpo: un total_esperado que no es un importe es PAGO_INVALIDO", () => {
  for (const total_esperado of ["mucho", -1, "-1.00", "1e3", 12.345, "12.345", NaN, Infinity, "1,250.00", {}, [], true, 1000000]) {
    assert.deepEqual(leerCuerpo({ ...pedir, total_esperado }), { ok: false, error: "PAGO_INVALIDO" }, JSON.stringify(total_esperado));
  }
});

// ════ Entrega 6: acciones de cuenta ═════════════════════════════════════════════════════════════
const N = { negocio: "knockout" };
const TOKEN = "Ab3_-".repeat(4) + "Zz";
const ID = "11111111-2222-3333-4444-555555555555";
const invalido = { ok: false, error: "CUENTA_INVALIDA_DATOS" };
const registrar = { accion: "registrar", ...N, nombre: " Ana ", apellido: " López ", email: " ANA@Example.com ",
                    telefono: "(477) 111 2233", password: "  secreta 1  ", captcha: "tok" };

test("cuenta: las acciones sin cuerpo propio solo llevan acción y negocio", () => {
  for (const accion of ["salir", "cuenta", "mis_pedidos"]) {
    assert.deepEqual(leerCuerpo({ accion, ...N, p_cuenta: ID, tenant_id: ID, sesion: TOKEN }), { ok: true, valor: { accion, negocio: "knockout" } });
  }
});
test("cuenta: toda acción exige un slug de negocio", () => {
  for (const accion of ["registrar", "entrar", "salir", "recuperar_pedir", "recuperar_aplicar", "cuenta", "cuenta_guardar",
                        "cuenta_password", "direccion_guardar", "direccion_borrar", "mis_pedidos", "eliminar_cuenta"]) {
    assert.deepEqual(leerCuerpo({ accion }), { ok: false, error: "NEGOCIO_INVALIDO" }, accion);
  }
});

test("registrar: normaliza nombre, apellido, correo y teléfono; la contraseña va TAL CUAL; lo desconocido se ignora", () => {
  assert.deepEqual(leerCuerpo({ ...registrar, p_cuenta: ID, tenant_id: ID, fecha_nacimiento: "1990-01-01" }), { ok: true, valor: {
    accion: "registrar", negocio: "knockout", nombre: "Ana", apellido: "López", email: "ana@example.com",
    telefono: "4771112233", password: "  secreta 1  ", captcha: "tok",
  } });
});
test("registrar: la contraseña lleva al menos 8 caracteres y como mucho 72 BYTES, sin recortar ni normalizar", () => {
  const con = (password: unknown) => leerCuerpo({ ...registrar, password });
  assert.equal(con("12345678").ok, true);
  assert.equal(con("a".repeat(72)).ok, true);
  assert.equal(con("        ").ok, true, "ocho espacios son ocho caracteres");
  assert.equal(con("ñ".repeat(8)).ok, true);
  assert.equal(con("😀".repeat(8)).ok, true, "el mínimo se cuenta en caracteres, no en unidades UTF-16");
  // bcrypt solo mira 72 bytes: lo que pasa de ahí sin pasar de 72 caracteres tampoco entra.
  assert.equal(con("ñ".repeat(36)).ok, true, "36 ñ son 72 bytes");
  assert.equal(con("😀".repeat(18)).ok, true, "18 emojis son 72 bytes");
  for (const larga of ["ñ".repeat(37), "😀".repeat(19), "a".repeat(71) + "ñ", "😀".repeat(72)]) assert.deepEqual(con(larga), invalido, `${Array.from(larga).length} caracteres`);
  const nfd = "contraseña";
  const r = con(nfd);
  assert.equal(r.ok && r.valor.accion === "registrar" && r.valor.password === nfd, true, "no se normaliza");
  for (const mala of ["1234567", "a".repeat(73), "", null, undefined, 12345678, ["12345678"]]) assert.deepEqual(con(mala), invalido, JSON.stringify(mala));
});
test("registrar: nombre y apellido obligatorios y recortados a 100; correo y teléfono como en pedir", () => {
  const con = (cambio: object) => leerCuerpo({ ...registrar, ...cambio });
  const largo = con({ nombre: "a".repeat(150), apellido: "b".repeat(150) });
  assert.equal(largo.ok && largo.valor.accion === "registrar" && largo.valor.nombre.length === 100 && largo.valor.apellido.length === 100, true);
  for (const cambio of [{ nombre: "  " }, { nombre: null }, { apellido: "" }, { apellido: 5 }, { telefono: "123" }, { telefono: null },
                        { email: "sin-arroba" }, { email: "" }, { email: null }, { email: `${"a".repeat(250)}@b.mx` }, { email: "a@b.mx\r\nBcc: x@y.mx" }, { email: "añ@b.mx" }]) {
    assert.deepEqual(con(cambio), invalido, JSON.stringify(cambio));
  }
});
test("registrar: el captcha ausente o gigante es null (lo rechaza el antirobot, no la forma)", () => {
  for (const captcha of [undefined, null, 5, "x".repeat(4097)]) {
    const r = leerCuerpo({ ...registrar, captcha });
    assert.equal(r.ok && r.valor.accion === "registrar" && r.valor.captcha === null, true);
  }
});

test("entrar: correo normalizado; la contraseña a comprobar va de 1 a 72, tal cual", () => {
  assert.deepEqual(leerCuerpo({ accion: "entrar", ...N, email: " ANA@Example.com", password: " x " }),
    { ok: true, valor: { accion: "entrar", negocio: "knockout", email: "ana@example.com", password: " x " } });
  assert.equal(leerCuerpo({ accion: "entrar", ...N, email: "a@b.mx", password: "a".repeat(72) }).ok, true);
  for (const cambio of [{ password: "" }, { password: "a".repeat(73) }, { password: "ñ".repeat(37) }, { password: null }, { password: 5 }, { email: "x" }, { email: null }]) {
    assert.deepEqual(leerCuerpo({ accion: "entrar", ...N, email: "a@b.mx", password: "secreta12", ...cambio }), invalido, JSON.stringify(cambio));
  }
});

test("recuperar_pedir: correo y captcha", () => {
  assert.deepEqual(leerCuerpo({ accion: "recuperar_pedir", ...N, email: "ANA@example.com", captcha: "tok", nombre: "x" }),
    { ok: true, valor: { accion: "recuperar_pedir", negocio: "knockout", email: "ana@example.com", captcha: "tok" } });
  assert.deepEqual(leerCuerpo({ accion: "recuperar_pedir", ...N, email: "no", captcha: "tok" }), invalido);
});
test("recuperar_aplicar: el token tiene forma de código (si no, ENLACE_INVALIDO) y la contraseña nueva 8–72", () => {
  assert.deepEqual(leerCuerpo({ accion: "recuperar_aplicar", ...N, token: TOKEN, password: "nueva clave" }),
    { ok: true, valor: { accion: "recuperar_aplicar", negocio: "knockout", token: TOKEN, password: "nueva clave" } });
  for (const token of ["corto", TOKEN + "x", null, undefined, 5]) {
    assert.deepEqual(leerCuerpo({ accion: "recuperar_aplicar", ...N, token, password: "nueva clave" }), { ok: false, error: "ENLACE_INVALIDO" });
  }
  for (const password of ["corta", "ñ".repeat(37)]) assert.deepEqual(leerCuerpo({ accion: "recuperar_aplicar", ...N, token: TOKEN, password }), invalido);
});

test("cuenta_guardar: nombre, apellido, teléfono y fecha de nacimiento (o null)", () => {
  const base = { accion: "cuenta_guardar", ...N, nombre: " Ana ", apellido: "López", telefono: "+52 477 111 2233" };
  assert.deepEqual(leerCuerpo({ ...base, fecha_nacimiento: "1990-05-17", email: "otro@x.mx", password: "x" }), { ok: true, valor: {
    accion: "cuenta_guardar", negocio: "knockout", nombre: "Ana", apellido: "López", telefono: "4771112233", fecha_nacimiento: "1990-05-17",
  } });
  for (const vacia of [null, undefined, ""]) {
    const r = leerCuerpo({ ...base, fecha_nacimiento: vacia });
    assert.equal(r.ok && r.valor.accion === "cuenta_guardar" && r.valor.fecha_nacimiento === null, true);
  }
  for (const cambio of [{ nombre: "" }, { apellido: null }, { telefono: "1" }, { fecha_nacimiento: "17/05/1990" }, { fecha_nacimiento: "1990-02-30" },
                        { fecha_nacimiento: "1899-12-31" }, { fecha_nacimiento: "2999-01-01" }, { fecha_nacimiento: 19900517 }]) {
    assert.deepEqual(leerCuerpo({ ...base, ...cambio }), invalido, JSON.stringify(cambio));
  }
});
test("fecha: válida, pasada y desde 1900; vacía es null; lo demás undefined", () => {
  const hoy = new Date("2026-10-09T18:00:00Z");
  assert.equal(leerFecha("2000-02-29", hoy), "2000-02-29");
  assert.equal(leerFecha("1900-01-01", hoy), "1900-01-01");
  assert.equal(leerFecha("2026-10-08", hoy), "2026-10-08");
  for (const v of [null, undefined, ""]) assert.equal(leerFecha(v, hoy), null);
  for (const v of ["2026-10-09", "2026-10-10", "2001-02-29", "1990-13-01", "1990-00-10", "1990-1-1", " 1990-01-01", "1990-01-01T00:00:00Z", "0000-01-01", 5, {}]) {
    assert.equal(leerFecha(v, hoy), undefined, JSON.stringify(v));
  }
});

test("cuenta_password: la actual 1–72 y la nueva 8–72, las dos tal cual", () => {
  assert.deepEqual(leerCuerpo({ accion: "cuenta_password", ...N, actual: " vieja", nueva: "nueva clave " }),
    { ok: true, valor: { accion: "cuenta_password", negocio: "knockout", actual: " vieja", nueva: "nueva clave " } });
  for (const cambio of [{ actual: "" }, { actual: null }, { actual: "ñ".repeat(37) }, { nueva: "corta" }, { nueva: "a".repeat(73) }, { nueva: "ñ".repeat(37) }]) {
    assert.deepEqual(leerCuerpo({ accion: "cuenta_password", ...N, actual: "vieja", nueva: "nueva clave", ...cambio }), invalido, JSON.stringify(cambio));
  }
});
test("eliminar_cuenta: pide la contraseña", () => {
  assert.deepEqual(leerCuerpo({ accion: "eliminar_cuenta", ...N, password: "x y" }), { ok: true, valor: { accion: "eliminar_cuenta", negocio: "knockout", password: "x y" } });
  assert.deepEqual(leerCuerpo({ accion: "eliminar_cuenta", ...N }), invalido);
});

const dir = { calle: " Av. Siempre Viva ", numero_exterior: "742", colonia: "Centro", codigo_postal: "37000", ciudad: "León", estado: "Guanajuato" };
const dirLimpia = { calle: "Av. Siempre Viva", numero_exterior: "742", numero_interior: null, colonia: "Centro", codigo_postal: "37000",
                    ciudad: "León", estado: "Guanajuato", referencias: null };
test("direccion_guardar: id uuid o null, etiqueta a 40, y la dirección con las reglas de pedir (suelta o bajo `direccion`)", () => {
  assert.deepEqual(leerCuerpo({ accion: "direccion_guardar", ...N, id: null, etiqueta: " Casa ", ...dir, cuenta_id: ID, tenant_id: ID }),
    { ok: true, valor: { accion: "direccion_guardar", negocio: "knockout", id: null, etiqueta: "Casa", direccion: dirLimpia } });
  assert.deepEqual(leerCuerpo({ accion: "direccion_guardar", ...N, id: ID, etiqueta: "e".repeat(60), direccion: dir }),
    { ok: true, valor: { accion: "direccion_guardar", negocio: "knockout", id: ID, etiqueta: "e".repeat(40), direccion: dirLimpia } });
  const sinEtiqueta = leerCuerpo({ accion: "direccion_guardar", ...N, ...dir });
  assert.equal(sinEtiqueta.ok && sinEtiqueta.valor.accion === "direccion_guardar" && sinEtiqueta.valor.etiqueta === null && sinEtiqueta.valor.id === null, true);
});
test("direccion_guardar y direccion_borrar: lo que no cuadra es DIRECCION_INVALIDA", () => {
  const mala = { ok: false, error: "DIRECCION_INVALIDA" };
  assert.deepEqual(leerCuerpo({ accion: "direccion_guardar", ...N, id: "x", ...dir }), mala);
  assert.deepEqual(leerCuerpo({ accion: "direccion_guardar", ...N, ...dir, codigo_postal: "3700" }), mala);
  assert.deepEqual(leerCuerpo({ accion: "direccion_guardar", ...N }), mala);
  assert.deepEqual(leerCuerpo({ accion: "direccion_borrar", ...N, id: ID }), { ok: true, valor: { accion: "direccion_borrar", negocio: "knockout", id: ID } });
  for (const id of [null, undefined, "x", 5]) assert.deepEqual(leerCuerpo({ accion: "direccion_borrar", ...N, id }), mala);
});
