import test from "node:test";
import assert from "node:assert/strict";
import { centavos, construirMenuUber, idValidoUber } from "./menu-uber.ts";

const cats = [
  { id: "c-bebidas", nombre: "Bebidas", orden: 2 },
  { id: "c-hamb", nombre: "Hamburguesas", orden: 1 },
  { id: "c-vacia", nombre: "Postres", orden: 3 },
];
const prods = [
  { id: "p-cheese", nombre: "Cheese burger", descripcion: "Con queso", precio_base_mxn: "100.00", tasa_iva: 16, categoria_id: "c-hamb" },
  { id: "p-agua", nombre: "Agua", precio_base_mxn: 25.5, tasa_iva: 0, categoria_id: "c-bebidas" },
  { id: "p-sin-cat", nombre: "Extra", precio_base_mxn: 10, categoria_id: null },
  { id: "p-agotado", nombre: "Papas", precio_base_mxn: 40, categoria_id: "c-hamb", agotado: true },
  { id: "p-gratis", nombre: "Salsa", precio_base_mxn: 0, categoria_id: "c-hamb" },
  { id: "p-oculto", nombre: "Interno", precio_base_mxn: 5, categoria_id: "c-hamb", visible: false },
  { id: "malo/id", nombre: "Raro", precio_base_mxn: 5, categoria_id: "c-hamb" },
];

test("precios en centavos, sin decimales", () => {
  assert.equal(centavos("100.00"), 10000);
  assert.equal(centavos(25.5), 2550);
  assert.equal(centavos(0), 0);
  assert.equal(centavos("x"), 0);
});

test("ids: uuid sí, barra y punto y coma no", () => {
  assert.ok(idValidoUber("835291d7-3f8c-4a44-ab40-fa6db9e5d767"));
  assert.ok(!idValidoUber("a/b"));
  assert.ok(!idValidoUber("a;b"));
  assert.ok(!idValidoUber(""));
});

test("el ítem lleva el uuid de VIM como id y el precio en centavos; los excluidos dicen por qué", () => {
  const r = construirMenuUber(prods, cats);
  assert.equal(r.items, 3);
  const ids = (r.menu.items as { id: string }[]).map((i) => i.id);
  assert.deepEqual(ids, ["p-cheese", "p-agua", "p-sin-cat"]);
  const cheese = (r.menu.items as Record<string, unknown>[])[0];
  assert.deepEqual(cheese.price_info, { price: 10000 });
  assert.deepEqual(cheese.tax_info, { tax_rate: 16 });
  assert.deepEqual(cheese.title, { translations: { es_mx: "Cheese burger" } });
  assert.deepEqual(cheese.description, { translations: { es_mx: "Con queso" } });
  assert.deepEqual(r.excluidos.map((e) => e.motivo), ["agotado", "sin precio", "oculto en el POS", "id inválido para Uber"]);
});

test("categorías en su orden, sin las vacías, y «Otros» al final para los sueltos", () => {
  const r = construirMenuUber(prods, cats);
  assert.equal(r.categorias, 3);
  assert.deepEqual(r.menu.categories.map((c) => c.id), ["c-hamb", "c-bebidas", "otros"]);
  assert.deepEqual(r.menu.categories[0].entities, [{ id: "p-cheese", type: "ITEM" }]);
  assert.deepEqual(r.menu.categories[2].title, { translations: { es_mx: "Otros" } });
});

test("un solo menú «Carta», todos los días de 00:00 a 23:59, con todas las categorías", () => {
  const r = construirMenuUber(prods, cats, { titulo: "Carta Knock-Out" });
  const m = r.menu.menus[0] as { id: string; title: unknown; service_availability: { day_of_week: string; time_periods: unknown[] }[]; category_ids: string[] };
  assert.equal(m.id, "carta");
  assert.deepEqual(m.title, { translations: { es_mx: "Carta Knock-Out" } });
  assert.equal(m.service_availability.length, 7);
  assert.deepEqual(m.service_availability[0], { day_of_week: "monday", time_periods: [{ start_time: "00:00", end_time: "23:59" }] });
  assert.deepEqual(m.category_ids, ["c-hamb", "c-bebidas", "otros"]);
  assert.deepEqual(r.menu.modifier_groups, []);
});

test("sin productos válidos: menú vacío pero bien formado", () => {
  const r = construirMenuUber([{ id: "x", nombre: "x", precio_base_mxn: 0 }], []);
  assert.equal(r.items, 0);
  assert.equal(r.categorias, 0);
  assert.deepEqual((r.menu.menus[0] as { category_ids: string[] }).category_ids, []);
});
