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
  nuevo entra a cada menú al precio con que nació. El nombre de un menú admite hasta 80 caracteres
  y no puede ser «General» (ni «Menú General»): es el nombre del catálogo base.
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
- **Una sucursal nueva se proyecta al nacer.** 0152 lee «sin fila» como «se vende al precio base»,
  así que sin esto una sucursal recién creada vendería lo que el General tiene apagado (incluido lo
  exclusivo de un menú propio). Y la proyección del General no distingue sucursales activas de
  inactivas o dadas de baja: una que se restaura o se reactiva ya viene al día, sin un trigger
  aparte para «volvió».
- **Editar un menú no toca a las sucursales desactivadas.** El panel solo lista las activas;
  `actualizar_menu` devuelve al General únicamente a las activas que salen de la lista. Una
  desactivada conserva su menú hasta que se reactive y alguien la mueva.
- **Combos por menú.** Un combo es un producto: se apaga y se le pone precio por menú igual que
  los demás, y creado dentro de un menú propio solo existe en ese. Su vista previa («cuánto va a
  pagar el cliente») se calcula con el menú elegido —el precio del combo y el de cada componente—
  y no ofrece lo que ese menú tiene apagado: es lo que cobra la caja de sus sucursales. Los pasos y
  el «cuesta de más» de cada opción son del combo y valen para todos los menús.
- **El importador va al General.** Importar un menú crea los productos en el General y, por el
  trigger de producto nuevo, en todos los menús al mismo precio, aunque el dueño venga de un menú
  propio; la página lo dice antes de importar. No se importa «solo a este menú»: un archivo del
  POS anterior es el catálogo completo, y repartirlo por menú se hace después, apagando.
- **Si los menús no se pueden leer, no se guarda.** El Catálogo ya no cae en silencio al General:
  la franja muestra el error con «Reintentar» y ni las listas ni los formularios guardan precio o
  «se vende» mientras tanto.
