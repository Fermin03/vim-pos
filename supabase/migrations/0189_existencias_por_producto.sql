-- Existencias por producto y variantes (spec 2026-10-15-giro-retail-design.md, ADR 0037).
--
-- Un restaurante lleva su inventario por insumo y receta (0007, ADR 0012/0013); una tienda de ropa
-- lo lleva por prenda: "quedan 4 playeras M negras". Esto agrega lo segundo SIN tocar lo primero:
-- un producto controla existencias o usa recetas, nunca las dos. Los productos que ya existen
-- nacen con controla_existencias = false y no cambian.
--
-- Secciones: §1 giro y módulo · §2 variantes y costo · §3 existencias y movimientos ·
-- §4 venta, reabrir, cancelación y devolución · §5 movimientos a mano · §6 traspasos.

-- ── §1 El giro RETAIL y el módulo `existencias` ─────────────────────────────
-- Cuerpo de la 0180 con la llave `existencias` (apagada en todos los giros salvo RETAIL) y la fila
-- de RETAIL. Sin giro conocido sigue siendo "todo encendido" en los diez de antes; existencias no,
-- porque nadie lo tenía.
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
    ELSE                      '{"mostrador":true,"comedor":true,"meseros":true,"domicilio":true,"repartidores":true,"kds":true,"reservaciones":true,"marcas":true,"eventos":true,"cuentas_barra":true,"existencias":false}'
  END)::jsonb;
$$;
COMMENT ON FUNCTION juego_inicial_de_giro(vertical_tipo) IS
  'Módulos de operación con que arranca un negocio según su giro. Sin giro conocido: los diez de restaurante encendidos y existencias apagado. Única fuente de esa tabla (0180, 0189).';

-- operacion_normalizar toma las llaves válidas de juego_inicial_de_giro(NULL): ya acepta
-- `existencias` sin cambios. El DEFAULT de la columna (0183) también se calcula de ahí.
-- Los negocios que ya existen quedan con la llave explícita y apagada.
UPDATE tenants SET operacion = operacion || '{"existencias":false}'::jsonb
 WHERE NOT operacion ? 'existencias';

-- Cuerpo de la 0180 con RETAIL en la lista de giros que todavía no se asignan.
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
  -- La caja baja la fila completa de `tenants`; una caja sin la 0179/0188 no conoce estos valores y
  -- su pull entero fallaría. Se liberan con una migración cuando todas las cajas la tengan (ADR 0034).
  IF p_giro::text IN ('BAR', 'CAFETERIA', 'TAQUERIA', 'RETAIL') THEN   -- 0189: RETAIL
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

-- Cuerpo de la 0180 con `existencias`: siempre permitido (no se cobra, decisión de Fermín 15 oct);
-- encendido = interruptor de VIM, y si la llave no está, apagado (nadie lo tenía).
CREATE OR REPLACE FUNCTION modulos_efectivos(p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan       jsonb;
  v_op         jsonb;
  v_inv        boolean;
  v_del        boolean;
  v_lea        boolean;
  v_tie        boolean;
  v_permitidos jsonb := '{}'::jsonb;
  v_efectivos  jsonb := '{}'::jsonb;
  v_codigo     text;
  v_perm       boolean;
  v_enc        boolean;
  v_flag       boolean;
BEGIN
  IF p_tenant IS NULL THEN RETURN NULL; END IF;
  IF auth.jwt() IS NOT NULL
     AND (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role'
     AND current_tenant_id() IS DISTINCT FROM p_tenant THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(p.features_incluidos->'modulos', '{}'::jsonb), t.operacion
    INTO v_plan, v_op
    FROM tenants t LEFT JOIN planes p ON p.id = t.plan_actual_id
   WHERE t.id = p_tenant;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(c.modulo_inventario_activo, false) INTO v_inv
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;

  FOREACH v_codigo IN ARRAY ARRAY['kds', 'recetas', 'reservaciones', 'promociones'] LOOP
    v_flag := NULL;
    SELECT f.activado INTO v_flag
      FROM tenant_feature_flags f
     WHERE f.tenant_id = p_tenant AND f.flag_codigo = v_codigo
       AND f.fecha_inicio <= now() AND (f.fecha_fin IS NULL OR f.fecha_fin > now());
    v_perm := COALESCE(v_flag, (v_plan->>v_codigo)::boolean, false);
    v_enc  := CASE v_codigo
                WHEN 'recetas' THEN COALESCE(v_inv, false)
                WHEN 'kds' THEN COALESCE((v_op->>'kds')::boolean, true)
                WHEN 'reservaciones' THEN COALESCE((v_op->>'reservaciones')::boolean, true)
                ELSE true END;
    v_permitidos := v_permitidos || jsonb_build_object(v_codigo, v_perm);
    v_efectivos  := v_efectivos  || jsonb_build_object(v_codigo, (v_perm AND v_enc));
  END LOOP;

  FOREACH v_codigo IN ARRAY ARRAY['mostrador', 'comedor', 'meseros', 'domicilio', 'repartidores',
                                  'marcas', 'eventos', 'cuentas_barra'] LOOP
    v_permitidos := v_permitidos || jsonb_build_object(v_codigo, true);
    v_efectivos  := v_efectivos  || jsonb_build_object(v_codigo, COALESCE((v_op->>v_codigo)::boolean, true));
  END LOOP;

  -- 0189: existencias por producto. Sin llave = apagado.
  v_permitidos := v_permitidos || jsonb_build_object('existencias', true);
  v_efectivos  := v_efectivos  || jsonb_build_object('existencias', COALESCE((v_op->>'existencias')::boolean, false));

  v_perm := tenant_addon_activo(p_tenant, 'CFDI');
  v_permitidos := v_permitidos || jsonb_build_object('cfdi', v_perm);
  v_efectivos  := v_efectivos  || jsonb_build_object('cfdi', v_perm);

  SELECT COALESCE(c.modulo_delivery_activo, false) INTO v_del
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;
  v_perm := tenant_addon_activo(p_tenant, 'DELIVERY');
  v_permitidos := v_permitidos || jsonb_build_object('delivery_apps', v_perm);
  v_efectivos  := v_efectivos  || jsonb_build_object('delivery_apps', (v_perm AND COALESCE(v_del, false)));

  SELECT COALESCE(c.modulo_lealtad_activo, false) INTO v_lea
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;
  v_perm := tenant_addon_activo(p_tenant, 'LEALTAD');
  v_permitidos := v_permitidos || jsonb_build_object('lealtad', v_perm);
  v_efectivos  := v_efectivos  || jsonb_build_object('lealtad', (v_perm AND COALESCE(v_lea, false)));

  SELECT COALESCE(c.modulo_tienda_activo, false) INTO v_tie
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;
  v_perm := tenant_addon_activo(p_tenant, 'TIENDA');
  v_permitidos := v_permitidos || jsonb_build_object('tienda', v_perm);
  v_efectivos  := v_efectivos  || jsonb_build_object('tienda', (v_perm AND COALESCE(v_tie, false)));

  RETURN jsonb_build_object('permitidos', v_permitidos, 'efectivos', v_efectivos);
END;
$$;
COMMENT ON FUNCTION modulos_efectivos(uuid) IS
  'Módulos por cliente: permitidos (plan + flags; los de operación siempre) y efectivos (AND encendido por el dueño o, en los de operación, por VIM). Única lectura autorizada (ADR 0014, 0180, 0189).';
REVOKE EXECUTE ON FUNCTION modulos_efectivos(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION modulos_efectivos(uuid) TO authenticated, service_role;

-- ── §2 Variantes y costo ─────────────────────────────────────────────────────
-- La variante es un producto más (con su SKU, código de barras, precio y existencias) que apunta
-- a su padre. El padre es lo que se ve en catálogo y caja ("Playera Polo") y no se vende.
-- Un solo nivel. El precio de la hija es siempre suyo: el admin lo prellena con el del padre
-- (precio_base_mxn es NOT NULL y lo leen cobro, menús, combos y tienda).
ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS producto_padre_id    uuid NULL REFERENCES productos(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS variante_ejes        text[] NULL,
  ADD COLUMN IF NOT EXISTS variante_valores     jsonb NULL,
  ADD COLUMN IF NOT EXISTS costo_mxn            numeric(12,2) NULL CHECK (costo_mxn IS NULL OR costo_mxn >= 0),
  ADD COLUMN IF NOT EXISTS controla_existencias boolean NOT NULL DEFAULT false;

ALTER TABLE productos
  -- Padre: tiene ejes y no tiene padre ni valores. Hija: tiene padre y valores y no tiene ejes.
  ADD CONSTRAINT productos_variante_forma CHECK (
    (producto_padre_id IS NULL AND variante_valores IS NULL)
    OR (producto_padre_id IS NOT NULL AND variante_ejes IS NULL
        AND variante_valores IS NOT NULL AND jsonb_typeof(variante_valores) = 'object')),
  -- El padre no se vende, así que no tiene existencias.
  ADD CONSTRAINT productos_padre_sin_existencias CHECK (NOT (variante_ejes IS NOT NULL AND controla_existencias));

COMMENT ON COLUMN productos.producto_padre_id IS 'Variante: apunta al producto padre (un nivel). El padre no se vende (0189).';
COMMENT ON COLUMN productos.variante_ejes IS 'Solo en el padre: ejes de sus variantes, p. ej. {Talla,Color} (0189).';
COMMENT ON COLUMN productos.variante_valores IS 'Solo en la hija: valor por eje, p. ej. {"Talla":"M","Color":"Negra"} (0189).';
COMMENT ON COLUMN productos.costo_mxn IS 'Costo vigente (último de entrada). Para margen y existencias valorizadas (0189).';
COMMENT ON COLUMN productos.controla_existencias IS 'true = lleva existencias por sucursal en producto_existencias. Excluye recetas/insumos (0189).';

CREATE INDEX IF NOT EXISTS idx_productos_padre ON productos(producto_padre_id)
  WHERE producto_padre_id IS NOT NULL AND deleted_at IS NULL;
-- jsonb compara por contenido: {"Color":"Negra","Talla":"M"} = {"Talla":"M","Color":"Negra"}.
CREATE UNIQUE INDEX IF NOT EXISTS productos_variante_unica ON productos(producto_padre_id, variante_valores)
  WHERE producto_padre_id IS NOT NULL AND deleted_at IS NULL;
-- Único solo entre los que controlan existencias (igual que el SKU): así la migración no puede
-- fallar en ninguna base existente (nube o caja); los restaurantes pueden seguir repitiendo códigos.
CREATE UNIQUE INDEX IF NOT EXISTS productos_codigo_barras_unico ON productos(tenant_id, codigo_barras)
  WHERE codigo_barras IS NOT NULL AND deleted_at IS NULL AND controla_existencias;
-- SKU único solo entre los que controlan existencias: los restaurantes pueden repetirlo hoy.
CREATE UNIQUE INDEX IF NOT EXISTS productos_sku_existencias_unico ON productos(tenant_id, codigo_interno)
  WHERE codigo_interno IS NOT NULL AND deleted_at IS NULL AND controla_existencias;

-- Coherencia que un CHECK no alcanza: el padre existe, es del mismo negocio, es padre (tiene ejes,
-- no tiene padre) y los valores de la hija son exactamente sus ejes, con texto no vacío. Tampoco se
-- cambian los ejes de un padre que ya tiene hijas. En la caja el pull corre en réplica y esto no
-- corre: la nube ya lo validó.
CREATE OR REPLACE FUNCTION productos_variante_coherencia()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_padre productos%ROWTYPE;
  k       text;
BEGIN
  IF NEW.variante_ejes IS NOT NULL AND cardinality(NEW.variante_ejes) = 0 THEN
    RAISE EXCEPTION 'VARIANTE_INVALIDA: un producto con variantes necesita al menos un eje' USING ERRCODE = '23514';
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
DROP TRIGGER IF EXISTS trg_productos_variante_coherencia ON productos;
CREATE TRIGGER trg_productos_variante_coherencia
  BEFORE INSERT OR UPDATE OF producto_padre_id, variante_ejes, variante_valores, tenant_id ON productos
  FOR EACH ROW EXECUTE FUNCTION productos_variante_coherencia();

-- El padre no se vende. Disparador y no cambio en agregar_item_a_ticket: cubre también combos,
-- tienda y cualquier camino futuro sin reescribir esas funciones.
CREATE OR REPLACE FUNCTION ticket_items_no_padre()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.producto_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM productos WHERE id = NEW.producto_id AND variante_ejes IS NOT NULL) THEN
    RAISE EXCEPTION 'PRODUCTO_CON_VARIANTES: elige la variante (talla, color) que se vende' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_ticket_items_no_padre ON ticket_items;
CREATE TRIGGER trg_ticket_items_no_padre
  BEFORE INSERT OR UPDATE OF producto_id ON ticket_items
  FOR EACH ROW EXECUTE FUNCTION ticket_items_no_padre();
