-- 0064 — Endurecimiento del PIN: coste de bcrypt (CN-010), anti-fuerza-bruta que no se evade
-- (CN-011) y jerarquía al resetear (CN-016).

-- ============================================================
-- CN-010 — coste de bcrypt: 6 (el default de pgcrypto) → 10
-- ============================================================
-- `gen_salt('bf')` sin argumento usa coste 6 = 64 iteraciones, muy por debajo del 10-12 habitual.
-- Con un espacio de 10^4–10^6 (PIN de 4 a 6 dígitos), un pin_hash filtrado se revierte en segundos.
--
-- POR QUÉ 10 Y NO 12. Medido sobre el Postgres embebido de la caja:
--
--     coste   1 verificación   scan de 10 empleados   scan de 25
--       6         4 ms              0.0 s               0.1 s
--      10        50 ms              0.5 s               1.2 s
--      12       197 ms              2.0 s               4.9 s
--
-- El scan importa porque verificar_autorizacion_pin no sabe QUIÉN autoriza: prueba el PIN contra
-- cada empleado del tenant hasta dar con uno. Con coste 12, autorizar un descuento tardaría 2 s en
-- un negocio de 10 empleados y casi 5 s en uno de 25 — en plena caja, con el cliente enfrente.
-- El 10 multiplica por 16 el trabajo del atacante y mantiene la autorización en medio segundo.
--
-- Y hay que decirlo claro: **ningún coste de bcrypt salva a un PIN de 4 dígitos** de un ataque
-- offline. Esto sube el listón; lo que de verdad protege es que el hash no se filtre (CN-001,
-- CN-006) y, si algún día importa de más, PINs más largos.
--
-- El coste va embebido en cada hash, así que los PIN viejos (coste 6) siguen verificando bien y se
-- rehashean solos conforme la gente los cambia. Para forzar la migración: resetear los PIN.

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
  VALUES (p_usuario_id, p_nombre, crypt(p_pin, gen_salt('bf', 10)), 'ACTIVO');
END;
$$;

CREATE OR REPLACE FUNCTION public.cambiar_pin_propio(p_pin_actual text, p_pin_nuevo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_hash text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NO_AUTENTICADO'; END IF;
  IF p_pin_nuevo !~ '^[0-9]{4,6}$' THEN RAISE EXCEPTION 'PIN_INVALIDO'; END IF;
  IF p_pin_actual = p_pin_nuevo THEN RAISE EXCEPTION 'PIN_IGUAL'; END IF;

  SELECT pin_hash INTO v_hash FROM public.usuarios_perfil WHERE id = v_uid AND deleted_at IS NULL;
  IF v_hash IS NULL THEN RAISE EXCEPTION 'SIN_PIN'; END IF;
  IF crypt(p_pin_actual, v_hash) <> v_hash THEN RAISE EXCEPTION 'PIN_ACTUAL_INCORRECTO'; END IF;

  UPDATE public.usuarios_perfil
     SET pin_hash = crypt(p_pin_nuevo, gen_salt('bf', 10)), updated_at = now()
   WHERE id = v_uid;
END;
$$;

-- ============================================================
-- CN-016 (+ CN-010, CN-002) — resetear_pin_empleado con jerarquía
-- ============================================================
-- La Edge Function resetear-pin comprobaba que el llamante fuera DUEÑO/ADMIN del tenant del
-- objetivo, pero no comparaba jerarquías: un ADMIN (4) podía resetear el PIN del DUEÑO (5),
-- ponerse el suyo y operar como dueño. El modelo ya tiene roles.jerarquia y la 0043 lo usa para
-- las autorizaciones por PIN; aquí se aplica el mismo criterio.
--
-- Consecuencia deliberada: nadie resetea el PIN de un DUEÑO desde la app (ni otro DUEÑO: se exige
-- jerarquía ESTRICTAMENTE mayor). Si un dueño olvida su PIN, se resuelve por soporte con
-- service_role. Es el comportamiento correcto para la cuenta que lo puede todo.
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

    IF coalesce(v_jer_llamante, 0) <= coalesce(v_jer_objetivo, 0) THEN
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

-- ============================================================
-- CN-011 — el anti-fuerza-bruta de la autorización ya no se evade
-- ============================================================
-- El contador de intentos fallidos se agrupaba por p_caja_id, y p_caja_id lo elige quien llama sin
-- que se valide nada: bastaba mandar un UUID distinto en cada intento para reiniciar el contador y
-- probar PINs sin límite.
--
-- Dos cambios:
--   1) La caja debe existir Y ser del tenant del solicitante. Ya no se pueden inventar cajas, así
--      que el atacante solo puede rotar entre las reales del negocio (típicamente 1-3).
--   2) Techo por TENANT (30 en 5 min) además del de caja (6). El de caja se mantiene porque es el
--      que da la UX razonable —un cajero que se equivoca no deja sin autorizaciones a las otras
--      sucursales—, y el de tenant acota el total aunque se roten todas las cajas.
--
-- Queda sin resolver por diseño (necesitaría cambiar la UX): la función no sabe QUIÉN autoriza, así
-- que prueba el PIN contra todos los que tengan el permiso. Con N supervisores, cada intento acierta
-- con probabilidad N/10^4, no 1/10^4. Si algún día importa, que la pantalla pida el usuario además
-- del PIN.
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
  v_fallidos_ten  integer;
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

  -- SEC CN-011 (1) — la caja tiene que ser real y del tenant. Antes no se validaba, y como el
  -- contador de abajo agrupa por caja, un UUID nuevo por intento reiniciaba el bloqueo.
  IF NOT EXISTS (SELECT 1 FROM cajas WHERE id = p_caja_id AND tenant_id = v_tenant) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'CAJA_INVALIDA');
  END IF;

  -- Anti-fuerza-bruta: 6 intentos fallidos por caja en 5 min -> bloqueo temporal
  SELECT count(*) INTO v_fallidos
    FROM pin_intentos
   WHERE caja_id = p_caja_id AND exitoso = false AND motivo_fallo = 'AUTORIZACION'
     AND fecha_intento > now() - interval '5 minutes';
  IF v_fallidos >= 6 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'BLOQUEADO');
  END IF;

  -- SEC CN-011 (2) — techo por tenant: acota el total aunque se roten todas las cajas del negocio.
  SELECT count(*) INTO v_fallidos_ten
    FROM pin_intentos
   WHERE tenant_id = v_tenant AND exitoso = false AND motivo_fallo = 'AUTORIZACION'
     AND fecha_intento > now() - interval '5 minutes';
  IF v_fallidos_ten >= 30 THEN
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
$function$;

-- ============================================================
-- Reafirmar los privilegios (CREATE OR REPLACE conserva la ACL, pero que quede explícito)
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
      JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public'
       AND p.proname IN ('resetear_pin_empleado','crear_perfil_con_pin','verificar_autorizacion_pin')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- cambiar_pin_propio SÍ la llama el cajero con su JWT (C2): mantiene authenticated.
REVOKE EXECUTE ON FUNCTION public.cambiar_pin_propio(text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cambiar_pin_propio(text, text) TO authenticated, service_role;
