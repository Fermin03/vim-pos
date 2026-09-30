-- 0131 · el sync-push no puede tocar filas de otro negocio
--
-- Auditoría integral 30/09/2026 (hallazgo EF-3). `_vim_apply_rows_detalle` hacía
--
--   INSERT ... SELECT ... WHERE tenant_id = $2 ON CONFLICT (id) DO UPDATE SET <todas>=EXCLUDED
--
-- El `WHERE tenant_id = $2` filtra las filas QUE LLEGAN, pero no mira la fila que YA EXISTE con
-- ese id. Una caja del negocio A que mandara una fila con el id de una fila del negocio B la
-- sobreescribía entera —tenant_id incluido—, así que se la quedaba. Reproducido con una
-- `zonas_envio` de B empujada como A. Con el uuid de un ticket, un pago o un corte ajeno pasaba lo
-- mismo: cualquier credencial de caja podía reescribir la operación de otro cliente.
--
-- Y como `sync_push_snapshot` aplica en `session_replication_role = replica` (sin FKs ni
-- triggers, a propósito, para respetar lo que la caja imprimió), una fila hija podía colgar de un
-- padre de OTRO negocio (un ticket_item del negocio A apuntando al ticket de B).
--
-- Arreglo:
--   1) `DO UPDATE ... WHERE <tabla>.tenant_id = $2`: la fila existente de otro negocio no se toca.
--   2) Toda FK de una sola columna hacia una tabla con tenant_id se valida a mano: si la
--      referencia existe y es de otro negocio, la fila se rechaza.
--   3) Una fila que no entra por (1) o (2) ya no desaparece en silencio: se reporta en `errores`
--      con el motivo, igual que cualquier otro rechazo (0123/0124), y la caja no la marca como
--      confirmada.
-- `_vim_apply_rows` (la versión sin detalle de la 0056) ya no la llama nadie, pero sigue
-- existiendo: se le aplica el mismo (1) para que no quede una puerta abierta si alguien la
-- vuelve a usar.

CREATE OR REPLACE FUNCTION _vim_apply_rows_detalle(p_tabla text, p_rows jsonb, p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_cols     text;
  v_set      text;
  v_refs     text := '';
  v_fk       record;
  v_n        integer := 0;
  v_esperado integer;
  v_fila     jsonb;
  v_errores  jsonb := '[]'::jsonb;
  v_sql      text;
  v_detalle  text;
  v_una      integer;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RETURN jsonb_build_object('aplicadas', 0, 'errores', '[]'::jsonb);
  END IF;

  SELECT string_agg(quote_ident(column_name), ', '),
         string_agg(CASE WHEN column_name <> 'id' THEN quote_ident(column_name) || '=EXCLUDED.' || quote_ident(column_name) END, ', ')
    INTO v_cols, v_set
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = p_tabla
     AND is_generated <> 'ALWAYS' AND is_identity <> 'YES';
  IF v_cols IS NULL THEN RETURN jsonb_build_object('aplicadas', 0, 'errores', '[]'::jsonb); END IF;

  -- (2) Referencias a filas de otro negocio. Solo FKs de una columna hacia tablas con tenant_id,
  -- que son todas las de la operación.
  FOR v_fk IN
    SELECT a.attname AS col, c.confrelid::regclass AS destino, af.attname AS col_destino
      FROM pg_constraint c
      JOIN pg_attribute a  ON a.attrelid = c.conrelid  AND a.attnum = c.conkey[1]
      JOIN pg_attribute af ON af.attrelid = c.confrelid AND af.attnum = c.confkey[1]
     WHERE c.contype = 'f'
       AND c.conrelid = format('public.%I', p_tabla)::regclass
       AND array_length(c.conkey, 1) = 1
       AND EXISTS (SELECT 1 FROM pg_attribute t
                    WHERE t.attrelid = c.confrelid AND t.attname = 'tenant_id' AND NOT t.attisdropped)
  LOOP
    v_refs := v_refs || format(
      ' AND NOT EXISTS (SELECT 1 FROM %s x WHERE x.%I = r.%I AND x.tenant_id IS DISTINCT FROM $2)',
      v_fk.destino, v_fk.col_destino, v_fk.col);
  END LOOP;

  -- (1) + (2). `r` es el alias de las filas entrantes para que las condiciones de (2) las vean.
  v_sql := format(
    'INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_recordset(NULL::public.%I, $1) r '
    || 'WHERE r.tenant_id = $2%s ON CONFLICT (id) DO UPDATE SET %s WHERE public.%I.tenant_id = $2',
    p_tabla, v_cols, v_cols, p_tabla, v_refs, v_set, p_tabla);

  v_esperado := jsonb_array_length(p_rows);

  -- Camino rápido: todo junto. Si entraron todas, no hay nada más que ver.
  BEGIN
    EXECUTE v_sql USING p_rows, p_tenant;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = v_esperado THEN
      RETURN jsonb_build_object('aplicadas', v_n, 'errores', '[]'::jsonb);
    END IF;
    -- Faltaron filas sin error: alguna quedó fuera por (1) o (2). Se rehace fila por fila para
    -- saber cuál. Reaplicar las que sí entraron es inocuo: es un upsert con los mismos valores.
  EXCEPTION WHEN OTHERS THEN
    NULL;  -- algo chocó: fila por fila para salvar todo lo que se pueda
  END;
  v_n := 0;

  FOR v_fila IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    BEGIN
      EXECUTE v_sql USING jsonb_build_array(v_fila), p_tenant;
      GET DIAGNOSTICS v_una = ROW_COUNT;
      IF v_una = 1 THEN
        v_n := v_n + 1;
      ELSE
        v_errores := v_errores || jsonb_build_object(
          'tabla',   p_tabla,
          'id',      v_fila->>'id',
          'folio',   v_fila->>'folio_completo',
          'error',   'fila de otro negocio: su id o una de sus referencias pertenece a otro tenant',
          'detalle', NULL);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_detalle = PG_EXCEPTION_DETAIL;
      v_errores := v_errores || jsonb_build_object(
        'tabla',   p_tabla,
        'id',      v_fila->>'id',
        'folio',   v_fila->>'folio_completo',
        'error',   SQLERRM,
        'detalle', NULLIF(v_detalle, ''));
    END;
  END LOOP;

  RETURN jsonb_build_object('aplicadas', v_n, 'errores', v_errores);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION _vim_apply_rows_detalle(text, jsonb, uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION _vim_apply_rows(p_tabla text, p_rows jsonb, p_tenant uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  -- Misma semántica que la versión con detalle; se conserva la firma por compatibilidad.
  RETURN (_vim_apply_rows_detalle(p_tabla, p_rows, p_tenant)->>'aplicadas')::integer;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION _vim_apply_rows(text, jsonb, uuid) FROM public, anon, authenticated;
