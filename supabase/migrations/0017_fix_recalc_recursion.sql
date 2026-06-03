-- 0017 — Romper recursión infinita en el recálculo de totales del ticket.
-- Bug (#20 bitácora): trg_ticket_items_recalc disparaba AFTER UPDATE en CUALQUIER
-- columna de ticket_items. Pero recalcular_totales_ticket() hace
--   UPDATE ticket_items SET subtotal_bruto_mxn=…, iva_item_mxn=…, total_item_mxn=…
-- (persiste el cálculo por ítem), lo que RE-disparaba el trigger → recursión sin fin
-- ("ERROR: stack depth limit exceeded"). Afecta los tres caminos que invocan
-- recalcular: alta de ítem, alta de modificador (vía trg_modif_recalc) y alta de pago
-- (vía trg_pago_recalc), porque todos terminan en ese UPDATE de columnas computadas.
--
-- Fix: el trigger debe reaccionar solo a cambios en las columnas FUENTE que afectan
-- el total del ítem (cantidad, precio_unitario_snapshot, cancelado). El UPDATE de
-- columnas computadas que hace recalcular ya NO lo re-dispara. INSERT y DELETE intactos.
-- La función trg_item_recalc_totales() no cambia.
DROP TRIGGER IF EXISTS trg_ticket_items_recalc ON ticket_items;

CREATE TRIGGER trg_ticket_items_recalc
  AFTER INSERT OR DELETE OR UPDATE OF cantidad, precio_unitario_snapshot, cancelado
  ON ticket_items
  FOR EACH ROW EXECUTE FUNCTION trg_item_recalc_totales();
