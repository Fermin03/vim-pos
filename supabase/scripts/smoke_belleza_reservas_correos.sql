-- Smoke belleza, entrega 3 (migración 0226): los correos de una cita reservada en línea.
-- Qué cambio deja qué correo (confirmación al reservar o al pagar, cambio con versión, cancelación),
-- que nada se repite, el recordatorio una sola vez por versión y solo si se reservó con más de 24 h,
-- nada para una cita de la caja sin correo, el enlace cifrado, tomar/resultado, el barrido y permisos.
-- Aquí no hay SMTP ni Mercado Pago: se prueba lo que la base decide.
--
-- LA CAJA INSTALADA. Como smoke_tienda_correos_de_estado.sql: sin pg_cron (npm run smokes) el bloque
-- 0 demuestra que la cola no se llena y crea el esquema `cron` dentro de la transacción.
-- Uso: cd desktop && npm run smokes -- smoke_belleza_reservas_correos.sql
\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.a(p_d date, p_h text) RETURNS timestamptz LANGUAGE sql IMMUTABLE
AS $$ SELECT (p_d + p_h::time) AT TIME ZONE 'America/Mexico_City' $$;
CREATE FUNCTION pg_temp.reservar(p_inicia timestamptz, p_clave text, p_tel text) RETURNS jsonb LANGUAGE sql
AS $$ SELECT agenda_reservar_en_linea('99999999-0000-0000-0000-0000000000aa', jsonb_build_object(
        'sucursal_id', '99999999-0000-0000-0000-0000000000bb', 'inicia', p_inicia,
        'servicios', jsonb_build_array(jsonb_build_object('producto_id', '22600000-0000-0000-0000-0000000000a1',
                                                          'usuario_id', '99999999-0000-0000-0000-000000000001')),
        'cliente', jsonb_build_object('nombre', 'Correo Web', 'telefono', p_tel, 'email', 'correo.web@example.com'),
        'clave', p_clave)) $$;
CREATE FUNCTION pg_temp.h(p_codigo text) RETURNS text LANGUAGE sql IMMUTABLE
AS $$ SELECT encode(sha256(convert_to(p_codigo, 'UTF8')), 'hex') $$;
-- Los correos de una cita, en orden: «CONFIRMACION/0:PENDIENTE,CAMBIO/1:PENDIENTE».
CREATE FUNCTION pg_temp.cola(p_cita uuid) RETURNS text LANGUAGE sql
AS $$ SELECT COALESCE(string_agg(c.tipo || '/' || c.version || ':' || c.estado, ',' ORDER BY c.id), '')
        FROM agenda_correos c WHERE c.cita_id = p_cita $$;

DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_corte  uuid := '22600000-0000-0000-0000-0000000000a1';
  v_hoy    date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  c_cif    CONSTANT text := repeat('Ab3_-', 13);
  d date;
  v_cat uuid; v_cx uuid; v_c1 uuid; v_c2 uuid; v_c3 uuid; v_c4 uuid; v_c5 uuid; v_c6 uuid; v_caja uuid; v_pago uuid;
  v_r jsonb; v_r2 jsonb; v_n integer; v_txt text;
  r record;
BEGIN
  d := v_hoy + 7;
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- ── Fixture: salón con reservas, sin anticipo (AL_FINAL) para empezar ─────────
  INSERT INTO configuracion_tenant (tenant_id) VALUES (v_t) ON CONFLICT (tenant_id) DO NOTHING;
  UPDATE tenants SET vertical_principal = 'SALON', operacion = operacion || '{"agenda":true}', nombre_comercial = 'Salón Correos'
   WHERE id = v_t;
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
  SELECT v_t, x.id, v_hoy, true, 100.00 FROM addons x WHERE x.codigo = 'TIENDA'
     AND NOT EXISTS (SELECT 1 FROM tenant_addons ta WHERE ta.tenant_id = v_t AND ta.addon_id = x.id);
  UPDATE tenant_addons SET activo = true WHERE tenant_id = v_t AND addon_id = (SELECT id FROM addons WHERE codigo = 'TIENDA');
  UPDATE configuracion_tenant SET modulo_reservas_activo = true, agenda_cobro_modo = 'AL_FINAL', agenda_cancelar_horas = 24
   WHERE tenant_id = v_t;
  INSERT INTO tienda_config (tenant_id, slug, pago_en_linea) VALUES (v_t, 'correos-citas-smoke', true)
    ON CONFLICT (tenant_id) DO UPDATE SET slug = EXCLUDED.slug, pago_en_linea = true, pago_pausado_hasta = NULL;
  INSERT INTO tienda_conexiones (tenant_id, cuenta_id_externo, public_key) VALUES (v_t, '2260', 'APP_USR-smoke-correos-citas-01')
    RETURNING id INTO v_cx;
  UPDATE tienda_conexiones SET estado = 'DESCONECTADA' WHERE tenant_id = v_t AND id <> v_cx;
  INSERT INTO tienda_sucursales (sucursal_id, tenant_id, participa) VALUES (v_suc, v_t, true)
    ON CONFLICT (sucursal_id) DO UPDATE SET pago_pausado_hasta = NULL, conexion_id = NULL;
  UPDATE cajas SET espejo_turno_abierto_at = now(), espejo_apps_at = NULL, version_app = NULL WHERE sucursal_id = v_suc;
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion) VALUES (v_t, 'Correos smoke', 73) RETURNING id INTO v_cat;
  INSERT INTO productos (id, tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_corte, v_t, v_cat, 'Corte correo', 200);
  INSERT INTO servicios_agenda (producto_id, tenant_id, duracion_min, en_linea, anticipo_tipo, anticipo_valor)
  VALUES (v_corte, v_t, 60, true, 'PORCENTAJE', 50);
  INSERT INTO colaboradores_agenda (usuario_id, tenant_id, sucursal_id, color_hex, orden) VALUES (v_maria, v_t, v_suc, '#C2410C', 1)
    ON CONFLICT (tenant_id, usuario_id) DO UPDATE SET sucursal_id = EXCLUDED.sucursal_id, activo = true;
  INSERT INTO servicio_colaborador (producto_id, usuario_id, tenant_id) VALUES (v_corte, v_maria, v_t);
  DELETE FROM horarios_colaborador WHERE tenant_id = v_t AND usuario_id = v_maria;
  INSERT INTO horarios_colaborador (tenant_id, usuario_id, dia_semana, inicia, termina)
  SELECT v_t, v_maria, g, '08:00', '20:00' FROM generate_series(0, 6) g;
  DELETE FROM ausencias_colaborador WHERE tenant_id = v_t;
  UPDATE citas SET estado = 'CANCELADA' WHERE tenant_id = v_t AND estado = 'AGENDADA'
     AND (inicia AT TIME ZONE 'America/Mexico_City')::date = d;
  DELETE FROM agenda_correos;

  -- ── 0) En la caja instalada la cola no se llena ─────────────────────────────
  IF to_regnamespace('cron') IS NULL THEN
    v_r := pg_temp.reservar(pg_temp.a(d, '08:00'), 'smk-correo-0000', '4770004400');
    PERFORM agenda_mover_en_linea(v_t, pg_temp.h(v_r->>'codigo'), pg_temp.a(d, '08:15'));
    PERFORM agenda_cancelar_en_linea(v_t, pg_temp.h(v_r->>'codigo'));
    IF (SELECT count(*) FROM agenda_correos) <> 0 OR agenda_recordatorios_encolar() <> 0 THEN
      RAISE EXCEPTION '0: sin pg_cron (la caja instalada) la cola debía quedar vacía: %', pg_temp.cola((v_r->>'cita_id')::uuid);
    END IF;
    EXECUTE 'CREATE SCHEMA cron';   -- de aquí en adelante, como en la nube (se deshace con la transacción)
  ELSE
    RAISE NOTICE '0: aquí hay pg_cron; la prueba de la caja instalada corre con `npm run smokes` en desktop/';
  END IF;

  -- C1) Sin anticipo: la confirmación sale al reservar. El reintento con la misma clave no repite.
  v_r := pg_temp.reservar(pg_temp.a(d, '09:00'), 'smk-correo-0001', '4770004401');
  v_c1 := (v_r->>'cita_id')::uuid;
  IF pg_temp.cola(v_c1) <> 'CONFIRMACION/0:PENDIENTE' THEN RAISE EXCEPTION 'C1: %', pg_temp.cola(v_c1); END IF;
  PERFORM pg_temp.reservar(pg_temp.a(d, '09:00'), 'smk-correo-0001', '4770004401');
  IF pg_temp.cola(v_c1) <> 'CONFIRMACION/0:PENDIENTE' THEN RAISE EXCEPTION 'C1 reintento: %', pg_temp.cola(v_c1); END IF;

  -- C2) Cambio de horario: CAMBIO con versión que sube; el cambio pendiente anterior se descarta.
  PERFORM agenda_mover_en_linea(v_t, pg_temp.h(v_r->>'codigo'), pg_temp.a(d, '10:00'));
  IF pg_temp.cola(v_c1) <> 'CONFIRMACION/0:PENDIENTE,CAMBIO/1:PENDIENTE' THEN RAISE EXCEPTION 'C2: %', pg_temp.cola(v_c1); END IF;
  PERFORM agenda_mover_en_linea(v_t, pg_temp.h(v_r->>'codigo'), pg_temp.a(d, '11:00'));
  IF pg_temp.cola(v_c1) <> 'CONFIRMACION/0:PENDIENTE,CAMBIO/1:DESCARTADO,CAMBIO/2:PENDIENTE' THEN
    RAISE EXCEPTION 'C2 segundo cambio: %', pg_temp.cola(v_c1); END IF;
  -- Tocar la cita sin cambiar la hora (como el push de la caja) no hace nada.
  UPDATE citas SET inicia = inicia, nota = 'nada' WHERE id = v_c1;
  IF pg_temp.cola(v_c1) <> 'CONFIRMACION/0:PENDIENTE,CAMBIO/1:DESCARTADO,CAMBIO/2:PENDIENTE' THEN
    RAISE EXCEPTION 'C2 sin cambio: %', pg_temp.cola(v_c1); END IF;

  -- C3) Cancelar en línea: CANCELACION; lo pendiente que ya no corresponde se descarta. Una sola vez.
  PERFORM agenda_cancelar_en_linea(v_t, pg_temp.h(v_r->>'codigo'));
  IF pg_temp.cola(v_c1) <> 'CONFIRMACION/0:DESCARTADO,CAMBIO/1:DESCARTADO,CAMBIO/2:DESCARTADO,CANCELACION/0:PENDIENTE' THEN
    RAISE EXCEPTION 'C3: %', pg_temp.cola(v_c1); END IF;
  UPDATE citas SET estado = 'AGENDADA' WHERE id = v_c1;
  UPDATE citas SET estado = 'CANCELADA' WHERE id = v_c1;
  IF (SELECT count(*) FROM agenda_correos WHERE cita_id = v_c1 AND tipo = 'CANCELACION') <> 1 THEN
    RAISE EXCEPTION 'C3: la cancelación se repitió: %', pg_temp.cola(v_c1); END IF;

  -- C4) Con anticipo: nada hasta pagar; al aprobarse el pago, la confirmación (una vez).
  UPDATE configuracion_tenant SET agenda_cobro_modo = 'ANTICIPO' WHERE tenant_id = v_t;
  v_r2 := pg_temp.reservar(pg_temp.a(d, '13:00'), 'smk-correo-0002', '4770004402');
  v_c2 := (v_r2->>'cita_id')::uuid;
  IF v_r2->>'pago_id' IS NULL OR pg_temp.cola(v_c2) <> '' THEN RAISE EXCEPTION 'C4 antes de pagar: % %', v_r2, pg_temp.cola(v_c2); END IF;
  -- Se mueve mientras espera el pago: no avisa (la clienta nunca tuvo confirmación), pero cuenta.
  PERFORM agenda_mover_en_linea(v_t, pg_temp.h(v_r2->>'codigo'), pg_temp.a(d, '13:30'));
  IF pg_temp.cola(v_c2) <> 'CAMBIO/1:DESCARTADO' THEN RAISE EXCEPTION 'C4 cambio sin pagar: %', pg_temp.cola(v_c2); END IF;
  PERFORM tienda_pago_tomar_cobro((v_r2->>'pago_id')::uuid);
  PERFORM tienda_pago_aplicar((v_r2->>'pago_id')::uuid, 'APROBADO', 'ORDCORREO01', 100.00, 'credit_card', 'visa');
  IF pg_temp.cola(v_c2) <> 'CAMBIO/1:DESCARTADO,CONFIRMACION/0:PENDIENTE' THEN RAISE EXCEPTION 'C4 pagada: %', pg_temp.cola(v_c2); END IF;
  PERFORM tienda_pago_aplicar((v_r2->>'pago_id')::uuid, 'APROBADO', 'ORDCORREO01', 100.00, 'credit_card', 'visa');
  IF pg_temp.cola(v_c2) <> 'CAMBIO/1:DESCARTADO,CONFIRMACION/0:PENDIENTE' THEN RAISE EXCEPTION 'C4 aviso repetido: %', pg_temp.cola(v_c2); END IF;

  -- C5) Con anticipo que nunca se paga: sin confirmación; sí el aviso de que se liberó.
  v_r := pg_temp.reservar(pg_temp.a(d, '15:00'), 'smk-correo-0003', '4770004403');
  v_c3 := (v_r->>'cita_id')::uuid;
  UPDATE citas SET pago_hasta = now() - interval '1 minute' WHERE id = v_c3;
  IF NOT _agenda_cancelar_sin_pago(v_c3) THEN RAISE EXCEPTION 'C5: no se canceló sin pago'; END IF;
  IF pg_temp.cola(v_c3) <> 'CANCELACION/0:PENDIENTE' THEN RAISE EXCEPTION 'C5: %', pg_temp.cola(v_c3); END IF;

  -- C6) Una cita de la caja sin correo: nada, ni al crearla, ni al moverla, ni al cancelarla.
  INSERT INTO citas (tenant_id, sucursal_id, cliente_nombre, estado, canal, inicia, termina)
  VALUES (v_t, v_suc, 'Caja Sin Correo', 'AGENDADA', 'CAJA', pg_temp.a(d, '17:00'), pg_temp.a(d, '18:00')) RETURNING id INTO v_caja;
  UPDATE citas SET inicia = pg_temp.a(d, '17:30'), termina = pg_temp.a(d, '18:30') WHERE id = v_caja;
  UPDATE citas SET estado = 'CANCELADA', cancelada_por = 'CAJA' WHERE id = v_caja;
  UPDATE citas SET created_at = now() - interval '9 days' WHERE id = v_caja;
  IF pg_temp.cola(v_caja) <> '' THEN RAISE EXCEPTION 'C6: %', pg_temp.cola(v_caja); END IF;

  -- C7) Recordatorio: solo si se reservó (o cambió) con más de 24 h, una vez por versión.
  v_c4 := v_c2;                                   -- pagada, AGENDADA, versión 1 (movida sin pagar)
  UPDATE citas SET created_at = now() - interval '8 days' WHERE id = v_c4;
  PERFORM agenda_recordatorios_encolar();         -- a 7 días: todavía no
  IF pg_temp.cola(v_c4) <> 'CAMBIO/1:DESCARTADO,CONFIRMACION/0:PENDIENTE' THEN RAISE EXCEPTION 'C7 lejos: %', pg_temp.cola(v_c4); END IF;
  -- La cita pasa a mañana (un cambio: versión 2, hecho hoy → sin recordatorio).
  UPDATE citas SET inicia = now() + interval '20 hours', termina = now() + interval '21 hours' WHERE id = v_c4;
  PERFORM agenda_recordatorios_encolar();
  IF pg_temp.cola(v_c4) <> 'CAMBIO/1:DESCARTADO,CONFIRMACION/0:PENDIENTE,CAMBIO/2:PENDIENTE' THEN RAISE EXCEPTION 'C7 cambio reciente: %', pg_temp.cola(v_c4); END IF;
  -- El cambio fue hace dos días: ahora sí, y una sola vez.
  UPDATE agenda_correos SET created_at = now() - interval '2 days' WHERE cita_id = v_c4 AND tipo = 'CAMBIO';
  v_n := agenda_recordatorios_encolar();
  PERFORM agenda_recordatorios_encolar();
  IF v_n < 1 OR pg_temp.cola(v_c4) <> 'CAMBIO/1:DESCARTADO,CONFIRMACION/0:PENDIENTE,CAMBIO/2:PENDIENTE,RECORDATORIO/2:PENDIENTE' THEN
    RAISE EXCEPTION 'C7 recordatorio: % %', v_n, pg_temp.cola(v_c4); END IF;
  -- Otro cambio: el recordatorio pendiente se descarta y el nuevo horario, reservado hoy, no lleva.
  UPDATE citas SET inicia = now() + interval '22 hours', termina = now() + interval '23 hours' WHERE id = v_c4;
  PERFORM agenda_recordatorios_encolar();
  IF pg_temp.cola(v_c4) <> 'CAMBIO/1:DESCARTADO,CONFIRMACION/0:PENDIENTE,CAMBIO/2:DESCARTADO,RECORDATORIO/2:DESCARTADO,CAMBIO/3:PENDIENTE' THEN
    RAISE EXCEPTION 'C7 recambio: %', pg_temp.cola(v_c4); END IF;
  -- Reservada con menos de 24 h: sin recordatorio. Cancelada: tampoco.
  UPDATE citas SET created_at = now() - interval '3 hours', inicia = now() + interval '10 hours', termina = now() + interval '11 hours'
   WHERE id = v_c3;
  PERFORM agenda_recordatorios_encolar();
  IF pg_temp.cola(v_c3) <> 'CANCELACION/0:PENDIENTE' THEN RAISE EXCEPTION 'C7 cancelada: %', pg_temp.cola(v_c3); END IF;
  UPDATE configuracion_tenant SET agenda_cobro_modo = 'AL_FINAL' WHERE tenant_id = v_t;
  v_r := pg_temp.reservar(pg_temp.a(d, '18:00'), 'smk-correo-0005', '4770004405');
  v_c5 := (v_r->>'cita_id')::uuid;
  -- Como si se hubiera reservado hace 3 h para dentro de 5 h (sin cambio de por medio).
  UPDATE citas SET created_at = now() - interval '3 hours', inicia = now() + interval '5 hours', termina = now() + interval '6 hours'
   WHERE id = v_c5;
  DELETE FROM agenda_correos WHERE cita_id = v_c5 AND tipo = 'CAMBIO';
  PERFORM agenda_recordatorios_encolar();
  IF EXISTS (SELECT 1 FROM agenda_correos WHERE cita_id = v_c5 AND tipo = 'RECORDATORIO') THEN
    RAISE EXCEPTION 'C7 reservada hace poco: %', pg_temp.cola(v_c5); END IF;

  -- C7b) Reservada hace 8 días, movida a mañana HOY mientras esperaba su pago, y pagada: el cambio
  --      cuenta para la regla de 24 h (no created_at), así que no lleva recordatorio.
  UPDATE configuracion_tenant SET agenda_cobro_modo = 'ANTICIPO' WHERE tenant_id = v_t;
  v_r := pg_temp.reservar(pg_temp.a(d, '16:00'), 'smk-correo-0006', '4770004406');
  v_c6 := (v_r->>'cita_id')::uuid;
  UPDATE citas SET created_at = now() - interval '8 days', inicia = now() + interval '20 hours', termina = now() + interval '21 hours'
   WHERE id = v_c6;
  PERFORM tienda_pago_tomar_cobro((v_r->>'pago_id')::uuid);
  PERFORM tienda_pago_aplicar((v_r->>'pago_id')::uuid, 'APROBADO', 'ORDCORREO06', 100.00, 'credit_card', 'visa');
  PERFORM agenda_recordatorios_encolar();
  IF pg_temp.cola(v_c6) <> 'CAMBIO/1:DESCARTADO,CONFIRMACION/0:PENDIENTE' THEN RAISE EXCEPTION 'C7b: %', pg_temp.cola(v_c6); END IF;
  UPDATE configuracion_tenant SET agenda_cobro_modo = 'AL_FINAL' WHERE tenant_id = v_t;

  -- C8) Enlace cifrado: se guarda solo para la cita de ese negocio con correo; una vez.
  PERFORM agenda_enlace_guardar(v_t, pg_temp.h(v_r2->>'codigo'), c_cif);
  PERFORM agenda_enlace_guardar(v_t, pg_temp.h(v_r2->>'codigo'), 'otro' || c_cif);
  PERFORM agenda_enlace_guardar('76767676-0000-0000-0000-0000000000aa', pg_temp.h(v_r->>'codigo'), c_cif);
  PERFORM agenda_enlace_guardar(v_t, repeat('0', 64), c_cif);
  IF (SELECT string_agg(cifrado, ',') FROM agenda_enlaces WHERE cita_id IN (v_c2, v_c5)) IS DISTINCT FROM c_cif THEN
    RAISE EXCEPTION 'C8: %', (SELECT string_agg(cita_id || '=' || cifrado, ',') FROM agenda_enlaces); END IF;

  -- C9) Tomar: devuelve lo necesario para armar el correo; resultado lo cierra.
  DELETE FROM agenda_correos WHERE cita_id NOT IN (v_c2);
  UPDATE agenda_correos SET estado = 'DESCARTADO' WHERE cita_id = v_c2 AND tipo <> 'CONFIRMACION';
  SELECT * INTO r FROM agenda_correos_tomar(10, 30);
  IF r.tipo <> 'CONFIRMACION' OR r.email <> 'correo.web@example.com' OR r.slug <> 'correos-citas-smoke' OR r.negocio <> 'Salón Correos'
     OR r.cifrado <> c_cif OR r.enlace_hash <> pg_temp.h(v_r2->>'codigo') OR r.cita->>'estado' <> 'AGENDADA'
     OR (r.cita->>'anticipo_en_linea_mxn')::numeric <> 100 OR (r.cita->>'version')::int <> 3 OR r.cita->'sucursal'->>'nombre' IS NULL
     OR jsonb_array_length(r.cita->'servicios') <> 1 THEN
    RAISE EXCEPTION 'C9 tomar: %', to_jsonb(r); END IF;
  IF EXISTS (SELECT 1 FROM agenda_correos_tomar(10, 30)) THEN RAISE EXCEPTION 'C9: tomó dos veces lo mismo'; END IF;
  IF agenda_correo_resultado(r.id, 'ENVIADO') <> 'ENVIADO' THEN RAISE EXCEPTION 'C9 resultado'; END IF;
  BEGIN
    PERFORM agenda_correo_resultado(r.id, 'OTRO');
    RAISE EXCEPTION 'C9: aceptó un resultado inválido';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'CORREO_RESULTADO_INVALIDO%' THEN RAISE; END IF;
  END;
  -- La confirmación sin enlace guardado espera hasta 5 minutos; luego sale (sin botón).
  INSERT INTO agenda_correos (tenant_id, cita_id, tipo) VALUES (v_t, v_c5, 'CONFIRMACION') RETURNING id INTO v_n;
  IF EXISTS (SELECT 1 FROM agenda_correos_tomar(10, 30)) THEN RAISE EXCEPTION 'C9: tomó la confirmación sin enlace'; END IF;
  UPDATE agenda_correos SET created_at = now() - interval '6 minutes' WHERE id = v_n;
  SELECT * INTO r FROM agenda_correos_tomar(10, 30);
  IF r.id IS DISTINCT FROM v_n::bigint OR r.cifrado IS NOT NULL THEN RAISE EXCEPTION 'C9: no salió pasados 5 min: %', to_jsonb(r); END IF;
  PERFORM agenda_correo_resultado(v_n, 'ENVIADO');
  -- Falla cuatro veces: MUERTO.
  INSERT INTO agenda_correos (tenant_id, cita_id, tipo, version) VALUES (v_t, v_c2, 'CAMBIO', 9) RETURNING id INTO v_n;
  FOR i IN 1..4 LOOP
    UPDATE agenda_correos SET proximo_intento_at = NULL WHERE id = v_n;
    PERFORM agenda_correos_tomar(10, 30);
    v_txt := agenda_correo_resultado(v_n, 'FALLO');
  END LOOP;
  IF v_txt <> 'MUERTO' THEN RAISE EXCEPTION 'C9 muerto: %', v_txt; END IF;

  -- C10) El barrido: cuenta lo de las citas, caduca lo viejo y borra el enlace de una cita ya pasada.
  INSERT INTO agenda_correos (tenant_id, cita_id, tipo, version, created_at) VALUES (v_t, v_c2, 'CAMBIO', 10, now() - interval '2 days');
  INSERT INTO agenda_correos (tenant_id, cita_id, tipo, version) VALUES (v_t, v_c2, 'CAMBIO', 11);
  IF tienda_correos_barrer() < 1 THEN RAISE EXCEPTION 'C10: el barrido no contó el correo de la cita'; END IF;
  IF (SELECT estado || '/' || motivo FROM agenda_correos WHERE cita_id = v_c2 AND version = 10) <> 'DESCARTADO/VENCIDO' THEN
    RAISE EXCEPTION 'C10: no caducó'; END IF;
  IF NOT EXISTS (SELECT 1 FROM agenda_enlaces WHERE cita_id = v_c2) THEN RAISE EXCEPTION 'C10: borró un enlace vigente'; END IF;
  UPDATE citas SET inicia = now() - interval '3 days', termina = now() - interval '3 days' + interval '1 hour' WHERE id = v_c2;
  PERFORM tienda_correos_barrer();
  IF EXISTS (SELECT 1 FROM agenda_enlaces WHERE cita_id = v_c2) THEN RAISE EXCEPTION 'C10: el enlace de una cita pasada sigue'; END IF;

  -- C11) Permisos: nada para el público ni el personal.
  FOREACH v_txt IN ARRAY ARRAY['agenda_correos_tomar(integer,integer)', 'agenda_correo_resultado(bigint,text)',
                               'agenda_enlace_guardar(uuid,text,text)', 'agenda_recordatorios_encolar()',
                               '_agenda_correo_encolar(uuid,text,integer)'] LOOP
    IF has_function_privilege('anon', v_txt, 'execute') OR has_function_privilege('authenticated', v_txt, 'execute') THEN
      RAISE EXCEPTION 'C11: % abierta al público', v_txt; END IF;
  END LOOP;
  IF NOT has_function_privilege('service_role', 'agenda_correos_tomar(integer,integer)', 'execute')
     OR has_function_privilege('service_role', '_agenda_correo_encolar(uuid,text,integer)', 'execute')
     OR has_table_privilege('authenticated', 'agenda_correos', 'select') OR has_table_privilege('anon', 'agenda_enlaces', 'select') THEN
    RAISE EXCEPTION 'C11: permisos'; END IF;

  RAISE NOTICE 'smoke_belleza_reservas_correos: OK';
END $$;

ROLLBACK;
