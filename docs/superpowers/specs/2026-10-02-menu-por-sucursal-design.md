# Menú distinto por sucursal — diseño

**Fecha:** 2026-10-02 · **Decisión:** ADR 0027 «el menú se ajusta por sucursal» — supera D16 (un solo
precio base) y la nota de `10-SETUP-INICIAL.md` §15.2 («precios pueden variar por sucursal», que
nunca se construyó). Se escribe durante la implementación, en `docs/decisiones/`. ·
**Antecedentes:** catálogo (`0007_catalogo_inventario.sql` §3), combos (ADR 0015, `0111_combos.sql`),
sync por snapshot (ADR 0004, último pull en `0150_anuncios_pantalla.sql:151`), guardas de escritura
directa (`0133_guardas_escritura_directa.sql`), carta de Uber (`supabase/functions/delivery-uber-conexion`,
`_shared/delivery/menu-uber.ts`), inventario por sucursal (ADR 0013).

## 1. Problema

Un negocio con dos sucursales tiene **un solo menú**: `productos` y `categorias` cuelgan de
`tenant_id` y nada lee la sucursal para vender. Consecuencias:

1. **Mismo surtido.** No se puede vender un producto solo en una sucursal.
2. **Mismo precio.** `productos.precio_base_mxn` es el único precio (D16).
3. **Agotar es global.** `agotado_manual` es una columna del producto: agotar en Centro agota en Norte.
4. **Bug del agotado automático.** `evaluar_alertas_stock(insumo, sucursal)`
   (`0007:1613`, nunca redefinida) lee el stock de UNA sucursal pero escribe el producto entero:
   - un insumo crítico en 0 en Centro agota el producto en **todas** las sucursales;
   - el restablecimiento (`0007:1698-1723`) solo mira el stock de la sucursal que se movió, así que
     reabastecer Norte des-agota un producto que en Centro sigue sin insumo.
5. **Uber publica por sucursal pero lee todo el negocio.** `delivery_conexiones` tiene `sucursal_id`
   y "Enviar carta" va por conexión, pero arma la carta con el catálogo completo.

## 2. Alcance

**Entra:**

- Por producto y sucursal: **se vende / no se vende**, **precio propio** (vacío = el general) y
  **agotado** (manual y automático).
- Combos: son productos, así que heredan lo anterior; además sus opciones respetan la sucursal.
- Caja web y escritorio, admin (formulario de producto y lista por sucursal), carta de Uber.
- Corrección del agotado automático (§1.4).
- Aviso en el admin cuando una caja sin actualizar todavía no respeta el menú por sucursal.

**No entra (decidido con Fermín, 02/10/2026):**

- Precio o disponibilidad de **modificadores/extras** por sucursal. Siguen globales.
- Menús por horario, precios por modo de servicio, pantalla de promociones por sucursal.
- Márgenes de receta con precio de sucursal (`recetas.ts` sigue usando el precio general).
- Reportes: ya agrupan por `tickets.sucursal_id` y leen snapshots; no cambian.

## 3. Invariantes

1. **Sin fila = lo general.** Si no hay fila en `productos_sucursal` para (producto, sucursal), el
   producto se vende ahí, al precio general y sin agotar. Un producto nuevo aparece en todas las
   sucursales; una sucursal nueva arranca con todo el menú.
2. **Pausar sigue siendo global y gana.** `productos.estado = 'PAUSADO'` apaga el producto en todas
   las sucursales sin importar sus filas.
3. **El precio lo fija el servidor con la sucursal del ticket.** La caja lo muestra; nunca lo manda.
4. **Lo que ya está en una cuenta no cambia de precio.** El precio se congela en
   `ticket_items.precio_unitario_snapshot` al agregar, igual que hoy.
5. **Las columnas de agotado del producto son derivadas.** `productos.agotado_manual`,
   `agotado_automatico` y `motivo_agotado` pasan a significar «agotado en **todas** las sucursales» y
   solo las escribe un trigger. Existen para que una caja sin actualizar siga funcionando.
   `productos.estado` queda en `ACTIVO`/`PAUSADO`; `AGOTADO` deja de usarse.
6. **No se borran filas de `productos_sucursal`.** El pull del escritorio nunca borra
   (`sync-pull.mjs:134`). «Quitar la excepción» = volver la fila a sus valores por defecto.
7. **La caja filtra, el servidor cobra.** Igual que hoy con el agotado, `agregar_item_a_ticket` no
   rechaza un producto por no venderse en la sucursal (un pedido de Uber pagado no se pierde por una
   carta vieja). Los combos sí validan, como ya validan el agotado (§5.2).

## 4. Datos — migración `0151_menu_por_sucursal.sql`

### 4.1 La tabla

```sql
CREATE TABLE productos_sucursal (
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  producto_id         uuid NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
  disponible          boolean NOT NULL DEFAULT true,
  precio_mxn          numeric(12,2) NULL CHECK (precio_mxn IS NULL OR precio_mxn >= 0),
  agotado_manual      boolean NOT NULL DEFAULT false,
  agotado_automatico  boolean NOT NULL DEFAULT false,
  motivo_agotado      text NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id),
  PRIMARY KEY (producto_id, sucursal_id)
);
```

- **Llave compuesta**, sin `id`: el upsert genérico del pull (`upsertTabla`,
  `sync-pull.mjs:86-111`) lee la PK de `pg_index` y arma `ON CONFLICT` con todas sus columnas, así que
  la resuelve sin entrada en `CLAVES_NATURALES` (que solo existe para tablas con `id` + `UNIQUE`
  natural, como `insumo_stock_sucursal`). El admin hace upsert con
  `onConflict: 'producto_id,sucursal_id'`.
- Índice `(tenant_id, sucursal_id)` para la lectura de la caja.
- **RLS** igual que `productos`: `tenant_id = current_tenant_id()` en USING y WITH CHECK.
- **Trigger de coherencia** (BEFORE INSERT/UPDATE): `tenant_id` se toma del producto y la sucursal
  debe ser del mismo negocio; si no, excepción. Evita apuntar a la sucursal de otro negocio.
- **Guardia de escritura directa** (0133): la tabla entra a la lista de catálogo — escribirla por REST
  exige `config.productos`. Además, por REST **no** se puede cambiar `agotado_automatico` (lo escribe
  solo `evaluar_alertas_stock`, que entra por RPC o por trigger y la guardia ya deja pasar). Se
  redeclara `guardia_escritura_directa()` desde su única versión (0133; 0144 no la toca) y se le
  cuelga el trigger `a00_guardia_escritura_directa`.
- `set_updated_at` en UPDATE.
- `eliminar_tenant` (0144) recorre toda tabla con `tenant_id`: entra sola.

### 4.2 Funciones de lectura

- `precio_producto_en_sucursal(p_producto uuid, p_sucursal uuid) RETURNS numeric` —
  `COALESCE(ps.precio_mxn, p.precio_base_mxn)`. STABLE. Es la única regla de precio por sucursal en
  SQL; la de TS (§6.1) la replica y sus pruebas usan los mismos casos.
- `producto_en_sucursal(p_producto, p_sucursal)` → `(se_vende boolean, agotado boolean, motivo text)`:
  `se_vende = estado <> 'PAUSADO' AND COALESCE(ps.disponible, true)`;
  `agotado = COALESCE(ps.agotado_manual OR ps.agotado_automatico, false)`.

### 4.3 Agotado derivado en `productos` (compatibilidad)

Trigger AFTER INSERT/UPDATE en `productos_sucursal` que recalcula, para ese producto:

- `productos.agotado_manual` = el producto tiene `agotado_manual` en **todas** las sucursales activas
  del negocio (`activa AND deleted_at IS NULL`; falta de fila = no agotado);
- `productos.agotado_automatico` = lo mismo con `agotado_automatico`;
- `productos.motivo_agotado` = el motivo si queda agotado, NULL si no.

No toca `estado`. Para un negocio de una sola sucursal —hoy, todos— el resultado es idéntico a lo
actual, en cualquier versión de la caja. En el escritorio el pull aplica en modo réplica (sin
triggers) y trae `productos` ya derivado desde la nube; el trigger local solo corre cuando la propia
caja evalúa alertas (§4.5).

### 4.4 Migración de datos

1. Por cada producto con `agotado_manual = true`: una fila por cada sucursal no borrada de su negocio
   con `agotado_manual = true` y su `motivo_agotado`.
2. Igual con `agotado_automatico = true` (conserva el estado de hoy; el siguiente movimiento de cada
   insumo lo recalcula ya por sucursal).
3. `UPDATE productos SET estado = 'ACTIVO' WHERE estado = 'AGOTADO'`.

El aviso de la migración (`RAISE NOTICE`) cuenta filas creadas por negocio.

### 4.5 `evaluar_alertas_stock` por sucursal

Se redeclara completa desde `0007:1613`. Cambian solo los dos `UPDATE productos`:

- **Agotar:** upsert en `productos_sucursal (producto, p_sucursal_id)` con `agotado_automatico = true`
  y el motivo, donde esa fila no tenga `agotado_manual`.
- **Restablecer:** `agotado_automatico = false` en las filas de `p_sucursal_id` cuyos insumos críticos
  tengan todos stock **en esa sucursal** (la condición de hoy, ya bien acotada).

El trigger de §4.3 deriva `productos`. Las alertas (`alertas_inventario`) no cambian: ya eran por
sucursal. `_vim_aplicar_movimientos` (0101) no se toca: ya llama con la sucursal correcta.

### 4.6 Sync al escritorio (solo bajada)

La caja no escribe la tabla salvo vía `evaluar_alertas_stock` local, que el pull pisa con la versión
de la nube (igual que hoy con `productos`). No hay push.

- `sync_pull_snapshot`: se redeclara completa desde 0150 con la llave `productos_sucursal`.
- `catalogo_version()`: se redeclara desde 0150 con `max(updated_at)` de la tabla.
- `desktop/src/sync-pull.mjs`: `productos_sucursal` en `PULL_ORDER` después de `productos` (y de
  `sucursales`, que ya va antes).

## 5. Precio y validación en el servidor

### 5.1 `agregar_item_a_ticket` (última versión: `0111:136`)

Lee `tickets.sucursal_id` junto con lo que ya lee del ticket y toma el precio con
`precio_producto_en_sucursal`. Nada más cambia. `reemplazar_item_ticket` (0119) y la edición de
renglón lo heredan. `crear_ticket_desde_app` sigue sobrescribiendo con el precio de la app.

### 5.2 `agregar_combo_a_ticket` (última versión: `0111:246`)

- Precio del combo padre: `precio_producto_en_sucursal(combo, sucursal del ticket)`.
- Componentes en modo SUMA: su precio por sucursal.
- La validación que hoy rechaza combo o componente «agotado o pausado» pasa a usar
  `producto_en_sucursal`: rechaza si no se vende en la sucursal o está agotado **ahí**.

## 6. La caja (web y escritorio)

### 6.1 Carga del catálogo

`listarProductosPos(token, sucursalId)` (`apps/pos/app/lib/catalogo.ts:48`) lee `productos` como hoy
y además `productos_sucursal` de esa sucursal, y las junta con una función pura
`aplicarSucursal(productos, filas)` (archivo nuevo `lib/catalogo-sucursal.ts`, con prueba unitaria):

- `precio_base_mxn` del objeto `Producto` de la caja = precio de la sucursal. Así el carrito, los
  modales, `precioCombo`, la pantalla del cliente y la reapertura de cuentas lo usan sin cambios.
  El tipo lo documenta: en la caja es «el precio que cobra esta sucursal».
- `agotado` = agotado de la sucursal (deja de leer `estado`/flags globales).
- `seVendeAqui` (nuevo) = `COALESCE(disponible, true)`.

`home-pos.tsx` pasa `caja.sucursal_id` (ya lo tiene).

### 6.2 Qué se oculta

- La cuadrícula (`catalogo-productos.tsx`) y las opciones de combo (`combos.ts`, `armarCombos`)
  excluyen `seVendeAqui = false`.
- Una categoría sin productos visibles en la sucursal no se muestra.
- **La lista cargada sí los conserva.** `cuenta-mesa.ts:146-161` tira los renglones cuyo producto no
  encuentra; con el producto marcado en vez de quitado, una cuenta abierta no pierde renglones.

### 6.3 Caché

La llave de combos (`"combos"`, `combos.ts:152/157`) pasa a `combos:${tenant}:${sucursal}`, porque
sus opciones dependen de la sucursal. La de modificadores no cambia (siguen globales).

### 6.4 Escritorio

Sirve la misma UI sobre su Postgres local, que aplica las mismas migraciones: no hay código aparte
fuera de §4.6. Versión nueva del escritorio e instalador.

## 7. Admin

### 7.1 Formulario de producto (`producto-form.tsx`)

Si el negocio tiene 2 o más sucursales, la sección «Disponibilidad» cambia el casillero de agotado por
una fila por sucursal:

| Sucursal | Se vende | Precio | Agotado |
|---|---|---|---|
| Centro | ☑ | `[ placeholder: $89 general ]` | ☐ |
| Norte | ☑ | `[ 95 ]` | ☐ · *Agotado por inventario* |

- Producto nuevo: todas marcadas.
- «Agotado por inventario» es una etiqueta de solo lectura (`agotado_automatico`).
- Al guardar: se guarda el producto y luego un upsert por sucursal. Las filas que quedan en los
  valores por defecto también se guardan así (invariante 6).
- Con una sola sucursal el formulario se ve como hoy; el casillero «Agotado» escribe la fila de esa
  sucursal.
- `ProductoForm` lo reusa `combos/[id]`: los combos lo heredan.
- El admin deja de escribir `productos.agotado_manual` y `estado = 'AGOTADO'` (`resolverEstado`).

### 7.2 Lista de productos por sucursal

En `catalogo/productos/page.tsx`, con 2 o más sucursales, un selector «Todas · Centro · Norte».

- **Todas:** como hoy.
- **Una sucursal:** cada renglón muestra el precio de esa sucursal y deja, en línea, apagar «Se vende
  aquí» y escribir el precio (vacío = general). Guarda al salir del campo. Sirve para armar el menú
  de Norte sin abrir 80 productos.

### 7.3 Aviso de cajas sin actualizar

Si el negocio tiene alguna fila con `disponible = false` o `precio_mxn` no nulo, y alguna caja de
escritorio (`ultimo_latido` no nulo) reporta `cajas.version_app` nula (anterior a 0.4.60) o menor a la
versión que trae esta función, el formulario y la lista muestran: «La caja *X* (*Norte*) tiene la
versión *v*: hasta que se actualice vende todo al precio general». La versión mínima es una constante
en el admin. La caja web no cuenta: toma el código nuevo al desplegar.

## 8. Uber

`delivery-uber-conexion`, acción `"menu"` (`index.ts:347-426`):

- lee además `productos_sucursal` de `conexion.sucursal_id`;
- pasa a `construirMenuUber` los productos ya con el precio, el agotado y `seVendeAqui` de esa
  sucursal. La regla de §6.1 se replica en `_shared/delivery/menu-uber.ts` (Deno no importa de
  `apps/pos`); los comentarios de cada lado apuntan al otro y las pruebas usan los mismos casos;
- excluye lo que no se vende ahí; los combos en modo SUMA usan el precio por sucursal de sus
  componentes.

Los pedidos entrantes no cambian. El reenvío de la carta sigue siendo manual («Enviar carta»).

## 9. Pruebas

### 9.1 pgTAP — `supabase/tests/0035_menu_por_sucursal.test.sql`

- RLS: un negocio no lee ni escribe filas de otro; no puede apuntar a la sucursal de otro.
- Guardia: un rol sin `config.productos` no escribe; nadie cambia `agotado_automatico` por REST.
- `precio_producto_en_sucursal`: sin fila, con fila sin precio, con precio.
- `agregar_item_a_ticket` cobra el precio de la sucursal del ticket.
- `agregar_combo_a_ticket`: precio por sucursal del padre y de componentes SUMA; rechaza un
  componente que no se vende o está agotado en esa sucursal.
- **El bug:** insumo crítico en 0 en Centro agota solo en Centro; reabastecer Norte no des-agota
  Centro.
- Derivado: con una sola sucursal, `productos.agotado_*` queda igual que antes; con dos, solo
  «agotado en todas» marca el producto.
- La llave `productos_sucursal` viaja en `sync_pull_snapshot`.

### 9.2 Smoke — `supabase/scripts/smoke_menu_sucursal.sql`

Recorrido de venta con dos sucursales: precio distinto, producto apagado en una, combo, agotado
automático. Bloquea el merge (job `rls-tests`).

### 9.3 Unitarias

- `catalogo-sucursal.test.ts`: `aplicarSucursal` (sin fila, precio propio, apagado, agotado).
- `combos`: opciones con `seVendeAqui = false` no salen.
- `menu-uber`: carta de una sucursal con producto apagado y precio propio.
- `desktop/src/sync-pull.test.mjs`: `productos_sucursal` después de `productos` en `PULL_ORDER`.

### 9.4 Escritorio

`npm run verify:migraciones` (aplica 0151 en Postgres vacío) y `npm run verify:sync`.

### 9.5 A mano

Supabase local con dos sucursales y dos cajas: menú distinto en cada una, cuenta abierta con un
producto que luego se apaga (no pierde el renglón), y carta de Uber de cada sucursal.

## 10. Despliegue

1. Migración 0151 a producción **antes** de mezclar (regla del proyecto).
2. Desplegar `delivery-uber-conexion`.
3. Mezclar; Vercel publica admin y POS web.
4. Instalador del escritorio con la lista «Antes de empaquetar» del RUNBOOK; lista de lo que incluye a
   Fermín antes de publicar.

## 11. Riesgos abiertos

- **Cajas sin actualizar** en negocios multi-sucursal cobran el precio general y muestran todo. Lo
  mitiga el aviso de §7.3; no hay forma de forzarlo desde la nube.
- **`areas_cocina`** es por sucursal pero `productos.area_cocina_id` apunta a la de una sola; el
  ruteo funciona por nombre (`0120:105`). No se toca aquí, pero un negocio con menús distintos lo
  va a notar si nombra distinto sus áreas.
- **Promociones** ya tienen `condiciones.sucursales_aplicables` sin pantalla que lo escriba; queda
  fuera.
