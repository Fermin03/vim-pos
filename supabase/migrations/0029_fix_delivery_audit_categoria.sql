-- F19 fix #27 (mismo patrón #22/#23/#24/#26): trg_delivery_audit (0009) registra auditoría
-- con categoria 'DELIVERY', valor inexistente en el enum evento_categoria → toda asignación
-- y cambio de estado de delivery revienta. Delivery es parte del ciclo de venta → 'VENTA'.
-- Cazado por smoke_delivery.sql.

CREATE OR REPLACE FUNCTION trg_delivery_audit() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO auditoria_eventos (
      tenant_id, sucursal_id, usuario_id, categoria, evento_codigo,
      entidad_tipo, entidad_id, payload
    ) VALUES (
      NEW.tenant_id, NEW.sucursal_id, NEW.created_by, 'VENTA', 'delivery.asignado',   -- FIX: era 'DELIVERY'
      'delivery', NEW.id,
      jsonb_build_object(
        'ticket_id', NEW.ticket_id,
        'repartidor_id', NEW.repartidor_id,
        'monto_a_liquidar_mxn', NEW.monto_a_liquidar_mxn
      )
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    INSERT INTO auditoria_eventos (
      tenant_id, sucursal_id, usuario_id, categoria, evento_codigo,
      entidad_tipo, entidad_id, payload
    ) VALUES (
      NEW.tenant_id, NEW.sucursal_id, NEW.updated_by, 'VENTA', 'delivery.estado.cambio',  -- FIX
      'delivery', NEW.id,
      jsonb_build_object(
        'estado_anterior', OLD.estado,
        'estado_nuevo', NEW.estado,
        'ticket_id', NEW.ticket_id,
        'repartidor_id', NEW.repartidor_id,
        'diferencia_mxn', NEW.diferencia_mxn
      )
    );
  END IF;
  RETURN NEW;
END;
$$;
