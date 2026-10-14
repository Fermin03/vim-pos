-- Smoke giros y módulos de operación (spec 2026-10-14-giros-y-modulos-de-operacion-design.md,
-- migraciones 0179 y 0180). Sobre la semilla de dev. ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;

-- 1) Los giros nuevos existen en el tipo.
DO $$
BEGIN
  IF NOT ('BAR' = ANY(enum_range(NULL::vertical_tipo)::text[])
      AND 'CAFETERIA' = ANY(enum_range(NULL::vertical_tipo)::text[])
      AND 'TAQUERIA' = ANY(enum_range(NULL::vertical_tipo)::text[])) THEN
    RAISE EXCEPTION '1: faltan giros en vertical_tipo: %', enum_range(NULL::vertical_tipo);
  END IF;
  RAISE NOTICE '1 giros nuevos OK';
END $$;

-- 2) Juego inicial por giro (tabla §5 del spec), cliente existente intacto, dependencias.
DO $$
DECLARE
  v_todo jsonb := '{"mostrador":true,"comedor":true,"meseros":true,"domicilio":true,"repartidores":true,"kds":true,"reservaciones":true,"marcas":true,"eventos":true,"cuentas_barra":true}';
  v_op   jsonb;
BEGIN
  IF juego_inicial_de_giro('QUICK_SERVICE') IS DISTINCT FROM
     '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":true,"repartidores":false,"kds":true,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false}'::jsonb
  THEN RAISE EXCEPTION '2a: QUICK_SERVICE: %', juego_inicial_de_giro('QUICK_SERVICE'); END IF;
  IF juego_inicial_de_giro('FULL_SERVICE') IS DISTINCT FROM
     '{"mostrador":true,"comedor":true,"meseros":true,"domicilio":false,"repartidores":false,"kds":true,"reservaciones":true,"marcas":false,"eventos":false,"cuentas_barra":false}'::jsonb
  THEN RAISE EXCEPTION '2a: FULL_SERVICE: %', juego_inicial_de_giro('FULL_SERVICE'); END IF;
  IF juego_inicial_de_giro('FOODTRUCK') IS DISTINCT FROM
     '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":true,"cuentas_barra":false}'::jsonb
  THEN RAISE EXCEPTION '2a: FOODTRUCK: %', juego_inicial_de_giro('FOODTRUCK'); END IF;
  IF juego_inicial_de_giro('DARK_KITCHEN') IS DISTINCT FROM
     '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":true,"repartidores":true,"kds":true,"reservaciones":false,"marcas":true,"eventos":false,"cuentas_barra":false}'::jsonb
  THEN RAISE EXCEPTION '2a: DARK_KITCHEN: %', juego_inicial_de_giro('DARK_KITCHEN'); END IF;
  IF juego_inicial_de_giro('BAR') IS DISTINCT FROM
     '{"mostrador":true,"comedor":true,"meseros":true,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":true}'::jsonb
  THEN RAISE EXCEPTION '2a: BAR: %', juego_inicial_de_giro('BAR'); END IF;
  IF juego_inicial_de_giro('CAFETERIA') IS DISTINCT FROM
     '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false}'::jsonb
  THEN RAISE EXCEPTION '2a: CAFETERIA: %', juego_inicial_de_giro('CAFETERIA'); END IF;
  IF juego_inicial_de_giro('TAQUERIA') IS DISTINCT FROM
     '{"mostrador":true,"comedor":true,"meseros":true,"domicilio":true,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false}'::jsonb
  THEN RAISE EXCEPTION '2a: TAQUERIA: %', juego_inicial_de_giro('TAQUERIA'); END IF;
  IF juego_inicial_de_giro('ENTERPRISE') IS DISTINCT FROM v_todo THEN RAISE EXCEPTION '2a: ENTERPRISE debía ser todo encendido'; END IF;
  IF juego_inicial_de_giro(NULL) IS DISTINCT FROM v_todo THEN RAISE EXCEPTION '2a: NULL debía ser todo encendido'; END IF;
  RAISE NOTICE '2a juego inicial de los 7 giros OK';

  IF cobro_inicial_de_giro('FULL_SERVICE') <> 'COCINA_PRIMERO' OR cobro_inicial_de_giro('TAQUERIA') <> 'COCINA_PRIMERO'
     OR cobro_inicial_de_giro('BAR') <> 'COCINA_PRIMERO' OR cobro_inicial_de_giro('QUICK_SERVICE') <> 'COBRO_PRIMERO'
     OR cobro_inicial_de_giro('CAFETERIA') <> 'COBRO_PRIMERO' OR cobro_inicial_de_giro(NULL) <> 'COBRO_PRIMERO' THEN
    RAISE EXCEPTION '2b: cobro inicial por giro mal';
  END IF;
  RAISE NOTICE '2b cobro inicial OK';

  -- Cliente existente (semilla): todo encendido sin que nadie lo toque.
  SELECT operacion INTO v_op FROM tenants WHERE id = '99999999-0000-0000-0000-0000000000aa';
  IF v_op IS DISTINCT FROM v_todo THEN RAISE EXCEPTION '2c: el cliente existente debía quedar todo encendido: %', v_op; END IF;
  RAISE NOTICE '2c cliente existente intacto OK';

  -- El disparador completa llaves y corrige dependencias; nunca rechaza un valor válido.
  UPDATE tenants SET operacion = '{"comedor":false,"domicilio":false}'
   WHERE id = '99999999-0000-0000-0000-0000000000aa' RETURNING operacion INTO v_op;
  IF (v_op->>'meseros')::boolean OR (v_op->>'repartidores')::boolean THEN
    RAISE EXCEPTION '2d: sin comedor/domicilio debían apagarse meseros/repartidores: %', v_op;
  END IF;
  IF NOT (v_op->>'kds')::boolean OR NOT (v_op ? 'cuentas_barra') THEN
    RAISE EXCEPTION '2d: las llaves que faltan debían completarse encendidas: %', v_op;
  END IF;
  BEGIN
    UPDATE tenants SET operacion = '{"inventado":true}' WHERE id = '99999999-0000-0000-0000-0000000000aa';
    RAISE EXCEPTION '2e: aceptó una llave desconocida';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    UPDATE tenants SET operacion = '{"comedor":"true"}' WHERE id = '99999999-0000-0000-0000-0000000000aa';
    RAISE EXCEPTION '2e: aceptó un texto como booleano';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  UPDATE tenants SET operacion = v_todo WHERE id = '99999999-0000-0000-0000-0000000000aa';
  RAISE NOTICE '2d-2e disparador OK';
END $$;

-- 3) operacion_cambiar y cambiar_giro: dependencias, entradas malas, cuentas abiertas, pull, giros
--    retirados y permisos.
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_hoy    date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_turno uuid; v_ticket uuid; v_mesa uuid; v_r jsonb; v_op jsonb;
BEGIN
  -- Sin JWT: es la sesión de servicio (como /platform). Las cuentas de mesa sí necesitan claims.
  PERFORM set_config('request.jwt.claims', '', true);

  -- 3a) Apagar comedor apaga meseros y lo reporta.
  v_r := operacion_cambiar(v_tenant, '{"comedor":false}');
  IF (v_r->'operacion'->>'meseros')::boolean THEN RAISE EXCEPTION '3a: meseros seguía encendido: %', v_r; END IF;
  IF NOT (v_r->'ajustes') ? 'meseros' THEN RAISE EXCEPTION '3a: debía reportar meseros en ajustes: %', v_r; END IF;

  -- 3b) Encender meseros sin comedor se rechaza y no cambia nada.
  BEGIN
    PERFORM operacion_cambiar(v_tenant, '{"meseros":true}');
    RAISE EXCEPTION '3b: encendió meseros sin comedor';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM NOT LIKE 'MESEROS_REQUIERE_COMEDOR%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM operacion_cambiar(v_tenant, '{"repartidores":true,"domicilio":false}');
    RAISE EXCEPTION '3b: encendió repartidores sin domicilio';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM NOT LIKE 'REPARTIDORES_REQUIERE_DOMICILIO%' THEN RAISE; END IF;
  END;
  -- Pedirlos juntos sí se puede.
  v_r := operacion_cambiar(v_tenant, '{"comedor":true,"meseros":true}');
  IF NOT (v_r->'operacion'->>'meseros')::boolean THEN RAISE EXCEPTION '3b: comedor+meseros juntos debía pasar'; END IF;
  RAISE NOTICE '3a-3b dependencias OK';

  -- 3c) Entradas malas: error claro, nada cambia.
  SELECT operacion INTO v_op FROM tenants WHERE id = v_tenant;
  BEGIN PERFORM operacion_cambiar(v_tenant, NULL); RAISE EXCEPTION '3c: aceptó NULL';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM operacion_cambiar(v_tenant, '[true]'); RAISE EXCEPTION '3c: aceptó un arreglo';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM operacion_cambiar(v_tenant, '{"domicilio":"si"}'); RAISE EXCEPTION '3c: aceptó texto';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM operacion_cambiar(v_tenant, '{"cocina":true}'); RAISE EXCEPTION '3c: aceptó llave desconocida';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM operacion_cambiar(gen_random_uuid(), '{"comedor":true}'); RAISE EXCEPTION '3c: aceptó un negocio que no existe';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  IF (SELECT operacion FROM tenants WHERE id = v_tenant) IS DISTINCT FROM v_op THEN
    RAISE EXCEPTION '3c: una entrada mala cambió la operación';
  END IF;
  RAISE NOTICE '3c entradas malas OK';

  -- 3d) Con una cuenta de mesa abierta no se apaga el comedor.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-GIROS', v_hoy, v_maria, 500, 'TOTAL') RETURNING id INTO v_turno;
  INSERT INTO mesas(tenant_id, sucursal_id, numero, nombre, capacidad, estado, forma)
  VALUES (v_tenant, v_suc, 97, 'Mesa 97', 4, 'LIBRE', 'CUADRADA') RETURNING id INTO v_mesa;
  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'MESA'::modo_servicio, NULL, NULL, 'giros-1', v_maria);
  PERFORM asignar_mesa_a_ticket(v_ticket, v_mesa, true, 'giros-asig');
  PERFORM set_config('request.jwt.claims', '', true);

  IF (operacion_cuentas_abiertas(v_tenant)->>'comedor')::int < 1 THEN
    RAISE EXCEPTION '3d: no contó la cuenta de mesa abierta: %', operacion_cuentas_abiertas(v_tenant);
  END IF;
  BEGIN
    PERFORM operacion_cambiar(v_tenant, '{"comedor":false}');
    RAISE EXCEPTION '3d: apagó el comedor con una cuenta abierta';
  EXCEPTION WHEN object_in_use THEN
    IF SQLERRM NOT LIKE 'CUENTAS_ABIERTAS_COMEDOR%' THEN RAISE; END IF;
  END;

  -- 3e) cambiar_giro con reaplicar respeta la cuenta abierta: comedor se queda y avisa.
  v_r := cambiar_giro(v_tenant, 'FOODTRUCK', true);
  IF NOT (v_r->'operacion'->>'comedor')::boolean THEN RAISE EXCEPTION '3e: apagó el comedor con cuenta abierta: %', v_r; END IF;
  IF jsonb_array_length(v_r->'avisos') < 1 THEN RAISE EXCEPTION '3e: debía avisar del comedor: %', v_r; END IF;
  IF NOT (v_r->'operacion'->>'eventos')::boolean OR (v_r->'operacion'->>'domicilio')::boolean THEN
    RAISE EXCEPTION '3e: el resto debía ser el juego de FOODTRUCK: %', v_r;
  END IF;
  IF (SELECT vertical_principal::text FROM tenants WHERE id = v_tenant) <> 'FOODTRUCK' THEN RAISE EXCEPTION '3e: no cambió el giro'; END IF;
  RAISE NOTICE '3d-3e cuentas abiertas OK';

  -- 3f) El pull de la caja (replica) escribe comedor apagado aunque haya cuentas abiertas.
  SET LOCAL session_replication_role = replica;
  UPDATE tenants SET operacion = operacion || '{"comedor":false}' WHERE id = v_tenant;
  SET LOCAL session_replication_role = origin;
  RAISE NOTICE '3f pull con cuentas abiertas OK';

  -- 3g) Giros retirados.
  BEGIN PERFORM cambiar_giro(v_tenant, 'CAFE_BAR', false); RAISE EXCEPTION '3g: aceptó CAFE_BAR';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM cambiar_giro(v_tenant, 'ENTERPRISE', false); RAISE EXCEPTION '3g: aceptó ENTERPRISE';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  -- Los giros de la 0179 no se asignan hasta que todas las cajas la tengan (ADR 0034): una caja
  -- vieja no conoce el valor y su pull entero fallaría.
  FOREACH v_op IN ARRAY ARRAY['"BAR"', '"CAFETERIA"', '"TAQUERIA"']::jsonb[] LOOP
    BEGIN
      PERFORM cambiar_giro(v_tenant, (v_op #>> '{}')::vertical_tipo, false);
      RAISE EXCEPTION '3g: asignó % antes de que las cajas lo conozcan', v_op;
    EXCEPTION WHEN invalid_parameter_value THEN
      IF SQLERRM NOT LIKE 'GIRO_NO_DISPONIBLE%' THEN RAISE; END IF;
    END;
  END LOOP;
  -- Sin reaplicar: solo cambia el giro.
  SELECT operacion INTO v_op FROM tenants WHERE id = v_tenant;
  v_r := cambiar_giro(v_tenant, 'FULL_SERVICE', false);
  IF v_r->'operacion' IS DISTINCT FROM v_op THEN RAISE EXCEPTION '3g: sin reaplicar no debía tocar la operación'; END IF;
  RAISE NOTICE '3g giros retirados, no disponibles y sin reaplicar OK';

  -- 3h) Un usuario autenticado (el dueño incluido) no escribe ni ejecuta nada de esto.
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria, 'role', 'authenticated', 'tenant_id', v_tenant)::text, true);
  BEGIN
    UPDATE tenants SET operacion = '{}' WHERE id = v_tenant;
    RAISE EXCEPTION '3h: un usuario autenticado cambió tenants.operacion';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM operacion_cambiar(v_tenant, '{"comedor":true}'); RAISE EXCEPTION '3h: ejecutó operacion_cambiar';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM cambiar_giro(v_tenant, 'BAR', true); RAISE EXCEPTION '3h: ejecutó cambiar_giro';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM operacion_cuentas_abiertas(v_tenant); RAISE EXCEPTION '3h: leyó cuentas abiertas de cualquier negocio';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  EXECUTE 'RESET ROLE';
  IF has_function_privilege('anon', 'operacion_cambiar(uuid, jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'cambiar_giro(uuid, vertical_tipo, boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'operacion_cuentas_abiertas(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '3h: anon puede ejecutar una función de /platform';
  END IF;
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE '3h permisos OK';
END $$;

-- 4) modulos_efectivos: las diez llaves, kds = plan Y interruptor, nada perdido.
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_m jsonb; v_kds_antes boolean; k text;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE tenants SET operacion = juego_inicial_de_giro(NULL) WHERE id = v_tenant;
  v_m := modulos_efectivos(v_tenant);
  v_kds_antes := (v_m->'permitidos'->>'kds')::boolean;   -- con todo encendido, efectivo = plan, como antes
  IF (v_m->'efectivos'->>'kds')::boolean IS DISTINCT FROM v_kds_antes THEN
    RAISE EXCEPTION '4a: con todo encendido kds efectivo debía ser igual al plan: %', v_m;
  END IF;
  FOREACH k IN ARRAY ARRAY['mostrador','comedor','meseros','domicilio','repartidores','marcas','eventos','cuentas_barra'] LOOP
    IF (v_m->'permitidos'->>k)::boolean IS DISTINCT FROM true OR (v_m->'efectivos'->>k)::boolean IS DISTINCT FROM true THEN
      RAISE EXCEPTION '4a: % debía estar permitido y efectivo con todo encendido: %', k, v_m;
    END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['recetas','promociones','cfdi','delivery_apps','lealtad','tienda','reservaciones'] LOOP
    IF NOT (v_m->'permitidos' ? k AND v_m->'efectivos' ? k) THEN
      RAISE EXCEPTION '4b: la redefinición perdió %: %', k, v_m;
    END IF;
  END LOOP;
  RAISE NOTICE '4a-4b llaves OK';

  PERFORM operacion_cambiar(v_tenant, '{"kds":false,"domicilio":false}');
  v_m := modulos_efectivos(v_tenant);
  IF (v_m->'efectivos'->>'kds')::boolean OR (v_m->'efectivos'->>'domicilio')::boolean
     OR (v_m->'efectivos'->>'repartidores')::boolean THEN
    RAISE EXCEPTION '4c: apagado debía no ser efectivo: %', v_m;
  END IF;
  IF (v_m->'permitidos'->>'kds')::boolean IS DISTINCT FROM v_kds_antes THEN
    RAISE EXCEPTION '4c: apagar el interruptor no debe cambiar lo que el plan permite';
  END IF;
  RAISE NOTICE '4c apagados OK';

  -- Otro negocio sigue sin poder preguntar por este.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'tenant_id', gen_random_uuid())::text, true);
  IF modulos_efectivos(v_tenant) IS NOT NULL THEN RAISE EXCEPTION '4d: otro negocio leyó estos módulos'; END IF;
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE '4d aislamiento OK';
END $$;

-- 5) El alta de la entrega 1 NO aplica todavía el juego del giro: ninguna pantalla lo obedece, y
--    un negocio dado de alta antes de la entrega 2 perdería pantallas de golpe al salir esta. Queda
--    todo encendido y la política de cobro por defecto; la entrega 2 aplica el juego en el alta.
DO $$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_tenant uuid; v_op jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (v_owner, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'owner-' || substr(v_owner::text, 1, 8) || '@smoke.dev', crypt('smokepass', gen_salt('bf')),
          now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
  v_tenant := crear_tenant_con_owner(v_owner, 'smoke-giro-' || substr(v_owner::text, 1, 8), 'Food Truck Smoke', 'Dueño Smoke',
                                     '4770000000', 'FOODTRUCK'::vertical_tipo, 'ESENCIAL', 'TRIAL'::tenant_estado, 'smoke 0180');

  SELECT operacion INTO v_op FROM tenants WHERE id = v_tenant;
  IF v_op IS DISTINCT FROM juego_inicial_de_giro(NULL) THEN
    RAISE EXCEPTION '5a: el alta de la entrega 1 debía dejar todo encendido: %', v_op;
  END IF;
  IF COALESCE((SELECT politica_cobro_cocina FROM configuracion_tenant WHERE tenant_id = v_tenant), 'COBRO_PRIMERO') <> 'COBRO_PRIMERO' THEN
    RAISE EXCEPTION '5a: el alta de la entrega 1 no debía tocar la política de cobro';
  END IF;
  RAISE NOTICE '5a alta sin juego todavía OK';
END $$;

ROLLBACK;
