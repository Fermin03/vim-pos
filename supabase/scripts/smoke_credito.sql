-- Smoke crédito (retail 2, entrega 2; 0207–0208). Hace ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
-- 0207: los dos métodos de pago nuevos existen.
DO $$
BEGIN
  IF NOT ('CREDITO' = ANY (enum_range(NULL::metodo_pago)::text[])) THEN RAISE EXCEPTION 'falta metodo_pago CREDITO'; END IF;
  IF NOT ('SALDO_FAVOR' = ANY (enum_range(NULL::metodo_pago)::text[])) THEN RAISE EXCEPTION 'falta metodo_pago SALDO_FAVOR'; END IF;
  RAISE NOTICE 'SMOKE CREDITO 0207 OK';
END $$;
ROLLBACK;
