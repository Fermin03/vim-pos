-- Smoke del modo de prueba del pago en línea y del freno tras un rechazo por riesgo (mig. 0177):
--   M) la marca tienda_config.pago_de_prueba: el dueño no la puede poner, por ningún camino;
--   C) qué conexión cobra: un negocio normal nunca con una de prueba, uno en modo de prueba nunca
--      con una real; la conexión de prueba no se renueva; cada pago conserva su conexión;
--   F) el freno: a quién frena, cuánto, que no guarda el teléfono, y el que pone el disparador.
-- Aquí no hay Mercado Pago ni Vault: se prueba lo que la base decide.
-- Fixture propio sobre el negocio y la sucursal de la semilla, como smoke_tienda_pago_en_linea.sql.
-- Uso: cd desktop && npm run smokes -- smoke_tienda_modo_de_prueba.sql
\set ON_ERROR_STOP on
BEGIN;

-- Un pedido en línea de 2 × $120 para recoger, sin propina: total 240.00.
CREATE FUNCTION pg_temp.pedir(p_tel text, p_n integer) RETURNS jsonb
LANGUAGE sql AS $f$
  SELECT tienda_crear_pedido(
    '99999999-0000-0000-0000-0000000000aa', '99999999-0000-0000-0000-0000000000bb', 'RECOGER', NULL,
    (SELECT format('[{"producto_id":"%s","cantidad":2}]', p.id)::jsonb FROM productos p
      WHERE p.tenant_id = '99999999-0000-0000-0000-0000000000aa' AND p.nombre = 'Sencilla de prueba'),
    jsonb_build_object('nombre', 'Ana Prueba', 'telefono', p_tel, 'email', 'ana.prueba@example.com'),
    NULL, 'EN_LINEA', NULL, NULL, md5('mp-a' || p_n) || md5('mp-b' || p_n), p_propina_pct => 0);
$f$;

DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_cajero uuid := '99999999-0000-0000-0000-000000000001';
  v_dueno  uuid := '99999999-0000-0000-0000-0000000000e1';
  v_otro   uuid := '72727272-0000-0000-0000-0000000000aa';
  h_todo   jsonb := '{"1":["00:00","00:00"],"2":["00:00","00:00"],"3":["00:00","00:00"],"4":["00:00","00:00"],"5":["00:00","00:00"],"6":["00:00","00:00"],"7":["00:00","00:00"]}';
  pk_real   text := 'APP_USR-smoke-cuenta-real-000001';
  pk_prueba text := 'APP_USR-smoke-cuenta-de-prueba-1';
  v_cat uuid; v_real uuid; v_prueba uuid; v_prueba2 uuid; v_id uuid;
  v_r jsonb; v_r2 jsonb; v_neg jsonb;
  v_n integer; v_txt text; v_ts timestamptz; v_ts2 timestamptz;
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- ── Fixture: la tienda abierta ahora, con turno, sin caja instalada, con pago en línea ───────
  INSERT INTO configuracion_tenant (tenant_id) VALUES (v_t) ON CONFLICT (tenant_id) DO NOTHING;
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
  VALUES (v_t, (SELECT id FROM addons WHERE codigo = 'TIENDA'), (now() AT TIME ZONE 'America/Mexico_City')::date, true, 100.00);
  INSERT INTO tienda_config (tenant_id, slug, pago_efectivo, pago_en_linea) VALUES (v_t, 'prueba-smoke', true, true);
  UPDATE configuracion_tenant SET modulo_tienda_activo = true WHERE tenant_id = v_t;
  INSERT INTO tienda_sucursales (sucursal_id, tenant_id, participa, recoger, domicilio, horario)
  VALUES (v_suc, v_t, true, true, false, h_todo);
  UPDATE cajas SET espejo_turno_abierto_at = now(), espejo_apps_at = NULL, version_app = NULL WHERE sucursal_id = v_suc;
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion) VALUES (v_t, 'De prueba smoke', 71) RETURNING id INTO v_cat;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_t, v_cat, 'Sencilla de prueba', 120);
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE sucursal_id = v_suc AND estado = 'ABIERTO';
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_t, v_suc, v_caja, 'SMOKE-PRUEBA', (now() AT TIME ZONE 'America/Mexico_City')::date, v_cajero, 500, 'TOTAL');
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_otro, 'tenant-0177', 'Otro negocio', 'INTERNO', 'QUICK_SERVICE');
  INSERT INTO tienda_conexiones (tenant_id, cuenta_id_externo, cuenta_nombre, public_key)
  VALUES (v_t, '501', 'Cuenta real', pk_real) RETURNING id INTO v_real;
  IF tienda_estado_sucursal(v_suc, 'RECOGER') IS NOT NULL THEN RAISE EXCEPTION 'fixture: la tienda debía estar abierta: %', tienda_estado_sucursal(v_suc, 'RECOGER'); END IF;
  IF tienda_conexion_cobro(v_t, v_suc) IS DISTINCT FROM v_real THEN RAISE EXCEPTION 'fixture: debía cobrar la cuenta real'; END IF;
  IF (SELECT pago_de_prueba FROM tienda_config WHERE tenant_id = v_t) THEN RAISE EXCEPTION 'fixture: la marca nace apagada'; END IF;

  -- ── M) La marca: solo VIM ───────────────────────────────────────────────────────────────────
  -- M1) El dueño, con su sesión y bajo RLS, sigue escribiendo lo suyo…
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  UPDATE tienda_config SET color = '#222222', pago_tarjeta = true, pago_en_linea = true, updated_at = now() WHERE tenant_id = v_t;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'M1: el dueño ya no puede guardar la configuración de su tienda'; END IF;
  -- …pero no la marca: ni sola, ni escondida entre otras columnas, ni «apagándola», ni al crear la fila.
  BEGIN
    UPDATE tienda_config SET pago_de_prueba = true WHERE tenant_id = v_t;
    RAISE EXCEPTION 'M1: el dueño encendió el modo de prueba';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE tienda_config SET color = '#333333', pago_de_prueba = true WHERE tenant_id = v_t;
    RAISE EXCEPTION 'M1: el dueño encendió el modo de prueba junto con otra columna';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE tienda_config SET pago_de_prueba = false WHERE tenant_id = v_t;
    RAISE EXCEPTION 'M1: el dueño escribió la marca (aunque fuera para apagarla)';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO tienda_config (tenant_id, slug, pago_de_prueba) VALUES (v_t, 'prueba-smoke-2', true);
    RAISE EXCEPTION 'M1: el dueño creó una tienda con el modo de prueba encendido';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- Tampoco por las funciones: ni crear la conexión de prueba, ni frenar o mirar el freno de nadie.
  BEGIN
    PERFORM tienda_conexion_de_prueba(v_t, '3754297554', pk_prueba, 'token');
    RAISE EXCEPTION 'M1: el dueño llamó a tienda_conexion_de_prueba';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO tienda_conexiones (tenant_id, cuenta_id_externo, public_key, de_prueba) VALUES (v_t, '3754297554', pk_prueba, true);
    RAISE EXCEPTION 'M1: el dueño insertó una conexión de prueba';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
  IF (SELECT pago_de_prueba FROM tienda_config WHERE tenant_id = v_t) THEN RAISE EXCEPTION 'M1: la marca quedó encendida'; END IF;
  IF (SELECT color FROM tienda_config WHERE tenant_id = v_t) <> '#222222' THEN RAISE EXCEPTION 'M1: se guardó un cambio que venía con la marca'; END IF;

  -- M2) Al catálogo: ni anon ni authenticated tienen INSERT o UPDATE sobre la marca; y authenticated
  --     conserva los dos sobre TODAS las demás columnas (si alguien añade una columna a tienda_config
  --     y olvida su GRANT, el admin dejaría de poder guardarla: aquí se ve).
  SELECT string_agg(r || ' ' || p, ', ') INTO v_txt
    FROM unnest(ARRAY['anon', 'authenticated']) r, unnest(ARRAY['INSERT', 'UPDATE']) p
   WHERE has_column_privilege(r, 'public.tienda_config', 'pago_de_prueba', p);
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'M2: la marca se puede escribir: %', v_txt; END IF;
  SELECT string_agg(a.attname || ' ' || p, ', ') INTO v_txt
    FROM pg_attribute a, unnest(ARRAY['INSERT', 'UPDATE']) p
   WHERE a.attrelid = 'public.tienda_config'::regclass AND a.attnum > 0 AND NOT a.attisdropped AND a.attname <> 'pago_de_prueba'
     AND NOT has_column_privilege('authenticated', 'public.tienda_config', a.attname, p);
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'M2: el dueño perdió permisos sobre: %', v_txt; END IF;
  IF has_table_privilege('anon', 'public.tienda_config', 'SELECT') THEN RAISE EXCEPTION 'M2: anon lee tienda_config'; END IF;

  -- M3) Ninguna función que alguien con sesión (o sin ella) pueda ejecutar toca la marca, ni las
  --     funciones nuevas quedaron abiertas.
  SELECT string_agg(p.proname, ', ') INTO v_txt FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.prosrc ILIKE '%pago_de_prueba%'
     AND (has_function_privilege('authenticated', p.oid, 'EXECUTE') OR has_function_privilege('anon', p.oid, 'EXECUTE'));
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'M3: funciones al alcance del dueño que tocan la marca: %', v_txt; END IF;
  SELECT string_agg(p.proname || ' → ' || r, ', ') INTO v_txt
    FROM pg_proc p, unnest(ARRAY['anon', 'authenticated']) r
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('tienda_conexion_cobro', 'tienda_negocio', 'tienda_seguimiento', 'tienda_conexion_de_prueba',
                       'tienda_pago_frenar', 'tienda_pago_frenado', '_tienda_freno_claves', 'tienda_pagos_frenar_por_riesgo')
     AND has_function_privilege(r, p.oid, 'EXECUTE');
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'M3: funciones abiertas: %', v_txt; END IF;
  IF (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
        AND p.proname IN ('tienda_conexion_cobro', 'tienda_negocio', 'tienda_seguimiento', 'tienda_conexion_de_prueba', 'tienda_pago_frenar', 'tienda_pago_frenado')
        AND has_function_privilege('service_role', p.oid, 'EXECUTE')) <> 6 THEN
    RAISE EXCEPTION 'M3: service_role debía poder ejecutar las seis (y ninguna tiene sobrecargas)';
  END IF;

  -- ── C) Qué conexión cobra ───────────────────────────────────────────────────────────────────
  -- C1) Sin la marca, la conexión de prueba no se puede crear por su función.
  BEGIN
    PERFORM tienda_conexion_de_prueba(v_t, '3754297554', pk_prueba, 'token-de-prueba');
    RAISE EXCEPTION 'C1: creó una conexión de prueba en un negocio que no está en modo de prueba';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'NEGOCIO_NO_ES_DE_PRUEBA%' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM tienda_conexiones WHERE tenant_id = v_t AND de_prueba) THEN RAISE EXCEPTION 'C1: quedó una conexión de prueba'; END IF;

  -- C2) NEGOCIO NORMAL: nunca cobra con una de prueba, esté como esté lo demás. (Se inserta a mano,
  --     como postgres: es lo que dejaría un OAuth con un vendedor de prueba.)
  INSERT INTO tienda_conexiones (tenant_id, cuenta_id_externo, cuenta_nombre, public_key, de_prueba)
  VALUES (v_t, '3754297554', 'Cuenta de prueba', pk_prueba, true) RETURNING id INTO v_prueba;
  --   · elegida la de prueba para la sucursal: ninguna;
  UPDATE tienda_sucursales SET conexion_id = v_prueba WHERE sucursal_id = v_suc;
  IF tienda_conexion_cobro(v_t, v_suc) IS NOT NULL THEN RAISE EXCEPTION 'C2: un negocio normal cobra con la conexión de prueba elegida'; END IF;
  --   · elegida la real: la real;
  UPDATE tienda_sucursales SET conexion_id = v_real WHERE sucursal_id = v_suc;
  IF tienda_conexion_cobro(v_t, v_suc) IS DISTINCT FROM v_real THEN RAISE EXCEPTION 'C2: con la real elegida debía cobrar la real'; END IF;
  --   · sin elegir y con las dos activas: ninguna (como siempre: con varias no se adivina);
  UPDATE tienda_sucursales SET conexion_id = NULL WHERE sucursal_id = v_suc;
  IF tienda_conexion_cobro(v_t, v_suc) IS NOT NULL THEN RAISE EXCEPTION 'C2: con dos cuentas activas y sin elegir no debía cobrar ninguna'; END IF;
  --   · sin elegir y solo la de prueba activa: ninguna.
  UPDATE tienda_conexiones SET estado = 'DESCONECTADA' WHERE id = v_real;
  IF tienda_conexion_cobro(v_t, v_suc) IS NOT NULL THEN RAISE EXCEPTION 'C2: un negocio normal cobra con su única conexión, que es de prueba'; END IF;
  v_neg := tienda_negocio('prueba-smoke');
  IF (v_neg -> 'publico' -> 'pago_de_prueba') IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'C2: la tienda de un negocio normal dice modo de prueba: %', v_neg -> 'publico' -> 'pago_de_prueba'; END IF;
  IF (v_neg -> 'publico' -> 'sucursales' -> 0 ->> 'public_key') IS NOT NULL THEN RAISE EXCEPTION 'C2: la tienda de un negocio normal entrega la public key de prueba'; END IF;
  BEGIN
    PERFORM pg_temp.pedir('4770000001', 1);
    RAISE EXCEPTION 'C2: un negocio normal creó un pedido en línea con solo una conexión de prueba';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'PAGO_INVALIDO%' THEN RAISE; END IF;
  END;
  UPDATE tienda_conexiones SET estado = 'ACTIVA' WHERE id = v_real;
  UPDATE tienda_sucursales SET conexion_id = v_real WHERE sucursal_id = v_suc;

  -- C3) MODO DE PRUEBA (lo enciende VIM, como postgres): cobra SOLO la de prueba, aunque la real
  --     siga activa y sea la elegida para la sucursal.
  UPDATE tienda_config SET pago_de_prueba = true WHERE tenant_id = v_t;
  IF tienda_conexion_cobro(v_t, v_suc) IS DISTINCT FROM v_prueba THEN RAISE EXCEPTION 'C3: en modo de prueba debía cobrar la conexión de prueba'; END IF;
  v_neg := tienda_negocio('prueba-smoke');
  IF (v_neg -> 'publico' -> 'pago_de_prueba') IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'C3: la tienda no dice que está en modo de prueba'; END IF;
  IF (v_neg -> 'publico' -> 'sucursales' -> 0 ->> 'public_key') IS DISTINCT FROM pk_prueba THEN RAISE EXCEPTION 'C3: la tienda no entrega la public key de prueba: %', v_neg -> 'publico' -> 'sucursales' -> 0 ->> 'public_key'; END IF;
  --   · las pausas valen igual;
  PERFORM tienda_pago_pausar(v_t, NULL, 60);
  IF tienda_conexion_cobro(v_t, v_suc) IS NOT NULL THEN RAISE EXCEPTION 'C3: en modo de prueba no respeta la pausa del negocio'; END IF;
  UPDATE tienda_config SET pago_pausado_hasta = NULL WHERE tenant_id = v_t;
  --   · la casilla del dueño, también;
  UPDATE tienda_config SET pago_en_linea = false WHERE tenant_id = v_t;
  IF tienda_conexion_cobro(v_t, v_suc) IS NOT NULL THEN RAISE EXCEPTION 'C3: en modo de prueba cobra con la casilla apagada'; END IF;
  UPDATE tienda_config SET pago_en_linea = true WHERE tenant_id = v_t;
  --   · sin conexión de prueba activa: NINGUNA. Nunca la real.
  UPDATE tienda_conexiones SET estado = 'DESCONECTADA' WHERE id = v_prueba;
  IF tienda_conexion_cobro(v_t, v_suc) IS NOT NULL THEN RAISE EXCEPTION 'C3: sin conexión de prueba ACTIVA no debía cobrar ninguna (ni la real, ni la de prueba desconectada)'; END IF;
  UPDATE tienda_sucursales SET conexion_id = NULL WHERE sucursal_id = v_suc;
  IF tienda_conexion_cobro(v_t, v_suc) IS NOT NULL THEN RAISE EXCEPTION 'C3: un negocio en modo de prueba cobra con su única conexión activa, que es real'; END IF;
  IF (tienda_negocio('prueba-smoke') -> 'publico' -> 'sucursales' -> 0 ->> 'public_key') IS NOT NULL THEN RAISE EXCEPTION 'C3: en modo de prueba la tienda entrega la public key real'; END IF;
  BEGIN
    PERFORM pg_temp.pedir('4770000002', 2);
    RAISE EXCEPTION 'C3: un negocio en modo de prueba creó un pedido en línea sin conexión de prueba';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'PAGO_INVALIDO%' THEN RAISE; END IF;
  END;
  UPDATE tienda_conexiones SET estado = 'ERROR' WHERE id = v_prueba;
  IF tienda_conexion_cobro(v_t, v_suc) IS NOT NULL THEN RAISE EXCEPTION 'C3: cobra con una conexión de prueba en error'; END IF;
  UPDATE tienda_conexiones SET estado = 'ACTIVA' WHERE id = v_prueba;
  UPDATE tienda_sucursales SET conexion_id = v_real WHERE sucursal_id = v_suc;
  --   · con dos de prueba activas: ninguna;
  INSERT INTO tienda_conexiones (tenant_id, cuenta_id_externo, public_key, de_prueba)
  VALUES (v_t, '3754297555', 'APP_USR-smoke-cuenta-de-prueba-2', true) RETURNING id INTO v_prueba2;
  IF tienda_conexion_cobro(v_t, v_suc) IS NOT NULL THEN RAISE EXCEPTION 'C3: con dos conexiones de prueba activas no debía cobrar ninguna'; END IF;
  DELETE FROM tienda_conexiones WHERE id = v_prueba2;
  --   · la conexión de prueba de OTRO negocio no cuenta.
  INSERT INTO tienda_conexiones (tenant_id, cuenta_id_externo, public_key, de_prueba) VALUES (v_otro, '3754297554', pk_prueba, true);
  IF tienda_conexion_cobro(v_t, v_suc) IS DISTINCT FROM v_prueba THEN RAISE EXCEPTION 'C3: la conexión de prueba de otro negocio cambió quién cobra'; END IF;

  -- C4) tienda_conexion_de_prueba, ya con la marca: valida lo que recibe, no convierte una cuenta
  --     real en de prueba, y guarda en Vault (aquí no hay: lo dice, y no deja nada a medias).
  FOR v_r IN SELECT * FROM jsonb_array_elements('[
      {"c": "abc", "k": "APP_USR-smoke-cuenta-de-prueba-1", "a": "t"},
      {"c": "3754297554", "k": "corta", "a": "t"},
      {"c": "3754297554", "k": "APP_USR-smoke-cuenta-de-prueba-1", "a": "  "},
      {"c": "3754297554", "k": "APP_USR-smoke-cuenta-de-prueba-1", "a": null},
      {"c": null, "k": "APP_USR-smoke-cuenta-de-prueba-1", "a": "t"}]'::jsonb) LOOP
    BEGIN
      PERFORM tienda_conexion_de_prueba(v_t, v_r ->> 'c', v_r ->> 'k', v_r ->> 'a');
      RAISE EXCEPTION 'C4: aceptó %', v_r;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'CONEXION_DE_PRUEBA_INVALIDA%' THEN RAISE; END IF;
    END;
  END LOOP;
  BEGIN
    PERFORM tienda_conexion_de_prueba(v_t, '501', pk_prueba, 'token-de-prueba');
    RAISE EXCEPTION 'C4: convirtió la cuenta real en de prueba';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'CUENTA_REAL%' THEN RAISE; END IF;
  END;
  IF (SELECT de_prueba FROM tienda_conexiones WHERE id = v_real) THEN RAISE EXCEPTION 'C4: la conexión real quedó marcada de prueba'; END IF;
  BEGIN
    PERFORM tienda_conexion_de_prueba(v_otro, '3754297554', pk_prueba, 'token-de-prueba');
    RAISE EXCEPTION 'C4: creó la conexión de prueba de un negocio sin la marca (el otro)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'NEGOCIO_NO_ES_DE_PRUEBA%' THEN RAISE; END IF;
  END;
  UPDATE tienda_conexiones SET vence_at = now() + interval '5 days', ultimo_error = 'viejo', estado = 'ERROR' WHERE id = v_prueba;
  BEGIN
    v_id := tienda_conexion_de_prueba(v_t, '3754297554', 'APP_USR-smoke-cuenta-de-prueba-9', 'token-de-prueba');
    IF to_regnamespace('vault') IS NULL THEN RAISE EXCEPTION 'C4: guardó el token sin Vault'; END IF;
    -- Con Vault (el Supabase local del CI): la misma fila, activa, sin vencimiento, con su access y sin refresh.
    IF v_id IS DISTINCT FROM v_prueba THEN RAISE EXCEPTION 'C4: debía actualizar la conexión de esa cuenta, no crear otra'; END IF;
    IF NOT EXISTS (SELECT 1 FROM tienda_conexiones WHERE id = v_prueba AND de_prueba AND estado = 'ACTIVA' AND vence_at IS NULL
                     AND ultimo_error IS NULL AND public_key = 'APP_USR-smoke-cuenta-de-prueba-9') THEN
      RAISE EXCEPTION 'C4: la conexión de prueba no quedó activa, sin vencimiento y con la public key nueva';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM tienda_leer_tokens(v_prueba) t WHERE t.access_token = 'token-de-prueba' AND t.refresh_token IS NULL) THEN
      RAISE EXCEPTION 'C4: el token de prueba no quedó en Vault, o quedó un refresh';
    END IF;
    UPDATE tienda_conexiones SET public_key = pk_prueba WHERE id = v_prueba;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'VAULT_NO_DISPONIBLE%' THEN RAISE; END IF;
    IF to_regnamespace('vault') IS NOT NULL THEN RAISE EXCEPTION 'C4: con Vault debía guardar el token'; END IF;
    -- Sin Vault no se tocó nada: la fila sigue como estaba.
    IF NOT EXISTS (SELECT 1 FROM tienda_conexiones WHERE id = v_prueba AND estado = 'ERROR' AND ultimo_error = 'viejo' AND public_key = pk_prueba) THEN
      RAISE EXCEPTION 'C4: sin Vault la conexión cambió a medias';
    END IF;
    UPDATE tienda_conexiones SET estado = 'ACTIVA', vence_at = NULL, ultimo_error = NULL WHERE id = v_prueba;
  END;

  -- C5) La conexión de prueba no se renueva: no vence, así que ni entra a la lista ni se deja tomar.
  UPDATE tienda_conexiones SET vence_at = now() + interval '400 days' WHERE id = v_real;
  IF EXISTS (SELECT 1 FROM tienda_conexiones_por_renovar(365, 200) x WHERE x = v_prueba) THEN RAISE EXCEPTION 'C5: la conexión de prueba entró a la renovación'; END IF;
  IF tienda_conexion_tomar_renovacion(v_prueba) IS NOT NULL THEN RAISE EXCEPTION 'C5: la conexión de prueba se dejó tomar para renovarla'; END IF;
  IF tienda_pedir_renovacion() THEN RAISE EXCEPTION 'C5: se pidió una renovación sin nada que renovar'; END IF;

  -- C6) El pedido nace con la conexión que le toca, y la conserva. En modo de prueba, la de prueba;
  --     su seguimiento lo dice. Apagado el modo, el siguiente nace con la real, y el de antes sigue
  --     diciendo que fue de prueba.
  v_r := pg_temp.pedir('4770000003', 3);
  IF (SELECT conexion_id FROM tienda_pagos WHERE id = (v_r ->> 'pago_id')::uuid) IS DISTINCT FROM v_prueba THEN RAISE EXCEPTION 'C6: en modo de prueba el pago no nació con la conexión de prueba'; END IF;
  IF (tienda_seguimiento(v_t, md5('mp-a3') || md5('mp-b3')) -> 'pago_de_prueba') IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'C6: el seguimiento del pedido de prueba no lo dice'; END IF;
  PERFORM tienda_pago_aplicar((v_r ->> 'pago_id')::uuid, 'APROBADO', 'ORDPRUEBA3', 240.00, 'credit_card', 'master');
  IF (tienda_seguimiento(v_t, md5('mp-a3') || md5('mp-b3')) ->> 'pago_estado') <> 'PAGADO' THEN RAISE EXCEPTION 'C6: el pedido de prueba no quedó pagado'; END IF;
  UPDATE tienda_config SET pago_de_prueba = false WHERE tenant_id = v_t;
  IF tienda_conexion_cobro(v_t, v_suc) IS DISTINCT FROM v_real THEN RAISE EXCEPTION 'C6: apagado el modo de prueba debía volver a cobrar la real (la elegida)'; END IF;
  v_r2 := pg_temp.pedir('4770000004', 4);
  IF (SELECT conexion_id FROM tienda_pagos WHERE id = (v_r2 ->> 'pago_id')::uuid) IS DISTINCT FROM v_real THEN RAISE EXCEPTION 'C6: el pedido real no nació con la conexión real'; END IF;
  IF (tienda_seguimiento(v_t, md5('mp-a4') || md5('mp-b4')) -> 'pago_de_prueba') IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'C6: el seguimiento de un pedido real dice que es de prueba'; END IF;
  IF (tienda_seguimiento(v_t, md5('mp-a3') || md5('mp-b3')) -> 'pago_de_prueba') IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'C6: el pedido de prueba dejó de decirlo al apagar el modo'; END IF;
  IF (SELECT conexion_id FROM tienda_pagos WHERE id = (v_r ->> 'pago_id')::uuid) IS DISTINCT FROM v_prueba THEN RAISE EXCEPTION 'C6: el pago de prueba cambió de conexión'; END IF;
  -- Un pedido al recibir no trae la clave (devuelve, clave por clave, lo de siempre).
  PERFORM tienda_crear_pedido(v_t, v_suc, 'RECOGER', NULL,
    (SELECT format('[{"producto_id":"%s","cantidad":1}]', p.id)::jsonb FROM productos p WHERE p.tenant_id = v_t AND p.nombre = 'Sencilla de prueba'),
    jsonb_build_object('nombre', 'Ana Prueba', 'telefono', '4770000005', 'email', NULL), NULL, 'EFECTIVO', NULL, NULL, md5('mp-a5') || md5('mp-b5'));
  IF tienda_seguimiento(v_t, md5('mp-a5') || md5('mp-b5')) ? 'pago_de_prueba' THEN RAISE EXCEPTION 'C6: un pedido al recibir trae pago_de_prueba'; END IF;

  -- ── F) El freno tras un rechazo por riesgo ──────────────────────────────────────────────────
  -- F1) Nadie está frenado hasta que se frena. Se frena al teléfono y a la IP, cada uno por su lado,
  --     30 minutos, solo en ese negocio.
  IF tienda_pago_frenado(v_t, '4771110001', '10.0.0.1') IS NOT NULL THEN RAISE EXCEPTION 'F1: frenado sin haber frenado a nadie'; END IF;
  v_ts := tienda_pago_frenar(v_t, '4771110001', '10.0.0.1');
  IF v_ts IS NULL OR v_ts < clock_timestamp() + interval '29 minutes' OR v_ts > clock_timestamp() + interval '31 minutes' THEN RAISE EXCEPTION 'F1: el freno debía durar 30 minutos: %', v_ts - clock_timestamp(); END IF;
  IF tienda_pago_frenado(v_t, '4771110001', '10.0.0.1') IS DISTINCT FROM v_ts THEN RAISE EXCEPTION 'F1: frenado no devuelve hasta cuándo'; END IF;
  IF tienda_pago_frenado(v_t, '4771110001', '10.9.9.9') IS DISTINCT FROM v_ts THEN RAISE EXCEPTION 'F1: cambiar de red esquiva el freno del teléfono'; END IF;
  IF tienda_pago_frenado(v_t, '4771110001', NULL) IS DISTINCT FROM v_ts THEN RAISE EXCEPTION 'F1: sin IP conocida no ve el freno del teléfono'; END IF;
  IF tienda_pago_frenado(v_t, '4779990009', '10.0.0.1') IS DISTINCT FROM v_ts THEN RAISE EXCEPTION 'F1: cambiar de teléfono esquiva el freno de la IP'; END IF;
  IF tienda_pago_frenado(v_t, '4779990009', '10.9.9.9') IS NOT NULL THEN RAISE EXCEPTION 'F1: frenó a otro cliente (otro teléfono, otra red)'; END IF;
  IF tienda_pago_frenado(v_otro, '4771110001', '10.0.0.1') IS NOT NULL THEN RAISE EXCEPTION 'F1: el freno de un negocio vale en otro'; END IF;
  -- El teléfono no queda escrito: solo su huella.
  IF EXISTS (SELECT 1 FROM limites_cupo WHERE clave LIKE '%4771110001%') THEN RAISE EXCEPTION 'F1: el teléfono quedó en claro en limites_cupo'; END IF;
  IF (SELECT count(*) FROM limites_cupo WHERE clave LIKE 'tienda:pago-freno:' || v_t || ':%') <> 2 THEN RAISE EXCEPTION 'F1: esperaba dos claves del freno (teléfono e IP)'; END IF;

  -- F2) Frenar otra vez no lo acorta; y se levanta solo al vencer.
  v_ts2 := tienda_pago_frenar(v_t, '4771110001', '10.0.0.1', 1);
  IF tienda_pago_frenado(v_t, '4771110001', '10.0.0.1') IS DISTINCT FROM v_ts THEN RAISE EXCEPTION 'F2: un freno más corto acortó el que había'; END IF;
  UPDATE limites_cupo SET expira_en = clock_timestamp() - interval '1 second' WHERE clave LIKE 'tienda:pago-freno:' || v_t || ':%';
  IF tienda_pago_frenado(v_t, '4771110001', '10.0.0.1') IS NOT NULL THEN RAISE EXCEPTION 'F2: el freno no se levantó al vencer'; END IF;
  -- Sin decir cuántos minutos (NULL explícito), los 30 de siempre.
  v_ts := tienda_pago_frenar(v_t, '4771110004', NULL, NULL);
  IF v_ts < clock_timestamp() + interval '29 minutes' OR v_ts > clock_timestamp() + interval '31 minutes' THEN RAISE EXCEPTION 'F2: con minutos NULL el freno debía durar 30: %', v_ts - clock_timestamp(); END IF;
  -- Los minutos, acotados: ni cero ni días.
  v_ts := tienda_pago_frenar(v_t, '4771110002', NULL, 0);
  IF v_ts < clock_timestamp() + interval '30 seconds' THEN RAISE EXCEPTION 'F2: un freno de 0 minutos'; END IF;
  v_ts := tienda_pago_frenar(v_t, '4771110002', NULL, 999999);
  IF v_ts > clock_timestamp() + interval '25 hours' THEN RAISE EXCEPTION 'F2: un freno de más de un día'; END IF;

  -- F3) Sin a quién frenar no se frena a nadie: ni un teléfono que no lo es, ni la IP «desconocida»
  --     (frenaría a todos los que caen en ese saco), ni sin negocio.
  SELECT count(*) INTO v_n FROM limites_cupo WHERE clave LIKE 'tienda:pago-freno:%';
  IF tienda_pago_frenar(v_t, 'no-es-telefono', 'desconocida') IS NOT NULL OR tienda_pago_frenar(v_t, NULL, NULL) IS NOT NULL
     OR tienda_pago_frenar(NULL, '4771110003', '10.0.0.3') IS NOT NULL OR tienda_pago_frenar(v_t, '477111000', '') IS NOT NULL THEN
    RAISE EXCEPTION 'F3: frenó sin tener a quién';
  END IF;
  IF (SELECT count(*) FROM limites_cupo WHERE clave LIKE 'tienda:pago-freno:%') <> v_n THEN RAISE EXCEPTION 'F3: quedaron claves de un freno sin dueño'; END IF;
  IF tienda_pago_frenado(v_t, 'no-es-telefono', 'desconocida') IS NOT NULL THEN RAISE EXCEPTION 'F3: la IP desconocida aparece frenada'; END IF;
  -- Una IPv6 (su /64, como la manda la función) sí.
  IF tienda_pago_frenar(v_t, NULL, '2001:db8:0:1::/64') IS NULL OR tienda_pago_frenado(v_t, '4779990008', '2001:db8:0:1::/64') IS NULL THEN RAISE EXCEPTION 'F3: no frena una IPv6'; END IF;

  -- F4) El rechazo por riesgo que llega DESPUÉS (aviso, página del pedido o barrido): al quedar el
  --     pago RECHAZADO con `high_risk`, el disparador frena ese teléfono. Otro motivo, no.
  UPDATE tienda_config SET pago_de_prueba = false WHERE tenant_id = v_t;
  v_r := pg_temp.pedir('4771110010', 10);
  PERFORM tienda_pago_aplicar((v_r ->> 'pago_id')::uuid, 'RECHAZADO', 'ORDRIESGO10', NULL, p_detalle => 'insufficient_amount');
  IF tienda_pago_frenado(v_t, '4771110010', NULL) IS NOT NULL THEN RAISE EXCEPTION 'F4: frenó por un rechazo que no es por riesgo'; END IF;
  v_r := pg_temp.pedir('4771110011', 11);
  PERFORM tienda_pago_aplicar((v_r ->> 'pago_id')::uuid, 'RECHAZADO', 'ORDRIESGO11', NULL, p_detalle => 'high_risk');
  IF (SELECT estado FROM tienda_pagos WHERE id = (v_r ->> 'pago_id')::uuid) <> 'RECHAZADO' THEN RAISE EXCEPTION 'F4: el pago debía quedar RECHAZADO'; END IF;
  v_ts := tienda_pago_frenado(v_t, '4771110011', NULL);
  IF v_ts IS NULL OR v_ts < clock_timestamp() + interval '29 minutes' OR v_ts > clock_timestamp() + interval '31 minutes' THEN RAISE EXCEPTION 'F4: el rechazo por riesgo tardío no frenó 30 minutos: %', v_ts; END IF;
  IF tienda_pago_frenado(v_otro, '4771110011', NULL) IS NOT NULL THEN RAISE EXCEPTION 'F4: el disparador frenó en otro negocio'; END IF;
  -- El mismo aviso repetido no lo alarga (el pago ya no cambia de estado).
  PERFORM tienda_pago_aplicar((v_r ->> 'pago_id')::uuid, 'RECHAZADO', 'ORDRIESGO11', NULL, p_detalle => 'high_risk');
  IF tienda_pago_frenado(v_t, '4771110011', NULL) IS DISTINCT FROM v_ts THEN RAISE EXCEPTION 'F4: un aviso repetido movió el freno'; END IF;
  -- Ni cualquier otro cambio de ese pago ya rechazado: frena el paso A rechazado, una vez.
  UPDATE tienda_pagos SET ultimo_error = 'una nota', estado = estado WHERE id = (v_r ->> 'pago_id')::uuid;
  IF tienda_pago_frenado(v_t, '4771110011', NULL) IS DISTINCT FROM v_ts THEN RAISE EXCEPTION 'F4: tocar un pago ya rechazado volvió a frenar'; END IF;
  -- Un reto del banco que se dejó y cuya orden acaba `high_risk`: el pago sigue ABANDONADO, no hay rechazo nuevo, no frena.
  v_r := pg_temp.pedir('4771110012', 12);
  UPDATE tienda_pagos SET cobro_pedido_at = now() WHERE id = (v_r ->> 'pago_id')::uuid;
  PERFORM tienda_pago_verificacion((v_r ->> 'pago_id')::uuid, 'ORDRIESGO12');
  IF NOT tienda_pago_abandonar((v_r ->> 'pago_id')::uuid) THEN RAISE EXCEPTION 'F4: fixture: el reto debía poder dejarse'; END IF;
  PERFORM tienda_pago_aplicar((v_r ->> 'pago_id')::uuid, 'RECHAZADO', 'ORDRIESGO12', NULL, p_detalle => 'high_risk');
  IF tienda_pago_frenado(v_t, '4771110012', NULL) IS NOT NULL THEN RAISE EXCEPTION 'F4: frenó por la orden de un reto que el cliente ya había dejado'; END IF;
  -- Y el pedido de otro cliente sigue pasando: el freno no es del negocio.
  IF tienda_conexion_cobro(v_t, v_suc) IS DISTINCT FROM v_real THEN RAISE EXCEPTION 'F4: el freno de un cliente apagó el pago en línea del negocio'; END IF;

  RAISE NOTICE 'smoke_tienda_modo_de_prueba OK';
END $$;
ROLLBACK;
