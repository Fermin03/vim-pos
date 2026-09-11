-- Smoke combos + Uber (Task 7, ADR 0015 + delivery espejo 0096/0111): un pedido de app con un
-- combo entra por agregar_combo_a_ticket vía crear_ticket_desde_app. El padre cobra la base MÁS
-- cada elección de slot (Uber las manda como modificadores del ítem, no como precio del ítem);
-- los hijos van a 0 con prorrateo; un extra pagado del segundo nivel (el término de la
-- hamburguesa) se cobra en el modificador del hijo correcto, multiplicado por SU cantidad (no la
-- del combo suelta) cuando el combo se pide más de una vez. Fixtures propias. ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_cat_h  uuid; v_combo uuid; v_slot_hamb uuid; v_slot_beb uuid;
  v_prod_hamb uuid; v_prod_beb uuid; v_grupo_termino uuid; v_opcion_termino uuid;
  v_conexion uuid; v_turno uuid;
  v_pedido1 uuid; v_pedido2 uuid; v_pedido3 uuid;
  v_ticket1 uuid; v_ticket2 uuid;
  v_padre1 uuid; v_padre2 uuid;
  v_precio_padre numeric; v_suma_asignado numeric;
  v_mods_hijo int; v_extra_pagado_hijo numeric; v_hijo_prod uuid;
  v_total_ticket numeric; v_total_pedido numeric;
  v_monto_correccion numeric; v_cant_hijo numeric;
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);  -- como corre la Edge Function con service_role
  UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=v_caja AND estado='ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-COMBO-UBER', CURRENT_DATE, v_maria, 500, 'TOTAL') RETURNING id INTO v_turno;

  -- Catálogo: un combo de 2 slots obligatorios (Hamburguesa, Bebida) y un término de cocción
  -- (grupo de modificadores real, no un slot) para el segundo nivel.
  INSERT INTO categorias(tenant_id, nombre, orden_visualizacion) VALUES (v_tenant, 'Hamburguesas Uber smoke', 1) RETURNING id INTO v_cat_h;
  INSERT INTO productos(tenant_id, categoria_id, nombre, precio_base_mxn, es_combo, clave_sat)
  VALUES (v_tenant, v_cat_h, 'Combo Uber smoke', 45, true, '90101503') RETURNING id INTO v_combo;
  INSERT INTO combo_grupos(tenant_id, combo_producto_id, nombre, orden_visualizacion, minimo_selecciones, maximo_selecciones, modo_precio)
  VALUES (v_tenant, v_combo, 'Hamburguesa', 1, 1, 1, 'DELTA') RETURNING id INTO v_slot_hamb;
  INSERT INTO combo_grupos(tenant_id, combo_producto_id, nombre, orden_visualizacion, minimo_selecciones, maximo_selecciones, modo_precio)
  VALUES (v_tenant, v_combo, 'Bebida', 2, 1, 1, 'DELTA') RETURNING id INTO v_slot_beb;
  INSERT INTO productos(tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_tenant, v_cat_h, 'Hamburguesa combo Uber smoke', 100) RETURNING id INTO v_prod_hamb;
  INSERT INTO productos(tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_tenant, v_cat_h, 'Bebida combo Uber smoke', 30) RETURNING id INTO v_prod_beb;
  INSERT INTO combo_opciones(tenant_id, grupo_id, producto_id, precio_delta_mxn, es_default) VALUES (v_tenant, v_slot_hamb, v_prod_hamb, 0, true);
  INSERT INTO combo_opciones(tenant_id, grupo_id, producto_id, precio_delta_mxn, es_default) VALUES (v_tenant, v_slot_beb, v_prod_beb, 0, true);

  INSERT INTO grupos_modificadores(tenant_id, nombre, tipo_seleccion) VALUES (v_tenant, 'Término de cocción Uber smoke', 'UNICA_OBLIGATORIA') RETURNING id INTO v_grupo_termino;
  INSERT INTO opciones_modificador(tenant_id, grupo_id, nombre, precio_extra_mxn) VALUES (v_tenant, v_grupo_termino, 'Tres cuartos Uber smoke', 0) RETURNING id INTO v_opcion_termino;

  INSERT INTO delivery_conexiones (tenant_id, sucursal_id, app, estado, tienda_id_externo, tiempo_prep_min)
  VALUES (v_tenant, v_suc, 'APP_UBEREATS', 'ACTIVA', 'store-smoke-combo', 12) RETURNING id INTO v_conexion;

  -- ── Pedido 1: un combo, cantidad 1. La base ($45) llega en precio_unitario_mxn; las dos
  -- elecciones de slot llegan como modificadores del ítem con su grupo_id (el slot) y su
  -- precio_extra_mxn (lo que Uber cobró por esa elección): $130 la hamburguesa, $15 la bebida.
  -- El término (segundo nivel) cuelga de la elección de hamburguesa y Uber lo cobró aparte: $25.
  -- Lo que Uber cobró en total por esta línea: 45 + 130 + 15 + 25 = 215.
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, conexion_id, app, id_externo, folio_corto, estado,
    cliente_nombre, items, total_cliente_mxn, vence_aceptacion)
  VALUES (v_tenant, v_suc, v_conexion, 'APP_UBEREATS', 'uber-combo-smoke-1', '9C001', 'RECIBIDO',
    'Cliente Uber Combo',
    jsonb_build_array(jsonb_build_object(
      'producto_id', v_combo, 'nombre_app', 'Combo Uber smoke', 'cantidad', 1,
      'precio_unitario_mxn', 45.00, 'nota', NULL,
      'modificadores', jsonb_build_array(
        jsonb_build_object('grupo_id', v_slot_hamb, 'opcion_modificador_id', v_prod_hamb,
          'nombre_app', 'Hamburguesa combo Uber smoke', 'cantidad', 1, 'precio_extra_mxn', 130.00,
          'modificadores', jsonb_build_array(
            jsonb_build_object('grupo_id', v_grupo_termino, 'opcion_modificador_id', v_opcion_termino,
              'nombre_app', 'Tres cuartos Uber smoke', 'cantidad', 1, 'precio_extra_mxn', 25.00))),
        jsonb_build_object('grupo_id', v_slot_beb, 'opcion_modificador_id', v_prod_beb,
          'nombre_app', 'Bebida combo Uber smoke', 'cantidad', 1, 'precio_extra_mxn', 15.00)))),
    215.00, now() + interval '11 minutes')
  RETURNING id INTO v_pedido1;

  v_ticket1 := crear_ticket_desde_app(v_pedido1);

  SELECT id INTO v_padre1 FROM ticket_items WHERE ticket_id = v_ticket1 AND combo_rol = 'PADRE';
  IF v_padre1 IS NULL THEN RAISE EXCEPTION 'no se creó el renglón PADRE del combo'; END IF;

  -- 1) el padre cobra la base MÁS cada elección: 45 + 130 + 15 = 190, no 45.
  --    Es el error que este smoke existe para atrapar: cobrar solo la fila ITEM regala $145.
  SELECT precio_unitario_snapshot INTO v_precio_padre FROM ticket_items WHERE id = v_padre1;
  IF v_precio_padre <> 190 THEN RAISE EXCEPTION 'el padre debe cobrar 190 (45 base + 145 de elecciones), es %', v_precio_padre; END IF;

  -- 2) los hijos a cero y el prorrateo sumando exactamente el precio del padre
  SELECT COALESCE(SUM(precio_unitario_snapshot), 0), COALESCE(SUM(precio_asignado_mxn), 0)
    INTO v_total_ticket, v_suma_asignado
    FROM ticket_items WHERE parent_item_id = v_padre1;
  IF v_total_ticket <> 0 THEN RAISE EXCEPTION 'los hijos deben ir a precio 0 (suma %)', v_total_ticket; END IF;
  IF v_suma_asignado <> 190 THEN RAISE EXCEPTION 'el prorrateo debe sumar 190, suma %', v_suma_asignado; END IF;

  -- 3) el término anidado llegó al hijo correcto (la hamburguesa, no la bebida), y un extra
  --    PAGADO del segundo nivel se cobra: $25, ni el precio de catálogo del término (0) ni nada más.
  SELECT count(*) INTO v_mods_hijo
    FROM ticket_item_modificadores tim JOIN ticket_items hijo ON hijo.id = tim.ticket_item_id
   WHERE hijo.parent_item_id = v_padre1;
  IF v_mods_hijo <> 1 THEN RAISE EXCEPTION 'el término no llegó al componente (hay % modificadores de hijo)', v_mods_hijo; END IF;

  SELECT tim.monto_total_mxn, hijo.producto_id INTO v_extra_pagado_hijo, v_hijo_prod
    FROM ticket_item_modificadores tim JOIN ticket_items hijo ON hijo.id = tim.ticket_item_id
   WHERE hijo.parent_item_id = v_padre1;
  IF v_extra_pagado_hijo <> 25 THEN RAISE EXCEPTION 'el extra del segundo nivel debe cobrar 25, cobra %', v_extra_pagado_hijo; END IF;
  IF v_hijo_prod <> v_prod_hamb THEN RAISE EXCEPTION 'el término aterrizó en el hijo equivocado (%)', v_hijo_prod; END IF;

  -- 4) el ticket cuadra con el pago: lo que cobró Uber (total_cliente_mxn) es exactamente
  --    total_mxn del ticket: 190 (padre) + 25 (extra del término) = 215.
  SELECT total_mxn INTO v_total_ticket FROM tickets WHERE id = v_ticket1;
  SELECT total_cliente_mxn INTO v_total_pedido FROM delivery_pedidos WHERE id = v_pedido1;
  IF v_total_ticket <> v_total_pedido THEN
    RAISE EXCEPTION 'el ticket no cuadra con lo cobrado: ticket % vs pedido %', v_total_ticket, v_total_pedido;
  END IF;
  IF v_total_ticket <> 215 THEN RAISE EXCEPTION 'total del ticket 1 debe ser 215, es %', v_total_ticket; END IF;
  RAISE NOTICE 'pedido 1 OK: padre 190, hijos a 0 (suma 190), término 25 en la hamburguesa, ticket 215';

  -- ── Pedido 2: el mismo combo, pero pedido DOS VECES en la misma línea (cantidad=2). Corrección 1:
  -- monto_total_mxn del término debe multiplicar TAMBIÉN por la cantidad del hijo (que ya lleva
  -- dentro la cantidad del combo), no solo por la cantidad del propio modificador. Con el término a
  -- $10 y 2 combos, el hijo "hamburguesa" queda con cantidad=2 y el extra debe cobrar 10×1×2=20,
  -- no 10 (que sería el error: cobrar la mitad de lo que Uber cobró por el segundo combo).
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, conexion_id, app, id_externo, folio_corto, estado,
    cliente_nombre, items, total_cliente_mxn, vence_aceptacion)
  VALUES (v_tenant, v_suc, v_conexion, 'APP_UBEREATS', 'uber-combo-smoke-2', '9C002', 'RECIBIDO',
    'Cliente Uber Combo x2',
    jsonb_build_array(jsonb_build_object(
      'producto_id', v_combo, 'nombre_app', 'Combo Uber smoke', 'cantidad', 2,
      'precio_unitario_mxn', 45.00, 'nota', NULL,
      'modificadores', jsonb_build_array(
        jsonb_build_object('grupo_id', v_slot_hamb, 'opcion_modificador_id', v_prod_hamb,
          'nombre_app', 'Hamburguesa combo Uber smoke', 'cantidad', 1, 'precio_extra_mxn', 50.00,
          'modificadores', jsonb_build_array(
            jsonb_build_object('grupo_id', v_grupo_termino, 'opcion_modificador_id', v_opcion_termino,
              'nombre_app', 'Tres cuartos Uber smoke', 'cantidad', 1, 'precio_extra_mxn', 10.00))),
        jsonb_build_object('grupo_id', v_slot_beb, 'opcion_modificador_id', v_prod_beb,
          'nombre_app', 'Bebida combo Uber smoke', 'cantidad', 1, 'precio_extra_mxn', 5.00)))),
    220.00, now() + interval '11 minutes')
  RETURNING id INTO v_pedido2;

  v_ticket2 := crear_ticket_desde_app(v_pedido2);
  SELECT id INTO v_padre2 FROM ticket_items WHERE ticket_id = v_ticket2 AND combo_rol = 'PADRE';

  SELECT tim.monto_total_mxn, hijo.cantidad INTO v_monto_correccion, v_cant_hijo
    FROM ticket_item_modificadores tim JOIN ticket_items hijo ON hijo.id = tim.ticket_item_id
   WHERE hijo.parent_item_id = v_padre2;
  IF v_cant_hijo <> 2 THEN RAISE EXCEPTION 'fixture mal armada: el hijo debía tener cantidad 2 (1 componente × 2 combos), tiene %', v_cant_hijo; END IF;
  IF v_monto_correccion <> 20 THEN
    RAISE EXCEPTION 'con 2 combos el extra del segundo nivel debe cobrar 20 (10 × 1 × 2, no solo × la cantidad del modificador), cobra %', v_monto_correccion;
  END IF;

  SELECT total_mxn INTO v_total_ticket FROM tickets WHERE id = v_ticket2;
  SELECT total_cliente_mxn INTO v_total_pedido FROM delivery_pedidos WHERE id = v_pedido2;
  IF v_total_ticket <> v_total_pedido OR v_total_ticket <> 220 THEN
    RAISE EXCEPTION 'pedido de 2 combos no cuadra: ticket % vs pedido % (esperado 220)', v_total_ticket, v_total_pedido;
  END IF;
  RAISE NOTICE 'pedido 2 OK (cantidad>1): extra del segundo nivel 20 (10×1×2), ticket 220';

  -- 5) un slot incompleto (falta la Bebida) deja el pedido sin ticket, con excepción clara.
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, conexion_id, app, id_externo, folio_corto, estado,
    cliente_nombre, items, total_cliente_mxn, vence_aceptacion)
  VALUES (v_tenant, v_suc, v_conexion, 'APP_UBEREATS', 'uber-combo-smoke-3', '9C003', 'RECIBIDO',
    'Cliente Uber Combo incompleto',
    jsonb_build_array(jsonb_build_object(
      'producto_id', v_combo, 'nombre_app', 'Combo Uber smoke', 'cantidad', 1,
      'precio_unitario_mxn', 45.00, 'nota', NULL,
      'modificadores', jsonb_build_array(
        jsonb_build_object('grupo_id', v_slot_hamb, 'opcion_modificador_id', v_prod_hamb,
          'nombre_app', 'Hamburguesa combo Uber smoke', 'cantidad', 1, 'precio_extra_mxn', 130.00)))),
    175.00, now() + interval '11 minutes')
  RETURNING id INTO v_pedido3;

  BEGIN
    PERFORM crear_ticket_desde_app(v_pedido3);
    RAISE EXCEPTION 'debió fallar: falta un slot obligatorio';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%requiere entre%' THEN RAISE; END IF;
    RAISE NOTICE 'slot incompleto rechazado: % (esperado "requiere entre")', SQLERRM;
  END;
  SELECT ticket_id INTO v_ticket1 FROM delivery_pedidos WHERE id = v_pedido3;
  IF v_ticket1 IS NOT NULL THEN RAISE EXCEPTION 'el pedido incompleto no debió quedar con ticket'; END IF;

  RAISE NOTICE 'SMOKE COMBOS UBER OK';
END $$;
ROLLBACK;
