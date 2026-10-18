-- 0204 · Si al cliente se le regresa dinero por la venta de un cambio de talla, la venta original
-- pierde sus puntos en proporción a lo que cubría la prenda que regresó (Fermín, 18 oct).
-- La 0200 dejó que el cambio no sumara ni restara; sin esto, comprar → cambiar → cancelar el cambio
-- devolvía todo el dinero y los puntos de la compra original se quedaban.

-- Revierte lo ganado "aguas arriba" de un ticket. En un ticket normal es lealtad_revertir_ganado_ticket.
-- En la venta de un cambio, sube a la venta de donde vino la prenda con la fracción escalada por
-- (lo que regresó / total de esa venta); en una cadena de cambios repite hasta la venta original.
CREATE OR REPLACE FUNCTION _lealtad_revertir_por_cambio(p_ticket uuid, p_fraccion numeric, p_nivel integer DEFAULT 0)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_original uuid;
  v_regresa  numeric(12,2);
  v_total    numeric(12,2);
BEGIN
  IF p_nivel > 20 OR COALESCE(p_fraccion, 0) <= 0 THEN RETURN; END IF;
  IF NOT _ticket_es_de_cambio(p_ticket) THEN
    PERFORM lealtad_revertir_ganado_ticket(p_ticket, p_fraccion);
    RETURN;
  END IF;
  SELECT d.ticket_original_id, d.total_devuelto_mxn INTO v_original, v_regresa
    FROM tickets t JOIN devoluciones d
      ON d.tenant_id = t.tenant_id AND d.client_id_local = t.client_id_local AND d.motivo = 'CAMBIO_TALLA'
   WHERE t.id = p_ticket;
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_original;
  IF COALESCE(v_total, 0) <= 0 THEN RETURN; END IF;
  PERFORM _lealtad_revertir_por_cambio(
    v_original, LEAST(p_fraccion, 1) * LEAST(v_regresa / v_total, 1), p_nivel + 1);
END $$;
REVOKE ALL ON FUNCTION _lealtad_revertir_por_cambio(uuid, numeric, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION _lealtad_revertir_por_cambio(uuid, numeric, integer) TO service_role;

-- La de la 0200 con la línea "0204": revierte a través de la ayudante. En un ticket normal es lo mismo
-- de antes; en la venta de un cambio (cancelarla con dinero o devolverla) llega a la venta original.
CREATE OR REPLACE FUNCTION trg_devolucion_lealtad()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_total numeric(12,2);
BEGIN
  BEGIN
    IF TG_OP = 'UPDATE' AND OLD.estado <> 'CONFIRMADA' AND NEW.estado = 'CONFIRMADA'
       AND NEW.motivo IS DISTINCT FROM 'CAMBIO_TALLA' THEN   -- 0200
      SELECT total_mxn INTO v_total FROM tickets WHERE id = NEW.ticket_original_id;
      PERFORM _lealtad_revertir_por_cambio(   -- 0204
        NEW.ticket_original_id,
        CASE WHEN COALESCE(v_total, 0) <= 0 THEN 1 ELSE LEAST(NEW.total_devuelto_mxn / v_total, 1) END);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'lealtad: no se pudo revertir lo ganado del ticket %: %', NEW.ticket_original_id, SQLERRM;
  END;
  RETURN NEW;
END $$;

-- La venta ABIERTA de un cambio no tiene devolución al cancelarse: cancelar_ticket_pagado (0196) anula
-- su pago interno y el cliente recibe en efectivo lo que cubría la prenda. Eso también le quita puntos.
-- (Una venta PAGADA cancelada con dinero pasa por su devolución y el disparador de arriba; sin dinero,
-- no hay nada que revertir.)
CREATE OR REPLACE FUNCTION trg_cancelacion_cambio_lealtad()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  BEGIN
    IF NEW.devolucion_id IS NULL AND NEW.ticket_estado_fiscal_previo::text NOT IN ('PAGADO', 'FACTURADO')
       AND _ticket_es_de_cambio(NEW.ticket_id) THEN
      PERFORM _lealtad_revertir_por_cambio(NEW.ticket_id, 1);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'lealtad: no se pudo revertir lo ganado por el cambio %: %', NEW.ticket_id, SQLERRM;
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cancelaciones_cambio_lealtad ON cancelaciones_ticket;
CREATE TRIGGER trg_cancelaciones_cambio_lealtad
  AFTER INSERT ON cancelaciones_ticket
  FOR EACH ROW EXECUTE FUNCTION trg_cancelacion_cambio_lealtad();
