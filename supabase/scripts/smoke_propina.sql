-- Smoke F5.2b propina (rol postgres). Crea ticket+item (120), fija propina 18 y cobra
-- 138 en efectivo con 200 recibidos. Verifica propina=18, pagado=138, cambio=62, PAGADO.
-- aplicar_pago usa auth.uid() para pagos.usuario_id (NOT NULL): se simula con un jwt claim.
-- Ejecutar: docker exec -i ... psql ... < smoke_propina.sql   (hace ROLLBACK).
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
  v_prop   numeric;
  v_pag    numeric;
  v_cambio numeric;
  v_total  numeric;
  v_estado text;
BEGIN
  -- Simular el empleado autenticado (aplicar_pago inserta pagos.usuario_id = auth.uid()).
  PERFORM set_config('request.jwt.claim.sub', v_maria::text, true);

  -- Turno
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable,
                     usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-P', CURRENT_DATE, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;

  -- Producto del seed (Hamburguesa Clásica $120)
  SELECT id INTO v_prod FROM productos WHERE tenant_id = v_tenant AND nombre = 'Hamburguesa Clásica' LIMIT 1;

  -- Ticket + item via RPC (firmas reales post-fix F5.2)
  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-p-1', v_maria);
  PERFORM agregar_item_a_ticket(v_ticket, v_prod, 1, NULL, '[]'::jsonb, 'smoke-p-item');

  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket;
  RAISE NOTICE 'total: %', v_total;   -- esperado 120.00

  -- Fijar propina 18
  PERFORM establecer_propina_ticket(v_ticket, 18);

  -- Cobrar total + propina (120 + 18 = 138) en efectivo, recibido 200 -> cambio 62.
  -- Firma posicional: (ticket, metodo, monto, recibido, referencia, terminal, folio, al_recibir, nota, client_id)
  PERFORM aplicar_pago(v_ticket, 'EFECTIVO'::metodo_pago, 138, 200, NULL, NULL, NULL, false, NULL, 'smoke-p-pago');

  SELECT propina_mxn, monto_pagado_mxn, cambio_mxn, estado_fiscal
    INTO v_prop, v_pag, v_cambio, v_estado
    FROM tickets WHERE id = v_ticket;
  RAISE NOTICE 'propina=% pagado=% cambio=% estado=%', v_prop, v_pag, v_cambio, v_estado;

  IF v_prop <> 18      THEN RAISE EXCEPTION 'propina no fijada: %', v_prop; END IF;
  IF v_pag  <> 138     THEN RAISE EXCEPTION 'monto pagado != 138: %', v_pag; END IF;
  IF v_cambio <> 62    THEN RAISE EXCEPTION 'cambio != 62: %', v_cambio; END IF;
  IF v_estado <> 'PAGADO' THEN RAISE EXCEPTION 'ticket no quedo PAGADO: %', v_estado; END IF;
  RAISE NOTICE 'SMOKE PROPINA OK: propina=% pagado=% cambio=% estado=%', v_prop, v_pag, v_cambio, v_estado;
END $$;
ROLLBACK;
