-- Smoke del agente de WhatsApp, fase 1 (migración 0286): conversaciones, mensajes, avisos, pausa y tope de IA.
-- Uso: cd desktop && npm run smokes -- smoke_agente_whatsapp.sql
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  r jsonb; c uuid; v_n int; v_av timestamptz; v_ok boolean;
BEGIN
  -- 1. Horario de atención (hora de México, 9:00 a 18:00)
  ASSERT wa_siguiente_horario('2026-10-27 10:00-06') = '2026-10-27 10:00-06'::timestamptz, '1a: dentro de horario';
  ASSERT wa_siguiente_horario('2026-10-27 18:00-06') = '2026-10-28 09:00-06'::timestamptz, '1b: 18:00 pasa a mañana 9:00';
  ASSERT wa_siguiente_horario('2026-10-28 03:00-06') = '2026-10-28 09:00-06'::timestamptz, '1c: madrugada pasa a las 9:00';

  -- 2. Duplicado y número nuevo
  r := wa_registrar_entrante('5215500000001', 'wamid.A', 'Ana', 'hola');
  ASSERT (r->>'nueva')::boolean AND NOT (r->>'duplicado')::boolean AND (r->>'responder')::boolean, '2a: primer mensaje';
  c := (r->>'conversacion_id')::uuid;
  r := wa_registrar_entrante('5215500000001', 'wamid.A', 'Ana', 'hola');
  ASSERT (r->>'duplicado')::boolean AND NOT (r->>'responder')::boolean AND NOT (r->>'nueva')::boolean, '2b: duplicado';
  SELECT count(*) INTO v_n FROM wa_mensajes WHERE conversacion_id = c;
  ASSERT v_n = 1, '2c: una sola fila';

  -- 3. Salida del agente no pausa; Fermín sí
  ASSERT wa_registrar_salida(c, 'wamid.S1', 'AGENTE', 'hola Ana'), '3a: salida agente';
  ASSERT NOT wa_registrar_salida(c, 'wamid.S1', 'AGENTE', 'hola Ana'), '3b: wamid repetido = false';
  r := wa_registrar_entrante('5215500000001', 'wamid.B', NULL, 'precio?');
  ASSERT (r->>'responder')::boolean, '3c: sigue respondiendo';
  ASSERT wa_conversacion_de('5215500000001') = c, '3d: conversacion_de existente';
  ASSERT wa_conversacion_de('5215500000002') <> c, '3e: conversacion_de crea';
  PERFORM wa_registrar_salida(c, 'wamid.F1', 'FERMIN', 'yo le sigo');
  r := wa_registrar_entrante('5215500000001', 'wamid.C', NULL, 'ok');
  ASSERT NOT (r->>'responder')::boolean, '3f: pausada tras Fermín';

  -- 4. Pasar a Fermín, aviso encolado y resolver
  PERFORM wa_resolver(c);
  r := wa_registrar_entrante('5215500000001', 'wamid.D', NULL, 'otra');
  ASSERT (r->>'responder')::boolean, '4a: resuelta responde';
  v_av := wa_pasar_a_fermin(c, 'URGENTE_SOPORTE', 'no cobra', 'resumen');
  ASSERT v_av >= now() - interval '1 second', '4b: sale_en';
  SELECT count(*) INTO v_n FROM wa_avisos_fermin WHERE conversacion_id = c AND enviado_en IS NULL;
  ASSERT v_n = 1, '4c: un aviso';
  ASSERT (SELECT estado FROM wa_conversaciones WHERE id = c) = 'URGENTE_SOPORTE', '4d: estado';
  r := wa_registrar_entrante('5215500000001', 'wamid.E', NULL, 'hola?');
  ASSERT NOT (r->>'responder')::boolean, '4e: pausada';
  UPDATE wa_avisos_fermin SET sale_en = now() - interval '1 minute' WHERE conversacion_id = c;
  SELECT count(*) INTO v_n FROM wa_avisos_por_enviar();
  ASSERT v_n = 1, '4f: por enviar';
  PERFORM wa_marcar_avisos(ARRAY(SELECT id FROM wa_avisos_fermin WHERE conversacion_id = c));
  SELECT count(*) INTO v_n FROM wa_avisos_por_enviar();
  ASSERT v_n = 0, '4g: ya enviados';
  PERFORM wa_resolver(c);
  ASSERT (SELECT estado FROM wa_conversaciones WHERE id = c) = 'RESUELTO', '4h: RESUELTO';
  r := wa_registrar_entrante('5215500000001', 'wamid.G', NULL, 'de nuevo');
  ASSERT (r->>'responder')::boolean AND (SELECT estado FROM wa_conversaciones WHERE id = c) = 'ACTIVA', '4i: reactiva';

  -- 5. Tope de IA
  r := wa_sumar_uso(81, 100);
  ASSERT (r->>'cruzo_80')::boolean, '5a: cruza 80%';
  r := wa_sumar_uso(1, 100);
  ASSERT NOT (r->>'cruzo_80')::boolean AND (r->>'usd_mes')::numeric = 82, '5b: no vuelve a cruzar';

  -- 6. Solo service_role
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM count(*) FROM wa_conversaciones;
    RAISE EXCEPTION '6: anon leyó wa_conversaciones';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM wa_sumar_uso(1, 100);
    RAISE EXCEPTION '6: anon ejecutó wa_sumar_uso';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
END $$;

ROLLBACK;
