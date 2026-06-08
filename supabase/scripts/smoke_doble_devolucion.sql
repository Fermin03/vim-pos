-- Smoke 0040: la SEGUNDA devolución total del mismo ticket debe ser RECHAZADA (tope acumulado).
-- ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno  uuid; v_ticket uuid; v_prod uuid; v_auth uuid; v_dev uuid; v_item uuid;
  v_items jsonb; v_segunda_rechazada boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);

  UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=v_caja AND estado='ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable,
                     usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-2DEV', CURRENT_DATE, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;

  SELECT id INTO v_prod FROM productos WHERE tenant_id=v_tenant AND nombre='Hamburguesa Clásica' LIMIT 1;
  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, '2dev-1', v_maria);
  v_item := agregar_item_a_ticket(v_ticket, v_prod, 1, NULL, '[]'::jsonb, '2dev-item');
  PERFORM aplicar_pago(v_ticket, 'EFECTIVO'::metodo_pago, 120, 120, NULL, NULL, NULL, false, NULL, '2dev-pago');
  v_items := jsonb_build_array(jsonb_build_object('ticket_item_id', v_item, 'cantidad_devuelta', 1));

  INSERT INTO autorizaciones_pin(tenant_id, sucursal_id, caja_id, turno_id,
    usuario_solicitante_id, usuario_autorizo_id, accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_tenant, v_suc, v_caja, v_turno, v_maria, v_maria, 'devolucion', 'venta.devolucion', 'ticket', v_ticket, 'def')
  RETURNING id INTO v_auth;

  -- 1ª devolución total → OK
  v_dev := crear_devolucion(
    p_ticket_original_id := v_ticket, p_caja_id := v_caja, p_turno_id := v_turno,
    p_alcance := 'TOTAL'::devolucion_alcance, p_motivo := 'PRODUCTO_DEFECTUOSO'::devolucion_motivo,
    p_motivo_texto := 'x', p_medio_devolucion := 'EFECTIVO'::devolucion_medio,
    p_autorizacion_pin_id := v_auth, p_usuario_solicitante_id := v_maria, p_usuario_autorizo_id := v_maria,
    p_items := v_items, p_reversar_inventario := false, p_nota := '1a');
  PERFORM confirmar_devolucion(v_dev, v_maria);
  RAISE NOTICE '1a devolución OK: total=%', (SELECT total_devuelto_mxn FROM devoluciones WHERE id=v_dev);

  -- 2ª devolución total del MISMO ticket/ítem → debe FALLAR
  BEGIN
    PERFORM crear_devolucion(
      p_ticket_original_id := v_ticket, p_caja_id := v_caja, p_turno_id := v_turno,
      p_alcance := 'TOTAL'::devolucion_alcance, p_motivo := 'PRODUCTO_DEFECTUOSO'::devolucion_motivo,
      p_motivo_texto := 'x', p_medio_devolucion := 'EFECTIVO'::devolucion_medio,
      p_autorizacion_pin_id := v_auth, p_usuario_solicitante_id := v_maria, p_usuario_autorizo_id := v_maria,
      p_items := v_items, p_reversar_inventario := false, p_nota := '2a');
  EXCEPTION WHEN others THEN
    v_segunda_rechazada := true;
    RAISE NOTICE '2a devolución RECHAZADA (correcto): %', SQLERRM;
  END;

  IF NOT v_segunda_rechazada THEN
    RAISE EXCEPTION 'FALLO: la segunda devolución del mismo ticket NO fue rechazada (doble reembolso posible)';
  END IF;
  RAISE NOTICE 'SMOKE DOBLE DEVOLUCION OK: 1a permitida, 2a bloqueada por tope acumulado.';
END $$;
ROLLBACK;
