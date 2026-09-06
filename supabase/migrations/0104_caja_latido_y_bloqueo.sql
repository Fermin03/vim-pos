-- ============================================================================
-- 0104 — Latido de la caja y directivas (ADR 0014, entrega 2).
--
-- La 0103 dejó al panel decidiendo cosas que nadie obedecía: suspender escribía una fecha y la
-- caja seguía vendiendo igual. Aquí nace el canal: la caja llama cada 10 minutos, sella que está
-- viva y recibe un paquete de DIRECTIVAS ya resuelto en la nube. La caja no interpreta nada, y
-- por eso dos versiones distintas del escritorio no pueden entender distinto una suspensión.
--
-- El latido resuelve además el hueco que la 0073 dejó escrito: `cajas.ultima_conexion` solo se
-- sella cuando hay ventas que subir, así que una caja encendida en un día flojo envejecía en el
-- panel hasta parecer caída. `ultimo_latido` prueba que está encendida aunque no venda.
--
-- Diseño: docs/superpowers/specs/2026-09-04-platform-centro-de-control-design.md §6.
-- ============================================================================

ALTER TABLE cajas
  ADD COLUMN ultimo_latido timestamptz NULL,
  ADD COLUMN version_app   text NULL,
  ADD COLUMN so            text NULL;
COMMENT ON COLUMN cajas.ultimo_latido IS
  'Última vez que la caja llamó a caja_latido(). Prueba que está encendida aunque no venda (a diferencia de ultima_conexion).';
COMMENT ON COLUMN cajas.version_app IS 'Versión del escritorio que reportó la caja. NULL = anterior a 0.4.58.';
COMMENT ON COLUMN cajas.so IS 'Sistema operativo reportado, para soporte.';

-- ── Directivas: todo lo que la caja debe obedecer, resuelto aquí ────────────
-- `bloqueado` exige estado Y fecha cumplida: una suspensión sin fecha no bloquea, y durante la
-- gracia la caja sigue vendiendo con aviso. INTERNO y TRIAL nunca bloquean (§6.2).
CREATE OR REPLACE FUNCTION resolver_directivas(p_tenant uuid, p_caja uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_estado    text;
  v_desde     timestamptz;
  v_mensaje   text;
  v_bloqueado boolean;
BEGIN
  IF p_tenant IS NULL THEN RETURN NULL; END IF;
  SELECT t.estado::text, t.bloqueo_desde, t.bloqueo_mensaje
    INTO v_estado, v_desde, v_mensaje
    FROM tenants t WHERE t.id = p_tenant AND t.deleted_at IS NULL;
  IF v_estado IS NULL THEN RETURN NULL; END IF;

  v_bloqueado := v_estado IN ('SUSPENDIDO', 'CANCELADO')
                 AND v_desde IS NOT NULL
                 AND v_desde <= now();

  RETURN jsonb_build_object(
    'servidor_hora', to_jsonb(now()),
    'acceso', jsonb_build_object(
      'estado',        v_estado,
      'bloqueado',     v_bloqueado,
      'bloquea_desde', v_desde,
      'mensaje',       v_mensaje),
    -- Solo los EFECTIVOS: a la caja no le sirve saber qué está permitido pero apagado.
    'modulos', COALESCE(modulos_efectivos(p_tenant) -> 'efectivos', '{}'::jsonb),
    -- Solo los números efectivos. Se quitan `del_plan` y `excepcion` porque esta última lleva
    -- `motivo`: texto que escribe VIM en `tenant_limites` —una tabla con RLS y sin políticas,
    -- deliberadamente interna— y que acabaría en un archivo del disco del cliente y en
    -- `/__directivas`, accesible sin autenticar desde la red del restaurante. El panel sigue
    -- viendo el desglose porque llama a `limites_efectivos` por su cuenta.
    'limites', COALESCE(limites_efectivos(p_tenant) - 'del_plan' - 'excepcion', '{}'::jsonb),
    'avisos',  '[]'::jsonb,   -- entrega 3
    'version', '{}'::jsonb    -- entrega 4
  );
END;
$$;
COMMENT ON FUNCTION resolver_directivas(uuid, uuid) IS
  'Paquete que la caja obedece: acceso (con gracia), módulos efectivos, límites, avisos y versión (ADR 0014).';
REVOKE EXECUTE ON FUNCTION resolver_directivas(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION resolver_directivas(uuid, uuid) TO service_role;

-- ── Latido ──────────────────────────────────────────────────────────────────
-- Solo la Edge Function la llama, con el caja_id sacado del JWT del dispositivo. Los textos se
-- recortan aquí además de validarse en la función: la base es la última línea de defensa.
CREATE OR REPLACE FUNCTION caja_latido(
  p_caja uuid, p_version text DEFAULT NULL, p_so text DEFAULT NULL, p_ip inet DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_tenant uuid;
BEGIN
  UPDATE cajas
     SET ultimo_latido = now(),
         version_app   = COALESCE(left(p_version, 20), version_app),
         so            = COALESCE(left(p_so, 80), so),
         ultima_ip     = COALESCE(p_ip, ultima_ip)
   WHERE id = p_caja AND deleted_at IS NULL
   RETURNING tenant_id INTO v_tenant;
  IF v_tenant IS NULL THEN RETURN NULL; END IF;
  RETURN resolver_directivas(v_tenant, p_caja);
END;
$$;
COMMENT ON FUNCTION caja_latido(uuid, text, text, inet) IS
  'Sella que la caja está viva, guarda su versión y devuelve sus directivas (ADR 0014).';
REVOKE EXECUTE ON FUNCTION caja_latido(uuid, text, text, inet) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION caja_latido(uuid, text, text, inet) TO service_role;

-- ── Las mismas directivas para el POS web y el admin, bajo RLS ──────────────
-- No lleva caja, así que no sella nada: es solo lectura del propio tenant.
CREATE OR REPLACE FUNCTION mi_acceso()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT resolver_directivas(current_tenant_id(), NULL); $$;
COMMENT ON FUNCTION mi_acceso() IS
  'Directivas del tenant de la sesión. Lo llaman el POS web y el admin del dueño (ADR 0014).';
REVOKE EXECUTE ON FUNCTION mi_acceso() FROM public, anon;
GRANT EXECUTE ON FUNCTION mi_acceso() TO authenticated, service_role;

-- ── Límite de sucursales, con el mismo criterio que el de cajas (0103) ──────
-- Cubre INSERT y el UPDATE de las columnas que cambian el conteo, porque la política de
-- sucursales es FOR ALL: sin eso, desactivar una y crear otra saltaría el límite.
CREATE OR REPLACE FUNCTION sucursales_verificar_limite()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_max integer;
  v_n   integer;
BEGIN
  IF NOT (NEW.activa AND NEW.deleted_at IS NULL) THEN RETURN NEW; END IF;
  SELECT (limites_efectivos(NEW.tenant_id)->>'max_sucursales')::integer INTO v_max;
  IF v_max IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_n FROM sucursales
   WHERE tenant_id = NEW.tenant_id AND deleted_at IS NULL AND activa = true AND id <> NEW.id;
  IF v_n >= v_max THEN
    RAISE EXCEPTION 'Tu plan permite % sucursal(es). Pide a VIM ampliar el límite.', v_max
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION sucursales_verificar_limite() FROM public;
CREATE TRIGGER trg_sucursales_limite
  BEFORE INSERT OR UPDATE OF activa, deleted_at ON sucursales
  FOR EACH ROW EXECUTE FUNCTION sucursales_verificar_limite();
