# Combos y modificadores en Uber Eats — plan de implementación (entrega 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un cliente de Uber Eats pueda pedir extras y término, y armar un combo eligiendo hamburguesa, acompañamiento y bebida, y que ese pedido entre a la caja como un ticket correcto.

**Architecture:** Uber suma igual que nosotros: el precio de un combo allá es el del ítem padre más lo que cueste cada opción elegida dentro de su grupo, que es la misma cuenta que hace `agregar_combo_a_ticket`. Un grupo de modificadores y un slot de combo se publican los dos como `modifier_group`; las opciones de modificador se publican como ítems sin categoría (no se venden solos) y las opciones de un slot son los productos reales que ya están en la carta, con un ajuste de precio por grupo para que la Doble valga $130 suelta y aporte lo que le toque dentro del combo. Al recibir el pedido, el normalizador conserva el id del grupo y baja un nivel de anidamiento, y `crear_ticket_desde_app` bifurca a `agregar_combo_a_ticket` cuando el producto es un combo.

**Tech Stack:** TypeScript puro sobre Deno para las Edge Functions (probado con el runner de Node, sin Deno), Postgres/plpgsql bajo RLS, Node ESM en el escritorio, y la Menu API v2 de Uber Eats (`PUT /v2/eats/stores/{id}/menus`).

**Spec:** `docs/superpowers/specs/2026-09-10-combos-uber-design.md`. Antecedente: `docs/superpowers/specs/2026-09-08-combos-design.md` (entrega 1, en producción). ADRs: `docs/decisiones/0015-los-combos-son-un-producto-con-slots.md` y `docs/decisiones/0011-integracion-apps-de-delivery.md`.

## Global Constraints

- **Rama:** `combos-uber`, creada desde `origin/main`. Trabajar en un worktree propio (`vim-pos-uber/`), NO en `vim-pos/`: otras sesiones cambian de rama ahí. Copiar `desktop/bin/postgrest.exe` y `supabase/.temp/` al worktree si hacen falta (el `cp -r` deja los archivos de `.temp` vacíos: escribirlos uno por uno).
- **Numeración de migraciones:** la última en `main` es `0111_combos.sql`. Esta entrega usa la **siguiente libre**, que hay que comprobar con `supabase migration list --linked` **antes de fijarla y otra vez antes de publicar**. `main` tomó el 0110 mientras se construía la entrega 1: no dar por buena ninguna numeración.
- **Versión del escritorio:** `main` está en `0.4.67`. Comprobar `desktop/package.json` en `main` antes de subirla y usar la siguiente libre.
- **El id que viaja a Uber es el uuid de VIM** (ADR 0011), y va además en `external_data` en los tres niveles: ítem, grupo y opción. No hay tabla de mapeo.
- **El precio que manda es el de Uber.** Uber cotiza con la carta publicada y cobra antes de que el POS se entere; el ticket se cuadra con lo cobrado, no con el catálogo actual.
- **Dos APIs distintas de Uber, no confundirlas:** la carta se publica con la **Menu API v2** (`PUT /v2/eats/stores/{id}/menus`, precios en **centavos enteros**), pero el pedido se lee con **`GET /v1/delivery/order/{id}`**, donde el dinero viene en **`amount_e5`** (pesos × 100 000) dentro de un objeto money con `net`/`tax`/`gross`. `uber.ts` ya trae `e5ADecimal` y `dec` para eso.
- **Dos niveles como máximo:** combo → slot → producto → sus modificadores. No bajar más.
- **Un combo publica solo sus slots**, nunca sus propios grupos de modificadores.
- **`menu-uber.ts` es un módulo PURO**: no consulta la base, recibe lo que ya leyó `delivery-uber-conexion`. Se prueba con `node --test`.
- **Un restaurante sin combos ni modificadores debe publicar y recibir exactamente igual que hoy.** Hay una prueba dedicada a eso.
- **Dinero:** `numeric(12,2)` en la base; en la carta, centavos enteros vía `centavos()`. Nunca flotantes.
- **RLS sagrado:** ninguna ruta de `apps/*` usa `service_role`; las Edge Functions sí, server-side.
- **Sin `any`**; español en el dominio; archivos `kebab-case`; los comentarios explican el porqué.
- Commits en español, terminados exactamente con:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/functions/_shared/delivery/menu-uber.ts` | construir la carta: tipos nuevos, grupos de modificadores, combos, IVA |
| `supabase/functions/_shared/delivery/menu-uber.test.ts` | sus pruebas, incluida la de «sin modificadores sale igual que hoy» |
| `supabase/functions/delivery-uber-conexion/index.ts` | la acción `menu`: consultar grupos, opciones, slots y resolver importes |
| `supabase/functions/_shared/delivery/tipos.ts` | `ModificadorNormalizado` gana `grupo_id` y `modificadores` |
| `supabase/functions/_shared/delivery/uber.ts` | `normalizarPedidoUber`: grupo, precio por opción, anidamiento, `removed_items` |
| `supabase/functions/_shared/delivery/uber.test.ts` | sus pruebas |
| `supabase/functions/_shared/delivery/procesar-uber.ts` | dos predicados en vez de un conjunto; `combo_grupos` en la consulta por lote |
| `supabase/migrations/<NNNN>_combos_uber.sql` | `reprorratear_combo` y `crear_ticket_desde_app` con la rama de combo |
| `supabase/scripts/smoke_combos_uber.sql` | el smoke de la RPC con un pedido de combo |
| `desktop/src/delivery-espejo.mjs` | traducir los errores de combo a algo legible |
| `desktop/src/delivery-espejo.test.mjs` | su prueba |
| `apps/admin/app/lib/integraciones.ts` | el resumen gana grupos y opciones |
| `apps/admin/app/(panel)/configuracion/integraciones/page.tsx` | mostrarlos |
| `desktop/package.json` | versión nueva |
| `docs/operacion/delivery-uber-sandbox.md` | el guion de la prueba real |

---

### Task 0: Rama, numeración y línea base

**Files:** ninguno.

- [ ] **Step 1: Worktree y rama desde `origin/main`**

```bash
cd "D:/Users/Fermi/Documents/VIM MARKETING/Vim-marketing managment/PROYECTOS/VIM POS/vim-pos"
git fetch origin main
git worktree add -b combos-uber ../vim-pos-uber origin/main
cd ../vim-pos-uber && pnpm install --frozen-lockfile
```

- [ ] **Step 2: Comprobar numeración y versión**

```bash
ls supabase/migrations/ | tail -3
grep -m1 '"version"' desktop/package.json
```
Expected: la última migración es `0111_combos.sql` y el escritorio está en `0.4.67`. Si no, usar los siguientes libres y ajustar este plan.

- [ ] **Step 3: Línea base verde**

```bash
pnpm turbo run typecheck && pnpm -r test && pnpm test:functions && pnpm test:escritorio
cd desktop && npm run smokes && cd ..
```
Expected: typecheck 6/6; pos 170, admin 93, platform 43, fecha 13; functions 126; escritorio 86; smokes 35/35. Anotar los números: son la referencia de las tareas siguientes.

---

### Task 1: Guardarraíl — un combo sin slots no se publica

**Files:**
- Modify: `supabase/functions/_shared/delivery/menu-uber.ts` (tipo `ProductoCarta`, cadena de exclusión)
- Modify: `supabase/functions/_shared/delivery/menu-uber.test.ts`
- Modify: `supabase/functions/delivery-uber-conexion/index.ts` (acción `menu`)

**Interfaces:**
- Produces: `ProductoCarta` gana `es_combo?: boolean` y `n_slots?: number`; motivo de exclusión nuevo `"combo sin slots"`.

Va primero y solo porque cierra un riesgo vivo: hoy un combo sin configurar se publica plano al precio de «hacerlo combo» y su pedido revienta al crear el ticket.

- [ ] **Step 1: Escribir la prueba que falla**

En `menu-uber.test.ts`, dentro del bloque de exclusiones:

```ts
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
```

- [ ] **Step 2: Correr y ver fallar**

Run: `pnpm test:functions`
Expected: FAIL — hoy se publican los tres.

- [ ] **Step 3: Implementar**

En `menu-uber.ts`, `ProductoCarta` gana dos campos:

```ts
  /** true si es un combo (productos.es_combo). Un combo sin slots no se puede vender. */
  es_combo?: boolean;
  /** Nº de slots activos del combo. Solo se mira cuando `es_combo`. */
  n_slots?: number;
```

Y en la cadena de exclusión de `construirMenuUber`, **después** de `"sin precio"`:

```ts
      : p.es_combo && !(p.n_slots && p.n_slots > 0) ? "combo sin slots"
```

- [ ] **Step 4: Contar los slots en la acción `menu`**

En `delivery-uber-conexion/index.ts`, la consulta paralela gana una tercera entrada:

```ts
          admin.from("combo_grupos").select("combo_producto_id").eq("tenant_id", tenantId).eq("activo", true).is("deleted_at", null),
```

y el `select` de `productos` gana `es_combo`. Antes del mapeo:

```ts
        const slotsPorCombo = new Map<string, number>();
        for (const g of ((grupos ?? []) as Record<string, unknown>[])) {
          const k = String(g.combo_producto_id);
          slotsPorCombo.set(k, (slotsPorCombo.get(k) ?? 0) + 1);
        }
```

y el objeto `ProductoCarta` gana:

```ts
          es_combo: p.es_combo === true,
          n_slots: slotsPorCombo.get(String(p.id)) ?? 0,
```

- [ ] **Step 5: Verde**

```bash
pnpm test:functions
```
Expected: PASS, incluidas las pruebas previas del módulo.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions
git commit -m "fix(uber): un combo sin slots no se publica en la carta" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Publicar grupos de modificadores

**Files:**
- Modify: `supabase/functions/_shared/delivery/menu-uber.ts`
- Modify: `supabase/functions/_shared/delivery/menu-uber.test.ts`

**Interfaces:**
- Consumes: `ProductoCarta` de la Task 1.
- Produces:
  - `export type GrupoModificadorCarta = { id, nombre, tipo_seleccion, minimo_selecciones, maximo_selecciones, opciones, producto_ids }` con `opciones: { id: string; nombre: string; precio_extra_mxn: number | string; agotada?: boolean }[]` y `producto_ids: string[]`.
  - `construirMenuUber(productos, categorias, opciones)` donde `opciones` gana `grupos?: GrupoModificadorCarta[]`.
  - Motivo de exclusión nuevo: `"grupo obligatorio sin opciones"`.
  - El resultado gana `grupos: number` y `opcionesModificador: number`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
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
  const items = r.menu.items as Record<string, any>[];
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
  const q = (id: string) => (r.menu.modifier_groups as Record<string, any>[]).find((g) => g.id === id)!.quantity_info.quantity;
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
  const p2 = (r.menu.items as Record<string, any>[]).find((i) => i.id === "p2")!;
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
```

- [ ] **Step 2: Correr y ver fallar**

Run: `pnpm test:functions`
Expected: FAIL — `opciones.grupos` no existe y `r.grupos` es `undefined`.

- [ ] **Step 3: Implementar**

En `menu-uber.ts`, el tipo nuevo:

```ts
export type GrupoModificadorCarta = {
  id: string;
  nombre: string;
  tipo_seleccion: "UNICA_OBLIGATORIA" | "UNICA_OPCIONAL" | "MULTIPLE_OPCIONAL" | "MULTIPLE_OBLIGATORIA_RANGO";
  minimo_selecciones: number | null;
  maximo_selecciones: number | null;
  opciones: { id: string; nombre: string; precio_extra_mxn: number | string; agotada?: boolean }[];
  /** Productos a los que se aplica, en el orden en que los pide la caja. */
  producto_ids: string[];
};
```

Un helper puro, exportado para poder probarlo:

```ts
/**
 * Cantidades del grupo según su tipo (enum `modificador_tipo_seleccion`, 0007). Uber necesita
 * min/max explícitos; el POS los deduce del tipo salvo en el rango, que sí los guarda.
 */
export function cantidadesDeGrupo(
  g: Pick<GrupoModificadorCarta, "tipo_seleccion" | "minimo_selecciones" | "maximo_selecciones">,
  nOpciones: number,
): { min_permitted: number; max_permitted: number } {
  switch (g.tipo_seleccion) {
    case "UNICA_OBLIGATORIA": return { min_permitted: 1, max_permitted: 1 };
    case "UNICA_OPCIONAL": return { min_permitted: 0, max_permitted: 1 };
    case "MULTIPLE_OPCIONAL": return { min_permitted: 0, max_permitted: Math.max(1, nOpciones) };
    case "MULTIPLE_OBLIGATORIA_RANGO":
      return { min_permitted: g.minimo_selecciones ?? 1, max_permitted: g.maximo_selecciones ?? Math.max(1, nOpciones) };
  }
}
```

En `construirMenuUber`, la firma pasa a:

```ts
  opciones: { titulo?: string; grupos?: GrupoModificadorCarta[]; combos?: ComboCarta[] } = {},
```

**Antes** del bucle de productos, se resuelven los grupos publicables:

```ts
  // Un grupo sin opciones rompe la sincronización de la carta entera (documentado por Toast), así
  // que no se publica. Si era obligatorio, su producto queda inordenable: se excluye también.
  const gruposVivos = (opciones.grupos ?? [])
    .map((g) => ({ ...g, opciones: g.opciones.filter((o) => !o.agotada && idValidoUber(o.id)) }))
    .filter((g) => g.opciones.length > 0);
  const gruposPorProducto = new Map<string, string[]>();
  for (const g of gruposVivos) for (const pid of g.producto_ids) {
    gruposPorProducto.set(pid, [...(gruposPorProducto.get(pid) ?? []), g.id]);
  }
  const obligatorioVacio = new Set<string>();
  for (const g of opciones.grupos ?? []) {
    const vivo = gruposVivos.some((v) => v.id === g.id);
    const obligatorio = g.tipo_seleccion === "UNICA_OBLIGATORIA" || g.tipo_seleccion === "MULTIPLE_OBLIGATORIA_RANGO";
    if (!vivo && obligatorio) for (const pid of g.producto_ids) obligatorioVacio.add(pid);
  }
```

La cadena de exclusión gana un eslabón **después** de `"combo sin slots"`:

```ts
      : obligatorioVacio.has(p.id) ? "grupo obligatorio sin opciones"
```

El ítem del producto deja de llevar la lista vacía:

```ts
      modifier_group_ids: { ids: gruposPorProducto.get(p.id) ?? [] },
```

**Después** del bucle de productos, las opciones se publican como ítems (fuera de toda categoría) y se arman los grupos:

```ts
  const modifierGroups: unknown[] = [];
  let nOpciones = 0;
  for (const g of gruposVivos) {
    for (const o of g.opciones) {
      const precio = Math.max(0, Math.round(Number(o.precio_extra_mxn) * 100) || 0);
      items.push({
        id: o.id,
        title: texto(o.nombre || "Opción"),
        // Uber SUMA el precio de la opción al del padre, así que aquí va el extra tal cual.
        // `core_price` es lo que Uber usa para calcular un reembolso parcial.
        price_info: { price: precio, core_price: precio },
        tax_info: { tax_rate: 16 },
        quantity_info: {},
        modifier_group_ids: { ids: [] },
        external_data: o.id,
      });
      nOpciones += 1;
    }
    modifierGroups.push({
      id: g.id,
      external_data: g.id,
      title: texto(g.nombre || "Opciones"),
      quantity_info: { quantity: cantidadesDeGrupo(g, g.opciones.length) },
      modifier_options: g.opciones.map((o) => ({ type: "ITEM" as const, id: o.id })),
      display_type: "expanded",
    });
  }
```

`menu.modifier_groups` pasa de `[]` a `modifierGroups`, y el retorno gana los conteos:

```ts
  return { menu, items: items.length, categorias: categories.length, grupos: modifierGroups.length, opcionesModificador: nOpciones, excluidos };
```

(El tipo de retorno de la firma se amplía igual.)

> Ojo con el orden: las opciones se empujan a `items` **después** del bucle de productos, así que
> `porCategoria` ya está cerrado y no pueden colarse en ninguna categoría. Es justo lo que exige la
> prueba «las opciones NO están en ninguna categoría».

- [ ] **Step 4: Verde**

```bash
pnpm test:functions
```
Expected: PASS. La prueba `menu-uber.test.ts:63` que fijaba `modifier_groups: []` sigue pasando porque su caso no pasa grupos.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions
git commit -m "feat(uber): publicar grupos de modificadores y sus opciones en la carta" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Publicar combos

**Files:**
- Modify: `supabase/functions/_shared/delivery/menu-uber.ts`
- Modify: `supabase/functions/_shared/delivery/menu-uber.test.ts`

**Interfaces:**
- Consumes: todo lo de la Task 2.
- Produces:
  - `export type ComboCarta = { producto_id: string; slots: { id: string; nombre: string; orden: number; minimo_selecciones: number; maximo_selecciones: number; opciones: { producto_id: string; importe_mxn: number | string }[] }[] }`
  - `opciones.combos?: ComboCarta[]`; motivo de exclusión nuevo `"slot sin opciones"`; el resultado gana `combos: number`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
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
  const items = r.menu.items as Record<string, any>[];
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
  const slot = (r.menu.modifier_groups as Record<string, any>[]).find((g) => g.id === "s-burger")!;
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
  const doble = (r.menu.items as Record<string, any>[]).find((i) => i.id === "p2")!;
  assert.deepEqual(doble.modifier_group_ids.ids, ["g-term"]);
});

test("un slot sin opciones publicables tumba el combo entero", () => {
  const r = construirMenuUber(PRODS, [], {
    combos: [{ ...COMBO, slots: [COMBO.slots[0]!, { ...COMBO.slots[1]!, opciones: [] }] }],
  });
  assert.deepEqual(r.excluidos.map((e) => [e.id, e.motivo]), [["c1", "slot sin opciones"]]);
  assert.equal((r.menu.items as Record<string, any>[]).find((i) => i.id === "c1"), undefined);
  // sus slots tampoco se publican
  assert.deepEqual(r.menu.modifier_groups, []);
});

test("una opción de slot que no está en la carta no cuenta", () => {
  const r = construirMenuUber(
    [PRODS[0]!, PRODS[2]!, PRODS[3]!],  // sin p1
    [],
    { combos: [COMBO] },
  );
  const slot = (r.menu.modifier_groups as Record<string, any>[]).find((g) => g.id === "s-burger")!;
  assert.deepEqual(slot.modifier_options, [{ type: "ITEM", id: "p2" }]);
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `pnpm test:functions`
Expected: FAIL — `opciones.combos` no existe.

- [ ] **Step 3: Implementar**

El tipo:

```ts
export type ComboCarta = {
  producto_id: string;
  slots: {
    id: string;
    nombre: string;
    orden: number;
    minimo_selecciones: number;
    maximo_selecciones: number;
    /** Ya resueltas por quien consulta: categoría o lista, exclusiones aplicadas, agotados fuera.
     *  `importe_mxn` es lo que la opción aporta al precio del combo, con la fórmula del servidor. */
    opciones: { producto_id: string; importe_mxn: number | string }[];
  }[];
};
```

El trabajo se hace en dos momentos. **Antes** del bucle de productos, se decide qué combos son publicables y qué ajustes lleva cada producto:

```ts
  // Un combo al que le falta un slot es inordenable en Uber (rechazo MISSING_ITEM): no se publica.
  // Las opciones que ya no están en la carta (agotadas, ocultas) simplemente no cuentan.
  const enCarta = new Set(productos.map((p) => p.id));
  const combosVivos: ComboCarta[] = [];
  const comboSinSlot = new Set<string>();
  for (const c of opciones.combos ?? []) {
    const slots = [...c.slots].sort((a, b) => a.orden - b.orden)
      .map((s) => ({ ...s, opciones: s.opciones.filter((o) => enCarta.has(o.producto_id) && idValidoUber(o.producto_id)) }));
    if (slots.length === 0 || slots.some((s) => s.opciones.length === 0)) { comboSinSlot.add(c.producto_id); continue; }
    combosVivos.push({ ...c, slots });
  }
  const slotsPorCombo = new Map<string, string[]>();
  /** producto → ajustes que le tocan por estar en un slot. */
  const ajustesPrecio = new Map<string, { context_type: "MODIFIER_GROUP"; context_value: string; price: number; core_price: number }[]>();
  const ajustesCantidad = new Map<string, { context_type: "MODIFIER_GROUP"; context_value: string; quantity: { min_permitted: number; max_permitted: number } }[]>();
  for (const c of combosVivos) {
    slotsPorCombo.set(c.producto_id, c.slots.map((s) => s.id));
    for (const s of c.slots) for (const o of s.opciones) {
      const suelto = centavos(productos.find((p) => p.id === o.producto_id)?.precio_base_mxn ?? 0);
      ajustesPrecio.set(o.producto_id, [...(ajustesPrecio.get(o.producto_id) ?? []),
        { context_type: "MODIFIER_GROUP", context_value: s.id,
          price: Math.max(0, Math.round(Number(o.importe_mxn) * 100) || 0), core_price: suelto }]);
      ajustesCantidad.set(o.producto_id, [...(ajustesCantidad.get(o.producto_id) ?? []),
        { context_type: "MODIFIER_GROUP", context_value: s.id,
          quantity: { min_permitted: 0, max_permitted: 1 } }]);
    }
  }
```

La cadena de exclusión gana un eslabón más, **después** de `"grupo obligatorio sin opciones"`:

```ts
      : comboSinSlot.has(p.id) ? "slot sin opciones"
```

En la construcción del ítem, los slots se suman a los grupos del producto y se añaden los ajustes:

```ts
      modifier_group_ids: { ids: [...(gruposPorProducto.get(p.id) ?? []), ...(slotsPorCombo.get(p.id) ?? [])] },
```

y justo después de crear `item`:

```ts
    const ajP = ajustesPrecio.get(p.id);
    if (ajP?.length) item.price_info = { price: precio, overrides: ajP };
    const ajC = ajustesCantidad.get(p.id);
    if (ajC?.length) item.quantity_info = { quantity: {}, overrides: ajC };
```

> El orden importa: los slots van **después** de los grupos de modificadores en `modifier_group_ids`,
> porque un combo no tiene grupos propios publicados (invariante del spec) y un producto que es opción
> de un slot sí puede tener los suyos, que deben aparecer primero.

**Después** del bucle, los slots se publican como grupos, junto a los de modificadores:

```ts
  for (const c of combosVivos) {
    for (const s of c.slots) {
      modifierGroups.push({
        id: s.id,
        external_data: s.id,
        title: texto(s.nombre || "Elige"),
        quantity_info: { quantity: { min_permitted: s.minimo_selecciones, max_permitted: s.maximo_selecciones } },
        modifier_options: s.opciones.map((o) => ({ type: "ITEM" as const, id: o.producto_id })),
        display_type: "expanded",
      });
    }
  }
```

Y el retorno gana `combos: combosVivos.length`.

- [ ] **Step 4: Verde**

```bash
pnpm test:functions
```
Expected: PASS, incluidas todas las de la Task 2 y la de «sin grupos ni combos, la carta es la de hoy».

- [ ] **Step 5: Commit**

```bash
git add supabase/functions
git commit -m "feat(uber): publicar combos con sus slots y el ajuste de precio por grupo" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: IVA como `vat_rate_percentage`

**Files:**
- Modify: `supabase/functions/_shared/delivery/menu-uber.ts`
- Modify: `supabase/functions/_shared/delivery/menu-uber.test.ts`

Es un defecto que ya estaba: `docs/integraciones/delivery/03-uber-eats-resumen.md:167-170` dice que para México, con precio con IVA incluido, corresponde `vat_rate_percentage` y no `tax_rate`.

- [ ] **Step 1: Escribir la prueba que falla**

```ts
test("el IVA viaja como vat_rate_percentage (México, precio con IVA incluido)", () => {
  const r = construirMenuUber(
    [{ id: "p1", nombre: "Hamburguesa", precio_base_mxn: 100, tasa_iva: 16 },
     { id: "p2", nombre: "Pan para llevar", precio_base_mxn: 30, tasa_iva: 0 }],
    [],
    { grupos: [{ id: "g", nombre: "Extras", tipo_seleccion: "MULTIPLE_OPCIONAL",
                 minimo_selecciones: null, maximo_selecciones: null,
                 opciones: [{ id: "o", nombre: "Queso", precio_extra_mxn: 15 }], producto_ids: ["p1"] }] },
  );
  const items = r.menu.items as Record<string, any>[];
  assert.deepEqual(items.find((i) => i.id === "p1")!.tax_info, { vat_rate_percentage: 16 });
  assert.deepEqual(items.find((i) => i.id === "p2")!.tax_info, { vat_rate_percentage: 0 });
  assert.deepEqual(items.find((i) => i.id === "o")!.tax_info, { vat_rate_percentage: 16 });
  assert.equal("tax_rate" in items[0]!.tax_info, false);
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `pnpm test:functions`
Expected: FAIL — hoy sale `{ tax_rate: 16 }`.

- [ ] **Step 3: Implementar**

En el ítem del producto:

```ts
      tax_info: { vat_rate_percentage: Math.max(0, Number(p.tasa_iva ?? 16) || 0) },
```

y en el de la opción de modificador, `tax_info: { vat_rate_percentage: 16 }`.

Actualizar el caso viejo de `menu-uber.test.ts` que afirmaba `tax_info: { tax_rate: … }`.

- [ ] **Step 4: Verde y commit**

```bash
pnpm test:functions
git add supabase/functions
git commit -m "fix(uber): el IVA viaja como vat_rate_percentage, no como tax_rate" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: La acción `menu` consulta y resuelve

**Files:**
- Modify: `supabase/functions/delivery-uber-conexion/index.ts` (acción `menu`)
- Modify: `apps/admin/app/lib/integraciones.ts`
- Modify: `apps/admin/app/(panel)/configuracion/integraciones/page.tsx`

**Interfaces:**
- Consumes: `GrupoModificadorCarta` y `ComboCarta` de las Tasks 2 y 3.
- Produces: la respuesta de la acción `menu` gana `grupos: number` y `opciones: number`.

Esta tarea no tiene prueba automática: la función toca Supabase y el repo no prueba las Edge Functions con base. Se verifica leyendo y, de verdad, en la Task 9.

- [ ] **Step 1: Ampliar la consulta**

Las cinco consultas nuevas van en el mismo `Promise.all`:

```ts
          admin.from("grupos_modificadores").select("id, nombre, tipo_seleccion, minimo_selecciones, maximo_selecciones")
            .eq("tenant_id", tenantId).eq("activo", true).is("deleted_at", null),
          admin.from("opciones_modificador").select("id, grupo_id, nombre, precio_extra_mxn, agotada")
            .eq("tenant_id", tenantId).eq("activa", true).is("deleted_at", null),
          admin.from("productos_grupos_modificadores").select("producto_id, grupo_id, orden_visualizacion")
            .eq("tenant_id", tenantId),
          admin.from("combo_grupos").select("id, combo_producto_id, nombre, orden_visualizacion, minimo_selecciones, maximo_selecciones, modo_precio, categoria_id")
            .eq("tenant_id", tenantId).eq("activo", true).is("deleted_at", null),
          admin.from("combo_opciones").select("grupo_id, producto_id, precio_delta_mxn, activa")
            .eq("tenant_id", tenantId).is("deleted_at", null),
```

(La de `combo_grupos` de la Task 1 se sustituye por esta, que trae más columnas; el conteo de slots sale de ella.)

- [ ] **Step 2: Armar los grupos de modificadores**

```ts
        const opcionesPorGrupo = new Map<string, { id: string; nombre: string; precio_extra_mxn: number | string; agotada?: boolean }[]>();
        for (const o of ((opcs ?? []) as Record<string, unknown>[])) {
          const k = String(o.grupo_id);
          opcionesPorGrupo.set(k, [...(opcionesPorGrupo.get(k) ?? []),
            { id: String(o.id), nombre: String(o.nombre ?? ""), precio_extra_mxn: o.precio_extra_mxn as number, agotada: o.agotada === true }]);
        }
        const productosPorGrupo = new Map<string, { pid: string; orden: number }[]>();
        for (const r of ((links ?? []) as Record<string, unknown>[])) {
          const k = String(r.grupo_id);
          productosPorGrupo.set(k, [...(productosPorGrupo.get(k) ?? []),
            { pid: String(r.producto_id), orden: Number(r.orden_visualizacion ?? 0) }]);
        }
        const gruposCarta: GrupoModificadorCarta[] = ((grupos ?? []) as Record<string, unknown>[]).map((g) => ({
          id: String(g.id), nombre: String(g.nombre ?? ""),
          tipo_seleccion: g.tipo_seleccion as GrupoModificadorCarta["tipo_seleccion"],
          minimo_selecciones: (g.minimo_selecciones as number | null) ?? null,
          maximo_selecciones: (g.maximo_selecciones as number | null) ?? null,
          opciones: opcionesPorGrupo.get(String(g.id)) ?? [],
          producto_ids: (productosPorGrupo.get(String(g.id)) ?? []).sort((a, b) => a.orden - b.orden).map((x) => x.pid),
        }));
```

- [ ] **Step 3: Armar los combos, resolviendo las opciones de cada slot**

La resolución debe dar **el mismo conjunto** que la caja y que `agregar_combo_a_ticket` (`0111_combos.sql:339-350`): con `categoria_id`, todos los productos activos, visibles y no-combo de esa categoría, donde una fila explícita solo aporta delta o excluye (`activa = false`); sin `categoria_id`, exactamente las filas explícitas activas.

```ts
        const opcsPorSlot = new Map<string, Record<string, unknown>[]>();
        for (const o of ((cOpcs ?? []) as Record<string, unknown>[])) {
          const k = String(o.grupo_id);
          opcsPorSlot.set(k, [...(opcsPorSlot.get(k) ?? []), o]);
        }
        // Índice de productos vendibles: mismo criterio que la caja (activo, visible, no combo).
        const vendibles = new Map(productos.filter((p) => !p.es_combo && p.visible !== false && !p.agotado).map((p) => [p.id, p]));
        const slotsPorProducto = new Map<string, ComboCarta["slots"]>();
        for (const s of ((cGrupos ?? []) as Record<string, unknown>[])) {
          const explicitas = opcsPorSlot.get(String(s.id)) ?? [];
          const excluidos = new Set(explicitas.filter((o) => o.activa === false).map((o) => String(o.producto_id)));
          const delta = new Map(explicitas.filter((o) => o.activa !== false).map((o) => [String(o.producto_id), Number(o.precio_delta_mxn ?? 0)]));
          const suma = s.modo_precio === "SUMA_PRECIO_PRODUCTO";
          const candidatos = s.categoria_id
            ? [...vendibles.values()].filter((p) => p.categoria_id === String(s.categoria_id) && !excluidos.has(p.id))
            : [...delta.keys()].flatMap((pid) => { const p = vendibles.get(pid); return p ? [p] : []; });
          const opcsSlot = candidatos.map((p) => ({
            producto_id: p.id,
            importe_mxn: (suma ? Number(p.precio_base_mxn) : 0) + (delta.get(p.id) ?? 0),
          }));
          const cid = String(s.combo_producto_id);
          slotsPorProducto.set(cid, [...(slotsPorProducto.get(cid) ?? []), {
            id: String(s.id), nombre: String(s.nombre ?? ""), orden: Number(s.orden_visualizacion ?? 0),
            minimo_selecciones: Number(s.minimo_selecciones ?? 1), maximo_selecciones: Number(s.maximo_selecciones ?? 1),
            opciones: opcsSlot,
          }]);
        }
        const combosCarta: ComboCarta[] = [...slotsPorProducto.entries()].map(([producto_id, slots]) => ({ producto_id, slots }));
```

- [ ] **Step 4: Pasarlo todo y devolver los conteos**

```ts
        const carta = construirMenuUber(productos, categorias, {
          titulo: cx.tienda_nombre_app ? `Carta · ${cx.tienda_nombre_app}` : "Carta",
          grupos: gruposCarta, combos: combosCarta,
        });
```

y el retorno, el `registrar` y el `config` guardado ganan `grupos: carta.grupos` y `opciones: carta.opcionesModificador`.

- [ ] **Step 5: El admin los muestra**

En `apps/admin/app/lib/integraciones.ts`, la sobrecarga de `"menu"` devuelve además `grupos: number; opciones: number`. En `page.tsx`, el aviso pasa a decir: `Carta enviada a Uber: N productos, G grupos de opciones y M categorías`.

- [ ] **Step 6: Typecheck y commit**

```bash
pnpm turbo run typecheck && pnpm --filter @vim/admin test
git add supabase/functions apps/admin
git commit -m "feat(uber): la acción menu consulta modificadores y combos y los publica" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: El normalizador del pedido

**Files:**
- Modify: `supabase/functions/_shared/delivery/tipos.ts`
- Modify: `supabase/functions/_shared/delivery/uber.ts` (`normalizarPedidoUber`, 77-115)
- Modify: `supabase/functions/_shared/delivery/uber.test.ts`
- Modify: `supabase/functions/_shared/delivery/procesar-uber.ts` (`idsDeLaOrden` 59-70, y el bloque de conocidos 92-100)

**Interfaces:**
- Produces:
  - `ModificadorNormalizado` gana `grupo_id: string | null` y `modificadores?: ModificadorNormalizado[]`.
  - `normalizarPedidoUber(orden, esProducto, esOpcion, esSlot)` — tres predicados en vez de uno.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `uber.test.ts`. **El dinero de esta API viene en `amount_e5`** (valor × 100 000) dentro de un objeto
money con `net`/`tax`/`gross`; el helper `dec()` de `uber.ts` ya lo convierte. Las fixtures usan esa
forma, no centavos:

```ts
/** Objeto money de Uber (amount_e5 = pesos × 100 000). */
const money = (pesos: number) => ({ gross: { amount_e5: Math.round(pesos * 100_000) } });

/** Una orden mínima con dos opciones de precios distintos en el mismo ítem. */
const ordenDosExtras = {
  order: {
    carts: [{ items: [{
      id: "p1", cart_item_id: "ci-1", title: "Hamburguesa", quantity: { amount: 1 },
      selected_modifier_groups: [{ id: "g-extra", title: "Extras", selected_items: [
        { id: "o-queso", cart_item_id: "ci-1-a", title: "Extra queso", quantity: { amount: 1 } },
        { id: "o-tocino", cart_item_id: "ci-1-b", title: "Tocino", quantity: { amount: 1 } },
      ] }],
    }] }],
    payment: { payment_detail: { item_charges: { price_breakdown: [
      { cart_item_id: "ci-1", price_type: "ITEM", unit: money(100) },
      { cart_item_id: "ci-1-a", price_type: "OPTION", unit: money(15) },
      { cart_item_id: "ci-1-b", price_type: "OPTION", unit: money(20) },
    ] } } },
  },
};

test("cada opción cobra su propio precio, no el de la primera", () => {
  const p = normalizarPedidoUber(ordenDosExtras, () => true, () => true, () => false);
  const mods = p.items[0]!.modificadores;
  assert.deepEqual(mods.map((m) => [m.opcion_modificador_id, m.precio_extra_mxn]),
    [["o-queso", "15.00"], ["o-tocino", "20.00"]]);
  assert.equal(mods[0]!.grupo_id, "g-extra");
});

test("si el desglose no trae la opción, se usa el precio que trae la propia opción", () => {
  const orden = { order: { carts: [{ items: [{
    id: "p1", cart_item_id: "ci-1", title: "Hamburguesa", quantity: { amount: 1 },
    selected_modifier_groups: [{ id: "g", title: "Extras", selected_items: [
      { id: "o-queso", cart_item_id: "ci-1-a", title: "Extra queso", quantity: { amount: 1 }, price: money(15) },
    ] }],
  }] }], payment: { payment_detail: { item_charges: { price_breakdown: [] } } } } };
  const p = normalizarPedidoUber(orden, () => true, () => true, () => false);
  assert.equal(p.items[0]!.modificadores[0]!.precio_extra_mxn, "15.00");
});

test("un combo trae sus slots y el término anidado", () => {
  const orden = { order: { carts: [{ items: [{
    id: "c1", cart_item_id: "ci-c", title: "Combo", quantity: { amount: 1 },
    selected_modifier_groups: [
      { id: "s-burger", title: "Hamburguesa", selected_items: [{
        id: "p2", cart_item_id: "ci-c-1", title: "Doble", quantity: { amount: 1 },
        selected_modifier_groups: [{ id: "g-term", title: "Término", selected_items: [
          { id: "o-34", cart_item_id: "ci-c-1-a", title: "Tres cuartos", quantity: { amount: 1 } },
        ] }],
      }] },
      { id: "s-papas", title: "Papas", selected_items: [{
        id: "p3", cart_item_id: "ci-c-2", title: "Papas", quantity: { amount: 1 } }] },
    ],
  }] }], payment: { payment_detail: { item_charges: { price_breakdown: [
    // La fila ITEM es SOLO la base del combo; las elecciones vienen como filas OPTION aparte. Es
    // como ya trata el dinero el camino normal (0096: precio del ítem + monto de cada modificador).
    { cart_item_id: "ci-c", price_type: "ITEM", unit: money(45) },
    { cart_item_id: "ci-c-1", price_type: "OPTION", unit: money(130) },
    { cart_item_id: "ci-c-1-a", price_type: "OPTION", unit: money(0) },
    { cart_item_id: "ci-c-2", price_type: "OPTION", unit: money(15) },
  ] } } } } };
  const p = normalizarPedidoUber(orden, () => true, () => true, (id) => id.startsWith("s-"));
  const it = p.items[0]!;
  assert.equal(it.producto_id, "c1");
  assert.equal(it.precio_unitario_mxn, "45.00");
  assert.deepEqual(it.modificadores.map((m) => [m.grupo_id, m.opcion_modificador_id, m.precio_extra_mxn]),
    [["s-burger", "p2", "130.00"], ["s-papas", "p3", "15.00"]]);
  // el término viaja colgando de su componente
  assert.deepEqual(it.modificadores[0]!.modificadores!.map((m) => [m.grupo_id, m.opcion_modificador_id]),
    [["g-term", "o-34"]]);
});

test("las opciones que el cliente quitó acaban en la nota, no en cocina", () => {
  const orden = { order: { carts: [{ items: [{
    id: "p1", cart_item_id: "ci-1", title: "Hamburguesa", quantity: { amount: 1 },
    selected_modifier_groups: [{ id: "g", title: "Incluye", selected_items: [],
      removed_items: [{ id: "o-cebolla", title: "Cebolla", quantity: { amount: 0 } }] }],
  }] }], payment: { payment_detail: { item_charges: { price_breakdown: [] } } } } };
  const p = normalizarPedidoUber(orden, () => true, () => true, () => false);
  assert.equal(p.items[0]!.modificadores.length, 0);
  assert.equal(p.items[0]!.nota, "sin Cebolla");
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `pnpm test:functions`
Expected: FAIL — la firma actual toma un solo predicado y `grupo_id` no existe.

- [ ] **Step 3: `tipos.ts`**

```ts
export type ModificadorNormalizado = {
  opcion_modificador_id: string | null;   // null = no existe en el catálogo de VIM
  /** Grupo en el que se eligió. Para un combo es el uuid del slot; null si no se reconoce. */
  grupo_id: string | null;
  nombre_app: string;
  cantidad: number;
  precio_extra_mxn: string;
  /** Solo para el componente de un combo: sus propios modificadores (el término). */
  modificadores?: ModificadorNormalizado[];
};
```

- [ ] **Step 4: `normalizarPedidoUber`**

Firma nueva y un helper recursivo acotado a un nivel:

```ts
export function normalizarPedidoUber(
  orden: unknown,
  esProducto: (id: string) => boolean,
  esOpcion: (id: string) => boolean,
  esSlot: (id: string) => boolean,
): PedidoNormalizado {
```

Dentro, sustituyendo el bucle de modificadores actual (`uber.ts:93-104`):

```ts
  /**
   * Antes se buscaba en el desglose por el `cart_item_id` DEL PADRE y `find` devolvía la primera
   * fila OPTION, así que con dos opciones las dos cobraban lo mismo. Cada opción tiene su propio
   * `cart_item_id`: se busca por ese. Si el desglose no la trae, se usa el `price` de la propia
   * opción (`selected_items[{id, title, quantity, price…}]`, doc 03 §6), que es un objeto money
   * con `gross.amount_e5` como todo el dinero de esta API.
   */
  const precioOpcion = (sel: Record<string, unknown>): string => {
    const cid = str(sel.cart_item_id);
    return (cid ? dec(breakdown.find((b) => b.cart_item_id === cid && b.price_type === "OPTION")?.unit) : null)
      ?? dec(sel.price) ?? "0.00";
  };

  /** Los grupos elegidos de un ítem. `nivel` acota el anidamiento a dos (spec §3). */
  const modificadoresDe = (it: Record<string, unknown>, nivel: number): ModificadorNormalizado[] => {
    const out: ModificadorNormalizado[] = [];
    for (const g of arr(it.selected_modifier_groups).map(obj)) {
      const gid = str(g.id) ?? "";
      for (const sel of arr(g.selected_items).map(obj)) {
        const oid = str(sel.id) ?? "";
        const anidados = nivel < 1 ? modificadoresDe(sel, nivel + 1) : [];
        out.push({
          opcion_modificador_id: oid !== "" && (esOpcion(oid) || esProducto(oid)) ? oid : null,
          grupo_id: gid !== "" && (esSlot(gid) || esGrupoConocido(gid)) ? gid : null,
          nombre_app: str(sel.title) ?? oid,
          cantidad: Math.max(1, num(obj(sel.quantity).amount) || 1),
          precio_extra_mxn: precioOpcion(sel),
          ...(anidados.length ? { modificadores: anidados } : {}),
        });
      }
    }
    return out;
  };

  /** Las opciones por defecto que el cliente quitó: no van a cocina, pero la cocina debe saberlo. */
  const quitadosDe = (it: Record<string, unknown>): string[] =>
    arr(it.selected_modifier_groups).map(obj)
      .flatMap((g) => arr(g.removed_items).map(obj))
      .map((r) => str(r.title) ?? "")
      .filter((t) => t !== "")
      .map((t) => `sin ${t}`);
```

`esGrupoConocido` no existe: para no añadir un cuarto predicado, `grupo_id` se acepta cuando `esSlot(gid)` es cierto **o** cuando el id es un uuid bien formado (los grupos de modificadores no se consultan por lote). Sustituir esa condición por:

```ts
          grupo_id: gid !== "" && UUID_RE.test(gid) ? gid : null,
```

y exportar `UUID_RE` desde `procesar-uber.ts` o duplicar la constante en `uber.ts` con un comentario. **Elegir duplicar**: `uber.ts` no importa hoy de `procesar-uber.ts` y crear esa dependencia invertiría la relación entre los módulos.

El ítem se arma con:

```ts
      const quitados = quitadosDe(it);
      const notaBase = str(obj(it.customer_request).special_instructions);
      items.push({
        producto_id: conocido ? id : null,
        nombre_app: nombre,
        cantidad: Math.max(1, num(obj(it.quantity).amount) || 1),
        precio_unitario_mxn: unitario(cartItemId, "ITEM"),
        nota: [notaBase, ...quitados].filter(Boolean).join(" · ") || null,
        ...alergiaDeItem(it.customer_request),
        modificadores: modificadoresDe(it, 0),
      });
```

y `conocido` pasa a usar `esProducto(id)`.

- [ ] **Step 5: `procesar-uber.ts` — dos predicados y los slots**

`idsDeLaOrden` (59-70) baja un nivel más, para recoger los ids del término anidado:

```ts
function idsDeLaOrden(orden: unknown): string[] {
  const ids = new Set<string>();
  const deItem = (it: Record<string, unknown>, nivel: number) => {
    if (typeof it.id === "string") ids.add(it.id);
    for (const g of arr(it.selected_modifier_groups).map(obj)) {
      if (typeof g.id === "string") ids.add(g.id);
      for (const s of arr(g.selected_items).map(obj)) { if (nivel < 1) deItem(s, nivel + 1); else if (typeof s.id === "string") ids.add(s.id); }
    }
  };
  for (const cart of arr(obj(obj(orden).order).carts).map(obj)) for (const it of arr(cart.items).map(obj)) deItem(it, 0);
  return [...ids].filter((id) => UUID_RE.test(id));
}
```

Y el bloque de conocidos (92-100) pasa a tres conjuntos:

```ts
  const prods = new Set<string>(); const opcs = new Set<string>(); const slots = new Set<string>();
  if (uuids.length) {
    const r1 = await deps.db.from("productos").select("id").eq("tenant_id", cx.tenant_id).in("id", uuids);
    for (const f of arr(obj(r1).data).map(obj)) if (typeof f.id === "string") prods.add(f.id);
    const r2 = await deps.db.from("opciones_modificador").select("id").eq("tenant_id", cx.tenant_id).in("id", uuids);
    for (const f of arr(obj(r2).data).map(obj)) if (typeof f.id === "string") opcs.add(f.id);
    const r3 = await deps.db.from("combo_grupos").select("id").eq("tenant_id", cx.tenant_id).in("id", uuids);
    for (const f of arr(obj(r3).data).map(obj)) if (typeof f.id === "string") slots.add(f.id);
  }
  const pedido = normalizarPedidoUber(orden, (id) => prods.has(id), (id) => opcs.has(id), (id) => slots.has(id));
```

> Esto cierra de paso un defecto: antes un único conjunto mezclaba productos y opciones, así que un id
> de producto podía colarse como `opcion_modificador_id`.

Ajustar las pruebas de `procesar-uber.test.ts` que construyan el doble de `deps.db` para que respondan también a `combo_grupos`.

- [ ] **Step 6: Verde**

```bash
pnpm test:functions
```
Expected: PASS, incluidas las pruebas previas de `uber.test.ts` y `procesar-uber.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions
git commit -m "fix(uber): cada opción cobra su precio, y el pedido conserva grupo y anidamiento" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: De pedido a ticket

**Files:**
- Create: `supabase/migrations/<NNNN>_combos_uber.sql`
- Create: `supabase/scripts/smoke_combos_uber.sql`

**Interfaces:**
- Consumes: `agregar_combo_a_ticket(p_ticket_id, p_combo_producto_id, p_cantidad, p_componentes, p_modificadores, p_nota_cocina, p_client_id_local)` de `0111_combos.sql:246`.
- Produces: `reprorratear_combo(p_padre_id uuid, p_precio_padre numeric)`; `crear_ticket_desde_app` redefinida con la rama de combo.

- [ ] **Step 1: Escribir el smoke que falla**

`supabase/scripts/smoke_combos_uber.sql`: crea un tenant de prueba con un combo de dos slots, inserta un `delivery_pedidos` cuyo `items` trae la forma que produce el normalizador, y llama `crear_ticket_desde_app`. Verifica:

El pedido de prueba trae la base en `precio_unitario_mxn` (**45**) y las elecciones en
`modificadores` con `grupo_id` (**130 + 15**), tal como sale del normalizador.

```sql
-- 1) el padre cobra la base MÁS cada elección: 45 + 130 + 15 = 190, no 45.
--    Es el error que este smoke existe para atrapar: cobrar solo la fila ITEM regala $145.
IF v_precio_padre <> 190 THEN RAISE EXCEPTION 'el padre debe cobrar 190 (45 base + 145 de elecciones), es %', v_precio_padre; END IF;
-- 2) los hijos a cero y el prorrateo sumando exactamente el precio del padre
IF v_suma_asignado <> 190 THEN RAISE EXCEPTION 'el prorrateo debe sumar 190, suma %', v_suma_asignado; END IF;
-- 3) el término anidado llegó al hijo correcto, y un extra PAGADO del segundo nivel se cobra
IF v_mods_hijo <> 1 THEN RAISE EXCEPTION 'el término no llegó al componente'; END IF;
IF v_extra_pagado_hijo <> 25 THEN RAISE EXCEPTION 'el extra del segundo nivel debe cobrar 25, cobra %', v_extra_pagado_hijo; END IF;
-- 4) el ticket cuadra con el pago
IF v_total_ticket <> v_total_pedido THEN RAISE EXCEPTION 'el ticket no cuadra con lo cobrado'; END IF;
-- 5) un slot incompleto deja el pedido sin ticket, con excepción clara
BEGIN
  PERFORM crear_ticket_desde_app(v_pedido_incompleto);
  RAISE EXCEPTION 'debió fallar: falta un slot obligatorio';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%requiere entre%' THEN RAISE; END IF;
END;
```

Seguir la forma de `supabase/scripts/smoke_combos.sql` (fixtures propias, `BEGIN`/`ROLLBACK`, `RAISE NOTICE` por sección).

- [ ] **Step 2: Correr y ver fallar**

```bash
cd desktop && npm run smokes -- smoke_combos_uber.sql && cd ..
```
Expected: FAIL — hoy `crear_ticket_desde_app` llama `agregar_item_a_ticket` con el combo y revienta con `El producto "…" es un combo: usa agregar_combo_a_ticket`.

- [ ] **Step 3: `reprorratear_combo`**

```sql
-- El prorrateo de los hijos vive en dos sitios: lo calcula `agregar_combo_a_ticket` al vender en
-- caja, y hay que recalcularlo cuando un pedido de app impone el precio que cobró la plataforma.
-- Para no tener la misma aritmética escrita dos veces, se extrae aquí.
CREATE OR REPLACE FUNCTION reprorratear_combo(p_padre_id uuid, p_precio_padre numeric)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_carta   numeric(12,2) := 0;
  v_acum    numeric(12,2) := 0;
  v_n       integer;
  v_i       integer := 0;
  v_hijo    record;
  v_asig    numeric(12,2);
BEGIN
  SELECT COALESCE(SUM(precio_unitario_original_snapshot * cantidad), 0), COUNT(*)
    INTO v_carta, v_n
    FROM ticket_items WHERE parent_item_id = p_padre_id AND cancelado = false;
  IF v_n = 0 THEN RETURN; END IF;

  FOR v_hijo IN
    SELECT id, precio_unitario_original_snapshot * cantidad AS carta
      FROM ticket_items WHERE parent_item_id = p_padre_id AND cancelado = false
     ORDER BY orden_visualizacion, id
  LOOP
    v_i := v_i + 1;
    IF v_carta > 0 THEN v_asig := ROUND(p_precio_padre * v_hijo.carta / v_carta, 2);
    ELSE v_asig := ROUND(p_precio_padre / v_n, 2); END IF;
    -- El último absorbe la diferencia: así la suma es EXACTA, no "casi".
    IF v_i = v_n THEN v_asig := p_precio_padre - v_acum; ELSE v_acum := v_acum + v_asig; END IF;
    UPDATE ticket_items SET precio_asignado_mxn = v_asig WHERE id = v_hijo.id;
  END LOOP;
END;
$$;
COMMENT ON FUNCTION reprorratear_combo IS 'Recalcula precio_asignado_mxn de los hijos de un combo para un precio de padre dado. Lo usa crear_ticket_desde_app cuando la app impone su precio.';
```

- [ ] **Step 4: `crear_ticket_desde_app` con la rama de combo**

Se redefine completa tomando `0096_delivery_espejo_escritorio.sql:62-194` como base. El bucle de ítems (`:116-160`) bifurca **después** de resolver `v_producto_id` y la nota:

```sql
    SELECT es_combo INTO v_es_combo FROM productos WHERE id = v_producto_id;

    IF COALESCE(v_es_combo, false) THEN
      -- Un combo entra por su propia RPC: el padre cobra y los hijos cocinan (ADR 0015). Los
      -- modificadores del ítem son las elecciones de slot; los suyos propios cuelgan de cada uno.
      SELECT jsonb_agg(jsonb_build_object(
               'grupo_id', m->>'grupo_id',
               'producto_id', m->>'opcion_modificador_id',
               'cantidad', COALESCE((m->>'cantidad')::numeric, 1),
               'modificadores', COALESCE((
                 SELECT jsonb_agg(jsonb_build_object(
                          'opcion_modificador_id', s->>'opcion_modificador_id',
                          'cantidad', COALESCE((s->>'cantidad')::int, 1)))
                   FROM jsonb_array_elements(COALESCE(m->'modificadores', '[]'::jsonb)) s
                  WHERE NULLIF(s->>'opcion_modificador_id', '') IS NOT NULL), '[]'::jsonb)))
        INTO v_componentes
        FROM jsonb_array_elements(COALESCE(v_item->'modificadores', '[]'::jsonb)) m
       WHERE NULLIF(m->>'grupo_id', '') IS NOT NULL
         AND NULLIF(m->>'opcion_modificador_id', '') IS NOT NULL
         AND EXISTS (SELECT 1 FROM combo_grupos g
                      WHERE g.id = (m->>'grupo_id')::uuid AND g.combo_producto_id = v_producto_id);

      v_item_id := agregar_combo_a_ticket(
        v_ticket_id, v_producto_id, (v_item->>'cantidad')::numeric,
        COALESCE(v_componentes, '[]'::jsonb),
        '[]'::jsonb,   -- la línea del padre no admite modificadores (0111)
        v_nota_item, NULL);

      -- El precio que manda es el de la app: Uber ya le cobró al cliente con su carta. Ojo: la
      -- fila ITEM del desglose es SOLO la base del combo; cada elección de slot llega como una
      -- fila OPTION aparte, que en el camino normal (0096) se cobra en el modificador. Aquí no hay
      -- modificador donde ponerla —las elecciones son hijos a precio 0— así que se suman al padre.
      -- Si no se sumaran, el ticket cobraría $45 por un combo de $190.
      SELECT COALESCE(SUM((m->>'precio_extra_mxn')::numeric(12,2) * COALESCE((m->>'cantidad')::numeric, 1)), 0)
        INTO v_extras
        FROM jsonb_array_elements(COALESCE(v_item->'modificadores', '[]'::jsonb)) m
       WHERE NULLIF(m->>'grupo_id', '') IS NOT NULL;

      v_precio := (v_item->>'precio_unitario_mxn')::numeric(12,2) + v_extras;
      UPDATE ticket_items SET precio_unitario_snapshot = v_precio WHERE id = v_item_id;
      PERFORM reprorratear_combo(v_item_id, v_precio * (v_item->>'cantidad')::numeric);

      -- Los modificadores del SEGUNDO nivel (el término, un extra pagado sobre la hamburguesa)
      -- sí cuelgan de un hijo, así que se cobran donde el camino normal los cobra.
      FOR v_comp IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'modificadores', '[]'::jsonb)) LOOP
        FOR v_modif IN SELECT * FROM jsonb_array_elements(COALESCE(v_comp->'modificadores', '[]'::jsonb)) LOOP
          IF NULLIF(v_modif->>'opcion_modificador_id', '') IS NOT NULL THEN
            UPDATE ticket_item_modificadores tim
               SET precio_extra_snapshot = (v_modif->>'precio_extra_mxn')::numeric(12,2),
                   monto_total_mxn = (v_modif->>'precio_extra_mxn')::numeric(12,2) * tim.cantidad
              FROM ticket_items hijo
             WHERE tim.ticket_item_id = hijo.id
               AND hijo.parent_item_id = v_item_id
               AND hijo.producto_id = (v_comp->>'opcion_modificador_id')::uuid
               AND tim.opcion_modificador_id = (v_modif->>'opcion_modificador_id')::uuid;
          END IF;
        END LOOP;
      END LOOP;
      CONTINUE;
    END IF;
```

Declarar `v_es_combo boolean`, `v_componentes jsonb` y `v_extras numeric(12,2)` en el bloque
`DECLARE` (`v_comp` y `v_modif` de tipo `jsonb`; `v_modif` ya existe en 0096).

> Un modificador cuyo `grupo_id` no sea un slot de ese combo se descarta por el `EXISTS`. Es lo que
> el spec pide, y evita que un grupo de modificadores del propio combo (que no publicamos) entre
> como si fuera un slot.

- [ ] **Step 5: Verde**

```bash
cd desktop && npm run smokes && cd ..
```
Expected: `SMOKE COMBOS UBER OK` y los 35 anteriores en verde — sobre todo `smoke_delivery_app.sql`, que cubre el camino de un pedido normal.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations supabase/scripts
git commit -m "feat(uber): un pedido con combo entra por agregar_combo_a_ticket" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: El espejo traduce los errores de combo

**Files:**
- Modify: `desktop/src/delivery-espejo.mjs:155`
- Modify: `desktop/src/delivery-espejo.test.mjs`
- Modify: `desktop/package.json`

Hoy `delivery-espejo.mjs:155` solo traduce `SIN_TURNO_ABIERTO` e `ITEM_SIN_MAPEAR`; cualquier otro error se guarda crudo en `ultimo_error` y el cajero lee un mensaje de Postgres.

- [ ] **Step 1: Escribir la prueba que falla**

```js
test("traduce los errores de combo a algo que el cajero entienda", () => {
  assert.equal(codigoDeError('El slot "Bebida" requiere entre 1 y 1 selecciones (recibió 0)'), "COMBO_INCOMPLETO");
  assert.equal(codigoDeError('El producto "Doble" está agotado o pausado'), "PRODUCTO_AGOTADO");
  assert.equal(codigoDeError("algo raro de postgres"), "algo raro de postgres");
  assert.equal(codigoDeError("SIN_TURNO_ABIERTO"), "SIN_TURNO_ABIERTO");
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `pnpm test:escritorio`
Expected: FAIL — `codigoDeError` no está exportada.

- [ ] **Step 3: Extraer y ampliar**

En `delivery-espejo.mjs`, sacar la expresión de la línea 155 a una función exportada:

```js
/**
 * Traduce el error de la RPC a un código corto que la caja muestra. Lo que no se reconoce se deja
 * tal cual: es preferible un mensaje feo a esconder un fallo que nadie previó.
 */
export function codigoDeError(m) {
  if (m.includes("SIN_TURNO_ABIERTO")) return "SIN_TURNO_ABIERTO";
  if (m.includes("ITEM_SIN_MAPEAR")) return "ITEM_SIN_MAPEAR";
  if (m.includes("requiere entre")) return "COMBO_INCOMPLETO";
  if (m.includes("está agotado o pausado")) return "PRODUCTO_AGOTADO";
  if (m.includes("no es opción del slot")) return "COMBO_OPCION_INVALIDA";
  return m;
}
```

y en la línea 155, `const codigo = codigoDeError(m);`.

- [ ] **Step 4: Versión y verde**

`desktop/package.json` sube a la siguiente libre (comprobar `main` primero).

```bash
pnpm test:escritorio
```
Expected: PASS (86 + las nuevas).

- [ ] **Step 5: Commit**

```bash
git add desktop
git commit -m "feat(escritorio): el espejo traduce los errores de combo de un pedido de app" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: La prueba real contra la tienda sandbox

**Files:**
- Modify: `docs/operacion/delivery-uber-sandbox.md`

Esta es la tarea que de verdad decide. El recorrido del 6 sep 2026 (`docs/operacion/delivery-uber-sandbox.md:162-172`) es el guion.

- [ ] **Step 1: Preparar el catálogo del tenant de pruebas**

El tenant `vim-pruebas` (`d3462bb3-198b-4cc3-8105-7060d6998478`) ya tiene 38 productos, 7 categorías y el combo **"Combo Knock-Out"** ($45 base, tres slots: Hamburguesa por categoría con `SUMA_PRECIO_PRODUCTO`, Papas con Sencillas por defecto y Aros a +20, Bebida con Coca por defecto y Malteada a +25). Comprobar que sigue ahí y **activo**, y que al menos un producto tiene un grupo de modificadores obligatorio, para probar el segundo nivel.

- [ ] **Step 2: Publicar la carta**

Desde el admin, Configuración → Integraciones → Enviar carta, con la tienda «VIM POS Test Store 1» (`e597a6b1-9ea2-45d0-a0cd-5843ac6908b8`). Anotar los conteos que devuelve: productos, grupos, opciones y categorías.

- [ ] **Step 3: Comprobar qué aceptó Uber**

```bash
# con el token de la conexión, ver la carta publicada
GET https://api.uber.com/v2/eats/stores/e597a6b1-9ea2-45d0-a0cd-5843ac6908b8/menus
```
Comparar contra lo enviado: que los `modifier_groups` estén, que el combo lleve sus slots, y que la Doble tenga su `overrides` de precio. **Anotar en el documento de operación si el campo aceptado es `core_price` o `corePrice`**: la referencia de Uber y su propio ejemplo se contradicen.

- [ ] **Step 4: Pedido real**

Desde ubereats.com, pedir el combo eligiendo hamburguesa (con su término), papas y bebida, más un producto suelto con un extra pagado. Verificar en la caja:

- el ticket tiene el combo como un renglón con su precio y tres hijos;
- el término llegó al componente correcto;
- la comanda salió repartida por estación, sin el padre;
- el total del ticket es exactamente lo que cobró Uber;
- el extra del producto suelto cobra su precio, no el de otro.

- [ ] **Step 5: Documentar el resultado**

Añadir a `docs/operacion/delivery-uber-sandbox.md` una sección «Resultado de la entrega 2» con la fecha, los conteos, lo que respondió `GET /menus`, el folio del ticket y las confirmaciones del §8 del spec:

1. el nombre del campo de `core_price` que Uber aceptó (`core_price` o `corePrice`);
2. el tope de precio en pesos, si se topó;
3. si `min/max_permitted` se respetaron en la app del cliente;
4. **guardar el JSON completo del pedido** (`GET /v1/delivery/order/{id}`) y comprobar en él dos cosas de las que depende el dinero del ticket:
   - si las filas `price_type: "OPTION"` del `price_breakdown` llevan el `cart_item_id` **de la opción** o el del padre, y qué forma exacta tiene el `price` de un `selected_item`. La Task 6 asume lo primero, con el `price` de la opción como respaldo; si Uber hace lo contrario, el respaldo pasa a ser la fuente principal;
   - **si la fila `ITEM` del combo trae solo la base o ya incluye las elecciones.** Las Tasks 6 y 7 asumen que trae solo la base y por eso las suman (es como trata el dinero el camino normal desde 0096). Si resultara que ya viene sumada, el combo cobraría el doble: quitar entonces la suma de `v_extras` en la rama de combo. Comprobarlo comparando la fila ITEM contra `order_total.gross` del pedido de prueba, cuyos importes se conocen de antemano.

- [ ] **Step 6: Commit**

```bash
git add docs/operacion/delivery-uber-sandbox.md
git commit -m "docs(uber): resultado de la prueba de combos y modificadores en sandbox" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Entrega

- [ ] **Step 1: Todo verde**

```bash
pnpm turbo run typecheck && pnpm -r test && pnpm test:functions && pnpm test:escritorio
cd desktop && npm run smokes && cd ..
supabase test db
```

- [ ] **Step 2: PR**

```bash
git push -u origin combos-uber
gh pr create --title "Combos y modificadores en Uber Eats (entrega 2)" --body "…"
```
Esperar `rls-tests` en verde antes de mezclar.

- [ ] **Step 3: Producción, en este orden**

1. `supabase migration list --linked` y `supabase db push`; confirmar que la migración nueva aparece aplicada. Si no aparece, el número chocó: **no seguir**.
2. Mezclar el PR.
3. Instalador de la versión nueva, con la lista «Antes de empaquetar» del `desktop/RUNBOOK.md`, y publicarlo.
4. **Solo después**, volver a enviar la carta a la tienda de producción. El orden importa: una caja sin la migración nueva no sabe crear un ticket de combo, así que primero se actualiza el parque y luego se publica una carta que ya puede traer combos.

---

## Autorrevisión del plan

- **Cobertura del spec:** §4.1 → Task 1; §4.2 → Task 2; §4.3 → Task 3; §4.4 → Task 4; §4.5 → Task 5; §5 → Task 6; §6 → Task 7 (con `reprorratear_combo`); el espejo de §6 → Task 8; §7 (lo que no se toca) no necesita tarea; §8 → las pruebas de cada tarea más la Task 9; §9 (riesgos) → el orden de la Task 10, paso 3.
- **Nombres consistentes:** `GrupoModificadorCarta` y `ComboCarta` se definen en las Tasks 2 y 3 y se consumen con ese nombre exacto en la Task 5; `cantidadesDeGrupo` solo en la Task 2; `reprorratear_combo(p_padre_id, p_precio_padre)` se define y se usa en la Task 7; `codigoDeError` en la Task 8; `normalizarPedidoUber(orden, esProducto, esOpcion, esSlot)` se define en la Task 6 y es lo que llama `procesar-uber.ts` en esa misma tarea.
- **Decisión anotada durante la escritura:** el spec §5 hablaba de validar `grupo_id` contra los slots conocidos. Al escribir la Task 6 se vio que los grupos de modificadores **no** se consultan por lote, así que exigir que `grupo_id` sea un slot dejaría sin grupo a todos los modificadores normales. Se acepta cualquier uuid bien formado como `grupo_id` y es la RPC quien comprueba, con su `EXISTS`, que ese grupo sea un slot de ese combo. La validación acaba en el sitio correcto: la base.

### Dos correcciones al plan, hechas leyendo el código antes de darlo por bueno

1. **El dinero del pedido no viene en centavos.** El spec hablaba de `GET /v2/eats/order/{id}` y de `price.unit_price.amount`, pero `uber.ts` lee `GET /v1/delivery/order/{id}`, donde el dinero es `amount_e5` dentro de un objeto money con `net`/`tax`/`gross`. Las fixtures y el helper de la Task 6 se reescribieron a esa forma; el arreglo del defecto de precio pasa a ser *buscar en el desglose por el `cart_item_id` de la opción* en vez de por el del padre.
2. **La primera versión de la Task 7 cobraba $45 por un combo de $190.** Tomaba `precio_unitario_mxn` como el precio del combo, pero esa es la fila `ITEM` del desglose, que es solo la base: cada elección llega como fila `OPTION` aparte, igual que en el camino normal, donde se cobra en el modificador. Como en un combo las elecciones son hijos a precio 0, no hay modificador donde ponerlas y hay que sumarlas al padre. El smoke de la Task 7 existe sobre todo para atrapar esto, y la Task 9 lo confirma contra un pedido real antes de producción.
