-- Smoke test de la ruta de venta (F5.2). Corre como postgres contra la BD sembrada.
-- Fija request.jwt.claims.sub = María para que auth.uid() atribuya correctamente
-- (pagos.usuario_id es NOT NULL). Envuelto en transacción con ROLLBACK: no ensucia el seed.
-- Objetivo: abrir_ticket → agregar_item (plano y con modificadores)
--           → aplicar_pago (dividido: tarjeta + efectivo con cambio) → PAGADO con folio.
-- Uso: psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/scripts/smoke_venta.sql
BEGIN;

DO $$
DECLARE
  v_tenant   uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc      uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja     uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria    uuid := '99999999-0000-0000-0000-000000000001';
  v_prod     uuid := 'b0000000-0000-0000-0000-0000000000f1';  -- Hamburguesa Clásica, $120, IVA incl.
  v_turno    uuid;
  v_opc_term uuid;
  v_opc_extra uuid;
  v_ticket   uuid;
  v_total    numeric(12,2);
  v_estado   ticket_estado_fiscal;
  v_pagado   numeric(12,2);
  v_cambio   numeric(12,2);
  v_mitad    numeric(12,2);
BEGIN
  -- Atribución: auth.uid() = María
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text)::text, true);

  -- Abrir un turno (el seed no abre turno)
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable,
                      usuario_apertura_id, fondo_inicial_mxn)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-01', current_date, v_maria, 1000.00)
  RETURNING id INTO v_turno;

  SELECT id INTO v_opc_term FROM opciones_modificador WHERE nombre = 'Tres cuartos' LIMIT 1;
  SELECT id INTO v_opc_extra FROM opciones_modificador WHERE nombre = 'Extra queso' LIMIT 1;

  -- 1) abrir ticket
  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'COMER_AQUI', NULL, NULL, NULL, v_maria);
  RAISE NOTICE 'ticket=%', v_ticket;

  -- 2) item plano (1 hamburguesa = 120)
  PERFORM agregar_item_a_ticket(v_ticket, v_prod, 1, NULL, '[]'::jsonb, NULL);

  -- 3) item con modificadores (término + extra queso $15 → 135)
  PERFORM agregar_item_a_ticket(
    v_ticket, v_prod, 1, 'sin cebolla',
    jsonb_build_array(
      jsonb_build_object('opcion_modificador_id', v_opc_term, 'cantidad', 1),
      jsonb_build_object('opcion_modificador_id', v_opc_extra, 'cantidad', 1)
    ),
    NULL);

  SELECT total_mxn, estado_fiscal INTO v_total, v_estado FROM tickets WHERE id = v_ticket;
  RAISE NOTICE 'total tras items=% estado=%', v_total, v_estado;
  IF v_estado <> 'ABIERTO' THEN RAISE EXCEPTION 'esperaba ABIERTO, got %', v_estado; END IF;
  IF v_total <> 255.00 THEN RAISE EXCEPTION 'esperaba total 255.00 (120 + 135), got %', v_total; END IF;

  -- 4) pago dividido: tarjeta débito la mitad + efectivo el resto con $50 de cambio
  v_mitad := ROUND(v_total / 2, 2);  -- 127.50
  PERFORM aplicar_pago(v_ticket, 'TARJETA_DEBITO', v_mitad, NULL, '1234', NULL, NULL, false, NULL, NULL);
  PERFORM aplicar_pago(v_ticket, 'EFECTIVO', v_total - v_mitad,
                       (v_total - v_mitad) + 50, NULL, NULL, NULL, false, NULL, NULL);

  SELECT estado_fiscal, monto_pagado_mxn, cambio_mxn INTO v_estado, v_pagado, v_cambio
  FROM tickets WHERE id = v_ticket;
  RAISE NOTICE 'estado=% pagado=% cambio=%', v_estado, v_pagado, v_cambio;

  IF v_estado <> 'PAGADO' THEN RAISE EXCEPTION 'esperaba PAGADO, got %', v_estado; END IF;
  IF v_pagado <> 255.00 THEN RAISE EXCEPTION 'esperaba pagado 255.00, got %', v_pagado; END IF;
  IF v_cambio <> 50.00 THEN RAISE EXCEPTION 'esperaba cambio 50.00, got %', v_cambio; END IF;
  IF (SELECT folio_completo FROM tickets WHERE id = v_ticket) IS NULL
    THEN RAISE EXCEPTION 'folio no asignado'; END IF;

  RAISE NOTICE 'SMOKE OK -- ticket=% folio=%', v_ticket,
    (SELECT folio_completo FROM tickets WHERE id = v_ticket);
END $$;

ROLLBACK;
