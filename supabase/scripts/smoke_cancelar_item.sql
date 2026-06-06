-- Smoke F6.1 cancelar_item_ticket (rol postgres). Crea turno+ticket+2 items, cancela uno
-- sin PIN (estado_cocina=PENDIENTE) y verifica que el total baja y queda 1 item activo.
-- Ejecutar: docker exec -i ... psql ... < smoke_cancelar_item.sql   (bash, UTF-8).
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
  v_total_antes numeric; v_total_despues numeric;
  v_activos integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);

  UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=v_caja AND estado='ABIERTO';

  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable,
                     usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-CAN', CURRENT_DATE, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;

  SELECT id INTO v_prod_h FROM productos WHERE tenant_id=v_tenant AND nombre='Hamburguesa Clásica' LIMIT 1;
  SELECT id INTO v_prod_p FROM productos WHERE tenant_id=v_tenant AND nombre='Papas Gajo' LIMIT 1;

  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-can-1', v_maria);
  v_item_h := agregar_item_a_ticket(v_ticket, v_prod_h, 1, NULL, '[]'::jsonb, 'smoke-can-h');
  v_item_p := agregar_item_a_ticket(v_ticket, v_prod_p, 2, NULL, '[]'::jsonb, 'smoke-can-p');

  SELECT total_mxn INTO v_total_antes FROM tickets WHERE id=v_ticket;
  RAISE NOTICE 'total antes: %', v_total_antes;  -- esperado 120 + 110 = 230

  -- Cancelar la línea de Papas (sin PIN — comanda no enviada a cocina)
  PERFORM cancelar_item_ticket(v_item_p, 'Cliente no quiere papas', NULL);

  SELECT total_mxn INTO v_total_despues FROM tickets WHERE id=v_ticket;
  RAISE NOTICE 'total despues: %', v_total_despues;  -- esperado 120
  IF v_total_despues >= v_total_antes THEN
    RAISE EXCEPTION 'cancelar NO bajo el total: %  -> %', v_total_antes, v_total_despues;
  END IF;

  SELECT count(*) INTO v_activos FROM ticket_items WHERE ticket_id=v_ticket AND cancelado=false;
  RAISE NOTICE 'items activos: %', v_activos;  -- esperado 1
  IF v_activos <> 1 THEN RAISE EXCEPTION 'items activos inesperados: %', v_activos; END IF;

  RAISE NOTICE 'SMOKE CANCELAR ITEM OK: % -> % (%-1 = % item)', v_total_antes, v_total_despues, 2, v_activos;
END $$;
ROLLBACK;
