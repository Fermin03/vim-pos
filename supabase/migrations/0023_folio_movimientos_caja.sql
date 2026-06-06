-- F7 — Folio automático para movimientos_caja.
-- 0005 dejó la tabla con `folio NOT NULL` pero sin trigger; este trigger genera el folio
-- usando generar_folio() con un tipo de documento distinto por tipo de movimiento, para
-- que la numeración sea independiente: SAN-…, DEP-…, INY-…, PAG-…, FND-…, DEV-…, AJU+/-.

CREATE OR REPLACE FUNCTION trg_movs_caja_folio() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tipo_doc  varchar;
  v_prefijo   varchar(4);
  v_folio_row record;
BEGIN
  IF TG_OP <> 'INSERT' OR NEW.folio IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_tipo_doc := 'MOV_' || NEW.tipo::text;        -- contador separado por tipo
  v_prefijo := CASE NEW.tipo::text
    WHEN 'SANGRIA'             THEN 'SAN'
    WHEN 'DEPOSITO'            THEN 'DEP'
    WHEN 'INYECCION_FONDO'     THEN 'INY'
    WHEN 'PAGO_PROVEEDOR'      THEN 'PAG'
    WHEN 'FONDO_APERTURA'      THEN 'FND'
    WHEN 'DEVOLUCION_EFECTIVO' THEN 'DEV'
    WHEN 'AJUSTE_POSITIVO'     THEN 'AJP'
    WHEN 'AJUSTE_NEGATIVO'     THEN 'AJN'
    ELSE 'MOV'
  END;

  SELECT consecutivo INTO v_folio_row
  FROM generar_folio(NEW.sucursal_id, v_tipo_doc, NULL);

  NEW.folio := v_prefijo
               || '-' || EXTRACT(YEAR FROM now())::int
               || '-' || LPAD(v_folio_row.consecutivo::text, 6, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_movs_caja_folio ON movimientos_caja;
CREATE TRIGGER trg_movs_caja_folio
  BEFORE INSERT ON movimientos_caja
  FOR EACH ROW EXECUTE FUNCTION trg_movs_caja_folio();

COMMENT ON FUNCTION trg_movs_caja_folio IS 'F7 — Asigna folio "SAN-YYYY-NNNNNN" (etc) si NULL al insertar movimiento de caja.';
