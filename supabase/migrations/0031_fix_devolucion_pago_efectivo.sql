-- F6.3 fix #30 — trg_devolucion_pago_efectivo (0009) inserta en movimientos_caja y pagos
-- con columnas equivocadas/faltantes → TODA devolución en efectivo confirmada revienta:
--   movimientos_caja: usaba `tipo_movimiento` (la columna es `tipo`), `referencia_documento_tipo`
--     y `referencia_documento_id` (no existen), `usuario_id`+`created_by` (la columna es
--     `usuario_solicitante_id`; no hay created_by), y NO ponía `dia_contable` (NOT NULL).
--   pagos: no ponía `dia_contable` (NOT NULL).
-- Re-creada contra el esquema real. El folio de movimientos_caja lo pone el trigger BEFORE INSERT
-- (0023), así que no se setea aquí. Cazado por smoke_devolucion.sql.

CREATE OR REPLACE FUNCTION trg_devolucion_pago_efectivo() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.estado <> 'CONFIRMADA'
     AND NEW.estado = 'CONFIRMADA'
     AND NEW.medio_devolucion = 'EFECTIVO' THEN
    -- Movimiento de caja: salida de efectivo por la devolución.
    INSERT INTO movimientos_caja (
      tenant_id, sucursal_id, caja_id, turno_id,
      tipo, monto_mxn, dia_contable, motivo, usuario_solicitante_id
    ) VALUES (
      NEW.tenant_id, NEW.sucursal_id, NEW.caja_id, NEW.turno_id,
      'DEVOLUCION_EFECTIVO', NEW.total_devuelto_mxn, NEW.dia_contable,
      'Devolución folio ' || NEW.folio_completo, NEW.usuario_solicitante_id
    );

    -- Pago negativo para mantener coherente el monto_pagado_mxn del ticket original.
    INSERT INTO pagos (
      tenant_id, sucursal_id, caja_id, turno_id, ticket_id, dia_contable,
      metodo_pago, monto_mxn, estado, referencia, usuario_id, nota, created_by
    ) VALUES (
      NEW.tenant_id, NEW.sucursal_id, NEW.caja_id, NEW.turno_id, NEW.ticket_original_id, NEW.dia_contable,
      'EFECTIVO', -NEW.total_devuelto_mxn, 'APLICADO',
      'Devolución ' || NEW.folio_completo, NEW.usuario_solicitante_id,
      'Reverso por devolución ' || NEW.motivo::text, NEW.usuario_solicitante_id
    );
  END IF;
  RETURN NEW;
END;
$$;
