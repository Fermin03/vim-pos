-- Smoke de la 0141: precio de promoción, prueba con fecha de fin, cambio de plan que ajusta lo que
-- el plan incluye, y datos de pago para el dueño.
-- Fechas fijas donde se puede; donde la regla usa "hoy" se calcula en hora de México, nunca con
-- CURRENT_DATE (el servidor es UTC y se pondría rojo seis horas al día).
BEGIN;

DO $$
DECLARE
  v_hoy      date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_owner    uuid := gen_random_uuid();
  v_cajero   uuid := gen_random_uuid();
  v_tenant   uuid;
  v_esencial uuid;
  v_negocio  uuid;
  v_cadena   uuid;
  v_cfdi     uuid;
  v_deliv    uuid;
  v_susc     uuid;
  r          jsonb;
  v_n        int;
  v_txt      text;
  v_s        suscripciones%ROWTYPE;
BEGIN
  SELECT id INTO v_esencial FROM planes WHERE codigo = 'ESENCIAL';
  SELECT id INTO v_negocio  FROM planes WHERE codigo = 'NEGOCIO';
  SELECT id INTO v_cadena   FROM planes WHERE codigo = 'CADENA';
  SELECT id INTO v_cfdi  FROM addons WHERE codigo = 'CFDI';
  SELECT id INTO v_deliv FROM addons WHERE codigo = 'DELIVERY';
  IF v_esencial IS NULL OR v_negocio IS NULL OR v_cadena IS NULL OR v_cfdi IS NULL OR v_deliv IS NULL THEN
    RAISE EXCEPTION 'faltan planes (0086) o add-ons (0081/0113) en el catálogo';
  END IF;

  -- ── 1) Regla del precio vigente ──────────────────────────────────────────
  IF precio_vigente_suscripcion(699, 499, '2027-03-31', '2027-03-31') <> 499 THEN RAISE EXCEPTION 'el último día de la promoción debe valer la promoción'; END IF;
  IF precio_vigente_suscripcion(699, 499, '2027-03-31', '2027-04-01') <> 699 THEN RAISE EXCEPTION 'al día siguiente debe volver a la lista'; END IF;
  IF precio_vigente_suscripcion(699, NULL, NULL, '2027-01-01') <> 699 THEN RAISE EXCEPTION 'sin promoción manda la lista'; END IF;
  IF precio_vigente_suscripcion(699, 499, v_hoy) <> 499 THEN RAISE EXCEPTION 'sin fecha usa hoy en México (hasta hoy = promoción)'; END IF;
  IF precio_vigente_suscripcion(699, 499, v_hoy - 1) <> 699 THEN RAISE EXCEPTION 'sin fecha usa hoy en México (hasta ayer = lista)'; END IF;

  -- ── 2) Alta: prueba de 30 días y add-ons que incluye el plan ─────────────
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (v_owner, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'owner-' || substr(v_owner::text, 1, 8) || '@smoke.dev', crypt('smokepass', gen_salt('bf')),
          now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
  v_tenant := crear_tenant_con_owner(v_owner, 'smoke-cobro-' || substr(v_owner::text, 1, 8), 'Tortas Smoke', 'Dueño Smoke',
                                     '4770000000', 'QUICK_SERVICE'::vertical_tipo, 'ESENCIAL', 'TRIAL'::tenant_estado, 'smoke 0141');
  IF (SELECT prueba_hasta FROM tenants WHERE id = v_tenant) IS DISTINCT FROM v_hoy + 30 THEN
    RAISE EXCEPTION 'la prueba debía terminar en 30 días (hora de México), quedó %', (SELECT prueba_hasta FROM tenants WHERE id = v_tenant);
  END IF;
  IF EXISTS (SELECT 1 FROM tenant_addons WHERE tenant_id = v_tenant AND activo) THEN
    RAISE EXCEPTION 'Esencial no incluye add-ons y el alta le dio alguno';
  END IF;

  -- ── 3) Activar con promoción: validaciones y alta buena ─────────────────
  BEGIN
    PERFORM activar_suscripcion(v_tenant, 699, 'MENSUAL', '2026-10-01', '2026-11-01', 499, NULL, NULL);
    RAISE EXCEPTION 'aceptó una promoción sin fecha de fin';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'PROMOCION_INCOMPLETA' THEN RAISE; END IF; END;
  BEGIN
    PERFORM activar_suscripcion(v_tenant, 699, 'MENSUAL', '2026-10-01', '2026-11-01', 799, '2027-03-31', 'Cara');
    RAISE EXCEPTION 'aceptó una promoción más cara que la lista';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'PROMOCION_PRECIO_INVALIDO' THEN RAISE; END IF; END;
  BEGIN
    PERFORM activar_suscripcion(v_tenant, 699, 'MENSUAL', '2026-10-01', '2026-11-01', 499, '2026-10-01', NULL);
    RAISE EXCEPTION 'aceptó una promoción que termina el día que empieza';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'PROMOCION_FECHA_INVALIDA' THEN RAISE; END IF; END;
  IF EXISTS (SELECT 1 FROM suscripciones WHERE tenant_id = v_tenant) THEN RAISE EXCEPTION 'un rechazo dejó una suscripción escrita'; END IF;

  r := activar_suscripcion(v_tenant, 699, 'MENSUAL', '2026-10-01', '2026-11-01', 499, '2027-03-31', 'Piloto 5 negocios');
  v_susc := (r->>'suscripcion_id')::uuid;
  SELECT * INTO v_s FROM suscripciones WHERE id = v_susc;
  IF v_s.precio_mensual_mxn <> 699 OR v_s.precio_promocional_mxn <> 499 OR v_s.promocion_hasta <> '2027-03-31' OR v_s.promocion_nombre <> 'Piloto 5 negocios' THEN
    RAISE EXCEPTION 'la suscripción no guardó lista + promoción: %', row_to_json(v_s);
  END IF;
  IF (SELECT estado::text FROM tenants WHERE id = v_tenant) <> 'ACTIVO' THEN RAISE EXCEPTION 'activar no pasó el tenant a ACTIVO'; END IF;
  -- Sin promoción sigue funcionando con cinco argumentos (los nuevos tienen DEFAULT).
  PERFORM activar_suscripcion(v_tenant, 699, 'MENSUAL', '2026-10-01', '2026-11-01');
  -- …y vuelve a quedar la de promoción para lo que sigue.
  r := activar_suscripcion(v_tenant, 699, 'MENSUAL', '2026-10-01', '2026-11-01', 499, '2027-03-31', 'Piloto 5 negocios');
  v_susc := (r->>'suscripcion_id')::uuid;

  -- ── 4) Subir de plan: folios, add-ons a $0 incluidos, precio, promoción fuera ──
  -- El cliente pagaba delivery aparte desde antes: al subir, esa fila se cierra y entra una a $0.
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn, notas)
  VALUES (v_tenant, v_deliv, v_hoy - 10, true, 100, 'contratado aparte');
  r := cambiar_plan_tenant(v_tenant, v_negocio, NULL);
  IF (SELECT plan_actual_id FROM tenants WHERE id = v_tenant) <> v_negocio THEN RAISE EXCEPTION 'no cambió el plan'; END IF;
  IF (SELECT folios_base_mensuales FROM tenant_folios_saldo WHERE tenant_id = v_tenant) <> (SELECT timbres_cfdi_mensuales FROM planes WHERE id = v_negocio) THEN
    RAISE EXCEPTION 'los folios del mes no siguieron al plan: %', r;
  END IF;
  SELECT count(*) INTO v_n FROM tenant_addons WHERE tenant_id = v_tenant AND activo AND incluido_en_plan AND precio_mensual_mxn = 0 AND addon_id IN (v_cfdi, v_deliv);
  IF v_n <> 2 THEN RAISE EXCEPTION 'al subir a Negocio debían quedar CFDI y DELIVERY incluidos a $0, hay %: %', v_n, r; END IF;
  IF EXISTS (SELECT 1 FROM tenant_addons WHERE tenant_id = v_tenant AND addon_id = v_deliv AND activo AND precio_mensual_mxn > 0) THEN
    RAISE EXCEPTION 'le siguió cobrando delivery aparte con el plan que lo incluye';
  END IF;
  IF NOT tenant_addon_activo(v_tenant, 'CFDI') THEN RAISE EXCEPTION 'con Negocio debe poder facturar'; END IF;
  SELECT * INTO v_s FROM suscripciones WHERE id = v_susc;
  IF v_s.plan_id <> v_negocio OR v_s.precio_mensual_mxn <> 999 OR v_s.precio_promocional_mxn IS NOT NULL OR v_s.promocion_hasta IS NOT NULL THEN
    RAISE EXCEPTION 'la suscripción debía pasar a Negocio a $999 sin promoción: %', row_to_json(v_s);
  END IF;
  IF v_s.notas NOT LIKE '%Cambio de plan%' THEN RAISE EXCEPTION 'el cambio no quedó anotado en la suscripción'; END IF;
  IF (SELECT count(*) FROM suscripciones WHERE tenant_id = v_tenant AND estado = 'ACTIVA') <> 1 THEN RAISE EXCEPTION 'se abrió otra suscripción'; END IF;

  BEGIN
    PERFORM cambiar_plan_tenant(v_tenant, v_negocio, NULL);
    RAISE EXCEPTION 'dejó cambiar al mismo plan';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'MISMO_PLAN' THEN RAISE; END IF; END;
  BEGIN
    PERFORM cambiar_plan_tenant(v_tenant, v_cadena, -5);
    RAISE EXCEPTION 'aceptó un precio negativo';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'PRECIO_INVALIDO' THEN RAISE; END IF; END;

  -- ── 5) Bajar el MISMO día: se retiran solo los incluidos; lo pagado aparte se queda ──
  -- Un add-on regalado por cortesía (no incluido_en_plan) no se toca al bajar.
  r := cambiar_plan_tenant(v_tenant, v_esencial, 499);
  IF tenant_addon_activo(v_tenant, 'CFDI') OR tenant_addon_activo(v_tenant, 'DELIVERY') THEN
    RAISE EXCEPTION 'al bajar a Esencial debían retirarse los add-ons que daba el plan: %', r;
  END IF;
  IF (SELECT precio_mensual_mxn FROM suscripciones WHERE id = v_susc) <> 499 THEN RAISE EXCEPTION 'p_precio explícito no se respetó'; END IF;
  IF (SELECT folios_base_mensuales FROM tenant_folios_saldo WHERE tenant_id = v_tenant) <> (SELECT timbres_cfdi_mensuales FROM planes WHERE id = v_esencial) THEN
    RAISE EXCEPTION 'los folios no bajaron con el plan';
  END IF;

  -- ── 6) Volver a subir el MISMO día: addon_unico_activo no revienta ───────
  r := cambiar_plan_tenant(v_tenant, v_cadena, NULL);
  IF NOT tenant_addon_activo(v_tenant, 'CFDI') OR NOT tenant_addon_activo(v_tenant, 'DELIVERY') THEN
    RAISE EXCEPTION 'al volver a subir el mismo día no quedaron los add-ons: %', r;
  END IF;
  IF (SELECT count(*) FROM tenant_addons WHERE tenant_id = v_tenant AND addon_id = v_cfdi AND fecha_inicio = v_hoy) <> 1 THEN
    RAISE EXCEPTION 'debía reusar la fila de hoy del CFDI, no insertar otra';
  END IF;

  -- Cortesía: fuera del plan, se conserva al bajar.
  UPDATE tenant_addons SET incluido_en_plan = false, notas = 'cortesía' WHERE tenant_id = v_tenant AND addon_id = v_deliv AND activo;
  PERFORM cambiar_plan_tenant(v_tenant, v_esencial, NULL);
  IF NOT tenant_addon_activo(v_tenant, 'DELIVERY') THEN RAISE EXCEPTION 'al bajar se llevó un add-on de cortesía'; END IF;
  IF tenant_addon_activo(v_tenant, 'CFDI') THEN RAISE EXCEPTION 'el CFDI incluido debía retirarse'; END IF;

  -- ── 7) CLABE y datos de pago ─────────────────────────────────────────────
  IF NOT clabe_valida('002010077777777771') OR NOT clabe_valida('032180000118359719') THEN RAISE EXCEPTION 'rechazó CLABEs válidas'; END IF;
  IF clabe_valida('012180001234567897') OR clabe_valida('00201007777777777') OR clabe_valida('00201007777777777a') THEN
    RAISE EXCEPTION 'aceptó una CLABE inválida';
  END IF;
  BEGIN
    INSERT INTO plataforma_datos_pago (banco, clabe) VALUES ('Banco X', '012180001234567897');
    RAISE EXCEPTION 'la tabla aceptó una CLABE con dígito de control malo';
  EXCEPTION WHEN check_violation THEN NULL; END;
  INSERT INTO plataforma_datos_pago (banco, titular, clabe, whatsapp, correo, instrucciones)
  VALUES ('Banco Smoke', 'VIM Marketing', '002010077777777771', '524770000000', 'cobro@smoke.dev', 'Pon tu nombre comercial en el concepto.')
  ON CONFLICT (id) DO UPDATE SET banco = EXCLUDED.banco, titular = EXCLUDED.titular, clabe = EXCLUDED.clabe,
    whatsapp = EXCLUDED.whatsapp, correo = EXCLUDED.correo, instrucciones = EXCLUDED.instrucciones;

  -- El dueño la lee por la RPC, con su JWT.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated', 'tenant_id', v_tenant)::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT clabe INTO v_txt FROM datos_pago_plataforma();
  PERFORM set_config('role', 'postgres', true);
  IF v_txt IS DISTINCT FROM '002010077777777771' THEN RAISE EXCEPTION 'el dueño no leyó los datos de pago por la RPC (salió %)', v_txt; END IF;

  -- Un cajero del mismo negocio, no.
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (v_cajero, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'cajero-' || substr(v_cajero::text, 1, 8) || '@smoke.dev', crypt('smokepass', gen_salt('bf')),
          now(), now(), now(), '{}'::jsonb, '{}'::jsonb);
  INSERT INTO usuarios_perfil (id, nombre, estado) VALUES (v_cajero, 'Cajero Smoke', 'ACTIVO') ON CONFLICT (id) DO NOTHING;
  INSERT INTO usuarios_acceso (usuario_id, tenant_id, sucursal_id, rol_id)
  SELECT v_cajero, v_tenant, NULL, id FROM roles WHERE codigo = 'CAJERO' AND es_sistema LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cajero, 'role', 'authenticated', 'tenant_id', v_tenant)::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO v_n FROM datos_pago_plataforma();
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', '', true);
  IF v_n <> 0 THEN RAISE EXCEPTION 'un cajero leyó los datos de pago'; END IF;

  -- ── 8) Privilegios: nada de esto se escribe ni se llama desde el navegador ─
  IF has_function_privilege('authenticated', 'cambiar_plan_tenant(uuid, uuid, numeric)', 'EXECUTE')
     OR has_function_privilege('anon', 'cambiar_plan_tenant(uuid, uuid, numeric)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated/anon pueden cambiar planes';
  END IF;
  IF has_function_privilege('authenticated', '_sincronizar_addons_del_plan(uuid, uuid, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated puede sincronizar add-ons';
  END IF;
  IF has_function_privilege('authenticated', 'activar_suscripcion(uuid, numeric, text, date, date, numeric, date, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated puede activar cobros';
  END IF;
  IF to_regprocedure('activar_suscripcion(uuid, numeric, text, date, date)') IS NOT NULL THEN
    RAISE EXCEPTION 'quedó viva la firma vieja de activar_suscripcion (llamadas ambiguas)';
  END IF;
  IF has_function_privilege('anon', 'datos_pago_plataforma()', 'EXECUTE') THEN RAISE EXCEPTION 'anon puede leer los datos de pago'; END IF;
  IF has_table_privilege('authenticated', 'plataforma_datos_pago', 'SELECT')
     OR has_table_privilege('authenticated', 'plataforma_datos_pago', 'UPDATE')
     OR has_table_privilege('anon', 'plataforma_datos_pago', 'SELECT') THEN
    RAISE EXCEPTION 'la tabla de datos de pago es accesible desde el navegador';
  END IF;
  IF has_column_privilege('authenticated', 'tenants', 'prueba_hasta', 'UPDATE') THEN
    RAISE EXCEPTION 'el dueño puede moverse la fecha de fin de la prueba';
  END IF;

  RAISE NOTICE 'smoke_cobro_plan OK';
END $$;

ROLLBACK;
