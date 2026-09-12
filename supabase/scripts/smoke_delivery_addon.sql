-- Smoke delivery add-on (spec 2026-09-11-delivery-addon-design.md, migración 0113). `delivery_apps`
-- deja de ser un módulo gratis en todos los planes y pasa a tener dos capas: el add-on `DELIVERY`
-- (permiso, lo concede VIM) y `configuracion_tenant.modulo_delivery_activo` (encendido, lo decide
-- el dueño). Recorre los tres estados, la vigencia sobre el interruptor, que ningún plan lo
-- conceda ya, y que la redefinición de `modulos_efectivos` no haya perdido los otros cinco módulos.
-- Sobre la semilla de dev. ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';  -- tenant de la semilla, plan QS
  v_m      jsonb;
BEGIN
  -- Estado 1: sin add-on → ni permitido ni efectivo.
  SELECT modulos_efectivos(v_tenant) INTO v_m;
  IF v_m IS NULL THEN
    RAISE EXCEPTION 'modulos_efectivos devolvió NULL: el tenant de prueba necesita un plan (LEFT JOIN planes + IF NOT FOUND)';
  END IF;
  IF (v_m->'permitidos'->>'delivery_apps')::boolean THEN RAISE EXCEPTION 'sin add-on no debe estar permitido'; END IF;
  IF (v_m->'efectivos'->>'delivery_apps')::boolean THEN RAISE EXCEPTION 'sin add-on no debe ser efectivo'; END IF;
  RAISE NOTICE 'estado 1 (sin add-on) OK: ni permitido ni efectivo';

  -- Estado 2: con add-on vigente y el interruptor apagado (default de la columna) → permitido, NO efectivo.
  INSERT INTO tenant_addons(tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
  VALUES (v_tenant, (SELECT id FROM addons WHERE codigo = 'DELIVERY'), CURRENT_DATE, true, 100.00);
  SELECT modulos_efectivos(v_tenant) INTO v_m;
  IF NOT (v_m->'permitidos'->>'delivery_apps')::boolean THEN RAISE EXCEPTION 'con add-on vigente debe estar permitido'; END IF;
  IF (v_m->'efectivos'->>'delivery_apps')::boolean THEN RAISE EXCEPTION 'permitido pero sin encender NO debe ser efectivo'; END IF;
  RAISE NOTICE 'estado 2 (add-on vigente, interruptor apagado) OK: permitido, no efectivo';

  -- Estado 3: encendido por el dueño → los dos.
  INSERT INTO configuracion_tenant(tenant_id, modulo_delivery_activo) VALUES (v_tenant, true)
    ON CONFLICT (tenant_id) DO UPDATE SET modulo_delivery_activo = true;
  SELECT modulos_efectivos(v_tenant) INTO v_m;
  IF NOT (v_m->'permitidos'->>'delivery_apps')::boolean THEN RAISE EXCEPTION 'encendido debe seguir permitido'; END IF;
  IF NOT (v_m->'efectivos'->>'delivery_apps')::boolean THEN RAISE EXCEPTION 'add-on vigente + encendido debe ser efectivo'; END IF;
  RAISE NOTICE 'estado 3 (add-on vigente + encendido) OK: permitido y efectivo';

  -- La vigencia manda sobre el interruptor: caducar el add-on lo apaga aunque el dueño lo deje encendido.
  UPDATE tenant_addons SET fecha_fin = CURRENT_DATE - 1
   WHERE tenant_id = v_tenant AND addon_id = (SELECT id FROM addons WHERE codigo = 'DELIVERY');
  SELECT modulos_efectivos(v_tenant) INTO v_m;
  IF (v_m->'permitidos'->>'delivery_apps')::boolean THEN RAISE EXCEPTION 'caducado no debe seguir permitido'; END IF;
  IF (v_m->'efectivos'->>'delivery_apps')::boolean THEN RAISE EXCEPTION 'caducado no debe ser efectivo aunque el interruptor siga encendido'; END IF;
  RAISE NOTICE 'vigencia sobre el interruptor OK: add-on caducado apaga aunque el dueño lo dejó encendido';

  -- Ningún plan concede delivery: es política de cobro (add-on), no permiso de plan.
  IF EXISTS (SELECT 1 FROM planes WHERE features_incluidos->'modulos' ? 'delivery_apps') THEN
    RAISE EXCEPTION 'delivery_apps no debe quedar en features_incluidos de ningún plan';
  END IF;
  RAISE NOTICE 'ningún plan concede delivery_apps OK';

  -- Los demás módulos no se tocaron al sacar delivery_apps del bucle de modulos_efectivos.
  IF NOT (v_m->'permitidos' ? 'kds' AND v_m->'permitidos' ? 'recetas'
          AND v_m->'permitidos' ? 'reservaciones' AND v_m->'permitidos' ? 'promociones'
          AND v_m->'permitidos' ? 'cfdi') THEN
    RAISE EXCEPTION 'la redefinición de modulos_efectivos perdió módulos: %', v_m;
  END IF;
  RAISE NOTICE 'los cinco módulos restantes (kds, recetas, reservaciones, promociones, cfdi) siguen resolviéndose OK';

  RAISE NOTICE 'SMOKE DELIVERY ADDON OK';
END $$;
ROLLBACK;
