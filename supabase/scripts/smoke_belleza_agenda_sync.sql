-- Smoke: la agenda viaja con la caja instalada (belleza, entrega 1; 0219). Hace ROLLBACK.
-- Ejecutar: cd desktop && npm run smokes -- smoke_belleza_agenda_sync.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_diego  uuid := '99999999-0000-0000-0000-0000000000f1';
  v_cat    uuid := 'a0000000-0000-0000-0000-0000000000c1';
  v_otro   uuid := '21900000-0000-0000-0000-0000000000aa';
  v_corte  uuid := '21900000-0000-0000-0000-0000000000a1';
  d        text := '2030-01-07 ';   -- lunes
  tz       text := '-06';
  v_a uuid; v_b uuid; v_ajena uuid := gen_random_uuid();
  v_cita jsonb; v_serv jsonb; v_res jsonb; v_pull jsonb;
  v_prod_ajeno uuid := gen_random_uuid(); v_esp_ajeno uuid := gen_random_uuid(); v_x4 uuid := gen_random_uuid(); v_x7 uuid := gen_random_uuid();
  v_hoy date := (now() AT TIME ZONE 'America/Mexico_City')::date;
BEGIN
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_otro, 'tenant-0219', 'Otro negocio 0219', 'INTERNO', 'QUICK_SERVICE');
  UPDATE tenants SET vertical_principal = 'SALON', operacion = operacion || '{"agenda":true}' WHERE id = v_t;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  INSERT INTO productos (id, tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_corte, v_t, v_cat, 'Corte sync', 250);
  INSERT INTO servicios_agenda (producto_id, tenant_id, duracion_min) VALUES (v_corte, v_t, 60);
  INSERT INTO colaboradores_agenda (usuario_id, tenant_id, sucursal_id, color_hex, orden) VALUES
    (v_maria, v_t, v_suc, '#C2410C', 1), (v_diego, v_t, v_suc, '#0F766E', 2);
  INSERT INTO servicio_colaborador (producto_id, usuario_id, tenant_id) VALUES (v_corte, v_maria, v_t), (v_corte, v_diego, v_t);

  -- Lo que la caja manda: una cita con María 10:30–11:30 hecha con la RPC, tal como to_jsonb la deja.
  -- Se borra aquí para que la «nube» no la tenga; luego la nube agenda a María 10:00–11:00.
  v_a := guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'Caja sin internet', 'inicia', d || '10:30' || tz,
           'client_id_local', 'smk-sync-a', 'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_corte, 'usuario_id', v_maria))));
  SELECT to_jsonb(c) INTO v_cita FROM citas c WHERE id = v_a;
  SELECT jsonb_agg(to_jsonb(s)) INTO v_serv FROM citas_servicios s WHERE cita_id = v_a;
  DELETE FROM citas WHERE id = v_a;
  v_b := guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'En línea', 'inicia', d || '10:00' || tz,
           'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_corte, 'usuario_id', v_maria))));

  -- 1) Choca: entra igual, las dos quedan con empalme y ninguna se borra.
  v_res := sync_push_snapshot(v_t, jsonb_build_object('citas', jsonb_build_array(v_cita), 'citas_servicios', v_serv));
  IF (v_res->>'citas')::int IS DISTINCT FROM 1 OR (v_res->>'citas_servicios')::int IS DISTINCT FROM 1
     OR v_res ? '_errores' OR v_res ? '_ignoradas' THEN
    RAISE EXCEPTION '1: la cita y su tramo debían aplicarse: %', v_res; END IF;
  IF NOT (SELECT empalme FROM citas WHERE id = v_a) OR NOT (SELECT empalme FROM citas WHERE id = v_b) THEN
    RAISE EXCEPTION '1: las dos citas debían quedar con empalme'; END IF;
  IF EXISTS (SELECT 1 FROM citas_servicios WHERE cita_id IN (v_a, v_b) AND NOT (empalme AND activa)) THEN
    RAISE EXCEPTION '1: los dos tramos debían quedar activos y con empalme'; END IF;
  IF (SELECT count(*) FROM citas WHERE id IN (v_a, v_b) AND estado = 'AGENDADA') <> 2 THEN
    RAISE EXCEPTION '1: ninguna debía cancelarse'; END IF;

  -- 2) Un push repetido no duplica ni le quita la marca a la entrante.
  v_res := sync_push_snapshot(v_t, jsonb_build_object('citas', jsonb_build_array(v_cita), 'citas_servicios', v_serv));
  IF v_res ? '_errores' THEN RAISE EXCEPTION '2: el reenvío no debía fallar: %', v_res; END IF;
  IF (SELECT count(*) FROM citas WHERE tenant_id = v_t AND client_id_local = 'smk-sync-a') <> 1
     OR (SELECT count(*) FROM citas_servicios WHERE cita_id = v_a) <> 1 THEN
    RAISE EXCEPTION '2: se duplicó'; END IF;
  IF NOT (SELECT empalme FROM citas WHERE id = v_a) OR NOT (SELECT empalme FROM citas_servicios WHERE cita_id = v_a) THEN
    RAISE EXCEPTION '2: el reenvío le quitó la marca a la cita de la caja'; END IF;

  -- 2b) resolver_empalme no quita la marca mientras siga chocando (aunque la otra también esté marcada).
  BEGIN
    PERFORM resolver_empalme(v_a);
    RAISE EXCEPTION '2b: resolver_empalme quitó una marca que sigue chocando' USING ERRCODE = 'P0099';
  EXCEPTION WHEN exclusion_violation THEN
    IF SQLERRM NOT LIKE 'CITA_EMPALMADA:%' THEN RAISE; END IF;
  END;

  -- 3) Lo de otro negocio se rechaza y no entra. Una cita entra con todos sus tramos o no entra.
  SET LOCAL session_replication_role = replica;
  INSERT INTO citas (id, tenant_id, sucursal_id, cliente_nombre, estado, inicia, termina)
  VALUES (v_ajena, v_otro, v_suc, 'Ajena', 'AGENDADA', now(), now() + interval '1 hour');
  INSERT INTO productos (id, tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_prod_ajeno, v_otro, v_cat, 'Ajeno', 1);
  INSERT INTO espacios (id, tenant_id, sucursal_id, tipo_espacio_id, nombre) VALUES (v_esp_ajeno, v_otro, v_suc, gen_random_uuid(), 'Cabina ajena');
  SET LOCAL session_replication_role = origin;
  v_res := sync_push_snapshot(v_t, jsonb_build_object(
    'citas', jsonb_build_array(v_cita,
      v_cita || jsonb_build_object('id', gen_random_uuid(), 'client_id_local', 'x1', 'tenant_id', v_otro),
      v_cita || jsonb_build_object('id', v_ajena, 'client_id_local', 'x2'),
      v_cita || jsonb_build_object('id', gen_random_uuid(), 'client_id_local', 'x3', 'sucursal_id', gen_random_uuid()),
      v_cita || jsonb_build_object('id', v_x4, 'client_id_local', 'x4')),
    'citas_servicios', jsonb_build_array(v_serv->0,
      v_serv->0 || jsonb_build_object('id', gen_random_uuid(), 'cita_id', gen_random_uuid()),
      -- x4: el primer tramo es bueno; el segundo trae un producto de otro negocio.
      v_serv->0 || jsonb_build_object('id', gen_random_uuid(), 'cita_id', v_x4, 'orden', 1, 'usuario_id', v_diego),
      v_serv->0 || jsonb_build_object('id', gen_random_uuid(), 'cita_id', v_x4, 'orden', 2, 'usuario_id', v_diego, 'producto_id', v_prod_ajeno))));
  IF (v_res->>'citas')::int IS DISTINCT FROM 1 OR (v_res->>'citas_servicios')::int IS DISTINCT FROM 1
     OR jsonb_array_length(COALESCE(v_res->'_errores', '[]')) <> 5 THEN
    RAISE EXCEPTION '3: solo la cita de la caja debía entrar (5 errores): %', v_res; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_res->'_errores') e WHERE e->>'id' = v_x4::text AND e->>'error' LIKE '%producto de otro negocio') THEN
    RAISE EXCEPTION '3: el producto ajeno debía tumbar la cita entera: %', v_res; END IF;
  IF (SELECT cliente_nombre FROM citas WHERE id = v_ajena) <> 'Ajena' OR EXISTS (SELECT 1 FROM citas WHERE client_id_local IN ('x1', 'x3', 'x4'))
     OR EXISTS (SELECT 1 FROM citas_servicios WHERE cita_id = v_x4) THEN
    RAISE EXCEPTION '3: entró o se pisó algo de otro negocio, o x4 quedó a medias'; END IF;
  IF (SELECT count(*) FROM citas_servicios WHERE cita_id = v_a) <> 1 THEN
    RAISE EXCEPTION '3: un tramo ajeno se coló en la cita'; END IF;
  -- Espacio o colaborador ajeno: también tumban su cita.
  v_res := sync_push_snapshot(v_t, jsonb_build_object(
    'citas', jsonb_build_array(v_cita || jsonb_build_object('id', v_x4, 'client_id_local', 'x4')),
    'citas_servicios', jsonb_build_array(v_serv->0 || jsonb_build_object('id', gen_random_uuid(), 'cita_id', v_x4, 'usuario_id', v_diego, 'espacio_id', v_esp_ajeno))));
  IF (v_res->>'citas')::int IS DISTINCT FROM 0 OR (v_res->'_errores'->0->>'error') NOT LIKE '%espacio de otro negocio' THEN
    RAISE EXCEPTION '3: el espacio ajeno debía rechazarse: %', v_res; END IF;
  v_res := sync_push_snapshot(v_t, jsonb_build_object(
    'citas', jsonb_build_array(v_cita || jsonb_build_object('id', v_x4, 'client_id_local', 'x4')),
    'citas_servicios', jsonb_build_array(v_serv->0 || jsonb_build_object('id', gen_random_uuid(), 'cita_id', v_x4, 'usuario_id', gen_random_uuid()))));
  IF (v_res->>'citas')::int IS DISTINCT FROM 0 OR (v_res->'_errores'->0->>'error') NOT LIKE '%colaborador de otro negocio' THEN
    RAISE EXCEPTION '3: el colaborador ajeno debía rechazarse: %', v_res; END IF;
  -- created_by sin acceso al negocio queda en NULL; el de María se conserva.
  v_res := sync_push_snapshot(v_t, jsonb_build_object(
    'citas', jsonb_build_array(v_cita || jsonb_build_object('id', v_x7, 'client_id_local', 'x7', 'created_by', gen_random_uuid())),
    'citas_servicios', jsonb_build_array(v_serv->0 || jsonb_build_object('id', gen_random_uuid(), 'cita_id', v_x7, 'usuario_id', v_diego))));
  IF (v_res->>'citas')::int IS DISTINCT FROM 1 OR (SELECT created_by FROM citas WHERE id = v_x7) IS NOT NULL
     OR (SELECT created_by FROM citas WHERE id = v_a) IS DISTINCT FROM v_maria THEN
    RAISE EXCEPTION '3: created_by mal: %', v_res; END IF;
  -- El catálogo no se acepta desde la caja.
  v_res := sync_push_snapshot(v_t, jsonb_build_object('espacios', '[]'::jsonb));
  IF NOT (v_res->'_ignoradas') ? 'espacios' THEN RAISE EXCEPTION '3: el catálogo debía ignorarse: %', v_res; END IF;

  -- 4) Mover una de las dos y resolver la otra: la marca se limpia.
  PERFORM guardar_cita(jsonb_build_object('id', v_b, 'sucursal_id', v_suc, 'cliente_nombre', 'En línea', 'inicia', d || '12:00' || tz,
            'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_corte, 'usuario_id', v_maria))));
  IF (SELECT empalme FROM citas WHERE id = v_b) THEN RAISE EXCEPTION '4: la cita movida debía quedar sin empalme'; END IF;
  PERFORM resolver_empalme(v_a);
  IF (SELECT empalme FROM citas WHERE id = v_a) OR EXISTS (SELECT 1 FROM citas_servicios WHERE cita_id = v_a AND empalme) THEN
    RAISE EXCEPTION '4: resolver_empalme no limpió la cita de la caja'; END IF;
  -- 4b) La copia de la caja que aún dice «empalme» no lo levanta: la marca la decide la nube.
  v_res := sync_push_snapshot(v_t, jsonb_build_object('citas', jsonb_build_array(v_cita || '{"empalme": true}'::jsonb),
             'citas_servicios', jsonb_build_array(v_serv->0 || '{"empalme": true}'::jsonb)));
  IF (v_res->>'citas')::int IS DISTINCT FROM 1 OR (SELECT empalme FROM citas WHERE id = v_a)
     OR EXISTS (SELECT 1 FROM citas_servicios WHERE cita_id = v_a AND empalme) THEN
    RAISE EXCEPTION '4b: la copia de la caja volvió a marcar una cita resuelta: %', v_res; END IF;

  -- 5) Una cita cerrada en la nube no vuelve a «Por llegar» con la copia de la caja.
  PERFORM cancelar_cita(v_a, 'Llamó');
  v_res := sync_push_snapshot(v_t, jsonb_build_object('citas', jsonb_build_array(v_cita), 'citas_servicios', v_serv));
  IF (v_res->>'citas')::int IS DISTINCT FROM 0 OR v_res ? '_errores' THEN RAISE EXCEPTION '5: la copia vieja debía ignorarse: %', v_res; END IF;
  IF (SELECT estado FROM citas WHERE id = v_a) <> 'CANCELADA' THEN RAISE EXCEPTION '5: la cancelada se reabrió'; END IF;

  -- 6) El pull baja el catálogo y las citas con sus tramos; una cita de hace un mes, no.
  INSERT INTO citas (tenant_id, sucursal_id, cliente_nombre, estado, inicia, termina, client_id_local)
  VALUES (v_t, v_suc, 'Vieja', 'TERMINADA', now() - interval '30 days', now() - interval '30 days' + interval '1 hour', 'smk-vieja');
  INSERT INTO citas (tenant_id, sucursal_id, cliente_nombre, estado, canal, llego_at, client_id_local, created_at)
  VALUES (v_t, v_suc, 'Espera vieja', 'EN_ESPERA', 'SIN_CITA', now() - interval '30 days', 'smk-espera', now() - interval '30 days');
  INSERT INTO ausencias_colaborador (tenant_id, usuario_id, desde, hasta, motivo) VALUES
    (v_t, v_diego, v_hoy - 5, v_hoy - 1, 'smk-pasada'), (v_t, v_diego, v_hoy - 2, v_hoy, 'smk-hoy');
  v_pull := sync_pull_snapshot(v_t);
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_pull->'citas') x WHERE x->>'client_id_local' = 'smk-espera') THEN
    RAISE EXCEPTION '6: la espera de hace un mes debía bajar'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_pull->'ausencias_colaborador') x WHERE x->>'motivo' = 'smk-pasada')
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_pull->'ausencias_colaborador') x WHERE x->>'motivo' = 'smk-hoy') THEN
    RAISE EXCEPTION '6: las ausencias se filtran por hasta >= hoy: %', v_pull->'ausencias_colaborador'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_pull->'citas') x WHERE x->>'id' = v_b::text)
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_pull->'citas_servicios') x WHERE x->>'cita_id' = v_b::text AND x ? 'activa')
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_pull->'citas') x WHERE x->>'client_id_local' = 'smk-vieja')
     OR jsonb_array_length(v_pull->'colaboradores_agenda') < 2 OR jsonb_array_length(v_pull->'servicios_agenda') < 1
     OR NOT (v_pull ? 'tipos_espacio' AND v_pull ? 'espacios' AND v_pull ? 'servicio_colaborador'
             AND v_pull ? 'horarios_colaborador' AND v_pull ? 'ausencias_colaborador' AND v_pull ? 'tenants') THEN
    RAISE EXCEPTION '6: el pull no trae lo de la agenda: %', jsonb_pretty(v_pull - 'users' - 'permisos' - 'rol_permisos'); END IF;
  RAISE NOTICE 'SMOKE AGENDA SYNC 0219 OK';
END $$;
ROLLBACK;
