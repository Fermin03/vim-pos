-- Smoke belleza, entrega 2 (migraciones 0220–0223): cobro y comisiones. ROLLBACK.
-- Uso: cd desktop && npm run smokes -- smoke_belleza_cobro.sql
\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF NOT ('COBRADA' = ANY (enum_range(NULL::cita_estado)::text[])) THEN
    RAISE EXCEPTION '1: falta cita_estado COBRADA';
  END IF;
  IF NOT ('ANTICIPO' = ANY (enum_range(NULL::metodo_pago)::text[])) THEN
    RAISE EXCEPTION '1: falta metodo_pago ANTICIPO';
  END IF;

  RAISE NOTICE 'belleza cobro OK';
END $$;

ROLLBACK;
