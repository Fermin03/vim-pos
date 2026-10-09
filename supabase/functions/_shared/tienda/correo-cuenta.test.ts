import { test } from "node:test";
import assert from "node:assert/strict";
import { correoDeBienvenida, correoDeRecuperacion, correoYaTienesCuenta } from "./correo-cuenta.ts";

const BASE = "https://pedidos.vimpos.com.mx";
const TOKEN = "Ab3_-".repeat(4) + "Zz";
const d = { negocio: "Knock-Out Burger", slug: "knockout", base: BASE };
const MALO = `<script>x</script> & "y" 'z'`;

const todos = (negocio: string, nombre: string) => [
  correoDeBienvenida({ ...d, negocio, nombre }),
  correoYaTienesCuenta({ ...d, negocio }),
  correoDeRecuperacion({ ...d, negocio, nombre, token: TOKEN }),
];

test("el asunto nombra al restaurante, va en ASCII y sin saltos de línea", () => {
  for (const { subject } of todos("Tacos Él Güero", "Ana")) {
    assert.match(subject, /Tacos El Guero/);
    assert.doesNotMatch(subject, /[^\x20-\x7E]/);
  }
  for (const { subject } of todos("X\r\nBcc: a@b.c", "Ana")) assert.doesNotMatch(subject, /[\r\n]/);
});
test("el asunto no termina en guion cuando el negocio no tiene caracteres ASCII", () => {
  for (const { subject } of todos("日本", "Ana")) {
    assert.doesNotMatch(subject, /[\s-]$/);
    assert.ok(subject.length > 0);
  }
});
test("el nombre del negocio y el del cliente se escapan en el cuerpo", () => {
  for (const { html } of todos(MALO, MALO)) {
    assert.doesNotMatch(html, /<script>/);
    assert.doesNotMatch(html, /"y"|'z'/);
    assert.match(html, /&lt;script&gt;x&lt;\/script&gt; &amp; &quot;y&quot; &#39;z&#39;/);
  }
});
test("los tres son distintos entre sí", () => {
  const [a, b, c] = todos("Knock-Out Burger", "Ana");
  assert.equal(new Set([a!.subject, b!.subject, c!.subject]).size, 3);
});

test("bienvenida: saluda por su nombre y enlaza a la tienda del negocio", () => {
  const { html } = correoDeBienvenida({ ...d, nombre: "Ana" });
  assert.match(html, /Ana/);
  assert.ok(html.includes(`href="${BASE}/knockout"`));
});

test("ya tienes cuenta: enlaza a entrar y a recuperar, y no lleva nombre ni token", () => {
  const { html } = correoYaTienesCuenta(d);
  assert.ok(html.includes(`href="${BASE}/knockout/entrar"`));
  assert.ok(html.includes(`href="${BASE}/knockout/recuperar"`));
  assert.doesNotMatch(html, /\?t=/);
  assert.match(html, /ignora este correo/i);
});

test("recuperación: el enlace es exactamente base/slug/recuperar?t=token", () => {
  const { html } = correoDeRecuperacion({ ...d, nombre: "Ana", token: TOKEN });
  assert.ok(html.includes(`href="${BASE}/knockout/recuperar?t=${TOKEN}"`));
  assert.equal(html.split(TOKEN).length - 1, 1, "el token aparece una sola vez");
  assert.match(html, /30 minutos/);
  assert.match(html, /una sola vez/);
});
test("recuperación: el token nunca va en el asunto", () => {
  assert.equal(correoDeRecuperacion({ ...d, nombre: "Ana", token: TOKEN }).subject.includes(TOKEN), false);
});
test("un enlace no se puede romper desde la base o el slug", () => {
  const { html } = correoDeRecuperacion({ negocio: "X", nombre: "Ana", slug: `a"onclick="y`, base: `https://x.mx/"><z>`, token: TOKEN });
  assert.doesNotMatch(html, /<z>/);
  assert.doesNotMatch(html, /href="[^"]*"[^>]*onclick/);
});
test("sin nombre (vacío) el saludo no deja un hueco raro", () => {
  for (const html of [correoDeBienvenida({ ...d, nombre: "" }).html, correoDeRecuperacion({ ...d, nombre: "", token: TOKEN }).html]) {
    assert.doesNotMatch(html, /Hola ,|Hola\s*<|, \./);
  }
});
