# Asignación de repartidores en domicilio — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que ningún pedido a domicilio salga sin un repartidor anotado, que varios pedidos puedan salir en un mismo viaje, y que la caja muestre quién trae qué, desde hace cuánto y con cuánto efectivo.

**Architecture:** Un "viaje" es una columna `viaje_id` compartida por las asignaciones que salieron juntas, no una tabla. Una RPC de lote las crea todas en una transacción y las deja en reparto de una vez — asignar *es* salir. La caja agrupa por `viaje_id` en una pestaña nueva de la pantalla de Domicilios.

**Tech Stack:** Postgres 15 + plpgsql (Supabase en la nube, Postgres embebido en el escritorio), PostgREST, Next.js 15 + React 19 + TypeScript, Tailwind, vitest, Electron.

**Spec:** [`docs/superpowers/specs/2026-09-20-asignacion-repartidores-design.md`](../specs/2026-09-20-asignacion-repartidores-design.md) — léelo entero antes de empezar. Este plan argumenta desde él.

## Global Constraints

- **Migración `0114`**, el siguiente número libre. Nunca reutilizar un número ya publicado.
- **Toda RPC nueva:** `SECURITY DEFINER`, `SET search_path = public, pg_temp`, `REVOKE EXECUTE ... FROM public, anon`, `GRANT EXECUTE ... TO authenticated, service_role`.
- **El enum `delivery_estado` NO se renombra.** El valor sigue siendo `EN_RUTA`; solo cambia la etiqueta que se lee en pantalla, a `"En reparto"`.
- **Smokes:** nunca comparar `CURRENT_DATE` contra fechas de negocio. Usar `(now() AT TIME ZONE 'America/Mexico_City')::date`. El servidor es UTC y el sistema calcula en hora de México; con `CURRENT_DATE` los smokes se ponen rojos seis horas al día.
- **Los smokes corren como `postgres` y se saltan RLS.** No escribas pruebas de RLS ahí; prueban predicados explícitos.
- **No correr `npm run backend` mientras la app instalada esté abierta:** comparten el puerto 54329.
- **No correr `next build` con el dev server arriba:** comparten `.next` y matan el dev server. Para verificar tipos: `npm run typecheck`.
- **Copy en español de México**, sin jerga técnica en pantalla. Nada de "delivery", "lote" ni "viaje_id" visible para el cajero.
- **Versión del escritorio: `0.4.71`.** Antes de `npm run dist` o de publicar, pasar la lista "Antes de empaquetar" del RUNBOOK, solo desde un checkout con `desktop/bin/postgrest.exe`, y **nunca publicar un `.exe` de menos de ~155 MB**.
- **Rama:** `delivery/asignar-repartidor`, que ya existe y ya tiene el spec commiteado.

---

### Task 1: Migración 0114 — columna, RPC de lote y el catálogo en el push

**Files:**
- Create: `supabase/migrations/0114_delivery_viaje.sql`
- Create: `supabase/scripts/smoke_delivery_viaje.sql`
- Read (para copiar el cuerpo vigente): `supabase/migrations/0101_sync_inventario.sql:118-233`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `delivery_asignaciones.viaje_id uuid NULL`
  - `asignar_delivery_lote(p_ticket_ids uuid[], p_repartidor_id uuid, p_tiempo_promesa_minutos integer DEFAULT NULL) RETURNS uuid` — devuelve el `viaje_id`.
  - `sync_push_snapshot` acepta `repartidores` en el snapshot.

- [ ] **Step 1: Escribe el smoke que falla**

Crea `supabase/scripts/smoke_delivery_viaje.sql`:

```sql
-- Smoke del viaje de reparto (spec 2026-09-20-asignacion-repartidores-design.md, migración 0114).
-- Asignar ES salir: `asignar_delivery_lote` deja los pedidos EN_RUTA de una vez, comparten viaje_id
-- y el monto lo calcula el servidor. Prueba también que el lote es atómico y que `repartidores`
-- sube por el push. Sobre la semilla de dev. ROLLBACK.
--
-- El aislamiento por tenant NO se prueba aquí: estos smokes corren como `postgres` y se saltan RLS
-- (ver la cabecera de desktop/scripts/smokes.mjs). Lo que se prueba es el predicado explícito
-- `tenant_id = current_tenant_id()` de la RPC, que no depende del RLS.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno  uuid; v_prod uuid; v_rep uuid;
  v_t1 uuid; v_t2 uuid; v_t3 uuid; v_pick uuid;
  v_viaje uuid; v_n integer; v_estado text; v_monto numeric; v_total numeric;
  v_ok boolean;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);

  UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=v_caja AND estado='ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable,
                     usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-VIAJE',
          (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;

  SELECT id INTO v_prod FROM productos WHERE tenant_id=v_tenant AND nombre='Hamburguesa Clásica' LIMIT 1;

  INSERT INTO repartidores(tenant_id, nombre, telefono)
  VALUES (v_tenant, 'Luis Smoke', '4771234567') RETURNING id INTO v_rep;

  v_t1 := abrir_ticket(v_suc, v_caja, v_turno, 'DELIVERY_PROPIO'::modo_servicio, NULL, NULL, 'smk-v-1', v_maria);
  v_t2 := abrir_ticket(v_suc, v_caja, v_turno, 'DELIVERY_PROPIO'::modo_servicio, NULL, NULL, 'smk-v-2', v_maria);
  v_t3 := abrir_ticket(v_suc, v_caja, v_turno, 'DELIVERY_PROPIO'::modo_servicio, NULL, NULL, 'smk-v-3', v_maria);
  v_pick := abrir_ticket(v_suc, v_caja, v_turno, 'DRIVE_THRU'::modo_servicio, NULL, NULL, 'smk-v-p', v_maria);
  PERFORM agregar_item_a_ticket(v_t1, v_prod, 1, NULL, '[]'::jsonb, 'smk-v-i1');
  PERFORM agregar_item_a_ticket(v_t2, v_prod, 2, NULL, '[]'::jsonb, 'smk-v-i2');
  PERFORM agregar_item_a_ticket(v_t3, v_prod, 1, NULL, '[]'::jsonb, 'smk-v-i3');
  PERFORM agregar_item_a_ticket(v_pick, v_prod, 1, NULL, '[]'::jsonb, 'smk-v-ip');

  -- ── 1. Tres pedidos, un viaje ──────────────────────────────────────────────
  v_viaje := asignar_delivery_lote(ARRAY[v_t1, v_t2, v_t3], v_rep, 30);
  IF v_viaje IS NULL THEN RAISE EXCEPTION 'asignar_delivery_lote no devolvió viaje_id'; END IF;

  SELECT count(*) INTO v_n FROM delivery_asignaciones WHERE viaje_id = v_viaje;
  IF v_n <> 3 THEN RAISE EXCEPTION 'esperaba 3 asignaciones con el mismo viaje_id, hay %', v_n; END IF;
  RAISE NOTICE '1. tres pedidos comparten viaje_id OK';

  -- ── 2. Asignar ES salir: quedan EN_RUTA con fecha_salida ───────────────────
  SELECT count(*) INTO v_n FROM delivery_asignaciones
   WHERE viaje_id = v_viaje AND estado = 'EN_RUTA' AND fecha_salida IS NOT NULL;
  IF v_n <> 3 THEN RAISE EXCEPTION 'las 3 debían quedar EN_RUTA con fecha_salida, quedaron %', v_n; END IF;
  RAISE NOTICE '2. asignar es salir (EN_RUTA + fecha_salida) OK';

  -- ── 3. El monto lo calcula el servidor, no el cliente ──────────────────────
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_t2;
  SELECT monto_a_liquidar_mxn INTO v_monto FROM delivery_asignaciones WHERE ticket_id = v_t2;
  IF v_monto IS DISTINCT FROM v_total THEN
    RAISE EXCEPTION 'monto_a_liquidar_mxn (%) debía salir de tickets.total_mxn (%)', v_monto, v_total;
  END IF;
  RAISE NOTICE '3. el monto sale de tickets.total_mxn OK';

  -- ── 4. Atomicidad: un Pick-up en el lote tumba el lote entero ──────────────
  -- Se prueba con tickets NUEVOS para que el fallo no se confunda con los ya asignados.
  DECLARE v_a uuid; v_b uuid;
  BEGIN
    v_a := abrir_ticket(v_suc, v_caja, v_turno, 'DELIVERY_PROPIO'::modo_servicio, NULL, NULL, 'smk-v-a', v_maria);
    v_b := abrir_ticket(v_suc, v_caja, v_turno, 'DELIVERY_PROPIO'::modo_servicio, NULL, NULL, 'smk-v-b', v_maria);
    PERFORM agregar_item_a_ticket(v_a, v_prod, 1, NULL, '[]'::jsonb, 'smk-v-ia');
    PERFORM agregar_item_a_ticket(v_b, v_prod, 1, NULL, '[]'::jsonb, 'smk-v-ib');
    v_ok := false;
    BEGIN
      PERFORM asignar_delivery_lote(ARRAY[v_a, v_b, v_pick], v_rep, 30);
    EXCEPTION WHEN OTHERS THEN
      v_ok := true;
    END;
    IF NOT v_ok THEN RAISE EXCEPTION 'un ticket de Pick-up en el lote debía hacerlo fallar'; END IF;
    SELECT count(*) INTO v_n FROM delivery_asignaciones WHERE ticket_id IN (v_a, v_b);
    IF v_n <> 0 THEN RAISE EXCEPTION 'el lote no fue atómico: quedaron % asignaciones de los dos primeros', v_n; END IF;
    RAISE NOTICE '4. atomicidad OK: falla el tercero y no queda ninguna';

    -- ── 5. Un ticket inexistente tampoco deja rastro ─────────────────────────
    v_ok := false;
    BEGIN
      PERFORM asignar_delivery_lote(ARRAY[v_a, gen_random_uuid()], v_rep, 30);
    EXCEPTION WHEN OTHERS THEN
      v_ok := true;
    END;
    IF NOT v_ok THEN RAISE EXCEPTION 'un ticket inexistente debía hacer fallar el lote'; END IF;
    SELECT count(*) INTO v_n FROM delivery_asignaciones WHERE ticket_id = v_a;
    IF v_n <> 0 THEN RAISE EXCEPTION 'un ticket inexistente dejó asignación del otro'; END IF;
    RAISE NOTICE '5. ticket inexistente OK: excepción y sin rastro';
  END;

  -- ── 6. Idempotencia: reasignar actualiza, no duplica ───────────────────────
  PERFORM asignar_delivery_lote(ARRAY[v_t1], v_rep, 45);
  SELECT count(*) INTO v_n FROM delivery_asignaciones
   WHERE ticket_id = v_t1 AND estado NOT IN ('LIQUIDADO','CANCELADO');
  IF v_n <> 1 THEN RAISE EXCEPTION 'reasignar duplicó: % asignaciones vivas del mismo ticket', v_n; END IF;
  RAISE NOTICE '6. idempotencia OK: una sola asignación viva por ticket';

  -- ── 7. Repartidor dado de baja ─────────────────────────────────────────────
  UPDATE repartidores SET activo = false WHERE id = v_rep;
  v_ok := false;
  BEGIN
    PERFORM asignar_delivery_lote(ARRAY[v_t2], v_rep, 30);
  EXCEPTION WHEN OTHERS THEN
    v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'un repartidor inactivo no debe poder recibir pedidos'; END IF;
  UPDATE repartidores SET activo = true WHERE id = v_rep;
  RAISE NOTICE '7. repartidor inactivo rechazado OK';

  -- ── 8. El catálogo sube por el push ────────────────────────────────────────
  -- Es lo que hace que un repartidor dado de alta en la caja llegue al panel.
  DECLARE v_res jsonb; v_nuevo uuid := gen_random_uuid();
  BEGIN
    v_res := sync_push_snapshot(v_tenant, jsonb_build_object(
      'repartidores', jsonb_build_array(jsonb_build_object(
        'id', v_nuevo, 'tenant_id', v_tenant, 'nombre', 'Alta Desde La Caja',
        'telefono', NULL, 'notas', NULL, 'activo', true,
        'created_at', now(), 'updated_at', now(), 'deleted_at', NULL))));
    IF COALESCE((v_res->>'repartidores')::integer, 0) <> 1 THEN
      RAISE EXCEPTION 'sync_push_snapshot no aplicó el repartidor: %', v_res;
    END IF;
    IF v_res ? '_ignoradas' THEN
      RAISE EXCEPTION 'sync_push_snapshot ignoró la tabla repartidores: %', v_res->'_ignoradas';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM repartidores WHERE id = v_nuevo) THEN
      RAISE EXCEPTION 'el repartidor del push no quedó en la tabla';
    END IF;
    RAISE NOTICE '8. repartidores sube por el push OK';
  END;

  RAISE NOTICE 'SMOKE DELIVERY VIAJE OK';
END $$;
ROLLBACK;
```

- [ ] **Step 2: Corre el smoke para verificar que falla**

```bash
cd desktop && node scripts/smokes.mjs smoke_delivery_viaje.sql
```

Esperado: `❌ smoke_delivery_viaje.sql` con `function asignar_delivery_lote(uuid[], uuid, integer) does not exist`.

- [ ] **Step 3: Escribe la migración — columna y RPC**

Crea `supabase/migrations/0114_delivery_viaje.sql` con este contenido:

```sql
-- ============================================================================
-- 0114 — Un viaje: varios pedidos que salen juntos, y asignar ES salir.
--
-- DOS PROBLEMAS, UNA MIGRACIÓN.
--
-- 1. En hora pico el repartidor se lleva tres pedidos de la misma zona en un viaje, y
--    `delivery_asignaciones` es una fila por ticket sin nada que las relacione. Se añade `viaje_id`:
--    una COLUMNA, no una tabla. La razón no es ahorro: el push (`_vim_apply_rows_detalle`, 0074)
--    arma la lista de columnas leyendo el `information_schema` del DESTINO, así que una columna
--    nueva en una tabla que ya sincroniza viaja sola. Una tabla nueva habría que darla de alta a
--    mano en el push, en el pull y en el espejo de escritorio — tres sitios donde el olvido se paga
--    con ventas que no suben. Y un viaje no tiene estado propio: el estado ya vive en cada
--    asignación, y duplicarlo sería invitar a que las dos verdades se contradigan.
--
-- 2. Asignar y salir eran dos pasos (`asignar_delivery_repartidor` + `confirmar_salida_delivery`), y
--    en la caja había un tercer camino que se los saltaba: imprimir el ticket marcaba la salida sin
--    repartidor. El resultado era pedidos "salidos" que nadie llevaba y dinero que no se podía
--    cuadrar contra nadie. Aquí asignar deja el pedido EN_RUTA de una vez.
--
-- EL MONTO LO CALCULA EL SERVIDOR. `asignar_delivery_repartidor` (0078) recibe
-- `p_monto_a_liquidar_mxn` del cliente. Es el dinero que el repartidor tiene que traer de vuelta:
-- lo lee de `tickets.total_mxn` quien manda, no React.
--
-- `asignar_delivery_repartidor` y `confirmar_salida_delivery` NO se borran: están en producción con
-- su firma y borrarlas obligaría a redesplegar todo lo que las llame. La caja deja de usarlas.
-- ============================================================================

ALTER TABLE delivery_asignaciones ADD COLUMN IF NOT EXISTS viaje_id uuid NULL;

COMMENT ON COLUMN delivery_asignaciones.viaje_id IS
  'Agrupa las asignaciones que salieron en el mismo viaje. NULL en las anteriores a la 0114, que se muestran como viajes de un solo pedido.';

CREATE INDEX IF NOT EXISTS idx_delivery_viaje
  ON delivery_asignaciones (viaje_id) WHERE viaje_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Asignar un viaje entero.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION asignar_delivery_lote(
  p_ticket_ids             uuid[],
  p_repartidor_id          uuid,
  p_tiempo_promesa_minutos integer DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant    uuid := current_tenant_id();
  v_nombre    varchar(100);
  v_viaje     uuid := gen_random_uuid();
  v_ticket    tickets%ROWTYPE;
  v_id        uuid;
  v_existente uuid;
BEGIN
  IF p_ticket_ids IS NULL OR array_length(p_ticket_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No hay pedidos que asignar';
  END IF;
  IF array_position(p_ticket_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'La lista de pedidos trae un hueco';
  END IF;

  SELECT nombre INTO v_nombre
    FROM repartidores
   WHERE id = p_repartidor_id AND tenant_id = v_tenant AND deleted_at IS NULL AND activo = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Repartidor no encontrado o dado de baja';
  END IF;

  -- Todo el bucle va en la misma transacción: cualquier excepción deshace el viaje completo. Medio
  -- viaje asignado es peor que ninguno — el repartidor se va con tres pedidos y solo dos anotados,
  -- y el que falta no se le puede cuadrar.
  FOREACH v_id IN ARRAY p_ticket_ids LOOP
    SELECT * INTO v_ticket FROM tickets
     WHERE id = v_id AND tenant_id = v_tenant AND deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El pedido % no existe', v_id;
    END IF;
    IF v_ticket.modo_servicio <> 'DELIVERY_PROPIO' THEN
      RAISE EXCEPTION 'Solo los pedidos a domicilio se asignan a un repartidor (% es %)',
        COALESCE(v_ticket.folio_completo, v_id::text), v_ticket.modo_servicio;
    END IF;
    IF v_ticket.estado_fiscal NOT IN ('BORRADOR', 'ABIERTO') THEN
      RAISE EXCEPTION 'El pedido % ya está cerrado', COALESCE(v_ticket.folio_completo, v_id::text);
    END IF;

    -- Idempotente por ticket, igual que la 0078: si ya tiene asignación viva se reasigna al viaje
    -- nuevo en vez de crear otra. Dos asignaciones del mismo pedido contarían el dinero dos veces.
    v_existente := NULL;
    SELECT id INTO v_existente
      FROM delivery_asignaciones
     WHERE ticket_id = v_id AND estado NOT IN ('LIQUIDADO', 'CANCELADO')
     ORDER BY fecha_asignacion DESC LIMIT 1;

    IF v_existente IS NOT NULL THEN
      UPDATE delivery_asignaciones
         SET repartidor_catalogo_id = p_repartidor_id,
             repartidor_nombre      = v_nombre,
             monto_a_liquidar_mxn   = v_ticket.total_mxn,
             tiempo_promesa_minutos = COALESCE(p_tiempo_promesa_minutos, tiempo_promesa_minutos),
             viaje_id               = v_viaje,
             estado                 = 'EN_RUTA',
             fecha_salida           = now(),
             updated_by             = auth.uid()
       WHERE id = v_existente;
    ELSE
      INSERT INTO delivery_asignaciones (
        tenant_id, sucursal_id, ticket_id, repartidor_catalogo_id, repartidor_nombre,
        monto_a_liquidar_mxn, tiempo_promesa_minutos, viaje_id, estado, fecha_salida, updated_by
      ) VALUES (
        v_tenant, v_ticket.sucursal_id, v_id, p_repartidor_id, v_nombre,
        v_ticket.total_mxn, p_tiempo_promesa_minutos, v_viaje, 'EN_RUTA', now(), auth.uid()
      );
    END IF;
  END LOOP;

  RETURN v_viaje;
END;
$$;

REVOKE EXECUTE ON FUNCTION asignar_delivery_lote(uuid[], uuid, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION asignar_delivery_lote(uuid[], uuid, integer) TO authenticated, service_role;

COMMENT ON FUNCTION asignar_delivery_lote IS
  'Asigna uno o varios domicilios a un repartidor del catálogo y los deja EN_RUTA en la misma transacción. Devuelve el viaje_id que comparten. Idempotente por ticket; el monto sale de tickets.total_mxn.';
```

**Nota sobre `auth.uid()`:** va calificado con su esquema a propósito. La función fija `search_path = public, pg_temp`, así que sin el `auth.` no resolvería.

- [ ] **Step 4: Añade `repartidores` al push, dentro de la misma migración**

`CREATE OR REPLACE FUNCTION` exige la función entera, así que hay que copiar el cuerpo **vigente**.

1. Abre `supabase/migrations/0101_sync_inventario.sql` y copia **literalmente las líneas 118 a 233** (desde `CREATE OR REPLACE FUNCTION sync_push_snapshot(p_tenant uuid, p_snapshot jsonb)` hasta el `GRANT EXECUTE ON FUNCTION sync_push_snapshot(uuid, jsonb) TO service_role;` inclusive) al final de `0114_delivery_viaje.sql`.

2. **La definición vigente es la de la 0101, NO la de la 0078.** Desde la 0078, la 0089 añadió los cortes y la 0101 sacó `movimientos_inventario` del modo réplica y añadió el aviso de `_ignoradas`. Si copias el cuerpo de la 0078 borras el push de los cortes Z y del inventario — que es exactamente el incidente de los trece turnos cerrados sin corte en la nube.

3. En la copia, cambia **solo** la declaración de `v_tablas`:

```sql
  v_tablas    text[] := ARRAY[
    'turnos', 'tickets', 'ticket_items', 'ticket_item_modificadores', 'pagos', 'movimientos_caja',
    'delivery_asignaciones', 'cortes_parciales', 'cortes_caja', 'cortes_caja_detalle', 'reportes_z_historico'
  ];
```

por:

```sql
  /* `repartidores` va PRIMERO: el array está ordenado por dependencia (ver 0089) y
     `delivery_asignaciones` lo referencia por `repartidor_catalogo_id`. Sube porque desde la 0114
     la caja puede dar de alta un repartidor (el pedido no puede quedarse sin salir porque nadie
     entró al panel), y sin esto esa alta se quedaría en el Postgres local para siempre. */
  v_tablas    text[] := ARRAY[
    'repartidores',
    'turnos', 'tickets', 'ticket_items', 'ticket_item_modificadores', 'pagos', 'movimientos_caja',
    'delivery_asignaciones', 'cortes_parciales', 'cortes_caja', 'cortes_caja_detalle', 'reportes_z_historico'
  ];
```

4. Encima del `CREATE OR REPLACE FUNCTION sync_push_snapshot` copiado, deja este comentario:

```sql
-- ---------------------------------------------------------------------------
-- El catálogo de repartidores sube.
--
-- Se copia el cuerpo VIGENTE (0101_sync_inventario.sql:118-233), no el de la 0078: desde entonces
-- la 0089 añadió los cortes y la 0101 sacó movimientos_inventario del modo réplica. El único cambio
-- es `repartidores` al principio de v_tablas.
--
-- Esto es la mitad del camino. La otra mitad está en desktop/src/sync-push.mjs: el escritorio arma
-- su propio snapshot, y si no lo incluye ahí, aquí no llega nada.
-- ---------------------------------------------------------------------------
```

- [ ] **Step 5: Corre el smoke para verificar que pasa**

```bash
cd desktop && node scripts/smokes.mjs smoke_delivery_viaje.sql
```

Esperado: `✅ smoke_delivery_viaje.sql` y `✅ 1/1 smokes en verde`.

- [ ] **Step 6: Corre TODOS los smokes — la 0114 toca una función que usa media base**

```bash
cd desktop && npm run smokes
```

Esperado: todos en verde. Si `smoke_sync_push.sql`, `smoke_sync_inventario.sql` o `smoke_cierre.sql` se ponen rojos, copiaste el cuerpo equivocado de `sync_push_snapshot` — vuelve al Step 4.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0114_delivery_viaje.sql supabase/scripts/smoke_delivery_viaje.sql
git commit -m "feat(delivery): asignar un viaje entero deja los pedidos en reparto

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: El catálogo sube desde la caja

**Files:**
- Modify: `desktop/src/sync-push.mjs` (`asegurarTabla()`, `construirSnapshotPush()`, y el marcado de confirmados)

**Interfaces:**
- Consumes: `sync_push_snapshot` acepta `repartidores` (Task 1).
- Produces: el snapshot del escritorio incluye `repartidores` no confirmados; tabla local `_vim_repartidores_ok (repartidor_id uuid PRIMARY KEY, subido_at timestamptz)`.

**Por qué una libreta y no mandarlos todos.** El catálogo **también baja por el pull**. Si el escritorio reenviara su copia local en cada ciclo, cada edición hecha en el panel se sobrescribiría con datos viejos en el push siguiente. Subiendo cada fila **una sola vez**, una alta local llega al panel y a partir de ahí el panel manda.

Es distinto de `_vim_mov_ok`, aunque se parezca: los movimientos de inventario nunca bajan del pull, así que allí la libreta es solo para no re-trabajar. Aquí es lo que impide que la caja pise al panel.

- [ ] **Step 1: Escribe la prueba que falla**

Añade al final de `desktop/src/verify-push.mjs` un caso que use el pool de pruebas que el archivo ya levanta (sigue el patrón de los casos que ya hay ahí):

```js
// Un repartidor dado de alta en la caja sube UNA vez y no vuelve a viajar.
// Si se reenviara en cada ciclo, el push pisaría con la copia local vieja cualquier edición hecha
// en el panel — y el catálogo también baja por el pull, así que eso pasaría de verdad.
{
  const { rows: [r] } = await pool.query(
    `INSERT INTO repartidores(tenant_id, nombre) VALUES ($1, 'Alta En Caja') RETURNING id`,
    [TENANT],
  );
  const primero = await construirSnapshotPush(pool);
  const enviados = (primero.snapshot?.repartidores ?? []).map((x) => x.id);
  assert.ok(enviados.includes(r.id), "el repartidor nuevo debía ir en el primer snapshot");

  await marcarRepartidoresSubidos(pool, [r.id]);

  const segundo = await construirSnapshotPush(pool);
  const reenviados = (segundo.snapshot?.repartidores ?? []).map((x) => x.id);
  assert.ok(!reenviados.includes(r.id), "un repartidor ya confirmado NO debe volver a subir");
  console.log("✅ repartidores: sube una vez y no pisa al panel");
}
```

- [ ] **Step 2: Corre la prueba para verificar que falla**

```bash
cd desktop && npm run verify:push
```

Esperado: FAIL con `marcarRepartidoresSubidos is not defined` o `el repartidor nuevo debía ir en el primer snapshot`.

- [ ] **Step 3: Crea la libreta en `asegurarTabla()`**

En `desktop/src/sync-push.mjs`, dentro de `asegurarTabla()`, después de la línea de `_vim_mov_ok`:

```js
  // Repartidores: la caja puede darlos de alta (0114) porque un domicilio no puede quedarse sin
  // salir porque nadie entró al panel. Suben UNA sola vez, por id.
  //
  // OJO, no es como _vim_mov_ok aunque se parezca: los movimientos de inventario nunca bajan del
  // pull, así que allí la libreta solo evita re-trabajo. Los repartidores SÍ bajan, y aquí la
  // libreta es lo que impide que la caja reenvíe su copia vieja y pise lo que se editó en el panel.
  await pool.query("CREATE TABLE IF NOT EXISTS _vim_repartidores_ok (repartidor_id uuid PRIMARY KEY, subido_at timestamptz DEFAULT now())");
```

- [ ] **Step 4: Añade la tabla al snapshot**

En `construirSnapshotPush()`, dentro del `jsonb_build_object` del snapshot (junto a `'delivery_asignaciones'`, `desktop/src/sync-push.mjs:227`), añade:

```sql
        -- El catálogo de repartidores, solo los que la nube aún no confirmó. Ver _vim_repartidores_ok.
        'repartidores',              (SELECT jsonb_agg(to_jsonb(x)) FROM repartidores x
                                        WHERE x.id NOT IN (SELECT repartidor_id FROM _vim_repartidores_ok)),
```

En la **misma consulta**, junto a las columnas `AS ids` / `AS turnos` / `AS movimientos` (`desktop/src/sync-push.mjs:214-216`), añade la lista de ids para poder marcarlos después:

```sql
      (SELECT array_agg(id) FROM repartidores x WHERE x.id NOT IN (SELECT repartidor_id FROM _vim_repartidores_ok)) AS repartidores,
```

Y en el `return` de la función (`desktop/src/sync-push.mjs:251`), añade el campo:

```js
  return {
    snapshot: rows[0].snapshot ?? {}, ids: rows[0].ids ?? [], turnos: rows[0].turnos ?? [],
    movimientos: rows[0].movimientos ?? [], repartidores: rows[0].repartidores ?? [],
  };
```

`jsonb_strip_nulls` ya quita la clave del snapshot cuando no hay ninguno pendiente, así que un ciclo normal no manda la tabla siquiera.

- [ ] **Step 5: Exporta el marcado de confirmados**

En el mismo archivo, junto a las demás funciones de marcado:

```js
/** Marca los repartidores que la nube ya aplicó: no vuelven a subir nunca. */
export async function marcarRepartidoresSubidos(pool, ids) {
  if (!ids?.length) return;
  await pool.query(
    "INSERT INTO _vim_repartidores_ok (repartidor_id) SELECT unnest($1::uuid[]) ON CONFLICT DO NOTHING",
    [ids],
  );
}
```

Llámala en `pushToCloud` (`desktop/src/sync-push.mjs:390`), en el mismo punto donde ya se llama a `marcarMovimientosPushed`, pasándole `repartidores` del resultado de `construirSnapshotPush`.

**Dos reglas que no se pueden saltar:**

- Si la nube devolvió `_errores` con `tabla: "repartidores"`, **no marques esos ids**: tienen que volver a intentarlo en el ciclo siguiente. Marcar un rechazado lo perdería para siempre, porque nunca vuelve a viajar por diseño.
- Un repartidor rechazado **no debe retener ningún ticket**. `rechazadosPorTicket` sube por la cadena hasta el ticket dueño para ítems y pagos; `repartidores` no cuelga de un ticket y tiene que quedarse fuera de esa lógica, igual que ya se hace con `delivery_asignaciones` ("que no suba quién repartió no invalida la venta").

- [ ] **Step 6: Corre la prueba para verificar que pasa**

```bash
cd desktop && npm run verify:push
```

Esperado: `✅ repartidores: sube una vez y no pisa al panel` y el resto de casos en verde.

- [ ] **Step 7: Corre el ciclo completo de sync, que es lo que esto puede romper**

```bash
cd desktop && npm run verify:sync-ciclo && npm run verify:push-lotes
```

Esperado: ambos en verde.

- [ ] **Step 8: Commit**

```bash
git add desktop/src/sync-push.mjs desktop/src/verify-push.mjs
git commit -m "feat(sync): el catalogo de repartidores sube desde la caja, una sola vez

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Agrupar viajes — lógica pura

**Files:**
- Create: `apps/pos/app/lib/viajes.ts`
- Create: `apps/pos/app/lib/__tests__/viajes.test.ts`

**Interfaces:**
- Consumes: `DeliveryAsignacion` de `apps/pos/app/lib/delivery.ts`.

**Antes del Step 1**, haz llegar `viaje_id` hasta el tipo, en `apps/pos/app/lib/delivery.ts`. Son tres ediciones pequeñas y van juntas para que la tarea cierre compilando:

1. En el tipo `DeliveryAsignacion`:

```ts
  /** Los pedidos que salieron juntos comparten este id. NULL en los anteriores a la 0114. */
  viajeId: string | null;
```

2. En el `.select(...)` de `leerDeliveries`, añade `viaje_id` a la lista (junto a `fecha_asignacion`).

3. En el mapeo de `leerDeliveries`:

```ts
    viajeId: (r.viaje_id as string) ?? null,
```
- Produces:
  - `type Viaje = { id: string; repartidorNombre: string; pedidos: DeliveryAsignacion[]; efectivo: number; desdeIso: string; promesaMin: number | null }`
  - `agruparViajes(asignaciones: DeliveryAsignacion[]): Viaje[]`
  - `minutosFuera(v: Viaje, ahora?: Date): number`
  - `viajeTarde(v: Viaje, ahora?: Date): boolean`

- [ ] **Step 1: Escribe las pruebas que fallan**

Crea `apps/pos/app/lib/__tests__/viajes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { agruparViajes, minutosFuera, viajeTarde } from "../viajes";
import type { DeliveryAsignacion } from "../delivery";

const asig = (over: Partial<DeliveryAsignacion> & { id: string }): DeliveryAsignacion => ({
  ticketId: `t-${over.id}`, ticketFolio: null, repartidorId: null, repartidorNombre: "Luis",
  estado: "EN_RUTA", montoALiquidar: 100, propinaRepartidor: 0, tiempoPromesa: 30,
  fechaAsignacion: "2026-09-20T18:00:00Z", viajeId: null, ...over,
});

describe("agruparViajes", () => {
  it("junta en un viaje las asignaciones que comparten viaje_id", () => {
    const vs = agruparViajes([
      asig({ id: "a", viajeId: "V1", montoALiquidar: 100, fechaAsignacion: "2026-09-20T18:05:00Z" }),
      asig({ id: "b", viajeId: "V1", montoALiquidar: 250, fechaAsignacion: "2026-09-20T18:00:00Z" }),
    ]);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.pedidos).toHaveLength(2);
    expect(vs[0]!.efectivo).toBe(350);
    // El viaje empezó con el pedido MÁS VIEJO: es contra ese que se cuenta el tiempo fuera.
    expect(vs[0]!.desdeIso).toBe("2026-09-20T18:00:00Z");
  });

  it("una asignación sin viaje_id es su propio viaje", () => {
    const vs = agruparViajes([asig({ id: "a", viajeId: null })]);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.id).toBe("a");
  });

  it("NO junta dos asignaciones sin viaje_id aunque sean del mismo repartidor", () => {
    // Son de antes de la 0114 o de dos salidas distintas. Juntarlas inventaría un viaje que no fue.
    const vs = agruparViajes([
      asig({ id: "a", viajeId: null, repartidorNombre: "Luis" }),
      asig({ id: "b", viajeId: null, repartidorNombre: "Luis" }),
    ]);
    expect(vs).toHaveLength(2);
  });

  it("dos viajes del mismo repartidor quedan separados", () => {
    const vs = agruparViajes([
      asig({ id: "a", viajeId: "V1", fechaAsignacion: "2026-09-20T18:15:00Z" }),
      asig({ id: "b", viajeId: "V2", fechaAsignacion: "2026-09-20T18:40:00Z" }),
    ]);
    expect(vs).toHaveLength(2);
  });

  it("ordena los viajes por el más viejo primero", () => {
    const vs = agruparViajes([
      asig({ id: "b", viajeId: "V2", fechaAsignacion: "2026-09-20T18:40:00Z" }),
      asig({ id: "a", viajeId: "V1", fechaAsignacion: "2026-09-20T18:15:00Z" }),
    ]);
    expect(vs.map((v) => v.id)).toEqual(["V1", "V2"]);
  });

  it("sin asignaciones no hay viajes", () => {
    expect(agruparViajes([])).toEqual([]);
  });
});

describe("minutosFuera", () => {
  it("cuenta desde el pedido más viejo del viaje", () => {
    const [v] = agruparViajes([
      asig({ id: "a", viajeId: "V1", fechaAsignacion: "2026-09-20T18:00:00Z" }),
      asig({ id: "b", viajeId: "V1", fechaAsignacion: "2026-09-20T18:10:00Z" }),
    ]);
    expect(minutosFuera(v!, new Date("2026-09-20T18:25:00Z"))).toBe(25);
  });
});

describe("viajeTarde", () => {
  it("es tarde cuando se pasó del tiempo prometido", () => {
    const [v] = agruparViajes([asig({ id: "a", viajeId: "V1", tiempoPromesa: 30 })]);
    expect(viajeTarde(v!, new Date("2026-09-20T18:31:00Z"))).toBe(true);
    expect(viajeTarde(v!, new Date("2026-09-20T18:20:00Z"))).toBe(false);
  });

  it("sin promesa nunca es tarde", () => {
    const [v] = agruparViajes([asig({ id: "a", viajeId: "V1", tiempoPromesa: null })]);
    expect(viajeTarde(v!, new Date("2027-01-01T00:00:00Z"))).toBe(false);
  });
});
```

- [ ] **Step 2: Corre las pruebas para verificar que fallan**

```bash
cd apps/pos && npx vitest run app/lib/__tests__/viajes.test.ts
```

Esperado: FAIL, `Failed to resolve import "../viajes"`.

- [ ] **Step 3: Escribe el módulo**

Crea `apps/pos/app/lib/viajes.ts`:

```ts
import { minutosAbierta } from "./cuentas-abiertas";
import type { DeliveryAsignacion } from "./delivery";

/**
 * Un viaje: los pedidos que salieron juntos con el mismo repartidor.
 *
 * Se agrupa por `viaje_id` y NO por repartidor. Una asignación sigue viva hasta que se cobra, así
 * que si el cajero tarda en cobrar, el repartidor puede salir de nuevo con los pedidos anteriores
 * todavía sin liquidar. Agrupando por repartidor esos dos viajes saldrían revueltos en una sola
 * tarjeta y los minutos fuera dejarían de significar nada.
 *
 * Las asignaciones sin `viaje_id` son anteriores a la 0114: cada una es su propio viaje. No se
 * juntan entre sí aunque coincida el repartidor — eso inventaría un viaje que nunca ocurrió.
 */
export type Viaje = {
  /** El `viaje_id`, o el id de la asignación cuando no lo tiene. */
  id: string;
  repartidorNombre: string;
  pedidos: DeliveryAsignacion[];
  /** Lo que el repartidor debe traer de vuelta por todo el viaje. */
  efectivo: number;
  /** Cuándo salió: la asignación más vieja del viaje. */
  desdeIso: string;
  promesaMin: number | null;
};

export function agruparViajes(asignaciones: DeliveryAsignacion[]): Viaje[] {
  const porViaje = new Map<string, DeliveryAsignacion[]>();
  for (const a of asignaciones) {
    const clave = a.viajeId ?? a.id;
    const grupo = porViaje.get(clave);
    if (grupo) grupo.push(a);
    else porViaje.set(clave, [a]);
  }

  const viajes: Viaje[] = [];
  for (const [id, pedidos] of porViaje) {
    const ordenados = [...pedidos].sort((x, y) => x.fechaAsignacion.localeCompare(y.fechaAsignacion));
    const primero = ordenados[0]!;
    viajes.push({
      id,
      repartidorNombre: primero.repartidorNombre,
      pedidos: ordenados,
      efectivo: ordenados.reduce((s, p) => s + p.montoALiquidar, 0),
      desdeIso: primero.fechaAsignacion,
      // La promesa es del viaje: si los pedidos traen distintas, manda la más corta, que es la que
      // se incumple primero.
      promesaMin: ordenados.reduce<number | null>(
        (m, p) => (p.tiempoPromesa == null ? m : m == null ? p.tiempoPromesa : Math.min(m, p.tiempoPromesa)),
        null,
      ),
    });
  }

  // El que lleva más tiempo fuera, arriba: es por el que preguntan.
  return viajes.sort((a, b) => a.desdeIso.localeCompare(b.desdeIso));
}

/** Minutos desde que el viaje salió. Reusa el contador de las cuentas abiertas. */
export function minutosFuera(v: Viaje, ahora: Date = new Date()): number {
  return minutosAbierta(v.desdeIso, ahora);
}

/** Si se pasó del tiempo que se le prometió al cliente. Sin promesa, nunca. */
export function viajeTarde(v: Viaje, ahora: Date = new Date()): boolean {
  if (v.promesaMin == null) return false;
  return minutosFuera(v, ahora) > v.promesaMin;
}
```

- [ ] **Step 4: Corre las pruebas para verificar que pasan**

```bash
cd apps/pos && npx vitest run app/lib/__tests__/viajes.test.ts
```

Esperado: 9 pruebas en verde.

- [ ] **Step 5: Commit**

```bash
git add apps/pos/app/lib/viajes.ts apps/pos/app/lib/__tests__/viajes.test.ts
git commit -m "feat(pos): agrupar asignaciones de domicilio en viajes

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Capa de datos del POS

**Files:**
- Modify: `apps/pos/app/lib/delivery.ts`

**Interfaces:**
- Consumes: `asignar_delivery_lote` (Task 1); `DeliveryAsignacion.viajeId`, que ya quedó puesto en el Task 3.
- Produces:
  - `asignarLote(token, { ticketIds, repartidorId, tiempoPromesa? }): Promise<string>`
  - `crearRepartidor(token, tenantId, { nombre, telefono? }): Promise<Repartidor>`
  - `ESTADO_LABEL.EN_RUTA === "En reparto"`

- [ ] **Step 1: Cambia la etiqueta del estado**

En el mismo archivo, en `ESTADO_LABEL`:

```ts
// "En reparto", no "En ruta": es como lo dice el negocio. El valor del enum en la base sigue siendo
// EN_RUTA — renombrarlo arrastraría migración, la vista vw_cumplimiento_tiempos_delivery y el
// espejo de escritorio por una palabra que solo se lee en pantalla.
const ESTADO_LABEL: Record<DeliveryEstado, string> = {
  ASIGNADO: "Asignado", EN_RUTA: "En reparto", EN_DESTINO: "En destino", ENTREGADO: "Entregado",
  NO_ENTREGADO: "No entregado", EN_REGRESO: "En regreso", LIQUIDADO: "Liquidado", CANCELADO: "Cancelado",
};
```

- [ ] **Step 2: Añade `asignarLote` y `crearRepartidor`**

Justo después de `asignarRepartidor`, añade:

```ts
/**
 * Asigna uno o varios pedidos al mismo repartidor y los deja en reparto.
 *
 * Asignar ES salir: no hay un segundo paso que confirmar. Antes eran dos llamadas
 * (`asignar_delivery_repartidor` + `confirmar_salida_delivery`) y existía un tercer camino que se
 * las saltaba —imprimir el ticket marcaba la salida sin repartidor—, así que había pedidos
 * "salidos" que nadie llevaba.
 *
 * El monto NO se manda: lo calcula la RPC desde `tickets.total_mxn`. Es el dinero que el repartidor
 * tiene que traer de vuelta y lo decide quien manda, no esta pantalla.
 */
export async function asignarLote(
  token: string,
  args: { ticketIds: string[]; repartidorId: string; tiempoPromesa?: number | null },
): Promise<string> {
  const { data, error } = await employeeClient(token).rpc("asignar_delivery_lote", {
    p_ticket_ids: args.ticketIds,
    p_repartidor_id: args.repartidorId,
    p_tiempo_promesa_minutos: args.tiempoPromesa ?? null,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

/**
 * Da de alta un repartidor desde la caja.
 *
 * El catálogo se administra en el panel, pero desde que asignar es obligatorio la caja necesita una
 * salida: si nadie dio de alta a nadie, sin esto ningún domicilio podría salir hasta que alguien
 * entre al panel web — y eso es trabar la caja en hora pico por un trámite.
 */
export async function crearRepartidor(
  token: string,
  tenantId: string,
  args: { nombre: string; telefono?: string | null },
): Promise<Repartidor> {
  const nombre = args.nombre.trim();
  const telefono = args.telefono?.trim() ? args.telefono.trim() : null;
  const { data, error } = await employeeClient(token)
    .from("repartidores")
    .insert({ tenant_id: tenantId, nombre, telefono })
    .select("id, nombre, telefono")
    .single();
  // El choque del índice único llega como jerga de Postgres; aquí se dice lo que pasó.
  if (error) {
    throw new Error(
      error.message.includes("repartidor_nombre_uq")
        ? "Ya hay un repartidor con ese nombre."
        : error.message,
    );
  }
  const r = data as Record<string, unknown>;
  return { id: String(r.id), nombre: String(r.nombre), telefono: (r.telefono as string) ?? null };
}
```

- [ ] **Step 3: Verifica tipos y que las pruebas del Task 3 siguen verdes**

```bash
cd apps/pos && npm run typecheck && npx vitest run app/lib/__tests__/viajes.test.ts
```

Esperado: sin errores de tipo, 9 pruebas en verde.

- [ ] **Step 4: Commit**

```bash
git add apps/pos/app/lib/delivery.ts
git commit -m "feat(pos): asignarLote, alta de repartidor en caja y la etiqueta 'En reparto'

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Modal «Asignar repartidor»

**Files:**
- Create: `apps/pos/app/components/modal-asignar-repartidor.tsx`
- Delete: `apps/pos/app/components/modal-salida-domicilio.tsx`
- Modify: `apps/pos/app/components/home-pos.tsx` (import, render y etiqueta del botón)

**Interfaces:**
- Consumes: `asignarLote`, `crearRepartidor`, `listarRepartidores`, `Repartidor` (Task 4); `listarCuentasAbiertas`, `CuentaAbierta` (ya existen); `leerDeliveries` (Task 4).
- Produces: `<ModalAsignarRepartidor token tenantId sucursalId ticketId folio total onListo onCerrar />`.

Toma `modal-salida-domicilio.tsx` como base: **copia su estructura, sus clases de Tailwind y su cabecera de comentario**, y cámbiale lo que sigue. No inventes estilos nuevos.

- [ ] **Step 1: Crea el componente**

```tsx
"use client";
import { useEffect, useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { asignarLote, crearRepartidor, leerDeliveries, listarRepartidores, type Repartidor } from "../lib/delivery";
import { listarCuentasAbiertas, type CuentaAbierta } from "../lib/cuentas-abiertas";
import { fmtMxn } from "../lib/turno";
import { useEscape } from "../lib/use-escape";

/**
 * Asignar repartidor a un pedido a domicilio — y, si se lleva más de uno, a todo el viaje.
 *
 * ASIGNAR ES SALIR. Antes esto se llamaba "marcar salida" y eran dos pasos, pero además había un
 * tercer camino que se los saltaba: imprimir el ticket marcaba la salida sin repartidor. Quedaban
 * pedidos "salidos" que nadie llevaba y dinero que no se podía cuadrar contra nadie. Ya no se
 * puede salir sin repartidor.
 *
 * VARIOS PEDIDOS, UN VIAJE. En hora pico el repartidor junta dos o tres de la misma zona. Se
 * marcan aquí, en la pantalla donde el cajero ya está, en vez de con un modo de selección múltiple
 * colgando de la lista el resto del día: un pedido solo cuesta los mismos toques que antes.
 *
 * ALTA EN SITIO. Como asignar es obligatorio, un catálogo vacío trabaría la caja hasta que alguien
 * entrara al panel web. Por eso se puede dar de alta a alguien desde aquí.
 */
export function ModalAsignarRepartidor({
  token, tenantId, sucursalId, ticketId, folio, total, onListo, onCerrar,
}: {
  token: string;
  tenantId: string;
  sucursalId: string;
  ticketId: string;
  folio: string | null;
  /** Lo que el repartidor debe traer de vuelta por ESTE pedido. */
  total: number;
  onListo: () => void;
  onCerrar: () => void;
}) {
  const [repartidores, setRepartidores] = useState<Repartidor[] | null>(null);
  const [elegido, setElegido] = useState<string | null>(null);
  const [otros, setOtros] = useState<CuentaAbierta[]>([]);
  const [tambien, setTambien] = useState<Set<string>>(new Set());
  const [minutos, setMinutos] = useState<string>("30");
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [altaNombre, setAltaNombre] = useState("");
  const [altaTelefono, setAltaTelefono] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  useEscape(() => { if (!procesando) onCerrar(); });

  useEffect(() => {
    listarRepartidores(token)
      .then((r) => {
        setRepartidores(r);
        // Con un solo repartidor no hay nada que decidir: se preselecciona para que asignar sea un toque.
        if (r.length === 1 && r[0]) setElegido(r[0].id);
      })
      .catch(() => setRepartidores([]));
  }, [token]);

  useEffect(() => {
    // Los demás domicilios que TODAVÍA no tienen repartidor. Los que ya van en reparto no pueden
    // subirse a este viaje: el repartidor ya se fue con ellos.
    Promise.all([
      listarCuentasAbiertas(token, sucursalId, "DELIVERY_PROPIO"),
      leerDeliveries(token, sucursalId),
    ])
      .then(([cuentas, asignados]) => {
        const yaVan = new Set(asignados.map((a) => a.ticketId));
        setOtros(cuentas.filter((c) => c.ticketId !== ticketId && !yaVan.has(c.ticketId)));
      })
      .catch(() => setOtros([]));
  }, [token, sucursalId, ticketId]);

  function alternar(id: string) {
    setTambien((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function darDeAlta() {
    setProcesando(true);
    setError(null);
    try {
      const r = await crearRepartidor(token, tenantId, { nombre: altaNombre, telefono: altaTelefono });
      setRepartidores((prev) => [...(prev ?? []), r].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setElegido(r.id);
      setAltaAbierta(false);
      setAltaNombre("");
      setAltaTelefono("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo dar de alta");
    } finally {
      setProcesando(false);
    }
  }

  async function confirmar() {
    if (!elegido) return;
    setProcesando(true);
    setError(null);
    try {
      // Una sola llamada con todo el viaje: la RPC es atómica, así que o salen todos anotados o no
      // sale ninguno. Con llamadas sueltas, si la tercera fallaba el repartidor se iba con tres
      // pedidos y dos anotados.
      await asignarLote(token, {
        ticketIds: [ticketId, ...tambien],
        repartidorId: elegido,
        tiempoPromesa: minutos.trim() ? Number(minutos) : null,
      });
      onListo();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo asignar el repartidor");
      setProcesando(false);
    }
  }

  const totalViaje = total + otros.filter((o) => tambien.has(o.ticketId)).reduce((s, o) => s + o.total, 0);

  return (
    <Modal
      open
      onClose={onCerrar}
      title="Asignar repartidor"
      hideTitle
      className="w-[440px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]"
    >
      <h2 className="font-display text-xl font-semibold tracking-tight">¿Quién se lo lleva?</h2>
      <p className="mt-0.5 text-[13px] text-ink-3">
        {folio ? `${folio} · ` : ""}
        {fmtMxn(totalViaje)} a cobrar en la puerta.
      </p>

      <div className="mt-4">
        {repartidores === null && <p className="text-[13px] text-ink-3">Cargando repartidores…</p>}

        {repartidores !== null && repartidores.length > 0 && (
          <div className="max-h-[240px] overflow-y-auto rounded border border-line">
            {repartidores.map((r) => {
              const activo = elegido === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setElegido(activo ? null : r.id)}
                  aria-pressed={activo}
                  className={[
                    "flex w-full items-center gap-3 border-b border-line px-3 py-2.5 text-left transition last:border-b-0",
                    activo ? "bg-sel" : "hover:bg-bg",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "grid h-5 w-5 flex-shrink-0 place-items-center rounded-full border",
                      activo ? "border-ink bg-ink text-surface" : "border-line-strong",
                    ].join(" ")}
                    aria-hidden
                  >
                    {activo ? "✓" : ""}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-ink">{r.nombre}</span>
                    {r.telefono && <span className="block text-[12px] text-ink-3">{r.telefono}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {repartidores !== null && repartidores.length === 0 && !altaAbierta && (
        <p className="mt-4 rounded border border-line bg-bg px-3 py-2.5 text-[12.5px] leading-snug text-ink-2">
          No hay repartidores dados de alta. Dale de alta a quien se lo lleve para que el pedido
          pueda salir; después se administran en el panel, en{" "}
          <span className="font-semibold">Usuarios → Repartidores</span>.
        </p>
      )}

      {!altaAbierta && (
        <button
          type="button"
          onClick={() => setAltaAbierta(true)}
          className="mt-2 text-[12.5px] font-semibold text-info underline-offset-2 hover:underline"
        >
          ¿Falta alguien? Darlo de alta
        </button>
      )}

      {altaAbierta && (
        <div className="mt-3 rounded border border-line-strong p-3">
          <input
            className="h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink"
            placeholder="Nombre"
            value={altaNombre}
            maxLength={100}
            onChange={(e) => setAltaNombre(e.target.value)}
          />
          <input
            className="mt-2 h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink"
            placeholder="Teléfono (opcional)"
            inputMode="tel"
            value={altaTelefono}
            maxLength={20}
            onChange={(e) => setAltaTelefono(e.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setAltaAbierta(false)}
              className="h-10 flex-1 rounded border border-line-strong text-[13px] font-semibold text-ink-2"
            >
              Cancelar
            </button>
            <Button className="flex-1" onClick={darDeAlta} disabled={procesando || altaNombre.trim().length < 2}>
              Dar de alta
            </Button>
          </div>
        </div>
      )}

      {otros.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 text-[12.5px] font-semibold text-ink-2">¿Se lleva algo más?</p>
          <div className="max-h-[180px] overflow-y-auto rounded border border-line">
            {otros.map((o) => {
              const activo = tambien.has(o.ticketId);
              return (
                <button
                  key={o.ticketId}
                  type="button"
                  onClick={() => alternar(o.ticketId)}
                  aria-pressed={activo}
                  className={[
                    "flex w-full items-center gap-3 border-b border-line px-3 py-2.5 text-left transition last:border-b-0",
                    activo ? "bg-sel" : "hover:bg-bg",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "grid h-5 w-5 flex-shrink-0 place-items-center rounded border",
                      activo ? "border-ink bg-ink text-surface" : "border-line-strong",
                    ].join(" ")}
                    aria-hidden
                  >
                    {activo ? "✓" : ""}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">
                    {o.cliente ?? o.folio ?? "Cuenta"}
                  </span>
                  <span className="flex-shrink-0 text-[13px] font-semibold tabular-nums">{fmtMxn(o.total)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-3">
        <label className="mb-1 block text-[12.5px] font-semibold text-ink-2" htmlFor="min">
          Tiempo prometido · minutos
        </label>
        <input
          id="min"
          className="h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]"
          inputMode="numeric"
          value={minutos}
          maxLength={3}
          onChange={(e) => setMinutos(e.target.value.replace(/[^0-9]/g, ""))}
        />
      </div>

      {error && <p className="mt-3 text-[13px] font-medium text-danger" role="alert">{error}</p>}

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={onCerrar}
          disabled={procesando}
          className="h-11 flex-1 rounded border border-line-strong text-[14px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink disabled:opacity-50"
        >
          Cancelar
        </button>
        {/* Sin repartidor no hay botón que apretar: ya no se puede salir sin que alguien lo lleve. */}
        <Button className="flex-1" onClick={confirmar} disabled={procesando || !elegido}>
          {procesando ? "Asignando…" : tambien.size > 0 ? `Asignar ${tambien.size + 1} pedidos` : "Asignar"}
        </Button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Cambia el botón y el modal en `home-pos.tsx`**

En `apps/pos/app/components/home-pos.tsx`:

1. Línea 77: cambia el import a `import { ModalAsignarRepartidor } from "./modal-asignar-repartidor";`
2. En `extraPorCuenta` (~línea 1453), **quita la condición `c.estadoCocina === "LISTO"`** y cambia el texto del botón:

```tsx
        extraPorCuenta={
          enDelivery
            ? (c, recargar) => (
                <button
                  type="button"
                  onClick={() => setAsignandoRepartidor({ ticketId: c.ticketId, folio: c.folio, total: c.total, recargar })}
                  className="flex h-9 flex-shrink-0 items-center rounded border border-line-strong px-3 text-[13px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink"
                >
                  Asignar repartidor
                </button>
              )
            : undefined
        }
```

El candado de `LISTO` se quita porque la cocina no lo marca con disciplina: con la asignación obligatoria, dejarlo significaría que un pedido terminado no puede salir porque nadie tocó una pantalla.

3. Renombra el estado `saliendoDomicilio` → `asignandoRepartidor` (y su `setSaliendoDomicilio`) en toda su declaración y usos.
4. Sustituye el render del modal (~línea 1467):

```tsx
        {asignandoRepartidor && (
          <ModalAsignarRepartidor
            token={token}
            tenantId={caja.tenant_id}
            sucursalId={caja.sucursal_id}
            ticketId={asignandoRepartidor.ticketId}
            folio={asignandoRepartidor.folio}
            total={asignandoRepartidor.total}
            onListo={() => { const r = asignandoRepartidor.recargar; setAsignandoRepartidor(null); r(); }}
            onCerrar={() => setAsignandoRepartidor(null)}
          />
        )}
```

- [ ] **Step 3: Borra el modal viejo**

```bash
git rm apps/pos/app/components/modal-salida-domicilio.tsx
```

- [ ] **Step 4: Verifica tipos**

```bash
cd apps/pos && npm run typecheck
```

Esperado: sin errores, sin excepciones. Esta tarea no toca `marcarSalidaDomicilio` ni `pantalla-cuentas-modo.tsx`, así que cualquier error que salga ahí es real — escálalo, no lo ignores.

- [ ] **Step 5: Commit**

```bash
git add -A apps/pos/app/components
git commit -m "feat(pos): modal de asignar repartidor, con viaje de varios pedidos y alta en sitio

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Pestaña «En reparto»

**Files:**
- Create: `apps/pos/app/components/panel-en-reparto.tsx`
- Modify: `apps/pos/app/components/pantalla-cuentas-modo.tsx`

**Interfaces:**
- Consumes: `agruparViajes`, `minutosFuera`, `viajeTarde`, `Viaje` (Task 3); `leerDeliveries` (Task 4).
- Produces: `<PanelEnReparto token sucursalId onCobrar />`, y una prop nueva de `PantallaCuentasModo`: `mostrarEnReparto?: boolean`.

Va en su propio archivo: `pantalla-cuentas-modo.tsx` ya son 578 líneas y meterle la vista entera lo volvería difícil de leer y de editar con seguridad.

- [ ] **Step 1: Crea el panel**

Crea `apps/pos/app/components/panel-en-reparto.tsx`:

```tsx
"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@vim/ui/styles";
import { leerDeliveries } from "../lib/delivery";
import { agruparViajes, minutosFuera, viajeTarde, type Viaje } from "../lib/viajes";
import { fmtMxn } from "../lib/turno";

/**
 * Quién anda repartiendo ahora mismo: qué lleva, desde hace cuánto y con cuánto dinero encima.
 *
 * Hasta la 0114 esto no existía en ninguna pantalla. `leerDeliveries` llevaba meses escrita y no la
 * llamaba nadie, así que el dinero del domicilio no se cuadraba contra nadie: no había a quién.
 *
 * Va en su propio archivo porque `pantalla-cuentas-modo.tsx` ya pasa de 500 líneas y meterle otra
 * vista entera la volvería difícil de leer y de editar sin romper algo de al lado.
 */
export function PanelEnReparto({
  token,
  sucursalId,
  onCobrar,
}: {
  token: string;
  sucursalId: string;
  /** El cobro de siempre. Liquidar al repartidor ya ocurre ahí dentro (`cerrarRepartoAlCobrar`). */
  onCobrar: (ticketId: string) => void;
}) {
  const [viajes, setViajes] = useState<Viaje[] | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Reloj propio: sin esto los minutos se quedan congelados en lo que decían al abrir la pantalla,
  // y son justo el dato por el que se mira aquí.
  const [ahora, setAhora] = useState(() => new Date());

  const recargar = useCallback(async () => {
    try {
      setViajes(agruparViajes(await leerDeliveries(token, sucursalId)));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer quién anda repartiendo");
    }
  }, [token, sucursalId]);

  useEffect(() => { void recargar(); }, [recargar]);

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => { void recargar(); }, 30_000);
    return () => clearInterval(t);
  }, [recargar]);

  const sel = viajes?.find((v) => v.id === selId) ?? null;

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex w-[clamp(18rem,30vw,24rem)] flex-shrink-0 flex-col border-r border-line">
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {viajes === null && <p className="p-3 text-sm text-ink-3">Cargando…</p>}

          {viajes?.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
              <p className="text-[14px] font-semibold text-ink-2">Nadie anda repartiendo</p>
              <p className="text-[12.5px] text-ink-3">
                Los pedidos que salgan con un repartidor aparecen aquí.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {viajes?.map((v) => {
              const activa = v.id === selId;
              // Tarde = se pasó de lo que se le prometió al cliente. Misma señal naranja que ya usa
              // la lista de cuentas para lo que va en camino.
              const tarde = viajeTarde(v, ahora);
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelId(v.id)}
                  className={[
                    "w-full rounded-lg border p-3 text-left transition",
                    tarde
                      ? `bg-accent text-white ${activa ? "border-ink" : "border-accent hover:brightness-105"}`
                      : activa
                        ? "border-ink bg-sel"
                        : "border-line-strong bg-surface hover:border-ink",
                  ].join(" ")}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-display text-[15px] font-semibold">{v.repartidorNombre}</span>
                    <span className="flex-shrink-0 font-display text-[15px] font-bold tabular-nums">{fmtMxn(v.efectivo)}</span>
                  </div>
                  <div className={["mt-0.5 flex items-center justify-between gap-2 text-[12px]", tarde ? "text-white/75" : "text-ink-3"].join(" ")}>
                    <span className="truncate">
                      {v.pedidos.length} {v.pedidos.length === 1 ? "pedido" : "pedidos"}
                    </span>
                    <span className="flex-shrink-0">{minutosFuera(v, ahora)} min</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {error && <p className="flex-shrink-0 bg-[#FBF1EF] px-4 py-2 text-[13px] font-medium text-danger" role="alert">{error}</p>}

        {!sel ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-[14px] font-semibold text-ink-2">Elige un repartidor</p>
            <p className="text-[12.5px] text-ink-3">Verás qué lleva y podrás cobrar cada pedido.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-shrink-0 items-center gap-2 border-b border-line px-4 py-3">
              <div className="mr-auto min-w-0">
                <div className="truncate font-display text-[16px] font-semibold">{sel.repartidorNombre}</div>
                <div className="text-[12px] text-ink-3">
                  {minutosFuera(sel, ahora)} min fuera · {fmtMxn(sel.efectivo)} a cobrar
                  {sel.promesaMin != null ? ` · prometido en ${sel.promesaMin} min` : ""}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {sel.pedidos.map((p) => (
                <div key={p.id} className="flex items-center gap-3 border-b border-line px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold text-ink">{p.ticketFolio ?? "Pedido"}</div>
                    <div className="text-[12px] text-ink-3">{fmtMxn(p.montoALiquidar)}</div>
                  </div>
                  {/* El mismo cobro de siempre: al cobrar se liquida solo al repartidor y el pedido
                      sale del viaje. No hay un paso aparte de "entregar el dinero". */}
                  <Button onClick={() => onCobrar(p.ticketId)}>Cobrar {fmtMxn(p.montoALiquidar)}</Button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Añade las pestañas a `pantalla-cuentas-modo.tsx`**

1. Añade la prop:

```tsx
  /** Domicilio: muestra la pestaña de los pedidos que ya van con un repartidor. */
  mostrarEnReparto?: boolean;
```

2. Añade el estado `const [pestana, setPestana] = useState<"local" | "reparto">("local");`

3. Encima de la columna izquierda (antes del `div` de `w-[clamp(18rem,30vw,24rem)]`), renderiza las dos pestañas **solo si `mostrarEnReparto`**, con `aria-selected` y el mismo lenguaje visual de los botones de la cabecera. Cuando `pestana === "reparto"`, renderiza `<PanelEnReparto token={token} sucursalId={caja.sucursal_id} onCobrar={onCobrar} />` en lugar de la lista y el detalle.

4. En `home-pos.tsx`, pasa `mostrarEnReparto={modo === "DELIVERY_PROPIO"}`.

- [ ] **Step 3: Verifica tipos y pruebas**

```bash
cd apps/pos && npm run typecheck && npx vitest run
```

Esperado: sin errores de tipo y toda la suite del POS en verde.

- [ ] **Step 4: Commit**

```bash
git add apps/pos/app/components/panel-en-reparto.tsx apps/pos/app/components/pantalla-cuentas-modo.tsx apps/pos/app/components/home-pos.tsx
git commit -m "feat(pos): pestana En reparto en Domicilios

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Asignar es salir — desenganchar la impresión

**Files:**
- Modify: `apps/pos/app/components/pantalla-cuentas-modo.tsx:184-205` (`imprimir`) y la tarjeta de cuenta (`salio`)
- Modify: `apps/pos/app/lib/cuentas-abiertas.ts:73-79` (rename)
- Delete: `apps/pos/app/components/modal-liquidar-delivery.tsx`

**Interfaces:**
- Consumes: `leerDeliveries` (Task 4).
- Produces: `marcarComandaImpresa(token, ticketId)` en lugar de `marcarSalidaDomicilio`.

- [ ] **Step 1: Quita la marca de salida de `imprimir()`**

En `apps/pos/app/components/pantalla-cuentas-modo.tsx`, dentro de `imprimir`, **borra entero** el bloque `if (modo === "DELIVERY_PROPIO") { ... }` (líneas 189-199). El resto de `imprimir` no cambia: `comanda_impresa_at` se sigue sellando donde corresponde y sigue disparando *Reimprimir* con PIN.

Deja en su lugar este comentario:

```tsx
      // Imprimir ya NO marca la salida. Lo hacía —sellaba comanda_impresa_at y la tarjeta se
      // pintaba naranja— y ese era el camino por el que los pedidos "salían" sin repartidor: el
      // cajero que imprimía nunca pasaba por el modal. Desde la 0114 lo que saca un pedido a la
      // calle es asignarle repartidor, y nada más.
```

- [ ] **Step 2: El naranja sale de la asignación, no de la impresión**

En el mismo archivo, carga las asignaciones vivas junto a las cuentas (en `recargar`, solo cuando `modo === "DELIVERY_PROPIO"`):

```tsx
  const [enReparto, setEnReparto] = useState<Set<string>>(new Set());
```

y dentro de `recargar`, tras cargar `items`:

```tsx
      // Qué pedidos ya van con alguien. Es lo que pinta la tarjeta, en lugar de comanda_impresa_at:
      // "impresa" y "salió" eran el mismo dato y por eso el naranja mentía.
      if (modo === "DELIVERY_PROPIO") {
        try {
          const vivas = await leerDeliveries(token, caja.sucursal_id);
          setEnReparto(new Set(vivas.map((a) => a.ticketId)));
        } catch { /* sin esto la lista se pinta sin el naranja, no se rompe */ }
      }
```

Y en la tarjeta:

```tsx
                const salio = modo === "DELIVERY_PROPIO"
                  ? enReparto.has(c.ticketId)
                  : yaImpresas.has(c.ticketId) || c.impresaAt != null;
```

- [ ] **Step 3: Renombra `marcarSalidaDomicilio`**

En `apps/pos/app/lib/cuentas-abiertas.ts`, renombra la función a `marcarComandaImpresa` y corrige su comentario:

```ts
/** Sella que la comanda del ticket se imprimió. NO significa que el pedido haya salido: lo que lo
 *  saca a la calle es asignarle repartidor (0114). Se usa para ofrecer "Reimprimir" con PIN. */
export async function marcarComandaImpresa(token: string, ticketId: string): Promise<void> {
```

Actualiza los imports y usos. Busca los que queden:

```bash
grep -rn "marcarSalidaDomicilio" apps/
```

Esperado tras el cambio: sin resultados.

- [ ] **Step 4: Borra el modal muerto**

`ModalLiquidarDelivery` no lo importa nadie y el cobro no cambia: la liquidación sigue siendo automática al cobrar.

```bash
grep -rn "ModalLiquidarDelivery" apps/   # debe estar vacío salvo el propio archivo
git rm apps/pos/app/components/modal-liquidar-delivery.tsx
```

- [ ] **Step 5: Verifica**

```bash
cd apps/pos && npm run typecheck && npx vitest run
```

Esperado: sin errores y toda la suite en verde.

- [ ] **Step 6: Commit**

```bash
git add -A apps/pos
git commit -m "feat(pos): imprimir deja de marcar la salida de un domicilio

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: ADR, versión del escritorio y bitácora

**Files:**
- Create: `docs/decisiones/0016-un-viaje-es-una-columna-no-una-tabla.md`
- Modify: `desktop/package.json` (versión → `0.4.71`)
- Modify: `MEMORY.md` (raíz de `vim-pos/`)

- [ ] **Step 1: Escribe el ADR 0016**

Sigue la forma de `docs/decisiones/0015-los-combos-son-un-producto-con-slots.md`. Decisión: **un viaje es una columna, no una tabla**, y **asignar es salir**. Los dos argumentos que hay que dejar escritos:

1. La columna cruza el sync sola porque el push lee el `information_schema` del destino (0074); una tabla nueva habría que darla de alta en el push, en el pull y en el espejo.
2. Un viaje no tiene estado propio: el estado vive en cada asignación, y duplicarlo crearía dos verdades que pueden contradecirse.

Y la consecuencia aceptada: no existe "Luis regresó" como hecho propio. Si algún día hace falta, se asciende a tabla.

- [ ] **Step 2: Sube la versión del escritorio**

En `desktop/package.json`, `"version": "0.4.70"` → `"version": "0.4.71"`.

- [ ] **Step 3: Corre todo antes de cerrar**

```bash
cd desktop && npm run smokes
```

```bash
npm run typecheck && npm run test
```

Esperado: smokes en verde, tipos limpios y toda la suite en verde.

- [ ] **Step 4: Actualiza `MEMORY.md`**

En `vim-pos/MEMORY.md`: pon la fecha de hoy en «Última actualización», añade la entrega a «Dónde estamos» y **corrige «Próximos pasos», que está desactualizado**: dice que el PR #17 sigue abierto y ya está mezclado, igual que el #18 y el #19.

- [ ] **Step 5: Commit y PR**

```bash
git add docs/decisiones/0016-un-viaje-es-una-columna-no-una-tabla.md desktop/package.json MEMORY.md
git commit -m "docs(delivery): ADR 0016 y escritorio 0.4.71

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git push -u origin delivery/asignar-repartidor
```

Abre el PR con `gh pr create`. En el cuerpo, explicar el cambio de costumbre para el cajero (imprimir ya no saca el pedido) y que el instalador 0.4.71 debe pasar la lista "Antes de empaquetar" del RUNBOOK. Termina el cuerpo con:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

**No publicar el instalador en este PR.** El empaquetado es un paso aparte, con su propia verificación del `.exe`.

---

## Verificación final (antes de pedir revisión)

- [ ] `cd desktop && npm run smokes` — todos en verde, incluido `smoke_delivery_viaje.sql`.
- [ ] `cd desktop && npm run verify:push && npm run verify:sync-ciclo` — en verde.
- [ ] `npm run typecheck && npm run test` desde la raíz — en verde.
- [ ] `grep -rn "marcarSalidaDomicilio\|ModalLiquidarDelivery\|modal-salida-domicilio" apps/` — sin resultados.
- [ ] A mano, en el POS empaquetado en el navegador sin Electron: asignar un pedido; asignar tres de un jalón y comprobar que comparten viaje; comprobar que imprimir **no** saca el pedido de «En el local»; cobrar un pedido y ver que sale del viaje; borrar todos los repartidores del catálogo y comprobar que se puede dar de alta uno desde el modal.
