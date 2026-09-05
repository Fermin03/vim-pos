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
REVOKE EXECUTE ON FUNCTION _vim_signo_movimiento(movimiento_inventario_tipo) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION _vim_signo_movimiento(movimiento_inventario_tipo) TO service_role;

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
      -- m1: sin este chequeo, un movimiento de OTRO tenant lo filtra en silencio la propia WHERE
      -- del INSERT (tenant_id = $2) y EXECUTE...INTO v_id devuelve NULL. Eso caía en el `CONTINUE`
      -- de "ya existía: nada que mover" — la caja lo veía como aplicado y lo marcaba confirmado sin
      -- que la nube hubiera insertado ni movido nada. Ahora es un error explícito, aislado por fila.
      IF (v_fila->>'tenant_id')::uuid IS DISTINCT FROM p_tenant THEN
        RAISE EXCEPTION 'movimiento de otro negocio';
      END IF;
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
        -- m2: stock_negativo_flag es pegajoso (0007 §8.5): una vez true, sigue true hasta un
        -- ajuste por conteo físico. OR con el flag actual, no solo con el resultado de esta suma.
        SET stock_actual = insumo_stock_sucursal.stock_actual + EXCLUDED.stock_actual,
            stock_negativo_flag = insumo_stock_sucursal.stock_negativo_flag OR (insumo_stock_sucursal.stock_actual + EXCLUDED.stock_actual) < 0,
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

-- ---------------------------------------------------------------------------
-- 5. descontar_inventario_por_venta: sin fila en configuracion_tenant, no descuenta (y no revienta)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION descontar_inventario_por_venta(
  p_ticket_id uuid
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id uuid;
  v_sucursal_id uuid;
  v_item record;
  v_componente record;
  v_modulo_activo boolean;
BEGIN
  -- Tenant y sucursal del ticket; la configuración puede no existir (LEFT JOIN): en ese caso el
  -- módulo cuenta como apagado. Antes un JOIN interno dejaba v_tenant_id NULL y, si había recetas,
  -- la venta reventaba al pagar (violaba D32: la venta nunca se bloquea por inventario).
  SELECT tk.tenant_id, tk.sucursal_id, ct.modulo_inventario_activo
    INTO v_tenant_id, v_sucursal_id, v_modulo_activo
    FROM tickets tk
    LEFT JOIN configuracion_tenant ct ON ct.tenant_id = tk.tenant_id
   WHERE tk.id = p_ticket_id;

  IF v_tenant_id IS NULL OR COALESCE(v_modulo_activo, false) = false THEN
    RETURN;
  END IF;

  -- Iterar items del ticket y aplicar receta
  -- (Las tablas tickets y ticket_items se definen en Parte 1C)
  FOR v_item IN
    SELECT ti.id, ti.producto_id, ti.cantidad
    FROM ticket_items ti
    WHERE ti.ticket_id = p_ticket_id
      AND ti.cancelado = false
  LOOP
    -- Insumos de la receta base
    FOR v_componente IN
      SELECT rc.insumo_id, rc.cantidad AS cantidad_unitaria
      FROM receta_componentes rc
      JOIN recetas r ON r.id = rc.receta_id
      WHERE r.producto_id = v_item.producto_id
        AND r.activa = true
    LOOP
      PERFORM aplicar_movimiento_inventario(
        v_tenant_id,
        v_sucursal_id,
        v_componente.insumo_id,
        'SALIDA_VENTA',
        v_componente.cantidad_unitaria * v_item.cantidad,
        NULL,
        NULL,
        NULL,
        'Venta ticket',
        p_ticket_id,
        NULL,
        NULL
      );
    END LOOP;

    -- Insumos de modificadores EXTRA aplicados al item
    -- (La tabla ticket_item_modificadores se definirá en Parte 1C)
    FOR v_componente IN
      SELECT mc.insumo_id, mc.cantidad AS cantidad_unitaria
      FROM ticket_item_modificadores tim
      JOIN opciones_modificador om ON om.id = tim.opcion_modificador_id
      JOIN grupos_modificadores gm ON gm.id = om.grupo_id
      JOIN modificador_componentes mc ON mc.opcion_modificador_id = om.id
      WHERE tim.ticket_item_id = v_item.id
        AND gm.naturaleza = 'EXTRA'
    LOOP
      PERFORM aplicar_movimiento_inventario(
        v_tenant_id,
        v_sucursal_id,
        v_componente.insumo_id,
        'SALIDA_MODIFICADOR_EXTRA',
        v_componente.cantidad_unitaria * v_item.cantidad,
        NULL,
        NULL,
        NULL,
        'Modificador extra',
        p_ticket_id,
        NULL,
        NULL
      );
    END LOOP;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION descontar_inventario_por_venta IS 'Descuenta insumos al pagar ticket. §34.3 del /core. Se llama desde trigger de tickets en Parte 1C. Sin fila en configuracion_tenant, el módulo cuenta como apagado (no descuenta, no bloquea la venta).';
