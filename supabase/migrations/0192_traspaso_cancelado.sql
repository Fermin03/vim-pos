-- Cancelar un traspaso en camino (spec 2026-10-15-giro-retail-design.md §6.2, entrega 3).
-- SOLO el ADD VALUE: un valor nuevo no se usa en la misma transacción en que se agrega, y la caja
-- aplica cada archivo como una sola consulta. Se usa desde la 0193.
ALTER TYPE traspaso_producto_estado ADD VALUE IF NOT EXISTS 'CANCELADO';
