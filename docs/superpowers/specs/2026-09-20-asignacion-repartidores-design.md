# Asignación de repartidores en domicilio — diseño

**Fecha:** 2026-09-20 · **Decisión:** ADR 0016 «un viaje es una columna, no una tabla» — se escribe
durante la implementación, en `docs/decisiones/`. ·
**Antecedentes:** catálogo de repartidores (`supabase/migrations/0078_catalogo_repartidores.sql`),
asignación por nombre (0077), rol repartidor (0076), delivery base
(`0009_postventa_cfdi_sync.sql` §11.11–11.13), push genérico por `information_schema` (0074),
pantalla de cuentas por modo (`apps/pos/app/components/pantalla-cuentas-modo.tsx`).

## 1. Problema

El catálogo de repartidores está construido y el panel los da de alta bien. Lo que falla es todo
lo que pasa después, en la caja:

1. **No se ve nada.** `leerDeliveries()` y `ModalLiquidarDelivery`
   (`apps/pos/app/lib/delivery.ts`, `apps/pos/app/components/modal-liquidar-delivery.tsx`) están
   escritos y **no los llama nadie**. No existe ninguna pantalla que diga quién trae qué, desde
   hace cuántos minutos y cuánto efectivo carga.
2. **La asignación se salta sola.** En `pantalla-cuentas-modo.tsx:193`, imprimir el ticket llama a
   `marcarSalidaDomicilio()`, que sella `comanda_impresa_at`. La tarjeta se pinta naranja y el
   pedido queda "salido" **sin repartidor anotado**. "Salió" y "se imprimió la comanda" son hoy
   el mismo dato, y el cajero que imprime nunca pasa por el modal.
3. **El candado de cocina traba la salida.** El botón solo aparece con `estadoCocina === "LISTO"`
   (`home-pos.tsx:1453`). Knock-Out no marca LISTO con disciplina, así que en la práctica el botón
   muchas veces no está.
4. **Un repartidor, un pedido.** `delivery_asignaciones` es una fila por ticket y no hay forma de
   registrar que tres pedidos salieron en el mismo viaje. En hora pico es lo que de verdad pasa.

El resultado es que el módulo existe y no se usa: el dinero del domicilio no se cuadra contra
nadie porque no hay a quién cuadrárselo.

## 2. Alcance

**Entra:**

1. Migración `0114_delivery_viaje.sql`: columna `viaje_id`, índice, RPC `asignar_delivery_lote` y
   `repartidores` añadida al push del sync (§4).
2. Caja: pestañas *En el local* / *En reparto* en Domicilios, tarjetas de viaje, detalle (§5).
3. Caja: modal de asignación con varios pedidos y alta de repartidor en sitio (§6).
4. Salida obligatoria: desenganchar "salió" de `comanda_impresa_at`, quitar el candado de
   `LISTO` (§7).
5. Limpieza: borrar `ModalLiquidarDelivery`, conectar `leerDeliveries()` (§8).
6. Sync y escritorio (§9).
7. Pruebas (§10).

**No entra:** pedidos de apps de delivery (Uber/DiDi traen su propio repartidor, §11); cambios en
el cobro o en la liquidación automática al cobrar; cuadre acumulado por repartidor al cierre de
turno; reasignar un pedido ya en reparto; app del repartidor; geolocalización o rutas; reportes
nuevos en el admin.

## 3. Invariantes

- **Asignar es salir.** No hay dos pasos. Un domicilio o tiene repartidor asignado y está en
  reparto, o sigue en el local. Desaparece el estado intermedio donde algo "salió" sin que nadie
  lo lleve.
- **El viaje es una columna, no una tabla.** `viaje_id` agrupa; el estado sigue viviendo en cada
  asignación. No hay dos verdades que puedan contradecirse.
- **Cada asignación es un viaje nuevo.** Nunca se agrega un pedido a un viaje existente.
- **El dinero lo calcula el servidor.** `monto_a_liquidar_mxn` sale de `tickets.total_mxn` dentro
  de la RPC. El cliente no lo manda.
- **El lote es atómico.** O se asignan todos los pedidos del viaje o no se asigna ninguno.
- **Imprimir solo imprime.** `comanda_impresa_at` se sigue sellando y sigue disparando
  *Reimprimir* con PIN. Deja de significar salida.
- **La caja nunca se traba.** Obligatorio no puede significar bloqueado: si no hay repartidores
  dados de alta, se da uno de alta desde el mismo modal.
- **Offline igual que online.** Todo corre contra el PostgREST local; nada de esto depende de la
  nube.

## 4. Datos — migración `0114_delivery_viaje.sql`

### 4.1 La columna

```sql
ALTER TABLE delivery_asignaciones ADD COLUMN IF NOT EXISTS viaje_id uuid NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_viaje
  ON delivery_asignaciones (viaje_id) WHERE viaje_id IS NOT NULL;
```

Nullable a propósito: las asignaciones que ya existen no tienen viaje y siguen siendo válidas.
Una asignación sin `viaje_id` se muestra como un viaje de un solo pedido.

**Por qué una columna y no una tabla.** El push (`_vim_apply_rows_detalle`, 0074) arma la lista de
columnas leyendo el `information_schema` **del destino**, así que una columna nueva en una tabla
que ya sincroniza viaja sin tocar `sync_push_snapshot`. Una tabla nueva habría que darla de alta a
mano en el array del push, en el pull y en el espejo de escritorio — tres sitios donde un olvido
se paga con ventas que no suben.

### 4.2 La RPC

```sql
asignar_delivery_lote(
  p_ticket_ids             uuid[],
  p_repartidor_id          uuid,
  p_tiempo_promesa_minutos integer DEFAULT NULL
) RETURNS uuid   -- el viaje_id
```

`SECURITY DEFINER`, `SET search_path = public, pg_temp`, `REVOKE ... FROM public, anon` y
`GRANT ... TO authenticated, service_role`, calcado de `asignar_delivery_repartidor` (0078).

Qué hace, en una sola transacción:

1. Valida que `p_ticket_ids` no venga vacío ni con nulos.
2. Valida el repartidor: existe en `repartidores`, es del tenant, `activo = true`,
   `deleted_at IS NULL`. Si no, `RAISE EXCEPTION 'Repartidor no encontrado o dado de baja'`.
3. Genera `v_viaje_id := gen_random_uuid()`.
4. Por cada ticket, en orden:
   - existe y es del tenant (`current_tenant_id()`), si no falla nombrando el folio;
   - `modo_servicio = 'DELIVERY_PROPIO'`, si no falla;
   - no está cerrado ni cancelado;
   - lee `total_mxn` para `monto_a_liquidar_mxn`;
   - si el ticket ya tiene asignación viva (`estado NOT IN ('LIQUIDADO','CANCELADO')`), la
     **actualiza** — repartidor, nombre, monto, promesa, `viaje_id` — igual que la 0078. Si no,
     inserta.
   - deja `estado = 'EN_RUTA'`, `fecha_salida = now()`, `updated_by = auth.uid()`.
5. Devuelve `v_viaje_id`.

**No se llama a `confirmar_salida_delivery`.** Esa RPC exige pasar por `ASIGNADO` y existe para el
flujo viejo; aquí la asignación ya deja el pedido en reparto. Se conserva sin tocar por
compatibilidad con `asignar_delivery_repartidor`, que sigue en el código.

`asignar_delivery_repartidor` (0078) **no se borra**: borrarla obligaría a redesplegar todo lo que
la llame. La caja deja de llamarla.

**El nombre del repartidor se sigue guardando** en `repartidor_nombre` como foto del momento
(razón original de la 0078: si mañana se corrige la ortografía o alguien se va, los pedidos viejos
siguen diciendo quién los llevó).

### 4.3 `repartidores` sube al push

Sin esto, un repartidor dado de alta desde la caja (§6.1) se quedaría en el Postgres local para
siempre. Son **dos sitios**, y los dos hacen falta: el servidor tiene que aceptar la tabla y el
escritorio tiene que mandarla.

**Servidor — en la 0114.** `repartidores` se añade al array `v_tablas` de `sync_push_snapshot`,
**primero**, porque `delivery_asignaciones` lo referencia por `repartidor_catalogo_id` y el array
está ordenado por dependencia.

`CREATE OR REPLACE FUNCTION` exige la función entera, así que hay que copiar el cuerpo **vigente**.
La definición vigente es la de **`0101_sync_inventario.sql`**, no la de la 0078: desde entonces la
0089 añadió los cortes y la 0101 sacó `movimientos_inventario` del modo réplica y añadió el aviso
de `_ignoradas`. Copiar el cuerpo de la 0078 dejaría fuera los cortes Z y el inventario —
exactamente el incidente de los trece turnos cerrados sin corte en la nube.

**Escritorio — `desktop/src/sync-push.mjs`.** `construirSnapshotPush()` arma el snapshot con su
propia lista de tablas; añadir la tabla solo en el servidor no manda nada.

Y **no se mandan todos los repartidores en cada push**: el catálogo también baja por el pull, así
que reenviar la copia local en cada ciclo sobrescribiría con datos viejos cualquier edición hecha
en el panel. Se sube **cada repartidor una sola vez**, con una libreta igual a las que ya existen:

```sql
CREATE TABLE IF NOT EXISTS _vim_repartidores_ok (repartidor_id uuid PRIMARY KEY, subido_at timestamptz DEFAULT now())
```

en `asegurarTabla()`, y el snapshot incluye solo los que no estén en ella. Se marcan cuando la nube
confirma, igual que `_vim_mov_ok`.

Es distinto de `_vim_mov_ok` en un punto que conviene no confundir: los movimientos de inventario
**nunca** bajan del pull, así que todo lo local es de origen local. Los repartidores sí bajan. Por
eso la libreta aquí no es solo para no re-trabajar — es lo que impide que la caja pise al panel.

### 4.4 Estado mostrado

El enum sigue siendo `EN_RUTA`. La etiqueta visible en `ESTADO_LABEL`
(`apps/pos/app/lib/delivery.ts`) pasa de `"En ruta"` a `"En reparto"`. Renombrar el valor del enum
arrastraría migración, la vista `vw_cumplimiento_tiempos_delivery` y el espejo de escritorio por
una palabra que solo se lee en pantalla.

## 5. La pantalla — Domicilios

`PantallaCuentasModo` se queda en maestro-detalle. En **domicilio y solo en domicilio**, la
columna izquierda gana dos pestañas:

- **En el local · N** — las cuentas abiertas sin repartidor asignado. Es la lista de hoy.
- **En reparto · N** — un renglón por viaje vivo.

Los otros dos modos (Pick-up, Comedor) no reciben las pestañas y se comportan exactamente igual
que hoy.

### 5.1 Tarjeta de viaje

Por cada viaje vivo, agrupando `leerDeliveries()` por `viaje_id` (las filas sin `viaje_id` son un
viaje de una):

- **Nombre del repartidor** (de `catalogo.nombre`, con `repartidor_nombre` de respaldo).
- **N pedidos** del viaje.
- **Minutos fuera**, contados desde la `fecha_asignacion` **más vieja** del viaje.
- **Efectivo que carga**: suma de `monto_a_liquidar_mxn` del viaje.
- Si hay promesa de tiempo y se pasó, la tarjeta lo marca.

Al seleccionarla, el detalle de la derecha lista los pedidos del viaje, cada uno con cliente,
folio, total y el botón **Cobrar** de siempre — que sigue liquidando automáticamente vía
`cerrarRepartoAlCobrar`. Un pedido cobrado sale del viaje; cuando no queda ninguno, el viaje
desaparece de la pestaña.

**Agrupa por viaje, no por repartidor.** Una asignación sigue viva hasta que se cobra, así que un
repartidor puede salir de nuevo con pedidos anteriores todavía sin liquidar. Agrupando por
repartidor los dos viajes saldrían revueltos y los minutos fuera dejarían de significar nada.

### 5.2 Scroll

La lista de cuentas hace scroll hoy y lo sigue haciendo. La regla de cuadrículas rígidas que
paginan se decidió para catálogo, combos y modificadores; aplicarla aquí rompería la consistencia
de una pantalla que ya funciona.

## 6. El modal de asignación

Sustituye a `ModalSalidaDomicilio`. El botón de la cuenta pasa de **"Marcar salida"** a
**"Asignar repartidor"**.

Contenido, en orden:

1. **Encabezado**: folio del pedido y lo que se cobra en la puerta (como hoy).
2. **Lista de repartidores activos**. Con uno solo dado de alta se preselecciona, como hoy.
3. **"¿Se lleva algo más?"** — los demás pedidos a domicilio **sin repartidor asignado**, como
   interruptores, con cliente/folio y total. Ninguno marcado por defecto.
4. **Tiempo prometido** en minutos (como hoy, 30 por defecto).
5. **Alta rápida**: *"¿Falta alguien? Darlo de alta"* abre nombre + teléfono opcional, inserta en
   `repartidores` y lo deja seleccionado.
6. **Botón "Asignar"**. Desaparece "Salir sin repartidor".

Un pedido solo cuesta los mismos toques que hoy. Agrupar cuesta marcar casillas en la pantalla
donde el cajero ya está, sin modo de selección múltiple colgando de la lista el resto del día.

Al confirmar: una llamada a `asignar_delivery_lote` con el pedido de origen más los marcados.

### 6.1 Alta rápida de repartidor

Inserta directo en `repartidores` desde la caja (RLS por `tenant_id`; la política
`repartidores_insert` de la 0078 ya lo permite a `authenticated`). Sin PIN.

Es la válvula que impide que "obligatorio" trabe la caja: si nadie dio de alta repartidores, sin
esto ningún domicilio podría salir hasta que alguien entre al panel web. El costo aceptado es que
el catálogo puede recibir nombres mal escritos desde la caja; el índice único
`repartidor_nombre_uq` (0078) ya impide duplicar el mismo nombre, y el panel permite corregirlo.

## 7. Salida obligatoria

Tres cambios en `pantalla-cuentas-modo.tsx` y `home-pos.tsx`:

1. **`imprimir()` deja de llamar a `marcarSalidaDomicilio()`** cuando `modo === "DELIVERY_PROPIO"`
   (`pantalla-cuentas-modo.tsx:189-199`). El bloque se elimina; el resto de `imprimir()` no cambia.
2. **`comanda_impresa_at` deja de pintar el naranja.** El indicador "va en camino" pasa a salir de
   que el ticket tenga una asignación viva, cruzando la lista de cuentas contra `leerDeliveries()`
   en el cliente. `impresaAt` se sigue leyendo para `yaSeImprimio` → *Reimprimir* con PIN, que no
   cambia.
3. **Se quita el candado `c.estadoCocina === "LISTO"`** en `home-pos.tsx:1453`. El botón *Asignar
   repartidor* aparece en toda cuenta de domicilio sin asignación viva.

`marcarSalidaDomicilio()` se renombra a `marcarComandaImpresa()`, que es lo que de verdad hace.
Es un rename mecánico de dos usos.

## 8. Limpieza

- **Borrar `apps/pos/app/components/modal-liquidar-delivery.tsx`.** Código muerto: nadie lo
  importa, y el cobro no cambia.
- **Conectar `leerDeliveries()`**, hoy huérfana, como fuente de la pestaña *En reparto*. Hay que
  añadirle `viaje_id` al `select` y al tipo `DeliveryAsignacion`.
- `asignarDelivery()` (contra cuentas de usuario) se conserva con su comentario: es para la futura
  app del repartidor.

## 9. Sync y escritorio

- **Push:** `delivery_asignaciones` ya está en el array de `sync_push_snapshot` (0078) y
  `viaje_id` viaja sola por el `information_schema` del destino (0074) — la columna no obliga a
  tocar nada. Lo que sí lo obliga es subir `repartidores`, en los dos sitios del §4.3: `v_tablas`
  de `sync_push_snapshot` (copiando el cuerpo de la **0101**) y `construirSnapshotPush()` del
  escritorio con su libreta `_vim_repartidores_ok`.
- **Pull:** `repartidores` ya está en `sync_pull_snapshot` (0078). No se toca.
- **Escritorio:** la migración 0114 se aplica sola al arrancar (lee `resources/migrations`).
  Instalador **0.4.71**, siguiendo la lista "Antes de empaquetar" del RUNBOOK y desde un checkout
  con `desktop/bin/postgrest.exe`. Nunca publicar un `.exe` de menos de ~155 MB.

## 10. Pruebas

### 10.1 Smokes `.sql` (bloquean el merge, job `rls-tests`)

`supabase/scripts/smoke_delivery_viaje.sql`:

1. Asignar 3 pedidos a un repartidor devuelve **un** `viaje_id` y las 3 filas lo comparten.
2. Las 3 quedan en `EN_RUTA` con `fecha_salida` y `monto_a_liquidar_mxn` igual a `total_mxn`.
3. **Atomicidad**: un lote de 3 donde el tercero es de Pick-up falla entero y **no deja ninguna
   asignación**, ni siquiera de los dos primeros.
4. Un ticket inexistente en el lote → excepción, y tampoco deja nada.
5. **Idempotencia**: reasignar un ticket que ya tiene asignación viva la actualiza, no duplica.
6. Repartidor inactivo o con `deleted_at` → excepción.
7. `sync_push_snapshot` con un `repartidores` en el snapshot lo aplica y lo cuenta en el
   resultado — que es lo que prueba que el alta desde la caja llega a la nube (§4.3).

**El aislamiento por tenant no se prueba aquí.** Los smokes corren como `postgres`, que se salta
RLS (cabecera de `desktop/scripts/smokes.mjs`). Lo que sí se prueba —y es lo que de verdad protege
a esta RPC— es su predicado explícito `tenant_id = current_tenant_id()`, que no depende del RLS.
El camino real bajo RLS se ejercita con el patrón de `desktop/src/verify-e2e.mjs`.

Nunca comparar `CURRENT_DATE` contra fechas de negocio: el servidor es UTC y el sistema calcula en
hora de México; eso pone los smokes rojos seis horas al día.

### 10.2 Unitarias

Lo puro, en `apps/pos/app/lib/__tests__/`: agrupar asignaciones por `viaje_id` (incluidas las
`NULL`), minutos fuera desde la más vieja, suma de efectivo, y que un viaje sin pedidos vivos no
se muestre.

### 10.3 Escritorio

`npm run verify:push` desde `desktop/`, comprobando que `construirSnapshotPush()` incluye un
repartidor nuevo la primera vez y **no** lo vuelve a incluir después de marcarlo en
`_vim_repartidores_ok`. Es la prueba de que el catálogo sube sin pisar al panel.

### 10.4 A mano

En el POS empaquetado en el navegador, sin Electron: asignar uno, asignar tres de un jalón,
comprobar que imprimir ya no marca salida, que el naranja sale de la asignación, y que cobrar un
pedido lo saca del viaje.

## 11. Pedidos de apps de delivery

Fuera de alcance. Un pedido de Uber/DiDi lo reparte el repartidor de la app, no el del negocio. La
pestaña *En reparto* solo muestra `delivery_asignaciones`, que solo se crean para
`DELIVERY_PROPIO`, así que no hace falta filtrar nada: los pedidos de apps no entran solos.

## 12. Riesgos abiertos

1. **El catálogo pasa a viajar en los dos sentidos.** Hasta hoy `repartidores` solo bajaba (pull);
   con el alta desde la caja (§6.1) también sube (§4.3). Es el primer catálogo que la caja puede
   crear, y por tanto el primero que puede divergir. La libreta `_vim_repartidores_ok` cierra el
   caso que importa —que la caja pise ediciones del panel— porque cada fila sube una sola vez.
   Queda una ventana estrecha: si el panel edita a "Luis" en los segundos entre que la caja lo
   crea y lo sube, gana la caja. Aceptable para un nombre y un teléfono; se mira en el primer
   ciclo real, igual que se hizo con el sync de inventario (ADR 0013).
2. **Pedidos viejos sin `viaje_id`.** Los que ya existan se muestran como viajes de un pedido. Es
   correcto y no requiere backfill.
3. **Obligatorio cambia la costumbre del cajero.** Hoy imprime y se acabó. Hay que avisarle a
   Knock-Out antes de que les llegue el instalador.
