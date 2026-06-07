-- T2 keystone — Gap real de Full Service: al pagar/cancelar un ticket de MESA, la mesa quedaba
-- OCUPADA para siempre. trg_ticket_cerrar_cuenta solo cierra cuentas_abiertas; nadie liberaba
-- la fila de tickets_mesas. Cazado por smoke_cuenta_mesa.sql.
--
-- Fix: trigger en tickets que, al pasar estado_fiscal a un estado terminal (PAGADO/FACTURADO/
-- CANCELADO), marca fecha_liberacion en la asignación de mesa activa. El trigger existente
-- trg_tickets_mesas_sync_estado_mesa detecta esa liberación y pone la mesa en LIBRE.

CREATE OR REPLACE FUNCTION trg_ticket_liberar_mesa() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.estado_fiscal IS DISTINCT FROM NEW.estado_fiscal
     AND NEW.estado_fiscal IN ('PAGADO', 'FACTURADO', 'CANCELADO') THEN
    UPDATE tickets_mesas
       SET fecha_liberacion = now(),
           motivo_liberacion = COALESCE(motivo_liberacion, 'CUENTA_CERRADA')
     WHERE ticket_id = NEW.id
       AND fecha_liberacion IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ticket_liberar_mesa ON tickets;
CREATE TRIGGER trg_ticket_liberar_mesa
  AFTER UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION trg_ticket_liberar_mesa();
