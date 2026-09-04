# 0012 — Compras con proveedores y recetas con pantalla

**Fecha:** 2026-09-03 · **Estado:** vigente

## Qué decía el plan

Arquitectura 1B, tabla de decisiones:

- **D26** — *"Proveedor: campo `varchar` libre en movimientos, sin catálogo formal"*, apoyado en
  §31.4 del /core, que deja fuera del módulo de inventario el catálogo de proveedores y las
  órdenes de compra formales ("pueden venir como add-on Inventario Avanzado").
- **D31** — *"Compras como movimientos `ENTRADA_COMPRA`, sin tabla `compras` separada"*.

Los wireframes P-145/P-146 (recetas) y P-147 (entrada por compra) estaban previstos, pero
nunca se construyeron: el backend de recetas existe completo desde la migración 0007 y ninguna
app tiene una sola pantalla que lo use.

## Qué hacemos ahora

1. **Hay catálogo de proveedores** (`proveedores`, con RFC único por negocio) y **la compra es un
   documento** (`compras` + `compra_lineas`) con folio propio, proveedor, referencia del
   documento del proveedor, UUID fiscal, importes y estado CONFIRMADA/ANULADA. Al registrarla,
   cada línea genera su `ENTRADA_COMPRA` con la función `aplicar_movimiento_inventario` que ya
   existía; el movimiento queda ligado a la compra por `movimientos_inventario.compra_id`. No hay
   borradores ni órdenes de compra: la compra se registra cuando ya se recibió.
2. **La compra se puede capturar desde el XML del CFDI 4.0 del proveedor.** El panel lo lee en el
   navegador (sin subir el archivo), empareja los conceptos con insumos y aprende el
   emparejamiento por proveedor (`proveedor_insumo_alias`) para la siguiente factura. El UUID
   fiscal es único por negocio: la misma factura no se registra dos veces.
3. **Las recetas tienen pantalla**: lista de productos con costo, precio y margen, y un editor
   por producto que captura cantidades en la unidad que el cocinero usa (ml, g, oz) y guarda la
   cantidad convertida a la unidad del insumo. Las funciones SQL de venta, cancelación y
   devolución **no cambian**: siguen leyendo `receta_componentes.cantidad` en la unidad del
   insumo.
4. **El costo de las recetas se recalcula también cuando el costo del insumo se edita a mano**
   (trigger nuevo). Hasta hoy solo se recalculaba en una entrada por compra.
5. **Lo que sigue fuera** (se registra aquí para que nadie lo dé por hecho): órdenes de compra
   con recepción parcial, sub-recetas, recetas por sucursal, guardar el archivo XML, componentes
   de modificadores en pantalla, y **el descuento de inventario por venta desde la caja
   instalada**, que hoy no ocurre porque la sincronización no incluye inventario (ver
   consecuencias).

## Por qué

- El plan **Negocio** vende "inventario y mermas" y sin recetas el descuento automático no
  descuenta nada; sin proveedores ni compras, el costo promedio no tiene de dónde alimentarse.
- Todos los competidores con inventario (Soft Restaurant, Parrot, Fudo, Wansoft, Poster) tienen
  proveedores y compras; Soft Restaurant 12 lanzó en 2025 la captura de compras desde el XML del
  CFDI como novedad, y VIM ya sabe de CFDI.
- Un documento de compra con estado permite ver, buscar y anular una compra completa, y saber qué
  facturas ya se registraron. Agrupar movimientos por referencia de texto no da nada de eso.
- Se deja el proveedor como texto libre en `movimientos_inventario.proveedor_texto` porque los
  movimientos son históricos y append-only; la compra escribe ahí el nombre del proveedor para no
  romper lo existente.

## Consecuencias

- La verdad del inventario sigue siendo **la nube**. Las ventas hechas en la caja instalada no
  descuentan existencias hasta que las migraciones de sincronización (0055/0056) incluyan
  insumos, recetas, existencias y movimientos de inventario. Es un ciclo aparte, con su diseño.
- Anular una compra regresa las existencias con movimientos `DEVOLUCION_PROVEEDOR`, pero **no
  revierte el costo promedio** del insumo. Queda documentado en la pantalla.
- La cantidad de un componente de receta se guarda dos veces: como se capturó (cantidad y
  unidad, solo para mostrar) y convertida a la unidad del insumo (la que usan las funciones).
  Si cambia la unidad del insumo, las recetas que lo usan deben revisarse; la pantalla lo avisa.
- El diseño completo está en
  `docs/superpowers/specs/2026-09-03-recetas-y-compras-design.md`.
