-- F6.3 fix #32 — Modelo B de devoluciones ("venta intacta + documento de devolución aparte",
-- decisión de diseño del dueño). El trigger trg_devolucion_pago_efectivo (0031) insertaba un
-- pago NEGATIVO en el ticket original para "deshacer" el cobro; eso, combinado con la reversa
-- del cancel, hacía que monto_pagado_mxn quedara negativo y violara tickets_monto_pagado_mxn_check.
--
-- En el Modelo B la venta original NO se reescribe: queda PAGADA en el historial (es una venta
-- válida que ocurrió). La devolución es un documento aparte (tabla devoluciones) y el dinero que
-- sale de la caja se registra como un MOVIMIENTO de caja (DEVOLUCION_EFECTIVO). El Reporte Z ya
-- resta total_devoluciones_mxn, así que las ventas netas cuadran sin tocar el ticket.
--
-- Por tanto: el trigger crea SOLO el movimiento de caja. Se elimina el pago negativo.

CREATE OR REPLACE FUNCTION trg_devolucion_pago_efectivo() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.estado <> 'CONFIRMADA'
     AND NEW.estado = 'CONFIRMADA'
     AND NEW.medio_devolucion = 'EFECTIVO' THEN
    -- Única consecuencia en caja: sale efectivo por el reembolso. El ticket original NO se toca.
    INSERT INTO movimientos_caja (
      tenant_id, sucursal_id, caja_id, turno_id,
      tipo, monto_mxn, dia_contable, motivo, usuario_solicitante_id
    ) VALUES (
      NEW.tenant_id, NEW.sucursal_id, NEW.caja_id, NEW.turno_id,
      'DEVOLUCION_EFECTIVO', NEW.total_devuelto_mxn, NEW.dia_contable,
      'Devolución folio ' || NEW.folio_completo, NEW.usuario_solicitante_id
    );
  END IF;
  RETURN NEW;
END;
$$;
