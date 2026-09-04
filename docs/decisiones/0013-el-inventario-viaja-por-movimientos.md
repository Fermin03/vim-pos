# 0013 — El inventario viaja por movimientos: la caja los sube, la nube recalcula

**Fecha:** 2026-09-04 · **Estado:** vigente

## Qué decía el plan

- **ADR 0004:** el offline lo da el escritorio y la sincronización replica una **lista explícita**
  de tablas; ampliarla cuesta una migración a propósito. Hasta hoy la lista es disjunta: la
  operación (tickets, pagos, cortes) sube y el catálogo baja, y por eso no hay conflictos.
- **ADR 0012, Consecuencias:** la verdad del inventario es la nube; las ventas de la caja
  instalada no descuentan existencias hasta que la sincronización incluya insumos, recetas,
  existencias y movimientos. "Es un ciclo aparte, con su diseño." Este es ese ciclo.
- **Core §34.3:** al pasar un ticket a PAGADO se descuenta por receta; **D21:** las existencias
  viven por sucursal, las cajas la comparten. **D32:** el stock negativo se permite y se alerta,
  nunca se bloquea la venta.

## Qué hacemos ahora

1. **Bajan a la caja** (pull, la nube manda): unidades de medida, insumos, existencias por
   sucursal, recetas, componentes de receta y componentes de modificador. No bajan proveedores,
   compras ni alias.
2. **La caja nunca sube saldos.** Sube **movimientos de inventario** (`movimientos_inventario`),
   filas nuevas e idempotentes por `id`, generadas por las mismas funciones SQL que en la nube
   (`descontar_inventario_por_venta`, reversas por cancelación y devolución).
3. **La nube recalcula.** `sync_push_snapshot` inserta cada movimiento solo si es nuevo y, por cada
   uno que entró, aplica su cantidad con signo a `insumo_stock_sucursal` (creando la fila si no
   existe) y llama `evaluar_alertas_stock`, que marca y desmarca productos agotados. Los campos
   `stock_antes`/`stock_despues` del movimiento quedan como los vio la caja; el saldo de la nube
   es la verdad.
4. **Al bajar existencias, la caja resta lo que aún no subió**: existencia local = existencia de
   la nube − Σ(signo × cantidad) de los movimientos locales pendientes de push. Así un pull nunca
   "devuelve" existencias ya vendidas, falle o no el push anterior.
5. **Se restaura el aislamiento de filas** que la migración 0089 perdió (0074): cada tabla del
   push se aplica con `_vim_apply_rows_detalle`, los errores vuelven en `_errores`, se registra en
   `sync_eventos` y se sella `cajas.ultima_conexion`.
6. **El dueño enciende el descuento** desde Inventario con un interruptor que escribe
   `configuracion_tenant.modulo_inventario_activo`. Hasta hoy ninguna pantalla lo encendía, así
   que ni el POS web descontaba.
7. Dentro de un ciclo en el que toca pull, **el push va primero** para que el agotado que decide
   la nube ya esté decidido cuando baja el catálogo.

## Por qué

- Replicar saldos (que la caja suba `insumo_stock_sucursal`) pisaría las compras capturadas en el
  panel entre dos pushes. Los movimientos son append-only y suman en cualquier orden.
- Descontar consultando la nube al cobrar rompe el offline, que es la razón de ser del escritorio.
- Recalcular en la nube dentro del push, fuera del modo réplica, es la única forma de que corran
  las alertas y el agotado: en modo réplica no hay triggers.
- Restaurar el aislamiento de filas es la red de seguridad: sin él, un movimiento mal formado
  retendría las ventas en la caja (el escenario de las 27 ventas retenidas de 0074).

## Consecuencias

- `insumo_stock_sucursal` es la primera tabla que baja y a la vez cambia en la caja. Se
  reconcilia por clave natural (insumo + sucursal), no solo por id, porque una venta local puede
  crear la fila antes de que exista en la nube.
- El agotado automático que la caja marca localmente se reconcilia en el siguiente pull con lo que
  la nube decidió; entre pull y pull el cajero ve el estado local.
- Sigue vigente el escritorio único (ADR 0004): dos instalaciones del mismo negocio chocarían.
- Las alertas locales (`alertas_inventario` en la caja) no suben; la nube las regenera.
- El instalador debe publicarse (0.4.57): la caja aplica sola las migraciones nuevas al arrancar.
- Diseño completo: `docs/superpowers/specs/2026-09-04-sync-inventario-caja-design.md`.
