-- Smoke F6.5: descuento por ÍTEM (PORCENTAJE) y OVERRIDE de precio sobre un ítem específico
-- de un ticket abierto, verificando que el total del ticket baja en cada caso. ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno  uuid; v_ticket uuid; v_prod_h uuid; v_prod_p uuid;
  v_item_h uuid; v_item_p uuid;
  v_total0 numeric; v_total1 numeric; v_total2 numeric;
  v_auth uuid;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);

  UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=v_caja AND estado='ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable,
                     usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-DI', CURRENT_DATE, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;

  SELECT id INTO v_prod_h FROM productos WHERE tenant_id=v_tenant AND nombre='Hamburguesa Clásica' LIMIT 1;
  SELECT id INTO v_prod_p FROM productos WHERE tenant_id=v_tenant AND nombre='Papas Gajo' LIMIT 1;

  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-di-1', v_maria);
  v_item_h := agregar_item_a_ticket(v_ticket, v_prod_h, 1, NULL, '[]'::jsonb, 'smoke-di-h');
  v_item_p := agregar_item_a_ticket(v_ticket, v_prod_p, 1, NULL, '[]'::jsonb, 'smoke-di-p');
  SELECT total_mxn INTO v_total0 FROM tickets WHERE id=v_ticket;
  RAISE NOTICE 'total inicial: % (120 + 55 = 175)', v_total0;

  -- Autorización propia para el descuento
  INSERT INTO autorizaciones_pin(tenant_id, sucursal_id, caja_id, turno_id,
    usuario_solicitante_id, usuario_autorizo_id, accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_tenant, v_suc, v_caja, v_turno, v_maria, v_maria, 'descuento_manual', 'descuento.manual_aplicar', 'ticket_item', v_item_h, 'Cliente frecuente')
  RETURNING id INTO v_auth;

  -- 1) Descuento 50% sobre la Hamburguesa (item_h)
  PERFORM aplicar_descuento_manual(
    p_ticket_id := v_ticket, p_ticket_item_id := v_item_h,
    p_tipo := 'PORCENTAJE'::descuento_manual_tipo, p_valor := 50,
    p_motivo_categoria := 'CLIENTE_FRECUENTE'::descuento_manual_motivo, p_motivo_texto := 'VIP',
    p_autorizacion_pin_id := v_auth, p_usuario_solicitante_id := v_maria, p_usuario_autorizo_id := v_maria);
  SELECT total_mxn INTO v_total1 FROM tickets WHERE id=v_ticket;
  RAISE NOTICE 'tras 50%% en hamburguesa: % (esperado < %)', v_total1, v_total0;
  IF v_total1 >= v_total0 THEN RAISE EXCEPTION 'descuento por item no bajó el total'; END IF;

  -- 2) Override de precio de las Papas a 30 (item_p)
  INSERT INTO autorizaciones_pin(tenant_id, sucursal_id, caja_id, turno_id,
    usuario_solicitante_id, usuario_autorizo_id, accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_tenant, v_suc, v_caja, v_turno, v_maria, v_maria, 'override_precio', 'descuento.manual_aplicar', 'ticket_item', v_item_p, 'Ajuste')
  RETURNING id INTO v_auth;
  PERFORM aplicar_descuento_manual(
    p_ticket_id := v_ticket, p_ticket_item_id := v_item_p,
    p_tipo := 'OVERRIDE_PRECIO'::descuento_manual_tipo, p_valor := 30,
    p_motivo_categoria := 'INCONVENIENCIA_OPERATIVA'::descuento_manual_motivo, p_motivo_texto := 'Ajuste',
    p_autorizacion_pin_id := v_auth, p_usuario_solicitante_id := v_maria, p_usuario_autorizo_id := v_maria);
  SELECT total_mxn INTO v_total2 FROM tickets WHERE id=v_ticket;
  RAISE NOTICE 'tras override papas a 30: % (esperado < %)', v_total2, v_total1;
  IF v_total2 >= v_total1 THEN RAISE EXCEPTION 'override de precio no bajó el total'; END IF;

  RAISE NOTICE 'SMOKE DESCUENTO ITEM OK: 175 -> % (50%% item) -> % (override).', v_total1, v_total2;
END $$;
ROLLBACK;
