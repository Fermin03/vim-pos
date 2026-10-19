-- Smoke: el cobro de belleza viaja con la caja instalada (belleza, entrega 2; 0223). Hace ROLLBACK.
-- Ejecutar: cd desktop && npm run smokes -- smoke_belleza_cobro_sync.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_diego  uuid := '99999999-0000-0000-0000-0000000000f1';
  v_cat    uuid := 'a0000000-0000-0000-0000-0000000000c1';
  v_otro   uuid := '22300000-0000-0000-0000-0000000000aa';
  v_corte  uuid := '22300000-0000-0000-0000-0000000000a1';
  v_turno uuid; v_cita uuid; v_k uuid; v_item uuid; v_ant uuid; v_parte uuid;
  v_snap jsonb; v_res jsonb; v_a jsonb; v_p jsonb; v_c jsonb; v_pull jsonb;
  r record;
  v_cita2 uuid; v_ant2 uuid; v_k2 uuid; v_k3 uuid; v_caja2 uuid; v_turno2 uuid;
  v_a2 jsonb; v_c2 jsonb; v_s2 jsonb; v_tk2 jsonb;
BEGIN
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_otro, 'tenant-0223', 'Otro negocio 0223', 'INTERNO', 'QUICK_SERVICE');
  UPDATE tenants SET vertical_principal = 'SALON', operacion = operacion || '{"agenda":true}' WHERE id = v_t;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  INSERT INTO productos (id, tenant_id, categoria_id, nombre, precio_base_mxn, tasa_iva, iva_incluido_en_precio)
  VALUES (v_corte, v_t, v_cat, 'Corte sync cobro', 180, 16, true);
  INSERT INTO servicios_agenda (producto_id, tenant_id, duracion_min, comision_tipo, comision_valor) VALUES (v_corte, v_t, 60, 'PORCENTAJE', 40);
  INSERT INTO colaboradores_agenda (usuario_id, tenant_id, sucursal_id, color_hex, orden) VALUES (v_diego, v_t, v_suc, '#0F766E', 1);
  INSERT INTO servicio_colaborador (producto_id, usuario_id, tenant_id) VALUES (v_corte, v_diego, v_t);
  INSERT INTO horarios_colaborador (tenant_id, usuario_id, dia_semana, inicia, termina) VALUES (v_t, v_diego, 1, '09:00', '20:00');
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_t, v_suc, v_caja, 'SMK-0223', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL') RETURNING id INTO v_turno;

  -- Lo que hace la caja sin internet: anticipo de $250, venta de un corte de $180 con Diego pagada
  -- con el anticipo (180 APLICADO + 70 VIGENTE, la parte sin client_id_local) y la cita COBRADA.
  v_cita := guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'Caja sin internet', 'inicia', '2030-01-07 10:00-06',
              'client_id_local', 'smk-0223-cita', 'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_corte, 'usuario_id', v_diego))));
  v_ant := registrar_anticipo(v_cita, 250, 'EFECTIVO', v_caja, v_turno, 'smk-0223-ant');
  v_k := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smk-0223-k', v_maria);
  v_item := agregar_item_a_ticket(v_k, v_corte, 1, NULL, '[]'::jsonb, 'smk-0223-i', v_diego);
  PERFORM vincular_cita_ticket(v_cita, v_k);
  IF pagar_con_anticipo(v_k, v_cita, 'smk-0223-p') <> 180 THEN RAISE EXCEPTION '0: debía aplicar 180'; END IF;
  SELECT id INTO v_parte FROM anticipos_cita WHERE cita_id = v_cita AND estado = 'VIGENTE';
  IF (SELECT estado FROM citas WHERE id = v_cita) <> 'COBRADA' OR v_parte IS NULL
     OR (SELECT client_id_local FROM anticipos_cita WHERE id = v_parte) IS NOT NULL THEN
    RAISE EXCEPTION '0: la caja no quedó como se esperaba'; END IF;

  SELECT jsonb_build_object(
    'tickets',         (SELECT jsonb_agg(to_jsonb(x)) FROM tickets x WHERE id = v_k),
    'ticket_items',    (SELECT jsonb_agg(to_jsonb(x)) FROM ticket_items x WHERE ticket_id = v_k),
    'pagos',           (SELECT jsonb_agg(to_jsonb(x)) FROM pagos x WHERE ticket_id = v_k),
    'citas',           (SELECT jsonb_agg(to_jsonb(x)) FROM citas x WHERE id = v_cita),
    'citas_servicios', (SELECT jsonb_agg(to_jsonb(x)) FROM citas_servicios x WHERE cita_id = v_cita),
    'anticipos_cita',  (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at, x.id) FROM anticipos_cita x WHERE cita_id = v_cita))
    INTO v_snap;
  SELECT * INTO r FROM ticket_items WHERE id = v_item;
  IF r.colaborador_id IS DISTINCT FROM v_diego OR r.comision_tipo IS DISTINCT FROM 'PORCENTAJE' OR r.comision_valor <> 40 THEN
    RAISE EXCEPTION '0: el renglón no congeló la regla: %', to_jsonb(r); END IF;

  -- La «nube» no tiene nada de eso; y la regla del servicio cambia después de la venta.
  SET LOCAL session_replication_role = replica;
  DELETE FROM anticipos_cita WHERE cita_id = v_cita;
  DELETE FROM pagos WHERE ticket_id = v_k;
  DELETE FROM ticket_items WHERE ticket_id = v_k;
  DELETE FROM tickets WHERE id = v_k;
  DELETE FROM citas_servicios WHERE cita_id = v_cita;
  DELETE FROM citas WHERE id = v_cita;
  SET LOCAL session_replication_role = origin;
  UPDATE servicios_agenda SET comision_valor = 10 WHERE producto_id = v_corte;
  -- La nube aplica el push como la función sync-push: con service_role.
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

  -- 1) El push llega completo: renglón con colaborador y regla congelada intacta, pago ANTICIPO,
  --    cita COBRADA con su ticket_id y los dos anticipos tal cual.
  v_res := sync_push_snapshot(v_t, v_snap);
  IF v_res ? '_errores' OR v_res ? '_ignoradas' OR (v_res->>'anticipos_cita')::int IS DISTINCT FROM 2
     OR (v_res->>'citas')::int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION '1: el push debía aplicarse completo: %', v_res; END IF;
  SELECT * INTO r FROM ticket_items WHERE id = v_item;
  IF r.colaborador_id IS DISTINCT FROM v_diego OR r.comision_tipo IS DISTINCT FROM 'PORCENTAJE'
     OR r.comision_valor IS DISTINCT FROM 40 OR r.comision_base IS DISTINCT FROM 'COBRADO' THEN
    RAISE EXCEPTION '1: la regla congelada no llegó intacta: %', to_jsonb(r); END IF;
  IF (SELECT comision_mxn FROM vw_comisiones_renglon WHERE ticket_item_id = v_item) IS DISTINCT FROM 62.07 THEN
    RAISE EXCEPTION '1: comisión en la nube: %', (SELECT comision_mxn FROM vw_comisiones_renglon WHERE ticket_item_id = v_item); END IF;
  IF NOT EXISTS (SELECT 1 FROM pagos WHERE ticket_id = v_k AND metodo_pago = 'ANTICIPO' AND monto_mxn = 180) THEN
    RAISE EXCEPTION '1: falta el pago ANTICIPO'; END IF;
  IF (SELECT (estado::text, ticket_id) FROM citas WHERE id = v_cita) IS DISTINCT FROM ('COBRADA'::text, v_k) THEN
    RAISE EXCEPTION '1: la cita debía quedar COBRADA con su venta: %', (SELECT to_jsonb(c) FROM citas c WHERE id = v_cita); END IF;
  IF (SELECT (estado, monto_mxn, ticket_id, turno_resuelve_id) FROM anticipos_cita WHERE id = v_ant)
       IS DISTINCT FROM ('APLICADO'::text, 180::numeric, v_k, v_turno)
     OR (SELECT (estado, monto_mxn, client_id_local) FROM anticipos_cita WHERE id = v_parte)
       IS DISTINCT FROM ('VIGENTE'::text, 70::numeric, NULL::varchar) THEN
    RAISE EXCEPTION '1: los anticipos no llegaron tal cual: %', (SELECT jsonb_agg(to_jsonb(a)) FROM anticipos_cita a WHERE cita_id = v_cita); END IF;

  -- 2) Repetirlo no duplica nada.
  v_res := sync_push_snapshot(v_t, v_snap);
  IF v_res ? '_errores' THEN RAISE EXCEPTION '2: el reenvío no debía fallar: %', v_res; END IF;
  IF (SELECT count(*) FROM anticipos_cita WHERE cita_id = v_cita) <> 2 OR (SELECT count(*) FROM ticket_items WHERE ticket_id = v_k) <> 1
     OR (SELECT count(*) FROM pagos WHERE ticket_id = v_k) <> 1 OR (SELECT count(*) FROM citas WHERE id = v_cita) <> 1 THEN
    RAISE EXCEPTION '2: se duplicó'; END IF;

  -- 3) Otra parte sin client_id_local (id nuevo) entra junto a la primera: los NULL no chocan.
  SELECT a INTO v_p FROM jsonb_array_elements(v_snap->'anticipos_cita') a WHERE a->>'id' = v_parte::text;
  v_res := sync_push_snapshot(v_t, jsonb_build_object('anticipos_cita',
             jsonb_build_array(v_p || jsonb_build_object('id', gen_random_uuid(), 'monto_mxn', 5))));
  IF v_res ? '_errores' OR (v_res->>'anticipos_cita')::int <> 1
     OR (SELECT count(*) FROM anticipos_cita WHERE cita_id = v_cita AND client_id_local IS NULL) <> 2 THEN
    RAISE EXCEPTION '3: la segunda parte sin client_id_local debía entrar: %', v_res; END IF;

  -- 4) VIGENTE en la nube → la caja lo resuelve (RETENIDO): entra.
  v_res := sync_push_snapshot(v_t, jsonb_build_object('anticipos_cita', jsonb_build_array(
             v_p || jsonb_build_object('estado', 'RETENIDO', 'turno_resuelve_id', v_turno, 'resuelto_at', now()))));
  IF v_res ? '_errores' OR (SELECT estado FROM anticipos_cita WHERE id = v_parte) <> 'RETENIDO' THEN
    RAISE EXCEPTION '4: el VIGENTE debía resolverse: %', v_res; END IF;
  -- … y una copia vieja VIGENTE no lo regresa (sin error: el pull se la baja a la caja).
  v_res := sync_push_snapshot(v_t, jsonb_build_object('anticipos_cita', jsonb_build_array(v_p)));
  IF v_res ? '_errores' OR (SELECT estado FROM anticipos_cita WHERE id = v_parte) <> 'RETENIDO' THEN
    RAISE EXCEPTION '4: un RETENIDO regresó a VIGENTE: %', v_res; END IF;

  -- 5) APLICADO → VIGENTE con la venta todavía pagada: no. La cita COBRADA tampoco regresa, ni pierde la venta.
  SELECT a INTO v_a FROM jsonb_array_elements(v_snap->'anticipos_cita') a WHERE a->>'id' = v_ant::text;
  v_a := v_a || '{"estado": "VIGENTE", "ticket_id": null, "turno_resuelve_id": null, "resuelto_at": null}'::jsonb;
  v_c := (v_snap->'citas'->0) || '{"estado": "TERMINADA", "ticket_id": null}'::jsonb;
  v_res := sync_push_snapshot(v_t, jsonb_build_object('anticipos_cita', jsonb_build_array(v_a),
             'citas', jsonb_build_array(v_c), 'citas_servicios', v_snap->'citas_servicios'));
  IF v_res ? '_errores' OR (SELECT estado FROM anticipos_cita WHERE id = v_ant) <> 'APLICADO'
     OR (SELECT (estado::text, ticket_id) FROM citas WHERE id = v_cita) IS DISTINCT FROM ('COBRADA'::text, v_k) THEN
    RAISE EXCEPTION '5: la nube debía conservar lo cobrado: %', v_res; END IF;
  -- Con la venta ya CANCELADA en la nube (como la sube la caja, en réplica): las dos vueltas atrás
  -- entran; la cita conserva el ticket_id aunque la caja lo mande vacío.
  v_res := sync_push_snapshot(v_t, jsonb_build_object('tickets', jsonb_build_array((v_snap->'tickets'->0) || '{"estado_fiscal": "CANCELADO"}'::jsonb),
             'anticipos_cita', jsonb_build_array(v_a), 'citas', jsonb_build_array(v_c), 'citas_servicios', v_snap->'citas_servicios'));
  IF v_res ? '_errores' OR (SELECT (estado, ticket_id) FROM anticipos_cita WHERE id = v_ant) IS DISTINCT FROM ('VIGENTE'::text, NULL::uuid)
     OR (SELECT (estado::text, ticket_id) FROM citas WHERE id = v_cita) IS DISTINCT FROM ('TERMINADA'::text, v_k) THEN
    RAISE EXCEPTION '5: con la venta cancelada debían regresar: %', v_res; END IF;

  -- 6) El pull baja los anticipos de las citas que baja, en todos sus estados.
  v_pull := sync_pull_snapshot(v_t);
  IF (SELECT count(*) FROM jsonb_array_elements(v_pull->'anticipos_cita') a WHERE a->>'cita_id' = v_cita::text) <> 3 THEN
    RAISE EXCEPTION '6: el pull debía bajar los 3 anticipos: %', v_pull->'anticipos_cita'; END IF;

  -- Otra cita cobrada con anticipo que la nube ya tiene (K2), y una venta abierta (K3).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  v_cita2 := guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'Otra', 'inicia', '2030-01-07 12:00-06',
               'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_corte, 'usuario_id', v_diego))));
  v_ant2 := registrar_anticipo(v_cita2, 180, 'EFECTIVO', v_caja, v_turno, 'smk-0223-ant2');
  v_k2 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smk-0223-k2', v_maria);
  PERFORM agregar_item_a_ticket(v_k2, v_corte, 1, NULL, '[]'::jsonb, 'smk-0223-i2', v_diego);
  PERFORM vincular_cita_ticket(v_cita2, v_k2);
  PERFORM pagar_con_anticipo(v_k2, v_cita2, 'smk-0223-p2');
  v_k3 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smk-0223-k3', v_maria);
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  SELECT to_jsonb(a) || '{"estado": "VIGENTE", "ticket_id": null, "turno_resuelve_id": null, "resuelto_at": null}'::jsonb
    INTO v_a2 FROM anticipos_cita a WHERE id = v_ant2;
  SELECT to_jsonb(c) INTO v_c2 FROM citas c WHERE id = v_cita2;
  SELECT jsonb_agg(to_jsonb(s)) INTO v_s2 FROM citas_servicios s WHERE cita_id = v_cita2;
  SELECT to_jsonb(t) INTO v_tk2 FROM tickets t WHERE id = v_k2;
  IF (SELECT estado FROM citas WHERE id = v_cita2) <> 'COBRADA' OR (SELECT estado FROM anticipos_cita WHERE id = v_ant2) <> 'APLICADO' THEN
    RAISE EXCEPTION '8: preparación'; END IF;

  -- 8) La caja canceló K2 pero esa fila se rechaza en el mismo envío: el anticipo VIGENTE y la cita
  --    TERMINADA van a _errores (se reintentan), no se pierden.
  v_res := sync_push_snapshot(v_t, jsonb_build_object(
    'tickets', jsonb_build_array(v_tk2 || jsonb_build_object('estado_fiscal', 'CANCELADO', 'tenant_id', v_otro)),
    'citas', jsonb_build_array(v_c2 || '{"estado": "TERMINADA"}'::jsonb), 'citas_servicios', v_s2,
    'anticipos_cita', jsonb_build_array(v_a2)));
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_res->'_errores') e WHERE e->>'id' = v_ant2::text AND e->>'error' = 'la cancelación de la venta aún no sube')
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_res->'_errores') e WHERE e->>'id' = v_cita2::text AND e->>'error' = 'la cancelación de la venta aún no sube') THEN
    RAISE EXCEPTION '8: debían quedar en _errores: %', v_res; END IF;
  IF (SELECT estado FROM anticipos_cita WHERE id = v_ant2) <> 'APLICADO' OR (SELECT estado FROM citas WHERE id = v_cita2) <> 'COBRADA' THEN
    RAISE EXCEPTION '8: la nube no debía cambiar todavía'; END IF;

  -- 9) Cobrar la cita en otra venta (K3): sin K2 cancelada es una copia vieja; con K2 cancelada entra.
  v_res := sync_push_snapshot(v_t, jsonb_build_object('citas', jsonb_build_array(v_c2 || jsonb_build_object('ticket_id', v_k3)), 'citas_servicios', v_s2));
  IF v_res ? '_errores' OR (SELECT ticket_id FROM citas WHERE id = v_cita2) <> v_k2 THEN
    RAISE EXCEPTION '9: sin cancelar K2 no debía cambiar: %', v_res; END IF;
  v_res := sync_push_snapshot(v_t, jsonb_build_object('tickets', jsonb_build_array(v_tk2 || '{"estado_fiscal": "CANCELADO"}'::jsonb),
             'citas', jsonb_build_array(v_c2 || jsonb_build_object('ticket_id', v_k3)), 'citas_servicios', v_s2,
             'anticipos_cita', jsonb_build_array(v_a2)));
  IF v_res ? '_errores' OR (SELECT (estado::text, ticket_id) FROM citas WHERE id = v_cita2) IS DISTINCT FROM ('COBRADA'::text, v_k3)
     OR (SELECT estado FROM anticipos_cita WHERE id = v_ant2) <> 'VIGENTE' THEN
    RAISE EXCEPTION '9: con K2 cancelada debían entrar: %', v_res; END IF;

  -- 10) Resuelto dos veces: la nube conserva el suyo, lo reporta en _conflictos y en el rastro.
  INSERT INTO cajas (tenant_id, sucursal_id, numero, nombre) VALUES (v_t, v_suc, 99, 'Caja 0223') RETURNING id INTO v_caja2;
  SET LOCAL session_replication_role = replica;
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_t, v_suc, v_caja2, 'SMK-0223-2', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 0, 'TOTAL') RETURNING id INTO v_turno2;
  SET LOCAL session_replication_role = origin;
  v_res := sync_push_snapshot(v_t, jsonb_build_object('anticipos_cita', jsonb_build_array(
             v_p || jsonb_build_object('estado', 'DEVUELTO', 'turno_resuelve_id', v_turno, 'resuelto_at', now(), 'referencia_devolucion', 'x'))));
  IF v_res ? '_errores' OR (v_res->'_conflictos'->0->>'id') IS DISTINCT FROM v_parte::text
     OR (SELECT estado FROM anticipos_cita WHERE id = v_parte) <> 'RETENIDO' THEN
    RAISE EXCEPTION '10: otro estado resuelto debía ser conflicto: %', v_res; END IF;
  SELECT operaciones_conflicto, response_summary INTO r FROM sync_eventos WHERE tenant_id = v_t ORDER BY fecha_procesado_fin DESC LIMIT 1;
  IF r.operaciones_conflicto <> 1 OR NOT (r.response_summary ? '_conflictos') THEN
    RAISE EXCEPTION '10: el rastro no anotó el conflicto: %', to_jsonb(r); END IF;
  v_res := sync_push_snapshot(v_t, jsonb_build_object('anticipos_cita', jsonb_build_array(
             v_p || jsonb_build_object('estado', 'RETENIDO', 'turno_resuelve_id', v_turno2, 'resuelto_at', now()))));
  IF jsonb_array_length(COALESCE(v_res->'_conflictos', '[]')) <> 1 OR (SELECT turno_resuelve_id FROM anticipos_cita WHERE id = v_parte) <> v_turno THEN
    RAISE EXCEPTION '10: resuelto en otra caja debía ser conflicto: %', v_res; END IF;
  v_res := sync_push_snapshot(v_t, jsonb_build_object('anticipos_cita', jsonb_build_array(
             v_p || jsonb_build_object('estado', 'RETENIDO', 'turno_resuelve_id', v_turno, 'resuelto_at', now(), 'referencia_devolucion', 'nota'))));
  IF v_res ? '_conflictos' OR v_res ? '_errores' OR (SELECT referencia_devolucion FROM anticipos_cita WHERE id = v_parte) IS DISTINCT FROM 'nota' THEN
    RAISE EXCEPTION '10: mismo estado y misma caja debía entrar: %', v_res; END IF;

  -- 11) El turno es de la caja del anticipo y la venta es la de su cita.
  v_res := sync_push_snapshot(v_t, jsonb_build_object('anticipos_cita', jsonb_build_array(
    v_p || jsonb_build_object('id', gen_random_uuid(), 'turno_id', v_turno2),
    v_a || jsonb_build_object('id', gen_random_uuid(), 'estado', 'APLICADO', 'ticket_id', v_k3, 'turno_resuelve_id', v_turno))));
  IF (v_res->>'anticipos_cita')::int <> 0
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_res->'_errores') e WHERE e->>'error' = 'el turno no es de la caja y sucursal del anticipo')
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_res->'_errores') e WHERE e->>'error' LIKE 'la venta no es la de la cita%') THEN
    RAISE EXCEPTION '11: debían rechazarse: %', v_res; END IF;

  -- 7) Lo de otro negocio se rechaza y no entra.
  v_res := sync_push_snapshot(v_t, jsonb_build_object('anticipos_cita', jsonb_build_array(
    v_p || jsonb_build_object('id', gen_random_uuid(), 'tenant_id', v_otro),
    v_p || jsonb_build_object('id', gen_random_uuid(), 'cita_id', gen_random_uuid()),
    v_p || jsonb_build_object('id', gen_random_uuid(), 'turno_id', gen_random_uuid()),
    v_p || jsonb_build_object('id', gen_random_uuid(), 'caja_id', gen_random_uuid()),
    v_a || jsonb_build_object('id', gen_random_uuid(), 'estado', 'APLICADO', 'ticket_id', gen_random_uuid(), 'turno_resuelve_id', v_turno))));
  IF (v_res->>'anticipos_cita')::int <> 0 OR jsonb_array_length(COALESCE(v_res->'_errores', '[]')) <> 5
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_res->'_errores') e WHERE e->>'error' = 'fila de otro negocio')
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_res->'_errores') e WHERE e->>'error' LIKE 'venta de otro negocio%') THEN
    RAISE EXCEPTION '7: lo ajeno debía rechazarse (5 errores): %', v_res; END IF;
  IF (SELECT count(*) FROM anticipos_cita WHERE cita_id = v_cita) <> 3 THEN RAISE EXCEPTION '7: entró algo ajeno'; END IF;
  -- Un id que ya es de otro negocio tampoco se pisa.
  SET LOCAL session_replication_role = replica;
  UPDATE anticipos_cita SET tenant_id = v_otro WHERE id = v_parte;
  SET LOCAL session_replication_role = origin;
  v_res := sync_push_snapshot(v_t, jsonb_build_object('anticipos_cita', jsonb_build_array(v_p)));
  IF (v_res->'_errores'->0->>'error') IS DISTINCT FROM 'el id ya existe en otro negocio' THEN
    RAISE EXCEPTION '7: el id ajeno debía rechazarse: %', v_res; END IF;

  RAISE NOTICE 'belleza cobro sync OK';
END $$;
ROLLBACK;
