-- 0201 · Reabrir y cambiar el pago de la venta de un cambio de talla sin descuadrar el cajón (Giro RETAIL, entrega 5).
-- La venta de un cambio trae un pago interno en EFECTIVO por lo que regresa (0196: client_id_local
-- del ticket || '-pago') que compensa la salida en efectivo de la devolución: cancelarlo al reabrir, o
-- pasarlo a tarjeta, bajaría el efectivo esperado sin que haya salido nada del cajón.
-- Las dos funciones son las de la 0134 con los cambios marcados "0201"; siguen SECURITY INVOKER y
-- CREATE OR REPLACE conserva sus permisos.

CREATE OR REPLACE FUNCTION public.cambiar_forma_pago_ticket(p_ticket_id uuid, p_nuevo_metodo metodo_pago, p_monto_recibido_mxn numeric DEFAULT NULL::numeric, p_autorizacion_pin_id uuid DEFAULT NULL::uuid, p_usuario_solicitante_id uuid DEFAULT NULL::uuid, p_usuario_autorizo_id uuid DEFAULT NULL::uuid, p_nota text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_ticket        tickets%ROWTYPE;
  v_turno_estado  turno_estado;
  v_n_pagos       int;
  v_pago          pagos%ROWTYPE;
  v_metodo_previo metodo_pago;
  v_solicitante   uuid;
  v_autorizo      uuid;
  v_interno       text;   -- 0201
BEGIN
  SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket % no existe', p_ticket_id; END IF;
  -- 0201: en la venta de un cambio, el pago interno (la prenda devuelta) no cuenta ni se toca.
  IF _ticket_es_de_cambio(p_ticket_id) THEN v_interno := v_ticket.client_id_local || '-pago'; END IF;

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

  -- 0134: con autorización, que sea para ESTA cuenta y para editar lo cobrado; sin ella, solo
  -- quien tiene el permiso (el camino de autorizacionPropia sin fila). Sin JWT es SQL directo.
  v_solicitante := coalesce(auth.uid(), p_usuario_solicitante_id);
  IF p_autorizacion_pin_id IS NOT NULL THEN
    v_autorizo := consumir_autorizacion(p_autorizacion_pin_id, ARRAY['venta.editar_post_cobro'],
      p_ticket_id, NULL, NULL, false, v_ticket.tenant_id);
  ELSIF auth.uid() IS NULL OR usuario_actual_tiene_permiso('venta.editar_post_cobro') THEN
    v_autorizo := auth.uid();
  ELSE
    RAISE EXCEPTION 'Editar una cuenta cobrada requiere autorización (venta.editar_post_cobro).'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT count(*) INTO v_n_pagos
  FROM pagos
  WHERE ticket_id = p_ticket_id AND estado IN ('APLICADO', 'CONCILIADO') AND deleted_at IS NULL
    AND (v_interno IS NULL OR client_id_local IS DISTINCT FROM v_interno);

  IF v_n_pagos = 0 AND v_interno IS NOT NULL THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: esta venta se pagó con la prenda devuelta; no hay pago que cambiar' USING ERRCODE = '22023';
  ELSIF v_n_pagos = 0 THEN
    RAISE EXCEPTION 'La cuenta no tiene pagos aplicados.';
  ELSIF v_n_pagos > 1 THEN
    RAISE EXCEPTION 'La cuenta tiene pago dividido; cambiar la forma de pago no está disponible para pagos divididos.';
  END IF;

  SELECT * INTO v_pago
  FROM pagos
  WHERE ticket_id = p_ticket_id AND estado IN ('APLICADO', 'CONCILIADO') AND deleted_at IS NULL
    AND (v_interno IS NULL OR client_id_local IS DISTINCT FROM v_interno)
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
    COALESCE(v_autorizo, v_solicitante), 'COBRO', 'pago.metodo_cambiado',
    'pago', v_pago.id,
    jsonb_build_object(
      'ticket_id', p_ticket_id,
      'folio', v_ticket.folio_completo,
      'metodo_anterior', v_metodo_previo,
      'metodo_nuevo', p_nuevo_metodo,
      'monto_mxn', v_pago.monto_mxn,
      'autorizacion_pin_id', p_autorizacion_pin_id,
      'solicitante_id', v_solicitante,
      'autorizo_id', v_autorizo
    ),
    v_ticket.dia_contable
  );
END;
$function$;


-- ---------------------------------------------------------------------------------------------
-- reabrir_ticket_pagado: venta.editar_post_cobro
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reabrir_ticket_pagado(p_ticket_id uuid, p_motivo text, p_autorizacion_pin_id uuid DEFAULT NULL::uuid, p_usuario_solicitante_id uuid DEFAULT NULL::uuid, p_usuario_autorizo_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_ticket        tickets%ROWTYPE;
  v_turno_estado  turno_estado;
  v_modulo_inv    boolean;
  v_item          record;
  v_componente    record;
  v_solicitante   uuid;
  v_autorizo      uuid;
  v_interno       text;   -- 0201
BEGIN
  SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket % no existe', p_ticket_id; END IF;
  -- 0201: en la venta de un cambio, el pago interno (la prenda devuelta) no se cancela.
  IF _ticket_es_de_cambio(p_ticket_id) THEN v_interno := v_ticket.client_id_local || '-pago'; END IF;

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

  -- 0134: con autorización, que sea para ESTA cuenta y para editar lo cobrado; sin ella, solo
  -- quien tiene el permiso (el camino de autorizacionPropia sin fila). Sin JWT es SQL directo.
  v_solicitante := coalesce(auth.uid(), p_usuario_solicitante_id);
  IF p_autorizacion_pin_id IS NOT NULL THEN
    v_autorizo := consumir_autorizacion(p_autorizacion_pin_id, ARRAY['venta.editar_post_cobro'],
      p_ticket_id, NULL, NULL, false, v_ticket.tenant_id);
  ELSIF auth.uid() IS NULL OR usuario_actual_tiene_permiso('venta.editar_post_cobro') THEN
    v_autorizo := auth.uid();
  ELSE
    RAISE EXCEPTION 'Editar una cuenta cobrada requiere autorización (venta.editar_post_cobro).'
      USING ERRCODE = 'insufficient_privilege';
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
  -- 0201: salvo el pago interno de la venta de un cambio (la prenda devuelta): la cuenta queda
  -- ABIERTA debiendo solo el saldo.
  UPDATE pagos
  SET estado     = 'CANCELADO',
      deleted_at = now(),
      updated_at = now()
  WHERE ticket_id = p_ticket_id AND estado IN ('APLICADO', 'CONCILIADO') AND deleted_at IS NULL
    AND (v_interno IS NULL OR client_id_local IS DISTINCT FROM v_interno);

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
    COALESCE(v_autorizo, v_solicitante), 'COBRO', 'ticket.reabierto',
    'ticket', p_ticket_id,
    jsonb_build_object(
      'folio', v_ticket.folio_completo,
      'total_mxn', v_ticket.total_mxn,
      'motivo', p_motivo,
      'autorizacion_pin_id', p_autorizacion_pin_id,
      'solicitante_id', v_solicitante,
      'autorizo_id', v_autorizo
    ),
    v_ticket.dia_contable
  );
END;
$function$;
