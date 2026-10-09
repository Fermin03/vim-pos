-- Smoke tienda en línea (mig. 0161 §5): el módulo `tienda` tiene las dos capas de delivery y
-- lealtad —complemento de VIM e interruptor del dueño—, el cambio de plan TODAVÍA NO lo concede
-- (eso llega con la migración de salida, entrega 7, como hizo lealtad en 0159), y la redefinición
-- de modulos_efectivos no perdió los módulos que ya existían.
-- Uso: cd desktop && npm run smokes -- smoke_tienda_modulo.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_m      jsonb;
  v_r      jsonb;
  v_negocio uuid;
  -- OJO: la misma expresión que tenant_addon_activo. Con CURRENT_DATE (UTC en el CI) este smoke
  -- se pondría rojo seis horas al día.
  v_hoy    date := (now() AT TIME ZONE 'America/Mexico_City')::date;
BEGIN
  INSERT INTO configuracion_tenant (tenant_id) VALUES (v_tenant) ON CONFLICT (tenant_id) DO NOTHING;

  -- 1) Sin complemento: ni permitido ni efectivo, aunque el dueño lo encienda.
  UPDATE configuracion_tenant SET modulo_tienda_activo = true WHERE tenant_id = v_tenant;
  SELECT modulos_efectivos(v_tenant) INTO v_m;
  IF v_m IS NULL THEN RAISE EXCEPTION 'modulos_efectivos devolvió NULL: el tenant de prueba necesita un plan'; END IF;
  IF (v_m->'permitidos'->>'tienda')::boolean THEN RAISE EXCEPTION '1: sin complemento no debe estar permitido'; END IF;
  IF (v_m->'efectivos'->>'tienda')::boolean THEN RAISE EXCEPTION '1: sin complemento no debe ser efectivo'; END IF;

  -- 2) Con complemento e interruptor apagado: permitido, no efectivo.
  UPDATE configuracion_tenant SET modulo_tienda_activo = false WHERE tenant_id = v_tenant;
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
  VALUES (v_tenant, (SELECT id FROM addons WHERE codigo = 'TIENDA'), v_hoy, true, 100.00);
  SELECT modulos_efectivos(v_tenant) INTO v_m;
  IF NOT (v_m->'permitidos'->>'tienda')::boolean THEN RAISE EXCEPTION '2: con complemento debe estar permitido'; END IF;
  IF (v_m->'efectivos'->>'tienda')::boolean THEN RAISE EXCEPTION '2: con el interruptor apagado no debe ser efectivo'; END IF;

  -- 3) Con las dos capas: efectivo. Y las directivas de la caja lo llevan.
  UPDATE configuracion_tenant SET modulo_tienda_activo = true WHERE tenant_id = v_tenant;
  SELECT modulos_efectivos(v_tenant) INTO v_m;
  IF NOT (v_m->'efectivos'->>'tienda')::boolean THEN RAISE EXCEPTION '3: con complemento e interruptor debe ser efectivo'; END IF;
  IF NOT (resolver_directivas(v_tenant) -> 'modulos' ->> 'tienda')::boolean THEN
    RAISE EXCEPTION '3: las directivas del latido no llevan el módulo tienda';
  END IF;

  -- 4) La redefinición no perdió a nadie.
  IF NOT (v_m->'permitidos' ?& ARRAY['kds', 'recetas', 'reservaciones', 'promociones', 'cfdi', 'delivery_apps', 'lealtad', 'tienda']) THEN
    RAISE EXCEPTION '4: modulos_efectivos perdió algún módulo: %', v_m->'permitidos';
  END IF;

  -- 5) Los planes: Esencial no la incluye; Negocio y Cadena sí.
  IF (SELECT (features_incluidos->>'tienda_incluida')::boolean FROM planes WHERE codigo = 'ESENCIAL') THEN
    RAISE EXCEPTION '5: Esencial no debe incluir la tienda';
  END IF;
  IF NOT (SELECT bool_and((features_incluidos->>'tienda_incluida')::boolean) FROM planes WHERE codigo IN ('NEGOCIO', 'CADENA')) THEN
    RAISE EXCEPTION '5: Negocio y Cadena deben incluir la tienda';
  END IF;

  -- 6) El cambio de plan NO la concede todavía, aunque el plan ya lleve la bandera: esta función
  --    corre en cada alta de negocio y cada cambio de plan, y detrás de la tienda aún no hay nada.
  DELETE FROM tenant_addons WHERE tenant_id = v_tenant AND addon_id = (SELECT id FROM addons WHERE codigo = 'TIENDA');
  SELECT id INTO v_negocio FROM planes WHERE codigo = 'NEGOCIO';
  v_r := _sincronizar_addons_del_plan(v_tenant, v_negocio, true);
  IF (v_r->'concedidos') ? 'TIENDA' THEN RAISE EXCEPTION '6: subir a Negocio concedió la tienda antes de la entrega 7: %', v_r; END IF;
  IF EXISTS (SELECT 1 FROM tenant_addons ta JOIN addons a ON a.id = ta.addon_id
              WHERE ta.tenant_id = v_tenant AND a.codigo = 'TIENDA') THEN
    RAISE EXCEPTION '6: subir a Negocio dejó una fila del complemento TIENDA';
  END IF;

  -- 7) El complemento nace inactivo: el panel de VIM no debe ofrecerlo hasta la entrega 7.
  IF (SELECT activo FROM addons WHERE codigo = 'TIENDA') THEN RAISE EXCEPTION '7: el complemento TIENDA no debe nacer activo'; END IF;

  RAISE NOTICE 'smoke_tienda_modulo OK';
END $$;
ROLLBACK;
