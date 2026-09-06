-- ============================================================================
-- 0106 — Avisos a las cajas (ADR 0014, entrega 3).
--
-- La 0105 dejó el hueco `avisos: []` en las directivas. Aquí se llena: VIM escribe un aviso desde
-- el panel —a un cliente o a todos— y viaja por el mismo latido, sin canal nuevo.
--
-- El acuse es por CAJA, no por negocio: uno con tres cajas necesita saber en cuál se leyó, y un
-- aviso visto en la barra no debe desaparecer de la caja del mostrador sin que nadie lo lea ahí.
--
-- Diseño: docs/superpowers/specs/2026-09-04-platform-centro-de-control-design.md §8.
-- ============================================================================

CREATE TABLE avisos_plataforma (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = va a todos los clientes.
  tenant_id             uuid NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nivel                 text NOT NULL CHECK (nivel IN ('info', 'warning', 'danger')),
  titulo                varchar(120) NOT NULL,
  cuerpo                text NOT NULL,
  requiere_confirmacion boolean NOT NULL DEFAULT false,
  vigente_desde         timestamptz NOT NULL DEFAULT now(),
  vigente_hasta         timestamptz NULL,
  creado_por            uuid NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz NULL
);
COMMENT ON TABLE avisos_plataforma IS
  'Avisos que VIM manda a las cajas por el latido. tenant_id NULL = a todos los clientes (ADR 0014).';
COMMENT ON COLUMN avisos_plataforma.cuerpo IS
  'Texto plano. Se guarda y se renderiza como texto, nunca como HTML.';
CREATE INDEX idx_avisos_vigentes ON avisos_plataforma (tenant_id, vigente_desde)
  WHERE deleted_at IS NULL;
ALTER TABLE avisos_plataforma ENABLE ROW LEVEL SECURITY;   -- sin políticas: solo service_role

CREATE TABLE avisos_lecturas (
  aviso_id   uuid NOT NULL REFERENCES avisos_plataforma(id) ON DELETE CASCADE,
  -- NULL = leído en el POS web, donde no hay caja. Ahí el acuse es por negocio, no por persona:
  -- la clave primaria incluye caja_id, así que un segundo empleado no genera una fila propia.
  -- Se guarda `usuario_id` para saber quién lo cerró, aunque no distinga acuses.
  caja_id    uuid NULL REFERENCES cajas(id) ON DELETE CASCADE,
  usuario_id uuid NULL,
  fecha      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (aviso_id, caja_id)
);
COMMENT ON TABLE avisos_lecturas IS 'Acuse de lectura de un aviso, por caja (ADR 0014).';
ALTER TABLE avisos_lecturas ENABLE ROW LEVEL SECURITY;     -- sin políticas: solo service_role

-- ── Las directivas llevan los avisos que esta caja no ha visto ──────────────
-- Se recortan a 10: si hay más, el cajero no los va a leer, y lo que importa es que vea los
-- urgentes. Orden: primero `danger`, luego los más nuevos.
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
  v_avisos    jsonb;
BEGIN
  IF p_tenant IS NULL THEN RETURN NULL; END IF;
  SELECT t.estado::text, t.bloqueo_desde, t.bloqueo_mensaje
    INTO v_estado, v_desde, v_mensaje
    FROM tenants t WHERE t.id = p_tenant AND t.deleted_at IS NULL;
  IF v_estado IS NULL THEN RETURN NULL; END IF;

  v_bloqueado := v_estado IN ('SUSPENDIDO', 'CANCELADO')
                 AND v_desde IS NOT NULL
                 AND v_desde <= now();

  -- Solo los campos que el cajero necesita ver: `created_at` y el orden se usan para ordenar y
  -- no viajan a la caja.
  SELECT COALESCE(
           jsonb_agg(jsonb_build_object(
             'id', x.id, 'nivel', x.nivel, 'titulo', x.titulo, 'cuerpo', x.cuerpo,
             'requiere_confirmacion', x.requiere_confirmacion, 'vigente_hasta', x.vigente_hasta)
             ORDER BY x.orden, x.created_at DESC),
           '[]'::jsonb)
    INTO v_avisos
    FROM (
      SELECT a.id, a.nivel, a.titulo, a.cuerpo, a.requiere_confirmacion, a.vigente_hasta,
             a.created_at,
             CASE a.nivel WHEN 'danger' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END AS orden
        FROM avisos_plataforma a
       WHERE a.deleted_at IS NULL
         AND (a.tenant_id = p_tenant OR a.tenant_id IS NULL)
         AND a.vigente_desde <= now()
         AND (a.vigente_hasta IS NULL OR a.vigente_hasta > now())
         -- Sin caja (POS web y admin) no hay acuse por caja: van todos los vigentes.
         AND (p_caja IS NULL OR NOT EXISTS (
               SELECT 1 FROM avisos_lecturas l WHERE l.aviso_id = a.id AND l.caja_id = p_caja))
       ORDER BY orden, a.created_at DESC
       LIMIT 10
    ) AS x;

  RETURN jsonb_build_object(
    'servidor_hora', to_jsonb(now()),
    'acceso', jsonb_build_object(
      'estado',        v_estado,
      'bloqueado',     v_bloqueado,
      'bloquea_desde', v_desde,
      'mensaje',       v_mensaje),
    -- Solo los EFECTIVOS: a la caja no le sirve saber qué está permitido pero apagado.
    'modulos', COALESCE(modulos_efectivos(p_tenant) -> 'efectivos', '{}'::jsonb),
    -- Sin `del_plan` ni `excepcion`: esta última lleva el `motivo` interno de VIM (ver 0105).
    'limites', COALESCE(limites_efectivos(p_tenant) - 'del_plan' - 'excepcion', '{}'::jsonb),
    'avisos',  v_avisos,
    'version', '{}'::jsonb    -- entrega 4
  );
END;
$$;
COMMENT ON FUNCTION resolver_directivas(uuid, uuid) IS
  'Paquete que la caja obedece: acceso (con gracia), módulos efectivos, límites, avisos y versión (ADR 0014).';
REVOKE EXECUTE ON FUNCTION resolver_directivas(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION resolver_directivas(uuid, uuid) TO service_role;

-- ── El latido registra los acuses que trae la caja ──────────────────────────
-- Cambia de firma (gana p_avisos_vistos), así que se retira la de la 0105. Una caja en 0.4.60
-- llama sin ese argumento y el DEFAULT la cubre; aun así, la migración y la Edge Function nueva
-- deben desplegarse juntas y en este orden.
DROP FUNCTION IF EXISTS caja_latido(uuid, text, text, inet);
CREATE OR REPLACE FUNCTION caja_latido(
  p_caja uuid, p_version text DEFAULT NULL, p_so text DEFAULT NULL, p_ip inet DEFAULT NULL,
  p_avisos_vistos uuid[] DEFAULT NULL
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

  -- Acuses. El INSERT ... SELECT filtra contra la propia tabla de avisos y contra el tenant de
  -- la caja, así que un id inventado —o de otro negocio— simplemente no inserta nada: un acuse
  -- inválido no puede tumbar el latido, que es lo que mantiene viva la señal de la caja.
  IF p_avisos_vistos IS NOT NULL AND array_length(p_avisos_vistos, 1) > 0 THEN
    INSERT INTO avisos_lecturas (aviso_id, caja_id)
    SELECT a.id, p_caja
      FROM avisos_plataforma a
     WHERE a.id = ANY (p_avisos_vistos)
       AND (a.tenant_id = v_tenant OR a.tenant_id IS NULL)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN resolver_directivas(v_tenant, p_caja);
END;
$$;
COMMENT ON FUNCTION caja_latido(uuid, text, text, inet, uuid[]) IS
  'Sella que la caja está viva, guarda su versión, registra acuses de avisos y devuelve sus directivas (ADR 0014).';
REVOKE EXECUTE ON FUNCTION caja_latido(uuid, text, text, inet, uuid[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION caja_latido(uuid, text, text, inet, uuid[]) TO service_role;

-- ── Acuse desde el POS web, donde no hay caja ───────────────────────────────
-- Solo puede marcar un aviso que le aplique a su propio tenant; devuelve false si no.
CREATE OR REPLACE FUNCTION marcar_aviso_visto(p_aviso uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
  v_filas  integer;
BEGIN
  IF v_tenant IS NULL OR p_aviso IS NULL THEN RETURN false; END IF;
  INSERT INTO avisos_lecturas (aviso_id, caja_id, usuario_id)
  SELECT a.id, NULL, auth.uid()
    FROM avisos_plataforma a
   WHERE a.id = p_aviso AND (a.tenant_id = v_tenant OR a.tenant_id IS NULL)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_filas = ROW_COUNT;
  RETURN v_filas > 0;
END;
$$;
COMMENT ON FUNCTION marcar_aviso_visto(uuid) IS
  'Acuse de lectura desde el POS web (sin caja). Solo avisos del propio tenant (ADR 0014).';
REVOKE EXECUTE ON FUNCTION marcar_aviso_visto(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION marcar_aviso_visto(uuid) TO authenticated, service_role;
