-- Smoke de reemplazar_item_ticket (0119): editar un renglón de una cuenta abierta que todavía no
-- sale a cocina. Corre como postgres contra la BD sembrada, en transacción con ROLLBACK.
-- Objetivo: separar una unidad, cambiar todas, conservar el lugar en la cuenta, rechazar lo
--           enviado a cocina y lo ajeno, reintento idempotente, combos, y que los renglones
--           vivos sigan sumando el total del ticket (la invariante que protege el timbrado).
-- Uso: cd desktop && npm run smokes -- smoke_reemplazar_item.sql
BEGIN;

DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_cat    uuid;
  v_burger uuid := 'b0000000-0000-0000-0000-0000000000f1';  -- Hamburguesa Clásica, $120
  v_papas  uuid := 'b0000000-0000-0000-0000-0000000000f2';  -- Papas Gajo, $55
  v_combo  uuid;
  v_slot_h uuid;
  v_slot_p uuid;
  v_grupo  uuid;
  v_queso  uuid;
  v_tocino uuid;
  v_turno  uuid;
  v_ticket uuid;
  v_item   uuid;
  v_otro   uuid;
  v_cmb    uuid;
  v_nuevos uuid[];
  v_otra_vez uuid[];
  v_total  numeric(12,2);
  v_suma   numeric(12,2);
  v_n      integer;
  v_orden  text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);

  SELECT categoria_id INTO v_cat FROM productos WHERE id = v_burger;

  -- Modificadores de la hamburguesa: Queso +$15, Tocino +$20
  INSERT INTO grupos_modificadores (tenant_id, nombre, tipo_seleccion)
  VALUES (v_tenant, 'SMOKE Extras', 'MULTIPLE_OPCIONAL') RETURNING id INTO v_grupo;
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, precio_extra_mxn)
  VALUES (v_tenant, v_grupo, 'Queso', 15) RETURNING id INTO v_queso;
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, precio_extra_mxn)
  VALUES (v_tenant, v_grupo, 'Tocino', 20) RETURNING id INTO v_tocino;

  -- Combo $150: hamburguesa + papas
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, es_combo)
  VALUES (v_tenant, v_cat, 'SMOKE Combo', 150, true) RETURNING id INTO v_combo;
  INSERT INTO combo_grupos (tenant_id, combo_producto_id, nombre, orden_visualizacion)
  VALUES (v_tenant, v_combo, 'Hamburguesa', 1) RETURNING id INTO v_slot_h;
  INSERT INTO combo_grupos (tenant_id, combo_producto_id, nombre, orden_visualizacion)
  VALUES (v_tenant, v_combo, 'Papas', 2) RETURNING id INTO v_slot_p;
  INSERT INTO combo_opciones (tenant_id, grupo_id, producto_id, es_default) VALUES
    (v_tenant, v_slot_h, v_burger, true),
    (v_tenant, v_slot_p, v_papas, true);

  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable,
                      usuario_apertura_id, fondo_inicial_mxn)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-EDIT', current_date, v_maria, 1000.00)
  RETURNING id INTO v_turno;

  -- Cuenta: 3× hamburguesa con queso (3 × 135 = 405) y detrás 1× papas (55). Total 460.
  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'COMER_AQUI', NULL, NULL, NULL, v_maria);
  v_item := agregar_item_a_ticket(v_ticket, v_burger, 3, NULL,
    jsonb_build_array(jsonb_build_object('opcion_modificador_id', v_queso, 'cantidad', 1)), 'smoke-edit-1');
  v_otro := agregar_item_a_ticket(v_ticket, v_papas, 1, NULL, '[]'::jsonb, 'smoke-edit-papas');
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket;
  IF v_total <> 460.00 THEN RAISE EXCEPTION 'partida: esperaba 460.00, got %', v_total; END IF;

  -- 1) "Solo 1": 2× con queso + 1× con tocino y nota. Total 2×135 + 140 + 55 = 465.
  v_nuevos := reemplazar_item_ticket(v_item, jsonb_build_array(
    jsonb_build_object('producto_id', v_burger, 'cantidad', 2, 'client_id_local', 'smoke-edit-2',
      'modificadores', jsonb_build_array(jsonb_build_object('opcion_modificador_id', v_queso, 'cantidad', 1))),
    jsonb_build_object('producto_id', v_burger, 'cantidad', 1, 'client_id_local', 'smoke-edit-3',
      'nota_cocina', 'bien cocida',
      'modificadores', jsonb_build_array(jsonb_build_object('opcion_modificador_id', v_tocino, 'cantidad', 1)))
  ));
  IF array_length(v_nuevos, 1) <> 2 THEN RAISE EXCEPTION 'esperaba 2 renglones nuevos, got %', v_nuevos; END IF;
  IF (SELECT motivo_cancelacion FROM ticket_items WHERE id = v_item) IS DISTINCT FROM 'EDITADO'
    THEN RAISE EXCEPTION 'el renglón viejo no quedó cancelado como EDITADO'; END IF;
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket;
  IF v_total <> 465.00 THEN RAISE EXCEPTION 'tras separar: esperaba 465.00, got %', v_total; END IF;
  IF (SELECT nota_cocina FROM ticket_items WHERE id = v_nuevos[2]) IS DISTINCT FROM 'bien cocida'
    THEN RAISE EXCEPTION 'la nota no viajó a la línea editada'; END IF;

  -- 2) Siguen en el LUGAR del viejo: antes que las papas, que se capturaron después.
  SELECT string_agg(client_id_local, ',' ORDER BY orden_visualizacion) INTO v_orden
    FROM ticket_items WHERE ticket_id = v_ticket AND cancelado = false;
  IF v_orden <> 'smoke-edit-2,smoke-edit-3,smoke-edit-papas'
    THEN RAISE EXCEPTION 'orden inesperado tras editar: %', v_orden; END IF;

  -- 3) Reintento de la MISMA edición: devuelve lo mismo, no duplica ni truena.
  v_otra_vez := reemplazar_item_ticket(v_item, jsonb_build_array(
    jsonb_build_object('producto_id', v_burger, 'cantidad', 2, 'client_id_local', 'smoke-edit-2'),
    jsonb_build_object('producto_id', v_burger, 'cantidad', 1, 'client_id_local', 'smoke-edit-3')));
  IF v_otra_vez <> v_nuevos THEN RAISE EXCEPTION 'el reintento devolvió otros renglones: % vs %', v_otra_vez, v_nuevos; END IF;
  SELECT count(*) INTO v_n FROM ticket_items WHERE ticket_id = v_ticket AND cancelado = false;
  IF v_n <> 3 THEN RAISE EXCEPTION 'el reintento duplicó renglones: hay % vivos', v_n; END IF;

  -- 4) "Todas": las 2 con queso pasan a sin nada. Total 2×120 + 140 + 55 = 435.
  v_nuevos := reemplazar_item_ticket(v_nuevos[1], jsonb_build_array(
    jsonb_build_object('producto_id', v_burger, 'cantidad', 2, 'client_id_local', 'smoke-edit-4')));
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket;
  IF v_total <> 435.00 THEN RAISE EXCEPTION 'tras cambiar todas: esperaba 435.00, got %', v_total; END IF;

  -- 5) Otro producto: rechazado
  BEGIN
    PERFORM reemplazar_item_ticket(v_nuevos[1], jsonb_build_array(
      jsonb_build_object('producto_id', v_papas, 'cantidad', 2, 'client_id_local', 'smoke-edit-x')));
    RAISE EXCEPTION 'FALLO: se permitió cambiar el producto';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%mismo producto%' THEN RAISE; END IF;
  END;

  -- 6) Ya enviado a cocina: rechazado
  UPDATE ticket_items SET enviado_cocina_at = now() WHERE id = v_nuevos[1];
  BEGIN
    PERFORM reemplazar_item_ticket(v_nuevos[1], jsonb_build_array(
      jsonb_build_object('producto_id', v_burger, 'cantidad', 2, 'client_id_local', 'smoke-edit-y')));
    RAISE EXCEPTION 'FALLO: se editó un producto ya enviado a cocina';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%ya se mandó a cocina%' THEN RAISE; END IF;
  END;

  -- 7) Combo 2× → separar uno. Los hijos viejos se cancelan con el padre y los nuevos cuelgan
  --    del padre nuevo.
  v_cmb := agregar_combo_a_ticket(v_ticket, v_combo, 2, jsonb_build_array(
      jsonb_build_object('grupo_id', v_slot_h, 'producto_id', v_burger, 'cantidad', 1, 'client_id_local', 'smoke-c1-h'),
      jsonb_build_object('grupo_id', v_slot_p, 'producto_id', v_papas,  'cantidad', 1, 'client_id_local', 'smoke-c1-p')),
    '[]'::jsonb, NULL, 'smoke-c1');
  -- Reusar el id de un componente viejo se rechaza antes de tocar nada.
  BEGIN
    PERFORM reemplazar_item_ticket(v_cmb, jsonb_build_array(
      jsonb_build_object('combo_producto_id', v_combo, 'cantidad', 2, 'client_id_local', 'smoke-c2',
        'componentes', jsonb_build_array(
          jsonb_build_object('grupo_id', v_slot_h, 'producto_id', v_burger, 'cantidad', 1, 'client_id_local', 'smoke-c1-h'),
          jsonb_build_object('grupo_id', v_slot_p, 'producto_id', v_papas,  'cantidad', 1, 'client_id_local', 'smoke-c2-p')))));
    RAISE EXCEPTION 'FALLO: se aceptó un componente con client_id_local reusado';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%componente%ya existe%' THEN RAISE; END IF;
  END;

  v_nuevos := reemplazar_item_ticket(v_cmb, jsonb_build_array(
    jsonb_build_object('combo_producto_id', v_combo, 'cantidad', 1, 'client_id_local', 'smoke-c2',
      'componentes', jsonb_build_array(
        jsonb_build_object('grupo_id', v_slot_h, 'producto_id', v_burger, 'cantidad', 1, 'client_id_local', 'smoke-c2-h'),
        jsonb_build_object('grupo_id', v_slot_p, 'producto_id', v_papas,  'cantidad', 1, 'client_id_local', 'smoke-c2-p'))),
    jsonb_build_object('combo_producto_id', v_combo, 'cantidad', 1, 'client_id_local', 'smoke-c3',
      'componentes', jsonb_build_array(
        jsonb_build_object('grupo_id', v_slot_h, 'producto_id', v_burger, 'cantidad', 1, 'client_id_local', 'smoke-c3-h',
          'modificadores', jsonb_build_array(jsonb_build_object('opcion_modificador_id', v_queso, 'cantidad', 1))),
        jsonb_build_object('grupo_id', v_slot_p, 'producto_id', v_papas,  'cantidad', 1, 'client_id_local', 'smoke-c3-p')))
  ));
  SELECT count(*) INTO v_n FROM ticket_items WHERE parent_item_id = v_cmb AND cancelado = false;
  IF v_n <> 0 THEN RAISE EXCEPTION 'quedaron % hijos vivos del combo viejo', v_n; END IF;
  SELECT count(*) INTO v_n FROM ticket_items WHERE parent_item_id = ANY (v_nuevos) AND cancelado = false;
  IF v_n <> 4 THEN RAISE EXCEPTION 'esperaba 4 hijos en los combos nuevos, hay %', v_n; END IF;
  -- 435 + 150 + 165 (el queso del componente se cobra) = 750
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket;
  IF v_total <> 750.00 THEN RAISE EXCEPTION 'tras editar el combo: esperaba 750.00, got %', v_total; END IF;

  -- 8) Un hijo suelto no se edita: se edita el combo.
  BEGIN
    PERFORM reemplazar_item_ticket(
      (SELECT id FROM ticket_items WHERE client_id_local = 'smoke-c2-h'),
      jsonb_build_array(jsonb_build_object('producto_id', v_burger, 'cantidad', 1, 'client_id_local', 'smoke-edit-z')));
    RAISE EXCEPTION 'FALLO: se editó un componente suelto';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%combo completo%' THEN RAISE; END IF;
  END;

  -- 9) LA INVARIANTE DEL TIMBRADO: los renglones vivos suman el total del ticket.
  SELECT COALESCE(SUM(total_item_mxn), 0) INTO v_suma
    FROM ticket_items WHERE ticket_id = v_ticket AND cancelado = false;
  IF v_suma <> v_total THEN
    RAISE EXCEPTION 'renglones (%) no suman el total del ticket (%): el CFDI no timbraría', v_suma, v_total;
  END IF;

  RAISE NOTICE 'OK reemplazar_item_ticket';
END $$;

ROLLBACK;
