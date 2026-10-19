-- Smoke belleza, entrega 3 (migración 0224): reservas en línea en la base. Horarios ofrecidos
-- (horario, comida, ausencia, empalme también marcado, espacio, intervalo, aviso y días), cadena de
-- dos servicios, «quien esté libre», doble reserva del mismo hueco, clave idempotente, clienta por
-- teléfono, cancelar y cambiar dentro y fuera del plazo, vencimiento sin pago, otro negocio,
-- permisos, el módulo `reservas`, entrada mal formada, celular a 10 dígitos, clienta bloqueada,
-- motivo público, tope de 3 citas por celular y negocio bloqueado. Sobre la semilla; las fechas son
-- relativas a hoy (México). ROLLBACK.
-- Uso: cd desktop && npm run smokes -- smoke_belleza_reservas.sql
\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.debe_fallar(q text, patron text, paso text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  EXECUTE q;
  RAISE EXCEPTION '%: no falló: %', paso, q USING ERRCODE = 'P0099';
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE = 'P0099' OR SQLERRM NOT LIKE patron THEN RAISE EXCEPTION '%: %', paso, SQLERRM; END IF;
END $f$;
-- Hora local de México de un día.
CREATE FUNCTION pg_temp.a(p_d date, p_h text) RETURNS timestamptz LANGUAGE sql IMMUTABLE
AS $$ SELECT (p_d + p_h::time) AT TIME ZONE 'America/Mexico_City' $$;
-- Los huecos de un día como «,09:00,09:15,…,».
CREATE FUNCTION pg_temp.huecos(p_d date, p_serv jsonb, p_excluir text DEFAULT NULL) RETURNS text LANGUAGE sql
AS $$ SELECT ',' || COALESCE(string_agg(to_char(h.inicia AT TIME ZONE 'America/Mexico_City', 'HH24:MI'), ',' ORDER BY h.inicia), '') || ','
        FROM agenda_huecos('99999999-0000-0000-0000-0000000000aa', '99999999-0000-0000-0000-0000000000bb', p_d, p_serv, p_excluir) h $$;
CREATE FUNCTION pg_temp.s(p_prod uuid, p_u uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql IMMUTABLE
AS $$ SELECT jsonb_build_array(jsonb_build_object('producto_id', p_prod, 'usuario_id', p_u)) $$;
CREATE FUNCTION pg_temp.como(p_u uuid) RETURNS void LANGUAGE sql
AS $$ SELECT set_config('request.jwt.claims', CASE WHEN p_u IS NULL THEN NULL ELSE
        json_build_object('sub', p_u, 'role', 'authenticated', 'tenant_id', '99999999-0000-0000-0000-0000000000aa')::text END, true) $$;
-- Una reserva en línea.
CREATE FUNCTION pg_temp.reservar(p_inicia timestamptz, p_serv jsonb, p_clave text, p_tel text DEFAULT '4770002241')
RETURNS jsonb LANGUAGE sql
AS $$ SELECT agenda_reservar_en_linea('99999999-0000-0000-0000-0000000000aa', jsonb_build_object(
        'sucursal_id', '99999999-0000-0000-0000-0000000000bb', 'inicia', p_inicia, 'servicios', p_serv,
        'cliente', jsonb_build_object('nombre', 'Ana Web', 'telefono', p_tel, 'email', 'ana.web@example.com'),
        'nota', 'Primera vez', 'clave', p_clave)) $$;
CREATE FUNCTION pg_temp.h(p_codigo text) RETURNS text LANGUAGE sql IMMUTABLE
AS $$ SELECT encode(sha256(convert_to(p_codigo, 'UTF8')), 'hex') $$;

DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_diego  uuid := '99999999-0000-0000-0000-0000000000f1';
  v_otro   uuid := '22400000-0000-0000-0000-0000000000aa';
  v_corte  uuid := '22400000-0000-0000-0000-0000000000a1';   -- 60 min, $200 (Diego $300)
  v_mani   uuid := '22400000-0000-0000-0000-0000000000a2';   -- 45 min, María
  v_pedi   uuid := '22400000-0000-0000-0000-0000000000a3';   -- 30 min, Diego
  v_facial uuid := '22400000-0000-0000-0000-0000000000a4';   -- 60 min, pide cabina
  v_valor  uuid := '22400000-0000-0000-0000-0000000000a5';   -- fuera de línea
  v_hoy    date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  d        date;
  e        date;
  v_rosa   uuid;
  v_h      text;
  v_cat uuid; v_tipo uuid; v_cx uuid; v_turno uuid; v_lucia uuid;
  v_c1 uuid; v_c2 uuid; v_c3 uuid;
  v_r jsonb; v_r2 jsonb; v_neg jsonb; v_hash text; v_hash2 text; v_txt text; v_n integer; f text;
  r record;
BEGIN
  d := v_hoy + 7;
  e := v_hoy + 3;
  PERFORM pg_temp.como(NULL);

  -- ── Fixture ────────────────────────────────────────────────────────────────
  INSERT INTO configuracion_tenant (tenant_id) VALUES (v_t) ON CONFLICT (tenant_id) DO NOTHING;
  UPDATE tenants SET vertical_principal = 'SALON', operacion = operacion || '{"agenda":true}' WHERE id = v_t;
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_otro, 'tenant-0224', 'Otro negocio', 'INTERNO', 'SALON');
  INSERT INTO tienda_config (tenant_id, slug) VALUES (v_t, 'reservas-smoke')
    ON CONFLICT (tenant_id) DO UPDATE SET slug = EXCLUDED.slug;
  UPDATE sucursales SET telefono = '(477) 123 4567' WHERE id = v_suc;
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion) VALUES (v_t, 'Cabello smoke', 71) RETURNING id INTO v_cat;
  INSERT INTO productos (id, tenant_id, categoria_id, nombre, precio_base_mxn) VALUES
    (v_corte, v_t, v_cat, 'Corte', 200), (v_mani, v_t, v_cat, 'Manicure', 150), (v_pedi, v_t, v_cat, 'Pedicure', 120),
    (v_facial, v_t, v_cat, 'Facial', 400), (v_valor, v_t, v_cat, 'Valoración privada', 0);
  INSERT INTO tipos_espacio (tenant_id, nombre) VALUES (v_t, 'Cabina smoke') RETURNING id INTO v_tipo;
  INSERT INTO espacios (tenant_id, sucursal_id, tipo_espacio_id, nombre) VALUES (v_t, v_suc, v_tipo, 'Cabina 1');
  INSERT INTO servicios_agenda (producto_id, tenant_id, duracion_min, tipo_espacio_id, en_linea) VALUES
    (v_corte, v_t, 60, NULL, true), (v_mani, v_t, 45, NULL, true), (v_pedi, v_t, 30, NULL, true),
    (v_facial, v_t, 60, v_tipo, true), (v_valor, v_t, 30, NULL, false);
  INSERT INTO colaboradores_agenda (usuario_id, tenant_id, sucursal_id, color_hex, orden) VALUES
    (v_maria, v_t, v_suc, '#C2410C', 1), (v_diego, v_t, v_suc, '#0F766E', 2)
    ON CONFLICT (tenant_id, usuario_id) DO UPDATE SET sucursal_id = EXCLUDED.sucursal_id, activo = true, orden = EXCLUDED.orden;
  INSERT INTO servicio_colaborador (producto_id, usuario_id, tenant_id, precio_mxn) VALUES
    (v_corte, v_maria, v_t, NULL), (v_corte, v_diego, v_t, 300), (v_mani, v_maria, v_t, NULL),
    (v_pedi, v_diego, v_t, NULL), (v_facial, v_maria, v_t, NULL), (v_facial, v_diego, v_t, NULL), (v_valor, v_maria, v_t, NULL);
  DELETE FROM horarios_colaborador WHERE tenant_id = v_t AND usuario_id IN (v_maria, v_diego);
  INSERT INTO horarios_colaborador (tenant_id, usuario_id, dia_semana, inicia, termina, comida_inicia, comida_termina)
  SELECT v_t, u, g, '09:00', '18:00', CASE WHEN u = v_diego THEN '13:00'::time END, CASE WHEN u = v_diego THEN '14:00'::time END
    FROM unnest(ARRAY[v_maria, v_diego]) u, generate_series(0, 6) g;
  DELETE FROM ausencias_colaborador WHERE tenant_id = v_t;

  -- R1) `reservas` = add-on TIENDA + interruptor + agenda.
  IF (modulos_efectivos(v_t)->'permitidos'->>'reservas') IS DISTINCT FROM 'false'
     OR (modulos_efectivos(v_t)->'efectivos'->>'reservas') IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'R1: sin add-on, reservas no debía estar permitido: %', modulos_efectivos(v_t); END IF;
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
  VALUES (v_t, (SELECT id FROM addons WHERE codigo = 'TIENDA'), v_hoy, true, 100.00);
  IF (modulos_efectivos(v_t)->'permitidos'->>'reservas') IS DISTINCT FROM 'true'
     OR (modulos_efectivos(v_t)->'efectivos'->>'reservas') IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'R1: con add-on y sin interruptor: %', modulos_efectivos(v_t); END IF;
  IF reservas_negocio('reservas-smoke') IS NOT NULL THEN RAISE EXCEPTION 'R1: el sitio ve un negocio sin reservas'; END IF;
  -- La página de una cita sí lo ve con las reservas apagadas (la clienta ve su cita y su reembolso).
  IF reservas_negocio('reservas-smoke', true) IS NULL THEN RAISE EXCEPTION 'R1: la página de la cita no ve el negocio'; END IF;
  UPDATE configuracion_tenant SET modulo_reservas_activo = true WHERE tenant_id = v_t;
  IF (modulos_efectivos(v_t)->'efectivos'->>'reservas') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'R1: debía quedar encendido'; END IF;
  UPDATE tenants SET operacion = operacion || '{"agenda":false}' WHERE id = v_t;
  IF (modulos_efectivos(v_t)->'efectivos'->>'reservas') IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'R1: sin agenda no hay reservas'; END IF;
  UPDATE tenants SET operacion = operacion || '{"agenda":true}' WHERE id = v_t;
  UPDATE tenant_addons SET activo = false WHERE tenant_id = v_t AND addon_id = (SELECT id FROM addons WHERE codigo = 'TIENDA');
  IF (modulos_efectivos(v_t)->'efectivos'->>'reservas') IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'R1: sin add-on no hay reservas'; END IF;
  UPDATE tenant_addons SET activo = true WHERE tenant_id = v_t AND addon_id = (SELECT id FROM addons WHERE codigo = 'TIENDA');
  -- La cajera no prende el interruptor (guardia de la agenda).
  PERFORM pg_temp.como(v_maria);
  PERFORM pg_temp.debe_fallar(format('UPDATE configuracion_tenant SET agenda_intervalo_min = 30 WHERE tenant_id = %L', v_t),
    'Solo el dueño o un administrador%', 'R1 guardia');
  PERFORM pg_temp.como(NULL);

  -- R2) El negocio para el sitio: sin servicios fuera de línea, nombres cortos, WhatsApp.
  v_neg := reservas_negocio('Reservas-Smoke ');
  IF v_neg IS NULL OR (v_neg->>'tenant')::uuid <> v_t OR v_neg->>'whatsapp' <> '4771234567' THEN
    RAISE EXCEPTION 'R2: negocio %', v_neg; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_neg->'servicios') s WHERE (s->>'producto_id')::uuid = v_valor)
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_neg->'servicios') s WHERE (s->>'producto_id')::uuid = v_corte
                     AND (s->>'anticipo_mxn')::numeric = 0 AND (s->>'duracion_min')::integer = 60) THEN
    RAISE EXCEPTION 'R2: servicios %', v_neg->'servicios'; END IF;
  SELECT string_agg(c->>'nombre_corto', ',' ORDER BY c->>'nombre_corto') INTO v_txt FROM jsonb_array_elements(v_neg->'colaboradores') c;
  IF v_txt <> 'Diego R.,María G.' THEN RAISE EXCEPTION 'R2: colaboradores %', v_txt; END IF;
  IF (v_neg->'sucursales'->0->'horario'->(CASE WHEN extract(dow FROM d) = 0 THEN 7 ELSE extract(dow FROM d)::integer END)::text)
     IS DISTINCT FROM '["09:00", "18:00"]'::jsonb OR (v_neg->'reglas'->>'intervalo_min')::integer <> 15
     OR (v_neg->'reglas'->>'pago_en_linea_disponible')::boolean THEN
    RAISE EXCEPTION 'R2: sucursal o reglas % %', v_neg->'sucursales', v_neg->'reglas'; END IF;

  -- R3) Horario: corte con María de 09:00 a 17:00 cada 15 min.
  v_txt := pg_temp.huecos(d, pg_temp.s(v_corte, v_maria));
  IF v_txt NOT LIKE ',09:00,09:15,%,16:45,17:00,' OR array_length(string_to_array(trim(both ',' FROM v_txt), ','), 1) <> 33 THEN
    RAISE EXCEPTION 'R3: %', v_txt; END IF;

  -- R4) Comida de Diego (13–14): 12:30 sí, 12:45/13:00/13:45 no, 14:00 sí.
  v_txt := pg_temp.huecos(d, pg_temp.s(v_pedi, v_diego));
  IF v_txt NOT LIKE '%,12:30,%' OR v_txt LIKE '%,12:45,%' OR v_txt LIKE '%,13:00,%' OR v_txt LIKE '%,13:45,%' OR v_txt NOT LIKE '%,14:00,%' THEN
    RAISE EXCEPTION 'R4: %', v_txt; END IF;

  -- R5) Ausencia: María ausente no ofrece nada; «quien esté libre» cae en Diego (sin su comida).
  INSERT INTO ausencias_colaborador (tenant_id, usuario_id, desde, hasta) VALUES (v_t, v_maria, d, d);
  IF pg_temp.huecos(d, pg_temp.s(v_corte, v_maria)) <> ',,' THEN RAISE EXCEPTION 'R5: María ausente ofrece horarios'; END IF;
  v_txt := pg_temp.huecos(d, pg_temp.s(v_corte));
  IF v_txt NOT LIKE ',09:00,%' OR v_txt LIKE '%,12:30,%' THEN RAISE EXCEPTION 'R5: libre con María ausente %', v_txt; END IF;
  DELETE FROM ausencias_colaborador WHERE tenant_id = v_t;

  -- R6) Empalme con una cita de la caja (María 10–11).
  PERFORM pg_temp.como(v_maria);
  PERFORM guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'Caja 1', 'inicia', pg_temp.a(d, '10:00'),
            'servicios', pg_temp.s(v_corte, v_maria)));
  PERFORM pg_temp.como(NULL);
  v_txt := pg_temp.huecos(d, pg_temp.s(v_corte, v_maria));
  IF v_txt NOT LIKE ',09:00,%' OR v_txt LIKE '%,09:15,%' OR v_txt LIKE '%,10:00,%' OR v_txt LIKE '%,10:45,%' OR v_txt NOT LIKE '%,11:00,%' THEN
    RAISE EXCEPTION 'R6: %', v_txt; END IF;

  -- R7) Un tramo marcado con empalme también ocupa (el EXCLUDE no lo ve).
  PERFORM pg_temp.como(v_maria);
  v_c1 := guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'Caja 2', 'inicia', pg_temp.a(d, '15:00'),
            'servicios', pg_temp.s(v_pedi, v_diego)));
  PERFORM pg_temp.como(NULL);
  UPDATE citas_servicios SET empalme = true WHERE cita_id = v_c1;
  v_txt := pg_temp.huecos(d, pg_temp.s(v_pedi, v_diego));
  IF v_txt LIKE '%,15:00,%' OR v_txt LIKE '%,14:45,%' OR v_txt NOT LIKE '%,15:30,%' THEN RAISE EXCEPTION 'R7: %', v_txt; END IF;
  PERFORM pg_temp.debe_fallar(format('SELECT pg_temp.reservar(%L, %L, %L)', pg_temp.a(d, '15:00'), pg_temp.s(v_pedi, v_diego), 'smk-r7-0001'),
    'HUECO_OCUPADO: Ese horario ya no está disponible', 'R7 reservar sobre marcada');

  -- R8) Espacio: con la cabina ocupada (facial de María 11–12), Diego libre no ofrece facial a las 11.
  PERFORM pg_temp.como(v_maria);
  PERFORM guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'Caja 3', 'inicia', pg_temp.a(d, '11:00'),
            'servicios', pg_temp.s(v_facial, v_maria)));
  PERFORM pg_temp.como(NULL);
  v_txt := pg_temp.huecos(d, pg_temp.s(v_facial, v_diego));
  IF v_txt LIKE '%,11:00,%' OR v_txt LIKE '%,10:15,%' OR v_txt NOT LIKE '%,12:00,%' THEN RAISE EXCEPTION 'R8: %', v_txt; END IF;

  -- R9) Intervalo de 30 minutos.
  UPDATE configuracion_tenant SET agenda_intervalo_min = 30 WHERE tenant_id = v_t;
  v_txt := pg_temp.huecos(d, pg_temp.s(v_corte, v_maria));
  IF v_txt NOT LIKE ',09:00,12:00,12:30,%' OR v_txt ~ ':(15|45),' THEN RAISE EXCEPTION 'R9: %', v_txt; END IF;
  UPDATE configuracion_tenant SET agenda_intervalo_min = 15 WHERE tenant_id = v_t;

  -- R10) Aviso mínimo: mañana con 72 h de aviso no hay nada; con 0, sí.
  UPDATE configuracion_tenant SET agenda_aviso_min_horas = 72 WHERE tenant_id = v_t;
  IF pg_temp.huecos(v_hoy + 1, pg_temp.s(v_corte, v_maria)) <> ',,' THEN RAISE EXCEPTION 'R10: con 72 h de aviso ofrece mañana'; END IF;
  UPDATE configuracion_tenant SET agenda_aviso_min_horas = 0 WHERE tenant_id = v_t;
  IF pg_temp.huecos(v_hoy + 1, pg_temp.s(v_corte, v_maria)) = ',,' THEN RAISE EXCEPTION 'R10: sin aviso no ofrece mañana'; END IF;
  UPDATE configuracion_tenant SET agenda_aviso_min_horas = 2 WHERE tenant_id = v_t;
  PERFORM pg_temp.debe_fallar(format('SELECT pg_temp.reservar(%L, %L, %L)', date_trunc('hour', now()) + interval '1 hour',
    pg_temp.s(v_corte), 'smk-r10-0001'), 'HUECO_OCUPADO:%', 'R10 reservar dentro del aviso');

  -- R11) Días: a 3 días, la semana próxima no se ofrece; pasado mañana sí; ayer nunca.
  UPDATE configuracion_tenant SET agenda_dias_reserva = 3 WHERE tenant_id = v_t;
  IF pg_temp.huecos(d, pg_temp.s(v_corte, v_maria)) <> ',,' THEN RAISE EXCEPTION 'R11: ofrece fuera de los días'; END IF;
  IF pg_temp.huecos(v_hoy + 2, pg_temp.s(v_corte, v_maria)) = ',,' THEN RAISE EXCEPTION 'R11: no ofrece pasado mañana'; END IF;
  PERFORM pg_temp.debe_fallar(format('SELECT pg_temp.reservar(%L, %L, %L)', pg_temp.a(d, '09:00'), pg_temp.s(v_corte), 'smk-r11-0001'),
    'DATOS_INVALIDOS: ese horario no se ofrece.', 'R11 reservar fuera de los días');
  UPDATE configuracion_tenant SET agenda_dias_reserva = 30 WHERE tenant_id = v_t;
  IF pg_temp.huecos(v_hoy - 1, pg_temp.s(v_corte, v_maria)) <> ',,' THEN RAISE EXCEPTION 'R11: ofrece ayer'; END IF;
  PERFORM pg_temp.debe_fallar(format('SELECT pg_temp.reservar(%L, %L, %L)', pg_temp.a(d, '09:07'), pg_temp.s(v_corte), 'smk-r11-0002'),
    'DATOS_INVALIDOS: ese horario no se ofrece.', 'R11 fuera del intervalo');

  -- R12) Cadena de dos servicios con colaboradores distintos: manicure (María 45) + pedicure (Diego 30).
  v_txt := pg_temp.huecos(d, jsonb_build_array(jsonb_build_object('producto_id', v_mani, 'usuario_id', v_maria),
                                               jsonb_build_object('producto_id', v_pedi, 'usuario_id', v_diego)));
  IF v_txt NOT LIKE '%,16:00,%' OR v_txt NOT LIKE '%,16:45,%' OR v_txt LIKE '%,17:00,%' OR v_txt LIKE '%,12:15,%' THEN
    RAISE EXCEPTION 'R12: %', v_txt; END IF;

  -- R13) «Quien esté libre»: a las 10 María está ocupada pero Diego no; con Diego ocupado, nadie.
  IF pg_temp.huecos(d, pg_temp.s(v_corte)) NOT LIKE '%,10:00,%' THEN RAISE EXCEPTION 'R13: libre a las 10 debía haber uno'; END IF;
  PERFORM pg_temp.como(v_maria);
  PERFORM guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'Caja 4', 'inicia', pg_temp.a(d, '10:00'),
            'servicios', pg_temp.s(v_corte, v_diego)));
  -- María suma una tercera cita ese día (Diego lleva dos): el libre de las 9 debe ser Diego.
  PERFORM guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'Caja 5', 'inicia', pg_temp.a(d, '17:00'),
            'servicios', pg_temp.s(v_corte, v_maria)));
  PERFORM pg_temp.como(NULL);
  IF pg_temp.huecos(d, pg_temp.s(v_corte)) LIKE '%,10:00,%' THEN RAISE EXCEPTION 'R13: a las 10 ya no hay nadie'; END IF;

  -- R14) Reservar: nace AGENDADA, EN_LINEA, con el colaborador de menos citas y el enlace hasheado.
  v_r := pg_temp.reservar(pg_temp.a(d, '09:00'), pg_temp.s(v_corte), 'smk-res-0001');
  v_c2 := (v_r->>'cita_id')::uuid;
  v_hash := pg_temp.h(v_r->>'codigo');
  SELECT * INTO r FROM citas WHERE id = v_c2;
  IF (v_r->>'codigo') !~ '^[A-Za-z0-9_-]{22}$' OR r.enlace_hash <> v_hash OR r.estado <> 'AGENDADA' OR r.canal <> 'EN_LINEA'
     OR r.client_id_local <> ('web:' || pg_temp.h('smk-res-0001')) OR r.reservo_email <> 'ana.web@example.com' OR r.pago_hasta IS NOT NULL
     OR (v_r->>'anticipo_mxn')::numeric <> 0 OR r.termina <> pg_temp.a(d, '10:00') THEN
    RAISE EXCEPTION 'R14: % %', v_r, to_jsonb(r); END IF;
  IF (SELECT usuario_id FROM citas_servicios WHERE cita_id = v_c2) <> v_diego OR v_r->'resumen'->>'colaborador' <> 'Diego R.'
     OR v_r->'resumen'->>'hora' <> '09:00' THEN
    RAISE EXCEPTION 'R14: debía tocar Diego (menos citas): %', v_r->'resumen'; END IF;
  IF (SELECT telefono FROM clientes WHERE id = r.cliente_id) <> '4770002241' THEN RAISE EXCEPTION 'R14: no creó a la clienta'; END IF;

  -- R15) Dos clientas, mismo horario: Diego ya no; la libre cae en María; la tercera ya no cabe.
  PERFORM pg_temp.debe_fallar(format('SELECT pg_temp.reservar(%L, %L, %L)', pg_temp.a(d, '09:00'), pg_temp.s(v_corte, v_diego), 'smk-res-0002'),
    'HUECO_OCUPADO: Ese horario ya no está disponible', 'R15 Diego ocupado');
  v_r2 := pg_temp.reservar(pg_temp.a(d, '09:00'), pg_temp.s(v_corte), 'smk-res-0003', '4770002243');
  IF (SELECT usuario_id FROM citas_servicios WHERE cita_id = (v_r2->>'cita_id')::uuid) <> v_maria THEN RAISE EXCEPTION 'R15: debía tocar María'; END IF;
  PERFORM pg_temp.debe_fallar(format('SELECT pg_temp.reservar(%L, %L, %L)', pg_temp.a(d, '09:00'), pg_temp.s(v_corte), 'smk-res-0004'),
    'HUECO_OCUPADO: Ese horario ya no está disponible', 'R15 tercera');
  IF pg_temp.huecos(d, pg_temp.s(v_corte)) LIKE '%,09:00,%' THEN RAISE EXCEPTION 'R15: las 9 siguen ofrecidas'; END IF;

  -- R16) Clave idempotente: misma cita, sin código nuevo.
  v_r2 := pg_temp.reservar(pg_temp.a(d, '09:00'), pg_temp.s(v_corte), 'smk-res-0001');
  IF (v_r2->>'cita_id')::uuid <> v_c2 OR v_r2->>'codigo' IS NOT NULL
     OR (SELECT count(*) FROM citas WHERE tenant_id = v_t AND client_id_local = ('web:' || pg_temp.h('smk-res-0001'))) <> 1 THEN
    RAISE EXCEPTION 'R16: %', v_r2; END IF;
  PERFORM pg_temp.debe_fallar(format('SELECT pg_temp.reservar(%L, %L, %L)', pg_temp.a(d, '12:00'), pg_temp.s(v_corte), 'x'),
    'DATOS_INVALIDOS: falta la clave%', 'R16 clave corta');

  -- R17) La clienta se reutiliza por teléfono (con otro formato) y no se edita.
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_t, 'Lucía', '477-000-2242') RETURNING id INTO v_lucia;
  v_r := pg_temp.reservar(pg_temp.a(d, '12:00'), pg_temp.s(v_corte, v_maria), 'smk-res-0005', '4770002242');
  v_c3 := (v_r->>'cita_id')::uuid;
  v_hash2 := pg_temp.h(v_r->>'codigo');
  IF (SELECT cliente_id FROM citas WHERE id = v_c3) <> v_lucia OR (SELECT nombre FROM clientes WHERE id = v_lucia) <> 'Lucía'
     OR (SELECT count(*) FROM clientes WHERE tenant_id = v_t AND regexp_replace(telefono, '\D', '', 'g') = '4770002242') <> 1 THEN
    RAISE EXCEPTION 'R17: no reutilizó a la clienta'; END IF;

  -- R18) La cita del enlace.
  v_r := agenda_cita_publica(v_t, v_hash);
  IF v_r->>'estado' <> 'AGENDADA' OR v_r->>'hora' <> '09:00' OR v_r->>'colaborador' <> 'Diego R.' OR v_r->>'whatsapp' <> '4771234567'
     OR (v_r->>'puede_cambiar')::boolean IS NOT TRUE OR (v_r->>'anticipo_mxn')::numeric <> 0 THEN
    RAISE EXCEPTION 'R18: %', v_r; END IF;
  IF agenda_cita_publica(v_t, pg_temp.h('otro-codigo')) IS NOT NULL OR agenda_cita_publica(v_t, 'no-es-hash') IS NOT NULL THEN
    RAISE EXCEPTION 'R18: un hash ajeno ve una cita'; END IF;

  -- R19) Cancelar a tiempo: CLIENTA_EN_LINEA, libera el lugar; no se cancela dos veces.
  v_r := agenda_cancelar_en_linea(v_t, v_hash2);
  SELECT * INTO r FROM citas WHERE id = v_c3;
  IF r.estado <> 'CANCELADA' OR r.cancelada_por <> 'CLIENTA_EN_LINEA' OR r.cancelada_motivo <> 'Cancelada por la clienta en línea'
     OR v_r->>'estado' <> 'CANCELADA' OR (v_r->>'puede_cambiar')::boolean THEN
    RAISE EXCEPTION 'R19: % %', to_jsonb(r), v_r; END IF;
  IF v_r->>'cancelada_motivo' <> 'Cancelada por ti' THEN RAISE EXCEPTION 'R19: motivo público %', v_r->>'cancelada_motivo'; END IF;
  IF (SELECT bool_or(activa) FROM citas_servicios WHERE cita_id = v_c3) THEN RAISE EXCEPTION 'R19: sigue ocupando'; END IF;
  PERFORM pg_temp.debe_fallar(format('SELECT agenda_cancelar_en_linea(%L, %L)', v_t, v_hash2), 'DATOS_INVALIDOS: la cita ya no se puede cambiar.', 'R19 dos veces');

  -- R20) Mover a tiempo: misma colaboradora, otra hora; el hueco viejo se libera.
  v_r := agenda_mover_en_linea(v_t, v_hash, pg_temp.a(d, '16:00'));
  IF v_r->>'hora' <> '16:00' OR (SELECT usuario_id FROM citas_servicios WHERE cita_id = v_c2) <> v_diego
     OR (SELECT termina FROM citas WHERE id = v_c2) <> pg_temp.a(d, '17:00') THEN
    RAISE EXCEPTION 'R20: %', v_r; END IF;
  IF pg_temp.huecos(d, pg_temp.s(v_corte, v_diego)) NOT LIKE ',09:00,%' THEN RAISE EXCEPTION 'R20: las 9 de Diego no se liberaron'; END IF;
  PERFORM pg_temp.debe_fallar(format('SELECT agenda_mover_en_linea(%L, %L, %L)', v_t, v_hash, pg_temp.a(d, '15:00')),
    'HUECO_OCUPADO: Ese horario ya no está disponible', 'R20 mover a ocupado');
  IF (SELECT inicia FROM citas WHERE id = v_c2) <> pg_temp.a(d, '16:00') OR (SELECT count(*) FROM citas_servicios WHERE cita_id = v_c2) <> 1 THEN
    RAISE EXCEPTION 'R20: el intento fallido movió la cita'; END IF;
  PERFORM pg_temp.debe_fallar(format('SELECT agenda_mover_en_linea(%L, %L, %L)', v_t, v_hash, pg_temp.a(d, '16:10')),
    'DATOS_INVALIDOS: ese horario no se ofrece.', 'R20 fuera del intervalo');
  PERFORM pg_temp.debe_fallar(format('SELECT agenda_mover_en_linea(%L, %L, %L)', v_t, v_hash, pg_temp.a(v_hoy + 60, '10:00')),
    'DATOS_INVALIDOS: ese horario no se ofrece.', 'R20 fuera de los días');
  PERFORM pg_temp.debe_fallar(format('SELECT agenda_mover_en_linea(%L, %L, %L)', v_t, v_hash, date_trunc('hour', now()) - interval '1 hour'),
    'HUECO_OCUPADO:%', 'R20 al pasado');
  -- 15 minutos después se encima sobre su propio tramo: con la exclusión se ofrece y se puede mover.
  -- La exclusión va por el enlace (hash) y solo dentro del negocio; un hash ajeno no excluye nada.
  IF pg_temp.huecos(d, pg_temp.s(v_corte, v_diego)) LIKE '%,16:15,%'
     OR pg_temp.huecos(d, pg_temp.s(v_corte, v_diego), pg_temp.h('otro-codigo')) LIKE '%,16:15,%'
     OR pg_temp.huecos(d, pg_temp.s(v_corte, v_diego), v_hash) NOT LIKE '%,16:15,%' THEN
    RAISE EXCEPTION 'R20: la exclusión de la propia cita no funciona'; END IF;
  v_r := agenda_mover_en_linea(v_t, v_hash, pg_temp.a(d, '16:15'));
  IF v_r->>'hora' <> '16:15' OR (SELECT termina FROM citas WHERE id = v_c2) <> pg_temp.a(d, '17:15')
     OR (SELECT count(*) FROM citas_servicios WHERE cita_id = v_c2) <> 1 THEN
    RAISE EXCEPTION 'R20: mover 15 min sobre sí misma: %', v_r; END IF;

  -- R21) Fuera de plazo (48 h antes; la cita es mañana): ni cancelar ni mover.
  v_r := pg_temp.reservar(pg_temp.a(v_hoy + 1, '12:00'), pg_temp.s(v_corte, v_maria), 'smk-res-0006');
  v_hash2 := pg_temp.h(v_r->>'codigo');
  UPDATE configuracion_tenant SET agenda_cancelar_horas = 48 WHERE tenant_id = v_t;
  IF (agenda_cita_publica(v_t, v_hash2)->>'puede_cambiar')::boolean THEN RAISE EXCEPTION 'R21: dentro del plazo se puede cambiar'; END IF;
  PERFORM pg_temp.debe_fallar(format('SELECT agenda_cancelar_en_linea(%L, %L)', v_t, v_hash2),
    'FUERA_DE_PLAZO: Para cambios, comunícate con el negocio', 'R21 cancelar tarde');
  PERFORM pg_temp.debe_fallar(format('SELECT agenda_mover_en_linea(%L, %L, %L)', v_t, v_hash2, pg_temp.a(d, '14:00')),
    'FUERA_DE_PLAZO:%', 'R21 mover tarde');
  UPDATE configuracion_tenant SET agenda_cancelar_horas = 24 WHERE tenant_id = v_t;

  -- R22) Anticipo: sin cobro en línea no se reserva; con él, aparta 15 min y vence solo.
  UPDATE configuracion_tenant SET agenda_cobro_modo = 'ANTICIPO' WHERE tenant_id = v_t;
  UPDATE servicios_agenda SET anticipo_tipo = 'PORCENTAJE', anticipo_valor = 50 WHERE producto_id = v_corte;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(reservas_negocio('reservas-smoke')->'servicios') s
                  WHERE (s->>'producto_id')::uuid = v_corte AND (s->>'anticipo_mxn')::numeric = 100) THEN
    RAISE EXCEPTION 'R22: el negocio no anuncia el anticipo del corte'; END IF;
  PERFORM pg_temp.debe_fallar(format('SELECT pg_temp.reservar(%L, %L, %L)', pg_temp.a(d, '13:00'), pg_temp.s(v_corte, v_maria), 'smk-res-0007', '4770002246'),
    'PAGO_NO_DISPONIBLE:%', 'R22 sin cobro en línea');
  IF EXISTS (SELECT 1 FROM citas WHERE client_id_local = ('web:' || pg_temp.h('smk-res-0007'))) THEN RAISE EXCEPTION 'R22: quedó la cita sin cobro'; END IF;
  UPDATE tienda_config SET pago_en_linea = true WHERE tenant_id = v_t;
  INSERT INTO tienda_conexiones (tenant_id, cuenta_id_externo, public_key) VALUES (v_t, '2240', 'APP_USR-smoke-reservas-00000001') RETURNING id INTO v_cx;
  INSERT INTO tienda_sucursales (sucursal_id, tenant_id, participa) VALUES (v_suc, v_t, true)
    ON CONFLICT (sucursal_id) DO UPDATE SET pago_pausado_hasta = NULL, conexion_id = NULL;
  UPDATE cajas SET espejo_turno_abierto_at = now(), espejo_apps_at = NULL, version_app = NULL WHERE sucursal_id = v_suc;
  IF tienda_conexion_cobro(v_t, v_suc) IS NULL THEN RAISE EXCEPTION 'R22 fixture: sin cobro en línea'; END IF;
  IF (reservas_negocio('reservas-smoke')->'reglas'->>'pago_en_linea_disponible')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'R22: el negocio no anuncia el pago en línea'; END IF;
  v_r := pg_temp.reservar(pg_temp.a(d, '13:00'), pg_temp.s(v_corte, v_maria), 'smk-res-0007', '4770002246');
  v_c1 := (v_r->>'cita_id')::uuid;
  SELECT * INTO r FROM citas WHERE id = v_c1;
  IF (v_r->>'anticipo_mxn')::numeric <> 100 OR r.pago_hasta NOT BETWEEN now() + interval '14 minutes' AND now() + interval '16 minutes' THEN
    RAISE EXCEPTION 'R22: anticipo % pago_hasta %', v_r->>'anticipo_mxn', r.pago_hasta; END IF;
  -- Mover conserva el apartado.
  PERFORM agenda_mover_en_linea(v_t, pg_temp.h(v_r->>'codigo'), pg_temp.a(d, '13:15'));
  IF (SELECT pago_hasta FROM citas WHERE id = v_c1) IS DISTINCT FROM r.pago_hasta THEN RAISE EXCEPTION 'R22: mover perdió el apartado'; END IF;
  -- Otra con su anticipo ya pagado (VIGENTE): esa no vence.
  v_r2 := pg_temp.reservar(pg_temp.a(d, '14:30'), pg_temp.s(v_corte, v_maria), 'smk-res-0008', '4770002247');
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_t, v_suc, v_caja, 'SMK-0224', v_hoy, v_maria, 500, 'TOTAL') RETURNING id INTO v_turno;
  INSERT INTO anticipos_cita (tenant_id, sucursal_id, caja_id, turno_id, cita_id, metodo_pago, monto_mxn)
  VALUES (v_t, v_suc, v_caja, v_turno, (v_r2->>'cita_id')::uuid, 'EFECTIVO', 100);
  UPDATE citas SET pago_hasta = now() - interval '1 minute' WHERE id IN (v_c1, (v_r2->>'cita_id')::uuid);
  -- Sin cobro en curso (0225: una cita con su pago CREADO la vence el barrido de pagos, no esta).
  DELETE FROM tienda_pagos WHERE cita_id IN (v_c1, (v_r2->>'cita_id')::uuid);
  v_n := agenda_vencer_reservas();
  SELECT * INTO r FROM citas WHERE id = v_c1;
  IF v_n <> 1 OR r.estado <> 'CANCELADA' OR r.cancelada_motivo <> 'No se completó el pago' OR r.cancelada_por <> 'PAGO_VENCIDO'
     OR (SELECT estado FROM citas WHERE id = (v_r2->>'cita_id')::uuid) <> 'AGENDADA' THEN
    RAISE EXCEPTION 'R22: vencer % %', v_n, to_jsonb(r); END IF;
  IF pg_temp.huecos(d, pg_temp.s(v_corte, v_maria)) NOT LIKE '%,13:15,%' THEN RAISE EXCEPTION 'R22: el lugar vencido no se liberó'; END IF;
  IF agenda_vencer_reservas() <> 0 THEN RAISE EXCEPTION 'R22: vencer no es idempotente'; END IF;
  IF agenda_cita_publica(v_t, pg_temp.h(v_r->>'codigo'))->>'cancelada_motivo' <> 'No se completó el pago' THEN
    RAISE EXCEPTION 'R22: motivo público del vencimiento'; END IF;
  UPDATE configuracion_tenant SET agenda_cobro_modo = 'AL_FINAL' WHERE tenant_id = v_t;

  -- R23) Servicio fuera de línea: ni huecos ni reserva.
  PERFORM pg_temp.debe_fallar(format('SELECT pg_temp.huecos(%L, %L)', d, pg_temp.s(v_valor)),
    'DATOS_INVALIDOS: un servicio no se ofrece en línea%', 'R23 huecos');
  PERFORM pg_temp.debe_fallar(format('SELECT pg_temp.reservar(%L, %L, %L)', pg_temp.a(d, '09:30'), pg_temp.s(v_valor), 'smk-res-0009'),
    'DATOS_INVALIDOS: un servicio no se ofrece en línea%', 'R23 reservar');
  PERFORM pg_temp.debe_fallar(format('SELECT pg_temp.huecos(%L, %L)', d, '[{"producto_id":"no-es-uuid"}]'),
    'DATOS_INVALIDOS: un servicio no se ofrece en línea%', 'R23 uuid mal escrito');

  -- R24) Otro negocio no ve ni toca nada.
  IF agenda_cita_publica(v_otro, v_hash) IS NOT NULL THEN RAISE EXCEPTION 'R24: otro negocio ve la cita'; END IF;
  PERFORM pg_temp.debe_fallar(format('SELECT agenda_cancelar_en_linea(%L, %L)', v_otro, v_hash), 'DATOS_INVALIDOS:%', 'R24 cancelar');
  PERFORM pg_temp.debe_fallar(format('SELECT agenda_mover_en_linea(%L, %L, %L)', v_otro, v_hash, pg_temp.a(d, '12:00')),
    'DATOS_INVALIDOS:%', 'R24 mover');
  PERFORM pg_temp.debe_fallar(format('SELECT count(*) FROM agenda_huecos(%L, %L, %L, %L)', v_otro, v_suc, d, pg_temp.s(v_corte)),
    'DATOS_INVALIDOS: este negocio no tiene reservas en línea.', 'R24 huecos');
  -- Aun con reservas encendidas, la sucursal y el catálogo de otro negocio no pasan.
  INSERT INTO configuracion_tenant (tenant_id, modulo_reservas_activo) VALUES (v_otro, true);
  UPDATE tenants SET operacion = '{"agenda":true}' WHERE id = v_otro;
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
  VALUES (v_otro, (SELECT id FROM addons WHERE codigo = 'TIENDA'), v_hoy, true, 100.00);
  PERFORM pg_temp.debe_fallar(format('SELECT agenda_reservar_en_linea(%L, %L)', v_otro, jsonb_build_object('sucursal_id', v_suc,
    'inicia', pg_temp.a(d, '12:00'), 'servicios', pg_temp.s(v_corte), 'clave', 'smk-otro-0001',
    'cliente', jsonb_build_object('nombre', 'X', 'telefono', '4770000000', 'email', 'x@example.com'))),
    'DATOS_INVALIDOS: la sucursal no es de este negocio.', 'R24 reservar en sucursal ajena');
  PERFORM pg_temp.debe_fallar(format('SELECT agenda_cancelar_en_linea(%L, %L)', v_otro, v_hash), 'DATOS_INVALIDOS: la cita no existe.', 'R24 cancelar con reservas');
  IF agenda_cita_publica(v_otro, v_hash) IS NOT NULL THEN RAISE EXCEPTION 'R24: otro negocio ve la cita con reservas'; END IF;

  -- R25) Caja: cancelar_cita anota CAJA; colaborador_libre (JWT) sigue funcionando.
  PERFORM pg_temp.como(v_maria);
  PERFORM cancelar_cita((v_r2->>'cita_id')::uuid, 'La clienta llamó');
  IF (SELECT cancelada_por FROM citas WHERE id = (v_r2->>'cita_id')::uuid) <> 'CAJA' THEN RAISE EXCEPTION 'R25: cancelar_cita no anotó CAJA'; END IF;
  -- El motivo que escribió la recepción no sale al sitio.
  IF agenda_cita_publica(v_t, pg_temp.h(v_r2->>'codigo'))->>'cancelada_motivo' <> 'Cancelada por el negocio' THEN
    RAISE EXCEPTION 'R25: el sitio ve el motivo de la caja'; END IF;
  IF colaborador_libre(v_suc, v_corte, pg_temp.a(d, '14:30')) IS NULL THEN RAISE EXCEPTION 'R25: colaborador_libre dejó de funcionar'; END IF;
  PERFORM pg_temp.como(NULL);

  -- R27) Entrada mal formada: DATOS_INVALIDOS con mensaje claro, nunca un error crudo de cast.
  PERFORM pg_temp.debe_fallar(format('SELECT agenda_reservar_en_linea(%L, %L)', v_t, '"x"'),
    'DATOS_INVALIDOS: faltan los datos de la reserva.', 'R27 no es objeto');
  PERFORM pg_temp.debe_fallar(format('SELECT agenda_reservar_en_linea(%L, %L)', v_t, jsonb_build_object('sucursal_id', 'no-uuid',
    'inicia', pg_temp.a(e, '09:00'), 'servicios', pg_temp.s(v_corte), 'clave', 'smk-mal-0001',
    'cliente', jsonb_build_object('nombre', 'X', 'telefono', '4770000000', 'email', 'x@example.com'))),
    'DATOS_INVALIDOS: la sucursal no es válida.', 'R27 sucursal');
  PERFORM pg_temp.debe_fallar(format('SELECT agenda_reservar_en_linea(%L, %L)', v_t, jsonb_build_object('sucursal_id', v_suc,
    'inicia', 'mañana temprano', 'servicios', pg_temp.s(v_corte), 'clave', 'smk-mal-0002',
    'cliente', jsonb_build_object('nombre', 'X', 'telefono', '4770000000', 'email', 'x@example.com'))),
    'DATOS_INVALIDOS: la hora de la cita no es válida.', 'R27 hora');
  PERFORM pg_temp.debe_fallar(format('SELECT pg_temp.reservar(%L, %L, %L, %L)', pg_temp.a(e, '09:00'), pg_temp.s(v_corte), 'smk-mal-0003', 'abc'),
    'DATOS_INVALIDOS: el celular debe tener 10 dígitos.', 'R27 celular');

  -- R28) Celular a 10 dígitos: «+52 1 …» encuentra a la clienta guardada como «+52 …».
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_t, 'Rosa', '+52 477 000 2244') RETURNING id INTO v_rosa;
  v_r := pg_temp.reservar(pg_temp.a(e, '09:00'), pg_temp.s(v_corte, v_maria), 'smk-res-0010', '+52 1 477 000 2244');
  SELECT * INTO r FROM citas WHERE id = (v_r->>'cita_id')::uuid;
  IF r.cliente_id <> v_rosa OR r.cliente_telefono <> '4770002244' THEN RAISE EXCEPTION 'R28: %', to_jsonb(r); END IF;

  -- R29) Clienta bloqueada: mensaje genérico (no se dice que está bloqueada) y sin cita.
  UPDATE clientes SET estado = 'BLOQUEADO', motivo_bloqueo = 'Smoke' WHERE id = v_lucia;
  PERFORM pg_temp.debe_fallar(format('SELECT pg_temp.reservar(%L, %L, %L, %L)', pg_temp.a(e, '10:00'), pg_temp.s(v_corte, v_maria), 'smk-res-0011', '4770002242'),
    'DATOS_INVALIDOS: No pudimos apartar tu cita. Comunícate con el negocio.', 'R29 bloqueada');
  IF EXISTS (SELECT 1 FROM citas WHERE client_id_local = ('web:' || pg_temp.h('smk-res-0011'))) THEN RAISE EXCEPTION 'R29: quedó la cita'; END IF;

  -- R30) Tope: 3 citas por llegar por celular; al cancelar una, cabe otra.
  v_r := pg_temp.reservar(pg_temp.a(e, '10:00'), pg_temp.s(v_corte, v_maria), 'smk-res-0012', '477 000 2250');
  v_h := pg_temp.h(v_r->>'codigo');
  PERFORM pg_temp.reservar(pg_temp.a(e, '11:00'), pg_temp.s(v_corte, v_maria), 'smk-res-0013', '4770002250');
  v_r2 := pg_temp.reservar(pg_temp.a(e, '12:00'), pg_temp.s(v_corte, v_maria), 'smk-res-0014', '4770002250');
  PERFORM pg_temp.debe_fallar(format('SELECT pg_temp.reservar(%L, %L, %L, %L)', pg_temp.a(e, '13:00'), pg_temp.s(v_corte, v_maria), 'smk-res-0015', '+524770002250'),
    'LIMITE_RESERVAS: Ya tienes 3 citas apartadas; para más, comunícate con el negocio.', 'R30 cuarta');
  PERFORM agenda_cancelar_en_linea(v_t, v_h);
  PERFORM pg_temp.reservar(pg_temp.a(e, '13:00'), pg_temp.s(v_corte, v_maria), 'smk-res-0016', '4770002250');

  -- R31) Negocio bloqueado después de resolverse el sitio: ni reservar ni cancelar.
  UPDATE tenants SET bloqueo_desde = now() - interval '1 minute' WHERE id = v_t;
  PERFORM pg_temp.debe_fallar(format('SELECT pg_temp.reservar(%L, %L, %L)', pg_temp.a(e, '15:00'), pg_temp.s(v_corte, v_maria), 'smk-res-0017'),
    'DATOS_INVALIDOS: este negocio no tiene reservas en línea.', 'R31 reservar');
  PERFORM pg_temp.debe_fallar(format('SELECT agenda_cancelar_en_linea(%L, %L)', v_t, pg_temp.h(v_r2->>'codigo')),
    'DATOS_INVALIDOS: este negocio no tiene reservas en línea.', 'R31 cancelar');
  IF reservas_negocio('reservas-smoke') IS NOT NULL THEN RAISE EXCEPTION 'R31: el sitio ve un negocio bloqueado'; END IF;
  IF reservas_negocio('reservas-smoke', true) IS NOT NULL THEN RAISE EXCEPTION 'R31: la página de la cita ve un negocio bloqueado'; END IF;
  UPDATE tenants SET bloqueo_desde = NULL WHERE id = v_t;

  -- R26) Permisos: solo service_role ejecuta las RPC; las internas, nadie.
  FOREACH f IN ARRAY ARRAY['reservas_negocio(text, boolean)', 'agenda_huecos(uuid, uuid, date, jsonb, text)', 'agenda_reservar_en_linea(uuid, jsonb)',
                           'agenda_cita_publica(uuid, text)', 'agenda_cancelar_en_linea(uuid, text)',
                           'agenda_mover_en_linea(uuid, text, timestamptz)', 'agenda_vencer_reservas()'] LOOP
    IF has_function_privilege('anon', f, 'execute') OR has_function_privilege('authenticated', f, 'execute')
       OR NOT has_function_privilege('service_role', f, 'execute') THEN
      RAISE EXCEPTION 'R26: permisos de %', f; END IF;
  END LOOP;
  FOREACH f IN ARRAY ARRAY['_colaborador_libre(uuid, uuid, uuid, timestamptz, uuid, uuid)', '_agenda_cadena(uuid, uuid, timestamptz, jsonb, uuid)',
                           '_reservas_validar(uuid, uuid, jsonb, timestamptz)', '_agenda_cita_resumen(uuid)',
                           '_agenda_cita_cambiable(uuid, text)', '_anticipo_cita(uuid, uuid)', '_nombre_corto(uuid)', '_telefono_10(text)', '_reservas_negocio_vivo(uuid)',
                           '_reservas_oferta(uuid)', '_anticipo_de(text, text, numeric, numeric)'] LOOP
    IF has_function_privilege('anon', f, 'execute') OR has_function_privilege('authenticated', f, 'execute')
       OR has_function_privilege('service_role', f, 'execute') THEN
      RAISE EXCEPTION 'R26: la interna % se ejecuta desde fuera', f; END IF;
  END LOOP;
  IF NOT has_function_privilege('authenticated', 'colaborador_libre(uuid, uuid, timestamptz)', 'execute') THEN
    RAISE EXCEPTION 'R26: colaborador_libre perdió su permiso'; END IF;

  RAISE NOTICE 'belleza reservas OK';
END $$;

ROLLBACK;
