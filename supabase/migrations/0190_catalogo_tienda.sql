-- Catálogo de tienda en el admin (spec 2026-10-15-giro-retail-design.md §6.1 y §13; ADR 0037).
-- §1 reglas completas de variantes y herencia del padre · §2 códigos internos ·
-- §3 _guardar_variante + guardar_variantes · §4 importar_catalogo_tienda.

-- ── §1 Reglas completas y herencia ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION productos_variante_coherencia()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_padre productos%ROWTYPE;
  k       text;
BEGIN
  -- 0190: ejes sin repetir (sin importar mayúsculas), sin nulos y sin vacíos.
  IF NEW.variante_ejes IS NOT NULL AND (
       cardinality(NEW.variante_ejes) = 0
       OR array_position(NEW.variante_ejes, NULL) IS NOT NULL
       OR EXISTS (SELECT 1 FROM unnest(NEW.variante_ejes) e WHERE btrim(e) = '')
       OR cardinality(NEW.variante_ejes) <> (SELECT count(DISTINCT lower(btrim(e))) FROM unnest(NEW.variante_ejes) e)) THEN
    RAISE EXCEPTION 'VARIANTE_INVALIDA: los ejes no pueden ir vacíos ni repetidos' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.variante_ejes IS DISTINCT FROM NEW.variante_ejes
     AND EXISTS (SELECT 1 FROM productos h WHERE h.producto_padre_id = NEW.id AND h.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'VARIANTE_INVALIDA: no se cambian los ejes de un producto que ya tiene variantes' USING ERRCODE = '23514';
  END IF;

  IF NEW.producto_padre_id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_padre FROM productos WHERE id = NEW.producto_padre_id;
  IF NOT FOUND OR v_padre.tenant_id <> NEW.tenant_id THEN
    RAISE EXCEPTION 'VARIANTE_INVALIDA: el producto padre no es de este negocio' USING ERRCODE = '23514';
  END IF;
  -- 0190: ni a un padre borrado (al crear la hija o al moverla de padre).
  IF v_padre.deleted_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.producto_padre_id IS DISTINCT FROM NEW.producto_padre_id) THEN
    RAISE EXCEPTION 'VARIANTE_INVALIDA: el producto padre está eliminado' USING ERRCODE = '23514';
  END IF;
  IF v_padre.producto_padre_id IS NOT NULL OR v_padre.variante_ejes IS NULL THEN
    RAISE EXCEPTION 'VARIANTE_INVALIDA: el padre tiene que ser un producto con variantes' USING ERRCODE = '23514';
  END IF;
  IF (SELECT array_agg(x ORDER BY x) FROM jsonb_object_keys(NEW.variante_valores) x)
     IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(v_padre.variante_ejes) x) THEN
    RAISE EXCEPTION 'VARIANTE_INVALIDA: la variante debe traer exactamente los ejes %', v_padre.variante_ejes USING ERRCODE = '23514';
  END IF;
  FOR k IN SELECT jsonb_object_keys(NEW.variante_valores) LOOP
    IF jsonb_typeof(NEW.variante_valores->k) <> 'string' OR btrim(NEW.variante_valores->>k) = '' THEN
      RAISE EXCEPTION 'VARIANTE_INVALIDA: el valor de % no puede ir vacío', k USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

-- "Playera Polo" + {"Talla":"M","Color":"Negra"} con ejes {Talla,Color} → "Playera Polo M Negra".
CREATE OR REPLACE FUNCTION _nombre_variante(p_nombre text, p_ejes text[], p_valores jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT p_nombre || ' ' || string_agg(p_valores->>e, ' ' ORDER BY o)
    FROM unnest(p_ejes) WITH ORDINALITY AS x(e, o);
$$;

-- Lo que la hija copia del padre se mantiene igual cuando el padre cambia. En la caja el pull corre
-- en réplica y esto no corre: la nube ya mandó las hijas actualizadas.
CREATE OR REPLACE FUNCTION productos_heredar_a_variantes()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE productos h
     SET nombre = _nombre_variante(NEW.nombre, NEW.variante_ejes, h.variante_valores),
         categoria_id = NEW.categoria_id, clave_sat = NEW.clave_sat, unidad_sat = NEW.unidad_sat,
         tasa_iva = NEW.tasa_iva, iva_incluido_en_precio = NEW.iva_incluido_en_precio, updated_at = now()
   WHERE h.producto_padre_id = NEW.id AND h.deleted_at IS NULL;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_productos_heredar_a_variantes ON productos;
CREATE TRIGGER trg_productos_heredar_a_variantes
  AFTER UPDATE OF nombre, categoria_id, clave_sat, unidad_sat, tasa_iva, iva_incluido_en_precio ON productos
  FOR EACH ROW WHEN (NEW.variante_ejes IS NOT NULL AND
        (OLD.nombre, OLD.categoria_id, OLD.clave_sat, OLD.unidad_sat, OLD.tasa_iva, OLD.iva_incluido_en_precio)
        IS DISTINCT FROM (NEW.nombre, NEW.categoria_id, NEW.clave_sat, NEW.unidad_sat, NEW.tasa_iva, NEW.iva_incluido_en_precio))
  EXECUTE FUNCTION productos_heredar_a_variantes();

-- ── §2 Códigos de barras internos ────────────────────────────────────────────
-- EAN-13 con prefijo 20 (rango de uso interno de GS1): "20" + 10 dígitos consecutivos por negocio
-- + dígito verificador. Un contador por negocio: un código borrado, vaciado o tecleado a mano
-- (20…) no se vuelve a entregar. El candado de fila del contador serializa las llamadas.
CREATE TABLE IF NOT EXISTS codigos_internos_contador (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE RESTRICT,
  ultimo    bigint NOT NULL
);
ALTER TABLE codigos_internos_contador ENABLE ROW LEVEL SECURITY;   -- sin políticas: solo funciones SECURITY DEFINER
REVOKE ALL ON codigos_internos_contador FROM PUBLIC, anon, authenticated;
GRANT ALL ON codigos_internos_contador TO service_role;

CREATE OR REPLACE FUNCTION ean13_digito(p_doce text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT ((10 - (sum(substr(p_doce, i, 1)::int * CASE WHEN i % 2 = 0 THEN 3 ELSE 1 END) % 10)) % 10)::text
    FROM generate_series(1, 12) i;
$$;

CREATE OR REPLACE FUNCTION _siguiente_codigo_interno(p_tenant uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_n    bigint;
  v_doce text;
BEGIN
  INSERT INTO codigos_internos_contador AS c (tenant_id, ultimo)
  VALUES (p_tenant, COALESCE((SELECT max(substr(codigo_barras, 3, 10)::bigint) FROM productos
                               WHERE tenant_id = p_tenant AND codigo_barras ~ '^20[0-9]{11}$'), 0) + 1)
  ON CONFLICT (tenant_id) DO UPDATE SET ultimo = GREATEST(c.ultimo + 1, EXCLUDED.ultimo)
  RETURNING ultimo INTO v_n;
  v_doce := '20' || lpad(v_n::text, 10, '0');
  RETURN v_doce || ean13_digito(v_doce);
END;
$$;
REVOKE ALL ON FUNCTION _siguiente_codigo_interno(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION generar_codigo_interno()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN _siguiente_codigo_interno(_existencias_puede_escribir());
END;
$$;
REVOKE ALL ON FUNCTION generar_codigo_interno() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION generar_codigo_interno() TO authenticated, service_role;

-- ── §3 Guardar variantes ─────────────────────────────────────────────────────
-- Una hija: la crea (con su existencia inicial) o la actualiza o la desactiva. La usan el editor
-- (guardar_variantes) y el importador (importar_catalogo_tienda). Interna: confía en que quien la
-- llama ya validó negocio, permiso, módulo y padre.
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
                           clave_sat, unidad_sat, tasa_iva, iva_incluido_en_precio, producto_padre_id, variante_valores,
                           controla_existencias, en_menu_general, visible_en_pos, estado, orden_visualizacion, deleted_at)
    VALUES (p_tenant, _nombre_variante(p_padre.nombre, p_padre.variante_ejes, v_valores), p_padre.categoria_id, v_precio,
            v_costo, v_cod, v_barras, p_padre.clave_sat, p_padre.unidad_sat, p_padre.tasa_iva, p_padre.iva_incluido_en_precio,
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

-- El índice que choca, dicho como lo entiende el dueño.
CREATE OR REPLACE FUNCTION _mensaje_unico_producto(p_constraint text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_constraint
    WHEN 'productos_codigo_barras_unico' THEN 'DATOS_INVALIDOS: el código de barras ya lo tiene otro producto'
    WHEN 'productos_sku_existencias_unico' THEN 'DATOS_INVALIDOS: el SKU ya lo tiene otro producto'
    WHEN 'productos_variante_unica' THEN 'DATOS_INVALIDOS: esa combinación de variantes ya existe'
    ELSE 'DATOS_INVALIDOS: hay un dato repetido (' || p_constraint || ')' END;
$$;

CREATE OR REPLACE FUNCTION guardar_variantes(p_padre uuid, p_ejes text[], p_filas jsonb, p_sucursal uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_t  uuid := _existencias_puede_escribir();
  v_p  productos%ROWTYPE;
  v_f  jsonb;
  v_r  text;
  v_c  text;
  v_n  jsonb := '{"creadas":0,"actualizadas":0,"desactivadas":0}';
BEGIN
  SELECT * INTO v_p FROM productos WHERE id = p_padre AND tenant_id = v_t AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR v_p.producto_padre_id IS NOT NULL THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el producto no existe o es una variante' USING ERRCODE = '22023';
  END IF;
  IF v_p.controla_existencias THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: quita «Lleva existencias» del producto antes de darle tallas y colores' USING ERRCODE = '22023';
  END IF;
  IF p_ejes IS NULL THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: faltan los ejes de las variantes' USING ERRCODE = '22023';
  END IF;
  IF p_filas IS NULL OR jsonb_typeof(p_filas) <> 'array' THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: variantes mal formadas' USING ERRCODE = '22023';
  END IF;
  IF p_sucursal IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sucursales WHERE id = p_sucursal AND tenant_id = v_t) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la sucursal no es de tu negocio' USING ERRCODE = '22023';
  END IF;

  IF v_p.variante_ejes IS DISTINCT FROM p_ejes THEN
    UPDATE productos SET variante_ejes = p_ejes, updated_at = now() WHERE id = p_padre RETURNING * INTO v_p;
  END IF;

  BEGIN
    FOR v_f IN SELECT value FROM jsonb_array_elements(p_filas) LOOP
      CONTINUE WHEN NULLIF(v_f->>'id', '') IS NULL AND v_f->>'activa' = 'false';
      v_r := _guardar_variante(v_t, v_p, v_f, p_sucursal);
      v_n := jsonb_set(v_n, ARRAY[v_r || 's'], to_jsonb((v_n->>(v_r || 's'))::int + 1));
    END LOOP;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_c = CONSTRAINT_NAME;
    RAISE EXCEPTION '%', _mensaje_unico_producto(v_c) USING ERRCODE = '22023';
  END;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION guardar_variantes(uuid, text[], jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION guardar_variantes(uuid, text[], jsonb, uuid) TO authenticated, service_role;
