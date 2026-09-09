# Combos — diseño

**Fecha:** 2026-09-08 · **Decisión:** `docs/decisiones/0015-los-combos-son-un-producto-con-slots.md` ·
**Antecedentes:** modificadores (0007 §grupos/opciones, `apps/pos/app/components/modal-modificadores.tsx`),
recetas (ADR 0012), sync de inventario (ADR 0013), CFDI (`supabase/functions/_shared/pac/conceptos.ts`).

## 1. Problema

Knock-Out vende "cualquier hamburguesa + papas + refresco" como un producto con grupos de
modificadores con costo extra. Eso cobra bien y nada más:

1. Las papas y el refresco no descuentan inventario: `descontar_inventario_por_venta` (0101)
   solo descuenta modificadores de naturaleza `EXTRA` vía `modificador_componentes`, y esa tabla
   no tiene pantalla en el admin.
2. No llegan a cocina como productos: viajan como `opcion_nombre_snapshot` unidos con " · "
   (`packages/kds-core/src/comandas.ts`, `comanda-builder.ts`), sin área propia ni conteo.
3. No cuentan en reportes: el refresco vendido en combo no es un refresco vendido.
4. El cajero elige la bebida en una lista de texto, sin default y sin ver el precio en vivo.

`ticket_items` es plano: un producto por renglón y ninguna agrupación padre-hijo. No existe
ninguna tabla ni columna de combos; el enum de promoción `COMBO_PAQUETE` (0007) nunca se implementó.

## 2. Alcance

**Entra (entrega 1):**

1. Migración `0111_combos.sql`: bandera en productos, `combo_grupos`, `combo_opciones`,
   columnas de agrupación en `ticket_items`, RPC `agregar_combo_a_ticket`, cascada en
   `cancelar_item_ticket`, pull y `catalogo_version()` (§4).
2. Admin: pestaña Combos con editor de slots y vista previa de precios (§5).
3. Caja: modal de slots, carrito con padre e hijos, aviso "¿Lo hacemos combo?", reconstrucción
   de cuentas abiertas (§6).
4. Comanda, KDS y ticket impreso con padre e hijos (§7).
5. CFDI: un concepto por combo (§8).
6. Reportes de ventas por producto corregidos (§9).
7. Escritorio: pull de las dos tablas, instalador 0.4.66 (§10).
8. Pruebas (§11).

**No entra:** combos en la carta de Uber (entrega 2, §12); auto-combo / promoción
`COMBO_PAQUETE`; tamaños como atributo del combo; combos anidados (un combo dentro de otro);
combos en el importador CSV; gating por plan (los combos van en todos los planes); edición de
modificadores de una línea ya en el carrito (limitación previa, no la resolvemos aquí).

## 3. Invariantes

- **El combo es un producto.** Todo lo que aplica a un producto (RLS, sync, agotado, clave SAT,
  visibilidad, orden) aplica al combo sin código nuevo.
- **El padre cobra, los hijos no.** `precio_unitario_snapshot` del hijo es siempre 0; su
  `total_item_mxn` solo puede contener extras de sus propios modificadores.
- **Los hijos son renglones reales.** Cocina, inventario y reportes los tratan como productos
  vendidos. El padre nunca va a cocina ni descuenta.
- **Un solo concepto CFDI por combo.** Los hijos se colapsan en el padre; la suma de conceptos
  sigue igualando `tickets.total_mxn` al centavo (regla `ConceptosIncoherentes`).
- **El precio lo calcula el servidor.** La caja lo muestra en vivo, pero la RPC lo recalcula y
  valida mínimos, máximos y pertenencia. Hoy esa validación de modificadores vive solo en el
  cliente; para combos no repetimos eso.
- **Cancelar es por combo.** El padre arrastra a los hijos; un hijo no se cancela solo.
- **Lista explícita de tablas en el sync** (ADR 0004): las dos tablas nuevas se agregan a mano
  al pull y a `catalogo_version()`.

## 4. Modelo de datos — migración `0111_combos.sql`

### 4.1 `productos.es_combo`

```sql
ALTER TABLE productos ADD COLUMN es_combo boolean NOT NULL DEFAULT false;
```

Un producto con `es_combo` **no tiene receta ni área de cocina** (el admin lo impide; la RPC lo
ignora si las tuviera). Sí tiene `precio_base_mxn` (= costo de "hacerlo combo"), `categoria_id`,
`clave_sat` (el admin sugiere `90101503`), `tasa_iva`, `visible_en_pos`, `estado`. Puede tener
grupos de modificadores propios (por ejemplo "Para llevar"), y se aplican al padre.

### 4.2 `combo_grupos` (los slots)

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | RLS por tenant como el resto del catálogo |
| `combo_producto_id` | uuid NOT NULL → `productos` ON DELETE CASCADE | |
| `nombre` | text NOT NULL | "Hamburguesa", "Acompañamiento", "Bebida" |
| `orden_visualizacion` | int NOT NULL DEFAULT 0 | orden de captura en el modal |
| `minimo_selecciones` | int NOT NULL DEFAULT 1 CHECK ≥ 0 | 0 = slot opcional |
| `maximo_selecciones` | int NOT NULL DEFAULT 1 CHECK ≥ `minimo` | |
| `modo_precio` | enum `combo_modo_precio` NOT NULL DEFAULT 'DELTA' | `DELTA` \| `SUMA_PRECIO_PRODUCTO` |
| `categoria_id` | uuid NULL → `categorias` | si viene, las opciones son **todos los productos activos y visibles** de esa categoría (no combos) |
| `activo` | boolean NOT NULL DEFAULT true | |
| `created_at`, `updated_at`, `deleted_at` | | trigger de `updated_at` como las demás tablas de catálogo |

`SUMA_PRECIO_PRODUCTO`: el precio del combo suma `productos.precio_base_mxn` del producto elegido
(más el delta si hay fila en `combo_opciones`). `DELTA`: solo suma el delta (0 si no hay fila).

### 4.3 `combo_opciones`

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | |
| `grupo_id` | uuid NOT NULL → `combo_grupos` ON DELETE CASCADE | |
| `producto_id` | uuid NOT NULL → `productos` | CHECK vía trigger: el producto no es combo |
| `precio_delta_mxn` | numeric(12,2) NOT NULL DEFAULT 0 | admite negativos |
| `es_default` | boolean NOT NULL DEFAULT false | índice único parcial por grupo, como `opciones_modificador` |
| `orden_visualizacion` | int NOT NULL DEFAULT 0 | |
| `activa` | boolean NOT NULL DEFAULT true | |
| `created_at`, `updated_at`, `deleted_at` | | |
| UNIQUE (`grupo_id`, `producto_id`) | | |

Resolución de opciones de un grupo, en este orden:

1. Si `categoria_id` es NULL: las filas activas de `combo_opciones`.
2. Si `categoria_id` viene: los productos `ACTIVO`, `visible_en_pos`, `es_combo = false`,
   `deleted_at IS NULL` de esa categoría; las filas de `combo_opciones` que coincidan aportan
   delta, default y orden. Una fila de `combo_opciones` con `activa = false` **excluye** ese
   producto del slot aunque esté en la categoría.

Un producto `AGOTADO` (manual o automático) se muestra deshabilitado en el modal y la RPC lo
rechaza. Si el default está agotado, no hay preselección.

### 4.4 `ticket_items`: padre e hijos

```sql
ALTER TABLE ticket_items
  ADD COLUMN parent_item_id uuid NULL REFERENCES ticket_items(id) ON DELETE CASCADE,
  ADD COLUMN combo_rol text NULL CHECK (combo_rol IN ('PADRE','HIJO')),
  ADD COLUMN precio_asignado_mxn numeric(12,2) NULL,
  ADD COLUMN combo_grupo_nombre_snapshot text NULL;
CREATE INDEX ON ticket_items (parent_item_id) WHERE parent_item_id IS NOT NULL;
```

| Renglón | `producto_id` | `precio_unitario_snapshot` | `precio_unitario_original_snapshot` | `precio_asignado_mxn` | `area_cocina_nombre_snapshot` |
|---|---|---|---|---|---|
| Padre | el combo | precio final del combo (base + sumas + deltas) | NULL | NULL | NULL |
| Hijo | el producto real | 0 | precio a la carta del producto | prorrateo (abajo) | la del producto |

`cantidad` del hijo = cantidad del combo × cantidad en el slot. Los hijos llevan
`orden_visualizacion` consecutivo al del padre. `combo_grupo_nombre_snapshot` guarda el nombre
del slot para imprimir "Bebida: Coca-Cola".

**Prorrateo** (`precio_asignado_mxn`, informativo, solo reportes): precio del padre repartido
entre los hijos en proporción a `precio_unitario_original_snapshot × cantidad`, redondeado a dos
decimales, el último hijo absorbe la diferencia. Si la suma de precios a la carta es 0, reparto
igual. Se calcula en la RPC y no se recalcula después.

**Recálculo de totales** (`recalcular_totales_ticket`, 0008): sin cambio. El padre aporta su
precio; el hijo aporta `0 + Σ monto_total_mxn` de sus modificadores. Las promociones y descuentos
manuales por ítem se aplican al padre, nunca a un hijo (el POS y `aplicar_promocion` excluyen
`combo_rol = 'HIJO'` de `items_afectados`).

**Inventario** (`descontar_inventario_por_venta`, 0101): sin cambio. Recorre renglones no
cancelados con producto y receta; el padre no tiene receta; los hijos sí. Las reversas por
cancelación y devolución igual.

**Cocina** (`enviado_cocina_at`, 0069): al enviar, se marca padre e hijos.

### 4.5 RPC `agregar_combo_a_ticket`

```sql
agregar_combo_a_ticket(
  p_ticket_id uuid,
  p_combo_producto_id uuid,
  p_cantidad numeric DEFAULT 1,
  p_componentes jsonb,                -- [{grupo_id, producto_id, cantidad, modificadores:[{opcion_modificador_id, cantidad}], nota_cocina, client_id_local}]
  p_modificadores jsonb DEFAULT '[]', -- modificadores del propio combo (padre)
  p_nota_cocina text DEFAULT NULL,
  p_client_id_local text DEFAULT NULL
) RETURNS uuid  -- id del padre
```

Pasos, en una transacción:

1. Carga el combo: `es_combo`, `ACTIVO`, no agotado, del tenant del ticket. Si no, `RAISE`.
2. Carga los grupos activos del combo. Para cada grupo, cuenta componentes de `p_componentes`
   con ese `grupo_id` (sumando `cantidad`) y exige `minimo ≤ n ≤ maximo`. Un `grupo_id` que no
   pertenece al combo: `RAISE`.
3. Para cada componente, verifica que el producto sea opción válida del grupo (§4.3), `ACTIVO`,
   no agotado, no combo. Obtiene `precio_a_la_carta = productos.precio_base_mxn` y `delta`.
4. Precio unitario del padre = `combo.precio_base_mxn + Σ componentes [(modo = SUMA ? precio_a_la_carta : 0) + delta] × cantidad_componente`.
5. Inserta el **padre** con la misma lógica de snapshot de `agregar_item_a_ticket` (0016) pero
   `precio_unitario_snapshot` = paso 4, `combo_rol = 'PADRE'`, `area_cocina_nombre_snapshot = NULL`,
   y sus `p_modificadores` con el bucle de 0016.
6. Inserta cada **hijo** llamando `agregar_item_a_ticket(p_ticket_id, producto_id,
   cantidad × p_cantidad, modificadores, nota_cocina, client_id_local)` y luego
   `UPDATE ticket_items SET precio_unitario_snapshot = 0, precio_unitario_original_snapshot =
   precio_a_la_carta, parent_item_id = padre, combo_rol = 'HIJO', combo_grupo_nombre_snapshot = …,
   precio_asignado_mxn = …` (mismo patrón que `crear_ticket_desde_app`, 0091:82). El trigger de
   recálculo corre con los valores finales.
7. Idempotencia: si `p_client_id_local` ya existe en el ticket, devuelve el padre existente sin
   insertar (mismo contrato que 0016).

`agregar_item_a_ticket` **rechaza** un `p_producto_id` con `es_combo = true` con un mensaje
claro ("usa agregar_combo_a_ticket"), para que ningún camino viejo meta un combo sin hijos.

### 4.6 Cancelación

`cancelar_item_ticket` (0008:1927) se redefine:

- Si el ítem es `PADRE`: cancela el padre y todos sus hijos con el mismo motivo y PIN.
- Si el ítem es `HIJO`: `RAISE 'Cancela el combo completo'`.
- Sin `combo_rol`: como hoy.

`cancelar_ticket_pagado` y las reversas de inventario no cambian: operan sobre todos los renglones.

### 4.7 Sync y versión de catálogo

- `sync_pull_snapshot`: dos claves más, `combo_grupos` y `combo_opciones`, `WHERE tenant_id = p_tenant`
  (incluye borrados lógicos, como el resto del catálogo). Se redefine con `CREATE OR REPLACE`
  sobre el cuerpo vigente (0101).
- `catalogo_version()` (0109): `max(updated_at)` incluye las dos tablas; `productos.es_combo`
  ya entra por `productos.updated_at`.
- Push: sin cambio, `ticket_items` ya sube; las columnas nuevas viajan porque el helper toma
  columnas del `information_schema` (0074).
- Escritorio: `desktop/src/sync-pull.mjs` agrega `{ t: "combo_grupos" }, { t: "combo_opciones" }`
  después de `productos_grupos_modificadores`. Sin clave natural: nunca se crean localmente.

### 4.8 RLS y configuración

- Políticas de las dos tablas calcadas de `productos_grupos_modificadores` (lectura para todo
  el tenant, escritura para roles de catálogo). Prueba en `supabase/tests/0015_combos.test.sql`.
- `configuracion_tenant.combo_upsell_activo boolean NOT NULL DEFAULT true`: enciende el aviso
  "¿Lo hacemos combo?" en caja. Baja por el pull (`configuracion_tenant` ya está en la lista).

## 5. Admin (`apps/admin`)

Nueva pestaña **Combos** en `catalogo-tabs.tsx` (Categorías · Productos · Modificadores · Combos ·
Recetas). Rutas:

| Ruta | Qué hace |
|---|---|
| `/catalogo/combos` | lista: nombre, categoría, precio base, nº de slots, estado; crear, pausar, borrar (soft) |
| `/catalogo/combos/nuevo` | paso 1: datos del producto (nombre, categoría, precio base, clave SAT sugerida `90101503`, IVA). Crea el producto con `es_combo` **en estado `PAUSADO`** —al crearlo no tiene ni un slot, y una caja sin la 0.4.66 lo vendería al precio base sin cocinar nada— y redirige al editor. No hay selector de estado ni de visibilidad: el dueño lo publica desde el editor cuando ya tiene slots |
| `/catalogo/combos/[id]` | editor de slots + vista previa |

Componentes nuevos: `combo-form.tsx` (datos del producto, reutiliza campos de `producto-form.tsx`
sin receta, sin área de cocina, sin código de barras), `combo-slots-editor.tsx` (lista ordenable
de slots; por slot: nombre, mínimo, modo de precio, fuente = categoría o lista; tabla de
opciones con producto, delta, default, activa; el máximo queda fijo en 1 hasta que la caja sepa
atender un slot múltiple —hoy no abriría el grupo de modificadores obligatorio de cada opción, así
que una hamburguesa se iría a cocina sin término), `combo-preview.tsx` (calcula "Con Clásica $150 ·
Con Doble $155 · Aros +$15" con la misma función de precio que la caja, extraída a
`packages/` o duplicada en `apps/admin/app/lib/combos.ts` con prueba de paridad).

Capa de datos `apps/admin/app/lib/combos.ts`: CRUD de grupos y opciones bajo RLS, `zod` como
`catalogo.ts`. `/catalogo/productos` muestra los combos con etiqueta "Combo" y enlace al editor;
`producto-form.tsx` oculta receta y área si `es_combo`. `/catalogo/recetas` excluye combos.

## 6. Caja (`apps/pos`)

### 6.1 Datos

`apps/pos/app/lib/combos.ts`: `obtenerCombo(token, productoId)` devuelve el combo con sus grupos
y las opciones ya resueltas (§4.3) en una sola consulta anidada más una consulta por categorías
fuente; cachea en IndexedDB con clave `combo:${productoId}` (mismo patrón que `mods:` en
`modificadores.ts`, incluido el fallback offline). El catálogo del POS (`catalogo.ts`) trae
`es_combo` en el `Producto`.

`precioCombo(combo, seleccion)` es una función pura, con pruebas, que la barra del modal usa en
vivo y que replica el paso 4 de la RPC. Si el servidor devuelve otro precio, gana el servidor y
el carrito se corrige al persistir (no debería pasar; se registra en consola).

### 6.2 Modal de slots (`modal-combo.tsx`)

- Un slot por paso, en `orden_visualizacion`. Cabecera: nombre del combo, paso "2 de 3",
  precio en vivo. Cuerpo: tarjetas del tamaño del grid de productos, con nombre y delta ("+$15",
  vacío si 0; para `SUMA_PRECIO_PRODUCTO` se muestra el precio del producto). Default
  preseleccionado. Agotados deshabilitados con la etiqueta AGOTADO que ya usa el grid.
- Slot con `maximo = 1`: tocar una tarjeta selecciona y **avanza solo** al siguiente paso. Slot
  con `maximo > 1`: tarjetas con contador y botón Siguiente. Slot con `minimo = 0`: botón "Sin
  esto".
- Si el producto elegido tiene grupos de modificadores obligatorios, se abre `ModalModificadores`
  encima, con su selección inicial actual; al confirmar vuelve al paso. Los opcionales se
  ofrecen con un botón "Personalizar" en la tarjeta seleccionada.
- Último paso: resumen (hamburguesa · término · acompañamiento · bebida), nota a cocina del
  combo, cantidad, botón "Agregar $170". Atrás por paso. Escape cierra sin agregar.
- Reusa tokens y estructura de `modal-modificadores.tsx`; nada de estilos nuevos (ADR 0008).

### 6.3 Carrito (`carrito.ts`)

```ts
type ComponenteSel = { grupoId; grupoNombre; producto: Producto; cantidad; modificadores: ModificadorSel[]; notaCocina?; clientId };
type LineaCarrito = { …existente; combo?: { componentes: ComponenteSel[] } };
```

`precioUnitarioLinea` para una línea con `combo` usa `precioCombo` más los modificadores del
padre; `totalLinea` suma además los extras de los componentes. `renglon-item.tsx` pinta el padre
con precio y los hijos indentados con "Bebida: Coca-Cola 600 · sin hielo"; los extras con costo
del hijo muestran su importe. Editar reabre `modal-combo` con la selección cargada (acción nueva
`reemplazar` en el reducer, que sustituye la línea por `clientId`).

### 6.4 Persistir

`cobro.ts` (`persistirTicket`) y `cuenta-mesa.ts` (`agregarItemAlTicket`) llaman
`agregar_combo_a_ticket` cuando la línea tiene `combo`; el resto sigue en `agregar_item_a_ticket`.
`reconstruirCarrito` agrupa por `parent_item_id`: los `PADRE` se vuelven líneas con `combo`, los
`HIJO` sus componentes, y los renglones sin rol siguen como hoy. Los `client_id_local` de los
hijos se guardan para idempotencia.

### 6.5 "¿Lo hacemos combo?"

En `home-pos.tsx`, tras confirmar un producto suelto (con o sin modificadores), si
`configuracion_tenant.combo_upsell_activo` y existe al menos un combo `ACTIVO` y visible cuyo
primer slot (menor `orden_visualizacion`) admite ese producto (por categoría o por opción), se
muestra una hoja inferior: "¿Lo hacemos combo? +$45 · papas y refresco" con **Sí** y **No, solo**.
El "+$45" es `precioCombo` con ese producto y los defaults del resto de slots, menos el precio
del producto suelto. Si hay varios combos elegibles se muestra el de menor precio resultante y un
enlace "Otros combos". **Sí** abre `modal-combo` en el paso 2 con el producto ya puesto (y sus
modificadores ya elegidos). **No** agrega el producto suelto. El índice "producto → combos que
lo admiten" se calcula una vez al cargar el catálogo. Sin aviso al **agregar a una cuenta de mesa
ya enviada a cocina** (evita reabrir comandas); sí en venta directa y en cuentas nuevas.

## 7. Cocina e impresión

- **Comanda** (`comanda-builder.ts`, `recibo-comanda.tsx`): el padre no se imprime. Cada hijo se
  imprime como renglón propio en su área, con una línea de contexto "↳ Combo #3" (número de
  padre dentro del ticket) para que la estación de bebidas y la de plancha sepan que van
  juntos. `agruparComandaPorArea` reparte hijos por su `area_cocina_nombre_snapshot`.
- **KDS** (`packages/kds-core/src/comandas.ts`): la consulta trae `parent_item_id` y
  `combo_rol`; se excluyen padres y cada hijo lleva `comboEtiqueta` ("Combo #3") que
  `pantalla-kds.tsx` muestra debajo del nombre.
- **Ticket del cliente** (`ticket-builder.ts`, `recibo-ticket.tsx`, `ticket-datos.ts`): "1 Combo
  $170" y debajo, indentados y sin precio, "Hamburguesa Doble · tres cuartos", "Aros de cebolla",
  "Coca-Cola 600"; un extra con costo en un hijo se imprime como hoy ("+ Extra queso") con su
  importe a la derecha.
- `LineaImpresion` gana `comboRol`, `parentId`, `grupoNombre` y `extras: {nombre, importe}[]`.

## 8. CFDI (`_shared/pac/conceptos.ts`)

`LineaTicket` gana `id`, `parentId`, `comboRol`. Antes de `desglosarLinea`, `colapsarCombos(lineas)`:

- Por cada `PADRE`: `subtotalBrutoMxn` += Σ hijos (`subtotalBrutoMxn` + `montoModificadoresMxn`);
  `montoModificadoresMxn` del padre se mantiene (sus propios modificadores); `descuentoItemMxn` y
  `promocionItemMxn` de los hijos son 0 por invariante; `descripcion` = `"{combo} ({hijo1}, {hijo2}, …)"`
  con los nombres de los hijos separados por coma, truncada a 1000 caracteres (límite del
  Anexo 20); tasa y claves del padre. Los hijos se quitan de la lista.
- La suma de conceptos sigue cuadrando con `tickets.total_mxn`: todo lo que sumaba en hijos
  ahora suma en el padre. Prueba unitaria con un combo con extra en un hijo y con descuento
  en el padre.
- Los tres consumidores (`timbrar-cfdi`, `autofacturar`, `timbrar-global`) agregan las tres
  columnas al `select`; `timbrar-global` no cambia de lógica (un concepto por ticket y tasa).
- Hijos con tasa distinta al padre: **NO se asume la del padre** (corregido en la revisión final
  de la rama; la redacción anterior decía lo contrario y era un bug con nombre de decisión). El
  `iva_item_mxn` del hijo se calculó A SU TASA: meterlo dentro de un concepto que declara la tasa
  del padre rompe la correspondencia entre la tasa declarada y el impuesto trasladado. En una
  dirección revienta al armar (descuento negativo → `ConceptosIncoherentes` → el cliente no puede
  facturar); en la otra la aritmética cierra, la red de seguridad `total !== totalTicket` no salta
  y se timbra un comprobante que declara 0.00 % sobre una base de $185 con $1.60 de traslado: una
  factura fiscalmente inválida, en silencio.
  `colapsarCombos` deja como concepto propio —igual que al hijo huérfano— **solo al hijo que
  además cobra dinero**: el que tiene algo distinto de 0 en `subtotalBrutoMxn`,
  `montoModificadoresMxn`, `ivaItemMxn` o `totalItemMxn`. El hijo sin dinero se pliega siempre,
  tenga la tasa que tenga, porque no hay impuesto que declarar mal y sí habría un concepto con base
  0: el Anexo 20 pide que la base de un traslado sea mayor que cero, así que separarlo arriesga
  volver a bloquear el timbrado en el caso normal (los hijos van a precio 0 por construcción) y de
  paso le quita al cliente el nombre de ese componente. O sea que esto solo cambia el comprobante
  cuando alguien paga un extra en un componente de tasa distinta. Sigue sin prorratearse impuesto
  entre hijos.

## 9. Reportes

Regla para toda consulta de ventas por producto (dashboard del admin, ventas por categoría, ventas
por área de cocina): **excluir `combo_rol = 'PADRE'` y, en hijos, sumar `precio_asignado_mxn` tal
cual, sin multiplicar por la cantidad.** `precio_asignado_mxn` YA es un importe de línea completo
—la RPC lo calcula sobre `v_total_padre`, que incluye `p_cantidad`—, así que multiplicarlo otra vez
por la cantidad duplicaría el importe justo cuando se venden dos combos: exactamente el doble
conteo que el ADR quiere evitar. (La redacción anterior decía "× cantidad"; se corrige aquí porque
un spec que contradice al código correcto acaba "arreglando" el código.)

En vez de crear una vista nueva `v_ventas_por_producto`, 0111 **reescribe las tres vistas `vw_*`
que ya existían** (`vw_ventas_por_categoria`, `vw_ventas_por_producto`, `vw_ventas_por_area_cocina`)
para que apliquen la regla. Es mejor decisión: todos los consumidores actuales la heredan sin
tocarlos y no queda una vista vieja al lado, lista para que alguien la consulte por error.

El IVA de la rebanada del hijo se deriva con los atributos fiscales **DEL PADRE** (`tasa_iva_snapshot`
e `iva_incluido_en_precio_snapshot` de la fila `parent_item_id`), no con los del hijo: el dinero al
que se aplica viene del precio del padre y lleva su carácter fiscal. Y cuando el padre cobra con
**IVA por afuera**, la rebanada es un importe NETO: hay que sumarle el IVA derivado a `total_mxn`,
o el reporte queda corto por el impuesto y la fila se contradice a sí misma.

El dashboard agrega el mosaico "Combos vendidos" (conteo de padres). Los combos **no** aparecen en
el top "Populares": esa lista sale de las vistas, que excluyen al padre a propósito, así que un
combo no compite ahí con sus propios componentes; el mosaico ocupa ese lugar.

## 10. Escritorio

- Migración 0111 se aplica sola al arrancar (como 0101). `sync-pull.mjs` con las dos tablas.
- Versión 0.4.66. Lista "Antes de empaquetar" del RUNBOOK completa (postgrest.exe, tamaño del
  .exe, checkout con `desktop/bin`).
- Espejo de delivery (`crear_ticket_desde_app`): sin cambio; un pedido de app no trae combos
  hasta la entrega 2.

## 11. Pruebas

- `supabase/scripts/smoke_combos.sql`: crea combo con tres slots (Hamburguesa por categoría con
  `SUMA_PRECIO_PRODUCTO`, Acompañamiento con delta, Bebida con default), agrega a un ticket y
  verifica: precio del padre, hijos a 0 con prorrateo que suma el precio del padre, rechazo por
  mínimo no cubierto, rechazo por producto fuera del slot, rechazo por agotado, extra en hijo
  sube el total, cancelar padre cancela hijos, cancelar hijo falla, `agregar_item_a_ticket` con
  un combo falla, pago descuenta receta de los hijos y nada del padre, idempotencia por
  `client_id_local`, dos componentes con el mismo `client_id_local` rechazados, modificadores en
  la línea del padre rechazados, y las tres columnas de la vista de ventas (subtotal/IVA/total y
  su relación) con el padre cobrando con IVA dentro y con IVA por afuera.
- `supabase/tests/0015_combos.test.sql`: RLS de las dos tablas y del pull.
- `conceptos.test.ts`: colapso con extra en hijo, con descuento en padre, con dos combos y un
  producto suelto; cuadre al centavo; y **tasas mixtas** en las dos direcciones (hijo a tasa 0 bajo
  padre al 16 % y al revés), que es donde el §8 estaba mal. El helper `cuadra()` comprueba además
  que la tasa que declara cada concepto explique el impuesto que traslada: cuadrar en pesos no
  basta para que una factura sea válida.
- `apps/pos`: pruebas de `precioCombo`, del reducer con `reemplazar`, de `reconstruirCarrito`
  con padre e hijos, y de la elegibilidad del aviso.
- `apps/admin`: paridad `precioCombo` admin vs caja sobre los mismos fixtures — literalmente los
  mismos: ambas pruebas leen `@vim/db/fixtures-combos` (`packages/db/src/fixtures-combos.ts`), así
  que una divergencia entre las dos implementaciones rompe algo en vez de pasar desapercibida.
- `desktop/src/sync-pull.test.mjs`: las dos tablas están en la lista y en orden.
- Manual en localhost con la semilla Crazy Burgers: crear combo, venderlo, comanda por área,
  ticket, timbrar en sandbox, cancelar, reporte.

## 12. Entrega 2 (fuera de este spec): Uber

Uber modela el combo como `item` + `modifier_groups` cuyas `modifier_options` apuntan a otros
`items`, con `price_info.overrides` por contexto (`MODIFIER_GROUP`) para que la Doble valga $110
suelta y +$110 dentro del combo, y `bundled_items` para lo fijo. Requiere primero que
`construirMenuUber` publique grupos de modificadores (hoy `modifier_groups: []`), y que
`normalizarPedidoUber` convierta un pedido con combo en `agregar_combo_a_ticket`. Máximo 6
niveles de anidamiento; sin tamaños. DiDi solo admite combos fijos con precio.

## 13. Riesgos y trampas

- **Doble conteo en reportes** si alguna consulta no pasa por la vista. Se busca `total_item_mxn`
  en `apps/admin` y `apps/pos` al implementar y se lista en el plan.
- **Caja vieja con ticket nuevo**: un 0.4.64 que reciba por pull un ticket con combos (cuenta
  abierta creada en la web) lo verá plano y podría cancelar un hijo suelto. La mitigación que decía
  este spec —"la BD local ya tendrá 0111 al arrancar"— **es falsa** para una caja que todavía no se
  actualizó: sin la 0.4.66 no hay migración 0111 en su Postgres local, así que no existe `es_combo`,
  ni `agregar_combo_a_ticket`, ni la guarda dentro de su `agregar_item_a_ticket`. Esa caja pinta al
  padre como un producto normal y lo vende al precio base (los $45 de "hacerlo combo") sin cocinar
  nada. Mitigación real: **un combo nuevo nace `PAUSADO`** (`crearCombo` en
  `apps/admin/app/lib/combos.ts`) y el dueño lo publica cuando ya tiene sus slots; una caja vieja
  filtra por `estado IN ('ACTIVO','AGOTADO')`, así que nunca lo ve. Y las cajas se actualizan solas,
  salvo si quedaron rotas (ver el incidente de las 0.4.60–0.4.62).
- **Categoría fuente con productos que son opciones de otro slot**: permitido; el precio lo
  fija el slot donde se eligió.
- **Modificadores del padre vs. del hijo**: "Para llevar" en el padre, "término" en el hijo. La
  comanda imprime los del padre en cada hijo como línea de contexto para que cocina no los pierda.
- **`precio_unitario_original_snapshot` en hijos** reutiliza una columna pensada para
  overrides con PIN; `precio_override` queda en falso y `autorizacion_pin_override_id` en NULL,
  así los reportes de overrides no los cuentan.
