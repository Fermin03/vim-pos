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
