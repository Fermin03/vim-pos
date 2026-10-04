-- ============================================================================
-- 0154 · Eliminar a un empleado: el correo queda libre, el historial se queda (ADR 0028)
--
-- El problema: desactivar a un empleado deja viva su cuenta de auth con el correo ocupado. Si esa
-- persona abre después su propio negocio, el registro la rechaza con EMAIL_YA_REGISTRADO y no
-- había nada que hacer desde ningún panel.
--
-- Lo que NO se puede hacer es borrar la cuenta: turnos, pagos, cortes, cancelaciones y
-- autorizaciones apuntan a ella con llaves NOT NULL, y son el registro contable del negocio, no
-- datos de la persona. Además la caja puede traer tickets suyos que todavía no suben: si la cuenta
-- ya no existe en la nube, esa subida se rechazaría. Por eso NUNCA se borra la fila, ni siquiera
-- la de quien no vendió nada.
--
-- Lo que se hace: la cuenta se vacía y se queda como ficha.
--   · auth.users.email pasa a `eliminado-<id>@eliminados.vimpos.com.mx` → el correo real queda
--     libre al instante; sin contraseña, sin teléfono, sin metadatos, bloqueada (banned_until);
--     fuera identidades, sesiones, factores y tokens.
--   · usuarios_perfil: sin teléfono, foto ni PIN; estado DESACTIVADO; deleted_at = ahora; el
--     nombre se conserva con la marca " (cuenta eliminada)" para que el historial siga diciendo
--     quién hizo cada corte.
--   · usuarios_acceso se queda (inactivo): por esa fila la caja sigue recibiendo la ficha en el
--     pull y así se entera de que ya no hay PIN. Sin ella la caja conservaría el PIN viejo.
--
-- Quién: un DUEÑO/ADMIN del negocio (función eliminar-empleado) o un operador de VIM desde
-- /platform, buscando por correo. Siempre sobre un empleado YA desactivado. No se deshace.
-- ============================================================================

-- La marca va en el nombre y no en la pantalla: así sale igual en el admin, en la caja y en los
-- reportes impresos, sin tocar cada consulta que une con usuarios_perfil.
CREATE OR REPLACE FUNCTION public._eliminar_usuario_marca()
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT ' (cuenta eliminada)'::text $$;

-- Por qué NO se puede eliminar esta cuenta en este negocio. Arreglo vacío = se puede.
CREATE OR REPLACE FUNCTION public._eliminar_usuario_bloqueos(p_usuario_id uuid, p_tenant_id uuid, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v jsonb := '[]'::jsonb;
  v_email text;
  v_negocio text;
BEGIN
  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = p_usuario_id;

  IF p_usuario_id = p_actor THEN
    v := v || pg_catalog.jsonb_build_object('codigo', 'ES_UNO_MISMO', 'mensaje', 'No puedes eliminar tu propia cuenta.');
  END IF;

  IF EXISTS (SELECT 1 FROM public.tenants t WHERE t.usuario_dueno_id = p_usuario_id)
     OR EXISTS (SELECT 1 FROM public.usuarios_acceso a JOIN public.roles r ON r.id = a.rol_id
                 WHERE a.usuario_id = p_usuario_id AND r.codigo = 'DUENO') THEN
    v := v || pg_catalog.jsonb_build_object('codigo', 'ES_DUENO',
      'mensaje', 'Es la cuenta del dueño de un negocio. Su correo se libera al eliminar ese negocio, no desde aquí.');
  END IF;

  IF v_email ~* '^caja-[0-9a-f-]{36}@dispositivos\.vimpos\.(com\.)?mx$'
     OR EXISTS (SELECT 1 FROM public.usuarios_acceso a JOIN public.roles r ON r.id = a.rol_id
                 WHERE a.usuario_id = p_usuario_id AND r.codigo = 'DISPOSITIVO') THEN
    v := v || pg_catalog.jsonb_build_object('codigo', 'ES_DISPOSITIVO', 'mensaje', 'Es la cuenta de una caja, no de una persona.');
  END IF;

  IF EXISTS (SELECT 1 FROM public.plataforma_operadores o WHERE o.usuario_id = p_usuario_id) THEN
    v := v || pg_catalog.jsonb_build_object('codigo', 'ES_OPERADOR', 'mensaje', 'Es la cuenta de un operador del panel de VIM.');
  END IF;

  SELECT t.nombre_comercial INTO v_negocio
    FROM public.usuarios_acceso a JOIN public.tenants t ON t.id = a.tenant_id
   WHERE a.usuario_id = p_usuario_id AND a.tenant_id <> p_tenant_id
   LIMIT 1;
  IF FOUND THEN
    v := v || pg_catalog.jsonb_build_object('codigo', 'ACCESO_A_OTRO_NEGOCIO',
      'mensaje', 'La cuenta también tiene acceso a otro negocio (' || v_negocio || '). Hay que revisarlo a mano.');
  END IF;

  IF EXISTS (SELECT 1 FROM public.usuarios_acceso a
              WHERE a.usuario_id = p_usuario_id AND a.tenant_id = p_tenant_id AND a.activo) THEN
    v := v || pg_catalog.jsonb_build_object('codigo', 'SIGUE_ACTIVO',
      'mensaje', 'El usuario sigue activo. Primero hay que desactivarlo.');
  END IF;

  RETURN v;
END;
$$;

-- ----------------------------------------------------------------------------
-- eliminar_usuario
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.eliminar_usuario(
  p_usuario_id uuid,
  p_tenant_id  uuid,
  p_actor      uuid,
  p_origen     text,                 -- 'NEGOCIO' (dueño/admin) | 'PLATAFORMA' (operador de VIM)
  p_motivo     text DEFAULT NULL,    -- obligatorio desde PLATAFORMA
  p_ip         inet DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_perfil   public.usuarios_perfil%ROWTYPE;
  v_bloqueos jsonb;
  v_nombre   text;
  v_marca    text := public._eliminar_usuario_marca();
  v_tabla    text;
BEGIN
  IF p_origen IS NULL OR p_origen NOT IN ('NEGOCIO', 'PLATAFORMA') THEN
    RAISE EXCEPTION 'ORIGEN_INVALIDO: origen desconocido.';
  END IF;
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'ACTOR_REQUERIDO: falta quién elimina.';
  END IF;
  IF p_origen = 'PLATAFORMA' AND pg_catalog.length(pg_catalog.btrim(coalesce(p_motivo, ''))) < 10 THEN
    RAISE EXCEPTION 'MOTIVO_REQUERIDO: escribe el motivo (10 caracteres o más).';
  END IF;
  -- Se repite aquí lo que ya comprueba la función eliminar-empleado: la regla vive con el dato.
  IF p_origen = 'NEGOCIO' AND NOT EXISTS (
       SELECT 1 FROM public.usuarios_acceso a JOIN public.roles r ON r.id = a.rol_id
        WHERE a.usuario_id = p_actor AND a.tenant_id = p_tenant_id AND a.activo
          AND r.codigo IN ('DUENO', 'ADMIN') AND r.es_sistema) THEN
    RAISE EXCEPTION 'SIN_PERMISO: solo el dueño o un administrador del negocio puede eliminar usuarios.';
  END IF;

  -- La cuenta, bloqueada: dos clics seguidos no hacen el trabajo dos veces.
  PERFORM 1 FROM auth.users u WHERE u.id = p_usuario_id FOR UPDATE;
  SELECT * INTO v_perfil FROM public.usuarios_perfil p WHERE p.id = p_usuario_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.usuarios_acceso a
                               WHERE a.usuario_id = p_usuario_id AND a.tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'USUARIO_NO_EXISTE: ese usuario no existe en este negocio.';
  END IF;

  IF v_perfil.deleted_at IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', true, 'usuario_id', p_usuario_id, 'nombre', v_perfil.nombre, 'ya_eliminado', true);
  END IF;

  v_bloqueos := public._eliminar_usuario_bloqueos(p_usuario_id, p_tenant_id, p_actor);
  IF pg_catalog.jsonb_array_length(v_bloqueos) > 0 THEN
    RAISE EXCEPTION '%: %', v_bloqueos -> 0 ->> 'codigo', v_bloqueos -> 0 ->> 'mensaje';
  END IF;

  -- ── La ficha: se queda el nombre (con la marca), se va todo lo demás ──────────────────────
  v_nombre := pg_catalog.btrim(pg_catalog.concat_ws(' ', v_perfil.nombre, v_perfil.apellido_paterno, v_perfil.apellido_materno));
  v_nombre := pg_catalog.left(v_nombre, 100 - pg_catalog.length(v_marca)) || v_marca;

  UPDATE public.usuarios_perfil
     SET nombre = v_nombre, apellido_paterno = NULL, apellido_materno = NULL,
         telefono = NULL, foto_url = NULL, pin_hash = NULL,
         estado = 'DESACTIVADO', bloqueado_hasta = NULL, intentos_pin_fallidos = 0,
         deleted_at = pg_catalog.now(), updated_at = pg_catalog.now()
   WHERE id = p_usuario_id;

  -- Lo que es de la persona y no del historial del negocio. (pin_intentos y sesiones_login se
  -- quedan: son la bitácora de seguridad del negocio.)
  DELETE FROM public.push_suscripciones s WHERE s.usuario_id = p_usuario_id;
  DELETE FROM public.permisos_personalizados pp WHERE pp.usuario_id = p_usuario_id;

  -- ── La cuenta de auth: sin correo real, sin forma de entrar ───────────────────────────────
  -- Las columnas de token van en '' y no en NULL: GoTrue las lee como texto no nulo.
  UPDATE auth.users
     SET email = 'eliminado-' || p_usuario_id::text || '@eliminados.vimpos.com.mx',
         encrypted_password = '',
         phone = NULL,
         raw_user_meta_data = '{}'::jsonb,
         confirmation_token = '', recovery_token = '',
         email_change = '', email_change_token_new = '', email_change_token_current = '',
         phone_change = '', phone_change_token = '', reauthentication_token = '',
         updated_at = pg_catalog.now()
   WHERE id = p_usuario_id;

  -- Lo que solo existe en el GoTrue de la nube (la caja trae un auth.users reducido).
  -- 2999 y no 'infinity': infinity rompe el listado de usuarios de Auth.
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
              WHERE attrelid = 'auth.users'::regclass AND attname = 'banned_until' AND NOT attisdropped) THEN
    EXECUTE 'UPDATE auth.users SET banned_until = ''2999-12-31 00:00:00+00'' WHERE id = $1' USING p_usuario_id;
  END IF;
  -- identities guarda otra copia del correo; sessions arrastra sus refresh tokens.
  FOREACH v_tabla IN ARRAY ARRAY['identities', 'sessions', 'mfa_factors', 'one_time_tokens'] LOOP
    IF pg_catalog.to_regclass('auth.' || v_tabla) IS NOT NULL THEN
      EXECUTE pg_catalog.format('DELETE FROM auth.%I WHERE user_id = $1', v_tabla) USING p_usuario_id;
    END IF;
  END LOOP;

  -- ── El rastro, en la MISMA transacción. Sin el correo: guardarlo aquí sería no liberarlo. ──
  INSERT INTO public.auditoria_eventos (tenant_id, usuario_id, categoria, evento_codigo, entidad_tipo, entidad_id, payload, ip_address)
  VALUES (p_tenant_id, CASE WHEN p_origen = 'NEGOCIO' THEN p_actor END, 'USUARIOS', 'usuario.eliminar', 'usuario', p_usuario_id,
          pg_catalog.jsonb_build_object('nombre', v_perfil.nombre, 'origen', p_origen,
                                        'motivo', nullif(pg_catalog.btrim(coalesce(p_motivo, '')), '')),
          p_ip);

  IF p_origen = 'PLATAFORMA' THEN
    INSERT INTO public.super_admin_accesos (super_admin_id, tenant_id, accion, motivo, payload, ip_address)
    VALUES (p_actor, p_tenant_id, 'usuario.eliminar', pg_catalog.btrim(p_motivo),
            pg_catalog.jsonb_build_object('usuario_id', p_usuario_id, 'nombre', v_perfil.nombre), p_ip);
  END IF;

  RETURN pg_catalog.jsonb_build_object('ok', true, 'usuario_id', p_usuario_id, 'nombre', v_nombre, 'ya_eliminado', false);
END;
$$;

REVOKE ALL ON FUNCTION public._eliminar_usuario_marca() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._eliminar_usuario_bloqueos(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.eliminar_usuario(uuid, uuid, uuid, text, text, inet) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_usuario(uuid, uuid, uuid, text, text, inet) TO service_role;

-- ----------------------------------------------------------------------------
-- usuario_por_correo: lo que /platform enseña antes de liberar un correo
--
-- El operador recibe "mi correo no me deja registrarme" y no sabe en qué negocio trabajó esa
-- persona: se busca por el correo, no por el negocio.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.usuario_por_correo(p_email text, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id       uuid;
  v_nombre   text;
  v_accesos  jsonb;
  v_tenant   uuid;
  v_bloqueos jsonb;
BEGIN
  SELECT u.id INTO v_id FROM auth.users u
   WHERE pg_catalog.lower(u.email) = pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')))
   LIMIT 1;
  IF v_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('encontrado', false);
  END IF;

  SELECT p.nombre INTO v_nombre FROM public.usuarios_perfil p WHERE p.id = v_id;

  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'tenant_id', t.id, 'negocio', t.nombre_comercial, 'estado_negocio', t.estado::text,
           'rol', r.codigo, 'activo', a.activo) ORDER BY a.activo DESC, t.nombre_comercial), '[]'::jsonb),
         (pg_catalog.array_agg(t.id ORDER BY a.activo DESC, a.created_at DESC))[1]
    INTO v_accesos, v_tenant
    FROM public.usuarios_acceso a
    JOIN public.tenants t ON t.id = a.tenant_id
    JOIN public.roles r ON r.id = a.rol_id
   WHERE a.usuario_id = v_id;

  IF v_tenant IS NULL THEN
    v_bloqueos := pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('codigo', 'SIN_NEGOCIO',
      'mensaje', 'La cuenta no pertenece a ningún negocio. Hay que revisarla a mano.'));
  ELSE
    v_bloqueos := public._eliminar_usuario_bloqueos(v_id, v_tenant, p_actor);
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'encontrado', true,
    'usuario_id', v_id,
    'nombre', coalesce(v_nombre, '(sin perfil)'),
    'tenant_id', v_tenant,
    'accesos', v_accesos,
    'bloqueos', v_bloqueos,
    'puede_eliminar', pg_catalog.jsonb_array_length(v_bloqueos) = 0);
END;
$$;

REVOKE ALL ON FUNCTION public.usuario_por_correo(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.usuario_por_correo(text, uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- Un eliminado no se reactiva
--
-- "Activar" en el admin es un UPDATE directo de usuarios_acceso.activo. Sobre una ficha eliminada
-- no devolvería el acceso (ya no hay PIN ni correo), pero sí ocuparía un lugar del plan y volvería
-- a poner a la persona en la lista de quién opera la caja. Vale para todos, también service_role.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_usuarios_acceso_no_revivir()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.activo AND EXISTS (SELECT 1 FROM public.usuarios_perfil p
                             WHERE p.id = NEW.usuario_id AND p.deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'USUARIO_ELIMINADO: esta cuenta se eliminó y no se puede reactivar. Da de alta a la persona como usuario nuevo.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.trg_usuarios_acceso_no_revivir() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_usuarios_acceso_no_revivir ON public.usuarios_acceso;
CREATE TRIGGER trg_usuarios_acceso_no_revivir
  BEFORE INSERT OR UPDATE OF activo ON public.usuarios_acceso
  FOR EACH ROW EXECUTE FUNCTION public.trg_usuarios_acceso_no_revivir();
