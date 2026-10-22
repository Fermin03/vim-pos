-- Smoke 0228: la sesión web (correo y contraseña) de un colaborador sin jerarquía de panel no lee
-- ni escribe directo clientas, citas, anticipos, reservaciones ni cotizaciones; mi_agenda sí le
-- funciona. La caja (dispositivo y token de pin-login, sin session_id) y el panel no cambian. ROLLBACK.
-- Uso: cd desktop && npm run smokes -- smoke_sesion_colaborador.sql
\set ON_ERROR_STOP on
BEGIN;

-- Claims como los de PostgREST. p_web = token de GoTrue (trae session_id); sin él, el de pin-login.
CREATE FUNCTION pg_temp.como(p_usuario uuid, p_tenant uuid, p_web boolean, p_tipo text) RETURNS void LANGUAGE sql AS $f$
  SELECT set_config('request.jwt.claims', (jsonb_build_object('sub', p_usuario, 'tenant_id', p_tenant,
    'role', 'authenticated', 'tipo_identidad', p_tipo)
    || CASE WHEN p_web THEN jsonb_build_object('session_id', gen_random_uuid()) ELSE '{}'::jsonb END)::text, true)
$f$;

-- Filas visibles de cada tabla sensible, como «tabla=n» separados por coma.
CREATE FUNCTION pg_temp.visibles() RETURNS text LANGUAGE plpgsql AS $f$
DECLARE t text; n integer; r text := '';
BEGIN
  FOREACH t IN ARRAY ARRAY['clientes', 'citas', 'citas_servicios', 'anticipos_cita', 'reservaciones', 'cotizaciones'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
    r := r || t || '=' || n || ',';
  END LOOP;
  RETURN r;
END $f$;

DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';   -- CAJERO
  v_diego  uuid := '99999999-0000-0000-0000-0000000000f1';   -- SUPERVISOR
  v_dueno  uuid := '99999999-0000-0000-0000-0000000000e1';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000d1';   -- cuenta DISPOSITIVO
  v_pers   uuid := '22800000-0000-0000-0000-0000000000b1';   -- PERSONAL; colaboradora
  v_cat    uuid := 'a0000000-0000-0000-0000-0000000000c1';
  v_corte  uuid := '22800000-0000-0000-0000-0000000000a1';
  v_vis text; v_j jsonb; v_n integer; v_x text; v_rol boolean;
BEGIN
  UPDATE tenants SET vertical_principal = 'SALON', operacion = operacion || '{"agenda":true}' WHERE id = v_t;
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (v_pers, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'paty-smoke-0228@prueba.test', '',
          now(), '{"provider":"email","providers":["email"]}', '{}');
  INSERT INTO usuarios_perfil (id, nombre) VALUES (v_pers, 'Paty Smoke');
  INSERT INTO usuarios_acceso (usuario_id, tenant_id, rol_id)
  SELECT v_pers, v_t, id FROM roles WHERE tenant_id IS NULL AND codigo = 'PERSONAL';
  INSERT INTO productos (id, tenant_id, categoria_id, nombre, precio_base_mxn, tasa_iva, iva_incluido_en_precio)
  VALUES (v_corte, v_t, v_cat, 'Corte', 180, 16, true);
  INSERT INTO servicios_agenda (producto_id, tenant_id, duracion_min) VALUES (v_corte, v_t, 60);
  INSERT INTO colaboradores_agenda (usuario_id, tenant_id, sucursal_id, color_hex) VALUES
    (v_pers, v_t, v_suc, '#C2410C'), (v_maria, v_t, v_suc, '#0F766E');
  INSERT INTO servicio_colaborador (producto_id, usuario_id, tenant_id) VALUES (v_corte, v_pers, v_t), (v_corte, v_maria, v_t);

  -- 0) El helper: definer, search_path fijo.
  SELECT count(*) INTO v_n FROM pg_proc
   WHERE proname = 'es_sesion_web_limitada' AND pronamespace = 'public'::regnamespace AND prosecdef
     AND proconfig @> ARRAY['search_path=""'] AND has_function_privilege('authenticated', oid, 'execute');
  IF v_n <> 1 THEN RAISE EXCEPTION 'C0: es_sesion_web_limitada no es definer con search_path fijo'; END IF;

  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_t, 'Camila', '4779990001');

  EXECUTE 'SET LOCAL ROLE authenticated';
  -- Una cita de Paty, agendada desde el panel por el dueño.
  PERFORM pg_temp.como(v_dueno, v_t, true, 'ADMIN_WEB');
  PERFORM guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'Camila',
    'cliente_telefono', '4779990001', 'cliente_email', 'camila@ejemplo.mx', 'inicia', '2030-01-14 10:00-06',
    'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_corte, 'usuario_id', v_pers))));

  -- 1) La caja (pin-login, sin session_id) lee todo, igual que antes.
  PERFORM pg_temp.como(v_maria, v_t, false, 'EMPLEADO');
  v_vis := pg_temp.visibles();
  IF v_vis LIKE '%clientes=0,%' OR v_vis LIKE '%citas=0,%' OR v_vis LIKE '%citas_servicios=0,%' THEN
    RAISE EXCEPTION 'C1: la caja dejó de leer: %', v_vis;
  END IF;

  -- 2) El dispositivo (token de GoTrue, DISPOSITIVO) también.
  PERFORM pg_temp.como(v_caja, v_t, true, 'DISPOSITIVO');
  IF pg_temp.visibles() LIKE '%citas=0,%' THEN RAISE EXCEPTION 'C2: el dispositivo dejó de leer citas'; END IF;

  -- 3) Panel: dueño (ADMIN_WEB) y supervisor (jerarquía 3, EMPLEADO) con sesión web leen.
  PERFORM pg_temp.como(v_dueno, v_t, true, 'ADMIN_WEB');
  IF pg_temp.visibles() LIKE '%citas=0,%' OR pg_temp.visibles() LIKE '%clientes=0,%' THEN RAISE EXCEPTION 'C3: el dueño dejó de leer'; END IF;
  -- «Dar acceso»: el dueño ve el correo de cada colaborador activo (Paty y María).
  SELECT count(*) INTO v_n FROM agenda_accesos_colaboradores() a WHERE a.usuario_id IN (v_pers, v_maria) AND a.email IS NOT NULL;
  IF v_n <> 2 THEN RAISE EXCEPTION 'C3: accesos de colaboradores: % de 2', v_n; END IF;
  PERFORM pg_temp.como(v_diego, v_t, true, 'EMPLEADO');
  IF pg_temp.visibles() LIKE '%citas=0,%' THEN RAISE EXCEPTION 'C3: el supervisor dejó de leer'; END IF;

  -- 4) Paty (PERSONAL) con sesión web: cero filas en todo, pero su agenda por RPC sí.
  PERFORM pg_temp.como(v_pers, v_t, true, 'EMPLEADO');
  v_vis := pg_temp.visibles();
  IF v_vis <> 'clientes=0,citas=0,citas_servicios=0,anticipos_cita=0,reservaciones=0,cotizaciones=0,' THEN
    RAISE EXCEPTION 'C4: la sesión web de un colaborador lee directo: %', v_vis;
  END IF;
  v_j := mi_agenda('2030-01-14', '2030-01-14');
  IF jsonb_array_length(v_j->'tramos') <> 1 OR v_j->'tramos'->0->'cita'->>'cliente_nombre' <> 'Camila' THEN
    RAISE EXCEPTION 'C4: mi_agenda no le funciona: %', v_j;
  END IF;

  -- Ni ve los correos de sus compañeros.
  BEGIN
    PERFORM agenda_accesos_colaboradores();
    RAISE EXCEPTION 'C4: un colaborador leyó los accesos';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- 5) Tampoco escribe directo.
  BEGIN
    INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_t, 'Colada', '4770000009');
    RAISE EXCEPTION 'C5: insertó una clienta';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE clientes SET nombre = 'Cambiada' WHERE tenant_id = v_t;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RAISE EXCEPTION 'C5: cambió % clientas', v_n; END IF;
  DELETE FROM clientes WHERE tenant_id = v_t;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RAISE EXCEPTION 'C5: borró % clientas', v_n; END IF;
  BEGIN
    INSERT INTO reservaciones (tenant_id, sucursal_id, folio_completo, folio_consecutivo, cliente_nombre_snapshot,
      fecha_hora_reserva, comensales, canal)
    VALUES (v_t, v_suc, 'R-SMOKE', 1, 'X', now(), 2, 'TELEFONO');
    RAISE EXCEPTION 'C5: insertó una reservación';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE citas SET nota = 'x';
    RAISE EXCEPTION 'C5: escribió en citas';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- 6) María (CAJERO, jerarquía 2) con sesión web también queda cerrada; con pin-login no.
  PERFORM pg_temp.como(v_maria, v_t, true, 'EMPLEADO');
  IF pg_temp.visibles() <> 'clientes=0,citas=0,citas_servicios=0,anticipos_cita=0,reservaciones=0,cotizaciones=0,' THEN
    RAISE EXCEPTION 'C6: la sesión web de una cajera lee directo';
  END IF;
  PERFORM pg_temp.como(v_maria, v_t, false, 'EMPLEADO');
  IF pg_temp.visibles() LIKE '%citas=0,%' THEN RAISE EXCEPTION 'C6: la cajera en la caja dejó de leer'; END IF;

  -- 7) Sin sesión (anon) la política se evalúa sin tronar; donde anon tiene GRANT, cero filas.
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  IF public.es_sesion_web_limitada() THEN RAISE EXCEPTION 'C7: anon cuenta como sesión limitada'; END IF;
  IF has_table_privilege('anon', 'public.clientes', 'SELECT') THEN
    IF (SELECT count(*) FROM clientes) <> 0 THEN RAISE EXCEPTION 'C7: anon lee clientas'; END IF;
  END IF;
  EXECUTE 'RESET ROLE';

  -- 8) El hook: la sesión web sin jerarquía de panel sale con role = colaborador_web.
  SELECT custom_access_token_hook(jsonb_build_object('user_id', v_pers, 'claims', '{"role":"authenticated"}'::jsonb))
         #>> '{claims,role}' INTO v_x;
  IF v_x <> 'colaborador_web' THEN RAISE EXCEPTION 'C8: Paty sale con role %', v_x; END IF;
  SELECT custom_access_token_hook(jsonb_build_object('user_id', v_maria, 'claims', '{"role":"authenticated"}'::jsonb))
         #>> '{claims,role}' INTO v_x;
  IF v_x <> 'colaborador_web' THEN RAISE EXCEPTION 'C8: la cajera sale con role %', v_x; END IF;
  SELECT string_agg(custom_access_token_hook(jsonb_build_object('user_id', u, 'claims', '{"role":"authenticated"}'::jsonb))
                    #>> '{claims,role}', ',' ORDER BY u) INTO v_x
    FROM unnest(ARRAY[v_dueno, v_diego, v_caja]) u;
  IF v_x <> 'authenticated,authenticated,authenticated' THEN RAISE EXCEPTION 'C8: dueño, supervisor o caja cambiaron de rol: %', v_x; END IF;
  SELECT custom_access_token_hook(jsonb_build_object('user_id', v_pers, 'claims', '{"role":"authenticated"}'::jsonb))
         #>> '{claims,tenant_id}' INTO v_x;
  IF v_x IS DISTINCT FROM v_t::text THEN RAISE EXCEPTION 'C8: Paty perdió el tenant_id'; END IF;

  -- 9) colaborador_web solo ejecuta lo de /mi-agenda: ninguna otra función DEFINER, ninguna tabla.
  SELECT string_agg(p.proname, ',' ORDER BY p.proname) INTO v_x FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef AND p.prorettype <> 'trigger'::regtype
     AND has_function_privilege('colaborador_web', p.oid, 'execute');
  IF v_x IS DISTINCT FROM 'mi_agenda,mi_cita_empezar,mi_cita_terminar,mi_periodo_comisiones,mis_comisiones' THEN
    RAISE EXCEPTION 'C9: colaborador_web ejecuta: %', v_x;
  END IF;
  SELECT count(*) INTO v_n FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'v', 'm', 'p')
     AND (has_table_privilege('colaborador_web', c.oid, 'SELECT') OR has_table_privilege('colaborador_web', c.oid, 'INSERT')
          OR has_table_privilege('colaborador_web', c.oid, 'UPDATE') OR has_table_privilege('colaborador_web', c.oid, 'DELETE'));
  IF v_n <> 0 THEN RAISE EXCEPTION 'C9: colaborador_web tiene privilegios en % tablas', v_n; END IF;

  -- 10) Como PostgREST con ese token: su agenda y sus comisiones sí; la caja y las tablas no.
  -- En la base nueva del CI `postgres` no es miembro de `colaborador_web` ni de `authenticator`, y no
  -- hay cómo serlo: `GRANT colaborador_web TO current_user` TUMBÓ el servidor del CI (22 oct 2026,
  -- «server closed the connection unexpectedly» y la base en recuperación para los smokes de después).
  -- Ahí se prueba con los mismos claims lo que sí le funciona; que lo demás no lo pueda ejecutar ya lo
  -- comprueba el paso 9 con has_function_privilege / has_table_privilege, que no necesitan el rol.
  BEGIN
    EXECUTE 'SET LOCAL ROLE colaborador_web';
    v_rol := true;
  EXCEPTION WHEN insufficient_privilege THEN
    v_rol := false;
    RAISE NOTICE 'C10: sin membresía en colaborador_web; lo prohibido queda cubierto por C9';
  END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pers, 'tenant_id', v_t, 'role', 'colaborador_web',
    'tipo_identidad', 'EMPLEADO', 'session_id', gen_random_uuid())::text, true);
  v_j := mi_agenda('2030-01-14', '2030-01-14');
  IF jsonb_array_length(v_j->'tramos') <> 1 THEN RAISE EXCEPTION 'C10: mi_agenda: %', v_j; END IF;
  SELECT count(*) INTO v_n FROM mi_periodo_comisiones('2030-01-14');
  IF v_n <> 1 THEN RAISE EXCEPTION 'C10: mi_periodo_comisiones'; END IF;
  SELECT count(*) INTO v_n FROM mis_comisiones('2030-01-14', '2030-01-20') c WHERE c.usuario_id <> v_pers;
  IF v_n <> 0 THEN RAISE EXCEPTION 'C10: mis_comisiones trae % filas ajenas', v_n; END IF;
  BEGIN
    PERFORM mis_comisiones('2030-01-01', '2030-04-30');
    RAISE EXCEPTION 'C10: mis_comisiones aceptó 120 días';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  IF v_rol THEN FOREACH v_x IN ARRAY ARRAY[
    format('SELECT guardar_cita(%L::jsonb)', jsonb_build_object('sucursal_id', v_suc)),
    format('SELECT cancelar_cita(%L, %L)', gen_random_uuid(), 'x'),
    format('SELECT marcar_no_llego(%L)', gen_random_uuid()),
    format('SELECT aplicar_pago(%L, %L, 1, 1, NULL, NULL, NULL, false, NULL, NULL)', gen_random_uuid(), 'EFECTIVO'),
    'SELECT count(*) FROM citas', 'SELECT count(*) FROM productos', 'SELECT count(*) FROM tickets'] LOOP
    BEGIN
      EXECUTE v_x;
      RAISE EXCEPTION 'C10: colaborador_web pudo: %', v_x;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP; END IF;
  EXECUTE 'RESET ROLE';
END $$;

ROLLBACK;
