-- Retail 2, entrega 2: venta a crédito y saldo a favor (diseño 2026-10-18).
--
-- SOLO los ADD VALUE: Postgres no deja usar un valor nuevo de un enum en la misma transacción en
-- que se agrega, y la caja aplica cada archivo de migraciones como una sola consulta
-- (desktop/src/runtime.mjs). Se usan a partir de la 0208.
--
-- CREDITO: la venta se cobra a cuenta del cliente; no es dinero recibido y el corte no lo cuenta.
-- SALDO_FAVOR: el cliente paga con lo que le quedó a favor (abonos devueltos al cancelar).
-- Ningún pago con estos métodos existe hasta que un negocio encienda el módulo de crédito, así que
-- una caja que aún no los conoce no recibe filas con ellos.
ALTER TYPE metodo_pago ADD VALUE IF NOT EXISTS 'CREDITO';
ALTER TYPE metodo_pago ADD VALUE IF NOT EXISTS 'SALDO_FAVOR';
