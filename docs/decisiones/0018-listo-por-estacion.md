# 0018 — Cada estación marca LISTO lo suyo

**Fecha:** 2026-09-24 · **Estado:** vigente

## Qué decía el plan

La especificación trata la cocina como una sola fila por ticket: `tickets.estado_cocina`
(`EN_COCINA → LISTO → ENTREGADO`, validado por `trg_ticket_validar_estado_cocina`, 0008/0009). El
KDS filtra por área de cocina (`ticket_items.area_cocina_nombre_snapshot`), pero el botón LISTO
cerraba el **ticket entero** con dos `UPDATE` sueltos (`cerrarComanda`, `packages/kds-core`).

Con la pantalla filtrada en Plancha, marcar LISTO una orden que también llevaba bebidas de Barra
las sacaba de la pantalla de Barra sin estar hechas. Salió en la revisión de diseño de septiembre
(`docs/bitacora/2026-09-revision-diseno/kds.md`) y Fermín eligió arreglarlo de raíz en vez de
avisar o desactivar el botón.

## Qué hacemos ahora

**El estado "listo" vive en cada renglón; el del ticket se deriva.** La migración
`0120_kds_listo_por_estacion.sql`:

- agrega `ticket_items.listo_at timestamptz NULL`;
- crea el RPC `marcar_listo_cocina(p_ticket_id, p_area, p_todas)` (SECURITY INVOKER, bajo la RLS
  de quien lo llama). Marca `listo_at` en los renglones pendientes de esa área —o de todas— y,
  si ya no queda ninguno, avanza el ticket `EN_COCINA → LISTO → ENTREGADO` **en la misma
  transacción**. Devuelve si la orden se cerró y qué áreas siguen pendientes;
- llena el área de un renglón nuevo desde la **categoría** cuando el producto no tiene área
  propia (trigger `BEFORE INSERT`). Es la misma regla que ya usa la comanda impresa
  (`apps/pos/app/lib/print/ticket-datos.ts`: el producto manda, la categoría es el valor por
  defecto). Sin esto, lo que en papel sale en "Barra" en el KDS caía en "General".

Cuentan como pendientes los renglones vivos que van a cocina: no cancelados, sin `cargo_tipo`
(el envío) y que no son el PADRE de un combo (ADR 0015: se prepara la comida, no "un combo").
`area_cocina_nombre_snapshot` nulo es el área "General" del KDS; el RPC la recibe como `NULL`.

**El KDS:**

- filtrado por área, muestra solo las órdenes con algo pendiente en esa área y solo esos
  renglones; LISTO marca esa área. La orden desaparece de esa pantalla y sigue en las demás;
- en "Todas", los renglones ya listos se ven tachados y LISTO cierra lo que falte;
- LISTO espera **5 segundos** con un botón grande de "Deshacer" antes de mandarse. Deshacer no
  revierte nada en la base porque nada se mandó todavía; si la pantalla se recarga en esos 5 s,
  la orden simplemente reaparece;
- "Salir" en la pantalla dedicada de cocina (`apps/kds`) desvincula el dispositivo, así que
  pide confirmación y se llama "Desvincular pantalla".

En el escritorio, `desktop/sql/kds-notify.sql` avisa también cuando cambia `listo_at`, para que
las demás pantallas de la LAN se enteren al instante y no hasta el siguiente sondeo de 5 s.

## Por qué

- **La base decide, no la pantalla.** Si cada KDS calculara "¿ya terminaron todos?" y mandara el
  cierre, dos estaciones que marcan casi a la vez podían dejar la orden abierta o cerrarla dos
  veces. El RPC bloquea el ticket (`FOR UPDATE`) y decide en una sola transacción.
- **Una columna nula no rompe el sync.** `sync_push_snapshot` arma la lista de columnas desde el
  esquema de la nube y hace upsert de la fila completa (0074). Con la columna en los dos lados
  viaja sola; un escritorio viejo sin la columna manda `NULL`, que es justo "sin marcar".
- **El reporte de tiempos no cambia.** `fecha_listo` del ticket se sigue poniendo al cerrar la
  última estación, que es lo que `vw_cumplimiento_tiempos_cocina` mide. Los tiempos por estación
  quedan disponibles en `listo_at` para cuando se quieran reportar.
- **Deshacer esperando, no revirtiendo.** Revertir `ENTREGADO → EN_COCINA` exige PIN
  (`transicionar_estado_cocina_con_autorizacion`). Esperar 5 s antes de mandar evita esa reversa
  en el caso común —el codazo— sin agregar un permiso nuevo.

## Consecuencias

- **La migración se aplica en producción antes de mezclar** (el KDS nuevo llama al RPC). El
  escritorio la aplica solo al arrancar la versión nueva.
- Un KDS viejo sigue funcionando: sigue cerrando el ticket entero con `UPDATE` y no ve
  `listo_at`. Mientras convivan versiones, una estación con el KDS viejo puede cerrar una orden
  que otra estación aún no termina — lo mismo que pasaba antes.
- Los renglones agregados después de que una estación marcó LISTO quedan pendientes y la orden
  vuelve a esa estación. Es lo correcto: son comida nueva.
- **Hueco que ya existía y este cambio no arregla:** el escritorio sube cada ticket a la nube una
  sola vez, al cobrarse (`desktop/src/sync-push.mjs`, `_vim_push_ok`). Lo que pasa en cocina
  después —`fecha_listo` hoy, `listo_at` ahora— no llega a la nube si el push corrió antes. Queda
  anotado para arreglarse aparte.
- La comanda impresa y el KDS ahora coinciden en el área de los productos nuevos; los renglones
  guardados antes de la migración conservan el área que tenían.
