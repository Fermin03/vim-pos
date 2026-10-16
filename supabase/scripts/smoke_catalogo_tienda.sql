-- Smoke del catálogo de tienda (spec 2026-10-15-giro-retail-design.md §6.1, migración 0190).
-- Sobre la semilla de dev. ROLLBACK. Ejecutar: cd desktop && npm run smokes -- smoke_catalogo_tienda.sql
\set ON_ERROR_STOP on
BEGIN;

-- Fixture: módulo encendido, una categoría y un padre "Playera Polo" sin hijas.
DO $$
BEGIN
  PERFORM operacion_cambiar('99999999-0000-0000-0000-0000000000aa', '{"existencias":true}');
  INSERT INTO categorias (id, tenant_id, nombre) VALUES ('c7c70000-0000-0000-0000-0000000000c1', '99999999-0000-0000-0000-0000000000aa', 'Playeras');
  INSERT INTO productos (id, tenant_id, nombre, categoria_id, precio_base_mxn, clave_sat, tasa_iva)
  VALUES ('c7c70000-0000-0000-0000-0000000000a0', '99999999-0000-0000-0000-0000000000aa', 'Playera Polo',
          'c7c70000-0000-0000-0000-0000000000c1', 349, '53101602', 16);
END $$;

-- 1) Reglas completas de variantes y herencia del padre.
DO $$
DECLARE
  v_padre uuid := 'c7c70000-0000-0000-0000-0000000000a0';
BEGIN
  -- 1a) Ejes repetidos (sin importar mayúsculas), nulos o vacíos.
  BEGIN UPDATE productos SET variante_ejes = ARRAY['Talla','talla'] WHERE id = v_padre;
        RAISE EXCEPTION '1a: ejes repetidos'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'VARIANTE_INVALIDA%' THEN RAISE; END IF; END;
  BEGIN UPDATE productos SET variante_ejes = ARRAY['Talla',NULL] WHERE id = v_padre;
        RAISE EXCEPTION '1a: eje nulo'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'VARIANTE_INVALIDA%' THEN RAISE; END IF; END;
  BEGIN UPDATE productos SET variante_ejes = ARRAY['Talla',' '] WHERE id = v_padre;
        RAISE EXCEPTION '1a: eje vacío'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'VARIANTE_INVALIDA%' THEN RAISE; END IF; END;
  RAISE NOTICE '1 reglas de ejes OK';
END $$;

-- 2) Códigos internos: EAN-13 con prefijo 20, consecutivos y con dígito verificador correcto.
DO $$
DECLARE
  v_a text; v_b text;
BEGIN
  IF ean13_digito('400638133393') <> '1' THEN RAISE EXCEPTION '2a: dígito de 400638133393 debe ser 1'; END IF;
  IF ean13_digito('750100000000') <> '5' THEN RAISE EXCEPTION '2a: dígito de 750100000000 debe ser 5, es %', ean13_digito('750100000000'); END IF;
  v_a := _siguiente_codigo_interno('99999999-0000-0000-0000-0000000000aa');
  IF v_a !~ '^20[0-9]{11}$' OR right(v_a, 1) <> ean13_digito(left(v_a, 12)) THEN RAISE EXCEPTION '2b: código mal formado %', v_a; END IF;
  -- La cajera no puede pedir códigos; el dueño sí.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '99999999-0000-0000-0000-000000000001', 'tenant_id', '99999999-0000-0000-0000-0000000000aa')::text, true);
  BEGIN PERFORM generar_codigo_interno();
        RAISE EXCEPTION '2c: la cajera no debía generar'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'SIN_PERMISO%' THEN RAISE; END IF; END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '99999999-0000-0000-0000-0000000000e1', 'tenant_id', '99999999-0000-0000-0000-0000000000aa')::text, true);
  v_b := generar_codigo_interno();
  IF v_b !~ '^20[0-9]{11}$' OR right(v_b, 1) <> ean13_digito(left(v_b, 12)) OR v_b <= v_a THEN
    RAISE EXCEPTION '2d: el siguiente código debe ser válido y mayor que el anterior (% vs %)', v_a, v_b; END IF;
  RAISE NOTICE '2 códigos internos OK';
END $$;

-- 3) guardar_variantes: crea, nombra, genera códigos, existencia inicial, actualiza, desactiva y
--    rechaza lo malo sin dejar nada a medias.
DO $$
DECLARE
  v_t     uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc   uuid := '99999999-0000-0000-0000-0000000000bb';
  v_padre uuid := 'c7c70000-0000-0000-0000-0000000000a0';
  v_r     jsonb; v_m uuid; v_g uuid; v_n int; v_cod_m text; v_cod_g text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '99999999-0000-0000-0000-0000000000e1', 'tenant_id', v_t)::text, true);

  v_r := guardar_variantes(v_padre, ARRAY['Talla','Color'], jsonb_build_array(
    jsonb_build_object('valores', jsonb_build_object('Talla','M','Color','Negra'), 'codigo_interno','POL-M-NEG',
                       'generar_codigo', true, 'precio', 349, 'costo', 150, 'existencia_inicial', 5),
    jsonb_build_object('valores', jsonb_build_object('Talla','G','Color','Negra'), 'codigo_interno','POL-G-NEG',
                       'generar_codigo', true, 'precio', 359, 'existencia_inicial', 0)), v_suc);
  IF (v_r->>'creadas')::int <> 2 THEN RAISE EXCEPTION '3a: debía crear 2, %', v_r; END IF;

  SELECT id, codigo_barras INTO v_m, v_cod_m FROM productos WHERE producto_padre_id = v_padre AND codigo_interno = 'POL-M-NEG';
  SELECT id, codigo_barras INTO v_g, v_cod_g FROM productos WHERE producto_padre_id = v_padre AND codigo_interno = 'POL-G-NEG';
  IF (SELECT nombre FROM productos WHERE id = v_m) <> 'Playera Polo M Negra' THEN RAISE EXCEPTION '3b: nombre de la hija'; END IF;
  IF NOT (SELECT controla_existencias FROM productos WHERE id = v_m) THEN RAISE EXCEPTION '3b: la hija debe llevar existencias'; END IF;
  IF (SELECT clave_sat FROM productos WHERE id = v_m) <> '53101602' THEN RAISE EXCEPTION '3b: la hija hereda la clave SAT'; END IF;
  IF v_cod_m IS NULL OR v_cod_g IS NULL OR v_cod_m = v_cod_g THEN RAISE EXCEPTION '3c: códigos generados % %', v_cod_m, v_cod_g; END IF;
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m) <> 5 THEN RAISE EXCEPTION '3d: existencia inicial de M'; END IF;
  IF EXISTS (SELECT 1 FROM movimientos_producto WHERE producto_id = v_g) THEN RAISE EXCEPTION '3d: existencia 0 no genera movimiento'; END IF;

  -- 3e) Guardar otra vez lo mismo (con id) actualiza, no duplica ni vuelve a sumar existencia.
  v_r := guardar_variantes(v_padre, ARRAY['Talla','Color'], jsonb_build_array(
    jsonb_build_object('id', v_m, 'valores', jsonb_build_object('Talla','M','Color','Negra'), 'codigo_interno','POL-M-NEG',
                       'codigo_barras', v_cod_m, 'precio', 399, 'costo', 160, 'existencia_inicial', 5)), v_suc);
  IF (v_r->>'actualizadas')::int <> 1 OR (v_r->>'creadas')::int <> 0 THEN RAISE EXCEPTION '3e: %', v_r; END IF;
  IF (SELECT precio_base_mxn FROM productos WHERE id = v_m) <> 399 THEN RAISE EXCEPTION '3e: precio no se actualizó'; END IF;
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_m) <> 5 THEN RAISE EXCEPTION '3e: la existencia no debe volver a sumar'; END IF;

  -- 3f) Desactivar G.
  v_r := guardar_variantes(v_padre, ARRAY['Talla','Color'], jsonb_build_array(
    jsonb_build_object('id', v_g, 'valores', jsonb_build_object('Talla','G','Color','Negra'), 'precio', 359, 'activa', false)), v_suc);
  IF (v_r->>'desactivadas')::int <> 1 OR (SELECT deleted_at FROM productos WHERE id = v_g) IS NULL THEN RAISE EXCEPTION '3f: %', v_r; END IF;
  IF (SELECT codigo_barras FROM productos WHERE id = v_g) IS DISTINCT FROM v_cod_g
     OR (SELECT codigo_interno FROM productos WHERE id = v_g) IS DISTINCT FROM 'POL-G-NEG' THEN
    RAISE EXCEPTION '3f: desactivar sin mandar códigos no debe borrarlos'; END IF;
  -- 3l) El código de la desactivada no se vuelve a entregar.
  IF generar_codigo_interno() = v_cod_g OR generar_codigo_interno() <= v_cod_g THEN RAISE EXCEPTION '3l: se reentregó un código usado'; END IF;

  -- 3g) Renombrar el padre baja a las hijas.
  UPDATE productos SET nombre = 'Polo Clásica', clave_sat = '53101603' WHERE id = v_padre;
  IF (SELECT nombre FROM productos WHERE id = v_m) <> 'Polo Clásica M Negra' OR (SELECT clave_sat FROM productos WHERE id = v_m) <> '53101603' THEN
    RAISE EXCEPTION '3g: el cambio del padre no bajó a la hija'; END IF;

  -- 3h) Lo malo no deja nada: código repetido (mensaje que lo nombra), precio NaN, sin sucursal.
  SELECT count(*) INTO v_n FROM productos WHERE producto_padre_id = v_padre;
  BEGIN PERFORM guardar_variantes(v_padre, ARRAY['Talla','Color'], jsonb_build_array(
          jsonb_build_object('valores', jsonb_build_object('Talla','CH','Color','Negra'), 'precio', 349, 'codigo_interno', 'POL-CH-NEG'),
          jsonb_build_object('valores', jsonb_build_object('Talla','XG','Color','Negra'), 'precio', 349, 'codigo_barras', v_cod_m)), v_suc);
        RAISE EXCEPTION '3h: código repetido';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS: el código de barras%' THEN RAISE; END IF; END;
  BEGIN PERFORM guardar_variantes(v_padre, ARRAY['Talla','Color'], jsonb_build_array(
          jsonb_build_object('valores', jsonb_build_object('Talla','CH','Color','Roja'), 'precio', 'NaN')), v_suc);
        RAISE EXCEPTION '3h: precio NaN'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  BEGIN PERFORM guardar_variantes(v_padre, ARRAY['Talla','Color'], jsonb_build_array(
          jsonb_build_object('valores', jsonb_build_object('Talla','CH','Color','Azul'), 'precio', 349, 'existencia_inicial', 3)), NULL);
        RAISE EXCEPTION '3h: existencia sin sucursal'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  IF (SELECT count(*) FROM productos WHERE producto_padre_id = v_padre) <> v_n THEN RAISE EXCEPTION '3h: un guardado rechazado dejó hijas'; END IF;

  -- 3i) Cambiar ejes con hijas vivas se rechaza (0189).
  BEGIN PERFORM guardar_variantes(v_padre, ARRAY['Talla'], '[]'::jsonb, v_suc);
        RAISE EXCEPTION '3i: ejes con hijas'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'VARIANTE_INVALIDA%' THEN RAISE; END IF; END;

  -- 3j) La cajera no puede.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '99999999-0000-0000-0000-000000000001', 'tenant_id', v_t)::text, true);
  BEGIN PERFORM guardar_variantes(v_padre, ARRAY['Talla','Color'], '[]'::jsonb, v_suc);
        RAISE EXCEPTION '3j: cajera'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'SIN_PERMISO%' THEN RAISE; END IF; END;
  -- 3k) Renombrar un padre cuya única hija está desactivada con ejes viejos no truena ni la toca.
  DECLARE v_b uuid; v_h uuid; v_nom text;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', '99999999-0000-0000-0000-0000000000e1', 'tenant_id', v_t)::text, true);
    INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, clave_sat, tasa_iva)
    VALUES (v_t, 'B', 'c7c70000-0000-0000-0000-0000000000c1', 100, '53101602', 16) RETURNING id INTO v_b;
    PERFORM guardar_variantes(v_b, ARRAY['Talla'], jsonb_build_array(jsonb_build_object('valores', jsonb_build_object('Talla','M'), 'precio', 100)), NULL);
    SELECT id INTO v_h FROM productos WHERE producto_padre_id = v_b;
    PERFORM guardar_variantes(v_b, ARRAY['Talla'], jsonb_build_array(jsonb_build_object('id', v_h, 'valores', jsonb_build_object('Talla','M'), 'precio', 100, 'activa', false)), NULL);
    PERFORM guardar_variantes(v_b, ARRAY['Color'], '[]'::jsonb, NULL);
    SELECT nombre INTO v_nom FROM productos WHERE id = v_h;
    UPDATE productos SET nombre = 'B renombrado' WHERE id = v_b;
    IF (SELECT nombre FROM productos WHERE id = v_h) <> v_nom THEN RAISE EXCEPTION '3k: la hija borrada no debe cambiar'; END IF;
  END;
  RAISE NOTICE '3 guardar_variantes OK';
END $$;

-- 5) Otro negocio y módulo apagado.
DO $$
DECLARE
  v_t uuid := '99999999-0000-0000-0000-0000000000aa';
  v_padre uuid := 'c7c70000-0000-0000-0000-0000000000a0';
  v_o uuid := 'c7c70000-0000-0000-0000-0000000000f0';
  v_cat_o uuid; v_p_o uuid; v_h_o uuid; v_suc_o uuid; v_nom_h text; v_n_ajeno int;
BEGIN
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal) VALUES (v_o, 'tenant-0190', 'Otra tienda', 'INTERNO', 'QUICK_SERVICE');
  INSERT INTO categorias (tenant_id, nombre) VALUES (v_o, 'Ajena') RETURNING id INTO v_cat_o;
  INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, variante_ejes) VALUES (v_o, 'Ajeno', v_cat_o, 10, ARRAY['Talla']) RETURNING id INTO v_p_o;
  INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, producto_padre_id, variante_valores, controla_existencias)
  VALUES (v_o, 'Ajeno M', v_cat_o, 10, v_p_o, '{"Talla":"M"}', true) RETURNING id INTO v_h_o;
  INSERT INTO sucursales (tenant_id, codigo, nombre) VALUES (v_o, 'O190', 'Sucursal ajena') RETURNING id INTO v_suc_o;
  SELECT nombre INTO v_nom_h FROM productos WHERE id = v_h_o;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', '99999999-0000-0000-0000-0000000000e1', 'tenant_id', v_t)::text, true);
  BEGIN PERFORM guardar_variantes(v_p_o, ARRAY['Talla'], '[]'::jsonb, NULL);
        RAISE EXCEPTION '5a: padre ajeno'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  BEGIN PERFORM guardar_variantes(v_padre, ARRAY['Talla','Color'], jsonb_build_array(
          jsonb_build_object('id', v_h_o, 'valores', jsonb_build_object('Talla','M','Color','X'), 'precio', 1)), NULL);
        RAISE EXCEPTION '5b: hija ajena'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%no es de este producto%' THEN RAISE; END IF; END;
  BEGIN PERFORM guardar_variantes(v_padre, ARRAY['Talla','Color'], '[]'::jsonb, v_suc_o);
        RAISE EXCEPTION '5c: sucursal ajena'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  SELECT count(*) INTO v_n_ajeno FROM productos WHERE tenant_id = v_o;
  IF v_n_ajeno <> 2 OR (SELECT nombre FROM productos WHERE id = v_h_o) <> v_nom_h OR (SELECT precio_base_mxn FROM productos WHERE id = v_h_o) <> 10 THEN
    RAISE EXCEPTION '5d: algo del otro negocio cambió'; END IF;

  PERFORM operacion_cambiar(v_t, '{"existencias":false}');
  BEGIN PERFORM guardar_variantes(v_padre, ARRAY['Talla','Color'], '[]'::jsonb, NULL);
        RAISE EXCEPTION '5e: módulo apagado'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'MODULO_APAGADO%' THEN RAISE; END IF; END;
  BEGIN PERFORM generar_codigo_interno();
        RAISE EXCEPTION '5f: módulo apagado'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'MODULO_APAGADO%' THEN RAISE; END IF; END;
  PERFORM operacion_cambiar(v_t, '{"existencias":true}');
  RAISE NOTICE '5 otro negocio y módulo OK';
END $$;

ROLLBACK;
