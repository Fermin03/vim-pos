-- Smoke belleza, entrega 2 (migraciones 0220–0223): cobro y comisiones. ROLLBACK.
-- Uso: cd desktop && npm run smokes -- smoke_belleza_cobro.sql
\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF NOT ('COBRADA' = ANY (enum_range(NULL::cita_estado)::text[])) THEN
    RAISE EXCEPTION '1: falta cita_estado COBRADA';
  END IF;
  IF NOT ('ANTICIPO' = ANY (enum_range(NULL::metodo_pago)::text[])) THEN
    RAISE EXCEPTION '1: falta metodo_pago ANTICIPO';
  END IF;

  RAISE NOTICE 'belleza cobro OK';
END $$;

-- ── Colaborador por renglón, comisiones y cita cobrada (0221) ──────────────
CREATE FUNCTION pg_temp.debe_fallar(q text, patron text, paso text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  EXECUTE q;
  RAISE EXCEPTION '%: no falló: %', paso, q USING ERRCODE = 'P0099';
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE = 'P0099' OR SQLERRM NOT LIKE patron THEN RAISE EXCEPTION '%: %', paso, SQLERRM; END IF;
END $f$;

-- Comisión de un renglón según la vista.
CREATE FUNCTION pg_temp.com(p_item uuid) RETURNS numeric LANGUAGE sql AS $f$
  SELECT comision_mxn FROM vw_comisiones_renglon WHERE ticket_item_id = p_item
$f$;

DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';   -- CAJERO; colaboradora
  v_diego  uuid := '99999999-0000-0000-0000-0000000000f1';   -- SUPERVISOR; colaborador
  v_dueno  uuid := '99999999-0000-0000-0000-0000000000e1';
  v_otro   uuid := '22100000-0000-0000-0000-0000000000aa';
  v_cat    uuid := 'a0000000-0000-0000-0000-0000000000c1';
  v_corte  uuid := '22100000-0000-0000-0000-0000000000a1';   -- $180, 40 % (servicio)
  v_tinte  uuid := '22100000-0000-0000-0000-0000000000a2';   -- $500, MONTO $50; Diego: $450 y 20 %
  v_champu uuid := '22100000-0000-0000-0000-0000000000a3';   -- $100, producto
  v_papas  uuid;
  v_turno  uuid; v_auth uuid;
  v_t1 uuid; v_t2 uuid; v_t3 uuid; v_t4 uuid; v_t5 uuid; v_tx uuid;
  i_corte1 uuid; i_tinte1 uuid; i_champu uuid; i_papas uuid; i_corte2 uuid; i_cancel uuid; i_corte4 uuid; i_tinte5 uuid;
  v_cita1 uuid; v_cita2 uuid; v_cita3 uuid;
  v_hoy  date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_per  daterange;
  r record; v_n integer; v_x numeric;
BEGIN
  -- Negocio de belleza con agenda; otro negocio para RLS.
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_otro, 'tenant-0221', 'Otro negocio', 'INTERNO', 'QUICK_SERVICE');
  UPDATE tenants SET vertical_principal = 'SALON', operacion = operacion || '{"agenda":true}' WHERE id = v_t;
  INSERT INTO configuracion_tenant (tenant_id) VALUES (v_t) ON CONFLICT (tenant_id) DO NOTHING;
  UPDATE configuracion_tenant SET agenda_comision_productos_pct = 10 WHERE tenant_id = v_t;

  INSERT INTO productos (id, tenant_id, categoria_id, nombre, precio_base_mxn, tasa_iva, iva_incluido_en_precio) VALUES
    (v_corte, v_t, v_cat, 'Corte', 180, 16, true), (v_tinte, v_t, v_cat, 'Tinte', 500, 16, true),
    (v_champu, v_t, v_cat, 'Champú', 100, 16, true);
  INSERT INTO servicios_agenda (producto_id, tenant_id, duracion_min, comision_tipo, comision_valor) VALUES
    (v_corte, v_t, 60, 'PORCENTAJE', 40), (v_tinte, v_t, 90, 'MONTO', 50);
  INSERT INTO colaboradores_agenda (usuario_id, tenant_id, sucursal_id, color_hex, sueldo_periodo_mxn) VALUES
    (v_maria, v_t, v_suc, '#C2410C', 0), (v_diego, v_t, v_suc, '#0F766E', 1000);
  INSERT INTO servicio_colaborador (producto_id, usuario_id, tenant_id, precio_mxn, comision_tipo, comision_valor) VALUES
    (v_corte, v_diego, v_t, NULL, NULL, NULL), (v_tinte, v_diego, v_t, 450, 'PORCENTAJE', 20),
    (v_corte, v_maria, v_t, NULL, NULL, NULL);
  SELECT id INTO v_papas FROM productos WHERE tenant_id = v_t AND nombre = 'Papas Gajo' LIMIT 1;

  -- Reglas incoherentes no entran.
  PERFORM pg_temp.debe_fallar(format('UPDATE servicios_agenda SET comision_valor = 120 WHERE producto_id = %L', v_corte),
    '%servicios_agenda_comision_coherente%', 'B0 porcentaje > 100');
  PERFORM pg_temp.debe_fallar(format('UPDATE servicio_colaborador SET comision_tipo = %L WHERE producto_id = %L AND usuario_id = %L', 'MONTO', v_corte, v_diego),
    '%servicio_colaborador_comision_coherente%', 'B0 tipo sin valor');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria, 'tenant_id', v_t)::text, true);
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_t, v_suc, v_caja, 'SMK-0221', v_hoy, v_maria, 2000, 'TOTAL') RETURNING id INTO v_turno;

  -- 1) Una sola agregar_item_a_ticket (sin ambigüedad) y la firma vieja sigue funcionando sin congelar.
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'agregar_item_a_ticket';
  IF v_n <> 1 THEN RAISE EXCEPTION 'B1: hay % agregar_item_a_ticket', v_n; END IF;
  v_t1 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'b221-t1', v_maria);
  i_papas := agregar_item_a_ticket(v_t1, v_papas, 1, NULL, '[]'::jsonb, 'b221-papas');
  SELECT * INTO r FROM ticket_items WHERE id = i_papas;
  IF r.colaborador_id IS NOT NULL OR r.comision_tipo IS NOT NULL OR r.comision_valor IS NOT NULL OR r.comision_base IS NOT NULL THEN
    RAISE EXCEPTION 'B1: la firma vieja congeló algo: %', to_jsonb(r); END IF;

  -- 2) Congelado: servicio_colaborador antes que servicios_agenda, y el precio por colaborador.
  i_tinte1 := agregar_item_a_ticket(v_t1, v_tinte, 1, NULL, '[]'::jsonb, 'b221-tinte1', v_diego);
  SELECT * INTO r FROM ticket_items WHERE id = i_tinte1;
  IF r.comision_tipo <> 'PORCENTAJE' OR r.comision_valor <> 20 OR r.comision_base <> 'COBRADO' THEN
    RAISE EXCEPTION 'B2: tinte de Diego debía congelar PORCENTAJE 20 COBRADO: %', to_jsonb(r); END IF;
  IF r.precio_unitario_snapshot <> 450 THEN RAISE EXCEPTION 'B2: precio de Diego no aplicado: %', r.precio_unitario_snapshot; END IF;
  i_corte1 := agregar_item_a_ticket(v_t1, v_corte, 1, NULL, '[]'::jsonb, 'b221-corte1', v_diego);
  SELECT * INTO r FROM ticket_items WHERE id = i_corte1;
  IF r.comision_tipo <> 'PORCENTAJE' OR r.comision_valor <> 40 OR r.precio_unitario_snapshot <> 180 THEN
    RAISE EXCEPTION 'B2: corte de Diego debía congelar 40 %% de servicios_agenda a $180: %', to_jsonb(r); END IF;

  -- 3) Producto con agenda_comision_productos_pct: PORCENTAJE 10.
  i_champu := agregar_item_a_ticket(v_t1, v_champu, 1, NULL, '[]'::jsonb, 'b221-champu', v_maria);
  SELECT * INTO r FROM ticket_items WHERE id = i_champu;
  IF r.comision_tipo <> 'PORCENTAJE' OR r.comision_valor <> 10 THEN
    RAISE EXCEPTION 'B3: champú debía congelar 10 %%: %', to_jsonb(r); END IF;

  -- 4) Colaborador inactivo, de otro negocio o desconocido: no.
  UPDATE colaboradores_agenda SET activo = false WHERE usuario_id = v_maria;
  PERFORM pg_temp.debe_fallar(format('SELECT agregar_item_a_ticket(%L, %L, 1, NULL, %L::jsonb, NULL, %L)', v_t1, v_corte, '[]', v_maria),
    'DATOS_INVALIDOS: el colaborador no está activo%', 'B4 inactivo');
  UPDATE colaboradores_agenda SET activo = true WHERE usuario_id = v_maria;
  PERFORM pg_temp.debe_fallar(format('SELECT agregar_item_a_ticket(%L, %L, 1, NULL, %L::jsonb, NULL, %L)', v_t1, v_corte, '[]', v_dueno),
    'DATOS_INVALIDOS: el colaborador no está activo%', 'B4 no es colaborador');

  -- 5) Review Focus 4, base COBRADO: corte $180 con 10 % de descuento → base 139.66, comisión 55.86.
  INSERT INTO autorizaciones_pin (tenant_id, usuario_solicitante_id, usuario_autorizo_id, accion, permiso_codigo, motivo, caja_id, turno_id)
  VALUES (v_t, v_maria, v_maria, 'd', 'descuento.manual_aplicar', 't', v_caja, v_turno) RETURNING id INTO v_auth;
  PERFORM aplicar_descuento_manual(v_t1, i_corte1, 'PORCENTAJE'::descuento_manual_tipo, 10, 'CLIENTE_FRECUENTE'::descuento_manual_motivo, '10', v_auth, v_maria, v_maria, 'b221-desc1');

  -- 6) La cita queda COBRADA al pagar su ticket; vincular valida estado y negocio.
  v_cita1 := guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'Camila', 'inicia', '2030-01-07 10:00-06',
               'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_corte, 'usuario_id', v_diego))));
  PERFORM atender_cita(v_cita1);
  PERFORM terminar_cita(v_cita1);
  PERFORM vincular_cita_ticket(v_cita1, v_t1);
  IF (SELECT ticket_id FROM citas WHERE id = v_cita1) IS DISTINCT FROM v_t1 THEN RAISE EXCEPTION 'B6: no se ligó la cita'; END IF;
  v_cita3 := guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'Bety', 'inicia', '2030-01-07 12:00-06',
               'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_corte, 'usuario_id', v_diego))));
  PERFORM cancelar_cita(v_cita3, 'no puede');
  PERFORM pg_temp.debe_fallar(format('SELECT vincular_cita_ticket(%L, %L)', v_cita3, v_t1), 'DATOS_INVALIDOS: la cita no se puede cobrar.', 'B6 cancelada');

  SELECT total_mxn INTO v_x FROM tickets WHERE id = v_t1;
  PERFORM aplicar_pago(v_t1, 'EFECTIVO'::metodo_pago, v_x, v_x, NULL, NULL, NULL, false, NULL, 'b221-pago1');
  IF (SELECT estado FROM citas WHERE id = v_cita1) <> 'COBRADA' THEN
    RAISE EXCEPTION 'B6: la cita debía quedar COBRADA: %', (SELECT estado FROM citas WHERE id = v_cita1); END IF;
  PERFORM pg_temp.debe_fallar(format('SELECT vincular_cita_ticket(%L, %L)', v_cita1, v_t1), 'DATOS_INVALIDOS: la venta no está abierta%', 'B6 ticket pagado');

  SELECT * INTO r FROM vw_comisiones_renglon WHERE ticket_item_id = i_corte1;
  IF r.base_mxn <> 139.66 OR r.comision_mxn <> 55.86 OR NOT r.es_servicio OR r.fecha_negocio <> v_hoy THEN
    RAISE EXCEPTION 'B5: COBRADO esperaba base 139.66 / 55.86: %', to_jsonb(r); END IF;
  IF pg_temp.com(i_tinte1) <> 77.59 THEN RAISE EXCEPTION 'B2: tinte 450 al 20 %% debía dar 77.59: %', pg_temp.com(i_tinte1); END IF;
  SELECT * INTO r FROM vw_comisiones_renglon WHERE ticket_item_id = i_champu;
  IF r.comision_mxn <> 8.62 OR r.es_servicio THEN RAISE EXCEPTION 'B3: champú debía dar 8.62 como producto: %', to_jsonb(r); END IF;
  IF EXISTS (SELECT 1 FROM vw_comisiones_renglon WHERE ticket_item_id = i_papas) THEN
    RAISE EXCEPTION 'B1: un renglón sin colaborador apareció en comisiones'; END IF;

  -- 7) Review Focus 4, base LISTA: 180 / 1.16 = 155.17 → 62.07. Y un renglón cancelado no suma.
  UPDATE configuracion_tenant SET agenda_comision_base = 'LISTA' WHERE tenant_id = v_t;
  v_t2 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'b221-t2', v_maria);
  i_corte2 := agregar_item_a_ticket(v_t2, v_corte, 1, NULL, '[]'::jsonb, 'b221-corte2', v_diego);
  i_cancel := agregar_item_a_ticket(v_t2, v_corte, 1, NULL, '[]'::jsonb, 'b221-cancel', v_diego);
  INSERT INTO autorizaciones_pin (tenant_id, usuario_solicitante_id, usuario_autorizo_id, accion, permiso_codigo, motivo, caja_id, turno_id)
  VALUES (v_t, v_maria, v_maria, 'd', 'descuento.manual_aplicar', 't', v_caja, v_turno) RETURNING id INTO v_auth;
  PERFORM aplicar_descuento_manual(v_t2, i_corte2, 'PORCENTAJE'::descuento_manual_tipo, 10, 'CLIENTE_FRECUENTE'::descuento_manual_motivo, '10', v_auth, v_maria, v_maria, 'b221-desc2');
  PERFORM cancelar_item_ticket(i_cancel, 'se arrepintió', NULL);
  SELECT total_mxn INTO v_x FROM tickets WHERE id = v_t2;
  PERFORM aplicar_pago(v_t2, 'EFECTIVO'::metodo_pago, v_x, v_x, NULL, NULL, NULL, false, NULL, 'b221-pago2');
  SELECT * INTO r FROM vw_comisiones_renglon WHERE ticket_item_id = i_corte2;
  IF r.base_mxn <> 155.17 OR r.comision_mxn <> 62.07 THEN RAISE EXCEPTION 'B7: LISTA esperaba 155.17 / 62.07: %', to_jsonb(r); END IF;
  IF EXISTS (SELECT 1 FROM vw_comisiones_renglon WHERE ticket_item_id = i_cancel) THEN
    RAISE EXCEPTION 'B7: el renglón cancelado suma'; END IF;

  -- 8) Cambiar las reglas después no cambia la comisión ya vendida.
  UPDATE servicios_agenda SET comision_valor = 5 WHERE producto_id = v_corte;
  UPDATE servicio_colaborador SET comision_valor = 1 WHERE producto_id = v_tinte AND usuario_id = v_diego;
  UPDATE configuracion_tenant SET agenda_comision_base = 'COBRADO', agenda_comision_productos_pct = 50 WHERE tenant_id = v_t;
  IF pg_temp.com(i_corte1) <> 55.86 OR pg_temp.com(i_corte2) <> 62.07 OR pg_temp.com(i_tinte1) <> 77.59 OR pg_temp.com(i_champu) <> 8.62 THEN
    RAISE EXCEPTION 'B8: la comisión cambió con la regla: % % % %', pg_temp.com(i_corte1), pg_temp.com(i_corte2), pg_temp.com(i_tinte1), pg_temp.com(i_champu); END IF;
  UPDATE servicios_agenda SET comision_valor = 40 WHERE producto_id = v_corte;
  UPDATE servicio_colaborador SET comision_valor = 20 WHERE producto_id = v_tinte AND usuario_id = v_diego;

  -- 9) Un ticket pagado y luego cancelado no suma, y su cita vuelve a TERMINADA.
  v_t4 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'b221-t4', v_maria);
  i_corte4 := agregar_item_a_ticket(v_t4, v_corte, 1, NULL, '[]'::jsonb, 'b221-corte4', v_diego);
  v_cita2 := guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'Laura', 'inicia', '2030-01-07 11:00-06',
               'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_corte, 'usuario_id', v_diego))));
  PERFORM vincular_cita_ticket(v_cita2, v_t4);   -- AGENDADA también se cobra
  PERFORM aplicar_pago(v_t4, 'EFECTIVO'::metodo_pago, 180, 180, NULL, NULL, NULL, false, NULL, 'b221-pago4');
  IF (SELECT estado FROM citas WHERE id = v_cita2) <> 'COBRADA' THEN RAISE EXCEPTION 'B9: la cita 2 debía quedar COBRADA'; END IF;
  IF pg_temp.com(i_corte4) <> 62.07 THEN RAISE EXCEPTION 'B9: corte sin descuento al 40 %% debía dar 62.07: %', pg_temp.com(i_corte4); END IF;
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'cancelar_ticket', 'venta.cancelar_pagada', 'ticket', v_t4, 'smoke')
  RETURNING id INTO v_auth;
  PERFORM cancelar_ticket_pagado(
    p_ticket_id := v_t4, p_caja_id := v_caja, p_turno_id := v_turno,
    p_motivo := 'CLIENTE_DESISTIO'::cancelacion_motivo, p_motivo_texto := 'smoke',
    p_autorizacion_pin_id := v_auth, p_usuario_solicitante_id := v_maria, p_usuario_autorizo_id := v_maria,
    p_reversar_inventario := true, p_cancelar_cfdi_sat := false, p_devolver_dinero := false,
    p_client_id_local := 'b221-cancel4');
  IF EXISTS (SELECT 1 FROM vw_comisiones_renglon WHERE ticket_id = v_t4) THEN RAISE EXCEPTION 'B9: el ticket cancelado suma'; END IF;
  IF (SELECT estado FROM citas WHERE id = v_cita2) <> 'TERMINADA' THEN
    RAISE EXCEPTION 'B9: la cita del ticket cancelado debía volver a TERMINADA: %', (SELECT estado FROM citas WHERE id = v_cita2); END IF;

  -- 10) Devolución parcial: 2 tintes de Diego (775.86 → 155.17), se devuelve 1 → 387.93 → 77.59.
  v_t5 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'b221-t5', v_maria);
  i_tinte5 := agregar_item_a_ticket(v_t5, v_tinte, 2, NULL, '[]'::jsonb, 'b221-tinte5', v_diego);
  PERFORM aplicar_pago(v_t5, 'EFECTIVO'::metodo_pago, 900, 900, NULL, NULL, NULL, false, NULL, 'b221-pago5');
  IF pg_temp.com(i_tinte5) <> 155.17 THEN RAISE EXCEPTION 'B10: 2 tintes debían dar 155.17: %', pg_temp.com(i_tinte5); END IF;
  INSERT INTO autorizaciones_pin (tenant_id, usuario_solicitante_id, usuario_autorizo_id, accion, permiso_codigo, motivo, caja_id, turno_id)
  VALUES (v_t, v_maria, v_maria, 'devolucion', 'venta.devolucion', 't', v_caja, v_turno) RETURNING id INTO v_auth;
  v_tx := crear_devolucion(v_t5, v_caja, v_turno, 'PARCIAL'::devolucion_alcance, 'PRODUCTO_DEFECTUOSO'::devolucion_motivo, 'x',
    'EFECTIVO'::devolucion_medio, v_auth, v_maria, v_maria,
    jsonb_build_array(jsonb_build_object('ticket_item_id', i_tinte5, 'cantidad_devuelta', 1)), false, NULL, 'b221-dev5');
  IF pg_temp.com(i_tinte5) <> 155.17 THEN RAISE EXCEPTION 'B10: una devolución en borrador ya restó'; END IF;
  PERFORM confirmar_devolucion(v_tx, v_maria);
  SELECT * INTO r FROM vw_comisiones_renglon WHERE ticket_item_id = i_tinte5;
  IF r.base_mxn <> 387.93 OR r.comision_mxn <> 77.59 OR r.venta_mxn <> 387.93 THEN
    RAISE EXCEPTION 'B10: la devolución parcial debía dejar 387.93 / 77.59: %', to_jsonb(r); END IF;

  -- 11) periodo_comisiones: semana lunes–domingo y quincenas.
  IF periodo_comisiones('2030-01-07') <> daterange('2030-01-07', '2030-01-14')
     OR periodo_comisiones('2030-01-13') <> daterange('2030-01-07', '2030-01-14') THEN
    RAISE EXCEPTION 'B11: semana: % / %', periodo_comisiones('2030-01-07'), periodo_comisiones('2030-01-13'); END IF;
  UPDATE configuracion_tenant SET agenda_periodo_comisiones = 'QUINCENAL' WHERE tenant_id = v_t;
  IF periodo_comisiones('2030-02-01') <> daterange('2030-02-01', '2030-02-16')
     OR periodo_comisiones('2030-02-15') <> daterange('2030-02-01', '2030-02-16')
     OR periodo_comisiones('2030-02-16') <> daterange('2030-02-16', '2030-03-01')
     OR periodo_comisiones('2030-02-28') <> daterange('2030-02-16', '2030-03-01') THEN
    RAISE EXCEPTION 'B11: quincenas: % % %', periodo_comisiones('2030-02-15'), periodo_comisiones('2030-02-16'), periodo_comisiones('2030-02-28'); END IF;
  UPDATE configuracion_tenant SET agenda_periodo_comisiones = 'SEMANAL' WHERE tenant_id = v_t;

  -- 12) comisiones_periodo: el dueño ve a todos; sueldo solo en un periodo exacto.
  --     Diego: 55.86 + 77.59 + 62.07 + 77.59 = 273.11 en 4 servicios; María: 8.62 de productos.
  v_per := periodo_comisiones(v_hoy);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT * INTO r FROM comisiones_periodo(lower(v_per), upper(v_per) - 1) WHERE usuario_id = v_diego;
  IF r.servicios <> 4 OR r.comision_servicios_mxn <> 273.11 OR r.comision_productos_mxn <> 0 OR r.sueldo_mxn <> 1000 OR r.total_mxn <> 1273.11 THEN
    RAISE EXCEPTION 'B12: Diego en el periodo: %', to_jsonb(r); END IF;
  SELECT * INTO r FROM comisiones_periodo(lower(v_per), upper(v_per) - 1) WHERE usuario_id = v_maria;
  IF r.comision_productos_mxn <> 8.62 OR r.servicios <> 0 OR r.total_mxn <> 8.62 THEN RAISE EXCEPTION 'B12: María: %', to_jsonb(r); END IF;
  SELECT * INTO r FROM comisiones_periodo(v_hoy, v_hoy + 30) WHERE usuario_id = v_diego;
  IF r.sueldo_mxn <> 0 OR r.total_mxn <> 273.11 THEN RAISE EXCEPTION 'B12: rango libre no lleva sueldo: %', to_jsonb(r); END IF;
  -- Cambiar las reglas como dueño sí se puede.
  UPDATE configuracion_tenant SET agenda_cobro_modo = 'ANTICIPO' WHERE tenant_id = v_t;

  -- 13) Un colaborador que no administra solo ve lo suyo; el cajero no cambia las reglas.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_diego, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  SELECT count(*) FILTER (WHERE colaborador_id <> v_diego), count(*) INTO v_n, v_x FROM vw_comisiones_renglon;
  IF v_n <> 0 OR v_x <> 4 THEN RAISE EXCEPTION 'B13: Diego ve % ajenos de %', v_n, v_x; END IF;
  SELECT count(*) INTO v_n FROM comisiones_periodo(lower(v_per), upper(v_per) - 1);
  IF v_n <> 1 THEN RAISE EXCEPTION 'B13: Diego ve % filas en comisiones_periodo', v_n; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  PERFORM pg_temp.debe_fallar(format('UPDATE configuracion_tenant SET agenda_comision_base = %L WHERE tenant_id = %L', 'LISTA', v_t),
    'Solo el dueño%', 'B13 cajero cambia la base');
  PERFORM pg_temp.debe_fallar(format('UPDATE configuracion_tenant SET agenda_comision_productos_pct = 5 WHERE tenant_id = %L', v_t),
    'Solo el dueño%', 'B13 cajero cambia productos');
  UPDATE colaboradores_agenda SET sueldo_periodo_mxn = 9999 WHERE usuario_id = v_maria;   -- RLS: 0 filas
  IF (SELECT sueldo_periodo_mxn FROM colaboradores_agenda WHERE usuario_id = v_maria AND tenant_id = v_t) <> 0 THEN
    RAISE EXCEPTION 'B13: el cajero cambió su sueldo'; END IF;

  -- 14) Otro negocio no ve las comisiones.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno, 'role', 'authenticated', 'tenant_id', v_otro)::text, true);
  SELECT count(*) INTO v_n FROM vw_comisiones_renglon;
  IF v_n <> 0 THEN RAISE EXCEPTION 'B14: otro negocio ve % renglones', v_n; END IF;
  SELECT count(*) INTO v_n FROM comisiones_periodo(lower(v_per), upper(v_per) - 1);
  IF v_n <> 0 THEN RAISE EXCEPTION 'B14: otro negocio ve % filas', v_n; END IF;
  EXECUTE 'RESET ROLE';
  IF has_table_privilege('anon', 'vw_comisiones_renglon', 'SELECT') OR has_function_privilege('anon', 'comisiones_periodo(date, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'B14: anon lee comisiones'; END IF;

  RAISE NOTICE 'belleza comisiones OK';
END $$;

ROLLBACK;
