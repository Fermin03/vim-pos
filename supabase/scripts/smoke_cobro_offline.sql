-- Smoke Fase 3 · cobro offline: las operaciones que arma construirOpsCobro
-- (ticket BORRADOR → UPDATE ABIERTO[folio] → item[snapshots] → pago) pasan por
-- sync_procesar_push y RECONSTRUYEN la venta en el servidor: ticket con folio, items, pago,
-- total y monto pagado correctos, e idempotente. ROLLBACK.
-- NOTA: el flip final a PAGADO vive en el RPC aplicar_pago (no en trigger) y el sync bloquea
-- cambiar estado_fiscal por UPDATE crudo → la venta sincronizada queda ABIERTA totalmente
-- pagada (monto_pagado = total). Cerrar a PAGADO al sincronizar = cambio de backend pendiente.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"99999999-0000-0000-0000-000000000001","tenant_id":"99999999-0000-0000-0000-0000000000aa","role":"authenticated"}';
DO $$
DECLARE
  v_t uuid:='99999999-0000-0000-0000-0000000000aa'; v_s uuid:='99999999-0000-0000-0000-0000000000bb';
  v_c uuid:='99999999-0000-0000-0000-0000000000cc'; v_m uuid:='99999999-0000-0000-0000-000000000001';
  v_turno uuid; v_prod record; v_tk uuid:=gen_random_uuid(); v_ahora text:=now()::text; v_resp jsonb; r record;
BEGIN
  UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=v_c AND estado='ABIERTO';
  INSERT INTO turnos(tenant_id,sucursal_id,caja_id,codigo_turno,dia_contable,usuario_apertura_id,fondo_inicial_mxn,fondo_modo)
  VALUES(v_t,v_s,v_c,'SM-OFF',CURRENT_DATE,v_m,500,'TOTAL') RETURNING id INTO v_turno;
  SELECT id,nombre,codigo_interno,precio_base_mxn,tasa_iva,iva_incluido_en_precio,clave_sat,unidad_sat
    INTO v_prod FROM productos WHERE tenant_id=v_t AND precio_base_mxn>0 LIMIT 1;

  v_resp := sync_procesar_push('caja-off','Caja 01', jsonb_build_array(
    jsonb_build_object('client_id_local','off-tk','tabla','tickets','operacion','INSERT','entidad_id_local',v_tk,'fecha_operacion',v_ahora,
      'payload', jsonb_build_object('sucursal_id',v_s,'caja_id',v_c,'turno_id',v_turno,'modo_servicio','PARA_LLEVAR','usuario_apertura_id',v_m,'fecha_apertura',v_ahora,'client_id_local','off-tk')),
    jsonb_build_object('client_id_local','off-up','tabla','tickets','operacion','UPDATE','entidad_id_local',v_tk,'fecha_operacion',v_ahora,'payload', jsonb_build_object('estado_fiscal','ABIERTO')),
    jsonb_build_object('client_id_local','off-it','tabla','ticket_items','operacion','INSERT','entidad_id_local',gen_random_uuid(),'fecha_operacion',v_ahora,
      'payload', jsonb_build_object('ticket_id',v_tk,'producto_id',v_prod.id,'cantidad',2,'orden_visualizacion',1,'producto_nombre_snapshot',v_prod.nombre,
        'precio_unitario_snapshot',v_prod.precio_base_mxn,'tasa_iva_snapshot',v_prod.tasa_iva,'iva_incluido_en_precio_snapshot',v_prod.iva_incluido_en_precio,'categoria_nombre_snapshot','General')),
    jsonb_build_object('client_id_local','off-pg','tabla','pagos','operacion','INSERT','entidad_id_local',gen_random_uuid(),'fecha_operacion',v_ahora,
      'payload', jsonb_build_object('sucursal_id',v_s,'caja_id',v_c,'turno_id',v_turno,'ticket_id',v_tk,'metodo_pago','EFECTIVO','monto_mxn',(v_prod.precio_base_mxn*2),'monto_recibido_mxn',(v_prod.precio_base_mxn*2),'es_pago_al_recibir',false,'estado','APLICADO','usuario_id',v_m))
  ));
  IF (v_resp->'totales'->>'errores')::int <> 0 THEN RAISE EXCEPTION 'el push tuvo errores: %', v_resp->'operaciones'; END IF;

  SELECT t.estado_fiscal, t.total_mxn, t.monto_pagado_mxn, t.folio_completo IS NOT NULL AS tiene_folio,
         (SELECT count(*) FROM ticket_items ti WHERE ti.ticket_id=t.id AND NOT ti.cancelado) AS n_items,
         (SELECT count(*) FROM pagos pg WHERE pg.ticket_id=t.id) AS n_pagos
    INTO r FROM tickets t WHERE t.client_id_local='off-tk';
  RAISE NOTICE 'reconstruido: estado=% folio=% total=% pagado=% items=% pagos=%', r.estado_fiscal, r.tiene_folio, r.total_mxn, r.monto_pagado_mxn, r.n_items, r.n_pagos;
  IF NOT r.tiene_folio OR r.n_items<>1 OR r.n_pagos<>1 THEN RAISE EXCEPTION 'no se reconstruyó la venta'; END IF;
  IF r.total_mxn <> v_prod.precio_base_mxn*2 OR r.monto_pagado_mxn <> v_prod.precio_base_mxn*2 THEN RAISE EXCEPTION 'total/pagado incorrecto'; END IF;

  -- Idempotencia: reenviar no duplica
  PERFORM sync_procesar_push('caja-off','Caja 01', jsonb_build_array(
    jsonb_build_object('client_id_local','off-tk','tabla','tickets','operacion','INSERT','entidad_id_local',v_tk,'fecha_operacion',v_ahora,
      'payload', jsonb_build_object('sucursal_id',v_s,'caja_id',v_c,'turno_id',v_turno,'modo_servicio','PARA_LLEVAR','usuario_apertura_id',v_m,'fecha_apertura',v_ahora,'client_id_local','off-tk'))));
  SELECT count(*) INTO r FROM tickets WHERE client_id_local='off-tk';
  IF r.count <> 1 THEN RAISE EXCEPTION 'el reenvío duplicó el ticket'; END IF;

  RAISE NOTICE 'SMOKE COBRO-OFFLINE OK: venta reconstruida (folio+items+pago, total/pagado correctos) e idempotente. (Flip a PAGADO = backend pendiente.)';
END $$;
ROLLBACK;
