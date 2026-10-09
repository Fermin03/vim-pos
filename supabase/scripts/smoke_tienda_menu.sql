-- Smoke tienda en línea (mig. 0162 §2): tienda_menu. La tienda enseña lo que la caja vende en esa
-- sucursal: categorías y productos visibles, precio de la sucursal, agotados, grupos de
-- modificadores normalizados y combos con sus slots.
-- Fixture propio sobre el negocio y la sucursal de la semilla; los productos de la semilla también
-- salen en el menú, así que todo se afirma buscando por id, nunca por posición global.
-- Uso: cd desktop && npm run smokes -- smoke_tienda_menu.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_otro   uuid := '62626262-0000-0000-0000-0000000000ab';
  v_suc_o  uuid; v_cat_o uuid;
  v_cat uuid; v_cat_beb uuid; v_cat_in uuid;
  v_a uuid; v_b uuid; v_ps uuid; v_ag uuid; v_combo uuid;                 -- los que salen, en este orden: a, b, ag, ps, combo
  v_pau uuid; v_nv uuid; v_del uuid; v_nsv uuid; v_ajeno uuid; v_in uuid; -- los que no salen
  v_ref uuid; v_agua uuid; v_jugo uuid; v_te uuid; v_combo_beb uuid;      -- la categoría del slot
  v_g1 uuid; v_g2 uuid; v_g_inactivo uuid; v_o15 uuid; v_oneg uuid; v_o_inactiva uuid;
  v_s_beb uuid; v_s_aco uuid; v_s_inactivo uuid;
  v_j jsonb; v_c jsonb; v_p jsonb; v_g jsonb; v_s jsonb; v_o jsonb;
  v_ids text[]; v_pos_menu int; v_pos_beb int; v_n int;
  -- Detectores del caso 12: un número en una clave que no es minimo/maximo, y un importe que no es texto.
  v_re_numero  text := '"(?!minimo"|maximo")[a-z_]+": *-?[0-9]';
  v_re_importe text := '"[a-z_]*(precio|mxn)[a-z_]*": *[^" ]';
  -- Ida y vuelta con agregar_combo_a_ticket.
  v_caja uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria uuid := '99999999-0000-0000-0000-000000000001';
  v_turno uuid; v_ticket uuid; v_padre uuid; v_precio numeric; r record;
BEGIN
  -- ── Fixture ───────────────────────────────────────────────────────────────
  -- Otro negocio, con su sucursal y un producto colgado de UNA CATEGORÍA NUESTRA: si el menú se
  -- fiara de la categoría y no del tenant del producto, se colaría.
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_otro, 'tenant-0162-menu', 'Otro negocio', 'INTERNO', 'QUICK_SERVICE');
  INSERT INTO sucursales (tenant_id, codigo, nombre) VALUES (v_otro, 'OT', 'Sucursal del otro') RETURNING id INTO v_suc_o;

  -- Las categorías y los productos se insertan en desorden a propósito: el orden lo da orden_visualizacion.
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion) VALUES (v_t, 'Bebidas menu smoke', 51) RETURNING id INTO v_cat_beb;
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion) VALUES (v_t, 'Menu smoke', 50) RETURNING id INTO v_cat;
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion, activa) VALUES (v_t, 'Inactiva menu smoke', 49, false) RETURNING id INTO v_cat_in;
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion) VALUES (v_otro, 'Del otro', 1) RETURNING id INTO v_cat_o;

  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, orden_visualizacion, es_combo)
  VALUES (v_t, v_cat, 'Smoke combo', 45, 4, true) RETURNING id INTO v_combo;
  -- Mismo orden_visualizacion (3): desempata el nombre, «Smoke agotado» antes que «Smoke precio sucursal».
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, orden_visualizacion)
  VALUES (v_t, v_cat, 'Smoke precio sucursal', 90, 3) RETURNING id INTO v_ps;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, orden_visualizacion)
  VALUES (v_t, v_cat, 'Smoke agotado', 60, 3) RETURNING id INTO v_ag;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, orden_visualizacion)
  VALUES (v_t, v_cat, 'Smoke B simple', 80, 2) RETURNING id INTO v_b;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, orden_visualizacion)
  VALUES (v_t, v_cat, 'Smoke A con grupos', 100, 1) RETURNING id INTO v_a;

  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, estado)
  VALUES (v_t, v_cat, 'Smoke pausado', 10, 'PAUSADO') RETURNING id INTO v_pau;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, visible_en_pos)
  VALUES (v_t, v_cat, 'Smoke no visible', 10, false) RETURNING id INTO v_nv;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, deleted_at)
  VALUES (v_t, v_cat, 'Smoke borrado', 10, now()) RETURNING id INTO v_del;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn)
  VALUES (v_t, v_cat, 'Smoke no se vende aqui', 10) RETURNING id INTO v_nsv;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn)
  VALUES (v_otro, v_cat, 'Smoke de otro negocio', 10) RETURNING id INTO v_ajeno;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn)
  VALUES (v_t, v_cat_in, 'Smoke en categoria inactiva', 10) RETURNING id INTO v_in;

  INSERT INTO productos_sucursal (tenant_id, producto_id, sucursal_id, precio_mxn)     VALUES (v_t, v_ps,  v_suc, 75);
  INSERT INTO productos_sucursal (tenant_id, producto_id, sucursal_id, agotado_manual) VALUES (v_t, v_ag,  v_suc, true);
  INSERT INTO productos_sucursal (tenant_id, producto_id, sucursal_id, disponible)     VALUES (v_t, v_nsv, v_suc, false);

  -- Modificadores de A: un grupo obligatorio de dos opciones (más una inactiva), uno opcional con
  -- una opción de $15 y otra negativa, y un grupo inactivo.
  INSERT INTO grupos_modificadores (tenant_id, nombre, tipo_seleccion) VALUES (v_t, 'Término menu smoke', 'UNICA_OBLIGATORIA') RETURNING id INTO v_g1;
  INSERT INTO grupos_modificadores (tenant_id, nombre, tipo_seleccion) VALUES (v_t, 'Extras menu smoke', 'MULTIPLE_OPCIONAL') RETURNING id INTO v_g2;
  INSERT INTO grupos_modificadores (tenant_id, nombre, tipo_seleccion, activo) VALUES (v_t, 'Inactivo menu smoke', 'UNICA_OPCIONAL', false) RETURNING id INTO v_g_inactivo;
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, es_default, orden_visualizacion) VALUES (v_t, v_g1, 'Bien cocida', false, 2);
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, es_default, orden_visualizacion) VALUES (v_t, v_g1, 'Tres cuartos', true, 1);
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, activa, orden_visualizacion) VALUES (v_t, v_g1, 'Inactiva', false, 3) RETURNING id INTO v_o_inactiva;
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, precio_extra_mxn, orden_visualizacion) VALUES (v_t, v_g2, 'Extra queso', 15, 1) RETURNING id INTO v_o15;
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, precio_extra_mxn, orden_visualizacion) VALUES (v_t, v_g2, 'Descuento raro', -5, 2) RETURNING id INTO v_oneg;
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre) VALUES (v_t, v_g_inactivo, 'No importa');
  -- La liga manda el orden: g1 (1), g2 (2); el inactivo va en medio y no debe salir.
  INSERT INTO productos_grupos_modificadores (tenant_id, producto_id, grupo_id, orden_visualizacion)
  VALUES (v_t, v_a, v_g2, 3), (v_t, v_a, v_g_inactivo, 2), (v_t, v_a, v_g1, 1);

  -- La categoría del slot: tres bebidas que sí son opción, una excluida y un combo (nunca es opción).
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, orden_visualizacion) VALUES (v_t, v_cat_beb, 'Jugo menu smoke', 35, 3) RETURNING id INTO v_jugo;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, orden_visualizacion) VALUES (v_t, v_cat_beb, 'Agua menu smoke', 20, 2) RETURNING id INTO v_agua;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, orden_visualizacion) VALUES (v_t, v_cat_beb, 'Refresco menu smoke', 30, 1) RETURNING id INTO v_ref;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, orden_visualizacion) VALUES (v_t, v_cat_beb, 'Te menu smoke', 25, 4) RETURNING id INTO v_te;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, orden_visualizacion, es_combo)
  VALUES (v_t, v_cat_beb, 'Combo en bebidas menu smoke', 99, 5, true) RETURNING id INTO v_combo_beb;

  -- El combo: slot 2 de opciones explícitas (SUMA_PRECIO_PRODUCTO), slot 1 por categoría (DELTA) y uno inactivo.
  INSERT INTO combo_grupos (tenant_id, combo_producto_id, nombre, orden_visualizacion, modo_precio)
  VALUES (v_t, v_combo, 'Acompañamiento', 2, 'SUMA_PRECIO_PRODUCTO') RETURNING id INTO v_s_aco;
  INSERT INTO combo_grupos (tenant_id, combo_producto_id, nombre, orden_visualizacion, modo_precio, categoria_id)
  VALUES (v_t, v_combo, 'Bebida', 1, 'DELTA', v_cat_beb) RETURNING id INTO v_s_beb;
  INSERT INTO combo_grupos (tenant_id, combo_producto_id, nombre, orden_visualizacion, modo_precio, categoria_id, activo)
  VALUES (v_t, v_combo, 'Slot inactivo', 3, 'DELTA', v_cat_beb, false) RETURNING id INTO v_s_inactivo;
  -- Slot por categoría: el jugo trae delta y es el default; el té está excluido (activa = false).
  INSERT INTO combo_opciones (tenant_id, grupo_id, producto_id, precio_delta_mxn, es_default) VALUES (v_t, v_s_beb, v_jugo, 5, true);
  INSERT INTO combo_opciones (tenant_id, grupo_id, producto_id, activa) VALUES (v_t, v_s_beb, v_te, false);
  -- Slot explícito: A (100 + delta 10), el de precio de sucursal (75, no 90) y B excluido.
  INSERT INTO combo_opciones (tenant_id, grupo_id, producto_id, precio_delta_mxn, orden_visualizacion) VALUES (v_t, v_s_aco, v_a, 10, 2);
  INSERT INTO combo_opciones (tenant_id, grupo_id, producto_id, precio_delta_mxn, orden_visualizacion) VALUES (v_t, v_s_aco, v_ps, 0, 1);
  INSERT INTO combo_opciones (tenant_id, grupo_id, producto_id, precio_delta_mxn, orden_visualizacion, activa) VALUES (v_t, v_s_aco, v_b, 0, 3, false);

  -- ── El menú ───────────────────────────────────────────────────────────────
  v_j := tienda_menu(v_t, v_suc);

  -- 1) La categoría activa con sus productos visibles, en orden; la inactiva no sale.
  v_c := jsonb_path_query_first(v_j, '$.categorias[*] ? (@.id == $id)', jsonb_build_object('id', v_cat));
  IF v_c IS NULL THEN RAISE EXCEPTION '1: no salió la categoría activa: %', v_j; END IF;
  IF v_c ->> 'nombre' <> 'Menu smoke' THEN RAISE EXCEPTION '1: nombre de la categoría: %', v_c ->> 'nombre'; END IF;
  SELECT array_agg(p ->> 'id' ORDER BY ord) INTO v_ids FROM jsonb_array_elements(v_c -> 'productos') WITH ORDINALITY AS x(p, ord);
  IF v_ids IS DISTINCT FROM ARRAY[v_a, v_b, v_ag, v_ps, v_combo]::text[] THEN
    RAISE EXCEPTION '1: productos u orden: esperaba a, b, agotado, precio sucursal, combo; dio %', v_c -> 'productos';
  END IF;
  IF jsonb_path_exists(v_j, '$.categorias[*] ? (@.id == $id)', jsonb_build_object('id', v_cat_in)) THEN RAISE EXCEPTION '1: salió la categoría inactiva'; END IF;
  SELECT max(ord) FILTER (WHERE c ->> 'id' = v_cat::text), max(ord) FILTER (WHERE c ->> 'id' = v_cat_beb::text)
    INTO v_pos_menu, v_pos_beb FROM jsonb_array_elements(v_j -> 'categorias') WITH ORDINALITY AS x(c, ord);
  IF v_pos_menu IS NULL OR v_pos_beb IS NULL OR v_pos_menu >= v_pos_beb THEN
    RAISE EXCEPTION '1: las categorías no van por orden_visualizacion (menu %, bebidas %)', v_pos_menu, v_pos_beb;
  END IF;
  v_p := jsonb_path_query_first(v_c, '$.productos[*] ? (@.id == $id)', jsonb_build_object('id', v_a));
  IF NOT (v_p ?& ARRAY['id', 'nombre', 'descripcion', 'imagen_url', 'precio_mxn', 'agotado', 'es_combo', 'grupos', 'slots']) THEN
    RAISE EXCEPTION '1: faltan claves en el producto: %', v_p;
  END IF;
  IF v_p ->> 'nombre' <> 'Smoke A con grupos' OR v_p ->> 'precio_mxn' <> '100.00' OR (v_p ->> 'agotado')::boolean
     OR (v_p ->> 'es_combo')::boolean OR v_p -> 'slots' <> '[]'::jsonb THEN
    RAISE EXCEPTION '1: producto A mal: %', v_p;
  END IF;

  -- 2) No salen —en ningún lado del JSON— el pausado, el no visible, el borrado, el de otro negocio,
  -- el que esta sucursal no vende ni el de la categoría inactiva.
  IF v_j::text LIKE '%' || v_pau::text   || '%' THEN RAISE EXCEPTION '2: salió el pausado'; END IF;
  IF v_j::text LIKE '%' || v_nv::text    || '%' THEN RAISE EXCEPTION '2: salió el no visible'; END IF;
  IF v_j::text LIKE '%' || v_del::text   || '%' THEN RAISE EXCEPTION '2: salió el borrado'; END IF;
  IF v_j::text LIKE '%' || v_ajeno::text || '%' THEN RAISE EXCEPTION '2: salió el de otro negocio'; END IF;
  IF v_j::text LIKE '%' || v_nsv::text   || '%' THEN RAISE EXCEPTION '2: salió el que no se vende en esta sucursal'; END IF;
  IF v_j::text LIKE '%' || v_in::text    || '%' THEN RAISE EXCEPTION '2: salió el de la categoría inactiva'; END IF;

  -- 3) El precio de la sucursal, no el base.
  v_p := jsonb_path_query_first(v_c, '$.productos[*] ? (@.id == $id)', jsonb_build_object('id', v_ps));
  IF v_p ->> 'precio_mxn' IS DISTINCT FROM '75.00' THEN RAISE EXCEPTION '3: esperaba 75.00 (sucursal), dio %', v_p ->> 'precio_mxn'; END IF;
  IF (v_p ->> 'agotado')::boolean THEN RAISE EXCEPTION '3: el de precio de sucursal no está agotado'; END IF;

  -- 4) El agotado sale, con agotado = true.
  v_p := jsonb_path_query_first(v_c, '$.productos[*] ? (@.id == $id)', jsonb_build_object('id', v_ag));
  IF (v_p ->> 'agotado')::boolean IS NOT TRUE THEN RAISE EXCEPTION '4: el agotado debía salir con agotado = true: %', v_p; END IF;
  IF v_p ->> 'precio_mxn' <> '60.00' THEN RAISE EXCEPTION '4: precio del agotado %', v_p ->> 'precio_mxn'; END IF;

  -- 5) minimo/maximo normalizados por tipo de selección (en la base están en NULL).
  v_p := jsonb_path_query_first(v_c, '$.productos[*] ? (@.id == $id)', jsonb_build_object('id', v_a));
  IF jsonb_array_length(v_p -> 'grupos') <> 2 OR v_p -> 'grupos' -> 0 ->> 'id' <> v_g1::text OR v_p -> 'grupos' -> 1 ->> 'id' <> v_g2::text THEN
    RAISE EXCEPTION '5: esperaba los grupos g1, g2 en el orden de la liga y sin el inactivo: %', v_p -> 'grupos';
  END IF;
  v_g := v_p -> 'grupos' -> 0;
  IF NOT (v_g ?& ARRAY['id', 'nombre', 'tipo_seleccion', 'minimo', 'maximo', 'opciones']) THEN RAISE EXCEPTION '5: faltan claves en el grupo: %', v_g; END IF;
  IF v_g ->> 'tipo_seleccion' <> 'UNICA_OBLIGATORIA' OR v_g -> 'minimo' <> '1'::jsonb OR v_g -> 'maximo' <> '1'::jsonb THEN
    RAISE EXCEPTION '5: UNICA_OBLIGATORIA debía salir 1/1: %', v_g;
  END IF;
  IF jsonb_array_length(v_g -> 'opciones') <> 2
     OR v_g -> 'opciones' -> 0 ->> 'nombre' <> 'Tres cuartos' OR (v_g -> 'opciones' -> 0 ->> 'es_default')::boolean IS NOT TRUE
     OR v_g -> 'opciones' -> 1 ->> 'nombre' <> 'Bien cocida'  OR (v_g -> 'opciones' -> 1 ->> 'es_default')::boolean IS NOT FALSE
     OR (v_g -> 'opciones' -> 0 ->> 'agotada')::boolean IS NOT FALSE
     OR v_g -> 'opciones' -> 0 ->> 'precio_extra_mxn' <> '0.00' THEN
    RAISE EXCEPTION '5: opciones del grupo obligatorio (dos, por orden, sin la inactiva): %', v_g -> 'opciones';
  END IF;
  v_g := v_p -> 'grupos' -> 1;
  IF v_g ->> 'tipo_seleccion' <> 'MULTIPLE_OPCIONAL' OR v_g -> 'minimo' <> '0'::jsonb
     OR NOT (v_g ? 'maximo') OR jsonb_typeof(v_g -> 'maximo') <> 'null' THEN
    RAISE EXCEPTION '5: MULTIPLE_OPCIONAL debía salir con minimo 0 y maximo null: %', v_g;
  END IF;

  -- 6) La opción negativa no sale; la de $15 sale como "15.00".
  IF jsonb_array_length(v_g -> 'opciones') <> 1 OR v_g -> 'opciones' -> 0 ->> 'id' <> v_o15::text
     OR v_g -> 'opciones' -> 0 ->> 'precio_extra_mxn' <> '15.00' THEN
    RAISE EXCEPTION '6: esperaba solo la opción de 15.00: %', v_g -> 'opciones';
  END IF;
  IF v_j::text LIKE '%' || v_oneg::text || '%' THEN RAISE EXCEPTION '6: salió la opción de precio negativo'; END IF;
  IF v_j::text LIKE '%' || v_o_inactiva::text || '%' THEN RAISE EXCEPTION '6: salió una opción inactiva'; END IF;

  -- 8) El combo: es_combo, sin grupos y con dos slots (el inactivo no cuenta), por orden.
  v_p := jsonb_path_query_first(v_c, '$.productos[*] ? (@.id == $id)', jsonb_build_object('id', v_combo));
  IF (v_p ->> 'es_combo')::boolean IS NOT TRUE OR v_p -> 'grupos' <> '[]'::jsonb OR jsonb_array_length(v_p -> 'slots') <> 2 THEN
    RAISE EXCEPTION '8: combo mal (es_combo, grupos [], dos slots): %', v_p;
  END IF;
  IF v_p ->> 'precio_mxn' <> '45.00' OR (v_p ->> 'agotado')::boolean THEN RAISE EXCEPTION '8: precio o agotado del combo: %', v_p; END IF;
  IF v_p -> 'slots' -> 0 ->> 'id' <> v_s_beb::text OR v_p -> 'slots' -> 1 ->> 'id' <> v_s_aco::text THEN
    RAISE EXCEPTION '8: los slots no van por orden_visualizacion: %', v_p -> 'slots';
  END IF;

  -- 9a) Slot por categoría (DELTA): los productos de la categoría que no son combo ni están
  -- excluidos, a "0.00"; el que trae fila activa, con su delta.
  v_s := v_p -> 'slots' -> 0;
  IF NOT (v_s ?& ARRAY['id', 'nombre', 'minimo', 'maximo', 'opciones']) THEN RAISE EXCEPTION '9: faltan claves en el slot: %', v_s; END IF;
  IF v_s ->> 'nombre' <> 'Bebida' OR v_s -> 'minimo' <> '1'::jsonb OR v_s -> 'maximo' <> '1'::jsonb THEN RAISE EXCEPTION '9: slot Bebida mal: %', v_s; END IF;
  SELECT array_agg(o ->> 'producto_id' ORDER BY ord) INTO v_ids FROM jsonb_array_elements(v_s -> 'opciones') WITH ORDINALITY AS x(o, ord);
  IF v_ids IS DISTINCT FROM ARRAY[v_ref, v_agua, v_jugo]::text[] THEN
    RAISE EXCEPTION '9: el slot por categoría debía listar refresco, agua, jugo (sin el té excluido ni el combo): %', v_s -> 'opciones';
  END IF;
  v_o := v_s -> 'opciones' -> 0;
  IF NOT (v_o ?& ARRAY['producto_id', 'nombre', 'precio_extra_mxn', 'agotado', 'es_default', 'grupos']) THEN RAISE EXCEPTION '9: faltan claves en la opción de slot: %', v_o; END IF;
  IF v_o ->> 'nombre' <> 'Refresco menu smoke' OR v_o ->> 'precio_extra_mxn' <> '0.00' OR (v_o ->> 'agotado')::boolean
     OR (v_o ->> 'es_default')::boolean OR v_o -> 'grupos' <> '[]'::jsonb THEN
    RAISE EXCEPTION '9: opción refresco mal: %', v_o;
  END IF;
  IF v_s -> 'opciones' -> 1 ->> 'precio_extra_mxn' <> '0.00' THEN RAISE EXCEPTION '9: el agua debía ir a 0.00: %', v_s -> 'opciones' -> 1; END IF;
  v_o := v_s -> 'opciones' -> 2;
  IF v_o ->> 'precio_extra_mxn' <> '5.00' OR (v_o ->> 'es_default')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION '9: el jugo (fila activa en slot DELTA) debía ir a 5.00 y ser el default: %', v_o;
  END IF;

  -- 9b) Slot explícito (SUMA_PRECIO_PRODUCTO): precio del producto EN LA SUCURSAL más el delta, por
  -- el orden de la opción; la opción activa = false no sale.
  v_s := v_p -> 'slots' -> 1;
  SELECT array_agg(o ->> 'producto_id' ORDER BY ord) INTO v_ids FROM jsonb_array_elements(v_s -> 'opciones') WITH ORDINALITY AS x(o, ord);
  IF v_ids IS DISTINCT FROM ARRAY[v_ps, v_a]::text[] THEN
    RAISE EXCEPTION '9: el slot explícito debía listar precio-sucursal y A (sin B, activa = false): %', v_s -> 'opciones';
  END IF;
  IF v_s -> 'opciones' -> 0 ->> 'precio_extra_mxn' <> '75.00' THEN RAISE EXCEPTION '9: esperaba 75.00 (precio de sucursal + 0): %', v_s -> 'opciones' -> 0; END IF;
  v_o := v_s -> 'opciones' -> 1;
  IF v_o ->> 'precio_extra_mxn' <> '110.00' THEN RAISE EXCEPTION '9: esperaba 110.00 (100 + delta 10): %', v_o; END IF;

  -- 10) Una opción de slot con modificadores propios trae sus grupos, con la misma forma.
  IF jsonb_array_length(v_o -> 'grupos') <> 2 OR v_o -> 'grupos' -> 0 ->> 'id' <> v_g1::text
     OR v_o -> 'grupos' -> 0 -> 'minimo' <> '1'::jsonb
     OR v_o -> 'grupos' -> 1 -> 'opciones' -> 0 ->> 'precio_extra_mxn' <> '15.00' THEN
    RAISE EXCEPTION '10: la opción A debía traer sus dos grupos: %', v_o -> 'grupos';
  END IF;
  IF v_o -> 'grupos' IS DISTINCT FROM jsonb_path_query_first(v_c, '$.productos[*] ? (@.id == $id)', jsonb_build_object('id', v_a)) -> 'grupos' THEN
    RAISE EXCEPTION '10: los grupos de A como opción de slot difieren de los de A como producto';
  END IF;

  -- 11) Una sucursal de otro negocio.
  BEGIN
    PERFORM tienda_menu(v_t, v_suc_o);
    RAISE EXCEPTION '11: debía lanzar SUCURSAL_DE_OTRO_NEGOCIO';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'SUCURSAL_DE_OTRO_NEGOCIO%' THEN RAISE; END IF;
  END;

  -- 12) Ningún importe es un número: todos son texto con dos decimales.
  SELECT count(*), count(*) FILTER (WHERE jsonb_typeof(x) = 'string' AND x #>> '{}' ~ '^-?[0-9]+\.[0-9]{2}$')
    INTO v_n, v_pos_menu
    FROM (SELECT jsonb_path_query(v_j, '$.**.precio_mxn') AS x
          UNION ALL SELECT jsonb_path_query(v_j, '$.**.precio_extra_mxn')) t;
  IF v_n < 10 OR v_n <> v_pos_menu THEN RAISE EXCEPTION '12: % importes, % como texto con dos decimales', v_n, v_pos_menu; END IF;
  -- Y los únicos números de todo el JSON son minimo y maximo: ninguna otra clave trae un número
  -- (ni un null donde va un importe). Primero, que los dos detectores detectan.
  IF NOT ('{"precio_mxn": 12.5}'::jsonb::text ~ v_re_numero AND '{"precio_extra_mxn": null}'::jsonb::text ~ v_re_importe)
     OR '{"minimo": 1, "maximo": 2, "precio_mxn": "1.00"}'::jsonb::text ~ v_re_numero
     OR '{"precio_mxn": "1.00"}'::jsonb::text ~ v_re_importe THEN
    RAISE EXCEPTION '12: los detectores del smoke están mal';
  END IF;
  IF v_j::text ~ v_re_numero THEN RAISE EXCEPTION '12: hay un número que no es minimo ni maximo: %', v_j; END IF;
  IF v_j::text ~ v_re_importe THEN RAISE EXCEPTION '12: hay un importe que no es texto: %', v_j; END IF;

  -- Ida y vuelta: toda pareja de opciones que el menú ofrece (no agotadas) la acepta
  -- agregar_combo_a_ticket, y el padre cuesta el precio del combo más los precio_extra_mxn del menú.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', v_t::text)::text, true);
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_t, v_suc, v_caja, 'SMOKE-TMENU', calcular_dia_contable(v_t), v_maria, 500, 'TOTAL') RETURNING id INTO v_turno;
  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-tmenu-1', v_maria);
  v_p := jsonb_path_query_first(v_c, '$.productos[*] ? (@.id == $id)', jsonb_build_object('id', v_combo));
  v_n := 0;
  FOR r IN
    SELECT b.o AS beb, a.o AS aco
      FROM jsonb_array_elements(v_p -> 'slots' -> 0 -> 'opciones') AS b(o),
           jsonb_array_elements(v_p -> 'slots' -> 1 -> 'opciones') AS a(o)
     WHERE NOT (b.o ->> 'agotado')::boolean AND NOT (a.o ->> 'agotado')::boolean
  LOOP
    v_n := v_n + 1;
    v_padre := agregar_combo_a_ticket(v_ticket, v_combo, 1, jsonb_build_array(
      jsonb_build_object('grupo_id', v_s_beb, 'producto_id', r.beb ->> 'producto_id', 'cantidad', 1),
      jsonb_build_object('grupo_id', v_s_aco, 'producto_id', r.aco ->> 'producto_id', 'cantidad', 1)));
    SELECT precio_unitario_snapshot INTO v_precio FROM ticket_items WHERE id = v_padre;
    IF v_precio IS DISTINCT FROM (v_p ->> 'precio_mxn')::numeric + (r.beb ->> 'precio_extra_mxn')::numeric + (r.aco ->> 'precio_extra_mxn')::numeric THEN
      RAISE EXCEPTION 'ida y vuelta: el ticket cobró % y el menú anunciaba % + % + %', v_precio,
        v_p ->> 'precio_mxn', r.beb ->> 'precio_extra_mxn', r.aco ->> 'precio_extra_mxn';
    END IF;
  END LOOP;
  IF v_n <> 6 THEN RAISE EXCEPTION 'ida y vuelta: esperaba 6 parejas (3 bebidas × 2 acompañamientos), probó %', v_n; END IF;

  -- 7) Con las dos opciones del grupo obligatorio agotadas, el producto sale agotado (y las
  -- opciones se siguen enseñando, marcadas).
  UPDATE opciones_modificador SET agotada = true WHERE grupo_id = v_g1;
  v_j := tienda_menu(v_t, v_suc);
  v_p := jsonb_path_query_first(v_j, '$.categorias[*].productos[*] ? (@.id == $id)', jsonb_build_object('id', v_a));
  IF (v_p ->> 'agotado')::boolean IS NOT TRUE THEN RAISE EXCEPTION '7: sin opción vendible en el grupo obligatorio, A debía salir agotado: %', v_p; END IF;
  IF jsonb_array_length(v_p -> 'grupos' -> 0 -> 'opciones') <> 2 OR (v_p -> 'grupos' -> 0 -> 'opciones' -> 0 ->> 'agotada')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION '7: las opciones agotadas se enseñan marcadas, no se ocultan: %', v_p -> 'grupos' -> 0;
  END IF;
  -- Regla 6 también donde A es opción de un slot; al combo le queda otra opción vendible.
  v_p := jsonb_path_query_first(v_j, '$.categorias[*].productos[*] ? (@.id == $id)', jsonb_build_object('id', v_combo));
  IF (v_p -> 'slots' -> 1 -> 'opciones' -> 1 ->> 'agotado')::boolean IS NOT TRUE THEN RAISE EXCEPTION '7: A como opción de slot debía salir agotado: %', v_p -> 'slots' -> 1; END IF;
  IF (v_p ->> 'agotado')::boolean THEN RAISE EXCEPTION '7: al combo le queda una opción vendible en cada slot: %', v_p; END IF;

  -- Regla 8) Un slot obligatorio sin ninguna opción vendible agota el combo.
  UPDATE productos_sucursal SET agotado_manual = true WHERE producto_id = v_ps AND sucursal_id = v_suc;
  v_j := tienda_menu(v_t, v_suc);
  v_p := jsonb_path_query_first(v_j, '$.categorias[*].productos[*] ? (@.id == $id)', jsonb_build_object('id', v_combo));
  IF (v_p ->> 'agotado')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'R8: un slot obligatorio sin opciones vendibles debía agotar el combo: %', v_p; END IF;
  IF jsonb_array_length(v_p -> 'slots' -> 1 -> 'opciones') <> 2 THEN RAISE EXCEPTION 'R8: las opciones agotadas del slot se siguen enseñando: %', v_p -> 'slots' -> 1; END IF;

  RAISE NOTICE 'smoke_tienda_menu OK';
END $$;
ROLLBACK;
