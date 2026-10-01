-- Smoke de la 0126: la caja registra lo que imprime. imprimir_comanda acepta un producto SIN
-- estación (se guarda como "Cocina"), la reimpresión de comanda exige PIN y motivo, la
-- reimpresión del ticket del cliente queda en ticket_reimpresiones, sale en su vista del panel y
-- viaja a la nube con sync_push_snapshot.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno  uuid; v_ticket uuid; v_prod uuid; v_auth uuid; v_imp uuid;
  v_area   text; v_n integer; v_res jsonb; v_fila jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);

  UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=v_caja AND estado='ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable,
                     usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-RI', CURRENT_DATE, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;

  SELECT id INTO v_prod FROM productos WHERE tenant_id=v_tenant AND nombre='Hamburguesa Clásica' LIMIT 1;
  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-ri-1', v_maria);
  PERFORM agregar_item_a_ticket(v_ticket, v_prod, 1, NULL, '[]'::jsonb, 'smoke-ri-h');

  -- 1) Comanda inicial de un producto sin estación: se registra como "Cocina".
  v_imp := imprimir_comanda(v_ticket, NULL, 'COCINA', '[{"cantidad":1,"nombre":"Hamburguesa Clásica","modificadores":[]}]'::jsonb,
                            'IMPRESION_INICIAL', 'OK');
  SELECT area_cocina_nombre_snapshot INTO v_area FROM comanda_impresiones WHERE id = v_imp;
  IF v_area IS DISTINCT FROM 'Cocina' THEN RAISE EXCEPTION 'sin área esperaba "Cocina", salió %', v_area; END IF;

  -- 2) Reimprimir sin PIN: rechazada.
  BEGIN
    PERFORM imprimir_comanda(v_ticket, NULL, 'COCINA', '[]'::jsonb, 'REIMPRESION_CAJERO', 'OK', NULL, 'Se perdió', NULL);
    RAISE EXCEPTION 'una reimpresión sin PIN debía rechazarse';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'una reimpresión sin PIN%' THEN RAISE; END IF;
  END;

  -- 3) Con autorización: pasa y cuenta para el reporte.
  INSERT INTO autorizaciones_pin(tenant_id, sucursal_id, caja_id, turno_id,
    usuario_solicitante_id, usuario_autorizo_id, accion, permiso_codigo, entidad_tipo, entidad_id, monto_mxn, motivo)
  VALUES (v_tenant, v_suc, v_caja, v_turno, v_maria, v_maria, 'reimprimir_comanda', 'cocina.reimprimir_comanda', 'ticket', v_ticket, NULL, 'La impresora falló')
  RETURNING id INTO v_auth;
  PERFORM imprimir_comanda(v_ticket, NULL, 'COCINA', '[]'::jsonb, 'REIMPRESION_CAJERO', 'OK', NULL, 'La impresora falló', v_auth);
  SELECT count(*) INTO v_n FROM vw_reimpresiones_por_cajero WHERE tenant_id = v_tenant AND cajero_id = v_maria;
  IF v_n = 0 THEN RAISE EXCEPTION 'la reimpresión de comanda no aparece en vw_reimpresiones_por_cajero'; END IF;

  -- 4) Reimpresión del ticket del cliente: tabla y vista.
  INSERT INTO ticket_reimpresiones (tenant_id, sucursal_id, caja_id, turno_id, ticket_id, usuario_id, origen)
  VALUES (v_tenant, v_suc, v_caja, v_turno, v_ticket, v_maria, 'CONSULTA')
  RETURNING to_jsonb(ticket_reimpresiones.*) INTO v_fila;
  SELECT COALESCE(sum(reimpresiones_count), 0) INTO v_n FROM vw_reimpresiones_ticket_por_cajero WHERE tenant_id = v_tenant AND cajero_id = v_maria;
  IF v_n <> 1 THEN RAISE EXCEPTION 'vw_reimpresiones_ticket_por_cajero esperaba 1, dio %', v_n; END IF;
  BEGIN
    INSERT INTO ticket_reimpresiones (tenant_id, sucursal_id, ticket_id, usuario_id, origen)
    VALUES (v_tenant, v_suc, v_ticket, v_maria, 'INVENTADO');
    RAISE EXCEPTION 'un origen desconocido debía rechazarse';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 5) La nube la replica desde la caja: se borra y se vuelve a meter por sync_push_snapshot.
  DELETE FROM ticket_reimpresiones WHERE id = (v_fila->>'id')::uuid;
  v_res := sync_push_snapshot(v_tenant, jsonb_build_object('ticket_reimpresiones', jsonb_build_array(v_fila)));
  IF COALESCE((v_res->>'ticket_reimpresiones')::int, 0) <> 1 THEN
    RAISE EXCEPTION 'sync_push_snapshot no aplicó ticket_reimpresiones: %', v_res;
  END IF;

  -- 6) La comanda de cocina NO cuenta como ticket del cliente impreso (0149): a estas alturas la
  --    comanda ya salió y se reimprimió, y el ticket sigue sin sello hasta que la caja lo marca.
  IF (SELECT comanda_impresa_at FROM tickets WHERE id = v_ticket) IS NULL THEN
    RAISE EXCEPTION 'la comanda inicial debía sellar comanda_impresa_at';
  END IF;
  IF (SELECT ticket_impreso_at FROM tickets WHERE id = v_ticket) IS NOT NULL THEN
    RAISE EXCEPTION 'imprimir la comanda no debe sellar ticket_impreso_at';
  END IF;
  PERFORM marcar_ticket_impreso(v_ticket);
  IF (SELECT ticket_impreso_at FROM tickets WHERE id = v_ticket) IS NULL THEN
    RAISE EXCEPTION 'marcar_ticket_impreso no selló el ticket';
  END IF;

  RAISE NOTICE 'smoke_registro_impresiones OK';
END $$;
ROLLBACK;
