-- Belleza, entrega 3: reservas en línea en la base (diseño 2026-10-18, plan 2026-10-19).
--
-- La clienta reserva desde el sitio (online.vimpos.com.mx/<negocio>) sin cuenta. Todo pasa por la
-- función `tienda` (service_role) con el negocio explícito: estas RPC no leen el JWT y ni anon ni
-- authenticated las ejecutan.
-- §1 Configuración (con la guardia de la agenda), servicio en línea y columnas de citas.
-- §2 modulos_efectivos publica `reservas` = add-on TIENDA + interruptor + agenda.
-- §3 colaborador_libre con el negocio explícito (_colaborador_libre); _agenda_tramos la usa.
-- §4 Internas: cadena de tramos, validación, resumen, anticipo, nombre corto.
-- §5 RPC: reservas_negocio, agenda_huecos, agenda_reservar_en_linea, agenda_cita_publica,
--    agenda_cancelar_en_linea, agenda_mover_en_linea, agenda_vencer_reservas (su propio cron).
-- Horas: todo en America/Mexico_City. México no tiene horario de verano desde 2022, así que un día
-- local siempre dura 24 h y no hay horas repetidas ni saltadas.
-- Los restaurantes y las tiendas no cambian: sin el interruptor, nada de esto se ve.

-- ── §1 Columnas ─────────────────────────────────────────────────────────────
ALTER TABLE configuracion_tenant
  ADD COLUMN IF NOT EXISTS modulo_reservas_activo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS agenda_dias_reserva integer NOT NULL DEFAULT 30
    CHECK (agenda_dias_reserva BETWEEN 1 AND 120),
  ADD COLUMN IF NOT EXISTS agenda_intervalo_min integer NOT NULL DEFAULT 15
    CHECK (agenda_intervalo_min IN (5, 10, 15, 20, 30, 60)),
  ADD COLUMN IF NOT EXISTS agenda_aviso_min_horas integer NOT NULL DEFAULT 2
    CHECK (agenda_aviso_min_horas BETWEEN 0 AND 72);
COMMENT ON COLUMN configuracion_tenant.modulo_reservas_activo IS 'Interruptor del dueño: reservas en línea (necesita el add-on TIENDA y la agenda) (0224).';
COMMENT ON COLUMN configuracion_tenant.agenda_dias_reserva IS 'Cuántos días adelante se puede reservar en línea (0224).';
COMMENT ON COLUMN configuracion_tenant.agenda_intervalo_min IS 'Cada cuántos minutos empiezan los horarios ofrecidos en línea (0224).';
COMMENT ON COLUMN configuracion_tenant.agenda_aviso_min_horas IS 'No se reserva en línea con menos de estas horas de anticipación (0224).';

-- Cuerpo vigente de la 0221 más las columnas nuevas.
CREATE OR REPLACE FUNCTION configuracion_tenant_agenda_guardia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cambio boolean;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    v_cambio := NEW.agenda_tolerancia_min IS DISTINCT FROM OLD.agenda_tolerancia_min
             OR NEW.agenda_cobro_modo IS DISTINCT FROM OLD.agenda_cobro_modo
             OR NEW.agenda_cancelar_horas IS DISTINCT FROM OLD.agenda_cancelar_horas
             OR NEW.agenda_comision_base IS DISTINCT FROM OLD.agenda_comision_base
             OR NEW.agenda_comision_productos_pct IS DISTINCT FROM OLD.agenda_comision_productos_pct
             OR NEW.agenda_periodo_comisiones IS DISTINCT FROM OLD.agenda_periodo_comisiones
             OR NEW.modulo_reservas_activo IS DISTINCT FROM OLD.modulo_reservas_activo
             OR NEW.agenda_dias_reserva IS DISTINCT FROM OLD.agenda_dias_reserva
             OR NEW.agenda_intervalo_min IS DISTINCT FROM OLD.agenda_intervalo_min
             OR NEW.agenda_aviso_min_horas IS DISTINCT FROM OLD.agenda_aviso_min_horas;
  ELSE
    v_cambio := NEW.agenda_tolerancia_min <> 15
             OR NEW.agenda_cobro_modo <> 'AL_FINAL'
             OR NEW.agenda_cancelar_horas <> 24
             OR NEW.agenda_comision_base <> 'COBRADO'
             OR NEW.agenda_comision_productos_pct IS NOT NULL
             OR NEW.agenda_periodo_comisiones <> 'SEMANAL'
             OR NEW.modulo_reservas_activo
             OR NEW.agenda_dias_reserva <> 30
             OR NEW.agenda_intervalo_min <> 15
             OR NEW.agenda_aviso_min_horas <> 2;
  END IF;
  IF v_cambio AND NOT es_admin_del_tenant(NEW.tenant_id) THEN
    RAISE EXCEPTION 'Solo el dueño o un administrador puede cambiar las reglas de la agenda.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION configuracion_tenant_agenda_guardia() FROM PUBLIC, anon, authenticated;

ALTER TABLE servicios_agenda
  ADD COLUMN IF NOT EXISTS en_linea boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN servicios_agenda.en_linea IS 'Se ofrece en las reservas en línea. En tatuajes, solo «Cotización» o «Valoración» (0224).';

ALTER TABLE citas
  ADD COLUMN IF NOT EXISTS enlace_hash    text NULL CHECK (enlace_hash ~ '^[0-9a-f]{64}$'),
  ADD COLUMN IF NOT EXISTS pago_hasta     timestamptz NULL,
  ADD COLUMN IF NOT EXISTS reservo_email  text NULL CHECK (char_length(reservo_email) <= 254),
  ADD COLUMN IF NOT EXISTS cancelada_por  text NULL
    CHECK (cancelada_por IN ('CLIENTA_EN_LINEA', 'NEGOCIO', 'CAJA', 'PAGO_VENCIDO'));
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'citas_enlace_hash_uq') THEN
    ALTER TABLE citas ADD CONSTRAINT citas_enlace_hash_uq UNIQUE (tenant_id, enlace_hash);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_citas_pago_hasta ON citas (pago_hasta) WHERE pago_hasta IS NOT NULL AND estado = 'AGENDADA';
COMMENT ON COLUMN citas.enlace_hash IS 'SHA-256 (hex) del código del enlace de la cita en línea. El código en claro no se guarda (0224).';
COMMENT ON COLUMN citas.pago_hasta IS 'Reserva en línea con anticipo por pagar: el lugar se aparta hasta aquí; luego agenda_vencer_reservas la cancela (0224).';
COMMENT ON COLUMN citas.reservo_email IS 'Correo con el que se reservó en línea; ahí van confirmación, recordatorio y cambios (0224).';
COMMENT ON COLUMN citas.cancelada_por IS 'Quién canceló: CLIENTA_EN_LINEA (siempre a tiempo), NEGOCIO, CAJA o PAGO_VENCIDO. Decide el reembolso del anticipo en línea (0224).';

-- ── §2 modulos_efectivos ────────────────────────────────────────────────────
-- Cuerpo vigente de la 0218 con `reservas`: permitido = add-on TIENDA; efectivo = además el
-- interruptor del dueño y la agenda encendida.
CREATE OR REPLACE FUNCTION modulos_efectivos(p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan       jsonb;
  v_op         jsonb;
  v_inv        boolean;
  v_del        boolean;
  v_lea        boolean;
  v_tie        boolean;
  v_cre        boolean;
  v_cot        boolean;
  v_res        boolean;
  v_permitidos jsonb := '{}'::jsonb;
  v_efectivos  jsonb := '{}'::jsonb;
  v_codigo     text;
  v_perm       boolean;
  v_enc        boolean;
  v_flag       boolean;
BEGIN
  IF p_tenant IS NULL THEN RETURN NULL; END IF;
  -- Un usuario autenticado solo puede preguntar por su propio tenant. Se decide por el ROL del
  -- JWT y no por la ausencia del claim: el hook de acceso (0006) emite tokens SIN tenant_id a
  -- empleados dados de baja, y un token así seguiría siendo `authenticated`. Sin JWT (sesión
  -- directa a la base: pruebas, semillas) o con service_role, pasa.
  IF auth.jwt() IS NOT NULL
     AND (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role'
     AND current_tenant_id() IS DISTINCT FROM p_tenant THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(p.features_incluidos->'modulos', '{}'::jsonb), t.operacion
    INTO v_plan, v_op
    FROM tenants t LEFT JOIN planes p ON p.id = t.plan_actual_id
   WHERE t.id = p_tenant;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(c.modulo_inventario_activo, false) INTO v_inv
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;

  FOREACH v_codigo IN ARRAY ARRAY['kds', 'recetas', 'reservaciones', 'promociones'] LOOP
    v_flag := NULL;
    SELECT f.activado INTO v_flag
      FROM tenant_feature_flags f
     WHERE f.tenant_id = p_tenant AND f.flag_codigo = v_codigo
       AND f.fecha_inicio <= now() AND (f.fecha_fin IS NULL OR f.fecha_fin > now());
    v_perm := COALESCE(v_flag, (v_plan->>v_codigo)::boolean, false);
    v_enc  := CASE v_codigo
                WHEN 'recetas' THEN COALESCE(v_inv, false)
                WHEN 'kds' THEN COALESCE((v_op->>'kds')::boolean, true)
                WHEN 'reservaciones' THEN COALESCE((v_op->>'reservaciones')::boolean, true)
                ELSE true END;
    v_permitidos := v_permitidos || jsonb_build_object(v_codigo, v_perm);
    v_efectivos  := v_efectivos  || jsonb_build_object(v_codigo, (v_perm AND v_enc));
  END LOOP;

  FOREACH v_codigo IN ARRAY ARRAY['mostrador', 'comedor', 'meseros', 'domicilio', 'repartidores',
                                  'marcas', 'eventos', 'cuentas_barra'] LOOP
    v_permitidos := v_permitidos || jsonb_build_object(v_codigo, true);
    v_efectivos  := v_efectivos  || jsonb_build_object(v_codigo, COALESCE((v_op->>v_codigo)::boolean, true));
  END LOOP;

  -- 0189: existencias por producto; 0218: agenda. Sin llave = apagado.
  FOREACH v_codigo IN ARRAY ARRAY['existencias', 'agenda'] LOOP
    v_permitidos := v_permitidos || jsonb_build_object(v_codigo, true);
    v_efectivos  := v_efectivos  || jsonb_build_object(v_codigo, COALESCE((v_op->>v_codigo)::boolean, false));
  END LOOP;

  v_perm := tenant_addon_activo(p_tenant, 'CFDI');
  v_permitidos := v_permitidos || jsonb_build_object('cfdi', v_perm);
  v_efectivos  := v_efectivos  || jsonb_build_object('cfdi', v_perm);

  SELECT COALESCE(c.modulo_delivery_activo, false) INTO v_del
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;

  -- Delivery es el único módulo con las DOS capas a la vez: add-on de pago (como el CFDI) e
  -- interruptor del dueño (como recetas). El add-on dice si puede; el interruptor, si quiere.
  v_perm := tenant_addon_activo(p_tenant, 'DELIVERY');
  v_permitidos := v_permitidos || jsonb_build_object('delivery_apps', v_perm);
  v_efectivos  := v_efectivos  || jsonb_build_object('delivery_apps', (v_perm AND COALESCE(v_del, false)));

  -- Lealtad: mismas dos capas que delivery. El add-on dice si puede; el interruptor, si quiere.
  SELECT COALESCE(c.modulo_lealtad_activo, false) INTO v_lea
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;
  v_perm := tenant_addon_activo(p_tenant, 'LEALTAD');
  v_permitidos := v_permitidos || jsonb_build_object('lealtad', v_perm);
  v_efectivos  := v_efectivos  || jsonb_build_object('lealtad', (v_perm AND COALESCE(v_lea, false)));

  -- Tienda en línea: mismas dos capas que delivery y lealtad.
  SELECT COALESCE(c.modulo_tienda_activo, false) INTO v_tie
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;
  v_perm := tenant_addon_activo(p_tenant, 'TIENDA');
  v_permitidos := v_permitidos || jsonb_build_object('tienda', v_perm);
  v_efectivos  := v_efectivos  || jsonb_build_object('tienda', (v_perm AND COALESCE(v_tie, false)));

  -- 0224: reservas en línea. Mismo add-on que la tienda, su propio interruptor y la agenda.
  SELECT COALESCE(c.modulo_reservas_activo, false) INTO v_res
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;
  v_permitidos := v_permitidos || jsonb_build_object('reservas', v_perm);
  v_efectivos  := v_efectivos  || jsonb_build_object('reservas',
                    (v_perm AND COALESCE(v_res, false) AND COALESCE((v_op->>'agenda')::boolean, false)));

  -- 0208: crédito. Siempre permitido; encendido = interruptor del dueño.
  SELECT COALESCE(c.modulo_credito_activo, false) INTO v_cre
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;
  v_permitidos := v_permitidos || jsonb_build_object('credito', true);
  v_efectivos  := v_efectivos  || jsonb_build_object('credito', COALESCE(v_cre, false));

  -- 0212: cotizaciones. Mismo molde que crédito.
  SELECT COALESCE(c.modulo_cotizaciones_activo, false) INTO v_cot
    FROM configuracion_tenant c WHERE c.tenant_id = p_tenant;
  v_permitidos := v_permitidos || jsonb_build_object('cotizaciones', true);
  v_efectivos  := v_efectivos  || jsonb_build_object('cotizaciones', COALESCE(v_cot, false));

  RETURN jsonb_build_object('permitidos', v_permitidos, 'efectivos', v_efectivos);
END;
$$;
COMMENT ON FUNCTION modulos_efectivos(uuid) IS
  'Módulos por cliente: permitidos (plan + flags; los de operación siempre) y efectivos (AND encendido por el dueño o, en los de operación, por VIM). Única lectura autorizada (ADR 0014, 0180, 0189, 0208, 0212, 0218, 0224).';
REVOKE EXECUTE ON FUNCTION modulos_efectivos(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION modulos_efectivos(uuid) TO authenticated, service_role;

-- ── §3 «Quien esté libre» con el negocio explícito ──────────────────────────
-- Cuerpo vigente de colaborador_libre (0218) con el negocio como parámetro y, opcional, un
-- colaborador fijo (¿puede ESTE en ese tramo?) y una cita cuyos tramos no cuentan (la que se
-- cambia de hora). La pública conserva su firma y lee el JWT.
CREATE OR REPLACE FUNCTION _colaborador_libre(p_tenant uuid, p_sucursal uuid, p_producto uuid, p_inicia timestamptz,
                                              p_usuario uuid DEFAULT NULL, p_excluir_cita uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH c AS (
    SELECT ca.tenant_id, ca.usuario_id, ca.orden,
           p_inicia + make_interval(mins => COALESCE(sc.duracion_min, sa.duracion_min)) AS termina
      FROM servicios_agenda sa
      JOIN servicio_colaborador sc ON sc.tenant_id = sa.tenant_id AND sc.producto_id = sa.producto_id
      JOIN colaboradores_agenda ca ON ca.tenant_id = sc.tenant_id AND ca.usuario_id = sc.usuario_id
     WHERE sa.tenant_id = p_tenant AND sa.producto_id = p_producto AND sa.activo
       AND ca.sucursal_id = p_sucursal AND ca.activo
       AND (p_usuario IS NULL OR ca.usuario_id = p_usuario)
       AND EXISTS (SELECT 1 FROM usuarios_acceso ua WHERE ua.tenant_id = ca.tenant_id AND ua.usuario_id = ca.usuario_id AND ua.activo)
       AND EXISTS (SELECT 1 FROM usuarios_perfil up WHERE up.id = ca.usuario_id AND up.deleted_at IS NULL)
  ), l AS (
    SELECT c.*, (p_inicia AT TIME ZONE 'America/Mexico_City') AS ini,
           (c.termina AT TIME ZONE 'America/Mexico_City') AS fin
      FROM c
  )
  SELECT l.usuario_id
    FROM l
    JOIN horarios_colaborador h ON h.tenant_id = l.tenant_id AND h.usuario_id = l.usuario_id
   WHERE h.dia_semana = extract(dow FROM l.ini)
     AND l.fin::date = l.ini::date
     AND l.ini::time >= h.inicia AND l.fin::time <= h.termina
     AND NOT (h.comida_inicia IS NOT NULL AND l.ini::time < h.comida_termina AND l.fin::time > h.comida_inicia)
     AND NOT EXISTS (SELECT 1 FROM ausencias_colaborador a
                      WHERE a.tenant_id = l.tenant_id AND a.usuario_id = l.usuario_id
                        AND l.ini::date BETWEEN a.desde AND a.hasta)
     AND NOT EXISTS (SELECT 1 FROM citas_servicios cs
                      WHERE cs.tenant_id = l.tenant_id AND cs.usuario_id = l.usuario_id AND cs.activa AND cs.cita_id IS DISTINCT FROM p_excluir_cita
                        AND tstzrange(cs.inicia, cs.termina, '[)') && tstzrange(p_inicia, l.termina, '[)'))
   ORDER BY (SELECT count(DISTINCT cs.cita_id) FROM citas_servicios cs
              WHERE cs.tenant_id = l.tenant_id AND cs.usuario_id = l.usuario_id AND cs.activa AND cs.cita_id IS DISTINCT FROM p_excluir_cita
                AND (cs.inicia AT TIME ZONE 'America/Mexico_City')::date = l.ini::date),
            l.orden, l.usuario_id
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION _colaborador_libre(uuid, uuid, uuid, timestamptz, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION colaborador_libre(p_sucursal uuid, p_producto uuid, p_inicia timestamptz)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT _colaborador_libre(current_tenant_id(), p_sucursal, p_producto, p_inicia);
$$;
COMMENT ON FUNCTION colaborador_libre(uuid, uuid, timestamptz) IS
  '«Quien esté libre»: empleado vigente que hace el servicio y puede en su tramo (con su duración), con menos citas ese día (desempate: orden). NULL si nadie (0218; cuerpo en _colaborador_libre, 0224).';

-- Cuerpo vigente de la 0219; solo cambia la llamada a «quien esté libre»: con el negocio que
-- recibe (las RPC en línea corren sin negocio en el JWT).
CREATE OR REPLACE FUNCTION _agenda_tramos(p_tenant uuid, p_cita uuid, p_sucursal uuid, p_inicia timestamptz, p_servicios jsonb)
RETURNS timestamptz
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_s       jsonb;
  v_orden   smallint := 0;
  v_cursor  timestamptz := p_inicia;
  v_fin     timestamptz;
  v_dur     integer;
  v_tipo    uuid;
  v_usuario uuid;
  v_espacio uuid;
  v_precio  numeric(12,2);
  v_prod    uuid;
  v_restr   text;
  v_nombre  text;
  v_choca   uuid[];
BEGIN
  IF jsonb_typeof(p_servicios) IS DISTINCT FROM 'array' OR jsonb_array_length(p_servicios) = 0 THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la cita no tiene servicios.' USING ERRCODE = '22023';
  END IF;

  FOR v_s IN SELECT * FROM jsonb_array_elements(p_servicios) LOOP
    v_prod    := (v_s->>'producto_id')::uuid;
    v_usuario := (v_s->>'usuario_id')::uuid;
    v_espacio := (v_s->>'espacio_id')::uuid;
    -- Un producto borrado o pausado en /productos ya no se agenda.
    SELECT sa.duracion_min, sa.tipo_espacio_id INTO v_dur, v_tipo
      FROM servicios_agenda sa
      JOIN productos p ON p.id = sa.producto_id AND p.deleted_at IS NULL AND p.estado <> 'PAUSADO'
     WHERE sa.producto_id = v_prod AND sa.tenant_id = p_tenant AND sa.activo;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: un servicio de la cita no existe o ya no se ofrece.' USING ERRCODE = '22023';
    END IF;
    -- Activo en la sucursal y todavía empleado del negocio (acceso activo, perfil sin borrar).
    IF v_usuario IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM colaboradores_agenda ca
          WHERE ca.tenant_id = p_tenant AND ca.usuario_id = v_usuario AND ca.activo AND ca.sucursal_id = p_sucursal
            AND EXISTS (SELECT 1 FROM usuarios_acceso ua WHERE ua.tenant_id = p_tenant AND ua.usuario_id = v_usuario AND ua.activo)
            AND EXISTS (SELECT 1 FROM usuarios_perfil up WHERE up.id = v_usuario AND up.deleted_at IS NULL)) THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: el colaborador no está activo en esta sucursal.' USING ERRCODE = '22023';
    END IF;
    IF v_espacio IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM espacios WHERE id = v_espacio AND tenant_id = p_tenant AND sucursal_id = p_sucursal) THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: el espacio no es de esta sucursal.' USING ERRCODE = '22023';
    END IF;

    v_fin := NULL;
    IF v_cursor IS NOT NULL THEN
      IF v_usuario IS NULL THEN
        v_usuario := _colaborador_libre(p_tenant, p_sucursal, v_prod, v_cursor);   -- 0224
        IF v_usuario IS NULL THEN
          RAISE EXCEPTION 'CITA_EMPALMADA: no hay quien esté libre a esa hora' USING ERRCODE = '23P01';
        END IF;
      END IF;
      SELECT COALESCE(sc.duracion_min, v_dur) INTO v_dur
        FROM (SELECT 1) x LEFT JOIN servicio_colaborador sc ON sc.producto_id = v_prod AND sc.usuario_id = v_usuario;
      v_fin := v_cursor + make_interval(mins => v_dur);

      IF v_tipo IS NOT NULL AND v_espacio IS NULL THEN
        SELECT e.id INTO v_espacio
          FROM espacios e
         WHERE e.tenant_id = p_tenant AND e.sucursal_id = p_sucursal AND e.tipo_espacio_id = v_tipo AND e.activo
           AND NOT EXISTS (SELECT 1 FROM citas_servicios cs
                            WHERE cs.espacio_id = e.id AND cs.activa
                              AND tstzrange(cs.inicia, cs.termina, '[)') && tstzrange(v_cursor, v_fin, '[)'))
         ORDER BY e.orden, e.nombre
         LIMIT 1;
        IF v_espacio IS NULL THEN
          SELECT lower(nombre) INTO v_nombre FROM tipos_espacio WHERE id = v_tipo;
          RAISE EXCEPTION 'CITA_EMPALMADA: no hay % libre a esa hora', v_nombre USING ERRCODE = '23P01';
        END IF;
      END IF;
    END IF;

    SELECT COALESCE(sc.precio_mxn, precio_producto_en_sucursal(v_prod, p_sucursal)) INTO v_precio
      FROM (SELECT 1) x LEFT JOIN servicio_colaborador sc ON sc.producto_id = v_prod AND sc.usuario_id = v_usuario;

    -- 0219: tampoco encima de un tramo marcado con empalme (el EXCLUDE no lo ve).
    v_choca := _agenda_choques(p_tenant, p_cita, v_usuario, v_espacio, v_cursor, v_fin);
    IF v_choca IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM citas_servicios WHERE id = ANY(v_choca) AND usuario_id = v_usuario) THEN
        SELECT nombre INTO v_nombre FROM usuarios_perfil WHERE id = v_usuario;
        RAISE EXCEPTION 'CITA_EMPALMADA: % ya tiene cita a esa hora', v_nombre USING ERRCODE = '23P01';
      END IF;
      SELECT nombre INTO v_nombre FROM espacios WHERE id = v_espacio;
      RAISE EXCEPTION 'CITA_EMPALMADA: % ya está ocupado a esa hora', v_nombre USING ERRCODE = '23P01';
    END IF;

    v_orden := v_orden + 1;
    BEGIN
      INSERT INTO citas_servicios (tenant_id, cita_id, orden, producto_id, usuario_id, espacio_id, inicia, termina, precio_mxn)
      VALUES (p_tenant, p_cita, v_orden, v_prod, v_usuario, v_espacio, v_cursor, v_fin, COALESCE(v_precio, 0));
    EXCEPTION WHEN exclusion_violation THEN
      GET STACKED DIAGNOSTICS v_restr = CONSTRAINT_NAME;
      IF v_restr = 'citas_servicios_sin_empalme_espacio' THEN
        SELECT nombre INTO v_nombre FROM espacios WHERE id = v_espacio;
        RAISE EXCEPTION 'CITA_EMPALMADA: % ya está ocupado a esa hora', v_nombre USING ERRCODE = '23P01';
      END IF;
      SELECT nombre INTO v_nombre FROM usuarios_perfil WHERE id = v_usuario;
      RAISE EXCEPTION 'CITA_EMPALMADA: % ya tiene cita a esa hora', v_nombre USING ERRCODE = '23P01';
    END;
    v_cursor := v_fin;
  END LOOP;
  RETURN v_cursor;
END;
$$;
REVOKE ALL ON FUNCTION _agenda_tramos(uuid, uuid, uuid, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;

-- Cuerpo vigente de la 0218: además anota que canceló la caja (el reembolso en línea lo lee).
CREATE OR REPLACE FUNCTION cancelar_cita(p_cita uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant  uuid := _agenda_tenant();
  v_vecinos uuid[];
BEGIN
  PERFORM 1 FROM citas WHERE id = p_cita AND tenant_id = v_tenant FOR UPDATE;
  v_vecinos := _agenda_vecinos(v_tenant, p_cita);
  UPDATE citas SET estado = 'CANCELADA', cancelada_motivo = NULLIF(btrim(p_motivo), ''), cancelada_por = 'CAJA'
   WHERE id = p_cita AND tenant_id = v_tenant AND estado IN ('AGENDADA', 'EN_ESPERA');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: solo se cancela una cita por llegar o en espera.' USING ERRCODE = '22023';
  END IF;
  -- Ya no ocupa: ella y lo que chocaba con ella pierden la marca (0219).
  PERFORM _agenda_remarcar(v_tenant, v_vecinos || ARRAY(SELECT id FROM citas_servicios WHERE cita_id = p_cita));
END;
$$;

-- ── §4 Internas ─────────────────────────────────────────────────────────────
-- Anticipo de un renglón según el modo de cobro del negocio (regla de anticipo_sugerido, 0222).
CREATE OR REPLACE FUNCTION _anticipo_de(p_modo text, p_tipo text, p_valor numeric, p_precio numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT (CASE WHEN p_modo = 'TODO' THEN p_precio
               WHEN p_modo = 'ANTICIPO' THEN CASE p_tipo
                 WHEN 'PORCENTAJE' THEN round(p_precio * p_valor / 100, 2)
                 WHEN 'MONTO' THEN LEAST(p_valor, p_precio)
                 ELSE 0 END
               ELSE 0 END)::numeric(12,2);
$$;
REVOKE ALL ON FUNCTION _anticipo_de(text, text, numeric, numeric) FROM PUBLIC, anon, authenticated, service_role;

-- Anticipo sugerido de una cita con el negocio explícito.
CREATE OR REPLACE FUNCTION _anticipo_cita(p_tenant uuid, p_cita uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(sum(_anticipo_de(ct.agenda_cobro_modo, sa.anticipo_tipo, sa.anticipo_valor, cs.precio_mxn)), 0)::numeric(12,2)
    FROM citas_servicios cs
    JOIN configuracion_tenant ct ON ct.tenant_id = p_tenant
    LEFT JOIN servicios_agenda sa ON sa.producto_id = cs.producto_id AND sa.tenant_id = p_tenant
   WHERE cs.cita_id = p_cita AND cs.tenant_id = p_tenant;
$$;
REVOKE ALL ON FUNCTION _anticipo_cita(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Cuerpo vigente de la 0222, con la suma en _anticipo_cita.
CREATE OR REPLACE FUNCTION anticipo_sugerido(p_cita uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Sin negocio en la sesión.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM citas WHERE id = p_cita AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la cita no existe.' USING ERRCODE = '22023';
  END IF;
  RETURN _anticipo_cita(v_tenant, p_cita);
END;
$$;

-- «María G.»: nombre y la inicial del apellido. El sitio nunca ve un nombre completo.
CREATE OR REPLACE FUNCTION _nombre_corto(p_usuario uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT split_part(btrim(up.nombre), ' ', 1)
         || COALESCE(' ' || upper(left(COALESCE(NULLIF(btrim(up.apellido_paterno), ''),
                                               NULLIF(split_part(btrim(up.nombre), ' ', 2), '')), 1)) || '.', '')
    FROM usuarios_perfil up WHERE up.id = p_usuario;
$$;
REVOKE ALL ON FUNCTION _nombre_corto(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Lo que el negocio ofrece en línea: colaborador vigente (activo en una sucursal activa, con acceso
-- y perfil) × servicio activo, en línea, de un producto ni borrado ni pausado.
CREATE OR REPLACE FUNCTION _reservas_oferta(p_tenant uuid)
RETURNS TABLE (usuario_id uuid, sucursal_id uuid, orden integer, producto_id uuid)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT ca.usuario_id, ca.sucursal_id, ca.orden, sa.producto_id
    FROM colaboradores_agenda ca
    JOIN servicio_colaborador sc ON sc.tenant_id = ca.tenant_id AND sc.usuario_id = ca.usuario_id
    JOIN servicios_agenda sa ON sa.tenant_id = ca.tenant_id AND sa.producto_id = sc.producto_id AND sa.activo AND sa.en_linea
    JOIN productos pr ON pr.id = sa.producto_id AND pr.deleted_at IS NULL AND pr.estado <> 'PAUSADO'
    JOIN sucursales s ON s.id = ca.sucursal_id AND s.tenant_id = ca.tenant_id AND s.activa AND s.deleted_at IS NULL
   WHERE ca.tenant_id = p_tenant AND ca.activo
     AND EXISTS (SELECT 1 FROM usuarios_acceso ua WHERE ua.tenant_id = ca.tenant_id AND ua.usuario_id = ca.usuario_id AND ua.activo)
     AND EXISTS (SELECT 1 FROM usuarios_perfil up WHERE up.id = ca.usuario_id AND up.deleted_at IS NULL);
$$;
REVOKE ALL ON FUNCTION _reservas_oferta(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- El negocio opera (como en reservas_negocio) y tiene las reservas encendidas; si no, error. Se
-- revisa en cada escritura: el negocio pudo bloquearse después de que el sitio lo resolvió.
CREATE OR REPLACE FUNCTION _reservas_negocio_vivo(p_tenant uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenants t
                  WHERE t.id = p_tenant AND t.deleted_at IS NULL AND t.estado IN ('ACTIVO', 'TRIAL', 'INTERNO')
                    AND (t.bloqueo_desde IS NULL OR t.bloqueo_desde > now()))
     OR NOT COALESCE((modulos_efectivos(p_tenant)->'efectivos'->>'reservas')::boolean, false) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: este negocio no tiene reservas en línea.' USING ERRCODE = '22023';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION _reservas_negocio_vivo(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Valida lo que llega del sitio y devuelve la configuración del negocio:
--   · el negocio opera y tiene reservas; sucursal del negocio y activa;
--   · p_servicios (si viene): 1 a 5 servicios en línea, cada colaborador elegido de la oferta;
--   · p_inicia (si viene): con el aviso mínimo, dentro de los días y en un múltiplo del intervalo.
CREATE OR REPLACE FUNCTION _reservas_validar(p_tenant uuid, p_sucursal uuid, p_servicios jsonb, p_inicia timestamptz)
RETURNS configuracion_tenant
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cfg  configuracion_tenant;
  v_s    jsonb;
  v_loc  timestamp;
  v_uuid CONSTANT text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
BEGIN
  PERFORM _reservas_negocio_vivo(p_tenant);
  SELECT * INTO v_cfg FROM configuracion_tenant WHERE tenant_id = p_tenant;
  IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = p_sucursal AND tenant_id = p_tenant AND activa AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la sucursal no es de este negocio.' USING ERRCODE = '22023';
  END IF;

  IF p_servicios IS NOT NULL THEN
    IF jsonb_typeof(p_servicios) IS DISTINCT FROM 'array' OR jsonb_array_length(p_servicios) NOT BETWEEN 1 AND 5 THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: elige de 1 a 5 servicios.' USING ERRCODE = '22023';
    END IF;
    FOR v_s IN SELECT value FROM jsonb_array_elements(p_servicios) LOOP
      -- Primero la forma (un uuid mal escrito no debe tronar en el cast) y luego la oferta.
      IF (COALESCE(v_s->>'producto_id', '') ~* v_uuid AND COALESCE(v_s->>'usuario_id', v_s->>'producto_id') ~* v_uuid) IS NOT TRUE THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS: un servicio no se ofrece en línea en esta sucursal.' USING ERRCODE = '22023';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM _reservas_oferta(p_tenant) o
                         WHERE o.sucursal_id = p_sucursal AND o.producto_id = (v_s->>'producto_id')::uuid
                           AND (v_s->>'usuario_id' IS NULL OR o.usuario_id = (v_s->>'usuario_id')::uuid)) THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS: un servicio no se ofrece en línea en esta sucursal.' USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;

  IF p_inicia IS NOT NULL THEN
    v_loc := p_inicia AT TIME ZONE 'America/Mexico_City';
    IF v_loc::date > (now() AT TIME ZONE 'America/Mexico_City')::date + v_cfg.agenda_dias_reserva
       OR extract(second FROM v_loc) <> 0
       OR (extract(hour FROM v_loc) * 60 + extract(minute FROM v_loc))::integer % v_cfg.agenda_intervalo_min <> 0 THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: ese horario no se ofrece.' USING ERRCODE = '22023';
    END IF;
    IF p_inicia < now() + make_interval(hours => v_cfg.agenda_aviso_min_horas) THEN
      RAISE EXCEPTION 'HUECO_OCUPADO: Ese horario ya no está disponible' USING ERRCODE = '23P01';
    END IF;
  END IF;
  RETURN v_cfg;
END;
$$;
REVOKE ALL ON FUNCTION _reservas_validar(uuid, uuid, jsonb, timestamptz) FROM PUBLIC, anon, authenticated, service_role;

-- La cadena de servicios desde p_inicia, con el colaborador de cada tramo resuelto (el elegido si
-- puede, si no «quien esté libre») y espacio libre de su tipo. NULL si algún tramo no cabe. Todo
-- tramo activo cuenta, marcado con empalme o no. El candado final lo pone _agenda_tramos.
CREATE OR REPLACE FUNCTION _agenda_cadena(p_tenant uuid, p_sucursal uuid, p_inicia timestamptz, p_servicios jsonb,
                                          p_excluir_cita uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_s      jsonb;
  v_cursor timestamptz := p_inicia;
  v_prod   uuid;
  v_u      uuid;
  v_dur    integer;
  v_tipo   uuid;
  v_out    jsonb := '[]'::jsonb;
BEGIN
  FOR v_s IN SELECT value FROM jsonb_array_elements(p_servicios) LOOP
    v_prod := (v_s->>'producto_id')::uuid;
    v_u := _colaborador_libre(p_tenant, p_sucursal, v_prod, v_cursor, (v_s->>'usuario_id')::uuid, p_excluir_cita);
    IF v_u IS NULL THEN RETURN NULL; END IF;
    SELECT COALESCE(sc.duracion_min, sa.duracion_min), sa.tipo_espacio_id INTO v_dur, v_tipo
      FROM servicios_agenda sa
      LEFT JOIN servicio_colaborador sc ON sc.producto_id = sa.producto_id AND sc.usuario_id = v_u
     WHERE sa.producto_id = v_prod AND sa.tenant_id = p_tenant;
    IF v_tipo IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM espacios e
          WHERE e.tenant_id = p_tenant AND e.sucursal_id = p_sucursal AND e.tipo_espacio_id = v_tipo AND e.activo
            AND NOT EXISTS (SELECT 1 FROM citas_servicios cs
                             WHERE cs.espacio_id = e.id AND cs.activa AND cs.cita_id IS DISTINCT FROM p_excluir_cita
                               AND tstzrange(cs.inicia, cs.termina, '[)') && tstzrange(v_cursor, v_cursor + make_interval(mins => v_dur), '[)'))) THEN
      RETURN NULL;
    END IF;
    v_out := v_out || jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'usuario_id', v_u));
    v_cursor := v_cursor + make_interval(mins => v_dur);
  END LOOP;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION _agenda_cadena(uuid, uuid, timestamptz, jsonb, uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Lo que la clienta ve de su cita: día y hora en México, sucursal, servicios y colaborador corto.
CREATE OR REPLACE FUNCTION _agenda_cita_resumen(p_cita uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
           'inicia', c.inicia,
           'termina', c.termina,
           'dia', to_char(c.inicia AT TIME ZONE 'America/Mexico_City', 'YYYY-MM-DD'),
           'hora', to_char(c.inicia AT TIME ZONE 'America/Mexico_City', 'HH24:MI'),
           'sucursal', jsonb_build_object(
             'id', s.id,
             'nombre', s.nombre,
             'direccion', NULLIF(concat_ws(', ',
                            NULLIF(concat_ws(' ', s.direccion_calle, s.direccion_numero), ''),
                            s.direccion_colonia, s.ciudad), '')),
           'servicios', COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
                      'producto_id', cs.producto_id,
                      'nombre', pr.nombre,
                      'colaborador_id', cs.usuario_id,
                      'colaborador', _nombre_corto(cs.usuario_id),
                      'inicia', cs.inicia,
                      'precio', cs.precio_mxn) ORDER BY cs.orden)
               FROM citas_servicios cs JOIN productos pr ON pr.id = cs.producto_id
              WHERE cs.cita_id = c.id), '[]'::jsonb),
           'colaborador', (SELECT string_agg(DISTINCT _nombre_corto(cs.usuario_id), ', ')
                             FROM citas_servicios cs WHERE cs.cita_id = c.id),
           'total_mxn', (SELECT COALESCE(sum(cs.precio_mxn), 0) FROM citas_servicios cs WHERE cs.cita_id = c.id))
    FROM citas c JOIN sucursales s ON s.id = c.sucursal_id
   WHERE c.id = p_cita;
$$;
REVOKE ALL ON FUNCTION _agenda_cita_resumen(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- La cita del enlace, bloqueada, si todavía se puede cancelar o cambiar en línea.
CREATE OR REPLACE FUNCTION _agenda_cita_cambiable(p_tenant uuid, p_enlace_hash text)
RETURNS citas
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_c     citas;
  v_horas integer;
BEGIN
  PERFORM _reservas_negocio_vivo(p_tenant);
  SELECT * INTO v_c FROM citas
   WHERE tenant_id = p_tenant AND enlace_hash = p_enlace_hash AND p_enlace_hash ~ '^[0-9a-f]{64}$'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la cita no existe.' USING ERRCODE = '22023';
  END IF;
  IF v_c.estado <> 'AGENDADA' THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la cita ya no se puede cambiar.' USING ERRCODE = '22023';
  END IF;
  SELECT agenda_cancelar_horas INTO v_horas FROM configuracion_tenant WHERE tenant_id = p_tenant;
  IF v_c.inicia <= now() + make_interval(hours => COALESCE(v_horas, 24)) THEN
    RAISE EXCEPTION 'FUERA_DE_PLAZO: Para cambios, comunícate con el negocio' USING ERRCODE = '22023';
  END IF;
  RETURN v_c;
END;
$$;
REVOKE ALL ON FUNCTION _agenda_cita_cambiable(uuid, text) FROM PUBLIC, anon, authenticated, service_role;

-- ── §5 RPC (solo service_role) ──────────────────────────────────────────────
-- El negocio para el sitio, por su dirección. NULL si no existe, no opera o no tiene reservas.
-- Molde de tienda_negocio (0187). `tenant` es para la función, no para el navegador.
-- p_cita: para la página de una cita (verla y confirmar su pago). No exige las reservas encendidas
-- —la clienta sigue viendo su cita y su reembolso aunque el negocio las apague—, pero sí que el
-- negocio exista y opere. Cancelar y mover las siguen exigiendo (_agenda_cita_cambiable).
DROP FUNCTION IF EXISTS reservas_negocio(text);
CREATE OR REPLACE FUNCTION reservas_negocio(p_slug text, p_cita boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_c      tienda_config%ROWTYPE;
  v_cfg    configuracion_tenant%ROWTYPE;
  v_nombre text;
  v_suc    jsonb;
  v_serv   jsonb;
  v_col    jsonb;
BEGIN
  SELECT * INTO v_c FROM tienda_config WHERE slug = lower(btrim(COALESCE(p_slug, '')));
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT t.nombre_comercial INTO v_nombre
    FROM tenants t
   WHERE t.id = v_c.tenant_id AND t.deleted_at IS NULL AND t.estado IN ('ACTIVO', 'TRIAL', 'INTERNO')
     AND (t.bloqueo_desde IS NULL OR t.bloqueo_desde > now());
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT COALESCE(p_cita, false)
     AND COALESCE((modulos_efectivos(v_c.tenant_id)->'efectivos'->>'reservas')::boolean, false) IS NOT TRUE THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_cfg FROM configuracion_tenant WHERE tenant_id = v_c.tenant_id;

  -- Sucursales con oferta. Horario = de la primera entrada a la última salida de sus colaboradores,
  -- con el formato de la tienda (clave 1 = lunes … 7 = domingo).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'nombre', s.nombre,
           'direccion', NULLIF(concat_ws(', ',
                          NULLIF(concat_ws(' ', s.direccion_calle, s.direccion_numero), ''),
                          s.direccion_colonia, s.ciudad), ''),
           'ubicacion', CASE WHEN s.geo_lat IS NOT NULL AND s.geo_lng IS NOT NULL
                             THEN jsonb_build_object('lat', s.geo_lat, 'lng', s.geo_lng) END,
           'whatsapp', NULLIF(regexp_replace(COALESCE(s.telefono, ''), '\D', '', 'g'), ''),
           'pago_en_linea', tienda_conexion_cobro(v_c.tenant_id, s.id) IS NOT NULL,
           'horario', COALESCE((
             SELECT jsonb_object_agg(d.dia, jsonb_build_array(d.abre, d.cierra))
               FROM (SELECT (CASE WHEN h.dia_semana = 0 THEN 7 ELSE h.dia_semana END)::text AS dia,
                            to_char(min(h.inicia), 'HH24:MI') AS abre, to_char(max(h.termina), 'HH24:MI') AS cierra
                       FROM horarios_colaborador h
                      WHERE h.tenant_id = v_c.tenant_id
                        AND h.usuario_id IN (SELECT o.usuario_id FROM _reservas_oferta(v_c.tenant_id) o WHERE o.sucursal_id = s.id)
                      GROUP BY h.dia_semana) d), '{}'::jsonb))
         ORDER BY s.nombre), '[]'::jsonb)
    INTO v_suc
    FROM sucursales s
   WHERE s.id IN (SELECT o.sucursal_id FROM _reservas_oferta(v_c.tenant_id) o);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'producto_id', pr.id,
           'nombre', pr.nombre,
           'categoria', cat.nombre,
           'precio', pr.precio_base_mxn,
           'duracion_min', sa.duracion_min,
           'anticipo_mxn', _anticipo_de(v_cfg.agenda_cobro_modo, sa.anticipo_tipo, sa.anticipo_valor, pr.precio_base_mxn))
         ORDER BY cat.nombre NULLS LAST, pr.orden_visualizacion, pr.nombre), '[]'::jsonb)
    INTO v_serv
    FROM servicios_agenda sa
    JOIN productos pr ON pr.id = sa.producto_id
    LEFT JOIN categorias cat ON cat.id = pr.categoria_id
   WHERE sa.tenant_id = v_c.tenant_id
     AND sa.producto_id IN (SELECT o.producto_id FROM _reservas_oferta(v_c.tenant_id) o);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', x.usuario_id,
           'nombre_corto', _nombre_corto(x.usuario_id),
           'sucursal_id', x.sucursal_id,
           'servicios', x.servicios) ORDER BY x.orden, x.usuario_id), '[]'::jsonb)
    INTO v_col
    FROM (SELECT o.usuario_id, o.sucursal_id, min(o.orden) AS orden,
                 jsonb_agg(DISTINCT o.producto_id) AS servicios
            FROM _reservas_oferta(v_c.tenant_id) o
           GROUP BY o.usuario_id, o.sucursal_id) x;

  RETURN jsonb_build_object(
    'tenant', v_c.tenant_id,
    'nombre', v_nombre,
    'slug', v_c.slug,
    'logo_ruta', v_c.logo_ruta,
    'color', v_c.color,
    'descripcion', v_c.descripcion,
    'whatsapp', (SELECT e->>'whatsapp' FROM jsonb_array_elements(v_suc) e WHERE e->>'whatsapp' IS NOT NULL LIMIT 1),
    'sucursales', v_suc,
    'servicios', v_serv,
    'colaboradores', v_col,
    'reglas', jsonb_build_object(
      'cancelar_horas', v_cfg.agenda_cancelar_horas,
      'dias_reserva', v_cfg.agenda_dias_reserva,
      'intervalo_min', v_cfg.agenda_intervalo_min,
      'aviso_min_horas', v_cfg.agenda_aviso_min_horas,
      'cobro_modo', v_cfg.agenda_cobro_modo,
      'pago_en_linea_disponible', EXISTS (SELECT 1 FROM jsonb_array_elements(v_suc) e WHERE (e->>'pago_en_linea')::boolean)));
END;
$$;

-- Horarios en que empieza la cadena de servicios ese día (México). p_servicios: [{producto_id,
-- usuario_id|null}] en orden. Vacío fuera de los días permitidos. p_excluir_enlace_hash: el enlace
-- de la cita que se cambia de hora (de este negocio); sus propios tramos no tapan horarios.
DROP FUNCTION IF EXISTS agenda_huecos(uuid, uuid, date, jsonb);
DROP FUNCTION IF EXISTS agenda_huecos(uuid, uuid, date, jsonb, uuid);
CREATE OR REPLACE FUNCTION agenda_huecos(p_tenant uuid, p_sucursal uuid, p_dia date, p_servicios jsonb,
                                         p_excluir_enlace_hash text DEFAULT NULL)
RETURNS TABLE (inicia timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_cfg   configuracion_tenant;
  v_hoy   date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_desde timestamptz;
  v_ini   integer;
  v_fin   integer;
  v_t     timestamptz;
  v_excl  uuid;
BEGIN
  v_cfg := _reservas_validar(p_tenant, p_sucursal, p_servicios, NULL);
  IF p_excluir_enlace_hash ~ '^[0-9a-f]{64}$' THEN
    SELECT id INTO v_excl FROM citas WHERE tenant_id = p_tenant AND enlace_hash = p_excluir_enlace_hash;
  END IF;
  IF p_dia IS NULL OR p_dia < v_hoy OR p_dia > v_hoy + v_cfg.agenda_dias_reserva THEN RETURN; END IF;
  v_desde := now() + make_interval(hours => v_cfg.agenda_aviso_min_horas);

  -- Solo se recorre de la primera entrada a la última salida de la sucursal ese día (en minutos).
  SELECT extract(epoch FROM min(h.inicia))::integer / 60, extract(epoch FROM max(h.termina))::integer / 60
    INTO v_ini, v_fin
    FROM horarios_colaborador h
    JOIN colaboradores_agenda ca ON ca.tenant_id = h.tenant_id AND ca.usuario_id = h.usuario_id
   WHERE h.tenant_id = p_tenant AND ca.sucursal_id = p_sucursal AND ca.activo
     AND h.dia_semana = extract(dow FROM p_dia);
  IF v_ini IS NULL THEN RETURN; END IF;

  FOR v_t IN
    SELECT (p_dia + make_interval(mins => m)) AT TIME ZONE 'America/Mexico_City'
      FROM generate_series(((v_ini + v_cfg.agenda_intervalo_min - 1) / v_cfg.agenda_intervalo_min) * v_cfg.agenda_intervalo_min,
                           v_fin - 5, v_cfg.agenda_intervalo_min) m
  LOOP
    IF v_t >= v_desde AND _agenda_cadena(p_tenant, p_sucursal, v_t, p_servicios, v_excl) IS NOT NULL THEN
      inicia := v_t;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

-- Celular a 10 dígitos: sin espacios ni signos y sin la lada de país (+52, o +52 1 de los viejos).
CREATE OR REPLACE FUNCTION _telefono_10(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN d ~ '^521[0-9]{10}$' THEN right(d, 10)
              WHEN d ~ '^52[0-9]{10}$' THEN right(d, 10)
              ELSE d END
    FROM (SELECT regexp_replace(COALESCE(p, ''), '\D', '', 'g') AS d) x;
$$;
REVOKE ALL ON FUNCTION _telefono_10(text) FROM PUBLIC, anon, authenticated, service_role;

-- Crea la cita en línea. Idempotente por `clave`; el código del enlace solo sale la primera vez.
-- La clave no se guarda: client_id_local = 'web:' || su SHA-256 (con ella se recupera el enlace).
CREATE OR REPLACE FUNCTION agenda_reservar_en_linea(p_tenant uuid, p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_uuid     CONSTANT text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_clave    text;
  v_suc      uuid;
  v_inicia   timestamptz;
  v_nombre   text;
  v_tel      text;
  v_email    text;
  v_id       uuid;
  v_cli      uuid;
  v_cadena   jsonb;
  v_codigo   text;
  v_termina  timestamptz;
  v_anticipo numeric(12,2);
BEGIN
  -- La forma antes de cualquier cast: lo que llega mal es DATOS_INVALIDOS, no un error crudo.
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR jsonb_typeof(p->'cliente') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: faltan los datos de la reserva.' USING ERRCODE = '22023';
  END IF;
  v_clave := p->>'clave';
  IF v_clave IS NULL OR v_clave !~ '^[A-Za-z0-9_-]{8,64}$' THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: falta la clave de la reserva.' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p->>'sucursal_id', '') !~* v_uuid THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la sucursal no es válida.' USING ERRCODE = '22023';
  END IF;
  v_suc := (p->>'sucursal_id')::uuid;
  IF p->>'inicia' IS NULL THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: falta la hora de la cita.' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_inicia := (p->>'inicia')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la hora de la cita no es válida.' USING ERRCODE = '22023';
  END;
  v_nombre := NULLIF(btrim(p->'cliente'->>'nombre'), '');
  v_tel    := _telefono_10(p->'cliente'->>'telefono');
  v_email  := lower(NULLIF(btrim(p->'cliente'->>'email'), ''));

  PERFORM pg_advisory_xact_lock(hashtextextended('cita_web:' || p_tenant || ':' || v_clave, 0));
  SELECT id INTO v_id FROM citas WHERE tenant_id = p_tenant AND client_id_local = 'web:' || encode(sha256(convert_to(v_clave, 'UTF8')), 'hex');
  IF FOUND THEN
    RETURN jsonb_build_object('cita_id', v_id, 'codigo', NULL, 'anticipo_mxn', _anticipo_cita(p_tenant, v_id),
                              'resumen', _agenda_cita_resumen(v_id));
  END IF;

  PERFORM _reservas_validar(p_tenant, v_suc, p->'servicios', v_inicia);
  IF v_nombre IS NULL OR char_length(v_nombre) > 150 THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: escribe tu nombre.' USING ERRCODE = '22023';
  END IF;
  IF v_tel !~ '^[0-9]{10}$' THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el celular debe tener 10 dígitos.' USING ERRCODE = '22023';
  END IF;
  IF v_email IS NULL OR char_length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: escribe un correo válido.' USING ERRCODE = '22023';
  END IF;

  -- Un celular aparta a lo más 3 citas por llegar en el negocio. El candado por celular también
  -- ordena a dos reservas simultáneas del mismo número (el tope y el alta de la clienta).
  PERFORM pg_advisory_xact_lock(hashtextextended('cita_tel:' || p_tenant || ':' || v_tel, 0));
  IF (SELECT count(*) FROM citas c
       WHERE c.tenant_id = p_tenant AND c.estado = 'AGENDADA' AND c.inicia > now()
         AND _telefono_10(c.cliente_telefono) = v_tel) >= 3 THEN
    RAISE EXCEPTION 'LIMITE_RESERVAS: Ya tienes 3 citas apartadas; para más, comunícate con el negocio.' USING ERRCODE = '22023';
  END IF;

  v_cadena := _agenda_cadena(p_tenant, v_suc, v_inicia, p->'servicios');
  IF v_cadena IS NULL THEN
    RAISE EXCEPTION 'HUECO_OCUPADO: Ese horario ya no está disponible' USING ERRCODE = '23P01';
  END IF;

  -- La clienta: por celular (a 10 dígitos), o se crea. Una existente no se edita desde el sitio: la
  -- cita guarda lo que escribió. Si la caja la da de alta en el mismo instante (23505), se vuelve a
  -- buscar. A una bloqueada no se le dice por qué.
  FOR i IN 1..2 LOOP
    SELECT c.id INTO v_cli FROM clientes c
     WHERE c.tenant_id = p_tenant AND c.deleted_at IS NULL AND c.telefono IS NOT NULL
       AND _telefono_10(c.telefono) = v_tel
     ORDER BY c.created_at, c.id LIMIT 1;
    EXIT WHEN v_cli IS NOT NULL;
    BEGIN
      INSERT INTO clientes (tenant_id, nombre, telefono, email)
      VALUES (p_tenant, v_nombre, v_tel, v_email)
      RETURNING id INTO v_cli;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF i = 2 THEN RAISE; END IF;
    END;
  END LOOP;
  IF (SELECT estado = 'BLOQUEADO' FROM clientes WHERE id = v_cli) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: No pudimos apartar tu cita. Comunícate con el negocio.' USING ERRCODE = '22023';
  END IF;

  v_codigo := rtrim(translate(encode(gen_random_bytes(16), 'base64'), '+/', '-_'), '=');
  INSERT INTO citas (tenant_id, sucursal_id, cliente_id, cliente_nombre, cliente_telefono, cliente_email,
                     estado, canal, inicia, termina, nota, client_id_local, enlace_hash, reservo_email)
  VALUES (p_tenant, v_suc, v_cli, v_nombre, v_tel, v_email,
          'AGENDADA', 'EN_LINEA', v_inicia, v_inicia + interval '1 minute',
          left(NULLIF(btrim(p->>'nota'), ''), 300), 'web:' || encode(sha256(convert_to(v_clave, 'UTF8')), 'hex'),
          encode(sha256(convert_to(v_codigo, 'UTF8')), 'hex'), v_email)
  RETURNING id INTO v_id;
  BEGIN
    v_termina := _agenda_tramos(p_tenant, v_id, v_suc, v_inicia, v_cadena);
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'HUECO_OCUPADO: Ese horario ya no está disponible' USING ERRCODE = '23P01';
  END;
  UPDATE citas SET termina = v_termina WHERE id = v_id;

  -- Con anticipo, el lugar se aparta 15 minutos mientras se paga; sin cobro en línea no se reserva.
  v_anticipo := _anticipo_cita(p_tenant, v_id);
  IF v_anticipo > 0 THEN
    IF tienda_conexion_cobro(p_tenant, v_suc) IS NULL THEN
      RAISE EXCEPTION 'PAGO_NO_DISPONIBLE: Este negocio no puede cobrar el anticipo en línea por ahora' USING ERRCODE = '22023';
    END IF;
    UPDATE citas SET pago_hasta = now() + interval '15 minutes' WHERE id = v_id;
  END IF;

  RETURN jsonb_build_object('cita_id', v_id, 'codigo', v_codigo, 'anticipo_mxn', v_anticipo,
                            'resumen', _agenda_cita_resumen(v_id));
END;
$$;

-- La cita del enlace para la clienta. NULL si el hash no es de una cita de ese negocio.
CREATE OR REPLACE FUNCTION agenda_cita_publica(p_tenant uuid, p_enlace_hash text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_c     citas;
  v_horas integer;
BEGIN
  IF p_enlace_hash IS NULL OR p_enlace_hash !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
  SELECT * INTO v_c FROM citas WHERE tenant_id = p_tenant AND enlace_hash = p_enlace_hash;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT agenda_cancelar_horas INTO v_horas FROM configuracion_tenant WHERE tenant_id = p_tenant;
  RETURN _agenda_cita_resumen(v_c.id) || jsonb_build_object(
    'estado', v_c.estado,
    -- El motivo que escribe la recepción no sale al sitio: solo quién canceló.
    'cancelada_motivo', CASE WHEN v_c.estado = 'CANCELADA' THEN CASE v_c.cancelada_por
                          WHEN 'CLIENTA_EN_LINEA' THEN 'Cancelada por ti'
                          WHEN 'PAGO_VENCIDO' THEN 'No se completó el pago'
                          ELSE 'Cancelada por el negocio' END END,
    'anticipo_mxn', _anticipo_cita(p_tenant, v_c.id),
    'anticipo_pagado_mxn', (SELECT COALESCE(sum(a.monto_mxn), 0) FROM anticipos_cita a
                             WHERE a.cita_id = v_c.id AND a.estado IN ('VIGENTE', 'APLICADO')),
    'pago_hasta', v_c.pago_hasta,
    'puede_cambiar', v_c.estado = 'AGENDADA' AND v_c.inicia > now() + make_interval(hours => COALESCE(v_horas, 24)),
    'cancelar_horas', COALESCE(v_horas, 24),
    'whatsapp', (SELECT NULLIF(regexp_replace(COALESCE(s.telefono, ''), '\D', '', 'g'), '')
                   FROM sucursales s WHERE s.id = v_c.sucursal_id));
END;
$$;

CREATE OR REPLACE FUNCTION agenda_cancelar_en_linea(p_tenant uuid, p_enlace_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_c       citas := _agenda_cita_cambiable(p_tenant, p_enlace_hash);
  v_vecinos uuid[] := _agenda_vecinos(p_tenant, v_c.id);
BEGIN
  UPDATE citas SET estado = 'CANCELADA', cancelada_motivo = 'Cancelada por la clienta en línea',
                   cancelada_por = 'CLIENTA_EN_LINEA'
   WHERE id = v_c.id;
  PERFORM _agenda_remarcar(p_tenant, v_vecinos || ARRAY(SELECT id FROM citas_servicios WHERE cita_id = v_c.id));
  RETURN agenda_cita_publica(p_tenant, p_enlace_hash);
END;
$$;

-- Cambia la hora con los mismos servicios y colaboradores. Conserva anticipos y pago pendiente.
CREATE OR REPLACE FUNCTION agenda_mover_en_linea(p_tenant uuid, p_enlace_hash text, p_inicia timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_c         citas := _agenda_cita_cambiable(p_tenant, p_enlace_hash);
  v_servicios jsonb;
  v_vecinos   uuid[];
  v_termina   timestamptz;
BEGIN
  IF p_inicia IS NULL THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: falta la hora de la cita.' USING ERRCODE = '22023';
  END IF;
  PERFORM _reservas_validar(p_tenant, v_c.sucursal_id, NULL, p_inicia);
  SELECT jsonb_agg(jsonb_build_object('producto_id', producto_id, 'usuario_id', usuario_id) ORDER BY orden)
    INTO v_servicios FROM citas_servicios WHERE cita_id = v_c.id;
  -- Se revalida el hueco como al reservar, sin contar sus propios tramos; luego salen los viejos.
  IF _agenda_cadena(p_tenant, v_c.sucursal_id, p_inicia, v_servicios, v_c.id) IS NULL THEN
    RAISE EXCEPTION 'HUECO_OCUPADO: Ese horario ya no está disponible' USING ERRCODE = '23P01';
  END IF;
  v_vecinos := _agenda_vecinos(p_tenant, v_c.id);
  DELETE FROM citas_servicios WHERE cita_id = v_c.id;
  UPDATE citas SET inicia = p_inicia, termina = p_inicia + interval '1 minute', empalme = false WHERE id = v_c.id;
  BEGIN
    v_termina := _agenda_tramos(p_tenant, v_c.id, v_c.sucursal_id, p_inicia, v_servicios);
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'HUECO_OCUPADO: Ese horario ya no está disponible' USING ERRCODE = '23P01';
  END;
  UPDATE citas SET termina = v_termina WHERE id = v_c.id;
  PERFORM _agenda_remarcar(p_tenant, v_vecinos);
  RETURN agenda_cita_publica(p_tenant, p_enlace_hash);
END;
$$;

-- Barrido: la reserva cuyo anticipo no se pagó a tiempo se cancela sola y libera el lugar.
CREATE OR REPLACE FUNCTION agenda_vencer_reservas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r         record;
  v_vecinos uuid[];
  v_n       integer := 0;
BEGIN
  FOR r IN SELECT c.id, c.tenant_id FROM citas c
            WHERE c.pago_hasta < now() AND c.estado = 'AGENDADA'
              AND NOT EXISTS (SELECT 1 FROM anticipos_cita a WHERE a.cita_id = c.id AND a.estado IN ('VIGENTE', 'APLICADO'))
            FOR UPDATE SKIP LOCKED LOOP
    v_vecinos := _agenda_vecinos(r.tenant_id, r.id);
    UPDATE citas SET estado = 'CANCELADA', cancelada_motivo = 'No se completó el pago', cancelada_por = 'PAGO_VENCIDO'
     WHERE id = r.id;
    PERFORM _agenda_remarcar(r.tenant_id, v_vecinos || ARRAY(SELECT id FROM citas_servicios WHERE cita_id = r.id));
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['reservas_negocio(text, boolean)', 'agenda_huecos(uuid, uuid, date, jsonb, text)',
                           'agenda_reservar_en_linea(uuid, jsonb)', 'agenda_cita_publica(uuid, text)',
                           'agenda_cancelar_en_linea(uuid, text)', 'agenda_mover_en_linea(uuid, text, timestamptz)',
                           'agenda_vencer_reservas()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

-- Su propio trabajo de cron, cada minuto: un error aquí no frena el barrido de la tienda (0173).
-- Solo donde pg_cron exista (Supabase nube); en la caja instalada no se hace nada. Molde de 0173.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agenda-reservas-vencer') THEN
      PERFORM cron.unschedule('agenda-reservas-vencer');
    END IF;
    PERFORM cron.schedule('agenda-reservas-vencer', '* * * * *', 'SELECT public.agenda_vencer_reservas()');
  END IF;
END $$;
