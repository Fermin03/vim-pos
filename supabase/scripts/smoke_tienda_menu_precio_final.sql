-- Smoke tienda en línea (mig. 0165): el menú trae el precio como se va a cobrar, y hay más
-- direcciones reservadas.
--   · precio_final_mxn (producto) y precio_extra_final_mxn (opción de modificador y de slot) salen
--     de la MISMA cuenta que tienda_cotizar (_tienda_con_iva): cotizar una unidad da ese precio.
--   · Los campos de siempre no cambian, y tienda_cotizar da lo mismo que antes al centavo: los
--     carritos de smoke_tienda_pedido.sql, con sus totales fijos calculados a mano.
-- Redondeo (a propósito, es el del ticket): el IVA por fuera se redondea POR RENGLÓN, sobre el
-- importe del renglón entero. Por eso n × precio_final puede diferir un centavo de cotizar n
-- unidades (3 × 38.66 = 115.98, y el ticket cobra 115.99), y precio_final + extra_final puede
-- diferir un centavo de cotizar la unidad con ese extra. El total que manda es el de cotizar.
-- Fixture propio sobre el negocio y la sucursal de la semilla.
-- Uso: cd desktop && npm run smokes -- smoke_tienda_menu_precio_final.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_cat uuid;
  v_p120 uuid; v_papas uuid; v_ref uuid; v_agua uuid; v_f33 uuid; v_f100 uuid; v_f8 uuid;
  v_combo uuid; v_combo_f uuid;
  v_g2 uuid; v_o15 uuid; v_o10 uuid;
  v_s_beb uuid; v_s_aco uuid; v_s_f uuid;
  v_z35 uuid; v_z0 uuid;
  v_menu jsonb; v_p jsonb; v_o jsonb; v_q jsonb; v_c jsonb; v_carritos jsonb;
  v_n int; v_n2 int; v_m int; v_m2 int; v_slug text; v_con text;
  r record;
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- ── Fixture: los productos de smoke_tienda_pedido.sql, más lo que hace falta para el IVA ──
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion) VALUES (v_t, 'Precio pf smoke', 60) RETURNING id INTO v_cat;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_t, v_cat, 'Sencilla pf', 120) RETURNING id INTO v_p120;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_t, v_cat, 'Papas pf', 30) RETURNING id INTO v_papas;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_t, v_cat, 'Refresco pf', 25) RETURNING id INTO v_ref;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_t, v_cat, 'Agua pf', 20) RETURNING id INTO v_agua;
  -- IVA por fuera.
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, tasa_iva, iva_incluido_en_precio)
  VALUES (v_t, v_cat, 'Fuera 16 pf', 33.33, 16, false) RETURNING id INTO v_f33;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, tasa_iva, iva_incluido_en_precio)
  VALUES (v_t, v_cat, 'Fuera 16 de cien pf', 100, 16, false) RETURNING id INTO v_f100;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, tasa_iva, iva_incluido_en_precio)
  VALUES (v_t, v_cat, 'Fuera 8 pf', 100, 8, false) RETURNING id INTO v_f8;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, es_combo)
  VALUES (v_t, v_cat, 'Combo pf', 150, true) RETURNING id INTO v_combo;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, es_combo, tasa_iva, iva_incluido_en_precio)
  VALUES (v_t, v_cat, 'Combo fuera pf', 100, true, 16, false) RETURNING id INTO v_combo_f;

  -- Los mismos extras en un producto con IVA incluido y en uno con IVA 16 % por fuera.
  INSERT INTO grupos_modificadores (tenant_id, nombre, tipo_seleccion) VALUES (v_t, 'Extras pf', 'MULTIPLE_OPCIONAL') RETURNING id INTO v_g2;
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, precio_extra_mxn, orden_visualizacion) VALUES (v_t, v_g2, 'Extra queso', 15, 1) RETURNING id INTO v_o15;
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, precio_extra_mxn, orden_visualizacion) VALUES (v_t, v_g2, 'Aguacate', 10, 2) RETURNING id INTO v_o10;
  INSERT INTO productos_grupos_modificadores (tenant_id, producto_id, grupo_id, orden_visualizacion) VALUES
    (v_t, v_p120, v_g2, 1), (v_t, v_f100, v_g2, 1);

  -- Combo con IVA incluido ($150): «Bebida» DELTA obligatoria; «Acompañamiento» SUMA_PRECIO_PRODUCTO
  -- hasta 2, donde también se puede elegir un producto con IVA por fuera.
  INSERT INTO combo_grupos (tenant_id, combo_producto_id, nombre, orden_visualizacion, modo_precio)
  VALUES (v_t, v_combo, 'Bebida', 1, 'DELTA') RETURNING id INTO v_s_beb;
  INSERT INTO combo_grupos (tenant_id, combo_producto_id, nombre, orden_visualizacion, modo_precio, minimo_selecciones, maximo_selecciones)
  VALUES (v_t, v_combo, 'Acompañamiento', 2, 'SUMA_PRECIO_PRODUCTO', 0, 2) RETURNING id INTO v_s_aco;
  INSERT INTO combo_opciones (tenant_id, grupo_id, producto_id, precio_delta_mxn, orden_visualizacion) VALUES
    (v_t, v_s_beb, v_ref, 10, 1), (v_t, v_s_beb, v_agua, 0, 2), (v_t, v_s_aco, v_papas, 5, 1), (v_t, v_s_aco, v_f100, 0, 2);
  -- Combo con IVA por fuera ($100 + 16 %): una elección sin costo y otra de $10.
  INSERT INTO combo_grupos (tenant_id, combo_producto_id, nombre, orden_visualizacion, modo_precio)
  VALUES (v_t, v_combo_f, 'Principal', 1, 'DELTA') RETURNING id INTO v_s_f;
  INSERT INTO combo_opciones (tenant_id, grupo_id, producto_id, precio_delta_mxn, orden_visualizacion) VALUES
    (v_t, v_s_f, v_p120, 0, 1), (v_t, v_s_f, v_ref, 10, 2);

  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn) VALUES (v_t, v_suc, 'Pf 35', 35) RETURNING id INTO v_z35;
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn) VALUES (v_t, v_suc, 'Pf gratis', 0) RETURNING id INTO v_z0;

  v_menu := tienda_menu(v_t, v_suc);

  -- ── 1) Los campos nuevos existen y los de siempre no cambian (valores fijos) ──
  FOR r IN SELECT * FROM (VALUES
      (v_p120,   'Sencilla pf',  '120.00', '120.00'),
      (v_papas,  'Papas pf',      '30.00',  '30.00'),
      (v_f33,    'Fuera 16 pf',   '33.33',  '38.66'),    -- 33.33 + round(5.3328)
      (v_f100,   'Fuera 16 de cien pf', '100.00', '116.00'),
      (v_f8,     'Fuera 8 pf',   '100.00', '108.00'),
      (v_combo,  'Combo pf',     '150.00', '150.00'),
      (v_combo_f,'Combo fuera pf','100.00', '116.00')) AS x(id, nombre, precio, final) LOOP
    v_p := jsonb_path_query_first(v_menu, '$.categorias[*].productos[*] ? (@.id == $id)', jsonb_build_object('id', r.id));
    IF v_p IS NULL THEN RAISE EXCEPTION '1: «%» no salió en el menú', r.nombre; END IF;
    IF NOT (v_p ? 'precio_final_mxn') THEN RAISE EXCEPTION '1: «%» no trae precio_final_mxn: %', r.nombre, v_p; END IF;
    IF v_p ->> 'precio_mxn' IS DISTINCT FROM r.precio OR v_p ->> 'precio_final_mxn' IS DISTINCT FROM r.final THEN
      RAISE EXCEPTION '1: «%»: esperaba precio_mxn % y precio_final_mxn %; dio % y %', r.nombre, r.precio, r.final,
        v_p ->> 'precio_mxn', v_p ->> 'precio_final_mxn';
    END IF;
    -- Las nueve claves de siempre más la nueva, y nada más.
    IF NOT (v_p ?& ARRAY['id', 'nombre', 'descripcion', 'imagen_url', 'precio_mxn', 'precio_final_mxn', 'agotado', 'es_combo', 'grupos', 'slots'])
       OR (SELECT count(*) FROM jsonb_object_keys(v_p)) <> 10 THEN
      RAISE EXCEPTION '1: claves del producto «%»: %', r.nombre, v_p;
    END IF;
  END LOOP;

  -- 2) Las opciones de modificador: el extra final lleva el IVA DEL PRODUCTO que las ofrece.
  v_o := jsonb_path_query_first(v_menu, '$.categorias[*].productos[*] ? (@.id == $p).grupos[*].opciones[*] ? (@.id == $o)',
                                jsonb_build_object('p', v_p120, 'o', v_o15));
  IF v_o IS DISTINCT FROM jsonb_build_object('id', v_o15, 'nombre', 'Extra queso', 'precio_extra_mxn', '15.00',
       'precio_extra_final_mxn', '15.00', 'agotada', false, 'es_default', false) THEN
    RAISE EXCEPTION '2: opción en un producto con IVA incluido: %', v_o;
  END IF;
  v_o := jsonb_path_query_first(v_menu, '$.categorias[*].productos[*] ? (@.id == $p).grupos[*].opciones[*] ? (@.id == $o)',
                                jsonb_build_object('p', v_f100, 'o', v_o15));
  IF v_o IS DISTINCT FROM jsonb_build_object('id', v_o15, 'nombre', 'Extra queso', 'precio_extra_mxn', '15.00',
       'precio_extra_final_mxn', '17.40', 'agotada', false, 'es_default', false) THEN
    RAISE EXCEPTION '2: opción en un producto con IVA 16 %% por fuera (15 + 2.40): %', v_o;
  END IF;

  -- 3) Las opciones de slot: el extra final lleva el IVA DEL COMBO (es el padre quien lo cobra); los
  --    modificadores de la opción, el IVA del producto elegido.
  FOR r IN SELECT * FROM (VALUES
      ('combo incluido · refresco (delta 10)',        v_combo,   v_ref,   '10.00',  '10.00'),
      ('combo incluido · agua (delta 0)',             v_combo,   v_agua,   '0.00',   '0.00'),
      ('combo incluido · papas (30 + 5)',             v_combo,   v_papas, '35.00',  '35.00'),
      ('combo incluido · producto con IVA por fuera', v_combo,   v_f100, '100.00', '100.00'),
      ('combo por fuera · sencilla (delta 0)',        v_combo_f, v_p120,   '0.00',   '0.00'),
      ('combo por fuera · refresco (10 + 1.60)',      v_combo_f, v_ref,   '10.00',  '11.60')) AS x(caso, combo, prod, extra, final) LOOP
    v_o := jsonb_path_query_first(v_menu, '$.categorias[*].productos[*] ? (@.id == $c).slots[*].opciones[*] ? (@.producto_id == $p)',
                                  jsonb_build_object('c', r.combo, 'p', r.prod));
    IF v_o ->> 'precio_extra_mxn' IS DISTINCT FROM r.extra OR v_o ->> 'precio_extra_final_mxn' IS DISTINCT FROM r.final THEN
      RAISE EXCEPTION '3: %: esperaba precio_extra_mxn % y precio_extra_final_mxn %: %', r.caso, r.extra, r.final, v_o;
    END IF;
    IF NOT (v_o ?& ARRAY['producto_id', 'nombre', 'precio_extra_mxn', 'precio_extra_final_mxn', 'agotado', 'es_default', 'grupos'])
       OR (SELECT count(*) FROM jsonb_object_keys(v_o)) <> 7 THEN
      RAISE EXCEPTION '3: claves de la opción de slot (%): %', r.caso, v_o;
    END IF;
  END LOOP;
  -- El hijo con IVA por fuera dentro de un combo con IVA incluido: su extra, 15 + 2.40.
  IF jsonb_path_query_first(v_menu, '$.categorias[*].productos[*] ? (@.id == $c).slots[*].opciones[*] ? (@.producto_id == $p).grupos[*].opciones[*] ? (@.id == $o)',
       jsonb_build_object('c', v_combo, 'p', v_f100, 'o', v_o15)) ->> 'precio_extra_final_mxn' IS DISTINCT FROM '17.40' THEN
    RAISE EXCEPTION '3: el extra de un hijo lleva el IVA del hijo (17.40)';
  END IF;
  -- Y al revés: el hijo con IVA incluido dentro de un combo con IVA por fuera, 15.00.
  IF jsonb_path_query_first(v_menu, '$.categorias[*].productos[*] ? (@.id == $c).slots[*].opciones[*] ? (@.producto_id == $p).grupos[*].opciones[*] ? (@.id == $o)',
       jsonb_build_object('c', v_combo_f, 'p', v_p120, 'o', v_o15)) ->> 'precio_extra_final_mxn' IS DISTINCT FROM '15.00' THEN
    RAISE EXCEPTION '3: el extra de un hijo con IVA incluido no lleva el IVA del combo (15.00)';
  END IF;

  -- 4) En TODO el menú (también lo de la semilla): cada importe de siempre tiene su pareja final, y
  --    todos son texto con dos decimales.
  SELECT count(*) INTO v_n  FROM jsonb_path_query(v_menu, '$.**.precio_mxn');
  SELECT count(*), count(*) FILTER (WHERE jsonb_typeof(x) = 'string' AND x #>> '{}' ~ '^-?[0-9]+\.[0-9]{2}$')
    INTO v_n2, v_m FROM jsonb_path_query(v_menu, '$.**.precio_final_mxn') x;
  IF v_n < 9 OR v_n <> v_n2 OR v_n <> v_m THEN RAISE EXCEPTION '4: % precio_mxn, % precio_final_mxn, % bien formados', v_n, v_n2, v_m; END IF;
  SELECT count(*) INTO v_n  FROM jsonb_path_query(v_menu, '$.**.precio_extra_mxn');
  SELECT count(*), count(*) FILTER (WHERE jsonb_typeof(x) = 'string' AND x #>> '{}' ~ '^-?[0-9]+\.[0-9]{2}$')
    INTO v_n2, v_m FROM jsonb_path_query(v_menu, '$.**.precio_extra_final_mxn') x;
  IF v_n < 12 OR v_n <> v_n2 OR v_n <> v_m THEN RAISE EXCEPTION '4: % precio_extra_mxn, % precio_extra_final_mxn, % bien formados', v_n, v_n2, v_m; END IF;

  -- ── 5) Una unidad sin nada: cotizar da EXACTAMENTE precio_final_mxn ─────────
  -- Todo producto del menú (también los de la semilla) que se puede pedir sin elegir nada.
  v_n := 0;
  FOR v_p IN SELECT p FROM jsonb_path_query(v_menu, '$.categorias[*].productos[*] ? (@.agotado == false)') p
              WHERE NOT jsonb_path_exists(p, '$.grupos[*] ? (@.minimo >= 1)')
                AND NOT jsonb_path_exists(p, '$.slots[*] ? (@.minimo >= 1)') LOOP
    v_n := v_n + 1;
    v_q := tienda_cotizar(v_t, v_suc, 'RECOGER', NULL, jsonb_build_array(jsonb_build_object('producto_id', v_p ->> 'id', 'cantidad', 1)));
    IF v_q ->> 'total_mxn' IS DISTINCT FROM v_p ->> 'precio_final_mxn' THEN
      RAISE EXCEPTION '5: «%»: cotizar una unidad da % y el menú dice %', v_p ->> 'nombre', v_q ->> 'total_mxn', v_p ->> 'precio_final_mxn';
    END IF;
  END LOOP;
  IF v_n < 7 THEN RAISE EXCEPTION '5 (fixture): esperaba al menos 7 productos que se piden sin elegir nada, hay %', v_n; END IF;

  -- ── 6) Con una opción de pago: precio final + extra final (valores fijos y suma del menú) ──
  v_carritos := jsonb_build_array(
    -- IVA incluido: 120 + 15.
    jsonb_build_object('caso', 'incluido + extra', 'tot', '135.00', 'suma', 120.00 + 15.00,
      'items', format('[{"producto_id":"%s","cantidad":1,"modificadores":[{"opcion_id":"%s","cantidad":1}]}]', v_p120, v_o15)::jsonb),
    -- IVA 16 % por fuera: (100 + 15) × 1.16 = 133.40 = 116.00 + 17.40.
    jsonb_build_object('caso', 'por fuera + extra', 'tot', '133.40', 'suma', 116.00 + 17.40,
      'items', format('[{"producto_id":"%s","cantidad":1,"modificadores":[{"opcion_id":"%s","cantidad":1}]}]', v_f100, v_o15)::jsonb),
    -- Combo con IVA incluido y elección de $10: 150 + 10.
    jsonb_build_object('caso', 'combo incluido + elección', 'tot', '160.00', 'suma', 150.00 + 10.00,
      'items', format('[{"producto_id":"%s","cantidad":1,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1}]}]', v_combo, v_s_beb, v_ref)::jsonb),
    -- Combo con IVA por fuera: la elección sin costo deja el precio base, 116.00…
    jsonb_build_object('caso', 'combo por fuera, base', 'tot', '116.00', 'suma', 116.00 + 0.00,
      'items', format('[{"producto_id":"%s","cantidad":1,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1}]}]', v_combo_f, v_s_f, v_p120)::jsonb),
    -- …y la de $10 suma 11.60: (100 + 10) × 1.16 = 127.60.
    jsonb_build_object('caso', 'combo por fuera + elección', 'tot', '127.60', 'suma', 116.00 + 11.60,
      'items', format('[{"producto_id":"%s","cantidad":1,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1}]}]', v_combo_f, v_s_f, v_ref)::jsonb),
    -- Combo incluido + agua (0) + hijo con IVA por fuera (100.00 en el padre) con extra (15 + 2.40 en el hijo).
    jsonb_build_object('caso', 'combo + hijo por fuera con extra', 'tot', '267.40', 'suma', 150.00 + 0.00 + 100.00 + 17.40,
      'items', format('[{"producto_id":"%s","cantidad":1,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1},{"grupo_id":"%s","producto_id":"%s","cantidad":1,"modificadores":[{"opcion_id":"%s","cantidad":1}]}]}]',
                      v_combo, v_s_beb, v_agua, v_s_aco, v_f100, v_o15)::jsonb));
  FOR v_c IN SELECT * FROM jsonb_array_elements(v_carritos) LOOP
    v_q := tienda_cotizar(v_t, v_suc, 'RECOGER', NULL, v_c -> 'items');
    IF v_q ->> 'total_mxn' IS DISTINCT FROM v_c ->> 'tot' OR (v_q ->> 'total_mxn')::numeric <> (v_c ->> 'suma')::numeric THEN
      RAISE EXCEPTION '6: %: cotizar dio %; esperaba % (= %)', v_c ->> 'caso', v_q ->> 'total_mxn', v_c ->> 'tot', v_c ->> 'suma';
    END IF;
  END LOOP;

  -- ── 7) tienda_cotizar no cambió ni un centavo: los carritos de smoke_tienda_pedido.sql ──
  v_carritos := jsonb_build_array(
    jsonb_build_object('n', 1, 'modo', 'RECOGER', 'sub', '660.00', 'env', '0.00', 'envtot', '0.00', 'tot', '660.00',
      'items', format('[{"producto_id":"%s","cantidad":2},'
                      || '{"producto_id":"%s","cantidad":2,"modificadores":[{"opcion_id":"%s","cantidad":1}]},'
                      || '{"producto_id":"%s","cantidad":1,"modificadores":[{"opcion_id":"%s","cantidad":2}]}]',
                      v_p120, v_p120, v_o15, v_p120, v_o15)::jsonb),
    -- 3 × 33.33 con IVA por fuera: el ticket redondea el IVA del renglón (99.99 + 16.00), que NO es
    -- 3 × 38.66 = 115.98. Con cantidades > 1 manda cotizar.
    jsonb_build_object('n', 2, 'modo', 'RECOGER', 'sub', '115.99', 'env', '0.00', 'envtot', '0.00', 'tot', '115.99',
      'items', format('[{"producto_id":"%s","cantidad":3}]', v_f33)::jsonb),
    jsonb_build_object('n', 3, 'modo', 'RECOGER', 'sub', '228.00', 'env', '0.00', 'envtot', '0.00', 'tot', '228.00',
      'items', format('[{"producto_id":"%s","cantidad":1},{"producto_id":"%s","cantidad":1}]', v_f8, v_p120)::jsonb),
    jsonb_build_object('n', 4, 'modo', 'DOMICILIO', 'zona', v_z35, 'sub', '240.00', 'env', '35.00', 'envtot', '35.00', 'tot', '275.00',
      'items', format('[{"producto_id":"%s","cantidad":2}]', v_p120)::jsonb),
    jsonb_build_object('n', 5, 'modo', 'DOMICILIO', 'zona', v_z35, 'sub', '116.00', 'env', '35.00', 'envtot', '40.60', 'tot', '156.60',
      'items', format('[{"producto_id":"%s","cantidad":1}]', v_f100)::jsonb),
    jsonb_build_object('n', 6, 'modo', 'DOMICILIO', 'zona', v_z0, 'sub', '240.00', 'env', '0.00', 'envtot', '0.00', 'tot', '240.00',
      'items', format('[{"producto_id":"%s","cantidad":2}]', v_p120)::jsonb),
    jsonb_build_object('n', 7, 'modo', 'RECOGER', 'sub', '530.00', 'env', '0.00', 'envtot', '0.00', 'tot', '530.00',
      'items', format('[{"producto_id":"%s","cantidad":1,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1}]},'
                      || '{"producto_id":"%s","cantidad":2,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1},{"grupo_id":"%s","producto_id":"%s","cantidad":1}]}]',
                      v_combo, v_s_beb, v_ref, v_combo, v_s_beb, v_agua, v_s_aco, v_papas)::jsonb),
    jsonb_build_object('n', 8, 'modo', 'RECOGER', 'sub', '252.00', 'env', '0.00', 'envtot', '0.00', 'tot', '252.00',
      'items', format('[{"producto_id":"%s","cantidad":2,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1,"modificadores":[{"opcion_id":"%s","cantidad":1}]}]}]',
                      v_combo_f, v_s_f, v_p120, v_o10)::jsonb),
    jsonb_build_object('n', 9, 'modo', 'DOMICILIO', 'zona', v_z35, 'sub', '963.66', 'env', '35.00', 'envtot', '35.00', 'tot', '998.66',
      'items', format('[{"producto_id":"%s","cantidad":3,"modificadores":[{"opcion_id":"%s","cantidad":1},{"opcion_id":"%s","cantidad":2}]},'
                      || '{"producto_id":"%s","cantidad":2,"componentes":[{"grupo_id":"%s","producto_id":"%s","cantidad":1},{"grupo_id":"%s","producto_id":"%s","cantidad":2}]},'
                      || '{"producto_id":"%s","cantidad":1}]',
                      v_p120, v_o15, v_o10, v_combo, v_s_beb, v_ref, v_s_aco, v_papas, v_f33)::jsonb));
  FOR v_c IN SELECT * FROM jsonb_array_elements(v_carritos) LOOP
    v_q := tienda_cotizar(v_t, v_suc, v_c ->> 'modo', (v_c ->> 'zona')::uuid, v_c -> 'items');
    IF ROW(v_q ->> 'subtotal_mxn', v_q ->> 'envio_mxn', v_q ->> 'envio_total_mxn', v_q ->> 'total_mxn')
       IS DISTINCT FROM ROW(v_c ->> 'sub', v_c ->> 'env', v_c ->> 'envtot', v_c ->> 'tot') THEN
      RAISE EXCEPTION '7: carrito %: esperaba subtotal %, envío %, envío total %, total %; dio %, %, %, %', v_c ->> 'n',
        v_c ->> 'sub', v_c ->> 'env', v_c ->> 'envtot', v_c ->> 'tot',
        v_q ->> 'subtotal_mxn', v_q ->> 'envio_mxn', v_q ->> 'envio_total_mxn', v_q ->> 'total_mxn';
    END IF;
    -- La salida es la de siempre, y los campos nuevos del menú no se cuelan en lo que va al ticket.
    IF (SELECT count(*) FROM jsonb_object_keys(v_q)) <> 6
       OR jsonb_path_exists(v_q, '$.**.precio_final_mxn') OR jsonb_path_exists(v_q, '$.**.precio_extra_final_mxn') THEN
      RAISE EXCEPTION '7: carrito %: la salida de cotizar cambió de forma: %', v_c ->> 'n', v_q;
    END IF;
  END LOOP;

  -- ── 8) Direcciones reservadas: las 19 nuevas, las 16 de antes, y las normales ──
  FOREACH v_slug IN ARRAY ARRAY[
      'seguimiento', 'carrito', 'entrar', 'registro', 'salir', 'icon', 'manifest', 'robots', 'sitemap', 'favicon',
      'menu', 'inicio', 'app', 'legal', 'aviso', 'contacto', 'vim-pos', 'soporte-vim', 'pedidos',
      'api', 'admin', 'pedido', 'cuenta', 'privacidad', 'terminos', 'static', 'assets',
      'vim', 'vimpos', 'soporte', 'login', 'pago', 'ayuda', 'www', 'tienda'] LOOP
    v_con := NULL;
    BEGIN
      INSERT INTO tienda_config (tenant_id, slug) VALUES (v_t, v_slug);
    EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    END;
    IF v_con IS DISTINCT FROM 'tienda_config_slug_check' THEN
      RAISE EXCEPTION '8: la dirección reservada «%» debía chocar con tienda_config_slug_check, dio %', v_slug, COALESCE(v_con, 'ningún error');
    END IF;
  END LOOP;
  -- Una normal entra, y una que solo CONTIENE una reservada también: el formato no cambió.
  INSERT INTO tienda_config (tenant_id, slug) VALUES (v_t, 'knockout-smoke');
  FOREACH v_slug IN ARRAY ARRAY['menu-del-dia', 'mi-app', 'pedidos-ana', 'vim-pos-fans', 'el-carrito', 'knockout-smoke'] LOOP
    UPDATE tienda_config SET slug = v_slug WHERE tenant_id = v_t;
  END LOOP;

  -- ── 9) Permisos: lo interno sigue sin puerta para el público ────────────────
  FOR r IN SELECT * FROM (VALUES ('_tienda_grupos_de(uuid, uuid)'), ('_tienda_con_iva(numeric, uuid, uuid)'), ('tienda_menu(uuid, uuid)')) AS x(f) LOOP
    IF has_function_privilege('anon', r.f, 'EXECUTE') OR has_function_privilege('authenticated', r.f, 'EXECUTE') THEN
      RAISE EXCEPTION '9: % quedó abierta a anon o authenticated', r.f;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('service_role', 'tienda_menu(uuid, uuid)', 'EXECUTE') THEN RAISE EXCEPTION '9: service_role perdió tienda_menu'; END IF;

  RAISE NOTICE 'smoke_tienda_menu_precio_final OK';
END $$;
ROLLBACK;
