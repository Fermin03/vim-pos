import { test } from "node:test";
import assert from "node:assert/strict";
import { correoDePedido } from "./correo-pedido.ts";

const base = {
  negocio: "Knock-Out Burger", folio: "TAB12C", total: "305.00", modo: "DOMICILIO" as const,
  renglones: [{ nombre: "Hamburguesa Clásica", cantidad: 2, detalle: "Extra queso" }],
  enlace: "https://pedidos.vimpos.com.mx/knockout/pedido/AAAAAAAAAAAAAAAAAAAAAA",
};

test("el asunto va sin acentos y con el folio", () => {
  const { subject } = correoDePedido({ ...base, negocio: "Tacos Él Güero" });
  assert.match(subject, /TAB12C/);
  assert.doesNotMatch(subject, /[^\x20-\x7E]/);
});
test("el cuerpo trae renglones, total y enlace, y NO menciona tiempos", () => {
  const { html } = correoDePedido(base);
  assert.match(html, /2 × Hamburguesa Clásica/);
  assert.match(html, /Extra queso/);
  assert.match(html, /\$305\.00/);
  assert.ok(html.includes(base.enlace));
  assert.doesNotMatch(html, /minutos|tiempo estimado|\bmin\b|hora|pronto|en breve/i);
});
test("lo que escribe el cliente o el negocio se escapa", () => {
  const { html } = correoDePedido({ ...base, negocio: "<script>x</script>",
    renglones: [{ nombre: "A & B", cantidad: 1, detalle: "<b>" }] });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /A &amp; B/);
  assert.match(html, /&lt;b&gt;/);
});
test("recoger y domicilio dicen cosas distintas", () => {
  assert.match(correoDePedido(base).html, /a domicilio/i);
  assert.match(correoDePedido({ ...base, modo: "RECOGER" }).html, /recoger/i);
});

// ---- Ronda 1 de revisión ----
test("un negocio con saltos de línea no inyecta cabeceras en el asunto", () => {
  const { subject } = correoDePedido({ ...base, negocio: "X\r\nBcc: a@b.c" });
  assert.doesNotMatch(subject, /[\r\n]/);
});
test("el asunto no termina en guion cuando el negocio no tiene caracteres ASCII", () => {
  const { subject } = correoDePedido({ ...base, negocio: "日本" });
  assert.doesNotMatch(subject, /[\s-]$/);
});
test("folio, total y enlace también se escapan y el href no se puede romper", () => {
  const { html } = correoDePedido({ ...base, folio: "A\"<i>", total: "1\"<u>", enlace: "https://x.mx/a\"onclick=\"y'<z>" });
  assert.doesNotMatch(html, /<i>|<u>|<z>/);
  assert.doesNotMatch(html, /href="[^"]*"[^>]*onclick/);
  assert.match(html, /href="https:\/\/x\.mx\/a&quot;onclick=&quot;y&#39;&lt;z&gt;"/);
});
test("cada modo no dice la frase del otro", () => {
  assert.doesNotMatch(correoDePedido(base).html, /recogerlo/i);
  assert.doesNotMatch(correoDePedido({ ...base, modo: "RECOGER" }).html, /domicilio/i);
});
test("la cantidad se imprime como número", () => {
  const { html } = correoDePedido({ ...base, renglones: [{ nombre: "A", cantidad: "<b>" as unknown as number, detalle: null }] });
  assert.doesNotMatch(html, /<b>/);
});

