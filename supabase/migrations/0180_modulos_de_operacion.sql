-- Módulos de operación por giro (spec 2026-10-14-giros-y-modulos-de-operacion-design.md, ADR 0034).
--
-- El giro ya no se lee en las pantallas: solo arma, al darse de alta, el juego inicial de diez
-- interruptores. Después los mueve solo VIM, desde /platform. Se guardan en `tenants` y no en
-- `configuracion_tenant` porque esta última la escribe el dueño (política `config_tenant FOR ALL`,
-- 0003); en `tenants` el UPDATE de `authenticated` está limitado a una lista de columnas (0132) y
-- `operacion` no entra en ella.

-- ── §1 El juego inicial de cada giro ─────────────────────────────────────────
-- Se compara como texto: así esta función no depende de que los valores de la 0179 ya estén
-- confirmados, y un giro que no está en la lista recibe todo encendido (ENTERPRISE, CAFE_BAR
-- viejo, NULL), que es lo que tenían todos antes de esta migración.
CREATE OR REPLACE FUNCTION juego_inicial_de_giro(p_giro vertical_tipo)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT (CASE p_giro::text
    WHEN 'QUICK_SERVICE' THEN '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":true,"repartidores":false,"kds":true,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false}'
    WHEN 'FULL_SERVICE'  THEN '{"mostrador":true,"comedor":true,"meseros":true,"domicilio":false,"repartidores":false,"kds":true,"reservaciones":true,"marcas":false,"eventos":false,"cuentas_barra":false}'
    WHEN 'FOODTRUCK'     THEN '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":true,"cuentas_barra":false}'
    WHEN 'DARK_KITCHEN'  THEN '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":true,"repartidores":true,"kds":true,"reservaciones":false,"marcas":true,"eventos":false,"cuentas_barra":false}'
    WHEN 'BAR'           THEN '{"mostrador":true,"comedor":true,"meseros":true,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":true}'
    WHEN 'CAFETERIA'     THEN '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false}'
    WHEN 'TAQUERIA'      THEN '{"mostrador":true,"comedor":true,"meseros":true,"domicilio":true,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false}'
    ELSE                      '{"mostrador":true,"comedor":true,"meseros":true,"domicilio":true,"repartidores":true,"kds":true,"reservaciones":true,"marcas":true,"eventos":true,"cuentas_barra":true}'
  END)::jsonb;
$$;
COMMENT ON FUNCTION juego_inicial_de_giro(vertical_tipo) IS
  'Módulos de operación con que arranca un negocio según su giro (tabla §5 del spec de giros). Sin giro conocido: todo encendido. Única fuente de esa tabla (0180).';

-- ── §2 Los interruptores ─────────────────────────────────────────────────────
-- Por defecto todo encendido: los clientes que ya existen no cambian sin que nadie haga nada.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS operacion jsonb NOT NULL DEFAULT juego_inicial_de_giro(NULL);
COMMENT ON COLUMN tenants.operacion IS
  'Módulos de operación encendidos (diez llaves booleanas). Los arma juego_inicial_de_giro al darse de alta y después solo los cambia VIM con operacion_cambiar / cambiar_giro (0180, ADR 0034).';

-- Completa, valida y corrige dependencias. NUNCA rechaza un valor válido por el estado del
-- negocio (cuentas abiertas): ese candado vive en operacion_cambiar, porque la caja baja `tenants`
-- en el pull y ahí no puede fallar. El pull corre con session_replication_role = replica, así que
-- este disparador no corre en la caja; aun así se mantiene determinista a propósito.
CREATE OR REPLACE FUNCTION operacion_normalizar(p jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_base jsonb := juego_inicial_de_giro(NULL);
  v      jsonb;
  k      text;
BEGIN
  IF p IS NOT NULL AND jsonb_typeof(p) <> 'object' THEN
    RAISE EXCEPTION 'MODULO_NO_BOOLEANO: operacion debe ser un objeto' USING ERRCODE = '22023';
  END IF;
  v := v_base || COALESCE(p, '{}'::jsonb);
  FOR k IN SELECT jsonb_object_keys(v) LOOP
    IF NOT v_base ? k THEN
      RAISE EXCEPTION 'MODULO_DESCONOCIDO: %', k USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v->k) <> 'boolean' THEN
      RAISE EXCEPTION 'MODULO_NO_BOOLEANO: %', k USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF NOT (v->>'comedor')::boolean   THEN v := v || '{"meseros":false}'::jsonb;      END IF;
  IF NOT (v->>'domicilio')::boolean THEN v := v || '{"repartidores":false}'::jsonb; END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION tenants_operacion_normalizar()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.operacion := operacion_normalizar(NEW.operacion);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tenants_operacion_normalizar ON tenants;
CREATE TRIGGER tenants_operacion_normalizar
  BEFORE INSERT OR UPDATE OF operacion ON tenants
  FOR EACH ROW EXECUTE FUNCTION tenants_operacion_normalizar();

-- Ningún negocio se pasa todavía a BAR, CAFETERIA ni TAQUERIA, y el alta aún no aplica el juego del
-- giro. La caja baja la fila completa de `tenants`, y una caja sin la 0179 no conoce esos valores:
-- su pull entero fallaría. La conversión de CAFE_BAR, el alta por giro y cambiar_giro hacia un giro
-- nuevo esperan a que la 0179 viaje en un instalador que ya tengan todas las cajas (ADR 0034).

-- ── §3 Lo que mueve /platform ────────────────────────────────────────────────
-- Cuentas que impiden apagar un módulo. BORRADOR también cuenta: una mesa con la cuenta abierta y
-- sin productos todavía es una mesa ocupada.
CREATE OR REPLACE FUNCTION operacion_cuentas_abiertas(p_tenant uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'comedor', (SELECT count(DISTINCT tm.ticket_id)
                  FROM tickets_mesas tm JOIN tickets t ON t.id = tm.ticket_id
                 WHERE tm.tenant_id = p_tenant AND tm.fecha_liberacion IS NULL
                   AND t.estado_fiscal IN ('BORRADOR', 'ABIERTO')),
    'cuentas_barra', (SELECT count(*) FROM tickets t
                       WHERE t.tenant_id = p_tenant AND t.modo_servicio = 'BARRA'
                         AND t.estado_fiscal IN ('BORRADOR', 'ABIERTO')));
$$;

CREATE OR REPLACE FUNCTION operacion_cambiar(p_tenant uuid, p_cambios jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_antes    jsonb;
  v_pedido   jsonb;
  v_despues  jsonb;
  v_abiertas jsonb;
  v_ajustes  text[];
BEGIN
  IF p_cambios IS NULL OR jsonb_typeof(p_cambios) <> 'object' THEN
    RAISE EXCEPTION 'CAMBIOS_INVALIDOS' USING ERRCODE = '22023';
  END IF;
  SELECT operacion INTO v_antes FROM tenants WHERE id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_NO_EXISTE' USING ERRCODE = 'P0002'; END IF;

  v_pedido  := v_antes || p_cambios;
  v_despues := operacion_normalizar(v_pedido);   -- valida llaves y tipos antes de leer valores

  IF (p_cambios->>'meseros')::boolean AND NOT (v_despues->>'comedor')::boolean THEN
    RAISE EXCEPTION 'MESEROS_REQUIERE_COMEDOR' USING ERRCODE = '22023';
  END IF;
  IF (p_cambios->>'repartidores')::boolean AND NOT (v_despues->>'domicilio')::boolean THEN
    RAISE EXCEPTION 'REPARTIDORES_REQUIERE_DOMICILIO' USING ERRCODE = '22023';
  END IF;

  v_abiertas := operacion_cuentas_abiertas(p_tenant);
  IF (v_antes->>'comedor')::boolean AND NOT (v_despues->>'comedor')::boolean
     AND (v_abiertas->>'comedor')::int > 0 THEN
    RAISE EXCEPTION 'CUENTAS_ABIERTAS_COMEDOR: %', v_abiertas->>'comedor' USING ERRCODE = '55006';
  END IF;
  IF (v_antes->>'cuentas_barra')::boolean AND NOT (v_despues->>'cuentas_barra')::boolean
     AND (v_abiertas->>'cuentas_barra')::int > 0 THEN
    RAISE EXCEPTION 'CUENTAS_ABIERTAS_BARRA: %', v_abiertas->>'cuentas_barra' USING ERRCODE = '55006';
  END IF;

  SELECT COALESCE(array_agg(k ORDER BY k), '{}') INTO v_ajustes
    FROM jsonb_object_keys(v_despues) k
   WHERE v_despues->k IS DISTINCT FROM v_pedido->k;

  UPDATE tenants SET operacion = v_despues WHERE id = p_tenant;
  RETURN jsonb_build_object('operacion', v_despues, 'ajustes', to_jsonb(v_ajustes));
END;
$$;
COMMENT ON FUNCTION operacion_cambiar(uuid, jsonb) IS
  'Panel de plataforma: enciende/apaga módulos de operación. Apaga dependientes (los reporta en ajustes), rechaza dependencias faltantes y apagar comedor/barra con cuentas abiertas. Solo service_role (0180).';

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
  -- La caja baja la fila completa de `tenants`; una caja sin la 0179 no conoce estos valores y su
  -- pull entero fallaría. Se liberan con una migración cuando todas las cajas la tengan (ADR 0034).
  IF p_giro::text IN ('BAR', 'CAFETERIA', 'TAQUERIA') THEN
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
COMMENT ON FUNCTION cambiar_giro(uuid, vertical_tipo, boolean) IS
  'Panel de plataforma: cambia el giro y, si p_reaplicar, vuelve a aplicar su juego inicial sin apagar comedor/barra con cuentas abiertas (lo dice en avisos). Rechaza giros retirados. Solo service_role (0180).';

REVOKE ALL ON FUNCTION operacion_cuentas_abiertas(uuid)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION operacion_cambiar(uuid, jsonb)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION cambiar_giro(uuid, vertical_tipo, boolean)  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION operacion_cuentas_abiertas(uuid)           TO service_role;
GRANT EXECUTE ON FUNCTION operacion_cambiar(uuid, jsonb)             TO service_role;
GRANT EXECUTE ON FUNCTION cambiar_giro(uuid, vertical_tipo, boolean) TO service_role;

-- ── §4 modulos_efectivos con los módulos de operación ────────────────────────
-- Cuerpo de la 0161 con tres cambios (marcados 0180): lee tenants.operacion junto con el plan; kds
-- y reservaciones pasan a ser plan Y interruptor; y se agregan las ocho llaves de operación
-- (permitidas siempre: no se cobran). Con todo encendido —el default— el resultado de kds y
-- reservaciones es el mismo de antes.
CREATE OR REPLACE FUNCTION modulos_efectivos(p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan       jsonb;
  v_op         jsonb;   -- 0180
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
  -- Un usuario autenticado solo puede preguntar por su propio tenant. Se decide por el ROL del
  -- JWT y no por la ausencia del claim: el hook de acceso (0006) emite tokens SIN tenant_id a
  -- empleados dados de baja, y un token así seguiría siendo `authenticated`. Sin JWT (sesión
  -- directa a la base: pruebas, semillas) o con service_role, pasa.
  IF auth.jwt() IS NOT NULL
     AND (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role'
     AND current_tenant_id() IS DISTINCT FROM p_tenant THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(p.features_incluidos->'modulos', '{}'::jsonb), t.operacion   -- 0180
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
                WHEN 'kds' THEN COALESCE((v_op->>'kds')::boolean, true)                      -- 0180
                WHEN 'reservaciones' THEN COALESCE((v_op->>'reservaciones')::boolean, true)  -- 0180
                ELSE true END;
    v_permitidos := v_permitidos || jsonb_build_object(v_codigo, v_perm);
    v_efectivos  := v_efectivos  || jsonb_build_object(v_codigo, (v_perm AND v_enc));
  END LOOP;

  -- 0180: módulos de operación. Siempre permitidos (no se cobran); el interruptor lo mueve VIM.
  FOREACH v_codigo IN ARRAY ARRAY['mostrador', 'comedor', 'meseros', 'domicilio', 'repartidores',
                                  'marcas', 'eventos', 'cuentas_barra'] LOOP
    v_permitidos := v_permitidos || jsonb_build_object(v_codigo, true);
    v_efectivos  := v_efectivos  || jsonb_build_object(v_codigo, COALESCE((v_op->>v_codigo)::boolean, true));
  END LOOP;

  v_perm := tenant_addon_activo(p_tenant, 'CFDI');
  v_permitidos := v_permitidos || jsonb_build_object('cfdi', v_perm);
  v_efectivos  := v_efectivos  || jsonb_build_object('cfdi', v_perm);

  SELECT COALESCE(c.modulo_delivery_activo, false) INTO v_del
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;

  -- Delivery es el único módulo con las DOS capas a la vez: add-on de pago (como el CFDI) e
  -- interruptor del dueño (como recetas). El add-on dice si puede; el interruptor, si quiere.
  v_perm := tenant_addon_activo(p_tenant, 'DELIVERY');
  v_permitidos := v_permitidos || jsonb_build_object('delivery_apps', v_perm);
  v_efectivos  := v_efectivos  || jsonb_build_object('delivery_apps', (v_perm AND COALESCE(v_del, false)));

  -- Lealtad: mismas dos capas que delivery. El add-on dice si puede; el interruptor, si quiere.
  SELECT COALESCE(c.modulo_lealtad_activo, false) INTO v_lea
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;
  v_perm := tenant_addon_activo(p_tenant, 'LEALTAD');
  v_permitidos := v_permitidos || jsonb_build_object('lealtad', v_perm);
  v_efectivos  := v_efectivos  || jsonb_build_object('lealtad', (v_perm AND COALESCE(v_lea, false)));

  -- Tienda en línea: mismas dos capas que delivery y lealtad.
  SELECT COALESCE(c.modulo_tienda_activo, false) INTO v_tie
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;
  v_perm := tenant_addon_activo(p_tenant, 'TIENDA');
  v_permitidos := v_permitidos || jsonb_build_object('tienda', v_perm);
  v_efectivos  := v_efectivos  || jsonb_build_object('tienda', (v_perm AND COALESCE(v_tie, false)));

  RETURN jsonb_build_object('permitidos', v_permitidos, 'efectivos', v_efectivos);
END;
$$;
COMMENT ON FUNCTION modulos_efectivos(uuid) IS
  'Módulos por cliente: permitidos (plan + flags; los de operación siempre) y efectivos (AND encendido por el dueño o, en los de operación, por VIM). Única lectura autorizada (ADR 0014, 0180).';
REVOKE EXECUTE ON FUNCTION modulos_efectivos(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION modulos_efectivos(uuid) TO authenticated, service_role;
