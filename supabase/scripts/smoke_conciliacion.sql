-- Smoke B2 Dark Kitchen · conciliación: la capa de datos que usa el admin.
-- 1) venta APP_RAPPI con folio_externo_app  2) insertar liquidación + renglones (RLS)
-- 3) la query de tickets del período encuentra la venta  4) persistir match + cabecera. ROLLBACK.
-- (El motor de match en sí está testeado en vitest — aquí se valida el contrato con la BD.)
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"99999999-0000-0000-0000-000000000001","tenant_id":"99999999-0000-0000-0000-0000000000aa","role":"authenticated"}';
DO $$
DECLARE
  v_t uuid:='99999999-0000-0000-0000-0000000000aa'; v_s uuid:='99999999-0000-0000-0000-0000000000bb';
  v_c uuid:='99999999-0000-0000-0000-0000000000cc'; v_m uuid:='99999999-0000-0000-0000-000000000001';
  v_turno uuid; v_ticket uuid; v_prod uuid; v_liq uuid; v_item uuid; v_n int; v_estado text; v_pct numeric;
BEGIN
  -- venta por app con folio externo (lo que el POS registra de un pedido Rappi)
  UPDATE turnos SET estado='CERRADO' WHERE caja_id=v_c AND estado='ABIERTO';
  INSERT INTO turnos(tenant_id,sucursal_id,caja_id,codigo_turno,dia_contable,usuario_apertura_id,fondo_inicial_mxn,fondo_modo)
  VALUES(v_t,v_s,v_c,'SM-CONC',CURRENT_DATE,v_m,500,'TOTAL') RETURNING id INTO v_turno;
  SELECT id INTO v_prod FROM productos WHERE tenant_id=v_t LIMIT 1;
  v_ticket:=abrir_ticket(v_s,v_c,v_turno,'APP_RAPPI'::modo_servicio,NULL,NULL,'sm-conc-1',v_m);
  PERFORM agregar_item_a_ticket(v_ticket,v_prod,1,NULL,'[]'::jsonb,'sm-conc-item');
  UPDATE tickets SET folio_externo_app='R-A4F92B' WHERE id=v_ticket;
  PERFORM aplicar_pago(v_ticket,'EFECTIVO'::metodo_pago,120,120,NULL,NULL,NULL,false,NULL,'sm-conc-pago');

  -- liquidación + renglón (lo que sube el admin)
  INSERT INTO apps_liquidaciones(tenant_id, app_externa, folio_liquidacion_app, periodo_inicio, periodo_fin,
    total_ventas_brutas_mxn, total_liquidado_mxn, ingesta_metodo, estado)
  VALUES (v_t, 'APP_RAPPI', 'LIQ-SMOKE-1', CURRENT_DATE - 1, CURRENT_DATE + 1, 120, 102, 'MANUAL', 'PENDIENTE')
  RETURNING id INTO v_liq;
  INSERT INTO apps_liquidacion_items(tenant_id, liquidacion_id, folio_externo_app, monto_venta_mxn, monto_neto_mxn)
  VALUES (v_t, v_liq, 'R-A4F92B', 120, 102) RETURNING id INTO v_item;

  -- la query del admin encuentra el ticket del período
  SELECT count(*) INTO v_n FROM tickets
   WHERE modo_servicio='APP_RAPPI' AND dia_contable BETWEEN CURRENT_DATE-1 AND CURRENT_DATE+1
     AND estado_fiscal IN ('PAGADO','FACTURADO') AND folio_externo_app='R-A4F92B';
  RAISE NOTICE 'tickets APP del período encontrados=%', v_n;
  IF v_n < 1 THEN RAISE EXCEPTION 'query de tickets del período no encontró la venta'; END IF;

  -- persistir match + cabecera (lo que hace conciliarLiquidacion)
  UPDATE apps_liquidacion_items SET ticket_id_match=v_ticket, match_metodo='FOLIO_EXACTO', monto_diferencia_mxn=0, match_at=now() WHERE id=v_item;
  UPDATE apps_liquidaciones SET total_pos_mxn=120, diferencia_mxn=0, porcentaje_match=100, estado='CONCILIADA', conciliado_at=now() WHERE id=v_liq;
  SELECT estado, porcentaje_match INTO v_estado, v_pct FROM apps_liquidaciones WHERE id=v_liq;
  RAISE NOTICE 'liquidación: estado=% match=%%%', v_estado, v_pct;
  IF v_estado<>'CONCILIADA' THEN RAISE EXCEPTION 'no quedó CONCILIADA'; END IF;

  RAISE NOTICE 'SMOKE CONCILIACION OK: venta APP + liquidación + match persistido bajo RLS.';
END $$;
ROLLBACK;
