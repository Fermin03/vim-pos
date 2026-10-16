-- Smoke de la caja de tienda (spec 2026-10-15-giro-retail-design.md; migración 0195).
-- Sobre la semilla de dev. ROLLBACK. Ejecutar: cd desktop && npm run smokes -- smoke_caja_tienda.sql
\set ON_ERROR_STOP on
BEGIN;

-- Fixture: dos productos con existencias en la semilla (restaurante) y otro negocio con lo suyo.
DO $$
DECLARE v_t uuid := '99999999-0000-0000-0000-0000000000aa'; v_o uuid := 'c4c40000-0000-0000-0000-0000000000ee';
BEGIN
  INSERT INTO categorias (id, tenant_id, nombre) VALUES ('c4c40000-0000-0000-0000-0000000000c1', v_t, 'Tienda');
  INSERT INTO productos (id, tenant_id, nombre, categoria_id, precio_base_mxn, controla_existencias) VALUES
    ('c4c40000-0000-0000-0000-0000000000a1', v_t, 'Playera', 'c4c40000-0000-0000-0000-0000000000c1', 100, true),
    ('c4c40000-0000-0000-0000-0000000000a2', v_t, 'Gorra',   'c4c40000-0000-0000-0000-0000000000c1', 200, true);
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_o, 'tenant-0195', 'Otra tienda', 'INTERNO', 'QUICK_SERVICE');
  INSERT INTO tenant_limites (tenant_id, max_sucursales) VALUES (v_o, 5) ON CONFLICT (tenant_id) DO UPDATE SET max_sucursales = 5;
  INSERT INTO sucursales (id, tenant_id, codigo, nombre) VALUES ('c4c40000-0000-0000-0000-0000000000b2', v_o, 'RC4', 'Ajena');
  INSERT INTO categorias (id, tenant_id, nombre) VALUES ('c4c40000-0000-0000-0000-0000000000c2', v_o, 'Ajena');
  INSERT INTO productos (id, tenant_id, nombre, categoria_id, precio_base_mxn, controla_existencias)
  VALUES ('c4c40000-0000-0000-0000-0000000000e1', v_o, 'Ajena', 'c4c40000-0000-0000-0000-0000000000c2', 10, true);
END $$;

-- 1) Candados de la entrega 1.
DO $$
DECLARE
  v_t     uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc   uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja  uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria uuid := '99999999-0000-0000-0000-000000000001';
  v_pla   uuid := 'c4c40000-0000-0000-0000-0000000000a1';
  v_gor   uuid := 'c4c40000-0000-0000-0000-0000000000a2';
  v_turno uuid; v_tk uuid; v_it1 uuid; v_it2 uuid; v_tot numeric; v_ab uuid; v_ab_it uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', v_t::text)::text, true);
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_t, v_suc, v_caja, 'SMOKE-C4', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;

  v_tk  := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-c4-a', v_maria);
  v_it1 := agregar_item_a_ticket(v_tk, v_pla, 1, NULL, '[]'::jsonb, 'smoke-c4-a-1');
  v_it2 := agregar_item_a_ticket(v_tk, v_gor, 1, NULL, '[]'::jsonb, 'smoke-c4-a-2');
  v_ab  := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-c4-ab', v_maria);
  v_ab_it := agregar_item_a_ticket(v_ab, v_pla, 1, NULL, '[]'::jsonb, 'smoke-c4-ab-1');

  -- 1c) Cobrar un ticket con dos renglones de existencias sigue generando dos VENTA.
  SELECT total_mxn INTO v_tot FROM tickets WHERE id = v_tk;
  PERFORM aplicar_pago(v_tk, 'EFECTIVO'::metodo_pago, v_tot, v_tot, NULL, NULL, NULL, false, NULL, 'smoke-c4-a-pago');
  IF (SELECT count(*) FROM movimientos_producto WHERE ticket_id = v_tk AND tipo = 'VENTA') <> 2 THEN
    RAISE EXCEPTION '1c: debían ser dos VENTA'; END IF;

  -- 1a) En un ticket PAGADO el renglón no cambia de producto; en ABIERTO sí.
  BEGIN UPDATE ticket_items SET producto_id = v_gor WHERE id = v_it1;
        RAISE EXCEPTION '1a: cambió el producto de un renglón cobrado';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS: no se cambia el producto de un renglón cobrado%' THEN RAISE; END IF; END;
  UPDATE ticket_items SET producto_id = v_gor WHERE id = v_ab_it;
  IF (SELECT producto_id FROM ticket_items WHERE id = v_ab_it) <> v_gor THEN RAISE EXCEPTION '1a: en ABIERTO debía cambiar'; END IF;

  -- 1b) Un movimiento del otro negocio no apunta a registros de este.
  BEGIN INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad, ticket_id)
        VALUES ('c4c40000-0000-0000-0000-0000000000ee', 'c4c40000-0000-0000-0000-0000000000b2',
                'c4c40000-0000-0000-0000-0000000000e1', 'ENTRADA', 1, v_tk);
        RAISE EXCEPTION '1b: aceptó un ticket ajeno';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'MOVIMIENTO_INVALIDO%' THEN RAISE; END IF; END;
  BEGIN INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad, ticket_item_id)
        VALUES ('c4c40000-0000-0000-0000-0000000000ee', 'c4c40000-0000-0000-0000-0000000000b2',
                'c4c40000-0000-0000-0000-0000000000e1', 'ENTRADA', 1, v_it1);
        RAISE EXCEPTION '1b: aceptó un renglón ajeno';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'MOVIMIENTO_INVALIDO%' THEN RAISE; END IF; END;
  RAISE NOTICE '1 candados OK';
END $$;

-- 2) La venta de tienda no va a cocina.
DO $$
DECLARE
  v_t     uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc   uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja  uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria uuid := '99999999-0000-0000-0000-000000000001';
  v_pla   uuid := 'c4c40000-0000-0000-0000-0000000000a1';
  v_turno uuid; v_tk uuid; v_tot numeric;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', v_t::text)::text, true);
  SELECT id INTO v_turno FROM turnos WHERE caja_id = v_caja AND estado = 'ABIERTO';

  -- 2b) Restaurante: sigue en true.
  v_tk := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-c4-2b', v_maria);
  IF NOT (SELECT envio_cocina_automatico FROM tickets WHERE id = v_tk) THEN RAISE EXCEPTION '2b: restaurante debía quedar en true'; END IF;

  -- 2a) RETAIL: false, y al cobrar no pasa a EN_COCINA.
  UPDATE tenants SET vertical_principal = 'RETAIL' WHERE id = v_t;
  v_tk := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-c4-2a', v_maria);
  IF (SELECT envio_cocina_automatico FROM tickets WHERE id = v_tk) THEN RAISE EXCEPTION '2a: RETAIL debía quedar en false'; END IF;
  PERFORM agregar_item_a_ticket(v_tk, v_pla, 1, NULL, '[]'::jsonb, 'smoke-c4-2a-1');
  SELECT total_mxn INTO v_tot FROM tickets WHERE id = v_tk;
  PERFORM aplicar_pago(v_tk, 'EFECTIVO'::metodo_pago, v_tot, v_tot, NULL, NULL, NULL, false, NULL, 'smoke-c4-2a-pago');
  IF (SELECT estado_cocina::text FROM tickets WHERE id = v_tk) = 'EN_COCINA' THEN RAISE EXCEPTION '2a: la venta de tienda fue a cocina'; END IF;
  RAISE NOTICE '2 sin cocina OK';
END $$;

-- 3) La nube recibe los movimientos de la caja y baja las existencias.
DO $$
DECLARE
  v_t     uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc   uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja  uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria uuid := '99999999-0000-0000-0000-000000000001';
  v_pla   uuid := 'c4c40000-0000-0000-0000-0000000000a1';
  v_m1    uuid := gen_random_uuid(); v_m2 uuid := gen_random_uuid(); v_m3 uuid := gen_random_uuid(); v_m4 uuid := gen_random_uuid();
  v_m5    uuid := gen_random_uuid(); v_m6 uuid := gen_random_uuid();
  v_suc2  uuid; v_turno uuid; v_tk uuid; v_it uuid; v_auth uuid; v_ini numeric; v_res jsonb; v_snap jsonb; v_pull jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', v_t::text)::text, true);
  SELECT id INTO v_turno FROM turnos WHERE caja_id = v_caja AND estado = 'ABIERTO';
  v_ini := COALESCE((SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_pla), 0);

  -- 3a) Una VENTA de -1 aplica una vez; el mismo snapshot otra vez no duplica ni mueve la existencia.
  v_snap := jsonb_build_object('movimientos_producto', jsonb_build_array(jsonb_build_object(
    'id', v_m1, 'tenant_id', v_t, 'sucursal_id', v_suc, 'producto_id', v_pla, 'tipo', 'VENTA', 'cantidad', -1,
    'motivo', 'smoke 3a', 'usuario_id', v_maria, 'creado_at', now())));
  v_res := sync_push_snapshot(v_t, v_snap);
  IF (v_res->>'movimientos_producto')::int IS DISTINCT FROM 1 THEN RAISE EXCEPTION '3a: debía aplicar 1: %', v_res; END IF;
  IF v_res ? '_ignoradas' THEN RAISE EXCEPTION '3a: la nube ignoró movimientos_producto: %', v_res->'_ignoradas'; END IF;
  IF (SELECT sucursal_id FROM sync_eventos WHERE tenant_id = v_t ORDER BY fecha_procesado_inicio DESC LIMIT 1) IS DISTINCT FROM v_suc THEN
    RAISE EXCEPTION '3a: el rastro de un lote de puros movimientos_producto debía llevar la sucursal'; END IF;
  v_res := sync_push_snapshot(v_t, v_snap);
  IF (v_res->>'movimientos_producto')::int IS DISTINCT FROM 0 THEN RAISE EXCEPTION '3a: el reenvío debía aplicar 0: %', v_res; END IF;
  IF (SELECT count(*) FROM movimientos_producto WHERE id = v_m1) <> 1 THEN RAISE EXCEPTION '3a: el movimiento se duplicó'; END IF;
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_pla) <> v_ini - 1 THEN
    RAISE EXCEPTION '3a: la existencia debía quedar en %', v_ini - 1; END IF;

  -- 3b) Un producto de otro negocio cae en errores y no detiene a los demás.
  v_res := sync_push_snapshot(v_t, jsonb_build_object('movimientos_producto', jsonb_build_array(
    jsonb_build_object('id', v_m2, 'tenant_id', v_t, 'sucursal_id', v_suc, 'producto_id', 'c4c40000-0000-0000-0000-0000000000e1',
      'tipo', 'VENTA', 'cantidad', -1, 'creado_at', now() - interval '1 min'),
    jsonb_build_object('id', v_m3, 'tenant_id', v_t, 'sucursal_id', v_suc, 'producto_id', v_pla,
      'tipo', 'ENTRADA', 'cantidad', 5, 'creado_at', now()),
    -- Fila cuyo propio tenant_id es de otro negocio (con producto y sucursal de este).
    jsonb_build_object('id', v_m5, 'tenant_id', 'c4c40000-0000-0000-0000-0000000000ee', 'sucursal_id', v_suc, 'producto_id', v_pla,
      'tipo', 'ENTRADA', 'cantidad', 7, 'creado_at', now()))));
  IF (v_res->>'movimientos_producto')::int IS DISTINCT FROM 1 THEN RAISE EXCEPTION '3b: debía aplicar solo el bueno: %', v_res; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(v_res->'_errores', '[]'::jsonb)) e WHERE e->>'id' = v_m2::text) THEN
    RAISE EXCEPTION '3b: el producto ajeno debía estar en _errores: %', v_res; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(v_res->'_errores', '[]'::jsonb)) e
                  WHERE e->>'id' = v_m5::text AND e->>'error' = 'movimiento de otro negocio') THEN
    RAISE EXCEPTION '3b: la fila con tenant ajeno debía estar en _errores: %', v_res; END IF;
  IF v_res ? '_descartados' THEN RAISE EXCEPTION '3b: lo ajeno es error, no descartado: %', v_res; END IF;
  IF EXISTS (SELECT 1 FROM movimientos_producto WHERE id IN (v_m2, v_m5)) THEN RAISE EXCEPTION '3b: lo ajeno no debía insertarse'; END IF;
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_pla) <> v_ini + 4 THEN
    RAISE EXCEPTION '3b: la existencia debía quedar en %', v_ini + 4; END IF;

  -- 3e) Al producto le quitan las existencias: reenviar lo ya aplicado no es error ni descartado;
  --     un movimiento nuevo de ese producto va a _descartados (no a _errores) y no se guarda.
  UPDATE productos SET controla_existencias = false WHERE id = v_pla;
  v_res := sync_push_snapshot(v_t, v_snap || jsonb_build_object('movimientos_producto',
    (v_snap->'movimientos_producto') || jsonb_build_array(jsonb_build_object(
      'id', v_m6, 'tenant_id', v_t, 'sucursal_id', v_suc, 'producto_id', v_pla, 'tipo', 'VENTA', 'cantidad', -1, 'creado_at', now()))));
  IF v_res ? '_errores' THEN RAISE EXCEPTION '3e: el reenvío no debía dar errores: %', v_res; END IF;
  IF (v_res->>'movimientos_producto')::int IS DISTINCT FROM 0 THEN RAISE EXCEPTION '3e: nada debía aplicarse: %', v_res; END IF;
  IF v_res->'_descartados'->'movimientos_producto' IS DISTINCT FROM jsonb_build_array(v_m6::text) THEN
    RAISE EXCEPTION '3e: solo el nuevo debía ir a _descartados: %', v_res; END IF;
  IF EXISTS (SELECT 1 FROM movimientos_producto WHERE id = v_m6) THEN RAISE EXCEPTION '3e: el descartado no debía guardarse'; END IF;
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_pla) <> v_ini + 4 THEN
    RAISE EXCEPTION '3e: la existencia no debía moverse'; END IF;
  UPDATE productos SET controla_existencias = true WHERE id = v_pla;

  -- 3c) El pull trae producto_existencias de las dos sucursales (y no de una borrada).
  INSERT INTO tenant_limites (tenant_id, max_sucursales) VALUES (v_t, 10) ON CONFLICT (tenant_id) DO UPDATE SET max_sucursales = 10;
  INSERT INTO sucursales (tenant_id, codigo, nombre) VALUES (v_t, 'S195', 'Segunda tienda') RETURNING id INTO v_suc2;
  INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad) VALUES (v_t, v_suc2, v_pla, 'ENTRADA', 3);
  v_pull := sync_pull_snapshot(v_t);
  IF (SELECT count(*) FROM jsonb_array_elements(COALESCE(v_pull->'producto_existencias', '[]'::jsonb)) e
       WHERE e->>'producto_id' = v_pla::text AND e->>'sucursal_id' IN (v_suc::text, v_suc2::text)) <> 2 THEN
    RAISE EXCEPTION '3c: el pull debía traer la playera de las dos sucursales'; END IF;
  UPDATE sucursales SET deleted_at = now() WHERE id = v_suc2;
  v_pull := sync_pull_snapshot(v_t);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_pull->'producto_existencias') e WHERE e->>'sucursal_id' = v_suc2::text) THEN
    RAISE EXCEPTION '3c: el pull no debía traer una sucursal borrada'; END IF;

  -- 3d) Un ticket de la caja sube PAGADO con su VENTA (en réplica no la genera la nube); cancelado
  --     en la nube con cancelar_ticket_pagado, la existencia queda como antes de la venta.
  v_ini := (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_pla);
  v_tk := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-c4-3d', v_maria);
  v_it := agregar_item_a_ticket(v_tk, v_pla, 1, NULL, '[]'::jsonb, 'smoke-c4-3d-1');
  v_res := sync_push_snapshot(v_t, jsonb_build_object(
    'tickets', jsonb_build_array((SELECT to_jsonb(t) || jsonb_build_object('estado_fiscal', 'PAGADO') FROM tickets t WHERE id = v_tk)),
    'movimientos_producto', jsonb_build_array(jsonb_build_object(
      'id', v_m4, 'tenant_id', v_t, 'sucursal_id', v_suc, 'producto_id', v_pla, 'tipo', 'VENTA', 'cantidad', -1,
      'ticket_id', v_tk, 'ticket_item_id', v_it, 'creado_at', now()))));
  IF (v_res->>'movimientos_producto')::int IS DISTINCT FROM 1 OR v_res ? '_errores' THEN RAISE EXCEPTION '3d: el push falló: %', v_res; END IF;
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_pla) <> v_ini - 1 THEN
    RAISE EXCEPTION '3d: la venta subida debía bajar la existencia una vez'; END IF;
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'cancelar_ticket', 'venta.cancelar_pagada', 'ticket', v_tk, 'smoke')
  RETURNING id INTO v_auth;
  PERFORM cancelar_ticket_pagado(
    p_ticket_id := v_tk, p_caja_id := v_caja, p_turno_id := v_turno,
    p_motivo := 'CLIENTE_DESISTIO'::cancelacion_motivo, p_motivo_texto := 'smoke',
    p_autorizacion_pin_id := v_auth, p_usuario_solicitante_id := v_maria, p_usuario_autorizo_id := v_maria,
    p_reversar_inventario := true, p_cancelar_cfdi_sat := false, p_devolver_dinero := false,
    p_client_id_local := 'smoke-c4-3d');
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_pla) <> v_ini THEN
    RAISE EXCEPTION '3d: cancelar en la nube debía dejar la existencia en %, es %', v_ini,
      (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_pla); END IF;
  IF (SELECT sum(cantidad) FROM movimientos_producto WHERE ticket_id = v_tk) <> 0 THEN
    RAISE EXCEPTION '3d: el neto del ticket cancelado debía ser 0'; END IF;
  RAISE NOTICE '3 sync de existencias OK';
END $$;

ROLLBACK;
