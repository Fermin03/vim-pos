-- ============================================================================
-- 0075 — Un dueño puede fijarse su PRIMER PIN.
--
-- La 0064 endureció el reseteo de PIN con jerarquía ESTRICTAMENTE mayor, y con eso cerró sin
-- querer la única puerta que tenía el dueño de un tenant nuevo:
--
--   · `resetear_pin_empleado` exige que alguien POR ENCIMA le asigne el PIN — y encima del
--     DUEÑO no hay nadie.
--   · `cambiar_pin_propio` exige el PIN ANTERIOR y falla con SIN_PIN si nunca hubo uno.
--
-- Resultado: todo tenant recién provisionado nacía sin poder autorizar nada, y solo se
-- desatascaba con service_role desde soporte. Apareció al dar de alta el tenant de pruebas, pero
-- le pasa a CUALQUIER cliente nuevo.
--
-- El arreglo es acotado: la jerarquía se sigue exigiendo para tocar la cuenta de OTRO. Contra uno
-- mismo no protege de nada — quien llama ya tiene la sesión de ese usuario, iniciada con su correo
-- y su contraseña. Y el control de arriba (ser admin del tenant) se conserva intacto.
--
-- Migración ADITIVA: reemplaza el cuerpo sin tocar firma ni permisos.
-- ============================================================================

CREATE OR REPLACE FUNCTION resetear_pin_empleado(
  p_usuario_id uuid,
  p_pin_nuevo  text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_jer_llamante integer;
  v_jer_objetivo integer;
BEGIN
  IF p_pin_nuevo !~ '^[0-9]{4,6}$' THEN
    RAISE EXCEPTION 'PIN_INVALIDO';
  END IF;

  -- SEC CN-002 — con identidad de usuario (llamada por la API), exigir admin del tenant destino.
  -- Sin auth.uid() (service_role desde la Edge, o el gateway del escritorio por conexión directa)
  -- se confía en el llamante: ahí el control es el GRANT, que la 0063 dejó solo en service_role.
  IF v_uid IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM usuarios_acceso ua
       WHERE ua.usuario_id = p_usuario_id AND es_admin_del_tenant(ua.tenant_id)
    ) THEN
      RAISE EXCEPTION 'SIN_PERMISO';
    END IF;

    -- SEC CN-016 — jerarquía: la más alta del llamante debe superar la más alta del objetivo.
    SELECT max(r.jerarquia) INTO v_jer_llamante
      FROM usuarios_acceso ua JOIN roles r ON r.id = ua.rol_id
     WHERE ua.usuario_id = v_uid AND ua.activo = true;

    SELECT max(r.jerarquia) INTO v_jer_objetivo
      FROM usuarios_acceso ua JOIN roles r ON r.id = ua.rol_id
     WHERE ua.usuario_id = p_usuario_id AND ua.activo = true;

    -- Excepción: fijarse el PIN A UNO MISMO. La jerarquía existe para que nadie toque la cuenta
    -- de alguien por encima suyo; contra uno mismo no protege de nada y crea un callejón sin
    -- salida: el DUEÑO es el techo, así que NADIE puede darle su primer PIN, y `cambiar_pin_propio`
    -- exige el PIN anterior —que todavía no tiene—. Un tenant recién creado se quedaba sin poder
    -- autorizar nada.
    --
    -- No se debilita el control: arriba ya se exigió que el llamante sea admin del tenant, y aquí
    -- quien pide es el mismo usuario, con su sesión iniciada por correo y contraseña.
    IF p_usuario_id <> v_uid AND coalesce(v_jer_llamante, 0) <= coalesce(v_jer_objetivo, 0) THEN
      RAISE EXCEPTION 'JERARQUIA_INSUFICIENTE';
    END IF;
  END IF;

  UPDATE usuarios_perfil
     SET pin_hash = crypt(p_pin_nuevo, gen_salt('bf', 10)),
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
