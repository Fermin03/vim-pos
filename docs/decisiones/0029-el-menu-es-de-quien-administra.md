# 0029 — El menú es de quien administra; la caja lee lo proyectado

**Fecha:** 2026-10-05 · **Estado:** vigente · **Ajusta:** ADR 0027 (menú por sucursal). No lo
revierte: cambia cómo se captura.

## Qué había

Desde 0152 cada sucursal guardaba excepciones por producto (`productos_sucursal`: se vende, precio,
agotado). Funcionaba, pero el dueño no lo encontraba: estaba en un selector dentro de Productos y
en una tabla dentro de cada producto, no tenía nombre, no existía en Categorías ni en Combos, y
comparaba cada precio con el general. En producción nadie lo había usado.

## Qué hacemos ahora (migración 0155)

- **Menús con nombre.** `menus` + `menu_productos`; `sucursales.menu_id` dice cuál usa cada
  sucursal (nulo = el General). El General es el catálogo de siempre: `productos.precio_base_mxn` y
  `productos.en_menu_general`.
- **Un menú propio es una copia independiente.** `crear_menu` copia el General; desde ahí tiene su
  propio precio y su propio «se vende» por producto. Cambiar el General no lo toca. Un producto
  nuevo entra a cada menú al precio con que nació. El nombre de un menú admite hasta 80 caracteres.
- **`productos_sucursal` pasa a ser lo proyectado.** `proyectar_menu()` y sus triggers copian ahí
  (`disponible`, `precio_mxn`) lo que dice el menú de la sucursal. La caja, las RPCs de venta, el
  sync y Uber siguen leyendo esa tabla, sin cambios y sin instalador nuevo. Por REST ya no se
  escriben esas dos columnas; el agotado sigue siendo de la sucursal.
- **El admin trabaja por menú.** Un selector arriba de las pestañas del Catálogo, «Nuevo menú», y
  en cada pestaña el menú elegido: productos, combos y categorías enteras se apagan y se les cambia
  el precio ahí. Sin comparar con el precio de otro menú.
- Crear, editar y borrar un menú va por RPC (toca varias tablas); el menú de una sucursal no se
  cambia por REST.

## Por qué así

- **No se guarda el menú solo como «grupo de sucursales»**: un menú sin sucursales perdería su
  contenido, y dos sucursales del mismo menú podrían divergir sin que nadie lo vea.
- **No se hace que la caja lea el menú directo**: obligaría a otro instalador y a rehacer 0152 dos
  días después de publicarlo, sin que el dueño note diferencia.
- **Precios independientes, no heredados**: sin comparación en pantalla, una herencia «salvo lo que
  toqué» no se ve, y un precio que cambia solo en otro menú es una sorpresa.

## Consecuencias

- Subir un precio en todos los menús exige cambiarlo en cada uno. Si molesta, la salida es una
  acción «aplicar a todos», no volver a heredar.
- Los menús propios son densos (una fila por producto, y otra proyectada por sucursal).
- Apagar una categoría es una acción sobre sus productos, no un estado: un producto nuevo en una
  categoría apagada nace encendido.
- `menus` y `menu_productos` no bajan a la caja; `sucursales.menu_id` sí viaja y la caja lo ignora.
