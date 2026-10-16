-- Smoke del giro RETAIL y las existencias por producto (spec 2026-10-15-giro-retail-design.md,
-- migraciones 0188 y 0189). Sobre la semilla de dev. ROLLBACK.
-- Ejecutar: cd desktop && npm run smokes -- smoke_existencias_producto.sql
\set ON_ERROR_STOP on
BEGIN;

-- 1) Valores nuevos.
DO $$
BEGIN
  IF NOT 'RETAIL' = ANY(enum_range(NULL::vertical_tipo)::text[]) THEN
    RAISE EXCEPTION '1a: falta RETAIL en vertical_tipo';
  END IF;
  IF NOT 'CAMBIO_TALLA' = ANY(enum_range(NULL::devolucion_motivo)::text[]) THEN
    RAISE EXCEPTION '1b: falta CAMBIO_TALLA en devolucion_motivo';
  END IF;
  RAISE NOTICE '1 valores nuevos OK';
END $$;

-- 2) Giro RETAIL y módulo existencias.
DO $$
DECLARE
  v_t  uuid := '99999999-0000-0000-0000-0000000000aa';
  v_op jsonb;
  v_m  jsonb;
BEGIN
  IF juego_inicial_de_giro('RETAIL') IS DISTINCT FROM
     '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false,"existencias":true}'::jsonb
  THEN RAISE EXCEPTION '2a: RETAIL: %', juego_inicial_de_giro('RETAIL'); END IF;

  -- Ningún giro de comida arranca con existencias, y sin giro (o ENTERPRISE) tampoco.
  IF (juego_inicial_de_giro('QUICK_SERVICE')->>'existencias')::boolean
     OR (juego_inicial_de_giro('FULL_SERVICE')->>'existencias')::boolean
     OR (juego_inicial_de_giro(NULL)->>'existencias')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION '2b: existencias solo debe arrancar encendido en RETAIL';
  END IF;

  -- El cliente existente queda con la llave apagada y modulos_efectivos la reporta.
  SELECT operacion INTO v_op FROM tenants WHERE id = v_t;
  IF (v_op->>'existencias')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION '2c: el cliente existente debía tener existencias=false: %', v_op;
  END IF;
  v_m := modulos_efectivos(v_t);
  IF (v_m->'permitidos'->>'existencias')::boolean IS DISTINCT FROM true
     OR (v_m->'efectivos'->>'existencias')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION '2d: modulos_efectivos.existencias: %', v_m;
  END IF;
  -- Lo de antes sigue ahí.
  IF NOT (v_m->'efectivos' ?& ARRAY['recetas','promociones','cfdi','delivery_apps','lealtad','tienda','kds','mostrador','cuentas_barra']) THEN
    RAISE EXCEPTION '2e: modulos_efectivos perdió llaves: %', v_m;
  END IF;

  -- VIM lo enciende (como cualquier módulo de operación) y se refleja.
  PERFORM operacion_cambiar(v_t, '{"existencias":true}');
  IF (modulos_efectivos(v_t)->'efectivos'->>'existencias')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION '2f: encender existencias no se reflejó';
  END IF;

  -- Nadie pasa a RETAIL todavía.
  BEGIN
    PERFORM cambiar_giro(v_t, 'RETAIL', true);
    RAISE EXCEPTION '2g: cambiar_giro debía rechazar RETAIL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'GIRO_NO_DISPONIBLE%' THEN RAISE; END IF;
  END;
  RAISE NOTICE '2 giro RETAIL y módulo existencias OK';
END $$;

-- 3) Variantes: forma válida, coherencia con el padre, códigos únicos y el padre no se vende.
DO $$
DECLARE
  v_t     uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc   uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja  uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria uuid := '99999999-0000-0000-0000-000000000001';
  v_cat   uuid := 'a7a70000-0000-0000-0000-0000000000c1';
  v_padre uuid := 'a7a70000-0000-0000-0000-0000000000a0';
  v_m     uuid := 'a7a70000-0000-0000-0000-0000000000a1';
  v_g     uuid := 'a7a70000-0000-0000-0000-0000000000a2';
  v_otro  uuid := 'a7a70000-0000-0000-0000-0000000000ee';
  v_ajeno uuid := 'a7a70000-0000-0000-0000-0000000000e1';
  v_turno uuid; v_ticket uuid;
BEGIN
  INSERT INTO categorias (id, tenant_id, nombre) VALUES (v_cat, v_t, 'Playeras');
  INSERT INTO productos (id, tenant_id, nombre, categoria_id, precio_base_mxn, variante_ejes)
  VALUES (v_padre, v_t, 'Playera Polo', v_cat, 349, ARRAY['Talla','Color']);
  INSERT INTO productos (id, tenant_id, nombre, categoria_id, precio_base_mxn, codigo_interno, codigo_barras,
                         producto_padre_id, variante_valores, controla_existencias, costo_mxn)
  VALUES (v_m, v_t, 'Playera Polo M Negra', v_cat, 349, 'POL-M-NEG', '2000000000015',
          v_padre, '{"Talla":"M","Color":"Negra"}', true, 150),
         (v_g, v_t, 'Playera Polo G Negra', v_cat, 349, 'POL-G-NEG', '2000000000022',
          v_padre, '{"Talla":"G","Color":"Negra"}', true, 150);

  -- Otro negocio con un producto, para las pruebas de aislamiento.
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_otro, 'tenant-retail-0189', 'Otra tienda', 'INTERNO', 'QUICK_SERVICE');
  INSERT INTO categorias (id, tenant_id, nombre) VALUES ('a7a70000-0000-0000-0000-0000000000c2', v_otro, 'Ajena');
  INSERT INTO productos (id, tenant_id, nombre, categoria_id, precio_base_mxn, controla_existencias)
  VALUES (v_ajeno, v_otro, 'Prenda ajena', 'a7a70000-0000-0000-0000-0000000000c2', 100, true);

  -- 3a) La hija repite la combinación de otra hija.
  BEGIN
    INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, producto_padre_id, variante_valores)
    VALUES (v_t, 'Duplicada', v_cat, 349, v_padre, '{"Color":"Negra","Talla":"M"}');
    RAISE EXCEPTION '3a: debía rechazar la combinación repetida';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- 3b) Ejes que no son los del padre.
  BEGIN
    INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, producto_padre_id, variante_valores)
    VALUES (v_t, 'Sin color', v_cat, 349, v_padre, '{"Talla":"CH"}');
    RAISE EXCEPTION '3b: debía rechazar ejes distintos a los del padre';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'VARIANTE_INVALIDA%' THEN RAISE; END IF;
  END;

  -- 3c) Nieta: el padre de una hija no puede ser otra hija.
  BEGIN
    INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, producto_padre_id, variante_valores)
    VALUES (v_t, 'Nieta', v_cat, 349, v_m, '{"Talla":"M","Color":"Negra"}');
    RAISE EXCEPTION '3c: debía rechazar una nieta';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'VARIANTE_INVALIDA%' THEN RAISE; END IF;
  END;

  -- 3d) Padre de otro negocio.
  BEGIN
    INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, producto_padre_id, variante_valores)
    VALUES (v_otro, 'Cruzada', 'a7a70000-0000-0000-0000-0000000000c2', 349, v_padre, '{"Talla":"M","Color":"Roja"}');
    RAISE EXCEPTION '3d: debía rechazar un padre de otro negocio';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'VARIANTE_INVALIDA%' THEN RAISE; END IF;
  END;

  -- 3e) No se cambian los ejes de un padre con hijas.
  BEGIN
    UPDATE productos SET variante_ejes = ARRAY['Talla'] WHERE id = v_padre;
    RAISE EXCEPTION '3e: debía rechazar cambiar ejes con hijas';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'VARIANTE_INVALIDA%' THEN RAISE; END IF;
  END;

  -- 3f) El padre no controla existencias.
  BEGIN
    UPDATE productos SET controla_existencias = true WHERE id = v_padre;
    RAISE EXCEPTION '3f: el padre no debía poder controlar existencias';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 3g) Código de barras único por negocio; SKU único entre los que controlan existencias.
  BEGIN
    INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, codigo_barras, controla_existencias)
    VALUES (v_t, 'Mismo código', v_cat, 10, '2000000000015', true);
    RAISE EXCEPTION '3g: debía rechazar código de barras repetido';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, codigo_interno, controla_existencias)
    VALUES (v_t, 'Mismo SKU', v_cat, 10, 'POL-M-NEG', true);
    RAISE EXCEPTION '3g: debía rechazar SKU repetido con existencias';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  -- Un restaurante puede seguir repitiendo codigo_interno (sin existencias).
  INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, codigo_interno)
  VALUES (v_t, 'SKU repetido de restaurante 1', v_cat, 10, 'REP-1'),
         (v_t, 'SKU repetido de restaurante 2', v_cat, 10, 'REP-1');
  -- Y el código de barras tampoco es único sin existencias.
  INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, codigo_barras)
  VALUES (v_t, 'Código repetido 1', v_cat, 10, '7500000000001'),
         (v_t, 'Código repetido 2', v_cat, 10, '7500000000001');

  -- 3h) El padre no se vende: se vende la hija.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', v_t::text)::text, true);
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_t, v_suc, v_caja, 'SMOKE-RET3', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;
  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-ret3', v_maria);
  BEGIN
    PERFORM agregar_item_a_ticket(v_ticket, v_padre, 1, NULL, '[]'::jsonb, 'smoke-ret3-padre');
    RAISE EXCEPTION '3h: debía rechazar vender el padre';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'PRODUCTO_CON_VARIANTES%' THEN RAISE; END IF;
  END;
  PERFORM agregar_item_a_ticket(v_ticket, v_m, 1, NULL, '[]'::jsonb, 'smoke-ret3-hija');
  RAISE NOTICE '3 variantes OK';
END $$;

ROLLBACK;
