-- Smoke F5.4 cierre (rol postgres). Crea turno+ticket+pago efectivo, corre reporte_x,
-- arquea y cierra con Z. Verifica efectivo esperado, corte y turno CERRADO. ROLLBACK.
-- Ejecutar: docker exec -i ... psql ... < smoke_cierre.sql   (bash, bytes UTF-8).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno  uuid; v_ticket uuid; v_prod uuid; v_auth uuid;
  v_x jsonb; v_corte jsonb; v_z jsonb;
  v_esperado numeric; v_estado text;
BEGIN
  -- Simular empleado autenticado (auth.uid + current_tenant_id leen el claim JWT)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);

  -- Liberar la caja de cualquier turno activo (se revierte con el ROLLBACK; no toca datos reales)
  UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=v_caja AND estado='ABIERTO';

  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable,
                     usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-Z', CURRENT_DATE, v_maria, 500, 'TOTAL') RETURNING id INTO v_turno;

  SELECT id INTO v_prod FROM productos WHERE tenant_id=v_tenant AND nombre='Hamburguesa Clásica' LIMIT 1;
  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-z-1', v_maria);
  PERFORM agregar_item_a_ticket(v_ticket, v_prod, 1, NULL, '[]'::jsonb, 'smoke-z-item');
  PERFORM aplicar_pago(v_ticket, 'EFECTIVO'::metodo_pago, 120, 200, NULL, NULL, NULL, false, NULL, 'smoke-z-pago');

  -- reporte_x: efectivo esperado = fondo 500 + venta efectivo 120 = 620
  v_x := reporte_x(v_turno);
  v_esperado := (v_x->>'efectivo_esperado_mxn')::numeric;
  RAISE NOTICE 'efectivo_esperado=%', v_esperado;
  IF v_esperado <> 620 THEN RAISE EXCEPTION 'efectivo esperado inesperado: %', v_esperado; END IF;

  -- autorizacion_pin directa (cajero cierra su propio turno; permiso turno.cerrar_propio)
  INSERT INTO autorizaciones_pin(tenant_id, sucursal_id, caja_id, turno_id,
    usuario_solicitante_id, usuario_autorizo_id, accion, permiso_codigo, entidad_tipo, entidad_id, monto_mxn, motivo)
  VALUES (v_tenant, v_suc, v_caja, v_turno, v_maria, v_maria, 'cerrar_turno', 'turno.cerrar_propio', 'turno', v_turno, NULL, 'Cierre de turno')
  RETURNING id INTO v_auth;

  -- arquear (efectivo declarado 620, exacto)
  v_corte := arquear_caja(v_turno,
    jsonb_build_array(jsonb_build_object('metodo_pago','EFECTIVO','monto_declarado_mxn',620)),
    'CIERRE_TURNO', v_maria, v_auth);
  RAISE NOTICE 'corte diferencia_total=%', v_corte->>'diferencia_total_mxn';
  IF (v_corte->>'diferencia_total_mxn')::numeric <> 0 THEN RAISE EXCEPTION 'corte no cuadra: %', v_corte; END IF;

  -- cerrar con Z
  v_z := reporte_z(v_turno, 620, v_auth, v_maria, NULL);
  RAISE NOTICE 'z estado=% folio=%', v_z->>'estado', v_z->'payload'->>'folio_z';
  SELECT estado INTO v_estado FROM turnos WHERE id=v_turno;
  IF v_estado <> 'CERRADO' THEN RAISE EXCEPTION 'turno no quedo CERRADO: %', v_estado; END IF;
  RAISE NOTICE 'SMOKE CIERRE OK: esperado=% corte_ok turno=%', v_esperado, v_estado;
END $$;
ROLLBACK;
