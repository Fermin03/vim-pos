import { test } from "node:test";
import assert from "node:assert/strict";
import { correoDeBienvenida, correoDeRecuperacion, correoYaTienesCuenta } from "./correo-cuenta.ts";

const BASE = "https://pedidos.vimpos.com.mx";
const TOKEN = "Ab3_-".repeat(4) + "Zz";
const d = { negocio: "Knock-Out Burger", slug: "knockout", base: BASE };
const MALO = `<script>x</script> & "y" 'z'`;

const todos = (negocio: string) => [
  correoDeBienvenida({ ...d, negocio }),
  correoYaTienesCuenta({ ...d, negocio }),
  correoDeRecuperacion({ ...d, negocio, token: TOKEN }),
];

test("el asunto nombra al restaurante, va en ASCII y sin saltos de línea", () => {
  for (const { subject } of todos("Tacos Él Güero")) {
    assert.match(subject, /Tacos El Guero/);
    assert.doesNotMatch(subject, /[^\x20-\x7E]/);
  }
  for (const { subject } of todos("X\r\nBcc: a@b.c")) assert.doesNotMatch(subject, /[\r\n]/);
});
test("el asunto no termina en guion cuando el negocio no tiene caracteres ASCII", () => {
  for (const { subject } of todos("日本")) {
    assert.doesNotMatch(subject, /[\s-]$/);
    assert.ok(subject.length > 0);
  }
});
test("el nombre del negocio se escapa en el cuerpo", () => {
  for (const { html } of todos(MALO)) {
    assert.doesNotMatch(html, /<script>/);
    assert.doesNotMatch(html, /"y"|'z'/);
    assert.match(html, /&lt;script&gt;x&lt;\/script&gt; &amp; &quot;y&quot; &#39;z&#39;/);
  }
});
test("los tres son distintos entre sí", () => {
  const [a, b, c] = todos("Knock-Out Burger");
  assert.equal(new Set([a!.subject, b!.subject, c!.subject]).size, 3);
});

// Quien se registra puede poner el correo de otra persona: lo que tecleó como nombre no viaja.
test("ninguno lleva texto de quien llenó el formulario: saludo neutro, sin nombre", () => {
  // Aunque quien llama pasara un nombre (un objeto con más campos), la plantilla no lo usa.
  const conNombre = { ...d, nombre: "Ganaste $5,000, entra a evil.tld", token: TOKEN };
  for (const { subject, html } of [correoDeBienvenida(conNombre), correoYaTienesCuenta(conNombre), correoDeRecuperacion(conNombre)]) {
    assert.doesNotMatch(html + subject, /Ganaste|evil/);
    assert.doesNotMatch(html, /Hola,/);
  }
  for (const html of [correoDeBienvenida(d).html, correoDeRecuperacion({ ...d, token: TOKEN }).html]) assert.match(html, />Hola\. /);
});

test("bienvenida: enlaza a la tienda del negocio", () => {
  const { html } = correoDeBienvenida(d);
  assert.ok(html.includes(`href="${BASE}/knockout"`));
});

test("ya tienes cuenta: enlaza a entrar y a recuperar, y no lleva nombre ni token", () => {
  const { html } = correoYaTienesCuenta(d);
  assert.ok(html.includes(`href="${BASE}/knockout/entrar"`));
  assert.ok(html.includes(`href="${BASE}/knockout/recuperar"`));
  assert.doesNotMatch(html, /[?#]t=/);
  assert.match(html, /ignora este correo/i);
});

test("recuperación: el token va en el fragmento (base/slug/recuperar#t=token), nunca en la consulta", () => {
  const { html } = correoDeRecuperacion({ ...d, token: TOKEN });
  assert.ok(html.includes(`href="${BASE}/knockout/recuperar#t=${TOKEN}"`));
  assert.doesNotMatch(html, /\?t=/);
  assert.equal(html.split(TOKEN).length - 1, 1, "el token aparece una sola vez");
  assert.match(html, /30 minutos/);
  assert.match(html, /una sola vez/);
});
test("recuperación: el token nunca va en el asunto", () => {
  assert.equal(correoDeRecuperacion({ ...d, token: TOKEN }).subject.includes(TOKEN), false);
});
test("un enlace no se puede romper desde la base o el slug", () => {
  const { html } = correoDeRecuperacion({ negocio: "X", slug: `a"onclick="y`, base: `https://x.mx/"><z>`, token: TOKEN });
  assert.doesNotMatch(html, /<z>/);
  assert.doesNotMatch(html, /href="[^"]*"[^>]*onclick/);
});
