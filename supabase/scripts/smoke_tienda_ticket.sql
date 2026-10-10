-- Smoke tienda en línea (mig. 0161 §3): pedido de la tienda → crear_ticket_desde_tienda → ticket
-- ABIERTO y SIN PAGO, con cliente por teléfono, dirección y envío. Idempotente. Corre como postgres.
-- Y lo que la función NO se cree del pedido: que sus ids sean de su negocio (9–11), que la dirección
-- esté completa (13) y que el envío cotizado sea el de la zona (14–15).
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
  v_estado text; v_cocina text; v_modo text; v_nota text; v_total numeric; v_n int; v_n0 int;
  v_dir jsonb := '{"calle":"Av. Siempre Viva","numero_exterior":"742","colonia":"Centro","codigo_postal":"37000","ciudad":"León","estado":"Guanajuato","referencias":"portón verde"}'::jsonb;
  v_ajeno uuid := '61616161-0000-0000-0000-0000000000bb';
  v_suc_ajena uuid; v_caja_ajena uuid; v_cat_ajena uuid; v_prod_ajeno uuid; v_grupo_ajeno uuid; v_opc_ajena uuid;
  v_ped uuid; v_zona0 uuid; v_dir_id uuid; v_modifs jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);
  UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=v_caja AND estado='ABIERTO';

  SELECT id INTO v_prod FROM productos WHERE tenant_id=v_tenant AND nombre='Hamburguesa Clásica' LIMIT 1;
  IF v_prod IS NULL THEN RAISE EXCEPTION 'fixture: no existe Hamburguesa Clásica'; END IF;
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn)
  VALUES (v_tenant, v_suc, 'Zona Tienda Smoke', 35.00) RETURNING id INTO v_zona;

  -- Otro negocio, con lo mínimo para que un id suyo pueda colarse en un pedido (pasos 9–11): una
  -- sucursal con turno abierto, un producto y una opción de modificador.
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_ajeno, 'tenant-0161-tk', 'Negocio ajeno', 'INTERNO', 'QUICK_SERVICE');
  INSERT INTO sucursales (tenant_id, codigo, nombre) VALUES (v_ajeno, 'AJ', 'Sucursal ajena') RETURNING id INTO v_suc_ajena;
  INSERT INTO cajas (tenant_id, sucursal_id, numero, nombre) VALUES (v_ajeno, v_suc_ajena, 1, 'Caja ajena') RETURNING id INTO v_caja_ajena;
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_ajeno, v_suc_ajena, v_caja_ajena, 'SMOKE-AJENO', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 0, 'TOTAL');
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion) VALUES (v_ajeno, 'Categoría ajena', 1) RETURNING id INTO v_cat_ajena;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_ajeno, v_cat_ajena, 'Producto ajeno', 150) RETURNING id INTO v_prod_ajeno;
  INSERT INTO grupos_modificadores (tenant_id, nombre, tipo_seleccion) VALUES (v_ajeno, 'Grupo ajeno', 'MULTIPLE_OPCIONAL') RETURNING id INTO v_grupo_ajeno;
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre) VALUES (v_ajeno, v_grupo_ajeno, 'Opción ajena') RETURNING id INTO v_opc_ajena;

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
  -- ticket_id y estado se escriben al final: no prueban nada. Lo que prueba es que no hay ticket ni cliente.
  SELECT count(*) INTO v_n FROM tickets WHERE tenant_id = v_tenant AND client_id_local = 'tienda:tienda-tk-dom';
  IF v_n <> 0 THEN RAISE EXCEPTION '1: el intento sin turno dejó % ticket(s)', v_n; END IF;
  SELECT count(*) INTO v_n FROM clientes WHERE tenant_id = v_tenant AND regexp_replace(telefono, '\D', '', 'g') = '4771112233';
  IF v_n <> 0 THEN RAISE EXCEPTION '1: el intento sin turno creó % cliente(s)', v_n; END IF;

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
  SELECT count(*) INTO v_n FROM tickets WHERE tenant_id = v_tenant AND client_id_local = 'tienda:tienda-tk-bloq';
  IF v_n <> 0 THEN RAISE EXCEPTION '6: el cliente bloqueado dejó % ticket(s)', v_n; END IF;
  UPDATE clientes SET estado = 'ACTIVO' WHERE id = v_cli;

  -- 7) El total del ticket no coincide con lo cotizado: aborta y no deja ticket.
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, id_externo, estado, tipo_entrega,
    cliente_nombre, cliente_telefono, pago_al_recibir, items, payload_raw, total_cliente_mxn, vence_aceptacion)
  VALUES (v_tenant, v_suc, 'TIENDA', 'DRIVE_THRU', 'tienda-tk-mal', 'RECIBIDO', 'RECOGE_CLIENTE',
    'Ana', '4771112233', 'EFECTIVO',
    jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'cantidad', 1, 'precio_unitario_mxn', 150.00, 'modificadores', '[]'::jsonb)),
    '{}'::jsonb, 999.00, now() + interval '5 minutes')
  RETURNING id INTO v_mal;
  SELECT count(*) INTO v_n0 FROM tickets WHERE tenant_id = v_tenant;
  BEGIN
    PERFORM crear_ticket_desde_tienda(v_mal);
    RAISE EXCEPTION '7: aceptó un total que no coincide';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%TOTAL_NO_COINCIDE%' THEN RAISE; END IF;
  END;
  IF (SELECT ticket_id FROM delivery_pedidos WHERE id = v_mal) IS NOT NULL THEN RAISE EXCEPTION '7: quedó un ticket a medias'; END IF;
  -- ticket_id se escribe al final, así que arriba no prueba el rollback: esto sí (el ticket se abrió antes del RAISE).
  SELECT count(*) INTO v_n FROM tickets WHERE tenant_id = v_tenant AND client_id_local = 'tienda:tienda-tk-mal';
  IF v_n <> 0 THEN RAISE EXCEPTION '7: sobrevivió % ticket(s) del pedido rechazado', v_n; END IF;
  SELECT count(*) INTO v_n FROM tickets WHERE tenant_id = v_tenant;
  IF v_n <> v_n0 THEN RAISE EXCEPTION '7: el total de tickets pasó de % a %', v_n0, v_n; END IF;

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

  -- 9) Un producto de otro negocio no entra al ticket (los ids nacen en un carrito anónimo).
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, id_externo, estado, tipo_entrega,
    cliente_nombre, cliente_telefono, pago_al_recibir, items, payload_raw, total_cliente_mxn, vence_aceptacion)
  VALUES (v_tenant, v_suc, 'TIENDA', 'DRIVE_THRU', 'tienda-tk-prod-ajeno', 'RECIBIDO', 'RECOGE_CLIENTE',
    'Ana', '4771112233', 'EFECTIVO',
    jsonb_build_array(jsonb_build_object('producto_id', v_prod_ajeno, 'cantidad', 1, 'precio_unitario_mxn', 150.00, 'modificadores', '[]'::jsonb)),
    '{}'::jsonb, 150.00, now() + interval '5 minutes')
  RETURNING id INTO v_ped;
  BEGIN
    PERFORM crear_ticket_desde_tienda(v_ped);
    RAISE EXCEPTION '9: aceptó un producto de otro negocio';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%PRODUCTO_DE_OTRO_NEGOCIO%' THEN RAISE; END IF;
  END;
  SELECT count(*) INTO v_n FROM tickets WHERE client_id_local = 'tienda:tienda-tk-prod-ajeno';
  IF v_n <> 0 THEN RAISE EXCEPTION '9: el producto ajeno dejó % ticket(s)', v_n; END IF;

  -- 10) Tampoco una opción de modificador de otro negocio colgada de un producto propio, ni en el
  --     primer nivel ni en el segundo (donde van las de los componentes de un combo).
  FOR v_modifs IN SELECT * FROM (VALUES
    (jsonb_build_array(jsonb_build_object('opcion_modificador_id', v_opc_ajena, 'cantidad', 1, 'precio_extra_mxn', 0))),
    (jsonb_build_array(jsonb_build_object('modificadores',
       jsonb_build_array(jsonb_build_object('opcion_modificador_id', v_opc_ajena, 'cantidad', 1, 'precio_extra_mxn', 0)))))) AS x(m)
  LOOP
    v_n0 := jsonb_array_length(COALESCE(v_modifs->0->'modificadores', '[]'::jsonb));   -- 0 = primer nivel
    INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, id_externo, estado, tipo_entrega,
      cliente_nombre, cliente_telefono, pago_al_recibir, items, payload_raw, total_cliente_mxn, vence_aceptacion)
    VALUES (v_tenant, v_suc, 'TIENDA', 'DRIVE_THRU', 'tienda-tk-opc-ajena-' || v_n0, 'RECIBIDO', 'RECOGE_CLIENTE',
      'Ana', '4771112233', 'EFECTIVO',
      jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'cantidad', 1, 'precio_unitario_mxn', 150.00, 'modificadores', v_modifs)),
      '{}'::jsonb, 150.00, now() + interval '5 minutes')
    RETURNING id INTO v_ped;
    BEGIN
      PERFORM crear_ticket_desde_tienda(v_ped);
      RAISE EXCEPTION '10: aceptó una opción de modificador de otro negocio (anidada: %)', v_n0;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%OPCION_DE_OTRO_NEGOCIO%' THEN RAISE; END IF;
    END;
  END LOOP;

  -- 11) Un pedido cuya sucursal es de otro negocio no abre ticket en el turno de ese negocio.
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, id_externo, estado, tipo_entrega,
    cliente_nombre, cliente_telefono, pago_al_recibir, items, payload_raw, total_cliente_mxn, vence_aceptacion)
  VALUES (v_tenant, v_suc_ajena, 'TIENDA', 'DRIVE_THRU', 'tienda-tk-suc-ajena', 'RECIBIDO', 'RECOGE_CLIENTE',
    'Ana', '4771112233', 'EFECTIVO',
    jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'cantidad', 1, 'precio_unitario_mxn', 150.00, 'modificadores', '[]'::jsonb)),
    '{}'::jsonb, 150.00, now() + interval '5 minutes')
  RETURNING id INTO v_ped;
  BEGIN
    PERFORM crear_ticket_desde_tienda(v_ped);
    RAISE EXCEPTION '11: abrió un ticket en la sucursal de otro negocio';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%SUCURSAL_DE_OTRO_NEGOCIO%' THEN RAISE; END IF;
  END;

  -- 12) Otro pedido a domicilio a la MISMA dirección reutiliza la fila; con otro interior, crea una.
  SELECT direccion_entrega_id INTO v_dir_id FROM tickets WHERE id = v_ticket;
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, id_externo, estado, tipo_entrega,
    cliente_nombre, cliente_telefono, direccion, zona_envio_id, pago_al_recibir, items, payload_raw, envio_mxn, total_cliente_mxn, vence_aceptacion)
  VALUES (v_tenant, v_suc, 'TIENDA', 'DELIVERY_PROPIO', 'tienda-tk-dir-igual', 'RECIBIDO', 'RESTAURANTE_REPARTE',
    'Ana', '4771112233', v_dir, v_zona, 'EFECTIVO',
    jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'cantidad', 1, 'precio_unitario_mxn', 150.00, 'modificadores', '[]'::jsonb)),
    '{}'::jsonb, 35.00, 185.00, now() + interval '5 minutes')
  RETURNING id INTO v_ped;
  v_ticket2 := crear_ticket_desde_tienda(v_ped);
  IF (SELECT direccion_entrega_id FROM tickets WHERE id = v_ticket2) IS DISTINCT FROM v_dir_id THEN RAISE EXCEPTION '12: la misma dirección no se reutilizó'; END IF;
  SELECT count(*) INTO v_n FROM direcciones_cliente WHERE cliente_id = v_cli;
  IF v_n <> 1 THEN RAISE EXCEPTION '12: la misma dirección dejó % filas (esperaba 1)', v_n; END IF;

  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, id_externo, estado, tipo_entrega,
    cliente_nombre, cliente_telefono, direccion, zona_envio_id, pago_al_recibir, items, payload_raw, envio_mxn, total_cliente_mxn, vence_aceptacion)
  VALUES (v_tenant, v_suc, 'TIENDA', 'DELIVERY_PROPIO', 'tienda-tk-dir-interior', 'RECIBIDO', 'RESTAURANTE_REPARTE',
    'Ana', '4771112233', v_dir || '{"numero_interior":"3"}'::jsonb, v_zona, 'EFECTIVO',
    jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'cantidad', 1, 'precio_unitario_mxn', 150.00, 'modificadores', '[]'::jsonb)),
    '{}'::jsonb, 35.00, 185.00, now() + interval '5 minutes')
  RETURNING id INTO v_ped;
  v_ticket2 := crear_ticket_desde_tienda(v_ped);
  SELECT count(*) INTO v_n FROM tickets t JOIN direcciones_cliente d ON d.id = t.direccion_entrega_id
   WHERE t.id = v_ticket2 AND d.id <> v_dir_id AND d.numero_interior = '3';
  IF v_n <> 1 THEN RAISE EXCEPTION '12: el interior 3 reutilizó la dirección sin interior: el ticket apunta al departamento equivocado'; END IF;

  -- 13) A domicilio sin dirección: error claro y sin ticket.
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, id_externo, estado, tipo_entrega,
    cliente_nombre, cliente_telefono, zona_envio_id, pago_al_recibir, items, payload_raw, envio_mxn, total_cliente_mxn, vence_aceptacion)
  VALUES (v_tenant, v_suc, 'TIENDA', 'DELIVERY_PROPIO', 'tienda-tk-sin-dir', 'RECIBIDO', 'RESTAURANTE_REPARTE',
    'Ana', '4771112233', v_zona, 'EFECTIVO',
    jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'cantidad', 1, 'precio_unitario_mxn', 150.00, 'modificadores', '[]'::jsonb)),
    '{}'::jsonb, 35.00, 185.00, now() + interval '5 minutes')
  RETURNING id INTO v_ped;
  BEGIN
    PERFORM crear_ticket_desde_tienda(v_ped);
    RAISE EXCEPTION '13: aceptó un pedido a domicilio sin dirección';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%DIRECCION_INVALIDA%' THEN RAISE; END IF;
  END;

  -- 14) Envío cotizado en $0 contra una zona que hoy cobra $35: ticket SIN renglón de envío (un
  --     concepto de $0 no timbra: 0116) y con el total cotizado.
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, id_externo, estado, tipo_entrega,
    cliente_nombre, cliente_telefono, direccion, zona_envio_id, pago_al_recibir, items, payload_raw, envio_mxn, total_cliente_mxn, vence_aceptacion)
  VALUES (v_tenant, v_suc, 'TIENDA', 'DELIVERY_PROPIO', 'tienda-tk-envio-0', 'RECIBIDO', 'RESTAURANTE_REPARTE',
    'Ana', '4771112233', v_dir, v_zona, 'EFECTIVO',
    jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'cantidad', 1, 'precio_unitario_mxn', 150.00, 'modificadores', '[]'::jsonb)),
    '{}'::jsonb, 0, 150.00, now() + interval '5 minutes')
  RETURNING id INTO v_ped;
  v_ticket2 := crear_ticket_desde_tienda(v_ped);
  SELECT count(*) INTO v_n FROM ticket_items WHERE ticket_id = v_ticket2 AND cargo_tipo = 'ENVIO';
  IF v_n <> 0 THEN RAISE EXCEPTION '14: quedó un renglón de envío en un pedido cotizado con envío $0'; END IF;
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket2;
  IF v_total <> 150.00 THEN RAISE EXCEPTION '14: total % (esperaba 150.00)', v_total; END IF;

  -- 15) Envío cotizado en $35 contra una zona que hoy es gratis: no hay renglón que repreciar.
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn)
  VALUES (v_tenant, v_suc, 'Zona Gratis Smoke', 0) RETURNING id INTO v_zona0;
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, id_externo, estado, tipo_entrega,
    cliente_nombre, cliente_telefono, direccion, zona_envio_id, pago_al_recibir, items, payload_raw, envio_mxn, total_cliente_mxn, vence_aceptacion)
  VALUES (v_tenant, v_suc, 'TIENDA', 'DELIVERY_PROPIO', 'tienda-tk-envio-35', 'RECIBIDO', 'RESTAURANTE_REPARTE',
    'Ana', '4771112233', v_dir, v_zona0, 'EFECTIVO',
    jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'cantidad', 1, 'precio_unitario_mxn', 150.00, 'modificadores', '[]'::jsonb)),
    '{}'::jsonb, 35.00, 185.00, now() + interval '5 minutes')
  RETURNING id INTO v_ped;
  BEGIN
    PERFORM crear_ticket_desde_tienda(v_ped);
    RAISE EXCEPTION '15: aceptó un envío de $35 contra una zona gratis';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%ENVIO_NO_COINCIDE%' THEN RAISE; END IF;
  END;

  -- 16) El bucle de renglones es interno: solo lo llaman las dos funciones definer de arriba.
  IF has_function_privilege('service_role', '_delivery_items_a_ticket(uuid, jsonb, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '16: service_role puede ejecutar _delivery_items_a_ticket';
  END IF;

  RAISE NOTICE 'smoke_tienda_ticket OK';
END $$;
ROLLBACK;
