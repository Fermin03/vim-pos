# Combos y modificadores en Uber Eats — diseño (entrega 2)

**Fecha:** 2026-09-10 · **Decisión:** `docs/decisiones/0015-los-combos-son-un-producto-con-slots.md` §8
(«fuera de esta entrega: publicar combos en Uber») y `docs/decisiones/0011-integracion-apps-de-delivery.md`
(el id que viaja a las apps es el uuid de VIM) ·
**Antecedente:** `docs/superpowers/specs/2026-09-08-combos-design.md` §12 (entrega 1, en producción desde
el 9 sep 2026 con la migración 0111 y el instalador 0.4.67).

## 1. Problema

Tres cosas, en orden de gravedad.

**Un combo publicado hoy se vende mal.** La acción «Enviar carta»
(`supabase/functions/delivery-uber-conexion/index.ts:266-271`) consulta los productos con
`estado = 'ACTIVO'` y no filtra `es_combo`, así que un combo activo viaja a Uber como un producto plano
al precio de «hacerlo combo» —los $45 del ADR 0015— sin sus componentes. Y si alguien lo pide,
`crear_ticket_desde_app` llama `agregar_item_a_ticket`, que desde `0111_combos.sql:187-189` lanza
`El producto "%" es un combo: usa agregar_combo_a_ticket`: el pedido queda en `ERROR`. Lo único que hoy
lo evita es que un combo nace `PAUSADO` (`apps/admin/app/lib/combos.ts`).

**Los modificadores nunca se han publicado.** `menu-uber.ts:76` manda `modifier_group_ids: { ids: [] }` y
`:99` `modifier_groups: []`, y `menu-uber.test.ts:63` lo fija como comportamiento esperado. Un cliente de
Uber no puede pedir extra queso ni elegir término: solo el producto pelón. No es solo un prerrequisito de
los combos, es una carencia del negocio.

**El precio de los modificadores entrantes se cobra mal.** `normalizarPedidoUber`
(`supabase/functions/_shared/delivery/uber.ts:101`) resuelve `precio_extra_mxn` con
`unitario(cartItemId, "OPTION")`, donde `cartItemId` es **el del ítem padre** y `unitario` toma la
**primera** fila que coincide. Con dos o más opciones en el mismo ítem, todas reciben el mismo precio.
Con un combo de tres componentes con precios distintos sería un error de dinero garantizado.

Además, `normalizarPedidoUber` descarta el id del grupo (`g.id`), que es justo lo que hace falta para
saber a qué slot corresponde cada elección, y no recorre `sel.selected_modifier_groups` (el anidamiento)
ni `removed_items` (las opciones por defecto que el cliente quitó).

## 2. Alcance

**Entra:**

1. Guardarraíl inmediato: un combo sin slots no se publica (§4.1). Va primero y solo.
2. Publicar grupos de modificadores y sus opciones (§4.2).
3. Publicar combos: slots, opciones con ajuste de precio por grupo, y el segundo nivel (§4.3).
4. IVA como `vat_rate_percentage` (§4.4).
5. Normalizador: id del grupo, precio por opción, un nivel de anidamiento, `removed_items` (§5).
6. `crear_ticket_desde_app` reconoce un combo y llama `agregar_combo_a_ticket` (§6).
7. Pruebas unitarias, smoke SQL y la prueba real contra la tienda sandbox (§8).

**No entra:** DiDi y Rappi (Uber es la única integración con código); los modificadores propios de un
combo (§3, invariante 5); `bundled_items`; el rechazo automático del pedido hacia Uber; la
reconciliación con `GET /menus`; publicar la carta automáticamente al cambiar el catálogo (hoy es un
botón y sigue siéndolo).

## 3. Invariantes

- **El precio que manda es el de Uber.** Uber cotiza con la carta publicada y le cobra al cliente antes
  de que el POS se entere. El ticket debe cuadrar con lo que se cobró, no con lo que el catálogo diga
  ahora. `crear_ticket_desde_app` ya pisa los precios con los de la app y eso se conserva.
- **El id es el uuid de VIM** (ADR 0011): no hay tabla de mapeo. Se manda además en `external_data`, en
  los tres niveles (ítem, grupo, opción), porque es el campo que Uber promete devolver íntegro.
- **Un producto no se duplica.** El mismo ítem sirve suelto y como opción de un slot, con un ajuste de
  precio por grupo. Es el patrón documentado de Uber y evita que la Doble salga dos veces en la app.
- **Las opciones de modificador no se venden solas.** Se publican como ítems porque Uber lo exige, pero
  no se meten en ninguna categoría, así que no aparecen en la carta.
- **Un combo publica solo sus slots.** Sus propios grupos de modificadores no se publican: la línea del
  padre no admite modificadores (`0111_combos.sql:387-389`), y publicarlos obligaría a distinguir en el
  pedido entrante un grupo-slot de un grupo-modificador sobre el mismo producto.
- **Dos niveles como máximo.** Combo → slot → producto → sus modificadores. Uber documenta seis, pero
  Toast —que lleva años integrando— avisa que más de dos rompe la sincronización. Quedamos en el límite
  de lo que otros dan por seguro, y no se pasa de ahí.
- **Nada de esto puede romper un pedido normal.** Un restaurante sin combos ni modificadores debe
  publicar y recibir exactamente igual que hoy.

## 4. La carta (salida)

Todo vive en `supabase/functions/_shared/delivery/menu-uber.ts`, que sigue siendo un módulo **puro**: no
consulta, recibe lo que ya leyó `delivery-uber-conexion`.

### 4.1 Guardarraíl: un combo sin slots no se publica

Primer commit, aislado, para cerrar el riesgo vivo aunque el resto tarde.

`ProductoCarta` gana `es_combo?: boolean` y `n_slots?: number`. `construirMenuUber` excluye con motivo
`"combo sin slots"` cualquier producto con `es_combo` y `n_slots` en cero o ausente. La acción `menu` de
`delivery-uber-conexion` cuenta los slots activos por combo y los pasa.

Un combo **con** slots sigue publicándose plano hasta que aterrice §4.3. Es el comportamiento de hoy y no
empeora; lo que se cierra es el caso peor, que es un combo sin configurar vendido al precio base.

### 4.2 Grupos de modificadores

Entradas nuevas de `construirMenuUber` (todas opcionales, para no romper a quien no las pase):

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

**Cantidades**, derivadas de `tipo_seleccion` (enum en `0007_catalogo_inventario.sql:36-41`):

| `tipo_seleccion` | `min_permitted` | `max_permitted` |
|---|---|---|
| `UNICA_OBLIGATORIA` | 1 | 1 |
| `UNICA_OPCIONAL` | 0 | 1 |
| `MULTIPLE_OPCIONAL` | 0 | nº de opciones publicadas |
| `MULTIPLE_OBLIGATORIA_RANGO` | `minimo_selecciones` | `maximo_selecciones` |

**Cada opción se publica como un ítem de Uber**, fuera de toda categoría:

```json
{
  "id": "<uuid de la opción>",
  "external_data": "<uuid de la opción>",
  "title": { "translations": { "es_mx": "Extra queso" } },
  "price_info": { "price": 1500, "core_price": 1500 },
  "quantity_info": {},
  "modifier_group_ids": { "ids": [] },
  "tax_info": { "vat_rate_percentage": 16 }
}
```

`price` es `precio_extra_mxn` en centavos, porque Uber **suma** el precio de la opción al del padre. No
hace falta ajuste por contexto: una opción pertenece a un solo grupo (`opciones_modificador.grupo_id`).
`core_price` igual al precio, que es lo que Uber usa para calcular reembolsos.

**El grupo:**

```json
{
  "id": "<uuid del grupo>",
  "external_data": "<uuid del grupo>",
  "title": { "translations": { "es_mx": "Término" } },
  "quantity_info": { "quantity": { "min_permitted": 1, "max_permitted": 1 } },
  "modifier_options": [{ "type": "ITEM", "id": "<uuid de la opción>" }],
  "display_type": "expanded"
}
```

Y cada producto lleva en `modifier_group_ids.ids` los grupos que le tocan, en el orden de
`productos_grupos_modificadores.orden_visualizacion`.

**Exclusiones.** Una opción agotada (`opciones_modificador.agotada`) no se publica. Un grupo que se queda
sin opciones **no se publica y se quita de los productos que lo referencian**: Toast documenta que un
grupo vacío rompe la sincronización de toda la carta. Un grupo obligatorio que se queda vacío hace que su
producto no se pueda pedir; en ese caso el producto se excluye con motivo
`"grupo obligatorio sin opciones"`, que es preferible a publicar algo inordenable.

### 4.3 Combos

Entrada nueva:

```ts
export type ComboCarta = {
  producto_id: string;
  slots: {
    id: string;
    nombre: string;
    orden: number;
    minimo_selecciones: number;
    maximo_selecciones: number;
    /** Ya resueltas por quien consulta: categoría o lista, exclusiones aplicadas, agotados fuera. */
    opciones: { producto_id: string; importe_mxn: number | string }[];
  }[];
};
```

`importe_mxn` lo calcula quien consulta con la misma fórmula del servidor
(`0111_combos.sql:352`): `(precio del producto si el slot es SUMA_PRECIO_PRODUCTO, si no 0) + delta`.
El módulo de la carta no vuelve a decidirlo; solo lo traduce a centavos.

**El combo padre** es un ítem normal con `price` = `precio_base_mxn` y sus slots en
`modifier_group_ids.ids`. Va en su categoría, como cualquier producto.

**Cada slot** es un grupo de Uber con `min_permitted`/`max_permitted` de `minimo/maximo_selecciones`.

**Cada opción de slot es el producto real**, que ya existe como ítem de la carta. Se le añade un ajuste
por grupo:

```json
{
  "id": "<uuid del producto>",
  "price_info": {
    "price": 13000,
    "overrides": [
      { "context_type": "MODIFIER_GROUP", "context_value": "<uuid del slot>",
        "price": 13000, "core_price": 13000 }
    ]
  },
  "quantity_info": {
    "quantity": {},
    "overrides": [
      { "context_type": "MODIFIER_GROUP", "context_value": "<uuid del slot>",
        "quantity": { "min_permitted": 0, "max_permitted": 1 } }
    ]
  }
}
```

El `price` de arriba es el precio suelto (la Doble a $130) y el del ajuste es `importe_mxn` (dentro del
combo aporta lo que le toque). `core_price` es siempre el precio suelto, que es el valor real del producto
para un reembolso.

**El segundo nivel sale gratis:** el producto hijo conserva sus propios `modifier_group_ids`, así que la
Doble dentro del combo sigue pidiendo el término. Eso es lo que aprobó Fermín.

**Exclusiones.** Un slot que se queda sin opciones publicables hace que el combo entero no se publique,
con motivo `"slot sin opciones"`: un combo al que le falta un slot obligatorio es inordenable en Uber y
provoca un rechazo `MISSING_ITEM`.

**No se usa `context_type: "ITEM"`.** Uber lo lista como valor válido pero no documenta su semántica ni la
precedencia entre ajustes, y ninguno de sus catorce ejemplos lo usa. Si algún día un mismo producto
necesita precios distintos en dos combos, la ruta documentada es duplicar el grupo, no usar `ITEM`.

### 4.4 IVA

`tax_info` pasa de `{ tax_rate }` a `{ vat_rate_percentage }`, que es lo que corresponde a México con
precio con IVA incluido (`docs/integraciones/delivery/03-uber-eats-resumen.md:167-170` ya lo señalaba).
Se aplica a todos los ítems: productos, opciones de modificador y combos.

### 4.5 Quién consulta

`delivery-uber-conexion/index.ts`, acción `"menu"`, amplía su consulta paralela con
`grupos_modificadores`, `opciones_modificador`, `productos_grupos_modificadores`, `combo_grupos` y
`combo_opciones`, todas por `tenant_id`, activas y sin `deleted_at`. Resuelve las opciones de un slot con
la misma regla que la caja y el servidor (categoría entera con exclusiones, o lista explícita), calcula
`importe_mxn`, y se lo pasa todo a `construirMenuUber`.

El resumen que devuelve al admin gana dos conteos —grupos y opciones publicados— y la pantalla de
integraciones los muestra junto a los productos y las categorías.

## 5. El pedido entrante (normalizador)

`ModificadorNormalizado` en `_shared/delivery/tipos.ts` gana dos campos:

```ts
export type ModificadorNormalizado = {
  opcion_modificador_id: string | null;
  /** Id del grupo en el que se eligió. Para un combo es el uuid del slot. */
  grupo_id: string | null;
  nombre_app: string;
  cantidad: number;
  precio_extra_mxn: string;
  /** Solo para el hijo de un combo: sus propios modificadores (el término). */
  modificadores?: ModificadorNormalizado[];
};
```

Cambios en `normalizarPedidoUber` (`uber.ts:77-115`):

1. **Conservar `g.id`** en cada modificador.
2. **Precio por opción.** El pedido trae `price.unit_price.amount` en cada `selected_item`
   (verificado en la referencia de `GET /v2/eats/order/{id}`). Se lee de ahí en lugar de buscar en
   `price_breakdown` por el `cart_item_id` del padre. Si falta, se cae al desglose buscando por el
   `cart_item_id` **de la propia opción**, y solo si tampoco está, `"0.00"`.
3. **Un nivel de anidamiento.** Si un `selected_item` trae `selected_modifier_groups`, se recorren y se
   guardan en su `modificadores`. No se baja más: dos niveles es el tope acordado.
4. **`removed_items`.** Las opciones que venían por defecto y el cliente quitó no se mandan a cocina. Se
   anotan en la nota del ítem como `sin <nombre>`, porque la cocina necesita saberlo y no hay otro sitio
   donde ponerlo.

`esUuidConocido` deja de ser un único conjunto. `procesar-uber.ts:94-99` ya consulta `productos` y
`opciones_modificador` por separado; se pasan **dos** predicados (`esProducto`, `esOpcion`) para que un id
de producto no pueda colarse como opción ni al revés. Los slots se validan contra `combo_grupos`, que se
suma a esa consulta por lote.

## 6. De pedido a ticket

`crear_ticket_desde_app`, cuya versión vigente está en `0096_delivery_espejo_escritorio.sql:62-194`, se
redefine en la migración nueva. El bucle de ítems (`:116-160`) se bifurca:

**Si el producto no es combo:** exactamente como hoy.

**Si `productos.es_combo`:**

1. Se arma `p_componentes` a partir de los modificadores del ítem: cada uno aporta
   `{ grupo_id, producto_id, cantidad, modificadores }`, donde `grupo_id` es el slot, `producto_id` es la
   opción elegida y `modificadores` son los suyos (el término). Un modificador cuyo `grupo_id` no sea un
   slot de ese combo se descarta y se anota en la nota de cocina.
2. `agregar_combo_a_ticket(ticket, combo, cantidad, componentes, '[]'::jsonb, nota, NULL)`. El quinto
   argumento va vacío a propósito: la línea del padre no admite modificadores (invariante 5).
3. **Se impone el precio de Uber.** La RPC calcula el precio con el catálogo actual, pero manda lo que se
   cobró. Se actualiza `precio_unitario_snapshot` del padre con `precio_unitario_mxn` del pedido y se
   vuelve a prorratear `precio_asignado_mxn` de los hijos con la misma regla de la entrega 1
   (proporcional al precio a la carta, el último hijo absorbe la diferencia). Para no duplicar esa
   aritmética se extrae a una función `reprorratear_combo(p_padre_id uuid, p_precio_padre numeric)` que
   la migración nueva define y que `agregar_combo_a_ticket` también usa.
4. Si la RPC falla —un slot incompleto, una opción agotada, un producto que ya no es opción— la excepción
   sube y `crear_ticket_desde_app` la propaga, igual que hoy con `ITEM_SIN_MAPEAR`. `procesar-uber.ts`
   deja el pedido pendiente para el cajero y el espejo lo anota en `ultimo_error`.

**El espejo a la caja instalada** no cambia de forma: `delivery-espejo.mjs:151` llama la misma RPC en la
base local. Lo único que hace falta es que esa caja tenga la migración nueva, que llega con el instalador
de esta entrega. La lista de errores traducidos de `delivery-espejo.mjs:155` gana los mensajes de combo,
para que el cajero lea algo entendible en vez del texto crudo de Postgres.

## 7. Qué NO se toca

- **No hay rechazo automático hacia Uber.** Un pedido que no se puede armar queda pendiente para el
  cajero, como hoy. Uber da 11.5 minutos y luego lo cancela solo; automatizar el rechazo es una decisión
  de negocio aparte.
- **No hay reconciliación con `GET /menus`.** Existe el endpoint y sería lo suyo comparar lo publicado
  contra lo que se quiso publicar, pero no en esta entrega.
- **La carta se sigue enviando a mano**, con el botón del admin. Publicarla automáticamente al cambiar el
  catálogo es otra entrega.
- **`bundled_items` no se usa.** Es para componentes fijos que el cliente no elige, y todos nuestros slots
  son elección.

## 8. Pruebas

- **`menu-uber.test.ts`**: un producto con dos grupos (uno obligatorio de una opción, uno múltiple);
  las cantidades derivadas de cada uno de los cuatro `tipo_seleccion`; una opción agotada que no sale; un
  grupo vacío que se cae y se quita de su producto; un producto excluido por grupo obligatorio vacío; un
  combo completo con el ajuste de precio por slot y el segundo nivel intacto; un combo sin slots excluido;
  un slot sin opciones que tumba el combo; y **un caso sin modificadores ni combos que produce exactamente
  la misma carta que hoy** (la garantía de no romper a nadie).
- **`uber.test.ts`**: un pedido con dos opciones de precios distintos en el mismo ítem, que hoy fallaría;
  un pedido de combo con tres slots y un término anidado; `removed_items` que acaban en la nota; un
  modificador de un grupo que no es slot del combo.
- **`smoke_combos_uber.sql`**: `crear_ticket_desde_app` con un pedido de combo real en `items`, verificando
  el padre con el precio de Uber, los hijos a cero con el prorrateo cuadrando al centavo, y el ticket
  cuadrando con el pago. Más el caso de slot incompleto, que debe dejar el pedido en error sin ticket a
  medias.
- **La prueba que decide: la tienda sandbox.** Publicar la carta con modificadores y un combo en «VIM POS
  Test Store 1» (`e597a6b1-9ea2-45d0-a0cd-5843ac6908b8`), comprobar con `GET /menus` que Uber la aceptó
  como se mandó, hacer un pedido real desde la app eligiendo hamburguesa, término, papas y bebida, y ver
  el ticket con su padre y sus tres hijos, la comanda por estación y el total cuadrando con lo que cobró
  Uber. El recorrido del 6 sep 2026 (`docs/operacion/delivery-uber-sandbox.md:162-172`) es el guion.

Tres cosas que solo se pueden confirmar ahí, y que hay que mirar expresamente:

1. Si el campo es `core_price` o `corePrice`: la referencia de Uber dice una cosa y su ejemplo otra.
2. El tope de precio por ítem en pesos. Uber documenta ~$375 dólares por defecto y no dice cuál es en
   México; un combo caro podría rebotar con `Invalid Price Info`.
3. Que `min_permitted`/`max_permitted` se respeten de verdad en la app. Hay un hilo abierto sin resolver
   en el foro de Deliverect donde no se aplican.

## 9. Riesgos

- **La carta es un reemplazo total.** `PUT /menus` borra lo que no venga en el envío. Un fallo a medias
  deja la tienda con una carta incompleta; por eso el módulo es puro y se prueba entero antes de mandar.
- **Dos niveles es el límite práctico.** Estamos justo donde Toast avisa que empiezan los problemas. Si el
  sandbox da guerra con el término anidado, la salida es publicar el combo a un nivel y que el hijo tome
  su opción por defecto, que era la otra rama de la decisión.
- **Uber cotiza con la carta que tenga.** Si el catálogo cambia y nadie vuelve a enviar la carta, el
  cliente paga el precio viejo. El ticket se cuadra con lo cobrado (§3), así que no hay descuadre
  contable, pero el margen sí se mueve. La reconciliación queda pendiente.
- **Una caja sin la migración nueva** no sabe crear un ticket de combo. Falla ruidosamente y el pedido
  queda pendiente para el cajero, que es el comportamiento correcto, pero conviene publicar el instalador
  antes de publicar la primera carta con combos.
