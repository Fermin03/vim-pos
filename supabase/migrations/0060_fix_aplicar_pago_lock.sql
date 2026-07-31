-- 0060 — Fase 2 (remediación): bloqueo de fila (FOR UPDATE) en las funciones que leen y luego
-- modifican los totales/estado de un ticket. Evita la ventana de DOBLE COBRO.
--
-- Bug: aplicar_pago (0008) leia el ticket con "SELECT * INTO v_ticket FROM tickets WHERE id = ..."
-- SIN "FOR UPDATE". Dos pagos concurrentes al mismo ticket (multi-caja, liquidacion de delivery,
-- reabrir+recobrar) leian el mismo monto_pagado_mxn viejo, ambos pasaban el guard de sobrepago y
-- cobraban de mas. El "FOR UPDATE" serializa: el segundo pago espera a que el primero confirme y
-- entonces relee el monto_pagado_mxn ya actualizado por recalcular_totales_ticket.
--
-- Se aplica el mismo blindaje a cerrar_ticket_si_pagado (0008) y a cambiar_forma_pago_ticket /
-- reabrir_ticket_pagado (0058), que tambien leen-modifican el ticket. Migracion ADITIVA: reemplaza
-- los cuerpos (CREATE OR REPLACE) identicos salvo el FOR UPDATE.
--
-- Pendiente auditado, NO incluido aqui a proposito: crear_devolucion (0009) lee el ticket sin
-- FOR UPDATE. Su carrera (doble reembolso concurrente) es de baja probabilidad —los reembolsos son
-- raros y requieren PIN de supervisor— y su cuerpo es grande; se difiere a un fix dedicado para no
-- arriesgar esta migracion. Anotado en docs/REMEDIACION.md (Fase 2).


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

  -- Validar suma de pagos no exceda total (D42 — protege contra cobros dobles)
  v_pagado_actual := v_ticket.monto_pagado_mxn;
  IF NOT p_es_pago_al_recibir AND v_pagado_actual + p_monto_mxn > v_ticket.total_mxn + 0.01 THEN
    RAISE EXCEPTION 'El pago de % excede el total pendiente del ticket (total: %, pagado: %)',
      p_monto_mxn, v_ticket.total_mxn, v_pagado_actual;
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
;

CREATE OR REPLACE FUNCTION cerrar_ticket_si_pagado(p_ticket_id uuid)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket record;
BEGIN
  SELECT id, estado_fiscal, total_mxn, monto_pagado_mxn, monto_pendiente_mxn
  INTO v_ticket
  FROM tickets WHERE id = p_ticket_id FOR UPDATE;

  IF v_ticket.estado_fiscal = 'ABIERTO'
     AND v_ticket.total_mxn > 0
     AND v_ticket.monto_pendiente_mxn <= 0.01 THEN  -- tolerancia de redondeo
    UPDATE tickets
    SET estado_fiscal = 'PAGADO',
        fecha_pago = now(),
        usuario_cierre_id = auth.uid()
    WHERE id = p_ticket_id;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;
;

CREATE OR REPLACE FUNCTION cambiar_forma_pago_ticket(
  p_ticket_id              uuid,
  p_nuevo_metodo           metodo_pago,
  p_monto_recibido_mxn     numeric DEFAULT NULL,
  p_autorizacion_pin_id    uuid DEFAULT NULL,
  p_usuario_solicitante_id uuid DEFAULT NULL,
  p_usuario_autorizo_id    uuid DEFAULT NULL,
  p_nota                   text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket        tickets%ROWTYPE;
  v_turno_estado  turno_estado;
  v_n_pagos       int;
  v_pago          pagos%ROWTYPE;
  v_metodo_previo metodo_pago;
BEGIN
  SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket % no existe', p_ticket_id; END IF;

  IF v_ticket.estado_fiscal <> 'PAGADO' THEN
    RAISE EXCEPTION 'Solo se puede cambiar la forma de pago de una cuenta PAGADA (estado actual: %)', v_ticket.estado_fiscal;
  END IF;

  IF p_nuevo_metodo = 'PAGO_AL_RECIBIR' THEN
    RAISE EXCEPTION 'PAGO_AL_RECIBIR no es una forma de pago liquidada; no aplica aquí.';
  END IF;

  -- El turno de la cuenta debe seguir abierto (si no, se tocaría un corte ya cerrado).
  SELECT estado INTO v_turno_estado FROM turnos WHERE id = v_ticket.turno_id;
  IF v_turno_estado <> 'ABIERTO' THEN
    RAISE EXCEPTION 'No se puede cambiar la forma de pago: el turno de esa cuenta ya se cerró.';
  END IF;

  SELECT count(*) INTO v_n_pagos
  FROM pagos
  WHERE ticket_id = p_ticket_id AND estado IN ('APLICADO', 'CONCILIADO') AND deleted_at IS NULL;

  IF v_n_pagos = 0 THEN
    RAISE EXCEPTION 'La cuenta no tiene pagos aplicados.';
  ELSIF v_n_pagos > 1 THEN
    RAISE EXCEPTION 'La cuenta tiene pago dividido; cambiar la forma de pago no está disponible para pagos divididos.';
  END IF;

  SELECT * INTO v_pago
  FROM pagos
  WHERE ticket_id = p_ticket_id AND estado IN ('APLICADO', 'CONCILIADO') AND deleted_at IS NULL
  LIMIT 1;

  v_metodo_previo := v_pago.metodo_pago;
  IF v_metodo_previo = p_nuevo_metodo THEN
    RAISE EXCEPTION 'El pago ya está registrado como %.', p_nuevo_metodo;
  END IF;

  UPDATE pagos
  SET metodo_pago        = p_nuevo_metodo,
      monto_recibido_mxn = CASE WHEN p_nuevo_metodo = 'EFECTIVO'
                                THEN COALESCE(p_monto_recibido_mxn, monto_mxn) ELSE NULL END,
      cambio_mxn         = CASE WHEN p_nuevo_metodo = 'EFECTIVO'
                                THEN GREATEST(0, COALESCE(p_monto_recibido_mxn, monto_mxn) - monto_mxn) ELSE 0 END,
      nota               = COALESCE(p_nota, nota),
      updated_at         = now()
  WHERE id = v_pago.id;

  INSERT INTO auditoria_eventos (
    tenant_id, sucursal_id, caja_id, turno_id,
    usuario_id, categoria, evento_codigo,
    entidad_tipo, entidad_id, payload, dia_contable
  ) VALUES (
    v_ticket.tenant_id, v_ticket.sucursal_id, v_ticket.caja_id, v_ticket.turno_id,
    COALESCE(p_usuario_autorizo_id, p_usuario_solicitante_id), 'COBRO', 'pago.metodo_cambiado',
    'pago', v_pago.id,
    jsonb_build_object(
      'ticket_id', p_ticket_id,
      'folio', v_ticket.folio_completo,
      'metodo_anterior', v_metodo_previo,
      'metodo_nuevo', p_nuevo_metodo,
      'monto_mxn', v_pago.monto_mxn,
      'autorizacion_pin_id', p_autorizacion_pin_id,
      'solicitante_id', p_usuario_solicitante_id,
      'autorizo_id', p_usuario_autorizo_id
    ),
    v_ticket.dia_contable
  );
END;
$$;
;

CREATE OR REPLACE FUNCTION reabrir_ticket_pagado(
  p_ticket_id              uuid,
  p_motivo                 text,
  p_autorizacion_pin_id    uuid DEFAULT NULL,
  p_usuario_solicitante_id uuid DEFAULT NULL,
  p_usuario_autorizo_id    uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket        tickets%ROWTYPE;
  v_turno_estado  turno_estado;
  v_modulo_inv    boolean;
  v_item          record;
  v_componente    record;
BEGIN
  SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket % no existe', p_ticket_id; END IF;

  IF v_ticket.estado_fiscal = 'FACTURADO' THEN
    RAISE EXCEPTION 'La cuenta ya está facturada (CFDI emitido); cancélala en vez de reabrirla.';
  END IF;
  IF v_ticket.estado_fiscal <> 'PAGADO' THEN
    RAISE EXCEPTION 'Solo se puede reabrir una cuenta PAGADA (estado actual: %)', v_ticket.estado_fiscal;
  END IF;

  SELECT estado INTO v_turno_estado FROM turnos WHERE id = v_ticket.turno_id;
  IF v_turno_estado <> 'ABIERTO' THEN
    RAISE EXCEPTION 'No se puede reabrir: el turno de esa cuenta ya se cerró.';
  END IF;

  -- Reversar el inventario descontado al pagar (entrada por receta). Espejo de
  -- descontar_inventario_por_venta; no-op si el módulo de inventario está apagado.
  SELECT ct.modulo_inventario_activo INTO v_modulo_inv
  FROM configuracion_tenant ct WHERE ct.tenant_id = v_ticket.tenant_id;
  IF COALESCE(v_modulo_inv, false) THEN
    FOR v_item IN
      SELECT ti.producto_id, ti.cantidad
      FROM ticket_items ti
      WHERE ti.ticket_id = p_ticket_id AND ti.cancelado = false AND ti.producto_id IS NOT NULL
    LOOP
      FOR v_componente IN
        SELECT rc.insumo_id, rc.cantidad AS cantidad_unitaria
        FROM receta_componentes rc
        JOIN recetas r ON r.id = rc.receta_id
        WHERE r.producto_id = v_item.producto_id AND r.activa = true
      LOOP
        PERFORM aplicar_movimiento_inventario(
          p_tenant_id   := v_ticket.tenant_id,
          p_sucursal_id := v_ticket.sucursal_id,
          p_insumo_id   := v_componente.insumo_id,
          p_tipo        := 'REVERSA_CANCELACION',
          p_cantidad    := v_componente.cantidad_unitaria * v_item.cantidad,
          p_descripcion := 'Reapertura de cuenta ' || COALESCE(v_ticket.folio_completo, p_ticket_id::text),
          p_ticket_id   := p_ticket_id
        );
      END LOOP;
    END LOOP;
  END IF;

  -- Anular los pagos → recalcular_totales_ticket (trigger) baja monto_pagado a 0.
  UPDATE pagos
  SET estado     = 'CANCELADO',
      deleted_at = now(),
      updated_at = now()
  WHERE ticket_id = p_ticket_id AND estado IN ('APLICADO', 'CONCILIADO') AND deleted_at IS NULL;

  -- Volver a ABIERTO (transición habilitada en la Parte 1). Folio se conserva.
  UPDATE tickets
  SET estado_fiscal     = 'ABIERTO',
      fecha_pago        = NULL,
      usuario_cierre_id = NULL,
      updated_at        = now()
  WHERE id = p_ticket_id;

  INSERT INTO auditoria_eventos (
    tenant_id, sucursal_id, caja_id, turno_id,
    usuario_id, categoria, evento_codigo,
    entidad_tipo, entidad_id, payload, dia_contable
  ) VALUES (
    v_ticket.tenant_id, v_ticket.sucursal_id, v_ticket.caja_id, v_ticket.turno_id,
    COALESCE(p_usuario_autorizo_id, p_usuario_solicitante_id), 'COBRO', 'ticket.reabierto',
    'ticket', p_ticket_id,
    jsonb_build_object(
      'folio', v_ticket.folio_completo,
      'total_mxn', v_ticket.total_mxn,
      'motivo', p_motivo,
      'autorizacion_pin_id', p_autorizacion_pin_id,
      'solicitante_id', p_usuario_solicitante_id,
      'autorizo_id', p_usuario_autorizo_id
    ),
    v_ticket.dia_contable
  );
END;
$$;
;
