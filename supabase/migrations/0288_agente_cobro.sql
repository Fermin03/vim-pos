-- ============================================================================
-- 0288 — Agente de WhatsApp (fase 3): el cliente paga su mensualidad de VIM con una liga de Mercado Pago.
--
-- Verificación por código al correo del dueño (15 min, un uso, 5 intentos; verificado 30 días), adeudo
-- calculado aquí (plan con su promoción + extras + IVA, cada periodo al precio de su fecha), intentos de
-- pago y aplicar el pago: registra con registrar_pago_suscripcion (0130), renueva y reactiva SOLO lo
-- suspendido por falta de pago. Los cupos de códigos los pone la función (`_shared/limite.ts`).
-- Tablas nuevas con RLS activado y SIN políticas; funciones solo para service_role (como 0286).
-- ============================================================================

-- Por qué se suspendió: solo FALTA_DE_PAGO se reactiva sola al pagar. NULL (las de antes) = otro motivo.
ALTER TABLE tenants
  ADD COLUMN suspension_tipo text NULL CHECK (suspension_tipo IN ('FALTA_DE_PAGO','OTRO'));

ALTER TABLE wa_conversaciones DROP CONSTRAINT wa_conversaciones_estado_check;
ALTER TABLE wa_conversaciones
  ADD CONSTRAINT wa_conversaciones_estado_check CHECK (estado IN (
    'ACTIVA','PROSPECTO_CALIENTE','URGENTE_SOPORTE','DUDA_SIN_RESPUESTA','RESUELTO','PAGO_PENDIENTE','PAGO_POR_CONFIRMAR')),
  ADD COLUMN verificado_tenants uuid[],
  ADD COLUMN verificado_hasta   timestamptz,
  ADD COLUMN tenant_id          uuid REFERENCES tenants(id),
  ADD COLUMN factura            jsonb CHECK (factura IS NULL OR jsonb_typeof(factura) = 'object');

CREATE TABLE wa_codigos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id uuid NOT NULL REFERENCES wa_conversaciones(id) ON DELETE CASCADE,
  correo          text NOT NULL,
  codigo_hash     text NOT NULL,
  tenants         uuid[] NOT NULL,
  intentos        int NOT NULL DEFAULT 0,
  expira_en       timestamptz NOT NULL,
  usado_en        timestamptz,
  creado_en       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wa_codigos_conversacion_idx ON wa_codigos (conversacion_id) WHERE usado_en IS NULL;

CREATE TABLE wa_intentos_pago (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id uuid NOT NULL REFERENCES wa_conversaciones(id),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  periodos        int NOT NULL CHECK (periodos BETWEEN 1 AND 12),
  desglose        jsonb NOT NULL,
  subtotal        numeric(10,2) NOT NULL,
  iva             numeric(10,2) NOT NULL,
  total           numeric(10,2) NOT NULL,
  factura         jsonb,
  estado          text NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','PAGADO','RECHAZADO')),
  proxima_al_crear date NOT NULL,
  preferencia_id  text,
  preferencia_url text,
  pago_id         text,
  vence_en        timestamptz NOT NULL,
  pagado_en       timestamptz,
  creado_en       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wa_intentos_pago_conversacion_idx ON wa_intentos_pago (conversacion_id, creado_en);

ALTER TABLE wa_codigos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_intentos_pago ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wa_codigos, wa_intentos_pago FROM PUBLIC, anon, authenticated;
GRANT ALL ON wa_codigos, wa_intentos_pago TO service_role;

-- Un pago con tarjeta (id de Mercado Pago) se registra una sola vez.
CREATE UNIQUE INDEX pagos_suscripcion_referencia_tarjeta ON pagos_suscripcion (referencia) WHERE metodo = 'TARJETA';

-- Usuario técnico del agente: firma registrado_por y la auditoría.
CREATE FUNCTION wa_agente_id() RETURNS uuid
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
  SELECT '00000000-0000-0000-0000-00000000a6e7'::uuid
$$;

-- Código de 6 dígitos al correo del dueño. Con correo desconocido no guarda nada; quien llama responde
-- igual en los dos casos. El código va en claro SOLO en la respuesta (para el correo); se guarda el hash.
CREATE FUNCTION wa_pedir_codigo(p_conversacion_id uuid, p_correo text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE v_correo text; v_tenants uuid[]; v_codigo text;
BEGIN
  SELECT min(u.email::text), array_agg(t.id ORDER BY t.nombre_comercial) INTO v_correo, v_tenants
    FROM auth.users u JOIN tenants t ON t.usuario_dueno_id = u.id
   WHERE lower(u.email::text) = lower(btrim(p_correo)) AND t.estado <> 'CANCELADO';
  IF v_tenants IS NULL THEN
    RETURN jsonb_build_object('enviar', false, 'correo', NULL, 'codigo', NULL);
  END IF;

  -- 32 bits de gen_random_bytes, no random() (predecible).
  v_codigo := lpad(((('x' || lpad(encode(gen_random_bytes(4), 'hex'), 16, '0'))::bit(64)::bigint) % 1000000)::text, 6, '0');
  -- Un código nuevo deja sin efecto los pendientes de la conversación.
  UPDATE wa_codigos SET usado_en = now() WHERE conversacion_id = p_conversacion_id AND usado_en IS NULL;
  INSERT INTO wa_codigos (conversacion_id, correo, codigo_hash, tenants, expira_en)
  VALUES (p_conversacion_id, v_correo, crypt(v_codigo, gen_salt('bf')), v_tenants, now() + interval '15 minutes');
  RETURN jsonb_build_object('enviar', true, 'correo', v_correo, 'codigo', v_codigo);
END $$;

CREATE FUNCTION wa_verificar_codigo(p_conversacion_id uuid, p_codigo text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE c wa_codigos%ROWTYPE; v_negocios jsonb;
BEGIN
  SELECT * INTO c FROM wa_codigos WHERE conversacion_id = p_conversacion_id AND usado_en IS NULL
   ORDER BY creado_en DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'SIN_CODIGO', 'negocios', '[]'::jsonb);
  ELSIF c.expira_en <= now() THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'VENCIDO', 'negocios', '[]'::jsonb);
  ELSIF c.intentos >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'AGOTADO', 'negocios', '[]'::jsonb);
  ELSIF crypt(btrim(COALESCE(p_codigo, '')), c.codigo_hash) <> c.codigo_hash THEN
    UPDATE wa_codigos SET intentos = intentos + 1 WHERE id = c.id;
    RETURN jsonb_build_object('ok', false, 'motivo', 'INCORRECTO', 'negocios', '[]'::jsonb);
  END IF;

  UPDATE wa_codigos SET usado_en = now() WHERE id = c.id;
  -- Con un solo negocio queda elegido; con varios, el cliente elige con wa_elegir_negocio.
  UPDATE wa_conversaciones
     SET verificado_tenants = c.tenants, verificado_hasta = now() + interval '30 days',
         tenant_id = CASE WHEN cardinality(c.tenants) = 1 THEN c.tenants[1] END
   WHERE id = p_conversacion_id;
  SELECT jsonb_agg(jsonb_build_object('id', t.id, 'nombre', t.nombre_comercial) ORDER BY t.nombre_comercial)
    INTO v_negocios FROM tenants t WHERE t.id = ANY(c.tenants);
  RETURN jsonb_build_object('ok', true, 'motivo', NULL, 'negocios', COALESCE(v_negocios, '[]'::jsonb));
END $$;

-- Elige por nombre comercial exacto (sin mayúsculas) entre los verificados; si no hay uno solo, da las opciones.
CREATE FUNCTION wa_elegir_negocio(p_conversacion_id uuid, p_nombre text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE v_c wa_conversaciones%ROWTYPE; v_ids uuid[]; v_nombres text[]; v_opciones jsonb;
BEGIN
  SELECT * INTO v_c FROM wa_conversaciones WHERE id = p_conversacion_id;
  IF NOT FOUND OR v_c.verificado_hasta IS NULL OR v_c.verificado_hasta <= now() THEN
    RETURN jsonb_build_object('ok', false, 'negocio', NULL, 'opciones', '[]'::jsonb);
  END IF;
  SELECT array_agg(t.id), array_agg(t.nombre_comercial::text) INTO v_ids, v_nombres
    FROM tenants t WHERE t.id = ANY(v_c.verificado_tenants) AND lower(t.nombre_comercial) = lower(btrim(p_nombre));
  IF cardinality(v_ids) = 1 THEN
    UPDATE wa_conversaciones SET tenant_id = v_ids[1] WHERE id = p_conversacion_id;
    RETURN jsonb_build_object('ok', true, 'negocio', v_nombres[1], 'opciones', '[]'::jsonb);
  END IF;
  SELECT jsonb_agg(t.nombre_comercial ORDER BY t.nombre_comercial) INTO v_opciones
    FROM tenants t WHERE t.id = ANY(v_c.verificado_tenants);
  RETURN jsonb_build_object('ok', false, 'negocio', NULL, 'opciones', COALESCE(v_opciones, '[]'::jsonb));
END $$;

-- Cuánto debe el negocio de la conversación. Vencidos = periodos que empiezan hoy o antes (hora de México);
-- con p_adelanto, uno más. Cada periodo al precio de su fecha de inicio (espejo de totalMensual en
-- packages/db/src/cobro.ts); ANUAL = 12 × el total al mes.
CREATE FUNCTION wa_adeudo(p_conversacion_id uuid, p_adelanto boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_hoy  date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_c    wa_conversaciones%ROWTYPE;
  v_t    tenants%ROWTYPE;
  v_s    suscripciones%ROWTYPE;
  v_res  jsonb;
  v_meses int; v_d date; v_sig date; v_venc int := 0; v_n int;
  v_plan numeric; v_extras numeric; v_imp numeric; v_sub numeric := 0; v_iva numeric;
  v_periodos jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_c FROM wa_conversaciones WHERE id = p_conversacion_id;
  IF NOT FOUND OR v_c.verificado_hasta IS NULL OR v_c.verificado_hasta <= now() THEN
    RETURN jsonb_build_object('verificado', false, 'puede_cobrar', false, 'motivo', 'SIN_VERIFICAR');
  END IF;
  IF v_c.tenant_id IS NULL OR NOT v_c.tenant_id = ANY(v_c.verificado_tenants) THEN
    RETURN jsonb_build_object('verificado', true, 'puede_cobrar', false, 'motivo', 'ELEGIR_NEGOCIO');
  END IF;

  SELECT * INTO v_t FROM tenants WHERE id = v_c.tenant_id;
  v_res := jsonb_build_object('verificado', true, 'puede_cobrar', false, 'negocio', v_t.nombre_comercial,
                              'estado_negocio', v_t.estado, 'suspension_tipo', v_t.suspension_tipo);
  IF v_t.estado = 'CANCELADO' THEN
    RETURN v_res || jsonb_build_object('motivo', 'CANCELADO');
  ELSIF v_t.estado = 'SUSPENDIDO' AND v_t.suspension_tipo IS DISTINCT FROM 'FALTA_DE_PAGO' THEN
    RETURN v_res || jsonb_build_object('motivo', 'SUSPENDIDO_OTRO');
  END IF;

  -- La misma suscripción que toma registrar_pago_suscripcion.
  SELECT * INTO v_s FROM suscripciones WHERE tenant_id = v_t.id AND estado IN ('ACTIVA','PAUSADA')
   ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN v_res || jsonb_build_object('motivo', 'SIN_SUSCRIPCION');
  END IF;

  v_meses := CASE v_s.ciclo_facturacion WHEN 'ANUAL' THEN 12 ELSE 1 END;
  v_d := COALESCE(v_s.proxima_fecha_cobro, v_s.fecha_inicio);
  v_res := v_res || jsonb_build_object('plan', (SELECT p.nombre FROM planes p WHERE p.id = v_s.plan_id),
                                       'ciclo', v_s.ciclo_facturacion, 'proxima_fecha_cobro', v_d);
  IF v_s.precio_mensual_mxn = 0 THEN
    RETURN v_res || jsonb_build_object('motivo', 'PRECIO_CERO');
  END IF;

  -- Cuenta hasta 13 y para: más de 12 no se cobra por aquí.
  v_sig := v_d;
  WHILE v_sig <= v_hoy AND v_venc <= 12 LOOP
    v_venc := v_venc + 1;
    v_sig := _fecha_cobro_siguiente(v_s.fecha_inicio, v_sig, v_meses);
  END LOOP;
  v_n := v_venc + CASE WHEN p_adelanto THEN 1 ELSE 0 END;
  v_res := v_res || jsonb_build_object('vencidos', v_venc);
  IF v_n > 12 THEN
    RETURN v_res || jsonb_build_object('motivo', 'MAS_DE_12');
  END IF;

  FOR i IN 1..v_n LOOP
    v_sig := _fecha_cobro_siguiente(v_s.fecha_inicio, v_d, v_meses);
    v_plan := precio_vigente_suscripcion(v_s.precio_mensual_mxn, v_s.precio_promocional_mxn, v_s.promocion_hasta, v_d);
    IF v_plan = 0 THEN
      RETURN v_res || jsonb_build_object('motivo', 'PRECIO_CERO');
    END IF;
    SELECT COALESCE(sum(a.precio_mensual_mxn * COALESCE(a.cantidad, 1)), 0) INTO v_extras
      FROM tenant_addons a
     WHERE a.tenant_id = v_t.id AND a.activo AND NOT a.incluido_en_plan
       AND a.fecha_inicio <= v_d AND (a.fecha_fin IS NULL OR a.fecha_fin >= v_d);
    v_imp := round((v_plan + v_extras) * v_meses, 2);
    v_periodos := v_periodos || jsonb_build_array(jsonb_build_object(
      'desde', v_d, 'hasta', v_sig - 1, 'plan', round(v_plan, 2), 'extras', round(v_extras, 2), 'importe', v_imp));
    v_sub := v_sub + v_imp;
    v_d := v_sig;
  END LOOP;

  v_iva := round(v_sub * 0.16, 2);
  RETURN v_res || jsonb_build_object('puede_cobrar', true, 'motivo', NULL, 'periodos', v_periodos,
    'subtotal', v_sub, 'iva', v_iva, 'total', v_sub + v_iva, 'cubre_hasta', v_d - 1);
END $$;

-- Datos fiscales confirmados por el cliente; se copian al intento al crear la liga. NULL los borra.
CREATE FUNCTION wa_guardar_factura(p_conversacion_id uuid, p_datos jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
  UPDATE wa_conversaciones SET factura = p_datos WHERE id = p_conversacion_id
$$;

-- Intento de pago con el monto calculado aquí. Uno pendiente, vigente e igual se reusa.
-- La conversación queda en PAGO_PENDIENTE sin pausar al agente.
CREATE FUNCTION wa_crear_intento(p_conversacion_id uuid, p_adelanto boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE v_c wa_conversaciones%ROWTYPE; v_a jsonb; v_n int; v_i wa_intentos_pago%ROWTYPE; v_reusado boolean := false;
BEGIN
  -- Bloquea la conversación: dos llamadas a la vez no crean dos intentos.
  SELECT * INTO v_c FROM wa_conversaciones WHERE id = p_conversacion_id FOR UPDATE;
  v_a := wa_adeudo(p_conversacion_id, p_adelanto);
  IF NOT (v_a->>'puede_cobrar')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'motivo', v_a->>'motivo');
  END IF;
  v_n := jsonb_array_length(v_a->'periodos');
  IF v_n = 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'AL_CORRIENTE');
  END IF;

  SELECT * INTO v_i FROM wa_intentos_pago
   WHERE conversacion_id = p_conversacion_id AND tenant_id = v_c.tenant_id AND estado = 'PENDIENTE'
     AND vence_en > now() AND periodos = v_n AND total = (v_a->>'total')::numeric
     AND proxima_al_crear = (v_a->>'proxima_fecha_cobro')::date
   ORDER BY creado_en DESC LIMIT 1;
  IF FOUND THEN
    UPDATE wa_intentos_pago SET factura = v_c.factura WHERE id = v_i.id;
    v_reusado := true;
  ELSE
    INSERT INTO wa_intentos_pago (conversacion_id, tenant_id, periodos, desglose, subtotal, iva, total, factura,
                                  proxima_al_crear, vence_en)
    VALUES (p_conversacion_id, v_c.tenant_id, v_n, v_a->'periodos', (v_a->>'subtotal')::numeric,
            (v_a->>'iva')::numeric, (v_a->>'total')::numeric, v_c.factura,
            (v_a->>'proxima_fecha_cobro')::date, now() + interval '24 hours')
    RETURNING * INTO v_i;
  END IF;

  UPDATE wa_conversaciones SET estado = 'PAGO_PENDIENTE' WHERE id = p_conversacion_id;
  RETURN jsonb_build_object('ok', true, 'motivo', NULL, 'intento_id', v_i.id, 'total', v_i.total,
                            'periodos', v_i.periodos, 'reusado', v_reusado, 'preferencia_url', v_i.preferencia_url);
END $$;

CREATE FUNCTION wa_fijar_preferencia(p_intento_id uuid, p_preferencia_id text, p_url text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
  UPDATE wa_intentos_pago SET preferencia_id = p_preferencia_id, preferencia_url = p_url
   WHERE id = p_intento_id AND estado = 'PENDIENTE'
$$;

-- Aplica un pago ya confirmado con Mercado Pago. Registra y renueva (registrar_pago_suscripcion), y
-- reactiva solo si estaba SUSPENDIDO por FALTA_DE_PAGO (mismo patch que «reactivar» en /platform).
-- Monto distinto o fecha de cobro movida desde el intento (pago doble) → no registra nada: RECHAZADO.
-- Un intento vencido se aplica igual: el dinero ya entró.
CREATE FUNCTION wa_aplicar_pago(p_intento_id uuid, p_pago_id text, p_monto numeric, p_pagado_el date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_i wa_intentos_pago%ROWTYPE; v_t tenants%ROWTYPE; v_c wa_conversaciones%ROWTYPE;
  v_prox date; v_res text; v_reac boolean := false; v_sin boolean := false;
BEGIN
  SELECT * INTO v_i FROM wa_intentos_pago WHERE id = p_intento_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('resultado', 'NO_EXISTE', 'reactivado', false, 'sin_reactivar', false);
  END IF;
  SELECT * INTO v_t FROM tenants WHERE id = v_i.tenant_id FOR UPDATE;
  SELECT COALESCE(s.proxima_fecha_cobro, s.fecha_inicio) INTO v_prox FROM suscripciones s
   WHERE s.tenant_id = v_i.tenant_id AND s.estado IN ('ACTIVA','PAUSADA') ORDER BY s.created_at DESC LIMIT 1;

  IF v_i.estado = 'PAGADO' THEN
    v_res := 'DUPLICADO';
  ELSIF p_monto IS NULL OR abs(p_monto - v_i.total) > 0.005 THEN
    v_res := 'MONTO_DISTINTO';
  ELSIF v_prox IS DISTINCT FROM v_i.proxima_al_crear THEN
    v_res := 'FECHA_MOVIDA';
  ELSE
    v_prox := (registrar_pago_suscripcion(v_i.tenant_id, v_i.total, 'TARJETA', p_pagado_el, v_i.periodos,
                                          p_pago_id, 'Pago por WhatsApp', wa_agente_id()) ->> 'proxima_fecha_cobro')::date;
    IF v_t.estado = 'SUSPENDIDO' AND v_t.suspension_tipo = 'FALTA_DE_PAGO' THEN
      UPDATE tenants SET estado = 'ACTIVO', fecha_baja = NULL, motivo_baja = NULL, bloqueo_desde = NULL,
                         bloqueo_mensaje = NULL, suspension_tipo = NULL
       WHERE id = v_t.id;
      INSERT INTO super_admin_accesos (super_admin_id, tenant_id, accion, motivo, payload)
      VALUES (wa_agente_id(), v_t.id, 'tenant.activo', 'Pago con tarjeta por WhatsApp',
              jsonb_build_object('pago_id', p_pago_id, 'intento_id', v_i.id));
      v_reac := true;
    ELSE
      v_sin := v_t.estado IN ('SUSPENDIDO','CANCELADO');
    END IF;
    UPDATE wa_intentos_pago SET estado = 'PAGADO', pago_id = p_pago_id, pagado_en = now() WHERE id = v_i.id;
    -- Solo sale de PAGO_PENDIENTE: un URGENTE_SOPORTE abierto sigue a la vista de Fermín.
    UPDATE wa_conversaciones SET estado = 'ACTIVA' WHERE id = v_i.conversacion_id AND estado = 'PAGO_PENDIENTE';
    v_res := 'APLICADO';
  END IF;
  IF v_res IN ('MONTO_DISTINTO','FECHA_MOVIDA') THEN
    UPDATE wa_intentos_pago SET estado = 'RECHAZADO', pago_id = p_pago_id WHERE id = v_i.id;
  END IF;

  SELECT * INTO v_c FROM wa_conversaciones WHERE id = v_i.conversacion_id;
  RETURN jsonb_build_object(
    'resultado', v_res, 'reactivado', v_reac, 'sin_reactivar', v_sin, 'proxima_fecha_cobro', v_prox,
    'wa_id', v_c.wa_id, 'conversacion_id', v_c.id, 'negocio', v_t.nombre_comercial, 'factura', v_i.factura,
    'ultimo_cliente_en', (SELECT max(m.creado_en) FROM wa_mensajes m WHERE m.conversacion_id = v_c.id AND m.autor = 'CLIENTE'));
END $$;

-- Aviso a Fermín que NO pausa al agente ni cambia el estado (factura por emitir, pago pendiente).
CREATE FUNCTION wa_avisar_fermin(p_conversacion_id uuid, p_motivo text, p_resumen text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
  INSERT INTO wa_avisos_fermin (conversacion_id, motivo, resumen, sale_en)
  VALUES (p_conversacion_id, p_motivo, p_resumen, wa_siguiente_horario(now()))
$$;

REVOKE ALL ON FUNCTION
  wa_agente_id(), wa_pedir_codigo(uuid, text), wa_verificar_codigo(uuid, text), wa_elegir_negocio(uuid, text),
  wa_adeudo(uuid, boolean), wa_guardar_factura(uuid, jsonb), wa_crear_intento(uuid, boolean),
  wa_fijar_preferencia(uuid, text, text), wa_aplicar_pago(uuid, text, numeric, date), wa_avisar_fermin(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  wa_agente_id(), wa_pedir_codigo(uuid, text), wa_verificar_codigo(uuid, text), wa_elegir_negocio(uuid, text),
  wa_adeudo(uuid, boolean), wa_guardar_factura(uuid, jsonb), wa_crear_intento(uuid, boolean),
  wa_fijar_preferencia(uuid, text, text), wa_aplicar_pago(uuid, text, numeric, date), wa_avisar_fermin(uuid, text, text)
  TO service_role;
