-- Smoke F5.2b descuento (rol postgres). Crea ticket+item, autoriza por PIN de
-- supervisor (Diego, 4321), aplica descuento 10% y verifica que total_mxn baja.
-- Ejecutar: docker exec -i ... psql ... < smoke_descuento.sql   (hace ROLLBACK).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno  uuid;
  v_ticket uuid;
  v_prod   uuid;
  v_auth   jsonb;
  v_total_antes   numeric;
  v_total_despues numeric;
BEGIN
  -- Turno
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable,
                     usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-D', CURRENT_DATE, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;

  -- Producto del seed (Hamburguesa Clásica $120)
  SELECT id INTO v_prod FROM productos WHERE tenant_id = v_tenant AND nombre = 'Hamburguesa Clásica' LIMIT 1;

  -- Ticket + item via RPC (firmas reales post-fix F5.2)
  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-d-1', v_maria);
  PERFORM agregar_item_a_ticket(v_ticket, v_prod, 1, NULL, '[]'::jsonb, 'smoke-d-item');

  SELECT total_mxn INTO v_total_antes FROM tickets WHERE id = v_ticket;
  RAISE NOTICE 'total antes: %', v_total_antes;   -- esperado 120.00

  -- Autorizacion (Diego supervisor, PIN 4321) via la RPC server-side
  v_auth := verificar_autorizacion_pin('4321', 'descuento_manual', 'descuento.manual_aplicar',
              'ticket', v_ticket, 12, 'CLIENTE_FRECUENTE', v_caja, v_turno, v_maria);
  IF (v_auth->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'autorizacion fallo: %', v_auth;
  END IF;

  -- Descuento 10% al ticket completo
  PERFORM aplicar_descuento_manual(
    v_ticket, NULL, 'PORCENTAJE', 10, 'CLIENTE_FRECUENTE', NULL,
    (v_auth->>'autorizacion_pin_id')::uuid, v_maria, (v_auth->>'autorizo_id')::uuid, 'smoke-d-desc');

  SELECT total_mxn INTO v_total_despues FROM tickets WHERE id = v_ticket;
  RAISE NOTICE 'total despues: %', v_total_despues;  -- esperado 108.00

  IF v_total_despues >= v_total_antes THEN RAISE EXCEPTION 'descuento NO bajo el total'; END IF;
  RAISE NOTICE 'SMOKE DESCUENTO OK: % -> %', v_total_antes, v_total_despues;
END $$;
ROLLBACK;
