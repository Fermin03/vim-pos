-- Smoke tienda en línea (mig. 0163): lo que el apartado del admin necesita de la base. Direcciones
-- reservadas ampliadas, el logo propio de la tienda (solo dentro de la carpeta del negocio), las
-- guardas del interruptor (complemento vigente y tienda configurada para encender; apagar siempre),
-- la baja del complemento que apaga la tienda, y tienda_negocio con la ruta del logo.
-- Fechas SIEMPRE en hora de México, nunca CURRENT_DATE (en el CI es UTC).
-- Uso: cd desktop && npm run smokes -- smoke_tienda_admin.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_cajero uuid := '99999999-0000-0000-0000-000000000001';
  v_dueno  uuid := '99999999-0000-0000-0000-0000000000e1';
  v_otro   uuid := '63636363-0000-0000-0000-0000000000aa';
  v_hoy    date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_tienda uuid;
  v_ruta   text;
  v_slug   text;
  v_err    text;
  v_con    text;
  v_n      integer;
  v_p      jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- Fixture, como postgres.
  SELECT id INTO v_tienda FROM addons WHERE codigo = 'TIENDA';
  v_ruta := v_t || '/0a1b2c3d-0000-4000-8000-00000000abcd.webp';
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_otro, 'tenant-0163', 'Otro negocio', 'INTERNO', 'QUICK_SERVICE');
  INSERT INTO configuracion_tenant (tenant_id) VALUES (v_t) ON CONFLICT (tenant_id) DO NOTHING;

  -- 1) Las direcciones reservadas nuevas no entran (ni las de siempre); una normal, sí. El nombre
  --    de la restricción es parte del contrato: el admin traduce el error por ese nombre.
  FOREACH v_slug IN ARRAY ARRAY['vim', 'vimpos', 'soporte', 'login', 'pago', 'ayuda', 'www', 'tienda', 'api', 'assets'] LOOP
    v_con := NULL;
    BEGIN
      INSERT INTO tienda_config (tenant_id, slug) VALUES (v_t, v_slug);
    EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    END;
    IF v_con IS DISTINCT FROM 'tienda_config_slug_check' THEN
      RAISE EXCEPTION '1: la dirección reservada «%» debía chocar con tienda_config_slug_check, dio %', v_slug, COALESCE(v_con, 'ningún error');
    END IF;
  END LOOP;
  INSERT INTO tienda_config (tenant_id, slug) VALUES (v_t, 'knockout-smoke');
  -- El formato no cambió: una dirección que solo CONTIENE una reservada sigue entrando.
  UPDATE tienda_config SET slug = 'la-tienda-de-ana' WHERE tenant_id = v_t;
  UPDATE tienda_config SET slug = 'knockout-smoke' WHERE tenant_id = v_t;

  -- 2) El logo: la forma correcta dentro de la carpeta propia entra; lo demás, no.
  UPDATE tienda_config SET logo_ruta = v_ruta WHERE tenant_id = v_t;
  UPDATE tienda_config SET logo_ruta = v_t || '/0a1b2c3d-0000-4000-8000-00000000abcd.jpg' WHERE tenant_id = v_t;
  UPDATE tienda_config SET logo_ruta = v_t || '/0a1b2c3d-0000-4000-8000-00000000abcd.png' WHERE tenant_id = v_t;
  FOREACH v_slug IN ARRAY ARRAY[
    v_otro || '/0a1b2c3d-0000-4000-8000-00000000abcd.webp',                       -- la carpeta de otro negocio
    v_t || '/0a1b2c3d-0000-4000-8000-00000000abcd.gif',                           -- extensión que el almacén no admite
    v_t || '/../' || v_otro || '/0a1b2c3d-0000-4000-8000-00000000abcd.webp',      -- salirse de la carpeta
    v_t || '/..',
    v_t || '/logo.webp',                                                          -- nombre que no es un uuid
    v_t || '/0a1b2c3d-0000-4000-8000-00000000abcd.webp?x=1',
    'https://example.com/' || v_t || '/0a1b2c3d-0000-4000-8000-00000000abcd.webp',
    ''] LOOP
    v_con := NULL;
    BEGIN
      UPDATE tienda_config SET logo_ruta = v_slug WHERE tenant_id = v_t;
    EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    END;
    IF v_con IS DISTINCT FROM 'tienda_config_logo_ruta_check' THEN
      RAISE EXCEPTION '2: la ruta «%» debía chocar con tienda_config_logo_ruta_check, dio %', v_slug, COALESCE(v_con, 'ningún error');
    END IF;
  END LOOP;
  UPDATE tienda_config SET logo_ruta = NULL WHERE tenant_id = v_t;   -- quitar el logo se puede

  -- 3) Encender. Sin complemento: SIN_ADDON_TIENDA (aunque la tienda ya esté configurada).
  v_err := NULL;
  BEGIN
    UPDATE configuracion_tenant SET modulo_tienda_activo = true WHERE tenant_id = v_t;
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  IF v_err IS DISTINCT FROM 'SIN_ADDON_TIENDA' THEN RAISE EXCEPTION '3: sin complemento esperaba SIN_ADDON_TIENDA, dio %', COALESCE(v_err, 'ningún error'); END IF;

  --    Con complemento pero sin fila en tienda_config: SIN_TIENDA_CONFIGURADA.
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
  VALUES (v_t, v_tienda, v_hoy - 10, true, 100.00);
  DELETE FROM tienda_config WHERE tenant_id = v_t;
  v_err := NULL;
  BEGIN
    UPDATE configuracion_tenant SET modulo_tienda_activo = true WHERE tenant_id = v_t;
  EXCEPTION WHEN SQLSTATE '22023' THEN v_err := SQLERRM;
  END;
  IF v_err IS DISTINCT FROM 'SIN_TIENDA_CONFIGURADA' THEN RAISE EXCEPTION '3: sin configurar esperaba SIN_TIENDA_CONFIGURADA, dio %', COALESCE(v_err, 'ningún error'); END IF;
  --    Lo mismo al NACER la fila encendida (el disparador también mira el INSERT).
  v_err := NULL;
  BEGIN
    INSERT INTO configuracion_tenant (tenant_id, modulo_tienda_activo) VALUES (v_otro, true);
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  IF v_err IS DISTINCT FROM 'SIN_ADDON_TIENDA' THEN RAISE EXCEPTION '3: nacer encendida sin complemento esperaba SIN_ADDON_TIENDA, dio %', COALESCE(v_err, 'ningún error'); END IF;

  --    Con las dos cosas: enciende.
  INSERT INTO tienda_config (tenant_id, slug) VALUES (v_t, 'knockout-smoke');
  UPDATE configuracion_tenant SET modulo_tienda_activo = true WHERE tenant_id = v_t;
  IF (SELECT modulo_tienda_activo FROM configuracion_tenant WHERE tenant_id = v_t) IS NOT TRUE THEN RAISE EXCEPTION '3: con complemento y tienda configurada debía encender'; END IF;

  -- 4) Apagar sin complemento se puede. El complemento VENCE por fecha (no pasa por `activo`, así
  --    que nada apaga el interruptor) y el dueño apaga después.
  UPDATE tenant_addons SET fecha_fin = v_hoy - 1 WHERE tenant_id = v_t AND addon_id = v_tienda;
  IF (SELECT modulo_tienda_activo FROM configuracion_tenant WHERE tenant_id = v_t) IS NOT TRUE THEN RAISE EXCEPTION '4: el fixture debía seguir encendido tras vencer el complemento'; END IF;
  -- Otro cambio de la misma fila con el interruptor ya encendido no se frena por faltar el complemento.
  UPDATE configuracion_tenant SET updated_at = now() WHERE tenant_id = v_t;
  UPDATE configuracion_tenant SET modulo_tienda_activo = false WHERE tenant_id = v_t;
  IF (SELECT modulo_tienda_activo FROM configuracion_tenant WHERE tenant_id = v_t) IS NOT FALSE THEN RAISE EXCEPTION '4: no se pudo apagar sin complemento'; END IF;

  -- 5) Con la tienda encendida, dar de baja el complemento la apaga. La baja de OTRO complemento, no.
  UPDATE tenant_addons SET fecha_fin = NULL WHERE tenant_id = v_t AND addon_id = v_tienda;
  UPDATE configuracion_tenant SET modulo_tienda_activo = true WHERE tenant_id = v_t;
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
  SELECT v_t, id, v_hoy, true, 100.00 FROM addons WHERE codigo = 'LEALTAD';
  UPDATE tenant_addons SET activo = false WHERE tenant_id = v_t AND addon_id = (SELECT id FROM addons WHERE codigo = 'LEALTAD');
  IF (SELECT modulo_tienda_activo FROM configuracion_tenant WHERE tenant_id = v_t) IS NOT TRUE THEN RAISE EXCEPTION '5: la baja del complemento de lealtad apagó la tienda'; END IF;
  UPDATE tenant_addons SET activo = false WHERE tenant_id = v_t AND addon_id = v_tienda;
  IF (SELECT modulo_tienda_activo FROM configuracion_tenant WHERE tenant_id = v_t) IS NOT FALSE THEN RAISE EXCEPTION '5: la baja del complemento no apagó la tienda'; END IF;

  -- 6) El disparador de Lealtad sigue igual: encenderla sin complemento da SU error.
  v_err := NULL;
  BEGIN
    UPDATE configuracion_tenant SET modulo_lealtad_activo = true WHERE tenant_id = v_t;
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  IF v_err IS DISTINCT FROM 'SIN_ADDON_LEALTAD' THEN RAISE EXCEPTION '6: lealtad sin complemento esperaba SIN_ADDON_LEALTAD, dio %', COALESCE(v_err, 'ningún error'); END IF;

  -- 7) tienda_negocio lleva la RUTA del logo (clave logo_ruta; la dirección pública la arma quien
  --    la consume) y ya no la clave logo_url: null sin logo, la ruta guardada con uno.
  UPDATE tenant_addons SET activo = true WHERE tenant_id = v_t AND addon_id = v_tienda;
  UPDATE configuracion_tenant SET modulo_tienda_activo = true WHERE tenant_id = v_t;
  UPDATE tenants SET logo_png_url = 'data:image/png;base64,AAAA' WHERE id = v_t;   -- el logo fiscal no cuenta
  v_p := tienda_negocio('knockout-smoke') -> 'publico';
  IF v_p IS NULL THEN RAISE EXCEPTION '7: tienda_negocio no devolvió la tienda'; END IF;
  IF v_p ? 'logo_url' THEN RAISE EXCEPTION '7: sigue saliendo la clave logo_url: %', v_p; END IF;
  IF NOT (v_p ? 'logo_ruta') OR jsonb_typeof(v_p -> 'logo_ruta') <> 'null' THEN RAISE EXCEPTION '7: sin logo, logo_ruta debía ser null: %', v_p; END IF;
  IF NOT (v_p ?& ARRAY['slug', 'nombre', 'color', 'descripcion', 'pago_efectivo', 'pago_tarjeta', 'sucursales']) THEN
    RAISE EXCEPTION '7: la redefinición perdió alguna clave: %', v_p;
  END IF;
  UPDATE tienda_config SET logo_ruta = v_ruta WHERE tenant_id = v_t;
  v_p := tienda_negocio('knockout-smoke') -> 'publico';
  IF v_p ->> 'logo_ruta' IS DISTINCT FROM v_ruta THEN RAISE EXCEPTION '7: con logo esperaba %, dio %', v_ruta, v_p -> 'logo_ruta'; END IF;

  -- 8) Con sesión de verdad (authenticated, RLS). Se parte de apagado y con el complemento vencido.
  UPDATE configuracion_tenant SET modulo_tienda_activo = false WHERE tenant_id = v_t;
  UPDATE tenant_addons SET fecha_fin = v_hoy - 1 WHERE tenant_id = v_t AND addon_id = v_tienda;
  EXECUTE 'SET LOCAL ROLE authenticated';

  --    El dueño: las mismas guardas le responden a él (el disparador es definer; tenant_addon_activo
  --    es solo de service_role)…
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  v_err := NULL;
  BEGIN
    UPDATE configuracion_tenant SET modulo_tienda_activo = true WHERE tenant_id = v_t;
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  IF v_err IS DISTINCT FROM 'SIN_ADDON_TIENDA' THEN RAISE EXCEPTION '8: el dueño sin complemento esperaba SIN_ADDON_TIENDA, dio %', COALESCE(v_err, 'ningún error'); END IF;
  --    …y las restricciones de la dirección y del logo también, con su nombre.
  v_con := NULL;
  BEGIN
    UPDATE tienda_config SET slug = 'vimpos' WHERE tenant_id = v_t;
  EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
  END;
  IF v_con IS DISTINCT FROM 'tienda_config_slug_check' THEN RAISE EXCEPTION '8: el dueño guardó una dirección reservada (%)', COALESCE(v_con, 'ningún error'); END IF;
  v_con := NULL;
  BEGIN
    UPDATE tienda_config SET logo_ruta = v_otro || '/0a1b2c3d-0000-4000-8000-00000000abcd.webp' WHERE tenant_id = v_t;
  EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
  END;
  IF v_con IS DISTINCT FROM 'tienda_config_logo_ruta_check' THEN RAISE EXCEPTION '8: el dueño apuntó su logo a la carpeta de otro negocio (%)', COALESCE(v_con, 'ningún error'); END IF;
  UPDATE tienda_config SET logo_ruta = v_t || '/0a1b2c3d-0000-4000-8000-00000000abcd.png' WHERE tenant_id = v_t;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION '8: el dueño no pudo guardar su logo (% filas)', v_n; END IF;

  --    El cajero no enciende, con el complemento ya vigente: error de permiso o 0 filas.
  EXECUTE 'RESET ROLE';
  UPDATE tenant_addons SET fecha_fin = NULL WHERE tenant_id = v_t AND addon_id = v_tienda;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cajero, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  BEGIN
    UPDATE configuracion_tenant SET modulo_tienda_activo = true WHERE tenant_id = v_t;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 0 THEN RAISE EXCEPTION '8: un cajero encendió la tienda' USING ERRCODE = 'P0001'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF (SELECT modulo_tienda_activo FROM configuracion_tenant WHERE tenant_id = v_t) IS NOT FALSE THEN RAISE EXCEPTION '8: la tienda quedó encendida tras el intento del cajero'; END IF;

  --    El dueño enciende, y apaga.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  UPDATE configuracion_tenant SET modulo_tienda_activo = true WHERE tenant_id = v_t;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION '8: el dueño no encendió la tienda (% filas)', v_n; END IF;
  IF (SELECT modulo_tienda_activo FROM configuracion_tenant WHERE tenant_id = v_t) IS NOT TRUE THEN RAISE EXCEPTION '8: la tienda no quedó encendida'; END IF;
  IF (modulos_efectivos(v_t) -> 'efectivos' ->> 'tienda')::boolean IS NOT TRUE THEN RAISE EXCEPTION '8: la tienda debía quedar efectiva'; END IF;
  UPDATE configuracion_tenant SET modulo_tienda_activo = false WHERE tenant_id = v_t;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION '8: el dueño no apagó la tienda (% filas)', v_n; END IF;
  EXECUTE 'RESET ROLE';

  -- 9) Las funciones de los disparadores no las ejecuta ningún rol de la API.
  SELECT string_agg(format('%s en %s', r, f), ', ') INTO v_err
    FROM unnest(ARRAY['configuracion_tenant_tienda_guardia()', 'tenant_addons_apaga_tienda()', 'tienda_negocio(text, timestamptz)']) f,
         unnest(ARRAY['anon', 'authenticated']) r
   WHERE has_function_privilege(r, f, 'EXECUTE');
  IF v_err IS NOT NULL THEN RAISE EXCEPTION '9: funciones con privilegios de más: %', v_err; END IF;
  IF NOT has_function_privilege('service_role', 'tienda_negocio(text, timestamptz)', 'EXECUTE') THEN RAISE EXCEPTION '9: service_role perdió tienda_negocio'; END IF;

  RAISE NOTICE 'smoke_tienda_admin OK';
END $$;
ROLLBACK;
