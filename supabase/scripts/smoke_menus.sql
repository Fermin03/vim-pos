-- Smoke menús del catálogo (ADR 0029, spec 2026-10-05). Sobre la semilla: segunda sucursal (Norte),
-- «Menú Norte» creado por RPC, un precio propio y un producto apagado; vende en las dos sucursales
-- con las RPCs de 0152, que ahora alimenta el menú. ROLLBACK.
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
  v_menu uuid; v_turno_c uuid; v_turno_n uuid; v_t_c uuid; v_t_n uuid; v_item uuid; v_nuevo uuid; v_solo uuid;
  v_precio numeric; v_n int; v_bool boolean;
BEGIN
  -- Las RPCs de menús exigen config.productos: corre como el dueño.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_dueno::text, 'tenant_id', v_tenant::text)::text, true);

  INSERT INTO tenant_limites (tenant_id, max_sucursales) VALUES (v_tenant, 5)
    ON CONFLICT (tenant_id) DO UPDATE SET max_sucursales = 5;
  INSERT INTO sucursales (id, tenant_id, codigo, nombre) VALUES (v_norte, v_tenant, 'KN', 'León Norte');
  INSERT INTO cajas (id, tenant_id, sucursal_id, numero, nombre) VALUES (v_caja_n, v_tenant, v_norte, 1, 'Caja Norte');

  -- 1) Crear el menú copia el General: una fila por producto vivo, al precio del General.
  v_menu := crear_menu('Menú Norte', ARRAY[v_norte]);
  SELECT count(*) INTO v_n FROM menu_productos WHERE menu_id = v_menu;
  IF v_n <> (SELECT count(*) FROM productos WHERE tenant_id = v_tenant AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'el menú nuevo debe traer todos los productos (trae %)', v_n; END IF;
  SELECT precio_mxn INTO v_precio FROM menu_productos WHERE menu_id = v_menu AND producto_id = v_clas;
  IF v_precio <> 120 THEN RAISE EXCEPTION 'el menú nuevo arranca con el precio del General (120), trae %', v_precio; END IF;
  IF (SELECT menu_id FROM sucursales WHERE id = v_norte) IS DISTINCT FROM v_menu THEN
    RAISE EXCEPTION 'Norte debe quedar usando el menú nuevo'; END IF;
  BEGIN
    PERFORM crear_menu('menú norte', ARRAY[v_norte]);
    RAISE EXCEPTION 'debió fallar: nombre repetido';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Ya hay un menú con ese nombre%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM crear_menu('Sin sucursales', ARRAY[]::uuid[]);
    RAISE EXCEPTION 'debió fallar: sin sucursales';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%al menos una sucursal%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM crear_menu(repeat('x', 81), ARRAY[v_norte]);
    RAISE EXCEPTION 'debió fallar: nombre de más de 80 letras';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%80 letras%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM crear_menu(' general ', ARRAY[v_norte]);
    RAISE EXCEPTION 'debió fallar: General es el nombre del catálogo base';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Ese nombre es el del menú General%' THEN RAISE; END IF; END;
  RAISE NOTICE 'crear_menu OK';

  -- 2) Precio propio y un producto apagado en el menú; la venta los respeta.
  UPDATE menu_productos SET precio_mxn = 135 WHERE menu_id = v_menu AND producto_id = v_clas;
  UPDATE menu_productos SET disponible = false WHERE menu_id = v_menu AND producto_id = v_papas;

  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja_c AND estado = 'ABIERTO';
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_centro, v_caja_c, 'SMOKE-MN-C', calcular_dia_contable(v_tenant), v_maria, 500, 'TOTAL') RETURNING id INTO v_turno_c;
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_norte, v_caja_n, 'SMOKE-MN-N', calcular_dia_contable(v_tenant), v_dueno, 500, 'TOTAL') RETURNING id INTO v_turno_n;
  v_t_c := abrir_ticket(v_centro, v_caja_c, v_turno_c, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-mn-c1', v_maria);
  v_t_n := abrir_ticket(v_norte,  v_caja_n, v_turno_n, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-mn-n1', v_dueno);

  v_item := agregar_item_a_ticket(v_t_n, v_clas, 1, NULL, '[]'::jsonb, 'smoke-mn-n1-i');
  SELECT precio_unitario_snapshot INTO v_precio FROM ticket_items WHERE id = v_item;
  IF v_precio <> 135 THEN RAISE EXCEPTION 'Norte debe cobrar el precio de su menú (135), cobró %', v_precio; END IF;
  IF motivo_no_disponible_en_sucursal(v_papas, v_norte) IS DISTINCT FROM 'NO_SE_VENDE' THEN
    RAISE EXCEPTION 'las papas apagadas en el menú no se venden en Norte'; END IF;
  IF motivo_no_disponible_en_sucursal(v_papas, v_centro) IS NOT NULL THEN
    RAISE EXCEPTION 'en Centro (General) las papas se siguen vendiendo'; END IF;

  -- 3) Independencia: subir el precio en el General cambia Centro, no Norte.
  UPDATE productos SET precio_base_mxn = 150 WHERE id = v_clas;
  v_item := agregar_item_a_ticket(v_t_c, v_clas, 1, NULL, '[]'::jsonb, 'smoke-mn-c1-i');
  SELECT precio_unitario_snapshot INTO v_precio FROM ticket_items WHERE id = v_item;
  IF v_precio <> 150 THEN RAISE EXCEPTION 'Centro debe cobrar el precio nuevo del General (150), cobró %', v_precio; END IF;
  v_item := agregar_item_a_ticket(v_t_n, v_clas, 1, NULL, '[]'::jsonb, 'smoke-mn-n1-i2');
  SELECT precio_unitario_snapshot INTO v_precio FROM ticket_items WHERE id = v_item;
  IF v_precio <> 135 THEN RAISE EXCEPTION 'Norte no debe seguir al General (135), cobró %', v_precio; END IF;
  RAISE NOTICE 'venta por menú e independencia de precios OK';

  -- 4) Producto nuevo en el General: entra a todos los menús, al precio con que nació.
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn)
  VALUES (v_tenant, v_cat_h, 'Hamburguesa nueva smoke', 99) RETURNING id INTO v_nuevo;
  SELECT disponible, precio_mxn INTO v_bool, v_precio FROM menu_productos WHERE menu_id = v_menu AND producto_id = v_nuevo;
  IF v_bool IS DISTINCT FROM true OR v_precio <> 99 THEN RAISE EXCEPTION 'el producto nuevo debe entrar al menú encendido a 99 (%, %)', v_bool, v_precio; END IF;

  -- 5) Producto solo de Menú Norte: nace apagado en el General y en el menú; se enciende en Norte.
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, en_menu_general)
  VALUES (v_tenant, v_cat_h, 'Solo Norte smoke', 80, false) RETURNING id INTO v_solo;
  UPDATE menu_productos SET disponible = true WHERE menu_id = v_menu AND producto_id = v_solo;
  IF motivo_no_disponible_en_sucursal(v_solo, v_centro) IS DISTINCT FROM 'NO_SE_VENDE' THEN
    RAISE EXCEPTION 'un producto solo de Norte no se vende en Centro'; END IF;
  IF motivo_no_disponible_en_sucursal(v_solo, v_norte) IS NOT NULL THEN
    RAISE EXCEPTION 'un producto solo de Norte sí se vende en Norte'; END IF;
  RAISE NOTICE 'producto nuevo OK';

  -- 6) Editar: renombrar y dejar el menú sin sucursales; Norte vuelve al General y el menú se conserva.
  PERFORM actualizar_menu(v_menu, 'Menú Sucursal Norte', ARRAY[]::uuid[]);
  IF (SELECT menu_id FROM sucursales WHERE id = v_norte) IS NOT NULL THEN RAISE EXCEPTION 'Norte debió volver al General'; END IF;
  IF precio_producto_en_sucursal(v_clas, v_norte) <> 150 THEN RAISE EXCEPTION 'de vuelta en el General, Norte cobra 150'; END IF;
  IF (SELECT precio_mxn FROM menu_productos WHERE menu_id = v_menu AND producto_id = v_clas) <> 135 THEN
    RAISE EXCEPTION 'el menú sin sucursales conserva su contenido'; END IF;
  PERFORM actualizar_menu(v_menu, 'Menú Sucursal Norte', ARRAY[v_norte]);
  IF precio_producto_en_sucursal(v_clas, v_norte) <> 135 THEN RAISE EXCEPTION 'al reasignarlo, Norte vuelve a cobrar 135'; END IF;

  -- 7) Eliminar: Norte vuelve al General y el menú queda dado de baja.
  PERFORM eliminar_menu(v_menu);
  IF (SELECT menu_id FROM sucursales WHERE id = v_norte) IS NOT NULL THEN RAISE EXCEPTION 'al eliminar el menú, Norte vuelve al General'; END IF;
  IF (SELECT deleted_at FROM menus WHERE id = v_menu) IS NULL THEN RAISE EXCEPTION 'el menú debe quedar dado de baja'; END IF;
  IF motivo_no_disponible_en_sucursal(v_papas, v_norte) IS NOT NULL THEN RAISE EXCEPTION 'sin menú propio, Norte vuelve a vender papas'; END IF;
  -- El nombre de un menú eliminado se puede volver a usar.
  PERFORM crear_menu('Menú Sucursal Norte', ARRAY[v_norte]);
  RAISE NOTICE 'editar y eliminar OK';

  -- 8) Sin permiso no se crean menús.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);
  BEGIN
    PERFORM crear_menu('De la cajera', ARRAY[v_centro]);
    RAISE EXCEPTION 'debió fallar: la cajera no administra el catálogo';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%no puede modificar el catálogo%' THEN RAISE; END IF; END;
  RAISE NOTICE 'permisos OK';
END $$;
ROLLBACK;
