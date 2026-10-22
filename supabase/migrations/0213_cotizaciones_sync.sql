-- Retail 2, entrega 3: las cotizaciones de la caja instalada suben a la nube (diseño 2026-10-18).
--
-- Push: acepta `cotizaciones` y `cotizacion_items` hechas en la caja (guardar_cotizacion,
-- cancelar_cotizacion y marcar_cotizacion_convertida corren contra su Postgres local). La caja las
-- manda por huella: vuelven a viajar cuando cambian de estado. La cotización se aplica con upsert por
-- id (solo cambian estado, ticket_id y updated_at); sus renglones son de solo inserción.
-- Pull: no las baja. Las cotizaciones de otras cajas no se ven en esta, igual que sus ventas.

-- ── §1 Aplicador ────────────────────────────────────────────────────────────
-- Molde de _vim_aplicar_credito_caja (0210). Corre en origin (FK normales). La pertenencia al
-- negocio se revisa a mano: la FK solo diría que la fila existe, no de quién es.
--   · tenant_id de la fila = el del dispositivo; un id que ya es de otro negocio es error;
--   · sucursal, caja y cliente (redirigido por clientes_alias, 0156) del negocio; la caja, de esa sucursal;
--   · una CONVERTIDA en la nube ya no cambia: una copia vieja de la caja no la regresa;
--   · la venta de una CONVERTIDA tiene que estar YA en la nube: la caja la manda en el lote de su
--     venta; si llegara antes, cae en _errores y se reintenta en el siguiente ciclo;
--   · un renglón entra solo si su cotización ya está en la nube y es del negocio. Uno ya subido se
--     salta: los renglones no cambian.
-- Devuelve {cotizaciones int, cotizacion_items int, errores [{tabla, id, error}]}.
CREATE OR REPLACE FUNCTION _vim_aplicar_cotizaciones_caja(p_tenant uuid, p_cotizaciones jsonb, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_fila    jsonb;
  v_cli     uuid;
  v_dueno   uuid;
  v_suc     uuid;
  v_id      uuid;
  v_nc      integer := 0;
  v_ni      integer := 0;
  v_errores jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_cotizaciones) = 'array' THEN
    FOR v_fila IN SELECT value FROM jsonb_array_elements(p_cotizaciones) ORDER BY value->>'created_at' LOOP
      BEGIN
        IF (v_fila->>'tenant_id')::uuid IS DISTINCT FROM p_tenant THEN
          RAISE EXCEPTION 'fila de otro negocio';
        END IF;
        SELECT tenant_id INTO v_dueno FROM cotizaciones WHERE id = (v_fila->>'id')::uuid;
        IF v_dueno IS DISTINCT FROM p_tenant AND v_dueno IS NOT NULL THEN
          RAISE EXCEPTION 'el id ya existe en otro negocio';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = (v_fila->>'sucursal_id')::uuid AND tenant_id = p_tenant) THEN
          RAISE EXCEPTION 'sucursal de otro negocio';
        END IF;
        SELECT sucursal_id INTO v_suc FROM cajas WHERE id = (v_fila->>'caja_id')::uuid AND tenant_id = p_tenant;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'caja de otro negocio';
        END IF;
        IF v_suc IS DISTINCT FROM (v_fila->>'sucursal_id')::uuid THEN
          RAISE EXCEPTION 'caja de otra sucursal';
        END IF;
        v_cli := (v_fila->>'cliente_id')::uuid;
        IF v_cli IS NOT NULL THEN
          v_cli := COALESCE((SELECT cliente_id FROM clientes_alias WHERE alias_id = v_cli AND tenant_id = p_tenant), v_cli);
          v_fila := v_fila || jsonb_build_object('cliente_id', v_cli);
          IF NOT EXISTS (SELECT 1 FROM clientes WHERE id = v_cli AND tenant_id = p_tenant) THEN
            RAISE EXCEPTION 'cliente de otro negocio';
          END IF;
        END IF;
        IF v_fila->>'ticket_id' IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM tickets WHERE id = (v_fila->>'ticket_id')::uuid AND tenant_id = p_tenant) THEN
          RAISE EXCEPTION 'venta de otro negocio o que aún no sube';
        END IF;
        v_id := NULL;
        INSERT INTO cotizaciones AS c SELECT * FROM jsonb_populate_record(NULL::cotizaciones, v_fila)
          ON CONFLICT (id) DO UPDATE SET estado = EXCLUDED.estado, ticket_id = EXCLUDED.ticket_id, updated_at = EXCLUDED.updated_at
           WHERE c.tenant_id = p_tenant
             AND c.estado <> 'CONVERTIDA'
             AND (c.estado, c.ticket_id, c.updated_at) IS DISTINCT FROM (EXCLUDED.estado, EXCLUDED.ticket_id, EXCLUDED.updated_at)
          RETURNING id INTO v_id;
        IF v_id IS NOT NULL THEN v_nc := v_nc + 1; END IF;
      EXCEPTION WHEN OTHERS THEN
        v_errores := v_errores || jsonb_build_object('tabla', 'cotizaciones', 'id', v_fila->>'id', 'error', SQLERRM);
      END;
    END LOOP;
  END IF;

  IF jsonb_typeof(p_items) = 'array' THEN
    FOR v_fila IN SELECT value FROM jsonb_array_elements(p_items) LOOP
      BEGIN
        IF (v_fila->>'tenant_id')::uuid IS DISTINCT FROM p_tenant THEN
          RAISE EXCEPTION 'fila de otro negocio';
        END IF;
        SELECT tenant_id INTO v_dueno FROM cotizacion_items WHERE id = (v_fila->>'id')::uuid;
        IF v_dueno = p_tenant THEN CONTINUE; END IF;
        IF v_dueno IS NOT NULL THEN RAISE EXCEPTION 'el id ya existe en otro negocio'; END IF;
        IF NOT EXISTS (SELECT 1 FROM cotizaciones WHERE id = (v_fila->>'cotizacion_id')::uuid AND tenant_id = p_tenant) THEN
          RAISE EXCEPTION 'cotización de otro negocio o que aún no sube';
        END IF;
        IF v_fila->>'producto_id' IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM productos WHERE id = (v_fila->>'producto_id')::uuid AND tenant_id = p_tenant) THEN
          RAISE EXCEPTION 'producto de otro negocio';
        END IF;
        v_id := NULL;
        INSERT INTO cotizacion_items SELECT * FROM jsonb_populate_record(NULL::cotizacion_items, v_fila)
          ON CONFLICT DO NOTHING RETURNING id INTO v_id;
        IF v_id IS NOT NULL THEN v_ni := v_ni + 1; END IF;
      EXCEPTION WHEN OTHERS THEN
        v_errores := v_errores || jsonb_build_object('tabla', 'cotizacion_items', 'id', v_fila->>'id', 'error', SQLERRM);
      END;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('cotizaciones', v_nc, 'cotizacion_items', v_ni, 'errores', v_errores);
END;
$fn$;
REVOKE ALL ON FUNCTION _vim_aplicar_cotizaciones_caja(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;

-- ── §2 sync_push_snapshot ───────────────────────────────────────────────────
-- La de la 0210 (vigente) más las cotizaciones (marcado "0213"): se aplican al final, en origin, ya
-- con las ventas del lote; no cuentan entre las ignoradas y sirven para hallar la caja del rastro.
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
  v_tickets   jsonb;
  v_descartados jsonb;   -- 0195
  /* Orden de dependencia (ver 0089). `repartidores` primero: `delivery_asignaciones` lo
     referencia. 0117: clientes y direcciones antes que tickets. 0122: lo que cuelga de la venta
     después de sus renglones y pagos; `devoluciones` antes que sus renglones y que
     `cancelaciones_ticket` (que apunta a la devolución que la originó). */
  v_tablas    text[] := ARRAY[
    'repartidores',
    'zonas_envio',
    'colonias',   -- 0187
    'clientes', 'direcciones_cliente',
    'turnos', 'tickets', 'ticket_items', 'ticket_item_modificadores', 'pagos',
    'ticket_descuentos_manuales', 'ticket_promociones_aplicadas', 'ticket_canjes_lealtad', 'comanda_impresiones', 'ticket_reimpresiones',
    'devoluciones', 'devolucion_items', 'cancelaciones_ticket',
    'movimientos_caja',
    'delivery_asignaciones', 'cortes_parciales', 'cortes_caja', 'cortes_caja_detalle', 'reportes_z_historico'
  ];
BEGIN
  -- 0156: el teléfono es la identidad. Antes de aplicar nada, los clientes cuyo teléfono ya existe
  -- con otro id se anotan como alias y lo suyo se redirige. Ver _vim_fusionar_clientes.
  p_snapshot := _vim_fusionar_clientes(p_snapshot, p_tenant);
  IF jsonb_typeof(p_snapshot->'_fusion_errores') = 'array' THEN v_errores := v_errores || (p_snapshot->'_fusion_errores'); END IF;
  p_snapshot := p_snapshot - '_fusion_errores';
  -- 0156: una caja sin actualizar no manda las columnas nuevas. Ver _vim_compat_0156.
  p_snapshot := _vim_compat_0156(p_snapshot, p_tenant);
  -- 0187: la colonia que la caja capturó y la nube ya tiene con otro id se funde, no truena.
  p_snapshot := _vim_fusionar_colonias(p_snapshot, p_tenant);

  -- La guarda del FACTURADO (ver el encabezado, punto 2): si la nube ya lo facturó y la caja
  -- manda su copia PAGADO, se conserva FACTURADO. Se reescribe el JSON entrante antes de aplicar,
  -- así el resto de la fila (lo que cambió en la caja) entra igual.
  IF jsonb_typeof(p_snapshot->'tickets') = 'array' THEN
    SELECT jsonb_agg(
             CASE WHEN t.estado_fiscal = 'FACTURADO' AND r->>'estado_fiscal' = 'PAGADO'
                  THEN r || jsonb_build_object('estado_fiscal', 'FACTURADO')
                  ELSE r END)
      INTO v_tickets
      FROM jsonb_array_elements(p_snapshot->'tickets') AS r
      LEFT JOIN public.tickets t ON t.id = NULLIF(r->>'id', '')::uuid AND t.tenant_id = p_tenant;
    p_snapshot := jsonb_set(p_snapshot, '{tickets}', COALESCE(v_tickets, '[]'::jsonb));
  END IF;

  -- Modo réplica: sin triggers ni FK, para conservar folios/totales/estados tal como la caja
  -- los imprimió. Requiere el superusuario dueño de la función (definer).
  SET LOCAL session_replication_role = replica;

  FOREACH v_tabla IN ARRAY v_tablas LOOP
    v_det := _vim_apply_rows_detalle(v_tabla, p_snapshot->v_tabla, p_tenant);
    v_res := v_res || jsonb_build_object(v_tabla, (v_det->>'aplicadas')::integer);
    v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);
  END LOOP;

  -- 0156: un canje que el libro ya devolvió no revive con la copia tardía de la caja. Ver
  -- _vim_conciliar_canjes. Sigue en modo réplica, que es lo que se quiere para su UPDATE.
  v_det := _vim_conciliar_canjes(p_snapshot->'ticket_canjes_lealtad', p_tenant);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);

  -- El estado del piso (punto 3). En réplica: el trigger de updated_at no hace falta aquí.
  v_det := _vim_aplicar_estado_mesas(p_snapshot->'mesas_estado', p_tenant);
  v_res := v_res || jsonb_build_object('mesas_estado', (v_det->>'aplicadas')::integer);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);

  -- Inventario: con triggers y FK normales. Es el último paso; no hace falta volver a réplica.
  SET LOCAL session_replication_role = origin;
  v_det := _vim_aplicar_movimientos(p_snapshot->'movimientos_inventario', p_tenant);
  v_res := v_res || jsonb_build_object('movimientos_inventario', (v_det->>'aplicadas')::integer);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);

  -- 0156: lealtad. Igual que inventario: con triggers y FK normales, y la nube recalcula el saldo.
  v_det := _vim_aplicar_movimientos_lealtad(p_snapshot->'lealtad_movimientos', p_tenant);
  v_res := v_res || jsonb_build_object('lealtad_movimientos', (v_det->>'aplicadas')::integer);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);

  -- 0195: existencias por producto. En origin: el disparador mueve producto_existencias.
  v_det := _vim_aplicar_movimientos_producto(p_tenant, p_snapshot->'movimientos_producto');
  v_res := v_res || jsonb_build_object('movimientos_producto', (v_det->>'aplicados')::integer);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);
  v_descartados := COALESCE(v_det->'descartados', '[]'::jsonb);   -- 0195

  -- 0210: el crédito hecho en la caja. En origin, ya con las ventas y los turnos del lote aplicados.
  v_det := _vim_aplicar_credito_caja(p_tenant, 'abonos_credito', p_snapshot->'abonos_credito');
  v_res := v_res || jsonb_build_object('abonos_credito', (v_det->>'aplicados')::integer);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);
  v_det := _vim_aplicar_credito_caja(p_tenant, 'saldo_favor_movimientos', p_snapshot->'saldo_favor_movimientos');
  v_res := v_res || jsonb_build_object('saldo_favor_movimientos', (v_det->>'aplicados')::integer);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);

  -- 0213: las cotizaciones de la caja. En origin, ya con las ventas del lote aplicadas.
  v_det := _vim_aplicar_cotizaciones_caja(p_tenant, p_snapshot->'cotizaciones', p_snapshot->'cotizacion_items');
  v_res := v_res || jsonb_build_object('cotizaciones', (v_det->>'cotizaciones')::integer,
                                       'cotizacion_items', (v_det->>'cotizacion_items')::integer);
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
      FROM jsonb_array_elements(COALESCE(p_snapshot->'tickets', p_snapshot->'turnos', p_snapshot->'pagos', p_snapshot->'cotizaciones', '[]'::jsonb)) AS t   -- 0213
     LIMIT 1;
    IF v_sucursal IS NULL THEN
      SELECT NULLIF(t->>'sucursal_id', '')::uuid INTO v_sucursal
        FROM jsonb_array_elements(COALESCE(p_snapshot->'movimientos_inventario', p_snapshot->'movimientos_producto', '[]'::jsonb)) AS t LIMIT 1;   -- 0195
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
      jsonb_build_object('origen', 'sync_push_snapshot'),
      -- 0123: el motivo de cada fila rechazada (hasta 20), no solo cuántas. Sin esto el detalle solo
      -- quedaba en la bitácora de la caja del local, y un rechazo que se reintenta cada 10 minutos
      -- no se podía diagnosticar desde aquí.
      v_res || CASE WHEN jsonb_array_length(v_errores) > 0
                    THEN jsonb_build_object('_errores', (SELECT jsonb_agg(e) FROM (SELECT e FROM jsonb_array_elements(v_errores) e LIMIT 20) x))
                    ELSE '{}'::jsonb END
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
   WHERE NOT (k = ANY(v_tablas || ARRAY['movimientos_inventario', 'mesas_estado', 'lealtad_movimientos', 'movimientos_producto', 'abonos_credito', 'saldo_favor_movimientos', 'cotizaciones', 'cotizacion_items']));   -- 0210, 0213
  IF v_ignoradas IS NOT NULL AND array_length(v_ignoradas, 1) > 0 THEN
    RAISE WARNING 'sync_push_snapshot: el dispositivo mandó tablas que no se replican: %', v_ignoradas;
    v_res := v_res || jsonb_build_object('_ignoradas', to_jsonb(v_ignoradas));
  END IF;

  RETURN v_res || CASE WHEN jsonb_array_length(v_errores) > 0 THEN jsonb_build_object('_errores', v_errores) ELSE '{}'::jsonb END
               -- 0195: ids que la caja marca como subidos aunque la nube no los guardó.
               || CASE WHEN jsonb_array_length(v_descartados) > 0 THEN jsonb_build_object('_descartados', jsonb_build_object('movimientos_producto', v_descartados)) ELSE '{}'::jsonb END;
END;
$$;
REVOKE EXECUTE ON FUNCTION sync_push_snapshot(uuid, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION sync_push_snapshot(uuid, jsonb) TO service_role;
