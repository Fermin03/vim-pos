-- Smoke del giro RETAIL y las existencias por producto (spec 2026-10-15-giro-retail-design.md,
-- migraciones 0188 y 0189). Sobre la semilla de dev. ROLLBACK.
-- Ejecutar: cd desktop && npm run smokes -- smoke_existencias_producto.sql
\set ON_ERROR_STOP on
BEGIN;

-- 1) Valores nuevos.
DO $$
BEGIN
  IF NOT 'RETAIL' = ANY(enum_range(NULL::vertical_tipo)::text[]) THEN
    RAISE EXCEPTION '1a: falta RETAIL en vertical_tipo';
  END IF;
  IF NOT 'CAMBIO_TALLA' = ANY(enum_range(NULL::devolucion_motivo)::text[]) THEN
    RAISE EXCEPTION '1b: falta CAMBIO_TALLA en devolucion_motivo';
  END IF;
  RAISE NOTICE '1 valores nuevos OK';
END $$;

ROLLBACK;
