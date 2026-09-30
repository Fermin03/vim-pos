-- Smoke Fase 3 · cobro offline del outbox web CONGELADO.
--
-- Hasta la 0137 este smoke comprobaba que las operaciones de construirOpsCobro (ticket → item con
-- snapshots → pago) RECONSTRUÍAN la venta en el servidor. Ese era el problema: la venta se
-- reconstruía con el precio y el monto que mandaba el cliente, y cualquier cajero con su JWT podía
-- mandar un renglón a $0.01 o un pago inventado (auditoría integral 30/09/2026). El outbox está
-- congelado —nada encola desde la Fase 3—, así que desde la 0138 las operaciones NO se aplican: se
-- guardan íntegras en sync_conflictos (OTRO / OUTBOX_CONGELADO) para revisión manual.
--
-- Lo que se comprueba ahora: 1) nada se escribe en tickets/ticket_items/pagos; 2) cada operación
-- queda guardada con su payload; 3) el reenvío responde IDEMPOTENTE (para que la tablet la suelte)
-- y no duplica el conflicto. ROLLBACK.
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
  IF (v_resp->'totales'->>'conflictos')::int <> 4 THEN
    RAISE EXCEPTION 'las 4 operaciones debían quedar como conflicto, quedaron: %', v_resp->'totales';
  END IF;

  -- 1) Nada se aplicó.
  IF EXISTS (SELECT 1 FROM tickets WHERE id = v_tk OR client_id_local = 'off-tk') THEN
    RAISE EXCEPTION 'el outbox congelado creó un ticket';
  END IF;
  IF EXISTS (SELECT 1 FROM ticket_items WHERE ticket_id = v_tk) OR EXISTS (SELECT 1 FROM pagos WHERE ticket_id = v_tk) THEN
    RAISE EXCEPTION 'el outbox congelado escribió renglones o pagos';
  END IF;

  -- 2) Todo quedó guardado para revisión, con su payload.
  SELECT count(*) AS n,
         count(*) FILTER (WHERE entidad_tipo = 'pagos'
                          AND (payload_intentado->'payload'->>'monto_mxn')::numeric = v_prod.precio_base_mxn*2) AS pago_ok
    INTO r
    FROM sync_conflictos
   WHERE tenant_id = v_t AND diferencia_detectada->>'motivo' = 'OUTBOX_CONGELADO'
     AND client_id_local IN ('off-tk','off-up','off-it','off-pg');
  IF r.n <> 4 OR r.pago_ok <> 1 THEN RAISE EXCEPTION 'no quedaron guardadas las 4 operaciones (n=%, pago=%)', r.n, r.pago_ok; END IF;

  -- 3) El reenvío la suelta (IDEMPOTENTE) sin duplicar.
  v_resp := sync_procesar_push('caja-off','Caja 01', jsonb_build_array(
    jsonb_build_object('client_id_local','off-tk','tabla','tickets','operacion','INSERT','entidad_id_local',v_tk,'fecha_operacion',v_ahora,
      'payload', jsonb_build_object('sucursal_id',v_s,'caja_id',v_c,'turno_id',v_turno,'modo_servicio','PARA_LLEVAR','usuario_apertura_id',v_m,'fecha_apertura',v_ahora,'client_id_local','off-tk'))));
  IF (v_resp->'totales'->>'idempotentes')::int <> 1 THEN RAISE EXCEPTION 'el reenvío no respondió IDEMPOTENTE: %', v_resp->'totales'; END IF;
  SELECT count(*) AS n INTO r FROM sync_conflictos WHERE client_id_local = 'off-tk';
  IF r.n <> 1 THEN RAISE EXCEPTION 'el reenvío duplicó el conflicto'; END IF;

  RAISE NOTICE 'SMOKE COBRO-OFFLINE OK: outbox congelado — nada aplicado, todo guardado para revisión, reenvío idempotente.';
END $$;
ROLLBACK;
