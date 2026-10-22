-- Smoke belleza, entrega 4 (migración 0227): agenda del colaborador en su celular y reportes. ROLLBACK.
-- Uso: cd desktop && npm run smokes -- smoke_belleza_celular.sql
\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.debe_fallar(q text, patron text, paso text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  EXECUTE q;
  RAISE EXCEPTION '%: no falló: %', paso, q USING ERRCODE = 'P0099';
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE = 'P0099' OR SQLERRM NOT LIKE patron THEN RAISE EXCEPTION '%: %', paso, SQLERRM; END IF;
END $f$;

-- Sesión de un usuario del negocio (como el JWT de PostgREST).
CREATE FUNCTION pg_temp.como(p_usuario uuid, p_tenant uuid) RETURNS void LANGUAGE sql AS $f$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_usuario, 'tenant_id', p_tenant, 'role', 'authenticated')::text, true)
$f$;

DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';   -- CAJERO; colaboradora
  v_diego  uuid := '99999999-0000-0000-0000-0000000000f1';   -- SUPERVISOR; colaborador
  v_dueno  uuid := '99999999-0000-0000-0000-0000000000e1';
  v_otro   uuid := '22700000-0000-0000-0000-0000000000aa';
  v_cat    uuid := 'a0000000-0000-0000-0000-0000000000c1';
  v_corte  uuid := '22700000-0000-0000-0000-0000000000a1';   -- 60 min
  v_tinte  uuid := '22700000-0000-0000-0000-0000000000a2';   -- 90 min
  v_largo  uuid := '22700000-0000-0000-0000-0000000000a3';   -- 600 min
  v_c1 uuid; v_c2 uuid; v_c3 uuid; v_c4 uuid; v_c5 uuid; v_c6 uuid; v_c7 uuid;
  v_j jsonb; v_x text; r record; v_n integer;
BEGIN
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_otro, 'tenant-0227', 'Otro negocio', 'INTERNO', 'QUICK_SERVICE');
  UPDATE tenants SET vertical_principal = 'SALON', operacion = operacion || '{"agenda":true}' WHERE id = v_t;
  INSERT INTO productos (id, tenant_id, categoria_id, nombre, precio_base_mxn, tasa_iva, iva_incluido_en_precio) VALUES
    (v_corte, v_t, v_cat, 'Corte', 180, 16, true), (v_tinte, v_t, v_cat, 'Tinte', 500, 16, true),
    (v_largo, v_t, v_cat, 'Tatuaje grande', 3000, 16, true);
  INSERT INTO servicios_agenda (producto_id, tenant_id, duracion_min) VALUES
    (v_corte, v_t, 60), (v_tinte, v_t, 90), (v_largo, v_t, 600);
  INSERT INTO colaboradores_agenda (usuario_id, tenant_id, sucursal_id, color_hex) VALUES
    (v_maria, v_t, v_suc, '#C2410C'), (v_diego, v_t, v_suc, '#0F766E');
  INSERT INTO servicio_colaborador (producto_id, usuario_id, tenant_id) VALUES
    (v_corte, v_diego, v_t), (v_tinte, v_diego, v_t), (v_largo, v_diego, v_t), (v_corte, v_maria, v_t);

  -- 0) anon no ejecuta nada; authenticated sí.
  SELECT count(*) INTO v_n FROM pg_proc p
   WHERE p.proname IN ('mi_agenda', 'mi_cita_empezar', 'mi_cita_terminar', 'agenda_reporte_citas', 'agenda_ocupacion')
     AND p.pronamespace = 'public'::regnamespace
     AND has_function_privilege('authenticated', p.oid, 'execute')
     AND NOT has_function_privilege('anon', p.oid, 'execute')
     AND p.prosecdef;
  IF v_n <> 5 THEN RAISE EXCEPTION 'C0: permisos o SECURITY DEFINER mal (% de 5)', v_n; END IF;

  -- Citas (enero de 2030; el 7 es lunes). Como el dueño, con la RPC de la caja.
  PERFORM pg_temp.como(v_dueno, v_t);
  v_c1 := guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'Camila',
            'cliente_telefono', '4779990001', 'cliente_email', 'camila@ejemplo.mx',
            'nota', repeat('n', 100), 'inicia', '2030-01-14 10:00-06',
            'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_corte, 'usuario_id', v_diego))));
  v_c2 := guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'Bety', 'canal', 'EN_LINEA',
            'inicia', '2030-01-14 12:00-06',
            'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_corte, 'usuario_id', v_diego))));
  v_c3 := guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'Dora', 'inicia', '2030-01-14 13:00-06',
            'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_corte, 'usuario_id', v_diego))));
  v_c4 := guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'Eva', 'inicia', '2030-01-14 15:00-06',
            'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_corte, 'usuario_id', v_diego))));
  v_c5 := guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'Fer', 'canal', 'EN_LINEA',
            'inicia', '2030-01-14 16:00-06',
            'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_corte, 'usuario_id', v_diego))));
  v_c6 := guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'Gaby', 'inicia', '2030-01-15 10:00-06',
            'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_corte, 'usuario_id', v_maria))));
  -- Dos colaboradores: María corta y luego Diego tiñe (el último tramo es de Diego).
  v_c7 := guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'Hilda', 'inicia', '2030-01-15 12:00-06',
            'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_corte, 'usuario_id', v_maria),
                                           jsonb_build_object('producto_id', v_tinte, 'usuario_id', v_diego))));

  -- 1) Diego ve lo suyo, sin teléfono ni correo, con la nota recortada a 80.
  PERFORM pg_temp.como(v_diego, v_t);
  v_j := mi_agenda('2030-01-14', '2030-01-20');
  IF jsonb_array_length(v_j->'tramos') <> 6 THEN RAISE EXCEPTION 'C1: Diego debía ver 6 tramos: %', v_j; END IF;
  IF v_j::text LIKE '%4779990001%' OR v_j::text LIKE '%camila@%' OR v_j::text LIKE '%telefono%' OR v_j::text LIKE '%email%' THEN
    RAISE EXCEPTION 'C1: mi_agenda expone datos de contacto: %', v_j; END IF;
  SELECT t INTO v_j FROM jsonb_array_elements(v_j->'tramos') t WHERE t->'cita'->>'id' = v_c1::text;
  IF length(v_j->'cita'->>'nota') <> 80 OR v_j->>'servicio' <> 'Corte' OR v_j->>'dia' <> '2030-01-14'
     OR v_j->'cita'->>'cliente_nombre' <> 'Camila' OR (v_j->>'ultimo')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'C1: tramo de Camila mal: %', v_j; END IF;
  SELECT t INTO v_j FROM jsonb_array_elements(mi_agenda('2030-01-15', '2030-01-15')->'tramos') t;
  IF v_j->>'servicio' <> 'Tinte' OR (v_j->>'ultimo')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'C1: Diego en la cita compartida debía ver solo su tinte: %', v_j; END IF;
  PERFORM pg_temp.debe_fallar($q$SELECT mi_agenda('2030-01-01', '2030-01-15')$q$, 'DATOS_INVALIDOS:%', 'C1 más de 14 días');
  PERFORM pg_temp.debe_fallar($q$SELECT mi_agenda('2030-01-15', '2030-01-14')$q$, 'DATOS_INVALIDOS:%', 'C1 rango al revés');

  -- 2) María ve solo lo suyo: su cita y su corte de la compartida, nada de Diego.
  PERFORM pg_temp.como(v_maria, v_t);
  v_j := mi_agenda('2030-01-14', '2030-01-20');
  IF jsonb_array_length(v_j->'tramos') <> 2
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_j->'tramos') t WHERE t->>'servicio' <> 'Corte' OR t->'cita'->>'id' NOT IN (v_c6::text, v_c7::text)) THEN
    RAISE EXCEPTION 'C2: María ve de más: %', v_j; END IF;
  IF (SELECT bool_or((t->>'ultimo')::boolean) FROM jsonb_array_elements(v_j->'tramos') t WHERE t->'cita'->>'id' = v_c7::text) THEN
    RAISE EXCEPTION 'C2: el corte de María no es el último tramo'; END IF;

  -- 3) El dueño (no es colaborador), otro negocio y un colaborador inactivo: SIN_AGENDA.
  PERFORM pg_temp.como(v_dueno, v_t);
  PERFORM pg_temp.debe_fallar($q$SELECT mi_agenda('2030-01-14', '2030-01-14')$q$, 'SIN_AGENDA: Esta cuenta no tiene agenda.', 'C3 dueño');
  PERFORM pg_temp.como(v_diego, v_otro);
  PERFORM pg_temp.debe_fallar($q$SELECT mi_agenda('2030-01-14', '2030-01-14')$q$, 'SIN_AGENDA:%', 'C3 otro negocio');
  PERFORM pg_temp.debe_fallar(format('SELECT mi_cita_empezar(%L)', v_c1), 'SIN_AGENDA:%', 'C3 otro negocio empieza');
  UPDATE colaboradores_agenda SET activo = false WHERE usuario_id = v_maria;
  PERFORM pg_temp.como(v_maria, v_t);
  PERFORM pg_temp.debe_fallar($q$SELECT mi_agenda('2030-01-14', '2030-01-14')$q$, 'SIN_AGENDA:%', 'C3 inactiva');
  UPDATE colaboradores_agenda SET activo = true WHERE usuario_id = v_maria;
  UPDATE usuarios_acceso SET activo = false WHERE usuario_id = v_maria AND tenant_id = v_t;
  PERFORM pg_temp.debe_fallar($q$SELECT mi_agenda('2030-01-14', '2030-01-14')$q$, 'SIN_AGENDA:%', 'C3 sin acceso');
  UPDATE usuarios_acceso SET activo = true WHERE usuario_id = v_maria AND tenant_id = v_t;

  -- 4) Empezar y terminar: las propias sí; ajenas, canceladas y cobradas no.
  PERFORM pg_temp.debe_fallar(format('SELECT mi_cita_empezar(%L)', v_c1), 'DATOS_INVALIDOS: la cita no es tuya.', 'C4 ajena empieza');
  PERFORM pg_temp.como(v_diego, v_t);
  PERFORM pg_temp.debe_fallar(format('SELECT mi_cita_terminar(%L)', v_c1), 'DATOS_INVALIDOS: la cita no se está atendiendo.', 'C4 terminar antes de empezar');
  PERFORM mi_cita_empezar(v_c1);
  IF (SELECT estado FROM citas WHERE id = v_c1) <> 'EN_CURSO' THEN RAISE EXCEPTION 'C4: no empezó'; END IF;
  PERFORM pg_temp.debe_fallar(format('SELECT mi_cita_empezar(%L)', v_c1), 'DATOS_INVALIDOS: la cita no está por llegar.', 'C4 empezar dos veces');
  PERFORM pg_temp.como(v_maria, v_t);
  PERFORM pg_temp.debe_fallar(format('SELECT mi_cita_terminar(%L)', v_c1), 'DATOS_INVALIDOS: la cita no es tuya.', 'C4 ajena termina');
  PERFORM pg_temp.como(v_diego, v_t);
  v_x := mi_cita_terminar(v_c1);
  IF v_x <> 'TERMINADA' OR (SELECT estado FROM citas WHERE id = v_c1) <> 'TERMINADA' THEN RAISE EXCEPTION 'C4: no terminó: %', v_x; END IF;

  PERFORM pg_temp.como(v_dueno, v_t);
  PERFORM cancelar_cita(v_c3, 'no puede');                 -- cancelada_por CAJA
  PERFORM pg_temp.como(v_diego, v_t);
  PERFORM pg_temp.debe_fallar(format('SELECT mi_cita_empezar(%L)', v_c3), 'DATOS_INVALIDOS: la cita no está por llegar.', 'C4 cancelada empieza');
  PERFORM pg_temp.debe_fallar(format('SELECT mi_cita_terminar(%L)', v_c3), 'DATOS_INVALIDOS: la cita no se está atendiendo.', 'C4 cancelada termina');
  UPDATE citas SET estado = 'COBRADA' WHERE id = v_c1;
  PERFORM pg_temp.debe_fallar(format('SELECT mi_cita_empezar(%L)', v_c1), 'DATOS_INVALIDOS: la cita no está por llegar.', 'C4 cobrada empieza');
  PERFORM pg_temp.debe_fallar(format('SELECT mi_cita_terminar(%L)', v_c1), 'DATOS_INVALIDOS: la cita no se está atendiendo.', 'C4 cobrada termina');
  PERFORM pg_temp.debe_fallar(format('SELECT mi_cita_empezar(%L)', gen_random_uuid()), 'DATOS_INVALIDOS: la cita no es tuya.', 'C4 inexistente');

  -- 5) Dos colaboradores: «Terminé» de María (no es el último tramo) solo deja constancia;
  --    el de Diego (último tramo) termina la cita.
  PERFORM pg_temp.como(v_maria, v_t);
  PERFORM mi_cita_empezar(v_c7);
  v_x := mi_cita_terminar(v_c7);
  IF v_x <> 'EN_CURSO' OR (SELECT estado FROM citas WHERE id = v_c7) <> 'EN_CURSO' THEN
    RAISE EXCEPTION 'C5: María no debía terminar la cita: %', v_x; END IF;
  IF NOT EXISTS (SELECT 1 FROM auditoria_eventos WHERE tenant_id = v_t AND entidad_id = v_c7
                    AND evento_codigo = 'cita.termino_tramo' AND usuario_id = v_maria) THEN
    RAISE EXCEPTION 'C5: no quedó constancia del tramo de María'; END IF;
  PERFORM pg_temp.como(v_diego, v_t);
  v_x := mi_cita_terminar(v_c7);
  IF v_x <> 'TERMINADA' OR (SELECT estado FROM citas WHERE id = v_c7) <> 'TERMINADA' THEN
    RAISE EXCEPTION 'C5: Diego (último tramo) debía terminar la cita: %', v_x; END IF;

  -- 6) Reporte de citas: por colaborador y servicio, por canal y por quién cancela.
  --    c1 COBRADA, c2 cancela la clienta en línea, c3 cancela la caja, c4 no llegó,
  --    c5 venció su pago (no cuenta), c6 María por llegar (no cuenta), c7 TERMINADA (María y Diego).
  UPDATE citas SET estado = 'CANCELADA', cancelada_por = 'CLIENTA_EN_LINEA' WHERE id = v_c2;
  UPDATE citas SET estado = 'NO_LLEGO' WHERE id = v_c4;
  UPDATE citas SET estado = 'CANCELADA', cancelada_por = 'PAGO_VENCIDO' WHERE id = v_c5;
  PERFORM pg_temp.como(v_maria, v_t);
  PERFORM pg_temp.debe_fallar($q$SELECT * FROM agenda_reporte_citas('2030-01-14', '2030-01-20')$q$, 'SIN_PERMISO:%', 'C6 cajera');
  PERFORM pg_temp.debe_fallar($q$SELECT * FROM agenda_ocupacion('2030-01-14', '2030-01-20')$q$, 'SIN_PERMISO:%', 'C6 cajera ocupación');
  PERFORM pg_temp.como(v_diego, v_t);
  PERFORM pg_temp.debe_fallar($q$SELECT * FROM agenda_reporte_citas('2030-01-14', '2030-01-20')$q$, 'SIN_PERMISO:%', 'C6 supervisor');
  PERFORM pg_temp.como(v_dueno, v_otro);
  PERFORM pg_temp.debe_fallar($q$SELECT * FROM agenda_reporte_citas('2030-01-14', '2030-01-20')$q$, 'DATOS_INVALIDOS: la agenda no está encendida%', 'C6 otro negocio');

  PERFORM pg_temp.como(v_dueno, v_t);
  SELECT * INTO r FROM agenda_reporte_citas('2030-01-14', '2030-01-20') WHERE usuario_id = v_diego AND producto_id = v_corte;
  IF (r.atendidas, r.canceladas_clienta, r.canceladas_negocio, r.no_llego, r.total) <> (1, 1, 1, 1, 4) OR r.colaborador IS NULL OR r.servicio <> 'Corte' THEN
    RAISE EXCEPTION 'C6: Diego/Corte mal: %', to_jsonb(r); END IF;
  SELECT * INTO r FROM agenda_reporte_citas('2030-01-14', '2030-01-20') WHERE usuario_id = v_diego AND producto_id = v_tinte;
  IF (r.atendidas, r.total) <> (1, 1) THEN RAISE EXCEPTION 'C6: Diego/Tinte mal: %', to_jsonb(r); END IF;
  SELECT * INTO r FROM agenda_reporte_citas('2030-01-14', '2030-01-20') WHERE usuario_id = v_maria AND producto_id = v_corte;
  IF (r.atendidas, r.total) <> (1, 1) THEN RAISE EXCEPTION 'C6: María/Corte mal: %', to_jsonb(r); END IF;
  SELECT * INTO r FROM agenda_reporte_citas('2030-01-14', '2030-01-20', 'EN_LINEA') WHERE usuario_id = v_diego AND producto_id = v_corte;
  IF (r.atendidas, r.canceladas_clienta, r.canceladas_negocio, r.no_llego, r.total) <> (0, 1, 0, 0, 1) THEN
    RAISE EXCEPTION 'C6: en línea mal: %', to_jsonb(r); END IF;
  SELECT * INTO r FROM agenda_reporte_citas('2030-01-14', '2030-01-20', 'CAJA') WHERE usuario_id = v_diego AND producto_id = v_corte;
  IF (r.atendidas, r.canceladas_clienta, r.canceladas_negocio, r.no_llego, r.total) <> (1, 0, 1, 1, 3) THEN
    RAISE EXCEPTION 'C6: caja mal: %', to_jsonb(r); END IF;
  IF EXISTS (SELECT 1 FROM agenda_reporte_citas('2030-01-16', '2030-01-20')) THEN
    RAISE EXCEPTION 'C6: el rango no filtra'; END IF;
  PERFORM pg_temp.debe_fallar($q$SELECT * FROM agenda_reporte_citas('2030-01-14', '2030-01-20', 'TELEFONO')$q$, 'DATOS_INVALIDOS:%', 'C6 canal');

  -- 7) Ocupación. Diego: martes 10–19 con comida 14–15 (480 min); miércoles 10–19 pero ausente;
  --    jueves 10–12 (120 min); viernes sin horario.
  INSERT INTO horarios_colaborador (tenant_id, usuario_id, dia_semana, inicia, termina, comida_inicia, comida_termina) VALUES
    (v_t, v_diego, 2, '10:00', '19:00', '14:00', '15:00'),
    (v_t, v_diego, 3, '10:00', '19:00', NULL, NULL),
    (v_t, v_diego, 4, '10:00', '12:00', NULL, NULL);
  INSERT INTO ausencias_colaborador (tenant_id, usuario_id, desde, hasta, motivo) VALUES (v_t, v_diego, '2030-01-09', '2030-01-09', 'médico');
  -- Martes: 60 en horario + 60 fuera de horario (20:00) = 120. Miércoles: 60 aunque esté ausente.
  -- Jueves: 600 (08–18) + 180 (20–24) → tope 120. Viernes: lo que pasa de medianoche (420).
  PERFORM guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'O1', 'inicia', '2030-01-08 10:00-06',
            'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_corte, 'usuario_id', v_diego))));
  PERFORM guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'O2', 'inicia', '2030-01-08 20:00-06',
            'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_corte, 'usuario_id', v_diego))));
  PERFORM guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'O3', 'inicia', '2030-01-09 11:00-06',
            'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_corte, 'usuario_id', v_diego))));
  PERFORM guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'O4', 'inicia', '2030-01-10 08:00-06',
            'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_largo, 'usuario_id', v_diego))));
  PERFORM guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'O5', 'inicia', '2030-01-10 20:00-06',
            'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_corte, 'usuario_id', v_diego),
                                           jsonb_build_object('producto_id', v_largo, 'usuario_id', v_diego))));
  -- Una cancelada no ocupa.
  PERFORM cancelar_cita(guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'O6', 'inicia', '2030-01-08 16:00-06',
            'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_corte, 'usuario_id', v_diego)))), 'x');
  -- O5: corte 20–21 y tatuaje 21:00–07:00 del viernes.
  FOR r IN SELECT * FROM agenda_ocupacion('2030-01-08', '2030-01-11') WHERE usuario_id = v_diego ORDER BY dia LOOP
    IF (r.dia, r.minutos_horario, r.minutos_agendados) NOT IN
       (('2030-01-08'::date, 480, 120), ('2030-01-09'::date, 0, 60), ('2030-01-10'::date, 120, 120), ('2030-01-11'::date, 0, 420)) THEN
      RAISE EXCEPTION 'C7: ocupación de Diego mal: %', to_jsonb(r); END IF;
  END LOOP;
  SELECT count(*) INTO v_n FROM agenda_ocupacion('2030-01-08', '2030-01-11') WHERE usuario_id = v_diego;
  IF v_n <> 4 THEN RAISE EXCEPTION 'C7: Diego debía tener 4 días: %', v_n; END IF;
  SELECT count(*) INTO v_n FROM agenda_ocupacion('2030-01-08', '2030-01-11') WHERE usuario_id = v_maria AND minutos_agendados = 0;
  IF v_n <> 4 THEN RAISE EXCEPTION 'C7: María debía tener 4 días en cero: %', v_n; END IF;

  RAISE NOTICE 'belleza celular OK';
END $$;

ROLLBACK;
