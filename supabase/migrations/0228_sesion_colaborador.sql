-- Belleza, entrega 4: la sesión web del colaborador (/mi-agenda) no lee clientas ni citas directo.
--
-- El colaborador entra a /mi-agenda con correo y contraseña. Su token es de GoTrue y, por el hook
-- (0006), trae el tenant_id del negocio: con la RLS por negocio podría leer por PostgREST todas las
-- citas y clientas (teléfono y correo incluidos). Su agenda la dan las RPC de la 0227 (SECURITY
-- DEFINER, solo lo suyo); las tablas quedan cerradas para esa sesión.
--
-- Sesión web limitada = token emitido por GoTrue (trae session_id), que no es de dispositivo y
-- cuyo usuario no tiene en el negocio un acceso activo de jerarquía 3 o más (supervisor, admin,
-- dueño). El hook marca EMPLEADO a cualquier rol que no sea dueño/admin, así que tipo_identidad no
-- basta: lo que distingue a la caja es que su token de empleado lo acuña pin-login (y el gateway
-- del escritorio) SIN session_id. La caja, el dispositivo y el panel (jerarquía ≥ 3) no cambian.
--
-- Escrituras: citas, citas_servicios, anticipos_cita y cotizaciones solo tienen SELECT para
-- authenticated (se escriben por RPC). clientes (ALL) y reservaciones (INSERT/UPDATE) sí tienen
-- políticas de escritura: también se cierran para esa sesión. Las políticas se redefinen igual
-- que las vigentes, más la condición.

CREATE OR REPLACE FUNCTION public.es_sesion_web_limitada()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (auth.jwt() ? 'session_id')
     AND coalesce(auth.jwt() ->> 'tipo_identidad', '') <> 'DISPOSITIVO'
     AND NOT EXISTS (
       SELECT 1
         FROM public.usuarios_acceso ua
         JOIN public.roles r ON r.id = ua.rol_id
        WHERE ua.usuario_id = auth.uid()
          AND ua.tenant_id  = public.current_tenant_id()
          AND ua.activo
          AND (ua.fecha_fin IS NULL OR ua.fecha_fin >= CURRENT_DATE)
          AND r.jerarquia >= 3
     );
$$;
COMMENT ON FUNCTION public.es_sesion_web_limitada() IS
  'true para la sesión web (GoTrue, no dispositivo) de un usuario sin acceso de jerarquía ≥ 3 en el negocio del token. Cierra tablas sensibles a /mi-agenda (0228).';
-- anon también: las políticas son TO public y la evalúan (sin session_id da false). Solo mira al
-- propio usuario.
REVOKE EXECUTE ON FUNCTION public.es_sesion_web_limitada() FROM public;
GRANT EXECUTE ON FUNCTION public.es_sesion_web_limitada() TO anon, authenticated, service_role;

-- Lectura (el SELECT envuelto se evalúa una vez por consulta, no por fila).
DROP POLICY citas_lectura ON public.citas;
CREATE POLICY citas_lectura ON public.citas FOR SELECT
  USING (tenant_id = current_tenant_id() AND NOT (SELECT public.es_sesion_web_limitada()));

DROP POLICY citas_servicios_lectura ON public.citas_servicios;
CREATE POLICY citas_servicios_lectura ON public.citas_servicios FOR SELECT
  USING (tenant_id = current_tenant_id() AND NOT (SELECT public.es_sesion_web_limitada()));

DROP POLICY anticipos_cita_lectura ON public.anticipos_cita;
CREATE POLICY anticipos_cita_lectura ON public.anticipos_cita FOR SELECT
  USING (tenant_id = current_tenant_id() AND NOT (SELECT public.es_sesion_web_limitada()));

DROP POLICY cotizaciones_lectura ON public.cotizaciones;
CREATE POLICY cotizaciones_lectura ON public.cotizaciones FOR SELECT
  USING (tenant_id = current_tenant_id() AND NOT (SELECT public.es_sesion_web_limitada()));

-- clientes: una sola política ALL.
DROP POLICY clientes_tenant ON public.clientes;
CREATE POLICY clientes_tenant ON public.clientes
  USING (tenant_id = current_tenant_id() AND NOT (SELECT public.es_sesion_web_limitada()))
  WITH CHECK (tenant_id = current_tenant_id() AND NOT (SELECT public.es_sesion_web_limitada()));

-- reservaciones: SELECT, INSERT y UPDATE.
DROP POLICY reservaciones_select ON public.reservaciones;
CREATE POLICY reservaciones_select ON public.reservaciones FOR SELECT
  USING (tenant_id = current_tenant_id() AND NOT (SELECT public.es_sesion_web_limitada()));

DROP POLICY reservaciones_insert ON public.reservaciones;
CREATE POLICY reservaciones_insert ON public.reservaciones FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id() AND NOT (SELECT public.es_sesion_web_limitada()));

DROP POLICY reservaciones_update ON public.reservaciones;
CREATE POLICY reservaciones_update ON public.reservaciones FOR UPDATE
  USING (tenant_id = current_tenant_id() AND NOT (SELECT public.es_sesion_web_limitada()))
  WITH CHECK (tenant_id = current_tenant_id() AND NOT (SELECT public.es_sesion_web_limitada()));

-- «Dar acceso a su celular» (admin, Colaboradores): el correo de la cuenta de cada colaborador
-- activo y su último acceso con correo y contraseña. Solo dueño o administrador. El correo de
-- «pon tu contraseña» lo pide el admin con el flujo de recuperación de siempre.
CREATE OR REPLACE FUNCTION public.agenda_accesos_colaboradores()
RETURNS TABLE (usuario_id uuid, email text, ultimo_acceso timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_tenant uuid := _agenda_admin_tenant();
BEGIN
  RETURN QUERY
  -- last_sign_in_at por jsonb: el auth.users de la caja instalada (00-compat-shim) no tiene esa
  -- columna y ahí esta función nunca se llama, pero la smoke corre contra esa base.
  SELECT ca.usuario_id, u.email::text, (to_jsonb(u) ->> 'last_sign_in_at')::timestamptz
    FROM colaboradores_agenda ca
    JOIN auth.users u ON u.id = ca.usuario_id
    JOIN usuarios_perfil up ON up.id = ca.usuario_id AND up.deleted_at IS NULL
   WHERE ca.tenant_id = v_tenant
     AND ca.activo
     AND EXISTS (SELECT 1 FROM usuarios_acceso ua
                  WHERE ua.usuario_id = ca.usuario_id AND ua.tenant_id = v_tenant AND ua.activo);
END;
$$;
REVOKE ALL ON FUNCTION public.agenda_accesos_colaboradores() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agenda_accesos_colaboradores() TO authenticated, service_role;

-- ============================================================================================
-- Rol de base de datos de la sesión web del colaborador.
--
-- Cerrar las tablas no basta: las RPC de la caja (guardar_cita, cancelar_cita, marcar_no_llego,
-- aplicar_pago…) dan EXECUTE a authenticated y solo validan el negocio. Por eso el hook de token
-- le pone role = colaborador_web a esa sesión, y PostgREST corre sus llamadas con ese rol, que
-- solo puede ejecutar lo de /mi-agenda y no tiene privilegios sobre ninguna tabla. La RLS de
-- arriba queda como segunda capa.
--
-- Mismo criterio que es_sesion_web_limitada: el hook solo lo llama GoTrue (login con correo y
-- contraseña, enlace del correo o renovación), nunca pin-login ni el gateway del escritorio, que
-- acuñan sus propios tokens. Fuera: el dispositivo y quien tenga en el negocio un acceso activo de
-- jerarquía ≥ 3 (supervisor, admin, dueño), que siguen como authenticated.
-- ============================================================================================
DO $$ BEGIN CREATE ROLE colaborador_web NOLOGIN NOINHERIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT colaborador_web TO authenticator;
GRANT USAGE ON SCHEMA public TO colaborador_web;

-- Hook (cuerpo vigente de 0006 + el rol). search_path '' y nombres calificados, igual que antes.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_user_id    uuid := (event ->> 'user_id')::uuid;
  v_claims     jsonb := event -> 'claims';
  v_tenant_id  uuid;
  v_tipo       text;
BEGIN
  -- Resolver el único acceso activo del usuario (D67: un tenant por cuenta).
  -- Si tuviera varios (no debería en MVP), gana el más reciente sin sucursal
  -- específica, o el más reciente a secas.
  SELECT ua.tenant_id,
         CASE
           WHEN r.codigo = 'DISPOSITIVO' THEN 'DISPOSITIVO'
           WHEN r.codigo IN ('DUENO','ADMIN') THEN 'ADMIN_WEB'
           ELSE 'EMPLEADO'
         END
    INTO v_tenant_id, v_tipo
    FROM public.usuarios_acceso ua
    JOIN public.roles r ON r.id = ua.rol_id
   WHERE ua.usuario_id = v_user_id
     AND ua.activo = true
     AND (ua.fecha_fin IS NULL OR ua.fecha_fin >= CURRENT_DATE)
   ORDER BY (ua.sucursal_id IS NULL) DESC, ua.created_at DESC
   LIMIT 1;

  -- Si el usuario no tiene acceso activo, se emite token SIN tenant_id.
  -- El RLS lo dejará sin ver nada (comportamiento seguro por defecto).
  IF v_tenant_id IS NOT NULL THEN
    v_claims := jsonb_set(v_claims, '{tenant_id}', to_jsonb(v_tenant_id::text));
    v_claims := jsonb_set(v_claims, '{tipo_identidad}', to_jsonb(v_tipo));

    -- 0228: sesión web sin jerarquía de panel → rol colaborador_web.
    IF v_tipo <> 'DISPOSITIVO' AND NOT EXISTS (
         SELECT 1
           FROM public.usuarios_acceso ua
           JOIN public.roles r ON r.id = ua.rol_id
          WHERE ua.usuario_id = v_user_id
            AND ua.tenant_id  = v_tenant_id
            AND ua.activo = true
            AND (ua.fecha_fin IS NULL OR ua.fecha_fin >= CURRENT_DATE)
            AND r.jerarquia >= 3) THEN
      v_claims := jsonb_set(v_claims, '{role}', to_jsonb('colaborador_web'::text));
    END IF;
  END IF;

  RETURN jsonb_set(event, '{claims}', v_claims);
END;
$$;
COMMENT ON FUNCTION public.custom_access_token_hook IS
  'Hook de GoTrue. Inyecta tenant_id y tipo_identidad en el JWT (Parte 1F §3); role = colaborador_web a la sesión web sin jerarquía de panel (0228).';
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

-- Sus comisiones. comisiones_periodo y periodo_comisiones son INVOKER (leen tablas que este rol no
-- tiene) y comisiones_periodo solo filtra al propio colaborador cuando el rol es authenticated:
-- envolverlas en DEFINER filtrando por auth.uid() es lo que deja ver solo lo suyo.
CREATE OR REPLACE FUNCTION public.mis_comisiones(p_desde date, p_hasta date)
RETURNS TABLE(usuario_id uuid, nombre text, servicios integer, ventas_mxn numeric, comision_servicios_mxn numeric,
              comision_productos_mxn numeric, sueldo_mxn numeric, total_mxn numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM _mi_colaborador_tenant();
  IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta < p_desde OR p_hasta - p_desde > 92 THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el rango va de 1 a 93 días.' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT c.* FROM comisiones_periodo(p_desde, p_hasta) c WHERE c.usuario_id = auth.uid();
END;
$$;
COMMENT ON FUNCTION public.mis_comisiones(date, date) IS
  'comisiones_periodo solo del colaborador de la sesión; SIN_AGENDA si no es colaborador activo (0228).';

CREATE OR REPLACE FUNCTION public.mi_periodo_comisiones(p_fecha date)
RETURNS TABLE(desde date, hasta date)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM _mi_colaborador_tenant();
  RETURN QUERY SELECT p.desde, p.hasta FROM periodo_comisiones(p_fecha) p;
END;
$$;
COMMENT ON FUNCTION public.mi_periodo_comisiones(date) IS
  'periodo_comisiones para /mi-agenda (0228).';

-- Lo único que ejecuta colaborador_web. authenticated también: un supervisor colaborador entra a
-- /mi-agenda con su rol de siempre.
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['mi_agenda(date, date)', 'mi_cita_empezar(uuid)', 'mi_cita_terminar(uuid)',
                           'mis_comisiones(date, date)', 'mi_periodo_comisiones(date)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, colaborador_web, service_role', f);
  END LOOP;
END $$;
