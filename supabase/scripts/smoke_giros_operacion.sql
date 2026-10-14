-- Smoke giros y módulos de operación (spec 2026-10-14-giros-y-modulos-de-operacion-design.md,
-- migraciones 0179 y 0180). Sobre la semilla de dev. ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;

-- 1) Los giros nuevos existen en el tipo.
DO $$
BEGIN
  IF NOT ('BAR' = ANY(enum_range(NULL::vertical_tipo)::text[])
      AND 'CAFETERIA' = ANY(enum_range(NULL::vertical_tipo)::text[])
      AND 'TAQUERIA' = ANY(enum_range(NULL::vertical_tipo)::text[])) THEN
    RAISE EXCEPTION '1: faltan giros en vertical_tipo: %', enum_range(NULL::vertical_tipo);
  END IF;
  RAISE NOTICE '1 giros nuevos OK';
END $$;

ROLLBACK;
