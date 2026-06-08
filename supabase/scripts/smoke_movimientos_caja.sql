-- Smoke F7 movimientos_caja: inserta sangría y depósito, verifica folios y que
-- calcular_efectivo_esperado los aplica correctamente. ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno  uuid; v_san uuid; v_dep uuid; v_auth uuid;
  v_folio_san varchar; v_folio_dep varchar;
  v_esperado_antes numeric; v_esperado_despues numeric;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);

  UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=v_caja AND estado='ABIERTO';

  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable,
                     usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-MV', CURRENT_DATE, v_maria, 1000, 'TOTAL')
  RETURNING id INTO v_turno;

  SELECT calcular_efectivo_esperado(v_turno) INTO v_esperado_antes;
  RAISE NOTICE 'esperado antes: % (esperado fondo 1000)', v_esperado_antes;

  -- 0039: los movimientos manuales (sangría/depósito/refuerzo/pago proveedor) exigen una
  -- autorización de supervisor válida (PIN). En el flujo real la crea verificar_autorizacion_pin;
  -- aquí la sembramos directamente (el trigger solo valida existencia + tenant).
  INSERT INTO autorizaciones_pin(tenant_id, usuario_solicitante_id, usuario_autorizo_id,
                                 accion, permiso_codigo, motivo, caja_id, turno_id)
  VALUES (v_tenant, v_maria, v_maria, 'caja.sangria', 'caja.sangria', 'smoke', v_caja, v_turno)
  RETURNING id INTO v_auth;

  -- 1) Sangría 300 (retira efectivo) — con autorización válida
  INSERT INTO movimientos_caja(tenant_id, sucursal_id, caja_id, turno_id,
                               tipo, monto_mxn, dia_contable,
                               usuario_solicitante_id, motivo, autorizacion_pin_id, usuario_autorizo_id)
  VALUES (v_tenant, v_suc, v_caja, v_turno,
          'SANGRIA'::movimiento_tipo, 300, CURRENT_DATE,
          v_maria, 'Refuerzo a caja fuerte', v_auth, v_maria)
  RETURNING id, folio INTO v_san, v_folio_san;
  RAISE NOTICE 'sangría folio: %', v_folio_san;

  -- 2) Inyección de fondo 100 (entra efectivo a la caja). DEPOSITO (al banco) saldría también.
  INSERT INTO movimientos_caja(tenant_id, sucursal_id, caja_id, turno_id,
                               tipo, monto_mxn, dia_contable,
                               usuario_solicitante_id, motivo, autorizacion_pin_id, usuario_autorizo_id)
  VALUES (v_tenant, v_suc, v_caja, v_turno,
          'INYECCION_FONDO'::movimiento_tipo, 100, CURRENT_DATE,
          v_maria, 'Refuerzo de fondo', v_auth, v_maria)
  RETURNING id, folio INTO v_dep, v_folio_dep;
  RAISE NOTICE 'inyección folio: %', v_folio_dep;

  SELECT calcular_efectivo_esperado(v_turno) INTO v_esperado_despues;
  RAISE NOTICE 'esperado después: % (fondo 1000 - sangría 300 + inyección 100 = 800)', v_esperado_despues;
  IF v_esperado_despues <> 800 THEN
    RAISE EXCEPTION 'esperado inesperado: %', v_esperado_despues;
  END IF;
  IF v_folio_san NOT LIKE 'SAN-%' THEN RAISE EXCEPTION 'folio sangría mal formado: %', v_folio_san; END IF;
  IF v_folio_dep NOT LIKE 'INY-%' THEN RAISE EXCEPTION 'folio inyección mal formado: %', v_folio_dep; END IF;

  RAISE NOTICE 'SMOKE MOVIMIENTOS OK: % %  esperado=% ', v_folio_san, v_folio_dep, v_esperado_despues;
END $$;
ROLLBACK;
