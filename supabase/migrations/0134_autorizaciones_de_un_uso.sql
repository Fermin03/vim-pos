-- 0134 · una autorización PIN sirve para UNA acción: la que el supervisor autorizó
--
-- Auditoría integral 30/09/2026 (hallazgos B-2, B-3, B-4, B-5).
--
-- B-2 (CRÍTICO/ALTO) Las autorizaciones no estaban ligadas a la acción. Once RPCs
-- (cancelar_ticket_pagado, aplicar_descuento_manual, cancelar_item_ticket, crear_devolucion,
-- cambiar_forma_pago_ticket, reabrir_ticket_pagado, arquear_caja, reporte_z, split_cuenta,
-- transferir_mesa, imprimir_comanda) y el trigger exigir_autorizacion_movimiento_caja aceptaban
-- CUALQUIER `p_autorizacion_pin_id`: no miraban para qué permiso se dio, sobre qué ticket, por qué
-- monto, cuándo, ni si ya se había usado (las RPC ni siquiera comprobaban el negocio: la FK no
-- pasa por RLS). Y `p_usuario_autorizo_id` / `p_usuario_solicitante_id` los mandaba el cliente.
-- Reproducido como `authenticated`: una autorización de 'cocina.reimprimir_comanda' —o una que
-- la cajera se da sola con registrar_autorizacion_propia('venta.registrar')— servía para
-- cancelar_ticket_pagado de un ticket PAGADO, con el DUEÑO registrado como quien autorizó. Una
-- sola autorización de $20 de descuento servía para N descuentos de cualquier monto; la de una
-- sangría, para sacar efectivo toda la noche; y un movimiento ya autorizado se editaba después
-- (el trigger solo corría en INSERT).
--
-- Arreglo: `consumir_autorizacion()` (SECURITY DEFINER) valida y marca de usada:
--   · negocio = el del JWT (o el de la entidad, si es SQL directo sin JWT);
--   · permiso dentro de la lista que acepta ESA acción (mapeada de lo que el POS pide en
--     apps/pos/app/components/modal-*.tsx y lib/{cancelacion,descuento,devoluciones,movimientos,
--     cierre,cuentas-acciones}.ts);
--   · entidad: si la autorización trae entidad_id, tiene que ser la de la acción (o su padre:
--     el ticket de un renglón, la cuenta de un ticket);
--   · monto: lo acumulado no pasa de lo autorizado (+1 centavo);
--   · frescura: 10 minutos (2 horas para volver a contar el arqueo: el conteo tarda);
--   · la pidió quien la usa (usuario_solicitante_id = auth.uid());
--   · uso único. Excepciones: (a) varias filas en la MISMA transacción (cancelar_ticket_pagado
--     llama a crear_devolucion con la misma autorización) —se reconoce por txid + now()—; y
--     (b) las acciones que el POS hace en serie con una sola autorización (cancelar varios
--     renglones de una cuenta, reimprimir una comanda por estación): reutilizable solo para esa
--     misma entidad, hasta el monto autorizado y dentro de la vigencia.
--   · devuelve usuario_autorizo_id de la autorización: las RPC ya no creen el que manda el
--     cliente, y el solicitante sale de auth.uid().
-- Donde la RPC admitía autorización nula (cambiar forma de pago, reabrir, dividir, recontar) se
-- respeta ese camino SOLO si quien llama tiene el permiso; sin JWT (SQL directo) sigue igual.
-- Las firmas no cambian: el POS y el escritorio las llaman igual.
--
-- B-3 (ALTO) Cobro dividido con propina: cerrar_ticket_si_pagado cerraba en PAGADO con
-- total - pagado <= 0.01, ignorando la propina. El segundo pago ("la propina") fallaba con "No se
-- puede aplicar pago a un ticket en estado PAGADO" y la propina quedaba registrada sin cobrarse.
-- Ahora cierra cuando pagado >= total + propina - 0.01. El cobro de una sola exhibición con
-- propina (0020/0102, smoke_propina, smoke_cuenta_mesa) no cambia: 138 >= 120 + 18.
-- `monto_pendiente_mxn` (columna generada total - pagado) NO cambia y sigue sin incluir la
-- propina: el POS suma la propina por su lado (cobro.ts).
--
-- B-4 (MEDIO) establecer_propina_ticket cambiaba la propina de tickets PAGADO/FACTURADO (los
-- reportes y el Z la suman aparte). Ahora solo BORRADOR/ABIERTO, no por debajo de lo ya cobrado
-- de más, y si con la nueva propina la cuenta queda cubierta, se cierra.
--
-- B-5 (BAJO) aplicar_pago aceptaba montos negativos o cero (el CHECK de pagos es <> 0 por las
-- devoluciones): un "pago" de -500 en efectivo bajaba lo cobrado y el efectivo esperado.

-- ---------------------------------------------------------------------------------------------
-- Marca de uso
-- ---------------------------------------------------------------------------------------------
ALTER TABLE public.autorizaciones_pin
  ADD COLUMN IF NOT EXISTS usada_at            timestamptz,
  ADD COLUMN IF NOT EXISTS usada_txid          bigint,
  ADD COLUMN IF NOT EXISTS usada_por           uuid,
  ADD COLUMN IF NOT EXISTS usos                integer       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_consumido_mxn numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.autorizaciones_pin.usada_at IS
  'Cuándo se usó por primera vez (0134). NULL = sin usar. Una autorización sirve para una acción.';
COMMENT ON COLUMN public.autorizaciones_pin.usada_txid IS
  'txid de la transacción que la usó: dentro de esa misma transacción se puede volver a usar (0134).';
COMMENT ON COLUMN public.autorizaciones_pin.monto_consumido_mxn IS
  'Monto acumulado de las acciones que la usaron; no pasa de monto_mxn (0134).';

-- ---------------------------------------------------------------------------------------------
-- consumir_autorizacion
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consumir_autorizacion(
  p_id            uuid,
  p_permisos      text[],
  p_entidad       uuid,
  p_monto         numeric,
  p_entidad_padre uuid     DEFAULT NULL,
  p_reutilizable  boolean  DEFAULT false,
  p_tenant        uuid     DEFAULT NULL,
  p_vigencia      interval DEFAULT interval '10 minutes'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_a         autorizaciones_pin%ROWTYPE;
  v_tenant    uuid := coalesce(current_tenant_id(), p_tenant);
  v_misma_tx  boolean;
BEGIN
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'Esta acción requiere autorización.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_a FROM autorizaciones_pin WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v_tenant IS NULL OR v_a.tenant_id <> v_tenant
     OR (p_tenant IS NOT NULL AND v_a.tenant_id <> p_tenant) THEN
    RAISE EXCEPTION 'La autorización no es válida.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_a.permiso_codigo IS NULL OR NOT (v_a.permiso_codigo = ANY (p_permisos)) THEN
    RAISE EXCEPTION 'La autorización es para "%" y esta acción requiere %.',
      coalesce(v_a.permiso_codigo, '—'), array_to_string(p_permisos, ' o ')
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_a.entidad_id IS NOT NULL
     AND v_a.entidad_id IS DISTINCT FROM p_entidad
     AND v_a.entidad_id IS DISTINCT FROM p_entidad_padre THEN
    RAISE EXCEPTION 'La autorización es para otro registro.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_a.fecha < now() - p_vigencia THEN
    RAISE EXCEPTION 'La autorización expiró; pide el PIN de nuevo.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF auth.uid() IS NOT NULL AND v_a.usuario_solicitante_id <> auth.uid() THEN
    RAISE EXCEPTION 'La autorización la pidió otro usuario.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_misma_tx := v_a.usada_at = now() AND v_a.usada_txid = txid_current();
  IF v_a.usada_at IS NOT NULL AND NOT v_misma_tx
     AND NOT (p_reutilizable AND v_a.entidad_id IS NOT NULL) THEN
    RAISE EXCEPTION 'La autorización ya se usó; pide el PIN de nuevo.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_a.monto_mxn IS NOT NULL AND p_monto IS NOT NULL
     AND v_a.monto_consumido_mxn + p_monto > v_a.monto_mxn + 0.01 THEN
    RAISE EXCEPTION 'El monto (%) pasa de lo autorizado (%).',
      p_monto, v_a.monto_mxn - v_a.monto_consumido_mxn
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE autorizaciones_pin
     SET usada_at            = coalesce(usada_at, now()),
         usada_txid          = CASE WHEN usada_at IS NULL THEN txid_current() ELSE usada_txid END,
         usada_por           = coalesce(usada_por, auth.uid()),
         usos                = usos + 1,
         monto_consumido_mxn = monto_consumido_mxn + coalesce(p_monto, 0)
   WHERE id = p_id;

  RETURN v_a.usuario_autorizo_id;
END;
$$;

COMMENT ON FUNCTION public.consumir_autorizacion(uuid, text[], uuid, numeric, uuid, boolean, uuid, interval) IS
  'Valida una autorización PIN contra la acción (negocio, permiso, entidad, monto, vigencia, solicitante) y la marca usada. Devuelve quién autorizó. Ver 0134.';

-- Las RPC del POS son SECURITY INVOKER: corren como authenticated y necesitan llamarla. Llamarla
-- a mano solo sirve para quemar una autorización que uno mismo pidió.
REVOKE EXECUTE ON FUNCTION public.consumir_autorizacion(uuid, text[], uuid, numeric, uuid, boolean, uuid, interval) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.consumir_autorizacion(uuid, text[], uuid, numeric, uuid, boolean, uuid, interval) TO authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- cancelar_ticket_pagado: venta.cancelar_pagada (PAGADO/FACTURADO) o venta.cancelar_abierta
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancelar_ticket_pagado(p_ticket_id uuid, p_caja_id uuid, p_turno_id uuid, p_motivo cancelacion_motivo, p_motivo_texto text, p_autorizacion_pin_id uuid, p_usuario_solicitante_id uuid, p_usuario_autorizo_id uuid, p_reversar_inventario boolean DEFAULT true, p_cancelar_cfdi_sat boolean DEFAULT true, p_devolver_dinero boolean DEFAULT true, p_medio_devolucion devolucion_medio DEFAULT 'EFECTIVO'::devolucion_medio, p_nota text DEFAULT NULL::text, p_client_id_local character varying DEFAULT NULL::character varying)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_tenant_id      uuid := current_tenant_id();
  v_ticket         tickets%ROWTYPE;
  v_cancelacion_id uuid;
  v_devolucion_id  uuid;
  v_items_jsonb    jsonb;
  v_solicitante    uuid;
  v_autorizo       uuid;
BEGIN
  -- Idempotencia
  IF p_client_id_local IS NOT NULL THEN
    SELECT id INTO v_cancelacion_id
    FROM cancelaciones_ticket
    WHERE tenant_id = v_tenant_id AND client_id_local = p_client_id_local;
    IF FOUND THEN
      RETURN v_cancelacion_id;
    END IF;
  END IF;

  -- Validar ticket
  SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket % no existe', p_ticket_id;
  END IF;

  IF v_ticket.estado_fiscal = 'CANCELADO' THEN
    RAISE EXCEPTION 'Ticket ya está CANCELADO';
  END IF;

  -- 0134: la autorización tiene que ser para cancelar ESTE ticket, fresca y sin usar; quién
  -- autorizó sale de ella y quién pidió, de la sesión (no de lo que mande el cliente).
  v_solicitante := coalesce(auth.uid(), p_usuario_solicitante_id);
  v_autorizo := consumir_autorizacion(
    p_autorizacion_pin_id,
    CASE WHEN v_ticket.estado_fiscal IN ('PAGADO', 'FACTURADO')
         THEN ARRAY['venta.cancelar_pagada']
         ELSE ARRAY['venta.cancelar_abierta', 'venta.cancelar_pagada'] END,
    p_ticket_id, NULL, NULL, false, v_ticket.tenant_id);

  -- Si hay que devolver dinero (ticket estaba PAGADO/FACTURADO), crear devolución total
  IF p_devolver_dinero AND v_ticket.estado_fiscal IN ('PAGADO', 'FACTURADO') THEN
    -- Construir items_jsonb con todos los items del ticket (cantidad completa)
    SELECT jsonb_agg(jsonb_build_object(
      'ticket_item_id', ti.id,
      'cantidad_devuelta', ti.cantidad,
      'reversar_inventario_item', p_reversar_inventario
    ))
    INTO v_items_jsonb
    FROM ticket_items ti
    WHERE ti.ticket_id = p_ticket_id AND ti.cancelado = false;

    v_devolucion_id := crear_devolucion(
      p_ticket_original_id      := p_ticket_id,
      p_caja_id                 := p_caja_id,
      p_turno_id                := p_turno_id,
      p_alcance                 := 'TOTAL',
      p_motivo                  := 'CANCELACION_PEDIDO',
      p_motivo_texto            := 'Cancelación de ticket: ' || p_motivo::text,
      p_medio_devolucion        := p_medio_devolucion,
      p_autorizacion_pin_id     := p_autorizacion_pin_id,
      p_usuario_solicitante_id  := v_solicitante,
      p_usuario_autorizo_id     := v_autorizo,
      p_items                   := v_items_jsonb,
      p_reversar_inventario     := p_reversar_inventario,
      p_cliente_id              := v_ticket.cliente_id,
      p_nota                    := 'Auto-generada por cancelación de ticket',
      p_client_id_local         := CASE WHEN p_client_id_local IS NOT NULL THEN p_client_id_local || '-DEV' ELSE NULL END
    );

    PERFORM confirmar_devolucion(v_devolucion_id, v_solicitante);
  END IF;

  -- Insertar cancelación (triggers harán el resto)
  INSERT INTO cancelaciones_ticket (
    tenant_id, sucursal_id, caja_id, turno_id,
    ticket_id, ticket_folio_snapshot, ticket_dia_contable_snapshot,
    ticket_total_snapshot, ticket_estado_fiscal_previo, ticket_estado_cocina_previo,
    motivo, motivo_texto,
    autorizacion_pin_id, usuario_solicitante_id, usuario_autorizo_id,
    devolucion_id, reversar_inventario, cancelar_cfdi_sat,
    nota, client_id_local, created_by
  ) VALUES (
    v_tenant_id, v_ticket.sucursal_id, p_caja_id, p_turno_id,
    p_ticket_id, v_ticket.folio_completo, v_ticket.dia_contable,
    v_ticket.total_mxn, v_ticket.estado_fiscal, v_ticket.estado_cocina,
    p_motivo, p_motivo_texto,
    p_autorizacion_pin_id, v_solicitante, v_autorizo,
    v_devolucion_id, p_reversar_inventario, p_cancelar_cfdi_sat,
    p_nota, p_client_id_local, v_solicitante
  ) RETURNING id INTO v_cancelacion_id;

  RETURN v_cancelacion_id;
END;
$function$;


-- ---------------------------------------------------------------------------------------------
-- cancelar_item_ticket: venta.cancelar_abierta, reutilizable dentro del ticket hasta el monto
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancelar_item_ticket(p_ticket_item_id uuid, p_motivo text, p_autorizacion_pin_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_item    record;
BEGIN
  SELECT ti.*, t.estado_fiscal, t.estado_cocina, t.tenant_id AS t_tenant
  INTO v_item
  FROM ticket_items ti
  JOIN tickets t ON t.id = ti.ticket_id
  WHERE ti.id = p_ticket_item_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'ticket_item % no existe', p_ticket_item_id; END IF;
  IF v_item.cancelado THEN
    RAISE EXCEPTION 'Item ya está cancelado';
  END IF;
  IF v_item.estado_fiscal = 'PAGADO' THEN
    RAISE EXCEPTION 'No se puede cancelar items de ticket PAGADO. Usar flujo de devolución (1C.2)';
  END IF;
  IF v_item.combo_rol = 'HIJO' THEN
    RAISE EXCEPTION 'Cancela el combo completo';
  END IF;
  IF v_item.estado_cocina IN ('EN_COCINA', 'LISTO') AND p_autorizacion_pin_id IS NULL THEN
    RAISE EXCEPTION 'Cancelar item con comanda en cocina requiere autorización_pin_id';
  END IF;

  -- 0134: el POS pide UNA autorización para cancelar varios renglones de la cuenta
  -- (modal-cancelar-items: entidad = el ticket, monto = la suma) y llama esta RPC una vez por
  -- renglón. Por eso es reutilizable para renglones de ESE ticket mientras no se pase del monto
  -- autorizado; una autorización por renglón (modal-cancelar-item) solo sirve para ese renglón.
  IF p_autorizacion_pin_id IS NOT NULL THEN
    PERFORM consumir_autorizacion(p_autorizacion_pin_id,
      ARRAY['venta.cancelar_abierta', 'venta.cancelar_pagada'],
      p_ticket_item_id, v_item.total_item_mxn, v_item.ticket_id, true, v_item.t_tenant);
  END IF;

  UPDATE ticket_items
  SET cancelado = true,
      motivo_cancelacion = p_motivo,
      usuario_cancelo_id = auth.uid(),
      autorizacion_cancelacion_id = p_autorizacion_pin_id,
      cancelado_at = now()
  WHERE id = p_ticket_item_id
     OR (parent_item_id = p_ticket_item_id AND cancelado = false);
  -- recalcular_totales_ticket() invocada por trigger (UPDATE OF cancelado)
END;
$function$;


-- ---------------------------------------------------------------------------------------------
-- aplicar_descuento_manual: descuento.manual_aplicar / descuento.cortesia_total
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aplicar_descuento_manual(p_ticket_id uuid, p_ticket_item_id uuid, p_tipo descuento_manual_tipo, p_valor numeric, p_motivo_categoria descuento_manual_motivo, p_motivo_texto text, p_autorizacion_pin_id uuid, p_usuario_solicitante_id uuid, p_usuario_autorizo_id uuid, p_client_id_local character varying DEFAULT NULL::character varying)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_tenant_id        uuid;
  v_descuento_id     uuid;
  v_monto_descontado numeric(12,2);
  v_base             numeric(12,2);
  v_porc             numeric(5,2);
  v_monto            numeric(12,2);
  v_precio_over      numeric(12,2);
  v_item             record;
  v_cargos           numeric(12,2) := 0;         -- 0116: el envío, que no se descuenta
  v_solicitante      uuid;
  v_autorizo         uuid;
  v_monto_autorizable numeric(12,2);
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket % no existe', p_ticket_id; END IF;

  -- Idempotencia
  IF p_client_id_local IS NOT NULL THEN
    SELECT id INTO v_descuento_id FROM ticket_descuentos_manuales
    WHERE tenant_id = v_tenant_id AND client_id_local = p_client_id_local;
    IF FOUND THEN RETURN v_descuento_id; END IF;
  END IF;

  -- 0116: el envío no admite descuentos (spec zonas de envío §3, ADR 0017). Descontar el renglón
  -- de envío directamente sería la puerta trasera de la regla. Quitarlo sí se puede: es quitar la
  -- zona del pedido (fijar_envio_ticket con zona NULL).
  IF p_ticket_item_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM ticket_items WHERE id = p_ticket_item_id AND cargo_tipo IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'El envío no admite descuentos: se cobra completo. Si no se va a cobrar, quita la zona del pedido.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 0116: a nivel ticket, la base del descuento es la comida. El envío se resta de la base.
  IF p_ticket_item_id IS NULL THEN
    SELECT COALESCE(SUM(total_item_mxn), 0) INTO v_cargos
      FROM ticket_items
     WHERE ticket_id = p_ticket_id AND cancelado = false AND cargo_tipo IS NOT NULL;
  END IF;

  -- Calcular monto descontado según tipo
  IF p_tipo = 'PORCENTAJE' THEN
    v_porc := p_valor;
    -- Base de cálculo depende del alcance
    IF p_ticket_item_id IS NULL THEN
      SELECT GREATEST(subtotal_mxn + iva_mxn - promociones_mxn - v_cargos, 0) INTO v_base FROM tickets WHERE id = p_ticket_id;
    ELSE
      SELECT total_item_mxn INTO v_base FROM ticket_items WHERE id = p_ticket_item_id;
    END IF;
    v_monto_descontado := ROUND(v_base * v_porc / 100, 2);

  ELSIF p_tipo = 'MONTO_FIJO' THEN
    v_monto := p_valor;
    v_monto_descontado := v_monto;
    -- 0116: a nivel ticket, topado en la comida. Sin tope, un monto mayor que la comida quedaba
    -- registrado por encima de lo aplicable (recalcular_totales_ticket, redefinida al final de
    -- esta migración, ya no deja que se coma el envío, pero el registro debe decir la verdad).
    IF p_ticket_item_id IS NULL THEN
      SELECT LEAST(v_monto, GREATEST(total_mxn - v_cargos, 0)) INTO v_monto_descontado
        FROM tickets WHERE id = p_ticket_id;
    END IF;

  ELSIF p_tipo = 'CORTESIA_TOTAL' THEN
    IF p_ticket_item_id IS NULL THEN
      SELECT GREATEST(total_mxn - v_cargos, 0) INTO v_monto_descontado FROM tickets WHERE id = p_ticket_id;
    ELSE
      SELECT total_item_mxn INTO v_monto_descontado FROM ticket_items WHERE id = p_ticket_item_id;
    END IF;

  ELSIF p_tipo = 'OVERRIDE_PRECIO' THEN
    -- Para OVERRIDE_PRECIO: marcamos el ítem con precio_override y calculamos el delta
    v_precio_over := p_valor;
    SELECT * INTO v_item FROM ticket_items WHERE id = p_ticket_item_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'ticket_item % no existe', p_ticket_item_id; END IF;
    v_monto_descontado := GREATEST(0, (v_item.precio_unitario_snapshot - v_precio_over) * v_item.cantidad);

    -- Actualizar el ítem con override
    UPDATE ticket_items
    SET precio_override = true,
        precio_unitario_original_snapshot = precio_unitario_snapshot,
        autorizacion_pin_override_id = p_autorizacion_pin_id,
        precio_unitario_snapshot = v_precio_over
    WHERE id = p_ticket_item_id;
  END IF;

  -- 0134: la autorización es para ESTE descuento. El monto que se compara es el que el
  -- supervisor vio en la pantalla (previewDescuento): en % de ticket, sobre el total actual sin
  -- envío; en override de precio, total del renglón menos el valor capturado.
  v_solicitante := coalesce(auth.uid(), p_usuario_solicitante_id);
  IF p_tipo = 'PORCENTAJE' AND p_ticket_item_id IS NULL THEN
    SELECT ROUND(GREATEST(total_mxn - v_cargos, 0) * v_porc / 100, 2) INTO v_monto_autorizable
      FROM tickets WHERE id = p_ticket_id;
  ELSIF p_tipo = 'OVERRIDE_PRECIO' THEN
    v_monto_autorizable := GREATEST(0, v_item.total_item_mxn - v_precio_over);
  ELSE
    v_monto_autorizable := v_monto_descontado;
  END IF;
  v_autorizo := consumir_autorizacion(
    p_autorizacion_pin_id,
    CASE p_tipo
      WHEN 'CORTESIA_TOTAL'  THEN ARRAY['descuento.cortesia_total']
      -- El POS pide 'descuento.override_precio', que no existe en `permisos` (ver informe).
      WHEN 'OVERRIDE_PRECIO' THEN ARRAY['descuento.override_precio', 'descuento.manual_aplicar']
      ELSE ARRAY['descuento.manual_aplicar', 'descuento.cortesia_total']
    END,
    coalesce(p_ticket_item_id, p_ticket_id), v_monto_autorizable, p_ticket_id, false, v_tenant_id);

  -- Insertar registro del descuento
  INSERT INTO ticket_descuentos_manuales (
    tenant_id, ticket_id, ticket_item_id,
    tipo, valor_porcentaje, valor_monto_mxn, precio_override_mxn,
    monto_descontado_mxn,
    motivo_categoria, motivo_texto,
    autorizacion_pin_id,
    usuario_solicitante_id, usuario_autorizo_id,
    client_id_local, created_by
  ) VALUES (
    v_tenant_id, p_ticket_id, p_ticket_item_id,
    p_tipo,
    CASE WHEN p_tipo = 'PORCENTAJE'      THEN p_valor ELSE NULL END,
    CASE WHEN p_tipo = 'MONTO_FIJO'      THEN p_valor ELSE NULL END,
    CASE WHEN p_tipo = 'OVERRIDE_PRECIO' THEN p_valor ELSE NULL END,
    v_monto_descontado,
    p_motivo_categoria, p_motivo_texto,
    p_autorizacion_pin_id,
    v_solicitante, v_autorizo,
    p_client_id_local, v_solicitante
  ) RETURNING id INTO v_descuento_id;

  RETURN v_descuento_id;
END;
$function$;


-- ---------------------------------------------------------------------------------------------
-- crear_devolucion: venta.devolucion (o venta.cancelar_pagada desde cancelar_ticket_pagado)
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_devolucion(p_ticket_original_id uuid, p_caja_id uuid, p_turno_id uuid, p_alcance devolucion_alcance, p_motivo devolucion_motivo, p_motivo_texto text, p_medio_devolucion devolucion_medio, p_autorizacion_pin_id uuid, p_usuario_solicitante_id uuid, p_usuario_autorizo_id uuid, p_items jsonb, p_reversar_inventario boolean DEFAULT true, p_cliente_id uuid DEFAULT NULL::uuid, p_nota text DEFAULT NULL::text, p_client_id_local character varying DEFAULT NULL::character varying)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
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
  v_sum_items     numeric(12,2);
  v_ratio         numeric;
  v_solicitante   uuid;
  v_autorizo      uuid;
  v_monto_aut     numeric(12,2);
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

  -- 0134: autorización para devolver ESTE ticket. cancelar_ticket_pagado la llama con su propia
  -- autorización (venta.cancelar_pagada) en la misma transacción: por eso vale ese permiso y por
  -- eso consumir_autorizacion deja reusar una autorización dentro de la misma transacción.
  v_solicitante := coalesce(auth.uid(), p_usuario_solicitante_id);
  v_autorizo := consumir_autorizacion(p_autorizacion_pin_id,
    ARRAY['venta.devolucion', 'venta.cancelar_pagada'],
    p_ticket_original_id, NULL, NULL, false, v_ticket.tenant_id);

  -- 0041: ratio del descuento a nivel TICKET (total real vs bruto de ítems).
  SELECT COALESCE(SUM(total_item_mxn), 0) INTO v_sum_items
  FROM ticket_items WHERE ticket_id = p_ticket_original_id AND cancelado = false;
  v_ratio := CASE WHEN v_sum_items > 0 THEN v_ticket.total_mxn / v_sum_items ELSE 1 END;

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
    p_autorizacion_pin_id, v_solicitante, v_autorizo,
    p_reversar_inventario, p_cliente_id, p_nota, p_client_id_local,
    'BORRADOR', v_solicitante
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

    -- total/iva proporcional a la cantidad devuelta y al descuento de ticket (v_ratio).
    v_total_item    := ROUND(v_ti.total_item_mxn * v_cantidad_dev / v_ti.cantidad * v_ratio, 2);
    v_iva_item      := ROUND(v_ti.iva_item_mxn   * v_cantidad_dev / v_ti.cantidad * v_ratio, 2);
    v_subtotal_item := v_total_item - v_iva_item;

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
      v_solicitante
    );

    v_subtotal := v_subtotal + v_subtotal_item;
    v_iva      := v_iva + v_iva_item;
  END LOOP;

  -- 0134: lo que se devuelve no pasa de lo autorizado (el POS autoriza el total de la venta).
  -- Holgura de $1: el total sale de redondear renglón por renglón.
  SELECT monto_mxn INTO v_monto_aut FROM autorizaciones_pin WHERE id = p_autorizacion_pin_id;
  IF v_monto_aut IS NOT NULL AND v_subtotal + v_iva > v_monto_aut + 1.00 THEN
    RAISE EXCEPTION 'La devolución (%) pasa del monto autorizado (%).', v_subtotal + v_iva, v_monto_aut
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Actualizar totales de la devolución
  UPDATE devoluciones
  SET subtotal_devuelto_mxn = v_subtotal,
      iva_devuelto_mxn      = v_iva,
      total_devuelto_mxn    = v_subtotal + v_iva,
      updated_by            = v_solicitante
  WHERE id = v_devolucion_id;

  RETURN v_devolucion_id;
END;
$function$;


-- ---------------------------------------------------------------------------------------------
-- cambiar_forma_pago_ticket: venta.editar_post_cobro
-- ---------------------------------------------------------------------------------------------
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


-- ---------------------------------------------------------------------------------------------
-- arquear_caja: turno.recontar_arqueo para el segundo conteo
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.arquear_caja(p_turno_id uuid, p_declaraciones jsonb, p_motivo_corte text, p_usuario_id uuid, p_autorizacion_pin_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_tenant_id    uuid := current_tenant_id();
  v_turno        turnos%ROWTYPE;
  v_corte_id     uuid;
  v_decl         jsonb;
  v_metodo       metodo_pago;
  v_declarado    numeric(12,2);
  v_esperado     numeric(12,2);
  v_total_esperado numeric(12,2) := 0;
  v_total_declarado numeric(12,2) := 0;
  v_resultados   jsonb := '[]'::jsonb;
  v_usuario      uuid;
BEGIN
  SELECT * INTO v_turno FROM turnos WHERE id = p_turno_id AND tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turno % no existe', p_turno_id;
  END IF;

  -- 0134: volver a contar (0127) se autoriza con turno.recontar_arqueo para ESTE turno. La
  -- autorización se pide al pulsar "volver a contar" y se usa al terminar de contar el efectivo:
  -- vigencia de 2 horas. Sin autorización, un segundo conteo solo lo hace quien tiene el permiso
  -- (antes lo decidía únicamente la pantalla).
  v_usuario := coalesce(auth.uid(), p_usuario_id);
  IF p_autorizacion_pin_id IS NOT NULL THEN
    PERFORM consumir_autorizacion(p_autorizacion_pin_id, ARRAY['turno.recontar_arqueo'],
      p_turno_id, NULL, NULL, false, v_turno.tenant_id, interval '2 hours');
  ELSIF auth.uid() IS NOT NULL
        AND EXISTS (SELECT 1 FROM cortes_caja WHERE turno_id = p_turno_id)
        AND NOT usuario_actual_tiene_permiso('turno.recontar_arqueo') THEN
    RAISE EXCEPTION 'Este turno ya tiene un conteo: volver a contar requiere autorización (turno.recontar_arqueo).'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Crear corte de caja (cabecera)
  INSERT INTO cortes_caja (
    tenant_id, sucursal_id, caja_id, turno_id,
    motivo, usuario_id, autorizacion_pin_id,
    created_by
  ) VALUES (
    v_tenant_id, v_turno.sucursal_id, v_turno.caja_id, p_turno_id,
    p_motivo_corte, v_usuario, p_autorizacion_pin_id,
    v_usuario
  ) RETURNING id INTO v_corte_id;

  -- Procesar cada declaración
  FOR v_decl IN SELECT * FROM jsonb_array_elements(p_declaraciones)
  LOOP
    v_metodo := (v_decl->>'metodo_pago')::metodo_pago;
    v_declarado := (v_decl->>'monto_declarado_mxn')::numeric;

    -- Calcular esperado según el método
    IF v_metodo = 'EFECTIVO' THEN
      v_esperado := calcular_efectivo_esperado(p_turno_id);
    ELSE
      -- Para no-efectivo: simplemente suma de pagos del turno con ese método
      SELECT COALESCE(SUM(monto_mxn), 0) INTO v_esperado
      FROM pagos
      WHERE turno_id = p_turno_id
        AND metodo_pago = v_metodo
        AND estado = 'APLICADO'
        AND deleted_at IS NULL;
    END IF;

    INSERT INTO cortes_caja_detalle (
      tenant_id, corte_caja_id,
      metodo_pago, monto_esperado_mxn, monto_declarado_mxn,
      diferencia_mxn, cantidad_transacciones, nota, created_by
    ) VALUES (
      v_tenant_id, v_corte_id,
      v_metodo, v_esperado, v_declarado,
      v_declarado - v_esperado,
      (SELECT COUNT(*) FROM pagos
       WHERE turno_id = p_turno_id AND metodo_pago = v_metodo
       AND estado = 'APLICADO' AND deleted_at IS NULL),
      v_decl->>'nota', v_usuario
    );

    v_total_esperado := v_total_esperado + v_esperado;
    v_total_declarado := v_total_declarado + v_declarado;

    v_resultados := v_resultados || jsonb_build_array(jsonb_build_object(
      'metodo_pago', v_metodo,
      'esperado', v_esperado,
      'declarado', v_declarado,
      'diferencia', v_declarado - v_esperado
    ));
  END LOOP;

  -- Actualizar la cabecera del corte con totales
  UPDATE cortes_caja
  SET total_esperado_mxn = v_total_esperado,
      total_declarado_mxn = v_total_declarado,
      diferencia_mxn = v_total_declarado - v_total_esperado,
      updated_by = v_usuario
  WHERE id = v_corte_id;

  RETURN jsonb_build_object(
    'corte_caja_id', v_corte_id,
    'total_esperado_mxn', v_total_esperado,
    'total_declarado_mxn', v_total_declarado,
    'diferencia_total_mxn', v_total_declarado - v_total_esperado,
    'detalle', v_resultados
  );
END;
$function$;


-- ---------------------------------------------------------------------------------------------
-- reporte_z: turno.cerrar_propio / turno.forzar_cierre
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reporte_z(p_turno_id uuid, p_efectivo_declarado_mxn numeric, p_autorizacion_pin_id uuid, p_cerrado_por_usuario_id uuid, p_nota text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_tenant_id          uuid := current_tenant_id();
  v_turno              turnos%ROWTYPE;
  v_existing_z         reportes_z_historico%ROWTYPE;
  v_payload            jsonb;
  v_efectivo_esperado  numeric(12,2);
  v_diferencia         numeric(12,2);
  v_z_id               uuid;
  v_dist_propinas      jsonb;
  v_cerrador           uuid;
BEGIN
  -- ===== Validaciones =====
  SELECT * INTO v_turno FROM turnos WHERE id = p_turno_id AND tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turno % no existe', p_turno_id;
  END IF;

  -- Idempotencia: si ya hay Z, devolverlo
  SELECT * INTO v_existing_z FROM reportes_z_historico WHERE turno_id = p_turno_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'estado', 'YA_EXISTE',
      'reporte_z_id', v_existing_z.id,
      'folio_z', v_existing_z.folio_z,
      'mensaje', 'Este turno ya tiene Reporte Z. Es inmutable.',
      'payload', v_existing_z.payload_completo
    );
  END IF;

  IF v_turno.estado = 'CERRADO' THEN
    RAISE EXCEPTION 'Turno ya está CERRADO pero no tiene Z. Estado inconsistente; contacta soporte.';
  END IF;

  IF p_autorizacion_pin_id IS NULL THEN
    RAISE EXCEPTION 'Reporte Z requiere autorización (autorizacion_pin_id no puede ser NULL)';
  END IF;

  -- 0134: la autorización es para cerrar ESTE turno.
  PERFORM consumir_autorizacion(p_autorizacion_pin_id,
    ARRAY['turno.cerrar_propio', 'turno.forzar_cierre'],
    p_turno_id, NULL, NULL, false, v_turno.tenant_id);
  v_cerrador := coalesce(auth.uid(), p_cerrado_por_usuario_id);

  -- ===== Generar payload =====
  v_payload := reporte_x(p_turno_id);

  v_efectivo_esperado := (v_payload->>'efectivo_esperado_mxn')::numeric;
  v_diferencia := p_efectivo_declarado_mxn - v_efectivo_esperado;

  v_payload := v_payload
    || jsonb_build_object(
      'reporte_tipo', 'Z',
      'cerrado_por_usuario_id', v_cerrador,
      'autorizacion_pin_id', p_autorizacion_pin_id,
      'efectivo_declarado_mxn', p_efectivo_declarado_mxn,
      'diferencia_efectivo_mxn', v_diferencia,
      'fecha_cierre', now(),
      'nota', p_nota
    );

  -- ===== Cerrar turno =====
  UPDATE turnos
  SET estado     = 'CERRADO',
      fecha_cierre = now(),
      usuario_cierre_id = v_cerrador,
      updated_at = now()                       -- FIX: era updated_by (columna inexistente)
  WHERE id = p_turno_id;

  -- Capturar distribuciones de propinas calculadas
  SELECT jsonb_agg(jsonb_build_object(
    'usuario_id', usuario_id,
    'metodo_reparto', metodo_reparto_usado,
    'monto_mxn', monto_asignado_mxn
  )) INTO v_dist_propinas
  FROM propinas_distribucion
  WHERE turno_id = p_turno_id;

  v_payload := v_payload || jsonb_build_object(
    'propinas_distribuidas', COALESCE(v_dist_propinas, '[]'::jsonb)
  );

  -- ===== Insertar el Z (folio_z lo asigna el trigger trg_reportes_z_folio) =====
  INSERT INTO reportes_z_historico (
    tenant_id, sucursal_id, caja_id, turno_id,
    dia_contable, payload_completo,
    total_ventas_mxn, total_iva_mxn, total_propinas_mxn,
    total_devoluciones_mxn, total_tickets,
    efectivo_esperado_mxn, efectivo_declarado_mxn, diferencia_efectivo_mxn,
    cerrado_por_usuario_id, autorizacion_pin_id, nota, created_by
  ) VALUES (
    v_tenant_id, v_turno.sucursal_id, v_turno.caja_id, p_turno_id,
    v_turno.dia_contable, v_payload,
    (v_payload->'tickets'->>'total_neto_mxn')::numeric,
    (v_payload->'tickets'->>'iva_neto_mxn')::numeric,
    (v_payload->'tickets'->>'propina_total_mxn')::numeric,
    (v_payload->'devoluciones'->>'total_mxn')::numeric,
    (v_payload->'tickets'->>'total_tickets_pagados')::integer,
    v_efectivo_esperado, p_efectivo_declarado_mxn, v_diferencia,
    v_cerrador, p_autorizacion_pin_id, p_nota, v_cerrador
  ) RETURNING id INTO v_z_id;

  RETURN jsonb_build_object(
    'estado', 'GENERADO',
    'reporte_z_id', v_z_id,
    'turno_id', p_turno_id,
    'payload', v_payload
  );
END;
$function$;


-- ---------------------------------------------------------------------------------------------
-- split_cuenta: venta.editar_post_cobro
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.split_cuenta(p_cuenta_id uuid, p_n_partes integer, p_autorizacion_pin_id uuid, p_usuario_solicitante_id uuid, p_usuario_autorizo_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_tenant_id      uuid := current_tenant_id();
  v_cuenta         cuentas_abiertas%ROWTYPE;
  v_ticket_original tickets%ROWTYPE;
  v_nuevos_tickets uuid[] := ARRAY[]::uuid[];
  v_nuevo_id       uuid;
  v_i              integer;
  v_total_por_parte numeric(12,2);
  v_solicitante    uuid;
  v_autorizo       uuid;
BEGIN
  IF p_n_partes < 2 THEN
    RAISE EXCEPTION 'Split requiere al menos 2 partes (recibido: %)', p_n_partes;
  END IF;

  SELECT * INTO v_cuenta FROM cuentas_abiertas WHERE id = p_cuenta_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta % no existe', p_cuenta_id;
  END IF;

  IF v_cuenta.estado <> 'ABIERTA' THEN
    RAISE EXCEPTION 'Solo se puede dividir una cuenta ABIERTA (estado actual: %)', v_cuenta.estado;
  END IF;

  IF v_cuenta.ticket_principal_id IS NULL THEN
    RAISE EXCEPTION 'Cuenta no tiene ticket principal (no se le agregaron items)';
  END IF;

  SELECT * INTO v_ticket_original FROM tickets WHERE id = v_cuenta.ticket_principal_id;

  IF v_ticket_original.estado_fiscal <> 'ABIERTO' THEN
    RAISE EXCEPTION 'Solo se puede dividir un ticket ABIERTO (estado actual: %)', v_ticket_original.estado_fiscal;
  END IF;

  -- 0134: dividir cancela el ticket original. No hay permiso propio de "dividir cuenta"; se usa
  -- el de editar una cuenta (SUPERVISOR+), el mismo nivel que pide la matriz §5.2 #16.
  v_solicitante := coalesce(auth.uid(), p_usuario_solicitante_id);
  IF p_autorizacion_pin_id IS NOT NULL THEN
    v_autorizo := consumir_autorizacion(p_autorizacion_pin_id, ARRAY['venta.editar_post_cobro'],
      v_ticket_original.id, NULL, p_cuenta_id, false, v_ticket_original.tenant_id);
  ELSIF auth.uid() IS NULL OR usuario_actual_tiene_permiso('venta.editar_post_cobro') THEN
    v_autorizo := auth.uid();
  ELSE
    RAISE EXCEPTION 'Dividir una cuenta requiere autorización (venta.editar_post_cobro).'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Calcular monto por parte
  v_total_por_parte := ROUND(v_ticket_original.total_mxn / p_n_partes, 2);

  -- Crear N tickets nuevos, cada uno con un item ficticio "Parte X de cuenta YYY"
  FOR v_i IN 1..p_n_partes LOOP
    -- Crear ticket nuevo asociado a la misma cuenta
    INSERT INTO tickets (
      tenant_id, sucursal_id, caja_id, turno_id,
      modo_servicio, cuenta_abierta_id, mesero_id,
      estado_fiscal, estado_cocina,
      fecha_apertura, usuario_apertura_id,
      nota_general, nota_imprime_en_comanda, nota_imprime_en_ticket,
      created_by
    ) VALUES (
      v_tenant_id, v_ticket_original.sucursal_id, v_ticket_original.caja_id, v_ticket_original.turno_id,
      v_ticket_original.modo_servicio, v_cuenta.id, v_ticket_original.mesero_id,
      'BORRADOR', 'SIN_ENVIAR',
      now(), v_solicitante,
      format('Split %s/%s de cuenta %s', v_i, p_n_partes, v_cuenta.folio_completo),
      false, true,
      v_solicitante
    ) RETURNING id INTO v_nuevo_id;

    -- Por simplicidad MVP: no se duplican items. Se agrega un "item virtual"
    -- vía la función agregar_item_a_ticket() con producto especial (a definir
    -- como producto fijo del catálogo SAT genérico, ej. "Consumo cuenta abierta").
    -- En la práctica el cajero ajusta items concretos manualmente si lo desea.

    v_nuevos_tickets := array_append(v_nuevos_tickets, v_nuevo_id);
  END LOOP;

  -- Cancelar el ticket original con devolución de los items
  -- (usar cancelar_ticket_pagado de 1C.2 NO aplica porque el ticket no está PAGADO).
  -- Para tickets ABIERTOS, cancelación directa:
  UPDATE tickets
  SET estado_fiscal = 'CANCELADO',
      updated_by    = v_solicitante
  WHERE id = v_ticket_original.id;

  -- Marcar cuenta como cerrada (el trigger normal hace esto, pero por claridad)
  UPDATE cuentas_abiertas
  SET estado       = 'CERRADA',
      fecha_cierre = now(),
      updated_by   = v_solicitante
  WHERE id = v_cuenta.id;

  -- Audit
  INSERT INTO auditoria_eventos (
    tenant_id, sucursal_id, turno_id, usuario_id, usuario_autorizo_id,
    categoria, evento_codigo,
    entidad_tipo, entidad_id, payload
  ) VALUES (
    v_tenant_id, v_ticket_original.sucursal_id, v_ticket_original.turno_id,
    v_solicitante, v_autorizo,
    'CUENTAS', 'cuenta.split',
    'cuenta_abierta', p_cuenta_id,
    jsonb_build_object(
      'ticket_original_id', v_ticket_original.id,
      'ticket_original_folio', v_ticket_original.folio_completo,
      'n_partes', p_n_partes,
      'total_original_mxn', v_ticket_original.total_mxn,
      'total_por_parte_mxn', v_total_por_parte,
      'tickets_generados', to_jsonb(v_nuevos_tickets),
      'autorizacion_pin_id', p_autorizacion_pin_id
    )
  );

  RETURN jsonb_build_object(
    'cuenta_id', p_cuenta_id,
    'ticket_original_cancelado', v_ticket_original.id,
    'nuevos_tickets', to_jsonb(v_nuevos_tickets),
    'total_original', v_ticket_original.total_mxn,
    'total_por_parte', v_total_por_parte
  );
END;
$function$;


-- ---------------------------------------------------------------------------------------------
-- transferir_mesa: si trae autorización, venta.editar_post_cobro
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transferir_mesa(p_ticket_id uuid, p_mesa_nueva_id uuid, p_motivo text, p_autorizacion_pin_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_tenant_id     uuid := current_tenant_id();
  v_asignacion_actual tickets_mesas%ROWTYPE;
  v_nueva_asignacion_id uuid;
BEGIN
  -- Obtener asignación actual principal
  SELECT * INTO v_asignacion_actual
  FROM tickets_mesas
  WHERE ticket_id = p_ticket_id
    AND es_mesa_principal = true
    AND fecha_liberacion IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket % no tiene mesa principal activa', p_ticket_id;
  END IF;

  IF v_asignacion_actual.mesa_id = p_mesa_nueva_id THEN
    RAISE EXCEPTION 'Mesa nueva es igual a la actual';
  END IF;

  -- 0134: la autorización sigue siendo opcional (nadie la manda hoy), pero si llega tiene que
  -- ser para ESTE ticket y de nivel supervisor; ya no se guarda cualquier id como constancia.
  IF p_autorizacion_pin_id IS NOT NULL THEN
    PERFORM consumir_autorizacion(p_autorizacion_pin_id, ARRAY['venta.editar_post_cobro'],
      p_ticket_id, NULL, NULL, false, v_asignacion_actual.tenant_id);
  END IF;

  -- Liberar la asignación actual
  UPDATE tickets_mesas
  SET fecha_liberacion = now(),
      motivo_liberacion = format('TRANSFERIDO_A_MESA_%s', p_mesa_nueva_id)
  WHERE id = v_asignacion_actual.id;

  -- Insertar nueva asignación
  INSERT INTO tickets_mesas (
    tenant_id, ticket_id, mesa_id, es_mesa_principal,
    mesa_anterior_id, transferencia_motivo, transferencia_autorizacion_pin_id,
    created_by
  ) VALUES (
    v_tenant_id, p_ticket_id, p_mesa_nueva_id, true,
    v_asignacion_actual.mesa_id, p_motivo, p_autorizacion_pin_id,
    auth.uid()
  ) RETURNING id INTO v_nueva_asignacion_id;

  RETURN v_nueva_asignacion_id;
END;
$function$;


-- ---------------------------------------------------------------------------------------------
-- imprimir_comanda: cocina.reimprimir_comanda
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.imprimir_comanda(p_ticket_id uuid, p_area_cocina_id uuid, p_impresora_identificador character varying, p_items_incluidos jsonb, p_evento_tipo comanda_evento_tipo, p_resultado comanda_resultado, p_error_detalle text DEFAULT NULL::text, p_razon_reimpresion text DEFAULT NULL::text, p_autorizacion_pin_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_tenant_id       uuid := current_tenant_id();
  v_ticket          tickets%ROWTYPE;
  v_area_nombre     varchar;
  v_impresion_id    uuid;
BEGIN
  SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket % no existe', p_ticket_id;
  END IF;

  -- 0126: sin área (el negocio no asignó estación al producto) se registra como "Cocina".
  IF p_area_cocina_id IS NULL THEN
    v_area_nombre := 'Cocina';
  ELSE
    SELECT nombre INTO v_area_nombre FROM areas_cocina WHERE id = p_area_cocina_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Área de cocina % no existe', p_area_cocina_id;
    END IF;
  END IF;

  IF p_evento_tipo = 'REIMPRESION_CAJERO' THEN
    IF p_autorizacion_pin_id IS NULL THEN
      RAISE EXCEPTION 'Reimpresión por cajero requiere autorizacion_pin_id';
    END IF;
    IF p_razon_reimpresion IS NULL OR length(trim(p_razon_reimpresion)) = 0 THEN
      RAISE EXCEPTION 'Reimpresión por cajero requiere razon_reimpresion';
    END IF;
  END IF;

  -- 0134: reimprimir es por ESTE ticket. Una reimpresión sale en una comanda por estación y el
  -- POS registra cada una con la misma autorización: reutilizable dentro del ticket.
  IF p_autorizacion_pin_id IS NOT NULL THEN
    PERFORM consumir_autorizacion(p_autorizacion_pin_id, ARRAY['cocina.reimprimir_comanda'],
      p_ticket_id, NULL, NULL, true, v_ticket.tenant_id);
  END IF;

  INSERT INTO comanda_impresiones (
    tenant_id, sucursal_id, ticket_id,
    area_cocina_id, area_cocina_nombre_snapshot, impresora_identificador,
    evento_tipo, resultado, error_detalle,
    items_incluidos_snapshot,
    razon_reimpresion, autorizacion_pin_id,
    usuario_id, created_by
  ) VALUES (
    v_tenant_id, v_ticket.sucursal_id, p_ticket_id,
    p_area_cocina_id, v_area_nombre, p_impresora_identificador,
    p_evento_tipo, p_resultado, p_error_detalle,
    COALESCE(p_items_incluidos, '[]'::jsonb),
    p_razon_reimpresion, p_autorizacion_pin_id,
    auth.uid(), auth.uid()
  ) RETURNING id INTO v_impresion_id;

  RETURN v_impresion_id;
END;
$function$;


-- ---------------------------------------------------------------------------------------------
-- exigir_autorizacion_movimiento_caja: el PIN es para ESTE tipo de movimiento y ESTE monto, se
-- consume, y también se exige al EDITAR el movimiento (antes solo en INSERT: se autorizaba una
-- sangría de $100 y luego se le cambiaba el monto).
-- Permisos que pide el POS (apps/pos/app/lib/movimientos.ts): SANGRIA → caja.sangria,
-- INYECCION_FONDO → caja.deposito. DEPOSITO y PAGO_PROVEEDOR no los usa el POS hoy; se aceptan
-- los permisos de salida de efectivo.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.exigir_autorizacion_movimiento_caja()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  -- Solo los movimientos manuales que un cajero dispara desde el POS requieren PIN de
  -- supervisor. Los del sistema (FONDO_APERTURA, DEVOLUCION_EFECTIVO, AJUSTE_*) no.
  IF NEW.tipo NOT IN ('SANGRIA', 'DEPOSITO', 'PAGO_PROVEEDOR', 'INYECCION_FONDO') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Cancelar, marcar impreso, etc. no tocan lo autorizado: pasan.
    IF (NEW.tipo, NEW.monto_mxn, NEW.turno_id, NEW.caja_id, NEW.tenant_id,
        NEW.autorizacion_pin_id, NEW.usuario_autorizo_id)
       IS NOT DISTINCT FROM
       (OLD.tipo, OLD.monto_mxn, OLD.turno_id, OLD.caja_id, OLD.tenant_id,
        OLD.autorizacion_pin_id, OLD.usuario_autorizo_id) THEN
      RETURN NEW;
    END IF;
    IF NEW.autorizacion_pin_id IS NOT DISTINCT FROM OLD.autorizacion_pin_id THEN
      RAISE EXCEPTION 'Cambiar un movimiento % ya autorizado requiere una autorización nueva.', NEW.tipo
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.autorizacion_pin_id IS NULL THEN
    RAISE EXCEPTION 'El movimiento % requiere autorización de un supervisor (PIN).', NEW.tipo
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.usuario_autorizo_id := consumir_autorizacion(
    NEW.autorizacion_pin_id,
    CASE NEW.tipo
      WHEN 'SANGRIA'         THEN ARRAY['caja.sangria']
      WHEN 'INYECCION_FONDO' THEN ARRAY['caja.deposito']
      WHEN 'DEPOSITO'        THEN ARRAY['caja.deposito', 'caja.sangria']
      ELSE                        ARRAY['caja.sangria', 'caja.ajuste_admin']   -- PAGO_PROVEEDOR
    END,
    NEW.id, NEW.monto_mxn, NEW.turno_id, false, NEW.tenant_id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_exigir_autorizacion_movimiento ON public.movimientos_caja;
CREATE TRIGGER trg_exigir_autorizacion_movimiento
  BEFORE INSERT OR UPDATE ON public.movimientos_caja
  FOR EACH ROW EXECUTE FUNCTION exigir_autorizacion_movimiento_caja();

-- ---------------------------------------------------------------------------------------------
-- aplicar_pago: el monto es positivo
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aplicar_pago(p_ticket_id uuid, p_metodo_pago metodo_pago, p_monto_mxn numeric, p_monto_recibido_mxn numeric DEFAULT NULL::numeric, p_referencia character varying DEFAULT NULL::character varying, p_terminal_aprobacion character varying DEFAULT NULL::character varying, p_folio_externo character varying DEFAULT NULL::character varying, p_es_pago_al_recibir boolean DEFAULT false, p_nota text DEFAULT NULL::text, p_client_id_local character varying DEFAULT NULL::character varying)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_ticket       record;
  v_pago_id      uuid;
  v_cambio       numeric(12,2) := 0;
  v_pagado_actual numeric(12,2);
  v_estado_pago  pago_estado;
BEGIN
  -- 0134 (B-5): un pago es dinero que ENTRA. Lo que sale va por crear_devolucion; el CHECK de
  -- pagos (<> 0) admite negativos por las devoluciones, así que la RPC tiene que filtrarlos.
  IF p_monto_mxn IS NULL OR p_monto_mxn <= 0 THEN
    RAISE EXCEPTION 'El monto del pago debe ser mayor a 0 (recibido: %)', p_monto_mxn
      USING ERRCODE = 'check_violation';
  END IF;

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
$function$;

-- ---------------------------------------------------------------------------------------------
-- cerrar_ticket_si_pagado: total + propina
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cerrar_ticket_si_pagado(p_ticket_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_ticket record;
BEGIN
  SELECT id, estado_fiscal, total_mxn, propina_mxn, monto_pagado_mxn, monto_pendiente_mxn
  INTO v_ticket
  FROM tickets WHERE id = p_ticket_id FOR UPDATE;

  IF v_ticket.estado_fiscal = 'ABIERTO'
     AND v_ticket.total_mxn > 0
     -- 0134 (B-3): la propina se cobra DENTRO de los pagos pero no entra en total_mxn (0020,
     -- 0102). Cerrar al cubrir solo el total dejaba la propina de un cobro dividido sin cobrar.
     AND v_ticket.monto_pagado_mxn >= v_ticket.total_mxn + coalesce(v_ticket.propina_mxn, 0) - 0.01 THEN  -- tolerancia de redondeo
    UPDATE tickets
    SET estado_fiscal = 'PAGADO',
        fecha_pago = now(),
        usuario_cierre_id = auth.uid()
    WHERE id = p_ticket_id;
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;

-- ---------------------------------------------------------------------------------------------
-- establecer_propina_ticket: solo con la cuenta abierta
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.establecer_propina_ticket(p_ticket_id uuid, p_monto_mxn numeric)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  IF p_monto_mxn IS NULL OR p_monto_mxn < 0 THEN
    RAISE EXCEPTION 'PROPINA_INVALIDA';
  END IF;
  -- 0134 (B-4): la propina es parte del cobro; con la cuenta cobrada ya no se mueve (los
  -- reportes y el Z la suman aparte). Tampoco puede quedar por debajo de lo ya cobrado de más.
  UPDATE tickets
     SET propina_mxn = p_monto_mxn, updated_at = now()
   WHERE id = p_ticket_id
     AND estado_fiscal IN ('BORRADOR', 'ABIERTO')
     AND monto_pagado_mxn <= total_mxn + p_monto_mxn + 0.01;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket % no editable: la propina solo se cambia con la cuenta abierta y no por debajo de lo ya cobrado', p_ticket_id;
  END IF;
  -- Si bajar la propina deja la cuenta cubierta, se cierra (si no, quedaba ABIERTA sin forma de
  -- cobrarle nada: cualquier pago nuevo excedería total + propina).
  PERFORM cerrar_ticket_si_pagado(p_ticket_id);
END;
$function$;
