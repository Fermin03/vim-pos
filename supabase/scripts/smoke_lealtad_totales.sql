-- Smoke lealtad · totales (0156 §5). Un canje de dinero baja el total y se reporta en lealtad_mxn;
-- un premio de producto deja su renglón en cero; revertir lo devuelve todo. Hace ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno  uuid; v_prod uuid; v_cli uuid; v_t uuid; v_item uuid; v_item2 uuid;
  v_canje  uuid := gen_random_uuid(); v_canje2 uuid := gen_random_uuid();
  r        tickets%ROWTYPE;
  v_t2 uuid; v_t3 uuid; v_t4 uuid; v_ia uuid; v_ib uuid; v_zona uuid; v_cfdi uuid; v_auth uuid;
  v_d numeric; v_tot numeric;
BEGIN
  -- aplicar_pago, fijar_envio_ticket y cfdi_crear_borrador leen al empleado y el tenant del JWT.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_tenant, 'Ana Totales', '4770001562') RETURNING id INTO v_cli;
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-LTOT', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;
  SELECT id INTO v_prod FROM productos WHERE tenant_id = v_tenant AND nombre = 'Hamburguesa Clásica' LIMIT 1;

  v_t := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-ltot-1', v_maria);
  v_item  := agregar_item_a_ticket(v_t, v_prod, 1, NULL, '[]'::jsonb, 'smoke-ltot-i1');
  v_item2 := agregar_item_a_ticket(v_t, v_prod, 1, NULL, '[]'::jsonb, 'smoke-ltot-i2');
  SELECT * INTO r FROM tickets WHERE id = v_t;
  IF r.total_mxn <> 240 THEN RAISE EXCEPTION 'total inicial % (esperado 240)', r.total_mxn; END IF;

  -- 1) Canje de dinero: $40 sobre la cuenta.
  INSERT INTO ticket_canjes_lealtad (id, tenant_id, ticket_id, cliente_id, puntos, monto_descontado_mxn)
  VALUES (v_canje, v_tenant, v_t, v_cli, 40, 40);
  SELECT * INTO r FROM tickets WHERE id = v_t;
  IF r.total_mxn <> 200 THEN RAISE EXCEPTION 'total con canje % (esperado 200)', r.total_mxn; END IF;
  IF r.lealtad_mxn <> 40 THEN RAISE EXCEPTION 'lealtad_mxn % (esperado 40)', r.lealtad_mxn; END IF;
  IF r.promociones_mxn <> 0 OR r.descuentos_manuales_mxn <> 0 THEN RAISE EXCEPTION 'el canje se coló en otro carril'; END IF;

  -- 2) Revertirlo devuelve el total.
  UPDATE ticket_canjes_lealtad SET revertido = true, revertido_at = now() WHERE id = v_canje;
  SELECT * INTO r FROM tickets WHERE id = v_t;
  IF r.total_mxn <> 240 OR r.lealtad_mxn <> 0 THEN RAISE EXCEPTION 'revertir no devolvió el total: % / %', r.total_mxn, r.lealtad_mxn; END IF;

  -- 3) Premio de producto: el segundo renglón sale en cero y la cuenta queda en $120.
  INSERT INTO ticket_canjes_lealtad (id, tenant_id, ticket_id, cliente_id, ticket_item_id, puntos, monto_descontado_mxn)
  VALUES (v_canje2, v_tenant, v_t, v_cli, v_item2, 6, 120);
  SELECT * INTO r FROM tickets WHERE id = v_t;
  IF r.total_mxn <> 120 THEN RAISE EXCEPTION 'total con premio % (esperado 120)', r.total_mxn; END IF;
  IF r.lealtad_mxn <> 120 THEN RAISE EXCEPTION 'lealtad_mxn con premio % (esperado 120)', r.lealtad_mxn; END IF;
  IF (SELECT total_item_mxn FROM ticket_items WHERE id = v_item2) <> 0 THEN RAISE EXCEPTION 'el renglón premiado no quedó en cero'; END IF;
  IF (SELECT promocion_item_mxn FROM ticket_items WHERE id = v_item2) <> 120 THEN RAISE EXCEPTION 'el descuento del renglón no quedó donde el CFDI lo lee'; END IF;

  -- 4) La invariante que el CFDI deduce.
  IF (SELECT SUM(subtotal_bruto_mxn + monto_modificadores_mxn) FROM ticket_items WHERE ticket_id = v_t AND NOT cancelado)
     - (r.descuentos_manuales_mxn + r.promociones_mxn + r.lealtad_mxn) <> r.total_mxn THEN
    RAISE EXCEPTION 'la invariante renglones - descuentos = total se rompió';
  END IF;

  -- 5) Un canje mayor que la cuenta no la deja negativa ni reporta de más.
  UPDATE ticket_canjes_lealtad SET revertido = true WHERE id = v_canje2;
  INSERT INTO ticket_canjes_lealtad (id, tenant_id, ticket_id, cliente_id, puntos, monto_descontado_mxn)
  VALUES (gen_random_uuid(), v_tenant, v_t, v_cli, 999, 999);
  SELECT * INTO r FROM tickets WHERE id = v_t;
  IF r.total_mxn <> 0 OR r.lealtad_mxn <> 240 THEN RAISE EXCEPTION 'canje excedido: total % lealtad %', r.total_mxn, r.lealtad_mxn; END IF;

  -- 6) Un ticket cerrado conserva los totales con los que se vendió: revertir el canje de una
  --    cuenta ya cobrada (lo que hará la cancelación) no los mueve.
  v_t2 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-ltot-2', v_maria);
  PERFORM agregar_item_a_ticket(v_t2, v_prod, 1, NULL, '[]'::jsonb, 'smoke-ltot-2a');
  PERFORM agregar_item_a_ticket(v_t2, v_prod, 1, NULL, '[]'::jsonb, 'smoke-ltot-2b');
  v_canje := gen_random_uuid();
  INSERT INTO ticket_canjes_lealtad (id, tenant_id, ticket_id, cliente_id, puntos, monto_descontado_mxn)
  VALUES (v_canje, v_tenant, v_t2, v_cli, 40, 40);
  SELECT * INTO r FROM tickets WHERE id = v_t2;
  IF r.total_mxn <> 200 OR r.lealtad_mxn <> 40 THEN RAISE EXCEPTION 'ticket cerrado, antes de cobrar: % / %', r.total_mxn, r.lealtad_mxn; END IF;
  PERFORM aplicar_pago(v_t2, 'EFECTIVO'::metodo_pago, 200, 200);
  IF (SELECT estado_fiscal FROM tickets WHERE id = v_t2) <> 'PAGADO' THEN RAISE EXCEPTION 'el ticket no quedó PAGADO'; END IF;
  UPDATE ticket_canjes_lealtad SET revertido = true, revertido_at = now() WHERE id = v_canje;
  SELECT * INTO r FROM tickets WHERE id = v_t2;
  IF r.total_mxn <> 200 OR r.lealtad_mxn <> 40 THEN
    RAISE EXCEPTION 'revertir el canje movió los totales de un ticket PAGADO: total % lealtad % (esperado 200 / 40)', r.total_mxn, r.lealtad_mxn;
  END IF;

  -- 7) El borrador del CFDI lleva el canje como descuento (ticket de 120, canje de 30, cobrado 90).
  v_t3 := abrir_ticket(v_suc, v_caja, v_turno, 'COMER_AQUI'::modo_servicio, v_cli, NULL, 'smoke-ltot-3', v_maria);
  PERFORM agregar_item_a_ticket(v_t3, v_prod, 1, NULL, '[]'::jsonb, 'smoke-ltot-3a');
  INSERT INTO ticket_canjes_lealtad (id, tenant_id, ticket_id, cliente_id, puntos, monto_descontado_mxn)
  VALUES (gen_random_uuid(), v_tenant, v_t3, v_cli, 30, 30);
  PERFORM aplicar_pago(v_t3, 'EFECTIVO'::metodo_pago, 90, 90);
  v_cfdi := cfdi_crear_borrador(
    p_ticket_id := v_t3, p_tipo_comprobante := 'INGRESO'::cfdi_tipo_comprobante,
    p_receptor_rfc := 'XAXX010101000', p_receptor_razon_social := 'PUBLICO EN GENERAL',
    p_receptor_uso_cfdi := 'S01', p_receptor_codigo_postal := '37000', p_receptor_regimen_fiscal := '616',
    p_receptor_email := 'cliente@demo.mx', p_emisor_rfc := 'XAXX010101000',
    p_emisor_razon_social := 'VIM MARKETING SA DE CV', p_emisor_regimen_fiscal := '601',
    p_emisor_lugar_expedicion := '37000', p_metodo_pago_sat := 'PUE', p_forma_pago_sat := '01',
    p_pac_proveedor := 'FACTURAPI'::cfdi_proveedor_pac);
  SELECT descuento_mxn, total_mxn INTO v_d, v_tot FROM tickets_cfdi WHERE id = v_cfdi;
  IF v_d <> 30 THEN RAISE EXCEPTION 'el borrador del CFDI no lleva el canje como descuento: % (esperado 30)', v_d; END IF;
  IF v_tot <> 90 THEN RAISE EXCEPTION 'total del borrador del CFDI % (esperado 90)', v_tot; END IF;

  -- 8) El piso del envío: un canje de 999 sobre 2 x 120 + envío de 35 deja el total en el envío
  --    y reporta solo los 240 de comida (el canje nunca se come el envío).
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn)
  VALUES (v_tenant, v_suc, 'Zona Lealtad', 35.00) RETURNING id INTO v_zona;
  v_t4 := abrir_ticket(v_suc, v_caja, v_turno, 'DELIVERY_PROPIO'::modo_servicio, v_cli, NULL, 'smoke-ltot-4', v_maria);
  PERFORM agregar_item_a_ticket(v_t4, v_prod, 2, NULL, '[]'::jsonb, 'smoke-ltot-4a');
  PERFORM fijar_envio_ticket(v_t4, v_zona);
  SELECT total_mxn INTO v_tot FROM tickets WHERE id = v_t4;
  IF v_tot <> 275 THEN RAISE EXCEPTION 'ticket con envío: % (esperado 275)', v_tot; END IF;
  INSERT INTO ticket_canjes_lealtad (id, tenant_id, ticket_id, cliente_id, puntos, monto_descontado_mxn)
  VALUES (gen_random_uuid(), v_tenant, v_t4, v_cli, 999, 999);
  SELECT * INTO r FROM tickets WHERE id = v_t4;
  IF r.total_mxn <> 35 THEN RAISE EXCEPTION 'el canje se comió el envío: total % (esperado 35)', r.total_mxn; END IF;
  IF r.lealtad_mxn <> 240 THEN RAISE EXCEPTION 'lealtad_mxn con envío % (esperado 240)', r.lealtad_mxn; END IF;

  -- 9) Premio sobre un renglón que ya trae 50% de descuento manual: el renglón queda en cero, el
  --    premio se acota a lo que quedaba (60) y el ticket vale solo el otro renglón.
  v_t4 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-ltot-5', v_maria);
  v_ia := agregar_item_a_ticket(v_t4, v_prod, 1, NULL, '[]'::jsonb, 'smoke-ltot-5a');
  v_ib := agregar_item_a_ticket(v_t4, v_prod, 1, NULL, '[]'::jsonb, 'smoke-ltot-5b');
  INSERT INTO autorizaciones_pin(tenant_id, sucursal_id, caja_id, turno_id,
    usuario_solicitante_id, usuario_autorizo_id, accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_tenant, v_suc, v_caja, v_turno, v_maria, v_maria, 'descuento_manual', 'descuento.manual_aplicar', 'ticket_item', v_ia, 'Smoke lealtad')
  RETURNING id INTO v_auth;
  PERFORM aplicar_descuento_manual(
    p_ticket_id := v_t4, p_ticket_item_id := v_ia,
    p_tipo := 'PORCENTAJE'::descuento_manual_tipo, p_valor := 50,
    p_motivo_categoria := 'CLIENTE_FRECUENTE'::descuento_manual_motivo, p_motivo_texto := 'VIP',
    p_autorizacion_pin_id := v_auth, p_usuario_solicitante_id := v_maria, p_usuario_autorizo_id := v_maria);
  SELECT * INTO r FROM tickets WHERE id = v_t4;
  IF r.total_mxn <> 180 THEN RAISE EXCEPTION 'con el 50%% manual: % (esperado 180)', r.total_mxn; END IF;
  INSERT INTO ticket_canjes_lealtad (id, tenant_id, ticket_id, cliente_id, ticket_item_id, puntos, monto_descontado_mxn)
  VALUES (gen_random_uuid(), v_tenant, v_t4, v_cli, v_ia, 6, 120);
  SELECT * INTO r FROM tickets WHERE id = v_t4;
  IF (SELECT total_item_mxn FROM ticket_items WHERE id = v_ia) <> 0 THEN RAISE EXCEPTION 'el renglón con descuento y premio no quedó en cero'; END IF;
  IF r.descuentos_manuales_mxn <> 60 THEN RAISE EXCEPTION 'descuentos_manuales_mxn % (esperado 60)', r.descuentos_manuales_mxn; END IF;
  IF r.promociones_mxn <> 0 THEN RAISE EXCEPTION 'promociones_mxn % (esperado 0)', r.promociones_mxn; END IF;
  IF r.lealtad_mxn <> 60 THEN RAISE EXCEPTION 'lealtad_mxn % (esperado 60: el premio se acota a lo que queda del renglón)', r.lealtad_mxn; END IF;
  IF r.total_mxn <> 120 THEN RAISE EXCEPTION 'total % (esperado 120: el otro renglón)', r.total_mxn; END IF;

  RAISE NOTICE 'SMOKE LEALTAD TOTALES OK';
END $$;
ROLLBACK;
