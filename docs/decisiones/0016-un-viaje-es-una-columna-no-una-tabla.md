# 0016 — Un viaje es una columna, no una tabla: y asignar ES salir

**Fecha:** 2026-09-20 · **Estado:** vigente

## Qué decía el plan

Ningún documento anterior hablaba de "viajes": la especificación y los ADR previos (0011,
integración de apps de delivery) tratan cada domicilio como un pedido suelto, con una asignación
de repartidor por ticket (`delivery_asignaciones`, `asignar_delivery_repartidor` de la 0078). En
hora pico Knock-Out reparte varios pedidos de la misma zona en un solo viaje, y el modelo no tenía
dónde anotar eso: eran N filas sin nada que las relacionara.

Además, imprimir el ticket de un domicilio sellaba `comanda_impresa_at` y eso bastaba para que la
caja lo pintara como salido — un segundo camino de salida, paralelo al de asignar repartidor, que
nadie había decidido por escrito.

## Qué hacemos ahora

1. **Un viaje es la columna `viaje_id` en `delivery_asignaciones`, no una tabla nueva.** El RPC
   `asignar_delivery_lote` (migración 0114) genera un UUID por viaje y lo escribe en cada
   asignación que sale junta; varios pedidos comparten `viaje_id`, ninguno tiene fila propia para
   "el viaje" como concepto.
2. **Asignar repartidor ES salir.** `asignar_delivery_lote` deja el pedido `EN_RUTA` en el mismo
   paso en que se asigna; no hay un segundo botón de "confirmar salida" pendiente después. Imprimir
   el ticket deja de sellar `comanda_impresa_at` como si fuera salida: ese sello ahora solo
   habilita "Reimprimir" con PIN, sin efecto sobre el estado del pedido.

## Por qué

**Una columna cruza el sync sola; una tabla no.** El push (`_vim_apply_rows_detalle`, migración
0074) arma su lista de columnas leyendo el `information_schema` del destino en el momento de
aplicar cada tabla — no hay una lista de columnas escrita a mano en ningún lado. Una columna nueva
en una tabla que ya sincroniza (como `delivery_asignaciones`) viaja sola, sin tocar la función de
push. Una tabla nueva no tiene ese privilegio: habría que darla de alta a mano en el push, en el
pull y en el espejo de la caja — tres sitios distintos, y basta olvidar uno para que el viaje se
quede en la caja y nunca llegue a la nube. No es una decisión de ahorrarse trabajo; es evitar un
punto de fallo silencioso que ya nos costó caro una vez (0074 documenta 27 ventas retenidas por
un problema parecido).

**Un viaje no tiene estado propio.** El estado — asignado, en ruta, liquidado, cancelado — ya vive
en cada asignación individual. Si el viaje tuviera su propio estado, habría que mantener dos
verdades sincronizadas (la del viaje y la de cada pedido dentro de él), y nada impide que se
contradigan: un viaje "en ruta" con un pedido ya liquidado dentro, por ejemplo. `viaje_id` es solo
una etiqueta de agrupación para la pantalla y para saber qué salió junto; no gobierna nada.

**Asignar es salir porque el paso de en medio era una puerta trasera.** Con "asignar" y "salir"
como dos pasos separados, imprimir el ticket se había vuelto un tercer camino que se saltaba
ambos: el pedido se pintaba como salido sin repartidor asignado, y no había contra quién cuadrar
el efectivo si no volvía. Colapsar los dos pasos en uno elimina esa puerta: no existe un estado
intermedio de "el pedido ya se fue pero nadie sabe con quién".

## Consecuencias

- No existe "Luis regresó" como hecho propio del viaje — solo existe cada asignación pasando a
  `LIQUIDADO` o `CANCELADO` por su cuenta. Si algún día hace falta registrar el regreso del viaje
  completo como evento (por ejemplo, para medir tiempos de ronda), **se asciende `viaje_id` a
  tabla** en ese momento, con su propio estado y su alta correspondiente en push/pull/espejo.
- Una asignación de antes de la 0114 tiene `viaje_id NULL`: se muestra como un viaje de un solo
  pedido, no como un error.
- `asignar_delivery_repartidor` y `confirmar_salida_delivery` (0078) siguen desplegadas con su
  firma — no se borran, porque hacerlo obligaría a redesplegar todo lo que las invoque — pero la
  caja ya no las usa; el camino nuevo es `asignar_delivery_lote`.
- Para el cajero cambia la costumbre: imprimir un ticket de domicilio ya no lo saca de "En el
  local". El pedido solo pasa a "En reparto" cuando se le asigna un repartidor desde el modal, uno
  o varios a la vez.
