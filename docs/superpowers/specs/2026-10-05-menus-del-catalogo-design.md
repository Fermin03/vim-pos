# Menús del catálogo — diseño

**Fecha:** 2026-10-05 · **Decisión:** ADR 0029 «el menú es de quien administra; la caja lee lo
proyectado» — se escribe durante la implementación. Ajusta el ADR 0027 (menú por sucursal): no lo
revierte, cambia **cómo se captura**. ·
**Antecedentes:** `productos_sucursal` y su regla (`0152_menu_por_sucursal.sql`, ADR 0027, en
producción desde el 2 oct 2026 con la 0.4.110), la pantalla que se reemplaza
(`apps/admin/app/(panel)/catalogo/productos/page.tsx`, `components/disponibilidad-sucursales.tsx`,
`lib/menu-sucursal.ts`), el selector compartido de sucursal (`components/selector-sucursal.tsx`, #98),
las pestañas del catálogo (`components/catalogo-tabs.tsx`).

## 1. Problema

El menú por sucursal funciona, pero el dueño no lo encuentra ni lo entiende (Fermín, 5 oct 2026):

1. **Está escondido.** Vive en un selector dentro de Productos y en una tabla dentro de cada
   producto. En Categorías, Combos y Modificadores no existe.
2. **No tiene nombre.** El dueño no «tiene un menú para Norte»: tiene excepciones sueltas por
   producto y sucursal. No hay un lugar donde crearlo ni desde dónde mirarlo completo.
3. **Compara precios** («General $120.00» bajo el precio de la sucursal), y eso distrae: el dueño
   quiere ver lo que cobra ese menú, no una diferencia.

En producción `productos_sucursal` está vacía (nadie lo ha usado) y un solo negocio tiene dos
sucursales activas: no hay datos que convertir.

## 2. Alcance

**Entra:**

- **Menús con nombre.** «Nuevo menú» pide nombre y a qué sucursales aplica. Arranca como copia del
  General. Editar (nombre, sucursales) y eliminar.
- **Selector de menú** arriba de las pestañas del Catálogo, visible en Categorías, Productos,
  Combos, Modificadores y Recetas; recuerda la última elección.
- Dentro de un menú: apagar productos y combos, cambiarles el precio, y **apagar o encender una
  categoría entera**.
- **Precios independientes por menú**: cambiar un precio en el General no toca los demás menús.
- Producto nuevo: creado en el General sale en todos los menús; creado dentro de un menú, solo
  existe en ese.
- El agotado sigue **por sucursal**, fuera del menú.
- Se retira la UI por sucursal de 0152 (selector de sucursal en Productos, columnas «Se vende» y
  «Precio» de la tabla por sucursal del formulario) y la línea que compara con el precio general.

**No entra:**

- Cambios en la caja, el servidor de venta, la carta de Uber o el sync: siguen leyendo
  `productos_sucursal` como desde la 0.4.110. **No hay instalador nuevo por esta función.**
- Modificadores y recetas por menú (siguen iguales en todos).
- Orden de categorías por menú, menús por horario, copiar un menú desde otro que no sea el General.
- Seguir al General «salvo lo que toqué» (decidido: no; cada menú es independiente).

## 3. Invariantes

1. **Cada sucursal usa exactamente un menú.** `sucursales.menu_id` nulo = el General.
2. **El General es el catálogo de siempre.** Su precio es `productos.precio_base_mxn` y «se vende»
   es `productos.en_menu_general`. No tiene fila en `menus`.
3. **Un menú propio es completo e independiente.** Tiene una fila por cada producto vivo del
   negocio, con su propio `disponible` y su propio `precio_mxn` (nunca nulo). Nada de lo que pase
   después en el General cambia esas filas.
4. **La caja lee lo proyectado.** `productos_sucursal.disponible` y `.precio_mxn` dejan de escribirse
   a mano: los escribe la base a partir del menú de la sucursal. `agotado_*` no se toca (sigue
   siendo de la sucursal).
5. **Las filas de `productos_sucursal` siguen sin borrarse** (el pull de la caja no trae bajas): al
   volver una sucursal al General, sus filas regresan a `disponible = en_menu_general`,
   `precio_mxn = NULL`.
6. **Pausar sigue siendo global y gana** (`productos.estado = 'PAUSADO'`), como en ADR 0027.
7. **Sin comparaciones.** Ninguna pantalla enseña el precio de otro menú junto al del menú elegido.

## 4. Datos — migración nueva (número: el siguiente libre al implementar; hoy sería 0155)

### 4.1 Tablas y columnas

```sql
CREATE TABLE menus (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  nombre      varchar(80) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz NULL
);
-- Nombre único por negocio entre los vivos (sin distinguir mayúsculas).

ALTER TABLE sucursales ADD COLUMN menu_id uuid NULL REFERENCES menus(id) ON DELETE SET NULL;

CREATE TABLE menu_productos (
  menu_id      uuid NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
  producto_id  uuid NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  disponible   boolean NOT NULL DEFAULT true,
  precio_mxn   numeric(12,2) NOT NULL CHECK (precio_mxn >= 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (menu_id, producto_id)
);

ALTER TABLE productos ADD COLUMN en_menu_general boolean NOT NULL DEFAULT true;
```

- **RLS** por negocio en `menus` y `menu_productos` (como `productos`); el `tenant_id` de
  `menu_productos` sale del menú y el producto tiene que ser del mismo negocio (trigger de
  coherencia, como en 0152 §2).
- **Quién escribe por REST:** `config.productos`, con el mismo criterio de guardia que 0152 §3
  (función propia). `menu_productos` no se borra por REST (se va con su menú o su producto).
- `sucursales.menu_id`: solo se asigna un menú **vivo y del mismo negocio**; lo valida un trigger.
  **No se escribe por REST**: solo lo mueven las RPCs de §4.2 (un trigger rechaza el cambio directo,
  con el criterio de `_es_escritura_rest_directa`). Así un cajero no cambia el menú de su sucursal.
- `productos_sucursal` (0152): la guardia se endurece — por REST ya **no** se escriben `disponible`
  ni `precio_mxn` (igual que hoy `agotado_automatico`): en INSERT se fuerzan a lo proyectado, en
  UPDATE se conserva el valor anterior. Por REST solo queda `agotado_manual`.
- `eliminar_tenant` (0144) recorre toda tabla con `tenant_id`: las dos entran solas.

### 4.2 Crear, editar y eliminar un menú — por RPC

Tres funciones `SECURITY INVOKER` (corren bajo RLS; exigen `config.productos`), porque cada una
toca varias tablas y tiene que ser una sola transacción:

- `crear_menu(p_nombre text, p_sucursales uuid[]) RETURNS uuid` — crea el menú, **copia el
  General** (una fila en `menu_productos` por cada producto vivo: `disponible = en_menu_general`,
  `precio_mxn = precio_base_mxn`) y asigna las sucursales. Exige al menos una sucursal.
- `actualizar_menu(p_menu uuid, p_nombre text, p_sucursales uuid[])` — renombra y deja el menú
  aplicando **exactamente** a esas sucursales: las que sobran vuelven al General. Puede quedar sin
  sucursales (el menú se conserva con su contenido).
- `eliminar_menu(p_menu uuid)` — baja lógica (`deleted_at`); sus sucursales vuelven al General.

Una sucursal que ya estaba en otro menú se mueve al nuevo (invariante 1); la pantalla lo dice antes
de guardar.

### 4.3 La proyección a `productos_sucursal`

Una función, `proyectar_menu(p_sucursal uuid, p_producto uuid DEFAULT NULL)`, es el único lugar que
decide lo que lee la caja. Para la sucursal (y el producto, o todos):

| Menú de la sucursal | `disponible` | `precio_mxn` |
|---|---|---|
| General (`menu_id` nulo) | `productos.en_menu_general` | `NULL` (cobra `precio_base_mxn`) |
| Menú propio | `menu_productos.disponible` | `menu_productos.precio_mxn` |

Hace upsert sin tocar `agotado_*`. Para una sucursal en el General no crea filas que quedarían en
los valores por defecto (el menú sigue escaso, como en 0152); las que ya existen sí se actualizan.

La disparan triggers `AFTER`:

| Cambio | Se proyecta |
|---|---|
| INSERT/UPDATE en `menu_productos` | ese producto en las sucursales de ese menú |
| UPDATE de `sucursales.menu_id` | todos los productos de esa sucursal |
| UPDATE de `productos.en_menu_general` | ese producto en las sucursales del General |
| INSERT de un producto | ver §4.4 |

`productos.precio_base_mxn` no dispara nada: las sucursales del General ya lo leen (precio nulo) y
los menús propios no lo siguen (invariante 3).

En la caja el pull aplica en modo réplica (sin triggers) y trae `productos_sucursal` ya proyectado
de la nube; `menus` y `menu_productos` no bajan a la caja (no las necesita). `sucursales.menu_id`
viaja en el snapshot de `sucursales` y una caja anterior a esta migración lo ignora (el pull solo
aplica las columnas que su base conoce).

`catalogo_version()` no cambia: la proyección mueve `productos_sucursal.updated_at`, que ya cuenta.

### 4.4 Producto nuevo

Trigger `AFTER INSERT` en `productos`: por cada menú vivo del negocio inserta su fila en
`menu_productos` con `disponible = NEW.en_menu_general` y `precio_mxn = NEW.precio_base_mxn`.

- Creado en el General (`en_menu_general = true`): sale en todos los menús, al precio con que nació.
- Creado **dentro de un menú**: el admin lo inserta con `en_menu_general = false` (nace apagado en
  todos) y enseguida enciende su fila en el menú elegido. Si ese segundo paso falla, el producto
  existe apagado en todos y la pantalla lo dice («Se creó, pero no se pudo encender en este menú»).

### 4.5 Lo que NO cambia de 0152

`precio_producto_en_sucursal`, `motivo_no_disponible_en_sucursal`, las RPCs de venta,
`evaluar_alertas_stock`, el agotado derivado, `sync_pull_snapshot`, la carta de Uber
(`aplicarSucursalCarta`) y la caja (`aplicarSucursal`): leen `productos_sucursal` y no se enteran de
que ahora la llena un menú.

## 5. Admin

### 5.1 Selector de menú

Componente `SelectorMenu` + hook `useMenuCatalogo()`, con el patrón de `selector-sucursal.tsx`
(`?menu=` en la URL y `localStorage`, clave `vim.catalogo.menu`). Se pinta en una franja entre el
encabezado y `CatalogoTabs`, en las cinco pestañas:

- una pastilla por menú: «General» y cada menú propio, con las sucursales que lo usan en gris
  («Menú Norte · León Norte»);
- «Nuevo menú» a la derecha;
- en el menú elegido (si no es el General), «Editar» y «Eliminar».

**Cuándo se pinta:** con dos o más sucursales activas, o si existe algún menú propio. Con una sola
sucursal y sin menús, el Catálogo se ve como hoy.

Las pestañas conservan el menú elegido al cambiar de una a otra.

### 5.2 Nuevo menú / Editar menú

Modal: nombre (obligatorio, único) y una casilla por sucursal activa, con el menú que usa hoy al
lado («usa: General»). Al marcar una sucursal que está en otro menú propio: «Dejará de usar *Menú
Sur*». Guardar llama a `crear_menu` / `actualizar_menu` y deja elegido ese menú.

Eliminar pasa por `DialogoPeligro` y nombra la consecuencia: «*León Norte* volverá a usar el menú
General».

### 5.3 Productos y Combos

Con un menú elegido, la tabla es la de la maqueta aprobada: nombre, casilla «En este menú» («Se
vende» en el General), precio editable en línea y estado. **Sin** la línea «General $…».

- En un menú propio: la casilla y el precio escriben `menu_productos`.
- En el General: la casilla escribe `productos.en_menu_general` y el precio `precio_base_mxn`.
- Se conserva lo ya resuelto en la lista de 0152: cola de escrituras (una a la vez, ninguna se
  pierde), Enter confirma, un precio inválido no guarda (`precioValido`), nada de mezclar datos al
  cambiar de menú.
- Estados: «Activo», «No se vende aquí», «Pausado». El filtro «No se venden aquí» se conserva.
- Combos: son productos; su pestaña recibe la misma casilla y precio.

### 5.4 Categorías

Con un menú elegido:

- el conteo es «*N* de *M* productos» que se venden en ese menú;
- cada categoría tiene un interruptor: **apagar** apaga todos sus productos en ese menú; **encender**
  los enciende todos. Con parte encendida se muestra «parcial» y el interruptor ofrece encender el
  resto. Es una acción sobre los productos (no hay estado propio de categoría por menú): un
  producto nuevo en una categoría apagada nace encendido, y la categoría pasa a «parcial».
- Crear, renombrar, ordenar y borrar categorías sigue siendo global; la pantalla lo dice.

La caja ya esconde una categoría que no tiene nada que vender en su sucursal (0152, `menuVisible`).

### 5.5 Modificadores y Recetas

Sin cambios, con una línea bajo la franja del selector cuando hay un menú propio elegido: «Los
modificadores son los mismos en todos los menús.» (igual para recetas).

### 5.6 Formulario de producto

- «Precio» y «En este menú» (se vende / no se vende) son **del menú elegido**; el encabezado lo
  dice («Menú Norte»). El resto de los datos (nombre, categoría, fiscales…) son del producto y
  valen para todos los menús; un rótulo lo aclara cuando hay menús.
- «Pausado · no aparece en ningún menú» se conserva como opción global.
- La tabla «Por sucursal» de 0152 pierde «Se vende» y «Precio»: queda **«Agotado hoy»**, una casilla
  por sucursal (más la etiqueta «Agotado por inventario»). Con una sola sucursal, el selector de
  siempre con «Agotado».
- Producto nuevo dentro de un menú propio: se crea solo en ese menú (§4.4), y el formulario lo
  avisa antes de guardar («Solo se venderá en Menú Norte»).

### 5.7 Aviso de cajas sin actualizar

Se conserva (`cajasQueNoRespetanMenu`, mínima 0.4.110): una caja anterior no respeta ningún menú.
`hayMenuPorSucursal` sigue mirando `productos_sucursal`, que ahora llena la proyección.

### 5.8 Lo que se retira

`SelectorSucursal` local de la lista de productos, `leerMenuDeSucursal`/`guardarMenuSucursal` para
precio y disponibilidad, las columnas «Se vende» y «Precio» de `disponibilidad-sucursales.tsx`, y la
línea «General $…» de la lista.

## 6. Pruebas

### 6.1 pgTAP

- RLS: un negocio no ve ni escribe menús de otro; no se asigna a una sucursal el menú de otro
  negocio ni un menú eliminado.
- Guardia: sin `config.productos` no se crean menús ni se escribe `menu_productos`; por REST no se
  cambian `productos_sucursal.disponible`/`precio_mxn`.
- `crear_menu` copia el General (precio y `en_menu_general`) y exige una sucursal.
- Independencia: cambiar `precio_base_mxn` no cambia `menu_productos` ni lo proyectado a una
  sucursal con menú propio.
- Proyección: fila de menú → sucursales del menú; mover una sucursal de menú; volver al General
  (precio nulo, `disponible = en_menu_general`); no toca `agotado_*`.
- Producto nuevo: fila en cada menú vivo; exclusivo de un menú (apagado en el General y en los demás).
- `eliminar_menu`: sucursales al General y proyección revertida.

### 6.2 Smoke — `smoke_menus.sql`

Dos sucursales, «Menú Norte» con un precio distinto y un producto apagado: la venta en Norte cobra
el precio del menú y el combo rechaza lo apagado (las RPCs de 0152, ahora alimentadas por el menú);
subir el precio en el General no cambia lo que cobra Norte. `smoke_menu_sucursal.sql` (0152) sigue
pasando: escribe `productos_sucursal` como superusuario, que la guardia deja pasar.

### 6.3 Unitarias (admin)

Elección inicial del menú (URL → guardado → General); filas de la tabla por menú; estado de una
categoría (encendida / apagada / parcial) y qué escribe su interruptor; textos del modal al mover
una sucursal de menú.

### 6.4 A mano, en local

Crear «Menú Norte», apagar una categoría, cambiar precios, crear un producto solo de Norte; abrir la
caja de cada sucursal (POS empaquetado en el navegador) y comprobar que cada una ve y cobra su
menú; borrar el menú y ver que Norte vuelve al General.

## 7. Despliegue

Migración a producción antes de mezclar; después el admin por Vercel. Sin función de Uber que
desplegar y **sin instalador**: las cajas 0.4.110 ya leen lo proyectado. La migración entra en el
siguiente instalador que salga por otro motivo, y en la caja no hace nada visible.

## 8. Riesgos abiertos

- **Menús propios densos.** Cada menú guarda una fila por producto, y cada una se proyecta a sus
  sucursales: un negocio con 200 productos y un menú para dos sucursales son 200 + 400 filas. Es
  poco, pero el pull de la caja las trae todas.
- **Subir un precio en todos los menús** exige cambiarlo en cada uno (decidido así). Si molesta en
  el uso real, la salida es una acción «Aplicar este precio a todos los menús», no volver a la
  herencia.
- **Un menú sin sucursales** se conserva pero no lo usa nadie; la franja lo muestra «sin sucursales».
- **`areas_cocina`** sigue como en ADR 0027 (por nombre); no cambia aquí.
