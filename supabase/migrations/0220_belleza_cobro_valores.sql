-- Belleza, entrega 2: cobro y comisiones (diseño 2026-10-18).
--
-- SOLO los ADD VALUE: Postgres no deja usar un valor nuevo de un enum en la misma transacción en
-- que se agrega, y la caja aplica cada archivo de migraciones como una sola consulta
-- (desktop/src/runtime.mjs). Se usan a partir de la 0221.
--
-- cita_estado COBRADA: la cita ya se cobró en un ticket; es estado terminal.
-- metodo_pago ANTICIPO: pago a cuenta que el cliente deja al apartar; no es dinero que el corte
-- declare por su cuenta, se aplica al ticket cuando la cita se cobra.
ALTER TYPE cita_estado ADD VALUE IF NOT EXISTS 'COBRADA';
ALTER TYPE metodo_pago ADD VALUE IF NOT EXISTS 'ANTICIPO';
