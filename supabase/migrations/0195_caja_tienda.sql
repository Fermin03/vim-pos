-- 0195 · La caja de tienda (Giro RETAIL, entrega 4).
-- §1 Candados pendientes de la entrega 1. §2 La venta de tienda no va a cocina.

-- ── §1 Candados del renglón cobrado y de los movimientos ─────────────────────
-- Un renglón cobrado no cambia de producto: los movimientos de existencias ya se colgaron de él.
CREATE OR REPLACE FUNCTION trg_ticket_items_producto_fijo()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.producto_id IS DISTINCT FROM OLD.producto_id
     AND EXISTS (SELECT 1 FROM tickets t WHERE t.id = NEW.ticket_id AND t.estado_fiscal IN ('PAGADO', 'FACTURADO')) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: no se cambia el producto de un renglón cobrado' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_ticket_items_producto_fijo ON ticket_items;
CREATE TRIGGER trg_ticket_items_producto_fijo
  BEFORE UPDATE OF producto_id ON ticket_items
  FOR EACH ROW EXECUTE FUNCTION trg_ticket_items_producto_fijo();

-- Igual que 0189 y además: lo que el movimiento referencia (ticket, renglón, devolución, traspaso,
-- proveedor) es del mismo negocio.
CREATE OR REPLACE FUNCTION movimientos_producto_validar()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM productos p WHERE p.id = NEW.producto_id AND p.tenant_id = NEW.tenant_id
                   AND p.controla_existencias AND p.variante_ejes IS NULL) THEN
    RAISE EXCEPTION 'MOVIMIENTO_INVALIDO: el producto no lleva existencias en este negocio' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sucursales s WHERE s.id = NEW.sucursal_id AND s.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'MOVIMIENTO_INVALIDO: la sucursal no es de este negocio' USING ERRCODE = '23514';
  END IF;
  IF (NEW.ticket_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tickets x WHERE x.id = NEW.ticket_id AND x.tenant_id = NEW.tenant_id))
     OR (NEW.ticket_item_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ticket_items x WHERE x.id = NEW.ticket_item_id AND x.tenant_id = NEW.tenant_id))
     OR (NEW.devolucion_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM devoluciones x WHERE x.id = NEW.devolucion_id AND x.tenant_id = NEW.tenant_id))
     OR (NEW.traspaso_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM traspasos_producto x WHERE x.id = NEW.traspaso_id AND x.tenant_id = NEW.tenant_id))
     OR (NEW.proveedor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM proveedores x WHERE x.id = NEW.proveedor_id AND x.tenant_id = NEW.tenant_id)) THEN
    RAISE EXCEPTION 'MOVIMIENTO_INVALIDO: el movimiento apunta a algo de otro negocio' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- Igual que 0189 salvo el orden: los renglones se recorren por producto, así dos cobros a la vez
-- toman los candados de existencias en el mismo orden.
CREATE OR REPLACE FUNCTION _existencias_sincronizar_ticket(p_ticket uuid, p_es_cobro boolean, p_item uuid DEFAULT NULL, p_devolucion uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_tk     tickets%ROWTYPE;
  v_canc   record;
  v_it     record;
  v_dev    numeric;
  v_debe   numeric;
  v_hecho  numeric;
  v_dif    numeric;
BEGIN
  SELECT * INTO v_tk FROM tickets WHERE id = p_ticket FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT c.reversar_inventario, c.ticket_estado_fiscal_previo INTO v_canc
    FROM cancelaciones_ticket c WHERE c.ticket_id = p_ticket ORDER BY c.created_at DESC, c.id DESC LIMIT 1;

  FOR v_it IN
    SELECT ti.id, ti.producto_id, ti.cantidad, ti.cancelado
      FROM ticket_items ti JOIN productos p ON p.id = ti.producto_id
     WHERE ti.ticket_id = p_ticket AND p.controla_existencias
     ORDER BY ti.producto_id, ti.id
  LOOP
    SELECT COALESCE(sum(di.cantidad_devuelta), 0) INTO v_dev
      FROM devolucion_items di JOIN devoluciones d ON d.id = di.devolucion_id
     WHERE di.ticket_item_id_original = v_it.id AND d.estado = 'CONFIRMADA'
       AND d.reversar_inventario AND di.reversar_inventario_item;

    v_debe := CASE
      WHEN v_it.cancelado THEN 0
      WHEN v_tk.estado_fiscal IN ('PAGADO', 'FACTURADO') THEN -v_it.cantidad + v_dev
      WHEN v_tk.estado_fiscal = 'CANCELADO'
           AND v_canc.ticket_estado_fiscal_previo IN ('PAGADO', 'FACTURADO')
           AND NOT v_canc.reversar_inventario THEN -v_it.cantidad + v_dev
      ELSE 0 END;
    v_debe := LEAST(v_debe, 0);   -- nunca se regresa más de lo vendido

    -- R5: una línea sin movimientos solo se registra en el cobro, o si es la línea que cambió (p_item).
    IF NOT (p_es_cobro OR COALESCE(v_it.id = p_item, false)) AND NOT EXISTS (SELECT 1 FROM movimientos_producto m WHERE m.ticket_item_id = v_it.id) THEN CONTINUE; END IF;
    SELECT COALESCE(sum(m.cantidad), 0) INTO v_hecho FROM movimientos_producto m WHERE m.ticket_item_id = v_it.id;
    v_dif := v_debe - v_hecho;
    IF v_dif <> 0 THEN
      INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad,
                                        ticket_id, ticket_item_id, devolucion_id, motivo, usuario_id)
      VALUES (v_tk.tenant_id, v_tk.sucursal_id, v_it.producto_id,
              CASE WHEN v_dif < 0 THEN 'VENTA' ELSE 'DEVOLUCION' END::movimiento_producto_tipo,
              v_dif, p_ticket, v_it.id, CASE WHEN v_dif > 0 THEN p_devolucion END,
              'Ticket ' || COALESCE(v_tk.folio_completo, p_ticket::text), auth.uid());
    END IF;
  END LOOP;
END;
$$;
