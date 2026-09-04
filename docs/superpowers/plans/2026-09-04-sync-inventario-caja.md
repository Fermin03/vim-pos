# Sincronización de inventario con la caja instalada — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que las ventas de la caja instalada descuenten inventario: la caja recibe insumos, existencias y recetas, genera movimientos al vender y los sube; la nube recalcula existencias y alertas.

**Architecture:** Una migración (0101) redefine `sync_pull_snapshot` con seis tablas más y `sync_push_snapshot` con `movimientos_inventario`, aislamiento de filas restaurado (helper de 0074), recálculo de existencias fuera del modo réplica, bitácora en `sync_eventos` y sello de `cajas.ultima_conexion`. En el escritorio, el pull aplica las tablas nuevas y corrige existencias por movimientos pendientes; el push sube movimientos y los marca en `_vim_mov_ok`; el ciclo hace push antes que pull. El panel gana un interruptor que enciende `modulo_inventario_activo`. Termina con el instalador 0.4.57 publicado.

**Tech Stack:** Postgres/Supabase (plpgsql, `SECURITY DEFINER`, `session_replication_role`), Edge Functions sin cambios, Electron + Node (`desktop/src/*.mjs`, `node:test`, `embedded-postgres`), Next.js admin (`apps/admin`), `gh` CLI para el release.

**Spec:** `docs/superpowers/specs/2026-09-04-sync-inventario-caja-design.md` (decisión: `docs/decisiones/0013-el-inventario-viaja-por-movimientos.md`).

## Global Constraints

- **La verdad del saldo es la nube.** La caja solo sube `movimientos_inventario`; nunca `insumo_stock_sucursal`.
- **Movimiento idempotente por `id`**: la nube inserta con `ON CONFLICT (id) DO NOTHING` y solo las filas nuevas mueven existencias. Reenviar un snapshot no descuenta dos veces.
- **Existencia local = existencia de la nube − Σ(signo × cantidad) de los movimientos locales pendientes** (no marcados en `_vim_mov_ok`).
- **Signos** (copiados de `aplicar_movimiento_inventario`, 0007): +1 `ENTRADA_COMPRA, REVERSA_CANCELACION, AJUSTE_POSITIVO, TRANSFERENCIA_ENTRADA`; −1 `SALIDA_VENTA, SALIDA_MODIFICADOR_EXTRA, MERMA, AJUSTE_NEGATIVO, TRANSFERENCIA_SALIDA, DEVOLUCION_PROVEEDOR`.
- **Lista explícita de tablas** en pull y push (ADR 0004): las once de 0089 más `movimientos_inventario` en el push; las de 0079 más `unidades_medida, insumos, insumo_stock_sucursal, recetas, receta_componentes, modificador_componentes` en el pull.
- **El push aplica las once tablas de venta en `replica` y los movimientos en `origin`** (`SET LOCAL session_replication_role = origin` antes de `_vim_aplicar_movimientos`, que es el último paso).
- Una migración aplicada en remoto no se edita; 0101 es aditiva (`CREATE OR REPLACE`). Tras aplicarla: `pnpm db:types`.
- Grants: `REVOKE EXECUTE … FROM public, anon, authenticated; GRANT EXECUTE … TO service_role` para las dos RPC y la función nueva.
- La venta nunca se bloquea por inventario (D32). Un movimiento rechazado por la nube va a `_errores` y se reintenta; el ticket sí se marca subido.
- Sin psql en Windows: smokes con `docker exec -i supabase_db_vim-pos psql -U postgres -d postgres -v ON_ERROR_STOP=1 < archivo.sql`. Base local reiniciable con `supabase db reset`.
- Escritorio: verificaciones con `npm run verify:<nombre>` desde `desktop/` y `pnpm test:escritorio` desde la raíz (`node --test desktop/src/*.test.mjs`). `startBackend` usa la base embebida de desarrollo con el fixture (tenant `99999999-…aa`, caja `…cc`, sucursal `…bb`, María `…01`).
- Panel: `pnpm --filter ./apps/admin typecheck`; nunca `next build` con el dev server arriba.
- Commits en español, uno por tarea, terminando con la línea `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Nunca `git add -A` (hay cambios ajenos sin confirmar en `sitio-web/`).

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0101_sync_inventario.sql` | Helper de signo, `_vim_aplicar_movimientos`, `sync_push_snapshot` (0089 + 0074 + 0073 + movimientos), `sync_pull_snapshot` (0079 + 6 tablas) |
| `supabase/scripts/smoke_sync_inventario.sql` | Smoke del push con movimientos, idempotencia, aislamiento, bitácora y sello |
| `supabase/tests/0003_grants_secdef.test.sql` | Sin cambios (las RPC ya están listadas); se corre para confirmar |
| `desktop/src/sync-pull.mjs` | `PULL_ORDER`, `CLAVES_NATURALES`, `deltaPendiente`, corrección de existencias |
| `desktop/src/sync-pull.test.mjs` | Prueba de `deltaPendiente` |
| `desktop/src/verify-sync.mjs` | Verificación del pull con inventario y descuento local |
| `desktop/src/sync-push.mjs` | `_vim_mov_ok`, pendientes, snapshot con movimientos, marcado, rechazados |
| `desktop/src/verify-push.mjs` | Verificación del push con movimientos |
| `desktop/src/main.mjs` | Orden push → pull en `syncBestEffort` |
| `desktop/src/verify-migraciones.mjs` | Arranque limpio con todas las migraciones (0098 y shim) |
| `desktop/package.json` | Scripts `verify:migraciones`, versión 0.4.57 |
| `apps/admin/app/lib/inventario.ts` | `leerModuloInventario`, `activarModuloInventario` |
| `apps/admin/app/(panel)/inventario/page.tsx` | Interruptor "Descontar inventario al vender" |
| `docs/producto/backlog.md` | Cierre del pendiente de sync |

---

### Task 1: Migración 0101 — pull con inventario, push con movimientos y aislamiento restaurado

**Files:**
- Create: `supabase/migrations/0101_sync_inventario.sql`
- Create: `supabase/scripts/smoke_sync_inventario.sql`

**Interfaces:**
- Consumes: `_vim_apply_rows_detalle(p_tabla text, p_rows jsonb, p_tenant uuid) RETURNS jsonb` (0074, devuelve `{aplicadas, errores}`); `evaluar_alertas_stock(p_insumo_id uuid, p_sucursal_id uuid)` (0007); tablas `sync_eventos`, `cajas` (0070/0073); enum `movimiento_inventario_tipo`.
- Produces: `sync_pull_snapshot(p_tenant uuid) RETURNS jsonb` con las claves nuevas `unidades_medida, insumos, insumo_stock_sucursal, recetas, receta_componentes, modificador_componentes`; `sync_push_snapshot(p_tenant uuid, p_snapshot jsonb) RETURNS jsonb` que acepta la clave `movimientos_inventario` y devuelve `{ <tabla>: n, …, movimientos_inventario: n, _errores?: [{tabla,id,error}], _ignoradas?: [..] }`; `_vim_signo_movimiento(p_tipo movimiento_inventario_tipo) RETURNS integer`; `_vim_aplicar_movimientos(p_rows jsonb, p_tenant uuid) RETURNS jsonb` (`{aplicadas, errores, insumos_tocados}`).

- [ ] **Step 1: Escribir el smoke que debe fallar**

`supabase/scripts/smoke_sync_inventario.sql`:

```sql
-- Smoke sync inventario (spec 2026-09-04 §5, §9): la nube recibe movimientos de la caja por
-- sync_push_snapshot, descuenta existencias UNA sola vez por id, evalúa alertas, aísla filas
-- malas en _errores, registra en sync_eventos y sella cajas.ultima_conexion. ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_t uuid := '99999999-0000-0000-0000-0000000000aa';
  v_s uuid := '99999999-0000-0000-0000-0000000000bb';
  v_c uuid := '99999999-0000-0000-0000-0000000000cc';
  v_m uuid := '99999999-0000-0000-0000-000000000001';
  v_ajeno uuid := '99999999-0000-0000-0000-0000000000ff';
  v_pza uuid; v_insumo uuid; v_insumo_ajeno uuid; v_prod uuid;
  v_m1 uuid := gen_random_uuid(); v_m2 uuid := gen_random_uuid(); v_m3 uuid := gen_random_uuid(); v_m4 uuid := gen_random_uuid();
  v_snap jsonb; v_res jsonb; v_stock numeric; v_alerta text; v_estado text; v_n int; v_eventos_antes int; v_eventos_despues int;
  v_conexion timestamptz;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_m::text, 'tenant_id', v_t::text)::text, true);
  SELECT id INTO v_pza FROM unidades_medida WHERE tenant_id = v_t AND codigo = 'PZA' LIMIT 1;
  IF v_pza IS NULL THEN RAISE EXCEPTION 'faltan unidades (seed)'; END IF;

  -- Insumo con existencia 10, mínimo 5, crítico 2, y un producto con receta crítica de 1 pza.
  INSERT INTO insumos (tenant_id, nombre, unidad_medida_id, categoria, costo_unitario_mxn, stock_minimo_global, stock_critico_global)
  VALUES (v_t, 'Pan sync', v_pza, 'PANIFICACION', 4, 5, 2) RETURNING id INTO v_insumo;
  INSERT INTO insumo_stock_sucursal (tenant_id, insumo_id, sucursal_id, stock_actual) VALUES (v_t, v_insumo, v_s, 10);
  SELECT id INTO v_prod FROM productos WHERE tenant_id = v_t AND deleted_at IS NULL ORDER BY nombre LIMIT 1;
  DELETE FROM recetas WHERE producto_id = v_prod;
  PERFORM guardar_receta(v_prod, true, NULL, jsonb_build_array(jsonb_build_object(
    'insumo_id', v_insumo, 'cantidad', 1, 'cantidad_capturada', 1, 'unidad_capturada_id', v_pza, 'es_critico', true, 'notas', NULL, 'orden', 0)));

  -- Insumo de OTRO negocio (fixture, sin RLS: este bloque corre como superusuario).
  INSERT INTO tenants (id, codigo, nombre_comercial, vertical_principal) VALUES (v_ajeno, 'smoke-ajeno-sync', 'Ajeno', 'QUICK_SERVICE') ON CONFLICT (id) DO NOTHING;
  INSERT INTO insumos (tenant_id, nombre, unidad_medida_id, categoria, costo_unitario_mxn) VALUES (v_ajeno, 'Ajeno', v_pza, 'OTROS', 1) RETURNING id INTO v_insumo_ajeno;

  SELECT count(*) INTO v_eventos_antes FROM sync_eventos WHERE tenant_id = v_t;

  -- Snapshot "de la caja": salida 3, salida 2, reversa 1 (todos nuevos), y un movimiento con insumo ajeno.
  -- Además un pago mal formado (ticket inexistente) para probar el aislamiento restaurado.
  v_snap := jsonb_build_object(
    'movimientos_inventario', jsonb_build_array(
      jsonb_build_object('id', v_m1, 'tenant_id', v_t, 'sucursal_id', v_s, 'insumo_id', v_insumo, 'tipo', 'SALIDA_VENTA',
        'cantidad', 3, 'costo_unitario_mxn', 4, 'stock_antes', 10, 'stock_despues', 7, 'fecha', now() - interval '3 min', 'dia_contable', CURRENT_DATE, 'usuario_id', v_m),
      jsonb_build_object('id', v_m2, 'tenant_id', v_t, 'sucursal_id', v_s, 'insumo_id', v_insumo, 'tipo', 'SALIDA_VENTA',
        'cantidad', 2, 'costo_unitario_mxn', 4, 'stock_antes', 7, 'stock_despues', 5, 'fecha', now() - interval '2 min', 'dia_contable', CURRENT_DATE, 'usuario_id', v_m),
      jsonb_build_object('id', v_m3, 'tenant_id', v_t, 'sucursal_id', v_s, 'insumo_id', v_insumo, 'tipo', 'REVERSA_CANCELACION',
        'cantidad', 1, 'costo_unitario_mxn', 4, 'stock_antes', 5, 'stock_despues', 6, 'fecha', now() - interval '1 min', 'dia_contable', CURRENT_DATE, 'usuario_id', v_m),
      jsonb_build_object('id', v_m4, 'tenant_id', v_t, 'sucursal_id', v_s, 'insumo_id', v_insumo_ajeno, 'tipo', 'SALIDA_VENTA',
        'cantidad', 1, 'costo_unitario_mxn', 1, 'stock_antes', 0, 'stock_despues', -1, 'fecha', now(), 'dia_contable', CURRENT_DATE, 'usuario_id', v_m)),
    'pagos', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'tenant_id', v_t, 'sucursal_id', v_s, 'caja_id', v_c, 'turno_id', gen_random_uuid(),
        'ticket_id', gen_random_uuid(), 'dia_contable', CURRENT_DATE, 'metodo_pago', 'NO_EXISTE', 'monto_mxn', 1, 'estado', 'APLICADO',
        'usuario_id', v_m, 'created_by', v_m, 'referencia', 'mal formado')));
  -- (En modo réplica las FK no se comprueban, así que un ticket inexistente NO falla; un valor
  --  fuera del enum metodo_pago sí, y eso es lo que prueba el aislamiento fila por fila.)

  -- 1) Primer push
  v_res := sync_push_snapshot(v_t, v_snap);
  RAISE NOTICE 'push 1: %', v_res;
  IF (v_res->>'movimientos_inventario')::int <> 3 THEN RAISE EXCEPTION 'esperaba 3 movimientos aplicados, %', v_res->>'movimientos_inventario'; END IF;
  SELECT stock_actual, alerta_actual::text INTO v_stock, v_alerta FROM insumo_stock_sucursal WHERE insumo_id = v_insumo AND sucursal_id = v_s;
  RAISE NOTICE 'existencia % (esperado 6) alerta % (esperado NULL o sin alerta: 6 > mínimo 5)', v_stock, v_alerta;
  IF v_stock <> 6 THEN RAISE EXCEPTION 'existencia esperada 6, es %', v_stock; END IF;
  SELECT stock_antes INTO v_stock FROM movimientos_inventario WHERE id = v_m1;
  IF v_stock <> 10 THEN RAISE EXCEPTION 'stock_antes de la caja debe conservarse (10), es %', v_stock; END IF;
  -- _errores: el movimiento ajeno y el pago mal formado, nada más
  SELECT count(*) INTO v_n FROM jsonb_array_elements(COALESCE(v_res->'_errores', '[]'::jsonb)) e WHERE e->>'id' = v_m4::text;
  IF v_n <> 1 THEN RAISE EXCEPTION 'el movimiento ajeno debía estar en _errores'; END IF;
  SELECT count(*) INTO v_n FROM jsonb_array_elements(COALESCE(v_res->'_errores', '[]'::jsonb)) e WHERE e->>'tabla' = 'pagos';
  IF v_n <> 1 THEN RAISE EXCEPTION 'el pago mal formado debía estar en _errores (aislamiento 0074)'; END IF;
  IF EXISTS (SELECT 1 FROM movimientos_inventario WHERE id = v_m4) THEN RAISE EXCEPTION 'el movimiento ajeno no debía insertarse'; END IF;

  -- 2) Segundo push idéntico: nada cambia (idempotencia por id)
  v_res := sync_push_snapshot(v_t, v_snap);
  IF (v_res->>'movimientos_inventario')::int <> 0 THEN RAISE EXCEPTION 'reenvío no debe aplicar movimientos, aplicó %', v_res->>'movimientos_inventario'; END IF;
  SELECT stock_actual INTO v_stock FROM insumo_stock_sucursal WHERE insumo_id = v_insumo AND sucursal_id = v_s;
  IF v_stock <> 6 THEN RAISE EXCEPTION 'reenvío cambió la existencia a %', v_stock; END IF;

  -- 3) Agotado: una salida de 6 deja 0 → alerta AGOTADO y producto AGOTADO automático
  v_res := sync_push_snapshot(v_t, jsonb_build_object('movimientos_inventario', jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'tenant_id', v_t, 'sucursal_id', v_s, 'insumo_id', v_insumo, 'tipo', 'SALIDA_VENTA',
      'cantidad', 6, 'costo_unitario_mxn', 4, 'stock_antes', 6, 'stock_despues', 0, 'fecha', now(), 'dia_contable', CURRENT_DATE, 'usuario_id', v_m))));
  SELECT stock_actual, alerta_actual::text INTO v_stock, v_alerta FROM insumo_stock_sucursal WHERE insumo_id = v_insumo AND sucursal_id = v_s;
  SELECT estado::text INTO v_estado FROM productos WHERE id = v_prod;
  RAISE NOTICE 'tras agotar: existencia % alerta % producto %', v_stock, v_alerta, v_estado;
  IF v_stock <> 0 OR v_alerta <> 'AGOTADO' OR v_estado <> 'AGOTADO' THEN RAISE EXCEPTION 'agotado automático no ocurrió'; END IF;

  -- 4) Bitácora y sello
  SELECT count(*) INTO v_eventos_despues FROM sync_eventos WHERE tenant_id = v_t;
  IF v_eventos_despues < v_eventos_antes + 3 THEN RAISE EXCEPTION 'sync_eventos no registró los 3 pushes (% → %)', v_eventos_antes, v_eventos_despues; END IF;
  SELECT ultima_conexion INTO v_conexion FROM cajas WHERE id = v_c;
  IF v_conexion IS NULL OR v_conexion < now() - interval '1 minute' THEN RAISE EXCEPTION 'cajas.ultima_conexion no se selló'; END IF;

  RAISE NOTICE 'SMOKE SYNC INVENTARIO OK';
END $$;
ROLLBACK;
```

- [ ] **Step 2: Correrlo y ver que falla**

Run: `docker exec -i supabase_db_vim-pos psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/scripts/smoke_sync_inventario.sql`
Expected: falla en "esperaba 3 movimientos aplicados" (con 0089 la clave `movimientos_inventario` va a `_ignoradas`).

- [ ] **Step 3: Escribir la migración**

`supabase/migrations/0101_sync_inventario.sql`:

```sql
-- ============================================================================
-- 0101 — El inventario viaja por movimientos (ADR 0013, spec 2026-09-04).
--
-- PULL: bajan a la caja unidades, insumos, existencias, recetas y componentes (la nube manda).
-- PUSH: la caja sube `movimientos_inventario`; aquí se insertan solo los nuevos (por id) y, por
--       cada uno, se aplica su cantidad con signo a `insumo_stock_sucursal` y se evalúan alertas.
--       Ese paso corre FUERA del modo réplica: en réplica no hay triggers ni FK.
-- Además se restaura lo que 0089 perdió al reescribir el cuerpo: aislamiento de filas
-- conflictivas (0074, `_vim_apply_rows_detalle` + `_errores`), bitácora en `sync_eventos` (0070)
-- y sello de `cajas.ultima_conexion` (0073).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Signo de un tipo de movimiento (misma tabla que aplicar_movimiento_inventario, 0007 §9.3)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION _vim_signo_movimiento(p_tipo movimiento_inventario_tipo)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_tipo
    WHEN 'ENTRADA_COMPRA' THEN 1 WHEN 'REVERSA_CANCELACION' THEN 1
    WHEN 'AJUSTE_POSITIVO' THEN 1 WHEN 'TRANSFERENCIA_ENTRADA' THEN 1
    ELSE -1 END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Aplicar movimientos de la caja: insertar los nuevos y mover existencias
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION _vim_aplicar_movimientos(p_rows jsonb, p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_cols    text;
  v_sql     text;
  v_fila    jsonb;
  v_id      uuid;
  v_n       integer := 0;
  v_errores jsonb := '[]'::jsonb;
  v_nuevos  uuid[] := ARRAY[]::uuid[];
  v_par     record;
  v_tocados integer := 0;
  v_delta   numeric;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RETURN jsonb_build_object('aplicadas', 0, 'errores', '[]'::jsonb, 'insumos_tocados', 0);
  END IF;

  SELECT string_agg(quote_ident(column_name), ', ') INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'movimientos_inventario'
     AND is_generated <> 'ALWAYS' AND is_identity <> 'YES';

  -- Solo los que NO existían: reenviar un snapshot no descuenta dos veces.
  v_sql := format(
    'INSERT INTO public.movimientos_inventario (%s) SELECT %s FROM jsonb_populate_recordset(NULL::public.movimientos_inventario, $1) WHERE tenant_id = $2 ON CONFLICT (id) DO NOTHING RETURNING id',
    v_cols, v_cols);

  -- Fila por fila y en orden de fecha: son pocos por lote, y así cada error se aísla solo.
  FOR v_fila IN SELECT value FROM jsonb_array_elements(p_rows) ORDER BY value->>'fecha' LOOP
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM insumos WHERE id = (v_fila->>'insumo_id')::uuid AND tenant_id = p_tenant) THEN
        RAISE EXCEPTION 'insumo % no es del negocio', v_fila->>'insumo_id';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = (v_fila->>'sucursal_id')::uuid AND tenant_id = p_tenant) THEN
        RAISE EXCEPTION 'sucursal % no es del negocio', v_fila->>'sucursal_id';
      END IF;
      IF COALESCE((v_fila->>'cantidad')::numeric, 0) <= 0 THEN
        RAISE EXCEPTION 'cantidad inválida: %', v_fila->>'cantidad';
      END IF;

      v_id := NULL;
      EXECUTE v_sql INTO v_id USING jsonb_build_array(v_fila), p_tenant;
      IF v_id IS NULL THEN CONTINUE; END IF;   -- ya existía: nada que mover

      v_nuevos := v_nuevos || v_id;
      v_n := v_n + 1;
      v_delta := _vim_signo_movimiento((v_fila->>'tipo')::movimiento_inventario_tipo) * (v_fila->>'cantidad')::numeric;

      INSERT INTO insumo_stock_sucursal (tenant_id, insumo_id, sucursal_id, stock_actual, stock_negativo_flag, fecha_ultimo_movimiento)
      VALUES (p_tenant, (v_fila->>'insumo_id')::uuid, (v_fila->>'sucursal_id')::uuid, v_delta, v_delta < 0,
              COALESCE((v_fila->>'fecha')::timestamptz, now()))
      ON CONFLICT (insumo_id, sucursal_id) DO UPDATE
        SET stock_actual = insumo_stock_sucursal.stock_actual + EXCLUDED.stock_actual,
            stock_negativo_flag = (insumo_stock_sucursal.stock_actual + EXCLUDED.stock_actual) < 0,
            fecha_ultimo_movimiento = GREATEST(COALESCE(insumo_stock_sucursal.fecha_ultimo_movimiento, EXCLUDED.fecha_ultimo_movimiento), EXCLUDED.fecha_ultimo_movimiento);
    EXCEPTION WHEN OTHERS THEN
      v_errores := v_errores || jsonb_build_object('tabla', 'movimientos_inventario', 'id', v_fila->>'id', 'error', SQLERRM);
    END;
  END LOOP;

  -- Alertas y agotado una vez por pareja (insumo, sucursal) tocada.
  FOR v_par IN SELECT DISTINCT m.insumo_id, m.sucursal_id FROM movimientos_inventario m WHERE m.id = ANY(v_nuevos) LOOP
    PERFORM evaluar_alertas_stock(v_par.insumo_id, v_par.sucursal_id);
    v_tocados := v_tocados + 1;
  END LOOP;

  RETURN jsonb_build_object('aplicadas', v_n, 'errores', v_errores, 'insumos_tocados', v_tocados);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION _vim_aplicar_movimientos(jsonb, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION _vim_aplicar_movimientos(jsonb, uuid) TO service_role;
COMMENT ON FUNCTION _vim_aplicar_movimientos IS 'Inserta los movimientos nuevos (por id) que manda la caja y aplica su efecto a insumo_stock_sucursal + evaluar_alertas_stock. Corre en modo origin. ADR 0013.';

-- ---------------------------------------------------------------------------
-- 3. PUSH — 0089 + aislamiento (0074) + bitácora (0070) + sello (0073) + movimientos
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_push_snapshot(p_tenant uuid, p_snapshot jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_tabla     text;
  v_res       jsonb := '{}'::jsonb;
  v_det       jsonb;
  v_errores   jsonb := '[]'::jsonb;
  v_ignoradas text[] := ARRAY[]::text[];
  v_ini       timestamptz := clock_timestamp();
  v_total     integer := 0;
  v_aplicadas integer := 0;
  v_caja      uuid;
  v_sucursal  uuid;
  v_disp      text;
  v_desc      text;
  v_min       timestamptz;
  v_max       timestamptz;
  /* Orden por dependencia (ver 0089). `movimientos_inventario` NO va aquí: se aplica al final,
     fuera del modo réplica, porque su efecto (existencias, alertas, agotado) necesita triggers. */
  v_tablas    text[] := ARRAY[
    'turnos', 'tickets', 'ticket_items', 'ticket_item_modificadores', 'pagos', 'movimientos_caja',
    'delivery_asignaciones', 'cortes_parciales', 'cortes_caja', 'cortes_caja_detalle', 'reportes_z_historico'
  ];
BEGIN
  -- Modo réplica: sin triggers ni FK, para conservar folios/totales/estados tal como la caja
  -- los imprimió. Requiere el superusuario dueño de la función (definer).
  SET LOCAL session_replication_role = replica;

  FOREACH v_tabla IN ARRAY v_tablas LOOP
    v_det := _vim_apply_rows_detalle(v_tabla, p_snapshot->v_tabla, p_tenant);
    v_res := v_res || jsonb_build_object(v_tabla, (v_det->>'aplicadas')::integer);
    v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);
  END LOOP;

  -- Inventario: con triggers y FK normales. Es el último paso; no hace falta volver a réplica.
  SET LOCAL session_replication_role = origin;
  v_det := _vim_aplicar_movimientos(p_snapshot->'movimientos_inventario', p_tenant);
  v_res := v_res || jsonb_build_object('movimientos_inventario', (v_det->>'aplicadas')::integer);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);

  -- ── Rastro del envío (0070/0073) ─────────────────────────────────────────
  BEGIN
    SELECT COALESCE(SUM(jsonb_array_length(v)), 0) INTO v_total
      FROM jsonb_each(p_snapshot) AS e(k, v) WHERE jsonb_typeof(v) = 'array';
    SELECT COALESCE(SUM(value::int), 0) INTO v_aplicadas FROM jsonb_each_text(v_res);

    SELECT MIN((t->>'created_at')::timestamptz), MAX((t->>'created_at')::timestamptz)
      INTO v_min, v_max
      FROM jsonb_array_elements(COALESCE(p_snapshot->'tickets', p_snapshot->'turnos', '[]'::jsonb)) AS t;

    -- Caja y sucursal de la primera fila (tickets, turnos o, si solo vienen movimientos, pagos/movimientos).
    SELECT NULLIF(t->>'caja_id', '')::uuid, NULLIF(t->>'sucursal_id', '')::uuid
      INTO v_caja, v_sucursal
      FROM jsonb_array_elements(COALESCE(p_snapshot->'tickets', p_snapshot->'turnos', p_snapshot->'pagos', '[]'::jsonb)) AS t
     LIMIT 1;
    IF v_sucursal IS NULL THEN
      SELECT NULLIF(t->>'sucursal_id', '')::uuid INTO v_sucursal
        FROM jsonb_array_elements(COALESCE(p_snapshot->'movimientos_inventario', '[]'::jsonb)) AS t LIMIT 1;
    END IF;
    IF v_caja IS NULL AND v_sucursal IS NOT NULL THEN
      -- Un lote de puros movimientos no trae caja: se toma la de la sucursal con señal de vida más reciente.
      SELECT id INTO v_caja FROM public.cajas WHERE sucursal_id = v_sucursal AND tenant_id = p_tenant
       ORDER BY ultima_conexion DESC NULLS LAST, created_at LIMIT 1;
    END IF;

    SELECT COALESCE(NULLIF(c.identificador_dispositivo, ''), c.nombre, 'escritorio'),
           NULLIF(TRIM(CONCAT_WS(' · ', c.nombre, s.nombre)), '')
      INTO v_disp, v_desc
      FROM public.cajas c LEFT JOIN public.sucursales s ON s.id = c.sucursal_id
     WHERE c.id = v_caja;

    INSERT INTO public.sync_eventos (
      tenant_id, sucursal_id, caja_id, dispositivo_id, dispositivo_descripcion,
      operaciones_total, operaciones_exitosas, operaciones_error,
      fecha_operacion_min, fecha_operacion_max,
      fecha_procesado_inicio, fecha_procesado_fin, duracion_ms, request_summary, response_summary
    ) VALUES (
      p_tenant, v_sucursal, v_caja, COALESCE(v_disp, 'escritorio'), v_desc,
      v_total, v_aplicadas, jsonb_array_length(v_errores),
      v_min, v_max,
      v_ini, clock_timestamp(),
      GREATEST(EXTRACT(MILLISECONDS FROM clock_timestamp() - v_ini)::integer, 0),
      jsonb_build_object('origen', 'sync_push_snapshot'), v_res
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_push_snapshot: no se pudo registrar el evento: %', SQLERRM;
  END;

  BEGIN
    IF v_caja IS NOT NULL THEN
      UPDATE public.cajas SET ultima_conexion = now() WHERE id = v_caja;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_push_snapshot: no se pudo sellar ultima_conexion: %', SQLERRM;
  END;

  -- Tablas que la caja mandó y aquí no se replican (0089).
  SELECT array_agg(k) INTO v_ignoradas
    FROM jsonb_object_keys(p_snapshot) AS k
   WHERE NOT (k = ANY(v_tablas || ARRAY['movimientos_inventario']));
  IF v_ignoradas IS NOT NULL AND array_length(v_ignoradas, 1) > 0 THEN
    RAISE WARNING 'sync_push_snapshot: el dispositivo mandó tablas que no se replican: %', v_ignoradas;
    v_res := v_res || jsonb_build_object('_ignoradas', to_jsonb(v_ignoradas));
  END IF;

  RETURN v_res || CASE WHEN jsonb_array_length(v_errores) > 0 THEN jsonb_build_object('_errores', v_errores) ELSE '{}'::jsonb END;
END;
$$;
COMMENT ON FUNCTION sync_push_snapshot(uuid, jsonb) IS
  'Replica la rebanada operativa de la caja (modo réplica, aislando filas conflictivas en _errores) y aplica sus movimientos de inventario en modo origin (existencias + alertas). Registra sync_eventos y sella cajas.ultima_conexion. Solo service_role. ADR 0013.';
REVOKE EXECUTE ON FUNCTION sync_push_snapshot(uuid, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION sync_push_snapshot(uuid, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. PULL — 0079 + inventario
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_pull_snapshot(p_tenant uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT jsonb_build_object(
    'tenants',                        coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM tenants x WHERE x.id = p_tenant), '[]'::jsonb),
    'sucursales',                     coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM sucursales x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'cajas',                          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM cajas x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'secciones',                      coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM secciones x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'mesas',                          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM mesas x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'areas_cocina',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM areas_cocina x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'marcas_virtuales',               coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM marcas_virtuales x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'categorias',                     coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM categorias x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'grupos_modificadores',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM grupos_modificadores x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'productos',                      coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM productos x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'opciones_modificador',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM opciones_modificador x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'productos_grupos_modificadores', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM productos_grupos_modificadores x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'subtipos_personal',              coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM subtipos_personal x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'configuracion_tenant',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM configuracion_tenant x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'repartidores',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM repartidores x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- Inventario (ADR 0013): lo que la caja necesita para descontar al vender. Nunca sube de vuelta.
    'unidades_medida',                coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM unidades_medida x WHERE x.tenant_id = p_tenant OR x.tenant_id IS NULL), '[]'::jsonb),
    'insumos',                        coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM insumos x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'insumo_stock_sucursal',          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM insumo_stock_sucursal x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'recetas',                        coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM recetas x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'receta_componentes',             coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM receta_componentes x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'modificador_componentes',        coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM modificador_componentes x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'roles',                          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM roles x WHERE x.tenant_id = p_tenant OR x.tenant_id IS NULL), '[]'::jsonb),
    'rol_permisos',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM rol_permisos x WHERE x.rol_id IN (SELECT id FROM roles WHERE tenant_id = p_tenant OR tenant_id IS NULL)), '[]'::jsonb),
    'permisos',                       coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM permisos x), '[]'::jsonb),
    'usuarios_acceso',                coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM usuarios_acceso x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'usuarios_perfil',                coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM usuarios_perfil x WHERE x.id IN (SELECT usuario_id FROM usuarios_acceso WHERE tenant_id = p_tenant)), '[]'::jsonb),
    'users',                          coalesce((SELECT jsonb_agg(jsonb_build_object(
                                          'id', u.id, 'email', u.email, 'encrypted_password', u.encrypted_password,
                                          'email_confirmed_at', u.email_confirmed_at, 'created_at', u.created_at,
                                          'raw_app_meta_data', u.raw_app_meta_data, 'raw_user_meta_data', u.raw_user_meta_data))
                                        FROM auth.users u
                                        WHERE u.id IN (SELECT usuario_id FROM usuarios_acceso WHERE tenant_id = p_tenant)), '[]'::jsonb),
    '__watermark', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
$$;
REVOKE EXECUTE ON FUNCTION sync_pull_snapshot(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION sync_pull_snapshot(uuid) TO service_role;
```

- [ ] **Step 4: Aplicar y correr los smokes**

Run:
```bash
supabase migration up
docker exec -i supabase_db_vim-pos psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/scripts/smoke_sync_inventario.sql
docker exec -i supabase_db_vim-pos psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/scripts/smoke_sync_push.sql
```
Expected: `SMOKE SYNC INVENTARIO OK` y el smoke del push existente sigue en verde (mismo folio y estado tras el push).

Si el paso 3 del smoke no marca `AGOTADO` en el producto: `evaluar_alertas_stock` solo agota productos cuyo componente es `es_critico = true` y respeta `agotado_manual`; revisa que la receta se guardó con `es_critico: true` y que el producto seed no tenga `agotado_manual = true`.
Si `sync_eventos` no suma 3: los tres pushes deben registrar aunque no traigan tickets (por eso el `COALESCE` toma `pagos` y luego `movimientos_inventario` para hallar sucursal y caja).

- [ ] **Step 5: pgTAP, tipos y commit**

Run: `supabase test db && pnpm db:types`
Expected: PASS (incluye `0003_grants_secdef`, que verifica que las dos RPC no sean ejecutables por `anon`/`authenticated`).

```bash
git add supabase/migrations/0101_sync_inventario.sql supabase/scripts/smoke_sync_inventario.sql packages/db/src/database.types.ts
git commit -m "db: sync de inventario — pull con insumos/existencias/recetas, push con movimientos y aislamiento restaurado (0101, ADR 0013)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Escritorio — pull con inventario y corrección por pendientes

**Files:**
- Modify: `desktop/src/sync-pull.mjs` (`PULL_ORDER` líneas 10-32, `CLAVES_NATURALES` ~96-100, `pullSnapshot` ~129-155)
- Create: `desktop/src/sync-pull.test.mjs`
- Modify: `desktop/src/verify-sync.mjs`

**Interfaces:**
- Consumes: el snapshot de la Task 1 (claves `unidades_medida, insumos, insumo_stock_sucursal, recetas, receta_componentes, modificador_componentes`); la tabla local `_vim_mov_ok (movimiento_id uuid PRIMARY KEY)` que crea la Task 3 (aquí se crea con `CREATE TABLE IF NOT EXISTS` también, para que el pull no dependa del orden de arranque).
- Produces: `export function deltaPendiente(movimientos): Map<string, number>` (clave `${insumo_id}|${sucursal_id}`, valor = Σ signo × cantidad de los movimientos pendientes; negativo para salidas); `export const SIGNO_MOVIMIENTO: Record<string, 1 | -1>`; `export async function corregirExistenciasPorPendientes(client)`.

- [ ] **Step 1: Escribir la prueba de `deltaPendiente` (debe fallar)**

`desktop/src/sync-pull.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { deltaPendiente, SIGNO_MOVIMIENTO } from "./sync-pull.mjs";

const I = "11111111-1111-1111-1111-111111111111";
const S = "22222222-2222-2222-2222-222222222222";

test("deltaPendiente suma con signo por (insumo, sucursal)", () => {
  const d = deltaPendiente([
    { insumo_id: I, sucursal_id: S, tipo: "SALIDA_VENTA", cantidad: "3.000" },
    { insumo_id: I, sucursal_id: S, tipo: "SALIDA_MODIFICADOR_EXTRA", cantidad: 2 },
    { insumo_id: I, sucursal_id: S, tipo: "REVERSA_CANCELACION", cantidad: 1 },
  ]);
  assert.equal(d.get(`${I}|${S}`), -4);
});

test("deltaPendiente separa sucursales y devuelve vacío sin movimientos", () => {
  const S2 = "33333333-3333-3333-3333-333333333333";
  const d = deltaPendiente([
    { insumo_id: I, sucursal_id: S, tipo: "SALIDA_VENTA", cantidad: 1 },
    { insumo_id: I, sucursal_id: S2, tipo: "AJUSTE_POSITIVO", cantidad: 5 },
  ]);
  assert.equal(d.get(`${I}|${S}`), -1);
  assert.equal(d.get(`${I}|${S2}`), 5);
  assert.equal(deltaPendiente([]).size, 0);
});

test("SIGNO_MOVIMIENTO cubre los diez tipos del enum", () => {
  assert.deepEqual(Object.keys(SIGNO_MOVIMIENTO).sort(), [
    "AJUSTE_NEGATIVO", "AJUSTE_POSITIVO", "DEVOLUCION_PROVEEDOR", "ENTRADA_COMPRA", "MERMA",
    "REVERSA_CANCELACION", "SALIDA_MODIFICADOR_EXTRA", "SALIDA_VENTA", "TRANSFERENCIA_ENTRADA", "TRANSFERENCIA_SALIDA",
  ]);
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `node --test desktop/src/sync-pull.test.mjs` (desde la raíz)
Expected: FAIL, `deltaPendiente` no exportado.

- [ ] **Step 3: Implementar en `sync-pull.mjs`**

Reemplazar `PULL_ORDER` por:

```js
export const PULL_ORDER = [
  { t: "tenants" },
  { t: "sucursales" },
  { t: "cajas" },
  { t: "areas_cocina" },
  { t: "secciones" },
  { t: "mesas" },
  { t: "marcas_virtuales" },
  { t: "categorias" },
  { t: "grupos_modificadores" },
  { t: "productos" },
  { t: "opciones_modificador" },
  { t: "productos_grupos_modificadores" },
  { t: "subtipos_personal" },
  { t: "configuracion_tenant" },
  // Inventario (ADR 0013): unidades antes que insumos; existencias, recetas y componentes después.
  // La caja lo necesita para descontar al vender; los movimientos que genera suben por el push.
  { t: "unidades_medida" },
  { t: "insumos" },
  { t: "insumo_stock_sucursal" },
  { t: "recetas" },
  { t: "receta_componentes" },
  { t: "modificador_componentes" },
  { t: "repartidores" },
  { t: "permisos" },
  { t: "roles" },
  { t: "rol_permisos" },
  { t: "users", schema: "auth" },
  { t: "usuarios_perfil" },
  { t: "usuarios_acceso" },
];
```

En `CLAVES_NATURALES` agregar:

```js
  // Una venta local puede crear la fila de existencias (aplicar_movimiento_inventario la inserta si
  // no existe) con un id distinto al de la nube. Los movimientos no apuntan a esta fila, así que
  // borrar la local y dejar entrar la de la nube es seguro.
  insumo_stock_sucursal: { claves: ["insumo_id", "sucursal_id"], dependientes: [] },
```

Agregar antes de `pullSnapshot`:

```js
/** Signo de cada tipo de movimiento (misma tabla que aplicar_movimiento_inventario, 0007 §9.3). */
export const SIGNO_MOVIMIENTO = {
  ENTRADA_COMPRA: 1, REVERSA_CANCELACION: 1, AJUSTE_POSITIVO: 1, TRANSFERENCIA_ENTRADA: 1,
  SALIDA_VENTA: -1, SALIDA_MODIFICADOR_EXTRA: -1, MERMA: -1, AJUSTE_NEGATIVO: -1,
  TRANSFERENCIA_SALIDA: -1, DEVOLUCION_PROVEEDOR: -1,
};

/**
 * Lo que la nube todavía NO sabe: suma con signo de los movimientos locales pendientes de subir,
 * por (insumo, sucursal). Una salida pendiente de 3 da -3: la existencia bajada de la nube debe
 * quedar en nube + (-3). Puro, sin base de datos, para poder probarlo.
 */
export function deltaPendiente(movimientos) {
  const acumulado = new Map();
  for (const m of movimientos ?? []) {
    const signo = SIGNO_MOVIMIENTO[m.tipo] ?? 0;
    const clave = `${m.insumo_id}|${m.sucursal_id}`;
    acumulado.set(clave, (acumulado.get(clave) ?? 0) + signo * Number(m.cantidad));
  }
  return acumulado;
}

/**
 * Después de bajar `insumo_stock_sucursal` (la nube manda), resta lo que la caja vendió y aún no
 * subió. Sin esto, un pull entre dos pushes "devolvería" existencias ya vendidas.
 */
export async function corregirExistenciasPorPendientes(client, log = () => {}) {
  await client.query("CREATE TABLE IF NOT EXISTS _vim_mov_ok (movimiento_id uuid PRIMARY KEY, subido_at timestamptz DEFAULT now())");
  const { rows } = await client.query(`
    SELECT m.insumo_id, m.sucursal_id, m.tipo, m.cantidad
      FROM movimientos_inventario m
      LEFT JOIN _vim_mov_ok ok ON ok.movimiento_id = m.id
     WHERE ok.movimiento_id IS NULL`);
  const deltas = deltaPendiente(rows);
  let n = 0;
  for (const [clave, delta] of deltas) {
    if (!delta) continue;
    const [insumoId, sucursalId] = clave.split("|");
    const r = await client.query(
      `UPDATE insumo_stock_sucursal
          SET stock_actual = stock_actual + $3, stock_negativo_flag = (stock_actual + $3) < 0
        WHERE insumo_id = $1 AND sucursal_id = $2`, [insumoId, sucursalId, delta]);
    n += r.rowCount;
  }
  if (n) log(`  insumo_stock_sucursal: ${n} existencia(s) corregida(s) por movimientos pendientes`);
  return n;
}
```

En `pullSnapshot`, dentro del `for` de `PULL_ORDER`, justo después de `resumen[t] = n; if (n) log(...)`, agregar:

```js
      if (t === "insumo_stock_sucursal") await corregirExistenciasPorPendientes(client, log);
```

(sigue dentro de la transacción y con `session_replication_role = replica`, como el resto del pull).

- [ ] **Step 4: Correr la prueba**

Run: `node --test desktop/src/sync-pull.test.mjs`
Expected: 3 pruebas en verde.

- [ ] **Step 5: Extender `verify-sync.mjs`**

Después del bloque "Idempotencia" y antes del "Camino de PRODUCCIÓN real", agregar:

```js
  // ── Inventario (ADR 0013): baja insumo/existencia/receta, corrige por pendientes y descuenta al vender ──
  const pza = (await q("SELECT id FROM unidades_medida WHERE tenant_id=$1 AND codigo='PZA' LIMIT 1", [tenant]))[0]?.id;
  if (!pza) throw new Error("la base local no tiene unidades (¿seed sin sembrar_unidades_base?)");
  const INS = "cccccccc-1111-2222-3333-444444444444";
  const STOCK = "dddddddd-1111-2222-3333-444444444444";
  const REC = "eeeeeeee-1111-2222-3333-444444444444";
  await q("UPDATE configuracion_tenant SET modulo_inventario_activo = true WHERE tenant_id=$1", [tenant]);
  await q("DELETE FROM _vim_mov_ok").catch(() => {});
  await q("DELETE FROM movimientos_inventario WHERE insumo_id=$1", [INS]);
  // Un movimiento local PENDIENTE (salida de 3) que la nube aún no tiene.
  await pullSnapshot(pool, {
    __watermark: "sim-inv-0",
    unidades_medida: (await q("SELECT * FROM unidades_medida WHERE tenant_id=$1", [tenant])),
    insumos: [{ id: INS, tenant_id: tenant, nombre: "Pan verify", unidad_medida_id: pza, categoria: "PANIFICACION", costo_unitario_mxn: 4,
      metodo_valuacion: "PROMEDIO_PONDERADO", estado: "ACTIVO", stock_minimo_global: 2, stock_critico_global: 1, created_at: new Date(), updated_at: new Date() }],
  }, () => {});
  await q(`INSERT INTO movimientos_inventario (tenant_id, sucursal_id, insumo_id, tipo, cantidad, costo_unitario_mxn, stock_antes, stock_despues, fecha, dia_contable)
           VALUES ($1,$2,$3,'SALIDA_VENTA',3,4,10,7,now(),CURRENT_DATE)`, [tenant, suc, INS]);
  // La nube dice 10; la caja debe quedar en 7.
  await pullSnapshot(pool, {
    __watermark: "sim-inv-1",
    insumo_stock_sucursal: [{ id: STOCK, tenant_id: tenant, insumo_id: INS, sucursal_id: suc, stock_actual: 10, stock_negativo_flag: false, created_at: new Date(), updated_at: new Date() }],
    recetas: [{ id: REC, tenant_id: tenant, producto_id: clasica.id, version: 1, costo_total_mxn: 4, activa: true, created_at: new Date(), updated_at: new Date() }],
    receta_componentes: [{ id: "ffffffff-1111-2222-3333-444444444444", tenant_id: tenant, receta_id: REC, insumo_id: INS, cantidad: 1, es_critico: true, orden_visualizacion: 0, created_at: new Date(), updated_at: new Date() }],
  }, (m) => console.log(m));
  const stock7 = Number((await q("SELECT stock_actual FROM insumo_stock_sucursal WHERE insumo_id=$1 AND sucursal_id=$2", [INS, suc]))[0].stock_actual);
  if (stock7 !== 7) throw new Error(`existencia corregida esperada 7, es ${stock7}`);
  console.log(`· existencia bajada 10 − 3 pendientes → ${stock7} (corrección por pendientes OK)`);

  // Vender 1 "Hamburguesa Clásica" en la caja: el trigger local descuenta 1 pza.
  const turno = (await q("SELECT id FROM turnos WHERE caja_id=$1 AND estado='ABIERTO' LIMIT 1", [CAJA]))[0]?.id
    ?? (await q(`INSERT INTO turnos(tenant_id,sucursal_id,caja_id,codigo_turno,dia_contable,usuario_apertura_id,fondo_inicial_mxn,fondo_modo)
                 VALUES ($1,$2,$3,'VERIFY-INV',CURRENT_DATE,$4,0,'TOTAL') RETURNING id`, [tenant, suc, CAJA, perfilMaria.id]))[0].id;
  const ticket = (await q("SELECT abrir_ticket($1,$2,$3,'PARA_LLEVAR'::modo_servicio,NULL,NULL,'verify-inv-1',$4) AS id", [suc, CAJA, turno, perfilMaria.id]))[0].id;
  await q("SELECT agregar_item_a_ticket($1,$2,1,NULL,'[]'::jsonb,'verify-inv-item')", [ticket, clasica.id]);
  const total = (await q("SELECT total_mxn FROM tickets WHERE id=$1", [ticket]))[0].total_mxn;
  await q("SELECT aplicar_pago($1,'EFECTIVO'::metodo_pago,$2,$2,NULL,NULL,NULL,false,NULL,'verify-inv-pago')", [ticket, total]);
  const stock6 = Number((await q("SELECT stock_actual FROM insumo_stock_sucursal WHERE insumo_id=$1 AND sucursal_id=$2", [INS, suc]))[0].stock_actual);
  const movs = (await q("SELECT count(*)::int AS n FROM movimientos_inventario WHERE insumo_id=$1 AND ticket_id=$2 AND tipo='SALIDA_VENTA'", [INS, ticket]))[0].n;
  if (stock6 !== 6 || movs !== 1) throw new Error(`la venta local no descontó: existencia ${stock6}, movimientos ${movs}`);
  console.log(`· venta local con receta → existencia ${stock6}, 1 movimiento SALIDA_VENTA ligado al ticket (descuento local OK)`);
```

Ajustar el mensaje final para mencionar inventario. Las filas completas de `insumos`/`insumo_stock_sucursal`/`recetas`/`receta_componentes` deben traer todas las columnas `NOT NULL` del esquema (por eso llevan `created_at`, `updated_at`, `metodo_valuacion`, `estado`, `version`, `orden_visualizacion`); si el `INSERT` reclama otra columna, agregarla con su valor por defecto.

- [ ] **Step 6: Correr la verificación**

Run: `cd desktop && npm run verify:sync`
Expected: termina con `✅ SYNC PULL OK` y las dos líneas nuevas ("corrección por pendientes OK", "descuento local OK"). Requiere que la base embebida de desarrollo tenga las migraciones hasta 0101 (se aplican solas al arrancar `startBackend`).

- [ ] **Step 7: Commit**

```bash
git add desktop/src/sync-pull.mjs desktop/src/sync-pull.test.mjs desktop/src/verify-sync.mjs
git commit -m "escritorio: el pull baja inventario y corrige existencias por movimientos pendientes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Escritorio — push de movimientos con `_vim_mov_ok`

**Files:**
- Modify: `desktop/src/sync-push.mjs` (`asegurarTabla` ~52-57, `listarPendientes` ~121-137, `construirSnapshotPush` ~170-218, `marcarPushed` ~221, `rechazadosPorTicket` ~251-273, `enviarLote` ~283-323, `pushToCloud` ~334-376)
- Modify: `desktop/src/verify-push.mjs`

**Interfaces:**
- Consumes: RPC `sync_push_snapshot` de la Task 1 (acepta `movimientos_inventario`, devuelve `_errores` con `tabla`).
- Produces: `listarPendientes(pool)` devuelve además `movimientoIds: string[]`; `construirSnapshotPush(pool, { ticketIds, turnoIds, movimientoIds })` incluye la clave `movimientos_inventario` y devuelve `movimientos: string[]`; `marcarMovimientosPushed(pool, ids)`; `pushToCloud` devuelve además `movimientos: number`.

- [ ] **Step 1: Tabla local y pendientes**

En `asegurarTabla`, después de `_vim_turnos_ok`:

```js
  // Movimientos de inventario: la caja los genera al vender (y al cancelar/devolver) y NUNCA los
  // baja del pull, así que todo lo que hay en la tabla local es de origen local. Se marcan por id
  // en cuanto la nube confirma; la nube es idempotente por id, así que reenviar no descuenta doble.
  await pool.query("CREATE TABLE IF NOT EXISTS _vim_mov_ok (movimiento_id uuid PRIMARY KEY, subido_at timestamptz DEFAULT now())");
```

En `listarPendientes`, agregar al `SELECT` una tercera columna y devolverla:

```sql
      -- Movimientos de inventario aún no confirmados por la nube, en orden de fecha.
      (SELECT array_agg(m.id ORDER BY m.fecha)
         FROM movimientos_inventario m
         LEFT JOIN _vim_mov_ok ok ON ok.movimiento_id = m.id
        WHERE ok.movimiento_id IS NULL) AS movimientos
```

y `return { ids: rows[0].ids ?? [], turnosCambiados: rows[0].turnos ?? [], movimientoIds: rows[0].movimientos ?? [] };`

- [ ] **Step 2: Snapshot con movimientos**

`construirSnapshotPush(pool, { ticketIds = null, turnoIds = null, movimientoIds = null } = {})`. Agregar el parámetro `$4` y, en el `jsonb_build_object`, después de `reportes_z_historico`:

```sql
        -- Inventario (ADR 0013): con lista, exactamente esos; sin lista (modo completo), todos los
        -- pendientes. Solo columnas reales: costo_total_mxn es generada y la nube la ignora igual.
        'movimientos_inventario',    (SELECT jsonb_agg(to_jsonb(x) - 'costo_total_mxn' ORDER BY x.fecha) FROM movimientos_inventario x
                                        WHERE ($4::uuid[] IS NOT NULL AND x.id = ANY($4::uuid[]))
                                           OR ($4::uuid[] IS NULL AND $2::uuid[] IS NULL
                                               AND x.id NOT IN (SELECT movimiento_id FROM _vim_mov_ok)))
```

Agregar al `SELECT` externo `(SELECT array_agg(id) FROM movimientos_inventario x WHERE ($4::uuid[] IS NOT NULL AND x.id = ANY($4::uuid[])) OR ($4::uuid[] IS NULL AND $2::uuid[] IS NULL AND x.id NOT IN (SELECT movimiento_id FROM _vim_mov_ok))) AS movimientos,` y pasar `[TERMINALES, ticketIds, turnoIds, movimientoIds]`. Devolver `movimientos: rows[0].movimientos ?? []`.

Agregar después de `marcarPushed`:

```js
/** Marca movimientos de inventario confirmados por la nube. */
export async function marcarMovimientosPushed(pool, ids) {
  if (!ids?.length) return;
  await pool.query(
    "INSERT INTO _vim_mov_ok(movimiento_id) SELECT unnest($1::uuid[]) ON CONFLICT (movimiento_id) DO NOTHING", [ids]);
}
```

- [ ] **Step 3: Rechazados y envío**

En `rechazadosPorTicket`, antes del `else` final, agregar una rama para que un movimiento rechazado no retenga tickets:

```js
    } else if (e.tabla === "movimientos_inventario") {
      // Un movimiento rechazado se reintenta solo (ver movimientosRechazados); no invalida la venta.
      continue;
```

Agregar la función:

```js
/** Ids de movimientos de inventario que la nube rechazó: no se marcan y se reintentan. */
function movimientosRechazados(errores) {
  return new Set((errores ?? []).filter((e) => e?.tabla === "movimientos_inventario" && e.id).map((e) => e.id));
}
```

En `enviarLote`, la firma pasa a `{ ticketIds, turnoIds, movimientoIds = [], maxBytes }`; `construirSnapshotPush(pool, { ticketIds, turnoIds, movimientoIds })`; al partir, los movimientos van con la primera mitad (`movimientoIds`) y la segunda lleva `movimientoIds: []`, igual que los turnos forzados; tras la respuesta:

```js
  const movFuera = movimientosRechazados(errores);
  await marcarMovimientosPushed(pool, movimientos.filter((id) => !movFuera.has(id)));
```

y el retorno agrega `movimientos: movimientos.length - movFuera.size` (también sumado en `partir`).

En `pushToCloud`: `const { ids, turnosCambiados, movimientoIds } = await listarPendientes(pool);`; la condición de "nada pendiente" incluye `!movimientoIds.length`; `parte` agrega `${movimientoIds.length} movimiento(s) de inventario`; los movimientos viajan pegados al primer lote (`movimientoIds: n === 0 ? movimientoIds : []`), como los turnos cambiados; se acumula `movimientos` en el resultado y en el `log` final. Si no hay ventas ni turnos pero sí movimientos, `lotes = [[]]` como hoy.

- [ ] **Step 4: Extender `verify-push.mjs`**

Cambiar el import a `import { construirSnapshotPush, marcarPushed, listarPendientes, marcarMovimientosPushed } from "./sync-push.mjs";`. Después de limpiar `_vim_push_ok`, agregar `await pool.query("CREATE TABLE IF NOT EXISTS _vim_mov_ok (movimiento_id uuid PRIMARY KEY, subido_at timestamptz DEFAULT now())"); await pool.query("TRUNCATE _vim_mov_ok");`. Tras aplicar la RPC, agregar:

```js
  // Inventario (ADR 0013): los movimientos locales pendientes viajan y se marcan.
  const { movimientoIds } = await listarPendientes(pool);
  console.log(`· movimientos de inventario pendientes: ${movimientoIds.length}`);
  if (movimientoIds.length) {
    if (!snapshot.movimientos_inventario?.length) throw new Error("el snapshot no incluye movimientos_inventario");
    if ((res.movimientos_inventario ?? 0) !== 0) throw new Error("la RPC aplicó sobre la propia caja movimientos que ya existían: debía ser 0 (idempotencia por id)");
    await marcarMovimientosPushed(pool, movimientoIds);
    const otra = await listarPendientes(pool);
    if (otra.movimientoIds.length !== 0) throw new Error("_vim_mov_ok no evitó re-subir movimientos");
    console.log("· _vim_mov_ok evita re-subir movimientos (OK)");
  }
```

(Los movimientos existen en la caja de desarrollo porque `verify:sync` dejó una venta con receta; si no hay, el bloque se salta con el aviso de 0 pendientes.)

- [ ] **Step 5: Correr verificaciones**

Run (desde `desktop/`): `npm run verify:push && npm run verify:push-aislado && npm run verify:push-lotes`
Expected: los tres terminan sin `FALLA`; `verify:push` imprime la línea de `_vim_mov_ok`.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/sync-push.mjs desktop/src/verify-push.mjs
git commit -m "escritorio: el push sube movimientos de inventario y los marca en _vim_mov_ok

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Ciclo — push antes que pull

**Files:**
- Modify: `desktop/src/main.mjs:512-568` (`syncBestEffort`)
- Modify: `desktop/src/verify-sync-ciclo.mjs` (solo si asume el orden; hoy solo mira `conPull`)

**Interfaces:**
- Consumes: `pullFromCloud`, `pushToCloud`.
- Produces: el mismo `syncBestEffort({ conPull })`, con el push ejecutado antes del pull.

- [ ] **Step 1: Reordenar**

En `syncBestEffort`, mover el bloque `if (conPull) { … pullFromCloud … }` para que quede **después** del `try { … pushToCloud … }` y **antes** del `return true`, conservando su propio `try/catch` (un pull fallido sigue sin contar como fallo del ciclo). Dejar el comentario:

```js
    // PULL después del PUSH (ADR 0013): el agotado automático lo decide la nube al recibir los
    // movimientos; si el catálogo bajara antes, traería el estado viejo y lo pisaría hasta el
    // siguiente ciclo. La corrección por pendientes del pull protege las existencias si el push falló.
```

Como el `return true` del push ocurre dentro del `try`, reestructurar: guardar `let pushOk = false;` y hacer el pull tras el bloque del push cuando `conPull`, tanto si `pushOk` como si no; devolver `pushOk`.

- [ ] **Step 2: Verificar el ciclo**

Run (desde `desktop/`): `npm run verify:sync-ciclo`
Expected: sin cambios (la política de cuándo toca pull no cambió). Si alguna aserción del script asume el orden, actualizarla y decirlo en el reporte.

- [ ] **Step 3: Commit**

```bash
git add desktop/src/main.mjs desktop/src/verify-sync-ciclo.mjs
git commit -m "escritorio: el ciclo hace push antes que pull para que la nube decida el agotado

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Arranque limpio con todas las migraciones (0098 y el shim de Storage)

**Files:**
- Create: `desktop/src/verify-migraciones.mjs`
- Modify: `desktop/package.json` (script `verify:migraciones`)
- Modify (solo si falla): `desktop/sql/00-compat-shim.sql`

**Interfaces:**
- Consumes: `startBackend` de `desktop/src/backend.mjs` (aplica el shim y las migraciones que faltan al arrancar; honra `VIM_DATA_DIR`).
- Produces: la certeza de que un instalador nuevo arranca desde cero y desde 0096.

- [ ] **Step 1: Script**

`desktop/src/verify-migraciones.mjs`:

```js
// Un instalador nuevo debe arrancar (a) desde cero y (b) desde una caja que se quedó en una
// migración vieja, aplicando solas las que faltan. Aquí se prueba (a) con un directorio de datos
// temporal: si una migración no entra en el Postgres embebido (por ejemplo, 0098 usa
// storage.buckets y depende del shim), esto lo dice antes de publicar.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const esperadas = readdirSync(path.join(raiz, "supabase", "migrations")).filter((f) => f.endsWith(".sql")).sort();
const dir = mkdtempSync(path.join(tmpdir(), "vim-mig-"));
process.env.VIM_DATA_DIR = dir;
process.env.VIM_PG_PORT = process.env.VIM_PG_PORT ?? "54398";
let backend;
try {
  const { startBackend } = await import("./backend.mjs");
  backend = await startBackend({ log: () => {} });
  const { rows } = await backend.pool.query("SELECT nombre FROM _vim_migraciones ORDER BY nombre");
  const aplicadas = rows.map((r) => r.nombre);
  const faltan = esperadas.filter((m) => !aplicadas.includes(m));
  if (faltan.length) throw new Error(`no se aplicaron: ${faltan.join(", ")}`);
  const ultima = aplicadas[aplicadas.length - 1];
  const fn = (await backend.pool.query("SELECT count(*)::int AS n FROM pg_proc WHERE proname IN ('sync_pull_snapshot','sync_push_snapshot','_vim_aplicar_movimientos','guardar_receta','registrar_compra')")).rows[0].n;
  if (fn !== 5) throw new Error(`faltan funciones (esperaba 5, hay ${fn})`);
  console.log(`✅ MIGRACIONES OK — ${aplicadas.length} aplicadas desde cero, última ${ultima}`);
} catch (e) {
  console.error("❌ MIGRACIONES FALLÓ:", e.message);
  process.exitCode = 1;
} finally {
  if (backend) await backend.stop();
  rmSync(dir, { recursive: true, force: true });
}
```

Si `backend.mjs`/`runtime.mjs` no leen `VIM_PG_PORT`, revisar cómo eligen el puerto (grep `port` en `runtime.mjs`) y usar la variable que exista; el objetivo es no chocar con la base de desarrollo en 54329.

En `desktop/package.json`, agregar `"verify:migraciones": "node src/verify-migraciones.mjs"`.

- [ ] **Step 2: Correr**

Run (desde `desktop/`): `npm run verify:migraciones`
Expected: `✅ MIGRACIONES OK — 101 aplicadas desde cero, última 0101_sync_inventario.sql`.

Si falla en `0098_cfdi_archivo_y_fechas.sql` con `relation "storage.buckets" does not exist` (o similar), agregar al final de `desktop/sql/00-compat-shim.sql` lo mínimo que 0098 toca (leer la migración para copiar exactamente las columnas que usa), por ejemplo:

```sql
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY, name text NOT NULL, public boolean DEFAULT false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), metadata jsonb);
```

y volver a correr. Anotar en el reporte qué hizo falta.

- [ ] **Step 3: Commit**

```bash
git add desktop/src/verify-migraciones.mjs desktop/package.json desktop/sql/00-compat-shim.sql
git commit -m "escritorio: verificación de arranque limpio con todas las migraciones

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

(omitir el shim del `git add` si no cambió).

---

### Task 6: Panel — interruptor "Descontar inventario al vender"

**Files:**
- Modify: `apps/admin/app/lib/inventario.ts` (agregar dos funciones al final)
- Modify: `apps/admin/app/(panel)/inventario/page.tsx` (cabecera y estado)

**Interfaces:**
- Consumes: `configuracion_tenant.modulo_inventario_activo` (0003; política `config_tenant` permite `UPDATE` al negocio); `listarRecetasResumen` de `../../lib/recetas` para contar productos sin receta.
- Produces: `leerModuloInventario(): Promise<boolean>`, `activarModuloInventario(activo: boolean): Promise<void>`.

- [ ] **Step 1: Lib**

Al final de `apps/admin/app/lib/inventario.ts`:

```ts
/** ¿Las ventas descuentan inventario? (configuracion_tenant.modulo_inventario_activo, ADR 0013). */
export async function leerModuloInventario(): Promise<boolean> {
  const tid = await tenantId();
  const { data, error } = await supabase.from("configuracion_tenant").select("modulo_inventario_activo").eq("tenant_id", tid).maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean((data as { modulo_inventario_activo?: boolean } | null)?.modulo_inventario_activo);
}

/** Enciende o apaga el descuento automático. Apagarlo no revierte nada: solo deja de descontar. */
export async function activarModuloInventario(activo: boolean): Promise<void> {
  const tid = await tenantId();
  const { error } = await supabase.from("configuracion_tenant").update({ modulo_inventario_activo: activo }).eq("tenant_id", tid);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Página**

En `apps/admin/app/(panel)/inventario/page.tsx`:

- Importar `leerModuloInventario, activarModuloInventario` desde `../../lib/inventario` y `listarRecetasResumen` desde `../../lib/recetas`.
- Estado: `const [descuenta, setDescuenta] = useState<boolean | null>(null); const [sinReceta, setSinReceta] = useState(0); const [cambiando, setCambiando] = useState(false);`
- En el `useEffect` inicial: `leerModuloInventario().then(setDescuenta).catch(() => setDescuenta(false)); listarRecetasResumen().then((r) => setSinReceta(r.filter((x) => x.activa === null).length)).catch(() => {});`
- Función:

```tsx
  async function cambiarDescuento(activo: boolean) {
    if (!activo && !confirm("Las ventas dejarán de descontar inventario. Las existencias no cambian. ¿Apagar?")) return;
    setCambiando(true);
    setError(null);
    try {
      await activarModuloInventario(activo);
      setDescuenta(activo);
      setOkMsg(activo ? "Descuento automático encendido." : "Descuento automático apagado.");
      setTimeout(() => setOkMsg(null), 2500);
    } catch (e) {
      setError(mensajeError(e, "No se pudo cambiar el descuento automático"));
    } finally {
      setCambiando(false);
    }
  }
```

- Debajo del `<PageHeader …/>` y antes de los KPIs, un bloque:

```tsx
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4">
          <div className="grid gap-1">
            <div className="flex items-center gap-3">
              <button
                type="button" role="switch" aria-checked={!!descuenta} disabled={descuenta === null || cambiando}
                onClick={() => cambiarDescuento(!descuenta)}
                className={`relative h-6 w-11 rounded-full transition-colors ${descuenta ? "bg-accent" : "bg-line-strong"} disabled:opacity-50`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${descuenta ? "left-[22px]" : "left-0.5"}`} />
              </button>
              <span className="text-sm font-semibold">Descontar inventario al vender {descuenta === null ? "" : descuenta ? "· Encendido" : "· Apagado"}</span>
            </div>
            <p className="text-[12.5px] text-ink-2">Cuando está encendido, cada venta descuenta los insumos de la receta del producto. Los productos sin receta se venden sin descontar.</p>
          </div>
          {sinReceta > 0 && (
            <Link href="/catalogo/recetas?sin=1" className="text-sm font-medium text-warning underline-offset-2 hover:underline">
              {sinReceta} producto{sinReceta === 1 ? "" : "s"} sin receta
            </Link>
          )}
        </div>
```

(`Link` de `next/link` ya se importó en la Task 12 del ciclo anterior para los enlaces de Compras y Proveedores.)

- En `apps/admin/app/(panel)/catalogo/recetas/page.tsx`, leer el parámetro `sin` con `useSearchParams` de `next/navigation` para inicializar `soloSin`: `const params = useSearchParams(); const [soloSin, setSoloSin] = useState(params.get("sin") === "1");` (envolver el uso de `useSearchParams` según la convención del proyecto si Next exige `Suspense`; si `typecheck` o el dev server lo piden, envolver el contenido de la página en `<Suspense fallback={null}>`).

- [ ] **Step 3: Verificar**

Run: `pnpm --filter ./apps/admin typecheck`; en el navegador (`/inventario`): el interruptor aparece apagado; al encenderlo muestra el toast y `select modulo_inventario_activo from configuracion_tenant` en la base local pasa a `true`; al apagarlo pide confirmación; el enlace "N productos sin receta" abre la lista filtrada.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/app/lib/inventario.ts "apps/admin/app/(panel)/inventario/page.tsx" "apps/admin/app/(panel)/catalogo/recetas/page.tsx"
git commit -m "admin: interruptor para descontar inventario al vender

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Punta a punta local, despliegue y publicación del instalador 0.4.57

**Files:**
- Modify: `desktop/package.json` (`version` → `0.4.57`)
- Modify: `docs/producto/backlog.md` (cierre del pendiente de sync)
- Sin cambios de código en la nube más allá de aplicar 0101.

**Interfaces:**
- Consumes: todo lo anterior; `desktop/RUNBOOK.md` §"Publicar una versión nueva"; memoria "Publicar latest.json" (subir con PUT + apikey).
- Produces: migración 0101 en producción, admin desplegado, release `v0.4.57` en GitHub y `latest.json` publicado.

- [ ] **Step 1: Punta a punta en local**

Con Supabase local y la caja de desarrollo (`cd desktop && npm run dev` o el `verify` que arranca `startBackend`), contra la base embebida de desarrollo:

1. En el panel local: encender el interruptor; en Inventario dar de alta "Carne" (g, costo 0.18) con existencia 1000 (movimiento Ajuste + de 1000); en Recetas, "Hamburguesa Clásica" = 150 g de carne.
2. Simular el pull real: `cd desktop && node -e "import('./src/sync-pull.mjs').then(async m => { const b = await (await import('./src/backend.mjs')).startBackend({log:()=>{}}); /* snapshot desde Supabase local */ })"` no es necesario: correr `npm run verify:sync` ya cubre pull + descuento local. Para el flujo real, usar `npm run verify:cloud` si hay credenciales de dispositivo contra Supabase local; si no, dejar constancia de que el flujo real se valida en producción con Knock-Out en el paso 5.
3. Verificar en la base embebida: `SELECT stock_actual FROM insumo_stock_sucursal …` bajó 150 tras la venta; `SELECT count(*) FROM movimientos_inventario WHERE ticket_id = …` = 1.

- [ ] **Step 2: Suite completa**

Run, en orden:
```bash
supabase test db
docker exec -i supabase_db_vim-pos psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/scripts/smoke_sync_inventario.sql
docker exec -i supabase_db_vim-pos psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/scripts/smoke_sync_push.sql
docker exec -i supabase_db_vim-pos psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/scripts/smoke_recetas.sql
docker exec -i supabase_db_vim-pos psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/scripts/smoke_compras.sql
pnpm test:escritorio
cd desktop && npm run verify:sync && npm run verify:push && npm run verify:push-aislado && npm run verify:push-lotes && npm run verify:sync-ciclo && npm run verify:migraciones && cd ..
pnpm --filter ./apps/admin test && pnpm --filter ./apps/admin typecheck
```
Expected: todo en verde.

- [ ] **Step 3: Versión y backlog**

`desktop/package.json`: `"version": "0.4.57"`. En `docs/producto/backlog.md` §6, marcar el sync de inventario con la caja como hecho (ADR 0013, plan `docs/superpowers/plans/2026-09-04-sync-inventario-caja.md`); quedan P-149 y P-150.

```bash
git add desktop/package.json docs/producto/backlog.md
git commit -m "escritorio: versión 0.4.57 (inventario sincronizado con la caja); backlog al día

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 4: Despliegue de nube y admin**

Este paso lo ejecuta el controlador (toca producción):
```bash
supabase db push --dry-run     # debe listar solo 0101
supabase db push --yes
git checkout main && git merge <rama> && git push origin main   # Vercel despliega el admin
```
Comprobar `https://admin.vimpos.com.mx/inventario` responde 200.

- [ ] **Step 5: Instalador**

Desde `desktop/`, siguiendo el RUNBOOK:
```bash
npm run dist                                   # > 10 min; en segundo plano; comprobar la FECHA de dist/VIM POS Setup 0.4.57.exe
gh release create v0.4.57 "dist/VIM POS Setup 0.4.57.exe" --title "VIM POS 0.4.57" --notes "Inventario: la caja descuenta al vender y sube los movimientos; el panel enciende el descuento desde Inventario."
gh release view v0.4.57 --json assets -q '.assets[].url'      # URL real (GitHub cambia espacios por puntos)
VIM_UPDATE_URL="<URL real>" npm run release-manifest -- "Inventario sincronizado con la caja"
```
Comparar el tamaño que reporta GitHub con el del `.exe` local; luego subir `dist/latest.json` al bucket `actualizaciones` con `PUT` y cabecera `apikey`/`Authorization` del service_role (el controlador pide la clave a Fermín; no se guarda). Confirmar el feed con `?v=<timestamp>` porque la caché de borde tarda minutos.

Expected: la caja de Knock-Out ofrece la actualización en su siguiente arranque; tras instalar, `_vim_migraciones` local llega a 0101 y el primer ciclo baja insumos y recetas.
