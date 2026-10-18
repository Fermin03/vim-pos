-- Smoke crédito (retail 2, entrega 2; 0207–0209). Hace ROLLBACK.
-- Ejecutar: cd desktop && npm run smokes -- smoke_credito.sql
\set ON_ERROR_STOP on
BEGIN;
-- 0207: los dos métodos de pago nuevos existen.
DO $$
BEGIN
  IF NOT ('CREDITO' = ANY (enum_range(NULL::metodo_pago)::text[])) THEN RAISE EXCEPTION 'falta metodo_pago CREDITO'; END IF;
  IF NOT ('SALDO_FAVOR' = ANY (enum_range(NULL::metodo_pago)::text[])) THEN RAISE EXCEPTION 'falta metodo_pago SALDO_FAVOR'; END IF;
  RAISE NOTICE 'SMOKE CREDITO 0207 OK';
END $$;

-- 0208: crédito por cliente, venta a crédito, abonos y corte.
DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_cat    uuid := 'c2080000-0000-0000-0000-0000000000c1';
  v_prod   uuid := 'c2080000-0000-0000-0000-0000000000a1';
  v_ana    uuid := 'c2080000-0000-0000-0000-000000000001';
  v_beto   uuid := 'c2080000-0000-0000-0000-000000000002';
  v_turno1 uuid; v_turno2 uuid; v_t1 uuid; v_t2 uuid; v_t3 uuid; v_t4 uuid; v_t5 uuid; v_t6 uuid; v_tb uuid; v_auth uuid;
  v_e1 numeric; v_e2 numeric; v_n integer; j jsonb; v_x jsonb; v_ok boolean;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_t::text)::text, true);
  INSERT INTO categorias (id, tenant_id, nombre) VALUES (v_cat, v_t, 'Crédito');
  INSERT INTO productos (id, tenant_id, nombre, categoria_id, precio_base_mxn) VALUES (v_prod, v_t, 'Saco', v_cat, 500);
  INSERT INTO clientes (id, tenant_id, nombre, telefono) VALUES
    (v_ana, v_t, 'Ana Crédito', '4770002081'), (v_beto, v_t, 'Beto Contado', '4770002082');
  INSERT INTO configuracion_tenant (tenant_id) VALUES (v_t) ON CONFLICT (tenant_id) DO NOTHING;
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_t, v_suc, v_caja, 'SMOKE-CR1', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno1;

  -- 1) El módulo nace apagado y, apagado, no se vende a crédito.
  IF (modulos_efectivos(v_t)->'efectivos'->>'credito')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION '1: credito debía nacer apagado: %', modulos_efectivos(v_t)->'efectivos';
  END IF;
  INSERT INTO clientes_credito (tenant_id, cliente_id, limite_mxn, plazo_dias) VALUES (v_t, v_ana, 800, 30);
  v_t1 := abrir_ticket(v_suc, v_caja, v_turno1, 'PARA_LLEVAR'::modo_servicio, v_ana, NULL, 'smoke-cr-1', v_maria);
  PERFORM agregar_item_a_ticket(v_t1, v_prod, 1, NULL, '[]'::jsonb, 'smoke-cr-1a');
  BEGIN
    PERFORM pagar_a_credito(v_t1);
    RAISE EXCEPTION '1: se vendió a crédito con el módulo apagado';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'DATOS_INVALIDOS:%' THEN RAISE; END IF;
  END;
  UPDATE configuracion_tenant SET modulo_credito_activo = true WHERE tenant_id = v_t;
  IF (modulos_efectivos(v_t)->'efectivos'->>'credito')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION '1: credito no se encendió';
  END IF;
  IF (SELECT credito_abonos_al_cancelar FROM configuracion_tenant WHERE tenant_id = v_t) <> 'SALDO_FAVOR' THEN
    RAISE EXCEPTION '1: credito_abonos_al_cancelar debía nacer SALDO_FAVOR';
  END IF;

  -- 2) El cliente sin crédito se rechaza.
  v_tb := abrir_ticket(v_suc, v_caja, v_turno1, 'PARA_LLEVAR'::modo_servicio, v_beto, NULL, 'smoke-cr-b', v_maria);
  PERFORM agregar_item_a_ticket(v_tb, v_prod, 1, NULL, '[]'::jsonb, 'smoke-cr-ba');
  BEGIN
    PERFORM pagar_a_credito(v_tb);
    RAISE EXCEPTION '2: un cliente sin crédito compró a crédito';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%no tiene crédito%' THEN RAISE; END IF;
  END;

  -- 3) $500 dentro del límite: PAGADO sin PIN, y su saldo es 500.
  IF (SELECT total_mxn FROM tickets WHERE id = v_t1) <> 500 THEN RAISE EXCEPTION '3: el ticket no suma 500'; END IF;
  PERFORM pagar_a_credito(v_t1, NULL, 'smoke-cr-p1');
  IF (SELECT estado_fiscal FROM tickets WHERE id = v_t1) <> 'PAGADO' THEN RAISE EXCEPTION '3: la venta a crédito no quedó PAGADO'; END IF;
  IF credito_saldo_ticket(v_t1) <> 500 THEN RAISE EXCEPTION '3: saldo % (esperado 500)', credito_saldo_ticket(v_t1); END IF;
  -- Repetir con el mismo client_id_local devuelve el mismo pago.
  IF pagar_a_credito(v_t1, NULL, 'smoke-cr-p1') <> (SELECT id FROM pagos WHERE ticket_id = v_t1) THEN
    RAISE EXCEPTION '3: pagar_a_credito no es idempotente';
  END IF;

  -- 4) Otra de $500 pasa el límite de 800: sin PIN se rechaza, con autorización pasa.
  v_t2 := abrir_ticket(v_suc, v_caja, v_turno1, 'PARA_LLEVAR'::modo_servicio, v_ana, NULL, 'smoke-cr-2', v_maria);
  PERFORM agregar_item_a_ticket(v_t2, v_prod, 1, NULL, '[]'::jsonb, 'smoke-cr-2a');
  BEGIN
    PERFORM pagar_a_credito(v_t2);
    RAISE EXCEPTION '4: pasó el límite sin autorización';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%límite de crédito%' THEN RAISE; END IF;
  END;
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno1, v_maria, v_maria, 'credito', 'venta.credito_excedido', 'ticket', v_t2, 'smoke 4')
  RETURNING id INTO v_auth;
  PERFORM pagar_a_credito(v_t2, v_auth);
  IF (SELECT estado_fiscal FROM tickets WHERE id = v_t2) <> 'PAGADO' THEN RAISE EXCEPTION '4: con autorización no quedó PAGADO'; END IF;

  -- 5) Con algo vencido (la de $500 tiene 40 días y el plazo es 30) se rechaza sin PIN aunque haya límite.
  UPDATE clientes_credito SET limite_mxn = 10000 WHERE cliente_id = v_ana;
  UPDATE tickets SET fecha_apertura = fecha_apertura - interval '40 days', fecha_pago = fecha_pago - interval '40 days' WHERE id = v_t1;
  -- En una sola transacción now() no avanza: sin esto t2 y t3 empatan y el reparto (7) queda al azar.
  UPDATE tickets SET fecha_apertura = fecha_apertura - interval '1 day', fecha_pago = fecha_pago - interval '1 day' WHERE id = v_t2;
  IF NOT (SELECT tiene_vencido FROM vw_creditos_cliente WHERE cliente_id = v_ana) THEN RAISE EXCEPTION '5: la vista no ve lo vencido'; END IF;
  v_t3 := abrir_ticket(v_suc, v_caja, v_turno1, 'PARA_LLEVAR'::modo_servicio, v_ana, NULL, 'smoke-cr-3', v_maria);
  PERFORM agregar_item_a_ticket(v_t3, v_prod, 1, NULL, '[]'::jsonb, 'smoke-cr-3a');
  BEGIN
    PERFORM pagar_a_credito(v_t3);
    RAISE EXCEPTION '5: vendió con algo vencido sin autorización';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%vencid%' THEN RAISE; END IF;
  END;
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno1, v_maria, v_maria, 'credito', 'venta.credito_excedido', 'ticket', v_t3, 'smoke 5')
  RETURNING id INTO v_auth;
  PERFORM pagar_a_credito(v_t3, v_auth);
  SELECT to_jsonb(v) INTO j FROM vw_creditos_cliente v WHERE cliente_id = v_ana;
  IF (j->>'deuda_mxn')::numeric <> 1500 OR (j->>'disponible_mxn')::numeric <> 8500
     OR (j->>'venta_mas_vieja_ticket_id')::uuid <> v_t1 THEN
    RAISE EXCEPTION '5: la vista dice %', j;
  END IF;

  -- 6) aplicar_pago directo con CREDITO se rechaza.
  v_t4 := abrir_ticket(v_suc, v_caja, v_turno1, 'PARA_LLEVAR'::modo_servicio, v_ana, NULL, 'smoke-cr-4', v_maria);
  PERFORM agregar_item_a_ticket(v_t4, v_prod, 1, NULL, '[]'::jsonb, 'smoke-cr-4a');
  v_ok := false;
  BEGIN
    PERFORM aplicar_pago(v_t4, 'CREDITO'::metodo_pago, 500);
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION '6: aplicar_pago metió un CREDITO directo'; END IF;
  -- A crédito va todo el ticket: con un pago previo se rechaza.
  PERFORM aplicar_pago(v_t4, 'EFECTIVO'::metodo_pago, 100, 100);
  BEGIN
    PERFORM pagar_a_credito(v_t4);
    RAISE EXCEPTION '6: combinó crédito con otro pago';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'DATOS_INVALIDOS:%' THEN RAISE; END IF;
  END;

  -- 7) Otro turno. Un abono de $600 con tarjeta sobre 500 + 500 + 500 se reparte 500 + 100 por antigüedad.
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE id = v_turno1;
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_t, v_suc, v_caja, 'SMOKE-CR2', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 0, 'TOTAL')
  RETURNING id INTO v_turno2;
  v_e1 := calcular_efectivo_esperado(v_turno1);
  v_e2 := calcular_efectivo_esperado(v_turno2);
  j := registrar_abono(v_ana, 600, 'TARJETA_DEBITO'::metodo_pago, v_caja, v_turno2, 'smoke-cr-ab1');
  IF (j->>'abonado')::numeric <> 600 OR (j->>'deuda_restante')::numeric <> 900 OR jsonb_array_length(j->'renglones') <> 2 THEN
    RAISE EXCEPTION '7: abono de 600 devolvió %', j;
  END IF;
  IF credito_saldo_ticket(v_t1) <> 0 OR credito_saldo_ticket(v_t2) <> 400 OR credito_saldo_ticket(v_t3) <> 500 THEN
    RAISE EXCEPTION '7: reparto % / % / % (esperado 0 / 400 / 500)',
      credito_saldo_ticket(v_t1), credito_saldo_ticket(v_t2), credito_saldo_ticket(v_t3);
  END IF;
  -- Idempotente: repetirlo no abona otra vez.
  j := registrar_abono(v_ana, 600, 'TARJETA_DEBITO'::metodo_pago, v_caja, v_turno2, 'smoke-cr-ab1');
  SELECT count(*) INTO v_n FROM abonos_credito WHERE cliente_id = v_ana;
  IF v_n <> 2 OR (j->>'abonado')::numeric <> 600 THEN RAISE EXCEPTION '7: el abono repetido dejó % renglones (%)', v_n, j; END IF;
  -- Con la tarjeta el efectivo no cambia.
  IF calcular_efectivo_esperado(v_turno2) <> v_e2 THEN RAISE EXCEPTION '7: un abono con tarjeta movió el efectivo'; END IF;

  -- 8) Abono de $200 en efectivo: sube el esperado del turno que lo recibe y no el de la venta.
  PERFORM registrar_abono(v_ana, 200, 'EFECTIVO'::metodo_pago, v_caja, v_turno2, 'smoke-cr-ab2');
  IF calcular_efectivo_esperado(v_turno2) <> v_e2 + 200 THEN
    RAISE EXCEPTION '8: esperado del turno 2 % (esperado %)', calcular_efectivo_esperado(v_turno2), v_e2 + 200;
  END IF;
  IF calcular_efectivo_esperado(v_turno1) <> v_e1 THEN RAISE EXCEPTION '8: el abono movió el efectivo del turno de la venta'; END IF;

  -- 9) No se abona más de lo que se debe (quedan 700), ni con un método que no es dinero, ni en un turno cerrado.
  BEGIN
    PERFORM registrar_abono(v_ana, 700.01, 'EFECTIVO'::metodo_pago, v_caja, v_turno2, 'smoke-cr-ab3');
    RAISE EXCEPTION '9: abonó más de la deuda';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'DATOS_INVALIDOS:%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM registrar_abono(v_ana, 10, 'CUPON'::metodo_pago, v_caja, v_turno2, 'smoke-cr-ab4');
    RAISE EXCEPTION '9: abonó con cupón';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'DATOS_INVALIDOS:%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM registrar_abono(v_ana, 10, 'EFECTIVO'::metodo_pago, v_caja, v_turno1, 'smoke-cr-ab5');
    RAISE EXCEPTION '9: abonó en un turno cerrado';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'DATOS_INVALIDOS:%' THEN RAISE; END IF;
  END;

  -- 10) El corte: el CREDITO no se declara, se informa aparte; los abonos sí se declaran.
  v_x := reporte_x(v_turno1);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_x->'pagos_por_metodo') e WHERE e->>'metodo_pago' = 'CREDITO') THEN
    RAISE EXCEPTION '10: reporte_x pide declarar el CREDITO: %', v_x->'pagos_por_metodo';
  END IF;
  IF (v_x->>'ventas_a_credito_mxn')::numeric IS DISTINCT FROM 1500 THEN
    RAISE EXCEPTION '10: ventas_a_credito_mxn % (esperado 1500)', v_x->>'ventas_a_credito_mxn';
  END IF;
  v_x := reporte_x(v_turno2);
  IF (SELECT (e->>'monto_total_mxn')::numeric FROM jsonb_array_elements(v_x->'pagos_por_metodo') e WHERE e->>'metodo_pago' = 'EFECTIVO') IS DISTINCT FROM 200
     OR (SELECT (e->>'monto_total_mxn')::numeric FROM jsonb_array_elements(v_x->'pagos_por_metodo') e WHERE e->>'metodo_pago' = 'TARJETA_DEBITO') IS DISTINCT FROM 600
     OR (v_x->>'ventas_a_credito_mxn')::numeric <> 0 THEN
    RAISE EXCEPTION '10: corte del turno 2: % / %', v_x->'pagos_por_metodo', v_x->>'ventas_a_credito_mxn';
  END IF;

  -- 11) El permiso existe y se autoriza con PIN.
  IF NOT EXISTS (SELECT 1 FROM permisos WHERE codigo = 'venta.credito_excedido' AND permite_autorizacion_pin AND jerarquia_minima_pin = 3) THEN
    RAISE EXCEPTION '11: falta el permiso venta.credito_excedido';
  END IF;

  -- 12) Un pago no cambia de ni a CREDITO (cambiar_forma_pago_ticket); entre otros métodos, sí.
  v_t5 := abrir_ticket(v_suc, v_caja, v_turno2, 'PARA_LLEVAR'::modo_servicio, v_ana, NULL, 'smoke-cr-5', v_maria);
  PERFORM agregar_item_a_ticket(v_t5, v_prod, 1, NULL, '[]'::jsonb, 'smoke-cr-5a');
  PERFORM aplicar_pago(v_t5, 'EFECTIVO'::metodo_pago, 500, 500);
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno2, v_maria, v_maria, 'forma_pago', 'venta.editar_post_cobro', 'ticket', v_t5, 'smoke 12')
  RETURNING id INTO v_auth;
  BEGIN
    PERFORM cambiar_forma_pago_ticket(v_t5, 'CREDITO'::metodo_pago, NULL, v_auth);
    RAISE EXCEPTION '12: un pago en efectivo pasó a crédito';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'DATOS_INVALIDOS: una venta a crédito no cambia%' THEN RAISE; END IF;
  END;
  PERFORM cambiar_forma_pago_ticket(v_t5, 'TARJETA_DEBITO'::metodo_pago, NULL, v_auth);
  IF (SELECT metodo_pago FROM pagos WHERE ticket_id = v_t5) <> 'TARJETA_DEBITO' THEN
    RAISE EXCEPTION '12: el cambio de efectivo a tarjeta no se hizo';
  END IF;

  v_t6 := abrir_ticket(v_suc, v_caja, v_turno2, 'PARA_LLEVAR'::modo_servicio, v_ana, NULL, 'smoke-cr-6', v_maria);
  PERFORM agregar_item_a_ticket(v_t6, v_prod, 1, NULL, '[]'::jsonb, 'smoke-cr-6a');
  -- 13) El client_id_local de otra venta no devuelve ese pago ajeno.
  BEGIN
    PERFORM pagar_a_credito(v_t6, NULL, 'smoke-cr-p1');
    RAISE EXCEPTION '13: pagar_a_credito aceptó el client_id_local de otra venta';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'DATOS_INVALIDOS: ese identificador%' THEN RAISE; END IF;
  END;
  PERFORM pagar_a_credito(v_t6, NULL, 'smoke-cr-p6');
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno2, v_maria, v_maria, 'forma_pago', 'venta.editar_post_cobro', 'ticket', v_t6, 'smoke 12b')
  RETURNING id INTO v_auth;
  BEGIN
    PERFORM cambiar_forma_pago_ticket(v_t6, 'EFECTIVO'::metodo_pago, NULL, v_auth);
    RAISE EXCEPTION '12: una venta a crédito pasó a efectivo';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'DATOS_INVALIDOS: una venta a crédito no cambia%' THEN RAISE; END IF;
  END;
  -- Un UPDATE directo (el PATCH de PostgREST) tampoco.
  BEGIN
    UPDATE pagos SET metodo_pago = 'TRANSFERENCIA' WHERE ticket_id = v_t6;
    RAISE EXCEPTION '12: un UPDATE directo sacó una venta de crédito';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'DATOS_INVALIDOS: una venta a crédito no cambia%' THEN RAISE; END IF;
  END;
  IF credito_saldo_ticket(v_t6) <> 500 THEN RAISE EXCEPTION '12: la deuda de la venta cambió'; END IF;

  -- 14) Un client_id_local que no cabe con su sufijo se rechaza.
  BEGIN
    PERFORM registrar_abono(v_ana, 1, 'EFECTIVO'::metodo_pago, v_caja, v_turno2, repeat('x', 91));
    RAISE EXCEPTION '14: aceptó un client_id_local de 91 caracteres';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'DATOS_INVALIDOS:%90 caracteres%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'SMOKE CREDITO 0208 OK';
END $$;

-- 0208 bajo RLS: el cajero vende y abona con las RPC, pero no da crédito, no escribe abonos a mano
-- ni apaga el módulo; el dueño sí da crédito, pero no a un cliente ajeno; otro negocio no se ve.
DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_cajero uuid := '99999999-0000-0000-0000-000000000001';
  v_dueno  uuid := '99999999-0000-0000-0000-0000000000e1';
  v_otro   uuid := 'c2080000-0000-0000-0000-0000000000ee';
  v_ana    uuid := 'c2080000-0000-0000-0000-000000000001';
  v_beto   uuid := 'c2080000-0000-0000-0000-000000000002';
  v_ajeno  uuid := 'c2080000-0000-0000-0000-000000000003';
  v_turno  uuid; v_tk uuid; v_n integer; v_ok boolean;
BEGIN
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_otro, 'tenant-0208', 'Otra tienda', 'INTERNO', 'QUICK_SERVICE');
  INSERT INTO clientes (id, tenant_id, nombre, telefono) VALUES (v_ajeno, v_otro, 'Ajeno', '4770002083');
  INSERT INTO clientes_credito (tenant_id, cliente_id, limite_mxn, plazo_dias) VALUES (v_otro, v_ajeno, 100, 7);
  SELECT id INTO v_turno FROM turnos WHERE caja_id = v_caja AND estado = 'ABIERTO';

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cajero, 'role', 'authenticated', 'tenant_id', v_t)::text, true);

  SELECT count(*) INTO v_n FROM clientes_credito;
  IF v_n <> 1 THEN RAISE EXCEPTION 'R1: el cajero debía ver 1 crédito, vio %', v_n; END IF;
  SELECT count(*) INTO v_n FROM vw_creditos_cliente;
  IF v_n <> 1 THEN RAISE EXCEPTION 'R1: la vista mostró % créditos', v_n; END IF;

  v_ok := false;
  BEGIN
    INSERT INTO clientes_credito (tenant_id, cliente_id, limite_mxn, plazo_dias) VALUES (v_t, v_beto, 500, 15);
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'R2: un cajero dio crédito'; END IF;
  UPDATE clientes_credito SET limite_mxn = 999999 WHERE cliente_id = v_ana;
  v_ok := false;
  BEGIN
    INSERT INTO abonos_credito (tenant_id, sucursal_id, caja_id, turno_id, cliente_id, ticket_id, tipo, metodo_pago, monto_mxn)
    SELECT v_t, v_suc, v_caja, v_turno, v_ana, ticket_id, 'ABONO', 'EFECTIVO', 1 FROM abonos_credito LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'R3: un cajero escribió un abono a mano'; END IF;
  BEGIN
    UPDATE configuracion_tenant SET modulo_credito_activo = false WHERE tenant_id = v_t;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Con su JWT real abona y vende a crédito (Ana ya no tiene nada vencido y su límite alcanza).
  PERFORM registrar_abono(v_ana, 50, 'EFECTIVO'::metodo_pago, v_caja, v_turno, 'smoke-cr-rls-ab');
  v_tk := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_ana, NULL, 'smoke-cr-rls', v_cajero);
  PERFORM agregar_item_a_ticket(v_tk, 'c2080000-0000-0000-0000-0000000000a1', 1, NULL, '[]'::jsonb, 'smoke-cr-rls-a');
  PERFORM pagar_a_credito(v_tk, NULL, 'smoke-cr-rls-p');
  IF (SELECT estado_fiscal FROM tickets WHERE id = v_tk) <> 'PAGADO' THEN RAISE EXCEPTION 'R4: la venta a crédito del cajero no quedó PAGADO'; END IF;

  -- El dueño sí da crédito, pero no a un cliente de otro negocio.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  INSERT INTO clientes_credito (tenant_id, cliente_id, limite_mxn, plazo_dias) VALUES (v_t, v_beto, 500, 15);
  v_ok := false;
  BEGIN
    INSERT INTO clientes_credito (tenant_id, cliente_id, limite_mxn, plazo_dias) VALUES (v_t, v_ajeno, 500, 15);
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'R5: crédito a un cliente ajeno'; END IF;
  RESET ROLE;

  IF (SELECT limite_mxn FROM clientes_credito WHERE cliente_id = v_ana) <> 10000 THEN RAISE EXCEPTION 'R2: un cajero cambió el límite'; END IF;
  IF NOT (SELECT modulo_credito_activo FROM configuracion_tenant WHERE tenant_id = v_t) THEN RAISE EXCEPTION 'R6: un cajero apagó el crédito'; END IF;
  IF (SELECT count(*) FROM abonos_credito WHERE client_id_local LIKE 'smoke-cr-rls-ab%') <> 1 THEN RAISE EXCEPTION 'R7: el abono del cajero no quedó'; END IF;
  RAISE NOTICE 'SMOKE CREDITO 0208 RLS OK';
END $$;

-- 0209: crédito sin puntos, factura al liquidar, cancelación, saldo a favor y arqueo con abonos.
DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_prod   uuid := 'c2080000-0000-0000-0000-0000000000a1';
  v_beto   uuid := 'c2080000-0000-0000-0000-000000000002';
  v_carla  uuid := 'c2090000-0000-0000-0000-000000000001';
  v_turno uuid; v_ca uuid; v_cb uuid; v_cc uuid; v_cd uuid; v_ce uuid; v_cn uuid; v_tk uuid; v_cf uuid; v_cg uuid; v_ch uuid;
  v_auth uuid; v_dev uuid; v_pago uuid; v_cfdi uuid; v_e numeric; v_ok boolean; v_x jsonb; j jsonb; v_td numeric;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_t::text)::text, true);
  SELECT id INTO v_turno FROM turnos WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO clientes (id, tenant_id, nombre, telefono) VALUES (v_carla, v_t, 'Carla Crédito', '4770002091');
  INSERT INTO clientes_credito (tenant_id, cliente_id, limite_mxn, plazo_dias) VALUES (v_t, v_carla, 10000, 30);
  -- Lealtad encendida (10 %): la venta de contado gana; la de crédito, no.
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
  SELECT v_t, id, (now() AT TIME ZONE 'America/Mexico_City')::date, true, 100 FROM addons a WHERE codigo = 'LEALTAD'
     AND NOT EXISTS (SELECT 1 FROM tenant_addons x WHERE x.tenant_id = v_t AND x.addon_id = a.id);
  INSERT INTO lealtad_programa (tenant_id, mecanica, porcentaje, tope_compras_dia) VALUES (v_t, 'PUNTOS_DINERO', 10, 50)
  ON CONFLICT (tenant_id) DO UPDATE SET mecanica = 'PUNTOS_DINERO', porcentaje = 10, tope_compras_dia = 50;
  UPDATE configuracion_tenant SET modulo_lealtad_activo = true WHERE tenant_id = v_t;

  -- 15) Lealtad: una venta a crédito no gana puntos; la de contado sí.
  v_cn := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_carla, NULL, 'smoke-cr9-n', v_maria);
  PERFORM agregar_item_a_ticket(v_cn, v_prod, 1, NULL, '[]'::jsonb, 'smoke-cr9-na');
  PERFORM aplicar_pago(v_cn, 'EFECTIVO'::metodo_pago, 500, 500);
  IF lealtad_neto_ganado(v_cn) <= 0 THEN RAISE EXCEPTION '15: la venta de contado no ganó (¿lealtad apagada?)'; END IF;
  v_ca := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_carla, NULL, 'smoke-cr9-a', v_maria);
  PERFORM agregar_item_a_ticket(v_ca, v_prod, 1, NULL, '[]'::jsonb, 'smoke-cr9-aa');
  PERFORM pagar_a_credito(v_ca, NULL, 'smoke-cr9-pa');
  IF lealtad_neto_ganado(v_ca) <> 0 THEN RAISE EXCEPTION '15: la venta a crédito ganó % puntos', lealtad_neto_ganado(v_ca); END IF;

  -- 16) Factura: con saldo no se factura (CFDI, autofactura, global); liquidada, sí.
  v_ok := false;
  BEGIN
    v_cfdi := cfdi_crear_borrador(
      p_ticket_id := v_ca, p_tipo_comprobante := 'INGRESO'::cfdi_tipo_comprobante,
      p_receptor_rfc := 'XAXX010101000', p_receptor_razon_social := 'PUBLICO EN GENERAL',
      p_receptor_uso_cfdi := 'S01', p_receptor_codigo_postal := '37000', p_receptor_regimen_fiscal := '616',
      p_receptor_email := 'cliente@demo.mx', p_emisor_rfc := 'XAXX010101000',
      p_emisor_razon_social := 'VIM MARKETING SA DE CV', p_emisor_regimen_fiscal := '601',
      p_emisor_lugar_expedicion := '37000', p_metodo_pago_sat := 'PUE', p_forma_pago_sat := '01',
      p_pac_proveedor := 'FACTURAPI'::cfdi_proveedor_pac);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%saldo de crédito: se factura al liquidarse%' THEN RAISE EXCEPTION '16: falló por otra razón: %', SQLERRM; END IF;
    v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION '16: una venta con saldo de crédito admitió factura'; END IF;
  IF ticket_autofacturable(v_ca) THEN RAISE EXCEPTION '16: con saldo era autofacturable'; END IF;
  IF EXISTS (SELECT 1 FROM tickets t, tickets_de_periodo_global(v_t, t.dia_contable, t.dia_contable) g
              WHERE t.id = v_ca AND g.ticket_id = v_ca) THEN
    RAISE EXCEPTION '16: con saldo entró en la global'; END IF;
  PERFORM registrar_abono(v_carla, 500, 'EFECTIVO'::metodo_pago, v_caja, v_turno, 'smoke-cr9-ab-a');
  IF ticket_con_credito_pendiente(v_ca) THEN RAISE EXCEPTION '16: liquidada sigue con saldo'; END IF;
  IF NOT ticket_autofacturable(v_ca) THEN RAISE EXCEPTION '16: liquidada no es autofacturable'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tickets t, tickets_de_periodo_global(v_t, t.dia_contable, t.dia_contable) g
                  WHERE t.id = v_ca AND g.ticket_id = v_ca) THEN
    RAISE EXCEPTION '16: liquidada no entró en la global'; END IF;
  v_cfdi := cfdi_crear_borrador(
    p_ticket_id := v_ca, p_tipo_comprobante := 'INGRESO'::cfdi_tipo_comprobante,
    p_receptor_rfc := 'XAXX010101000', p_receptor_razon_social := 'PUBLICO EN GENERAL',
    p_receptor_uso_cfdi := 'S01', p_receptor_codigo_postal := '37000', p_receptor_regimen_fiscal := '616',
    p_receptor_email := 'cliente@demo.mx', p_emisor_rfc := 'XAXX010101000',
    p_emisor_razon_social := 'VIM MARKETING SA DE CV', p_emisor_regimen_fiscal := '601',
    p_emisor_lugar_expedicion := '37000', p_metodo_pago_sat := 'PUE', p_forma_pago_sat := '01',
    p_pac_proveedor := 'FACTURAPI'::cfdi_proveedor_pac);

  -- 17) $500 a crédito, $200 abonados, cancelar con dinero en modo EFECTIVO: deuda 0, salen $200
  --     del cajón del turno que cancela y no queda saldo a favor.
  UPDATE configuracion_tenant SET credito_abonos_al_cancelar = 'EFECTIVO' WHERE tenant_id = v_t;
  v_cb := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_carla, NULL, 'smoke-cr9-b', v_maria);
  PERFORM agregar_item_a_ticket(v_cb, v_prod, 1, NULL, '[]'::jsonb, 'smoke-cr9-ba');
  PERFORM pagar_a_credito(v_cb, NULL, 'smoke-cr9-pb');
  PERFORM registrar_abono(v_carla, 200, 'EFECTIVO'::metodo_pago, v_caja, v_turno, 'smoke-cr9-ab-b');
  v_e := calcular_efectivo_esperado(v_turno);
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'cancelar_ticket', 'venta.cancelar_pagada', 'ticket', v_cb, 'smoke 17')
  RETURNING id INTO v_auth;
  PERFORM cancelar_ticket_pagado(
    p_ticket_id := v_cb, p_caja_id := v_caja, p_turno_id := v_turno,
    p_motivo := 'CLIENTE_DESISTIO'::cancelacion_motivo, p_motivo_texto := 'smoke 17',
    p_autorizacion_pin_id := v_auth, p_usuario_solicitante_id := v_maria, p_usuario_autorizo_id := v_maria,
    p_reversar_inventario := true, p_cancelar_cfdi_sat := false, p_devolver_dinero := true,
    p_client_id_local := 'smoke-cr9-cancela-b');
  SELECT devolucion_id INTO v_dev FROM cancelaciones_ticket WHERE ticket_id = v_cb;
  IF credito_saldo_ticket(v_cb) <> 0 THEN RAISE EXCEPTION '17: deuda % (esperada 0)', credito_saldo_ticket(v_cb); END IF;
  IF (SELECT sum(monto_mxn) FROM abonos_credito WHERE ticket_id = v_cb AND tipo = 'AJUSTE_CANCELACION') IS DISTINCT FROM 300 THEN
    RAISE EXCEPTION '17: el ajuste no fue de 300'; END IF;
  IF (SELECT sum(m.monto_mxn) FROM movimientos_caja m JOIN devoluciones d ON d.id = v_dev
       WHERE m.turno_id = v_turno AND m.tipo = 'DEVOLUCION_EFECTIVO' AND m.motivo = 'Devolución folio ' || d.folio_completo)
     IS DISTINCT FROM 200 THEN
    RAISE EXCEPTION '17: no salieron $200 del cajón'; END IF;
  IF calcular_efectivo_esperado(v_turno) <> v_e - 200 THEN
    RAISE EXCEPTION '17: esperado % (esperado %)', calcular_efectivo_esperado(v_turno), v_e - 200; END IF;
  IF EXISTS (SELECT 1 FROM saldo_favor_movimientos WHERE cliente_id = v_carla) THEN
    RAISE EXCEPTION '17: en modo EFECTIVO quedó saldo a favor'; END IF;

  -- 18) Lo mismo en modo SALDO_FAVOR, con el abono en tarjeta y cancelando el cajero bajo RLS:
  --     deuda 0, nada sale del cajón y queda $200 a favor.
  UPDATE configuracion_tenant SET credito_abonos_al_cancelar = 'SALDO_FAVOR' WHERE tenant_id = v_t;
  v_cc := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_carla, NULL, 'smoke-cr9-c', v_maria);
  PERFORM agregar_item_a_ticket(v_cc, v_prod, 1, NULL, '[]'::jsonb, 'smoke-cr9-ca');
  PERFORM pagar_a_credito(v_cc, NULL, 'smoke-cr9-pc');
  PERFORM registrar_abono(v_carla, 200, 'TARJETA_DEBITO'::metodo_pago, v_caja, v_turno, 'smoke-cr9-ab-c');
  v_e := calcular_efectivo_esperado(v_turno);
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'cancelar_ticket', 'venta.cancelar_pagada', 'ticket', v_cc, 'smoke 18')
  RETURNING id INTO v_auth;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  PERFORM cancelar_ticket_pagado(
    p_ticket_id := v_cc, p_caja_id := v_caja, p_turno_id := v_turno,
    p_motivo := 'CLIENTE_DESISTIO'::cancelacion_motivo, p_motivo_texto := 'smoke 18',
    p_autorizacion_pin_id := v_auth, p_usuario_solicitante_id := v_maria, p_usuario_autorizo_id := v_maria,
    p_reversar_inventario := true, p_cancelar_cfdi_sat := false, p_devolver_dinero := true,
    p_client_id_local := 'smoke-cr9-cancela-c');
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', v_t::text)::text, true);
  SELECT devolucion_id INTO v_dev FROM cancelaciones_ticket WHERE ticket_id = v_cc;
  IF credito_saldo_ticket(v_cc) <> 0 THEN RAISE EXCEPTION '18: deuda % (esperada 0)', credito_saldo_ticket(v_cc); END IF;
  IF EXISTS (SELECT 1 FROM movimientos_caja m JOIN devoluciones d ON d.id = v_dev
              WHERE m.motivo = 'Devolución folio ' || d.folio_completo) THEN
    RAISE EXCEPTION '18: en modo SALDO_FAVOR salió dinero del cajón'; END IF;
  IF calcular_efectivo_esperado(v_turno) <> v_e THEN RAISE EXCEPTION '18: el efectivo esperado cambió'; END IF;
  IF (SELECT saldo_mxn FROM vw_saldo_favor_cliente WHERE cliente_id = v_carla) IS DISTINCT FROM 200 THEN
    RAISE EXCEPTION '18: saldo a favor % (esperado 200)', (SELECT saldo_mxn FROM vw_saldo_favor_cliente WHERE cliente_id = v_carla); END IF;

  -- 19) Pagar con saldo a favor: $300 se rechaza, $150 deja $50; solo entra por su RPC y no cambia de método.
  v_cd := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_carla, NULL, 'smoke-cr9-d', v_maria);
  PERFORM agregar_item_a_ticket(v_cd, v_prod, 1, NULL, '[]'::jsonb, 'smoke-cr9-da');
  BEGIN
    PERFORM pagar_con_saldo_favor(v_cd, 300, 'smoke-cr9-sf0');
    RAISE EXCEPTION '19: pagó $300 con $200 a favor';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'DATOS_INVALIDOS:%' THEN RAISE; END IF;
  END;
  v_ok := false;
  BEGIN
    PERFORM aplicar_pago(v_cd, 'SALDO_FAVOR'::metodo_pago, 10);
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION '19: aplicar_pago metió un SALDO_FAVOR directo'; END IF;
  v_tk := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-cr9-sin', v_maria);
  PERFORM agregar_item_a_ticket(v_tk, v_prod, 1, NULL, '[]'::jsonb, 'smoke-cr9-sina');
  BEGIN
    PERFORM pagar_con_saldo_favor(v_tk, 10, 'smoke-cr9-sf-sin');
    RAISE EXCEPTION '19: pagó con saldo a favor sin cliente';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'DATOS_INVALIDOS:%' THEN RAISE; END IF;
  END;
  -- El cajero bajo RLS: no escribe movimientos a mano, pero sí paga con la RPC.
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  v_ok := false;
  BEGIN
    INSERT INTO saldo_favor_movimientos (tenant_id, cliente_id, tipo, monto_mxn, ticket_id)
    VALUES (v_t, v_carla, 'ENTRADA_CANCELACION', 1000, v_cd);
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION '19: un cajero escribió saldo a favor a mano'; END IF;
  v_pago := pagar_con_saldo_favor(v_cd, 150, 'smoke-cr9-sf1');
  IF pagar_con_saldo_favor(v_cd, 150, 'smoke-cr9-sf1') <> v_pago THEN RAISE EXCEPTION '19: no es idempotente'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', v_t::text)::text, true);
  IF (SELECT saldo_mxn FROM vw_saldo_favor_cliente WHERE cliente_id = v_carla) IS DISTINCT FROM 50 THEN
    RAISE EXCEPTION '19: saldo a favor % (esperado 50)', (SELECT saldo_mxn FROM vw_saldo_favor_cliente WHERE cliente_id = v_carla); END IF;
  IF (SELECT (metodo_pago::text, monto_mxn) FROM pagos WHERE id = v_pago) IS DISTINCT FROM ('SALDO_FAVOR'::text, 150::numeric(12,2)) THEN
    RAISE EXCEPTION '19: el pago no es SALDO_FAVOR de 150'; END IF;
  BEGIN
    UPDATE pagos SET metodo_pago = 'EFECTIVO' WHERE id = v_pago;
    RAISE EXCEPTION '19: un pago con saldo a favor cambió de método';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'DATOS_INVALIDOS:%' THEN RAISE; END IF;
  END;
  v_e := calcular_efectivo_esperado(v_turno);
  PERFORM aplicar_pago(v_cd, 'EFECTIVO'::metodo_pago, 350, 350);
  IF (SELECT estado_fiscal FROM tickets WHERE id = v_cd) <> 'PAGADO' THEN RAISE EXCEPTION '19: no quedó PAGADO'; END IF;
  IF calcular_efectivo_esperado(v_turno) <> v_e + 350 THEN RAISE EXCEPTION '19: el saldo a favor contó como efectivo'; END IF;

  -- 20) Corte: SALDO_FAVOR no se declara (sale informativo) y un abono con tarjeta no da diferencia.
  v_x := reporte_x(v_turno);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_x->'pagos_por_metodo') e WHERE e->>'metodo_pago' = 'SALDO_FAVOR') THEN
    RAISE EXCEPTION '20: reporte_x pide declarar el saldo a favor'; END IF;
  IF (v_x->>'pagado_con_saldo_favor_mxn')::numeric IS DISTINCT FROM 150 THEN
    RAISE EXCEPTION '20: pagado_con_saldo_favor_mxn % (esperado 150)', v_x->>'pagado_con_saldo_favor_mxn'; END IF;
  SELECT (e->>'monto_total_mxn')::numeric INTO v_td FROM jsonb_array_elements(v_x->'pagos_por_metodo') e
   WHERE e->>'metodo_pago' = 'TARJETA_DEBITO';
  j := arquear_caja(v_turno, jsonb_build_array(jsonb_build_object('metodo_pago', 'TARJETA_DEBITO', 'monto_declarado_mxn', v_td)),
                    'smoke 20', v_maria);
  IF (j->>'diferencia_total_mxn')::numeric <> 0 THEN
    RAISE EXCEPTION '20: declarar la tarjeta del reporte X da diferencia: %', j; END IF;

  -- 22) Saldo a favor: no pasa de lo que falta por cobrar. Al cancelar, lo pagado con saldo a favor
  --     vuelve a saldo a favor en los dos modos y solo el resto sale del cajón.
  v_cf := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_carla, NULL, 'smoke-cr9-f', v_maria);
  PERFORM agregar_item_a_ticket(v_cf, v_prod, 1, NULL, '[]'::jsonb, 'smoke-cr9-fa');
  PERFORM aplicar_pago(v_cf, 'EFECTIVO'::metodo_pago, 480, 480);
  BEGIN
    PERFORM pagar_con_saldo_favor(v_cf, 30, 'smoke-cr9-sf2x');
    RAISE EXCEPTION '22: el saldo a favor pagó más de lo que faltaba';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'DATOS_INVALIDOS:%falta por cobrar%' THEN RAISE; END IF;
  END;
  PERFORM pagar_con_saldo_favor(v_cf, 20, 'smoke-cr9-sf2');
  IF (SELECT estado_fiscal FROM tickets WHERE id = v_cf) <> 'PAGADO' THEN RAISE EXCEPTION '22: no quedó PAGADO'; END IF;
  IF (SELECT saldo_mxn FROM vw_saldo_favor_cliente WHERE cliente_id = v_carla) <> 30 THEN RAISE EXCEPTION '22: saldo a favor no quedó en 30'; END IF;
  -- Modo SALDO_FAVOR: cancelar la de 150 a favor + 350 en efectivo.
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'cancelar_ticket', 'venta.cancelar_pagada', 'ticket', v_cd, 'smoke 22a')
  RETURNING id INTO v_auth;
  PERFORM cancelar_ticket_pagado(
    p_ticket_id := v_cd, p_caja_id := v_caja, p_turno_id := v_turno,
    p_motivo := 'CLIENTE_DESISTIO'::cancelacion_motivo, p_motivo_texto := 'smoke 22a',
    p_autorizacion_pin_id := v_auth, p_usuario_solicitante_id := v_maria, p_usuario_autorizo_id := v_maria,
    p_reversar_inventario := true, p_cancelar_cfdi_sat := false, p_devolver_dinero := true,
    p_client_id_local := 'smoke-cr9-cancela-d');
  SELECT devolucion_id INTO v_dev FROM cancelaciones_ticket WHERE ticket_id = v_cd;
  IF (SELECT sum(m.monto_mxn) FROM movimientos_caja m JOIN devoluciones d ON d.id = v_dev
       WHERE m.tipo = 'DEVOLUCION_EFECTIVO' AND m.motivo = 'Devolución folio ' || d.folio_completo) IS DISTINCT FROM 350 THEN
    RAISE EXCEPTION '22: modo SALDO_FAVOR: del cajón debían salir 350'; END IF;
  IF (SELECT saldo_mxn FROM vw_saldo_favor_cliente WHERE cliente_id = v_carla) <> 180 THEN
    RAISE EXCEPTION '22: modo SALDO_FAVOR: saldo a favor % (esperado 180)', (SELECT saldo_mxn FROM vw_saldo_favor_cliente WHERE cliente_id = v_carla); END IF;
  -- Modo EFECTIVO: cancelar la de 480 en efectivo + 20 a favor.
  UPDATE configuracion_tenant SET credito_abonos_al_cancelar = 'EFECTIVO' WHERE tenant_id = v_t;
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'cancelar_ticket', 'venta.cancelar_pagada', 'ticket', v_cf, 'smoke 22b')
  RETURNING id INTO v_auth;
  PERFORM cancelar_ticket_pagado(
    p_ticket_id := v_cf, p_caja_id := v_caja, p_turno_id := v_turno,
    p_motivo := 'CLIENTE_DESISTIO'::cancelacion_motivo, p_motivo_texto := 'smoke 22b',
    p_autorizacion_pin_id := v_auth, p_usuario_solicitante_id := v_maria, p_usuario_autorizo_id := v_maria,
    p_reversar_inventario := true, p_cancelar_cfdi_sat := false, p_devolver_dinero := true,
    p_client_id_local := 'smoke-cr9-cancela-f');
  SELECT devolucion_id INTO v_dev FROM cancelaciones_ticket WHERE ticket_id = v_cf;
  IF (SELECT sum(m.monto_mxn) FROM movimientos_caja m JOIN devoluciones d ON d.id = v_dev
       WHERE m.tipo = 'DEVOLUCION_EFECTIVO' AND m.motivo = 'Devolución folio ' || d.folio_completo) IS DISTINCT FROM 480 THEN
    RAISE EXCEPTION '22: modo EFECTIVO: del cajón debían salir 480'; END IF;
  IF (SELECT saldo_mxn FROM vw_saldo_favor_cliente WHERE cliente_id = v_carla) <> 200 THEN
    RAISE EXCEPTION '22: modo EFECTIVO: saldo a favor % (esperado 200)', (SELECT saldo_mxn FROM vw_saldo_favor_cliente WHERE cliente_id = v_carla); END IF;

  -- 23) Cancelar una venta a crédito con propina borra la deuda entera: 500 + 50 de propina con
  --     $30 abonados deben 520, y lo devuelto son los $500 de producto. No sale dinero: lo abonado
  --     no llega a la propina, que se queda como en una venta de contado.
  v_cg := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_carla, NULL, 'smoke-cr9-g', v_maria);
  PERFORM agregar_item_a_ticket(v_cg, v_prod, 1, NULL, '[]'::jsonb, 'smoke-cr9-ga');
  PERFORM establecer_propina_ticket(v_cg, 50);
  PERFORM pagar_a_credito(v_cg, NULL, 'smoke-cr9-pg');
  IF credito_saldo_ticket(v_cg) <> 550 THEN RAISE EXCEPTION '23: la deuda con propina es %', credito_saldo_ticket(v_cg); END IF;
  PERFORM registrar_abono(v_carla, 30, 'EFECTIVO'::metodo_pago, v_caja, v_turno, 'smoke-cr9-ab-g');
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'cancelar_ticket', 'venta.cancelar_pagada', 'ticket', v_cg, 'smoke 23')
  RETURNING id INTO v_auth;
  PERFORM cancelar_ticket_pagado(
    p_ticket_id := v_cg, p_caja_id := v_caja, p_turno_id := v_turno,
    p_motivo := 'CLIENTE_DESISTIO'::cancelacion_motivo, p_motivo_texto := 'smoke 23',
    p_autorizacion_pin_id := v_auth, p_usuario_solicitante_id := v_maria, p_usuario_autorizo_id := v_maria,
    p_reversar_inventario := true, p_cancelar_cfdi_sat := false, p_devolver_dinero := true,
    p_client_id_local := 'smoke-cr9-cancela-g');
  IF credito_saldo_ticket(v_cg) <> 0 THEN RAISE EXCEPTION '23: quedó deuda de % tras cancelar', credito_saldo_ticket(v_cg); END IF;
  SELECT devolucion_id INTO v_dev FROM cancelaciones_ticket WHERE ticket_id = v_cg;
  IF EXISTS (SELECT 1 FROM movimientos_caja m JOIN devoluciones d ON d.id = v_dev
              WHERE m.motivo = 'Devolución folio ' || d.folio_completo) THEN
    RAISE EXCEPTION '23: salió dinero del cajón'; END IF;

  -- 24) Nadie llama a _credito_devolucion directo: una venta a crédito sin abonos, cancelada en modo
  --     SALDO_FAVOR, no deja saldo a favor; el cajero no puede volver a llamarla, y repetirla no hace nada.
  UPDATE configuracion_tenant SET credito_abonos_al_cancelar = 'SALDO_FAVOR' WHERE tenant_id = v_t;
  v_ch := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_carla, NULL, 'smoke-cr9-h', v_maria);
  PERFORM agregar_item_a_ticket(v_ch, v_prod, 1, NULL, '[]'::jsonb, 'smoke-cr9-ha');
  PERFORM pagar_a_credito(v_ch, NULL, 'smoke-cr9-ph');
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'cancelar_ticket', 'venta.cancelar_pagada', 'ticket', v_ch, 'smoke 24')
  RETURNING id INTO v_auth;
  PERFORM cancelar_ticket_pagado(
    p_ticket_id := v_ch, p_caja_id := v_caja, p_turno_id := v_turno,
    p_motivo := 'CLIENTE_DESISTIO'::cancelacion_motivo, p_motivo_texto := 'smoke 24',
    p_autorizacion_pin_id := v_auth, p_usuario_solicitante_id := v_maria, p_usuario_autorizo_id := v_maria,
    p_reversar_inventario := true, p_cancelar_cfdi_sat := false, p_devolver_dinero := true,
    p_client_id_local := 'smoke-cr9-cancela-h');
  SELECT devolucion_id INTO v_dev FROM cancelaciones_ticket WHERE ticket_id = v_ch;
  IF credito_saldo_ticket(v_ch) <> 0 OR (SELECT saldo_mxn FROM vw_saldo_favor_cliente WHERE cliente_id = v_carla) <> 200 THEN
    RAISE EXCEPTION '24: la cancelación sin abonos dejó deuda o saldo a favor'; END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  v_ok := false;
  BEGIN
    PERFORM _credito_devolucion(v_dev);
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', v_t::text)::text, true);
  IF NOT v_ok THEN RAISE EXCEPTION '24: el cajero llamó a _credito_devolucion'; END IF;
  IF _credito_devolucion(v_dev) <> 0 OR (SELECT saldo_mxn FROM vw_saldo_favor_cliente WHERE cliente_id = v_carla) <> 200 THEN
    RAISE EXCEPTION '24: repetir _credito_devolucion movió el saldo a favor'; END IF;

  -- 21) Regresión: una venta sin crédito cancelada con dinero saca del cajón su total, como antes,
  --     aunque el negocio esté en modo SALDO_FAVOR.
  v_ce := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_beto, NULL, 'smoke-cr9-e', v_maria);
  PERFORM agregar_item_a_ticket(v_ce, v_prod, 1, NULL, '[]'::jsonb, 'smoke-cr9-ea');
  PERFORM aplicar_pago(v_ce, 'EFECTIVO'::metodo_pago, 500, 500);
  v_e := calcular_efectivo_esperado(v_turno);
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_maria, 'cancelar_ticket', 'venta.cancelar_pagada', 'ticket', v_ce, 'smoke 21')
  RETURNING id INTO v_auth;
  PERFORM cancelar_ticket_pagado(
    p_ticket_id := v_ce, p_caja_id := v_caja, p_turno_id := v_turno,
    p_motivo := 'CLIENTE_DESISTIO'::cancelacion_motivo, p_motivo_texto := 'smoke 21',
    p_autorizacion_pin_id := v_auth, p_usuario_solicitante_id := v_maria, p_usuario_autorizo_id := v_maria,
    p_reversar_inventario := true, p_cancelar_cfdi_sat := false, p_devolver_dinero := true,
    p_client_id_local := 'smoke-cr9-cancela-e');
  SELECT devolucion_id INTO v_dev FROM cancelaciones_ticket WHERE ticket_id = v_ce;
  IF (SELECT count(*) || ':' || sum(m.monto_mxn) FROM movimientos_caja m JOIN devoluciones d ON d.id = v_dev
       WHERE m.turno_id = v_turno AND m.tipo = 'DEVOLUCION_EFECTIVO' AND m.motivo = 'Devolución folio ' || d.folio_completo)
     IS DISTINCT FROM '1:500.00' THEN
    RAISE EXCEPTION '21: la cancelación sin crédito no sacó un movimiento de $500'; END IF;
  IF calcular_efectivo_esperado(v_turno) <> v_e - 500 THEN RAISE EXCEPTION '21: el esperado no bajó 500'; END IF;
  IF EXISTS (SELECT 1 FROM abonos_credito WHERE ticket_id = v_ce) OR EXISTS (SELECT 1 FROM saldo_favor_movimientos WHERE ticket_id = v_ce) THEN
    RAISE EXCEPTION '21: la venta sin crédito tocó crédito o saldo a favor'; END IF;
  RAISE NOTICE 'SMOKE CREDITO 0209 OK';
END $$;
ROLLBACK;
