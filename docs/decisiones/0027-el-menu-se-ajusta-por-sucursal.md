# 0027 — El menú se ajusta por sucursal: una fila guarda solo lo que cambia

**Fecha:** 2026-10-02 · **Estado:** vigente · **Supera:** D16 (un solo precio base) y la nota de
`10-SETUP-INICIAL.md` §15.2 («precios pueden variar por sucursal», que nunca se construyó).

## Qué había

- `productos` y `categorias` colgaban de `tenant_id`: un negocio con dos sucursales tenía un menú.
- Un solo precio por producto (`precio_base_mxn`, D16).
- Agotar era global: `productos.agotado_manual` agotaba en todas.
- **Bug:** `evaluar_alertas_stock(insumo, sucursal)` (0007) leía el stock de una sucursal y escribía
  el producto entero. Un insumo crítico en 0 en Centro agotaba en todas; reabastecer Norte
  des-agotaba un producto que en Centro seguía sin insumo.
- Uber publicaba una carta por sucursal (`delivery_conexiones.sucursal_id`) armada con el catálogo
  del negocio entero.

## Qué hacemos ahora (migración 0151)

- **`productos_sucursal`**, una fila por (producto, sucursal) con solo lo que cambia: `disponible`,
  `precio_mxn` (NULL = el general), `agotado_manual`, `agotado_automatico`. **Sin fila = lo general**:
  un producto nuevo sale en todas y una sucursal nueva arranca con todo. Las filas no se borran (el
  pull de la caja no trae bajas): quitar una excepción es volver la fila a lo general.
- **El servidor cobra el precio de la sucursal del ticket** (`precio_producto_en_sucursal` en
  `agregar_item_a_ticket` y `agregar_combo_a_ticket`). Los combos validan además que el combo y sus
  componentes se vendan y no estén agotados **en esa sucursal**. El agregado suelto no valida: la
  caja filtra, y un pedido de Uber pagado no se pierde por una carta vieja.
- **El agotado automático es por sucursal**: `evaluar_alertas_stock` agota y restablece la fila de la
  sucursal del movimiento.
- **`productos.agotado_*` pasan a significar «agotado en todas»** y las mantiene un trigger. Existen
  para las cajas sin actualizar; con una sola sucursal se comportan igual que antes.
  `productos.estado` queda en ACTIVO/PAUSADO.
- La regla vive en tres lugares con los mismos casos de prueba: SQL (0151), la caja
  (`aplicarSucursal`) y la carta de Uber (`aplicarSucursalCarta`).
- Escribir la tabla por REST exige `config.productos`; el agotado por inventario no se escribe a mano.

## Por qué así y no de otra forma

- **No «menús» como entidad** (Menú Centro, Menú Norte): obligaría a dar de alta cada producto en
  cada menú y abriría otra sección del admin. Hoy no hace falta; las excepciones cubren el caso.
- **No duplicar el catálogo por sucursal**: la misma hamburguesa serían dos productos y se rompen los
  reportes juntos, las recetas y los ids de Uber.

## Consecuencias

- Una caja de escritorio anterior a la versión que trae 0151 ignora la tabla: vende todo al precio
  general. El admin lo avisa nombrando la caja (`cajas.version_app`).
- Extras y modificadores siguen globales. Menús por horario, precio por modo de servicio y
  promociones por sucursal quedan fuera.
- `productos.area_cocina_id` sigue apuntando al área de una sola sucursal y el ruteo va por nombre
  (0120): un negocio con menús distintos lo notará si nombra distinto sus áreas.
- Las tres implementaciones de la regla se tocan juntas; los comentarios de cada una apuntan a las otras.
