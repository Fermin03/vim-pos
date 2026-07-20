-- 0058 — Consulta de cuentas: cambiar forma de pago + reabrir cuenta pagada.
--
-- Contexto (descubierto al diseñar): el efectivo del corte NO vive en movimientos_caja para las
-- ventas; calcular_efectivo_esperado (0011) lo lee directo de `pagos` (SUM WHERE metodo='EFECTIVO'
-- AND estado='APLICADO' AND deleted_at IS NULL). Por eso:
--   • Cambiar forma de pago = UPDATE del metodo_pago del pago → el arqueo se recalcula solo.
--   • Reabrir = anular los pagos (estado CANCELADO + deleted_at) → monto_pagado baja a 0 y el
--     efectivo sale del esperado; luego el ticket vuelve a ABIERTO.
-- No se toca movimientos_caja a mano en ninguno de los dos: no hay riesgo de descuadre.
--
-- Seguridad: SECURITY INVOKER (default), igual que cancelar_ticket_pagado. RLS aísla por tenant
-- vía el JWT del empleado; el SELECT del ticket solo devuelve filas del propio tenant.

-- ── Parte 1: permitir la transición PAGADO → ABIERTO (reabrir) ────────────────
-- La validación original (0008) prohíbe PAGADO→ABIERTO a propósito. Reabrir es ahora una
-- transición de negocio válida (controlada por permiso venta.editar_post_cobro en el POS).
-- Se reemplaza el cuerpo agregando 'ABIERTO' como destino permitido desde PAGADO; el resto igual.
CREATE OR REPLACE FUNCTION trg_ticket_validar_estado_fiscal() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.estado_fiscal IS DISTINCT FROM NEW.estado_fiscal THEN
    IF NOT (
      (OLD.estado_fiscal = 'BORRADOR'  AND NEW.estado_fiscal IN ('ABIERTO', 'CANCELADO'))
      OR (OLD.estado_fiscal = 'ABIERTO'   AND NEW.estado_fiscal IN ('PAGADO', 'CANCELADO'))
      OR (OLD.estado_fiscal = 'PAGADO'    AND NEW.estado_fiscal IN ('FACTURADO', 'CANCELADO', 'ABIERTO'))
      OR (OLD.estado_fiscal = 'FACTURADO' AND NEW.estado_fiscal = 'CANCELADO')
    ) THEN
      RAISE EXCEPTION 'Transición de estado_fiscal no permitida: % → %', OLD.estado_fiscal, NEW.estado_fiscal;
    END IF;

    IF NEW.estado_fiscal = 'PAGADO' AND NEW.fecha_pago IS NULL THEN
      NEW.fecha_pago := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ── Parte 2: cambiar la forma de pago de una cuenta ya pagada ─────────────────
-- Caso típico: el cajero marcó "efectivo" cuando fue tarjeta (o al revés). Solo en el turno
-- abierto (cambiarlo en un turno cerrado alteraría un corte ya finalizado). Requiere autorización
-- (venta.editar_post_cobro) resuelta en el frontend; aquí se recibe el id de la autorización.
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
  SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket_id;
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

COMMENT ON FUNCTION cambiar_forma_pago_ticket IS
  'Cambia la forma de pago de una cuenta PAGADA (turno abierto, pago único). El corte recalcula el efectivo solo porque lo lee de pagos. Requiere autorización venta.editar_post_cobro.';

-- ── Parte 3: reabrir una cuenta pagada (volver a ABIERTO para editar) ─────────
-- Anula los pagos y devuelve el ticket a ABIERTO. Reversa el inventario descontado al pagar
-- (se volverá a descontar cuando se re-cobre → neto correcto). No aplica a FACTURADO (CFDI emitido:
-- ahí se cancela, no se reabre). Solo en turno abierto.
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
  SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket_id;
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

COMMENT ON FUNCTION reabrir_ticket_pagado IS
  'Reabre una cuenta PAGADA (turno abierto): anula los pagos, reversa el inventario y vuelve el ticket a ABIERTO conservando el folio. No aplica a FACTURADO. Requiere autorización venta.editar_post_cobro.';
