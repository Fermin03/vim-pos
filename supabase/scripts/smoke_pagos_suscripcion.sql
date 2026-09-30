-- Smoke de la 0130: pagos de la suscripción.
-- Registrar recorre la fecha de cobro desde el día de alta (sin quedarse en el 28), anular solo
-- el último regresa la fecha, y las RPC y la tabla no son escribibles desde el navegador.
-- Fechas fijas a propósito: nada de CURRENT_DATE contra fechas de negocio (el servidor es UTC).
BEGIN;

DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_op     uuid := '00000000-0000-0000-0000-0000000000a1';
  v_plan   uuid;
  v_susc   uuid;
  r        jsonb;
  v_pago1  uuid;
  v_pago2  uuid;
  v_s      suscripciones%ROWTYPE;
BEGIN
  SELECT id INTO v_plan FROM planes ORDER BY precio_mensual_mxn NULLS LAST LIMIT 1;
  UPDATE suscripciones SET estado = 'EXPIRADA', fecha_fin = '2026-01-30' WHERE tenant_id = v_tenant AND estado IN ('ACTIVA', 'PAUSADA');

  -- Alta el 31 de enero; el primer cobro toca el 28 de febrero (lo que calcula el panel).
  INSERT INTO suscripciones (tenant_id, plan_id, fecha_inicio, estado, precio_mensual_mxn, ciclo_facturacion, proxima_fecha_cobro)
  VALUES (v_tenant, v_plan, '2026-01-31', 'ACTIVA', 499, 'MENSUAL', '2026-02-28')
  RETURNING id INTO v_susc;

  -- 1) Un mes: cubre del 28 feb al 30 mar, y el siguiente cobro es el 31 de marzo (no el 28).
  r := registrar_pago_suscripcion(v_tenant, 499, 'TRANSFERENCIA', '2026-02-27', 1, 'SPEI 123', NULL, v_op);
  v_pago1 := (r->>'pago_id')::uuid;
  IF r->>'cubre_desde' <> '2026-02-28' OR r->>'cubre_hasta' <> '2026-03-30' OR r->>'proxima_fecha_cobro' <> '2026-03-31' THEN
    RAISE EXCEPTION 'pago 1: esperaba 2026-02-28..2026-03-30 y próximo 2026-03-31, salió %', r;
  END IF;

  -- 2) Dos meses de una vez: del 31 mar al 30 may; siguiente, 31 de mayo.
  r := registrar_pago_suscripcion(v_tenant, 998, 'EFECTIVO', '2026-03-30', 2, NULL, 'adelanta abril', v_op);
  v_pago2 := (r->>'pago_id')::uuid;
  IF r->>'cubre_desde' <> '2026-03-31' OR r->>'cubre_hasta' <> '2026-05-30' OR r->>'proxima_fecha_cobro' <> '2026-05-31' THEN
    RAISE EXCEPTION 'pago 2: esperaba 2026-03-31..2026-05-30 y próximo 2026-05-31, salió %', r;
  END IF;
  SELECT * INTO v_s FROM suscripciones WHERE id = v_susc;
  IF v_s.ultima_fecha_cobro <> '2026-03-30' THEN RAISE EXCEPTION 'ultima_fecha_cobro no se movió: %', v_s.ultima_fecha_cobro; END IF;

  -- 3) No se anula uno de en medio.
  BEGIN
    PERFORM anular_pago_suscripcion(v_pago1, 'capturado dos veces', v_op);
    RAISE EXCEPTION 'dejó anular un pago que no es el último';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'NO_ES_EL_ULTIMO' THEN RAISE; END IF;
  END;

  -- 4) Anular el último regresa la fecha de cobro y la última fecha pagada.
  r := anular_pago_suscripcion(v_pago2, 'capturado dos veces', v_op);
  SELECT * INTO v_s FROM suscripciones WHERE id = v_susc;
  IF v_s.proxima_fecha_cobro <> '2026-03-31' OR v_s.ultima_fecha_cobro <> '2026-02-27' THEN
    RAISE EXCEPTION 'tras anular esperaba próximo 2026-03-31 y último 2026-02-27, quedó % / %', v_s.proxima_fecha_cobro, v_s.ultima_fecha_cobro;
  END IF;
  IF (SELECT anulado_motivo FROM pagos_suscripcion WHERE id = v_pago2) IS NULL THEN RAISE EXCEPTION 'el pago anulado no guardó su motivo'; END IF;

  -- 5) Anual: un periodo son doce meses.
  UPDATE suscripciones SET ciclo_facturacion = 'ANUAL' WHERE id = v_susc;
  r := registrar_pago_suscripcion(v_tenant, 5000, 'TRANSFERENCIA', '2026-03-31', 1, NULL, NULL, v_op);
  IF r->>'proxima_fecha_cobro' <> '2027-03-31' THEN RAISE EXCEPTION 'anual: esperaba próximo 2027-03-31, salió %', r; END IF;

  -- 6) Validaciones.
  BEGIN
    PERFORM registrar_pago_suscripcion(v_tenant, 499, 'TRANSFERENCIA', '2026-03-31', 0, NULL, NULL, v_op);
    RAISE EXCEPTION 'aceptó cero periodos';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'PERIODOS_INVALIDOS' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM anular_pago_suscripcion((r->>'pago_id')::uuid, 'corto', v_op);
    RAISE EXCEPTION 'anuló sin motivo suficiente';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'MOTIVO_REQUERIDO' THEN RAISE; END IF;
  END;

  -- 7) En la nube, nada de esto se escribe desde el navegador. (En la caja el runtime le da todo
  --    a authenticated al migrar: ahí no hay navegador ajeno ni pagos que proteger.)
  IF to_regclass('public._vim_migraciones') IS NULL
     AND (has_table_privilege('authenticated', 'pagos_suscripcion', 'INSERT') OR has_table_privilege('authenticated', 'pagos_suscripcion', 'UPDATE')) THEN
    RAISE EXCEPTION 'authenticated puede escribir pagos_suscripcion';
  END IF;
  IF to_regclass('public._vim_migraciones') IS NULL AND has_function_privilege('authenticated', 'registrar_pago_suscripcion(uuid, numeric, text, date, int, text, text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated puede registrar pagos';
  END IF;

  RAISE NOTICE 'smoke_pagos_suscripcion OK';
END $$;

ROLLBACK;
