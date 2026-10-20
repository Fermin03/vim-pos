-- Belleza, entrega 4: la agenda del colaborador en su celular y los reportes de la agenda.
--
-- mi_agenda / mi_cita_empezar / mi_cita_terminar: para /mi-agenda (apps/pos). Solo lo del
-- auth.uid(): sus tramos, sin teléfono ni correo de la clienta y con la nota recortada. Entra el
-- colaborador activo (colaboradores_agenda.activo, acceso activo y perfil sin borrar) de un negocio
-- con la agenda encendida; cualquier otra cuenta recibe SIN_AGENDA. Empezar y terminar reutilizan
-- atender_cita y terminar_cita (0218): el cambio llega a la caja por el sync de citas (0219).
-- Con varios colaboradores, «Terminé» termina la cita solo si el último tramo es suyo; si no,
-- deja constancia en auditoria_eventos (cita.termino_tramo) y la cita sigue EN_CURSO.
--
-- agenda_reporte_citas / agenda_ocupacion: para el admin, solo dueño o administrador
-- (es_admin_del_tenant, el mismo criterio de comisiones_periodo). La unidad del reporte de citas es
-- el servicio (tramo): una cita con dos servicios cuenta en los dos. Cuentan las citas cerradas:
-- atendidas (TERMINADA o COBRADA), canceladas por la clienta (CLIENTA_EN_LINEA), canceladas por el
-- negocio (NEGOCIO o CAJA; sin cancelada_por, de antes de la 0224, cuenta como de la caja) y «No
-- llegó». PAGO_VENCIDO no cuenta: nunca fue una reserva real. Canal CAJA incluye SIN_CITA.
-- Ocupación por colaborador y día (México): minutos de horario sin comida (0 si ese día no trabaja
-- o tiene ausencia) y minutos agendados de sus tramos activos recortados al día, con tope en los
-- minutos de horario cuando los hay (una cita fuera de horario no pasa del 100 %).

-- Negocio del colaborador activo de la sesión; si no, SIN_AGENDA.
CREATE OR REPLACE FUNCTION _mi_colaborador_tenant()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE v_tenant uuid := current_tenant_id();
BEGIN
  IF v_tenant IS NULL OR auth.uid() IS NULL
     OR NOT COALESCE((modulos_efectivos(v_tenant)->'efectivos'->>'agenda')::boolean, false)
     OR NOT EXISTS (
       SELECT 1 FROM colaboradores_agenda ca
        WHERE ca.tenant_id = v_tenant AND ca.usuario_id = auth.uid() AND ca.activo
          AND EXISTS (SELECT 1 FROM usuarios_acceso ua WHERE ua.tenant_id = ca.tenant_id AND ua.usuario_id = ca.usuario_id AND ua.activo)
          AND EXISTS (SELECT 1 FROM usuarios_perfil up WHERE up.id = ca.usuario_id AND up.deleted_at IS NULL)) THEN
    RAISE EXCEPTION 'SIN_AGENDA: Esta cuenta no tiene agenda.' USING ERRCODE = '42501';
  END IF;
  RETURN v_tenant;
END;
$$;
REVOKE ALL ON FUNCTION _mi_colaborador_tenant() FROM PUBLIC, anon, authenticated;

-- Dueño o administrador del negocio de la sesión con la agenda encendida; si no, error.
CREATE OR REPLACE FUNCTION _agenda_admin_tenant()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE v_tenant uuid := _agenda_tenant();
BEGIN
  IF NOT es_admin_del_tenant(v_tenant) THEN
    RAISE EXCEPTION 'SIN_PERMISO: solo el dueño o un administrador ve los reportes de la agenda.' USING ERRCODE = '42501';
  END IF;
  RETURN v_tenant;
END;
$$;
REVOKE ALL ON FUNCTION _agenda_admin_tenant() FROM PUBLIC, anon, authenticated;

-- Tramos de un colaborador por tiempo (mi_agenda y agenda_ocupacion).
CREATE INDEX IF NOT EXISTS idx_citas_servicios_colaborador_inicia ON citas_servicios (tenant_id, usuario_id, inicia);

-- Sus tramos entre dos días de México (inclusive, máximo 14 días).
CREATE OR REPLACE FUNCTION mi_agenda(p_desde date, p_hasta date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_tenant uuid := _mi_colaborador_tenant();
BEGIN
  IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta < p_desde OR p_hasta - p_desde > 13 THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el rango va de 1 a 14 días.' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object(
    'colaborador', (SELECT nombre FROM usuarios_perfil WHERE id = auth.uid()),
    'tramos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', cs.id,
               'dia', (cs.inicia AT TIME ZONE 'America/Mexico_City')::date,
               'inicia', cs.inicia,
               'termina', cs.termina,
               'producto_id', cs.producto_id,
               'servicio', p.nombre,
               'espacio', e.nombre,
               'ultimo', NOT EXISTS (SELECT 1 FROM citas_servicios o WHERE o.cita_id = cs.cita_id AND o.orden > cs.orden),
               'cita', jsonb_build_object('id', c.id, 'estado', c.estado, 'cliente_nombre', c.cliente_nombre,
                                          'nota', left(NULLIF(btrim(c.nota), ''), 80)))
             ORDER BY cs.inicia, cs.orden)
        FROM citas_servicios cs
        JOIN citas c ON c.id = cs.cita_id
        JOIN productos p ON p.id = cs.producto_id
        LEFT JOIN espacios e ON e.id = cs.espacio_id
       WHERE cs.tenant_id = v_tenant AND cs.usuario_id = auth.uid()
         AND c.estado <> 'CANCELADA'
         AND cs.inicia >= (p_desde::timestamp AT TIME ZONE 'America/Mexico_City')
         AND cs.inicia < ((p_hasta + 1)::timestamp AT TIME ZONE 'America/Mexico_City')), '[]'::jsonb));
END;
$$;
COMMENT ON FUNCTION mi_agenda(date, date) IS
  'Tramos del colaborador de la sesión entre dos días de México (máx. 14), sin datos de contacto de la clienta. SIN_AGENDA si no es colaborador activo (0227).';

-- «Llegó · empezar»: AGENDADA → EN_CURSO, solo si tiene un tramo suyo.
CREATE OR REPLACE FUNCTION mi_cita_empezar(p_cita uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid := _mi_colaborador_tenant();
  v_estado cita_estado;
BEGIN
  SELECT c.estado INTO v_estado FROM citas c
   WHERE c.id = p_cita AND c.tenant_id = v_tenant
     AND EXISTS (SELECT 1 FROM citas_servicios cs WHERE cs.cita_id = c.id AND cs.usuario_id = auth.uid())
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DATOS_INVALIDOS: la cita no es tuya.' USING ERRCODE = '22023'; END IF;
  IF v_estado <> 'AGENDADA' THEN RAISE EXCEPTION 'DATOS_INVALIDOS: la cita no está por llegar.' USING ERRCODE = '22023'; END IF;
  PERFORM atender_cita(p_cita);
END;
$$;

-- «Terminé»: termina la cita si el último tramo es suyo; si no, deja constancia. Devuelve el
-- estado en que queda la cita (TERMINADA o EN_CURSO).
CREATE OR REPLACE FUNCTION mi_cita_terminar(p_cita uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid := _mi_colaborador_tenant();
  v_c      citas%ROWTYPE;
BEGIN
  SELECT c.* INTO v_c FROM citas c
   WHERE c.id = p_cita AND c.tenant_id = v_tenant
     AND EXISTS (SELECT 1 FROM citas_servicios cs WHERE cs.cita_id = c.id AND cs.usuario_id = auth.uid())
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DATOS_INVALIDOS: la cita no es tuya.' USING ERRCODE = '22023'; END IF;
  IF v_c.estado <> 'EN_CURSO' THEN RAISE EXCEPTION 'DATOS_INVALIDOS: la cita no se está atendiendo.' USING ERRCODE = '22023'; END IF;

  IF (SELECT usuario_id FROM citas_servicios WHERE cita_id = p_cita ORDER BY orden DESC LIMIT 1) = auth.uid() THEN
    PERFORM terminar_cita(p_cita);
    RETURN 'TERMINADA';
  END IF;
  INSERT INTO auditoria_eventos (tenant_id, sucursal_id, usuario_id, categoria, evento_codigo, entidad_tipo, entidad_id, payload)
  VALUES (v_tenant, v_c.sucursal_id, auth.uid(), 'OTRO', 'cita.termino_tramo', 'cita', p_cita, '{}'::jsonb);
  RETURN 'EN_CURSO';
END;
$$;

-- Citas por colaborador y servicio en un rango de días de México. p_canal: NULL, CAJA o EN_LINEA.
CREATE OR REPLACE FUNCTION agenda_reporte_citas(p_desde date, p_hasta date, p_canal text DEFAULT NULL)
RETURNS TABLE(usuario_id uuid, colaborador text, producto_id uuid, servicio text, atendidas int,
              canceladas_clienta int, canceladas_negocio int, no_llego int, total int)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid := _agenda_admin_tenant();
  -- El rango como instantes (semiabierto), para que los filtros usen los índices.
  v_ini timestamptz := p_desde::timestamp AT TIME ZONE 'America/Mexico_City';
  v_fin timestamptz := (p_hasta + 1)::timestamp AT TIME ZONE 'America/Mexico_City';
BEGIN
  IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta < p_desde OR p_hasta - p_desde > 366 THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el rango va de 1 a 367 días.' USING ERRCODE = '22023';
  END IF;
  IF p_canal IS NOT NULL AND p_canal NOT IN ('CAJA', 'EN_LINEA') THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el canal es CAJA o EN_LINEA.' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH t AS (
    SELECT cs.usuario_id, cs.producto_id,
           c.estado IN ('TERMINADA', 'COBRADA') AS atendida,
           c.estado = 'CANCELADA' AND c.cancelada_por = 'CLIENTA_EN_LINEA' AS can_clienta,
           c.estado = 'CANCELADA' AND COALESCE(c.cancelada_por, 'CAJA') IN ('NEGOCIO', 'CAJA') AS can_negocio,
           c.estado = 'NO_LLEGO' AS falta
      FROM citas_servicios cs
      JOIN citas c ON c.id = cs.cita_id
     WHERE cs.tenant_id = v_tenant
       AND ((c.inicia >= v_ini AND c.inicia < v_fin)
            OR (c.inicia IS NULL AND c.created_at >= v_ini AND c.created_at < v_fin))
       AND (p_canal IS NULL OR (c.canal = 'EN_LINEA') = (p_canal = 'EN_LINEA'))
  )
  SELECT t.usuario_id, up.nombre::text, t.producto_id, p.nombre::text,
         count(*) FILTER (WHERE t.atendida)::int,
         count(*) FILTER (WHERE t.can_clienta)::int,
         count(*) FILTER (WHERE t.can_negocio)::int,
         count(*) FILTER (WHERE t.falta)::int,
         count(*) FILTER (WHERE t.atendida OR t.can_clienta OR t.can_negocio OR t.falta)::int
    FROM t
    LEFT JOIN usuarios_perfil up ON up.id = t.usuario_id
    JOIN productos p ON p.id = t.producto_id
   GROUP BY t.usuario_id, up.nombre, t.producto_id, p.nombre
  HAVING count(*) FILTER (WHERE t.atendida OR t.can_clienta OR t.can_negocio OR t.falta) > 0
   ORDER BY up.nombre NULLS LAST, p.nombre;
END;
$$;
COMMENT ON FUNCTION agenda_reporte_citas(date, date, text) IS
  'Por colaborador y servicio: atendidas, canceladas por la clienta o por el negocio y «No llegó» (PAGO_VENCIDO no cuenta). Solo dueño o administrador (0227).';

-- Minutos de horario contra minutos agendados por colaborador y día de México.
CREATE OR REPLACE FUNCTION agenda_ocupacion(p_desde date, p_hasta date)
RETURNS TABLE(usuario_id uuid, colaborador text, dia date, minutos_horario int, minutos_agendados int)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_tenant uuid := _agenda_admin_tenant();
BEGIN
  IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta < p_desde OR p_hasta - p_desde > 92 THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el rango va de 1 a 93 días.' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH d AS (
    SELECT g::date AS dia,
           (g::date::timestamp AT TIME ZONE 'America/Mexico_City') AS ini,
           ((g::date + 1)::timestamp AT TIME ZONE 'America/Mexico_City') AS fin
      FROM generate_series(p_desde, p_hasta, interval '1 day') g
  ), col AS (
    -- Colaboradores activos y los que tuvieron tramos en el rango.
    SELECT ca.usuario_id FROM colaboradores_agenda ca
     WHERE ca.tenant_id = v_tenant
       AND (ca.activo OR EXISTS (
             SELECT 1 FROM citas_servicios cs
              WHERE cs.tenant_id = v_tenant AND cs.usuario_id = ca.usuario_id AND cs.activa
                AND cs.inicia < (SELECT max(fin) FROM d) AND cs.termina > (SELECT min(ini) FROM d)))
  ), x AS (
    SELECT col.usuario_id, d.dia,
           CASE WHEN EXISTS (SELECT 1 FROM ausencias_colaborador a
                              WHERE a.tenant_id = v_tenant AND a.usuario_id = col.usuario_id AND d.dia BETWEEN a.desde AND a.hasta)
                THEN 0
                ELSE COALESCE((SELECT (extract(epoch FROM h.termina - h.inicia)
                                       - COALESCE(extract(epoch FROM h.comida_termina - h.comida_inicia), 0)) / 60
                                 FROM horarios_colaborador h
                                WHERE h.tenant_id = v_tenant AND h.usuario_id = col.usuario_id
                                  AND h.dia_semana = extract(dow FROM d.dia)), 0)
           END::int AS horario,
           COALESCE((SELECT sum(extract(epoch FROM LEAST(cs.termina, d.fin) - GREATEST(cs.inicia, d.ini))) / 60
                       FROM citas_servicios cs
                      WHERE cs.tenant_id = v_tenant AND cs.usuario_id = col.usuario_id AND cs.activa
                        AND cs.inicia < d.fin AND cs.termina > d.ini), 0)::int AS agendados
      FROM col CROSS JOIN d
  )
  SELECT x.usuario_id, up.nombre::text, x.dia, x.horario,
         CASE WHEN x.horario > 0 THEN LEAST(x.agendados, x.horario) ELSE x.agendados END
    FROM x JOIN usuarios_perfil up ON up.id = x.usuario_id
   ORDER BY up.nombre, x.dia;
END;
$$;
COMMENT ON FUNCTION agenda_ocupacion(date, date) IS
  'Por colaborador y día de México: minutos de horario (sin comida; 0 con ausencia o sin horario) y minutos agendados, con tope en el horario cuando lo hay. Solo dueño o administrador (0227).';

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['mi_agenda(date, date)', 'mi_cita_empezar(uuid)', 'mi_cita_terminar(uuid)',
                           'agenda_reporte_citas(date, date, text)', 'agenda_ocupacion(date, date)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;
