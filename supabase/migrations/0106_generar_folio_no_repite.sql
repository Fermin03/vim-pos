-- ============================================================================
-- 0106 — generar_folio() nunca repite un folio que ya exista en tickets.
--
-- Lo que pasó (6 sep 2026, primer pedido real de Uber Eats): la caja de escritorio de la sucursal
-- Pruebas había emitido VP1-2026-000001…000004 con SU contador local y los subió por sync-push;
-- en la nube esos tickets existen, pero `contadores_folio` de esa sucursal no tenía fila. Al
-- crear el ticket del pedido en la nube (`crear_ticket_desde_app`), generar_folio arrancó en 1 y
-- chocó con `ticket_folio_unico_por_sucursal`. El pedido quedó sin aceptar.
--
-- Regla nueva: el consecutivo es el MAYOR entre (contador + 1) y (máximo folio ya emitido en la
-- sucursal para ese año + 1). Así da igual quién emitió antes —la nube o una caja instalada— y el
-- contador se repara solo. Solo aplica a tipo TICKET, que es el único que vive en `tickets`.
--
-- También se reparan de una vez los contadores que ya iban atrás. Aplica igual en el Postgres
-- embebido del escritorio (misma función, mismos datos).
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
  v_anio          integer;
  v_consecutivo   bigint;
  v_max_emitido   bigint := 0;
BEGIN
  SELECT s.tenant_id, s.codigo
  INTO v_tenant_id, v_codigo_suc
  FROM sucursales s
  WHERE s.id = p_sucursal_id AND s.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sucursal % no existe o está eliminada', p_sucursal_id;
  END IF;

  v_anio := COALESCE(p_anio, EXTRACT(YEAR FROM now())::integer);

  -- Lo ya emitido manda: un ticket que subió una caja instalada cuenta aunque el contador de aquí
  -- no lo haya visto. Se busca por el prefijo del folio (código-año-), que es lo que hace único
  -- al folio, no por dia_contable.
  IF p_tipo_documento = 'TICKET' THEN
    SELECT COALESCE(MAX(t.folio_consecutivo), 0) INTO v_max_emitido
    FROM tickets t
    WHERE t.sucursal_id = p_sucursal_id
      AND t.folio_completo LIKE v_codigo_suc || '-' || v_anio || '-%';
  END IF;

  INSERT INTO contadores_folio (tenant_id, sucursal_id, anio, tipo_documento, ultimo_consecutivo)
  VALUES (v_tenant_id, p_sucursal_id, v_anio, p_tipo_documento, GREATEST(1, v_max_emitido + 1))
  ON CONFLICT (sucursal_id, anio, tipo_documento)
  DO UPDATE SET
    ultimo_consecutivo = GREATEST(contadores_folio.ultimo_consecutivo + 1, v_max_emitido + 1),
    updated_at = now()
  RETURNING ultimo_consecutivo INTO v_consecutivo;

  RETURN QUERY SELECT
    (v_codigo_suc || '-' || v_anio || '-' || LPAD(v_consecutivo::text, 6, '0'))::varchar AS folio_completo,
    v_consecutivo AS consecutivo;
END;
$$;

COMMENT ON FUNCTION generar_folio IS
  'Folio atómico por sucursal/año/tipo, formato [codigo]-[anio]-[NNNNNN]. Para TICKET nunca repite un folio ya emitido (0106): el consecutivo es el mayor entre contador+1 y máximo emitido+1.';

-- Reparación única: contadores TICKET al día con lo que ya existe en tickets.
INSERT INTO contadores_folio (tenant_id, sucursal_id, anio, tipo_documento, ultimo_consecutivo)
SELECT s.tenant_id, t.sucursal_id, split_part(t.folio_completo, '-', 2)::integer AS anio, 'TICKET', MAX(t.folio_consecutivo)
FROM tickets t
JOIN sucursales s ON s.id = t.sucursal_id
WHERE t.folio_completo IS NOT NULL
  AND t.folio_consecutivo IS NOT NULL
  AND split_part(t.folio_completo, '-', 2) ~ '^\d{4}$'
GROUP BY s.tenant_id, t.sucursal_id, split_part(t.folio_completo, '-', 2)
ON CONFLICT (sucursal_id, anio, tipo_documento)
DO UPDATE SET ultimo_consecutivo = GREATEST(contadores_folio.ultimo_consecutivo, EXCLUDED.ultimo_consecutivo),
              updated_at = now();
