-- Smoke del cobro por WhatsApp (migración 0288): código al correo del dueño, adeudo por periodos con su
-- precio, intentos de pago, aplicar el pago (registro, renovación, reactivación) y acceso solo de service_role.
-- Uso: cd desktop && npm run smokes -- smoke_agente_cobro.sql
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_hoy   date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_ini   date := ((now() AT TIME ZONE 'America/Mexico_City')::date - interval '2 months')::date;
  v_prox  date := ((now() AT TIME ZONE 'America/Mexico_City')::date - interval '1 month')::date;
  v_dueno uuid := gen_random_uuid(); v_otro uuid := gen_random_uuid(); v_solo uuid := gen_random_uuid();
  v_a uuid := gen_random_uuid(); v_b uuid := gen_random_uuid(); v_c uuid := gen_random_uuid(); v_x uuid := gen_random_uuid();
  v_plan uuid; v_susc_a uuid; v_susc_b uuid; v_conv uuid; v_conv2 uuid;
  v_codigo text; v_mal text; v_int uuid; v_int2 uuid; v_estado text; v_pausa timestamptz;
  r jsonb; v_rol text;
BEGIN
  -- Siembra: un dueño con A (ACTIVO) y B (SUSPENDIDO por falta de pago), C de otro dueño, X cancelado de un tercero.
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  SELECT u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, NULL,
         now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
    FROM (VALUES (v_dueno, 'dueno@prueba.mx'), (v_otro, 'otro@prueba.mx'), (v_solo, 'solo@prueba.mx')) u(id, email);
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal, usuario_dueno_id) VALUES
    (v_a, 'smk-cobro-a', 'Tacos Uno',  'ACTIVO',     'QUICK_SERVICE', v_dueno),
    (v_b, 'smk-cobro-b', 'Tacos Dos',  'SUSPENDIDO', 'QUICK_SERVICE', v_dueno),
    (v_c, 'smk-cobro-c', 'Tacos Tres', 'ACTIVO',     'QUICK_SERVICE', v_otro),
    (v_x, 'smk-cobro-x', 'Tacos Baja', 'CANCELADO',  'QUICK_SERVICE', v_solo);
  UPDATE tenants SET suspension_tipo = 'FALTA_DE_PAGO', fecha_baja = now(), motivo_baja = 'no pagó octubre',
                     bloqueo_desde = now(), bloqueo_mensaje = 'Bloqueado por falta de pago'
   WHERE id = v_b;

  SELECT id INTO v_plan FROM planes ORDER BY precio_mensual_mxn NULLS LAST LIMIT 1;
  INSERT INTO suscripciones (tenant_id, plan_id, fecha_inicio, estado, precio_mensual_mxn, ciclo_facturacion,
                             proxima_fecha_cobro, precio_promocional_mxn, promocion_hasta)
  VALUES (v_a, v_plan, v_ini, 'ACTIVA', 699, 'MENSUAL', v_prox, 499, v_hoy - 1) RETURNING id INTO v_susc_a;
  INSERT INTO suscripciones (tenant_id, plan_id, fecha_inicio, estado, precio_mensual_mxn, ciclo_facturacion, proxima_fecha_cobro)
  VALUES (v_b, v_plan, v_prox, 'ACTIVA', 699, 'MENSUAL', v_hoy) RETURNING id INTO v_susc_b;
  -- Extras de A: 2 cajas a 100 (suman 200) y un CFDI incluido en el plan (no suma).
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn, cantidad, incluido_en_plan)
  SELECT v_a, id, v_ini, true, 100, 2, false FROM addons WHERE codigo = 'CAJA_EXTRA';
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn, incluido_en_plan)
  SELECT v_a, id, v_ini, true, 349, true FROM addons WHERE codigo = 'CFDI';

  INSERT INTO wa_conversaciones (wa_id) VALUES ('5210000000901') RETURNING id INTO v_conv;
  INSERT INTO wa_conversaciones (wa_id) VALUES ('5210000000902') RETURNING id INTO v_conv2;

  -- 1. Usuario técnico
  ASSERT wa_agente_id() = '00000000-0000-0000-0000-00000000a6e7', '1a: wa_agente_id fijo';

  -- 2. Pedir código
  r := wa_pedir_codigo(v_conv, 'nadie@prueba.mx');
  ASSERT NOT (r->>'enviar')::boolean AND r->>'codigo' IS NULL, '2a: correo desconocido no envía';
  ASSERT NOT EXISTS (SELECT 1 FROM wa_codigos WHERE conversacion_id = v_conv), '2a: no inserta fila';

  r := wa_pedir_codigo(v_conv, 'dueno@prueba.mx');
  ASSERT (r->>'enviar')::boolean AND r->>'codigo' ~ '^\d{6}$', '2b: envía un código de 6 dígitos';
  ASSERT (SELECT codigo_hash <> r->>'codigo' AND codigo_hash = crypt(r->>'codigo', codigo_hash)
            FROM wa_codigos WHERE conversacion_id = v_conv AND usado_en IS NULL), '2b: solo se guarda el hash';

  r := wa_pedir_codigo(v_conv, '  Dueno@Prueba.MX ');
  ASSERT (r->>'enviar')::boolean, '2c: correo con espacios y mayúsculas';
  v_codigo := r->>'codigo';
  ASSERT (SELECT count(*) FROM wa_codigos WHERE conversacion_id = v_conv AND usado_en IS NULL) = 1, '2c: el nuevo invalida el anterior';

  r := wa_pedir_codigo(v_conv2, 'solo@prueba.mx');
  ASSERT NOT (r->>'enviar')::boolean, '2d: un negocio CANCELADO no cuenta';

  -- 3. Verificar
  r := wa_verificar_codigo(v_conv, v_codigo);
  ASSERT (r->>'ok')::boolean AND jsonb_array_length(r->'negocios') = 2, '3a: verifica con A y B';
  ASSERT r->'negocios' @> jsonb_build_array(jsonb_build_object('id', v_a), jsonb_build_object('id', v_b))
     AND NOT r->'negocios' @> jsonb_build_array(jsonb_build_object('id', v_c)), '3a: A y B, no C';
  ASSERT (SELECT verificado_hasta = now() + interval '30 days' AND tenant_id IS NULL
            FROM wa_conversaciones WHERE id = v_conv), '3a: verificada 30 días, sin negocio elegido';

  r := wa_verificar_codigo(v_conv, v_codigo);
  ASSERT NOT (r->>'ok')::boolean AND r->>'motivo' = 'SIN_CODIGO', '3b: un solo uso';

  v_codigo := wa_pedir_codigo(v_conv, 'dueno@prueba.mx')->>'codigo';
  v_mal := CASE WHEN v_codigo = '000000' THEN '111111' ELSE '000000' END;
  FOR i IN 1..5 LOOP
    ASSERT wa_verificar_codigo(v_conv, v_mal)->>'motivo' = 'INCORRECTO', '3c: intento incorrecto';
  END LOOP;
  ASSERT wa_verificar_codigo(v_conv, v_codigo)->>'motivo' = 'AGOTADO', '3c: el 6.º da AGOTADO';
  v_codigo := wa_pedir_codigo(v_conv, 'dueno@prueba.mx')->>'codigo';
  UPDATE wa_codigos SET expira_en = now() - interval '1 second' WHERE conversacion_id = v_conv AND usado_en IS NULL;
  ASSERT wa_verificar_codigo(v_conv, v_codigo)->>'motivo' = 'VENCIDO', '3c: código vencido';
  v_codigo := wa_pedir_codigo(v_conv, 'dueno@prueba.mx')->>'codigo';
  ASSERT (wa_verificar_codigo(v_conv, v_codigo)->>'ok')::boolean, '3c: uno nuevo sí verifica';

  UPDATE wa_conversaciones SET verificado_hasta = now() - interval '1 minute' WHERE id = v_conv;
  r := wa_adeudo(v_conv, false);
  ASSERT NOT (r->>'verificado')::boolean AND r->>'motivo' = 'SIN_VERIFICAR', '3d: verificación vencida';
  UPDATE wa_conversaciones SET verificado_hasta = now() + interval '30 days' WHERE id = v_conv;

  -- 4. Elegir negocio
  ASSERT wa_adeudo(v_conv, false)->>'motivo' = 'ELEGIR_NEGOCIO', '4a: dos negocios sin elegir';
  r := wa_elegir_negocio(v_conv, 'a');
  ASSERT NOT (r->>'ok')::boolean AND r->'opciones' = '["Tacos Dos", "Tacos Uno"]'::jsonb, '4a: inexistente da opciones';
  ASSERT NOT (wa_elegir_negocio(v_conv, 'Tacos Tres')->>'ok')::boolean, '4a: el de otro dueño no';
  UPDATE tenants SET nombre_comercial = 'Tacos Uno' WHERE id = v_b;
  ASSERT NOT (wa_elegir_negocio(v_conv, 'Tacos Uno')->>'ok')::boolean, '4a: ambiguo no';
  UPDATE tenants SET nombre_comercial = 'Tacos Dos' WHERE id = v_b;
  r := wa_elegir_negocio(v_conv, ' tacos uno ');
  ASSERT (r->>'ok')::boolean AND r->>'negocio' = 'Tacos Uno', '4a: elige A';
  ASSERT (SELECT tenant_id FROM wa_conversaciones WHERE id = v_conv) = v_a, '4a: queda A en la conversación';

  -- 5. Adeudo
  r := wa_adeudo(v_conv, false);
  ASSERT (r->>'puede_cobrar')::boolean AND r->>'motivo' IS NULL, '5a: puede cobrar';
  ASSERT (r->'periodos'->0->>'desde')::date = v_prox AND (r->'periodos'->1->>'desde')::date = v_hoy, '5a: periodos desde hoy-1 mes y hoy';
  ASSERT (r->'periodos'->0->>'importe')::numeric = 699 AND (r->'periodos'->1->>'importe')::numeric = 899,
    format('5a: 499+200 y 699+200, salió %s', r->'periodos');
  ASSERT (r->>'subtotal')::numeric = 1598 AND (r->>'iva')::numeric = 255.68 AND (r->>'total')::numeric = 1853.68
     AND (r->>'vencidos')::int = 2, format('5b: totales, salió %s', r);
  ASSERT r->>'ciclo' = 'MENSUAL' AND (r->>'proxima_fecha_cobro')::date = v_prox
     AND (r->>'cubre_hasta')::date = _fecha_cobro_siguiente(v_ini, v_prox, 2) - 1, '5b: ciclo, próxima y cubre_hasta';

  r := wa_adeudo(v_conv, true);
  ASSERT jsonb_array_length(r->'periodos') = 3 AND (r->'periodos'->2->>'importe')::numeric = 899, '5c: adelanto suma un periodo a 699+200';

  UPDATE suscripciones SET ciclo_facturacion = 'ANUAL' WHERE id = v_susc_a;
  r := wa_adeudo(v_conv, false);
  ASSERT (r->'periodos'->0->>'importe')::numeric
         = 12 * ((r->'periodos'->0->>'plan')::numeric + (r->'periodos'->0->>'extras')::numeric)
     AND (r->'periodos'->0->>'importe')::numeric = 8388, format('5d: anual = 12 × (plan + extras), salió %s', r->'periodos');
  UPDATE suscripciones SET ciclo_facturacion = 'MENSUAL' WHERE id = v_susc_a;

  UPDATE wa_conversaciones SET tenant_id = v_b WHERE id = v_conv;
  ASSERT (wa_adeudo(v_conv, false)->>'puede_cobrar')::boolean, '5e: suspendido por falta de pago sí cobra';
  UPDATE tenants SET suspension_tipo = 'OTRO' WHERE id = v_b;
  ASSERT wa_adeudo(v_conv, false)->>'motivo' = 'SUSPENDIDO_OTRO', '5e: suspendido por otro motivo';
  UPDATE tenants SET suspension_tipo = NULL WHERE id = v_b;
  r := wa_adeudo(v_conv, false);
  ASSERT NOT (r->>'puede_cobrar')::boolean AND r->>'motivo' = 'SUSPENDIDO_OTRO', '5e: suspensión vieja (NULL) = otro motivo';
  UPDATE tenants SET suspension_tipo = 'FALTA_DE_PAGO' WHERE id = v_b;
  UPDATE wa_conversaciones SET tenant_id = v_a WHERE id = v_conv;

  UPDATE suscripciones SET estado = 'CANCELADA' WHERE id = v_susc_a;
  ASSERT wa_adeudo(v_conv, false)->>'motivo' = 'SIN_SUSCRIPCION', '5f: sin suscripción activa';
  UPDATE suscripciones SET estado = 'ACTIVA' WHERE id = v_susc_a;
  UPDATE suscripciones SET precio_mensual_mxn = 0 WHERE id = v_susc_a;
  ASSERT wa_adeudo(v_conv, false)->>'motivo' = 'PRECIO_CERO', '5f: precio 0';
  UPDATE suscripciones SET precio_mensual_mxn = 699 WHERE id = v_susc_a;
  UPDATE suscripciones SET proxima_fecha_cobro = (v_hoy - interval '14 months')::date WHERE id = v_susc_a;
  ASSERT wa_adeudo(v_conv, false)->>'motivo' = 'MAS_DE_12', '5f: más de 12 periodos';
  UPDATE suscripciones SET proxima_fecha_cobro = v_prox WHERE id = v_susc_a;
  UPDATE tenants SET estado = 'CANCELADO' WHERE id = v_a;
  ASSERT wa_adeudo(v_conv, false)->>'motivo' = 'CANCELADO', '5f: cancelado';
  UPDATE tenants SET estado = 'ACTIVO' WHERE id = v_a;

  -- 6. Intentos y pago
  PERFORM wa_guardar_factura(v_conv, '{"rfc":"XAXX010101000","cp":"37000"}');
  r := wa_crear_intento(v_conv, false);
  v_int := (r->>'intento_id')::uuid;
  ASSERT (r->>'ok')::boolean AND (r->>'total')::numeric = 1853.68 AND (r->>'periodos')::int = 2
     AND NOT (r->>'reusado')::boolean, format('6a: intento creado, salió %s', r);
  ASSERT (SELECT estado = 'PENDIENTE' AND vence_en = now() + interval '24 hours' AND factura->>'rfc' = 'XAXX010101000'
                 AND proxima_al_crear = v_prox FROM wa_intentos_pago WHERE id = v_int), '6a: fila del intento';
  ASSERT (SELECT estado = 'PAGO_PENDIENTE' AND pausado_hasta IS NULL FROM wa_conversaciones WHERE id = v_conv), '6a: pago pendiente sin pausa';
  r := wa_crear_intento(v_conv, false);
  ASSERT (r->>'reusado')::boolean AND (r->>'intento_id')::uuid = v_int, '6a: se reusa';
  -- Una conversación en manos de Fermín no pasa a PAGO_PENDIENTE; una ACTIVA o RESUELTA sí.
  UPDATE wa_conversaciones SET estado = 'URGENTE_SOPORTE' WHERE id = v_conv;
  PERFORM wa_crear_intento(v_conv, false);
  ASSERT (SELECT estado FROM wa_conversaciones WHERE id = v_conv) = 'URGENTE_SOPORTE', '6a: no saca de URGENTE_SOPORTE';
  UPDATE wa_conversaciones SET estado = 'RESUELTO' WHERE id = v_conv;
  PERFORM wa_crear_intento(v_conv, false);
  ASSERT (SELECT estado FROM wa_conversaciones WHERE id = v_conv) = 'PAGO_PENDIENTE', '6a: desde RESUELTO sí';

  r := wa_aplicar_pago(v_int, 'mp-0', 1853.00, v_hoy);
  ASSERT r->>'resultado' = 'MONTO_DISTINTO', '6c: monto distinto';
  ASSERT NOT EXISTS (SELECT 1 FROM pagos_suscripcion WHERE tenant_id = v_a), '6c: monto distinto no registra';
  ASSERT (SELECT estado FROM wa_intentos_pago WHERE id = v_int) = 'RECHAZADO', '6c: intento rechazado';
  ASSERT (SELECT estado = 'URGENTE_SOPORTE' AND pausado_hasta IS NOT NULL FROM wa_conversaciones WHERE id = v_conv)
     AND (SELECT count(*) FROM wa_avisos_fermin WHERE conversacion_id = v_conv AND motivo = 'Pago que no cuadra'
            AND resumen LIKE '%mp-0%' AND resumen LIKE '%1853.00%' AND resumen LIKE '%Tacos Uno%'
            AND resumen LIKE '%monto no coincide%') = 1,
    format('6c: monto distinto va a Fermín como urgente, hay %s', (SELECT jsonb_agg(to_jsonb(a)) FROM wa_avisos_fermin a WHERE conversacion_id = v_conv));
  -- El mismo aviso de Mercado Pago otra vez (reintento) no escala de nuevo.
  ASSERT wa_aplicar_pago(v_int, 'mp-0', 1853.00, v_hoy)->>'resultado' = 'DUPLICADO', '6c: rechazado y mismo pago_id = DUPLICADO';
  ASSERT (SELECT count(*) FROM wa_avisos_fermin WHERE conversacion_id = v_conv) = 1
     AND (SELECT estado FROM wa_intentos_pago WHERE id = v_int) = 'RECHAZADO', '6c: el duplicado no escala otra vez';
  DELETE FROM wa_avisos_fermin WHERE conversacion_id = v_conv;
  UPDATE wa_conversaciones SET estado = 'ACTIVA', pausado_hasta = NULL WHERE id = v_conv;

  v_int := (wa_crear_intento(v_conv, false)->>'intento_id')::uuid;
  UPDATE suscripciones SET proxima_fecha_cobro = v_prox + 1 WHERE id = v_susc_a;
  ASSERT wa_aplicar_pago(v_int, 'mp-0', 1853.68, v_hoy)->>'resultado' = 'FECHA_MOVIDA', '6c: fecha movida';
  ASSERT NOT EXISTS (SELECT 1 FROM pagos_suscripcion WHERE tenant_id = v_a), '6c: fecha movida no registra';
  ASSERT (SELECT count(*) FROM wa_avisos_fermin WHERE conversacion_id = v_conv AND motivo = 'Pago que no cuadra'
            AND resumen LIKE '%mp-0%' AND resumen LIKE '%fecha de cobro cambió%') = 1, '6c: fecha movida va a Fermín';
  UPDATE suscripciones SET proxima_fecha_cobro = v_prox WHERE id = v_susc_a;
  DELETE FROM wa_avisos_fermin WHERE conversacion_id = v_conv;
  UPDATE wa_conversaciones SET estado = 'ACTIVA', pausado_hasta = NULL WHERE id = v_conv;

  v_int := (wa_crear_intento(v_conv, false)->>'intento_id')::uuid;
  r := wa_aplicar_pago(v_int, 'mp-1', 1853.68, v_hoy);
  ASSERT r->>'resultado' = 'APLICADO' AND NOT (r->>'reactivado')::boolean AND NOT (r->>'sin_reactivar')::boolean
     AND r->>'wa_id' = '5210000000901' AND r->>'negocio' = 'Tacos Uno' AND r->'factura'->>'rfc' = 'XAXX010101000',
     format('6b: aplicado, salió %s', r);
  ASSERT (SELECT count(*) FROM pagos_suscripcion WHERE tenant_id = v_a AND metodo = 'TARJETA' AND referencia = 'mp-1'
            AND registrado_por = wa_agente_id() AND monto_mxn = 1853.68) = 1, '6b: pago registrado';
  ASSERT (SELECT proxima_fecha_cobro FROM suscripciones WHERE id = v_susc_a) = _fecha_cobro_siguiente(v_ini, v_prox, 2)
     AND (r->>'proxima_fecha_cobro')::date = _fecha_cobro_siguiente(v_ini, v_prox, 2), '6b: próxima avanza 2 meses';
  ASSERT (SELECT estado FROM wa_conversaciones WHERE id = v_conv) = 'ACTIVA', '6b: conversación ACTIVA';
  -- Con factura: un aviso a Fermín en la misma transacción, sin pausar ni cambiar el estado.
  ASSERT (SELECT count(*) FROM wa_avisos_fermin WHERE conversacion_id = v_conv) = 1
     AND (SELECT count(*) FROM wa_avisos_fermin WHERE conversacion_id = v_conv AND motivo = 'Factura por emitir'
            AND resumen LIKE '%mp-1%' AND resumen LIKE '%XAXX010101000%' AND resumen LIKE '%Tacos Uno%'
            AND resumen LIKE '%1853.68%' AND sale_en = wa_siguiente_horario(now())) = 1,
    format('6f: un aviso de factura, hay %s', (SELECT jsonb_agg(to_jsonb(a)) FROM wa_avisos_fermin a WHERE conversacion_id = v_conv));
  ASSERT (SELECT pausado_hasta IS NULL FROM wa_conversaciones WHERE id = v_conv), '6f: la factura no pausa';
  ASSERT wa_aplicar_pago(v_int, 'mp-1', 1853.68, v_hoy)->>'resultado' = 'DUPLICADO', '6b: repetido = DUPLICADO';
  ASSERT (SELECT count(*) FROM wa_avisos_fermin WHERE conversacion_id = v_conv) = 1, '6f: el duplicado no repite el aviso';
  ASSERT (SELECT count(*) FROM pagos_suscripcion WHERE referencia = 'mp-1') = 1, '6b: sigue un solo pago';
  -- Segundo cobro de la misma liga (otro pago_id): no es un aviso repetido, va a Fermín y no registra.
  r := wa_aplicar_pago(v_int, 'mp-2', 1853.68, v_hoy);
  ASSERT r->>'resultado' = 'FECHA_MOVIDA', format('6b: otro pago_id sobre un intento pagado, salió %s', r);
  ASSERT (SELECT count(*) FROM pagos_suscripcion WHERE tenant_id = v_a) = 1, '6b: sigue exactamente un pago';
  ASSERT (SELECT estado = 'PAGADO' AND pago_id = 'mp-1' FROM wa_intentos_pago WHERE id = v_int), '6b: el intento pagado no se toca';
  ASSERT (SELECT count(*) FROM wa_avisos_fermin WHERE conversacion_id = v_conv AND motivo = 'Pago que no cuadra'
            AND resumen LIKE '%mp-2%' AND resumen LIKE '%segundo cobro%') = 1
     AND (SELECT estado = 'URGENTE_SOPORTE' FROM wa_conversaciones WHERE id = v_conv), '6b: el segundo cobro va a Fermín';
  BEGIN
    PERFORM wa_aplicar_pago(v_int, NULL, 1853.68, v_hoy);
    RAISE EXCEPTION '6b: aceptó pago_id NULL';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'PAGO_ID_REQUERIDO' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM wa_aplicar_pago(v_int, '  ', 1853.68, v_hoy);
    RAISE EXCEPTION '6b: aceptó pago_id en blanco';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'PAGO_ID_REQUERIDO' THEN RAISE; END IF;
  END;
  ASSERT wa_aplicar_pago(gen_random_uuid(), 'mp-x', 1, v_hoy)->>'resultado' = 'NO_EXISTE', '6b: intento inexistente';
  UPDATE wa_conversaciones SET estado = 'ACTIVA', pausado_hasta = NULL WHERE id = v_conv;

  -- Los datos fiscales no pasan al siguiente pago ni a otro negocio.
  ASSERT (SELECT factura IS NULL FROM wa_conversaciones WHERE id = v_conv), '6h: pagado, la conversación olvida la factura';
  r := wa_crear_intento(v_conv, true);
  ASSERT (r->>'ok')::boolean AND (SELECT factura IS NULL FROM wa_intentos_pago WHERE id = (r->>'intento_id')::uuid),
    format('6h: el siguiente intento va sin factura, salió %s', r);
  PERFORM wa_guardar_factura(v_conv, '{"rfc":"XAXX010101000"}');
  PERFORM wa_elegir_negocio(v_conv, 'Tacos Uno');
  ASSERT (SELECT factura->>'rfc' = 'XAXX010101000' FROM wa_conversaciones WHERE id = v_conv), '6h: el mismo negocio la conserva';
  -- La llamada va aparte del SELECT que comprueba: en la misma expresión, el SELECT no ve su UPDATE.
  ASSERT (wa_elegir_negocio(v_conv, 'Tacos Dos')->>'ok')::boolean, '6h: elige B';
  ASSERT (SELECT tenant_id = v_b AND factura IS NULL FROM wa_conversaciones WHERE id = v_conv), '6h: cambiar de negocio la borra';
  PERFORM wa_guardar_factura(v_conv, '{"rfc":"XAXX010101000"}');
  v_codigo := wa_pedir_codigo(v_conv, 'dueno@prueba.mx')->>'codigo';
  ASSERT (wa_verificar_codigo(v_conv, v_codigo)->>'ok')::boolean, '6h: verifica otra vez';
  ASSERT (SELECT tenant_id IS NULL AND factura IS NULL FROM wa_conversaciones WHERE id = v_conv), '6h: verificar otra vez (dos negocios) la borra';

  UPDATE wa_conversaciones SET tenant_id = v_b WHERE id = v_conv;
  v_int := (wa_crear_intento(v_conv, false)->>'intento_id')::uuid;
  r := wa_aplicar_pago(v_int, 'mp-b1', (SELECT total FROM wa_intentos_pago WHERE id = v_int), v_hoy);
  ASSERT r->>'resultado' = 'APLICADO' AND (r->>'reactivado')::boolean, format('6d: reactiva, salió %s', r);
  ASSERT (SELECT estado = 'ACTIVO' AND bloqueo_desde IS NULL AND bloqueo_mensaje IS NULL AND fecha_baja IS NULL
                 AND motivo_baja IS NULL AND suspension_tipo IS NULL FROM tenants WHERE id = v_b), '6d: B ACTIVO y limpio';
  ASSERT EXISTS (SELECT 1 FROM super_admin_accesos WHERE tenant_id = v_b AND accion = 'tenant.activo'
                   AND super_admin_id = wa_agente_id() AND payload->>'pago_id' = 'mp-b1'), '6d: auditado';

  UPDATE tenants SET estado = 'SUSPENDIDO', suspension_tipo = 'FALTA_DE_PAGO' WHERE id = v_b;
  v_int := (wa_crear_intento(v_conv, true)->>'intento_id')::uuid;
  UPDATE tenants SET suspension_tipo = 'OTRO' WHERE id = v_b;
  r := wa_aplicar_pago(v_int, 'mp-b2', (SELECT total FROM wa_intentos_pago WHERE id = v_int), v_hoy);
  ASSERT r->>'resultado' = 'APLICADO' AND NOT (r->>'reactivado')::boolean AND (r->>'sin_reactivar')::boolean,
    format('6d: otro motivo no reactiva, salió %s', r);
  ASSERT (SELECT estado FROM tenants WHERE id = v_b) = 'SUSPENDIDO', '6d: sigue SUSPENDIDO';
  ASSERT (SELECT estado = 'URGENTE_SOPORTE' AND pausado_hasta IS NOT NULL FROM wa_conversaciones WHERE id = v_conv),
    '6g: pagó y sigue suspendido → URGENTE_SOPORTE con pausa';
  ASSERT (SELECT count(*) FROM wa_avisos_fermin WHERE conversacion_id = v_conv AND motivo = 'Pagó pero sigue suspendido'
            AND resumen LIKE '%mp-b2%' AND resumen LIKE '%suspendido%') = 1, '6g: un aviso urgente';

  UPDATE tenants SET estado = 'ACTIVO', suspension_tipo = NULL WHERE id = v_b;
  v_int := (wa_crear_intento(v_conv, true)->>'intento_id')::uuid;
  UPDATE wa_intentos_pago SET vence_en = now() - interval '1 hour' WHERE id = v_int;
  ASSERT wa_aplicar_pago(v_int, 'mp-b3', (SELECT total FROM wa_intentos_pago WHERE id = v_int), v_hoy)->>'resultado' = 'APLICADO',
    '6e: intento vencido se aplica igual';

  -- 7. Seguridad, índice único y aviso sin pausa
  FOREACH v_rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    EXECUTE format('SET LOCAL ROLE %I', v_rol);
    BEGIN
      PERFORM count(*) FROM wa_codigos;
      RAISE EXCEPTION '7a: % leyó wa_codigos', v_rol;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      PERFORM count(*) FROM wa_intentos_pago;
      RAISE EXCEPTION '7a: % leyó wa_intentos_pago', v_rol;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      PERFORM wa_aplicar_pago(v_int, 'mp-z', 1, current_date);
      RAISE EXCEPTION '7a: % ejecutó wa_aplicar_pago', v_rol;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RESET ROLE;
  END LOOP;

  BEGIN
    INSERT INTO pagos_suscripcion (tenant_id, suscripcion_id, monto_mxn, metodo, referencia, pagado_el, cubre_desde, cubre_hasta, registrado_por)
    VALUES (v_a, v_susc_a, 1, 'TARJETA', 'mp-1', v_hoy, v_hoy, v_hoy, wa_agente_id());
    RAISE EXCEPTION '7b: aceptó la misma referencia de tarjeta del agente dos veces';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  -- /platform registra TARJETA con referencias libres: la misma referencia de otro usuario sí entra.
  INSERT INTO pagos_suscripcion (tenant_id, suscripcion_id, monto_mxn, metodo, referencia, pagado_el, cubre_desde, cubre_hasta, registrado_por)
  VALUES (v_a, v_susc_a, 1, 'TARJETA', 'mp-1', v_hoy, v_hoy, v_hoy, gen_random_uuid());

  UPDATE wa_conversaciones SET estado = 'PAGO_PENDIENTE' WHERE id = v_conv;
  SELECT estado, pausado_hasta INTO v_estado, v_pausa FROM wa_conversaciones WHERE id = v_conv;
  PERFORM wa_avisar_fermin(v_conv, 'Factura por emitir', 'RFC XAXX010101000');
  ASSERT (SELECT count(*) FROM wa_avisos_fermin WHERE conversacion_id = v_conv AND motivo = 'Factura por emitir'
            AND resumen = 'RFC XAXX010101000' AND sale_en = wa_siguiente_horario(now()) AND enviado_en IS NULL) = 1, '7c: aviso insertado';
  ASSERT (SELECT estado = v_estado AND pausado_hasta IS NOT DISTINCT FROM v_pausa FROM wa_conversaciones WHERE id = v_conv),
    '7c: no toca estado ni pausa';

  RAISE NOTICE 'smoke_agente_cobro OK';
END $$;

ROLLBACK;
