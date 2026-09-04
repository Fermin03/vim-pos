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
        'cantidad', 3, 'costo_unitario_mxn', 4, 'stock_antes', 10, 'stock_despues', 7, 'fecha', now() - interval '3 min', 'dia_contable', CURRENT_DATE, 'usuario_id', v_m, 'created_at', now()),
      jsonb_build_object('id', v_m2, 'tenant_id', v_t, 'sucursal_id', v_s, 'insumo_id', v_insumo, 'tipo', 'SALIDA_VENTA',
        'cantidad', 2, 'costo_unitario_mxn', 4, 'stock_antes', 7, 'stock_despues', 5, 'fecha', now() - interval '2 min', 'dia_contable', CURRENT_DATE, 'usuario_id', v_m, 'created_at', now()),
      jsonb_build_object('id', v_m3, 'tenant_id', v_t, 'sucursal_id', v_s, 'insumo_id', v_insumo, 'tipo', 'REVERSA_CANCELACION',
        'cantidad', 1, 'costo_unitario_mxn', 4, 'stock_antes', 5, 'stock_despues', 6, 'fecha', now() - interval '1 min', 'dia_contable', CURRENT_DATE, 'usuario_id', v_m, 'created_at', now()),
      jsonb_build_object('id', v_m4, 'tenant_id', v_t, 'sucursal_id', v_s, 'insumo_id', v_insumo_ajeno, 'tipo', 'SALIDA_VENTA',
        'cantidad', 1, 'costo_unitario_mxn', 1, 'stock_antes', 0, 'stock_despues', -1, 'fecha', now(), 'dia_contable', CURRENT_DATE, 'usuario_id', v_m, 'created_at', now())),
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
      'cantidad', 6, 'costo_unitario_mxn', 4, 'stock_antes', 6, 'stock_despues', 0, 'fecha', now(), 'dia_contable', CURRENT_DATE, 'usuario_id', v_m, 'created_at', now()))));
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
