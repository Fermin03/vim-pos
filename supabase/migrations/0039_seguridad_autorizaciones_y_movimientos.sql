-- 0039 — Endurecimiento de seguridad (hallazgos de auditoría de flujos).
--
-- BUG SEG (RLS sagrado): la RLS de `autorizaciones_pin` era FOR ALL con solo el check de
-- tenant → un cajero autenticado podía FORJAR una autorización (INSERT directo) y pasarla a
-- las RPC consumidoras, volviendo cosmético el PIN de supervisor. Y `movimientos_caja`
-- permitía INSERT directo de una SANGRÍA con autorizacion_pin_id NULL (salida de efectivo
-- sin permiso).
--
-- Fix:
--  (1) autorizaciones_pin → SELECT-only para authenticated. La creación legítima ya pasa por
--      verificar_autorizacion_pin / registrar_autorizacion_propia (SECURITY DEFINER, owner
--      postgres → bypassa RLS), así que el flujo real de PIN sigue funcionando; solo se mata
--      el INSERT/UPDATE/DELETE directo del cliente (forja/manipulación).
--  (2) movimientos_caja → trigger que exige una autorización VÁLIDA (no nula y existente en el
--      tenant) para los movimientos manuales de efectivo que la requieren. Como ya no se puede
--      forjar la autorización, un id válido implica que hubo PIN real de supervisor.

-- ── (1) autorizaciones_pin: solo lectura para el cliente ─────────────────────────────────
DROP POLICY IF EXISTS autorizaciones_tenant ON autorizaciones_pin;

CREATE POLICY autorizaciones_select ON autorizaciones_pin
  FOR SELECT TO authenticated
  USING (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));
-- (sin políticas de INSERT/UPDATE/DELETE para authenticated → denegadas; las funciones
--  SECURITY DEFINER (owner postgres) insertan sin verse afectadas por RLS).

-- ── (2) movimientos_caja: exigir autorización válida en salidas/entradas manuales ─────────
CREATE OR REPLACE FUNCTION exigir_autorizacion_movimiento_caja()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Solo los movimientos manuales que un cajero dispara desde el POS requieren PIN de
  -- supervisor. Los del sistema (FONDO_APERTURA, DEVOLUCION_EFECTIVO, AJUSTE_*) no.
  IF NEW.tipo IN ('SANGRIA', 'DEPOSITO', 'PAGO_PROVEEDOR', 'INYECCION_FONDO') THEN
    IF NEW.autorizacion_pin_id IS NULL THEN
      RAISE EXCEPTION 'El movimiento % requiere autorización de un supervisor (PIN).', NEW.tipo
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM autorizaciones_pin a
      WHERE a.id = NEW.autorizacion_pin_id
        AND a.tenant_id = NEW.tenant_id
    ) THEN
      RAISE EXCEPTION 'La autorización del movimiento % no es válida.', NEW.tipo
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_exigir_autorizacion_movimiento ON movimientos_caja;
CREATE TRIGGER trg_exigir_autorizacion_movimiento
  BEFORE INSERT ON movimientos_caja
  FOR EACH ROW
  EXECUTE FUNCTION exigir_autorizacion_movimiento_caja();
