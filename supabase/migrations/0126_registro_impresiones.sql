-- ============================================================================
-- 0126 — Las impresiones de la caja quedan registradas: comandas y reimpresiones del ticket.
--
-- Hasta aquí la caja imprimía comandas y reimprimía tickets sin dejar rastro: la tabla
-- comanda_impresiones, la función imprimir_comanda, la auditoría y el reporte "Reimpresiones por
-- cajero" existían desde la 0009 pero ninguna app las llamaba, así que el reporte salía vacío.
-- Reimprimir una comanda es la forma más barata de sacar comida sin cobrar.
--
-- 1) comanda_impresiones.area_cocina_id admite NULL. Knock-Out tiene áreas (Cocina, Barra) pero
--    1 de 43 productos asignado: casi toda su comanda sale "sin área" y, con NOT NULL, no se
--    podía registrar. Sin área se guarda con el nombre "Cocina".
-- 2) imprimir_comanda acepta p_area_cocina_id NULL.
-- 3) ticket_reimpresiones (nueva): quién reimprimió el ticket del cliente, cuándo, desde dónde
--    (CUENTAS con PIN, CONSULTA, COPIA_COBRO) y con qué autorización si la hubo.
-- 4) vw_reimpresiones_ticket_por_cajero para el panel del dueño.
-- 5) sync_push_snapshot replica ticket_reimpresiones (la de la 0123 con esa tabla en la lista).
-- ============================================================================

ALTER TABLE comanda_impresiones ALTER COLUMN area_cocina_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION imprimir_comanda(
  p_ticket_id           uuid,
  p_area_cocina_id      uuid,
  p_impresora_identificador varchar,
  p_items_incluidos     jsonb,
  p_evento_tipo         comanda_evento_tipo,
  p_resultado           comanda_resultado,
  p_error_detalle       text DEFAULT NULL,
  p_razon_reimpresion   text DEFAULT NULL,
  p_autorizacion_pin_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id       uuid := current_tenant_id();
  v_ticket          tickets%ROWTYPE;
  v_area_nombre     varchar;
  v_impresion_id    uuid;
BEGIN
  SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket % no existe', p_ticket_id;
  END IF;

  -- 0126: sin área (el negocio no asignó estación al producto) se registra como "Cocina".
  IF p_area_cocina_id IS NULL THEN
    v_area_nombre := 'Cocina';
  ELSE
    SELECT nombre INTO v_area_nombre FROM areas_cocina WHERE id = p_area_cocina_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Área de cocina % no existe', p_area_cocina_id;
    END IF;
  END IF;

  IF p_evento_tipo = 'REIMPRESION_CAJERO' THEN
    IF p_autorizacion_pin_id IS NULL THEN
      RAISE EXCEPTION 'Reimpresión por cajero requiere autorizacion_pin_id';
    END IF;
    IF p_razon_reimpresion IS NULL OR length(trim(p_razon_reimpresion)) = 0 THEN
      RAISE EXCEPTION 'Reimpresión por cajero requiere razon_reimpresion';
    END IF;
  END IF;

  INSERT INTO comanda_impresiones (
    tenant_id, sucursal_id, ticket_id,
    area_cocina_id, area_cocina_nombre_snapshot, impresora_identificador,
    evento_tipo, resultado, error_detalle,
    items_incluidos_snapshot,
    razon_reimpresion, autorizacion_pin_id,
    usuario_id, created_by
  ) VALUES (
    v_tenant_id, v_ticket.sucursal_id, p_ticket_id,
    p_area_cocina_id, v_area_nombre, p_impresora_identificador,
    p_evento_tipo, p_resultado, p_error_detalle,
    COALESCE(p_items_incluidos, '[]'::jsonb),
    p_razon_reimpresion, p_autorizacion_pin_id,
    auth.uid(), auth.uid()
  ) RETURNING id INTO v_impresion_id;

  RETURN v_impresion_id;
END;
$$;

COMMENT ON FUNCTION imprimir_comanda IS
  'Registra impresión o reimpresión de comanda. REIMPRESION_CAJERO valida PIN y razón. Área NULL = sin estación asignada (0126).';

-- ── Reimpresiones del ticket del cliente ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_reimpresiones (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  caja_id             uuid NULL REFERENCES cajas(id),
  turno_id            uuid NULL REFERENCES turnos(id),
  ticket_id           uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  usuario_id          uuid NOT NULL,
  origen              varchar(20) NOT NULL CHECK (origen IN ('CUENTAS', 'CONSULTA', 'COPIA_COBRO')),
  autorizacion_pin_id uuid NULL REFERENCES autorizaciones_pin(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ticket_reimpresiones IS
  'Cada reimpresión del ticket del cliente (0126). Append-only. CUENTAS pide PIN de supervisor; CONSULTA y COPIA_COBRO no, pero quedan registradas.';

CREATE INDEX IF NOT EXISTS idx_ticket_reimp_tenant_fecha ON ticket_reimpresiones(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_reimp_ticket ON ticket_reimpresiones(ticket_id);

ALTER TABLE ticket_reimpresiones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ticket_reimp_select ON ticket_reimpresiones;
CREATE POLICY ticket_reimp_select ON ticket_reimpresiones
  FOR SELECT USING (tenant_id = current_tenant_id());
DROP POLICY IF EXISTS ticket_reimp_insert ON ticket_reimpresiones;
CREATE POLICY ticket_reimp_insert ON ticket_reimpresiones
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
-- UPDATE/DELETE prohibidos: bitácora append-only (igual que comanda_impresiones).
GRANT SELECT, INSERT ON ticket_reimpresiones TO authenticated;

-- El día es el de México: una reimpresión a las 11 p.m. no puede caer en el día siguiente.
CREATE OR REPLACE VIEW vw_reimpresiones_ticket_por_cajero
WITH (security_invoker = on) AS
  SELECT r.tenant_id, r.sucursal_id,
         (r.created_at AT TIME ZONE 'America/Mexico_City')::date AS dia,
         r.usuario_id AS cajero_id,
         up.nombre::varchar(255) AS cajero_email,
         count(*) AS reimpresiones_count,
         count(DISTINCT r.ticket_id) AS tickets_distintos
    FROM ticket_reimpresiones r
    LEFT JOIN usuarios_perfil up ON up.id = r.usuario_id
   GROUP BY r.tenant_id, r.sucursal_id, 3, r.usuario_id, up.nombre;
GRANT SELECT ON vw_reimpresiones_ticket_por_cajero TO authenticated;

-- ── sync_push_snapshot: la de la 0123 con ticket_reimpresiones en la lista ──
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
  /* Orden de dependencia (ver 0089). `repartidores` primero: `delivery_asignaciones` lo
     referencia. 0117: clientes y direcciones antes que tickets. 0122: lo que cuelga de la venta
     después de sus renglones y pagos; `devoluciones` antes que sus renglones y que
     `cancelaciones_ticket` (que apunta a la devolución que la originó). */
  v_tablas    text[] := ARRAY[
    'repartidores',
    'zonas_envio',
    'clientes', 'direcciones_cliente',
    'turnos', 'tickets', 'ticket_items', 'ticket_item_modificadores', 'pagos',
    'ticket_descuentos_manuales', 'ticket_promociones_aplicadas', 'comanda_impresiones', 'ticket_reimpresiones',
    'devoluciones', 'devolucion_items', 'cancelaciones_ticket',
    'movimientos_caja',
    'delivery_asignaciones', 'cortes_parciales', 'cortes_caja', 'cortes_caja_detalle', 'reportes_z_historico'
  ];
BEGIN
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

  -- El estado del piso (punto 3). En réplica: el trigger de updated_at no hace falta aquí.
  v_det := _vim_aplicar_estado_mesas(p_snapshot->'mesas_estado', p_tenant);
  v_res := v_res || jsonb_build_object('mesas_estado', (v_det->>'aplicadas')::integer);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);

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
   WHERE NOT (k = ANY(v_tablas || ARRAY['movimientos_inventario', 'mesas_estado']));
  IF v_ignoradas IS NOT NULL AND array_length(v_ignoradas, 1) > 0 THEN
    RAISE WARNING 'sync_push_snapshot: el dispositivo mandó tablas que no se replican: %', v_ignoradas;
    v_res := v_res || jsonb_build_object('_ignoradas', to_jsonb(v_ignoradas));
  END IF;

  RETURN v_res || CASE WHEN jsonb_array_length(v_errores) > 0 THEN jsonb_build_object('_errores', v_errores) ELSE '{}'::jsonb END;
END;
$$;
REVOKE EXECUTE ON FUNCTION sync_push_snapshot(uuid, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION sync_push_snapshot(uuid, jsonb) TO service_role;
