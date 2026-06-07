-- T2 fix #34 (mismo patrón #22/#23/#24/#26/#27/#28): trg_reservacion_audit (0010) registra
-- auditoría con categoria 'RESERVACIONES', valor inexistente en evento_categoria → TODA creación
-- o cambio de estado de reservación revienta. Una reservación es parte del ciclo de VENTA.
-- Cazado por smoke_reservaciones.sql.

CREATE OR REPLACE FUNCTION trg_reservacion_audit() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO auditoria_eventos (
      tenant_id, sucursal_id, usuario_id, categoria, evento_codigo,
      entidad_tipo, entidad_id, payload
    ) VALUES (
      NEW.tenant_id, NEW.sucursal_id, NEW.created_by, 'VENTA', 'reservacion.creada',   -- FIX
      'reservacion', NEW.id,
      jsonb_build_object(
        'folio', NEW.folio_completo,
        'fecha_hora', NEW.fecha_hora_reserva,
        'comensales', NEW.comensales,
        'cliente_nombre', NEW.cliente_nombre_snapshot,
        'canal', NEW.canal
      )
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    INSERT INTO auditoria_eventos (
      tenant_id, sucursal_id, usuario_id, categoria, evento_codigo,
      entidad_tipo, entidad_id, payload
    ) VALUES (
      NEW.tenant_id, NEW.sucursal_id, NEW.updated_by, 'VENTA', 'reservacion.estado.cambio',  -- FIX
      'reservacion', NEW.id,
      jsonb_build_object(
        'estado_anterior', OLD.estado,
        'estado_nuevo', NEW.estado,
        'motivo_cancelacion', NEW.motivo_cancelacion,
        'ticket_id', NEW.ticket_id
      )
    );
  END IF;
  RETURN NEW;
END;
$$;
