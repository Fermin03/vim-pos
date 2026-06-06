-- F6.2 fix #23 — trg_cancelacion_audit usaba categoria 'CANCELACION', valor inexistente
-- en el enum evento_categoria (válidos: AUTENTICACION/TURNO/CAJA/VENTA/COBRO/DESCUENTO/
-- COCINA/CONFIGURACION/CATALOGO/USUARIOS/SISTEMA/OTRO). Cancelar un ticket es un evento
-- de VENTA. Mismo patrón que #22 (trg_reporte_z_audit con 'CIERRES').
-- Cazado por smoke_cancelar_ticket.sql.

CREATE OR REPLACE FUNCTION trg_cancelacion_audit() RETURNS trigger
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
      'VENTA', 'ticket.cancelado',                       -- FIX: era 'CANCELACION' (inexistente)
      'cancelacion_ticket', NEW.id,
      jsonb_build_object(
        'folio_cancelacion', NEW.folio_completo,
        'ticket_folio', NEW.ticket_folio_snapshot,
        'ticket_total_snapshot', NEW.ticket_total_snapshot,
        'motivo', NEW.motivo,
        'motivo_texto', NEW.motivo_texto,
        'estado_fiscal_previo', NEW.ticket_estado_fiscal_previo,
        'estado_cocina_previo', NEW.ticket_estado_cocina_previo,
        'cancelar_cfdi_sat', NEW.cancelar_cfdi_sat
      ),
      NEW.dia_contable
    );
  END IF;
  RETURN NEW;
END;
$$;
