-- Smoke cuentas por nombre en barra (spec giros §8, migración 0183). Sobre la semilla. ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_hoy    date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_turno uuid; v_t1 uuid; v_t1b uuid; v_t2 uuid; v_mesa uuid; v_n int;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-BARRA', v_hoy, v_maria, 500, 'TOTAL') RETURNING id INTO v_turno;

  -- a) Abrir: BARRA, con nombre (sin espacios sobrantes), sin mesa, BORRADOR.
  v_t1 := abrir_cuenta_barra(v_suc, v_caja, v_turno, '  Luis  ', 'barra-1', v_maria);
  IF (SELECT modo_servicio::text || '|' || nombre_cliente || '|' || estado_fiscal::text FROM tickets WHERE id = v_t1) <> 'BARRA|Luis|BORRADOR' THEN
    RAISE EXCEPTION 'a: cuenta mal creada: %', (SELECT row_to_json(t) FROM tickets t WHERE id = v_t1);
  END IF;
  IF EXISTS (SELECT 1 FROM tickets_mesas WHERE ticket_id = v_t1) THEN RAISE EXCEPTION 'a: no debía tener mesa'; END IF;
  RAISE NOTICE 'a abrir OK';

  -- b) Idempotente: el mismo client_id_local devuelve la misma cuenta.
  v_t1b := abrir_cuenta_barra(v_suc, v_caja, v_turno, 'Luis', 'barra-1', v_maria);
  IF v_t1b <> v_t1 THEN RAISE EXCEPTION 'b: el reintento creó otra cuenta'; END IF;
  RAISE NOTICE 'b idempotente OK';

  -- c) Nombre repetido (mayúsculas/espacios) en la misma sucursal → NOMBRE_EN_USO, y no queda ticket huérfano.
  SELECT count(*) INTO v_n FROM tickets WHERE turno_id = v_turno;
  BEGIN
    PERFORM abrir_cuenta_barra(v_suc, v_caja, v_turno, ' luis', 'barra-2', v_maria);
    RAISE EXCEPTION 'c: aceptó un nombre repetido';
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM NOT LIKE 'NOMBRE_EN_USO%' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM tickets WHERE turno_id = v_turno) <> v_n THEN RAISE EXCEPTION 'c: quedó un ticket huérfano'; END IF;
  -- Sin nombre → NOMBRE_REQUERIDO.
  BEGIN
    PERFORM abrir_cuenta_barra(v_suc, v_caja, v_turno, '   ', 'barra-3', v_maria);
    RAISE EXCEPTION 'c: aceptó nombre vacío';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM NOT LIKE 'NOMBRE_REQUERIDO%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'c nombre único y requerido OK';

  -- d) Pasar a mesa: modo MESA, mesa OCUPADA, el nombre se libera para otra cuenta de barra.
  INSERT INTO mesas(tenant_id, sucursal_id, numero, nombre, capacidad, estado, forma)
  VALUES (v_tenant, v_suc, 96, 'Mesa 96', 4, 'LIBRE', 'CUADRADA') RETURNING id INTO v_mesa;
  PERFORM mover_cuenta_a_mesa(v_t1, v_mesa, 'barra-mesa-1');
  IF (SELECT modo_servicio::text FROM tickets WHERE id = v_t1) <> 'MESA' THEN RAISE EXCEPTION 'd: no cambió a MESA'; END IF;
  IF (SELECT estado::text FROM mesas WHERE id = v_mesa) <> 'OCUPADA' THEN RAISE EXCEPTION 'd: la mesa no quedó ocupada'; END IF;
  v_t2 := abrir_cuenta_barra(v_suc, v_caja, v_turno, 'Luis', 'barra-4', v_maria);   -- ya no choca
  RAISE NOTICE 'd pasar a mesa OK';

  -- e) Pasar de mesa a barra: libera la mesa, modo BARRA, nombre único (Luis ya lo tiene v_t2).
  BEGIN
    PERFORM mover_cuenta_a_barra(v_t1, 'LUIS');
    RAISE EXCEPTION 'e: aceptó un nombre en uso';
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM NOT LIKE 'NOMBRE_EN_USO%' THEN RAISE; END IF;
  END;
  IF (SELECT modo_servicio::text FROM tickets WHERE id = v_t1) <> 'MESA' THEN RAISE EXCEPTION 'e: el rechazo dejó cambios'; END IF;
  PERFORM mover_cuenta_a_barra(v_t1, 'Luis 2');
  IF (SELECT modo_servicio::text || '|' || nombre_cliente FROM tickets WHERE id = v_t1) <> 'BARRA|Luis 2' THEN RAISE EXCEPTION 'e: no pasó a barra'; END IF;
  IF (SELECT estado::text FROM mesas WHERE id = v_mesa) <> 'LIBRE' THEN RAISE EXCEPTION 'e: la mesa no se liberó'; END IF;
  RAISE NOTICE 'e pasar a barra OK';

  -- f) Reglas: no se pasa a mesa algo que no es de barra; no se pasa a barra algo sin mesa; cerrada no se mueve.
  BEGIN PERFORM mover_cuenta_a_barra(v_t2, 'Otro'); RAISE EXCEPTION 'f: movió a barra una cuenta sin mesa';
  EXCEPTION WHEN invalid_parameter_value THEN IF SQLERRM NOT LIKE 'NO_ES_CUENTA_DE_MESA%' THEN RAISE; END IF; END;
  UPDATE tickets SET estado_fiscal = 'CANCELADO' WHERE id = v_t2;
  BEGIN PERFORM mover_cuenta_a_mesa(v_t2, v_mesa, 'barra-mesa-2'); RAISE EXCEPTION 'f: movió una cuenta cerrada';
  EXCEPTION WHEN invalid_parameter_value THEN IF SQLERRM NOT LIKE 'CUENTA_CERRADA%' THEN RAISE; END IF; END;
  -- Una cuenta cerrada libera su nombre.
  PERFORM abrir_cuenta_barra(v_suc, v_caja, v_turno, 'Luis', 'barra-5', v_maria);
  RAISE NOTICE 'f reglas OK';

  -- g) VIM no puede apagar cuentas_barra con cuentas de barra abiertas (0180 ya lo cuenta).
  IF (operacion_cuentas_abiertas(v_tenant)->>'cuentas_barra')::int < 1 THEN RAISE EXCEPTION 'g: no contó las cuentas de barra'; END IF;
  RAISE NOTICE 'g conteo OK';
END $$;

-- h) Bajo RLS como el cajero: abrir funciona en su negocio.
DO $$
DECLARE v_t uuid;
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '99999999-0000-0000-0000-000000000001', 'role', 'authenticated', 'tenant_id', '99999999-0000-0000-0000-0000000000aa')::text, true);
  v_t := abrir_cuenta_barra('99999999-0000-0000-0000-0000000000bb', '99999999-0000-0000-0000-0000000000cc',
          (SELECT id FROM turnos WHERE codigo_turno = 'SMOKE-BARRA'), 'Ana', 'barra-rls', NULL);
  IF v_t IS NULL THEN RAISE EXCEPTION 'h: no abrió bajo RLS'; END IF;
  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'h RLS OK';
END $$;

-- i) Un negocio que ya existe no tiene cuentas_barra (0183).
DO $$
BEGIN
  IF (SELECT (operacion->>'cuentas_barra')::boolean FROM tenants WHERE id = '99999999-0000-0000-0000-0000000000aa') THEN
    RAISE EXCEPTION 'i: el negocio existente quedó con cuentas_barra encendido';
  END IF;
  RAISE NOTICE 'i existentes sin barra OK';
END $$;
ROLLBACK;
