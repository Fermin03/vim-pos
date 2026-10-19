-- Smoke belleza, entrega 3 (migración 0225): el anticipo de una reserva en línea con Mercado Pago.
-- Pago aprobado → anticipo VIGENTE en línea; NO seguro → otro pago; pago tardío sobre una cita
-- vencida → POR_DEVOLVER; cobro en curso no vence; cancelar a tiempo → POR_DEVOLVER → DEVUELTO y el
-- anticipo DEVUELTO; cancelar tarde no devuelve (retener / devolver desde la recepción); cobro en
-- caja sin tocar el efectivo; sync; y un pedido de restaurante con pago en línea igual que antes.
-- Aquí no hay Mercado Pago: se prueba lo que la base decide con lo que las funciones le traen.
-- Sobre la semilla; fechas relativas a hoy (México). ROLLBACK.
-- Uso: cd desktop && npm run smokes -- smoke_belleza_reservas_pago.sql
\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.debe_fallar(q text, patron text, paso text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  EXECUTE q;
  RAISE EXCEPTION '%: no falló: %', paso, q USING ERRCODE = 'P0099';
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE = 'P0099' OR SQLERRM NOT LIKE patron THEN RAISE EXCEPTION '%: %', paso, SQLERRM; END IF;
END $f$;
CREATE FUNCTION pg_temp.a(p_d date, p_h text) RETURNS timestamptz LANGUAGE sql IMMUTABLE
AS $$ SELECT (p_d + p_h::time) AT TIME ZONE 'America/Mexico_City' $$;
CREATE FUNCTION pg_temp.como(p_u uuid) RETURNS void LANGUAGE sql
AS $$ SELECT set_config('request.jwt.claims', CASE WHEN p_u IS NULL THEN NULL ELSE
        json_build_object('sub', p_u, 'role', 'authenticated', 'tenant_id', '99999999-0000-0000-0000-0000000000aa')::text END, true) $$;
-- Una reserva en línea de corte con María (anticipo 50 % de $200 = $100).
CREATE FUNCTION pg_temp.reservar(p_inicia timestamptz, p_clave text, p_tel text, p_freno text DEFAULT NULL) RETURNS jsonb LANGUAGE sql
AS $$ SELECT agenda_reservar_en_linea('99999999-0000-0000-0000-0000000000aa', jsonb_build_object(
        'sucursal_id', '99999999-0000-0000-0000-0000000000bb', 'inicia', p_inicia,
        'servicios', jsonb_build_array(jsonb_build_object('producto_id', '22500000-0000-0000-0000-0000000000a1',
                                                          'usuario_id', '99999999-0000-0000-0000-000000000001')),
        'cliente', jsonb_build_object('nombre', 'Paga Web', 'telefono', p_tel, 'email', 'paga.web@example.com'),
        'clave', p_clave, 'freno_clave', p_freno)) $$;
CREATE FUNCTION pg_temp.h(p_codigo text) RETURNS text LANGUAGE sql IMMUTABLE
AS $$ SELECT encode(sha256(convert_to(p_codigo, 'UTF8')), 'hex') $$;
-- Reserva y paga: devuelve la reserva (con cita_id y codigo).
CREATE FUNCTION pg_temp.pagada(p_inicia timestamptz, p_clave text, p_tel text, p_orden text) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE v jsonb;
BEGIN
  v := pg_temp.reservar(p_inicia, p_clave, p_tel);
  PERFORM tienda_pago_tomar_cobro((v->>'pago_id')::uuid);
  PERFORM tienda_pago_aplicar((v->>'pago_id')::uuid, 'APROBADO', p_orden, 100.00, 'credit_card', 'visa');
  RETURN v;
END $f$;
CREATE FUNCTION pg_temp.ant(p_cita uuid) RETURNS anticipos_cita LANGUAGE sql
AS $$ SELECT * FROM anticipos_cita WHERE cita_id = p_cita AND metodo_pago = 'PAGO_EN_LINEA' ORDER BY created_at, monto_mxn DESC, id LIMIT 1 $$;
CREATE FUNCTION pg_temp.pago(p_cita uuid) RETURNS tienda_pagos LANGUAGE sql
AS $$ SELECT * FROM tienda_pagos WHERE cita_id = p_cita AND NOT extra ORDER BY estado IN ('CREADO', 'APROBADO') DESC, created_at DESC LIMIT 1 $$;

DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_diego  uuid := '99999999-0000-0000-0000-0000000000f1';
  v_corte  uuid := '22500000-0000-0000-0000-0000000000a1';
  v_hoy    date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  d date; e date;
  v_champu uuid := '22500000-0000-0000-0000-0000000000a2';
  v_g2 uuid; v_resto uuid; v_k2 uuid;
  v_cat uuid; v_cx uuid; v_turno uuid; v_auth uuid; v_k uuid; v_ped uuid; v_g uuid;
  v_c1 uuid; v_c2 uuid; v_c3 uuid; v_c4 uuid; v_c5 uuid; v_c6 uuid; v_c7 uuid;
  v_r jsonb; v_r2 jsonb; v_x jsonb; v_res jsonb; v_aj jsonb;
  v_a anticipos_cita; v_p tienda_pagos;
  v_n integer; v_e0 numeric; v_falta numeric; v_correos integer;
BEGIN
  d := v_hoy + 7;
  e := v_hoy + 3;
  PERFORM pg_temp.como(NULL);

  -- ── Fixture: salón con reservas, anticipo del 50 % y cobro en línea ─────────
  INSERT INTO configuracion_tenant (tenant_id) VALUES (v_t) ON CONFLICT (tenant_id) DO NOTHING;
  UPDATE tenants SET vertical_principal = 'SALON', operacion = operacion || '{"agenda":true}' WHERE id = v_t;
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
  SELECT v_t, x.id, v_hoy, true, 100.00 FROM addons x WHERE x.codigo = 'TIENDA'
     AND NOT EXISTS (SELECT 1 FROM tenant_addons ta WHERE ta.tenant_id = v_t AND ta.addon_id = x.id);
  UPDATE tenant_addons SET activo = true WHERE tenant_id = v_t AND addon_id = (SELECT id FROM addons WHERE codigo = 'TIENDA');
  UPDATE configuracion_tenant SET modulo_reservas_activo = true, agenda_cobro_modo = 'ANTICIPO', agenda_cancelar_horas = 24
   WHERE tenant_id = v_t;
  INSERT INTO tienda_config (tenant_id, slug, pago_en_linea) VALUES (v_t, 'pago-reservas-smoke', true)
    ON CONFLICT (tenant_id) DO UPDATE SET slug = EXCLUDED.slug, pago_en_linea = true, pago_pausado_hasta = NULL;
  INSERT INTO tienda_conexiones (tenant_id, cuenta_id_externo, public_key) VALUES (v_t, '2250', 'APP_USR-smoke-pago-reservas-0001')
    RETURNING id INTO v_cx;
  UPDATE tienda_conexiones SET estado = 'DESCONECTADA' WHERE tenant_id = v_t AND id <> v_cx;
  INSERT INTO tienda_sucursales (sucursal_id, tenant_id, participa) VALUES (v_suc, v_t, true)
    ON CONFLICT (sucursal_id) DO UPDATE SET pago_pausado_hasta = NULL, conexion_id = NULL;
  UPDATE cajas SET espejo_turno_abierto_at = now(), espejo_apps_at = NULL, version_app = NULL WHERE sucursal_id = v_suc;
  IF tienda_conexion_cobro(v_t, v_suc) IS DISTINCT FROM v_cx THEN RAISE EXCEPTION 'fixture: sin cobro en línea'; END IF;
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion) VALUES (v_t, 'Pago smoke', 72) RETURNING id INTO v_cat;
  INSERT INTO productos (id, tenant_id, categoria_id, nombre, precio_base_mxn) VALUES (v_corte, v_t, v_cat, 'Corte pago', 200),
    (v_champu, v_t, v_cat, 'Champú pago', 60);
  INSERT INTO servicios_agenda (producto_id, tenant_id, duracion_min, en_linea, anticipo_tipo, anticipo_valor)
  VALUES (v_corte, v_t, 60, true, 'PORCENTAJE', 50);
  INSERT INTO colaboradores_agenda (usuario_id, tenant_id, sucursal_id, color_hex, orden) VALUES (v_maria, v_t, v_suc, '#C2410C', 1)
    ON CONFLICT (tenant_id, usuario_id) DO UPDATE SET sucursal_id = EXCLUDED.sucursal_id, activo = true;
  INSERT INTO servicio_colaborador (producto_id, usuario_id, tenant_id) VALUES (v_corte, v_maria, v_t);
  DELETE FROM horarios_colaborador WHERE tenant_id = v_t AND usuario_id = v_maria;
  INSERT INTO horarios_colaborador (tenant_id, usuario_id, dia_semana, inicia, termina)
  SELECT v_t, v_maria, g, '08:00', '20:00' FROM generate_series(0, 6) g;
  DELETE FROM ausencias_colaborador WHERE tenant_id = v_t;
  -- Lo que ya hubiera en esos días no estorba.
  UPDATE citas SET estado = 'CANCELADA' WHERE tenant_id = v_t AND estado = 'AGENDADA'
     AND (inicia AT TIME ZONE 'America/Mexico_City')::date IN (d, e);
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_t, v_suc, v_caja, 'SMK-0225', v_hoy, v_maria, 500, 'TOTAL') RETURNING id INTO v_turno;
  SELECT count(*) INTO v_correos FROM tienda_correos;

  -- P1) Reservar con anticipo trae su pago (CREADO, $100, de la cita); el reintento, el mismo.
  v_r := pg_temp.reservar(pg_temp.a(d, '09:00'), 'smk-pago-0001', '4770003301');
  v_c1 := (v_r->>'cita_id')::uuid;
  v_p := pg_temp.pago(v_c1);
  IF v_r->>'pago_id' IS NULL OR (v_r->>'pago_id')::uuid <> v_p.id OR v_r->>'total_a_pagar_mxn' <> '100.00'
     OR v_p.estado <> 'CREADO' OR v_p.monto_mxn <> 100 OR v_p.pedido_id IS NOT NULL OR v_p.conexion_id <> v_cx THEN
    RAISE EXCEPTION 'P1: %  %', v_r, to_jsonb(v_p); END IF;
  IF (pg_temp.reservar(pg_temp.a(d, '09:00'), 'smk-pago-0001', '4770003301')->>'pago_id')::uuid IS DISTINCT FROM v_p.id THEN
    RAISE EXCEPTION 'P1: el reintento trajo otro pago'; END IF;
  -- Un pago es de un pedido o de una cita, nunca de los dos ni de ninguno.
  PERFORM pg_temp.debe_fallar(format('UPDATE tienda_pagos SET cita_id = NULL WHERE id = %L', v_p.id),
    '%tienda_pago_pedido_o_cita%', 'P1 sin dueño');

  -- P2) Aprobado: pago APROBADO, anticipo VIGENTE en línea por lo cobrado, sin caja ni turno, y
  --     la cita ya no vence. Un aviso repetido no duplica nada.
  IF NOT tienda_pago_tomar_cobro(v_p.id) THEN RAISE EXCEPTION 'P2: no tomó el cobro'; END IF;
  v_x := tienda_pago_aplicar(v_p.id, 'APROBADO', 'ORDCITA01', 100.00, 'credit_card', 'visa');
  v_a := pg_temp.ant(v_c1);
  IF v_x->>'estado' <> 'APROBADO' OR NOT (v_x->>'recien_aprobado')::boolean OR v_x->>'cita_estado' <> 'AGENDADA'
     OR v_x->'pedido_estado' <> 'null'::jsonb THEN RAISE EXCEPTION 'P2: %', v_x; END IF;
  IF v_a.estado <> 'VIGENTE' OR v_a.monto_mxn <> 100 OR v_a.caja_id IS NOT NULL OR v_a.turno_id IS NOT NULL
     OR v_a.tienda_pago_id <> v_p.id OR v_a.sucursal_id <> v_suc THEN RAISE EXCEPTION 'P2: anticipo %', to_jsonb(v_a); END IF;
  IF (SELECT pago_hasta FROM citas WHERE id = v_c1) IS NOT NULL THEN RAISE EXCEPTION 'P2: pago_hasta no se limpió'; END IF;
  v_x := tienda_pago_aplicar(v_p.id, 'APROBADO', 'ORDCITA01', 100.00, 'credit_card', 'visa');
  IF (v_x->>'recien_aprobado')::boolean OR (SELECT count(*) FROM anticipos_cita WHERE cita_id = v_c1) <> 1 THEN
    RAISE EXCEPTION 'P2: el aviso repetido hizo algo: %', v_x; END IF;
  IF (agenda_cita_publica(v_t, pg_temp.h(v_r->>'codigo'))->>'anticipo_pagado_mxn')::numeric <> 100 THEN
    RAISE EXCEPTION 'P2: la página no ve el anticipo pagado'; END IF;
  UPDATE citas SET pago_hasta = now() - interval '1 minute' WHERE id = v_c1;   -- aun así: tiene anticipo
  PERFORM agenda_vencer_reservas();
  IF (SELECT estado FROM citas WHERE id = v_c1) <> 'AGENDADA' THEN RAISE EXCEPTION 'P2: venció una cita pagada'; END IF;
  UPDATE citas SET pago_hasta = NULL WHERE id = v_c1;
  -- Un cobro de más (otra orden) se devuelve aparte, con la cita.
  PERFORM tienda_pago_aplicar(v_p.id, 'APROBADO', 'ORDCITA01X', 100.00);
  IF NOT EXISTS (SELECT 1 FROM tienda_pagos WHERE cita_id = v_c1 AND extra AND estado = 'POR_DEVOLVER' AND orden_id_externo = 'ORDCITA01X')
     OR (SELECT count(*) FROM anticipos_cita WHERE cita_id = v_c1) <> 1 THEN
    RAISE EXCEPTION 'P2: el cobro de más'; END IF;

  -- P3) Tarjeta rechazada (el aviso llega primero): la cita sigue apartada; descartar deja el pago
  --     RECHAZADO (cuenta como intento) y reservar con la misma clave trae otro.
  v_r2 := pg_temp.reservar(pg_temp.a(d, '11:00'), 'smk-pago-0002', '4770003302');
  v_c2 := (v_r2->>'cita_id')::uuid;
  v_g := (v_r2->>'pago_id')::uuid;
  PERFORM tienda_pago_tomar_cobro(v_g);
  v_x := tienda_pago_aplicar(v_g, 'RECHAZADO', 'ORDCITA02', 100.00, NULL, NULL, 'cc_rejected_insufficient_amount');
  IF v_x->>'estado' <> 'RECHAZADO' OR v_x->>'cita_estado' <> 'AGENDADA' THEN RAISE EXCEPTION 'P3: %', v_x; END IF;
  IF NOT tienda_pago_descartar(v_g) THEN RAISE EXCEPTION 'P3: no descartó'; END IF;
  IF (SELECT estado FROM tienda_pagos WHERE id = v_g) IS DISTINCT FROM 'RECHAZADO'
     OR (SELECT estado FROM citas WHERE id = v_c2) <> 'AGENDADA' THEN RAISE EXCEPTION 'P3: descartar'; END IF;
  v_r2 := pg_temp.reservar(pg_temp.a(d, '11:00'), 'smk-pago-0002', '4770003302');
  IF (v_r2->>'pago_id')::uuid IS NOT DISTINCT FROM v_g OR (v_r2->>'cita_id')::uuid <> v_c2
     OR (SELECT estado FROM tienda_pagos WHERE id = (v_r2->>'pago_id')::uuid) <> 'CREADO' THEN
    RAISE EXCEPTION 'P3: el reintento no trajo otro pago: %', v_r2; END IF;
  -- Un pago aprobado nunca se descarta; ya pagada, el reintento trae el pago aprobado.
  PERFORM tienda_pago_aplicar((v_r2->>'pago_id')::uuid, 'APROBADO', 'ORDCITA02B', 100.00);
  IF tienda_pago_descartar((v_r2->>'pago_id')::uuid) THEN RAISE EXCEPTION 'P3: descartó un pago aprobado'; END IF;
  IF (pg_temp.reservar(pg_temp.a(d, '11:00'), 'smk-pago-0002', '4770003302')->>'pago_id')::uuid IS DISTINCT FROM (v_r2->>'pago_id')::uuid THEN
    RAISE EXCEPTION 'P3: pagada, el reintento no trajo su pago aprobado'; END IF;

  -- P4) El plazo del pago es el apartado de la cita (vence_at = pago_hasta). Un pago que vence antes
  --     queda VENCIDO pero la cita sigue apartada y el reintento trae otro; con un cobro en curso,
  --     vencer no la cancela; el barrido la cancela cuando su pago venció Y pasó pago_hasta; el
  --     aprobado tardío se devuelve.
  v_r := pg_temp.reservar(pg_temp.a(d, '13:00'), 'smk-pago-0003', '4770003303');
  v_c3 := (v_r->>'cita_id')::uuid;
  v_g := (v_r->>'pago_id')::uuid;
  IF (SELECT vence_at FROM tienda_pagos WHERE id = v_g) IS DISTINCT FROM (SELECT pago_hasta FROM citas WHERE id = v_c3) THEN
    RAISE EXCEPTION 'P4: el pago no vence con el apartado'; END IF;
  PERFORM tienda_pago_tomar_cobro(v_g);
  UPDATE tienda_pagos SET vence_at = now() - interval '1 second' WHERE id = v_g;
  PERFORM tienda_pagos_barrer();
  IF (SELECT estado FROM tienda_pagos WHERE id = v_g) <> 'VENCIDO' OR (SELECT estado FROM citas WHERE id = v_c3) <> 'AGENDADA' THEN
    RAISE EXCEPTION 'P4: con el apartado vivo, la cita no debía cancelarse'; END IF;
  v_r := pg_temp.reservar(pg_temp.a(d, '13:00'), 'smk-pago-0003', '4770003303');
  v_g2 := (v_r->>'pago_id')::uuid;
  IF v_g2 IS NULL OR v_g2 = v_g OR (SELECT estado FROM tienda_pagos WHERE id = v_g2) <> 'CREADO' THEN
    RAISE EXCEPTION 'P4: tras el vencido el reintento no trajo otro pago: %', v_r; END IF;
  PERFORM tienda_pago_tomar_cobro(v_g2);
  UPDATE citas SET pago_hasta = now() - interval '1 minute' WHERE id = v_c3;
  PERFORM agenda_vencer_reservas();
  IF (SELECT estado FROM citas WHERE id = v_c3) <> 'AGENDADA' THEN RAISE EXCEPTION 'P4: venció con el cobro en curso'; END IF;
  UPDATE tienda_pagos SET vence_at = now() - interval '1 second' WHERE id = v_g2;
  PERFORM tienda_pagos_barrer();
  IF (SELECT estado FROM tienda_pagos WHERE id = v_g2) <> 'VENCIDO' OR (SELECT (estado::text, cancelada_por) FROM citas WHERE id = v_c3)
       IS DISTINCT FROM ('CANCELADA'::text, 'PAGO_VENCIDO'::text) THEN
    RAISE EXCEPTION 'P4: barrido %', (SELECT to_jsonb(c) FROM citas c WHERE id = v_c3); END IF;
  v_x := tienda_pago_aplicar(v_g, 'APROBADO', 'ORDCITA03', 100.00, 'debit_card', 'master');
  IF v_x->>'estado' <> 'POR_DEVOLVER' OR (v_x->>'recien_aprobado')::boolean
     OR EXISTS (SELECT 1 FROM anticipos_cita WHERE cita_id = v_c3) THEN RAISE EXCEPTION 'P4: pago tardío %', v_x; END IF;
  IF pg_temp.reservar(pg_temp.a(d, '13:00'), 'smk-pago-0003', '4770003303') ? 'pago_id' THEN
    RAISE EXCEPTION 'P4: una cita vencida volvió a dar pago'; END IF;
  -- El reto del banco abandonado: pago ABANDONADO; la cita sigue apartada y se paga otra vez.
  v_r := pg_temp.reservar(pg_temp.a(d, '17:00'), 'smk-pago-0005', '4770003305');
  v_c5 := (v_r->>'cita_id')::uuid;
  v_g := (v_r->>'pago_id')::uuid;
  PERFORM tienda_pago_tomar_cobro(v_g);
  PERFORM tienda_pago_verificacion(v_g, 'ORDCITA05');
  IF NOT tienda_pago_abandonar(v_g) THEN RAISE EXCEPTION 'P4: no abandonó'; END IF;
  IF (SELECT estado FROM tienda_pagos WHERE id = v_g) <> 'ABANDONADO' OR (SELECT estado FROM citas WHERE id = v_c5) <> 'AGENDADA' THEN
    RAISE EXCEPTION 'P4: abandonar'; END IF;
  v_r := pg_temp.reservar(pg_temp.a(d, '17:00'), 'smk-pago-0005', '4770003305');
  IF (v_r->>'pago_id')::uuid IS NOT DISTINCT FROM v_g THEN RAISE EXCEPTION 'P4: tras abandonar no hubo otro pago'; END IF;

  -- P4b) Freno y tope: el pago lleva la clave de freno; un rechazo por riesgo frena a ese cliente
  --      (PAGO_EN_PAUSA); a lo más 5 intentos de pago por cita (LIMITE_INTENTOS).
  PERFORM pg_temp.debe_fallar(format('SELECT pg_temp.reservar(%L, %L, %L, %L)', pg_temp.a(d, '15:00'), 'smk-pago-0004', '4770003304', 'corta'),
    'DATOS_INVALIDOS: la clave de freno no es válida.', 'P4b clave mal formada');
  v_r := pg_temp.reservar(pg_temp.a(d, '15:00'), 'smk-pago-0004', '4770003304', repeat('k', 43));
  v_c4 := (v_r->>'cita_id')::uuid;
  IF (SELECT freno_clave FROM tienda_pagos WHERE id = (v_r->>'pago_id')::uuid) IS DISTINCT FROM repeat('k', 43) THEN
    RAISE EXCEPTION 'P4b: el pago no guardó su clave de freno'; END IF;
  FOR v_n IN 2..5 LOOP
    PERFORM tienda_pago_descartar((v_r->>'pago_id')::uuid);
    v_r := pg_temp.reservar(pg_temp.a(d, '15:00'), 'smk-pago-0004', '4770003304', repeat('k', 43));
  END LOOP;
  IF (SELECT count(*) FROM tienda_pagos WHERE cita_id = v_c4) <> 5 THEN RAISE EXCEPTION 'P4b: intentos'; END IF;
  PERFORM tienda_pago_descartar((v_r->>'pago_id')::uuid);
  PERFORM pg_temp.debe_fallar(format('SELECT pg_temp.reservar(%L, %L, %L)', pg_temp.a(d, '15:00'), 'smk-pago-0004', '4770003304'),
    'LIMITE_INTENTOS: Demasiados intentos de pago. Comunícate con el negocio.', 'P4b sexto intento');
  v_r := pg_temp.reservar(pg_temp.a(d, '16:00'), 'smk-pago-0009', '4770003309', repeat('f', 43));
  PERFORM tienda_pago_tomar_cobro((v_r->>'pago_id')::uuid);
  PERFORM tienda_pago_aplicar((v_r->>'pago_id')::uuid, 'RECHAZADO', 'ORDCITA09', 100.00, NULL, NULL, 'high_risk');
  IF tienda_pago_frenado(repeat('f', 43)) IS NULL THEN RAISE EXCEPTION 'P4b: el rechazo por riesgo no frenó'; END IF;
  PERFORM tienda_pago_descartar((v_r->>'pago_id')::uuid);
  PERFORM pg_temp.debe_fallar(format('SELECT pg_temp.reservar(%L, %L, %L, %L)', pg_temp.a(d, '16:00'), 'smk-pago-0009', '4770003309', repeat('f', 43)),
    'PAGO_EN_PAUSA:%', 'P4b frenado');

  -- P5) Cancelar en línea a tiempo: POR_DEVOLVER → (barrido) DEVUELTO, y el anticipo DEVUELTO sin
  --     turno. Ningún correo de la tienda (son de pedidos).
  v_r := pg_temp.reservar(pg_temp.a(d, '18:00'), 'smk-pago-0006', '4770003306');
  v_c6 := (v_r->>'cita_id')::uuid;
  PERFORM tienda_pago_aplicar((v_r->>'pago_id')::uuid, 'APROBADO', 'ORDCITA06', 100.00);
  PERFORM agenda_cancelar_en_linea(v_t, pg_temp.h(v_r->>'codigo'));
  IF (pg_temp.pago(v_c6)).estado <> 'POR_DEVOLVER' OR (pg_temp.ant(v_c6)).estado <> 'VIGENTE' THEN
    RAISE EXCEPTION 'P5: cancelar a tiempo % %', to_jsonb(pg_temp.pago(v_c6)), to_jsonb(pg_temp.ant(v_c6)); END IF;
  -- Ese se devuelve solo: la recepción no lo retiene.
  PERFORM pg_temp.como(v_maria);
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_diego, 'retener_anticipo', 'venta.devolucion', 'anticipo', (pg_temp.ant(v_c6)).id, 'smoke')
  RETURNING id INTO v_auth;
  PERFORM pg_temp.debe_fallar(format('SELECT retener_anticipo(%L, NULL, NULL, %L)', (pg_temp.ant(v_c6)).id, v_auth),
    'DATOS_INVALIDOS: este anticipo en línea se le devuelve%', 'P5 retener el que se devuelve solo');
  PERFORM pg_temp.como(NULL);
  UPDATE tienda_pagos SET aprobado_at = now() - interval '2 minutes' WHERE id = (v_r->>'pago_id')::uuid;
  IF NOT EXISTS (SELECT 1 FROM tienda_pagos_tomar(50) t WHERE t.id = (v_r->>'pago_id')::uuid AND t.tarea = 'DEVOLVER') THEN
    RAISE EXCEPTION 'P5: el barrido no toma la devolución'; END IF;
  IF tienda_pago_devolucion((v_r->>'pago_id')::uuid, true) <> 'DEVUELTO' THEN RAISE EXCEPTION 'P5: devolución'; END IF;
  v_a := pg_temp.ant(v_c6);
  IF v_a.estado <> 'DEVUELTO' OR v_a.turno_resuelve_id IS NOT NULL OR v_a.resuelto_at IS NULL THEN
    RAISE EXCEPTION 'P5: anticipo %', to_jsonb(v_a); END IF;
  IF (SELECT count(*) FROM tienda_correos) <> v_correos THEN RAISE EXCEPTION 'P5: un pago de cita encoló un correo de la tienda'; END IF;

  -- P6) Cancelar tarde: no hay botón en línea; la caja cancela y NO se devuelve solo. La recepción
  --     retiene (sin turno, con permiso) o devuelve (POR_DEVOLVER, sin cajón ni referencia).
  UPDATE configuracion_tenant SET agenda_cancelar_horas = 168 WHERE tenant_id = v_t;
  v_r := pg_temp.pagada(pg_temp.a(e, '10:00'), 'smk-pago-0007', '4770003307', 'ORDCITA07');
  v_c7 := (v_r->>'cita_id')::uuid;
  PERFORM pg_temp.debe_fallar(format('SELECT agenda_cancelar_en_linea(%L, %L)', v_t, pg_temp.h(v_r->>'codigo')),
    'FUERA_DE_PLAZO:%', 'P6 cancelar tarde');
  PERFORM pg_temp.como(v_maria);
  PERFORM cancelar_cita(v_c7, 'Llamó para cancelar');
  IF (pg_temp.pago(v_c7)).estado <> 'APROBADO' THEN RAISE EXCEPTION 'P6: la caja canceló y se devolvió solo'; END IF;
  PERFORM pg_temp.debe_fallar(format('SELECT retener_anticipo(%L, NULL, NULL)', (pg_temp.ant(v_c7)).id),
    'Retener un anticipo requiere autorización%', 'P6 retener sin permiso');
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_diego, 'retener_anticipo', 'venta.devolucion', 'anticipo', (pg_temp.ant(v_c7)).id, 'smoke')
  RETURNING id INTO v_auth;
  PERFORM retener_anticipo((pg_temp.ant(v_c7)).id, v_caja, v_turno, v_auth);
  IF (pg_temp.ant(v_c7)).estado <> 'RETENIDO' OR (pg_temp.ant(v_c7)).turno_resuelve_id IS DISTINCT FROM v_turno
     OR (pg_temp.pago(v_c7)).estado <> 'APROBADO' THEN RAISE EXCEPTION 'P6: retener %', to_jsonb(pg_temp.ant(v_c7)); END IF;
  -- Devolver: otra cita pagada que la caja cancela tarde.
  PERFORM pg_temp.como(NULL);
  v_r := pg_temp.pagada(pg_temp.a(e, '12:00'), 'smk-pago-0008', '4770003308', 'ORDCITA08');
  v_c7 := (v_r->>'cita_id')::uuid;
  PERFORM pg_temp.como(v_maria);
  PERFORM cancelar_cita(v_c7, NULL);
  SELECT count(*) INTO v_n FROM movimientos_caja WHERE turno_id = v_turno;
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_diego, 'devolver_anticipo', 'venta.devolucion', 'anticipo', (pg_temp.ant(v_c7)).id, 'smoke')
  RETURNING id INTO v_auth;
  PERFORM devolver_anticipo((pg_temp.ant(v_c7)).id, v_caja, v_turno, NULL, v_auth);
  IF (pg_temp.ant(v_c7)).estado <> 'DEVUELTO' OR (pg_temp.pago(v_c7)).estado <> 'POR_DEVOLVER'
     OR (SELECT count(*) FROM movimientos_caja WHERE turno_id = v_turno) <> v_n THEN
    RAISE EXCEPTION 'P6: devolver % %', to_jsonb(pg_temp.ant(v_c7)), to_jsonb(pg_temp.pago(v_c7)); END IF;
  PERFORM tienda_pago_devolucion((pg_temp.pago(v_c7)).id, true);
  IF (pg_temp.ant(v_c7)).estado <> 'DEVUELTO' THEN RAISE EXCEPTION 'P6: el anticipo cambió al devolverse'; END IF;
  -- Lo devuelto o retenido por Mercado Pago no entra en las cifras del turno.
  v_x := reporte_x(v_turno);
  IF (v_x->>'anticipos_devueltos_mxn')::numeric <> 0 OR (v_x->>'anticipos_retenidos_mxn')::numeric <> 0 THEN
    RAISE EXCEPTION 'P6: el corte mezcla lo de Mercado Pago: %', v_x; END IF;
  PERFORM pg_temp.como(NULL);
  UPDATE configuracion_tenant SET agenda_cancelar_horas = 24 WHERE tenant_id = v_t;

  -- P7) Cobro en la caja: el anticipo en línea se aplica como cualquiera; el efectivo esperado no
  --     cambia por él y el corte lo informa aparte.
  PERFORM pg_temp.como(v_maria);
  v_e0 := calcular_efectivo_esperado(v_turno);
  v_k := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smk-0225-k', v_maria);
  PERFORM agregar_item_a_ticket(v_k, v_corte, 1, NULL, '[]'::jsonb, 'smk-0225-i', v_maria);
  PERFORM vincular_cita_ticket(v_c1, v_k);
  IF pagar_con_anticipo(v_k, v_c1, 'smk-0225-px') <> 100 THEN RAISE EXCEPTION 'P7: debía aplicar 100'; END IF;
  IF calcular_efectivo_esperado(v_turno) <> v_e0 THEN RAISE EXCEPTION 'P7: el anticipo en línea movió el efectivo'; END IF;
  SELECT total_mxn + COALESCE(propina_mxn, 0) - monto_pagado_mxn INTO v_falta FROM tickets WHERE id = v_k;
  PERFORM aplicar_pago(v_k, 'EFECTIVO'::metodo_pago, v_falta, v_falta, NULL, NULL, NULL, false, NULL, 'smk-0225-ef');
  IF calcular_efectivo_esperado(v_turno) <> v_e0 + v_falta THEN RAISE EXCEPTION 'P7: efectivo esperado'; END IF;
  v_a := pg_temp.ant(v_c1);
  v_x := reporte_x(v_turno);
  IF v_a.estado <> 'APLICADO' OR v_a.ticket_id <> v_k OR v_a.turno_resuelve_id <> v_turno
     OR (v_x->>'anticipos_en_linea_aplicados_mxn')::numeric <> 100 OR (v_x->>'anticipos_recibidos_mxn')::numeric <> 0
     OR (v_x->>'pagado_con_anticipo_mxn')::numeric <> 100
     OR jsonb_path_exists(v_x, '$.pagos_por_metodo[*] ? (@.metodo_pago == "PAGO_EN_LINEA")') THEN
    RAISE EXCEPTION 'P7: % %', to_jsonb(v_a), v_x; END IF;
  -- Ya aplicado, no se devuelve por la recepción.
  PERFORM pg_temp.debe_fallar(format('SELECT devolver_anticipo(%L, NULL, NULL)', v_a.id), 'DATOS_INVALIDOS: el anticipo ya se resolvió%', 'P7 devolver aplicado');
  -- La caja no recibe anticipos en línea, y la tabla no deja uno en línea con turno ni otro sin él.
  PERFORM pg_temp.debe_fallar(format('SELECT registrar_anticipo(%L, 10, %L, %L, %L, NULL)', v_c2, 'PAGO_EN_LINEA', v_caja, v_turno),
    'DATOS_INVALIDOS: un anticipo se recibe en efectivo%', 'P7 registrar en línea');
  PERFORM pg_temp.debe_fallar(format('INSERT INTO anticipos_cita (tenant_id, sucursal_id, caja_id, turno_id, cita_id, metodo_pago, monto_mxn) VALUES (%L, %L, %L, %L, %L, %L, 1)',
    v_t, v_suc, v_caja, v_turno, v_c2, 'PAGO_EN_LINEA'), '%anticipos_cita_en_linea_sin_turno%', 'P7 en línea con turno');
  PERFORM pg_temp.debe_fallar(format('INSERT INTO anticipos_cita (tenant_id, sucursal_id, cita_id, metodo_pago, monto_mxn) VALUES (%L, %L, %L, %L, 1)',
    v_t, v_suc, v_c2, 'EFECTIVO'), '%anticipos_cita_en_linea_sin_turno%', 'P7 efectivo sin turno');

  -- P7b) Sobrante de un anticipo en línea partido (la cita ya se cobró): se devuelve EN EFECTIVO del
  --      turno, con permiso o PIN; el pago de Mercado Pago sigue APROBADO y el corte lo cuenta.
  v_k2 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smk-0225-k2', v_maria);
  PERFORM agregar_item_a_ticket(v_k2, v_champu, 1, NULL, '[]'::jsonb, 'smk-0225-i2');
  PERFORM vincular_cita_ticket(v_c2, v_k2);
  v_falta := pagar_con_anticipo(v_k2, v_c2, 'smk-0225-px2');
  SELECT id INTO v_resto FROM anticipos_cita WHERE cita_id = v_c2 AND estado = 'VIGENTE';
  IF v_falta >= 100 OR v_resto IS NULL OR (SELECT monto_mxn FROM anticipos_cita WHERE id = v_resto) <> 100 - v_falta
     OR (SELECT estado FROM citas WHERE id = v_c2) <> 'COBRADA' THEN
    RAISE EXCEPTION 'P7b: el anticipo no se partió: % %', v_falta, (SELECT jsonb_agg(to_jsonb(a)) FROM anticipos_cita a WHERE cita_id = v_c2); END IF;
  PERFORM pg_temp.debe_fallar(format('SELECT devolver_anticipo(%L, NULL, NULL)', v_resto),
    'DATOS_INVALIDOS: el anticipo se mueve en un turno abierto%', 'P7b efectivo sin turno');
  v_e0 := calcular_efectivo_esperado(v_turno);
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_t, v_suc, v_caja, v_turno, v_maria, v_diego, 'devolver_anticipo', 'venta.devolucion', 'anticipo', v_resto, 'smoke')
  RETURNING id INTO v_auth;
  PERFORM devolver_anticipo(v_resto, v_caja, v_turno, NULL, v_auth);
  IF (SELECT (estado, referencia_devolucion, turno_resuelve_id) FROM anticipos_cita WHERE id = v_resto)
       IS DISTINCT FROM ('DEVUELTO'::text, 'EN_EFECTIVO'::text, v_turno)
     OR (pg_temp.pago(v_c2)).estado <> 'APROBADO'
     OR calcular_efectivo_esperado(v_turno) <> v_e0 - (100 - v_falta)
     OR NOT EXISTS (SELECT 1 FROM movimientos_caja WHERE turno_id = v_turno AND tipo = 'DEVOLUCION_EFECTIVO' AND monto_mxn = 100 - v_falta)
     OR (reporte_x(v_turno)->>'anticipos_devueltos_mxn')::numeric <> 100 - v_falta THEN
    RAISE EXCEPTION 'P7b: devolver en efectivo %', (SELECT to_jsonb(a) FROM anticipos_cita a WHERE id = v_resto); END IF;

  -- P8) Sync: el anticipo en línea que la caja aplicó sin internet sube sin caja ni turno; la caja
  --     no crea uno nuevo ni le cambia el método; la cita sube con quién la canceló.
  SELECT to_jsonb(x) INTO v_aj FROM anticipos_cita x WHERE id = v_a.id;
  SET LOCAL session_replication_role = replica;
  UPDATE anticipos_cita SET estado = 'VIGENTE', ticket_id = NULL, turno_resuelve_id = NULL, resuelto_at = NULL WHERE id = v_a.id;
  SET LOCAL session_replication_role = origin;
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  v_res := sync_push_snapshot(v_t, jsonb_build_object('anticipos_cita', jsonb_build_array(v_aj)));
  v_a := pg_temp.ant(v_c1);
  IF v_res ? '_errores' OR v_a.estado <> 'APLICADO' OR v_a.ticket_id <> v_k OR v_a.turno_id IS NOT NULL
     OR v_a.tienda_pago_id IS DISTINCT FROM (pg_temp.pago(v_c1)).id THEN
    RAISE EXCEPTION 'P8: aplicado en la caja % %', v_res, to_jsonb(v_a); END IF;
  v_res := sync_push_snapshot(v_t, jsonb_build_object('anticipos_cita', jsonb_build_array(
             v_aj || jsonb_build_object('id', gen_random_uuid(), 'estado', 'VIGENTE', 'ticket_id', NULL,
                                        'turno_resuelve_id', NULL, 'resuelto_at', NULL, 'client_id_local', NULL, 'monto_mxn', 50))));
  IF NOT (v_res ? '_errores') OR (v_res->'_errores')::text NOT LIKE '%la caja no crea anticipos en línea%' THEN
    RAISE EXCEPTION 'P8: la caja creó un anticipo en línea: %', v_res; END IF;
  v_res := sync_push_snapshot(v_t, jsonb_build_object('anticipos_cita', jsonb_build_array(
             v_aj || jsonb_build_object('metodo_pago', 'EFECTIVO', 'caja_id', v_caja, 'turno_id', v_turno))));
  IF NOT (v_res ? '_errores') OR (v_res->'_errores')::text NOT LIKE '%no cambia de método%'
     OR (pg_temp.ant(v_c1)).metodo_pago <> 'PAGO_EN_LINEA' THEN
    RAISE EXCEPTION 'P8: la caja le cambió el método: %', v_res; END IF;
  -- La cita que la caja canceló llega con cancelada_por = CAJA (y no se devuelve sola).
  PERFORM pg_temp.como(v_maria);
  v_g := guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_nombre', 'Caja 0225', 'inicia', pg_temp.a(d, '19:00'),
           'servicios', jsonb_build_array(jsonb_build_object('producto_id', v_corte, 'usuario_id', v_maria))));
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  v_res := sync_push_snapshot(v_t, jsonb_build_object(
             'citas', (SELECT jsonb_agg(to_jsonb(c) || '{"estado": "CANCELADA", "cancelada_por": "CAJA"}'::jsonb) FROM citas c WHERE id = v_g),
             'citas_servicios', (SELECT jsonb_agg(to_jsonb(s)) FROM citas_servicios s WHERE cita_id = v_g)));
  IF v_res ? '_errores' OR (SELECT (estado::text, cancelada_por) FROM citas WHERE id = v_g)
       IS DISTINCT FROM ('CANCELADA'::text, 'CAJA'::text) THEN
    RAISE EXCEPTION 'P8: cancelada_por no subió: %', v_res; END IF;
  PERFORM pg_temp.como(NULL);

  -- P9) Regresión: un pedido de restaurante con pago en línea sigue igual (aprobar, cancelar y
  --     devolver con su correo; un NO seguro borra el pedido; el barrido lo vence).
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, id_externo, folio_corto, estado, gestion, items, payload_raw,
    total_cliente_mxn, seguimiento_hash, vence_aceptacion, cliente_nombre, cliente_email, pago_al_recibir)
  VALUES (v_t, v_suc, 'TIENDA', 'DRIVE_THRU', 'smk0225ped1', 'TSMK01', 'POR_PAGAR', 'NUBE', '[]'::jsonb, '{}'::jsonb,
    150.00, md5('smk0225a') || md5('smk0225b'), NULL, 'Ana Pedido', 'ana.pedido@example.com', 'EN_LINEA')
  RETURNING id INTO v_ped;
  INSERT INTO tienda_pagos (tenant_id, pedido_id, conexion_id, monto_mxn, vence_at)
  VALUES (v_t, v_ped, v_cx, 150.00, now() + interval '5 minutes') RETURNING id INTO v_g;
  v_x := tienda_pago_aplicar(v_g, 'APROBADO', 'ORDPED01', 150.00, 'credit_card', 'visa');
  IF v_x <> jsonb_build_object('estado', 'APROBADO', 'pedido_estado', 'RECIBIDO', 'recien_aprobado', true)
     OR (SELECT pagado_at FROM delivery_pedidos WHERE id = v_ped) IS NULL THEN RAISE EXCEPTION 'P9: aprobado %', v_x; END IF;
  UPDATE delivery_pedidos SET estado = 'CANCELADO' WHERE id = v_ped;
  IF (SELECT estado FROM tienda_pagos WHERE id = v_g) <> 'POR_DEVOLVER' THEN RAISE EXCEPTION 'P9: cancelar no lo dejó por devolver'; END IF;
  IF tienda_pago_devolucion(v_g, true) <> 'DEVUELTO' THEN RAISE EXCEPTION 'P9: devolución'; END IF;
  IF to_regnamespace('cron') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM tienda_correos WHERE pedido_id = v_ped AND tipo = 'DEVUELTO') THEN
    RAISE EXCEPTION 'P9: el pedido devuelto no encoló su correo'; END IF;
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, id_externo, folio_corto, estado, gestion, items, payload_raw,
    total_cliente_mxn, seguimiento_hash, vence_aceptacion, cliente_nombre, cliente_email, pago_al_recibir, created_at)
  VALUES (v_t, v_suc, 'TIENDA', 'DRIVE_THRU', 'smk0225ped2', 'TSMK02', 'POR_PAGAR', 'NUBE', '[]'::jsonb, '{}'::jsonb,
    150.00, md5('smk0225c') || md5('smk0225d'), NULL, 'Ana Pedido', 'ana.pedido@example.com', 'EN_LINEA', now() - interval '10 minutes')
  RETURNING id INTO v_ped;
  INSERT INTO tienda_pagos (tenant_id, pedido_id, conexion_id, monto_mxn, vence_at)
  VALUES (v_t, v_ped, v_cx, 150.00, now() - interval '5 minutes') RETURNING id INTO v_g;
  PERFORM tienda_pagos_barrer();
  IF (SELECT estado FROM delivery_pedidos WHERE id = v_ped) <> 'EXPIRADO' OR (SELECT estado FROM tienda_pagos WHERE id = v_g) <> 'VENCIDO' THEN
    RAISE EXCEPTION 'P9: el barrido no venció el pedido'; END IF;
  v_x := tienda_pago_aplicar(v_g, 'APROBADO', 'ORDPED02', 150.00);
  IF v_x->>'estado' <> 'POR_DEVOLVER' OR v_x ? 'cita_estado' THEN RAISE EXCEPTION 'P9: tardío %', v_x; END IF;
  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, canal, app, id_externo, folio_corto, estado, gestion, items, payload_raw,
    total_cliente_mxn, seguimiento_hash, vence_aceptacion, cliente_nombre, cliente_email, pago_al_recibir)
  VALUES (v_t, v_suc, 'TIENDA', 'DRIVE_THRU', 'smk0225ped3', 'TSMK03', 'POR_PAGAR', 'NUBE', '[]'::jsonb, '{}'::jsonb,
    150.00, md5('smk0225e') || md5('smk0225f'), NULL, 'Ana Pedido', 'ana.pedido@example.com', 'EN_LINEA')
  RETURNING id INTO v_ped;
  INSERT INTO tienda_pagos (tenant_id, pedido_id, conexion_id, monto_mxn, vence_at)
  VALUES (v_t, v_ped, v_cx, 150.00, now() + interval '5 minutes') RETURNING id INTO v_g;
  IF NOT tienda_pago_descartar(v_g) THEN RAISE EXCEPTION 'P9: no descartó'; END IF;
  IF EXISTS (SELECT 1 FROM delivery_pedidos WHERE id = v_ped) THEN
    RAISE EXCEPTION 'P9: descartar no borró el pedido'; END IF;

  -- P10) Permisos: las internas nuevas no las ejecuta nadie de fuera.
  IF has_function_privilege('service_role', '_tienda_pago_aplicar_cita(uuid, text, text, numeric, text, text, text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', '_agenda_cita_pago(uuid, uuid, text)', 'EXECUTE')
     OR has_function_privilege('anon', '_agenda_cancelar_sin_pago(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', '_anticipo_pago_en_linea(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'tienda_pago_aplicar(uuid, text, text, numeric, text, text, text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'tienda_pago_aplicar(uuid, text, text, numeric, text, text, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P10: permisos'; END IF;

  RAISE NOTICE 'belleza reservas pago OK';
END $$;

ROLLBACK;
