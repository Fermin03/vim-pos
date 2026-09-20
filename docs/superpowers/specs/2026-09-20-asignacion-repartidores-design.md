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
la liquidación automática al cobrar —salvo el aviso de §7.1, que no cambia el cobro sino que deja
de callar cuando el pedido salió sin nadie anotado—; cuadre acumulado por repartidor al cierre de
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

#### Corrección — la libreta tiene que escribirse también en el PULL

> Esta sección decía que con marcar al subir bastaba. **Era falso**, y el código hizo lo que el
> diseño pedía. Se corrige el diseño, no al revés.

Marcar solo al SUBIR no cierra nada, porque `sync_pull_snapshot` manda **todas** las filas de
`repartidores` del tenant y el pull las escribía sin anotar ninguna. El
`id NOT IN (SELECT repartidor_id FROM _vim_repartidores_ok)` del snapshot no seleccionaba "lo
creado aquí": seleccionaba **casi todo el catálogo local**. Lo que pasaba, en orden:

1. En el primer ciclo tras instalar esta versión, el catálogo entero sube.
2. Después, cada repartidor creado en el panel hace el viaje de vuelta en cuanto la caja lo baja.
3. La nube lo aplica con `ON CONFLICT (id) DO UPDATE SET <cada columna> = EXCLUDED.<columna>`:
   `nombre`, `telefono`, `activo`, `deleted_at` y `updated_at`, todos pisados.
4. Y el **push corre antes que el pull** (`desktop/src/main.mjs`, deliberado, ADR 0013), así que la
   caja nunca se refresca antes de pisar. La ventana no es de segundos: es **un ciclo entero**.
5. Un repartidor dado de baja en el panel entre el último pull y el siguiente push **resucita**.

Hacen falta **dos escrituras más**, y las dos están implementadas:

- **El pull anota lo que baja** (`marcarRepartidoresDelPull`, en `desktop/src/sync-pull.mjs`), dentro
  de la misma transacción del pull: si el pull hace ROLLBACK, las marcas se van con él.
- **`asegurarTabla()` siembra la libreta con el catálogo local**, y **solo en el momento de crear la
  tabla** (`to_regclass(...) IS NOT NULL` antes del `CREATE TABLE IF NOT EXISTS`). Esa condición no
  es un detalle: si la siembra corriera en cada arranque, un repartidor dado de alta en la caja y
  todavía sin subir quedaría marcado como enviado, y **por diseño una fila marcada no vuelve a
  viajar nunca** — esa alta no existiría jamás en la nube y nadie se enteraría. Al crear la tabla la
  siembra sí es segura: hasta esta versión la caja no podía crear repartidores, así que todo el
  catálogo local bajó del pull y la nube ya lo tiene.

Con las dos, el catálogo viaja hacia arriba **solo** cuando nació en la caja.

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
- **Minutos fuera**, contados desde la **salida más vieja** del viaje: `fecha_salida`, y solo si
  falta, `fecha_asignacion`.

  > Este punto decía `fecha_asignacion` a secas. Era un desliz del documento: al REASIGNAR, la RPC
  > pone `fecha_salida = now()` y deja `fecha_asignacion` como estaba, así que un pedido reasignado
  > dos horas después de su primera asignación marcaba "120 min fuera" en un viaje recién salido —
  > y lo pintaba tarde sin serlo. El respaldo hace falta: una asignación anterior a la 0114 podía
  > quedarse en ASIGNADO sin salida confirmada.
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

### 7.1 Cobrar un domicilio sin repartidor sí avisa

§2 dejaba fuera "cambios en el cobro", y eso dejó un agujero: `cerrarRepartoAlCobrar` devuelve
`motivo: "sin asignación"` cuando el ticket no tiene a nadie anotado, y el llamador silenciaba
**exactamente ese caso**. Era correcto mientras asignar era opcional; con la regla de §3 es la
única señal de que la regla se rompió, y estaba apagada.

No es un descuido raro: `listarCuentasAbiertas` filtra `estado_fiscal IN ('BORRADOR','ABIERTO')`,
así que un ticket ya cobrado se sale de *En el local* y no vuelve a aparecer en ninguna de las dos
pestañas, y `asignar_delivery_lote` lo rechaza con "ya está cerrado". En un pedido **prepagado**
—tarjeta o transferencia al tomar la orden, cuando todavía no hay repartidor a quién
asignárselo— cobrar antes de asignar es la única secuencia posible.

Se avisa **después** del cobro y nunca antes. El dinero ya entró y la caja no se puede trabar (§3);
una confirmación previa saldría en cada prepago para hacer una pregunta que el cajero no puede
contestar de otra manera. Lo que sí necesita es enterarse de que ese pedido no va a poder cuadrarse
contra ningún repartidor.

El aviso es un diálogo propio, no `setError`: ese estado se escribe en media docena de sitios de
`home-pos.tsx` y **no se pinta en ninguna parte**, así que el mensaje de "no se pudo liquidar" que
ya existía tampoco se veía nunca.

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
8. **Aislamiento por tenant**: un pedido de otro negocio, con los claims del primero, lanza y no
   deja ninguna fila. Lleva control (con sus propios claims ese mismo pedido sí se asigna) para
   que no pueda ponerse verde por un fixture mal armado.

**Lo que prueba el caso 8 es el predicado, no el RLS.** Los smokes corren como `postgres`, que se
salta las políticas (cabecera de `desktop/scripts/smokes.mjs`), así que lo único que puede rechazar
al pedido ajeno es el `tenant_id = current_tenant_id()` explícito de la RPC. El camino real bajo
RLS se ejercita con el patrón de `desktop/src/verify-e2e.mjs`.

> Esta sección decía antes que "el aislamiento por tenant no se prueba aquí" y a la vez que sí se
> probaba el predicado. Ningún caso lo tocaba: todos los anteriores corrían bajo un solo tenant. El caso 8 es
> el que faltaba, y `CLAUDE.md` no lo deja opcional.

Nunca comparar `CURRENT_DATE` contra fechas de negocio: el servidor es UTC y el sistema calcula en
hora de México; eso pone los smokes rojos seis horas al día.

### 10.2 Unitarias

Lo puro, en `apps/pos/app/lib/__tests__/`: agrupar asignaciones por `viaje_id` (incluidas las
`NULL`), minutos fuera desde la salida más vieja —incluido el pedido reasignado, que no debe
contar lo que esperó en el local, y el respaldo a `fecha_asignacion` cuando no hay salida—, suma
de efectivo, y que un viaje sin pedidos vivos no se muestre.

### 10.3 Escritorio

`npm run verify:push` desde `desktop/`, comprobando que `construirSnapshotPush()` incluye un
repartidor nuevo la primera vez y **no** lo vuelve a incluir después de marcarlo en
`_vim_repartidores_ok`. Es la prueba de que el catálogo sube sin pisar al panel.

Y en `node --test` (corre en CI, a diferencia de los `verify:*`), la libreta por los dos bordes:

- `desktop/src/sync-push.test.mjs` — el camino de RECHAZO: una respuesta de la nube con un
  `_errores` de tabla `repartidores` **no** marca esa fila y la deja pendiente para el siguiente
  ciclo. Hoy el código lo hace bien; una regresión ahí sería permanente y silenciosa, porque una
  fila marcada por error no vuelve a viajar nunca. En el mismo archivo, las dos caras de la
  siembra de `asegurarTabla()` (§4.3): siembra al crear la tabla, y **no** siembra si ya existía.
- `desktop/src/sync-pull.test.mjs` — que `pullSnapshot()` anota lo que baja, y dentro de la
  transacción (antes del `COMMIT`).

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
   caso que importa —que la caja pise ediciones del panel— **siempre que se escriba también en el
   pull y se siembre al crearse**; ver la corrección de §4.3. Sin esas dos escrituras la libreta no
   protegía nada: subía el catálogo entero y cada alta del panel volvía a subir pisada.

   > Este punto decía que la libreta ya cerraba el caso y que el riesgo residual era "una ventana
   > estrecha, de segundos, entre que la caja crea a Luis y lo sube". **Las dos cosas eran falsas**
   > con el mecanismo tal y como estaba escrito: la ventana era de un ciclo entero —el push corre
   > antes que el pull, ADR 0013— y no aplicaba solo a los repartidores creados en la caja, sino a
   > todo el catálogo.

   Lo que **sí** queda abierto, ya con las dos escrituras puestas: un repartidor creado en la caja
   y editado en el panel antes de que la caja lo suba se sube con los datos de la caja y pisa la
   edición. Es una fila que la caja acaba de crear y una ventana de un ciclo; aceptable para un
   nombre y un teléfono, y se mira en el primer ciclo real, igual que se hizo con el sync de
   inventario (ADR 0013).
2. **Pedidos viejos sin `viaje_id`.** Los que ya existan se muestran como viajes de un pedido. Es
   correcto y no requiere backfill.
3. **Obligatorio cambia la costumbre del cajero.** Hoy imprime y se acabó. Hay que avisarle a
   Knock-Out antes de que les llegue el instalador.
