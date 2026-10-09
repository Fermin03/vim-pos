-- Smoke tienda en línea (mig. 0168): el dueño esconde categorías o productos de su tienda, por
-- sucursal. Sin filas en tienda_ocultos el menú es el de siempre; una categoría escondida no sale
-- ni saca sus productos; un producto escondido no sale ni se puede pedir suelto, pero sigue siendo
-- opción de un combo que sí se muestra. Solo dueño o administrador del negocio esconde y muestra.
-- Fixture propio sobre el negocio y la sucursal de la semilla; todo se afirma buscando por id.
-- Uso: cd desktop && npm run smokes -- smoke_tienda_menu_visible.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';   -- sucursal A
  v_cajero uuid := '99999999-0000-0000-0000-000000000001';
  v_dueno  uuid := '99999999-0000-0000-0000-0000000000e1';
  v_otro   uuid := '68686868-0000-0000-0000-0000000000aa';
  v_admin_otro uuid := '68686868-0000-0000-0000-0000000000e1';
  v_suc_b uuid; v_suc_o uuid; v_cat_o uuid; v_prod_o uuid;
  v_cat uuid; v_cat_beb uuid; v_cat_vacia uuid;
  v_h1 uuid; v_h2 uuid; v_combo uuid; v_ref uuid; v_agua uuid; v_efimero uuid; v_slot uuid;
  v_antes_a jsonb; v_antes_b jsonb; v_j jsonb; v_q jsonb;
  v_n integer; v_err text; v_abierto text;
  v_suelto jsonb; v_en_combo jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- ── Fixture, como postgres ────────────────────────────────────────────────
  INSERT INTO sucursales (tenant_id, codigo, nombre) VALUES (v_t, 'VB', 'Sucursal B visible smoke') RETURNING id INTO v_suc_b;
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion) VALUES (v_t, 'Hamburguesas visible smoke', 60) RETURNING id INTO v_cat;
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion) VALUES (v_t, 'Bebidas visible smoke', 61) RETURNING id INTO v_cat_beb;
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion) VALUES (v_t, 'Vacia visible smoke', 62) RETURNING id INTO v_cat_vacia;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, orden_visualizacion) VALUES (v_t, v_cat, 'Sencilla visible smoke', 100, 1) RETURNING id INTO v_h1;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, orden_visualizacion) VALUES (v_t, v_cat, 'Doble visible smoke', 140, 2) RETURNING id INTO v_h2;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, orden_visualizacion, es_combo) VALUES (v_t, v_cat, 'Combo visible smoke', 150, 3, true) RETURNING id INTO v_combo;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, orden_visualizacion) VALUES (v_t, v_cat_beb, 'Refresco visible smoke', 30, 1) RETURNING id INTO v_ref;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, orden_visualizacion) VALUES (v_t, v_cat_beb, 'Agua visible smoke', 20, 2) RETURNING id INTO v_agua;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, orden_visualizacion) VALUES (v_t, v_cat_beb, 'Efimero visible smoke', 10, 3) RETURNING id INTO v_efimero;
  -- El combo: un paso obligatorio «Bebida», por categoría.
  INSERT INTO combo_grupos (tenant_id, combo_producto_id, nombre, orden_visualizacion, modo_precio, categoria_id)
  VALUES (v_t, v_combo, 'Bebida', 1, 'DELTA', v_cat_beb) RETURNING id INTO v_slot;

  -- Otro negocio, con sucursal, categoría, producto y un administrador de verdad.
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_otro, 'tenant-0168', 'Otro negocio', 'INTERNO', 'QUICK_SERVICE');
  INSERT INTO sucursales (tenant_id, codigo, nombre) VALUES (v_otro, 'OT', 'Sucursal del otro') RETURNING id INTO v_suc_o;
  INSERT INTO categorias (tenant_id, nombre) VALUES (v_otro, 'Del otro') RETURNING id INTO v_cat_o;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_otro, v_cat_o, 'Producto del otro', 10) RETURNING id INTO v_prod_o;
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (v_admin_otro, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'admin-0168@smoke.dev', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);
  INSERT INTO usuarios_perfil (id, nombre, estado) VALUES (v_admin_otro, 'Admin del otro', 'ACTIVO') ON CONFLICT (id) DO NOTHING;
  INSERT INTO usuarios_acceso (usuario_id, tenant_id, rol_id)
  SELECT v_admin_otro, v_otro, id FROM roles WHERE tenant_id IS NULL AND codigo = 'ADMIN';

  v_suelto   := jsonb_build_array(jsonb_build_object('producto_id', v_ref, 'cantidad', 1));
  v_en_combo := jsonb_build_array(jsonb_build_object('producto_id', v_combo, 'cantidad', 1,
                  'componentes', jsonb_build_array(jsonb_build_object('grupo_id', v_slot, 'producto_id', v_ref, 'cantidad', 1))));

  -- ── 1) Sin filas, el menú de siempre ──────────────────────────────────────
  v_antes_a := tienda_menu(v_t, v_suc);
  v_antes_b := tienda_menu(v_t, v_suc_b);
  IF NOT jsonb_path_exists(v_antes_a, '$.categorias[*].productos[*] ? (@.id == $id)', jsonb_build_object('id', v_ref))
     OR NOT jsonb_path_exists(v_antes_a, '$.categorias[*].productos[*] ? (@.id == $id)', jsonb_build_object('id', v_combo)) THEN
    RAISE EXCEPTION '1: el fixture no sale en el menú de partida';
  END IF;
  IF tienda_cotizar(v_t, v_suc, 'RECOGER', NULL, v_suelto) ->> 'total_mxn' IS NULL THEN RAISE EXCEPTION '1: el refresco suelto debía cotizar'; END IF;

  -- ── 2) Un producto escondido en A: fuera de A, igual en B ─────────────────
  INSERT INTO tienda_ocultos (tenant_id, sucursal_id, producto_id) VALUES (v_t, v_suc, v_ref);
  v_j := tienda_menu(v_t, v_suc);
  IF jsonb_path_exists(v_j, '$.categorias[*].productos[*] ? (@.id == $id)', jsonb_build_object('id', v_ref)) THEN
    RAISE EXCEPTION '2: el producto escondido sigue en el menú de su sucursal';
  END IF;
  IF NOT jsonb_path_exists(v_j, '$.categorias[*].productos[*] ? (@.id == $id)', jsonb_build_object('id', v_agua)) THEN
    RAISE EXCEPTION '2: esconder un producto se llevó a su vecino';
  END IF;
  IF tienda_menu(v_t, v_suc_b) IS DISTINCT FROM v_antes_b THEN RAISE EXCEPTION '2: esconder en A cambió el menú de B'; END IF;

  -- Combos: el escondido sigue siendo opción del paso de un combo que sí se muestra…
  IF NOT jsonb_path_exists(v_j, '$.categorias[*].productos[*] ? (@.id == $c) .slots[*].opciones[*] ? (@.producto_id == $id)',
                           jsonb_build_object('c', v_combo, 'id', v_ref)) THEN
    RAISE EXCEPTION '2: el producto escondido dejó de ser opción del combo';
  END IF;
  -- …con todo y que el combo no cambió en nada.
  IF jsonb_path_query_first(v_j, '$.categorias[*].productos[*] ? (@.id == $c)', jsonb_build_object('c', v_combo))
     IS DISTINCT FROM jsonb_path_query_first(v_antes_a, '$.categorias[*].productos[*] ? (@.id == $c)', jsonb_build_object('c', v_combo)) THEN
    RAISE EXCEPTION '2: esconder una opción cambió el combo';
  END IF;

  -- ── 3) Cotizar: suelto no, dentro del combo sí; en B, como siempre ─────────
  v_err := NULL;
  BEGIN
    PERFORM tienda_cotizar(v_t, v_suc, 'RECOGER', NULL, v_suelto);
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  IF v_err IS NULL OR v_err NOT LIKE 'PRODUCTO_NO_DISPONIBLE:%' THEN
    RAISE EXCEPTION '3: cotizar suelto un producto escondido debía dar PRODUCTO_NO_DISPONIBLE, dio %', COALESCE(v_err, 'una cotización');
  END IF;
  v_q := tienda_cotizar(v_t, v_suc, 'RECOGER', NULL, v_en_combo);
  IF v_q ->> 'total_mxn' IS NULL OR v_q -> 'items' -> 0 -> 'modificadores' -> 0 ->> 'opcion_modificador_id' IS DISTINCT FROM v_ref::text THEN
    RAISE EXCEPTION '3: el combo con el producto escondido como componente debía cotizar: %', v_q;
  END IF;
  IF tienda_cotizar(v_t, v_suc_b, 'RECOGER', NULL, v_suelto) ->> 'total_mxn' IS NULL THEN RAISE EXCEPTION '3: en B el refresco suelto debía cotizar'; END IF;

  -- ── 4) Una categoría escondida: ni ella ni ninguno de sus productos ───────
  INSERT INTO tienda_ocultos (tenant_id, sucursal_id, categoria_id) VALUES (v_t, v_suc, v_cat);
  v_j := tienda_menu(v_t, v_suc);
  IF jsonb_path_exists(v_j, '$.categorias[*] ? (@.id == $id)', jsonb_build_object('id', v_cat)) THEN RAISE EXCEPTION '4: la categoría escondida sigue en el menú'; END IF;
  IF v_j::text LIKE '%' || v_h1 || '%' OR v_j::text LIKE '%' || v_h2 || '%' OR v_j::text LIKE '%' || v_combo || '%' THEN
    RAISE EXCEPTION '4: un producto de la categoría escondida sigue en el menú';
  END IF;
  IF NOT jsonb_path_exists(v_j, '$.categorias[*] ? (@.id == $id)', jsonb_build_object('id', v_cat_beb)) THEN RAISE EXCEPTION '4: esconder una categoría se llevó a otra'; END IF;
  v_err := NULL;
  BEGIN
    PERFORM tienda_cotizar(v_t, v_suc, 'RECOGER', NULL, jsonb_build_array(jsonb_build_object('producto_id', v_h1, 'cantidad', 1)));
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  IF v_err IS NULL OR v_err NOT LIKE 'PRODUCTO_NO_DISPONIBLE:%' THEN RAISE EXCEPTION '4: un producto de una categoría escondida no se cotiza: %', COALESCE(v_err, 'cotizó'); END IF;
  IF tienda_menu(v_t, v_suc_b) IS DISTINCT FROM v_antes_b THEN RAISE EXCEPTION '4: esconder una categoría en A cambió el menú de B'; END IF;

  -- Se muestra la categoría y se esconde solo el combo: el combo no sale, sus hermanos sí.
  DELETE FROM tienda_ocultos WHERE sucursal_id = v_suc AND categoria_id = v_cat;
  INSERT INTO tienda_ocultos (tenant_id, sucursal_id, producto_id) VALUES (v_t, v_suc, v_combo);
  v_j := tienda_menu(v_t, v_suc);
  IF jsonb_path_exists(v_j, '$.categorias[*].productos[*] ? (@.id == $id)', jsonb_build_object('id', v_combo)) THEN RAISE EXCEPTION '4: el combo escondido sigue en el menú'; END IF;
  IF NOT jsonb_path_exists(v_j, '$.categorias[*].productos[*] ? (@.id == $id)', jsonb_build_object('id', v_h1)) THEN RAISE EXCEPTION '4: al mostrar la categoría no volvieron sus productos'; END IF;
  v_err := NULL;
  BEGIN
    PERFORM tienda_cotizar(v_t, v_suc, 'RECOGER', NULL, v_en_combo);
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  IF v_err IS NULL OR v_err NOT LIKE 'PRODUCTO_NO_DISPONIBLE:%' THEN RAISE EXCEPTION '4: un combo escondido no se cotiza: %', COALESCE(v_err, 'cotizó'); END IF;

  -- Una categoría que se queda sin nada que enseñar desaparece, como cualquier categoría vacía.
  INSERT INTO tienda_ocultos (tenant_id, sucursal_id, producto_id) VALUES (v_t, v_suc, v_agua), (v_t, v_suc, v_efimero);
  IF jsonb_path_exists(tienda_menu(v_t, v_suc), '$.categorias[*] ? (@.id == $id)', jsonb_build_object('id', v_cat_beb)) THEN
    RAISE EXCEPTION '4: una categoría con todos sus productos escondidos sigue en el menú';
  END IF;

  -- ── 5) Borrar la fila lo devuelve: sin filas en A, el menú de partida ─────
  DELETE FROM tienda_ocultos WHERE sucursal_id = v_suc;
  IF tienda_menu(v_t, v_suc) IS DISTINCT FROM v_antes_a THEN RAISE EXCEPTION '5: al mostrar todo de nuevo el menú no quedó como antes'; END IF;

  -- ── 6) La forma de la tabla ───────────────────────────────────────────────
  BEGIN
    INSERT INTO tienda_ocultos (tenant_id, sucursal_id) VALUES (v_t, v_suc);
    RAISE EXCEPTION '6: aceptó una fila que no esconde nada';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO tienda_ocultos (tenant_id, sucursal_id, categoria_id, producto_id) VALUES (v_t, v_suc, v_cat, v_h1);
    RAISE EXCEPTION '6: aceptó una fila con categoría y producto a la vez';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  INSERT INTO tienda_ocultos (tenant_id, sucursal_id, producto_id) VALUES (v_t, v_suc_b, v_h2);
  INSERT INTO tienda_ocultos (tenant_id, sucursal_id, categoria_id) VALUES (v_t, v_suc_b, v_cat_vacia);
  BEGIN
    INSERT INTO tienda_ocultos (tenant_id, sucursal_id, producto_id) VALUES (v_t, v_suc_b, v_h2);
    RAISE EXCEPTION '6: escondió dos veces el mismo producto en la misma sucursal';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO tienda_ocultos (tenant_id, sucursal_id, categoria_id) VALUES (v_t, v_suc_b, v_cat_vacia);
    RAISE EXCEPTION '6: escondió dos veces la misma categoría en la misma sucursal';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  -- Nada de otro negocio con el tenant_id propio: ni su sucursal, ni su producto, ni su categoría.
  BEGIN
    INSERT INTO tienda_ocultos (tenant_id, sucursal_id, producto_id) VALUES (v_t, v_suc_o, v_h1);
    RAISE EXCEPTION '6: aceptó la sucursal de otro negocio';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO tienda_ocultos (tenant_id, sucursal_id, producto_id) VALUES (v_t, v_suc, v_prod_o);
    RAISE EXCEPTION '6: aceptó el producto de otro negocio';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO tienda_ocultos (tenant_id, sucursal_id, categoria_id) VALUES (v_t, v_suc, v_cat_o);
    RAISE EXCEPTION '6: aceptó la categoría de otro negocio';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  -- ── 7) Borrar el producto o la categoría limpia sus filas ─────────────────
  INSERT INTO tienda_ocultos (tenant_id, sucursal_id, producto_id) VALUES (v_t, v_suc, v_efimero);
  DELETE FROM productos WHERE id = v_efimero;
  DELETE FROM categorias WHERE id = v_cat_vacia;
  SELECT count(*) INTO v_n FROM tienda_ocultos WHERE tenant_id = v_t;
  IF v_n <> 1 THEN RAISE EXCEPTION '7: tras borrar un producto y una categoría quedaron % filas (esperaba 1: la de la Doble en B)', v_n; END IF;

  -- ── 8) Permisos. Queda una fila del negocio: la Doble escondida en B ──────
  INSERT INTO tienda_ocultos (tenant_id, sucursal_id, producto_id) VALUES (v_otro, v_suc_o, v_prod_o);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- El cajero lee lo de su negocio (y solo eso) pero ni esconde ni muestra.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cajero, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  SELECT count(*) INTO v_n FROM tienda_ocultos;
  IF v_n <> 1 THEN RAISE EXCEPTION '8: el cajero ve % filas (esperaba la de su negocio)', v_n; END IF;
  BEGIN
    INSERT INTO tienda_ocultos (tenant_id, sucursal_id, producto_id) VALUES (v_t, v_suc, v_h1);
    RAISE EXCEPTION '8: un cajero escondió un producto';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  DELETE FROM tienda_ocultos WHERE sucursal_id = v_suc_b;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RAISE EXCEPTION '8: un cajero volvió a mostrar un producto'; END IF;

  -- El administrador de OTRO negocio: no ve lo nuestro, ni lo escribe, ni lo borra.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_otro, 'role', 'authenticated', 'tenant_id', v_otro)::text, true);
  SELECT count(*) INTO v_n FROM tienda_ocultos WHERE tenant_id = v_t;
  IF v_n <> 0 THEN RAISE EXCEPTION '8: el administrador de otro negocio ve % filas nuestras', v_n; END IF;
  SELECT count(*) INTO v_n FROM tienda_ocultos;
  IF v_n <> 1 THEN RAISE EXCEPTION '8: el administrador del otro negocio debía ver su fila, ve %', v_n; END IF;
  BEGIN
    INSERT INTO tienda_ocultos (tenant_id, sucursal_id, producto_id) VALUES (v_t, v_suc, v_h1);
    RAISE EXCEPTION '8: el administrador de otro negocio escondió un producto nuestro';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  DELETE FROM tienda_ocultos WHERE tenant_id = v_t;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RAISE EXCEPTION '8: el administrador de otro negocio borró filas nuestras'; END IF;
  -- Lo suyo sí lo maneja.
  DELETE FROM tienda_ocultos WHERE tenant_id = v_otro;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION '8: el administrador del otro negocio no pudo mostrar su producto'; END IF;

  -- El dueño esconde y muestra en su negocio, y no escribe con el tenant_id de otro.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  INSERT INTO tienda_ocultos (tenant_id, sucursal_id, categoria_id) VALUES (v_t, v_suc, v_cat);
  DELETE FROM tienda_ocultos WHERE sucursal_id = v_suc AND categoria_id = v_cat;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION '8: el dueño no pudo volver a mostrar su categoría'; END IF;
  BEGIN
    INSERT INTO tienda_ocultos (tenant_id, sucursal_id, producto_id) VALUES (v_otro, v_suc_o, v_prod_o);
    RAISE EXCEPTION '8: el dueño escondió un producto de otro negocio';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- Al catálogo y no con un SELECT: «cero filas» también lo daría una tabla abierta y vacía.
  -- anon, nada; con sesión se lee, se inserta y se borra, pero una fila no se edita.
  SELECT string_agg(format('%s %s', r, p), ', ') INTO v_abierto
    FROM (VALUES ('anon', 'SELECT'), ('anon', 'INSERT'), ('anon', 'UPDATE'), ('anon', 'DELETE'), ('authenticated', 'UPDATE')) x(r, p)
   WHERE has_table_privilege(r, 'tienda_ocultos', p);
  IF v_abierto IS NOT NULL THEN RAISE EXCEPTION '8: tienda_ocultos con privilegios de más: %', v_abierto; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'tienda_ocultos'::regclass) THEN RAISE EXCEPTION '8: tienda_ocultos sin RLS'; END IF;

  RAISE NOTICE 'smoke_tienda_menu_visible OK';
END $$;
ROLLBACK;
