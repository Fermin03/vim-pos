-- 0130 — Pagos de la suscripción: el libro de lo que cada negocio le paga a VIM.
--
-- `suscripciones` (0002) guarda el precio y la `proxima_fecha_cobro`, pero no había dónde asentar
-- un pago: el panel alertaba "cobro vencido" y nadie podía decir "ya pagó" más que moviendo la
-- fecha a mano, sin rastro de cuánto, cómo ni quién lo registró. Y el negocio no veía nada.
--
-- Aquí:
--   · `pagos_suscripcion` — cada pago recibido, con el periodo que cubre. Nunca se borra: un pago
--     equivocado se ANULA con motivo, y queda.
--   · `registrar_pago_suscripcion` — asienta el pago y recorre `proxima_fecha_cobro` en la misma
--     transacción. El periodo lo pone el sistema (desde la fecha que tocaba cobrar, por el ciclo de
--     la suscripción), no quien captura: así dos pagos no pueden cubrir el mismo mes.
--   · `anular_pago_suscripcion` — solo el último pago vigente, y regresa la fecha.
--
-- Hoy los pagos llegan por transferencia o en efectivo y se registran desde el panel de VIM. El
-- cobro automático con tarjeta, cuando exista, escribe en esta misma tabla (metodo = 'TARJETA').
--
-- Quién ve qué: el dueño y los administradores del negocio leen SUS pagos (Configuración → Plan y
-- pagos); escribir, solo el servidor del panel (service_role).

CREATE TABLE pagos_suscripcion (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  suscripcion_id  uuid NOT NULL REFERENCES suscripciones(id) ON DELETE RESTRICT,
  monto_mxn       numeric(10,2) NOT NULL CHECK (monto_mxn > 0),
  metodo          varchar(20) NOT NULL CHECK (metodo IN ('TRANSFERENCIA', 'EFECTIVO', 'TARJETA', 'DEPOSITO', 'OTRO')),
  referencia      text NULL CHECK (referencia IS NULL OR length(referencia) <= 120),
  pagado_el       date NOT NULL,
  -- Periodo que cubre, inclusivo en los dos extremos.
  cubre_desde     date NOT NULL,
  cubre_hasta     date NOT NULL,
  notas           text NULL CHECK (notas IS NULL OR length(notas) <= 500),
  -- Operador del panel (plataforma_operadores) o el UUID de sistema de la clave compartida.
  registrado_por  uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  anulado_at      timestamptz NULL,
  anulado_motivo  text NULL,
  anulado_por     uuid NULL,
  CONSTRAINT periodo_pago_valido CHECK (cubre_hasta >= cubre_desde),
  CONSTRAINT anulacion_completa CHECK ((anulado_at IS NULL) = (anulado_motivo IS NULL))
);

CREATE INDEX idx_pagos_suscripcion_tenant ON pagos_suscripcion(tenant_id, cubre_desde DESC);
CREATE INDEX idx_pagos_suscripcion_susc ON pagos_suscripcion(suscripcion_id, cubre_desde DESC) WHERE anulado_at IS NULL;

ALTER TABLE pagos_suscripcion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pagos_suscripcion FROM anon;
REVOKE INSERT, UPDATE, DELETE ON pagos_suscripcion FROM authenticated;
GRANT SELECT ON pagos_suscripcion TO authenticated;

-- Los pagos son del dueño y los administradores, no de toda la plantilla: un cajero no tiene por
-- qué ver cuánto le paga el negocio a VIM.
CREATE POLICY pagos_suscripcion_select_admin ON pagos_suscripcion FOR SELECT TO authenticated
  USING (tenant_id = current_tenant_id() AND es_admin_del_tenant(tenant_id));

COMMENT ON TABLE pagos_suscripcion IS
  'Pagos del negocio a VIM (0130). Se anulan, no se borran. Escribe solo el panel de plataforma vía registrar/anular_pago_suscripcion.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- La siguiente fecha de cobro, contada desde el día de alta y no desde la última fecha: una
-- suscripción del 31 de enero cobra el 28 de febrero y el 31 de marzo, no el 28 para siempre (que
-- es lo que pasa encadenando "+1 mes" sobre una fecha ya recortada).
CREATE OR REPLACE FUNCTION _fecha_cobro_siguiente(p_inicio date, p_desde date, p_meses int)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT (p_inicio + make_interval(months =>
            ((date_part('year', p_desde) - date_part('year', p_inicio)) * 12
             + (date_part('month', p_desde) - date_part('month', p_inicio)))::int + p_meses))::date;
$$;

REVOKE ALL ON FUNCTION _fecha_cobro_siguiente(date, date, int) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION registrar_pago_suscripcion(
  p_tenant_id      uuid,
  p_monto          numeric,
  p_metodo         text,
  p_pagado_el      date,
  p_periodos       int,
  p_referencia     text,
  p_notas          text,
  p_registrado_por uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_s      public.suscripciones%ROWTYPE;
  v_meses  int;
  v_desde  date;
  v_prox   date;
  v_id     uuid;
BEGIN
  IF p_periodos IS NULL OR p_periodos < 1 OR p_periodos > 12 THEN
    RAISE EXCEPTION 'PERIODOS_INVALIDOS' USING HINT = 'De 1 a 12 periodos por pago.';
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'MONTO_INVALIDO';
  END IF;

  -- La suscripción vigente, bloqueada: dos registros simultáneos no pueden cubrir el mismo mes.
  SELECT * INTO v_s
    FROM public.suscripciones
   WHERE tenant_id = p_tenant_id AND estado IN ('ACTIVA', 'PAUSADA')
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SIN_SUSCRIPCION' USING HINT = 'Activa el cobro del cliente antes de registrar pagos.';
  END IF;

  v_meses := p_periodos * CASE v_s.ciclo_facturacion WHEN 'ANUAL' THEN 12 ELSE 1 END;
  v_desde := COALESCE(v_s.proxima_fecha_cobro, v_s.fecha_inicio);
  v_prox  := public._fecha_cobro_siguiente(v_s.fecha_inicio, v_desde, v_meses);

  INSERT INTO public.pagos_suscripcion
    (tenant_id, suscripcion_id, monto_mxn, metodo, referencia, pagado_el, cubre_desde, cubre_hasta, notas, registrado_por)
  VALUES
    (p_tenant_id, v_s.id, round(p_monto, 2), p_metodo, NULLIF(btrim(p_referencia), ''), p_pagado_el,
     v_desde, v_prox - 1, NULLIF(btrim(p_notas), ''), p_registrado_por)
  RETURNING id INTO v_id;

  UPDATE public.suscripciones
     SET ultima_fecha_cobro = p_pagado_el,
         proxima_fecha_cobro = v_prox,
         updated_at = now()
   WHERE id = v_s.id;

  RETURN jsonb_build_object('pago_id', v_id, 'cubre_desde', v_desde, 'cubre_hasta', v_prox - 1, 'proxima_fecha_cobro', v_prox);
END;
$$;

REVOKE ALL ON FUNCTION registrar_pago_suscripcion(uuid, numeric, text, date, int, text, text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION anular_pago_suscripcion(p_pago_id uuid, p_motivo text, p_anulado_por uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_p        public.pagos_suscripcion%ROWTYPE;
  v_ultimo   uuid;
  v_anterior date;
BEGIN
  IF p_motivo IS NULL OR length(btrim(p_motivo)) < 10 THEN
    RAISE EXCEPTION 'MOTIVO_REQUERIDO';
  END IF;

  SELECT * INTO v_p FROM public.pagos_suscripcion WHERE id = p_pago_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAGO_NO_EXISTE'; END IF;
  IF v_p.anulado_at IS NOT NULL THEN RAISE EXCEPTION 'PAGO_YA_ANULADO'; END IF;

  -- Solo el último vigente: anular uno de en medio dejaría un hueco que la fecha de cobro no puede
  -- representar. Si hubo un error más atrás, se anulan en orden, del más reciente hacia atrás.
  SELECT id INTO v_ultimo
    FROM public.pagos_suscripcion
   WHERE suscripcion_id = v_p.suscripcion_id AND anulado_at IS NULL
   ORDER BY cubre_desde DESC, created_at DESC
   LIMIT 1;
  IF v_ultimo <> v_p.id THEN
    RAISE EXCEPTION 'NO_ES_EL_ULTIMO' USING HINT = 'Anula primero los pagos más recientes.';
  END IF;

  UPDATE public.pagos_suscripcion
     SET anulado_at = now(), anulado_motivo = btrim(p_motivo), anulado_por = p_anulado_por
   WHERE id = v_p.id;

  SELECT max(pagado_el) INTO v_anterior
    FROM public.pagos_suscripcion
   WHERE suscripcion_id = v_p.suscripcion_id AND anulado_at IS NULL;

  UPDATE public.suscripciones
     SET proxima_fecha_cobro = v_p.cubre_desde,
         ultima_fecha_cobro = v_anterior,
         updated_at = now()
   WHERE id = v_p.suscripcion_id;

  RETURN jsonb_build_object('pago_id', v_p.id, 'proxima_fecha_cobro', v_p.cubre_desde);
END;
$$;

REVOKE ALL ON FUNCTION anular_pago_suscripcion(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
