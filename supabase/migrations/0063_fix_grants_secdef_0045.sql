-- 0063 — SEC CN-002: la migración 0045 reabrió a `authenticated` funciones SECURITY DEFINER
-- que 0006/0012/0014/0018 habían revocado A PROPÓSITO.
--
-- Qué pasó. 0045 quería sacar `anon` de la API, y para eso recorrió con un bucle TODAS las
-- funciones SECURITY DEFINER no-trigger de `public` aplicando:
--     REVOKE ... FROM PUBLIC, anon;  GRANT ... TO authenticated, service_role;
-- El GRANT es ciego: no distingue las funciones que la app sí llama firmada (reportes, propina,
-- autorización propia) de las que son EXCLUSIVAS de service_role. Como 0045 corre DESPUÉS de
-- 0006/0012/0014/0018, sus `REVOKE ... FROM authenticated` quedaron sin efecto.
--
-- Por qué es crítico. Estas cinco funciones NO validan al llamante por dentro: confían por
-- completo en el REVOKE. La peor es resetear_pin_empleado, cuyo cuerpo entero es un
-- `UPDATE usuarios_perfil SET pin_hash = ... WHERE id = p_usuario_id`, sin tenant ni rol ni
-- auth.uid(). Con el GRANT de 0045, cualquier empleado con su JWT normal podía:
--     POST /rest/v1/rpc/resetear_pin_empleado {"p_usuario_id":"<dueño>","p_pin_nuevo":"1234"}
-- y entrar como dueño — de su tenant o de cualquier otro, porque el id no está acotado.
--
-- Este arreglo hace dos cosas:
--   1) Vuelve a cerrar las cinco, con lista EXPLÍCITA (nunca más un bucle que otorgue a ciegas).
--   2) Defensa en profundidad en resetear_pin_empleado: aunque un GRANT futuro la reabra, la
--      función ya no obedece a un llamante que no sea admin del tenant del empleado objetivo.
--
-- Las funciones creadas DESPUÉS de 0045 (sync_pull_snapshot 0055, sync_push_snapshot 0056)
-- conservan su propio REVOKE y no estaban afectadas. Se verificó que el resto de SECURITY
-- DEFINER anteriores a 0045 (consumir_folio_cfdi, transicionar_estado_cocina_con_autorizacion,
-- registrar_autorizacion_propia, onboarding_actualizar_fase) sí deben ser llamables por
-- `authenticated`: son parte del flujo normal de la app.

-- ============================================================
-- 1) Defensa en profundidad: resetear_pin_empleado valida al llamante
-- ============================================================
-- auth.uid() distingue el origen sin romper a ningún llamante legítimo:
--   · Edge Function resetear-pin (service_role): el JWT no trae `sub` → NULL → pasa.
--   · Gateway del escritorio (pool como superusuario, sin GUC de PostgREST) → NULL → pasa.
--     (Hoy no la llama, pero que no se rompa si algún día lo hace.)
--   · Cliente con JWT de usuario vía PostgREST → uuid → se exige ser admin del tenant destino.
-- auth.uid() va calificado: el search_path de esta función no incluye el esquema `auth`.
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

  -- SEC CN-002 — llamada desde la API con identidad de usuario: exigir DUEÑO/ADMIN del tenant
  -- al que pertenece el empleado objetivo. Sin esto, el único control era el GRANT.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM usuarios_acceso ua
     WHERE ua.usuario_id = p_usuario_id
       AND es_admin_del_tenant(ua.tenant_id)
  ) THEN
    RAISE EXCEPTION 'SIN_PERMISO';
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
  'F4.3 — resetea PIN bcrypt y desbloquea cuenta. Solo Edge Function resetear-pin (service_role). '
  'SEC CN-002 (0063): si el llamante trae identidad de usuario, debe ser admin del tenant destino.';

-- ============================================================
-- 2) Volver a revocar de `authenticated` (lista explícita, sin bucle ciego)
-- ============================================================
-- Se revoca por oid::regprocedure para no depender de escribir la firma a mano (crear_tenant_con_owner
-- lleva 9 parámetros con DEFAULT, y verificar_autorizacion_pin 10) y para cubrir sobrecargas si
-- las hubiera. CREATE OR REPLACE conserva la ACL previa, así que este REVOKE va DESPUÉS del punto 1.
DO $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
      FROM pg_proc p
      JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public'
       AND p.proname IN (
             'resetear_pin_empleado',      -- 0014 · cambia el PIN de cualquier usuario
             'crear_perfil_con_pin',       -- 0014 · crea perfil con PIN elegido
             'crear_tenant_con_owner',     -- 0012 · alta de tenants
             'verificar_pin_login',        -- 0006 · fuerza bruta y bloqueo (DoS) de empleados
             'verificar_autorizacion_pin'  -- 0018/0043 · fuerza bruta de PIN de supervisor
           )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO service_role', r.sig);
    n := n + 1;
  END LOOP;

  IF n = 0 THEN
    RAISE EXCEPTION 'CN-002: no se encontró ninguna de las funciones a cerrar — revisa los nombres';
  END IF;
  RAISE NOTICE 'CN-002: % función(es) cerradas a authenticated/anon/PUBLIC', n;
END $$;

-- ============================================================
-- 3) Auto-verificación: la migración falla si alguna quedó abierta
-- ============================================================
-- Corre en cada `db reset` y en cada arranque de una caja nueva. Si un cambio futuro vuelve a
-- otorgar estos privilegios en masa, esto lo detiene aquí en vez de en producción.
DO $$
DECLARE abiertas text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.proname)
    INTO abiertas
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname IN ('resetear_pin_empleado','crear_perfil_con_pin','crear_tenant_con_owner',
                       'verificar_pin_login','verificar_autorizacion_pin')
     AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
       OR has_function_privilege('anon',          p.oid, 'EXECUTE'));

  IF abiertas IS NOT NULL THEN
    RAISE EXCEPTION 'CN-002: siguen ejecutables por anon/authenticated: %', abiertas;
  END IF;
END $$;
