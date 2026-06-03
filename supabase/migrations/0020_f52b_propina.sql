-- F5.2b — Propina: fijar propina en el ticket y permitir cobrar total + propina.
-- Modelo: la propina viaja DENTRO del pago (monto_mxn = total + propina). monto_pendiente_mxn
-- es GENERATED (total - pagado); al pagar total+propina queda <= 0 y cerrar_ticket_si_pagado
-- transiciona a PAGADO. El cambio se calcula sobre recibido - monto (incluye la propina).
-- Por eso el ÚNICO cambio en aplicar_pago es subir el tope anti-doble-cobro a total+propina.

-- ============================================================
-- establecer_propina_ticket — fija tickets.propina_mxn (RLS por el invocador)
-- ============================================================
CREATE OR REPLACE FUNCTION establecer_propina_ticket(
  p_ticket_id uuid,
  p_monto_mxn numeric
) RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_monto_mxn IS NULL OR p_monto_mxn < 0 THEN
    RAISE EXCEPTION 'PROPINA_INVALIDA';
  END IF;
  UPDATE tickets
     SET propina_mxn = p_monto_mxn, updated_at = now()
   WHERE id = p_ticket_id
     AND estado_fiscal NOT IN ('CANCELADO');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket % no editable', p_ticket_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION establecer_propina_ticket IS
  'F5.2b — fija tickets.propina_mxn. SECURITY INVOKER: RLS la valida bajo el empleado.';
REVOKE EXECUTE ON FUNCTION establecer_propina_ticket FROM anon, public;
GRANT EXECUTE ON FUNCTION establecer_propina_ticket TO authenticated;

-- ============================================================
-- aplicar_pago — copia íntegra de 0008 con UN solo cambio: el tope sube a total + propina.
-- ============================================================
CREATE OR REPLACE FUNCTION aplicar_pago(
  p_ticket_id       uuid,
  p_metodo_pago     metodo_pago,
  p_monto_mxn       numeric(12,2),
  p_monto_recibido_mxn numeric(12,2) DEFAULT NULL,    -- solo efectivo
  p_referencia      varchar DEFAULT NULL,
  p_terminal_aprobacion varchar DEFAULT NULL,
  p_folio_externo   varchar DEFAULT NULL,
  p_es_pago_al_recibir boolean DEFAULT false,
  p_nota            text DEFAULT NULL,
  p_client_id_local varchar DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket       record;
  v_pago_id      uuid;
  v_cambio       numeric(12,2) := 0;
  v_pagado_actual numeric(12,2);
  v_estado_pago  pago_estado;
BEGIN
  -- Obtener ticket
  SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket % no existe', p_ticket_id; END IF;
  IF v_ticket.estado_fiscal NOT IN ('ABIERTO', 'BORRADOR') THEN
    RAISE EXCEPTION 'No se puede aplicar pago a un ticket en estado %', v_ticket.estado_fiscal;
  END IF;

  -- Idempotencia
  IF p_client_id_local IS NOT NULL THEN
    SELECT id INTO v_pago_id FROM pagos
    WHERE tenant_id = v_ticket.tenant_id AND client_id_local = p_client_id_local;
    IF FOUND THEN RETURN v_pago_id; END IF;
  END IF;

  -- Validar suma de pagos no exceda total + propina (D42 — protege contra cobros dobles).
  -- F5.2b: la propina se cobra dentro del pago, por eso el tope sube a total + propina.
  v_pagado_actual := v_ticket.monto_pagado_mxn;
  IF NOT p_es_pago_al_recibir AND v_pagado_actual + p_monto_mxn > v_ticket.total_mxn + v_ticket.propina_mxn + 0.01 THEN
    RAISE EXCEPTION 'El pago de % excede el total + propina del ticket (total: %, propina: %, pagado: %)',
      p_monto_mxn, v_ticket.total_mxn, v_ticket.propina_mxn, v_pagado_actual;
  END IF;

  -- Calcular cambio si efectivo
  IF p_metodo_pago = 'EFECTIVO' AND p_monto_recibido_mxn IS NOT NULL THEN
    v_cambio := GREATEST(0, p_monto_recibido_mxn - p_monto_mxn);
  END IF;

  -- Estado del pago
  v_estado_pago := CASE
    WHEN p_es_pago_al_recibir THEN 'PENDIENTE'
    WHEN p_metodo_pago IN ('APP_RAPPI', 'APP_UBEREATS', 'APP_DIDI', 'APP_IFOOD', 'APP_OTRO') THEN 'APLICADO'
    ELSE 'APLICADO'
  END;

  -- Insertar pago
  INSERT INTO pagos (
    tenant_id, sucursal_id, caja_id, turno_id, ticket_id,
    metodo_pago, monto_mxn, monto_recibido_mxn, cambio_mxn,
    referencia, terminal_aprobacion, folio_externo,
    es_pago_al_recibir, estado,
    usuario_id, nota, client_id_local, created_by
  ) VALUES (
    v_ticket.tenant_id, v_ticket.sucursal_id, v_ticket.caja_id, v_ticket.turno_id, p_ticket_id,
    p_metodo_pago, p_monto_mxn, p_monto_recibido_mxn, v_cambio,
    p_referencia, p_terminal_aprobacion, p_folio_externo,
    p_es_pago_al_recibir, v_estado_pago,
    auth.uid(), p_nota, p_client_id_local, auth.uid()
  ) RETURNING id INTO v_pago_id;

  -- recalcular_totales_ticket() ya fue invocada por trigger

  -- Si el ticket queda completamente pagado, transicionar a PAGADO
  PERFORM cerrar_ticket_si_pagado(p_ticket_id);

  RETURN v_pago_id;
END;
$$;

COMMENT ON FUNCTION aplicar_pago IS 'Aplica un pago al ticket. Si los pagos suman el total (+propina F5.2b), transiciona automáticamente a PAGADO.';
