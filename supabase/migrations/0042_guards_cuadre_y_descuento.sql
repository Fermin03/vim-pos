-- 0042 — Guards de defensa en profundidad (auditoría de flujos).
--
-- CIERRE H1: calcular_efectivo_esperado sumaba TODOS los movimientos del turno, sin excluir los
--   cancelados (la tabla tiene columna `cancelado` + índice idx_movs_no_cancelados; el frontend ya
--   los filtra). Un movimiento cancelado seguía afectando el efectivo esperado. Fix: AND cancelado = false.
--
-- DESC H4: aplicar_descuento_manual no validaba el estado del ticket → se podía aplicar un descuento
--   a un ticket ya PAGADO/FACTURADO/CANCELADO (bajando total_mxn por debajo de monto_pagado_mxn sin
--   que saliera efectivo). La UI solo muestra el botón en el carrito abierto, pero la RPC no tenía
--   defensa (replay offline / llamada directa). Fix: trigger que bloquea descuentos sobre tickets cerrados.

-- ── CIERRE H1 ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.calcular_efectivo_esperado(p_turno_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_turno          turnos%ROWTYPE;
  v_pagos_efectivo numeric(12,2);
  v_movimientos    numeric(12,2);
BEGIN
  SELECT * INTO v_turno FROM turnos WHERE id = p_turno_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(SUM(p.monto_mxn), 0) INTO v_pagos_efectivo
  FROM pagos p
  WHERE p.turno_id = p_turno_id
    AND p.metodo_pago = 'EFECTIVO'
    AND p.estado = 'APLICADO'
    AND p.deleted_at IS NULL;

  SELECT COALESCE(SUM(
    CASE
      WHEN tipo IN ('INYECCION_FONDO', 'AJUSTE_POSITIVO') THEN monto_mxn
      WHEN tipo IN ('SANGRIA', 'DEPOSITO', 'DEVOLUCION_EFECTIVO', 'PAGO_PROVEEDOR', 'AJUSTE_NEGATIVO') THEN -monto_mxn
      ELSE 0
    END
  ), 0) INTO v_movimientos
  FROM movimientos_caja
  WHERE turno_id = p_turno_id
    AND cancelado = false;   -- 0042: excluir movimientos cancelados

  RETURN v_turno.fondo_inicial_mxn + v_pagos_efectivo + v_movimientos;
END;
$function$;

-- ── DESC H4 ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bloquear_descuento_ticket_cerrado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estado ticket_estado_fiscal;
BEGIN
  SELECT estado_fiscal INTO v_estado FROM tickets WHERE id = NEW.ticket_id;
  IF v_estado IN ('PAGADO', 'FACTURADO', 'CANCELADO') THEN
    RAISE EXCEPTION 'No se puede aplicar un descuento a un ticket % (ya cerrado).', v_estado
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_descuento_ticket_cerrado ON ticket_descuentos_manuales;
CREATE TRIGGER trg_bloquear_descuento_ticket_cerrado
  BEFORE INSERT ON ticket_descuentos_manuales
  FOR EACH ROW
  EXECUTE FUNCTION bloquear_descuento_ticket_cerrado();
