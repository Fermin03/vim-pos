-- Smoke lealtad · admin (0159). El add-on está activo en el catálogo; el cambio de plan concede y
-- retira la lealtad (y al retirarla apaga el interruptor del dueño); las vistas que usa el admin
-- traen sus columnas nuevas y las cifras del resumen cuadran. Hace ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_negocio uuid; v_esencial uuid; v_r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);

  -- §2 · el catálogo y el cambio de plan
  IF NOT (SELECT activo FROM addons WHERE codigo = 'LEALTAD') THEN
    RAISE EXCEPTION 'el add-on LEALTAD sigue inactivo en el catálogo';
  END IF;
  SELECT id INTO v_negocio  FROM planes WHERE codigo = 'NEGOCIO';
  SELECT id INTO v_esencial FROM planes WHERE codigo = 'ESENCIAL';
  -- Se parte de un negocio sin la lealtad concedida.
  UPDATE tenant_addons ta SET activo = false, fecha_fin = (now() AT TIME ZONE 'America/Mexico_City')::date
    FROM addons a WHERE a.id = ta.addon_id AND a.codigo = 'LEALTAD' AND ta.tenant_id = v_tenant AND ta.activo;

  v_r := _sincronizar_addons_del_plan(v_tenant, v_negocio, true);
  IF NOT (v_r->'concedidos') ? 'LEALTAD' THEN RAISE EXCEPTION 'subir a Negocio no concedió la lealtad: %', v_r; END IF;
  IF NOT tenant_addon_activo(v_tenant, 'LEALTAD') THEN RAISE EXCEPTION 'la lealtad no quedó concedida'; END IF;
  IF NOT (SELECT bool_and(ta.precio_mensual_mxn = 0 AND ta.incluido_en_plan) FROM tenant_addons ta JOIN addons a ON a.id = ta.addon_id
           WHERE ta.tenant_id = v_tenant AND a.codigo = 'LEALTAD' AND ta.activo) THEN
    RAISE EXCEPTION 'la lealtad incluida en el plan debe quedar a $0 y marcada como incluida';
  END IF;
  -- Repetir no la duplica ni la vuelve a contar.
  v_r := _sincronizar_addons_del_plan(v_tenant, v_negocio, true);
  IF (v_r->'concedidos') ? 'LEALTAD' THEN RAISE EXCEPTION 'conceder dos veces no es inocuo: %', v_r; END IF;

  -- El dueño la enciende (necesita programa) y al bajar a Esencial se retira y se apaga sola.
  INSERT INTO lealtad_programa (tenant_id, mecanica, porcentaje) VALUES (v_tenant, 'PUNTOS_DINERO', 5)
    ON CONFLICT (tenant_id) DO NOTHING;
  INSERT INTO configuracion_tenant (tenant_id, modulo_lealtad_activo) VALUES (v_tenant, true)
    ON CONFLICT (tenant_id) DO UPDATE SET modulo_lealtad_activo = true;
  IF NOT (modulos_efectivos(v_tenant)->'efectivos'->>'lealtad')::boolean THEN RAISE EXCEPTION 'la lealtad no quedó efectiva'; END IF;

  v_r := _sincronizar_addons_del_plan(v_tenant, v_esencial, true);
  IF NOT (v_r->'retirados') ? 'LEALTAD' THEN RAISE EXCEPTION 'bajar a Esencial no retiró la lealtad: %', v_r; END IF;
  IF (modulos_efectivos(v_tenant)->'permitidos'->>'lealtad')::boolean THEN RAISE EXCEPTION 'la lealtad sigue permitida tras bajar de plan'; END IF;
  IF (SELECT modulo_lealtad_activo FROM configuracion_tenant WHERE tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'al retirar la lealtad el interruptor del dueño debió apagarse';
  END IF;

  RAISE NOTICE 'SMOKE LEALTAD ADMIN §2 OK';
END $$;
ROLLBACK;
