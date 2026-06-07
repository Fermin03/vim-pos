-- F6.3 fix #28 (mismo patrón #22/#23/#24/#26/#27): trg_devolucion_audit (0009) registra
-- auditoría con categoria 'DEVOLUCION', valor inexistente en evento_categoria → TODA
-- devolución/cancelación de venta pagada revienta. Una devolución es parte del ciclo de
-- venta → 'VENTA'. Cazado por smoke_devolucion.sql.

CREATE OR REPLACE FUNCTION trg_devolucion_audit() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO auditoria_eventos (
      tenant_id, sucursal_id, caja_id, turno_id,
      usuario_id, usuario_autorizo_id, categoria, evento_codigo,
      entidad_tipo, entidad_id, payload, dia_contable
    ) VALUES (
      NEW.tenant_id, NEW.sucursal_id, NEW.caja_id, NEW.turno_id,
      NEW.usuario_solicitante_id, NEW.usuario_autorizo_id,
      'VENTA', 'devolucion.creada',                          -- FIX: era 'DEVOLUCION'
      'devolucion', NEW.id,
      jsonb_build_object(
        'folio', NEW.folio_completo,
        'ticket_original_folio', NEW.ticket_folio_snapshot,
        'alcance', NEW.alcance,
        'motivo', NEW.motivo,
        'medio', NEW.medio_devolucion,
        'total_mxn', NEW.total_devuelto_mxn,
        'reversar_inventario', NEW.reversar_inventario
      ),
      NEW.dia_contable
    );
  END IF;
  RETURN NEW;
END;
$$;
