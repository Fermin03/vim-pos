-- Smoke de retail 2, entrega 1 (giros de tienda y unidad de venta; migraciones 0205–0206).
-- Sobre la semilla de dev. ROLLBACK. Ejecutar: cd desktop && npm run smokes -- smoke_retail2.sql
\set ON_ERROR_STOP on
BEGIN;

-- 1) Los valores nuevos existen en sus enums (0205).
DO $$
BEGIN
  IF (SELECT count(*) FROM unnest(enum_range(NULL::vertical_tipo)) v
      WHERE v::text IN ('ABARROTES','FRUTERIA','FERRETERIA','VINOS')) <> 4 THEN
    RAISE EXCEPTION '1: faltan giros nuevos en vertical_tipo'; END IF;
  IF NOT 'LONGITUD' = ANY (enum_range(NULL::producto_tipo_venta)::text[]) THEN
    RAISE EXCEPTION '1: falta LONGITUD en producto_tipo_venta'; END IF;
  RAISE NOTICE '1 valores de enum OK';
END $$;

ROLLBACK;
