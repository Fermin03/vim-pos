-- Helpers SQL para F4.3 (admin · usuarios)
-- Funciones SECURITY DEFINER usadas por las Edge Functions crear-empleado y
-- resetear-pin. Permiten insertar/actualizar pin_hash usando crypt() (pgcrypto)
-- sin exponer service_role al cliente.

-- ============================================================
-- crear_perfil_con_pin: crea usuarios_perfil con PIN bcrypt
-- ============================================================
CREATE OR REPLACE FUNCTION crear_perfil_con_pin(
  p_usuario_id uuid,
  p_nombre     text,
  p_pin        text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF p_pin !~ '^[0-9]{4,6}$' THEN
    RAISE EXCEPTION 'PIN_INVALIDO';
  END IF;

  INSERT INTO usuarios_perfil (id, nombre, pin_hash, estado)
  VALUES (p_usuario_id, p_nombre, crypt(p_pin, gen_salt('bf')), 'ACTIVO');
END;
$$;

COMMENT ON FUNCTION crear_perfil_con_pin IS
  'F4.3 — crea perfil con PIN hasheado bcrypt. Solo desde la Edge Function crear-empleado (service_role).';

REVOKE EXECUTE ON FUNCTION crear_perfil_con_pin FROM authenticated, anon, public;

-- ============================================================
-- resetear_pin_empleado: actualiza pin_hash y limpia bloqueos
-- ============================================================
CREATE OR REPLACE FUNCTION resetear_pin_empleado(
  p_usuario_id uuid,
  p_pin_nuevo  text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF p_pin_nuevo !~ '^[0-9]{4,6}$' THEN
    RAISE EXCEPTION 'PIN_INVALIDO';
  END IF;

  UPDATE usuarios_perfil
     SET pin_hash = crypt(p_pin_nuevo, gen_salt('bf')),
         intentos_pin_fallidos = 0,
         bloqueado_hasta = NULL,
         estado = CASE WHEN estado = 'BLOQUEADO_ADMIN' THEN 'ACTIVO'::usuario_estado ELSE estado END,
         updated_at = now()
   WHERE id = p_usuario_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USUARIO_NO_ENCONTRADO';
  END IF;
END;
$$;

COMMENT ON FUNCTION resetear_pin_empleado IS
  'F4.3 — resetea PIN bcrypt y desbloquea cuenta. Solo desde Edge Function resetear-pin (service_role).';

REVOKE EXECUTE ON FUNCTION resetear_pin_empleado FROM authenticated, anon, public;

-- ============================================================
-- F4.3 — Políticas RLS para que ADMIN_WEB gestione empleados
-- ============================================================
-- Las políticas originales (0004) solo permiten SELECT a otros del mismo tenant
-- y UPDATE del propio perfil. Para que el admin web pueda activar/desactivar y
-- cambiar roles, se añaden políticas UPDATE acotadas a admins (DUENO/ADMIN) del
-- tenant. El bloqueo de pin_hash sigue intacto: las mutaciones críticas (PIN)
-- van por las Edge Functions con SECURITY DEFINER.

CREATE OR REPLACE FUNCTION es_admin_del_tenant(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.usuarios_acceso ua
      JOIN public.roles r ON r.id = ua.rol_id
     WHERE ua.usuario_id = auth.uid()
       AND ua.tenant_id  = p_tenant_id
       AND ua.activo     = true
       AND r.codigo IN ('DUENO','ADMIN')
       AND r.es_sistema  = true
  );
$$;

COMMENT ON FUNCTION es_admin_del_tenant IS
  'F4.3 — true si auth.uid() es DUENO/ADMIN del tenant dado. Usada por las RLS de gestión.';

-- usuarios_acceso: el admin del tenant puede UPDATE filas de su tenant
CREATE POLICY acceso_update_admin ON public.usuarios_acceso
  FOR UPDATE TO authenticated
  USING (es_admin_del_tenant(tenant_id))
  WITH CHECK (es_admin_del_tenant(tenant_id));

-- usuarios_perfil: el admin del tenant puede UPDATE el perfil (nombre, estado)
-- de cualquier empleado de su tenant. pin_hash NO se actualiza por esta vía:
-- va por la Edge Function resetear-pin (que usa resetear_pin_empleado, SECURITY DEFINER).
-- usuarios_perfil: el admin del tenant puede VER el perfil de cualquier empleado
-- del tenant, incluyendo INACTIVOS. La política existente `usuarios_perfil_mismo_tenant`
-- (0004) exige ua.activo = true en su EXISTS → al desactivar a alguien se le pierde
-- de vista del admin. Esta política añade visibilidad incondicional para admins.
CREATE POLICY usuarios_perfil_select_admin ON public.usuarios_perfil
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios_acceso ua
       WHERE ua.usuario_id = usuarios_perfil.id
         AND es_admin_del_tenant(ua.tenant_id)
    )
  );

CREATE POLICY usuarios_perfil_update_admin ON public.usuarios_perfil
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios_acceso ua
       WHERE ua.usuario_id = usuarios_perfil.id
         AND es_admin_del_tenant(ua.tenant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios_acceso ua
       WHERE ua.usuario_id = usuarios_perfil.id
         AND es_admin_del_tenant(ua.tenant_id)
    )
  );
