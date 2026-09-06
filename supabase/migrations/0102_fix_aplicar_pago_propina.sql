-- 0102 — La mesa no se liberaba al cobrarla: el cobro CON PROPINA lo rechazaba la base.
--
-- Cadena real del síntoma: el cajero elige propina en el modal de cobro → el POS manda
-- aplicar_pago por (total + propina) → la RPC lo rechaza como sobrepago → el ticket se queda
-- ABIERTO → trg_ticket_liberar_mesa (0038) nunca corre → tickets_mesas conserva
-- fecha_liberacion NULL → la mesa se queda OCUPADA. Y como asignar_mesa_a_ticket (0010) exige
-- que la mesa esté LIBRE/RESERVADA/EN_LIMPIEZA, esa mesa ya no se puede volver a usar.
--
-- Causa raíz: la 0020 (F5.2b) había subido el tope del guard de sobrepago a
-- `total_mxn + propina_mxn`, porque la propina se cobra DENTRO del pago pero a propósito NO
-- entra en total_mxn (los reportes y el corte la suman aparte: 0011, 0049). La 0060 —el fix
-- del doble cobro— reescribió aplicar_pago partiendo del cuerpo de la 0008 en vez del de la
-- 0020, y al hacerlo se llevó por delante el `+ propina_mxn`. Desde entonces (31/07/2026)
-- TODO cobro con propina falla con "El pago de X excede el total pendiente del ticket".
--
-- Este es el cuerpo de la 0060 —FOR UPDATE incluido, que sigue siendo necesario contra el doble
-- cobro— con el tope de la 0020 restaurado. Nada más cambia.
--
-- Cubierto por supabase/scripts/smoke_propina.sql (que llevaba en rojo desde la 0060) y por
-- smoke_cuenta_mesa.sql, que ahora cobra con propina y verifica que la mesa quede LIBRE.

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
  -- Obtener ticket (FOR UPDATE: 0060, serializa dos pagos concurrentes al mismo ticket)
  SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket_id FOR UPDATE;
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

COMMENT ON FUNCTION aplicar_pago IS
  'Aplica un pago al ticket. Si los pagos suman el total (+propina F5.2b), transiciona automáticamente a PAGADO. FOR UPDATE contra el doble cobro (0060).';
