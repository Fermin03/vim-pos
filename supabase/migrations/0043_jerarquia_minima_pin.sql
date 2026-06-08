-- 0043 — AUTH H4: verificar_autorizacion_pin IGNORABA jerarquia_minima_pin.
-- El SELECT del autorizador solo exigía que su rol TUVIERA el permiso (rol_permisos.concedido),
-- nunca comparaba roles.jerarquia >= permisos.jerarquia_minima_pin. Con el seed no se dispara
-- (los roles que tienen los permisos autorizables ya cumplen la jerarquía), pero un rol custom u
-- override que conceda un permiso autorizable a un rol de baja jerarquía rompía el control.
-- Fix quirúrgico: una cláusula AND en el JOIN a permisos. Resto de la función intacto.

CREATE OR REPLACE FUNCTION public.verificar_autorizacion_pin(p_pin text, p_accion text, p_permiso_codigo text, p_entidad_tipo text, p_entidad_id uuid, p_monto numeric, p_motivo text, p_caja_id uuid, p_turno_id uuid, p_usuario_solicitante_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_tenant        uuid;
  v_autorizador   uuid;
  v_fallidos      integer;
  v_autorizacion  uuid;
BEGIN
  -- Tenant del solicitante (cajero)
  SELECT tenant_id INTO v_tenant
    FROM usuarios_acceso
   WHERE usuario_id = p_usuario_solicitante_id AND activo = true
   LIMIT 1;
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'SOLICITANTE_SIN_TENANT');
  END IF;

  -- Anti-fuerza-bruta: 6 intentos fallidos por caja en 5 min -> bloqueo temporal
  SELECT count(*) INTO v_fallidos
    FROM pin_intentos
   WHERE caja_id = p_caja_id AND exitoso = false AND motivo_fallo = 'AUTORIZACION'
     AND fecha_intento > now() - interval '5 minutes';
  IF v_fallidos >= 6 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'BLOQUEADO');
  END IF;

  -- Buscar autorizador: usuario del tenant CON el permiso cuyo PIN coincide
  SELECT up.id INTO v_autorizador
    FROM usuarios_perfil up
    JOIN usuarios_acceso ua ON ua.usuario_id = up.id AND ua.tenant_id = v_tenant AND ua.activo = true
    JOIN roles r           ON r.id = ua.rol_id
    JOIN rol_permisos rp    ON rp.rol_id = r.id AND rp.concedido = true
    JOIN permisos p         ON p.id = rp.permiso_id AND p.codigo = p_permiso_codigo AND (p.jerarquia_minima_pin IS NULL OR r.jerarquia >= p.jerarquia_minima_pin)
   WHERE up.pin_hash IS NOT NULL
     AND up.estado = 'ACTIVO'
     AND crypt(p_pin, up.pin_hash) = up.pin_hash
   LIMIT 1;

  IF v_autorizador IS NULL THEN
    INSERT INTO pin_intentos(tenant_id, caja_id, exitoso, motivo_fallo)
    VALUES (v_tenant, p_caja_id, false, 'AUTORIZACION');
    -- Distinguir "PIN valido pero sin permiso" de "PIN incorrecto" (mensaje de P-080)
    IF EXISTS (
      SELECT 1 FROM usuarios_perfil up
        JOIN usuarios_acceso ua ON ua.usuario_id = up.id AND ua.tenant_id = v_tenant AND ua.activo = true
       WHERE up.pin_hash IS NOT NULL AND crypt(p_pin, up.pin_hash) = up.pin_hash
    ) THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'SIN_PERMISO');
    END IF;
    RETURN jsonb_build_object('ok', false, 'motivo', 'PIN_INCORRECTO');
  END IF;

  -- Registrar la autorización
  INSERT INTO autorizaciones_pin(
    tenant_id, sucursal_id, caja_id, turno_id,
    usuario_solicitante_id, usuario_autorizo_id,
    accion, permiso_codigo, entidad_tipo, entidad_id, monto_mxn, motivo
  )
  SELECT v_tenant, (SELECT sucursal_id FROM cajas WHERE id = p_caja_id), p_caja_id, p_turno_id,
         p_usuario_solicitante_id, v_autorizador,
         p_accion, p_permiso_codigo, p_entidad_tipo, p_entidad_id, p_monto, p_motivo
  RETURNING id INTO v_autorizacion;

  INSERT INTO pin_intentos(tenant_id, usuario_id, caja_id, exitoso)
  VALUES (v_tenant, v_autorizador, p_caja_id, true);

  RETURN jsonb_build_object('ok', true, 'autorizacion_pin_id', v_autorizacion, 'autorizo_id', v_autorizador);
END;
$function$

;
