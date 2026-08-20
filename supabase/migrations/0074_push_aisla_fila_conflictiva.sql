-- ============================================================================
-- 0074 — Una fila conflictiva ya no tumba el envío completo.
--
-- `_vim_apply_rows` aplicaba cada tabla con un solo INSERT masivo. Basta que UNA fila viole una
-- restricción para que caiga la sentencia, con ella la transacción, y con ella el snapshot
-- entero: ni una venta se guarda.
--
-- En el piloto eso significó 27 ventas retenidas durante 16 reintentos por un turno viejo que
-- chocaba contra `idx_turno_unico_activo_por_caja`. Las ventas no tenían nada malo; viajaban en
-- el mismo paquete que el turno, y eso bastó. Y como el push falla en silencio —el rastro queda
-- en un log dentro de la caja— nadie se entera hasta que el dueño dice que sus números no
-- cuadran.
--
-- CÓMO QUEDA
--
-- Primero se intenta el INSERT masivo, que es el camino normal y el rápido. Si truena, se
-- reintenta fila por fila, cada una en su propio bloque: las buenas entran y las conflictivas se
-- apartan con su id y su mensaje de error. El costo por fila solo se paga cuando ya hay un
-- problema.
--
-- Los errores vuelven al device en la clave `_errores` de la respuesta, para que la caja NO
-- marque como subido lo que se quedó fuera y lo reintente. Y quedan asentados en `sync_eventos`,
-- que es lo que el panel puede leer sin entrar a la máquina del cliente.
--
-- El contrato externo no cambia: `{tabla: n}` sigue igual y `_vim_apply_rows` conserva su firma
-- de siempre, así que la Edge Function `sync-push` no necesita redesplegarse.
-- ============================================================================

-- Aplica filas aislando las conflictivas. Devuelve {aplicadas, errores:[{tabla,id,error}]}.
CREATE OR REPLACE FUNCTION _vim_apply_rows_detalle(p_tabla text, p_rows jsonb, p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_cols    text;
  v_set     text;
  v_n       integer := 0;
  v_fila    jsonb;
  v_errores jsonb := '[]'::jsonb;
  v_sql     text;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RETURN jsonb_build_object('aplicadas', 0, 'errores', '[]'::jsonb);
  END IF;

  -- La lista de columnas sale del information_schema del DESTINO: una columna que exista en la
  -- caja pero no aquí se ignora sola, y la sincronización no se rompe por desfase de esquema.
  SELECT string_agg(quote_ident(column_name), ', '),
         string_agg(CASE WHEN column_name <> 'id' THEN quote_ident(column_name) || '=EXCLUDED.' || quote_ident(column_name) END, ', ')
    INTO v_cols, v_set
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = p_tabla
     AND is_generated <> 'ALWAYS' AND is_identity <> 'YES';
  IF v_cols IS NULL THEN RETURN jsonb_build_object('aplicadas', 0, 'errores', '[]'::jsonb); END IF;

  v_sql := format(
    'INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_recordset(NULL::public.%I, $1) WHERE tenant_id = $2 ON CONFLICT (id) DO UPDATE SET %s',
    p_tabla, v_cols, v_cols, p_tabla, v_set);

  -- Camino rápido: todo junto. Es lo que ocurre siempre que no hay conflicto.
  BEGIN
    EXECUTE v_sql USING p_rows, p_tenant;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN jsonb_build_object('aplicadas', v_n, 'errores', '[]'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    -- Algo chocó. Se rehace fila por fila para salvar todo lo que sí se pueda.
    v_n := 0;
  END;

  FOR v_fila IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    BEGIN
      EXECUTE v_sql USING jsonb_build_array(v_fila), p_tenant;
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errores := v_errores || jsonb_build_object(
        'tabla', p_tabla,
        'id',    v_fila->>'id',
        'error', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object('aplicadas', v_n, 'errores', v_errores);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION _vim_apply_rows_detalle(text, jsonb, uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION sync_push_snapshot(p_tenant uuid, p_snapshot jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_tabla    text;
  v_res      jsonb := '{}'::jsonb;
  v_ini      timestamptz := clock_timestamp();
  v_total    integer := 0;
  v_aplicadas integer := 0;
  v_caja     uuid;
  v_sucursal uuid;
  v_disp     text;
  v_desc     text;
  v_det      jsonb;
  v_errores  jsonb := '[]'::jsonb;
  v_min      timestamptz;
  v_max      timestamptz;
BEGIN
  -- Modo réplica: no dispara triggers (folio/totales/cerrar_ticket_si_pagado). Requiere el
  -- privilegio de superusuario del dueño de la función (definer), no del service_role llamante.
  SET LOCAL session_replication_role = replica;
  FOREACH v_tabla IN ARRAY ARRAY['turnos','tickets','ticket_items','ticket_item_modificadores','pagos','movimientos_caja'] LOOP
    v_det := _vim_apply_rows_detalle(v_tabla, p_snapshot->v_tabla, p_tenant);
    v_res := v_res || jsonb_build_object(v_tabla, (v_det->>'aplicadas')::integer);
    v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);
  END LOOP;

  -- ── Rastro del envío ──────────────────────────────────────────────────────
  BEGIN
    -- Enviadas vs aplicadas: si difieren, algo se quedó fuera y hay que mirarlo.
    SELECT COALESCE(SUM(jsonb_array_length(v)), 0) INTO v_total
      FROM jsonb_each(p_snapshot) AS e(k, v)
     WHERE jsonb_typeof(v) = 'array';
    SELECT COALESCE(SUM(value::int), 0) INTO v_aplicadas FROM jsonb_each_text(v_res);

    -- Contexto del batch, tomado de los tickets (o de los turnos si no vinieron tickets).
    -- La ventana temporal se agrega; la caja y la sucursal se toman de la primera fila, NO con
    -- MAX(): Postgres no tiene agregado max() para uuid y el bloque entero se caía en silencio.
    SELECT MIN((t->>'created_at')::timestamptz), MAX((t->>'created_at')::timestamptz)
      INTO v_min, v_max
      FROM jsonb_array_elements(COALESCE(p_snapshot->'tickets', p_snapshot->'turnos', '[]'::jsonb)) AS t;

    SELECT NULLIF(t->>'caja_id', '')::uuid, NULLIF(t->>'sucursal_id', '')::uuid
      INTO v_caja, v_sucursal
      FROM jsonb_array_elements(COALESCE(p_snapshot->'tickets', p_snapshot->'turnos', '[]'::jsonb)) AS t
     LIMIT 1;

    SELECT COALESCE(NULLIF(c.identificador_dispositivo, ''), c.nombre, 'escritorio'),
           NULLIF(TRIM(CONCAT_WS(' · ', c.nombre, s.nombre)), '')
      INTO v_disp, v_desc
      FROM public.cajas c
      LEFT JOIN public.sucursales s ON s.id = c.sucursal_id
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
      jsonb_build_object('origen', 'sync_push_snapshot'),
      v_res || CASE WHEN jsonb_array_length(v_errores) > 0 THEN jsonb_build_object('_errores', v_errores) ELSE '{}'::jsonb END
    );
  EXCEPTION WHEN OTHERS THEN
    -- Las ventas YA se aplicaron. Perder la bitácora es molesto; perder el push, grave.
    RAISE WARNING 'sync_push_snapshot: no se pudo registrar el evento: %', SQLERRM;
  END;

  -- ── Señal de vida de la caja ──────────────────────────────────────────────
  -- En su PROPIO bloque: si el registro del evento falla, el sello debe darse igual. Son dos
  -- datos independientes y perder los dos por un solo error sería peor.
  BEGIN
    IF v_caja IS NOT NULL THEN
      UPDATE public.cajas SET ultima_conexion = now() WHERE id = v_caja;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_push_snapshot: no se pudo sellar ultima_conexion: %', SQLERRM;
  END;

  -- Los errores viajan de vuelta al device: sin esto, la caja daría por subido lo que se quedó
  -- en el camino y esas ventas no se reintentarían nunca.
  RETURN v_res || CASE WHEN jsonb_array_length(v_errores) > 0
                       THEN jsonb_build_object('_errores', v_errores) ELSE '{}'::jsonb END;
END;
$$;
