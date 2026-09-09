# 0015 — Los combos son un producto con slots: el padre cobra, los hijos cocinan y descuentan

**Fecha:** 2026-09-08 · **Estado:** vigente

## Qué decía el plan

- **Core §4.7 y QS decisión cerrada 3:** "sin combos al MVP; la arquitectura del catálogo está
  preparada para agregarlos sin refactor". La pregunta abierta 2 de QS decía activarlos "4-6
  semanas" después de que Knock-Out operara.
- **Arquitectura 1B §8 y matriz P-04:** los combos "se modelan vía promociones tipo
  `COMBO_PAQUETE`" con `promociones.precio_combo_mxn` y
  `promociones_productos.obligatorio_para_activar`. Ese enum existe desde 0007 pero
  `aplicar_promocion` (0087) lo rechaza y el admin no deja crearlo.
- **En los hechos**, Knock-Out vende combos como un producto con grupos de modificadores con
  costo extra. Funciona para cobrar, pero las papas y el refresco del combo no descuentan
  inventario (solo la naturaleza `EXTRA` descuenta, y sin pantalla para sus insumos), no se
  enrutan a su estación de cocina, no cuentan como producto vendido en reportes, y no llegan a
  la carta de Uber (que hoy va sin grupos de modificadores).

## Qué hacemos ahora

1. **El combo es un producto** (`productos.es_combo = true`) con su precio base, categoría,
   clave SAT y visibilidad. Hereda sync, RLS, agotado y el id que Uber usará después.
2. **Los slots son tablas nuevas**: `combo_grupos` (Hamburguesa, Acompañamiento, Bebida; mínimo,
   máximo, orden, modo de precio, categoría fuente opcional) y `combo_opciones` (producto,
   delta, default). Un slot puede apuntar a una categoría entera: cualquier hamburguesa activa
   entra sin editar el combo.
3. **Precio = base + precio del producto elegido en los slots marcados "suma precio" + deltas.**
   Knock-Out vende "cualquier hamburguesa + papas + refresco", así que el slot Hamburguesa suma
   el precio de la hamburguesa y el combo cobra un solo número por "hacerlo combo".
4. **En el ticket el padre cobra y los hijos cuelgan de él** (`ticket_items.parent_item_id`,
   `combo_rol`). Los hijos van a precio cero con un `precio_asignado_mxn` prorrateado para
   reportes; los extras con costo de un hijo se cobran en el hijo como hoy. Cancelar el padre
   cancela los hijos; un hijo no se cancela solo.
5. **Cocina, inventario y reportes trabajan sobre los hijos**; el padre no se imprime en cocina
   ni descuenta nada. `descontar_inventario_por_venta` no cambia: los hijos son productos con
   receta.
6. **CFDI timbra un solo concepto por combo** (los hijos y sus extras se colapsan en el padre),
   como facturan las cadenas: clave del producto combo, default 90101503, unidad E48.
7. **Dos entradas en caja**: el botón del combo con un modal de un slot por paso y defaults
   preseleccionados, y el aviso "¿Lo hacemos combo?" al agregar suelto un producto que es
   principal de algún combo (activable por negocio).
8. **Fuera de esta entrega**: publicar combos en Uber (requiere primero modificadores en la
   carta), auto-combo (detectar ítems sueltos y colapsarlos), tamaños chico/mediano/grande como
   atributo del combo (se resuelven con opciones del slot de bebida). El enum `COMBO_PAQUETE`
   sigue sin uso.

## Por qué

- Es el modelo de Simphony (Oracle, el POS de las cadenas), Square, Lightspeed y SoftRestaurant:
  combo = producto padre con grupos que apuntan a productos reales. Los que lo hacen con
  modificadores (Toast, Clover, Parrot) documentan justo los huecos que tenemos: sin inventario
  por componente, sin conteo en KDS, mezcla de productos distorsionada.
- Modelarlo como promoción (Wansoft, Domino's) obliga a tres taps donde las cadenas usan uno y
  mete reglas de detección que se complican rápido. Queda como fase posterior encima de esto.
- El precio "base + precio del producto" es lo que pidió el dueño para Knock-Out y evita
  mantener un delta por cada hamburguesa. Un combo por hamburguesa (modelo McDonald's) sigue
  siendo posible: un combo con el slot Hamburguesa fijo a un producto.
- Un concepto por combo en el CFDI respeta el criterio del SAT ("basta la clave que más se
  asemeje al servicio") y no toca la factura global.

## Consecuencias

- Migración 0111: dos tablas, cuatro columnas en `ticket_items`, RPC `agregar_combo_a_ticket`,
  cascada en `cancelar_item_ticket`, pull y `catalogo_version()` con las dos tablas.
- Toda consulta de "ventas por producto" debe **excluir padres y usar `precio_asignado_mxn` en
  hijos**; si no, el combo cuenta doble o el refresco no cuenta.
- La comanda, el KDS y el ticket impreso distinguen padre e hijos; una caja vieja que reciba un
  ticket con combos (por espejo de delivery o cuenta abierta) los verá como renglones planos
  hasta actualizarse. Se publica instalador 0.4.66.
- Los tres armadores de conceptos CFDI (timbrar, autofacturar, global) comparten
  `conceptos.ts`; el colapso vive ahí y en ningún otro lado.
- Diseño completo: `docs/superpowers/specs/2026-09-08-combos-design.md`.
