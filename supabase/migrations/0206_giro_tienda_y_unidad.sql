-- Retail 2, entrega 1: giros de tienda y unidad de venta del producto (diseño 2026-10-18).
-- §1 es_giro_tienda · §2 juego inicial, sin cocina y cambiar_giro · §3 unidad SAT desde tipo_venta ·
-- §4 herencia a variantes · §5 importar_catalogo_tienda con "unidad".
--
-- Los restaurantes no cambian: sus productos son UNIDAD sin existencias, quedan con unidad_sat NULL
-- y el CFDI los sigue timbrando como E48 «Servicio».

-- ── §1 ¿Es tienda? ──────────────────────────────────────────────────────────
-- Una sola lista de los giros que venden mercancía en mostrador. RETAIL (0188) y los cuatro de la 0205.
CREATE OR REPLACE FUNCTION es_giro_tienda(p vertical_tipo)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT p IN ('RETAIL', 'ABARROTES', 'FRUTERIA', 'FERRETERIA', 'VINOS');
$$;
REVOKE ALL ON FUNCTION es_giro_tienda(vertical_tipo) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION es_giro_tienda(vertical_tipo) TO authenticated, service_role;

-- ── §2 Los giros nuevos arrancan como RETAIL ─────────────────────────────────
-- Cuerpo de la 0189 con las cuatro filas nuevas, iguales a la de RETAIL.
CREATE OR REPLACE FUNCTION juego_inicial_de_giro(p_giro vertical_tipo)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT (CASE p_giro::text
    WHEN 'QUICK_SERVICE' THEN '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":true,"repartidores":false,"kds":true,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false,"existencias":false}'
    WHEN 'FULL_SERVICE'  THEN '{"mostrador":true,"comedor":true,"meseros":true,"domicilio":false,"repartidores":false,"kds":true,"reservaciones":true,"marcas":false,"eventos":false,"cuentas_barra":false,"existencias":false}'
    WHEN 'FOODTRUCK'     THEN '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":true,"cuentas_barra":false,"existencias":false}'
    WHEN 'DARK_KITCHEN'  THEN '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":true,"repartidores":true,"kds":true,"reservaciones":false,"marcas":true,"eventos":false,"cuentas_barra":false,"existencias":false}'
    WHEN 'BAR'           THEN '{"mostrador":true,"comedor":true,"meseros":true,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":true,"existencias":false}'
    WHEN 'CAFETERIA'     THEN '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false,"existencias":false}'
    WHEN 'TAQUERIA'      THEN '{"mostrador":true,"comedor":true,"meseros":true,"domicilio":true,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false,"existencias":false}'
    WHEN 'RETAIL'        THEN '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false,"existencias":true}'
    WHEN 'ABARROTES'     THEN '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false,"existencias":true}'
    WHEN 'FRUTERIA'      THEN '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false,"existencias":true}'
    WHEN 'FERRETERIA'    THEN '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false,"existencias":true}'
    WHEN 'VINOS'         THEN '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false,"existencias":true}'
    ELSE                      '{"mostrador":true,"comedor":true,"meseros":true,"domicilio":true,"repartidores":true,"kds":true,"reservaciones":true,"marcas":true,"eventos":true,"cuentas_barra":true,"existencias":false}'
  END)::jsonb;
$$;
COMMENT ON FUNCTION juego_inicial_de_giro(vertical_tipo) IS
  'Módulos de operación con que arranca un negocio según su giro. Sin giro conocido: los diez de restaurante encendidos y existencias apagado. Única fuente de esa tabla (0180, 0189, 0206).';

-- Cuerpo de la 0196 §2: cualquier giro de tienda, no solo RETAIL.
CREATE OR REPLACE FUNCTION trg_tickets_tienda_sin_cocina()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM tenants t WHERE t.id = NEW.tenant_id AND es_giro_tienda(t.vertical_principal)) THEN
    NEW.envio_cocina_automatico := false;
  END IF;
  RETURN NEW;
END;
$$;

-- Cuerpo de la 0203 con los cuatro giros nuevos en la lista de no disponibles: los libera la
-- entrega 4, cuando todas las cajas tengan la 0205.
CREATE OR REPLACE FUNCTION cambiar_giro(p_tenant uuid, p_giro vertical_tipo, p_reaplicar boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_antes    jsonb;
  v_nuevo    jsonb;
  v_abiertas jsonb;
  v_avisos   text[] := '{}';
BEGIN
  IF p_giro IS NULL OR p_giro::text IN ('CAFE_BAR', 'ENTERPRISE') THEN
    RAISE EXCEPTION 'GIRO_RETIRADO: %', p_giro USING ERRCODE = '22023';
  END IF;
  -- La caja baja la fila completa de `tenants`; una caja sin la 0179/0205 no conoce estos valores y
  -- su pull entero fallaría. Se liberan con una migración cuando todas las cajas la tengan (ADR 0034).
  IF p_giro::text IN ('BAR', 'CAFETERIA', 'TAQUERIA', 'ABARROTES', 'FRUTERIA', 'FERRETERIA', 'VINOS') THEN
    RAISE EXCEPTION 'GIRO_NO_DISPONIBLE: %', p_giro USING ERRCODE = '22023';
  END IF;
  SELECT operacion INTO v_antes FROM tenants WHERE id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_NO_EXISTE' USING ERRCODE = 'P0002'; END IF;

  UPDATE tenants SET vertical_principal = p_giro WHERE id = p_tenant;
  IF NOT COALESCE(p_reaplicar, false) THEN
    RETURN jsonb_build_object('operacion', v_antes, 'avisos', '[]'::jsonb);
  END IF;

  v_nuevo    := juego_inicial_de_giro(p_giro);
  v_abiertas := operacion_cuentas_abiertas(p_tenant);
  IF (v_antes->>'comedor')::boolean AND NOT (v_nuevo->>'comedor')::boolean
     AND (v_abiertas->>'comedor')::int > 0 THEN
    v_nuevo  := v_nuevo || jsonb_build_object('comedor', true, 'meseros', v_antes->'meseros');
    v_avisos := v_avisos || format('El comedor sigue encendido porque tiene %s cuentas abiertas.', v_abiertas->>'comedor');
  END IF;
  IF (v_antes->>'cuentas_barra')::boolean AND NOT (v_nuevo->>'cuentas_barra')::boolean
     AND (v_abiertas->>'cuentas_barra')::int > 0 THEN
    v_nuevo  := v_nuevo || '{"cuentas_barra":true}'::jsonb;
    v_avisos := v_avisos || format('Las cuentas en barra siguen encendidas porque hay %s abiertas.', v_abiertas->>'cuentas_barra');
  END IF;

  UPDATE tenants SET operacion = v_nuevo WHERE id = p_tenant RETURNING operacion INTO v_nuevo;
  RETURN jsonb_build_object('operacion', v_nuevo, 'avisos', to_jsonb(v_avisos));
END;
$$;

REVOKE ALL ON FUNCTION cambiar_giro(uuid, vertical_tipo, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cambiar_giro(uuid, vertical_tipo, boolean) TO service_role;

-- ── §3 La unidad SAT sale de tipo_venta ──────────────────────────────────────
-- Granel: PESO → KGM, LONGITUD → MTR, VOLUMEN → LTR, siempre. Pieza con existencias y sin unidad:
-- H87. Pieza sin existencias (restaurante): no se toca. Quien regresa de granel a pieza no se queda
-- con la unidad del granel. En la caja el pull corre en réplica y esto no corre: la nube ya la mandó.
CREATE OR REPLACE FUNCTION productos_unidad_sat()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_granel text := CASE NEW.tipo_venta::text WHEN 'PESO' THEN 'KGM' WHEN 'LONGITUD' THEN 'MTR' WHEN 'VOLUMEN' THEN 'LTR' END;
BEGIN
  IF v_granel IS NOT NULL THEN
    NEW.unidad_sat := v_granel;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.tipo_venta <> 'UNIDAD' AND NEW.unidad_sat IN ('KGM', 'MTR', 'LTR') THEN
    NEW.unidad_sat := NULL;
  END IF;
  IF NEW.controla_existencias AND NEW.unidad_sat IS NULL THEN
    NEW.unidad_sat := 'H87';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_productos_unidad_sat ON productos;
CREATE TRIGGER trg_productos_unidad_sat
  BEFORE INSERT OR UPDATE OF tipo_venta, controla_existencias ON productos
  FOR EACH ROW EXECUTE FUNCTION productos_unidad_sat();

-- Lo que ya lleva existencias queda en Pieza; lo que ya es granel, en su unidad (la misma regla
-- del trigger). Pieza sin existencias (restaurante) no se toca.
UPDATE productos
   SET unidad_sat = CASE tipo_venta::text WHEN 'PESO' THEN 'KGM' WHEN 'LONGITUD' THEN 'MTR' WHEN 'VOLUMEN' THEN 'LTR' ELSE 'H87' END
 WHERE (controla_existencias AND unidad_sat IS NULL) OR tipo_venta <> 'UNIDAD';

-- ── §4 La variante hereda tipo_venta ─────────────────────────────────────────
-- Cuerpo de la 0190 §1 con tipo_venta junto a clave_sat y unidad_sat.
CREATE OR REPLACE FUNCTION productos_heredar_a_variantes()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE productos h
     SET nombre = _nombre_variante(NEW.nombre, NEW.variante_ejes, h.variante_valores),
         categoria_id = NEW.categoria_id, clave_sat = NEW.clave_sat, unidad_sat = NEW.unidad_sat,
         tipo_venta = NEW.tipo_venta,
         tasa_iva = NEW.tasa_iva, iva_incluido_en_precio = NEW.iva_incluido_en_precio, updated_at = now()
   WHERE h.producto_padre_id = NEW.id AND h.deleted_at IS NULL;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_productos_heredar_a_variantes ON productos;
CREATE TRIGGER trg_productos_heredar_a_variantes
  AFTER UPDATE OF nombre, categoria_id, clave_sat, unidad_sat, tipo_venta, tasa_iva, iva_incluido_en_precio ON productos
  FOR EACH ROW WHEN (NEW.variante_ejes IS NOT NULL AND
        (OLD.nombre, OLD.categoria_id, OLD.clave_sat, OLD.unidad_sat, OLD.tipo_venta, OLD.tasa_iva, OLD.iva_incluido_en_precio)
        IS DISTINCT FROM (NEW.nombre, NEW.categoria_id, NEW.clave_sat, NEW.unidad_sat, NEW.tipo_venta, NEW.tasa_iva, NEW.iva_incluido_en_precio))
  EXECUTE FUNCTION productos_heredar_a_variantes();

-- Cuerpo de la 0190 §3 con tipo_venta del padre en la hija nueva.
CREATE OR REPLACE FUNCTION _guardar_variante(p_tenant uuid, p_padre productos, p_fila jsonb, p_sucursal uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id      uuid;
  v_valores jsonb := p_fila->'valores';
  v_cod     text := NULLIF(btrim(p_fila->>'codigo_interno'), '');
  v_barras  text := NULLIF(btrim(p_fila->>'codigo_barras'), '');
  v_precio  numeric;
  v_costo   numeric;
  v_q       numeric;
  v_activa  boolean;
  v_gen     boolean;
BEGIN
  BEGIN
    v_id     := NULLIF(p_fila->>'id', '')::uuid;
    v_precio := (p_fila->>'precio')::numeric;
    v_costo  := NULLIF(p_fila->>'costo', '')::numeric;
    v_q      := NULLIF(p_fila->>'existencia_inicial', '')::numeric;
    v_activa := COALESCE((p_fila->>'activa')::boolean, true);
    v_gen    := COALESCE((p_fila->>'generar_codigo')::boolean, false);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: variante mal formada: %', p_fila USING ERRCODE = '22023';
  END;
  IF v_precio IS NULL OR v_precio = 'NaN' OR v_precio < 0 THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: precio inválido en %', v_valores USING ERRCODE = '22023';
  END IF;
  IF v_costo = 'NaN' OR v_costo < 0 OR v_q = 'NaN' OR v_q < 0 THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: costo o existencia inválidos en %', v_valores USING ERRCODE = '22023';
  END IF;
  IF v_barras IS NULL AND v_gen THEN
    v_barras := _siguiente_codigo_interno(p_tenant);
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, costo_mxn, codigo_interno, codigo_barras,
                           clave_sat, unidad_sat, tipo_venta, tasa_iva, iva_incluido_en_precio, producto_padre_id, variante_valores,
                           controla_existencias, en_menu_general, visible_en_pos, estado, orden_visualizacion, deleted_at)
    VALUES (p_tenant, _nombre_variante(p_padre.nombre, p_padre.variante_ejes, v_valores), p_padre.categoria_id, v_precio,
            v_costo, v_cod, v_barras, p_padre.clave_sat, p_padre.unidad_sat, p_padre.tipo_venta, p_padre.tasa_iva, p_padre.iva_incluido_en_precio,
            p_padre.id, v_valores, true, p_padre.en_menu_general, p_padre.visible_en_pos, 'ACTIVO', p_padre.orden_visualizacion,
            CASE WHEN v_activa THEN NULL ELSE now() END)
    RETURNING id INTO v_id;
    IF v_q > 0 THEN
      IF p_sucursal IS NULL THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS: elige la sucursal de la existencia inicial' USING ERRCODE = '22023';
      END IF;
      INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad, costo_unitario_mxn, motivo, usuario_id)
      VALUES (p_tenant, p_sucursal, v_id, 'ENTRADA', v_q, v_costo, 'Existencia inicial', auth.uid());
    END IF;
    RETURN 'creada';
  END IF;

  UPDATE productos
     SET nombre = _nombre_variante(p_padre.nombre, p_padre.variante_ejes, v_valores), variante_valores = v_valores,
         precio_base_mxn = v_precio, costo_mxn = v_costo, codigo_interno = CASE WHEN p_fila ? 'codigo_interno' THEN v_cod ELSE codigo_interno END,
         codigo_barras = CASE WHEN p_fila ? 'codigo_barras' OR v_barras IS NOT NULL THEN v_barras ELSE codigo_barras END,
         deleted_at = CASE WHEN v_activa THEN NULL ELSE COALESCE(deleted_at, now()) END, updated_at = now()
   WHERE id = v_id AND producto_padre_id = p_padre.id AND tenant_id = p_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: esa variante no es de este producto' USING ERRCODE = '22023';
  END IF;
  RETURN CASE WHEN v_activa THEN 'actualizada' ELSE 'desactivada' END;
END;
$$;
REVOKE ALL ON FUNCTION _guardar_variante(uuid, productos, jsonb, uuid) FROM PUBLIC, anon, authenticated;

-- ── §5 Importar con unidad ───────────────────────────────────────────────────
-- Cuerpo de la 0190 §4 (con el timeout de la 0191) y un campo opcional "unidad": pieza|kg|m|l.
-- Sin el campo, el producto nuevo es pieza y el que ya existe conserva la suya. En una prenda con
-- variantes la unidad es del padre; la hija la hereda (§4).
CREATE OR REPLACE FUNCTION importar_catalogo_tienda(p_filas jsonb, p_sucursal uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp SET statement_timeout = '60s' AS $$
DECLARE
  v_t      uuid := _existencias_puede_escribir();
  v_f      jsonb;
  v_linea  text;
  v_cat    uuid;
  v_ejes   text[];
  v_padre  productos%ROWTYPE;
  v_prod   productos%ROWTYPE;
  v_fila   jsonb;
  v_q      numeric;
  v_precio numeric;
  v_costo  numeric;
  v_c      text;
  v_r      text;
  v_unidad text;
  v_tipo   text;
  v_cats   int := 0; v_prods int := 0; v_vars int := 0; v_act int := 0;
BEGIN
  IF p_filas IS NULL OR jsonb_typeof(p_filas) <> 'array' OR jsonb_array_length(p_filas) = 0 THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el archivo viene vacío' USING ERRCODE = '22023';
  END IF;
  IF p_sucursal IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sucursales WHERE id = p_sucursal AND tenant_id = v_t) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la sucursal no es de tu negocio' USING ERRCODE = '22023';
  END IF;

  FOR v_f IN SELECT value FROM jsonb_array_elements(p_filas) LOOP
    v_linea := COALESCE(v_f->>'linea', '?');
    BEGIN
      IF NULLIF(btrim(v_f->>'categoria'), '') IS NULL OR NULLIF(btrim(v_f->>'producto'), '') IS NULL
         OR NULLIF(btrim(v_f->>'sku'), '') IS NULL THEN
        RAISE EXCEPTION 'faltan categoría, producto o SKU';
      END IF;
      SELECT COALESCE(array_agg(e), '{}') INTO v_ejes FROM jsonb_array_elements_text(COALESCE(v_f->'ejes', '[]')) e;

      -- NULL = sin unidad en la fila.
      v_unidad := NULLIF(lower(btrim(v_f->>'unidad')), '');
      v_tipo   := CASE COALESCE(v_unidad, 'pieza') WHEN 'pieza' THEN 'UNIDAD' WHEN 'kg' THEN 'PESO'
                                                   WHEN 'm' THEN 'LONGITUD' WHEN 'l' THEN 'VOLUMEN' END;
      IF v_tipo IS NULL THEN
        RAISE EXCEPTION 'unidad «%» no válida: usa pieza, kg, m o l', btrim(v_f->>'unidad');
      END IF;

      SELECT id INTO v_cat FROM categorias
       WHERE tenant_id = v_t AND deleted_at IS NULL AND lower(btrim(nombre)) = lower(btrim(v_f->>'categoria')) LIMIT 1;
      IF v_cat IS NULL THEN
        INSERT INTO categorias (tenant_id, nombre) VALUES (v_t, btrim(v_f->>'categoria')) RETURNING id INTO v_cat;
        v_cats := v_cats + 1;
      END IF;

      v_fila := jsonb_build_object('valores', v_f->'valores', 'codigo_interno', v_f->'sku', 'codigo_barras', v_f->'codigo_barras',
                                   'generar_codigo', v_f->'generar_codigo', 'precio', v_f->'precio', 'costo', v_f->'costo',
                                   'existencia_inicial', v_f->'existencia');

      -- ¿El SKU ya existe? Entonces es esa fila la que se actualiza.
      SELECT * INTO v_prod FROM productos
       WHERE tenant_id = v_t AND deleted_at IS NULL AND controla_existencias AND codigo_interno = btrim(v_f->>'sku');

      IF cardinality(v_ejes) = 0 THEN
        -- Producto sin variantes que lleva existencias. (Las variantes validan números en _guardar_variante.)
        v_precio := (v_fila->>'precio')::numeric;
        v_costo  := NULLIF(v_fila->>'costo', '')::numeric;
        v_q      := NULLIF(v_f->>'existencia', '')::numeric;
        IF v_precio IS NULL OR v_precio = 'NaN' OR v_precio < 0 OR v_costo = 'NaN' OR v_costo < 0 OR v_q = 'NaN' OR v_q < 0 THEN
          RAISE EXCEPTION 'precio, costo o existencia inválidos';
        END IF;
        IF v_prod.producto_padre_id IS NOT NULL THEN
          RAISE EXCEPTION 'el SKU % es de una variante; para esa prenda llena Ejes y Valores', v_f->>'sku';
        END IF;
        IF v_prod.id IS NOT NULL THEN
          UPDATE productos SET nombre = btrim(v_f->>'producto'), categoria_id = v_cat,
                 precio_base_mxn = v_precio, costo_mxn = v_costo,
                 codigo_barras = COALESCE(NULLIF(btrim(v_f->>'codigo_barras'), ''), codigo_barras),
                 tipo_venta = CASE WHEN v_unidad IS NULL THEN tipo_venta ELSE v_tipo::producto_tipo_venta END, updated_at = now()
           WHERE id = v_prod.id;
          v_act := v_act + 1;
        ELSE
          INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, costo_mxn, codigo_interno, codigo_barras, controla_existencias, tipo_venta)
          VALUES (v_t, btrim(v_f->>'producto'), v_cat, v_precio, v_costo,
                  btrim(v_f->>'sku'),
                  COALESCE(NULLIF(btrim(v_f->>'codigo_barras'), ''),
                           CASE WHEN COALESCE((v_f->>'generar_codigo')::boolean, false) THEN _siguiente_codigo_interno(v_t) END),
                  true, v_tipo::producto_tipo_venta)
          RETURNING * INTO v_prod;
          v_prods := v_prods + 1;
          IF v_q > 0 THEN
            IF p_sucursal IS NULL THEN RAISE EXCEPTION 'elige la sucursal de la existencia'; END IF;
            INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad, costo_unitario_mxn, motivo, usuario_id)
            VALUES (v_t, p_sucursal, v_prod.id, 'ENTRADA', v_q, v_prod.costo_mxn, 'Existencia inicial (importación)', auth.uid());
          END IF;
        END IF;
      ELSE
        -- Prenda con variantes: el padre se busca por nombre entre los padres vivos.
        SELECT * INTO v_padre FROM productos
         WHERE tenant_id = v_t AND deleted_at IS NULL AND variante_ejes IS NOT NULL
           AND lower(btrim(nombre)) = lower(btrim(v_f->>'producto')) LIMIT 1;
        IF v_padre.id IS NULL THEN
          INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, variante_ejes, tipo_venta)
          VALUES (v_t, btrim(v_f->>'producto'), v_cat, (v_fila->>'precio')::numeric, v_ejes, v_tipo::producto_tipo_venta)
          RETURNING * INTO v_padre;
          v_prods := v_prods + 1;
        ELSIF v_padre.variante_ejes IS DISTINCT FROM v_ejes THEN
          RAISE EXCEPTION '«%» ya existe con ejes %', v_padre.nombre, array_to_string(v_padre.variante_ejes, ', ');
        ELSIF v_unidad IS NOT NULL AND v_padre.tipo_venta::text <> v_tipo THEN
          UPDATE productos SET tipo_venta = v_tipo::producto_tipo_venta, updated_at = now()
           WHERE id = v_padre.id RETURNING * INTO v_padre;
        END IF;
        IF v_prod.id IS NOT NULL THEN
          IF v_prod.producto_padre_id IS DISTINCT FROM v_padre.id THEN
            RAISE EXCEPTION 'el SKU % ya es de otro producto', v_f->>'sku';
          END IF;
          v_fila := v_fila || jsonb_build_object('id', v_prod.id, 'existencia_inicial', NULL,
                                                 'codigo_barras', COALESCE(NULLIF(btrim(v_f->>'codigo_barras'), ''), v_prod.codigo_barras));
        END IF;
        v_r := _guardar_variante(v_t, v_padre, v_fila, p_sucursal);
        IF v_r = 'creada' THEN v_vars := v_vars + 1; ELSE v_act := v_act + 1; END IF;
      END IF;
    EXCEPTION
      WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_c = CONSTRAINT_NAME;
        RAISE EXCEPTION 'DATOS_INVALIDOS: línea %: %', v_linea, replace(_mensaje_unico_producto(v_c), 'DATOS_INVALIDOS: ', '') USING ERRCODE = '22023';
      WHEN OTHERS THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS: línea %: %', v_linea, regexp_replace(SQLERRM, '^(DATOS_INVALIDOS|VARIANTE_INVALIDA): ', '') USING ERRCODE = '22023';
    END;
    v_prod := NULL; v_padre := NULL;
  END LOOP;

  RETURN jsonb_build_object('categorias', v_cats, 'productos', v_prods, 'variantes_creadas', v_vars, 'actualizados', v_act);
END;
$$;
REVOKE ALL ON FUNCTION importar_catalogo_tienda(jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION importar_catalogo_tienda(jsonb, uuid) TO authenticated, service_role;
