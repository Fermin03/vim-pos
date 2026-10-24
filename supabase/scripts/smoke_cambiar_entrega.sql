-- Smoke 0262: cambiar a quién y a dónde se entrega un pedido a domicilio ya abierto.
-- Uso: cd desktop && npm run smokes -- smoke_cambiar_entrega.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_cajero uuid := '99999999-0000-0000-0000-000000000001';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_turno  uuid; v_ticket uuid; v_prod uuid;
  v_z1 uuid; v_z2 uuid;
  v_ana uuid; v_beto uuid; v_ana1 uuid; v_ana2 uuid; v_beto1 uuid;
  v_envio  numeric; v_total numeric;
  v_txt    text;
BEGIN
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_t, v_suc, v_caja, 'SMOKE-0262', (now() AT TIME ZONE 'America/Mexico_City')::date, v_cajero, 500, 'TOTAL') RETURNING id INTO v_turno;
  SELECT id INTO v_prod FROM productos WHERE tenant_id = v_t AND nombre = 'Hamburguesa Clásica' LIMIT 1;

  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn) VALUES (v_t, v_suc, 'Smoke Centro', 30) RETURNING id INTO v_z1;
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn) VALUES (v_t, v_suc, 'Smoke Lejos', 50) RETURNING id INTO v_z2;
  INSERT INTO clientes (tenant_id, nombre) VALUES (v_t, 'Ana Smoke') RETURNING id INTO v_ana;
  INSERT INTO clientes (tenant_id, nombre) VALUES (v_t, 'Beto Smoke') RETURNING id INTO v_beto;
  INSERT INTO direcciones_cliente (tenant_id, cliente_id, calle, numero_exterior, colonia, codigo_postal, ciudad, estado_geo, zona_envio_id)
  VALUES (v_t, v_ana, 'Madero', '1', 'Centro', '37000', 'León', 'Gto', v_z1) RETURNING id INTO v_ana1;
  INSERT INTO direcciones_cliente (tenant_id, cliente_id, calle, numero_exterior, colonia, codigo_postal, ciudad, estado_geo, zona_envio_id)
  VALUES (v_t, v_ana, 'Lejana', '2', 'Afueras', '37000', 'León', 'Gto', v_z2) RETURNING id INTO v_ana2;
  INSERT INTO direcciones_cliente (tenant_id, cliente_id, calle, numero_exterior, colonia, codigo_postal, ciudad, estado_geo)
  VALUES (v_t, v_beto, 'Sin Zona', '3', 'Obregón', '37000', 'León', 'Gto') RETURNING id INTO v_beto1;

  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'DELIVERY_PROPIO'::modo_servicio, v_ana, NULL, 'smoke-0262-1', v_cajero);
  PERFORM agregar_item_a_ticket(v_ticket, v_prod, 1, NULL, '[]'::jsonb, 'smoke-0262-item');
  UPDATE tickets SET direccion_entrega_id = v_ana1 WHERE id = v_ticket;
  IF (SELECT estado_fiscal FROM tickets WHERE id = v_ticket) <> 'ABIERTO' THEN RAISE EXCEPTION '0: la cuenta debía nacer ABIERTA'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cajero, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  PERFORM fijar_envio_ticket(v_ticket, v_z1);

  -- Desde aquí, como la caja: cajero bajo RLS, por la ruta de PostgREST de la RPC.
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.path', '/rpc/cambiar_entrega_ticket', true);

  -- 1) Otra dirección del mismo cliente: el envío sigue a la zona nueva y el total con él.
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket;
  PERFORM cambiar_entrega_ticket(v_ticket, v_ana, v_ana2);
  SELECT precio_unitario_snapshot INTO v_envio FROM ticket_items WHERE ticket_id = v_ticket AND cargo_tipo = 'ENVIO' AND cancelado = false;
  IF v_envio IS DISTINCT FROM 50 THEN RAISE EXCEPTION '1: el envío no pasó a la zona nueva (%)', v_envio; END IF;
  IF (SELECT direccion_entrega_id FROM tickets WHERE id = v_ticket) IS DISTINCT FROM v_ana2 THEN RAISE EXCEPTION '1: no cambió la dirección'; END IF;
  IF (SELECT total_mxn FROM tickets WHERE id = v_ticket) IS DISTINCT FROM v_total + 20 THEN RAISE EXCEPTION '1: el total no se recalculó'; END IF;

  -- 2) Otro cliente con una dirección sin zona: cambia el cliente y el envío se queda como estaba.
  PERFORM cambiar_entrega_ticket(v_ticket, v_beto, v_beto1);
  SELECT cliente_id::text || '|' || direccion_entrega_id::text || '|' || zona_envio_id::text INTO v_txt FROM tickets WHERE id = v_ticket;
  IF v_txt IS DISTINCT FROM v_beto::text || '|' || v_beto1::text || '|' || v_z2::text THEN RAISE EXCEPTION '2: quedó %', v_txt; END IF;

  -- 3) Una dirección que no es de ese cliente: rechazada.
  BEGIN
    PERFORM cambiar_entrega_ticket(v_ticket, v_beto, v_ana1);
    RAISE EXCEPTION '3: aceptó la dirección de otro cliente';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'La dirección no existe%' THEN RAISE; END IF;
  END;

  -- 4) Pedido de la tienda en línea: se corrige la dirección, pero no se cambia el cliente.
  EXECUTE 'RESET ROLE';
  UPDATE tickets SET origen_creacion = 'API_EXTERNA' WHERE id = v_ticket;
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM cambiar_entrega_ticket(v_ticket, v_ana, v_ana1);
    RAISE EXCEPTION '4: dejó cambiar el cliente de un pedido en línea';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Este pedido llegó en línea%' THEN RAISE; END IF;
  END;
  UPDATE direcciones_cliente SET calle = 'Corregida' WHERE id = v_beto1;
  PERFORM cambiar_entrega_ticket(v_ticket, v_beto, v_beto1);

  -- 5) Cuenta ya cobrada: no se toca.
  EXECUTE 'RESET ROLE';
  UPDATE tickets SET origen_creacion = 'POS_ONLINE' WHERE id = v_ticket;
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket;
  PERFORM aplicar_pago(v_ticket, 'EFECTIVO'::metodo_pago, v_total, v_total, NULL, NULL, NULL, false, NULL, 'smoke-0262-pago');
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM cambiar_entrega_ticket(v_ticket, v_beto, v_beto1);
    RAISE EXCEPTION '5: dejó cambiar la entrega de una cuenta cobrada';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'La cuenta ya no está abierta%' THEN RAISE; END IF;
  END;

  -- 6) Otro negocio no ve el ticket.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cajero, 'role', 'authenticated', 'tenant_id', gen_random_uuid())::text, true);
  BEGIN
    PERFORM cambiar_entrega_ticket(v_ticket, v_beto, v_beto1);
    RAISE EXCEPTION '6: otro negocio cambió la entrega';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Ticket % no existe' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'smoke_cambiar_entrega: OK';
END $$;
ROLLBACK;
