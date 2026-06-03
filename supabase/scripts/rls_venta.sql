-- Verificación de la ruta de venta BAJO RLS (rol authenticated + claims de empleado).
-- Complementa smoke_venta.sql (que corre como postgres y bypassa RLS). Aquí probamos
-- que las RPC SECURITY INVOKER funcionan con el JWT del empleado: grants + políticas RLS
-- en tickets/ticket_items/ticket_item_modificadores/pagos + asignación de folio.
-- Uso: docker exec -i <db> psql -U postgres -d postgres < supabase/scripts/rls_venta.sql
BEGIN;

-- Precondición: abrir un turno como postgres (el seed no abre turno). id fijo.
INSERT INTO turnos (id, tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable,
                    usuario_apertura_id, fondo_inicial_mxn)
VALUES ('cccccccc-0000-0000-0000-0000000000c1',
        '99999999-0000-0000-0000-0000000000aa',
        '99999999-0000-0000-0000-0000000000bb',
        '99999999-0000-0000-0000-0000000000cc',
        'RLS-01', current_date, '99999999-0000-0000-0000-000000000001', 1000.00);

-- Cambiar al contexto del EMPLEADO (María) con RLS activa.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"99999999-0000-0000-0000-000000000001","tenant_id":"99999999-0000-0000-0000-0000000000aa","role":"authenticated"}',
  true);

DO $$
DECLARE
  v_suc      uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja     uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria    uuid := '99999999-0000-0000-0000-000000000001';
  v_turno    uuid := 'cccccccc-0000-0000-0000-0000000000c1';
  v_prod     uuid := 'b0000000-0000-0000-0000-0000000000f1';
  v_opc_term uuid;
  v_opc_extra uuid;
  v_ticket   uuid;
  v_total    numeric(12,2);
  v_estado   ticket_estado_fiscal;
  v_cambio   numeric(12,2);
  v_mitad    numeric(12,2);
BEGIN
  SELECT id INTO v_opc_term FROM opciones_modificador WHERE nombre = 'Tres cuartos' LIMIT 1;
  SELECT id INTO v_opc_extra FROM opciones_modificador WHERE nombre = 'Extra queso' LIMIT 1;

  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'COMER_AQUI', NULL, NULL, NULL, v_maria);
  PERFORM agregar_item_a_ticket(v_ticket, v_prod, 1, NULL, '[]'::jsonb, NULL);
  PERFORM agregar_item_a_ticket(
    v_ticket, v_prod, 1, 'sin cebolla',
    jsonb_build_array(
      jsonb_build_object('opcion_modificador_id', v_opc_term, 'cantidad', 1),
      jsonb_build_object('opcion_modificador_id', v_opc_extra, 'cantidad', 1)),
    NULL);

  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket;
  IF v_total <> 255.00 THEN RAISE EXCEPTION 'RLS: total esperado 255.00, got %', v_total; END IF;

  v_mitad := ROUND(v_total / 2, 2);
  PERFORM aplicar_pago(v_ticket, 'TARJETA_DEBITO', v_mitad, NULL, '1234', NULL, NULL, false, NULL, NULL);
  PERFORM aplicar_pago(v_ticket, 'EFECTIVO', v_total - v_mitad, (v_total - v_mitad) + 50, NULL, NULL, NULL, false, NULL, NULL);

  SELECT estado_fiscal, cambio_mxn INTO v_estado, v_cambio FROM tickets WHERE id = v_ticket;
  IF v_estado <> 'PAGADO' THEN RAISE EXCEPTION 'RLS: esperaba PAGADO, got %', v_estado; END IF;
  IF v_cambio <> 50.00 THEN RAISE EXCEPTION 'RLS: esperaba cambio 50.00, got %', v_cambio; END IF;
  IF (SELECT folio_completo FROM tickets WHERE id = v_ticket) IS NULL
    THEN RAISE EXCEPTION 'RLS: folio no asignado'; END IF;

  RAISE NOTICE 'RLS OK -- venta bajo rol authenticated. ticket=% folio=%',
    v_ticket, (SELECT folio_completo FROM tickets WHERE id = v_ticket);
END $$;

RESET ROLE;
ROLLBACK;
