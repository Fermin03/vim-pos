-- F6.3 fix #31 (patrón #25) — trg_movs_caja_folio (0023) arma el tipo de documento del
-- contador como 'MOV_' || NEW.tipo::text. Para tipo='DEVOLUCION_EFECTIVO' eso es
-- 'MOV_DEVOLUCION_EFECTIVO' = 23 chars, pero contadores_folio.tipo_documento es varchar(20)
-- → el folio del movimiento de caja de una devolución en efectivo revienta. Ampliar a 40
-- (cabe cualquier 'MOV_<movimiento_tipo>' actual y futuro). Cazado por smoke_devolucion.sql.

ALTER TABLE contadores_folio
  ALTER COLUMN tipo_documento TYPE varchar(40);

COMMENT ON COLUMN contadores_folio.tipo_documento IS
  'Tipo de documento del contador de folios. Ampliado a 40 para MOV_<movimiento_tipo> largos (fix #31).';
