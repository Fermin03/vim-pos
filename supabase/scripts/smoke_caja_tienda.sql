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
  v_suc2  uuid; v_turno uuid; v_tk uuid; v_it uuid; v_auth uuid; v_ini numeric; v_res jsonb; v_snap jsonb; v_pull jsonb; v_tkm uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', v_t::text)::text, true);
  SELECT id INTO v_turno FROM turnos WHERE caja_id = v_caja AND estado = 'ABIERTO';
  v_ini := COALESCE((SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_pla), 0);
  -- 0196: la caja solo sube VENTA y DEVOLUCION de un ticket; este es el ticket de los movimientos de 3a, 3b y 3e.
  v_tkm := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-c4-3m', v_maria);

  -- 3a) Una VENTA de -1 aplica una vez; el mismo snapshot otra vez no duplica ni mueve la existencia.
  v_snap := jsonb_build_object('movimientos_producto', jsonb_build_array(jsonb_build_object(
    'id', v_m1, 'tenant_id', v_t, 'sucursal_id', v_suc, 'producto_id', v_pla, 'tipo', 'VENTA', 'cantidad', -1, 'ticket_id', v_tkm,
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
      'tipo', 'VENTA', 'cantidad', -1, 'ticket_id', v_tkm, 'creado_at', now() - interval '1 min'),
    jsonb_build_object('id', v_m3, 'tenant_id', v_t, 'sucursal_id', v_suc, 'producto_id', v_pla,
      'tipo', 'DEVOLUCION', 'cantidad', 5, 'ticket_id', v_tkm, 'creado_at', now()),
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
      'id', v_m6, 'tenant_id', v_t, 'sucursal_id', v_suc, 'producto_id', v_pla, 'tipo', 'VENTA', 'cantidad', -1, 'ticket_id', v_tkm, 'creado_at', now()))));
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

-- 4) Cambio de talla atómico: devolución parcial + venta nueva, en efectivo por lo que regresa.
DO $$
DECLARE
  v_t     uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc   uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja  uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria uuid := '99999999-0000-0000-0000-000000000001';
  v_cat   uuid := 'c4c40000-0000-0000-0000-0000000000c1';
  v_m     uuid := 'c4c40000-0000-0000-0000-0000000000d1';
  v_g     uuid := 'c4c40000-0000-0000-0000-0000000000d2';
  v_caro  uuid := 'c4c40000-0000-0000-0000-0000000000d3';
  v_bara  uuid := 'c4c40000-0000-0000-0000-0000000000d4';
  v_turno uuid; v_tk uuid; v_it uuid; v_auth uuid; v_res jsonb; v_nuevo uuid; v_dev uuid;
  v_ex_m numeric; v_ex_g numeric; v_caso text; v_tk_a uuid; v_it_a uuid; v_it_otro uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', v_t::text)::text, true);
  SELECT id INTO v_turno FROM turnos WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO productos (id, tenant_id, nombre, categoria_id, precio_base_mxn, controla_existencias) VALUES
    (v_m,    v_t, 'Polo M',     v_cat, 349, true),
    (v_g,    v_t, 'Polo G',     v_cat, 349, true),
    (v_caro, v_t, 'Polo Pima',  v_cat, 399, true),
    (v_bara, v_t, 'Polo Basic', v_cat, 299, true);
  INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad)
  SELECT v_t, v_suc, p, 'ENTRADA', 10 FROM unnest(ARRAY[v_m, v_g, v_caro, v_bara]) p;

  FOREACH v_caso IN ARRAY ARRAY['a', 'b', 'c'] LOOP
    -- Venta de una Polo M pagada en efectivo, y la autorización de devolverla.
    v_tk := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-c4-4' || v_caso, v_maria);
    v_it := agregar_item_a_ticket(v_tk, v_m, 1, NULL, '[]'::jsonb, 'smoke-c4-4' || v_caso || '-1');
    PERFORM aplicar_pago(v_tk, 'EFECTIVO'::metodo_pago, 349, 349, NULL, NULL, NULL, false, NULL, 'smoke-c4-4' || v_caso || '-pago');
    INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                    accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
    VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'devolucion', 'venta.devolucion', 'ticket', v_tk, 'smoke 4' || v_caso)
    RETURNING id INTO v_auth;
    v_ex_m := (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m);
    v_ex_g := (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_g);

    v_res := registrar_cambio_talla(v_tk,
      jsonb_build_array(jsonb_build_object('ticket_item_id', v_it, 'cantidad', 1)),
      jsonb_build_array(jsonb_build_object('producto_id', CASE v_caso WHEN 'a' THEN v_g WHEN 'b' THEN v_caro ELSE v_bara END, 'cantidad', 1)),
      v_caja, v_turno, v_maria, v_auth, v_maria, 'smoke-c4-cambio-' || v_caso);
    v_nuevo := (v_res->>'ticket_id')::uuid;
    v_dev   := (v_res->>'devolucion_id')::uuid;

    -- Comunes: devolución CONFIRMADA por cambio de talla, en efectivo, que regresa la M al anaquel.
    IF (SELECT (estado::text, motivo::text, medio_devolucion::text, total_devuelto_mxn) FROM devoluciones WHERE id = v_dev)
       IS DISTINCT FROM ('CONFIRMADA'::text, 'CAMBIO_TALLA'::text, 'EFECTIVO'::text, 349::numeric(12,2)) THEN
      RAISE EXCEPTION '4%: la devolución debía ser CONFIRMADA, CAMBIO_TALLA, EFECTIVO, $349', v_caso; END IF;
    IF (v_res->>'regresa_mxn')::numeric <> 349 THEN RAISE EXCEPTION '4%: regresa_mxn: %', v_caso, v_res; END IF;
    IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m) <> v_ex_m + 1 THEN
      RAISE EXCEPTION '4%: la M debía subir 1', v_caso; END IF;
    IF NOT EXISTS (SELECT 1 FROM movimientos_producto WHERE devolucion_id = v_dev AND tipo = 'DEVOLUCION' AND cantidad = 1) THEN
      RAISE EXCEPTION '4%: faltó el movimiento DEVOLUCION', v_caso; END IF;
    IF (SELECT (modo_servicio::text, sucursal_id, caja_id, turno_id, envio_cocina_automatico) FROM tickets WHERE id = v_nuevo)
       IS DISTINCT FROM ('PARA_LLEVAR'::text, v_suc, v_caja, v_turno, false) THEN
      RAISE EXCEPTION '4%: el ticket nuevo debía ser PARA_LLEVAR en la misma caja y turno, sin cocina', v_caso; END IF;
    IF (SELECT (metodo_pago::text, monto_mxn, nota::text) FROM pagos WHERE ticket_id = v_nuevo)
       IS DISTINCT FROM ('EFECTIVO'::text, LEAST(349, (v_res->>'lleva_mxn')::numeric)::numeric(12,2),
                         'Cambio de la venta ' || (SELECT folio_completo FROM tickets WHERE id = v_tk)) THEN
      RAISE EXCEPTION '4%: el pago del ticket nuevo no cuadra', v_caso; END IF;

    IF v_caso = 'a' THEN
      -- 4a) M por G de $349: sin diferencia, ticket PAGADO, la G baja 1.
      IF (v_res->>'diferencia_mxn')::numeric <> 0 THEN RAISE EXCEPTION '4a: diferencia: %', v_res; END IF;
      IF (SELECT estado_fiscal::text FROM tickets WHERE id = v_nuevo) <> 'PAGADO' THEN RAISE EXCEPTION '4a: debía quedar PAGADO'; END IF;
      IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_g) <> v_ex_g - 1 THEN
        RAISE EXCEPTION '4a: la G debía bajar 1'; END IF;
      IF NOT EXISTS (SELECT 1 FROM movimientos_producto WHERE ticket_id = v_nuevo AND producto_id = v_g AND tipo = 'VENTA' AND cantidad = -1) THEN
        RAISE EXCEPTION '4a: faltó la VENTA de la G'; END IF;
      IF (SELECT alcance::text FROM devoluciones WHERE id = v_dev) <> 'TOTAL' THEN RAISE EXCEPTION '4a: se regresó todo: TOTAL'; END IF;
      v_tk_a := v_tk; v_it_a := v_it;
    ELSIF v_caso = 'b' THEN
      -- 4b) Por una de $399: diferencia 50, ABIERTO con saldo 50; la VENTA llega al terminar el cobro.
      IF (v_res->>'diferencia_mxn')::numeric <> 50 THEN RAISE EXCEPTION '4b: diferencia: %', v_res; END IF;
      IF (SELECT (estado_fiscal::text, total_mxn - monto_pagado_mxn) FROM tickets WHERE id = v_nuevo)
         IS DISTINCT FROM ('ABIERTO'::text, 50::numeric(12,2)) THEN RAISE EXCEPTION '4b: debía quedar ABIERTO con saldo 50'; END IF;
      IF EXISTS (SELECT 1 FROM movimientos_producto WHERE ticket_id = v_nuevo) THEN RAISE EXCEPTION '4b: sin cobrar no hay VENTA'; END IF;
      PERFORM aplicar_pago(v_nuevo, 'TARJETA_DEBITO'::metodo_pago, 50, NULL, NULL, NULL, NULL, false, NULL, 'smoke-c4-4b-saldo');
      IF (SELECT estado_fiscal::text FROM tickets WHERE id = v_nuevo) <> 'PAGADO' THEN RAISE EXCEPTION '4b: el saldo debía cerrarlo'; END IF;
      IF NOT EXISTS (SELECT 1 FROM movimientos_producto WHERE ticket_id = v_nuevo AND producto_id = v_caro AND tipo = 'VENTA' AND cantidad = -1) THEN
        RAISE EXCEPTION '4b: faltó la VENTA al terminar el cobro'; END IF;
    ELSE
      -- 4c) Por una de $299: diferencia -50, PAGADO; sale $349 de devolución y entra $299: el cajón neto -50.
      IF (v_res->>'diferencia_mxn')::numeric <> -50 THEN RAISE EXCEPTION '4c: diferencia: %', v_res; END IF;
      IF (SELECT estado_fiscal::text FROM tickets WHERE id = v_nuevo) <> 'PAGADO' THEN RAISE EXCEPTION '4c: debía quedar PAGADO'; END IF;
      IF (SELECT sum(monto_mxn) FROM pagos WHERE ticket_id = v_nuevo AND metodo_pago = 'EFECTIVO')
         - (SELECT sum(monto_mxn) FROM movimientos_caja WHERE turno_id = v_turno AND tipo = 'DEVOLUCION_EFECTIVO'
              AND motivo = 'Devolución folio ' || (SELECT folio_completo FROM devoluciones WHERE id = v_dev)) <> -50 THEN
        RAISE EXCEPTION '4c: el neto en el cajón debía ser -50'; END IF;
    END IF;
  END LOOP;

  -- 4d) Rechazos sin dejar nada: facturada, renglón ajeno, cantidad de más (ya devuelta), otro negocio, nada que llevar.
  v_tk := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-c4-4d', v_maria);
  v_it := agregar_item_a_ticket(v_tk, v_m, 1, NULL, '[]'::jsonb, 'smoke-c4-4d-1');
  PERFORM aplicar_pago(v_tk, 'EFECTIVO'::metodo_pago, 349, 349, NULL, NULL, NULL, false, NULL, 'smoke-c4-4d-pago');
  v_it_otro := v_it_a;   -- renglón de la venta del 4a
  FOREACH v_caso IN ARRAY ARRAY['facturada', 'ajeno', 'de_mas', 'otro_negocio', 'vacio'] LOOP
    INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                    accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
    VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'devolucion', 'venta.devolucion', 'ticket',
            CASE WHEN v_caso = 'de_mas' THEN v_tk_a ELSE v_tk END, 'smoke 4d')
    RETURNING id INTO v_auth;
    BEGIN
      IF v_caso = 'facturada' THEN UPDATE tickets SET estado_fiscal = 'FACTURADO' WHERE id = v_tk; END IF;
      IF v_caso = 'otro_negocio' THEN
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', 'c4c40000-0000-0000-0000-0000000000ee')::text, true);
      END IF;
      PERFORM registrar_cambio_talla(
        CASE WHEN v_caso = 'de_mas' THEN v_tk_a ELSE v_tk END,
        jsonb_build_array(jsonb_build_object('ticket_item_id', CASE v_caso WHEN 'ajeno' THEN v_it_otro WHEN 'de_mas' THEN v_it_a ELSE v_it END, 'cantidad', 1)),
        CASE WHEN v_caso = 'vacio' THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('producto_id', v_g, 'cantidad', 1)) END,
        v_caja, v_turno, v_maria, v_auth, v_maria, 'smoke-c4-4d-' || v_caso);
      RAISE EXCEPTION '4d %: debía rechazarse', v_caso;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE EXCEPTION '4d %: error inesperado: %', v_caso, SQLERRM; END IF;
    END;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', v_t::text)::text, true);
    IF EXISTS (SELECT 1 FROM devoluciones WHERE client_id_local = 'smoke-c4-4d-' || v_caso)
       OR EXISTS (SELECT 1 FROM tickets WHERE client_id_local = 'smoke-c4-4d-' || v_caso) THEN
      RAISE EXCEPTION '4d %: quedó algo a medias', v_caso; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM devoluciones WHERE ticket_original_id = v_tk)
     OR (SELECT count(*) FROM devoluciones WHERE ticket_original_id = v_tk_a) <> 1 THEN
    RAISE EXCEPTION '4d: ninguna devolución nueva debía quedar'; END IF;
  RAISE NOTICE '4 cambio de talla OK';
END $$;

-- 5) 0196: la venta de un cambio, los candados de registrar_cambio_talla y lo que la caja sube.
DO $$
DECLARE
  v_t     uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc   uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja  uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria uuid := '99999999-0000-0000-0000-000000000001';
  v_cat   uuid := 'c4c40000-0000-0000-0000-0000000000c1';
  v_m     uuid := 'c4c40000-0000-0000-0000-0000000000d1';
  v_g     uuid := 'c4c40000-0000-0000-0000-0000000000d2';
  v_caro  uuid := 'c4c40000-0000-0000-0000-0000000000d3';
  v_cero  uuid := 'c4c40000-0000-0000-0000-0000000000d5';
  v_ajeno uuid := 'c4c40000-0000-0000-0000-0000000000f1';
  v_turno uuid; v_tk uuid; v_it uuid; v_tk2 uuid; v_it2 uuid; v_auth uuid; v_desc uuid; v_res jsonb; v_nuevo uuid; v_nit uuid;
  v_suc_b uuid; v_caja_b uuid; v_caso text; v_cant jsonb; v_mo uuid := gen_random_uuid(); v_ma uuid := gen_random_uuid();
  v_mu uuid := gen_random_uuid(); v_pago uuid;

BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', v_t::text)::text, true);
  SELECT id INTO v_turno FROM turnos WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO productos (id, tenant_id, nombre, categoria_id, precio_base_mxn, controla_existencias)
  VALUES (v_cero, v_t, 'Bolsa', v_cat, 0, true);
  INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad)
  SELECT v_t, v_suc, p, 'ENTRADA', 10 FROM unnest(ARRAY[v_m, v_g, v_caro, v_cero]) p;

  -- Dos ventas pagadas de una Polo M; la autorización sirve dentro de esta transacción.
  v_tk := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-c5-v1', v_maria);
  v_it := agregar_item_a_ticket(v_tk, v_m, 1, NULL, '[]'::jsonb, 'smoke-c5-v1-1');
  PERFORM aplicar_pago(v_tk, 'EFECTIVO'::metodo_pago, 349, 349, NULL, NULL, NULL, false, NULL, 'smoke-c5-v1-pago');
  v_tk2 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-c5-v2', v_maria);
  v_it2 := agregar_item_a_ticket(v_tk2, v_m, 1, NULL, '[]'::jsonb, 'smoke-c5-v2-1');
  PERFORM aplicar_pago(v_tk2, 'EFECTIVO'::metodo_pago, 349, 349, NULL, NULL, NULL, false, NULL, 'smoke-c5-v2-pago');
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'devolucion', 'venta.devolucion', 'ticket', 'smoke 5')
  RETURNING id INTO v_auth;

  -- 5a) Rechazos de registrar_cambio_talla, sin dejar nada: prenda sin precio, otra sucursal, llave
  --     nula y cantidades raras.
  INSERT INTO tenant_limites (tenant_id, max_sucursales) VALUES (v_t, 10) ON CONFLICT (tenant_id) DO UPDATE SET max_sucursales = 10;
  INSERT INTO sucursales (tenant_id, codigo, nombre) VALUES (v_t, 'S196', 'Otra tienda') RETURNING id INTO v_suc_b;
  INSERT INTO cajas (tenant_id, sucursal_id, numero, nombre) VALUES (v_t, v_suc_b, 1, 'Caja de la otra') RETURNING id INTO v_caja_b;
  FOREACH v_caso IN ARRAY ARRAY['sin_precio', 'otra_sucursal', 'sin_llave', 'infinito', 'decimales', 'texto'] LOOP
    v_cant := CASE v_caso WHEN 'infinito' THEN '"Infinity"'::jsonb WHEN 'decimales' THEN '1.0005'::jsonb
                          WHEN 'texto' THEN '"uno"'::jsonb ELSE '1'::jsonb END;
    BEGIN
      PERFORM registrar_cambio_talla(v_tk,
        jsonb_build_array(jsonb_build_object('ticket_item_id', v_it, 'cantidad', 1)),
        jsonb_build_array(jsonb_build_object('producto_id', CASE WHEN v_caso = 'sin_precio' THEN v_cero ELSE v_g END, 'cantidad', v_cant)),
        CASE WHEN v_caso = 'otra_sucursal' THEN v_caja_b ELSE v_caja END, v_turno, v_maria, v_auth, v_maria,
        CASE WHEN v_caso = 'sin_llave' THEN NULL ELSE 'smoke-c5-' || v_caso END);
      RAISE EXCEPTION '5a %: debía rechazarse', v_caso;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%'
         OR (v_caso = 'sin_precio' AND SQLERRM <> 'DATOS_INVALIDOS: la prenda que se lleva no tiene precio')
         OR (v_caso = 'otra_sucursal' AND SQLERRM <> 'DATOS_INVALIDOS: esa venta es de otra sucursal') THEN
        RAISE EXCEPTION '5a %: error inesperado: %', v_caso, SQLERRM; END IF;
    END;
  END LOOP;
  IF EXISTS (SELECT 1 FROM devoluciones WHERE ticket_original_id = v_tk) THEN RAISE EXCEPTION '5a: quedó una devolución a medias'; END IF;

  -- 5b) La misma llave con otra venta se rechaza (no devuelve el cambio de la primera).
  PERFORM registrar_cambio_talla(v_tk, jsonb_build_array(jsonb_build_object('ticket_item_id', v_it, 'cantidad', 1)),
    jsonb_build_array(jsonb_build_object('producto_id', v_g, 'cantidad', 1)), v_caja, v_turno, v_maria, v_auth, v_maria, 'smoke-c5-llave');
  BEGIN
    PERFORM registrar_cambio_talla(v_tk2, jsonb_build_array(jsonb_build_object('ticket_item_id', v_it2, 'cantidad', 1)),
      jsonb_build_array(jsonb_build_object('producto_id', v_g, 'cantidad', 1)), v_caja, v_turno, v_maria, v_auth, v_maria, 'smoke-c5-llave');
    RAISE EXCEPTION '5b: la llave de otra venta debía rechazarse';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE EXCEPTION '5b: error inesperado: %', SQLERRM; END IF; END;

  -- 5c) La venta de un cambio con saldo (M por Pima: paga 50) queda ABIERTA: no se le cancela ni
  --     reemplaza un renglón, no se le descuenta, no se borra.
  v_res := registrar_cambio_talla(v_tk2, jsonb_build_array(jsonb_build_object('ticket_item_id', v_it2, 'cantidad', 1)),
    jsonb_build_array(jsonb_build_object('producto_id', v_caro, 'cantidad', 1)), v_caja, v_turno, v_maria, v_auth, v_maria, 'smoke-c5-saldo');
  v_nuevo := (v_res->>'ticket_id')::uuid;
  SELECT id INTO v_nit FROM ticket_items WHERE ticket_id = v_nuevo;
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'descuento', 'descuento.manual_aplicar', 'ticket', 'smoke 5c')
  RETURNING id INTO v_desc;
  FOREACH v_caso IN ARRAY ARRAY['cancelar_item', 'reemplazar_item', 'descuento_ticket', 'descuento_renglon', 'borrar'] LOOP
    BEGIN
      IF v_caso = 'cancelar_item' THEN PERFORM cancelar_item_ticket(v_nit, 'smoke', NULL);
      ELSIF v_caso = 'reemplazar_item' THEN
        PERFORM reemplazar_item_ticket(v_nit, jsonb_build_array(jsonb_build_object('producto_id', v_caro, 'cantidad', 1, 'client_id_local', 'smoke-c5-r1')));
      ELSIF v_caso = 'descuento_ticket' THEN
        PERFORM aplicar_descuento_manual(v_nuevo, NULL, 'MONTO_FIJO'::descuento_manual_tipo, 10, 'OTRO'::descuento_manual_motivo, 'smoke', v_desc, v_maria, v_maria, NULL);
      ELSIF v_caso = 'descuento_renglon' THEN
        PERFORM aplicar_descuento_manual(v_nuevo, v_nit, 'MONTO_FIJO'::descuento_manual_tipo, 10, 'OTRO'::descuento_manual_motivo, 'smoke', v_desc, v_maria, v_maria, NULL);
      ELSE UPDATE tickets SET deleted_at = now(), deleted_by = v_maria WHERE id = v_nuevo;
      END IF;
      RAISE EXCEPTION '5c %: debía rechazarse', v_caso;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'DATOS_INVALIDOS: es la venta de un cambio: cóbrala o cancélala completa' THEN
        RAISE EXCEPTION '5c %: error inesperado: %', v_caso, SQLERRM; END IF;
    END;
  END LOOP;

  -- 5d) Cancelarla anula su pago interno ($349 en efectivo): el cajón regresa esos $349 al cliente.
  SELECT id INTO v_pago FROM pagos WHERE ticket_id = v_nuevo AND client_id_local = 'smoke-c5-saldo-pago';
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'cancelar_ticket', 'venta.cancelar_abierta', 'ticket', v_nuevo, 'smoke 5d')
  RETURNING id INTO v_auth;
  PERFORM cancelar_ticket_pagado(
    p_ticket_id := v_nuevo, p_caja_id := v_caja, p_turno_id := v_turno,
    p_motivo := 'CLIENTE_DESISTIO'::cancelacion_motivo, p_motivo_texto := 'smoke',
    p_autorizacion_pin_id := v_auth, p_usuario_solicitante_id := v_maria, p_usuario_autorizo_id := v_maria,
    p_reversar_inventario := true, p_cancelar_cfdi_sat := false, p_devolver_dinero := false,
    p_client_id_local := 'smoke-c5-cancela');
  IF (SELECT (estado::text, deleted_at IS NOT NULL) FROM pagos WHERE id = v_pago) IS DISTINCT FROM ('CANCELADO'::text, true) THEN
    RAISE EXCEPTION '5d: el pago interno debía quedar CANCELADO y borrado'; END IF;
  IF (SELECT estado_fiscal::text FROM tickets WHERE id = v_nuevo) <> 'CANCELADO' THEN RAISE EXCEPTION '5d: debía quedar CANCELADO'; END IF;

  -- 5e) Un renglón de un ticket CANCELADO no cambia de producto.
  BEGIN UPDATE ticket_items SET producto_id = v_g WHERE id = v_nit;
        RAISE EXCEPTION '5e: cambió el producto de un renglón cancelado';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS: no se cambia el producto%' THEN RAISE EXCEPTION '5e: %', SQLERRM; END IF; END;

  -- 5f) Push: la caja solo sube VENTA/DEVOLUCION de un ticket, con usuarios del negocio, y un id que
  --     ya existe en otro negocio es error (no se salta).
  INSERT INTO auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (v_ajeno, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ajeno-smoke-0196@prueba.test', '',
          now(), '{"provider":"email","providers":["email"]}', '{}');
  INSERT INTO movimientos_producto (id, tenant_id, sucursal_id, producto_id, tipo, cantidad)
  VALUES (v_mo, 'c4c40000-0000-0000-0000-0000000000ee', 'c4c40000-0000-0000-0000-0000000000b2',
          'c4c40000-0000-0000-0000-0000000000e1', 'ENTRADA', 1);
  v_res := sync_push_snapshot(v_t, jsonb_build_object('movimientos_producto', jsonb_build_array(
    jsonb_build_object('id', v_ma, 'tenant_id', v_t, 'sucursal_id', v_suc, 'producto_id', v_m, 'tipo', 'AJUSTE', 'cantidad', 3,
      'ticket_id', v_tk, 'creado_at', now()),
    jsonb_build_object('id', v_mu, 'tenant_id', v_t, 'sucursal_id', v_suc, 'producto_id', v_m, 'tipo', 'VENTA', 'cantidad', -1,
      'ticket_id', v_tk, 'usuario_id', v_ajeno, 'creado_at', now()),
    jsonb_build_object('id', v_mo, 'tenant_id', v_t, 'sucursal_id', v_suc, 'producto_id', v_m, 'tipo', 'VENTA', 'cantidad', -1,
      'ticket_id', v_tk, 'creado_at', now()))));
  IF (v_res->>'movimientos_producto')::int IS DISTINCT FROM 0 THEN RAISE EXCEPTION '5f: nada debía aplicarse: %', v_res; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(COALESCE(v_res->'_errores', '[]'::jsonb)) e
       WHERE e->>'id' IN (v_ma::text, v_mu::text, v_mo::text)) <> 3 THEN
    RAISE EXCEPTION '5f: los tres debían estar en _errores: %', v_res; END IF;
  IF EXISTS (SELECT 1 FROM movimientos_producto WHERE id IN (v_ma, v_mu)) THEN RAISE EXCEPTION '5f: no debían guardarse'; END IF;

  -- 5g) La función del disparador de tienda corre como su dueño.
  IF NOT (SELECT prosecdef FROM pg_proc WHERE proname = 'trg_tickets_tienda_sin_cocina') THEN
    RAISE EXCEPTION '5g: trg_tickets_tienda_sin_cocina debía ser SECURITY DEFINER'; END IF;
  RAISE NOTICE '5 ajustes 0196 OK';
END $$;

-- 6) 0197: la caja sube la ENTRADA de una recepción (sin ticket, costo ni proveedor) una sola vez.
DO $$
DECLARE
  v_t     uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc   uuid := '99999999-0000-0000-0000-0000000000bb';
  v_maria uuid := '99999999-0000-0000-0000-000000000001';
  v_gor   uuid := 'c4c40000-0000-0000-0000-0000000000a2';
  v_e1 uuid := gen_random_uuid(); v_e2 uuid := gen_random_uuid(); v_e3 uuid := gen_random_uuid(); v_e4 uuid := gen_random_uuid();
  v_e5 uuid := gen_random_uuid(); v_e6 uuid := gen_random_uuid(); v_e7 uuid := gen_random_uuid();
  v_prov uuid; v_ini numeric; v_res jsonb; v_snap jsonb; v_item uuid; v_dev uuid; v_tras uuid; v_suc2 uuid;
BEGIN
  INSERT INTO proveedores (tenant_id, nombre) VALUES (v_t, 'Proveedor smoke 0197') RETURNING id INTO v_prov;
  -- Referencias reales de este negocio (con una inventada fallaría la llave foránea, no la regla de la 0198).
  SELECT id INTO v_item FROM ticket_items WHERE tenant_id = v_t LIMIT 1;
  SELECT id INTO v_dev FROM devoluciones WHERE tenant_id = v_t LIMIT 1;
  INSERT INTO sucursales (tenant_id, codigo, nombre) VALUES (v_t, 'S198', 'Tercera tienda') RETURNING id INTO v_suc2;
  INSERT INTO traspasos_producto (tenant_id, origen_sucursal_id, destino_sucursal_id, lineas)
  VALUES (v_t, v_suc2, v_suc, '[{"producto_id": "c4c40000-0000-0000-0000-0000000000a2", "cantidad": 1}]') RETURNING id INTO v_tras;
  IF v_item IS NULL OR v_dev IS NULL THEN RAISE EXCEPTION '6: faltan un renglón y una devolución de la semilla'; END IF;
  v_ini := COALESCE((SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_gor), 0);

  -- 6a) Aplica una vez y mueve la existencia; reenviada no duplica ni da error.
  v_snap := jsonb_build_object('movimientos_producto', jsonb_build_array(jsonb_build_object(
    'id', v_e1, 'tenant_id', v_t, 'sucursal_id', v_suc, 'producto_id', v_gor, 'tipo', 'ENTRADA', 'cantidad', 4,
    'motivo', 'Recepción de mercancía', 'usuario_id', v_maria, 'creado_at', now())));
  v_res := sync_push_snapshot(v_t, v_snap);
  IF (v_res->>'movimientos_producto')::int IS DISTINCT FROM 1 THEN RAISE EXCEPTION '6a: debía aplicar 1: %', v_res; END IF;
  v_res := sync_push_snapshot(v_t, v_snap);
  IF (v_res->>'movimientos_producto')::int IS DISTINCT FROM 0
     OR jsonb_array_length(COALESCE(v_res->'_errores', '[]'::jsonb)) > 0 THEN
    RAISE EXCEPTION '6a: el reenvío debía aplicar 0 sin errores: %', v_res; END IF;
  IF (SELECT count(*) FROM movimientos_producto WHERE id = v_e1) <> 1 THEN RAISE EXCEPTION '6a: la entrada se duplicó'; END IF;
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_gor) <> v_ini + 4 THEN
    RAISE EXCEPTION '6a: la existencia debía quedar en %', v_ini + 4; END IF;

  -- 6b) Con costo, con proveedor, con cantidad no positiva o con renglón, devolución o traspaso (0198): a errores, sin guardarse.
  v_res := sync_push_snapshot(v_t, jsonb_build_object('movimientos_producto', jsonb_build_array(
    jsonb_build_object('id', v_e2, 'tenant_id', v_t, 'sucursal_id', v_suc, 'producto_id', v_gor, 'tipo', 'ENTRADA', 'cantidad', 2,
      'costo_unitario_mxn', 50, 'usuario_id', v_maria, 'creado_at', now()),
    jsonb_build_object('id', v_e3, 'tenant_id', v_t, 'sucursal_id', v_suc, 'producto_id', v_gor, 'tipo', 'ENTRADA', 'cantidad', 2,
      'proveedor_id', v_prov, 'usuario_id', v_maria, 'creado_at', now()),
    jsonb_build_object('id', v_e4, 'tenant_id', v_t, 'sucursal_id', v_suc, 'producto_id', v_gor, 'tipo', 'ENTRADA', 'cantidad', -2,
      'usuario_id', v_maria, 'creado_at', now()),
    jsonb_build_object('id', v_e5, 'tenant_id', v_t, 'sucursal_id', v_suc, 'producto_id', v_gor, 'tipo', 'ENTRADA', 'cantidad', 2,
      'ticket_item_id', v_item, 'usuario_id', v_maria, 'creado_at', now()),
    jsonb_build_object('id', v_e6, 'tenant_id', v_t, 'sucursal_id', v_suc, 'producto_id', v_gor, 'tipo', 'ENTRADA', 'cantidad', 2,
      'devolucion_id', v_dev, 'usuario_id', v_maria, 'creado_at', now()),
    jsonb_build_object('id', v_e7, 'tenant_id', v_t, 'sucursal_id', v_suc, 'producto_id', v_gor, 'tipo', 'ENTRADA', 'cantidad', 2,
      'traspaso_id', v_tras, 'usuario_id', v_maria, 'creado_at', now()))));
  IF (v_res->>'movimientos_producto')::int IS DISTINCT FROM 0 THEN RAISE EXCEPTION '6b: nada debía aplicarse: %', v_res; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(COALESCE(v_res->'_errores', '[]'::jsonb)) e
       WHERE e->>'id' IN (v_e2::text, v_e3::text, v_e4::text, v_e5::text, v_e6::text, v_e7::text)) <> 6 THEN
    RAISE EXCEPTION '6b: los seis debían estar en _errores: %', v_res; END IF;
  IF EXISTS (SELECT 1 FROM movimientos_producto WHERE id IN (v_e2, v_e3, v_e4, v_e5, v_e6, v_e7)) THEN RAISE EXCEPTION '6b: no debían guardarse'; END IF;
  RAISE NOTICE '6 entradas de la caja 0197 OK';
END $$;

-- 7) 0200: el cambio de talla no suma ni resta lealtad, y su venta abierta no lleva promoción ni canje.
DO $$
DECLARE
  v_t     uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc   uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja  uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria uuid := '99999999-0000-0000-0000-000000000001';
  v_cat   uuid := 'c4c40000-0000-0000-0000-0000000000c1';
  v_c300  uuid := 'c4c40000-0000-0000-0000-0000000000d6';
  v_c350  uuid := 'c4c40000-0000-0000-0000-0000000000d7';
  v_c350b uuid := 'c4c40000-0000-0000-0000-0000000000d8';
  v_turno uuid; v_cli uuid; v_tk uuid; v_it uuid; v_it2 uuid; v_auth uuid; v_res jsonb; v_nuevo uuid; v_nit uuid;
  v_saldo integer; v_movs bigint; v_efe numeric; v_promo uuid; v_dev uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', v_t::text)::text, true);
  SELECT id INTO v_turno FROM turnos WHERE caja_id = v_caja AND estado = 'ABIERTO';
  -- Lealtad como en smoke_lealtad_ganar.sql: add-on, programa (10 %, tope holgado) e interruptor.
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
  SELECT v_t, id, (now() AT TIME ZONE 'America/Mexico_City')::date, true, 100 FROM addons WHERE codigo = 'LEALTAD';
  INSERT INTO lealtad_programa (tenant_id, mecanica, porcentaje, tope_compras_dia) VALUES (v_t, 'PUNTOS_DINERO', 10, 50);
  INSERT INTO configuracion_tenant (tenant_id, modulo_lealtad_activo) VALUES (v_t, true)
  ON CONFLICT (tenant_id) DO UPDATE SET modulo_lealtad_activo = true;
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_t, 'Cliente cambio 0200', '4770002000') RETURNING id INTO v_cli;
  INSERT INTO productos (id, tenant_id, nombre, categoria_id, precio_base_mxn, controla_existencias) VALUES
    (v_c300,  v_t, 'Camisa 300',   v_cat, 300, true),
    (v_c350,  v_t, 'Camisa 350',   v_cat, 350, true),
    (v_c350b, v_t, 'Camisa 350 B', v_cat, 350, true);
  INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad)
  SELECT v_t, v_suc, p, 'ENTRADA', 10 FROM unnest(ARRAY[v_c300, v_c350, v_c350b]) p;

  -- 7a) La venta gana 30. Su cambio (lleva 350, regresa 300, cobra 50) no gana ni le quita los 30;
  --     cancelar después la venta del cambio devolviendo el dinero sí se los quita (0204, Fermín 18 oct).
  v_tk := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-c7a', v_maria);
  v_it := agregar_item_a_ticket(v_tk, v_c300, 1, NULL, '[]'::jsonb, 'smoke-c7a-1');
  PERFORM aplicar_pago(v_tk, 'EFECTIVO'::metodo_pago, 300, 300, NULL, NULL, NULL, false, NULL, 'smoke-c7a-pago');
  IF lealtad_neto_ganado(v_tk) <> 30 THEN RAISE EXCEPTION '7a: la venta debía ganar 30, ganó %', lealtad_neto_ganado(v_tk); END IF;
  SELECT saldo INTO v_saldo FROM lealtad_saldos WHERE cliente_id = v_cli;
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'devolucion', 'venta.devolucion', 'ticket', v_tk, 'smoke 7a')
  RETURNING id INTO v_auth;
  v_res := registrar_cambio_talla(v_tk, jsonb_build_array(jsonb_build_object('ticket_item_id', v_it, 'cantidad', 1)),
    jsonb_build_array(jsonb_build_object('producto_id', v_c350, 'cantidad', 1)), v_caja, v_turno, v_maria, v_auth, v_maria, 'smoke-c7a-cambio');
  v_nuevo := (v_res->>'ticket_id')::uuid;
  IF (v_res->>'diferencia_mxn')::numeric <> 50 THEN RAISE EXCEPTION '7a: diferencia: %', v_res; END IF;
  PERFORM aplicar_pago(v_nuevo, 'EFECTIVO'::metodo_pago, 50, 50, NULL, NULL, NULL, false, NULL, 'smoke-c7a-saldo');
  IF (SELECT estado_fiscal::text FROM tickets WHERE id = v_nuevo) <> 'PAGADO' THEN RAISE EXCEPTION '7a: el saldo debía cerrarlo'; END IF;
  IF EXISTS (SELECT 1 FROM lealtad_movimientos WHERE ticket_id = v_nuevo AND tipo = 'GANADO') THEN
    RAISE EXCEPTION '7a: la venta del cambio ganó puntos'; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli) <> v_saldo THEN
    RAISE EXCEPTION '7a: el saldo debía seguir en %, es %', v_saldo, (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli); END IF;
  IF lealtad_neto_ganado(v_tk) <> 30 THEN RAISE EXCEPTION '7a: la devolución del cambio revirtió la venta'; END IF;
  SELECT count(*) INTO v_movs FROM lealtad_movimientos WHERE cliente_id = v_cli;
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'cancelar_ticket', 'venta.cancelar_pagada', 'ticket', v_nuevo, 'smoke 7a')
  RETURNING id INTO v_auth;
  PERFORM cancelar_ticket_pagado(
    p_ticket_id := v_nuevo, p_caja_id := v_caja, p_turno_id := v_turno,
    p_motivo := 'CLIENTE_DESISTIO'::cancelacion_motivo, p_motivo_texto := 'smoke',
    p_autorizacion_pin_id := v_auth, p_usuario_solicitante_id := v_maria, p_usuario_autorizo_id := v_maria,
    p_reversar_inventario := true, p_cancelar_cfdi_sat := false, p_devolver_dinero := true,
    p_client_id_local := 'smoke-c7a-cancela');
  IF (SELECT estado_fiscal::text FROM tickets WHERE id = v_nuevo) <> 'CANCELADO' THEN RAISE EXCEPTION '7a: debía quedar CANCELADO'; END IF;
  IF lealtad_neto_ganado(v_tk) <> 0 OR (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli) <> v_saldo - 30 THEN
    RAISE EXCEPTION '7a: cancelar con dinero la venta del cambio debía quitar los 30 de la venta original'; END IF;

  -- 7b) Venta → cambio (cobra 50 en efectivo) → cambio de ese cambio (mismo precio). Los puntos no se
  --     mueven; el efectivo esperado sube solo los 50: en cada cambio, como en 4a/4b, sale y entra lo mismo.
  v_tk := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-c7b', v_maria);
  v_it := agregar_item_a_ticket(v_tk, v_c300, 1, NULL, '[]'::jsonb, 'smoke-c7b-1');
  PERFORM aplicar_pago(v_tk, 'EFECTIVO'::metodo_pago, 300, 300, NULL, NULL, NULL, false, NULL, 'smoke-c7b-pago');
  SELECT saldo INTO v_saldo FROM lealtad_saldos WHERE cliente_id = v_cli;
  SELECT count(*) INTO v_movs FROM lealtad_movimientos WHERE cliente_id = v_cli;
  v_efe := calcular_efectivo_esperado(v_turno);
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'devolucion', 'venta.devolucion', 'ticket', v_tk, 'smoke 7b')
  RETURNING id INTO v_auth;
  v_res := registrar_cambio_talla(v_tk, jsonb_build_array(jsonb_build_object('ticket_item_id', v_it, 'cantidad', 1)),
    jsonb_build_array(jsonb_build_object('producto_id', v_c350, 'cantidad', 1)), v_caja, v_turno, v_maria, v_auth, v_maria, 'smoke-c7b-cambio1');
  v_nuevo := (v_res->>'ticket_id')::uuid;
  IF calcular_efectivo_esperado(v_turno) <> v_efe THEN RAISE EXCEPTION '7b: el cambio con saldo debía dejar el efectivo igual'; END IF;
  PERFORM aplicar_pago(v_nuevo, 'EFECTIVO'::metodo_pago, 50, 50, NULL, NULL, NULL, false, NULL, 'smoke-c7b-saldo');
  IF calcular_efectivo_esperado(v_turno) <> v_efe + 50 THEN RAISE EXCEPTION '7b: el saldo en efectivo debía sumar 50'; END IF;
  SELECT id INTO v_nit FROM ticket_items WHERE ticket_id = v_nuevo;
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'devolucion', 'venta.devolucion', 'ticket', v_nuevo, 'smoke 7b2')
  RETURNING id INTO v_auth;
  v_res := registrar_cambio_talla(v_nuevo, jsonb_build_array(jsonb_build_object('ticket_item_id', v_nit, 'cantidad', 1)),
    jsonb_build_array(jsonb_build_object('producto_id', v_c350b, 'cantidad', 1)), v_caja, v_turno, v_maria, v_auth, v_maria, 'smoke-c7b-cambio2');
  IF (v_res->>'diferencia_mxn')::numeric <> 0
     OR (SELECT estado_fiscal::text FROM tickets WHERE id = (v_res->>'ticket_id')::uuid) <> 'PAGADO' THEN
    RAISE EXCEPTION '7b: el cambio del cambio debía quedar PAGADO sin diferencia: %', v_res; END IF;
  IF calcular_efectivo_esperado(v_turno) <> v_efe + 50 THEN RAISE EXCEPTION '7b: el cambio del cambio debía dejar el efectivo igual'; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli) <> v_saldo
     OR (SELECT count(*) FROM lealtad_movimientos WHERE cliente_id = v_cli) <> v_movs THEN
    RAISE EXCEPTION '7b: la cadena de cambios movió puntos'; END IF;

  -- 7f) Con la venta de un cambio ABIERTA (lleva 350, regresa 300): ni promoción ni canje.
  v_tk := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-c7f', v_maria);
  v_it := agregar_item_a_ticket(v_tk, v_c300, 1, NULL, '[]'::jsonb, 'smoke-c7f-1');
  PERFORM aplicar_pago(v_tk, 'EFECTIVO'::metodo_pago, 300, 300, NULL, NULL, NULL, false, NULL, 'smoke-c7f-pago');
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'devolucion', 'venta.devolucion', 'ticket', v_tk, 'smoke 7f')
  RETURNING id INTO v_auth;
  v_res := registrar_cambio_talla(v_tk, jsonb_build_array(jsonb_build_object('ticket_item_id', v_it, 'cantidad', 1)),
    jsonb_build_array(jsonb_build_object('producto_id', v_c350, 'cantidad', 1)), v_caja, v_turno, v_maria, v_auth, v_maria, 'smoke-c7f-cambio');
  v_nuevo := (v_res->>'ticket_id')::uuid;
  IF (SELECT estado_fiscal::text FROM tickets WHERE id = v_nuevo) <> 'ABIERTO' THEN RAISE EXCEPTION '7f: debía quedar ABIERTO'; END IF;
  INSERT INTO promociones (tenant_id, nombre, tipo, alcance, valor_monto_mxn)
  VALUES (v_t, 'SMOKE 0200 — $10 al ticket', 'MONTO_FIJO', 'TICKET_COMPLETO', 10) RETURNING id INTO v_promo;
  BEGIN
    PERFORM aplicar_promocion(v_nuevo, v_promo, NULL);
    RAISE EXCEPTION '7f promoción: debía rechazarse';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'DATOS_INVALIDOS: es la venta de un cambio: cóbrala o cancélala completa' THEN
      RAISE EXCEPTION '7f promoción: error inesperado: %', SQLERRM; END IF;
  END;
  BEGIN
    PERFORM lealtad_asentar_canje(jsonb_build_object('canje_id', gen_random_uuid(), 'tenant_id', v_t, 'ticket_id', v_nuevo,
      'cliente_id', v_cli, 'puntos', 10, 'monto_mxn', 10, 'programa_version', (SELECT version FROM lealtad_programa WHERE tenant_id = v_t)));
    RAISE EXCEPTION '7f canje: debía rechazarse';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'DATOS_INVALIDOS: es la venta de un cambio: cóbrala o cancélala completa' THEN
      RAISE EXCEPTION '7f canje: error inesperado: %', SQLERRM; END IF;
  END;
  -- En una venta abierta cualquiera las dos sí entran: el candado es solo de la venta de un cambio.
  v_tk := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-c7f-normal', v_maria);
  PERFORM agregar_item_a_ticket(v_tk, v_c350, 1, NULL, '[]'::jsonb, 'smoke-c7f-normal-1');
  PERFORM aplicar_promocion(v_tk, v_promo, NULL);
  PERFORM lealtad_asentar_canje(jsonb_build_object('canje_id', gen_random_uuid(), 'tenant_id', v_t, 'ticket_id', v_tk,
    'cliente_id', v_cli, 'puntos', 10, 'monto_mxn', 10, 'programa_version', (SELECT version FROM lealtad_programa WHERE tenant_id = v_t)));
  IF (SELECT total_mxn FROM tickets WHERE id = v_tk) <> 330 THEN
    RAISE EXCEPTION '7f: la venta normal debía quedar en 330, quedó %', (SELECT total_mxn FROM tickets WHERE id = v_tk); END IF;

  -- 7r) Regresión: una devolución por otro motivo sigue revirtiendo en proporción. 300 + 350 = 650
  --     gana 65; devolver la de 300 revierte ceil(65 × 300/650) = 30.
  v_tk := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-c7r', v_maria);
  v_it := agregar_item_a_ticket(v_tk, v_c300, 1, NULL, '[]'::jsonb, 'smoke-c7r-1');
  v_it2 := agregar_item_a_ticket(v_tk, v_c350, 1, NULL, '[]'::jsonb, 'smoke-c7r-2');
  PERFORM aplicar_pago(v_tk, 'EFECTIVO'::metodo_pago, 650, 650, NULL, NULL, NULL, false, NULL, 'smoke-c7r-pago');
  IF lealtad_neto_ganado(v_tk) <> 65 THEN RAISE EXCEPTION '7r: debía ganar 65, ganó %', lealtad_neto_ganado(v_tk); END IF;
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'devolucion', 'venta.devolucion', 'ticket', v_tk, 'smoke 7r')
  RETURNING id INTO v_auth;
  v_dev := crear_devolucion(
    p_ticket_original_id := v_tk, p_caja_id := v_caja, p_turno_id := v_turno,
    p_alcance := 'PARCIAL'::devolucion_alcance, p_motivo := 'PRODUCTO_DEFECTUOSO'::devolucion_motivo,
    p_motivo_texto := 'smoke 7r', p_medio_devolucion := 'EFECTIVO'::devolucion_medio,
    p_autorizacion_pin_id := v_auth, p_usuario_solicitante_id := v_maria, p_usuario_autorizo_id := v_maria,
    p_items := jsonb_build_array(jsonb_build_object('ticket_item_id', v_it, 'cantidad_devuelta', 1)),
    p_reversar_inventario := false, p_nota := 'smoke 7r');
  PERFORM confirmar_devolucion(v_dev, v_maria);
  IF lealtad_neto_ganado(v_tk) <> 35 THEN RAISE EXCEPTION '7r: debía quedar en 35, quedó %', lealtad_neto_ganado(v_tk); END IF;

  -- 7g) El cajero puede ejecutar la ayudante (la usan funciones SECURITY INVOKER; ver la 0199).
  IF NOT has_function_privilege('authenticated', '_ticket_es_de_cambio(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '7g: authenticated debía poder ejecutar _ticket_es_de_cambio'; END IF;
  RAISE NOTICE '7 cambio sin lealtad 0200 OK';
END $$;

-- 8) 0201: reabrir y cambiar el pago de la venta de un cambio respetan su pago interno (la prenda
--    devuelta): nunca se cancela ni cambia de método, y el efectivo esperado sigue cuadrando.
DO $$
DECLARE
  v_t     uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc   uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja  uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria uuid := '99999999-0000-0000-0000-000000000001';
  v_c300  uuid := 'c4c40000-0000-0000-0000-0000000000d6';   -- de §7
  v_c350  uuid := 'c4c40000-0000-0000-0000-0000000000d7';
  v_turno uuid; v_cli uuid; v_tk uuid; v_it uuid; v_auth uuid; v_res jsonb; v_igual uuid; v_saldo uuid; v_dividido uuid;
  v_interno uuid; v_pago_saldo uuid; v_pago_saldo2 uuid; v_efe numeric; v_snap jsonb; v_caso text; v_editar uuid; v_normal uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', v_t::text)::text, true);
  SELECT id INTO v_turno FROM turnos WHERE caja_id = v_caja AND estado = 'ABIERTO';
  -- Con cliente y lealtad prendida (§7): reabrir y volver a cerrar no debe dar puntos.
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_t, 'Cliente cambio 0201', '4770002010') RETURNING id INTO v_cli;
  INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad)
  SELECT v_t, v_suc, p, 'ENTRADA', 10 FROM unnest(ARRAY[v_c300, v_c350]) p;
  -- Sin entidad, la autorización sirve para todo el smoke (misma transacción; ver consumir_autorizacion).
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'editar_post_cobro', 'venta.editar_post_cobro', 'ticket', 'smoke 8')
  RETURNING id INTO v_editar;

  -- Cuatro cambios: lleva ≤ regresa (8c), lleva > regresa (8c'/8d), saldo en dos pagos (8d) y uno para el push (8e).
  FOREACH v_caso IN ARRAY ARRAY['igual', 'saldo', 'dividido', 'push'] LOOP
    v_tk := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-c8-' || v_caso, v_maria);
    v_it := agregar_item_a_ticket(v_tk, CASE WHEN v_caso = 'igual' THEN v_c350 ELSE v_c300 END, 1, NULL, '[]'::jsonb, 'smoke-c8-' || v_caso || '-1');
    PERFORM aplicar_pago(v_tk, 'EFECTIVO'::metodo_pago, CASE WHEN v_caso = 'igual' THEN 350 ELSE 300 END, NULL, NULL, NULL, NULL, false, NULL,
                         'smoke-c8-' || v_caso || '-pago');
    INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                    accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
    VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'devolucion', 'venta.devolucion', 'ticket', v_tk, 'smoke 8')
    RETURNING id INTO v_auth;
    v_res := registrar_cambio_talla(v_tk, jsonb_build_array(jsonb_build_object('ticket_item_id', v_it, 'cantidad', 1)),
      jsonb_build_array(jsonb_build_object('producto_id', CASE WHEN v_caso = 'igual' THEN v_c300 ELSE v_c350 END, 'cantidad', 1)),
      v_caja, v_turno, v_maria, v_auth, v_maria, 'smoke-c8-cambio-' || v_caso);
    CASE v_caso
      WHEN 'igual' THEN v_igual := (v_res->>'ticket_id')::uuid;
      WHEN 'saldo' THEN v_saldo := (v_res->>'ticket_id')::uuid;
      WHEN 'dividido' THEN v_dividido := (v_res->>'ticket_id')::uuid;
      ELSE v_tk := (v_res->>'ticket_id')::uuid;   -- push
    END CASE;
  END LOOP;
  PERFORM aplicar_pago(v_saldo, 'EFECTIVO'::metodo_pago, 50, 50, NULL, NULL, NULL, false, NULL, 'smoke-c8-saldo-saldo');
  PERFORM aplicar_pago(v_dividido, 'EFECTIVO'::metodo_pago, 20, 20, NULL, NULL, NULL, false, NULL, 'smoke-c8-dividido-saldo1');
  PERFORM aplicar_pago(v_dividido, 'TARJETA_DEBITO'::metodo_pago, 30, NULL, NULL, NULL, NULL, false, NULL, 'smoke-c8-dividido-saldo2');
  PERFORM aplicar_pago(v_tk, 'EFECTIVO'::metodo_pago, 50, 50, NULL, NULL, NULL, false, NULL, 'smoke-c8-push-saldo');
  IF EXISTS (SELECT 1 FROM tickets WHERE id IN (v_igual, v_saldo, v_dividido, v_tk) AND estado_fiscal <> 'PAGADO') THEN
    RAISE EXCEPTION '8: las cuatro ventas de cambio debían quedar PAGADAS'; END IF;

  -- 8c) Lleva ≤ regresa (350 por 300): reabrir deja el pago interno APLICADO, nada pendiente y el
  --     esperado igual; cerrar_ticket_si_pagado la regresa a PAGADO sin puntos.
  SELECT id INTO v_interno FROM pagos WHERE ticket_id = v_igual AND client_id_local = 'smoke-c8-cambio-igual-pago';
  v_efe := calcular_efectivo_esperado(v_turno);
  PERFORM reabrir_ticket_pagado(v_igual, 'smoke 8c', v_editar);
  IF (SELECT estado_fiscal::text FROM tickets WHERE id = v_igual) <> 'ABIERTO' THEN RAISE EXCEPTION '8c: debía quedar ABIERTO'; END IF;
  IF (SELECT (estado::text, deleted_at IS NULL) FROM pagos WHERE id = v_interno) IS DISTINCT FROM ('APLICADO'::text, true) THEN
    RAISE EXCEPTION '8c: el pago interno debía seguir APLICADO'; END IF;
  IF (SELECT monto_pendiente_mxn FROM tickets WHERE id = v_igual) <> 0 THEN
    RAISE EXCEPTION '8c: no debía quedar nada pendiente, quedó %', (SELECT monto_pendiente_mxn FROM tickets WHERE id = v_igual); END IF;
  IF calcular_efectivo_esperado(v_turno) <> v_efe THEN RAISE EXCEPTION '8c: el esperado no debía moverse'; END IF;
  IF NOT cerrar_ticket_si_pagado(v_igual) THEN RAISE EXCEPTION '8c: cerrar_ticket_si_pagado debía cerrarla'; END IF;
  IF (SELECT estado_fiscal::text FROM tickets WHERE id = v_igual) <> 'PAGADO' THEN RAISE EXCEPTION '8c: debía volver a PAGADO'; END IF;
  IF EXISTS (SELECT 1 FROM lealtad_movimientos WHERE ticket_id = v_igual) THEN RAISE EXCEPTION '8c: la venta del cambio movió puntos'; END IF;

  -- 8c') Lleva > regresa (300 por 350): se cancela solo el pago del saldo; pendiente 50 y el esperado
  --      baja 50. Cobrar el saldo otra vez la deja PAGADA y el esperado vuelve.
  SELECT id INTO v_interno FROM pagos WHERE ticket_id = v_saldo AND client_id_local = 'smoke-c8-cambio-saldo-pago';
  SELECT id INTO v_pago_saldo FROM pagos WHERE ticket_id = v_saldo AND client_id_local = 'smoke-c8-saldo-saldo';
  v_efe := calcular_efectivo_esperado(v_turno);
  PERFORM reabrir_ticket_pagado(v_saldo, 'smoke 8c''', v_editar);
  IF (SELECT estado::text FROM pagos WHERE id = v_interno) <> 'APLICADO' OR (SELECT estado::text FROM pagos WHERE id = v_pago_saldo) <> 'CANCELADO' THEN
    RAISE EXCEPTION '8c'': debía cancelarse solo el pago del saldo'; END IF;
  IF (SELECT (estado_fiscal::text, monto_pendiente_mxn) FROM tickets WHERE id = v_saldo) IS DISTINCT FROM ('ABIERTO'::text, 50::numeric(12,2)) THEN
    RAISE EXCEPTION '8c'': debía quedar ABIERTA con 50 pendientes'; END IF;
  IF calcular_efectivo_esperado(v_turno) <> v_efe - 50 THEN RAISE EXCEPTION '8c'': el esperado debía bajar solo los 50 del saldo'; END IF;
  PERFORM aplicar_pago(v_saldo, 'EFECTIVO'::metodo_pago, 50, 50, NULL, NULL, NULL, false, NULL, 'smoke-c8-saldo-saldo2');
  IF (SELECT estado_fiscal::text FROM tickets WHERE id = v_saldo) <> 'PAGADO' THEN RAISE EXCEPTION '8c'': cobrar el saldo debía cerrarla'; END IF;
  IF calcular_efectivo_esperado(v_turno) <> v_efe THEN RAISE EXCEPTION '8c'': el esperado debía volver'; END IF;

  -- 8d) Cambiar el pago: el del saldo pasa a TARJETA y el interno sigue EFECTIVO; sin saldo, el
  --     mensaje nuevo; con el saldo en dos pagos, el «pago dividido» de siempre.
  PERFORM cambiar_forma_pago_ticket(v_saldo, 'TARJETA_DEBITO'::metodo_pago, NULL, v_editar);
  IF (SELECT metodo_pago::text FROM pagos WHERE id = v_interno) <> 'EFECTIVO'
     OR (SELECT metodo_pago::text FROM pagos WHERE ticket_id = v_saldo AND client_id_local = 'smoke-c8-saldo-saldo2') <> 'TARJETA_DEBITO' THEN
    RAISE EXCEPTION '8d: el saldo debía pasar a TARJETA y el interno seguir en EFECTIVO'; END IF;
  BEGIN
    PERFORM cambiar_forma_pago_ticket(v_igual, 'TARJETA_DEBITO'::metodo_pago, NULL, v_editar);
    RAISE EXCEPTION '8d igual: debía rechazarse';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'DATOS_INVALIDOS: esta venta se pagó con la prenda devuelta; no hay pago que cambiar' THEN
      RAISE EXCEPTION '8d igual: error inesperado: %', SQLERRM; END IF;
  END;
  BEGIN
    PERFORM cambiar_forma_pago_ticket(v_dividido, 'TARJETA_CREDITO'::metodo_pago, NULL, v_editar);
    RAISE EXCEPTION '8d dividido: debía rechazarse';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'La cuenta tiene pago dividido%' THEN RAISE EXCEPTION '8d dividido: error inesperado: %', SQLERRM; END IF;
  END;
  -- Regresión: en una venta normal, un pago sin client_id_local sí se cambia.
  v_normal := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-c8-normal', v_maria);
  PERFORM agregar_item_a_ticket(v_normal, v_c300, 1, NULL, '[]'::jsonb, 'smoke-c8-normal-1');
  PERFORM aplicar_pago(v_normal, 'EFECTIVO'::metodo_pago, 300, 300, NULL, NULL, NULL, false, NULL, NULL);
  PERFORM cambiar_forma_pago_ticket(v_normal, 'TARJETA_DEBITO'::metodo_pago, NULL, v_editar);
  IF (SELECT metodo_pago::text FROM pagos WHERE ticket_id = v_normal AND client_id_local IS NULL) IS DISTINCT FROM 'TARJETA_DEBITO' THEN
    RAISE EXCEPTION '8d normal: el pago sin client_id_local debía pasar a TARJETA'; END IF;

  -- 8e) Push: la caja reabre y cobra otra vez; la nube (aquí, el estado de antes, recuperado al
  --     deshacer el bloque) recibe ese ticket y sus pagos. El interno sigue APLICADO y el esperado coincide.
  SELECT id INTO v_interno FROM pagos WHERE ticket_id = v_tk AND client_id_local = 'smoke-c8-cambio-push-pago';
  SELECT id INTO v_pago_saldo FROM pagos WHERE ticket_id = v_tk AND client_id_local = 'smoke-c8-push-saldo';
  BEGIN
    PERFORM reabrir_ticket_pagado(v_tk, 'smoke 8e', v_editar);
    PERFORM aplicar_pago(v_tk, 'EFECTIVO'::metodo_pago, 50, 50, NULL, NULL, NULL, false, NULL, 'smoke-c8-push-saldo2');
    SELECT id INTO v_pago_saldo2 FROM pagos WHERE ticket_id = v_tk AND client_id_local = 'smoke-c8-push-saldo2';
    v_efe := calcular_efectivo_esperado(v_turno);
    v_snap := jsonb_build_object(
      'tickets', (SELECT jsonb_agg(to_jsonb(t)) FROM tickets t WHERE t.id = v_tk),
      'pagos',   (SELECT jsonb_agg(to_jsonb(p)) FROM pagos p WHERE p.ticket_id = v_tk));
    RAISE EXCEPTION 'smoke-c8e-deshacer';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'smoke-c8e-deshacer' THEN RAISE; END IF;
  END;
  IF (SELECT estado::text FROM pagos WHERE id = v_pago_saldo) <> 'APLICADO' OR EXISTS (SELECT 1 FROM pagos WHERE id = v_pago_saldo2) THEN
    RAISE EXCEPTION '8e: la nube debía seguir como antes de reabrir'; END IF;
  v_res := sync_push_snapshot(v_t, v_snap);
  IF jsonb_array_length(COALESCE(v_res->'_errores', '[]'::jsonb)) > 0 THEN RAISE EXCEPTION '8e: el push dio errores: %', v_res; END IF;
  IF (SELECT (estado::text, deleted_at IS NULL) FROM pagos WHERE id = v_interno) IS DISTINCT FROM ('APLICADO'::text, true) THEN
    RAISE EXCEPTION '8e: el pago interno debía seguir APLICADO en la nube'; END IF;
  IF (SELECT estado::text FROM pagos WHERE id = v_pago_saldo) <> 'CANCELADO'
     OR (SELECT estado::text FROM pagos WHERE id = v_pago_saldo2) <> 'APLICADO'
     OR (SELECT estado_fiscal::text FROM tickets WHERE id = v_tk) <> 'PAGADO' THEN
    RAISE EXCEPTION '8e: la nube debía quedar con el saldo nuevo y la venta PAGADA'; END IF;
  IF calcular_efectivo_esperado(v_turno) <> v_efe THEN
    RAISE EXCEPTION '8e: el esperado de la nube (%) debía coincidir con el de la caja (%)', calcular_efectivo_esperado(v_turno), v_efe; END IF;
  RAISE NOTICE '8 reabrir y cambiar pago de un cambio 0201 OK';
END $$;

-- 9) 0204: cuando al cliente se le regresa dinero por la venta de un cambio (cancelarla o devolverla),
--    la venta original pierde sus puntos en proporción a lo que cubría la prenda que regresó
--    (Fermín, 18 oct). Fracción = (devuelto / total del cambio) × (lo que regresó / total original).
DO $$
DECLARE
  v_t     uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc   uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja  uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria uuid := '99999999-0000-0000-0000-000000000001';
  v_c300  uuid := 'c4c40000-0000-0000-0000-0000000000d6';
  v_c350  uuid := 'c4c40000-0000-0000-0000-0000000000d7';
  v_c350b uuid := 'c4c40000-0000-0000-0000-0000000000d8';
  v_turno uuid; v_cli uuid; v_tk uuid; v_it uuid; v_auth uuid; v_res jsonb; v_nuevo uuid; v_nit uuid; v_dev uuid;
  v_caso text; v_esperado integer;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', v_t::text)::text, true);
  SELECT id INTO v_turno FROM turnos WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_t, 'Cliente cambio 0204', '4770002004') RETURNING id INTO v_cli;

  -- 9a) cancelar con dinero · 9b) devolverla · 9d) cancelar sin dinero. Venta 300 + 350 = 650 gana 65;
  --     la de 300 se cambia por una de 350 (cobra 50). 9a/9b: 65 × (350/350) × (300/650) → ceil 30 → quedan 35.
  FOREACH v_caso IN ARRAY ARRAY['9a', '9b', '9d'] LOOP
    v_tk := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-c' || v_caso, v_maria);
    v_it := agregar_item_a_ticket(v_tk, v_c300, 1, NULL, '[]'::jsonb, 'smoke-c' || v_caso || '-1');
    PERFORM agregar_item_a_ticket(v_tk, v_c350, 1, NULL, '[]'::jsonb, 'smoke-c' || v_caso || '-2');
    PERFORM aplicar_pago(v_tk, 'EFECTIVO'::metodo_pago, 650, 650, NULL, NULL, NULL, false, NULL, 'smoke-c' || v_caso || '-pago');
    IF lealtad_neto_ganado(v_tk) <> 65 THEN RAISE EXCEPTION '%: debía ganar 65', v_caso; END IF;
    INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                    accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
    VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'devolucion', 'venta.devolucion', 'ticket', v_tk, 'smoke ' || v_caso)
    RETURNING id INTO v_auth;
    v_res := registrar_cambio_talla(v_tk, jsonb_build_array(jsonb_build_object('ticket_item_id', v_it, 'cantidad', 1)),
      jsonb_build_array(jsonb_build_object('producto_id', v_c350b, 'cantidad', 1)), v_caja, v_turno, v_maria, v_auth, v_maria,
      'smoke-c' || v_caso || '-cambio');
    v_nuevo := (v_res->>'ticket_id')::uuid;
    PERFORM aplicar_pago(v_nuevo, 'EFECTIVO'::metodo_pago, 50, 50, NULL, NULL, NULL, false, NULL, 'smoke-c' || v_caso || '-saldo');
    IF lealtad_neto_ganado(v_tk) <> 65 THEN RAISE EXCEPTION '%: el cambio no debía tocar los 65', v_caso; END IF;
    IF v_caso = '9b' THEN
      SELECT id INTO v_nit FROM ticket_items WHERE ticket_id = v_nuevo;
      INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                      accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
      VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'devolucion', 'venta.devolucion', 'ticket', v_nuevo, 'smoke 9b dev')
      RETURNING id INTO v_auth;
      v_dev := crear_devolucion(
        p_ticket_original_id := v_nuevo, p_caja_id := v_caja, p_turno_id := v_turno,
        p_alcance := 'TOTAL'::devolucion_alcance, p_motivo := 'PRODUCTO_DEFECTUOSO'::devolucion_motivo,
        p_motivo_texto := 'smoke 9b', p_medio_devolucion := 'EFECTIVO'::devolucion_medio,
        p_autorizacion_pin_id := v_auth, p_usuario_solicitante_id := v_maria, p_usuario_autorizo_id := v_maria,
        p_items := jsonb_build_array(jsonb_build_object('ticket_item_id', v_nit, 'cantidad_devuelta', 1)),
        p_reversar_inventario := true, p_nota := 'smoke 9b');
      PERFORM confirmar_devolucion(v_dev, v_maria);
    ELSE
      INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                      accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
      VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'cancelar_ticket', 'venta.cancelar_pagada', 'ticket', v_nuevo, 'smoke ' || v_caso)
      RETURNING id INTO v_auth;
      PERFORM cancelar_ticket_pagado(
        p_ticket_id := v_nuevo, p_caja_id := v_caja, p_turno_id := v_turno,
        p_motivo := 'CLIENTE_DESISTIO'::cancelacion_motivo, p_motivo_texto := 'smoke',
        p_autorizacion_pin_id := v_auth, p_usuario_solicitante_id := v_maria, p_usuario_autorizo_id := v_maria,
        p_reversar_inventario := true, p_cancelar_cfdi_sat := false, p_devolver_dinero := (v_caso <> '9d'),
        p_client_id_local := 'smoke-c' || v_caso || '-cancela');
    END IF;
    v_esperado := CASE WHEN v_caso = '9d' THEN 65 ELSE 35 END;
    IF lealtad_neto_ganado(v_tk) <> v_esperado THEN
      RAISE EXCEPTION '%: la venta original debía quedar en %, quedó %', v_caso, v_esperado, lealtad_neto_ganado(v_tk); END IF;
  END LOOP;

  -- 9c) Cancelar la venta ABIERTA de un cambio (no pagó el saldo): se le regresa en efectivo lo que
  --     cubría la prenda. Venta de 300 gana 30; regresa 300 → pierde los 30.
  v_tk := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-c9c', v_maria);
  v_it := agregar_item_a_ticket(v_tk, v_c300, 1, NULL, '[]'::jsonb, 'smoke-c9c-1');
  PERFORM aplicar_pago(v_tk, 'EFECTIVO'::metodo_pago, 300, 300, NULL, NULL, NULL, false, NULL, 'smoke-c9c-pago');
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'devolucion', 'venta.devolucion', 'ticket', v_tk, 'smoke 9c')
  RETURNING id INTO v_auth;
  v_res := registrar_cambio_talla(v_tk, jsonb_build_array(jsonb_build_object('ticket_item_id', v_it, 'cantidad', 1)),
    jsonb_build_array(jsonb_build_object('producto_id', v_c350, 'cantidad', 1)), v_caja, v_turno, v_maria, v_auth, v_maria, 'smoke-c9c-cambio');
  v_nuevo := (v_res->>'ticket_id')::uuid;
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'cancelar_ticket', 'venta.cancelar_pagada', 'ticket', v_nuevo, 'smoke 9c')
  RETURNING id INTO v_auth;
  PERFORM cancelar_ticket_pagado(
    p_ticket_id := v_nuevo, p_caja_id := v_caja, p_turno_id := v_turno,
    p_motivo := 'CLIENTE_DESISTIO'::cancelacion_motivo, p_motivo_texto := 'smoke',
    p_autorizacion_pin_id := v_auth, p_usuario_solicitante_id := v_maria, p_usuario_autorizo_id := v_maria,
    p_reversar_inventario := true, p_cancelar_cfdi_sat := false, p_devolver_dinero := true,
    p_client_id_local := 'smoke-c9c-cancela');
  IF lealtad_neto_ganado(v_tk) <> 0 THEN RAISE EXCEPTION '9c: la venta original debía quedar en 0, quedó %', lealtad_neto_ganado(v_tk); END IF;

  -- 9e) Cadena: venta 300 (30) → cambio por 350 (cobra 50) → cambio de ese por otra de 350. Cancelar
  --     con dinero el último sube la cadena hasta la venta original: 1 × (350/350) × (300/300) → pierde 30.
  v_tk := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-c9e', v_maria);
  v_it := agregar_item_a_ticket(v_tk, v_c300, 1, NULL, '[]'::jsonb, 'smoke-c9e-1');
  PERFORM aplicar_pago(v_tk, 'EFECTIVO'::metodo_pago, 300, 300, NULL, NULL, NULL, false, NULL, 'smoke-c9e-pago');
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'devolucion', 'venta.devolucion', 'ticket', v_tk, 'smoke 9e')
  RETURNING id INTO v_auth;
  v_res := registrar_cambio_talla(v_tk, jsonb_build_array(jsonb_build_object('ticket_item_id', v_it, 'cantidad', 1)),
    jsonb_build_array(jsonb_build_object('producto_id', v_c350, 'cantidad', 1)), v_caja, v_turno, v_maria, v_auth, v_maria, 'smoke-c9e-cambio1');
  v_nuevo := (v_res->>'ticket_id')::uuid;
  PERFORM aplicar_pago(v_nuevo, 'EFECTIVO'::metodo_pago, 50, 50, NULL, NULL, NULL, false, NULL, 'smoke-c9e-saldo');
  SELECT id INTO v_nit FROM ticket_items WHERE ticket_id = v_nuevo;
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'devolucion', 'venta.devolucion', 'ticket', v_nuevo, 'smoke 9e2')
  RETURNING id INTO v_auth;
  v_res := registrar_cambio_talla(v_nuevo, jsonb_build_array(jsonb_build_object('ticket_item_id', v_nit, 'cantidad', 1)),
    jsonb_build_array(jsonb_build_object('producto_id', v_c350b, 'cantidad', 1)), v_caja, v_turno, v_maria, v_auth, v_maria, 'smoke-c9e-cambio2');
  v_nuevo := (v_res->>'ticket_id')::uuid;
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'cancelar_ticket', 'venta.cancelar_pagada', 'ticket', v_nuevo, 'smoke 9e')
  RETURNING id INTO v_auth;
  PERFORM cancelar_ticket_pagado(
    p_ticket_id := v_nuevo, p_caja_id := v_caja, p_turno_id := v_turno,
    p_motivo := 'CLIENTE_DESISTIO'::cancelacion_motivo, p_motivo_texto := 'smoke',
    p_autorizacion_pin_id := v_auth, p_usuario_solicitante_id := v_maria, p_usuario_autorizo_id := v_maria,
    p_reversar_inventario := true, p_cancelar_cfdi_sat := false, p_devolver_dinero := true,
    p_client_id_local := 'smoke-c9e-cancela');
  IF lealtad_neto_ganado(v_tk) <> 0 THEN RAISE EXCEPTION '9e: la venta original debía quedar en 0, quedó %', lealtad_neto_ganado(v_tk); END IF;
  RAISE NOTICE '9 cancelar un cambio con dinero quita puntos 0204 OK';
END $$;

ROLLBACK;
