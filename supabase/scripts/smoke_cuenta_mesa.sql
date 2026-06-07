-- Smoke T2 keystone: abrir cuenta en mesa (ticket MESA + asignar) -> agregar incremental ->
-- el ticket abierto tiene los items (reconstruible) -> cobrar -> mesa liberada. ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno  uuid; v_ticket uuid; v_prod uuid; v_mesa uuid;
  v_items int; v_total numeric; v_estado_mesa text; v_estado_fiscal text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);
  UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=v_caja AND estado='ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-CM', CURRENT_DATE, v_maria, 500, 'TOTAL') RETURNING id INTO v_turno;
  INSERT INTO mesas(tenant_id, sucursal_id, numero, nombre, capacidad, estado, forma)
  VALUES (v_tenant, v_suc, 7, 'Mesa 7', 4, 'LIBRE', 'CUADRADA') RETURNING id INTO v_mesa;
  SELECT id INTO v_prod FROM productos WHERE tenant_id=v_tenant AND nombre='Hamburguesa Clásica' LIMIT 1;

  -- Abrir cuenta: ticket MESA + asignar mesa
  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'MESA'::modo_servicio, NULL, NULL, 'cm-1', v_maria);
  PERFORM asignar_mesa_a_ticket(v_ticket, v_mesa, true, 'cm-asig');
  SELECT estado INTO v_estado_mesa FROM mesas WHERE id=v_mesa;
  IF v_estado_mesa <> 'OCUPADA' THEN RAISE EXCEPTION 'mesa no se ocupó al abrir cuenta'; END IF;

  -- Agregar incremental (2 rondas)
  PERFORM agregar_item_a_ticket(v_ticket, v_prod, 1, NULL, '[]'::jsonb, 'cm-i1');
  PERFORM agregar_item_a_ticket(v_ticket, v_prod, 1, NULL, '[]'::jsonb, 'cm-i2');
  SELECT count(*) INTO v_items FROM ticket_items WHERE ticket_id=v_ticket AND NOT cancelado;
  SELECT total_mxn, estado_fiscal INTO v_total, v_estado_fiscal FROM tickets WHERE id=v_ticket;
  RAISE NOTICE 'cuenta abierta: items=% total=% estado=% (esperado 2 / 240 / ABIERTO)', v_items, v_total, v_estado_fiscal;
  IF v_items <> 2 OR v_total <> 240 THEN RAISE EXCEPTION 'el agregado incremental no acumuló (items=% total=%)', v_items, v_total; END IF;

  -- Cobrar
  PERFORM aplicar_pago(v_ticket, 'EFECTIVO'::metodo_pago, 240, 240, NULL, NULL, NULL, false, NULL, 'cm-pago');
  SELECT estado_fiscal INTO v_estado_fiscal FROM tickets WHERE id=v_ticket;
  SELECT estado INTO v_estado_mesa FROM mesas WHERE id=v_mesa;
  RAISE NOTICE 'tras cobrar: ticket=% / mesa=% (esperado PAGADO / liberada)', v_estado_fiscal, v_estado_mesa;
  IF v_estado_fiscal <> 'PAGADO' THEN RAISE EXCEPTION 'no quedó PAGADO'; END IF;
  IF v_estado_mesa <> 'LIBRE' THEN RAISE EXCEPTION 'la mesa no se liberó al pagar (es %)', v_estado_mesa; END IF;

  RAISE NOTICE 'SMOKE CUENTA MESA OK: abrir->ocupar->agregar incremental->cobrar.';
END $$;
ROLLBACK;
