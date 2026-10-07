-- Smoke de la 0160: una cuenta con el ticket impreso se reabre solo con la autorización de un
-- supervisor, la autorización es de un uso y para ESE ticket, y reabrir quita el sello.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno  uuid; v_ticket uuid; v_otro uuid; v_prod uuid; v_auth uuid;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);

  UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=v_caja AND estado='ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable,
                     usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-RCI', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;

  SELECT id INTO v_prod FROM productos WHERE tenant_id=v_tenant AND nombre='Hamburguesa Clásica' LIMIT 1;
  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'DRIVE_THRU'::modo_servicio, NULL, NULL, 'smoke-rci-1', v_maria);
  PERFORM agregar_item_a_ticket(v_ticket, v_prod, 1, NULL, '[]'::jsonb, 'smoke-rci-h1');
  v_otro := abrir_ticket(v_suc, v_caja, v_turno, 'DRIVE_THRU'::modo_servicio, NULL, NULL, 'smoke-rci-2', v_maria);
  PERFORM agregar_item_a_ticket(v_otro, v_prod, 1, NULL, '[]'::jsonb, 'smoke-rci-h2');

  PERFORM marcar_ticket_impreso(v_ticket);
  PERFORM marcar_ticket_impreso(v_otro);

  -- 1) Sin autorización: rechazada, y el sello sigue.
  BEGIN
    PERFORM reabrir_cuenta_impresa(v_ticket, NULL);
    RAISE EXCEPTION 'reabrir sin autorización debía rechazarse';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF (SELECT ticket_impreso_at FROM tickets WHERE id = v_ticket) IS NULL THEN
    RAISE EXCEPTION 'un reabrir rechazado no debe quitar el sello';
  END IF;

  -- 2) Con una autorización de OTRO permiso: rechazada.
  INSERT INTO autorizaciones_pin(tenant_id, sucursal_id, caja_id, turno_id,
    usuario_solicitante_id, usuario_autorizo_id, accion, permiso_codigo, entidad_tipo, entidad_id, monto_mxn, motivo)
  VALUES (v_tenant, v_suc, v_caja, v_turno, v_maria, v_maria, 'reimprimir_comanda', 'cocina.reimprimir_comanda', 'ticket', v_ticket, NULL, 'smoke')
  RETURNING id INTO v_auth;
  BEGIN
    PERFORM reabrir_cuenta_impresa(v_ticket, v_auth);
    RAISE EXCEPTION 'una autorización de otro permiso debía rechazarse';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- 3) Con la autorización correcta: se quita el sello.
  INSERT INTO autorizaciones_pin(tenant_id, sucursal_id, caja_id, turno_id,
    usuario_solicitante_id, usuario_autorizo_id, accion, permiso_codigo, entidad_tipo, entidad_id, monto_mxn, motivo)
  VALUES (v_tenant, v_suc, v_caja, v_turno, v_maria, v_maria, 'reabrir_cuenta_impresa', 'venta.reimprimir_ticket', 'ticket', v_ticket, 100, 'Reabrir cuenta con ticket impreso')
  RETURNING id INTO v_auth;
  PERFORM reabrir_cuenta_impresa(v_ticket, v_auth);
  IF (SELECT ticket_impreso_at FROM tickets WHERE id = v_ticket) IS NOT NULL THEN
    RAISE EXCEPTION 'reabrir_cuenta_impresa no quitó el sello';
  END IF;

  -- 4) Esa autorización no sirve para otra cuenta. (Que no sirva dos veces lo cuida
  --    consumir_autorizacion, pero dentro de UNA transacción deja reusarla —0134—, y este smoke
  --    entero es una sola: aquí no se puede comprobar.)
  BEGIN
    PERFORM reabrir_cuenta_impresa(v_otro, v_auth);
    RAISE EXCEPTION 'la autorización de una cuenta no debe reabrir otra';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- 5) Reabrir una cuenta que no está impresa no hace nada (ni pide autorización).
  UPDATE tickets SET ticket_impreso_at = NULL WHERE id = v_otro;
  PERFORM reabrir_cuenta_impresa(v_otro, NULL);

  RAISE NOTICE 'smoke_reabrir_cuenta_impresa OK';
END $$;
ROLLBACK;
