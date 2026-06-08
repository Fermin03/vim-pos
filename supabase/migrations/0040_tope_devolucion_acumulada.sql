-- 0040 — Tope de devolución ACUMULADA por ítem (hallazgo de auditoría: doble reembolso).
--
-- BUG DINERO: crear_devolucion solo validaba `cantidad_devuelta <= cantidad_original` por fila,
-- comparando contra la cantidad ORIGINAL del ítem, sin sumar lo ya devuelto en devoluciones
-- previas. Como en Modelo B el ticket queda PAGADO, se podía devolver el MISMO ticket/ítem N
-- veces → salía efectivo de la caja varias veces por una sola venta.
--
-- Fix: trigger BEFORE INSERT en devolucion_items que suma la cantidad ya devuelta (devoluciones
-- no canceladas) para ese ticket_item y rechaza si el total excede la cantidad original.
-- Es aditivo: no toca crear_devolucion. Las devoluciones CANCELADA liberan su cantidad.

CREATE OR REPLACE FUNCTION topar_devolucion_acumulada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_previa numeric := 0;
BEGIN
  SELECT COALESCE(SUM(di.cantidad_devuelta), 0)
    INTO v_previa
  FROM devolucion_items di
  JOIN devoluciones d ON d.id = di.devolucion_id
  WHERE di.ticket_item_id_original = NEW.ticket_item_id_original
    AND d.estado <> 'CANCELADA'
    AND d.deleted_at IS NULL;

  IF v_previa + NEW.cantidad_devuelta > NEW.cantidad_original + 0.0001 THEN
    RAISE EXCEPTION 'Este ítem ya fue devuelto (% de % unidades). No se puede devolver % más.',
      v_previa, NEW.cantidad_original, NEW.cantidad_devuelta
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_topar_devolucion_acumulada ON devolucion_items;
CREATE TRIGGER trg_topar_devolucion_acumulada
  BEFORE INSERT ON devolucion_items
  FOR EACH ROW
  EXECUTE FUNCTION topar_devolucion_acumulada();
