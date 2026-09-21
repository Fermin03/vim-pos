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
  /* `repartidores` va PRIMERO: el array está ordenado por dependencia (ver 0089) y
     `delivery_asignaciones` lo referencia por `repartidor_catalogo_id`. Sube porque desde la 0114
     la caja puede dar de alta un repartidor (el pedido no puede quedarse sin salir porque nadie
     entró al panel), y sin esto esa alta se quedaría en el Postgres local para siempre. */
  v_tablas    text[] := ARRAY[
    'repartidores',
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
