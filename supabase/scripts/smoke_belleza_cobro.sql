-- Smoke belleza, entrega 2 (migraciones 0220–0223): cobro, comisiones y anticipos. ROLLBACK.
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
  v_cita1 uuid; v_cita2 uuid; v_cita3 uuid; v_cita4 uuid; v_t6 uuid; i_corte6 uuid; i_champu6 uuid; v_suc2 uuid;
  v_hoy  date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_desde date; v_hasta date;
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

  -- 8b) Descuento a nivel TICKET (10 %) sobre renglones de dos colaboradores y un envío: se reparte
  --     solo entre los renglones (el envío no se descuenta). Corte $180 → 139.66 / 55.86; champú $100
  --     (ya con 50 % por productos) → 77.59 / 38.80. El envío no tiene colaborador ni cuenta.
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn) VALUES (v_t, v_suc, 'Norte 0221', 35) RETURNING id INTO v_tx;
  v_t6 := abrir_ticket(v_suc, v_caja, v_turno, 'DELIVERY_PROPIO'::modo_servicio, NULL, NULL, 'b221-t6', v_maria);
  i_corte6 := agregar_item_a_ticket(v_t6, v_corte, 1, NULL, '[]'::jsonb, 'b221-corte6', v_diego);
  i_champu6 := agregar_item_a_ticket(v_t6, v_champu, 1, NULL, '[]'::jsonb, 'b221-champu6', v_maria);
  PERFORM fijar_envio_ticket(v_t6, v_tx);
  INSERT INTO autorizaciones_pin (tenant_id, usuario_solicitante_id, usuario_autorizo_id, accion, permiso_codigo, motivo, caja_id, turno_id)
  VALUES (v_t, v_maria, v_maria, 'd', 'descuento.manual_aplicar', 't', v_caja, v_turno) RETURNING id INTO v_auth;
  PERFORM aplicar_descuento_manual(v_t6, NULL, 'PORCENTAJE'::descuento_manual_tipo, 10, 'CLIENTE_FRECUENTE'::descuento_manual_motivo, '10', v_auth, v_maria, v_maria, 'b221-desc6');
  SELECT total_mxn INTO v_x FROM tickets WHERE id = v_t6;
  IF v_x <> 287 THEN RAISE EXCEPTION 'B8b: el ticket debía quedar en 280 − 28 + 35 = 287: %', v_x; END IF;
  PERFORM aplicar_pago(v_t6, 'EFECTIVO'::metodo_pago, v_x, v_x, NULL, NULL, NULL, false, NULL, 'b221-pago6');
  SELECT * INTO r FROM vw_comisiones_renglon WHERE ticket_item_id = i_corte6;
  IF r.base_mxn <> 139.66 OR r.comision_mxn <> 55.86 OR r.venta_mxn <> 139.66 THEN
    RAISE EXCEPTION 'B8b: corte con descuento de ticket esperaba 139.66 / 55.86: %', to_jsonb(r); END IF;
  SELECT * INTO r FROM vw_comisiones_renglon WHERE ticket_item_id = i_champu6;
  IF r.base_mxn <> 77.59 OR r.comision_mxn <> 38.80 THEN
    RAISE EXCEPTION 'B8b: champú con descuento de ticket esperaba 77.59 / 38.80: %', to_jsonb(r); END IF;
  SELECT count(*) INTO v_n FROM vw_comisiones_renglon WHERE ticket_id = v_t6;
  IF v_n <> 2 THEN RAISE EXCEPTION 'B8b: el ticket con envío debía dar 2 renglones: %', v_n; END IF;

  -- 8c) vincular: no otra sucursal.
  INSERT INTO sucursales (tenant_id, codigo, nombre) VALUES (v_t, 'S221', 'Segunda') RETURNING id INTO v_suc2;
  v_cita4 := guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'Olga', 'inicia', '2030-01-07 15:00-06',
               'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_corte, 'usuario_id', v_diego))));
  UPDATE citas SET sucursal_id = v_suc2 WHERE id = v_cita4;   -- la cita es de la otra sucursal
  v_tx := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'b221-tx', v_maria);
  PERFORM pg_temp.debe_fallar(format('SELECT vincular_cita_ticket(%L, %L)', v_cita4, v_tx), 'DATOS_INVALIDOS: la cita es de otra sucursal.', 'B8c sucursal');

  -- 9) Un ticket pagado y luego cancelado no suma, y su cita vuelve a TERMINADA.
  v_t4 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'b221-t4', v_maria);
  i_corte4 := agregar_item_a_ticket(v_t4, v_corte, 1, NULL, '[]'::jsonb, 'b221-corte4', v_diego);
  v_cita2 := guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'Laura', 'inicia', '2030-01-07 11:00-06',
               'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_corte, 'usuario_id', v_diego))));
  PERFORM vincular_cita_ticket(v_cita2, v_t4);   -- AGENDADA también se cobra
  PERFORM vincular_cita_ticket(v_cita2, v_t4);   -- repetir con la misma venta es inofensivo
  PERFORM pg_temp.debe_fallar(format('SELECT vincular_cita_ticket(%L, %L)', v_cita2, v_tx), 'DATOS_INVALIDOS: la cita ya está en otra venta abierta.', 'B9 robar cita');
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

  -- 11) periodo_comisiones (ambas fechas inclusive): semana lunes–domingo y quincenas.
  IF (SELECT (desde, hasta) FROM periodo_comisiones('2030-01-07')) <> ('2030-01-07'::date, '2030-01-13'::date)
     OR (SELECT (desde, hasta) FROM periodo_comisiones('2030-01-13')) <> ('2030-01-07'::date, '2030-01-13'::date) THEN
    RAISE EXCEPTION 'B11: semana'; END IF;
  UPDATE configuracion_tenant SET agenda_periodo_comisiones = 'QUINCENAL' WHERE tenant_id = v_t;
  IF (SELECT (desde, hasta) FROM periodo_comisiones('2030-02-01')) <> ('2030-02-01'::date, '2030-02-15'::date)
     OR (SELECT (desde, hasta) FROM periodo_comisiones('2030-02-15')) <> ('2030-02-01'::date, '2030-02-15'::date)
     OR (SELECT (desde, hasta) FROM periodo_comisiones('2030-02-16')) <> ('2030-02-16'::date, '2030-02-28'::date)
     OR (SELECT (desde, hasta) FROM periodo_comisiones('2030-02-28')) <> ('2030-02-16'::date, '2030-02-28'::date)
     OR (SELECT (desde, hasta) FROM periodo_comisiones('2030-01-31')) <> ('2030-01-16'::date, '2030-01-31'::date) THEN
    RAISE EXCEPTION 'B11: quincenas'; END IF;
  UPDATE configuracion_tenant SET agenda_periodo_comisiones = 'SEMANAL' WHERE tenant_id = v_t;

  -- 12) comisiones_periodo: el dueño ve a todos; sueldo solo en un periodo exacto.
  --     Diego: 55.86 + 77.59 + 62.07 + 55.86 + 77.59 = 328.97 en 5 servicios; María: 8.62 + 38.80 de productos.
  SELECT desde, hasta INTO v_desde, v_hasta FROM periodo_comisiones(v_hoy);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT * INTO r FROM comisiones_periodo(v_desde, v_hasta) WHERE usuario_id = v_diego;
  IF r.servicios <> 5 OR r.comision_servicios_mxn <> 328.97 OR r.comision_productos_mxn <> 0 OR r.sueldo_mxn <> 1000 OR r.total_mxn <> 1328.97 THEN
    RAISE EXCEPTION 'B12: Diego en el periodo: %', to_jsonb(r); END IF;
  SELECT * INTO r FROM comisiones_periodo(v_desde, v_hasta) WHERE usuario_id = v_maria;
  IF r.comision_productos_mxn <> 47.42 OR r.servicios <> 0 OR r.total_mxn <> 47.42 THEN RAISE EXCEPTION 'B12: María: %', to_jsonb(r); END IF;
  SELECT * INTO r FROM comisiones_periodo(v_hoy, v_hoy + 30) WHERE usuario_id = v_diego;
  IF r.sueldo_mxn <> 0 OR r.total_mxn <> 328.97 THEN RAISE EXCEPTION 'B12: rango libre no lleva sueldo: %', to_jsonb(r); END IF;
  -- Cambiar las reglas como dueño sí se puede.
  UPDATE configuracion_tenant SET agenda_cobro_modo = 'ANTICIPO' WHERE tenant_id = v_t;

  -- 13) Un colaborador que no administra solo ve lo suyo; el cajero no cambia las reglas.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_diego, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  SELECT count(*) FILTER (WHERE colaborador_id <> v_diego), count(*) INTO v_n, v_x FROM vw_comisiones_renglon;
  IF v_n <> 0 OR v_x <> 5 THEN RAISE EXCEPTION 'B13: Diego ve % ajenos de %', v_n, v_x; END IF;
  SELECT count(*) INTO v_n FROM comisiones_periodo(v_desde, v_hasta);
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
  SELECT count(*) INTO v_n FROM comisiones_periodo(v_desde, v_hasta);
  IF v_n <> 0 THEN RAISE EXCEPTION 'B14: otro negocio ve % filas', v_n; END IF;
  EXECUTE 'RESET ROLE';
  IF has_table_privilege('anon', 'vw_comisiones_renglon', 'SELECT') OR has_function_privilege('anon', 'comisiones_periodo(date, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'B14: anon lee comisiones'; END IF;

  RAISE NOTICE 'belleza comisiones OK';
END $$;

-- ── Anticipos de cita y corte (0222) ────────────────────────────────────────
CREATE FUNCTION pg_temp.esp(p uuid) RETURNS numeric LANGUAGE sql AS $f$ SELECT calcular_efectivo_esperado(p) $f$;
-- Abre un turno nuevo en la caja (cierra el abierto).
CREATE FUNCTION pg_temp.turno(p_codigo text, p_fondo numeric) RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v uuid;
BEGIN
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now()
   WHERE caja_id = '99999999-0000-0000-0000-0000000000cc' AND estado = 'ABIERTO';
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES ('99999999-0000-0000-0000-0000000000aa', '99999999-0000-0000-0000-0000000000bb', '99999999-0000-0000-0000-0000000000cc',
          p_codigo, (now() AT TIME ZONE 'America/Mexico_City')::date, '99999999-0000-0000-0000-000000000001', p_fondo, 'TOTAL')
  RETURNING id INTO v;
  RETURN v;
END $f$;
-- Una cita AGENDADA de corte con Diego.
CREATE FUNCTION pg_temp.cita(p_nombre text, p_inicia text, p_cliente uuid DEFAULT NULL) RETURNS uuid LANGUAGE sql AS $f$
  SELECT guardar_cita(jsonb_build_object('sucursal_id', '99999999-0000-0000-0000-0000000000bb', 'cliente_nombre', p_nombre,
           'cliente_id', p_cliente, 'inicia', p_inicia,
           'servicios', jsonb_build_array(jsonb_build_object('producto_id', '22100000-0000-0000-0000-0000000000a1',
                                                             'usuario_id', '99999999-0000-0000-0000-0000000000f1'))))
$f$;
-- Lo declarado de un método en reporte_x.
CREATE FUNCTION pg_temp.metodo(j jsonb, m text) RETURNS numeric LANGUAGE sql AS $f$
  SELECT (e->>'monto_total_mxn')::numeric FROM jsonb_array_elements(j->'pagos_por_metodo') e WHERE e->>'metodo_pago' = m
$f$;

DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_dueno  uuid := '99999999-0000-0000-0000-0000000000e1';
  v_otro   uuid := '22100000-0000-0000-0000-0000000000aa';
  v_corte  uuid := '22100000-0000-0000-0000-0000000000a1';
  v_tinte  uuid := '22100000-0000-0000-0000-0000000000a2';
  v_ana    uuid := '22200000-0000-0000-0000-0000000000c1';
  v_ta uuid; v_tb uuid; v_tc uuid;
  v_cx uuid; v_cy uuid; v_cz uuid; v_cw uuid;
  v_ax uuid; v_ay uuid; v_az uuid; v_aw uuid; v_a2 uuid;
  v_kx uuid; v_ky uuid; v_kr uuid;
  v_diego  uuid := '99999999-0000-0000-0000-0000000000f1';
  v_cp uuid; v_cq uuid; v_cr uuid; v_ap uuid; v_aq uuid; v_ar uuid; v_kp uuid; v_kq uuid; v_kk uuid; v_kn uuid; v_auth uuid; v_dev uuid;
  i_r uuid; i_n uuid; v_e0 numeric;
  v_n integer; j jsonb; r record;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria, 'tenant_id', v_t)::text, true);
  INSERT INTO clientes (id, tenant_id, nombre, telefono) VALUES (v_ana, v_t, 'Ana Anticipo', '4770002221');
  -- Lealtad encendida (10 %) para ver que el anticipo no gana y la venta completa sí.
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
  SELECT v_t, id, (now() AT TIME ZONE 'America/Mexico_City')::date, true, 100 FROM addons a WHERE codigo = 'LEALTAD'
     AND NOT EXISTS (SELECT 1 FROM tenant_addons x WHERE x.tenant_id = v_t AND x.addon_id = a.id);
  INSERT INTO lealtad_programa (tenant_id, mecanica, porcentaje, tope_compras_dia) VALUES (v_t, 'PUNTOS_DINERO', 10, 50)
  ON CONFLICT (tenant_id) DO UPDATE SET mecanica = 'PUNTOS_DINERO', porcentaje = 10, tope_compras_dia = 50;
  UPDATE configuracion_tenant SET modulo_lealtad_activo = true WHERE tenant_id = v_t;

  -- A1) anticipo_sugerido: corte $180 al 50 % = 90; TODO = 180; AL_FINAL = 0.
  UPDATE servicios_agenda SET anticipo_tipo = 'PORCENTAJE', anticipo_valor = 50 WHERE producto_id = v_corte;
  v_cx := pg_temp.cita('Ximena', '2030-01-08 10:00-06', v_ana);
  UPDATE configuracion_tenant SET agenda_cobro_modo = 'ANTICIPO' WHERE tenant_id = v_t;
  IF anticipo_sugerido(v_cx) <> 90 THEN RAISE EXCEPTION 'A1: ANTICIPO esperaba 90: %', anticipo_sugerido(v_cx); END IF;
  UPDATE configuracion_tenant SET agenda_cobro_modo = 'TODO' WHERE tenant_id = v_t;
  IF anticipo_sugerido(v_cx) <> 180 THEN RAISE EXCEPTION 'A1: TODO esperaba 180: %', anticipo_sugerido(v_cx); END IF;
  UPDATE configuracion_tenant SET agenda_cobro_modo = 'AL_FINAL' WHERE tenant_id = v_t;
  IF anticipo_sugerido(v_cx) <> 0 THEN RAISE EXCEPTION 'A1: AL_FINAL esperaba 0: %', anticipo_sugerido(v_cx); END IF;
  UPDATE configuracion_tenant SET agenda_cobro_modo = 'ANTICIPO' WHERE tenant_id = v_t;

  -- A2) Review Focus 1, turno A: $200 en efectivo → el corte de A espera $200 más.
  v_ta := pg_temp.turno('SMK-0222-A', 1000);
  v_ax := registrar_anticipo(v_cx, 200, 'EFECTIVO', v_caja, v_ta, 'b222-ax');
  IF registrar_anticipo(v_cx, 200, 'EFECTIVO', v_caja, v_ta, 'b222-ax') <> v_ax THEN RAISE EXCEPTION 'A2: no es idempotente'; END IF;
  SELECT count(*) INTO v_n FROM anticipos_cita WHERE cita_id = v_cx;
  IF v_n <> 1 THEN RAISE EXCEPTION 'A2: el reintento duplicó: %', v_n; END IF;
  IF pg_temp.esp(v_ta) <> 1200 THEN RAISE EXCEPTION 'A2: A esperaba 1200: %', pg_temp.esp(v_ta); END IF;
  j := reporte_x(v_ta);
  IF (j->>'anticipos_recibidos_mxn')::numeric <> 200 OR pg_temp.metodo(j, 'EFECTIVO') <> 200 THEN
    RAISE EXCEPTION 'A2: reporte_x de A: %', j; END IF;
  -- Un anticipo no gana puntos.
  IF EXISTS (SELECT 1 FROM lealtad_movimientos WHERE cliente_id = v_ana) THEN RAISE EXCEPTION 'A2: el anticipo ganó puntos'; END IF;
  PERFORM pg_temp.debe_fallar(format('SELECT registrar_anticipo(%L, 0, %L, %L, %L, NULL)', v_cx, 'EFECTIVO', v_caja, v_ta),
    'DATOS_INVALIDOS: el anticipo debe ser mayor a 0.', 'A2 monto 0');
  PERFORM pg_temp.debe_fallar(format('SELECT registrar_anticipo(%L, 10, %L, %L, %L, NULL)', v_cx, 'ANTICIPO', v_caja, v_ta),
    'DATOS_INVALIDOS: un anticipo se recibe en efectivo%', 'A2 método ANTICIPO');

  -- A3) Turno B: la cita se cobra con $500 de total: $200 de anticipo y $300 en efectivo.
  v_tb := pg_temp.turno('SMK-0222-B', 500);
  PERFORM pg_temp.debe_fallar(format('SELECT registrar_anticipo(%L, 10, %L, %L, %L, NULL)', v_cx, 'EFECTIVO', v_caja, v_ta),
    'DATOS_INVALIDOS: el anticipo se mueve en un turno abierto%', 'A3 turno cerrado');
  v_kx := abrir_ticket(v_suc, v_caja, v_tb, 'PARA_LLEVAR'::modo_servicio, v_ana, NULL, 'b222-kx', v_maria);
  PERFORM agregar_item_a_ticket(v_kx, v_tinte, 1, NULL, '[]'::jsonb, 'b222-kx-1');
  PERFORM pg_temp.debe_fallar(format('SELECT pagar_con_anticipo(%L, %L, NULL)', v_kx, v_cx),
    'DATOS_INVALIDOS: la cita no está en esta venta.', 'A3 sin vincular');
  PERFORM vincular_cita_ticket(v_cx, v_kx);
  -- ANTICIPO por aplicar_pago directo no entra.
  PERFORM pg_temp.debe_fallar(format('SELECT aplicar_pago(%L, %L, 200)', v_kx, 'ANTICIPO'),
    '%pagar_con_anticipo%', 'A3 aplicar_pago ANTICIPO');
  IF pagar_con_anticipo(v_kx, v_cx, 'b222-px') <> 200 THEN RAISE EXCEPTION 'A3: debía aplicar 200'; END IF;
  IF pagar_con_anticipo(v_kx, v_cx, 'b222-px') <> 200 THEN RAISE EXCEPTION 'A3: el reintento no devolvió 200'; END IF;
  SELECT count(*) INTO v_n FROM pagos WHERE ticket_id = v_kx AND metodo_pago = 'ANTICIPO';
  IF v_n <> 1 THEN RAISE EXCEPTION 'A3: % pagos ANTICIPO', v_n; END IF;
  PERFORM aplicar_pago(v_kx, 'EFECTIVO'::metodo_pago, 300, 300, NULL, NULL, NULL, false, NULL, 'b222-px2');
  SELECT * INTO r FROM anticipos_cita WHERE id = v_ax;
  IF r.estado <> 'APLICADO' OR r.ticket_id <> v_kx OR r.turno_resuelve_id <> v_tb OR r.monto_mxn <> 200 THEN
    RAISE EXCEPTION 'A3: el anticipo debía quedar APLICADO a la venta en B: %', to_jsonb(r); END IF;
  IF (SELECT estado_fiscal FROM tickets WHERE id = v_kx) <> 'PAGADO' OR (SELECT estado FROM citas WHERE id = v_cx) <> 'COBRADA' THEN
    RAISE EXCEPTION 'A3: venta o cita sin cerrar'; END IF;
  IF pg_temp.esp(v_tb) <> 800 THEN RAISE EXCEPTION 'A3: B esperaba 500 + 300 = 800: %', pg_temp.esp(v_tb); END IF;
  IF pg_temp.esp(v_ta) <> 1200 THEN RAISE EXCEPTION 'A3: A cambió: %', pg_temp.esp(v_ta); END IF;
  j := reporte_x(v_tb);
  IF jsonb_path_exists(j, '$.pagos_por_metodo[*] ? (@.metodo_pago == "ANTICIPO")') OR pg_temp.metodo(j, 'EFECTIVO') <> 300
     OR (j->>'pagado_con_anticipo_mxn')::numeric <> 200 OR (j->>'anticipos_recibidos_mxn')::numeric <> 0 THEN
    RAISE EXCEPTION 'A3: reporte_x de B: %', j; END IF;
  -- La venta completa gana sus puntos como una sin anticipo; el anticipo no da comisión.
  v_kr := abrir_ticket(v_suc, v_caja, v_tb, 'PARA_LLEVAR'::modo_servicio, v_ana, NULL, 'b222-kr', v_maria);
  PERFORM agregar_item_a_ticket(v_kr, v_tinte, 1, NULL, '[]'::jsonb, 'b222-kr-1');
  PERFORM aplicar_pago(v_kr, 'TARJETA_CREDITO'::metodo_pago, 500, NULL, 'REF-1', NULL, NULL, false, NULL, 'b222-pr');   -- con tarjeta: no toca el cajón
  IF lealtad_neto_ganado(v_kx) <= 0 OR lealtad_neto_ganado(v_kx) <> lealtad_neto_ganado(v_kr) THEN
    RAISE EXCEPTION 'A3: puntos con anticipo % vs contado %', lealtad_neto_ganado(v_kx), lealtad_neto_ganado(v_kr); END IF;
  IF EXISTS (SELECT 1 FROM vw_comisiones_renglon WHERE ticket_id IN (v_kx, v_kr)) THEN
    RAISE EXCEPTION 'A3: el anticipo dio comisión'; END IF;
  -- El pago ANTICIPO no se reabre ni se edita.
  PERFORM pg_temp.debe_fallar(format('UPDATE pagos SET estado = %L WHERE ticket_id = %L AND metodo_pago = %L', 'CANCELADO', v_kx, 'ANTICIPO'),
    'DATOS_INVALIDOS: una venta pagada con anticipo no se reabre%', 'A3 cancelar pago');

  -- A4) Anticipo mayor que el saldo: $300 con tarjeta para un corte de $180 → 180 APLICADO, 120 VIGENTE.
  v_cy := pg_temp.cita('Yolanda', '2030-01-08 11:00-06');
  v_ay := registrar_anticipo(v_cy, 300, 'TARJETA_DEBITO', v_caja, v_tb, 'b222-ay');
  v_ky := abrir_ticket(v_suc, v_caja, v_tb, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'b222-ky', v_maria);
  PERFORM agregar_item_a_ticket(v_ky, v_corte, 1, NULL, '[]'::jsonb, 'b222-ky-1');
  PERFORM vincular_cita_ticket(v_cy, v_ky);
  IF pagar_con_anticipo(v_ky, v_cy, 'b222-py') <> 180 THEN RAISE EXCEPTION 'A4: debía aplicar 180'; END IF;
  IF (SELECT estado_fiscal FROM tickets WHERE id = v_ky) <> 'PAGADO' THEN RAISE EXCEPTION 'A4: la venta debía quedar PAGADA'; END IF;
  SELECT id INTO v_a2 FROM anticipos_cita WHERE cita_id = v_cy AND estado = 'VIGENTE';
  IF (SELECT (estado, monto_mxn, ticket_id) FROM anticipos_cita WHERE id = v_ay) <> ('APLICADO'::text, 180::numeric, v_ky)
     OR (SELECT (monto_mxn, turno_id, metodo_pago::text) FROM anticipos_cita WHERE id = v_a2) <> (120::numeric, v_tb, 'TARJETA_DEBITO'::text)
     OR (SELECT count(*) FROM anticipos_cita WHERE cita_id = v_cy) <> 2 THEN
    RAISE EXCEPTION 'A4: el sobrante debía quedar VIGENTE en 120: %', (SELECT jsonb_agg(to_jsonb(a)) FROM anticipos_cita a WHERE cita_id = v_cy); END IF;
  -- Arqueo de B: efectivo 500 + 300 = 800 y tarjeta 300 (el anticipo recibido); ANTICIPO no se declara.
  j := arquear_caja(v_tb, jsonb_build_array(jsonb_build_object('metodo_pago', 'EFECTIVO', 'monto_declarado_mxn', 800),
                                           jsonb_build_object('metodo_pago', 'TARJETA_DEBITO', 'monto_declarado_mxn', 300)), 'PARCIAL', v_maria);
  IF (j->>'diferencia_total_mxn')::numeric <> 0 THEN RAISE EXCEPTION 'A4: arqueo de B: %', j; END IF;
  -- Devolver el sobrante con tarjeta sin referencia no; con referencia sí, sin tocar el cajón.
  PERFORM pg_temp.debe_fallar(format('SELECT devolver_anticipo(%L, %L, %L)', v_a2, v_caja, v_tb),
    'DATOS_INVALIDOS: falta la referencia%', 'A4 tarjeta sin referencia');
  PERFORM pg_temp.debe_fallar(format('SELECT devolver_anticipo(%L, %L, %L, %L)', v_a2, v_caja, v_tb, '   '),
    'DATOS_INVALIDOS: falta la referencia%', 'A4 tarjeta referencia vacía');
  PERFORM devolver_anticipo(v_a2, v_caja, v_tb, 'AUT-123');
  IF pg_temp.esp(v_tb) <> 800 THEN RAISE EXCEPTION 'A4: la devolución con tarjeta tocó el cajón: %', pg_temp.esp(v_tb); END IF;
  IF (SELECT referencia_devolucion FROM anticipos_cita WHERE id = v_a2) <> 'AUT-123' THEN RAISE EXCEPTION 'A4: sin referencia guardada'; END IF;
  IF (reporte_x(v_tb)->>'anticipos_devueltos_mxn')::numeric <> 120 THEN RAISE EXCEPTION 'A4: devueltos en B: %', reporte_x(v_tb); END IF;
  -- Un anticipo resuelto ya no cambia.
  PERFORM pg_temp.debe_fallar(format('SELECT devolver_anticipo(%L, %L, %L, %L)', v_ay, v_caja, v_tb, 'x'),
    'DATOS_INVALIDOS: el anticipo ya se resolvió (APLICADO).', 'A4 devolver aplicado');

  -- A5) Devolver en efectivo resta del esperado del turno que devuelve (no del que lo recibió).
  v_cz := pg_temp.cita('Zoe', '2030-01-08 12:00-06');
  v_az := registrar_anticipo(v_cz, 150, 'EFECTIVO', v_caja, v_tb, 'b222-az');
  IF pg_temp.esp(v_tb) <> 950 THEN RAISE EXCEPTION 'A5: B esperaba 950: %', pg_temp.esp(v_tb); END IF;
  PERFORM cancelar_cita(v_cz, 'se mudó');
  v_tc := pg_temp.turno('SMK-0222-C', 1000);
  -- C) En efectivo pide venta.devolucion: la cajera sin PIN no; con la autorización de un supervisor, sí.
  PERFORM pg_temp.debe_fallar(format('SELECT devolver_anticipo(%L, %L, %L)', v_az, v_caja, v_tc),
    'Devolver un anticipo en efectivo requiere autorización%', 'C sin permiso');
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_tc, v_maria, v_diego, 'devolver_anticipo', 'venta.cancelar_pagada', 'anticipo', v_az, 'smoke')
  RETURNING id INTO v_auth;
  PERFORM pg_temp.debe_fallar(format('SELECT devolver_anticipo(%L, %L, %L, NULL, %L)', v_az, v_caja, v_tc, v_auth),
    'La autorización es para "venta.cancelar_pagada"%', 'C otro permiso');
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_tc, v_maria, v_diego, 'devolver_anticipo', 'venta.devolucion', 'anticipo', v_az, 'smoke')
  RETURNING id INTO v_auth;
  PERFORM devolver_anticipo(v_az, v_caja, v_tc, NULL, v_auth);
  PERFORM devolver_anticipo(v_az, v_caja, v_tc);   -- reintento inofensivo
  IF (SELECT (usuario_autorizo_id, autorizacion_pin_id) FROM movimientos_caja WHERE turno_id = v_tc AND tipo = 'DEVOLUCION_EFECTIVO')
     <> (v_diego, v_auth) THEN RAISE EXCEPTION 'C: el movimiento no guardó quién autorizó'; END IF;
  IF pg_temp.esp(v_tc) <> 850 OR pg_temp.esp(v_tb) <> 950 THEN
    RAISE EXCEPTION 'A5: C esperaba 850 y B 950: % %', pg_temp.esp(v_tc), pg_temp.esp(v_tb); END IF;
  SELECT count(*) INTO v_n FROM movimientos_caja
   WHERE turno_id = v_tc AND tipo = 'DEVOLUCION_EFECTIVO' AND monto_mxn = 150 AND motivo = 'Anticipo devuelto · Zoe';
  IF v_n <> 1 THEN RAISE EXCEPTION 'A5: % movimientos de devolución', v_n; END IF;
  IF (reporte_x(v_tc)->>'anticipos_devueltos_mxn')::numeric <> 150 THEN RAISE EXCEPTION 'A5: devueltos en C: %', reporte_x(v_tc); END IF;

  -- A6) Retener: solo cita cancelada o que no llegó.
  v_cw := pg_temp.cita('Wendy', '2030-01-08 13:00-06');
  v_aw := registrar_anticipo(v_cw, 100, 'TRANSFERENCIA', v_caja, v_tc, 'b222-aw');
  PERFORM pg_temp.debe_fallar(format('SELECT retener_anticipo(%L, %L)', v_aw, v_tc),
    'DATOS_INVALIDOS: solo se retiene%', 'A6 cita viva');

  -- A7) Otro negocio no ve ni toca anticipos.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno, 'role', 'authenticated', 'tenant_id', v_otro)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_n FROM anticipos_cita;
  IF v_n <> 0 THEN RAISE EXCEPTION 'A7: otro negocio ve % anticipos', v_n; END IF;
  PERFORM pg_temp.debe_fallar(format('SELECT devolver_anticipo(%L, %L, %L, %L)', v_aw, v_caja, v_tc, 'x'),
    'DATOS_INVALIDOS: el anticipo no existe.', 'A7 devolver ajeno');
  PERFORM pg_temp.debe_fallar(format('SELECT retener_anticipo(%L, %L)', v_aw, v_tc),
    'DATOS_INVALIDOS: el anticipo no existe.', 'A7 retener ajeno');
  PERFORM pg_temp.debe_fallar(format('SELECT anticipo_sugerido(%L)', v_cw), 'DATOS_INVALIDOS: la cita no existe.', 'A7 sugerido ajeno');
  PERFORM pg_temp.debe_fallar(format('SELECT registrar_anticipo(%L, 10, %L, %L, %L, NULL)', v_cw, 'EFECTIVO', v_caja, v_tc),
    'DATOS_INVALIDOS: %', 'A7 registrar ajeno');
  PERFORM pg_temp.debe_fallar(format('INSERT INTO anticipos_cita (tenant_id, sucursal_id, caja_id, turno_id, cita_id, metodo_pago, monto_mxn) VALUES (%L, %L, %L, %L, %L, %L, 1)',
    v_t, v_suc, v_caja, v_tc, v_cw, 'EFECTIVO'), '%permission denied%', 'A7 insert directo');
  EXECUTE 'RESET ROLE';
  IF has_table_privilege('anon', 'anticipos_cita', 'SELECT')
     OR has_function_privilege('anon', 'registrar_anticipo(uuid, numeric, metodo_pago, uuid, uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'A7: anon llega a los anticipos'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria, 'tenant_id', v_t)::text, true);

  -- A6) …cancelada: queda RETENIDO y sale en anticipos_retenidos_mxn; ya no se devuelve.
  PERFORM cancelar_cita(v_cw, 'fuera del límite');
  PERFORM retener_anticipo(v_aw, v_tc);
  IF (SELECT estado FROM anticipos_cita WHERE id = v_aw) <> 'RETENIDO' THEN RAISE EXCEPTION 'A6: no quedó RETENIDO'; END IF;
  j := reporte_x(v_tc);
  IF (j->>'anticipos_retenidos_mxn')::numeric <> 100 OR (j->>'anticipos_recibidos_mxn')::numeric <> 100 THEN
    RAISE EXCEPTION 'A6: reporte_x de C: %', j; END IF;
  PERFORM pg_temp.debe_fallar(format('SELECT devolver_anticipo(%L, %L, %L, %L)', v_aw, v_caja, v_tc, 'x'),
    'DATOS_INVALIDOS: el anticipo ya se resolvió (RETENIDO).', 'A6 devolver retenido');


  -- A8) Ruling A, venta ABIERTA cancelada: el anticipo aplicado regresa VIGENTE y paga la siguiente venta.
  v_cp := pg_temp.cita('Paty', '2030-01-08 14:00-06');
  v_ap := registrar_anticipo(v_cp, 100, 'EFECTIVO', v_caja, v_tc, 'b222-ap');
  v_e0 := pg_temp.esp(v_tc);
  v_kp := abrir_ticket(v_suc, v_caja, v_tc, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'b222-kp', v_maria);
  PERFORM agregar_item_a_ticket(v_kp, v_corte, 1, NULL, '[]'::jsonb, 'b222-kp-1');
  PERFORM vincular_cita_ticket(v_cp, v_kp);
  IF pagar_con_anticipo(v_kp, v_cp, 'b222-pp') <> 100 THEN RAISE EXCEPTION 'A8: debía aplicar 100'; END IF;
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_tc, v_maria, v_diego, 'cancelar_ticket', 'venta.cancelar_abierta', 'ticket', v_kp, 'smoke')
  RETURNING id INTO v_auth;
  PERFORM cancelar_ticket_pagado(p_ticket_id := v_kp, p_caja_id := v_caja, p_turno_id := v_tc,
    p_motivo := 'CLIENTE_DESISTIO'::cancelacion_motivo, p_motivo_texto := 'smoke', p_autorizacion_pin_id := v_auth,
    p_usuario_solicitante_id := v_maria, p_usuario_autorizo_id := v_diego, p_client_id_local := 'b222-cp');
  IF (SELECT (estado, ticket_id, turno_resuelve_id, monto_mxn) FROM anticipos_cita WHERE id = v_ap)
     IS DISTINCT FROM ('VIGENTE'::text, NULL::uuid, NULL::uuid, 100::numeric) THEN
    RAISE EXCEPTION 'A8: el anticipo de la venta cancelada debía volver VIGENTE: %', (SELECT to_jsonb(a) FROM anticipos_cita a WHERE id = v_ap); END IF;
  IF pg_temp.esp(v_tc) <> v_e0 THEN RAISE EXCEPTION 'A8: la cancelación tocó el cajón: % vs %', pg_temp.esp(v_tc), v_e0; END IF;
  v_kn := abrir_ticket(v_suc, v_caja, v_tc, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'b222-kp2', v_maria);
  PERFORM agregar_item_a_ticket(v_kn, v_corte, 1, NULL, '[]'::jsonb, 'b222-kp2-1');
  PERFORM vincular_cita_ticket(v_cp, v_kn);
  IF pagar_con_anticipo(v_kn, v_cp, 'b222-pp2') <> 100 THEN RAISE EXCEPTION 'A8: la otra venta debía usar los 100'; END IF;

  -- A9) Ruling A, venta PAGADA cancelada con devolución en efectivo: $200 de anticipo + $300 en
  --     efectivo → regresan $200 VIGENTES a la cita y del cajón solo salen $300.
  v_cq := pg_temp.cita('Quetzal', '2030-01-08 16:00-06');
  v_aq := registrar_anticipo(v_cq, 200, 'EFECTIVO', v_caja, v_tc, 'b222-aq');
  v_kq := abrir_ticket(v_suc, v_caja, v_tc, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'b222-kq', v_maria);
  PERFORM agregar_item_a_ticket(v_kq, v_tinte, 1, NULL, '[]'::jsonb, 'b222-kq-1');
  PERFORM vincular_cita_ticket(v_cq, v_kq);
  PERFORM pagar_con_anticipo(v_kq, v_cq, 'b222-pq');
  PERFORM aplicar_pago(v_kq, 'EFECTIVO'::metodo_pago, 300, 300, NULL, NULL, NULL, false, NULL, 'b222-pq2');
  v_e0 := pg_temp.esp(v_tc);
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_tc, v_maria, v_diego, 'cancelar_ticket', 'venta.cancelar_pagada', 'ticket', v_kq, 'smoke')
  RETURNING id INTO v_auth;
  PERFORM cancelar_ticket_pagado(p_ticket_id := v_kq, p_caja_id := v_caja, p_turno_id := v_tc,
    p_motivo := 'CLIENTE_DESISTIO'::cancelacion_motivo, p_motivo_texto := 'smoke', p_autorizacion_pin_id := v_auth,
    p_usuario_solicitante_id := v_maria, p_usuario_autorizo_id := v_diego, p_reversar_inventario := true,
    p_cancelar_cfdi_sat := false, p_devolver_dinero := true, p_client_id_local := 'b222-cq');
  IF pg_temp.esp(v_tc) <> v_e0 - 300 THEN RAISE EXCEPTION 'A9: del cajón debían salir 300: % vs %', pg_temp.esp(v_tc), v_e0; END IF;
  IF (SELECT (estado, ticket_id, monto_mxn) FROM anticipos_cita WHERE id = v_aq) IS DISTINCT FROM ('VIGENTE'::text, NULL::uuid, 200::numeric)
     OR (SELECT count(*) FROM anticipos_cita WHERE cita_id = v_cq) <> 1 THEN
    RAISE EXCEPTION 'A9: el anticipo debía volver VIGENTE en 200: %', (SELECT jsonb_agg(to_jsonb(a)) FROM anticipos_cita a WHERE cita_id = v_cq); END IF;
  IF (SELECT estado FROM citas WHERE id = v_cq) <> 'TERMINADA' THEN RAISE EXCEPTION 'A9: la cita debía volver a TERMINADA'; END IF;

  -- B) Devolución parcial: 2 cortes ($360) pagados con $250 de anticipo y $110 en efectivo.
  --    Se devuelve 1 corte ($180): los 180 salen del anticipo (se parte: 70 sigue APLICADO, 180
  --    VIGENTE) y del cajón nada. El otro corte: 70 regresan al anticipo y 110 salen en efectivo.
  v_cr := pg_temp.cita('Rita', '2030-01-08 17:00-06');
  v_ar := registrar_anticipo(v_cr, 250, 'EFECTIVO', v_caja, v_tc, 'b222-ar');
  v_kk := abrir_ticket(v_suc, v_caja, v_tc, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'b222-kk', v_maria);
  i_r := agregar_item_a_ticket(v_kk, v_corte, 2, NULL, '[]'::jsonb, 'b222-kk-1');
  PERFORM vincular_cita_ticket(v_cr, v_kk);
  IF pagar_con_anticipo(v_kk, v_cr, 'b222-pk') <> 250 THEN RAISE EXCEPTION 'B: debía aplicar 250'; END IF;
  PERFORM aplicar_pago(v_kk, 'EFECTIVO'::metodo_pago, 110, 110, NULL, NULL, NULL, false, NULL, 'b222-pk2');
  v_e0 := pg_temp.esp(v_tc);
  INSERT INTO autorizaciones_pin (tenant_id, usuario_solicitante_id, usuario_autorizo_id, accion, permiso_codigo, motivo, caja_id, turno_id)
  VALUES (v_t, v_maria, v_diego, 'devolucion', 'venta.devolucion', 't', v_caja, v_tc) RETURNING id INTO v_auth;
  v_dev := crear_devolucion(v_kk, v_caja, v_tc, 'PARCIAL'::devolucion_alcance, 'PRODUCTO_DEFECTUOSO'::devolucion_motivo, 'x',
    'EFECTIVO'::devolucion_medio, v_auth, v_maria, v_diego,
    jsonb_build_array(jsonb_build_object('ticket_item_id', i_r, 'cantidad_devuelta', 1)), false, NULL, 'b222-dk1');
  PERFORM confirmar_devolucion(v_dev, v_maria);
  IF pg_temp.esp(v_tc) <> v_e0 THEN RAISE EXCEPTION 'B: la primera devolución sacó efectivo: % vs %', pg_temp.esp(v_tc), v_e0; END IF;
  IF (SELECT (estado, monto_mxn, ticket_id) FROM anticipos_cita WHERE id = v_ar) IS DISTINCT FROM ('APLICADO'::text, 70::numeric, v_kk)
     OR (SELECT count(*) FROM anticipos_cita WHERE cita_id = v_cr AND estado = 'VIGENTE' AND monto_mxn = 180 AND turno_id = v_tc) <> 1 THEN
    RAISE EXCEPTION 'B: el anticipo debía partirse en 70 APLICADO y 180 VIGENTE: %', (SELECT jsonb_agg(to_jsonb(a)) FROM anticipos_cita a WHERE cita_id = v_cr); END IF;
  INSERT INTO autorizaciones_pin (tenant_id, usuario_solicitante_id, usuario_autorizo_id, accion, permiso_codigo, motivo, caja_id, turno_id)
  VALUES (v_t, v_maria, v_diego, 'devolucion', 'venta.devolucion', 't', v_caja, v_tc) RETURNING id INTO v_auth;
  v_dev := crear_devolucion(v_kk, v_caja, v_tc, 'PARCIAL'::devolucion_alcance, 'PRODUCTO_DEFECTUOSO'::devolucion_motivo, 'x',
    'EFECTIVO'::devolucion_medio, v_auth, v_maria, v_diego,
    jsonb_build_array(jsonb_build_object('ticket_item_id', i_r, 'cantidad_devuelta', 1)), false, NULL, 'b222-dk2');
  PERFORM confirmar_devolucion(v_dev, v_maria);
  IF pg_temp.esp(v_tc) <> v_e0 - 110 THEN RAISE EXCEPTION 'B: la segunda devolución debía sacar 110: % vs %', pg_temp.esp(v_tc), v_e0; END IF;
  IF (SELECT sum(monto_mxn) FROM anticipos_cita WHERE cita_id = v_cr AND estado = 'VIGENTE') <> 250
     OR EXISTS (SELECT 1 FROM anticipos_cita WHERE cita_id = v_cr AND estado = 'APLICADO') THEN
    RAISE EXCEPTION 'B: los 250 debían quedar VIGENTES: %', (SELECT jsonb_agg(to_jsonb(a)) FROM anticipos_cita a WHERE cita_id = v_cr); END IF;
  -- El corte del turno que recibió los anticipos no cambia por partirlos (Wendy 100, Paty 100, Quetzal 200, Rita 250).
  IF (reporte_x(v_tc)->>'anticipos_recibidos_mxn')::numeric <> 650 THEN
    RAISE EXCEPTION 'B: recibidos en C: %', reporte_x(v_tc)->>'anticipos_recibidos_mxn'; END IF;

  -- B2) Una venta sin ANTICIPO no cambia: devolver 1 de 2 cortes en efectivo saca los 180.
  v_kn := abrir_ticket(v_suc, v_caja, v_tc, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'b222-kn', v_maria);
  i_n := agregar_item_a_ticket(v_kn, v_corte, 2, NULL, '[]'::jsonb, 'b222-kn-1');
  PERFORM aplicar_pago(v_kn, 'EFECTIVO'::metodo_pago, 360, 360, NULL, NULL, NULL, false, NULL, 'b222-pn');
  v_e0 := pg_temp.esp(v_tc);
  INSERT INTO autorizaciones_pin (tenant_id, usuario_solicitante_id, usuario_autorizo_id, accion, permiso_codigo, motivo, caja_id, turno_id)
  VALUES (v_t, v_maria, v_diego, 'devolucion', 'venta.devolucion', 't', v_caja, v_tc) RETURNING id INTO v_auth;
  v_dev := crear_devolucion(v_kn, v_caja, v_tc, 'PARCIAL'::devolucion_alcance, 'PRODUCTO_DEFECTUOSO'::devolucion_motivo, 'x',
    'EFECTIVO'::devolucion_medio, v_auth, v_maria, v_diego,
    jsonb_build_array(jsonb_build_object('ticket_item_id', i_n, 'cantidad_devuelta', 1)), false, NULL, 'b222-dn');
  PERFORM confirmar_devolucion(v_dev, v_maria);
  IF pg_temp.esp(v_tc) <> v_e0 - 180 THEN RAISE EXCEPTION 'B2: sin anticipo debía sacar 180: % vs %', pg_temp.esp(v_tc), v_e0; END IF;

  RAISE NOTICE 'belleza anticipos OK';
END $$;

ROLLBACK;
