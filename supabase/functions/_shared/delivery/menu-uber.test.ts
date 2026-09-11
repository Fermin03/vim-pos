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

test("un combo sin slots no se publica", () => {
  const r = construirMenuUber(
    [
      { id: "c1", nombre: "Combo sin armar", precio_base_mxn: 45, es_combo: true, n_slots: 0 },
      { id: "c2", nombre: "Combo armado", precio_base_mxn: 45, es_combo: true, n_slots: 3 },
      { id: "p1", nombre: "Hamburguesa", precio_base_mxn: 100 },
    ],
    [],
  );
  assert.deepEqual(r.excluidos.map((e) => [e.id, e.motivo]), [["c1", "combo sin slots"]]);
  assert.equal(r.items, 2);
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

// Formas mínimas de lo que Uber espera en `items`/`modifier_groups`, solo con los campos que
// estas pruebas leen — evita `any` al indexar el `unknown[]` que devuelve `construirMenuUber`.
type Ajuste = { context_type: "MODIFIER_GROUP"; context_value: string; price: number; core_price: number };
type AjusteCantidad = { context_type: "MODIFIER_GROUP"; context_value: string; quantity: { min_permitted: number; max_permitted: number } };
type ItemMenu = {
  id: string;
  price_info: { price: number; core_price: number; overrides: Ajuste[] };
  quantity_info: { overrides: AjusteCantidad[] };
  external_data: string;
  modifier_group_ids: { ids: string[] };
};
type GrupoMenu = {
  id: string;
  quantity_info: { quantity: { min_permitted: number; max_permitted: number } };
  modifier_options: { type: "ITEM"; id: string }[];
};

const GRUPOS = [
  { id: "g-term", nombre: "Término", tipo_seleccion: "UNICA_OBLIGATORIA" as const,
    minimo_selecciones: null, maximo_selecciones: null,
    opciones: [{ id: "o-34", nombre: "Tres cuartos", precio_extra_mxn: 0 },
               { id: "o-bien", nombre: "Bien cocida", precio_extra_mxn: 0 }],
    producto_ids: ["p1"] },
  { id: "g-extra", nombre: "Extras", tipo_seleccion: "MULTIPLE_OPCIONAL" as const,
    minimo_selecciones: null, maximo_selecciones: null,
    opciones: [{ id: "o-queso", nombre: "Extra queso", precio_extra_mxn: 15 },
               { id: "o-tocino", nombre: "Tocino", precio_extra_mxn: 20, agotada: true }],
    producto_ids: ["p1"] },
];

test("publica los grupos y sus opciones como ítems sin categoría", () => {
  const r = construirMenuUber([{ id: "p1", nombre: "Hamburguesa", precio_base_mxn: 100, categoria_id: "cat" }],
                              [{ id: "cat", nombre: "Hamburguesas", orden: 1 }],
                              { grupos: GRUPOS });
  const items = r.menu.items as ItemMenu[];
  // el producto lleva sus dos grupos, en orden
  assert.deepEqual(items.find((i) => i.id === "p1")!.modifier_group_ids.ids, ["g-term", "g-extra"]);
  // cada opción es un ítem con su precio y su external_data
  const queso = items.find((i) => i.id === "o-queso")!;
  assert.equal(queso.price_info.price, 1500);
  assert.equal(queso.price_info.core_price, 1500);
  assert.equal(queso.external_data, "o-queso");
  // la opción agotada no se publica
  assert.equal(items.find((i) => i.id === "o-tocino"), undefined);
  // las opciones NO están en ninguna categoría
  const enCategorias = r.menu.categories.flatMap((c) => c.entities.map((e) => e.id));
  assert.deepEqual(enCategorias, ["p1"]);
  assert.equal(r.grupos, 2);
  assert.equal(r.opcionesModificador, 3);
});

test("las cantidades salen del tipo de selección", () => {
  const base = { minimo_selecciones: null, maximo_selecciones: null, producto_ids: ["p1"],
                 opciones: [{ id: "a", nombre: "A", precio_extra_mxn: 0 }, { id: "b", nombre: "B", precio_extra_mxn: 0 }] };
  const r = construirMenuUber([{ id: "p1", nombre: "P", precio_base_mxn: 100 }], [], { grupos: [
    { ...base, id: "g1", nombre: "Única obligatoria", tipo_seleccion: "UNICA_OBLIGATORIA" },
    { ...base, id: "g2", nombre: "Única opcional", tipo_seleccion: "UNICA_OPCIONAL" },
    { ...base, id: "g3", nombre: "Múltiple opcional", tipo_seleccion: "MULTIPLE_OPCIONAL" },
    { ...base, id: "g4", nombre: "Rango", tipo_seleccion: "MULTIPLE_OBLIGATORIA_RANGO", minimo_selecciones: 1, maximo_selecciones: 2 },
  ] });
  const q = (id: string) => (r.menu.modifier_groups as GrupoMenu[]).find((g) => g.id === id)!.quantity_info.quantity;
  assert.deepEqual(q("g1"), { min_permitted: 1, max_permitted: 1 });
  assert.deepEqual(q("g2"), { min_permitted: 0, max_permitted: 1 });
  assert.deepEqual(q("g3"), { min_permitted: 0, max_permitted: 2 });
  assert.deepEqual(q("g4"), { min_permitted: 1, max_permitted: 2 });
});

test("un grupo sin opciones se cae; si era obligatorio, su producto tampoco se publica", () => {
  const r = construirMenuUber(
    [{ id: "p1", nombre: "Con obligatorio vacío", precio_base_mxn: 100 },
     { id: "p2", nombre: "Con opcional vacío", precio_base_mxn: 100 }],
    [],
    { grupos: [
      { id: "gv1", nombre: "Término", tipo_seleccion: "UNICA_OBLIGATORIA", minimo_selecciones: null, maximo_selecciones: null,
        opciones: [{ id: "x", nombre: "X", precio_extra_mxn: 0, agotada: true }], producto_ids: ["p1"] },
      { id: "gv2", nombre: "Extras", tipo_seleccion: "MULTIPLE_OPCIONAL", minimo_selecciones: null, maximo_selecciones: null,
        opciones: [{ id: "y", nombre: "Y", precio_extra_mxn: 0, agotada: true }], producto_ids: ["p2"] },
    ] });
  assert.deepEqual(r.excluidos.map((e) => [e.id, e.motivo]), [["p1", "grupo obligatorio sin opciones"]]);
  assert.deepEqual(r.menu.modifier_groups, []);
  const p2 = (r.menu.items as ItemMenu[]).find((i) => i.id === "p2")!;
  assert.deepEqual(p2.modifier_group_ids.ids, []);
});

test("sin grupos ni combos, la carta es exactamente la de hoy", () => {
  const productos = [{ id: "p1", nombre: "Hamburguesa", precio_base_mxn: 100, categoria_id: "cat" }];
  const categorias = [{ id: "cat", nombre: "Hamburguesas", orden: 1 }];
  const conParam = construirMenuUber(productos, categorias, { titulo: "Carta", grupos: [], combos: [] });
  const sinParam = construirMenuUber(productos, categorias, { titulo: "Carta" });
  assert.deepEqual(conParam.menu, sinParam.menu);
  assert.deepEqual(sinParam.menu.modifier_groups, []);
});

// --- Task 3: combos ---------------------------------------------------------

const COMBO = {
  producto_id: "c1",
  slots: [
    { id: "s-burger", nombre: "Hamburguesa", orden: 1, minimo_selecciones: 1, maximo_selecciones: 1,
      opciones: [{ producto_id: "p1", importe_mxn: 100 }, { producto_id: "p2", importe_mxn: 130 }] },
    { id: "s-papas", nombre: "Papas", orden: 2, minimo_selecciones: 1, maximo_selecciones: 1,
      opciones: [{ producto_id: "p3", importe_mxn: 0 }] },
  ],
};
const PRODS = [
  { id: "c1", nombre: "Combo", precio_base_mxn: 45, categoria_id: "cat", es_combo: true, n_slots: 2 },
  { id: "p1", nombre: "Sencilla", precio_base_mxn: 100, categoria_id: "cat" },
  { id: "p2", nombre: "Doble", precio_base_mxn: 130, categoria_id: "cat" },
  { id: "p3", nombre: "Papas", precio_base_mxn: 50, categoria_id: "cat" },
];

test("el combo publica sus slots y las opciones llevan el ajuste de precio por grupo", () => {
  const r = construirMenuUber(PRODS, [{ id: "cat", nombre: "Todo", orden: 1 }], { combos: [COMBO] });
  const items = r.menu.items as ItemMenu[];
  // el padre: precio base y sus slots en orden
  const padre = items.find((i) => i.id === "c1")!;
  assert.equal(padre.price_info.price, 4500);
  assert.deepEqual(padre.modifier_group_ids.ids, ["s-burger", "s-papas"]);
  // la Doble: $130 suelta, y dentro del slot aporta 130 con core_price 130
  const doble = items.find((i) => i.id === "p2")!;
  assert.equal(doble.price_info.price, 13000);
  assert.deepEqual(doble.price_info.overrides, [
    { context_type: "MODIFIER_GROUP", context_value: "s-burger", price: 13000, core_price: 13000 },
  ]);
  assert.deepEqual(doble.quantity_info.overrides, [
    { context_type: "MODIFIER_GROUP", context_value: "s-burger", quantity: { min_permitted: 0, max_permitted: 1 } },
  ]);
  // las papas aportan 0 dentro del combo pero valen 50 sueltas
  const papas = items.find((i) => i.id === "p3")!;
  assert.equal(papas.price_info.overrides[0].price, 0);
  assert.equal(papas.price_info.overrides[0].core_price, 5000);
  // los slots son grupos con sus cantidades
  const slot = (r.menu.modifier_groups as GrupoMenu[]).find((g) => g.id === "s-burger")!;
  assert.deepEqual(slot.quantity_info.quantity, { min_permitted: 1, max_permitted: 1 });
  assert.deepEqual(slot.modifier_options, [{ type: "ITEM", id: "p1" }, { type: "ITEM", id: "p2" }]);
  assert.equal(r.combos, 1);
});

test("el segundo nivel se conserva: el hijo mantiene sus propios grupos", () => {
  const r = construirMenuUber(PRODS, [], {
    combos: [COMBO],
    grupos: [{ id: "g-term", nombre: "Término", tipo_seleccion: "UNICA_OBLIGATORIA",
               minimo_selecciones: null, maximo_selecciones: null,
               opciones: [{ id: "o-34", nombre: "Tres cuartos", precio_extra_mxn: 0 }],
               producto_ids: ["p2"] }],
  });
  const doble = (r.menu.items as ItemMenu[]).find((i) => i.id === "p2")!;
  assert.deepEqual(doble.modifier_group_ids.ids, ["g-term"]);
});

test("un slot sin opciones publicables tumba el combo entero", () => {
  const r = construirMenuUber(PRODS, [], {
    combos: [{ ...COMBO, slots: [COMBO.slots[0]!, { ...COMBO.slots[1]!, opciones: [] }] }],
  });
  assert.deepEqual(r.excluidos.map((e) => [e.id, e.motivo]), [["c1", "slot sin opciones"]]);
  assert.equal((r.menu.items as ItemMenu[]).find((i) => i.id === "c1"), undefined);
  // sus slots tampoco se publican
  assert.deepEqual(r.menu.modifier_groups, []);
});

test("una opción de slot que no está en la carta no cuenta", () => {
  const r = construirMenuUber(
    [PRODS[0]!, PRODS[2]!, PRODS[3]!],  // sin p1
    [],
    { combos: [COMBO] },
  );
  const slot = (r.menu.modifier_groups as GrupoMenu[]).find((g) => g.id === "s-burger")!;
  assert.deepEqual(slot.modifier_options, [{ type: "ITEM", id: "p2" }]);
});

test("una opción de slot agotada no cuenta; si era la única, el combo se cae", () => {
  // p1 está presente (no ausente de `productos`, a diferencia de la prueba anterior) pero agotado:
  // `enCarta` debe usar el mismo criterio de exclusión que el resto de la función, no solo
  // "está en el array", o Uber recibiría un modifier_option que apunta a un ítem inexistente.
  const prods = PRODS.map((p) => (p.id === "p1" ? { ...p, agotado: true } : p));
  const r = construirMenuUber(prods, [], {
    combos: [{ ...COMBO, slots: [{ ...COMBO.slots[0]!, opciones: [{ producto_id: "p1", importe_mxn: 100 }] }, COMBO.slots[1]!] }],
  });
  assert.deepEqual(r.excluidos.map((e) => [e.id, e.motivo]), [["c1", "slot sin opciones"], ["p1", "agotado"]]);
  assert.deepEqual(r.menu.modifier_groups, []);
});
