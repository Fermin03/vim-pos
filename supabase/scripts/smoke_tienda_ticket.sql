-- Smoke tienda en línea (mig. 0161 §3): pedido de la tienda → crear_ticket_desde_tienda → ticket
-- ABIERTO y SIN PAGO, con cliente por teléfono, dirección y envío. Idempotente. Corre como postgres.
-- Uso: cd desktop && npm run smokes -- smoke_tienda_ticket.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_prod uuid; v_zona uuid; v_turno uuid;
  v_dom uuid; v_rec uuid; v_bloq uuid; v_mal uuid; v_app uuid; v_conexion uuid;
  v_ticket uuid; v_ticket2 uuid; v_cli uuid; v_cli2 uuid;
  v_estado text; v_cocina text; v_modo text; v_nota text; v_total numeric; v_n int;
  v_dir jsonb := '{"calle":"Av. Siempre Viva","numero_exterior":"742","colonia":"Centro","codigo_postal":"37000","ciudad":"León","estado":"Guanajuato","referencias":"portón verde"}'::jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);
  UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=v_caja AND estado='ABIERTO';

  SELECT id INTO v_prod FROM productos WHERE tenant_id=v_tenant AND nombre='Hamburguesa Clásica' LIMIT 1;
  IF v_prod IS NULL THEN RAISE EXCEPTION 'fixture: no existe Hamburguesa Clásica'; END IF;
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn)
  VALUES (v_tenant, v_suc, 'Zona Tienda Smoke', 35.00) RETURNING id INTO v_zona;

  -- Domicilio: 2 × $150 + envío $35 = $335, efectivo, paga con $500.
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, id_externo, folio_corto, estado, tipo_entrega,
    cliente_nombre, cliente_telefono, cliente_email, direccion, zona_envio_id, pago_al_recibir, paga_con_mxn,
    nota_cliente, items, payload_raw, subtotal_mxn, envio_mxn, total_cliente_mxn, vence_aceptacion)
  VALUES (v_tenant, v_suc, 'TIENDA', 'DELIVERY_PROPIO', 'tienda-tk-dom', 'T001', 'RECIBIDO', 'RESTAURANTE_REPARTE',
    'Ana Tienda', '477 111 2233', 'ana@example.com', v_dir, v_zona, 'EFECTIVO', 500.00,
    'Tocar el timbre',
    jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'nombre_app', 'Hamburguesa Clásica',
      'cantidad', 2, 'precio_unitario_mxn', 150.00, 'nota', 'sin cebolla', 'modificadores', '[]'::jsonb)),
    '{}'::jsonb, 300.00, 35.00, 335.00, now() + interval '5 minutes')
  RETURNING id INTO v_dom;

  -- 1) Sin turno abierto: error claro y el pedido sigue RECIBIDO.
  BEGIN
    PERFORM crear_ticket_desde_tienda(v_dom);
    RAISE EXCEPTION '1: debió fallar sin turno';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%SIN_TURNO_ABIERTO%' THEN RAISE; END IF;
  END;
  IF (SELECT estado FROM delivery_pedidos WHERE id = v_dom) <> 'RECIBIDO' THEN RAISE EXCEPTION '1: el pedido cambió de estado sin turno'; END IF;

  -- OJO: dia_contable en hora de México, no CURRENT_DATE (UTC en el CI).
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-TIENDA', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;

  -- 2) Domicilio: ticket abierto, sin pago, en cocina, con el total cotizado.
  v_ticket := crear_ticket_desde_tienda(v_dom);
  SELECT estado_fiscal::text, estado_cocina::text, modo_servicio::text, total_mxn, cliente_id, nota_general
    INTO v_estado, v_cocina, v_modo, v_total, v_cli, v_nota FROM tickets WHERE id = v_ticket;
  IF v_estado <> 'ABIERTO' THEN RAISE EXCEPTION '2: el ticket no quedó ABIERTO (%)', v_estado; END IF;
  IF v_cocina <> 'EN_COCINA' THEN RAISE EXCEPTION '2: no entró a cocina (%)', v_cocina; END IF;
  IF v_modo <> 'DELIVERY_PROPIO' THEN RAISE EXCEPTION '2: modo de servicio % (esperaba DELIVERY_PROPIO)', v_modo; END IF;
  IF v_total <> 335.00 THEN RAISE EXCEPTION '2: total % (esperaba 335.00)', v_total; END IF;
  SELECT count(*) INTO v_n FROM pagos WHERE ticket_id = v_ticket;
  IF v_n <> 0 THEN RAISE EXCEPTION '2: el ticket trae % pagos; la tienda no cobra', v_n; END IF;
  IF v_nota NOT LIKE 'Efectivo, paga con $500.00%' OR v_nota NOT LIKE '%Tocar el timbre%' THEN
    RAISE EXCEPTION '2: nota general sin forma de pago o sin nota del cliente: %', v_nota;
  END IF;

  -- 3) Cliente creado por teléfono, dirección y envío en su lugar.
  IF v_cli IS NULL THEN RAISE EXCEPTION '3: el ticket no tiene cliente'; END IF;
  IF (SELECT regexp_replace(telefono, '\D', '', 'g') FROM clientes WHERE id = v_cli) <> '4771112233' THEN
    RAISE EXCEPTION '3: el cliente no quedó con el teléfono del pedido';
  END IF;
  SELECT count(*) INTO v_n FROM tickets t JOIN direcciones_cliente d ON d.id = t.direccion_entrega_id
   WHERE t.id = v_ticket AND d.cliente_id = v_cli AND d.calle = 'Av. Siempre Viva' AND d.zona_envio_id = v_zona
     AND t.zona_envio_id = v_zona;
  IF v_n <> 1 THEN RAISE EXCEPTION '3: el ticket no quedó con su dirección y zona'; END IF;
  SELECT count(*) INTO v_n FROM ticket_items
   WHERE ticket_id = v_ticket AND cargo_tipo = 'ENVIO' AND precio_unitario_snapshot = 35.00 AND cancelado = false;
  IF v_n <> 1 THEN RAISE EXCEPTION '3: falta el renglón de envío de $35'; END IF;
  SELECT estado, ticket_id INTO v_estado, v_ticket2 FROM delivery_pedidos WHERE id = v_dom;
  IF v_estado <> 'ACEPTADO' OR v_ticket2 <> v_ticket THEN RAISE EXCEPTION '3: el pedido no quedó ACEPTADO y enlazado'; END IF;

  -- 4) Idempotente: repetir devuelve el mismo ticket.
  IF crear_ticket_desde_tienda(v_dom) <> v_ticket THEN RAISE EXCEPTION '4: no es idempotente'; END IF;

  -- 5) Recoger, mismo teléfono escrito distinto: reutiliza al cliente, sin dirección ni envío.
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, id_externo, estado, tipo_entrega,
    cliente_nombre, cliente_telefono, pago_al_recibir, items, payload_raw, subtotal_mxn, envio_mxn, total_cliente_mxn, vence_aceptacion)
  VALUES (v_tenant, v_suc, 'TIENDA', 'DRIVE_THRU', 'tienda-tk-rec', 'RECIBIDO', 'RECOGE_CLIENTE',
    'Ana T.', '(477) 111-2233', 'TARJETA',
    jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'nombre_app', 'Hamburguesa Clásica',
      'cantidad', 1, 'precio_unitario_mxn', 150.00, 'modificadores', '[]'::jsonb)),
    '{}'::jsonb, 150.00, 0, 150.00, now() + interval '5 minutes')
  RETURNING id INTO v_rec;
  v_ticket2 := crear_ticket_desde_tienda(v_rec);
  SELECT modo_servicio::text, total_mxn, cliente_id, nota_general INTO v_modo, v_total, v_cli2, v_nota FROM tickets WHERE id = v_ticket2;
  IF v_modo <> 'DRIVE_THRU' THEN RAISE EXCEPTION '5: modo % (esperaba DRIVE_THRU, el Pick-up del POS)', v_modo; END IF;
  IF v_total <> 150.00 THEN RAISE EXCEPTION '5: total % (esperaba 150.00)', v_total; END IF;
  IF v_cli2 <> v_cli THEN RAISE EXCEPTION '5: creó otro cliente para el mismo teléfono'; END IF;
  IF v_nota NOT LIKE 'Tarjeta al recibir%' THEN RAISE EXCEPTION '5: nota general sin forma de pago: %', v_nota; END IF;
  IF (SELECT direccion_entrega_id FROM tickets WHERE id = v_ticket2) IS NOT NULL THEN RAISE EXCEPTION '5: recoger no lleva dirección'; END IF;

  -- 6) Cliente bloqueado: no se crea el ticket.
  UPDATE clientes SET estado = 'BLOQUEADO', motivo_bloqueo = 'smoke' WHERE id = v_cli;   -- bloqueo_consistente exige motivo
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, id_externo, estado, tipo_entrega,
    cliente_nombre, cliente_telefono, pago_al_recibir, items, payload_raw, total_cliente_mxn, vence_aceptacion)
  VALUES (v_tenant, v_suc, 'TIENDA', 'DRIVE_THRU', 'tienda-tk-bloq', 'RECIBIDO', 'RECOGE_CLIENTE',
    'Ana', '4771112233', 'EFECTIVO',
    jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'cantidad', 1, 'precio_unitario_mxn', 150.00, 'modificadores', '[]'::jsonb)),
    '{}'::jsonb, 150.00, now() + interval '5 minutes')
  RETURNING id INTO v_bloq;
  BEGIN
    PERFORM crear_ticket_desde_tienda(v_bloq);
    RAISE EXCEPTION '6: aceptó a un cliente bloqueado';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%CLIENTE_BLOQUEADO%' THEN RAISE; END IF;
  END;
  UPDATE clientes SET estado = 'ACTIVO' WHERE id = v_cli;

  -- 7) El total del ticket no coincide con lo cotizado: aborta y no deja ticket.
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, id_externo, estado, tipo_entrega,
    cliente_nombre, cliente_telefono, pago_al_recibir, items, payload_raw, total_cliente_mxn, vence_aceptacion)
  VALUES (v_tenant, v_suc, 'TIENDA', 'DRIVE_THRU', 'tienda-tk-mal', 'RECIBIDO', 'RECOGE_CLIENTE',
    'Ana', '4771112233', 'EFECTIVO',
    jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'cantidad', 1, 'precio_unitario_mxn', 150.00, 'modificadores', '[]'::jsonb)),
    '{}'::jsonb, 999.00, now() + interval '5 minutes')
  RETURNING id INTO v_mal;
  BEGIN
    PERFORM crear_ticket_desde_tienda(v_mal);
    RAISE EXCEPTION '7: aceptó un total que no coincide';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%TOTAL_NO_COINCIDE%' THEN RAISE; END IF;
  END;
  IF (SELECT ticket_id FROM delivery_pedidos WHERE id = v_mal) IS NOT NULL THEN RAISE EXCEPTION '7: quedó un ticket a medias'; END IF;

  -- 8) Cada función se niega al pedido del otro canal.
  INSERT INTO delivery_conexiones (tenant_id, sucursal_id, app, estado, tienda_id_externo)
  VALUES (v_tenant, v_suc, 'APP_UBEREATS', 'ACTIVA', 'store-tk') RETURNING id INTO v_conexion;
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, conexion_id, app, id_externo, estado, items, payload_raw, total_cliente_mxn)
  VALUES (v_tenant, v_suc, v_conexion, 'APP_UBEREATS', 'uber-tk-1', 'RECIBIDO', '[]'::jsonb, '{}'::jsonb, 0)
  RETURNING id INTO v_app;
  BEGIN
    PERFORM crear_ticket_desde_tienda(v_app);
    RAISE EXCEPTION '8: la función de la tienda aceptó un pedido de app';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%PEDIDO_NO_ES_DE_TIENDA%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM crear_ticket_desde_app(v_bloq);
    RAISE EXCEPTION '8: la función de apps aceptó un pedido de la tienda';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%PEDIDO_NO_ES_DE_APP%' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'smoke_tienda_ticket OK';
END $$;
ROLLBACK;
