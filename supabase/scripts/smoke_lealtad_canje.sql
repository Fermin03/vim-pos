-- Smoke lealtad · canje (0156 §6). La nube autoriza, el mismo id no descuenta dos veces, sin saldo
-- no hay canje, asentar baja el total, quitar devuelve los puntos una sola vez, cancelar la cuenta
-- los devuelve sin mover los totales de la cuenta cerrada, y cancelar o borrar el renglón premiado
-- también. Un premio nunca se pega al cargo de envío. Hace ROLLBACK.
-- Ejecutar: cd desktop && node scripts/smokes.mjs smoke_lealtad_canje.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno  uuid; v_prod uuid; v_cli uuid; v_t uuid; v_item uuid; v_premio uuid;
  v_c1 uuid := gen_random_uuid(); v_c2 uuid := gen_random_uuid(); v_c3 uuid := gen_random_uuid();
  j jsonb; v_ver integer;
  r tickets%ROWTYPE;
  v_s0 integer; v_n integer; v_nmov integer; v_ok boolean;
  v_ta uuid; v_tb uuid; v_tc uuid; v_td uuid; v_te uuid;
  v_ia uuid; v_ib uuid; v_ic uuid; v_cx uuid; v_zona uuid; v_envio uuid;
BEGIN
  -- aplicar_pago y compañía leen al empleado y el tenant del JWT.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);

  -- La semilla no trae fila de configuracion_tenant para este negocio: se crea ya encendida (el
  -- add-on y el programa, antes: un trigger exige ese orden).
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
  SELECT v_tenant, id, (now() AT TIME ZONE 'America/Mexico_City')::date, true, 100 FROM addons WHERE codigo = 'LEALTAD';
  INSERT INTO lealtad_programa (tenant_id, mecanica, porcentaje) VALUES (v_tenant, 'PUNTOS_DINERO', 10) RETURNING version INTO v_ver;
  INSERT INTO configuracion_tenant (tenant_id, modulo_lealtad_activo) VALUES (v_tenant, true)
  ON CONFLICT (tenant_id) DO UPDATE SET modulo_lealtad_activo = true;
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_tenant, 'Ana Canje', '4770001563') RETURNING id INTO v_cli;
  PERFORM lealtad_registrar_movimiento(NULL, v_tenant, v_cli, 'AJUSTE', 100, v_ver, p_motivo => 'saldo de prueba');

  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-LCAN', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;
  SELECT id INTO v_prod FROM productos WHERE tenant_id = v_tenant AND nombre = 'Hamburguesa Clásica' LIMIT 1;
  v_t := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-lcan-1', v_maria);
  v_item := agregar_item_a_ticket(v_t, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcan-i1');

  -- 1) Saldo: por id y por teléfono con formato.
  j := lealtad_saldo(v_tenant, v_cli, NULL);
  IF (j->>'saldo')::int <> 100 THEN RAISE EXCEPTION 'saldo por id: %', j; END IF;
  j := lealtad_saldo(v_tenant, gen_random_uuid(), '(477) 000-1563');
  IF (j->>'cliente_id')::uuid <> v_cli THEN RAISE EXCEPTION 'no resolvió por teléfono: %', j; END IF;

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

  -- 8) Premios: con mecánica de sellos se canjea un premio y vuelve el producto.
  UPDATE lealtad_programa SET mecanica = 'SELLOS' WHERE tenant_id = v_tenant;
  INSERT INTO lealtad_premios (tenant_id, producto_id, costo) VALUES (v_tenant, v_prod, 6) RETURNING id INTO v_premio;
  j := lealtad_canjear(gen_random_uuid(), v_tenant, v_cli, NULL, NULL, v_premio, NULL, v_suc, v_caja, v_maria);
  IF NOT (j->>'ok')::boolean OR (j->>'puntos')::int <> 6 OR (j->>'producto_id')::uuid <> v_prod THEN RAISE EXCEPTION 'premio: %', j; END IF;
  j := lealtad_canjear(gen_random_uuid(), v_tenant, v_cli, NULL, 10, NULL, NULL, v_suc, v_caja, v_maria);
  IF j->>'error' <> 'PREMIO_INVALIDO' THEN RAISE EXCEPTION 'sellos sin premio debió rechazar: %', j; END IF;

  -- 9) Cancelar el renglón premiado devuelve los puntos y la cuenta vale lo que queda.
  --    Cuenta A: dos hamburguesas (240); el premio cae sobre la segunda.
  SELECT saldo INTO v_s0 FROM lealtad_saldos WHERE cliente_id = v_cli;
  v_ta := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-lcan-a', v_maria);
  v_ia := agregar_item_a_ticket(v_ta, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcan-a1');
  v_ib := agregar_item_a_ticket(v_ta, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcan-a2');
  v_cx := gen_random_uuid();
  j := lealtad_canjear(v_cx, v_tenant, v_cli, NULL, NULL, v_premio, v_ta, v_suc, v_caja, v_maria);
  IF NOT (j->>'ok')::boolean THEN RAISE EXCEPTION 'canje de premio A: %', j; END IF;
  PERFORM lealtad_asentar_canje(j || jsonb_build_object('tenant_id', v_tenant, 'ticket_id', v_ta, 'ticket_item_id', v_ib));
  SELECT * INTO r FROM tickets WHERE id = v_ta;
  IF r.total_mxn <> 120 OR r.lealtad_mxn <> 120 THEN RAISE EXCEPTION 'A con premio: total % lealtad % (esperado 120 y 120)', r.total_mxn, r.lealtad_mxn; END IF;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli) <> v_s0 - 6 THEN RAISE EXCEPTION 'A: el premio no descontó 6'; END IF;

  UPDATE ticket_items SET cancelado = true, cancelado_at = now(), motivo_cancelacion = 'Smoke lealtad' WHERE id = v_ib;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli) <> v_s0 THEN
    RAISE EXCEPTION 'cancelar el renglón premiado no devolvió los puntos: saldo % (esperado %)', (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli), v_s0;
  END IF;
  IF NOT (SELECT revertido FROM ticket_canjes_lealtad WHERE id = v_cx) THEN RAISE EXCEPTION 'A: el canje no quedó revertido'; END IF;
  SELECT count(*) INTO v_n FROM lealtad_movimientos WHERE tipo = 'REVERSA_CANJE' AND canje_movimiento_id = v_cx;
  IF v_n <> 1 THEN RAISE EXCEPTION 'A: REVERSA_CANJE debía ser 1, fueron %', v_n; END IF;
  SELECT * INTO r FROM tickets WHERE id = v_ta;
  IF r.total_mxn <> 120 OR r.lealtad_mxn <> 0 THEN RAISE EXCEPTION 'A tras cancelar: total % lealtad % (esperado 120 y 0: el renglón que queda)', r.total_mxn, r.lealtad_mxn; END IF;
  IF lealtad_revertir_canje_ticket(v_ta, 'otra vez') <> 0 THEN RAISE EXCEPTION 'A: revirtió dos veces'; END IF;

  -- 10) Borrar el renglón premiado también devuelve los puntos, una sola reversa, y no deja el
  --     canje huérfano. Cuenta B: dos hamburguesas; el premio cae sobre la segunda.
  v_tb := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-lcan-b', v_maria);
  v_ia := agregar_item_a_ticket(v_tb, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcan-b1');
  v_ib := agregar_item_a_ticket(v_tb, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcan-b2');
  v_cx := gen_random_uuid();
  j := lealtad_canjear(v_cx, v_tenant, v_cli, NULL, NULL, v_premio, v_tb, v_suc, v_caja, v_maria);
  PERFORM lealtad_asentar_canje(j || jsonb_build_object('tenant_id', v_tenant, 'ticket_id', v_tb, 'ticket_item_id', v_ib));
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli) <> v_s0 - 6 THEN RAISE EXCEPTION 'B: el premio no descontó 6'; END IF;

  DELETE FROM ticket_items WHERE id = v_ib;
  IF (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli) <> v_s0 THEN
    RAISE EXCEPTION 'borrar el renglón premiado no devolvió los puntos: saldo % (esperado %)', (SELECT saldo FROM lealtad_saldos WHERE cliente_id = v_cli), v_s0;
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

  -- 11) Cancelar o borrar un renglón SIN premio no escribe nada en el libro, y un canje de cuenta
  --     (sin renglón) no se toca. Cuenta C: tres renglones; canje de $30 sobre la cuenta, asentado
  --     como lo hace la caja (la nube ya lo autorizó).
  v_tc := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-lcan-c', v_maria);
  v_ia := agregar_item_a_ticket(v_tc, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcan-c1');
  v_ib := agregar_item_a_ticket(v_tc, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcan-c2');
  v_ic := agregar_item_a_ticket(v_tc, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcan-c3');
  PERFORM lealtad_asentar_canje(jsonb_build_object('canje_id', gen_random_uuid(), 'tenant_id', v_tenant, 'ticket_id', v_tc,
    'cliente_id', v_cli, 'puntos', 5, 'monto_mxn', 30, 'programa_version', v_ver));
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

  -- 12) Un premio nunca se pega al cargo de envío: no es un renglón de producto.
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn)
  VALUES (v_tenant, v_suc, 'Zona Canje', 35.00) RETURNING id INTO v_zona;
  v_td := abrir_ticket(v_suc, v_caja, v_turno, 'DELIVERY_PROPIO'::modo_servicio, v_cli, NULL, 'smoke-lcan-d', v_maria);
  PERFORM agregar_item_a_ticket(v_td, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lcan-d1');
  PERFORM fijar_envio_ticket(v_td, v_zona);
  SELECT id INTO v_envio FROM ticket_items WHERE ticket_id = v_td AND cargo_tipo = 'ENVIO' AND cancelado = false;
  IF v_envio IS NULL THEN RAISE EXCEPTION 'D: el ticket no tiene renglón de envío'; END IF;
  v_cx := gen_random_uuid();
  j := lealtad_canjear(v_cx, v_tenant, v_cli, NULL, NULL, v_premio, v_td, v_suc, v_caja, v_maria);
  v_ok := false;
  BEGIN
    PERFORM lealtad_asentar_canje(j || jsonb_build_object('tenant_id', v_tenant, 'ticket_id', v_td, 'ticket_item_id', v_envio));
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'RENGLON_NO_EXISTE' THEN RAISE EXCEPTION 'D: falló por otra causa: %', SQLERRM; END IF;
  END;
  IF v_ok THEN RAISE EXCEPTION 'D: se asentó un premio sobre el renglón de envío'; END IF;
  IF EXISTS (SELECT 1 FROM ticket_canjes_lealtad WHERE ticket_id = v_td) THEN RAISE EXCEPTION 'D: quedó un canje sobre el envío'; END IF;
  SELECT * INTO r FROM tickets WHERE id = v_td;
  IF r.total_mxn <> 155 OR r.lealtad_mxn <> 0 THEN RAISE EXCEPTION 'D: total % lealtad % (esperado 155 y 0)', r.total_mxn, r.lealtad_mxn; END IF;

  -- 13) Módulo apagado.
  UPDATE configuracion_tenant SET modulo_lealtad_activo = false WHERE tenant_id = v_tenant;
  j := lealtad_canjear(gen_random_uuid(), v_tenant, v_cli, NULL, NULL, v_premio, NULL, v_suc, v_caja, v_maria);
  IF j->>'error' <> 'MODULO_APAGADO' THEN RAISE EXCEPTION 'canjeó con el módulo apagado: %', j; END IF;

  RAISE NOTICE 'SMOKE LEALTAD CANJE OK';
END $$;
ROLLBACK;
