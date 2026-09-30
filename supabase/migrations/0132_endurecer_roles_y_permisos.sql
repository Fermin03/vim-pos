-- 0132 · Endurecer roles y permisos: nadie se sube de rango desde su propia sesión
--
-- Auditoría integral 30/09/2026, equipo A ("escaladas de privilegio"). Todos los hallazgos se
-- reprodujeron en una base local con la sesión normal de un empleado (rol `authenticated` + su
-- JWT), exactamente como lo haría una petición directa a PostgREST con el token que la app ya le
-- da. El patrón común: las políticas RLS comprobaban el NEGOCIO pero no QUIÉN ni QUÉ COLUMNA, y el
-- GRANT de tabla completa a `authenticated` dejaba escribir cualquier columna.
--
--  A1 (CRÍTICO) `tenants`: `tenants_update_admin` (0015) + UPDATE de tabla completa. Un dueño o
--     administrador se quitaba la suspensión (`estado`, `bloqueo_desde`, `bloqueo_mensaje`,
--     `fecha_baja`, `motivo_baja`, `deleted_at`), se cambiaba de plan (`plan_actual_id`) y se
--     apropiaba del negocio (`usuario_dueno_id`). Arreglo: UPDATE solo de las columnas que edita
--     /admin (configuracion.ts: datos del negocio, logo y datos fiscales). La plataforma escribe
--     con service_role y no se ve afectada.
--
--  A2 (ALTO) `rol_permiso_overrides`, `permisos_personalizados` (0053) y `overrides_permisos`
--     (0004, sin uso en la app): las políticas de escritura solo miraban el tenant. Un cajero
--     borraba las restricciones que el dueño le puso a su rol, o se daba permisos. Arreglo:
--     escribir exige ser DUEÑO/ADMIN del negocio (lo mismo que pide /configuracion), nunca sobre
--     el rol DUEÑO, las restricciones del rol ADMIN solo las toca un DUEÑO (si no, el admin se
--     devolvía lo que el dueño le quitó) y nadie se edita sus propios permisos personalizados.
--
--  A3 (ALTO) `usuarios_acceso` (acceso_update_admin, 0014) y `usuarios_perfil`
--     (usuarios_perfil_update_admin / _update_propio): un ADMIN se promovía a DUEÑO, desactivaba
--     al dueño o re-vinculaba `usuario_id` a una cuenta de OTRO negocio (el hook de acceso le
--     emitía entonces el tenant equivocado) y sobrescribía `pin_hash`; cualquier empleado se
--     reseteaba `intentos_pin_fallidos` / `bloqueado_hasta`, se reactivaba (`estado`) o se ponía
--     el PIN que quisiera saltándose `cambiar_pin_propio`. Arreglo: UPDATE por columna + triggers
--     que impiden, salvo a service_role o a un DUEÑO del mismo negocio, asignar el rol DUEÑO o
--     tocar el acceso/perfil de un DUEÑO, y a cualquiera mover `usuario_id` / `tenant_id`.
--
--  A4 (ALTO) `usuarios_perfil_mismo_tenant`: todo empleado LEÍA el `pin_hash` de todo el equipo.
--     bcrypt de un PIN de 4-6 dígitos se revierte offline en segundos (0064 lo dice: lo que
--     protege es que el hash no salga). Arreglo: SELECT por columna, sin `pin_hash`. Nadie en
--     apps/ lo pide (se revisaron todos los `.from("usuarios_perfil")`, sin `select("*")` ni
--     embebidos); las RPC que lo leen son SECURITY DEFINER y el trigger de auditoría lo lee de
--     NEW/OLD, que no pasa por privilegios de columna.
--     OJO ESCRITORIO: desktop/src/runtime.mjs hace al arrancar `GRANT SELECT, INSERT, UPDATE,
--     DELETE ON ALL TABLES ... TO authenticated` (y SELECT a anon), lo que en la caja local
--     DESHACE A1, A3 y A4. Lo corrige otro equipo de la misma auditoría (D).
--
--  A5 (ALTO) `consumir_folio_cfdi` (0002, SECURITY DEFINER, EXECUTE a authenticated) confiaba en
--     `p_tenant_id`: un cajero de A quemaba los folios PAGADOS de B. Se exige por dentro que, con
--     JWT de usuario, el negocio sea el del JWT y el llamante DUEÑO/ADMIN ahí (lo mismo que
--     timbrar-cfdi / timbrar-global exigen antes de timbrar). Complementa a la 0135, que además
--     revoca EXECUTE a authenticated: si ese GRANT vuelve algún día, el hueco sigue cerrado.
--
--  A6 (ALTO) `transicionar_estado_cocina_con_autorizacion` (0008): SECURITY DEFINER, sin chequeo
--     de tenant ni de la autorización que recibe, y pone `session_replication_role = replica`
--     (apaga triggers y FKs). Nadie la llama (apps/, desktop/, functions/, SQL): se revoca.
--
--  A7 (MEDIO) `verificar_autorizacion_pin` (0064) y `registrar_autorizacion_propia` (0018)
--     leían `rol_permisos` directo e ignoraban `rol_permiso_overrides` y `permisos_personalizados`:
--     la restricción que el dueño ponía en /configuracion/roles no tenía efecto en la caja. Ahora
--     usan la misma regla que `usuario_tiene_permiso`. Además, fuerza bruta: `SIN_PERMISO`
--     confirmaba que el PIN probado ERA de alguien del equipo; ahora responde `PIN_INCORRECTO`
--     igual que un PIN inexistente, y los fallos también se cuentan por SOLICITANTE (6 en 5 min o
--     20 en una hora → BLOQUEADO), no solo por caja y por negocio.
--
--  A8 (INFO) Oráculos: `usuario_tiene_permiso(uuid, …)` contestaba por usuarios de cualquier
--     negocio → con JWT de usuario solo mira el negocio del JWT. `ticket_autofacturable` y
--     `tenant_addon_activo` eran ejecutables por anon (y authenticated); solo las llaman la Edge
--     Function autofacturar (service_role) y `modulos_efectivos` (SECURITY DEFINER): se revocan.
--
-- Criterio "llamante de confianza" en todo el archivo: sin JWT (sesión directa a la base:
-- migraciones, semillas, sync del escritorio) o JWT de service_role. Mismo criterio que 0103.

-- ============================================================================
-- Helpers
-- ============================================================================

CREATE OR REPLACE FUNCTION public._es_llamada_de_confianza()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT auth.jwt() IS NULL OR (auth.jwt() ->> 'role') = 'service_role';
$$;
COMMENT ON FUNCTION public._es_llamada_de_confianza IS
  'TRUE sin JWT (sesión directa a la base) o con service_role. Ver 0132.';
REVOKE EXECUTE ON FUNCTION public._es_llamada_de_confianza() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public._es_llamada_de_confianza() TO authenticated, service_role;

-- Gemelo de es_admin_del_tenant (0014) solo para DUEÑO.
CREATE OR REPLACE FUNCTION public.es_dueno_del_tenant(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.usuarios_acceso ua
      JOIN public.roles r ON r.id = ua.rol_id
     WHERE ua.usuario_id = auth.uid()
       AND ua.tenant_id  = p_tenant_id
       AND ua.activo     = true
       AND r.codigo      = 'DUENO'
       AND r.es_sistema  = true
  );
$$;
REVOKE EXECUTE ON FUNCTION public.es_dueno_del_tenant(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.es_dueno_del_tenant(uuid) TO authenticated, service_role;

-- ¿El usuario tiene este permiso EN ESTE negocio? Una sola regla para todos (A7/A8):
--   · rol PERSONALIZADO → solo lo que diga permisos_personalizados (D72);
--   · cualquier otro rol → rol_permisos concedido y sin override restrictivo del negocio (D71).
-- Vale cualquier acceso activo del usuario en el negocio (multi-rol, D70). `p_jerarquia_minima`
-- es para la autorización por PIN (permisos.jerarquia_minima_pin).
-- Interna: sin EXECUTE para anon/authenticated (preguntaría por cualquier usuario y negocio).
CREATE OR REPLACE FUNCTION public.usuario_tiene_permiso_en_tenant(
  p_usuario_id       uuid,
  p_tenant_id        uuid,
  p_permiso_codigo   varchar,
  p_jerarquia_minima integer DEFAULT NULL
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM usuarios_acceso ua
      JOIN roles r    ON r.id = ua.rol_id
      JOIN permisos p ON p.codigo = p_permiso_codigo
     WHERE ua.usuario_id = p_usuario_id
       AND ua.tenant_id  = p_tenant_id
       AND ua.activo     = true
       AND (p_jerarquia_minima IS NULL OR r.jerarquia >= p_jerarquia_minima)
       AND CASE
             WHEN r.codigo = 'PERSONALIZADO' THEN EXISTS (
               SELECT 1 FROM permisos_personalizados pp
                WHERE pp.tenant_id = p_tenant_id AND pp.usuario_id = p_usuario_id AND pp.permiso_id = p.id)
             ELSE EXISTS (
               SELECT 1 FROM rol_permisos rp
                WHERE rp.rol_id = r.id AND rp.permiso_id = p.id AND rp.concedido = true)
               AND NOT EXISTS (
               SELECT 1 FROM rol_permiso_overrides o
                WHERE o.tenant_id = p_tenant_id AND o.rol_id = r.id AND o.permiso_id = p.id)
           END
  );
$$;
REVOKE EXECUTE ON FUNCTION public.usuario_tiene_permiso_en_tenant(uuid, uuid, varchar, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.usuario_tiene_permiso_en_tenant(uuid, uuid, varchar, integer) TO service_role;

-- ============================================================================
-- A8 · usuario_tiene_permiso: con JWT de usuario solo responde por el negocio del JWT
-- ============================================================================
CREATE OR REPLACE FUNCTION public.usuario_tiene_permiso(p_usuario_id uuid, p_permiso_codigo varchar)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  IF public._es_llamada_de_confianza() THEN
    -- Comportamiento previo: el negocio donde el usuario tiene su rol más alto.
    SELECT ua.tenant_id INTO v_tenant
      FROM usuarios_acceso ua JOIN roles r ON r.id = ua.rol_id
     WHERE ua.usuario_id = p_usuario_id AND ua.activo = true
     ORDER BY r.jerarquia DESC
     LIMIT 1;
  ELSE
    v_tenant := current_tenant_id();
  END IF;
  IF v_tenant IS NULL THEN RETURN false; END IF;
  RETURN public.usuario_tiene_permiso_en_tenant(p_usuario_id, v_tenant, p_permiso_codigo);
END $$;

-- ============================================================================
-- A1 · tenants: UPDATE solo de lo que edita /admin
-- ============================================================================
REVOKE UPDATE ON public.tenants FROM anon, authenticated;
GRANT UPDATE (
  nombre_comercial, codigo, timezone, hora_cierre_dia_contable,   -- actualizarNegocio
  logo_url,                                                        -- guardarLogoNegocio
  rfc, razon_social, regimen_fiscal, codigo_postal_fiscal, email_fiscal  -- actualizarDatosFiscales
) ON public.tenants TO authenticated;

-- ============================================================================
-- A4 · usuarios_perfil: nadie lee pin_hash por la API
-- ============================================================================
REVOKE SELECT, UPDATE ON public.usuarios_perfil FROM anon, authenticated;
GRANT SELECT (
  id, nombre, apellido_paterno, apellido_materno, telefono, foto_url, estado,
  bloqueado_hasta, intentos_pin_fallidos, fecha_ultimo_login_pin, fecha_ultimo_login_web,
  created_at, updated_at, deleted_at
) ON public.usuarios_perfil TO authenticated;

-- A3 · usuarios_perfil: solo datos personales y `estado` (setActivo). NUNCA pin_hash (va por
-- cambiar_pin_propio / resetear_pin_empleado) ni el contador/bloqueo de PIN.
GRANT UPDATE (nombre, apellido_paterno, apellido_materno, telefono, foto_url, estado)
  ON public.usuarios_perfil TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_usuarios_perfil_proteger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public._es_llamada_de_confianza() THEN RETURN NEW; END IF;

  -- Un DUEÑO (en cualquier negocio) solo lo toca él mismo o un DUEÑO de ese negocio.
  IF NEW.id IS DISTINCT FROM auth.uid() AND EXISTS (
       SELECT 1 FROM usuarios_acceso ua JOIN roles r ON r.id = ua.rol_id
        WHERE ua.usuario_id = OLD.id AND ua.activo = true
          AND r.codigo = 'DUENO' AND r.es_sistema = true
          AND NOT public.es_dueno_del_tenant(ua.tenant_id)) THEN
    RAISE EXCEPTION 'Solo un dueño puede modificar el perfil de un dueño'
      USING ERRCODE = '42501';
  END IF;

  -- `estado` (ACTIVO / BLOQUEADO_* / DESACTIVADO) lo decide un DUEÑO/ADMIN, no el propio empleado:
  -- si no, un bloqueado o dado de baja se reactivaba solo con la política _update_propio.
  IF NEW.estado IS DISTINCT FROM OLD.estado AND NOT EXISTS (
       SELECT 1 FROM usuarios_acceso ua
        WHERE ua.usuario_id = OLD.id AND public.es_admin_del_tenant(ua.tenant_id)) THEN
    RAISE EXCEPTION 'Solo un dueño o administrador puede cambiar el estado de un usuario'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.trg_usuarios_perfil_proteger() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_usuarios_perfil_proteger
  BEFORE UPDATE ON public.usuarios_perfil
  FOR EACH ROW EXECUTE FUNCTION public.trg_usuarios_perfil_proteger();

-- ============================================================================
-- A3 · usuarios_acceso: columnas de gestión + nadie asigna/toca DUEÑO salvo un DUEÑO
-- ============================================================================
REVOKE UPDATE ON public.usuarios_acceso FROM anon, authenticated;
GRANT UPDATE (activo, rol_id, sucursal_id, subtipo_personal_id, fecha_fin, notas)
  ON public.usuarios_acceso TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_usuarios_acceso_proteger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rol_viejo roles%ROWTYPE;
  v_rol_nuevo roles%ROWTYPE;
BEGIN
  IF public._es_llamada_de_confianza() THEN RETURN NEW; END IF;

  -- El GRANT por columna ya lo impide; se repite aquí por si algún día una RPC SECURITY DEFINER
  -- escribe en esta tabla con el JWT del usuario. Re-vincular usuario_id = darle a otra cuenta
  -- (de otro negocio) el acceso y el tenant de este.
  IF NEW.usuario_id IS DISTINCT FROM OLD.usuario_id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'No se puede cambiar el usuario ni el negocio de un acceso'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_rol_viejo FROM roles WHERE id = OLD.rol_id;
  SELECT * INTO v_rol_nuevo FROM roles WHERE id = NEW.rol_id;

  -- El rol tiene que ser del sistema o de ESTE negocio.
  IF NOT (v_rol_nuevo.es_sistema OR v_rol_nuevo.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'Rol de otro negocio' USING ERRCODE = '42501';
  END IF;
  IF NEW.sucursal_id IS DISTINCT FROM OLD.sucursal_id AND NEW.sucursal_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM sucursales s WHERE s.id = NEW.sucursal_id AND s.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'Sucursal de otro negocio' USING ERRCODE = '42501';
  END IF;
  IF NEW.subtipo_personal_id IS DISTINCT FROM OLD.subtipo_personal_id AND NEW.subtipo_personal_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM subtipos_personal sp WHERE sp.id = NEW.subtipo_personal_id AND sp.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'Subtipo de personal de otro negocio' USING ERRCODE = '42501';
  END IF;

  -- DUEÑO: ni se asigna ni se modifica (desactivar, degradar) si no lo hace un DUEÑO de este
  -- negocio. Un ADMIN ya no se promueve ni aparta al dueño.
  IF (v_rol_viejo.codigo = 'DUENO' OR v_rol_nuevo.codigo = 'DUENO')
     AND NOT public.es_dueno_del_tenant(OLD.tenant_id) THEN
    RAISE EXCEPTION 'Solo un dueño puede asignar el rol de dueño o modificar el acceso de un dueño'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.trg_usuarios_acceso_proteger() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_usuarios_acceso_proteger
  BEFORE UPDATE ON public.usuarios_acceso
  FOR EACH ROW EXECUTE FUNCTION public.trg_usuarios_acceso_proteger();

-- ============================================================================
-- A2 · overrides y permisos personalizados: solo DUEÑO/ADMIN, nunca sobre DUEÑO
-- ============================================================================

-- ¿Puede el llamante quitar/restaurar permisos de este rol en este negocio?
--   · DUEÑO/ADMIN del negocio;
--   · nunca el rol DUEÑO (no hay override que valga contra el dueño);
--   · el rol ADMIN solo lo restringe/restaura un DUEÑO: si no, el admin se devolvía a sí mismo
--     lo que el dueño le quitó;
--   · el rol tiene que ser del sistema o de este negocio.
CREATE OR REPLACE FUNCTION public.puede_administrar_permisos_de_rol(p_tenant_id uuid, p_rol_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_tenant_id = current_tenant_id()
     AND public.es_admin_del_tenant(p_tenant_id)
     AND EXISTS (
       SELECT 1 FROM roles r
        WHERE r.id = p_rol_id
          AND (r.es_sistema OR r.tenant_id = p_tenant_id)
          AND r.codigo <> 'DUENO'
          AND (r.codigo <> 'ADMIN' OR public.es_dueno_del_tenant(p_tenant_id))
     );
$$;
REVOKE EXECUTE ON FUNCTION public.puede_administrar_permisos_de_rol(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.puede_administrar_permisos_de_rol(uuid, uuid) TO authenticated, service_role;

-- ¿Puede el llamante editar los permisos personalizados de este usuario?
--   · DUEÑO/ADMIN del negocio, el usuario es de ese negocio, no es DUEÑO ahí, y no es uno mismo
--     (salvo que quien edita sea DUEÑO).
CREATE OR REPLACE FUNCTION public.puede_administrar_permisos_de_usuario(p_tenant_id uuid, p_usuario_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_tenant_id = current_tenant_id()
     AND public.es_admin_del_tenant(p_tenant_id)
     AND EXISTS (SELECT 1 FROM usuarios_acceso ua
                  WHERE ua.usuario_id = p_usuario_id AND ua.tenant_id = p_tenant_id)
     AND NOT EXISTS (SELECT 1 FROM usuarios_acceso ua JOIN roles r ON r.id = ua.rol_id
                      WHERE ua.usuario_id = p_usuario_id AND ua.tenant_id = p_tenant_id
                        AND ua.activo = true AND r.codigo = 'DUENO')
     AND (p_usuario_id IS DISTINCT FROM auth.uid() OR public.es_dueno_del_tenant(p_tenant_id));
$$;
REVOKE EXECUTE ON FUNCTION public.puede_administrar_permisos_de_usuario(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.puede_administrar_permisos_de_usuario(uuid, uuid) TO authenticated, service_role;

-- rol_permiso_overrides (0053). La lectura sigue abierta al negocio: la caja y el panel la usan.
DROP POLICY IF EXISTS rpo_insert ON public.rol_permiso_overrides;
DROP POLICY IF EXISTS rpo_delete ON public.rol_permiso_overrides;
CREATE POLICY rpo_insert ON public.rol_permiso_overrides FOR INSERT TO authenticated
  WITH CHECK (public.puede_administrar_permisos_de_rol(tenant_id, rol_id));
CREATE POLICY rpo_delete ON public.rol_permiso_overrides FOR DELETE TO authenticated
  USING (public.puede_administrar_permisos_de_rol(tenant_id, rol_id));

-- permisos_personalizados (0053).
DROP POLICY IF EXISTS pp_insert ON public.permisos_personalizados;
DROP POLICY IF EXISTS pp_delete ON public.permisos_personalizados;
CREATE POLICY pp_insert ON public.permisos_personalizados FOR INSERT TO authenticated
  WITH CHECK (public.puede_administrar_permisos_de_usuario(tenant_id, usuario_id));
CREATE POLICY pp_delete ON public.permisos_personalizados FOR DELETE TO authenticated
  USING (public.puede_administrar_permisos_de_usuario(tenant_id, usuario_id));

-- overrides_permisos (0004): tabla del diseño original que la app no usa (lo hace
-- rol_permiso_overrides). Su política FOR ALL dejaba a cualquiera del negocio escribirla; se
-- parte en lectura por negocio y escritura con la misma regla que rol_permiso_overrides.
DROP POLICY IF EXISTS overrides_tenant ON public.overrides_permisos;
CREATE POLICY overrides_select ON public.overrides_permisos FOR SELECT
  USING (tenant_id = current_tenant_id());
CREATE POLICY overrides_insert ON public.overrides_permisos FOR INSERT TO authenticated
  WITH CHECK (public.puede_administrar_permisos_de_rol(tenant_id, rol_id));
CREATE POLICY overrides_update ON public.overrides_permisos FOR UPDATE TO authenticated
  USING (public.puede_administrar_permisos_de_rol(tenant_id, rol_id))
  WITH CHECK (public.puede_administrar_permisos_de_rol(tenant_id, rol_id));
CREATE POLICY overrides_delete ON public.overrides_permisos FOR DELETE TO authenticated
  USING (public.puede_administrar_permisos_de_rol(tenant_id, rol_id));

-- ============================================================================
-- A5 · consumir_folio_cfdi: solo sobre el negocio propio y siendo DUEÑO/ADMIN
-- ============================================================================
CREATE OR REPLACE FUNCTION public.consumir_folio_cfdi(p_tenant_id uuid, p_cfdi_id uuid, p_es_global boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_saldo      tenant_folios_saldo%ROWTYPE;
  v_periodo    date := date_trunc('month', (now() AT TIME ZONE 'America/Mexico_City'))::date;
  v_fuente     text;
BEGIN
  -- 0132 (A5): con JWT de usuario, solo el negocio del JWT y solo DUEÑO/ADMIN (los mismos que
  -- timbrar-cfdi / timbrar-global dejan timbrar). Antes cualquier empleado quemaba folios ajenos.
  IF NOT public._es_llamada_de_confianza()
     AND (p_tenant_id IS DISTINCT FROM current_tenant_id() OR NOT public.es_admin_del_tenant(p_tenant_id)) THEN
    RAISE EXCEPTION 'SIN_PERMISO: solo el dueño o administrador del negocio consume sus folios'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_saldo FROM tenant_folios_saldo WHERE tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant % sin fila de saldo de folios', p_tenant_id;
  END IF;

  -- Reset de base mensual si cambió el periodo (no acumulable)
  IF v_saldo.periodo_actual < v_periodo THEN
    UPDATE tenant_folios_saldo
       SET folios_base_consumidos = 0, periodo_actual = v_periodo, updated_at = now()
     WHERE tenant_id = p_tenant_id;
    INSERT INTO folios_movimientos(tenant_id, tipo, cantidad, saldo_paquetes_resultante, dia_contable)
    VALUES (p_tenant_id, 'BASE_RESET', v_saldo.folios_base_mensuales, v_saldo.saldo_paquetes, v_periodo);
    v_saldo.folios_base_consumidos := 0;
  END IF;

  -- 1) Consumir de la base mensual si queda
  IF v_saldo.folios_base_consumidos < v_saldo.folios_base_mensuales THEN
    UPDATE tenant_folios_saldo
       SET folios_base_consumidos = folios_base_consumidos + 1, updated_at = now()
     WHERE tenant_id = p_tenant_id;
    INSERT INTO folios_movimientos(tenant_id, tipo, cantidad, cfdi_id, saldo_paquetes_resultante, dia_contable)
    VALUES (p_tenant_id, 'CONSUMO_BASE', -1, p_cfdi_id, v_saldo.saldo_paquetes, CURRENT_DATE);
    v_fuente := 'BASE';

  -- 2) Si no, consumir del saldo de paquetes
  ELSIF v_saldo.saldo_paquetes > 0 THEN
    UPDATE tenant_folios_saldo
       SET saldo_paquetes = saldo_paquetes - 1, updated_at = now()
     WHERE tenant_id = p_tenant_id;
    INSERT INTO folios_movimientos(tenant_id, tipo, cantidad, cfdi_id, saldo_paquetes_resultante, dia_contable)
    VALUES (p_tenant_id, 'CONSUMO_PAQUETE', -1, p_cfdi_id, v_saldo.saldo_paquetes - 1, CURRENT_DATE);
    v_fuente := 'PAQUETE';

  -- 3) Sin folios: la factura global se permite igual (cumplimiento SAT no se bloquea);
  --    el timbrado individual sí se bloquea y la UI obliga a comprar paquete.
  ELSE
    IF p_es_global THEN
      INSERT INTO folios_movimientos(tenant_id, tipo, cantidad, cfdi_id, saldo_paquetes_resultante, dia_contable)
      VALUES (p_tenant_id, 'CONSUMO_PAQUETE', -1, p_cfdi_id, -1, CURRENT_DATE);  -- saldo negativo tolerado solo para global
      v_fuente := 'GLOBAL_TOLERADO';
    ELSE
      RETURN jsonb_build_object('ok', false, 'motivo', 'SIN_FOLIOS',
        'mensaje', 'Sin folios disponibles. Compra un paquete para seguir facturando.');
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'fuente', v_fuente);
END;
$function$;
-- Los privilegios no se tocan aquí (CREATE OR REPLACE conserva el ACL). La 0135 de esta misma
-- auditoría pasa las Edge Functions a service_role y revoca EXECUTE a authenticated; este chequeo
-- queda como segunda barrera por si algún día se vuelve a otorgar.

-- ============================================================================
-- A6 · transicionar_estado_cocina_con_autorizacion: nadie la llama → fuera de la API
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.transicionar_estado_cocina_con_autorizacion(uuid, ticket_estado_cocina, uuid, text)
  FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- A7 · verificar_autorizacion_pin: respeta overrides, no delata PINs, límite por solicitante
-- ============================================================================
-- Contrato de respuesta igual ({ok, motivo} / {ok, autorizacion_pin_id, autorizo_id}); lo único
-- que cambia es que ya no sale 'SIN_PERMISO': un PIN válido sin el permiso responde
-- 'PIN_INCORRECTO', como uno que no existe.
CREATE OR REPLACE FUNCTION public.verificar_autorizacion_pin(
  p_pin text, p_accion text, p_permiso_codigo text, p_entidad_tipo text, p_entidad_id uuid,
  p_monto numeric, p_motivo text, p_caja_id uuid, p_turno_id uuid, p_usuario_solicitante_id uuid)
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
  v_fallidos_sol  integer;
  v_fallidos_hora integer;
  v_jerarquia_min integer;
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

  -- SEC CN-011 (1) — la caja tiene que ser real y del tenant.
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

  -- SEC CN-011 (2) — techo por tenant.
  SELECT count(*) INTO v_fallidos_ten
    FROM pin_intentos
   WHERE tenant_id = v_tenant AND exitoso = false AND motivo_fallo = 'AUTORIZACION'
     AND fecha_intento > now() - interval '5 minutes';
  IF v_fallidos_ten >= 30 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'BLOQUEADO');
  END IF;

  -- 0132 (A7) — techo por SOLICITANTE, en ventana corta y en ventana larga. Los fallos de
  -- autorización se registran con usuario_id = solicitante (antes iba NULL).
  SELECT count(*) FILTER (WHERE fecha_intento > now() - interval '5 minutes'),
         count(*)
    INTO v_fallidos_sol, v_fallidos_hora
    FROM pin_intentos
   WHERE usuario_id = p_usuario_solicitante_id AND exitoso = false AND motivo_fallo = 'AUTORIZACION'
     AND fecha_intento > now() - interval '1 hour';
  IF v_fallidos_sol >= 6 OR v_fallidos_hora >= 20 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'BLOQUEADO');
  END IF;

  SELECT jerarquia_minima_pin INTO v_jerarquia_min FROM permisos WHERE codigo = p_permiso_codigo;

  -- Buscar autorizador: usuario del tenant cuyo PIN coincide Y que tiene el permiso con la regla
  -- completa (overrides del negocio y permisos personalizados incluidos).
  SELECT up.id INTO v_autorizador
    FROM usuarios_perfil up
   WHERE up.pin_hash IS NOT NULL
     AND up.estado = 'ACTIVO'
     AND EXISTS (SELECT 1 FROM usuarios_acceso ua
                  WHERE ua.usuario_id = up.id AND ua.tenant_id = v_tenant AND ua.activo = true)
     AND crypt(p_pin, up.pin_hash) = up.pin_hash
     AND public.usuario_tiene_permiso_en_tenant(up.id, v_tenant, p_permiso_codigo, v_jerarquia_min)
   LIMIT 1;

  IF v_autorizador IS NULL THEN
    INSERT INTO pin_intentos(tenant_id, usuario_id, caja_id, exitoso, motivo_fallo)
    VALUES (v_tenant, p_usuario_solicitante_id, p_caja_id, false, 'AUTORIZACION');
    -- Antes: 'SIN_PERMISO' si el PIN era de alguien sin el permiso. Eso confirmaba al atacante
    -- que había dado con un PIN real del equipo. Misma respuesta en los dos casos.
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
REVOKE EXECUTE ON FUNCTION public.verificar_autorizacion_pin(text, text, text, text, uuid, numeric, text, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.verificar_autorizacion_pin(text, text, text, text, uuid, numeric, text, uuid, uuid, uuid)
  TO service_role;

-- registrar_autorizacion_propia (0018): misma regla de permisos, en el negocio del JWT.
CREATE OR REPLACE FUNCTION public.registrar_autorizacion_propia(
  p_accion text, p_permiso_codigo text, p_entidad_tipo text, p_entidad_id uuid,
  p_monto numeric, p_motivo text, p_caja_id uuid, p_turno_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_tenant uuid;
  v_id     uuid;
BEGIN
  -- El negocio del JWT si el usuario tiene acceso activo ahí; si no (token sin claim), el primero.
  SELECT tenant_id INTO v_tenant
    FROM usuarios_acceso
   WHERE usuario_id = v_uid AND activo = true
   ORDER BY (tenant_id = current_tenant_id()) DESC NULLS LAST
   LIMIT 1;
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'SIN_TENANT');
  END IF;

  IF NOT public.usuario_tiene_permiso_en_tenant(v_uid, v_tenant, p_permiso_codigo) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'SIN_PERMISO');
  END IF;

  INSERT INTO autorizaciones_pin(
    tenant_id, sucursal_id, caja_id, turno_id,
    usuario_solicitante_id, usuario_autorizo_id,
    accion, permiso_codigo, entidad_tipo, entidad_id, monto_mxn, motivo
  )
  SELECT v_tenant, (SELECT sucursal_id FROM cajas WHERE id = p_caja_id), p_caja_id, p_turno_id,
         v_uid, v_uid, p_accion, p_permiso_codigo, p_entidad_tipo, p_entidad_id, p_monto, p_motivo
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'autorizacion_pin_id', v_id);
END;
$function$;

-- ============================================================================
-- A8 · oráculos ejecutables por anon
-- ============================================================================
-- Solo las llaman autofacturar (service_role) y modulos_efectivos (SECURITY DEFINER, corre como
-- su dueño). Un anónimo podía preguntar si un ticket cualquiera es facturable o qué add-ons tiene
-- cualquier negocio.
REVOKE EXECUTE ON FUNCTION public.ticket_autofacturable(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ticket_autofacturable(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.tenant_addon_activo(uuid, varchar) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.tenant_addon_activo(uuid, varchar) TO service_role;
