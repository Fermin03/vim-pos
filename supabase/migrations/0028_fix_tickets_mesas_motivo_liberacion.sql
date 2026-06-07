-- F18 fix #25 — transferir_mesa (0009) escribe
--   motivo_liberacion = format('TRANSFERIDO_A_MESA_%s', p_mesa_nueva_id)
-- que con un UUID completo mide 55 caracteres, pero la columna es varchar(50) →
-- TODA transferencia de mesa revienta con "value too long for type character varying(50)".
-- Fix aditivo: ampliar la columna a varchar(120) (cabe el prefijo + UUID con margen).
-- Cazado por smoke_mesas.sql.

ALTER TABLE tickets_mesas
  ALTER COLUMN motivo_liberacion TYPE varchar(120);

COMMENT ON COLUMN tickets_mesas.motivo_liberacion IS
  'Motivo de liberación de la mesa. Ampliado a 120 para que quepa TRANSFERIDO_A_MESA_<uuid>. Fix #25.';

-- Fix #26 (mismo patrón #22/#23/#24): trg_tickets_mesas_audit (0010) registra auditoría con
-- categoria 'MESAS', valor inexistente en evento_categoria. Una transferencia de mesa es un
-- evento de VENTA → re-crear la función con categoria 'VENTA'.
CREATE OR REPLACE FUNCTION trg_tickets_mesas_audit() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.mesa_anterior_id IS NOT NULL THEN
    INSERT INTO auditoria_eventos (
      tenant_id, usuario_id, categoria, evento_codigo,
      entidad_tipo, entidad_id, payload
    ) VALUES (
      NEW.tenant_id, NEW.created_by, 'VENTA', 'mesa.transferida',   -- FIX: era 'MESAS'
      'ticket', NEW.ticket_id,
      jsonb_build_object(
        'mesa_anterior_id', NEW.mesa_anterior_id,
        'mesa_nueva_id', NEW.mesa_id,
        'motivo', NEW.transferencia_motivo,
        'autorizacion_pin_id', NEW.transferencia_autorizacion_pin_id
      )
    );
  END IF;
  RETURN NEW;
END;
$$;
