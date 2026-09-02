-- Smoke Delivery F1 (ADR 0011): pedido de Uber (normalizado) → crear_ticket_desde_app → ticket
-- PAGADO con metodo APP_UBEREATS, ítems al precio de la app, en cocina; idempotente; sin turno
-- lanza SIN_TURNO_ABIERTO; transición a LISTO. Corre como postgres (simula service_role). ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno uuid; v_conexion uuid; v_pedido uuid; v_ticket uuid; v_ticket2 uuid;
  v_prod uuid; v_opcion uuid;
  v_total numeric; v_estado text; v_cocina text; v_metodo text; v_precio numeric; v_n int;
BEGIN
  -- Sin JWT: como corre la Edge Function con service_role.
  PERFORM set_config('request.jwt.claims', NULL, true);
  UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=v_caja AND estado='ABIERTO';

  SELECT id INTO v_prod FROM productos WHERE tenant_id=v_tenant AND nombre='Hamburguesa Clásica' LIMIT 1;
  IF v_prod IS NULL THEN RAISE EXCEPTION 'fixture: no existe Hamburguesa Clásica'; END IF;
  SELECT om.id INTO v_opcion FROM opciones_modificador om
    JOIN productos_grupos_modificadores pg ON pg.grupo_id = om.grupo_id AND pg.producto_id = v_prod
    WHERE om.deleted_at IS NULL LIMIT 1;

  INSERT INTO delivery_conexiones (tenant_id, sucursal_id, app, estado, tienda_id_externo, tiempo_prep_min)
  VALUES (v_tenant, v_suc, 'APP_UBEREATS', 'ACTIVA', 'store-smoke', 12) RETURNING id INTO v_conexion;

  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, conexion_id, app, id_externo, folio_corto, estado,
    cliente_nombre, nota_cliente, items, total_cliente_mxn, vence_aceptacion)
  VALUES (v_tenant, v_suc, v_conexion, 'APP_UBEREATS', 'uber-smoke-1', '2A003', 'RECIBIDO',
    'Cliente Uber', 'Sin cebolla por favor',
    jsonb_build_array(
      jsonb_build_object('producto_id', v_prod, 'nombre_app', 'Hamburguesa Clásica', 'cantidad', 2,
        'precio_unitario_mxn', 150.00, 'nota', 'bien cocida',
        'modificadores', CASE WHEN v_opcion IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(
          jsonb_build_object('opcion_modificador_id', v_opcion, 'nombre_app', 'extra', 'cantidad', 1, 'precio_extra_mxn', 20.00)) END)),
    340.00, now() + interval '11 minutes')
  RETURNING id INTO v_pedido;

  -- 1) Sin turno abierto → error claro y el pedido sigue RECIBIDO.
  BEGIN
    PERFORM crear_ticket_desde_app(v_pedido);
    RAISE EXCEPTION 'debió fallar sin turno';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%SIN_TURNO_ABIERTO%' THEN RAISE; END IF;
    RAISE NOTICE 'sin turno: % (esperado SIN_TURNO_ABIERTO)', SQLERRM;
  END;
  SELECT estado INTO v_estado FROM delivery_pedidos WHERE id = v_pedido;
  IF v_estado <> 'RECIBIDO' THEN RAISE EXCEPTION 'el pedido cambió de estado sin turno: %', v_estado; END IF;

  -- 2) Con turno abierto → ticket PAGADO en cocina, precios de la app.
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-APP', CURRENT_DATE, v_maria, 500, 'TOTAL') RETURNING id INTO v_turno;

  v_ticket := crear_ticket_desde_app(v_pedido);
  SELECT estado_fiscal::text, estado_cocina::text, total_mxn INTO v_estado, v_cocina, v_total FROM tickets WHERE id = v_ticket;
  RAISE NOTICE 'ticket %: fiscal=% cocina=% total=%', v_ticket, v_estado, v_cocina, v_total;
  IF v_estado <> 'PAGADO' THEN RAISE EXCEPTION 'no quedó PAGADO (%)', v_estado; END IF;
  IF v_cocina <> 'EN_COCINA' THEN RAISE EXCEPTION 'no entró a cocina (%)', v_cocina; END IF;
  SELECT precio_unitario_snapshot INTO v_precio FROM ticket_items WHERE ticket_id = v_ticket LIMIT 1;
  IF v_precio <> 150.00 THEN RAISE EXCEPTION 'el ítem no lleva el precio de la app (%)', v_precio; END IF;
  SELECT metodo_pago::text INTO v_metodo FROM pagos WHERE ticket_id = v_ticket LIMIT 1;
  IF v_metodo <> 'APP_UBEREATS' THEN RAISE EXCEPTION 'pago con método %', v_metodo; END IF;
  SELECT estado, ticket_id INTO v_estado, v_ticket2 FROM delivery_pedidos WHERE id = v_pedido;
  IF v_estado <> 'ACEPTADO' OR v_ticket2 <> v_ticket THEN RAISE EXCEPTION 'pedido no quedó ACEPTADO/enlazado'; END IF;
  SELECT folio_externo_app, origen_creacion::text INTO v_metodo, v_cocina FROM tickets WHERE id = v_ticket;
  IF v_metodo <> 'uber-smoke-1' OR v_cocina <> 'API_EXTERNA' THEN RAISE EXCEPTION 'falta folio_externo_app/origen'; END IF;

  -- 3) Idempotente: segunda llamada devuelve el mismo ticket y no duplica pagos.
  v_ticket2 := crear_ticket_desde_app(v_pedido);
  IF v_ticket2 <> v_ticket THEN RAISE EXCEPTION 'no es idempotente'; END IF;
  SELECT count(*) INTO v_n FROM pagos WHERE ticket_id = v_ticket;
  IF v_n <> 1 THEN RAISE EXCEPTION 'pagos duplicados: %', v_n; END IF;

  -- 4) Transición manual: listo.
  PERFORM delivery_pedido_transicion(v_pedido, 'LISTO', NULL);
  SELECT estado INTO v_estado FROM delivery_pedidos WHERE id = v_pedido;
  IF v_estado <> 'LISTO' THEN RAISE EXCEPTION 'transición a LISTO falló'; END IF;

  RAISE NOTICE 'SMOKE DELIVERY APP: OK';
END $$;
ROLLBACK;
