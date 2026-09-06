-- ============================================================================
-- 0108 — Catálogo de versiones del escritorio (ADR 0014, entrega 4).
--
-- Publicar una actualización era: compilar, generar latest.json, subirlo con curl y crear el
-- release a mano. Tres de esos pasos pasan al panel, y de paso queda registro de qué se publicó
-- y cuándo. El actualizador de la caja NO cambia: sigue leyendo el mismo latest.json.
--
-- `resolver_directivas` llena aquí el último hueco que la 0105 dejó (`version: {}`).
--
-- Diseño: docs/superpowers/specs/2026-09-04-platform-centro-de-control-design.md §9.
-- ============================================================================

CREATE TABLE versiones_caja (
  version             text PRIMARY KEY,
  url                 text NOT NULL,
  sha512              char(128) NOT NULL,
  notas               text NULL,
  fecha               date NULL,
  -- Despublicar retira una versión de la recomendación sin borrar su historia.
  publicada           boolean NOT NULL DEFAULT true,
  es_minima           boolean NOT NULL DEFAULT false,
  -- Apagado a propósito: exigir una mínima que BLOQUEA es lo más agresivo de todo el ADR, y
  -- además es lo único que la caja decide localmente, así que puede morder sin internet.
  bloquea_bajo_minima boolean NOT NULL DEFAULT false,
  bloquea_desde       timestamptz NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE versiones_caja IS
  'Versiones publicadas del escritorio. La caja las recibe por las directivas del latido (ADR 0014).';
COMMENT ON COLUMN versiones_caja.es_minima IS
  'La versión por debajo de la cual una caja se considera desactualizada. Solo una a la vez.';
-- Una sola mínima. Índice parcial sobre una constante: así las filas con `es_minima = false` no
-- compiten entre sí, que es lo que pasaría con un único índice sobre la columna.
CREATE UNIQUE INDEX uq_version_minima ON versiones_caja ((true)) WHERE es_minima;
ALTER TABLE versiones_caja ENABLE ROW LEVEL SECURITY;   -- sin políticas: solo service_role

-- ── Las directivas anuncian qué versión debería correr la caja ──────────────
-- Ordenar por semver, no por texto: como cadena '0.4.9' > '0.4.61', y la caja se quedaría atrás
-- justo cuando más importa. `string_to_array(...)::int[]` compara número a número.
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
  v_version   jsonb := '{}'::jsonb;
  v_rec       record;
  v_min       record;
BEGIN
  IF p_tenant IS NULL THEN RETURN NULL; END IF;
  SELECT t.estado::text, t.bloqueo_desde, t.bloqueo_mensaje
    INTO v_estado, v_desde, v_mensaje
    FROM tenants t WHERE t.id = p_tenant AND t.deleted_at IS NULL;
  IF v_estado IS NULL THEN RETURN NULL; END IF;

  v_bloqueado := v_estado IN ('SUSPENDIDO', 'CANCELADO')
                 AND v_desde IS NOT NULL
                 AND v_desde <= now();

  -- Solo los campos que el cajero necesita ver: `created_at` y el orden sirven para ordenar y no
  -- viajan a la caja.
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

  SELECT v.version, v.url, v.sha512, v.notas INTO v_rec
    FROM versiones_caja v WHERE v.publicada
   ORDER BY string_to_array(v.version, '.')::int[] DESC LIMIT 1;
  SELECT v.version, v.bloquea_bajo_minima, v.bloquea_desde INTO v_min
    FROM versiones_caja v WHERE v.es_minima LIMIT 1;

  IF v_rec.version IS NOT NULL OR v_min.version IS NOT NULL THEN
    v_version := jsonb_build_object(
      'recomendada', v_rec.version,
      'url',         v_rec.url,
      'sha512',      v_rec.sha512,
      'notas',       v_rec.notas,
      'minima',      v_min.version,
      -- Solo `true` cuando VIM lo encendió Y llegó la fecha. La caja no calcula esta parte.
      'bloquea_bajo_minima', COALESCE(v_min.bloquea_bajo_minima, false)
                             AND v_min.bloquea_desde IS NOT NULL
                             AND v_min.bloquea_desde <= now(),
      'bloquea_desde', v_min.bloquea_desde);
  END IF;

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
    'version', v_version
  );
END;
$$;
COMMENT ON FUNCTION resolver_directivas(uuid, uuid) IS
  'Paquete que la caja obedece: acceso (con gracia), módulos efectivos, límites, avisos y versión (ADR 0014).';
REVOKE EXECUTE ON FUNCTION resolver_directivas(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION resolver_directivas(uuid, uuid) TO service_role;
