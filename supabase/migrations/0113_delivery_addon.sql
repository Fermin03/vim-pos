-- ============================================================================
-- 0113 — `delivery_apps` pasa de módulo gratis a add-on de pago con interruptor del dueño.
--
-- Desde 0103, `delivery_apps` vale `true` en TODOS los planes y nadie lo comprueba en ningún
-- sitio: es una llave que nunca se usó. La integración con Uber Eats está en producción y costó
-- una entrega entera de construir; esta migración le pone dos capas, igual que ya existen por
-- separado en otros módulos:
--
--   - Permiso: lo concede VIM por cliente con una fila en `tenant_addons` (como CFDI, 0081).
--   - Encendido: lo da el dueño con una columna en `configuracion_tenant` (como `recetas`, 0013).
--
-- `delivery_apps` es el ÚNICO módulo con las dos capas a la vez. El precio de lista ($100/mes) es
-- el que paga un Esencial; Negocio y Cadena lo llevan incluido y el panel pre-llena $0.00 al darlo
-- de alta — no se resuelve por plan porque si el plan lo concediera, la caja de todo cliente de
-- Negocio sondearía sin usarlo nunca, que es justo la carga que esta entrega busca evitar.
--
-- Diseño: docs/superpowers/specs/2026-09-11-delivery-addon-design.md.
-- ============================================================================

-- ── El interruptor del dueño ─────────────────────────────────────────────────
ALTER TABLE configuracion_tenant
  ADD COLUMN IF NOT EXISTS modulo_delivery_activo boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN configuracion_tenant.modulo_delivery_activo IS
  'Interruptor del dueño para las apps de delivery. Hermano de modulo_inventario_activo (ADR 0013): VIM concede el add-on, el dueño lo enciende cuando lo va a usar. Apagado = la caja no sondea.';

-- ── El add-on que concede el permiso ─────────────────────────────────────────
INSERT INTO addons (codigo, nombre, descripcion, precio_mensual_mxn, features_activadas, orden_visualizacion)
VALUES (
  'DELIVERY',
  'Apps de delivery',
  'Los pedidos de Uber Eats entran a la caja como un ticket, con su comanda a cocina. '
    || 'Incluido sin cargo desde el plan Negocio; en Esencial se contrata aparte.',
  100.00,
  jsonb_build_object('delivery_apps', true),
  20
)
ON CONFLICT (codigo) DO NOTHING;

-- ── Lectura única de módulos: delivery_apps sale del bucle y se resuelve como CFDI + interruptor ──
-- Cuerpo copiado de 0103_platform_modulos_limites.sql:56-115 (aplicada en producción, no se toca).
-- Único cambio funcional: 'delivery_apps' sale del ARRAY del bucle (los otros cinco módulos se
-- resuelven exactamente igual) y se resuelve aparte, junto a CFDI, con su propio interruptor.
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
  v_del        boolean;
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

  FOREACH v_codigo IN ARRAY ARRAY['kds', 'recetas', 'reservaciones', 'promociones'] LOOP
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

  SELECT COALESCE(c.modulo_delivery_activo, false) INTO v_del
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;

  -- Delivery es el único módulo con las DOS capas a la vez: add-on de pago (como el CFDI) e
  -- interruptor del dueño (como recetas). El add-on dice si puede; el interruptor, si quiere.
  v_perm := tenant_addon_activo(p_tenant, 'DELIVERY');
  v_permitidos := v_permitidos || jsonb_build_object('delivery_apps', v_perm);
  v_efectivos  := v_efectivos  || jsonb_build_object('delivery_apps', (v_perm AND COALESCE(v_del, false)));

  RETURN jsonb_build_object('permitidos', v_permitidos, 'efectivos', v_efectivos);
END;
$$;
COMMENT ON FUNCTION modulos_efectivos(uuid) IS
  'Módulos por cliente: permitidos (plan + flags) y efectivos (AND encendido por el dueño). Única lectura autorizada (ADR 0014).';
REVOKE EXECUTE ON FUNCTION modulos_efectivos(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION modulos_efectivos(uuid) TO authenticated, service_role;

-- ── Barrer las excepciones manuales que quedarían huérfanas ──────────────────
-- Entre el 4 y el 11 de sep el panel permitía crear excepciones (`tenant_feature_flags`) para
-- `delivery_apps`, porque todavía no era `porAddon`. Con el cambio de arriba, el panel ya no
-- pinta el botón para tocarlas y `modulos_efectivos` ya no las lee (delivery_apps se resuelve
-- aparte, con el add-on + el interruptor) — si quedó alguna fila, sería basura invisible e
-- irremovible desde la interfaz para siempre. Es el único momento barato para limpiarla.
DELETE FROM tenant_feature_flags WHERE flag_codigo = 'delivery_apps';

-- ── Quitar delivery de los planes ────────────────────────────────────────────
-- 0103 lo puso en los nueve planes. Si se queda, es una llave muerta que hará dudar al siguiente
-- que lea la tabla sobre quién concede el módulo.
UPDATE planes SET features_incluidos = jsonb_set(
         features_incluidos, '{modulos}', (features_incluidos->'modulos') - 'delivery_apps')
 WHERE features_incluidos->'modulos' ? 'delivery_apps';

-- ── Dejar al tenant de pruebas con su add-on ─────────────────────────────────
-- vim-pruebas es el único que ejercita delivery hoy (la integración está en producción pero ningún
-- restaurante real la usa). Sin esto se quedaría sin su propio banco de pruebas. Va por uuid y no
-- por tenants.codigo a propósito: el uuid es el que aparece en los documentos de operación y en el
-- ledger de las dos entregas de combos, así que es el identificador que alguien puede verificar.
-- Ambas sentencias son idempotentes, que es lo que se le pide a una migración.
INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn, notas)
SELECT t.id, a.id, CURRENT_DATE, true, 0.00, 'Tenant de pruebas de VIM'
  FROM tenants t CROSS JOIN addons a
 WHERE t.id = 'd3462bb3-198b-4cc3-8105-7060d6998478' AND a.codigo = 'DELIVERY'
   AND NOT EXISTS (SELECT 1 FROM tenant_addons x WHERE x.tenant_id = t.id AND x.addon_id = a.id AND x.activo);

INSERT INTO configuracion_tenant (tenant_id, modulo_delivery_activo)
SELECT id, true FROM tenants WHERE id = 'd3462bb3-198b-4cc3-8105-7060d6998478'
ON CONFLICT (tenant_id) DO UPDATE SET modulo_delivery_activo = true;
