-- 0104 — Cancelar una cuenta de mesa ahora SÍ libera la mesa, y una cuenta vacía se puede cancelar.
--
-- Segunda mitad del síntoma "las mesas no se liberan" que arregló la 0102 por el lado del cobro.
-- Son dos bugs distintos que caían en el mismo sitio.
--
-- ── B: el modo réplica apagaba todos los triggers de `tickets` ────────────────────────────────
-- trg_cancelacion_marcar_ticket (0009 §5.3.2) hacía `SET LOCAL session_replication_role='replica'`
-- "para saltar el trigger de validación de transición". Pero ese validador (0008 §3.3.4) YA permite
-- cualquier estado → CANCELADO: el bypass no protegía de nada. A cambio apagaba TODOS los triggers
-- de usuario de `tickets` en ese UPDATE, y ahí caían cuatro que sí importan:
--
--   • trg_ticket_liberar_mesa (0038)  → la mesa se quedaba OCUPADA para siempre, y como
--     asignar_mesa_a_ticket (0010) exige mesa libre, esa mesa ya no se podía volver a usar.
--   • trg_ticket_cerrar_cuenta        → la cuenta abierta seguía abierta.
--   • trg_tickets_audit_estado        → la cancelación no quedaba auditada como cambio de estado.
--   • trg_vim_kds_notify              → la cocina no se enteraba de que el ticket murió.
--
-- La 0038 aterrizó dentro de ese punto ciego dos meses después, sin que nada lo señalara: un
-- `session_replication_role` no falla, solo deja de hacer cosas. Se quita el switch y ya está; el
-- SECURITY DEFINER se conserva (es lo que da permiso de tocar `tickets`).
--
-- ── C: una cuenta de mesa vacía no se podía cancelar ──────────────────────────────────────────
-- Abrir una mesa sin pedir nada deja el ticket en BORRADOR, y el folio se asigna al pasar a ABIERTO
-- (0008 §3.3.3), así que un BORRADOR NO TIENE FOLIO. `cancelaciones_ticket.ticket_folio_snapshot`
-- era NOT NULL → cancelar reventaba con 23502 y la mesa se quedaba atorada sin ninguna salida desde
-- la caja. La columna es un snapshot informativo (la leen dos payloads de auditoría y el texto de
-- motivo de una devolución, todos tolerantes a NULL): pasa a admitir NULL, que es la verdad de un
-- BORRADOR. La transición BORRADOR → CANCELADO ya era válida en el validador.
--
-- Detrás de esa columna había un segundo candado, en `tickets`: el CHECK
-- `folio_obligatorio_post_borrador` (0008) exige folio en TODO lo que no sea BORRADOR, así que
-- BORRADOR → CANCELADO también reventaba ahí. Se relaja para admitir CANCELADO sin folio.
-- La alternativa —asignarle un folio al borrador antes de cancelarlo— quemaría un consecutivo de
-- la serie por sucursal/año para una mesa que se abrió por error y no tuvo ni un producto ni un
-- peso. El folio identifica una venta; esto no llegó a serlo. Los tickets cancelados que SÍ
-- alcanzaron a tener folio lo conservan (es inmutable): lo único que cambia es que deja de ser
-- obligatorio.
--
-- Cubierto por supabase/scripts/smoke_mesa_abandonada.sql (casos con ítems y vacía).

-- ── B ────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_cancelacion_marcar_ticket() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER                    -- permiso para tocar `tickets` desde el trigger
SET search_path = public, pg_temp   -- CN-001: search_path fijo (anti escalada, CWE-426)
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Sin session_replication_role: el validador de transición (0008 §3.3.4) ya acepta
    -- BORRADOR/ABIERTO/PAGADO/FACTURADO → CANCELADO, y los demás triggers de `tickets` tienen
    -- que correr (liberar la mesa, cerrar la cuenta, auditar, avisar al KDS).
    UPDATE tickets
    SET estado_fiscal = 'CANCELADO',
        updated_by = NEW.usuario_solicitante_id
    WHERE id = NEW.ticket_id
      AND estado_fiscal <> 'CANCELADO';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trg_cancelacion_marcar_ticket IS
  'Marca el ticket como CANCELADO al registrar su cancelación. Sin modo réplica (0104): los triggers de tickets —liberar mesa, cerrar cuenta, auditoría, KDS— deben correr.';

-- ── C ────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE cancelaciones_ticket
  ALTER COLUMN ticket_folio_snapshot DROP NOT NULL;

ALTER TABLE tickets
  DROP CONSTRAINT folio_obligatorio_post_borrador;

ALTER TABLE tickets
  ADD CONSTRAINT folio_obligatorio_post_borrador CHECK (
    folio_completo IS NOT NULL
    OR estado_fiscal IN ('BORRADOR', 'CANCELADO')
  );

COMMENT ON COLUMN cancelaciones_ticket.ticket_folio_snapshot IS
  'Copia del folio del ticket cancelado. NULL cuando se cancela un BORRADOR (mesa abierta por error): el folio se asigna al pasar a ABIERTO, así que un BORRADOR no tiene.';
