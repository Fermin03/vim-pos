-- ============================================================================
-- 0103 — El panel de plataforma controla módulos y límites por cliente (ADR 0014, entrega 1).
--
-- `tenant_feature_flags` (0002) y `planes.max_*` existían desde el primer día y nadie los
-- leía. Aquí se les da una lectura única (`modulos_efectivos`, `limites_efectivos`), una tabla
-- de excepciones de límites por cliente, la primera regla que los aplica (cajas por sucursal)
-- y las dos columnas con las que "suspender con gracia" programa el bloqueo que la caja
-- empezará a obedecer en la entrega 2 (latido, migración 0104).
--
-- Diseño: docs/superpowers/specs/2026-09-04-platform-centro-de-control-design.md §5.4–5.5.
-- ============================================================================

-- ── Límites por cliente (excepciones sobre el plan) ─────────────────────────
CREATE TABLE tenant_limites (
  tenant_id               uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  max_sucursales          integer NULL CHECK (max_sucursales IS NULL OR max_sucursales >= 1),
  max_cajas_por_sucursal  integer NULL CHECK (max_cajas_por_sucursal IS NULL OR max_cajas_por_sucursal >= 1),
  max_usuarios            integer NULL CHECK (max_usuarios IS NULL OR max_usuarios >= 1),
  motivo                  text NULL,
  updated_at              timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE tenant_limites IS
  'Excepciones de límites por cliente. NULL = manda el plan. Solo la escribe el panel de plataforma (service_role).';
ALTER TABLE tenant_limites ENABLE ROW LEVEL SECURITY;   -- sin políticas: solo service_role
CREATE TRIGGER trg_tenant_limites_updated_at
  BEFORE UPDATE ON tenant_limites
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Bloqueo programado (lo escribe "suspender con gracia"; lo obedece la caja desde 0103) ──
ALTER TABLE tenants
  ADD COLUMN bloqueo_desde   timestamptz NULL,
  ADD COLUMN bloqueo_mensaje text NULL;
COMMENT ON COLUMN tenants.bloqueo_desde IS
  'A partir de cuándo las directivas dicen bloqueado=true. NULL = sin bloqueo programado.';
COMMENT ON COLUMN tenants.bloqueo_mensaje IS
  'Lo que verá el cajero en la banda de gracia y en la pantalla de bloqueo.';

-- ── Módulos por plan ─────────────────────────────────────────────────────────
-- `cfdi` NO va aquí: lo resuelve el add-on CFDI (0081), que el alta ya materializa (0086).
-- Esencial es "una sola caja, sin inventario"; el resto incluye todo. Los planes heredados por
-- vertical (retirados en 0086) reciben lo mismo que Negocio para que nadie pierda nada.
UPDATE planes
   SET features_incluidos = features_incluidos || jsonb_build_object('modulos', jsonb_build_object(
         'delivery_apps', true,
         'kds',           true,
         'recetas',       (codigo <> 'ESENCIAL'),
         'reservaciones', true,
         'promociones',   true))
 WHERE codigo IN ('ESENCIAL', 'NEGOCIO', 'CADENA', 'FT', 'QS', 'CB', 'FS', 'DK', 'ENT');

-- ── Lectura única de módulos ─────────────────────────────────────────────────
-- permitido = flag vigente si existe, si no lo que dice el plan; cfdi = add-on.
-- efectivo  = permitido AND encendido por el dueño. Solo `recetas` tiene interruptor del dueño
-- hoy (configuracion_tenant.modulo_inventario_activo, ADR 0013); los demás módulos no tienen
-- interruptor propio, así que encendido = true para no apagar nada que hoy funciona.
CREATE OR REPLACE FUNCTION modulos_efectivos(p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan       jsonb;
  v_inv        boolean;
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

  SELECT COALESCE(p.features_incluidos->'modulos', '{}'::jsonb)
    INTO v_plan
    FROM tenants t LEFT JOIN planes p ON p.id = t.plan_actual_id
   WHERE t.id = p_tenant;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(c.modulo_inventario_activo, false) INTO v_inv
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;

  FOREACH v_codigo IN ARRAY ARRAY['delivery_apps', 'kds', 'recetas', 'reservaciones', 'promociones'] LOOP
    v_flag := NULL;
    SELECT f.activado INTO v_flag
      FROM tenant_feature_flags f
     WHERE f.tenant_id = p_tenant AND f.flag_codigo = v_codigo
       AND f.fecha_inicio <= now() AND (f.fecha_fin IS NULL OR f.fecha_fin > now());
    v_perm := COALESCE(v_flag, (v_plan->>v_codigo)::boolean, false);
    v_enc  := CASE v_codigo WHEN 'recetas' THEN COALESCE(v_inv, false) ELSE true END;
    v_permitidos := v_permitidos || jsonb_build_object(v_codigo, v_perm);
    v_efectivos  := v_efectivos  || jsonb_build_object(v_codigo, (v_perm AND v_enc));
  END LOOP;

  v_perm := tenant_addon_activo(p_tenant, 'CFDI');
  v_permitidos := v_permitidos || jsonb_build_object('cfdi', v_perm);
  v_efectivos  := v_efectivos  || jsonb_build_object('cfdi', v_perm);

  RETURN jsonb_build_object('permitidos', v_permitidos, 'efectivos', v_efectivos);
END;
$$;
COMMENT ON FUNCTION modulos_efectivos(uuid) IS
  'Módulos por cliente: permitidos (plan + flags) y efectivos (AND encendido por el dueño). Única lectura autorizada (ADR 0014).';
REVOKE EXECUTE ON FUNCTION modulos_efectivos(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION modulos_efectivos(uuid) TO authenticated, service_role;

-- ── Lectura única de límites ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION limites_efectivos(p_tenant uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_tenant IS NULL THEN NULL
    -- Mismo criterio que modulos_efectivos: por rol, no por ausencia del claim.
    WHEN auth.jwt() IS NOT NULL
         AND (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role'
         AND current_tenant_id() IS DISTINCT FROM p_tenant THEN NULL
    ELSE (
      SELECT jsonb_build_object(
        'max_sucursales',         COALESCE(l.max_sucursales, p.max_sucursales),
        'max_cajas_por_sucursal', COALESCE(l.max_cajas_por_sucursal, p.max_cajas_por_sucursal),
        'max_usuarios',           COALESCE(l.max_usuarios, p.max_usuarios),
        'del_plan',  jsonb_build_object(
                       'max_sucursales', p.max_sucursales,
                       'max_cajas_por_sucursal', p.max_cajas_por_sucursal,
                       'max_usuarios', p.max_usuarios),
        'excepcion', jsonb_build_object(
                       'max_sucursales', l.max_sucursales,
                       'max_cajas_por_sucursal', l.max_cajas_por_sucursal,
                       'max_usuarios', l.max_usuarios,
                       'motivo', l.motivo))
      FROM tenants t
      LEFT JOIN planes p ON p.id = t.plan_actual_id
      LEFT JOIN tenant_limites l ON l.tenant_id = t.id
      WHERE t.id = p_tenant)
  END;
$$;
COMMENT ON FUNCTION limites_efectivos(uuid) IS
  'Límites por cliente: excepción de tenant_limites si existe, si no el plan. NULL = sin límite.';
REVOKE EXECUTE ON FUNCTION limites_efectivos(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION limites_efectivos(uuid) TO authenticated, service_role;

-- ── Primera regla que aplica un límite: cajas por sucursal ──────────────────
-- El admin del dueño inserta cajas directo bajo RLS, así que el candado va en la tabla. El pull
-- de la caja instalada corre en modo réplica y no dispara este trigger (ADR 0004).
--
-- Cubre INSERT y también UPDATE de `activa`, `sucursal_id` y `deleted_at`: la política de cajas
-- es FOR ALL, así que sin eso el dueño podía crear una caja, desactivarla, crear otra y volver a
-- activar la primera (o mover una caja a la sucursal llena) y quedarse con dos donde el plan da
-- una. Solo cuenta la fila resultante si queda activa y no borrada, y se excluye a sí misma.
CREATE OR REPLACE FUNCTION cajas_verificar_limite()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_max integer;
  v_n   integer;
BEGIN
  IF NOT (NEW.activa AND NEW.deleted_at IS NULL) THEN RETURN NEW; END IF;
  SELECT (limites_efectivos(NEW.tenant_id)->>'max_cajas_por_sucursal')::integer INTO v_max;
  IF v_max IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_n FROM cajas
   WHERE sucursal_id = NEW.sucursal_id AND deleted_at IS NULL AND activa = true AND id <> NEW.id;
  IF v_n >= v_max THEN
    RAISE EXCEPTION 'Tu plan permite % caja(s) por sucursal. Pide a VIM ampliar el límite.', v_max
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION cajas_verificar_limite() FROM public;
CREATE TRIGGER trg_cajas_limite
  BEFORE INSERT OR UPDATE OF activa, sucursal_id, deleted_at ON cajas
  FOR EACH ROW EXECUTE FUNCTION cajas_verificar_limite();
