-- ============================================================================
-- 0125 — Lo que emite la NUBE en una sucursal con caja instalada lleva su propia serie (W).
--
-- Lo que pasó (Knock-Out, 6 → 29 sep 2026): con la caja caída, alguien vendió desde el POS web y
-- la nube emitió KO1C-2026-000171. La caja no lo supo —los tickets no bajan a la caja— y al
-- volver le dio el MISMO folio a una venta suya de $330. Desde entonces la nube rechazó esa venta
-- en cada push (ticket_folio_unico_por_sucursal), y lo mismo la primera cancelación de la caja
-- contra una cancelación que se hizo a mano en la nube. La 0107 cubre el caso inverso (la nube no
-- repite lo que una caja ya subió), pero la caja no tiene cómo ver lo que la nube emitió.
--
-- Regla nueva: si generar_folio corre EN LA NUBE y la sucursal tiene una caja de escritorio, el
-- folio lleva el código de la sucursal con una W pegada (KO1CW-2026-000001) y su propio contador.
-- Así nunca choca con la serie de la caja, y el POS web sigue sirviendo de respaldo cuando la
-- caja se cae. Aplica a todos los tipos de documento (ticket, cancelación, devolución, …).
--
-- Cómo se sabe dónde corre: la caja crea `_vim_migraciones` (desktop/src/runtime.mjs) ANTES de
-- aplicar cualquier migración; en la nube no existe. Cómo se sabe que la sucursal tiene caja
-- instalada: alguna caja ya se sincronizó (ultima_conexion, la sella sync_push_snapshot) o ya
-- latió (ultimo_latido / version_app, 0105). Sucursales solo web: sin cambios.
-- ============================================================================

CREATE OR REPLACE FUNCTION generar_folio(
  p_sucursal_id uuid,
  p_tipo_documento varchar DEFAULT 'TICKET',
  p_anio integer DEFAULT NULL
) RETURNS TABLE (
  folio_completo varchar,
  consecutivo bigint
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id     uuid;
  v_codigo_suc    varchar(10);
  v_prefijo       varchar(12);
  v_tipo          varchar(40);
  v_anio          integer;
  v_consecutivo   bigint;
  v_max_emitido   bigint := 0;
  v_serie_nube    boolean := false;
BEGIN
  SELECT s.tenant_id, s.codigo
  INTO v_tenant_id, v_codigo_suc
  FROM sucursales s
  WHERE s.id = p_sucursal_id AND s.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sucursal % no existe o está eliminada', p_sucursal_id;
  END IF;

  v_anio := COALESCE(p_anio, EXTRACT(YEAR FROM now())::integer);

  -- ¿Nube, y la sucursal tiene caja instalada? (ver el encabezado)
  IF to_regclass('public._vim_migraciones') IS NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM cajas c
       WHERE c.sucursal_id = p_sucursal_id
         AND (c.ultima_conexion IS NOT NULL OR c.ultimo_latido IS NOT NULL OR c.version_app IS NOT NULL)
    ) INTO v_serie_nube;
  END IF;

  v_prefijo := v_codigo_suc || CASE WHEN v_serie_nube THEN 'W' ELSE '' END;
  v_tipo    := p_tipo_documento || CASE WHEN v_serie_nube THEN '_W' ELSE '' END;

  -- Lo ya emitido manda (0107): un ticket que subió una caja instalada cuenta aunque el contador
  -- de aquí no lo haya visto. Se busca por el prefijo de ESTA serie.
  IF p_tipo_documento = 'TICKET' THEN
    SELECT COALESCE(MAX(t.folio_consecutivo), 0) INTO v_max_emitido
    FROM tickets t
    WHERE t.sucursal_id = p_sucursal_id
      AND t.folio_completo LIKE v_prefijo || '-' || v_anio || '-%';
  END IF;

  INSERT INTO contadores_folio (tenant_id, sucursal_id, anio, tipo_documento, ultimo_consecutivo)
  VALUES (v_tenant_id, p_sucursal_id, v_anio, v_tipo, GREATEST(1, v_max_emitido + 1))
  ON CONFLICT (sucursal_id, anio, tipo_documento)
  DO UPDATE SET
    ultimo_consecutivo = GREATEST(contadores_folio.ultimo_consecutivo + 1, v_max_emitido + 1),
    updated_at = now()
  RETURNING ultimo_consecutivo INTO v_consecutivo;

  RETURN QUERY SELECT
    (v_prefijo || '-' || v_anio || '-' || LPAD(v_consecutivo::text, 6, '0'))::varchar AS folio_completo,
    v_consecutivo AS consecutivo;
END;
$$;

COMMENT ON FUNCTION generar_folio IS
  'Folio atómico por sucursal/año/tipo, formato [codigo]-[anio]-[NNNNNN]. TICKET nunca repite un folio ya emitido (0107). En la nube, si la sucursal tiene caja de escritorio, usa la serie [codigo]W con contador propio (0125) para no chocar con la de la caja.';
