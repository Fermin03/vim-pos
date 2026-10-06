-- Smoke lealtad · canje (0156 §6). La nube autoriza, el mismo id no descuenta dos veces, sin saldo
-- no hay canje, asentar baja el total y solo asienta lo que ata el canje a su renglón (producto,
-- cantidad, cliente, monto), quitar devuelve los puntos una sola vez, cancelar la cuenta los devuelve
-- sin mover sus totales, y cancelar o borrar el renglón premiado también, pero solo en una cuenta
-- abierta. Un premio nunca se pega al cargo de envío. Hace ROLLBACK.
-- Ejecutar: cd desktop && node scripts/smokes.mjs smoke_lealtad_canje.sql
\set ON_ERROR_STOP on
BEGIN;

-- Asentar tiene que fallar con ESE código (y no con otro): un rechazo por la razón equivocada
-- no prueba la regla.
CREATE FUNCTION pg_temp.asentar_falla(p jsonb, p_esperado text) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_ok boolean := false;
BEGIN
  BEGIN
    PERFORM lealtad_asentar_canje(p);
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> p_esperado THEN RAISE EXCEPTION 'esperaba %, salió: %', p_esperado, SQLERRM; END IF;
  END;
  IF v_ok THEN RAISE EXCEPTION 'debió fallar con %, pero asentó', p_esperado; END IF;
END $f$;

-- Un fallo forzado al escribir la reversa de un canje (para probar que devolver el canje y devolver
-- lo ganado no comparten suerte).
CREATE FUNCTION pg_temp.sabotaje_reversa_canje() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  IF NEW.tipo = 'REVERSA_CANJE' THEN RAISE EXCEPTION 'sabotaje de smoke'; END IF;
  RETURN NEW;
END $f$;

DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno  uuid; v_prod uuid; v_papas uuid; v_cli uuid; v_cli2 uuid; v_t uuid; v_item uuid; v_premio uuid;
  v_c1 uuid := gen_random_uuid(); v_c2 uuid := gen_random_uuid(); v_c3 uuid := gen_random_uuid();
  j jsonb; jb jsonb; v_base jsonb; v_ver integer;
  r tickets%ROWTYPE;
  v_s0 integer; v_s1 integer; v_n integer; v_nmov integer; v_ok boolean; v_tot numeric;
  v_ta uuid; v_tb uuid; v_tc uuid; v_td uuid; v_tm uuid; v_tn uuid; v_ts uuid; v_tp uuid; v_tq uuid; v_tr uuid; v_tg uuid;
  v_ia uuid; v_ib uuid; v_ic uuid; v_im uuid; v_cx uuid; v_zona uuid; v_envio uuid; v_ca uuid; v_cb uuid;
  v_l1 uuid; v_l2 uuid; v_l3 uuid; v_l4 uuid; v_l5 uuid;
BEGIN
  -- aplicar_pago y compañía leen al empleado y el tenant del JWT.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);

  -- La semilla no trae fila de configuracion_tenant para este negocio: se crea ya encendida (el
  -- add-on y el programa, antes: un trigger exige ese orden).
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
  SELECT v_tenant, id, (now() AT TIME ZONE 'America/Mexico_City')::date, true, 100 FROM addons WHERE codigo = 'LEALTAD';
  INSERT INTO lealtad_programa (tenant_id, mecanica, porcentaje, tope_compras_dia) VALUES (v_tenant, 'PUNTOS_DINERO', 10, 50) RETURNING version INTO v_ver;
  INSERT INTO configuracion_tenant (tenant_id, modulo_lealtad_activo) VALUES (v_tenant, true)
  ON CONFLICT (tenant_id) DO UPDATE SET modulo_lealtad_activo = true;
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_tenant, 'Ana Canje', '4770001563') RETURNING id INTO v_cli;
  PERFORM lealtad_registrar_movimiento(NULL, v_tenant, v_cli, 'AJUSTE', 100, v_ver, p_motivo => 'saldo de prueba');

  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-LCAN', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;
  SELECT id INTO v_prod  FROM productos WHERE tenant_id = v_tenant AND nombre = 'Hamburguesa Clásica' LIMIT 1;
  SELECT id INTO v_papas FROM productos WHERE tenant_id = v_tenant AND nombre = 'Papas Gajo' LIMIT 1;
  v_t := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-lcan-1', v_maria);
  v_item := agregar_item_a_ticket(v_t, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcan-i1');

  -- 1) Saldo: por id y por teléfono con formato.
  j := lealtad_saldo(v_tenant, v_cli, NULL);
  IF (j->>'saldo')::int <> 100 THEN RAISE EXCEPTION 'saldo por id: %', j; END IF;
  j := lealtad_saldo(v_tenant, gen_random_uuid(), '(477) 000-1563');
  IF (j->>'cliente_id')::uuid <> v_cli THEN RAISE EXCEPTION 'no resolvió por teléfono: %', j; END IF;

  -- Los índices que sostienen la búsqueda del canje por renglón y por cuenta (cada venta la hace).
  IF (SELECT count(*) FROM pg_indexes WHERE tablename = 'ticket_canjes_lealtad' AND indexname IN ('idx_ticket_canjes_item', 'idx_ticket_canjes_ticket')) <> 2 THEN
    RAISE EXCEPTION 'faltan los índices de ticket_canjes_lealtad';
  END IF;

  -- 2) Canjear 40.
  j := lealtad_canjear(v_c1, v_tenant, v_cli, NULL, 40, NULL, v_t, v_suc, v_caja, v_maria);
  IF NOT (j->>'ok')::boolean OR (j->>'saldo')::int <> 60 OR (j->>'monto_mxn')::numeric <> 40 THEN RAISE EXCEPTION 'canje: %', j; END IF;

  -- 3) El mismo id no descuenta dos veces.
  j := lealtad_canjear(v_c1, v_tenant, v_cli, NULL, 40, NULL, v_t, v_suc, v_caja, v_maria);
  IF NOT (j->>'ok')::boolean OR NOT (j->>'repetido')::boolean THEN RAISE EXCEPTION 'reintento: %', j; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli) <> 60 THEN RAISE EXCEPTION 'el reintento descontó de nuevo'; END IF;

  -- 4) Sin saldo suficiente no hay canje ni movimiento.
  j := lealtad_canjear(v_c2, v_tenant, v_cli, NULL, 61, NULL, v_t, v_suc, v_caja, v_maria);
  IF (j->>'ok')::boolean OR j->>'error' <> 'SALDO_INSUFICIENTE' THEN RAISE EXCEPTION 'debió rechazar: %', j; END IF;
  IF EXISTS (SELECT 1 FROM lealtad_movimientos WHERE id = v_c2) THEN RAISE EXCEPTION 'un canje rechazado dejó movimiento'; END IF;

  -- 5) Asentar con los datos que devolvió la nube baja el total.
  j := lealtad_canje_datos(v_c1, v_tenant);
  PERFORM lealtad_asentar_canje(j || jsonb_build_object('tenant_id', v_tenant, 'ticket_id', v_t, 'sucursal_id', v_suc, 'caja_id', v_caja, 'usuario_id', v_maria));
  IF (SELECT total_mxn FROM tickets WHERE id = v_t) <> 80 THEN RAISE EXCEPTION 'asentar no bajó el total'; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli) <> 60 THEN RAISE EXCEPTION 'asentar movió el saldo otra vez'; END IF;

  -- 6) Quitar el canje devuelve los 40, una sola vez.
  IF lealtad_revertir_canje_ticket(v_t, 'el cliente cambió de idea') <> 1 THEN RAISE EXCEPTION 'no revirtió'; END IF;
  IF lealtad_revertir_canje_ticket(v_t, 'otra vez') <> 0 THEN RAISE EXCEPTION 'revirtió dos veces'; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli) <> 100 THEN RAISE EXCEPTION 'no devolvió los puntos'; END IF;
  IF (SELECT total_mxn FROM tickets WHERE id = v_t) <> 120 THEN RAISE EXCEPTION 'no devolvió el total'; END IF;
  IF lealtad_revertir_canje(v_c1, v_tenant, 'red de seguridad') THEN RAISE EXCEPTION 'la nube lo revirtió por segunda vez'; END IF;
  IF (lealtad_canje_datos(v_c1, v_tenant))->>'error' <> 'CANJE_REVERTIDO' THEN RAISE EXCEPTION 'un canje revertido sigue siendo asentable'; END IF;

  -- 7) Cancelar la cuenta con un canje vivo lo revierte, y la cuenta cancelada conserva los
  --    totales con los que se vendió (el canje revertido no sube su total).
  j := lealtad_canjear(v_c3, v_tenant, v_cli, NULL, 30, NULL, v_t, v_suc, v_caja, v_maria);
  PERFORM lealtad_asentar_canje(j || jsonb_build_object('tenant_id', v_tenant, 'ticket_id', v_t));
  SELECT * INTO r FROM tickets WHERE id = v_t;
  IF r.total_mxn <> 90 OR r.lealtad_mxn <> 30 THEN RAISE EXCEPTION 'antes de cancelar: total % lealtad % (esperado 90 y 30)', r.total_mxn, r.lealtad_mxn; END IF;
  UPDATE tickets SET estado_fiscal = 'CANCELADO' WHERE id = v_t;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli) <> 100 THEN RAISE EXCEPTION 'cancelar no devolvió el canje'; END IF;
  IF NOT (SELECT revertido FROM ticket_canjes_lealtad WHERE id = v_c3) THEN RAISE EXCEPTION 'cancelar no marcó el canje revertido'; END IF;
  SELECT * INTO r FROM tickets WHERE id = v_t;
  IF r.total_mxn <> 90 THEN RAISE EXCEPTION 'cancelar movió el total de la cuenta cerrada: % (esperado 90)', r.total_mxn; END IF;
  IF r.lealtad_mxn <> 30 THEN RAISE EXCEPTION 'cancelar movió lealtad_mxn de la cuenta cerrada: % (esperado 30)', r.lealtad_mxn; END IF;

  -- 8) Asentar un canje de dinero: solo el que autorizó la nube, tal cual. Cuenta M (120).
  v_tm := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-lcan-m', v_maria);
  v_im := agregar_item_a_ticket(v_tm, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcan-m1');
  v_ca := gen_random_uuid();
  j := lealtad_canjear(v_ca, v_tenant, v_cli, NULL, 30, NULL, v_tm, v_suc, v_caja, v_maria);
  v_base := j || jsonb_build_object('tenant_id', v_tenant, 'ticket_id', v_tm);
  PERFORM pg_temp.asentar_falla(v_base || jsonb_build_object('ticket_item_id', v_im), 'RENGLON_NO_APLICA');
  PERFORM pg_temp.asentar_falla(v_base || jsonb_build_object('monto_mxn', 99), 'MONTO_INVALIDO');
  PERFORM pg_temp.asentar_falla(v_base || jsonb_build_object('monto_mxn', NULL), 'MONTO_INVALIDO');
  PERFORM pg_temp.asentar_falla(v_base || jsonb_build_object('puntos', 31, 'monto_mxn', 31), 'CANJE_NO_COINCIDE');
  PERFORM pg_temp.asentar_falla(v_base || jsonb_build_object('ticket_id', v_t), 'TICKET_NO_ABIERTO');
  IF EXISTS (SELECT 1 FROM ticket_canjes_lealtad WHERE id = v_ca) THEN RAISE EXCEPTION 'un rechazo dejó el canje pegado'; END IF;
  -- Bien asentado, y asentarlo otra vez es un reintento: no duplica nada.
  IF lealtad_asentar_canje(v_base) <> v_ca THEN RAISE EXCEPTION 'asentar no devolvió el id del canje'; END IF;
  IF (SELECT total_mxn FROM tickets WHERE id = v_tm) <> 90 THEN RAISE EXCEPTION 'M tras asentar: total % (esperado 90)', (SELECT total_mxn FROM tickets WHERE id = v_tm); END IF;
  SELECT saldo INTO v_s0 FROM lealtad_saldos WHERE cliente_id = v_cli;   -- 70
  IF lealtad_asentar_canje(v_base) <> v_ca THEN RAISE EXCEPTION 'el reintento no devolvió el id del canje'; END IF;
  IF (SELECT count(*) FROM ticket_canjes_lealtad WHERE ticket_id = v_tm) <> 1 THEN RAISE EXCEPTION 'asentar dos veces duplicó el canje'; END IF;
  IF (SELECT total_mxn FROM tickets WHERE id = v_tm) <> 90 THEN RAISE EXCEPTION 'asentar dos veces movió el total'; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli) <> v_s0 THEN RAISE EXCEPTION 'asentar dos veces movió el saldo'; END IF;
  -- Ese mismo canje no cabe en otra cuenta.
  v_tn := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-lcan-n', v_maria);
  PERFORM agregar_item_a_ticket(v_tn, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcan-n1');
  PERFORM pg_temp.asentar_falla(v_base || jsonb_build_object('ticket_id', v_tn), 'CANJE_YA_ASENTADO');
  -- Otro canje en la misma cuenta, tampoco: solo cabe uno vivo.
  v_cb := gen_random_uuid();
  jb := lealtad_canjear(v_cb, v_tenant, v_cli, NULL, 10, NULL, v_tm, v_suc, v_caja, v_maria);
  PERFORM pg_temp.asentar_falla(jb || jsonb_build_object('tenant_id', v_tenant, 'ticket_id', v_tm), 'TICKET_YA_TIENE_CANJE');
  -- Un canje ya revertido no se asienta.
  IF lealtad_revertir_canje_ticket(v_tm, 'smoke') <> 1 THEN RAISE EXCEPTION 'M: no revirtió'; END IF;
  PERFORM pg_temp.asentar_falla(v_base, 'CANJE_REVERTIDO');
  -- El cliente que manda la nube puede no existir en esta base (una caja que lo conoce con otro id
  -- hasta su siguiente pull): el canje se queda con el cliente de la propia cuenta.
  SELECT saldo INTO v_s0 FROM lealtad_saldos WHERE cliente_id = v_cli;
  PERFORM lealtad_asentar_canje(jb || jsonb_build_object('tenant_id', v_tenant, 'ticket_id', v_tm, 'cliente_id', gen_random_uuid()));
  IF (SELECT cliente_id FROM ticket_canjes_lealtad WHERE id = v_cb) <> v_cli THEN RAISE EXCEPTION 'con cliente desconocido no usó el de la cuenta'; END IF;
  IF (SELECT total_mxn FROM tickets WHERE id = v_tm) <> 110 THEN RAISE EXCEPTION 'M con el canje de 10: total % (esperado 110)', (SELECT total_mxn FROM tickets WHERE id = v_tm); END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli) <> v_s0 THEN RAISE EXCEPTION 'asentar movió el saldo'; END IF;
  -- Sin cliente conocido y sin cliente en la cuenta no hay a quién cargárselo.
  v_ts := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-lcan-s', v_maria);
  PERFORM agregar_item_a_ticket(v_ts, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcan-s1');
  v_cx := gen_random_uuid();
  jb := lealtad_canjear(v_cx, v_tenant, v_cli, NULL, 5, NULL, NULL, v_suc, v_caja, v_maria);
  PERFORM pg_temp.asentar_falla(jb || jsonb_build_object('tenant_id', v_tenant, 'ticket_id', v_ts, 'cliente_id', gen_random_uuid()), 'TICKET_SIN_CLIENTE');

  -- 9) Cancelar o borrar un renglón SIN premio no escribe nada en el libro, y un canje de cuenta
  --    (sin renglón) no se toca. Cuenta C: tres renglones; canje de $30 sobre la cuenta.
  v_tc := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-lcan-c', v_maria);
  v_ia := agregar_item_a_ticket(v_tc, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcan-c1');
  v_ib := agregar_item_a_ticket(v_tc, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcan-c2');
  v_ic := agregar_item_a_ticket(v_tc, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcan-c3');
  j := lealtad_canjear(gen_random_uuid(), v_tenant, v_cli, NULL, 30, NULL, v_tc, v_suc, v_caja, v_maria);
  PERFORM lealtad_asentar_canje(j || jsonb_build_object('tenant_id', v_tenant, 'ticket_id', v_tc));
  SELECT count(*) INTO v_nmov FROM lealtad_movimientos WHERE tenant_id = v_tenant;
  SELECT saldo INTO v_s0 FROM lealtad_saldos WHERE cliente_id = v_cli;
  UPDATE ticket_items SET cancelado = true, cancelado_at = now(), motivo_cancelacion = 'Smoke lealtad' WHERE id = v_ia;
  DELETE FROM ticket_items WHERE id = v_ib;
  IF (SELECT count(*) FROM lealtad_movimientos WHERE tenant_id = v_tenant) <> v_nmov THEN
    RAISE EXCEPTION 'cancelar o borrar un renglón sin premio escribió en el libro';
  END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli) <> v_s0 THEN RAISE EXCEPTION 'C: el saldo se movió'; END IF;
  IF (SELECT count(*) FROM ticket_canjes_lealtad WHERE ticket_id = v_tc AND NOT revertido) <> 1 THEN
    RAISE EXCEPTION 'C: el canje de la cuenta se tocó al cancelar o borrar un renglón ajeno';
  END IF;
  SELECT * INTO r FROM tickets WHERE id = v_tc;
  IF r.total_mxn <> 90 OR r.lealtad_mxn <> 30 THEN RAISE EXCEPTION 'C: total % lealtad % (esperado 90 y 30)', r.total_mxn, r.lealtad_mxn; END IF;

  -- 10) Premios. El programa cambia a sellos como lo haría un cambio de mecánica de verdad (la versión
  --     sube) y el cliente de aquí en adelante, Beto, tiene su saldo en la versión nueva.
  UPDATE lealtad_programa SET mecanica = 'SELLOS', version = version + 1 WHERE tenant_id = v_tenant RETURNING version INTO v_ver;
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_tenant, 'Beto Canje', '4770001564') RETURNING id INTO v_cli2;
  PERFORM lealtad_registrar_movimiento(NULL, v_tenant, v_cli2, 'AJUSTE', 100, v_ver, p_motivo => 'saldo de prueba');
  INSERT INTO lealtad_premios (tenant_id, producto_id, costo) VALUES (v_tenant, v_prod, 6) RETURNING id INTO v_premio;
  j := lealtad_canjear(gen_random_uuid(), v_tenant, v_cli2, NULL, NULL, v_premio, NULL, v_suc, v_caja, v_maria);
  IF NOT (j->>'ok')::boolean OR (j->>'puntos')::int <> 6 OR (j->>'producto_id')::uuid <> v_prod THEN RAISE EXCEPTION 'premio: %', j; END IF;
  j := lealtad_canjear(gen_random_uuid(), v_tenant, v_cli2, NULL, 10, NULL, NULL, v_suc, v_caja, v_maria);
  IF j->>'error' <> 'PREMIO_INVALIDO' THEN RAISE EXCEPTION 'sellos sin premio debió rechazar: %', j; END IF;

  -- 11) Cancelar el renglón premiado devuelve los puntos y la cuenta vale lo que queda.
  --     Cuenta A: dos hamburguesas (240); el premio cae sobre la segunda.
  SELECT saldo INTO v_s0 FROM lealtad_saldos WHERE cliente_id = v_cli2;
  v_ta := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli2, NULL, 'smoke-lcan-a', v_maria);
  v_ia := agregar_item_a_ticket(v_ta, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcan-a1');
  v_ib := agregar_item_a_ticket(v_ta, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcan-a2');
  v_cx := gen_random_uuid();
  j := lealtad_canjear(v_cx, v_tenant, v_cli2, NULL, NULL, v_premio, v_ta, v_suc, v_caja, v_maria);
  IF NOT (j->>'ok')::boolean THEN RAISE EXCEPTION 'canje de premio A: %', j; END IF;
  PERFORM lealtad_asentar_canje(j || jsonb_build_object('tenant_id', v_tenant, 'ticket_id', v_ta, 'ticket_item_id', v_ib));
  SELECT * INTO r FROM tickets WHERE id = v_ta;
  IF r.total_mxn <> 120 OR r.lealtad_mxn <> 120 THEN RAISE EXCEPTION 'A con premio: total % lealtad % (esperado 120 y 120)', r.total_mxn, r.lealtad_mxn; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli2) <> v_s0 - 6 THEN RAISE EXCEPTION 'A: el premio no descontó 6'; END IF;

  UPDATE ticket_items SET cancelado = true, cancelado_at = now(), motivo_cancelacion = 'Smoke lealtad' WHERE id = v_ib;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli2) <> v_s0 THEN
    RAISE EXCEPTION 'cancelar el renglón premiado no devolvió los puntos: saldo % (esperado %)', (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli2), v_s0;
  END IF;
  IF NOT (SELECT revertido FROM ticket_canjes_lealtad WHERE id = v_cx) THEN RAISE EXCEPTION 'A: el canje no quedó revertido'; END IF;
  SELECT count(*) INTO v_n FROM lealtad_movimientos WHERE tipo = 'REVERSA_CANJE' AND canje_movimiento_id = v_cx;
  IF v_n <> 1 THEN RAISE EXCEPTION 'A: REVERSA_CANJE debía ser 1, fueron %', v_n; END IF;
  SELECT * INTO r FROM tickets WHERE id = v_ta;
  IF r.total_mxn <> 120 OR r.lealtad_mxn <> 0 THEN RAISE EXCEPTION 'A tras cancelar: total % lealtad % (esperado 120 y 0: el renglón que queda)', r.total_mxn, r.lealtad_mxn; END IF;
  IF lealtad_revertir_canje_ticket(v_ta, 'otra vez') <> 0 THEN RAISE EXCEPTION 'A: revirtió dos veces'; END IF;

  -- 12) Borrar el renglón premiado también devuelve los puntos, una sola reversa, y no deja el
  --     canje huérfano. Cuenta B: dos hamburguesas; el premio cae sobre la segunda.
  v_tb := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli2, NULL, 'smoke-lcan-b', v_maria);
  v_ia := agregar_item_a_ticket(v_tb, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcan-b1');
  v_ib := agregar_item_a_ticket(v_tb, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcan-b2');
  v_cx := gen_random_uuid();
  j := lealtad_canjear(v_cx, v_tenant, v_cli2, NULL, NULL, v_premio, v_tb, v_suc, v_caja, v_maria);
  PERFORM lealtad_asentar_canje(j || jsonb_build_object('tenant_id', v_tenant, 'ticket_id', v_tb, 'ticket_item_id', v_ib));
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli2) <> v_s0 - 6 THEN RAISE EXCEPTION 'B: el premio no descontó 6'; END IF;

  DELETE FROM ticket_items WHERE id = v_ib;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli2) <> v_s0 THEN
    RAISE EXCEPTION 'borrar el renglón premiado no devolvió los puntos: saldo % (esperado %)', (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli2), v_s0;
  END IF;
  SELECT count(*) INTO v_n FROM lealtad_movimientos WHERE tipo = 'REVERSA_CANJE' AND canje_movimiento_id = v_cx;
  IF v_n <> 1 THEN RAISE EXCEPTION 'B: REVERSA_CANJE debía ser 1, fueron %', v_n; END IF;
  IF (SELECT programa_version FROM lealtad_movimientos WHERE tipo = 'REVERSA_CANJE' AND canje_movimiento_id = v_cx)
     <> (SELECT programa_version FROM lealtad_movimientos WHERE id = v_cx) THEN
    RAISE EXCEPTION 'B: la reversa no lleva la versión del programa del canje';
  END IF;
  IF EXISTS (SELECT 1 FROM ticket_canjes_lealtad WHERE id = v_cx) THEN RAISE EXCEPTION 'B: quedó el canje de un renglón borrado'; END IF;
  SELECT * INTO r FROM tickets WHERE id = v_tb;
  IF r.total_mxn <> 120 OR r.lealtad_mxn <> 0 THEN RAISE EXCEPTION 'B tras borrar: total % lealtad % (esperado 120 y 0)', r.total_mxn, r.lealtad_mxn; END IF;

  -- 13) Un premio se ata a SU renglón: del mismo producto, de cantidad 1, de producto (no de combo,
  --     no cancelado). Cuenta P: hamburguesa (L1), 3 hamburguesas (L2), papas (L3), una hamburguesa
  --     cancelada (L4) y una que es padre de combo (L5). El premio es de la hamburguesa.
  v_tp := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli2, NULL, 'smoke-lcan-p', v_maria);
  v_l1 := agregar_item_a_ticket(v_tp, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcan-p1');
  v_l2 := agregar_item_a_ticket(v_tp, v_prod, 3, NULL, '[]'::jsonb, 'smoke-lcan-p2');
  v_l3 := agregar_item_a_ticket(v_tp, v_papas, 1, NULL, '[]'::jsonb, 'smoke-lcan-p3');
  v_l4 := agregar_item_a_ticket(v_tp, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcan-p4');
  v_l5 := agregar_item_a_ticket(v_tp, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcan-p5');
  UPDATE ticket_items SET cancelado = true, cancelado_at = now(), motivo_cancelacion = 'Smoke lealtad' WHERE id = v_l4;
  UPDATE ticket_items SET combo_rol = 'PADRE' WHERE id = v_l5;
  SELECT total_mxn INTO v_tot FROM tickets WHERE id = v_tp;
  IF v_tot <> 655 THEN RAISE EXCEPTION 'P: total inicial % (esperado 655)', v_tot; END IF;
  SELECT saldo INTO v_s0 FROM lealtad_saldos WHERE cliente_id = v_cli2;
  v_cx := gen_random_uuid();
  j := lealtad_canjear(v_cx, v_tenant, v_cli2, NULL, NULL, v_premio, v_tp, v_suc, v_caja, v_maria);
  v_base := j || jsonb_build_object('tenant_id', v_tenant, 'ticket_id', v_tp);
  PERFORM pg_temp.asentar_falla(v_base || jsonb_build_object('ticket_item_id', v_l3), 'RENGLON_NO_ES_PREMIO');       -- otro producto
  PERFORM pg_temp.asentar_falla(v_base || jsonb_build_object('ticket_item_id', v_l2), 'RENGLON_NO_ES_PREMIO');       -- cantidad 3
  PERFORM pg_temp.asentar_falla(v_base || jsonb_build_object('ticket_item_id', v_l4), 'RENGLON_NO_ES_PREMIO');       -- cancelado
  PERFORM pg_temp.asentar_falla(v_base || jsonb_build_object('ticket_item_id', v_l5), 'RENGLON_NO_ES_PREMIO');       -- padre de combo
  PERFORM pg_temp.asentar_falla(v_base || jsonb_build_object('ticket_item_id', gen_random_uuid()), 'RENGLON_NO_EXISTE');
  PERFORM pg_temp.asentar_falla(v_base, 'PREMIO_SIN_RENGLON');
  PERFORM pg_temp.asentar_falla(v_base || jsonb_build_object('ticket_item_id', v_l1, 'premio_id', gen_random_uuid()), 'PREMIO_INVALIDO');
  IF EXISTS (SELECT 1 FROM ticket_canjes_lealtad WHERE id = v_cx) THEN RAISE EXCEPTION 'P: un rechazo dejó el canje pegado'; END IF;
  IF (SELECT total_mxn FROM tickets WHERE id = v_tp) <> 655 THEN RAISE EXCEPTION 'P: un rechazo movió el total'; END IF;
  PERFORM lealtad_asentar_canje(v_base || jsonb_build_object('ticket_item_id', v_l1));
  SELECT * INTO r FROM tickets WHERE id = v_tp;
  IF r.total_mxn <> 535 OR r.lealtad_mxn <> 120 THEN RAISE EXCEPTION 'P con premio en L1: total % lealtad % (esperado 535 y 120)', r.total_mxn, r.lealtad_mxn; END IF;
  IF (SELECT monto_descontado_mxn FROM ticket_canjes_lealtad WHERE id = v_cx) <> 120 THEN RAISE EXCEPTION 'P: el descuento no es lo que vale el renglón'; END IF;
  -- Asentarlo otra vez es un reintento: ni duplica ni cambia lo descontado.
  PERFORM lealtad_asentar_canje(v_base || jsonb_build_object('ticket_item_id', v_l1));
  IF (SELECT total_mxn FROM tickets WHERE id = v_tp) <> 535 THEN RAISE EXCEPTION 'P: el reintento movió el total'; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli2) <> v_s0 - 6 THEN RAISE EXCEPTION 'P: el saldo no es el de un solo descuento'; END IF;

  -- 14) Un premio nunca se pega al cargo de envío: no es un renglón de producto.
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn)
  VALUES (v_tenant, v_suc, 'Zona Canje', 35.00) RETURNING id INTO v_zona;
  v_td := abrir_ticket(v_suc, v_caja, v_turno, 'DELIVERY_PROPIO'::modo_servicio, v_cli2, NULL, 'smoke-lcan-d', v_maria);
  PERFORM agregar_item_a_ticket(v_td, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcan-d1');
  PERFORM fijar_envio_ticket(v_td, v_zona);
  SELECT id INTO v_envio FROM ticket_items WHERE ticket_id = v_td AND cargo_tipo = 'ENVIO' AND cancelado = false;
  IF v_envio IS NULL THEN RAISE EXCEPTION 'D: el ticket no tiene renglón de envío'; END IF;
  v_cx := gen_random_uuid();
  j := lealtad_canjear(v_cx, v_tenant, v_cli2, NULL, NULL, v_premio, v_td, v_suc, v_caja, v_maria);
  PERFORM pg_temp.asentar_falla(j || jsonb_build_object('tenant_id', v_tenant, 'ticket_id', v_td, 'ticket_item_id', v_envio), 'RENGLON_NO_ES_PREMIO');
  IF EXISTS (SELECT 1 FROM ticket_canjes_lealtad WHERE ticket_id = v_td) THEN RAISE EXCEPTION 'D: quedó un canje sobre el envío'; END IF;
  SELECT * INTO r FROM tickets WHERE id = v_td;
  IF r.total_mxn <> 155 OR r.lealtad_mxn <> 0 THEN RAISE EXCEPTION 'D: total % lealtad % (esperado 155 y 0)', r.total_mxn, r.lealtad_mxn; END IF;

  -- 15) En una cuenta YA COBRADA, cancelar o borrar el renglón premiado NO devuelve los puntos: el
  --     cliente ya se llevó el producto. El canje sigue vivo y el libro no se mueve.
  --     Cuenta Q (se cancela el renglón) y cuenta R (se borra): dos hamburguesas, premio en la segunda.
  v_tq := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli2, NULL, 'smoke-lcan-q', v_maria);
  v_ia := agregar_item_a_ticket(v_tq, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcan-q1');
  v_ib := agregar_item_a_ticket(v_tq, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcan-q2');
  v_cx := gen_random_uuid();
  j := lealtad_canjear(v_cx, v_tenant, v_cli2, NULL, NULL, v_premio, v_tq, v_suc, v_caja, v_maria);
  PERFORM lealtad_asentar_canje(j || jsonb_build_object('tenant_id', v_tenant, 'ticket_id', v_tq, 'ticket_item_id', v_ib));
  PERFORM aplicar_pago(v_tq, 'EFECTIVO'::metodo_pago, 120, 120);
  IF (SELECT estado_fiscal FROM tickets WHERE id = v_tq) <> 'PAGADO' THEN RAISE EXCEPTION 'Q no quedó pagada'; END IF;
  SELECT saldo INTO v_s1 FROM lealtad_saldos WHERE cliente_id = v_cli2;
  SELECT * INTO r FROM tickets WHERE id = v_tq;
  IF r.total_mxn <> 120 OR r.lealtad_mxn <> 120 THEN RAISE EXCEPTION 'Q cobrada: total % lealtad % (esperado 120 y 120)', r.total_mxn, r.lealtad_mxn; END IF;
  UPDATE ticket_items SET cancelado = true, cancelado_at = now(), motivo_cancelacion = 'Smoke lealtad' WHERE id = v_ib;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli2) <> v_s1 THEN RAISE EXCEPTION 'Q: cancelar el renglón de una cuenta cobrada devolvió los puntos'; END IF;
  IF (SELECT revertido FROM ticket_canjes_lealtad WHERE id = v_cx) THEN RAISE EXCEPTION 'Q: el canje de una cuenta cobrada quedó revertido'; END IF;
  IF EXISTS (SELECT 1 FROM lealtad_movimientos WHERE tipo = 'REVERSA_CANJE' AND canje_movimiento_id = v_cx) THEN
    RAISE EXCEPTION 'Q: se escribió una reversa en una cuenta cobrada';
  END IF;
  -- El total de la cuenta cobrada no se mueve. (lealtad_mxn sí cae a 0: lo recalcula el trigger de
  -- ticket_items, que ya no cuenta un renglón cancelado, y eso es anterior a la lealtad y ajeno a
  -- esta regla: la regla es que los PUNTOS no vuelven.)
  SELECT * INTO r FROM tickets WHERE id = v_tq;
  IF r.total_mxn <> 120 THEN RAISE EXCEPTION 'Q tras cancelar: total % (esperado 120)', r.total_mxn; END IF;

  v_tr := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli2, NULL, 'smoke-lcan-r', v_maria);
  v_ia := agregar_item_a_ticket(v_tr, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcan-r1');
  v_ib := agregar_item_a_ticket(v_tr, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcan-r2');
  v_cx := gen_random_uuid();
  j := lealtad_canjear(v_cx, v_tenant, v_cli2, NULL, NULL, v_premio, v_tr, v_suc, v_caja, v_maria);
  PERFORM lealtad_asentar_canje(j || jsonb_build_object('tenant_id', v_tenant, 'ticket_id', v_tr, 'ticket_item_id', v_ib));
  PERFORM aplicar_pago(v_tr, 'EFECTIVO'::metodo_pago, 120, 120);
  SELECT saldo INTO v_s1 FROM lealtad_saldos WHERE cliente_id = v_cli2;
  DELETE FROM ticket_items WHERE id = v_ib;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli2) <> v_s1 THEN RAISE EXCEPTION 'R: borrar el renglón de una cuenta cobrada devolvió los puntos'; END IF;
  IF EXISTS (SELECT 1 FROM lealtad_movimientos WHERE tipo = 'REVERSA_CANJE' AND canje_movimiento_id = v_cx) THEN
    RAISE EXCEPTION 'R: se escribió una reversa en una cuenta cobrada';
  END IF;

  -- 16) Devolver el canje y devolver lo ganado no comparten suerte: si la reversa del canje falla al
  --     cancelar una cuenta cobrada, la cancelación sigue en pie y lo ganado SÍ se revierte.
  --     Cuenta G: dos hamburguesas, premio en la segunda, cobrada (gana 1 sello) y cancelada con la
  --     escritura de la reversa del canje saboteada.
  v_tg := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli2, NULL, 'smoke-lcan-g', v_maria);
  v_ia := agregar_item_a_ticket(v_tg, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcan-g1');
  v_ib := agregar_item_a_ticket(v_tg, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcan-g2');
  v_cx := gen_random_uuid();
  j := lealtad_canjear(v_cx, v_tenant, v_cli2, NULL, NULL, v_premio, v_tg, v_suc, v_caja, v_maria);
  PERFORM lealtad_asentar_canje(j || jsonb_build_object('tenant_id', v_tenant, 'ticket_id', v_tg, 'ticket_item_id', v_ib));
  PERFORM aplicar_pago(v_tg, 'EFECTIVO'::metodo_pago, 120, 120);
  IF lealtad_neto_ganado(v_tg) <> 1 THEN RAISE EXCEPTION 'G: la cuenta cobrada debió ganar 1 sello, ganó %', lealtad_neto_ganado(v_tg); END IF;
  SELECT saldo INTO v_s1 FROM lealtad_saldos WHERE cliente_id = v_cli2;
  CREATE TRIGGER trg_smoke_sabotaje BEFORE INSERT ON lealtad_movimientos
    FOR EACH ROW EXECUTE FUNCTION pg_temp.sabotaje_reversa_canje();
  UPDATE tickets SET estado_fiscal = 'CANCELADO' WHERE id = v_tg;
  DROP TRIGGER trg_smoke_sabotaje ON lealtad_movimientos;
  IF (SELECT estado_fiscal FROM tickets WHERE id = v_tg) <> 'CANCELADO' THEN RAISE EXCEPTION 'G: la cancelación no se sostuvo'; END IF;
  IF lealtad_neto_ganado(v_tg) <> 0 THEN RAISE EXCEPTION 'G: lo ganado no se revirtió porque falló la reversa del canje'; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli2) <> v_s1 - 1 THEN RAISE EXCEPTION 'G: el saldo no es el de solo la reversa de lo ganado'; END IF;
  IF (SELECT revertido FROM ticket_canjes_lealtad WHERE id = v_cx) THEN RAISE EXCEPTION 'G: el canje quedó revertido pese al sabotaje'; END IF;
  -- Y con la reversa ya sin sabotaje, el canje se puede devolver por la vía normal.
  IF lealtad_revertir_canje_ticket(v_tg, 'tras el sabotaje') <> 1 THEN RAISE EXCEPTION 'G: el canje no se pudo devolver después'; END IF;

  -- 17) Módulo apagado.
  UPDATE configuracion_tenant SET modulo_lealtad_activo = false WHERE tenant_id = v_tenant;
  j := lealtad_canjear(gen_random_uuid(), v_tenant, v_cli2, NULL, NULL, v_premio, NULL, v_suc, v_caja, v_maria);
  IF j->>'error' <> 'MODULO_APAGADO' THEN RAISE EXCEPTION 'canjeó con el módulo apagado: %', j; END IF;

  RAISE NOTICE 'SMOKE LEALTAD CANJE OK';
END $$;
ROLLBACK;
