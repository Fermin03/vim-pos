-- Smoke combos (ADR 0015, spec §4.4–§4.6). Sobre la semilla de dev: crea un combo genérico
-- (cualquier hamburguesa + acompañamiento), lo vende y verifica precio, prorrateo, validaciones,
-- cascada al cancelar, descuento de inventario por hijos y la vista de ventas. ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_cat_h  uuid := 'a0000000-0000-0000-0000-0000000000c1';
  v_clas   uuid := 'b0000000-0000-0000-0000-0000000000f1';  -- Hamburguesa Clásica $120
  v_papas  uuid := 'b0000000-0000-0000-0000-0000000000f2';  -- Papas Gajo $55
  v_combo uuid; v_g_hamb uuid; v_g_acom uuid; v_cat_beb uuid; v_refresco uuid;
  v_queso uuid; v_turno uuid; v_ticket uuid; v_padre uuid;
  v_g uuid; v_carne uuid; v_pza uuid;
  v_ensalada uuid; v_ticket2 uuid; v_padre2 uuid;
  v_combo2 uuid; v_g_hamb2 uuid; v_g_acom2 uuid; v_hamb_f uuid; v_papas_f uuid; v_cat_f uuid;
  v_ticket3 uuid; v_padre3 uuid;
  r record; v_total numeric; v_sub numeric; v_iva numeric; v_n int; v_suma numeric;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);
  UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=v_caja AND estado='ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-COMBO', CURRENT_DATE, v_maria, 500, 'TOTAL') RETURNING id INTO v_turno;

  -- Catálogo: un refresco en otra categoría (para probar "fuera del slot") y el combo
  INSERT INTO categorias(tenant_id, nombre, orden_visualizacion) VALUES (v_tenant, 'Bebidas smoke', 9) RETURNING id INTO v_cat_beb;
  INSERT INTO productos(tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_tenant, v_cat_beb, 'Refresco smoke', 30) RETURNING id INTO v_refresco;
  INSERT INTO productos(tenant_id, categoria_id, nombre, precio_base_mxn, es_combo, clave_sat)
  VALUES (v_tenant, v_cat_h, 'Combo smoke', 45, true, '90101503') RETURNING id INTO v_combo;
  INSERT INTO combo_grupos(tenant_id, combo_producto_id, nombre, orden_visualizacion, modo_precio, categoria_id)
  VALUES (v_tenant, v_combo, 'Hamburguesa', 1, 'SUMA_PRECIO_PRODUCTO', v_cat_h) RETURNING id INTO v_g_hamb;
  INSERT INTO combo_grupos(tenant_id, combo_producto_id, nombre, orden_visualizacion, modo_precio)
  VALUES (v_tenant, v_combo, 'Acompañamiento', 2, 'DELTA') RETURNING id INTO v_g_acom;
  INSERT INTO combo_opciones(tenant_id, grupo_id, producto_id, precio_delta_mxn, es_default)
  VALUES (v_tenant, v_g_acom, v_papas, 10, true);
  SELECT id INTO v_queso FROM opciones_modificador WHERE tenant_id=v_tenant AND nombre='Extra queso' LIMIT 1;

  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-combo-1', v_maria);

  -- 1) Vender: Clásica (suma 120) con extra queso (+15 en el hijo) + Papas (delta 10). Padre = 45+120+10 = 175
  v_padre := agregar_combo_a_ticket(v_ticket, v_combo, 1, jsonb_build_array(
    jsonb_build_object('grupo_id', v_g_hamb, 'producto_id', v_clas, 'cantidad', 1,
                       'modificadores', jsonb_build_array(jsonb_build_object('opcion_modificador_id', v_queso, 'cantidad', 1)),
                       'client_id_local', 'smoke-combo-h1'),
    jsonb_build_object('grupo_id', v_g_acom, 'producto_id', v_papas, 'cantidad', 1, 'client_id_local', 'smoke-combo-h2')),
    '[]'::jsonb, NULL, 'smoke-combo-p');

  SELECT precio_unitario_snapshot, total_item_mxn, combo_rol INTO r FROM ticket_items WHERE id = v_padre;
  IF r.combo_rol <> 'PADRE' OR r.precio_unitario_snapshot <> 175 THEN RAISE EXCEPTION 'padre mal: % %', r.combo_rol, r.precio_unitario_snapshot; END IF;
  SELECT count(*), sum(precio_unitario_snapshot), sum(precio_asignado_mxn)
    INTO v_n, v_total, v_suma FROM ticket_items WHERE parent_item_id = v_padre;
  IF v_n <> 2 THEN RAISE EXCEPTION 'esperaba 2 hijos, hay %', v_n; END IF;
  IF v_total <> 0 THEN RAISE EXCEPTION 'los hijos deben ir a precio 0 (suma %)', v_total; END IF;
  IF v_suma <> 175 THEN RAISE EXCEPTION 'el prorrateo debe sumar 175, suma %', v_suma; END IF;
  -- prorrateo proporcional a la carta: 175×120/175 = 120 y 55
  SELECT precio_asignado_mxn, precio_unitario_original_snapshot, combo_grupo_nombre_snapshot INTO r
    FROM ticket_items WHERE parent_item_id = v_padre AND producto_id = v_clas;
  IF r.precio_asignado_mxn <> 120 OR r.precio_unitario_original_snapshot <> 120 OR r.combo_grupo_nombre_snapshot <> 'Hamburguesa' THEN
    RAISE EXCEPTION 'hijo hamburguesa mal: % % %', r.precio_asignado_mxn, r.precio_unitario_original_snapshot, r.combo_grupo_nombre_snapshot; END IF;
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket;
  IF v_total <> 190 THEN RAISE EXCEPTION 'total del ticket debe ser 190 (175 + 15 extra), es %', v_total; END IF;
  RAISE NOTICE 'venta OK: padre 175, hijos a 0, prorrateo 120+55, total 190';

  -- 2) Idempotencia por client_id_local
  IF agregar_combo_a_ticket(v_ticket, v_combo, 1, '[]'::jsonb, '[]'::jsonb, NULL, 'smoke-combo-p') <> v_padre THEN
    RAISE EXCEPTION 'idempotencia rota'; END IF;

  -- 3) Validaciones
  BEGIN
    PERFORM agregar_combo_a_ticket(v_ticket, v_combo, 1, jsonb_build_array(
      jsonb_build_object('grupo_id', v_g_hamb, 'producto_id', v_clas, 'cantidad', 1)), '[]'::jsonb, NULL, 'smoke-combo-x1');
    RAISE EXCEPTION 'debió fallar: falta el slot Acompañamiento';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%requiere entre%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM agregar_combo_a_ticket(v_ticket, v_combo, 1, jsonb_build_array(
      jsonb_build_object('grupo_id', v_g_hamb, 'producto_id', v_refresco, 'cantidad', 1),
      jsonb_build_object('grupo_id', v_g_acom, 'producto_id', v_papas, 'cantidad', 1)), '[]'::jsonb, NULL, 'smoke-combo-x2');
    RAISE EXCEPTION 'debió fallar: refresco fuera del slot Hamburguesa';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%no es opción del slot%' THEN RAISE; END IF; END;
  UPDATE productos SET agotado_manual = true, estado = 'AGOTADO' WHERE id = v_papas;
  BEGIN
    PERFORM agregar_combo_a_ticket(v_ticket, v_combo, 1, jsonb_build_array(
      jsonb_build_object('grupo_id', v_g_hamb, 'producto_id', v_clas, 'cantidad', 1),
      jsonb_build_object('grupo_id', v_g_acom, 'producto_id', v_papas, 'cantidad', 1)), '[]'::jsonb, NULL, 'smoke-combo-x3');
    RAISE EXCEPTION 'debió fallar: papas agotadas';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%agotado o pausado%' THEN RAISE; END IF; END;
  UPDATE productos SET agotado_manual = false, estado = 'ACTIVO' WHERE id = v_papas;
  BEGIN
    PERFORM agregar_item_a_ticket(v_ticket, v_combo, 1, NULL, '[]'::jsonb, 'smoke-combo-x4');
    RAISE EXCEPTION 'debió fallar: un combo no entra por agregar_item_a_ticket';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%agregar_combo_a_ticket%' THEN RAISE; END IF; END;
  -- Hallazgo 1 (revisión ronda 1): un client_id_local de componente que ya es hijo de OTRO combo
  -- no se puede robar (agregar_item_a_ticket lo devolvería existente y este lo re-apadrinaría).
  -- 'smoke-combo-h2' ya es hijo del v_padre de la sección 1 (todavía sin cancelar).
  BEGIN
    PERFORM agregar_combo_a_ticket(v_ticket, v_combo, 1, jsonb_build_array(
      jsonb_build_object('grupo_id', v_g_hamb, 'producto_id', v_clas, 'cantidad', 1),
      jsonb_build_object('grupo_id', v_g_acom, 'producto_id', v_papas, 'cantidad', 1, 'client_id_local', 'smoke-combo-h2')),
      '[]'::jsonb, NULL, 'smoke-combo-x5');
    RAISE EXCEPTION 'debió fallar: el componente ya pertenece a otro combo';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%ya pertenece a otro renglón%' THEN RAISE; END IF; END;
  -- Hallazgo 7 (revisión final): dos componentes de la MISMA llamada con el mismo client_id_local.
  -- El segundo recibía la fila del primero —ya puesta a 0— y el prorrateo salía mal; la guarda
  -- ahora rechaza cualquier fila que ya sea HIJO, incluso de este mismo padre.
  BEGIN
    PERFORM agregar_combo_a_ticket(v_ticket, v_combo, 1, jsonb_build_array(
      jsonb_build_object('grupo_id', v_g_hamb, 'producto_id', v_clas, 'cantidad', 1, 'client_id_local', 'smoke-combo-dup'),
      jsonb_build_object('grupo_id', v_g_acom, 'producto_id', v_papas, 'cantidad', 1, 'client_id_local', 'smoke-combo-dup')),
      '[]'::jsonb, NULL, 'smoke-combo-x6');
    RAISE EXCEPTION 'debió fallar: dos componentes con el mismo client_id_local';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%ya pertenece a otro renglón%' THEN RAISE; END IF; END;
  -- Hallazgo 5 (revisión final): un modificador pagado en la línea del PADRE se cobraría sin
  -- llegar a ninguna vista de ventas (las tres excluyen combo_rol = 'PADRE'). Se rechaza en vez de
  -- subestimar los ingresos en silencio.
  BEGIN
    PERFORM agregar_combo_a_ticket(v_ticket, v_combo, 1, jsonb_build_array(
      jsonb_build_object('grupo_id', v_g_hamb, 'producto_id', v_clas, 'cantidad', 1),
      jsonb_build_object('grupo_id', v_g_acom, 'producto_id', v_papas, 'cantidad', 1)),
      jsonb_build_array(jsonb_build_object('opcion_modificador_id', v_queso, 'cantidad', 1)), NULL, 'smoke-combo-x7');
    RAISE EXCEPTION 'debió fallar: modificadores en la línea del combo';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%no se soportan todavía%' THEN RAISE; END IF; END;
  RAISE NOTICE 'validaciones OK';

  -- 4) Cancelar un hijo falla; cancelar el padre arrastra a los hijos
  BEGIN
    PERFORM cancelar_item_ticket((SELECT id FROM ticket_items WHERE parent_item_id = v_padre LIMIT 1), 'prueba', NULL);
    RAISE EXCEPTION 'debió fallar: un hijo no se cancela solo';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Cancela el combo completo%' THEN RAISE; END IF; END;
  PERFORM cancelar_item_ticket(v_padre, 'Cliente cambió de idea', NULL);
  SELECT count(*) INTO v_n FROM ticket_items WHERE (id = v_padre OR parent_item_id = v_padre) AND cancelado = false;
  IF v_n <> 0 THEN RAISE EXCEPTION 'quedaron % renglones sin cancelar', v_n; END IF;
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket;
  IF v_total <> 0 THEN RAISE EXCEPTION 'total tras cancelar debe ser 0, es %', v_total; END IF;
  RAISE NOTICE 'cascada OK';

  -- 5) Inventario: receta en la Clásica; al pagar descuenta por el hijo, nada por el padre
  INSERT INTO configuracion_tenant (tenant_id, modulo_inventario_activo) VALUES (v_tenant, true)
    ON CONFLICT (tenant_id) DO UPDATE SET modulo_inventario_activo = true;
  SELECT id INTO v_g   FROM unidades_medida WHERE tenant_id=v_tenant AND codigo='G' LIMIT 1;
  SELECT id INTO v_pza FROM unidades_medida WHERE tenant_id=v_tenant AND codigo='PZA' LIMIT 1;
  INSERT INTO insumos(tenant_id, nombre, unidad_medida_id, categoria, costo_unitario_mxn)
  VALUES (v_tenant, 'Carne combo smoke', v_g, 'CARNICOS', 0.18) RETURNING id INTO v_carne;
  DELETE FROM recetas WHERE producto_id = v_clas;
  PERFORM guardar_receta(v_clas, true, NULL, jsonb_build_array(
    jsonb_build_object('insumo_id', v_carne, 'cantidad', 150, 'cantidad_capturada', 150, 'unidad_capturada_id', v_g, 'es_critico', true, 'notas', NULL, 'orden', 0)));
  v_padre := agregar_combo_a_ticket(v_ticket, v_combo, 2, jsonb_build_array(
    jsonb_build_object('grupo_id', v_g_hamb, 'producto_id', v_clas, 'cantidad', 1),
    jsonb_build_object('grupo_id', v_g_acom, 'producto_id', v_papas, 'cantidad', 1)), '[]'::jsonb, NULL, 'smoke-combo-p2');
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket;
  IF v_total <> 350 THEN RAISE EXCEPTION 'dos combos deben costar 350, es %', v_total; END IF;
  PERFORM aplicar_pago(v_ticket, 'EFECTIVO'::metodo_pago, 350, 400, NULL, NULL, NULL, false, NULL, 'smoke-combo-pago');
  SELECT count(*), sum(cantidad) INTO v_n, v_suma FROM movimientos_inventario
   WHERE ticket_id = v_ticket AND insumo_id = v_carne AND tipo = 'SALIDA_VENTA';
  IF v_n <> 1 OR v_suma <> 300 THEN RAISE EXCEPTION 'esperaba 1 movimiento de 300 g (2 hijos × 150), hay % por %', v_n, v_suma; END IF;
  RAISE NOTICE 'inventario OK';

  -- 6) Vista de ventas: el padre no aparece; el hijo vale su precio asignado
  IF EXISTS (SELECT 1 FROM vw_ventas_por_producto WHERE tenant_id = v_tenant AND producto_nombre = 'Combo smoke') THEN
    RAISE EXCEPTION 'vw_ventas_por_producto no debe listar el padre'; END IF;
  SELECT coalesce(sum(total_mxn),0) INTO v_suma FROM vw_ventas_por_producto
   WHERE tenant_id = v_tenant AND producto_id = v_papas AND dia_contable = CURRENT_DATE;
  IF v_suma < 110 THEN RAISE EXCEPTION 'las papas en combo deben contar 2×55 = 110 en la vista (hay %)', v_suma; END IF;
  RAISE NOTICE 'vista de ventas OK';

  -- 7) IVA de un HIJO con iva_incluido_en_precio = false (hallazgo Important, revisión ronda 1):
  -- vw_ventas_por_producto/categoria deben ramificar el IVA del hijo igual que
  -- recalcular_totales_ticket (0008), no asumir siempre "precio ya trae IVA dentro".
  INSERT INTO productos(tenant_id, categoria_id, nombre, precio_base_mxn, tasa_iva, iva_incluido_en_precio)
  VALUES (v_tenant, v_cat_beb, 'Ensalada IVA aparte smoke', 40, 16, false) RETURNING id INTO v_ensalada;
  INSERT INTO combo_opciones(tenant_id, grupo_id, producto_id, precio_delta_mxn, es_default)
  VALUES (v_tenant, v_g_acom, v_ensalada, 20, false);
  -- La sección 5 dejó el insumo "Carne combo smoke" en 0 (sin fila en insumo_stock_sucursal) y el
  -- trigger de alertas ya auto-agotó la Clásica por insumo crítico agotado; para esta sección solo
  -- interesa el IVA, no el inventario, así que se reactiva igual que la sección 3 hace con las papas.
  UPDATE productos SET agotado_automatico = false, estado = 'ACTIVO', motivo_agotado = NULL WHERE id = v_clas;

  v_ticket2 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-combo-iva-1', v_maria);
  v_padre2 := agregar_combo_a_ticket(v_ticket2, v_combo, 1, jsonb_build_array(
    jsonb_build_object('grupo_id', v_g_hamb, 'producto_id', v_clas, 'cantidad', 1, 'client_id_local', 'smoke-combo-iva-h1'),
    jsonb_build_object('grupo_id', v_g_acom, 'producto_id', v_ensalada, 'cantidad', 1, 'client_id_local', 'smoke-combo-iva-h2')),
    '[]'::jsonb, NULL, 'smoke-combo-iva-p');

  -- Padre = 45 (combo) + 120 (Clásica, SUMA_PRECIO_PRODUCTO) + 20 (delta ensalada) = 185.
  -- Prorrateo de la ensalada (última del bucle, se lleva el residuo): 185 − round(185×120/160,2) = 46.25.
  SELECT precio_asignado_mxn INTO v_total FROM ticket_items WHERE parent_item_id = v_padre2 AND producto_id = v_ensalada;
  IF v_total <> 46.25 THEN RAISE EXCEPTION 'prorrateo de la ensalada debe ser 46.25, es %', v_total; END IF;

  PERFORM aplicar_pago(v_ticket2, 'EFECTIVO'::metodo_pago, 185, 200, NULL, NULL, NULL, false, NULL, 'smoke-combo-iva-pago');

  -- El dinero al que se le deriva el IVA (precio_asignado_mxn) es una rebanada del precio DEL
  -- PADRE y lleva su carácter fiscal, no el del hijo: el padre "Combo smoke" cobra con IVA dentro,
  -- así que la rebanada de 46.25 ya trae impuesto y el IVA es round(46.25 × 16/116, 2) = 6.38.
  -- Leerlo del snapshot DEL HIJO (16 % por afuera) daba 7.40, que es lo que esta sección bendecía:
  -- 1.02 de más por combo, invisible porque solo se miraba esa columna.
  --
  -- Se comprueban LAS TRES columnas y su relación, no una sola: con IVA dentro el impuesto ya vive
  -- dentro del subtotal (total = subtotal); con IVA por afuera se suma encima (total = subtotal +
  -- iva, sección 8). Es esa relación la que caza los dos defectos; un número suelto no.
  SELECT subtotal_mxn, iva_mxn, total_mxn INTO v_sub, v_iva, v_total FROM vw_ventas_por_producto
   WHERE tenant_id = v_tenant AND producto_id = v_ensalada AND dia_contable = CURRENT_DATE;
  IF v_sub <> 46.25 OR v_iva <> 6.38 OR v_total <> 46.25 THEN
    RAISE EXCEPTION 'hijo bajo padre con IVA dentro: esperaba 46.25 / 6.38 / 46.25, hay % / % / %', v_sub, v_iva, v_total;
  END IF;
  RAISE NOTICE 'IVA del hijo con el carácter fiscal del padre OK: 46.25 / 6.38 / 46.25';

  -- 8) El PADRE con iva_incluido_en_precio = false (hallazgo 2 de la revisión final): la rebanada
  -- prorrateada es un importe NETO y el ticket cobra neto × 1.16. Si la vista no le suma el IVA
  -- derivado a total_mxn, todo reporte de ventas queda corto por el IVA y la fila queda incoherente
  -- consigo misma (total < subtotal + iva).
  --
  -- Productos propios de esta sección a propósito: la vista agrega por producto/día, así que con
  -- las papas o la Clásica de las secciones anteriores no se podría aislar lo que aportó ESTE
  -- ticket. Los dos componentes llevan IVA DENTRO al 16 %, distinto del padre: si la vista leyera
  -- el snapshot del hijo en vez del padre, daría 25.52 en vez de 29.60.
  INSERT INTO productos(tenant_id, categoria_id, nombre, precio_base_mxn, tasa_iva, iva_incluido_en_precio)
  VALUES (v_tenant, v_cat_h, 'Hamburguesa fuera smoke', 120, 16, true) RETURNING id INTO v_hamb_f;
  INSERT INTO categorias(tenant_id, nombre, orden_visualizacion) VALUES (v_tenant, 'Acompanamientos fuera smoke', 10) RETURNING id INTO v_cat_f;
  INSERT INTO productos(tenant_id, categoria_id, nombre, precio_base_mxn, tasa_iva, iva_incluido_en_precio)
  VALUES (v_tenant, v_cat_f, 'Papas fuera smoke', 40, 16, true) RETURNING id INTO v_papas_f;
  INSERT INTO productos(tenant_id, categoria_id, nombre, precio_base_mxn, tasa_iva, iva_incluido_en_precio, es_combo, clave_sat)
  VALUES (v_tenant, v_cat_h, 'Combo IVA por fuera smoke', 45, 16, false, true, '90101503') RETURNING id INTO v_combo2;
  INSERT INTO combo_grupos(tenant_id, combo_producto_id, nombre, orden_visualizacion, modo_precio, categoria_id)
  VALUES (v_tenant, v_combo2, 'Hamburguesa', 1, 'SUMA_PRECIO_PRODUCTO', v_cat_h) RETURNING id INTO v_g_hamb2;
  INSERT INTO combo_grupos(tenant_id, combo_producto_id, nombre, orden_visualizacion, modo_precio)
  VALUES (v_tenant, v_combo2, 'Acompañamiento', 2, 'DELTA') RETURNING id INTO v_g_acom2;
  INSERT INTO combo_opciones(tenant_id, grupo_id, producto_id, precio_delta_mxn, es_default)
  VALUES (v_tenant, v_g_acom2, v_papas_f, 20, true);

  v_ticket3 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-combo-fuera-1', v_maria);
  v_padre3 := agregar_combo_a_ticket(v_ticket3, v_combo2, 1, jsonb_build_array(
    jsonb_build_object('grupo_id', v_g_hamb2, 'producto_id', v_hamb_f, 'cantidad', 1, 'client_id_local', 'smoke-combo-fuera-h1'),
    jsonb_build_object('grupo_id', v_g_acom2, 'producto_id', v_papas_f, 'cantidad', 1, 'client_id_local', 'smoke-combo-fuera-h2')),
    '[]'::jsonb, NULL, 'smoke-combo-fuera-p');

  -- Padre = 45 + 120 (hamburguesa) + 20 (delta papas) = 185 NETO; el ticket cobra 185 × 1.16 = 214.60.
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket3;
  IF v_total <> 214.60 THEN RAISE EXCEPTION 'el combo con IVA por fuera debe cobrar 214.60, es %', v_total; END IF;
  PERFORM aplicar_pago(v_ticket3, 'EFECTIVO'::metodo_pago, 214.60, 250, NULL, NULL, NULL, false, NULL, 'smoke-combo-fuera-pago');

  -- Prorrateo: 185 × 120/160 = 138.75 a la hamburguesa y 46.25 a las papas (residuo). La vista
  -- tiene que reportar lo que se cobró: 185 + 29.60 = 214.60, y cada fila con total = subtotal + iva.
  SELECT coalesce(sum(subtotal_mxn),0), coalesce(sum(iva_mxn),0), coalesce(sum(total_mxn),0)
    INTO v_sub, v_iva, v_total FROM vw_ventas_por_producto
   WHERE tenant_id = v_tenant AND dia_contable = CURRENT_DATE AND producto_id IN (v_hamb_f, v_papas_f);
  IF v_total <> v_sub + v_iva THEN
    RAISE EXCEPTION 'con IVA por fuera la fila debe cumplir total = subtotal + iva (% <> % + %)', v_total, v_sub, v_iva;
  END IF;
  IF v_sub <> 185.00 OR v_iva <> 29.60 OR v_total <> 214.60 THEN
    RAISE EXCEPTION 'combo con IVA por fuera: esperaba 185.00 / 29.60 / 214.60, hay % / % / %', v_sub, v_iva, v_total;
  END IF;
  -- Y la misma cifra por categoría: las tres vistas comparten la regla, no solo la de producto.
  SELECT coalesce(sum(total_mxn),0) INTO v_total FROM vw_ventas_por_categoria
   WHERE tenant_id = v_tenant AND dia_contable = CURRENT_DATE AND categoria = 'Acompanamientos fuera smoke';
  IF v_total <> 53.65 THEN
    RAISE EXCEPTION 'vw_ventas_por_categoria: las papas del combo con IVA por fuera valen 53.65, hay %', v_total;
  END IF;
  RAISE NOTICE 'combo con IVA por fuera OK: 185.00 / 29.60 / 214.60';

  RAISE NOTICE 'SMOKE COMBOS OK';
END $$;
ROLLBACK;
