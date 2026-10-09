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
  assert.doesNotMatch(html, /minutos|tiempo estimado/i);
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
