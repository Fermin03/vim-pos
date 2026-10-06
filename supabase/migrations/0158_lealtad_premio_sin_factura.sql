-- 0158 · Una cuenta con premio de lealtad no se factura individual (ADR 0030, plan 1B).
--
-- Decisión de producto (6 oct 2026): el producto de regalo sale en $0.00 y esa cuenta no admite
-- factura individual. La razón es fiscal: la factura individual arma un concepto por renglón, y el
-- renglón premiado saldría con descuento igual a su importe y base de traslado en cero, que el
-- Anexo 20 puede rechazar. La factura GLOBAL no tiene ese problema: arma un concepto por ticket y
-- por tasa (armarConceptosGlobal), así que el regalo se suma al resto de la cuenta. Por eso la
-- cuenta con premio SÍ entra en la global —lo que el cliente pagó es ingreso y debe quedar
-- amparado—, salvo la que es solo el premio: total $0, nada que amparar, y sería un concepto en cero.
--
-- El canje de puntos por dinero no pasa por aquí: es un descuento sobre la cuenta, como cualquiera.
-- Corre también en el Postgres de cada caja: ahí nadie factura, y todo esto es inocuo.

-- ¿La cuenta lleva un premio de producto vivo? SECURITY INVOKER a propósito: un empleado solo ve
-- los canjes de su negocio (RLS de 0156) y las funciones definer que la llaman ven todo.
CREATE OR REPLACE FUNCTION ticket_lleva_premio(p_ticket_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM ticket_canjes_lealtad
     WHERE ticket_id = p_ticket_id AND ticket_item_id IS NOT NULL AND NOT revertido);
$$;
COMMENT ON FUNCTION ticket_lleva_premio(uuid) IS
  'TRUE si la cuenta lleva un premio de producto de lealtad sin revertir. Esas cuentas no admiten factura individual (0158).';
REVOKE ALL ON FUNCTION ticket_lleva_premio(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION ticket_lleva_premio(uuid) TO authenticated, service_role;

-- El candado. Los dos caminos de la factura individual —el portal (autofacturar) y el admin
-- (cfdi_crear_borrador)— terminan en este INSERT. Las globales no tienen ticket_id y pasan; las
-- notas de crédito (EGRESO) también.
CREATE OR REPLACE FUNCTION trg_cfdi_sin_premio()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tipo_comprobante = 'INGRESO' AND NEW.ticket_id IS NOT NULL AND ticket_lleva_premio(NEW.ticket_id) THEN
    RAISE EXCEPTION 'Esta venta incluye un premio de lealtad y no se factura de forma individual. Queda amparada en la factura global.'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tickets_cfdi_sin_premio ON tickets_cfdi;
CREATE TRIGGER trg_tickets_cfdi_sin_premio
  BEFORE INSERT ON tickets_cfdi
  FOR EACH ROW EXECUTE FUNCTION trg_cfdi_sin_premio();

-- La global: cuerpo copiado ÍNTEGRO de 0082_factura_global.sql:231-247 (única definición vigente).
-- El único cambio es la última condición, marcada con «0158».
CREATE OR REPLACE FUNCTION tickets_de_periodo_global(p_tenant_id uuid, p_desde date, p_hasta date)
RETURNS TABLE (ticket_id uuid, folio varchar, total_mxn numeric)
LANGUAGE sql
STABLE
AS $$
  SELECT t.id, t.folio_completo, t.total_mxn
    FROM tickets t
   WHERE t.tenant_id = p_tenant_id
     AND t.dia_contable BETWEEN p_desde AND p_hasta
     AND t.estado_fiscal = 'PAGADO'
     AND NOT EXISTS (
       SELECT 1 FROM tickets_cfdi c
        WHERE c.ticket_id = t.id
          AND c.tipo_comprobante = 'INGRESO'
          AND c.estado_sat IN ('TIMBRADO', 'EN_PROCESO_CANCELACION')
     )
     AND NOT EXISTS (SELECT 1 FROM cfdi_global_tickets g WHERE g.ticket_id = t.id)
     -- 0158: una cuenta que es solo un premio de lealtad no tiene ingreso que amparar.
     AND NOT (t.total_mxn = 0 AND ticket_lleva_premio(t.id))
   ORDER BY t.dia_contable, t.folio_completo;
$$;
