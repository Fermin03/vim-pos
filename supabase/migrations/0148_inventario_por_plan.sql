-- ============================================================================
-- 0148 — El inventario viene desde el plan Negocio: el candado que faltaba (ADR 0025).
--
-- El sitio dice que inventario, recetas y mermas vienen "desde Negocio". En la base el módulo ya
-- existía con sus dos capas (ADR 0014): `recetas` —"Recetas e inventario"— lo permite el plan
-- (`planes.features_incluidos->'modulos'->>'recetas'`, falso en Esencial desde 0103) o una
-- excepción de VIM (`tenant_feature_flags`), y lo enciende el dueño
-- (`configuracion_tenant.modulo_inventario_activo`). Lo que nunca hubo es quien lo APLICARA: un
-- negocio en Esencial podía dar de alta insumos, recetas y compras, y encender el descuento.
--
-- QUÉ SE CIERRA, Y DÓNDE
--
--   1. `inventario_permitido(tenant)`: la regla, en una función chica (la misma que usa
--      `modulos_efectivos` para `recetas`; pgTAP 0032 comprueba que digan lo mismo).
--
--   2. ESCRIBIR inventario sin el módulo se rechaza con un trigger en las tablas, no en cada RPC:
--      insumos, recetas y sus componentes, proveedores, compras y sus líneas, y los movimientos
--      MANUALES (ajustes, mermas, entradas por compra, transferencias). Un trigger y no una
--      política de RLS porque `guardar_receta`, `registrar_compra`, `anular_compra` y
--      `aplicar_movimiento_inventario` son SECURITY INVOKER: el trigger las cubre a todas y a la
--      escritura directa del panel con UN mensaje que el dueño entiende, donde RLS contestaría
--      "violates row-level security policy" o cero filas en silencio.
--      Solo actúa sobre roles sujetos a RLS (el dueño, su gente): `service_role` y las funciones
--      del sistema —el push de la caja, eliminar un negocio, las migraciones— pasan.
--
--   3. LA VENTA NUNCA FALLA POR ESTO. Dos capas:
--        · el interruptor del dueño no puede estar encendido sin el módulo (no se deja encender,
--          y se apaga solo cuando el negocio pierde el permiso: al bajar de plan o al quitarle la
--          excepción). Todas las funciones de venta ya leen ese interruptor y, apagado, no
--          descuentan nada: `descontar_inventario_por_venta`, el cobro y las reversas no se tocan.
--        · y si aun así llegara un movimiento de venta (una caja con el interruptor viejo), los
--          tipos que genera una venta —SALIDA_VENTA, SALIDA_MODIFICADOR_EXTRA,
--          REVERSA_CANCELACION— están FUERA del candado.
--
--   4. NADIE PIERDE LO QUE YA USA. Antes de cerrar, a todo negocio con insumos o recetas cuyo
--      plan no incluya el módulo se le concede por excepción (la misma que VIM pone a mano desde
--      /platform). Se decide por los DATOS, no por nombre de cliente.
--
-- LA CAJA INSTALADA aplica esta misma migración a su Postgres local, donde no hay catálogo de
-- planes fiable ni excepciones (no viajan en el pull). Ahí el candado NO actúa: la caja obedece a
-- la nube — el interruptor le llega ya resuelto en `configuracion_tenant` por el pull. Se detecta
-- igual que en 0125: la caja crea `_vim_migraciones` antes de migrar; en la nube no existe.
-- ============================================================================

-- ── 1. La regla ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.inventario_permitido(p_tenant uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_flag boolean;
  v_plan boolean;
BEGIN
  IF p_tenant IS NULL THEN RETURN false; END IF;
  -- En la caja instalada manda la nube (ver el encabezado).
  IF to_regclass('public._vim_migraciones') IS NOT NULL THEN RETURN true; END IF;
  -- Un usuario con sesión solo pregunta por su negocio (mismo criterio que modulos_efectivos).
  IF auth.jwt() IS NOT NULL
     AND (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role'
     AND current_tenant_id() IS DISTINCT FROM p_tenant THEN
    RETURN false;
  END IF;

  -- La excepción de VIM, si está vigente, manda sobre el plan (para conceder y para negar).
  SELECT f.activado INTO v_flag
    FROM tenant_feature_flags f
   WHERE f.tenant_id = p_tenant AND f.flag_codigo = 'recetas'
     AND f.fecha_inicio <= now() AND (f.fecha_fin IS NULL OR f.fecha_fin > now());
  IF v_flag IS NOT NULL THEN RETURN v_flag; END IF;

  SELECT (p.features_incluidos->'modulos'->>'recetas')::boolean INTO v_plan
    FROM tenants t LEFT JOIN planes p ON p.id = t.plan_actual_id
   WHERE t.id = p_tenant;
  RETURN COALESCE(v_plan, false);
END;
$$;
COMMENT ON FUNCTION public.inventario_permitido(uuid) IS
  '¿El negocio puede usar inventario y recetas? Excepción vigente de VIM si existe; si no, el plan (0148, ADR 0025). Misma regla que modulos_efectivos().permitidos.recetas. En la caja instalada siempre true: allá manda lo que baja de la nube.';
REVOKE ALL ON FUNCTION public.inventario_permitido(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventario_permitido(uuid) TO authenticated, service_role;

-- ¿Quien ejecuta está sujeto a RLS? (el dueño y su gente sí; service_role y el dueño de las
-- funciones del sistema, no). Mismo criterio que `_es_escritura_rest_directa` (0133).
CREATE OR REPLACE FUNCTION public._rol_sujeto_a_rls()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT NOT coalesce((SELECT r.rolsuper OR r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user), false);
$$;
REVOKE ALL ON FUNCTION public._rol_sujeto_a_rls() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._rol_sujeto_a_rls() TO authenticated, service_role;

-- ── 2. El candado de escritura ───────────────────────────────────────────────
-- SECURITY INVOKER a propósito: `current_user` tiene que ser el de quien escribe.
CREATE OR REPLACE FUNCTION public.inventario_exigir_modulo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  -- La caja instalada y el sistema (service_role, push de la caja, eliminar negocio) pasan.
  IF to_regclass('public._vim_migraciones') IS NOT NULL OR NOT _rol_sujeto_a_rls() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN v_tenant := OLD.tenant_id; ELSE v_tenant := NEW.tenant_id; END IF;

  -- Una fila de OTRO negocio no es asunto de este candado: la rechaza RLS, con su propio error.
  -- (Sin esto, un intento cruzado contestaría "viene desde el plan Negocio", que no es el motivo.)
  IF v_tenant IS DISTINCT FROM current_tenant_id() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- Lo que genera una VENTA (descuento al cobrar, extras, reversa por cancelación o devolución)
  -- no se toca nunca: una venta no puede fallar por el plan del negocio.
  -- `to_jsonb(NEW)` y no `NEW.tipo`: la función sirve a ocho tablas y solo una tiene esa columna.
  IF TG_TABLE_NAME = 'movimientos_inventario' THEN
    IF (to_jsonb(NEW) ->> 'tipo') IN ('SALIDA_VENTA', 'SALIDA_MODIFICADOR_EXTRA', 'REVERSA_CANCELACION') THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NOT inventario_permitido(v_tenant) THEN
    RAISE EXCEPTION 'El inventario viene desde el plan Negocio. Escríbenos y lo activamos.'
      USING ERRCODE = 'P0001', HINT = 'INVENTARIO_NO_INCLUIDO';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.inventario_exigir_modulo() FROM PUBLIC;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['insumos', 'recetas', 'receta_componentes', 'modificador_componentes',
                           'proveedores', 'proveedor_insumo_alias', 'compras', 'compra_lineas'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format(
      'CREATE OR REPLACE TRIGGER a10_inventario_exigir_modulo BEFORE INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.inventario_exigir_modulo()', t);
  END LOOP;
END $$;

-- Movimientos: solo el INSERT (nadie los edita ni los borra desde el panel) y, dentro, solo los
-- manuales — los de venta salen por la puerta de arriba.
CREATE OR REPLACE TRIGGER a10_inventario_exigir_modulo
  BEFORE INSERT ON public.movimientos_inventario
  FOR EACH ROW EXECUTE FUNCTION public.inventario_exigir_modulo();

-- ── 3. El interruptor del dueño no puede estar encendido sin el módulo ───────
CREATE OR REPLACE FUNCTION public.config_inventario_exigir_modulo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF to_regclass('public._vim_migraciones') IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.modulo_inventario_activo
     AND (TG_OP = 'INSERT' OR NOT OLD.modulo_inventario_activo)
     AND NOT inventario_permitido(NEW.tenant_id) THEN
    RAISE EXCEPTION 'El inventario viene desde el plan Negocio. Escríbenos y lo activamos.'
      USING ERRCODE = 'P0001', HINT = 'INVENTARIO_NO_INCLUIDO';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.config_inventario_exigir_modulo() FROM PUBLIC;

CREATE OR REPLACE TRIGGER trg_config_inventario_modulo
  BEFORE INSERT OR UPDATE OF modulo_inventario_activo ON public.configuracion_tenant
  FOR EACH ROW EXECUTE FUNCTION public.config_inventario_exigir_modulo();

-- Apaga el interruptor de un negocio que ya no tiene el módulo. SECURITY DEFINER: la llaman
-- triggers de `tenants` y de `tenant_feature_flags`, que escribe el panel con service_role.
CREATE OR REPLACE FUNCTION public._inventario_apagar_si_no_permitido(p_tenant uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_tenant IS NULL OR to_regclass('public._vim_migraciones') IS NOT NULL THEN RETURN; END IF;
  IF NOT inventario_permitido(p_tenant) THEN
    UPDATE configuracion_tenant
       SET modulo_inventario_activo = false
     WHERE tenant_id = p_tenant AND modulo_inventario_activo;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._inventario_apagar_si_no_permitido(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._inventario_apagar_si_no_permitido(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_inventario_al_cambiar_permiso()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_TABLE_NAME = 'tenants' THEN
    PERFORM _inventario_apagar_si_no_permitido(NEW.id);
    RETURN NEW;
  END IF;
  -- tenant_feature_flags: solo la excepción del módulo de inventario.
  IF TG_OP = 'DELETE' THEN
    IF OLD.flag_codigo = 'recetas' THEN PERFORM _inventario_apagar_si_no_permitido(OLD.tenant_id); END IF;
    RETURN OLD;
  END IF;
  IF NEW.flag_codigo = 'recetas' THEN PERFORM _inventario_apagar_si_no_permitido(NEW.tenant_id); END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.trg_inventario_al_cambiar_permiso() FROM PUBLIC;

-- Bajar de plan (cambiar_plan_tenant, 0141/0147) y cualquier otro cambio de `plan_actual_id`.
CREATE OR REPLACE TRIGGER trg_tenants_inventario_plan
  AFTER UPDATE OF plan_actual_id ON public.tenants
  FOR EACH ROW WHEN (OLD.plan_actual_id IS DISTINCT FROM NEW.plan_actual_id)
  EXECUTE FUNCTION public.trg_inventario_al_cambiar_permiso();

-- Quitar o negar la excepción desde /platform ("Quitar", "Según plan").
CREATE OR REPLACE TRIGGER trg_flags_inventario
  AFTER INSERT OR UPDATE OR DELETE ON public.tenant_feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.trg_inventario_al_cambiar_permiso();

-- ── 4. Nadie pierde lo que ya usa ────────────────────────────────────────────
-- A quien YA tiene insumos o recetas y su plan no incluye el módulo, se le concede por excepción.
-- Y a quien no lo tiene y dejó el interruptor encendido sin usarlo, se le apaga.
-- Devuelve a quién se le concedió y a quién se le apagó, para el aviso de la migración.
-- Solo en la nube: en la caja no hay catálogo de planes fiable.
CREATE OR REPLACE FUNCTION public.inventario_respetar_uso_previo()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_concedidos text[] := '{}';
  v_apagados   text[] := '{}';
  r            record;
BEGIN
  IF to_regclass('public._vim_migraciones') IS NOT NULL THEN
    RETURN jsonb_build_object('concedidos', '[]'::jsonb, 'apagados', '[]'::jsonb, 'caja', true);
  END IF;

  FOR r IN
    SELECT t.id, t.codigo
      FROM tenants t
     WHERE t.deleted_at IS NULL
       AND (EXISTS (SELECT 1 FROM insumos i WHERE i.tenant_id = t.id)
            OR EXISTS (SELECT 1 FROM recetas x WHERE x.tenant_id = t.id))
       AND NOT inventario_permitido(t.id)
       -- Una excepción que VIM puso a propósito para NEGARLO se respeta: no se pisa.
       AND NOT EXISTS (SELECT 1 FROM tenant_feature_flags f WHERE f.tenant_id = t.id AND f.flag_codigo = 'recetas')
     ORDER BY t.codigo
  LOOP
    INSERT INTO tenant_feature_flags (tenant_id, flag_codigo, activado, motivo)
    VALUES (r.id, 'recetas', true, 'Ya usaba inventario antes del candado por plan (0148): se le respeta')
    ON CONFLICT (tenant_id, flag_codigo) DO NOTHING;
    v_concedidos := v_concedidos || r.codigo::text;
  END LOOP;

  FOR r IN
    UPDATE configuracion_tenant c
       SET modulo_inventario_activo = false
      FROM tenants t
     WHERE t.id = c.tenant_id AND c.modulo_inventario_activo AND NOT inventario_permitido(c.tenant_id)
    RETURNING t.codigo
  LOOP
    v_apagados := v_apagados || r.codigo::text;
  END LOOP;

  RETURN jsonb_build_object('concedidos', to_jsonb(v_concedidos), 'apagados', to_jsonb(v_apagados), 'caja', false);
END;
$$;
COMMENT ON FUNCTION public.inventario_respetar_uso_previo() IS
  'Migración 0148: concede el módulo de inventario por excepción a los negocios que ya tienen insumos o recetas y cuyo plan no lo incluye, y apaga el interruptor a quien no lo tiene. Idempotente. Solo service_role.';
REVOKE ALL ON FUNCTION public.inventario_respetar_uso_previo() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inventario_respetar_uso_previo() TO service_role;

DO $$
DECLARE
  v jsonb;
BEGIN
  v := public.inventario_respetar_uso_previo();
  IF (v->>'caja')::boolean THEN
    RAISE NOTICE '0148: caja instalada — el candado de inventario no actúa aquí; manda lo que baja de la nube.';
  ELSE
    RAISE NOTICE '0148: inventario concedido por excepción (ya lo usaban): %', COALESCE(NULLIF(v->>'concedidos', '[]'), 'ninguno');
    RAISE NOTICE '0148: interruptor de descuento apagado (sin módulo y sin datos): %', COALESCE(NULLIF(v->>'apagados', '[]'), 'ninguno');
  END IF;
END $$;
