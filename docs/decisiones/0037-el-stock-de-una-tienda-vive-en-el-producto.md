# 0037 — El stock de una tienda vive en el producto, no en una receta

**Fecha:** 15 de octubre de 2026 · **Estado:** vigente (entrega 1 de 5 del giro RETAIL)

## Qué había antes

El inventario solo existía por insumo: una venta descuenta lo que dice la receta del producto
(ADR 0012/0013). Para una tienda de ropa eso obliga a una receta 1:1 por prenda, y no hay tallas
ni colores.

## Qué hacemos ahora

- **Giro `RETAIL`** (ropa, boutique y calzado). Arranca con `mostrador` y `existencias`; todo lo de
  restaurante apagado. **No se asigna a nadie** hasta que la 0188 viaje en un instalador que tengan
  todas las cajas (misma regla que el ADR 0034).
- **Módulo de operación `existencias`**, que mueve VIM. No depende del plan: una tienda sin existencias
  no sirve (decisión de Fermín, 15 oct). Apagado para todos los negocios que ya existían.
- **Variantes = productos.** La hija ("Playera Polo · M · Negra") apunta a su padre y tiene su SKU,
  código de barras, precio y existencias. El padre no se vende.
- **Existencias propias por producto** (`producto_existencias`), como suma de un libro que solo se
  agrega (`movimientos_producto`). Un producto lleva existencias **o** receta, nunca las dos.
- **Una sola función** decide cuánto debe haber movido cada renglón de un ticket y registra la
  diferencia. Venta, reabrir, cancelación y devolución la llaman; ninguna escribe por su cuenta.
- **La venta se registra solo al cobrar.** Un renglón sin movimientos solo se registra cuando el
  ticket pasa a pagado en ese momento (o se le agrega ya pagado). Facturar, devolver o cancelar solo
  ajustan renglones ya registrados. Una venta hecha en la caja llega a la nube por push sin
  movimientos; sus movimientos los sube la caja (entrega 4). Así, facturar en la nube un ticket de la
  caja no lo descuenta dos veces.
- **`NaN` no entra.** Postgres acepta `'NaN'` en `numeric` y pasa por encima de cualquier `> 0`; las
  tablas lo rechazan con CHECK y las funciones con un mensaje claro.
- **Se vende sin existencia** (D32): queda negativa y aparece en alertas.

## Ajustes al spec

- Defecto y "no le gustó" reutilizan `PRODUCTO_DEFECTUOSO` y `CLIENTE_NO_SATISFECHO`; solo se agregó
  `CAMBIO_TALLA`.
- La hija siempre tiene precio propio; el admin lo prellena con el del padre.
- El cambio de talla en un solo flujo (con el dinero) es de la entrega 4. En la base son una
  devolución parcial y una venta.
- SKU y código de barras únicos solo entre productos con existencias: los restaurantes pueden
  repetirlos y la migración no puede fallar en ninguna base que ya exista (la nube o la caja
  instalada).

## Cómo se despliega (no es obvio)

- La 0188 (solo `ADD VALUE`) y la 0189 van a producción a mano, **cada una en su transacción**.
- Esta entrega no necesita instalador: nadie es RETAIL. La caja que ya traiga la 0189 descuenta en
  su Postgres local, pero **sus movimientos no suben hasta la entrega 4** (sync).
- Todo el giro RETAIL se trabaja en local hasta que esté al 100 % (Fermín, 15 oct); solo entonces se
  aplica a producción.

## Por qué

Reutilizar insumos ocultos (uno por prenda) ahorraba la sincronización, pero ensuciaba el catálogo
de insumos y las recetas con algo que no es una receta. Fermín eligió stock propio sabiendo que
la sincronización con la caja (entrega 4) se escribe aparte, copiando el patrón de la 0101.

Spec: `docs/superpowers/specs/2026-10-15-giro-retail-design.md`.
