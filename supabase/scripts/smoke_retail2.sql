-- Smoke de retail 2, entrega 1 (giros de tienda y unidad de venta; migraciones 0205–0206).
-- Sobre la semilla de dev. ROLLBACK. Ejecutar: cd desktop && npm run smokes -- smoke_retail2.sql
\set ON_ERROR_STOP on
BEGIN;

-- 1) Los valores nuevos existen en sus enums (0205).
DO $$
BEGIN
  IF (SELECT count(*) FROM unnest(enum_range(NULL::vertical_tipo)) v
      WHERE v::text IN ('ABARROTES','FRUTERIA','FERRETERIA','VINOS')) <> 4 THEN
    RAISE EXCEPTION '1: faltan giros nuevos en vertical_tipo'; END IF;
  IF NOT 'LONGITUD' = ANY (enum_range(NULL::producto_tipo_venta)::text[]) THEN
    RAISE EXCEPTION '1: falta LONGITUD en producto_tipo_venta'; END IF;
  RAISE NOTICE '1 valores de enum OK';
END $$;

-- 1b) Tras el backfill de la 0206 ningún granel queda con otra unidad que la suya.
DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM productos
   WHERE tipo_venta <> 'UNIDAD'
     AND unidad_sat IS DISTINCT FROM CASE tipo_venta::text WHEN 'PESO' THEN 'KGM' WHEN 'LONGITUD' THEN 'MTR' WHEN 'VOLUMEN' THEN 'LTR' END;
  IF v_n > 0 THEN RAISE EXCEPTION '1b: % productos a granel con unidad_sat ajena', v_n; END IF;
  RAISE NOTICE '1b backfill de unidad OK';
END $$;

-- Fixture: módulo de existencias encendido y una categoría de granel.
DO $$
BEGIN
  PERFORM operacion_cambiar('99999999-0000-0000-0000-0000000000aa', '{"existencias":true}');
  INSERT INTO categorias (id, tenant_id, nombre) VALUES ('c8c80000-0000-0000-0000-0000000000c1', '99999999-0000-0000-0000-0000000000aa', 'Granel');
END $$;

-- 2) Giros de tienda (0206): quién es tienda, con qué módulos arranca y que los cuatro ya se asignan (0215; BAR sigue bloqueado).
DO $$
DECLARE v_g text;
BEGIN
  FOREACH v_g IN ARRAY ARRAY['RETAIL','ABARROTES','FRUTERIA','FERRETERIA','VINOS'] LOOP
    IF NOT es_giro_tienda(v_g::vertical_tipo) THEN RAISE EXCEPTION '2a: % debía ser tienda', v_g; END IF;
  END LOOP;
  IF es_giro_tienda('QUICK_SERVICE') OR es_giro_tienda('FULL_SERVICE') THEN RAISE EXCEPTION '2a: un restaurante no es tienda'; END IF;

  FOREACH v_g IN ARRAY ARRAY['ABARROTES','FRUTERIA','FERRETERIA','VINOS'] LOOP
    IF juego_inicial_de_giro(v_g::vertical_tipo) IS DISTINCT FROM juego_inicial_de_giro('RETAIL') THEN
      RAISE EXCEPTION '2b: % arranca con %', v_g, juego_inicial_de_giro(v_g::vertical_tipo); END IF;
  END LOOP;

  BEGIN
    PERFORM cambiar_giro('99999999-0000-0000-0000-0000000000aa', 'BAR', true);
    RAISE EXCEPTION '2c: BAR debía seguir bloqueado';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'GIRO_NO_DISPONIBLE%' THEN RAISE; END IF;
  END;
  PERFORM cambiar_giro('99999999-0000-0000-0000-0000000000aa', 'FRUTERIA', true);
  IF (SELECT operacion FROM tenants WHERE id = '99999999-0000-0000-0000-0000000000aa') IS DISTINCT FROM juego_inicial_de_giro('FRUTERIA') THEN
    RAISE EXCEPTION '2c: FRUTERIA no dejó su juego inicial'; END IF;
  RAISE NOTICE '2 giros de tienda OK';
END $$;

-- 3) Unidad SAT desde tipo_venta, herencia a variantes e importación (0206).
DO $$
DECLARE
  v_t    uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc  uuid := '99999999-0000-0000-0000-0000000000bb';
  v_cat  uuid := 'c8c80000-0000-0000-0000-0000000000c1';
  v_p    uuid; v_hija uuid; v_tv text; v_us text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '99999999-0000-0000-0000-0000000000e1', 'tenant_id', v_t)::text, true);

  -- 3e) PESO → KGM; su variante hereda PESO y KGM, al crearse y cuando el padre cambia.
  INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, tipo_venta, variante_ejes)
  VALUES (v_t, 'Jamón', v_cat, 120, 'PESO', ARRAY['Marca']) RETURNING id INTO v_p;
  IF (SELECT unidad_sat FROM productos WHERE id = v_p) IS DISTINCT FROM 'KGM' THEN RAISE EXCEPTION '3e: el padre PESO debía quedar en KGM'; END IF;
  PERFORM guardar_variantes(v_p, ARRAY['Marca'], jsonb_build_array(
    jsonb_build_object('valores', jsonb_build_object('Marca','FUD'), 'codigo_interno','JAM-FUD', 'precio', 120)), v_suc);
  SELECT id, tipo_venta::text, unidad_sat INTO v_hija, v_tv, v_us FROM productos WHERE producto_padre_id = v_p;
  IF v_tv <> 'PESO' OR v_us IS DISTINCT FROM 'KGM' THEN RAISE EXCEPTION '3e: la variante quedó en % / %', v_tv, v_us; END IF;
  UPDATE productos SET tipo_venta = 'LONGITUD' WHERE id = v_p;
  SELECT tipo_venta::text, unidad_sat INTO v_tv, v_us FROM productos WHERE id = v_hija;
  IF v_tv <> 'LONGITUD' OR v_us IS DISTINCT FROM 'MTR' THEN RAISE EXCEPTION '3e: al cambiar el padre la variante quedó en % / %', v_tv, v_us; END IF;
  -- De regreso a pieza no se queda con la unidad del granel: la hija lleva existencias (H87), el padre no (NULL).
  UPDATE productos SET tipo_venta = 'UNIDAD' WHERE id = v_p;
  IF (SELECT unidad_sat FROM productos WHERE id = v_p) IS NOT NULL
     OR (SELECT unidad_sat FROM productos WHERE id = v_hija) IS DISTINCT FROM 'H87' THEN
    RAISE EXCEPTION '3e: de regreso a pieza: padre %, hija %',
      (SELECT unidad_sat FROM productos WHERE id = v_p), (SELECT unidad_sat FROM productos WHERE id = v_hija); END IF;

  -- 3f) Producto de restaurante (UNIDAD, sin existencias): unidad_sat sigue NULL. Con existencias: Pieza.
  INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn)
  VALUES (v_t, 'Hamburguesa smoke', v_cat, 99) RETURNING id INTO v_p;
  IF (SELECT unidad_sat FROM productos WHERE id = v_p) IS NOT NULL THEN RAISE EXCEPTION '3f: el restaurante no debía tener unidad'; END IF;
  INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, controla_existencias)
  VALUES (v_t, 'Martillo smoke', v_cat, 150, true) RETURNING id INTO v_p;
  IF (SELECT unidad_sat FROM productos WHERE id = v_p) IS DISTINCT FROM 'H87' THEN RAISE EXCEPTION '3f: con existencias debía ser H87'; END IF;

  -- 3h) Importar con "unidad": m → LONGITUD/MTR; sin campo → UNIDAD/H87; "caja" se rechaza con su línea.
  PERFORM importar_catalogo_tienda(jsonb_build_array(
    jsonb_build_object('linea', 2, 'categoria', 'Granel', 'producto', 'Cable 12', 'ejes', '[]'::jsonb, 'valores', '{}'::jsonb,
                       'sku', 'CAB-12', 'precio', 18.5, 'unidad', ' M '),
    jsonb_build_object('linea', 3, 'categoria', 'Granel', 'producto', 'Pinzas', 'ejes', '[]'::jsonb, 'valores', '{}'::jsonb,
                       'sku', 'PIN-01', 'precio', 180)), v_suc);
  SELECT tipo_venta::text, unidad_sat INTO v_tv, v_us FROM productos WHERE tenant_id = v_t AND codigo_interno = 'CAB-12' AND deleted_at IS NULL;
  IF v_tv IS DISTINCT FROM 'LONGITUD' OR v_us IS DISTINCT FROM 'MTR' THEN RAISE EXCEPTION '3h: el cable quedó en % / %', v_tv, v_us; END IF;
  SELECT tipo_venta::text, unidad_sat INTO v_tv, v_us FROM productos WHERE tenant_id = v_t AND codigo_interno = 'PIN-01' AND deleted_at IS NULL;
  IF v_tv IS DISTINCT FROM 'UNIDAD' OR v_us IS DISTINCT FROM 'H87' THEN RAISE EXCEPTION '3h: las pinzas quedaron en % / %', v_tv, v_us; END IF;
  BEGIN
    PERFORM importar_catalogo_tienda(jsonb_build_array(
      jsonb_build_object('linea', 5, 'categoria', 'Granel', 'producto', 'Clavos', 'ejes', '[]'::jsonb, 'valores', '{}'::jsonb,
                         'sku', 'CLA-01', 'precio', 40, 'unidad', 'caja')), v_suc);
    RAISE EXCEPTION '3h: debía rechazar la unidad caja';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS: línea 5: unidad%' THEN RAISE; END IF;
  END;
  RAISE NOTICE '3 unidad del producto OK';
END $$;

-- 4) Venta: un negocio FERRETERIA no manda a cocina y el granel se vende con decimales.
DO $$
DECLARE
  v_t     uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc   uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja  uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria uuid := '99999999-0000-0000-0000-000000000001';
  v_p     uuid; v_turno uuid; v_tk uuid; v_it uuid;
BEGIN
  INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, tipo_venta, controla_existencias)
  VALUES (v_t, 'Queso smoke', 'c8c80000-0000-0000-0000-0000000000c1', 89.90, 'PESO', true) RETURNING id INTO v_p;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', v_t::text)::text, true);
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_t, v_suc, v_caja, 'SMOKE-R2', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;

  -- 4d) FERRETERIA puesto a mano: cambiar_giro ya lo permite (0215).
  UPDATE tenants SET vertical_principal = 'FERRETERIA' WHERE id = v_t;
  v_tk := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-r2-4', v_maria);
  IF (SELECT envio_cocina_automatico FROM tickets WHERE id = v_tk) THEN RAISE EXCEPTION '4d: FERRETERIA debía quedar en false'; END IF;

  -- 4g) 1.250 kg de queso.
  v_it := agregar_item_a_ticket(v_tk, v_p, 1.250, NULL, '[]'::jsonb, 'smoke-r2-4-1');
  IF (SELECT cantidad FROM ticket_items WHERE id = v_it) <> 1.250 THEN RAISE EXCEPTION '4g: cantidad'; END IF;
  IF (SELECT total_item_mxn FROM ticket_items WHERE id = v_it) <> round(89.90 * 1.250, 2) THEN
    RAISE EXCEPTION '4g: total %', (SELECT total_item_mxn FROM ticket_items WHERE id = v_it); END IF;
  IF (SELECT unidad_sat_snapshot FROM ticket_items WHERE id = v_it) IS DISTINCT FROM 'KGM' THEN RAISE EXCEPTION '4g: unidad_sat_snapshot'; END IF;
  RAISE NOTICE '4 venta de tienda OK';
END $$;

-- 5) Un alta nueva como FERRETERIA (0215): nace con mostrador y existencias, sin cocina.
DO $$
DECLARE v_owner uuid := gen_random_uuid(); v_tenant uuid; v_op jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (v_owner, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'owner-' || substr(v_owner::text, 1, 8) || '@smoke.dev', crypt('smokepass', gen_salt('bf')),
          now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
  v_tenant := crear_tenant_con_owner(v_owner, 'smoke-ferr-' || substr(v_owner::text, 1, 8), 'Ferretería Smoke', 'Dueño Smoke',
                                     '4770000000', 'FERRETERIA'::vertical_tipo, 'ESENCIAL', 'TRIAL'::tenant_estado, 'smoke 0215');
  SELECT operacion INTO v_op FROM tenants WHERE id = v_tenant;
  IF v_op IS DISTINCT FROM juego_inicial_de_giro('FERRETERIA')
     OR NOT (v_op->>'existencias')::boolean OR (v_op->>'kds')::boolean THEN
    RAISE EXCEPTION '5: la ferretería nació con %', v_op; END IF;
  RAISE NOTICE '5 alta como FERRETERIA OK';
END $$;

ROLLBACK;
