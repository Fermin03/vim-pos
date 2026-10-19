-- Smoke belleza, entrega 1 (migraciones 0216–0218): giros, juego inicial con «agenda», bloqueo en
-- cambiar_giro, y la agenda: catálogo, citas sin empalmes y RPC. Sobre la semilla de dev. ROLLBACK.
-- Uso: cd desktop && npm run smokes -- smoke_belleza_agenda.sql
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  g text;
  v_op jsonb;
  v_belleza jsonb := '{"mostrador":true,"comedor":false,"meseros":false,"domicilio":false,"repartidores":false,"kds":false,"reservaciones":false,"marcas":false,"eventos":false,"cuentas_barra":false,"existencias":true,"agenda":true}';
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
BEGIN
  FOREACH g IN ARRAY ARRAY['SALON','SPA','PELUQUERIA','BARBERIA','TATUAJES'] LOOP
    IF juego_inicial_de_giro(g::vertical_tipo) IS DISTINCT FROM v_belleza THEN
      RAISE EXCEPTION '1: juego de % incorrecto: %', g, juego_inicial_de_giro(g::vertical_tipo);
    END IF;
    IF NOT es_giro_belleza(g::vertical_tipo) THEN RAISE EXCEPTION '1: % no es belleza', g; END IF;
    BEGIN
      PERFORM cambiar_giro(v_tenant, g::vertical_tipo, false);
      RAISE EXCEPTION '1: cambiar_giro aceptó %', g;
    EXCEPTION WHEN invalid_parameter_value THEN
      IF SQLERRM NOT LIKE 'GIRO_NO_DISPONIBLE%' THEN RAISE; END IF;
    END;
  END LOOP;

  FOREACH g IN ARRAY ARRAY['QUICK_SERVICE','FULL_SERVICE','RETAIL','VINOS','BAR'] LOOP
    IF (juego_inicial_de_giro(g::vertical_tipo)->>'agenda') IS DISTINCT FROM 'false' THEN
      RAISE EXCEPTION '2: % debe traer agenda false', g;
    END IF;
  END LOOP;
  IF (juego_inicial_de_giro(NULL)->>'agenda') IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION '2: el ELSE debe traer agenda false';
  END IF;
  IF es_giro_belleza('RETAIL') OR es_giro_belleza('QUICK_SERVICE') THEN
    RAISE EXCEPTION '3: es_giro_belleza acepta giros que no son';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'btree_gist') THEN
    RAISE EXCEPTION '4: falta btree_gist';
  END IF;
  SELECT operacion INTO v_op FROM tenants WHERE id = v_tenant;
  IF (v_op->>'agenda') IS DISTINCT FROM 'false' THEN RAISE EXCEPTION '5: el negocio existente debía quedar con agenda false: %', v_op; END IF;
  IF (juego_inicial_de_giro('RETAIL')->>'agenda') IS DISTINCT FROM 'false' THEN RAISE EXCEPTION '5: RETAIL debe traer agenda false'; END IF;
  RAISE NOTICE 'belleza 1 OK';
END $$;

-- ── Agenda (0218) ───────────────────────────────────────────────────────────
-- Corre `q` y exige que truene con un mensaje como `patron`.
CREATE FUNCTION pg_temp.debe_fallar(q text, patron text, paso text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  EXECUTE q;
  RAISE EXCEPTION '%: no falló: %', paso, q USING ERRCODE = 'P0099';
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE = 'P0099' OR SQLERRM NOT LIKE patron THEN RAISE EXCEPTION '%: %', paso, SQLERRM; END IF;
END $f$;

DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';   -- CAJERO; aquí también colaboradora
  v_diego  uuid := '99999999-0000-0000-0000-0000000000f1';   -- SUPERVISOR; colaborador
  v_dueno  uuid := '99999999-0000-0000-0000-0000000000e1';
  v_otro   uuid := '21800000-0000-0000-0000-0000000000aa';
  v_cat    uuid := 'a0000000-0000-0000-0000-0000000000c1';
  v_corte  uuid := '21800000-0000-0000-0000-0000000000a1';   -- 60 min
  v_mani   uuid := '21800000-0000-0000-0000-0000000000a2';   -- 45 min
  v_pedi   uuid := '21800000-0000-0000-0000-0000000000a3';   -- 30 min
  v_facial uuid := '21800000-0000-0000-0000-0000000000a4';   -- 60 min, pide cabina
  v_cli    uuid := '21800000-0000-0000-0000-0000000000c1';
  v_tipo   uuid; v_cabina uuid;
  d        text := '2030-01-07 ';   -- lunes
  tz       text := '-06';
  v_c1 uuid; v_c2 uuid; v_c3 uuid; v_c5 uuid; v_cx uuid; v_esp uuid;
  r record; v_n integer; v_u uuid; v_txt text;
BEGIN
  -- 1) modulos_efectivos publica agenda: QUICK_SERVICE apagado, SALON encendido.
  IF (modulos_efectivos(v_t)->'permitidos'->>'agenda') IS DISTINCT FROM 'true'
     OR (modulos_efectivos(v_t)->'efectivos'->>'agenda') IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'A1: QUICK_SERVICE debía tener agenda permitida y apagada: %', modulos_efectivos(v_t);
  END IF;
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_otro, 'tenant-0218', 'Otro negocio', 'INTERNO', 'QUICK_SERVICE');
  UPDATE tenants SET vertical_principal = 'SALON', operacion = operacion || '{"agenda":true}' WHERE id = v_t;
  IF (modulos_efectivos(v_t)->'efectivos'->>'agenda') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'A1: SALON debía tener agenda encendida'; END IF;
  IF (modulos_efectivos(v_otro)->'efectivos'->>'agenda') IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'A1: el otro negocio no debía tener agenda'; END IF;

  -- Catálogo: 2 colaboradores, 1 cabina, 4 servicios.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  INSERT INTO productos (id, tenant_id, categoria_id, nombre, precio_base_mxn) VALUES
    (v_corte, v_t, v_cat, 'Corte', 250), (v_mani, v_t, v_cat, 'Manicure', 200),
    (v_pedi, v_t, v_cat, 'Pedicure', 220), (v_facial, v_t, v_cat, 'Facial', 500);
  INSERT INTO tipos_espacio (tenant_id, nombre) VALUES (v_t, 'Cabina') RETURNING id INTO v_tipo;
  INSERT INTO espacios (tenant_id, sucursal_id, tipo_espacio_id, nombre) VALUES (v_t, v_suc, v_tipo, 'Cabina 1') RETURNING id INTO v_cabina;
  INSERT INTO servicios_agenda (producto_id, tenant_id, duracion_min, tipo_espacio_id) VALUES
    (v_corte, v_t, 60, NULL), (v_mani, v_t, 45, NULL), (v_pedi, v_t, 30, NULL), (v_facial, v_t, 60, v_tipo);
  INSERT INTO colaboradores_agenda (usuario_id, tenant_id, sucursal_id, color_hex, orden) VALUES
    (v_maria, v_t, v_suc, '#C2410C', 1), (v_diego, v_t, v_suc, '#0F766E', 2);
  INSERT INTO servicio_colaborador (producto_id, usuario_id, tenant_id, precio_mxn) VALUES
    (v_corte, v_maria, v_t, NULL), (v_corte, v_diego, v_t, 300), (v_mani, v_maria, v_t, NULL),
    (v_pedi, v_diego, v_t, NULL), (v_facial, v_maria, v_t, NULL), (v_facial, v_diego, v_t, NULL);
  INSERT INTO horarios_colaborador (tenant_id, usuario_id, dia_semana, inicia, termina, comida_inicia, comida_termina) VALUES
    (v_t, v_maria, 1, '09:00', '18:00', NULL, NULL), (v_t, v_diego, 1, '09:00', '18:00', '13:00', '14:00');
  INSERT INTO clientes (id, tenant_id, nombre, apellido_paterno, telefono) VALUES (v_cli, v_t, 'Lucía', 'Agenda', '4770002180');
  INSERT INTO configuracion_tenant (tenant_id) VALUES (v_t) ON CONFLICT (tenant_id) DO NOTHING;
  IF (SELECT agenda_tolerancia_min FROM configuracion_tenant WHERE tenant_id = v_t) <> 15 THEN
    RAISE EXCEPTION 'A0: la tolerancia debía nacer en 15'; END IF;
  BEGIN
    INSERT INTO servicios_agenda (producto_id, tenant_id, duracion_min) VALUES ('b0000000-0000-0000-0000-0000000000f1', v_otro, 30);
    RAISE EXCEPTION 'A0: el catálogo aceptó un producto de otro negocio';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  -- 2) Cita 10:00–11:00 con María; 10:30 con María choca; 11:00 pasa (solo se tocan).
  v_c1 := guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'Ana', 'inicia', d || '10:00' || tz,
            'canal', 'CAJA', 'client_id_local', 'smk-c1', 'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_corte, 'usuario_id', v_maria))));
  SELECT * INTO r FROM citas WHERE id = v_c1;
  IF r.estado <> 'AGENDADA' OR r.termina <> (d || '11:00' || tz)::timestamptz THEN RAISE EXCEPTION 'A2: cita 1 quedó %', to_jsonb(r); END IF;
  IF guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'Ana', 'inicia', d || '10:00' || tz, 'client_id_local', 'smk-c1',
       'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_corte, 'usuario_id', v_maria)))) <> v_c1 THEN
    RAISE EXCEPTION 'A2: el reintento con el mismo client_id_local creó otra cita'; END IF;
  PERFORM pg_temp.debe_fallar(format($q$SELECT guardar_cita('{"sucursal_id":"%s","cliente_nombre":"Bety","inicia":"%s","servicios":[{"producto_id":"%s","usuario_id":"%s"}]}')$q$,
    v_suc, d || '10:30' || tz, v_corte, v_maria), 'CITA_EMPALMADA: María G. ya tiene cita a esa hora', 'A2 10:30');
  v_c2 := guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'Carla', 'inicia', d || '11:00' || tz,
            'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_corte, 'usuario_id', v_maria))));

  -- 3) Cabina: Facial con María 12:00 toma Cabina 1; Diego a las 12:30 no tiene cabina.
  v_c3 := guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'Dora', 'inicia', d || '12:00' || tz,
            'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_facial, 'usuario_id', v_maria))));
  IF (SELECT espacio_id FROM citas_servicios WHERE cita_id = v_c3) IS DISTINCT FROM v_cabina THEN
    RAISE EXCEPTION 'A3: el facial no tomó la cabina'; END IF;
  PERFORM pg_temp.debe_fallar(format($q$SELECT guardar_cita('{"sucursal_id":"%s","cliente_nombre":"Eva","inicia":"%s","servicios":[{"producto_id":"%s","usuario_id":"%s"}]}')$q$,
    v_suc, d || '12:30' || tz, v_facial, v_diego), 'CITA_EMPALMADA: no hay cabina libre a esa hora', 'A3 sin cabina');
  PERFORM pg_temp.debe_fallar(format($q$SELECT guardar_cita('{"sucursal_id":"%s","cliente_nombre":"Eva","inicia":"%s","servicios":[{"producto_id":"%s","usuario_id":"%s","espacio_id":"%s"}]}')$q$,
    v_suc, d || '12:30' || tz, v_facial, v_diego, v_cabina), 'CITA_EMPALMADA: Cabina 1 ya está ocupado a esa hora', 'A3 cabina elegida');

  -- 4) Cancelar libera el tramo (colaborador y cabina).
  PERFORM cancelar_cita(v_c3, 'Se enfermó');
  IF (SELECT activa FROM citas_servicios WHERE cita_id = v_c3) THEN RAISE EXCEPTION 'A4: la cancelada sigue activa'; END IF;
  PERFORM guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'Eva', 'inicia', d || '12:30' || tz,
            'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_facial, 'usuario_id', v_diego))));
  PERFORM pg_temp.debe_fallar(format('SELECT cancelar_cita(%L, NULL)', v_c3), 'DATOS_INVALIDOS:%', 'A4 recancelar');

  -- 5) Varios servicios se encadenan: manicure 45 (María) + pedicure 30 (Diego) desde 15:00.
  v_c5 := guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_id', v_cli, 'inicia', d || '15:00' || tz,
            'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_mani, 'usuario_id', v_maria),
                                           jsonb_build_object('producto_id', v_pedi, 'usuario_id', v_diego))));
  SELECT string_agg(format('%s %s-%s', orden, to_char(inicia AT TIME ZONE 'America/Mexico_City', 'HH24:MI'),
                           to_char(termina AT TIME ZONE 'America/Mexico_City', 'HH24:MI')), ',' ORDER BY orden) INTO v_txt
    FROM citas_servicios WHERE cita_id = v_c5;
  IF v_txt <> '1 15:00-15:45,2 15:45-16:15' THEN RAISE EXCEPTION 'A5: tramos %', v_txt; END IF;
  IF (SELECT cliente_nombre FROM citas WHERE id = v_c5) <> 'Lucía'
     OR (SELECT termina FROM citas WHERE id = v_c5) <> (d || '16:15' || tz)::timestamptz THEN
    RAISE EXCEPTION 'A5: la cita no tomó el nombre del cliente o no termina 16:15'; END IF;

  -- 6) «Quien esté libre». Ese día María lleva 3 citas (c1, c2, c5) y Diego 2 (la de 12:30 y c5).
  --    13:15: Diego tiene menos pero está comiendo → María.
  v_cx := guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'F', 'inicia', d || '13:15' || tz,
            'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_corte, 'usuario_id', NULL))));
  IF (SELECT usuario_id FROM citas_servicios WHERE cita_id = v_cx) <> v_maria THEN RAISE EXCEPTION 'A6: en la comida de Diego debía tocar María'; END IF;
  --    16:30: el de menos citas (Diego 2, María 4), con su precio propio.
  v_cx := guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'G', 'inicia', d || '16:30' || tz,
            'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_corte))));
  SELECT usuario_id, precio_mxn INTO r FROM citas_servicios WHERE cita_id = v_cx;
  IF r.usuario_id <> v_diego OR r.precio_mxn <> 300 THEN RAISE EXCEPTION 'A6: a las 16:30 debía tocar Diego a $300: %', to_jsonb(r); END IF;
  --    Fuera de horario, nadie.
  PERFORM pg_temp.debe_fallar(format($q$SELECT guardar_cita('{"sucursal_id":"%s","cliente_nombre":"H","inicia":"%s","servicios":[{"producto_id":"%s"}]}')$q$,
    v_suc, d || '19:00' || tz, v_corte), 'CITA_EMPALMADA: no hay quien esté libre a esa hora', 'A6 fuera de horario');
  --    Diego ausente ese día: aunque tenga menos citas, toca María; con los dos ausentes, nadie.
  INSERT INTO ausencias_colaborador (tenant_id, usuario_id, desde, hasta, motivo) VALUES (v_t, v_diego, '2030-01-07', '2030-01-07', 'Vacaciones');
  v_u := colaborador_libre(v_suc, v_corte, (d || '17:00' || tz)::timestamptz, (d || '18:00' || tz)::timestamptz);
  IF v_u IS DISTINCT FROM v_maria THEN RAISE EXCEPTION 'A6: con Diego ausente debía tocar María, tocó %', v_u; END IF;
  INSERT INTO ausencias_colaborador (tenant_id, usuario_id, desde, hasta) VALUES (v_t, v_maria, '2030-01-06', '2030-01-08');
  IF colaborador_libre(v_suc, v_corte, (d || '17:00' || tz)::timestamptz, (d || '18:00' || tz)::timestamptz) IS NOT NULL THEN
    RAISE EXCEPTION 'A6: con los dos ausentes no debía haber nadie'; END IF;
  --    El día es el de México: una ausencia el día 8 no tapa el 7 a las 17:00 local (23:00 UTC).
  DELETE FROM ausencias_colaborador WHERE usuario_id = v_maria;
  INSERT INTO ausencias_colaborador (tenant_id, usuario_id, desde, hasta) VALUES (v_t, v_maria, '2030-01-08', '2030-01-08');
  IF colaborador_libre(v_suc, v_corte, (d || '17:00' || tz)::timestamptz, (d || '18:00' || tz)::timestamptz) IS DISTINCT FROM v_maria THEN
    RAISE EXCEPTION 'A6: la ausencia del día 8 tapó el día 7'; END IF;

  -- 7) «No llegó»: antes de la hora se rechaza; pasada, cuenta como falta y libera el tramo.
  PERFORM pg_temp.debe_fallar(format('SELECT marcar_no_llego(%L)', v_c1), 'DATOS_INVALIDOS: la cita todavía no empieza', 'A7 antes');
  v_cx := guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_id', v_cli, 'inicia', date_trunc('hour', now()) - interval '3 hours',
            'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_corte, 'usuario_id', v_maria))));
  PERFORM marcar_no_llego(v_cx);
  IF faltas_cliente(v_cli) <> 1 THEN RAISE EXCEPTION 'A7: faltas %', faltas_cliente(v_cli); END IF;
  PERFORM guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'I', 'inicia', date_trunc('hour', now()) - interval '3 hours',
            'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_corte, 'usuario_id', v_maria))));

  -- 8) Espera → atender: el tramo empieza ahora; luego terminar.
  v_esp := agregar_en_espera(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'Juan', 'client_id_local', 'smk-esp',
             'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_corte, 'usuario_id', v_diego))));
  SELECT * INTO r FROM citas WHERE id = v_esp;
  IF r.estado <> 'EN_ESPERA' OR r.canal <> 'SIN_CITA' OR r.inicia IS NOT NULL OR r.llego_at IS NULL THEN
    RAISE EXCEPTION 'A8: la espera quedó %', to_jsonb(r); END IF;
  IF (SELECT activa FROM citas_servicios WHERE cita_id = v_esp) THEN RAISE EXCEPTION 'A8: la espera ocupa tramo'; END IF;
  PERFORM atender_cita(v_esp);
  SELECT c.estado, cs.inicia, cs.termina, cs.activa INTO r FROM citas c JOIN citas_servicios cs ON cs.cita_id = c.id WHERE c.id = v_esp;
  IF r.estado <> 'EN_CURSO' OR r.inicia <> now() OR r.termina <> now() + interval '60 minutes' OR NOT r.activa THEN
    RAISE EXCEPTION 'A8: al atender quedó %', to_jsonb(r); END IF;
  PERFORM terminar_cita(v_esp);
  IF (SELECT estado FROM citas WHERE id = v_esp) <> 'TERMINADA' THEN RAISE EXCEPTION 'A8: no terminó'; END IF;
  PERFORM pg_temp.debe_fallar(format('SELECT terminar_cita(%L)', v_esp), 'DATOS_INVALIDOS:%', 'A8 reterminar');

  -- 9) resolver_empalme: sin choque quita la marca; con choque, CITA_EMPALMADA.
  UPDATE citas SET empalme = true WHERE id = v_c2;
  UPDATE citas_servicios SET empalme = true WHERE cita_id = v_c2;
  PERFORM resolver_empalme(v_c2);
  IF (SELECT empalme FROM citas WHERE id = v_c2) OR (SELECT empalme FROM citas_servicios WHERE cita_id = v_c2) THEN
    RAISE EXCEPTION 'A9: el empalme no se resolvió'; END IF;
  UPDATE citas SET empalme = true WHERE id = v_c2;
  UPDATE citas_servicios SET empalme = true WHERE cita_id = v_c2;
  PERFORM guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'K', 'inicia', d || '11:30' || tz,
            'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_corte, 'usuario_id', v_maria))));
  PERFORM pg_temp.debe_fallar(format('SELECT resolver_empalme(%L)', v_c2), 'CITA_EMPALMADA: María G. ya tiene cita a esa hora', 'A9 con choque');

  -- 10) RLS: el cajero lee el catálogo pero no lo escribe, ni cambia la tolerancia; sí agenda por RPC.
  --     El dueño escribe. Otro negocio no lee citas. anon no toca nada.
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_n FROM servicios_agenda;
  IF v_n <> 4 THEN RAISE EXCEPTION 'A10: el cajero ve % servicios', v_n; END IF;
  PERFORM pg_temp.debe_fallar(format('INSERT INTO tipos_espacio (tenant_id, nombre) VALUES (%L, %L)', v_t, 'Sillón'), '%row-level security%', 'A10 cajero catálogo');
  PERFORM pg_temp.debe_fallar(format('UPDATE configuracion_tenant SET agenda_tolerancia_min = 30 WHERE tenant_id = %L', v_t), 'Solo el dueño%', 'A10 cajero tolerancia');
  PERFORM pg_temp.debe_fallar(format('INSERT INTO citas (tenant_id, sucursal_id, cliente_nombre, inicia, termina) VALUES (%L, %L, %L, now(), now() + interval %L)', v_t, v_suc, 'X', '1 hour'),
    'permission denied%', 'A10 cita directa');
  PERFORM guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'L', 'inicia', d || '09:00' || tz,
            'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_corte, 'usuario_id', v_diego))));
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  INSERT INTO tipos_espacio (tenant_id, nombre) VALUES (v_t, 'Sillón');
  UPDATE configuracion_tenant SET agenda_tolerancia_min = 30 WHERE tenant_id = v_t;
  PERFORM pg_temp.debe_fallar(format('INSERT INTO tipos_espacio (tenant_id, nombre) VALUES (%L, %L)', v_otro, 'Ajeno'),
    '%row-level security%', 'A10 dueño en otro negocio');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno, 'role', 'authenticated', 'tenant_id', v_otro)::text, true);
  SELECT count(*) INTO v_n FROM citas;
  IF v_n <> 0 THEN RAISE EXCEPTION 'A10: otro negocio lee % citas', v_n; END IF;
  SELECT count(*) INTO v_n FROM citas_servicios;
  IF v_n <> 0 THEN RAISE EXCEPTION 'A10: otro negocio lee % tramos', v_n; END IF;
  PERFORM pg_temp.debe_fallar(format('SELECT cancelar_cita(%L, NULL)', v_c2), 'DATOS_INVALIDOS:%', 'A10 cancelar ajena');
  PERFORM pg_temp.debe_fallar(format($q$SELECT guardar_cita('{"sucursal_id":"%s","cliente_nombre":"M","inicia":"%s","servicios":[]}')$q$, v_suc, d || '09:00' || tz),
    'DATOS_INVALIDOS: la agenda no está encendida%', 'A10 sin agenda');
  EXECUTE 'RESET ROLE';
  SELECT string_agg(format('%s %s', t, p), ', ') INTO v_txt
    FROM unnest(ARRAY['citas', 'citas_servicios', 'servicios_agenda', 'servicio_colaborador', 'colaboradores_agenda',
                      'horarios_colaborador', 'ausencias_colaborador', 'tipos_espacio', 'espacios']) t,
         unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
   WHERE has_table_privilege('anon', t, p);
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'A10: anon puede %', v_txt; END IF;
  SELECT string_agg(f, ', ') INTO v_txt
    FROM unnest(ARRAY['guardar_cita(jsonb)', 'agregar_en_espera(jsonb)', 'atender_cita(uuid, jsonb)', 'terminar_cita(uuid)',
                      'marcar_no_llego(uuid)', 'cancelar_cita(uuid, text)', 'resolver_empalme(uuid)', 'faltas_cliente(uuid)',
                      'colaborador_libre(uuid, uuid, timestamptz, timestamptz)', '_agenda_tramos(uuid, uuid, uuid, timestamptz, jsonb)']) f
   WHERE has_function_privilege('anon', f, 'execute');
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'A10: anon ejecuta %', v_txt; END IF;
  IF has_function_privilege('authenticated', '_agenda_tramos(uuid, uuid, uuid, timestamptz, jsonb)', 'execute') THEN
    RAISE EXCEPTION 'A10: authenticated ejecuta la función interna'; END IF;

  RAISE NOTICE 'belleza agenda OK';
END $$;

ROLLBACK;
