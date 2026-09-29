-- 0124 · el rechazo de una fila dice QUÉ chocó
--
-- La 0123 empezó a guardar en sync_eventos las filas que la nube rechaza, pero solo con su id y el
-- mensaje ("duplicate key value violates unique constraint ticket_folio_unico_por_sucursal"). El
-- 29 sep 2026 Knock-Out rechazaba así un ticket y una cancelación cada 10 minutos, y el id de la
-- caja no dice con qué registro de la nube choca. Se añade el folio de la fila y el DETAIL de
-- Postgres (que en una llave duplicada nombra el valor). El resto de la función es la de la 0074.

CREATE OR REPLACE FUNCTION _vim_apply_rows_detalle(p_tabla text, p_rows jsonb, p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_cols    text;
  v_set     text;
  v_n       integer := 0;
  v_fila    jsonb;
  v_errores jsonb := '[]'::jsonb;
  v_sql     text;
  v_detalle text;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RETURN jsonb_build_object('aplicadas', 0, 'errores', '[]'::jsonb);
  END IF;

  -- La lista de columnas sale del information_schema del DESTINO: una columna que exista en la
  -- caja pero no aquí se ignora sola, y la sincronización no se rompe por desfase de esquema.
  SELECT string_agg(quote_ident(column_name), ', '),
         string_agg(CASE WHEN column_name <> 'id' THEN quote_ident(column_name) || '=EXCLUDED.' || quote_ident(column_name) END, ', ')
    INTO v_cols, v_set
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = p_tabla
     AND is_generated <> 'ALWAYS' AND is_identity <> 'YES';
  IF v_cols IS NULL THEN RETURN jsonb_build_object('aplicadas', 0, 'errores', '[]'::jsonb); END IF;

  v_sql := format(
    'INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_recordset(NULL::public.%I, $1) WHERE tenant_id = $2 ON CONFLICT (id) DO UPDATE SET %s',
    p_tabla, v_cols, v_cols, p_tabla, v_set);

  -- Camino rápido: todo junto. Es lo que ocurre siempre que no hay conflicto.
  BEGIN
    EXECUTE v_sql USING p_rows, p_tenant;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN jsonb_build_object('aplicadas', v_n, 'errores', '[]'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    -- Algo chocó. Se rehace fila por fila para salvar todo lo que sí se pueda.
    v_n := 0;
  END;

  FOR v_fila IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    BEGIN
      EXECUTE v_sql USING jsonb_build_array(v_fila), p_tenant;
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN
      -- 0124: el DETAIL de Postgres dice qué valor chocó (en un folio duplicado, cuál folio), y
      -- el folio de la fila rechazada, si trae. Sin esto había que ir a la caja del local.
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
