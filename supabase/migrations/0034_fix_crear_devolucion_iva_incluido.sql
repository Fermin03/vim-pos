-- F6.3 fix #33 — crear_devolucion (0009) calculaba el total a devolver como
--   subtotal_bruto_mxn + iva_item_mxn
-- pero en VIM los precios son IVA-INCLUIDO: subtotal_bruto_mxn YA incluye el IVA
-- (ej. hamburguesa 120 = subtotal_bruto 120, iva 16.55, total_item 120). Sumar otra vez
-- el IVA daba 136.55 → se REEMBOLSABA DE MÁS por el monto del IVA. Fix: el total a devolver
-- es total_item_mxn (proporcional a la cantidad devuelta); el subtotal = total - iva.
-- Cazado por smoke_devolucion.sql (Modelo B). Re-crea la función con el cálculo corregido.

CREATE OR REPLACE FUNCTION public.crear_devolucion(p_ticket_original_id uuid, p_caja_id uuid, p_turno_id uuid, p_alcance devolucion_alcance, p_motivo devolucion_motivo, p_motivo_texto text, p_medio_devolucion devolucion_medio, p_autorizacion_pin_id uuid, p_usuario_solicitante_id uuid, p_usuario_autorizo_id uuid, p_items jsonb, p_reversar_inventario boolean DEFAULT true, p_cliente_id uuid DEFAULT NULL::uuid, p_nota text DEFAULT NULL::text, p_client_id_local character varying DEFAULT NULL::character varying)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_tenant_id     uuid := current_tenant_id();
  v_ticket        tickets%ROWTYPE;
  v_devolucion_id uuid;
  v_item_input    jsonb;
  v_ti            ticket_items%ROWTYPE;
  v_subtotal      numeric(12,2) := 0;
  v_iva           numeric(12,2) := 0;
  v_cantidad_dev  numeric(12,3);
  v_subtotal_item numeric(12,2);
  v_iva_item      numeric(12,2);
  v_total_item    numeric(12,2);
BEGIN
  -- Idempotencia
  IF p_client_id_local IS NOT NULL THEN
    SELECT id INTO v_devolucion_id
    FROM devoluciones
    WHERE tenant_id = v_tenant_id AND client_id_local = p_client_id_local;
    IF FOUND THEN
      RETURN v_devolucion_id;
    END IF;
  END IF;

  -- Validar ticket
  SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket_original_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket % no existe', p_ticket_original_id;
  END IF;

  IF v_ticket.estado_fiscal NOT IN ('PAGADO', 'FACTURADO') THEN
    RAISE EXCEPTION 'Solo se pueden devolver tickets PAGADOS o FACTURADOS, no %', v_ticket.estado_fiscal;
  END IF;

  -- Insertar devolución (BORRADOR inicial)
  INSERT INTO devoluciones (
    tenant_id, sucursal_id, caja_id, turno_id,
    ticket_original_id, ticket_folio_snapshot, ticket_dia_contable_snapshot,
    alcance, motivo, motivo_texto, medio_devolucion,
    total_devuelto_mxn, subtotal_devuelto_mxn, iva_devuelto_mxn,
    autorizacion_pin_id, usuario_solicitante_id, usuario_autorizo_id,
    reversar_inventario, cliente_id, nota, client_id_local,
    estado, created_by
  ) VALUES (
    v_tenant_id, v_ticket.sucursal_id, p_caja_id, p_turno_id,
    p_ticket_original_id, v_ticket.folio_completo, v_ticket.dia_contable,
    p_alcance, p_motivo, p_motivo_texto, p_medio_devolucion,
    0, 0, 0,                          -- se calculan abajo
    p_autorizacion_pin_id, p_usuario_solicitante_id, p_usuario_autorizo_id,
    p_reversar_inventario, p_cliente_id, p_nota, p_client_id_local,
    'BORRADOR', p_usuario_solicitante_id
  ) RETURNING id INTO v_devolucion_id;

  -- Insertar items y calcular totales
  FOR v_item_input IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_ti FROM ticket_items
    WHERE id = (v_item_input->>'ticket_item_id')::uuid
      AND ticket_id = p_ticket_original_id
      AND cancelado = false;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item % no encontrado en ticket original', v_item_input->>'ticket_item_id';
    END IF;

    v_cantidad_dev := (v_item_input->>'cantidad_devuelta')::numeric;

    IF v_cantidad_dev <= 0 OR v_cantidad_dev > v_ti.cantidad THEN
      RAISE EXCEPTION 'Cantidad devuelta % inválida para item % (max %)',
        v_cantidad_dev, v_ti.id, v_ti.cantidad;
    END IF;

    -- Calcular proporcional al subtotal/iva del item
    v_total_item    := ROUND(v_ti.total_item_mxn * v_cantidad_dev / v_ti.cantidad, 2);  -- FIX #33: total ya incluye IVA
    v_iva_item      := ROUND(v_ti.iva_item_mxn * v_cantidad_dev / v_ti.cantidad, 2);
    v_subtotal_item := v_total_item - v_iva_item;  -- FIX #33: subtotal = total - iva (no sumar)

    INSERT INTO devolucion_items (
      tenant_id, devolucion_id, ticket_item_id_original,
      producto_id, producto_nombre_snapshot, producto_sku_snapshot,
      cantidad_original, cantidad_devuelta,
      precio_unitario_snapshot, tasa_iva_snapshot, iva_incluido_en_precio_snapshot,
      subtotal_devuelto_mxn, iva_devuelto_mxn, total_devuelto_mxn,
      reversar_inventario_item, created_by
    ) VALUES (
      v_tenant_id, v_devolucion_id, v_ti.id,
      v_ti.producto_id, v_ti.producto_nombre_snapshot, v_ti.producto_sku_snapshot,
      v_ti.cantidad, v_cantidad_dev,
      v_ti.precio_unitario_snapshot, v_ti.tasa_iva_snapshot, v_ti.iva_incluido_en_precio_snapshot,
      v_subtotal_item, v_iva_item, v_total_item,
      COALESCE((v_item_input->>'reversar_inventario_item')::boolean, p_reversar_inventario),
      p_usuario_solicitante_id
    );

    v_subtotal := v_subtotal + v_subtotal_item;
    v_iva      := v_iva + v_iva_item;
  END LOOP;

  -- Actualizar totales de la devolución
  UPDATE devoluciones
  SET subtotal_devuelto_mxn = v_subtotal,
      iva_devuelto_mxn      = v_iva,
      total_devuelto_mxn    = v_subtotal + v_iva,
      updated_by            = p_usuario_solicitante_id
  WHERE id = v_devolucion_id;

  RETURN v_devolucion_id;
END;
$function$

;
