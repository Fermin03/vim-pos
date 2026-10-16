-- Smoke del admin de existencias (spec 2026-10-15-giro-retail-design.md §6.2; migraciones 0192-0193).
-- Sobre la semilla de dev. ROLLBACK. Ejecutar: cd desktop && npm run smokes -- smoke_existencias_admin.sql
\set ON_ERROR_STOP on
BEGIN;

-- Fixture: módulo encendido, dos productos con existencias, segunda sucursal, otro negocio.
DO $$
DECLARE v_t uuid := '99999999-0000-0000-0000-0000000000aa';
BEGIN
  PERFORM operacion_cambiar(v_t, '{"existencias":true}');
  INSERT INTO categorias (id, tenant_id, nombre) VALUES ('e3e30000-0000-0000-0000-0000000000c1', v_t, 'Accesorios');
  INSERT INTO productos (id, tenant_id, nombre, categoria_id, precio_base_mxn, costo_mxn, codigo_interno, codigo_barras, controla_existencias) VALUES
    ('e3e30000-0000-0000-0000-0000000000a1', v_t, 'Gorra', 'e3e30000-0000-0000-0000-0000000000c1', 249, 90, 'GOR-1', '2000000000985', true),
    ('e3e30000-0000-0000-0000-0000000000a2', v_t, 'Cinturón', 'e3e30000-0000-0000-0000-0000000000c1', 399, 150, 'CIN-1', NULL, true);
  INSERT INTO tenant_limites (tenant_id, max_sucursales) VALUES (v_t, 5) ON CONFLICT (tenant_id) DO UPDATE SET max_sucursales = 5;
  INSERT INTO sucursales (id, tenant_id, codigo, nombre) VALUES ('e3e30000-0000-0000-0000-0000000000b2', v_t, 'RN3', 'Tienda Norte');
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES ('e3e30000-0000-0000-0000-0000000000ee', 'tenant-0193', 'Otra tienda', 'INTERNO', 'QUICK_SERVICE');
  INSERT INTO categorias (id, tenant_id, nombre) VALUES ('e3e30000-0000-0000-0000-0000000000c2', 'e3e30000-0000-0000-0000-0000000000ee', 'Ajena');
  INSERT INTO productos (id, tenant_id, nombre, categoria_id, precio_base_mxn, controla_existencias)
  VALUES ('e3e30000-0000-0000-0000-0000000000e1', 'e3e30000-0000-0000-0000-0000000000ee', 'Ajena', 'e3e30000-0000-0000-0000-0000000000c2', 10, true);
  -- Existencia inicial de la gorra en la sucursal de la semilla: 10.
  INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad, motivo)
  VALUES (v_t, '99999999-0000-0000-0000-0000000000bb', 'e3e30000-0000-0000-0000-0000000000a1', 'ENTRADA', 10, 'smoke');
END $$;

-- 1) Renglones, conteo, traspaso y cancelación.
DO $$
DECLARE
  v_t     uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc   uuid := '99999999-0000-0000-0000-0000000000bb';
  v_norte uuid := 'e3e30000-0000-0000-0000-0000000000b2';
  v_gor   uuid := 'e3e30000-0000-0000-0000-0000000000a1';
  v_cin   uuid := 'e3e30000-0000-0000-0000-0000000000a2';
  v_r     jsonb; v_tr uuid; v_n int;
BEGIN
  IF NOT 'CANCELADO' = ANY(enum_range(NULL::traspaso_producto_estado)::text[]) THEN RAISE EXCEPTION '1a: falta CANCELADO'; END IF;

  -- 1b) El validador: duplicado aunque cambien mayúsculas, 4 decimales, NaN, cero, vacío, costo malo.
  BEGIN PERFORM _existencias_lineas(jsonb_build_array(jsonb_build_object('producto_id', v_gor, 'cantidad', 1),
          jsonb_build_object('producto_id', upper(v_gor::text), 'cantidad', 2)), 'cantidad', false);
        RAISE EXCEPTION '1b: duplicado'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS: un producto viene dos veces%' THEN RAISE; END IF; END;
  BEGIN PERFORM _existencias_lineas(jsonb_build_array(jsonb_build_object('producto_id', v_gor, 'cantidad', 1.0005)), 'cantidad', false);
        RAISE EXCEPTION '1b: decimales'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS: la cantidad admite máximo 3 decimales%' THEN RAISE; END IF; END;
  BEGIN PERFORM _existencias_lineas('[{"producto_id":"e3e30000-0000-0000-0000-0000000000a1","cantidad":"NaN"}]', 'cantidad', false);
        RAISE EXCEPTION '1b: NaN'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  BEGIN PERFORM _existencias_lineas('[{"producto_id":"e3e30000-0000-0000-0000-0000000000a1","cantidad":0}]', 'cantidad', false);
        RAISE EXCEPTION '1b: cero'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  BEGIN PERFORM _existencias_lineas('[]', 'cantidad', true);
        RAISE EXCEPTION '1b: vacío'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  BEGIN PERFORM _existencias_lineas('[{"producto_id":"e3e30000-0000-0000-0000-0000000000a1","cantidad":1,"costo":1.005}]', 'cantidad', false);
        RAISE EXCEPTION '1b: costo'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  v_r := _existencias_lineas(jsonb_build_array(jsonb_build_object('producto_id', v_cin, 'cantidad', 0),
                                               jsonb_build_object('producto_id', v_gor, 'cantidad', 2.5)), 'cantidad', true);
  IF (v_r->0->>'producto_id')::uuid <> LEAST(v_gor, v_cin) OR jsonb_array_length(v_r) <> 2 THEN RAISE EXCEPTION '1b: orden por producto %', v_r; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', '99999999-0000-0000-0000-0000000000e1', 'tenant_id', v_t)::text, true);

  -- 1c) Conteo con un producto sin fila de existencias (cinturón): crea la fila y ajusta.
  v_r := registrar_conteo(v_suc, jsonb_build_array(jsonb_build_object('producto_id', v_gor, 'contado', 8),
                                                   jsonb_build_object('producto_id', v_cin, 'contado', 3)));
  IF (v_r->>'ajustados')::int <> 2 THEN RAISE EXCEPTION '1c: %', v_r; END IF;
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_cin) <> 3 THEN RAISE EXCEPTION '1c: cinturón'; END IF;
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_gor) <> 8 THEN RAISE EXCEPTION '1c: gorra'; END IF;

  -- 1d) Traspaso 3 gorras a Norte, cancelarlo: vuelven al origen una vez; no se recibe ni se cancela otra vez.
  v_tr := enviar_traspaso_producto(v_suc, v_norte, jsonb_build_array(jsonb_build_object('producto_id', v_gor, 'cantidad', 3)));
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_gor) <> 5 THEN RAISE EXCEPTION '1d: salida'; END IF;
  PERFORM cancelar_traspaso_producto(v_tr);
  IF (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_gor) <> 8 THEN RAISE EXCEPTION '1d: regreso'; END IF;
  IF (SELECT estado::text FROM traspasos_producto WHERE id = v_tr) <> 'CANCELADO'
     OR (SELECT cancelado_at FROM traspasos_producto WHERE id = v_tr) IS NULL THEN RAISE EXCEPTION '1d: estado'; END IF;
  BEGIN PERFORM cancelar_traspaso_producto(v_tr);
        RAISE EXCEPTION '1d: cancelar dos veces'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  BEGIN PERFORM recibir_traspaso_producto(v_tr);
        RAISE EXCEPTION '1d: recibir cancelado'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  -- Uno recibido no se cancela.
  v_tr := enviar_traspaso_producto(v_suc, v_norte, jsonb_build_array(jsonb_build_object('producto_id', v_gor, 'cantidad', 1)));
  PERFORM recibir_traspaso_producto(v_tr);
  BEGIN PERFORM cancelar_traspaso_producto(v_tr);
        RAISE EXCEPTION '1d: cancelar recibido'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;

  -- 1e) Traspaso con un renglón de otro negocio: nada se guarda.
  SELECT count(*) INTO v_n FROM traspasos_producto WHERE tenant_id = v_t;
  BEGIN PERFORM enviar_traspaso_producto(v_suc, v_norte, jsonb_build_array(
          jsonb_build_object('producto_id', v_gor, 'cantidad', 1), jsonb_build_object('producto_id', 'e3e30000-0000-0000-0000-0000000000e1', 'cantidad', 1)));
        RAISE EXCEPTION '1e: ajeno'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS%' THEN RAISE; END IF; END;
  IF (SELECT count(*) FROM traspasos_producto WHERE tenant_id = v_t) <> v_n THEN RAISE EXCEPTION '1e: dejó traspaso'; END IF;
  RAISE NOTICE '1 renglones, conteo y traspasos OK';
END $$;

ROLLBACK;
