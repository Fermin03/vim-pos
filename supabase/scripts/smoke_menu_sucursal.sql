-- Smoke menú por sucursal (ADR 0027, spec 2026-10-02 §5 y §4.5). Sobre la semilla de dev: abre una
-- segunda sucursal (Norte) con su caja, le pone otro precio a la Clásica y al combo, apaga las
-- papas, y vende en las dos. ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant  uuid := '99999999-0000-0000-0000-0000000000aa';
  v_centro  uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja_c  uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria   uuid := '99999999-0000-0000-0000-000000000001';
  v_dueno   uuid := '99999999-0000-0000-0000-0000000000e1';
  v_cat_h   uuid := 'a0000000-0000-0000-0000-0000000000c1';
  v_clas    uuid := 'b0000000-0000-0000-0000-0000000000f1';  -- Hamburguesa Clásica $120
  v_papas   uuid := 'b0000000-0000-0000-0000-0000000000f2';  -- Papas Gajo $55
  v_norte   uuid := gen_random_uuid();
  v_caja_n  uuid := gen_random_uuid();
  v_turno_c uuid; v_turno_n uuid; v_t_c uuid; v_t_n uuid; v_item uuid;
  v_combo uuid; v_g_hamb uuid; v_g_acom uuid; v_padre uuid;
  v_precio numeric; v_bool boolean; v_pza uuid; v_pan uuid;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);

  -- Segunda sucursal con su caja. El plan del seed permite una: se amplía como lo haría el panel.
  INSERT INTO tenant_limites (tenant_id, max_sucursales) VALUES (v_tenant, 5)
    ON CONFLICT (tenant_id) DO UPDATE SET max_sucursales = 5;
  INSERT INTO sucursales (id, tenant_id, codigo, nombre) VALUES (v_norte, v_tenant, 'KN', 'León Norte');
  INSERT INTO cajas (id, tenant_id, sucursal_id, numero, nombre) VALUES (v_caja_n, v_tenant, v_norte, 1, 'Caja Norte');

  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja_c AND estado = 'ABIERTO';
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_centro, v_caja_c, 'SMOKE-MS-C', calcular_dia_contable(v_tenant), v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno_c;
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_norte, v_caja_n, 'SMOKE-MS-N', calcular_dia_contable(v_tenant), v_dueno, 500, 'TOTAL')
  RETURNING id INTO v_turno_n;

  v_t_c := abrir_ticket(v_centro, v_caja_c, v_turno_c, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-ms-c1', v_maria);
  v_t_n := abrir_ticket(v_norte,  v_caja_n, v_turno_n, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-ms-n1', v_dueno);

  -- 1) Precio por sucursal: la Clásica cuesta 135 en Norte; en Centro sigue en 120.
  INSERT INTO productos_sucursal (tenant_id, producto_id, sucursal_id, precio_mxn) VALUES (v_tenant, v_clas, v_norte, 135);
  v_item := agregar_item_a_ticket(v_t_c, v_clas, 1, NULL, '[]'::jsonb, 'smoke-ms-c1-i');
  SELECT precio_unitario_snapshot INTO v_precio FROM ticket_items WHERE id = v_item;
  IF v_precio <> 120 THEN RAISE EXCEPTION 'Centro debe cobrar 120, cobró %', v_precio; END IF;
  v_item := agregar_item_a_ticket(v_t_n, v_clas, 1, NULL, '[]'::jsonb, 'smoke-ms-n1-i');
  SELECT precio_unitario_snapshot INTO v_precio FROM ticket_items WHERE id = v_item;
  IF v_precio <> 135 THEN RAISE EXCEPTION 'Norte debe cobrar 135, cobró %', v_precio; END IF;
  RAISE NOTICE 'precio por sucursal OK: Centro 120, Norte 135';

  -- 2) Combo por sucursal: base 45 (50 en Norte) + Clásica (SUMA) + papas (delta 10).
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, es_combo, clave_sat)
  VALUES (v_tenant, v_cat_h, 'Combo smoke ms', 45, true, '90101503') RETURNING id INTO v_combo;
  INSERT INTO combo_grupos (tenant_id, combo_producto_id, nombre, orden_visualizacion, modo_precio, categoria_id)
  VALUES (v_tenant, v_combo, 'Hamburguesa', 1, 'SUMA_PRECIO_PRODUCTO', v_cat_h) RETURNING id INTO v_g_hamb;
  INSERT INTO combo_grupos (tenant_id, combo_producto_id, nombre, orden_visualizacion, modo_precio)
  VALUES (v_tenant, v_combo, 'Acompañamiento', 2, 'DELTA') RETURNING id INTO v_g_acom;
  INSERT INTO combo_opciones (tenant_id, grupo_id, producto_id, precio_delta_mxn, es_default)
  VALUES (v_tenant, v_g_acom, v_papas, 10, true);
  INSERT INTO productos_sucursal (tenant_id, producto_id, sucursal_id, precio_mxn) VALUES (v_tenant, v_combo, v_norte, 50);

  v_padre := agregar_combo_a_ticket(v_t_c, v_combo, 1, jsonb_build_array(
    jsonb_build_object('grupo_id', v_g_hamb, 'producto_id', v_clas,  'cantidad', 1),
    jsonb_build_object('grupo_id', v_g_acom, 'producto_id', v_papas, 'cantidad', 1)), '[]'::jsonb, NULL, 'smoke-ms-c-combo');
  SELECT precio_unitario_snapshot INTO v_precio FROM ticket_items WHERE id = v_padre;
  IF v_precio <> 175 THEN RAISE EXCEPTION 'combo en Centro debe ser 45+120+10 = 175, es %', v_precio; END IF;

  v_padre := agregar_combo_a_ticket(v_t_n, v_combo, 1, jsonb_build_array(
    jsonb_build_object('grupo_id', v_g_hamb, 'producto_id', v_clas,  'cantidad', 1),
    jsonb_build_object('grupo_id', v_g_acom, 'producto_id', v_papas, 'cantidad', 1)), '[]'::jsonb, NULL, 'smoke-ms-n-combo');
  SELECT precio_unitario_snapshot INTO v_precio FROM ticket_items WHERE id = v_padre;
  IF v_precio <> 195 THEN RAISE EXCEPTION 'combo en Norte debe ser 50+135+10 = 195, es %', v_precio; END IF;
  -- El prorrateo usa la carta de la sucursal (135 y 55) y tiene que cuadrar con el padre.
  SELECT sum(precio_asignado_mxn) INTO v_precio FROM ticket_items WHERE parent_item_id = v_padre;
  IF v_precio <> 195 THEN RAISE EXCEPTION 'el prorrateo en Norte debe sumar 195, suma %', v_precio; END IF;
  SELECT precio_unitario_original_snapshot INTO v_precio FROM ticket_items WHERE parent_item_id = v_padre AND producto_id = v_clas;
  IF v_precio <> 135 THEN RAISE EXCEPTION 'el hijo Clásica en Norte guarda su carta de 135, guarda %', v_precio; END IF;
  RAISE NOTICE 'combo por sucursal OK: Centro 175, Norte 195';

  -- 3) Apagar las papas en Norte: el combo de Norte las rechaza; en Centro se siguen vendiendo.
  INSERT INTO productos_sucursal (tenant_id, producto_id, sucursal_id, disponible) VALUES (v_tenant, v_papas, v_norte, false)
    ON CONFLICT (producto_id, sucursal_id) DO UPDATE SET disponible = false;
  BEGIN
    PERFORM agregar_combo_a_ticket(v_t_n, v_combo, 1, jsonb_build_array(
      jsonb_build_object('grupo_id', v_g_hamb, 'producto_id', v_clas,  'cantidad', 1),
      jsonb_build_object('grupo_id', v_g_acom, 'producto_id', v_papas, 'cantidad', 1)), '[]'::jsonb, NULL, 'smoke-ms-n-x1');
    RAISE EXCEPTION 'debió fallar: las papas no se venden en Norte';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%no se vende en esta sucursal%' THEN RAISE; END IF; END;
  PERFORM agregar_combo_a_ticket(v_t_c, v_combo, 1, jsonb_build_array(
    jsonb_build_object('grupo_id', v_g_hamb, 'producto_id', v_clas,  'cantidad', 1),
    jsonb_build_object('grupo_id', v_g_acom, 'producto_id', v_papas, 'cantidad', 1)), '[]'::jsonb, NULL, 'smoke-ms-c-combo2');
  -- El agregado suelto NO valida (invariante 7): un pedido de Uber pagado no se pierde por una carta vieja.
  PERFORM agregar_item_a_ticket(v_t_n, v_papas, 1, NULL, '[]'::jsonb, 'smoke-ms-n-papas');
  RAISE NOTICE 'disponibilidad por sucursal OK';

  -- 4) Agotar a mano solo en Centro: el combo de Centro lo rechaza y el producto no queda agotado en todas.
  INSERT INTO productos_sucursal (tenant_id, producto_id, sucursal_id, agotado_manual) VALUES (v_tenant, v_papas, v_centro, true)
    ON CONFLICT (producto_id, sucursal_id) DO UPDATE SET agotado_manual = true;
  BEGIN
    PERFORM agregar_combo_a_ticket(v_t_c, v_combo, 1, jsonb_build_array(
      jsonb_build_object('grupo_id', v_g_hamb, 'producto_id', v_clas,  'cantidad', 1),
      jsonb_build_object('grupo_id', v_g_acom, 'producto_id', v_papas, 'cantidad', 1)), '[]'::jsonb, NULL, 'smoke-ms-c-x2');
    RAISE EXCEPTION 'debió fallar: papas agotadas en Centro';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%agotado o pausado%' THEN RAISE; END IF; END;
  SELECT agotado_manual INTO v_bool FROM productos WHERE id = v_papas;
  IF v_bool THEN RAISE EXCEPTION 'agotar en una de dos sucursales no debe agotar el producto en todas'; END IF;
  RAISE NOTICE 'agotado manual por sucursal OK';

  -- 5) Agotado automático por sucursal (el bug de 0007:1684-1723). Pan con receta crítica en la Clásica:
  -- Centro sin pan, Norte con 5.
  SELECT id INTO v_pza FROM unidades_medida WHERE tenant_id = v_tenant AND codigo = 'PZA' LIMIT 1;
  INSERT INTO insumos (tenant_id, nombre, unidad_medida_id, categoria, costo_unitario_mxn)
  VALUES (v_tenant, 'Pan smoke ms', v_pza, 'PANIFICACION', 4) RETURNING id INTO v_pan;
  INSERT INTO insumo_stock_sucursal (tenant_id, insumo_id, sucursal_id, stock_actual)
  VALUES (v_tenant, v_pan, v_centro, 0), (v_tenant, v_pan, v_norte, 5);
  DELETE FROM recetas WHERE producto_id = v_clas;
  PERFORM guardar_receta(v_clas, true, NULL, jsonb_build_array(jsonb_build_object(
    'insumo_id', v_pan, 'cantidad', 1, 'cantidad_capturada', 1, 'unidad_capturada_id', v_pza,
    'es_critico', true, 'notas', NULL, 'orden', 0)));

  PERFORM evaluar_alertas_stock(v_pan, v_centro);
  SELECT agotado_automatico INTO v_bool FROM productos_sucursal WHERE producto_id = v_clas AND sucursal_id = v_centro;
  IF NOT coalesce(v_bool, false) THEN RAISE EXCEPTION 'sin pan en Centro, la Clásica debe quedar agotada en Centro'; END IF;
  SELECT agotado_automatico INTO v_bool FROM productos_sucursal WHERE producto_id = v_clas AND sucursal_id = v_norte;
  IF coalesce(v_bool, false) THEN RAISE EXCEPTION 'el pan que falta en Centro no debe agotar la Clásica en Norte'; END IF;
  SELECT agotado_automatico INTO v_bool FROM productos WHERE id = v_clas;
  IF v_bool THEN RAISE EXCEPTION 'agotada en una de dos sucursales: el producto no queda agotado en todas'; END IF;

  -- Reabastecer Norte NO des-agota Centro (antes sí: el restablecimiento actualizaba el producto entero).
  UPDATE insumo_stock_sucursal SET stock_actual = 10 WHERE insumo_id = v_pan AND sucursal_id = v_norte;
  PERFORM evaluar_alertas_stock(v_pan, v_norte);
  SELECT agotado_automatico INTO v_bool FROM productos_sucursal WHERE producto_id = v_clas AND sucursal_id = v_centro;
  IF NOT v_bool THEN RAISE EXCEPTION 'reabastecer Norte des-agotó la Clásica en Centro (el bug)'; END IF;

  -- Reabastecer Centro sí.
  UPDATE insumo_stock_sucursal SET stock_actual = 3 WHERE insumo_id = v_pan AND sucursal_id = v_centro;
  PERFORM evaluar_alertas_stock(v_pan, v_centro);
  SELECT agotado_automatico INTO v_bool FROM productos_sucursal WHERE producto_id = v_clas AND sucursal_id = v_centro;
  IF v_bool THEN RAISE EXCEPTION 'con pan otra vez en Centro, la Clásica debe volver'; END IF;
  RAISE NOTICE 'agotado automático por sucursal OK';
END $$;
ROLLBACK;
