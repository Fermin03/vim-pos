-- Smoke crédito (retail 2, entrega 2; 0207–0208). Hace ROLLBACK.
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
  v_turno1 uuid; v_turno2 uuid; v_t1 uuid; v_t2 uuid; v_t3 uuid; v_t4 uuid; v_tb uuid; v_auth uuid;
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
ROLLBACK;
