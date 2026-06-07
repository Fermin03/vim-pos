-- Smoke F6.3 (Modelo B): devolución de una venta pagada vía crear_devolucion + confirmar_devolucion.
-- Verifica que la venta original queda INTACTA (PAGADA, monto_pagado sin cambios), que existe un
-- documento de devolución CONFIRMADA y un movimiento de caja DEVOLUCION_EFECTIVO. ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno  uuid; v_ticket uuid; v_prod uuid; v_auth uuid; v_dev uuid; v_item uuid;
  v_estado text; v_pagado numeric; v_movs int; v_items jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);

  UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=v_caja AND estado='ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable,
                     usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-DEV', CURRENT_DATE, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;

  SELECT id INTO v_prod FROM productos WHERE tenant_id=v_tenant AND nombre='Hamburguesa Clásica' LIMIT 1;
  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-dev-1', v_maria);
  v_item := agregar_item_a_ticket(v_ticket, v_prod, 1, NULL, '[]'::jsonb, 'smoke-dev-item');
  PERFORM aplicar_pago(v_ticket, 'EFECTIVO'::metodo_pago, 120, 120, NULL, NULL, NULL, false, NULL, 'smoke-dev-pago');
  -- Devolución TOTAL = todos los items con su cantidad completa.
  v_items := jsonb_build_array(jsonb_build_object('ticket_item_id', v_item, 'cantidad_devuelta', 1));

  SELECT estado_fiscal, monto_pagado_mxn INTO v_estado, v_pagado FROM tickets WHERE id=v_ticket;
  RAISE NOTICE 'tras pagar: % / pagado=% (esperado PAGADO / 120)', v_estado, v_pagado;
  IF v_estado <> 'PAGADO' THEN RAISE EXCEPTION 'no quedó PAGADO'; END IF;

  -- Autorización para la devolución
  INSERT INTO autorizaciones_pin(tenant_id, sucursal_id, caja_id, turno_id,
    usuario_solicitante_id, usuario_autorizo_id, accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_tenant, v_suc, v_caja, v_turno, v_maria, v_maria, 'devolucion', 'venta.devolucion', 'ticket', v_ticket, 'Producto defectuoso')
  RETURNING id INTO v_auth;

  -- Crear + confirmar la devolución TOTAL en efectivo (sin reversa de inventario: módulo aparte, #29).
  v_dev := crear_devolucion(
    p_ticket_original_id := v_ticket, p_caja_id := v_caja, p_turno_id := v_turno,
    p_alcance := 'TOTAL'::devolucion_alcance, p_motivo := 'PRODUCTO_DEFECTUOSO'::devolucion_motivo,
    p_motivo_texto := 'Hamburguesa fría', p_medio_devolucion := 'EFECTIVO'::devolucion_medio,
    p_autorizacion_pin_id := v_auth, p_usuario_solicitante_id := v_maria, p_usuario_autorizo_id := v_maria,
    p_items := v_items, p_reversar_inventario := false, p_nota := 'Reembolso en efectivo');
  PERFORM confirmar_devolucion(v_dev, v_maria);

  -- La venta original debe quedar INTACTA (Modelo B).
  SELECT estado_fiscal, monto_pagado_mxn INTO v_estado, v_pagado FROM tickets WHERE id=v_ticket;
  RAISE NOTICE 'tras devolver: ticket=% / pagado=% (esperado PAGADO / 120 sin cambios)', v_estado, v_pagado;
  IF v_estado <> 'PAGADO' THEN RAISE EXCEPTION 'la venta NO debe cancelarse (Modelo B)'; END IF;
  IF v_pagado <> 120 THEN RAISE EXCEPTION 'monto_pagado del ticket NO debe cambiar (era 120, es %)', v_pagado; END IF;

  -- Debe existir el documento de devolución CONFIRMADA.
  IF (SELECT estado FROM devoluciones WHERE id=v_dev) <> 'CONFIRMADA' THEN
    RAISE EXCEPTION 'la devolución no quedó CONFIRMADA'; END IF;

  -- El total devuelto debe ser EXACTAMENTE el total del ticket (120), sin IVA de más (#33).
  IF (SELECT total_devuelto_mxn FROM devoluciones WHERE id=v_dev) <> 120 THEN
    RAISE EXCEPTION 'total devuelto incorrecto: % (esperado 120, IVA incluido)',
      (SELECT total_devuelto_mxn FROM devoluciones WHERE id=v_dev); END IF;

  -- Diagnóstico: estado/turno/total de la devolución + movimientos del turno.
  RAISE NOTICE 'devolucion: estado=% turno=% total=%',
    (SELECT estado FROM devoluciones WHERE id=v_dev),
    (SELECT turno_id FROM devoluciones WHERE id=v_dev),
    (SELECT total_devuelto_mxn FROM devoluciones WHERE id=v_dev);
  RAISE NOTICE 'movimientos del turno: %',
    (SELECT string_agg(tipo::text||'='||monto_mxn::text, ', ') FROM movimientos_caja WHERE turno_id=v_turno);

  -- Debe existir el movimiento de caja por el efectivo que salió.
  SELECT count(*) INTO v_movs FROM movimientos_caja
   WHERE turno_id=v_turno AND tipo='DEVOLUCION_EFECTIVO';
  RAISE NOTICE 'movimientos DEVOLUCION_EFECTIVO: %', v_movs;
  IF v_movs < 1 THEN RAISE EXCEPTION 'no se registró el movimiento de caja del reembolso'; END IF;

  RAISE NOTICE 'SMOKE DEVOLUCION (Modelo B) OK: venta intacta PAGADA + documento devolución + salida de caja.';
END $$;
ROLLBACK;
