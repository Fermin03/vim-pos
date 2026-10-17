-- 0196 · Ajustes de la caja de tienda tras la revisión final (Giro RETAIL, entrega 4).
-- La 0195 ya está aplicada en local: esto la completa sin editarla.
-- §1 La venta de un cambio de talla. §2 registrar_cambio_talla más estricta.
-- §3 Lo que la caja sube de existencias. §4 Disparadores.

-- ── §1 La venta de un cambio ─────────────────────────────────────────────────
-- «Venta de un cambio» = un ticket sin cobrar del todo cuyo client_id_local es el de una devolución
-- CAMBIO_TALLA del mismo negocio (registrar_cambio_talla, 0195 §4). Lleva un pago interno en
-- efectivo, `<client_id_local>-pago`, por lo que el cliente regresó. Mientras está abierta solo se
-- cobra o se cancela completa: cancelarle un renglón, reemplazarlo, descontarle o borrarla dejaría
-- el pago interno cubriendo otra cosa. Un restaurante nunca tiene devoluciones CAMBIO_TALLA.
CREATE OR REPLACE FUNCTION _ticket_de_cambio_abierto(p_ticket uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM tickets t JOIN devoluciones d
        ON d.tenant_id = t.tenant_id AND d.client_id_local = t.client_id_local AND d.motivo = 'CAMBIO_TALLA'
     WHERE t.id = p_ticket AND t.client_id_local IS NOT NULL
       AND t.estado_fiscal NOT IN ('PAGADO', 'FACTURADO', 'CANCELADO'));
$$;
REVOKE EXECUTE ON FUNCTION _ticket_de_cambio_abierto(uuid) FROM PUBLIC, anon, authenticated;

-- Un disparador para las cuatro puertas; TG_ARGV[0] es la columna que trae el id del ticket.
CREATE OR REPLACE FUNCTION trg_venta_de_cambio_fija()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF _ticket_de_cambio_abierto((to_jsonb(NEW)->>TG_ARGV[0])::uuid) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: es la venta de un cambio: cóbrala o cancélala completa' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

-- cancelar_item_ticket y reemplazar_item_ticket cancelan el renglón (cancelar_ticket_pagado no).
DROP TRIGGER IF EXISTS trg_ticket_items_venta_de_cambio ON ticket_items;
CREATE TRIGGER trg_ticket_items_venta_de_cambio
  BEFORE UPDATE OF cancelado ON ticket_items
  FOR EACH ROW WHEN (NEW.cancelado AND NOT OLD.cancelado)
  EXECUTE FUNCTION trg_venta_de_cambio_fija('ticket_id');
-- aplicar_descuento_manual, de ticket y de renglón, termina en este INSERT (el override de precio
-- que hizo antes se deshace con la excepción).
DROP TRIGGER IF EXISTS trg_descuentos_venta_de_cambio ON ticket_descuentos_manuales;
CREATE TRIGGER trg_descuentos_venta_de_cambio
  BEFORE INSERT ON ticket_descuentos_manuales
  FOR EACH ROW EXECUTE FUNCTION trg_venta_de_cambio_fija('ticket_id');
-- borrarCuentaVacia (apps/pos, cuentas-abiertas.ts) marca deleted_at.
DROP TRIGGER IF EXISTS trg_tickets_venta_de_cambio ON tickets;
CREATE TRIGGER trg_tickets_venta_de_cambio
  BEFORE UPDATE OF deleted_at ON tickets
  FOR EACH ROW WHEN (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
  EXECUTE FUNCTION trg_venta_de_cambio_fija('id');

-- cancelar_ticket_pagado: la de la 0134 (vigente) y, en la venta de un cambio, anula su pago interno
-- antes de registrar la cancelación (marcado "0196"): sin esto el cajón queda corto.
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

  -- 0196: la venta de un cambio sin cobrar del todo. Su pago interno en efectivo no entró al cajón
  -- (compensa la devolución del cambio): se anula, y el efectivo esperado baja lo que se le regresa.
  IF _ticket_de_cambio_abierto(p_ticket_id) THEN
    UPDATE pagos
       SET estado = 'CANCELADO', deleted_at = now(), updated_at = now()
     WHERE ticket_id = p_ticket_id AND tenant_id = v_ticket.tenant_id
       AND client_id_local = v_ticket.client_id_local || '-pago'
       AND estado IN ('APLICADO', 'CONCILIADO') AND deleted_at IS NULL;
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

-- ── §2 registrar_cambio_talla ────────────────────────────────────────────────
-- La de la 0195 §4 con cambios marcados "0196": llave obligatoria y atada a la venta, venta de la
-- sucursal de la caja, cantidades finitas de hasta 3 decimales y prenda con precio.
CREATE OR REPLACE FUNCTION registrar_cambio_talla(
  p_ticket_origen uuid, p_regresa jsonb, p_lleva jsonb, p_caja_id uuid, p_turno_id uuid,
  p_usuario_id uuid, p_autorizacion_pin_id uuid, p_usuario_autorizo_id uuid, p_client_id_local varchar DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_tk      tickets%ROWTYPE;
  v_items   jsonb;
  v_malo    boolean;
  v_total   boolean;
  v_dev     uuid;
  v_nuevo   uuid;
  v_regresa numeric(12,2);
  v_lleva   numeric(12,2);
  v_l       jsonb;
  v_n       int := 0;
  v_origen  uuid;
BEGIN
  -- 0196: sin llave no hay reintento seguro.
  IF p_client_id_local IS NULL OR p_client_id_local = '' THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: falta la llave del cambio' USING ERRCODE = '22023';
  END IF;

  -- Reintento con la misma llave: lo ya hecho (crear_devolucion y abrir_ticket son idempotentes,
  -- pero confirmar dos veces fallaría). 0196: solo si la llave es de esta misma venta.
  SELECT id, total_devuelto_mxn, ticket_original_id INTO v_dev, v_regresa, v_origen FROM devoluciones
   WHERE tenant_id = current_tenant_id() AND client_id_local = p_client_id_local AND motivo = 'CAMBIO_TALLA';
  IF FOUND THEN
    IF v_origen IS DISTINCT FROM p_ticket_origen THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: esa llave es de otro cambio' USING ERRCODE = '22023';
    END IF;
    SELECT id, total_mxn INTO v_nuevo, v_lleva FROM tickets
     WHERE tenant_id = current_tenant_id() AND client_id_local = p_client_id_local;
    RETURN jsonb_build_object('devolucion_id', v_dev, 'ticket_id', v_nuevo, 'regresa_mxn', v_regresa,
                              'lleva_mxn', v_lleva, 'diferencia_mxn', v_lleva - v_regresa);
  END IF;

  SELECT * INTO v_tk FROM tickets WHERE id = p_ticket_origen FOR UPDATE;
  IF NOT FOUND OR v_tk.tenant_id IS DISTINCT FROM current_tenant_id() THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la venta no es de este negocio' USING ERRCODE = '22023';
  END IF;
  -- 0196: la venta es de la sucursal de esta caja (antes de escribir nada).
  IF NOT EXISTS (SELECT 1 FROM cajas c WHERE c.id = p_caja_id AND c.tenant_id = v_tk.tenant_id AND c.sucursal_id = v_tk.sucursal_id) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: esa venta es de otra sucursal' USING ERRCODE = '22023';
  END IF;
  IF v_tk.estado_fiscal = 'FACTURADO' THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: Esta venta está facturada. Haz la devolución desde Devoluciones.' USING ERRCODE = '22023';
  END IF;
  IF v_tk.estado_fiscal <> 'PAGADO' THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: solo se cambia una venta pagada' USING ERRCODE = '22023';
  END IF;
  -- 0196: la cantidad es un número JSON (nunca NaN ni Infinity), positivo, de hasta 3 decimales.
  IF jsonb_typeof(p_lleva) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lleva) = 0
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_lleva) e
                 WHERE e->>'producto_id' IS NULL
                    OR jsonb_typeof(e->'cantidad') IS DISTINCT FROM 'number'
                    OR NOT ((e->>'cantidad')::numeric > 0 AND (e->>'cantidad')::numeric < 1000000
                            AND (e->>'cantidad')::numeric = round((e->>'cantidad')::numeric, 3))) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: falta lo que se lleva' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_regresa) IS DISTINCT FROM 'array' OR jsonb_array_length(p_regresa) = 0 THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: falta lo que regresa' USING ERRCODE = '22023';
  END IF;

  -- Cada renglón es de esta venta y no pasa de lo que queda por devolver (mismo criterio que el
  -- tope de 0040; aquí para que el rechazo sea DATOS_INVALIDOS y no a medias).
  WITH pedido AS (
    SELECT (e->>'ticket_item_id')::uuid AS id, sum((e->>'cantidad')::numeric) AS cant
      FROM jsonb_array_elements(p_regresa) e GROUP BY 1)
  SELECT jsonb_agg(jsonb_build_object('ticket_item_id', p.id, 'cantidad_devuelta', p.cant, 'reversar_inventario_item', true)),
         bool_or(ti.id IS NULL OR p.cant IS NULL OR NOT (p.cant > 0) OR p.cant > ti.cantidad - COALESCE(ya.cant, 0))
    INTO v_items, v_malo
    FROM pedido p
    LEFT JOIN ticket_items ti ON ti.id = p.id AND ti.ticket_id = p_ticket_origen AND NOT ti.cancelado
    LEFT JOIN LATERAL (SELECT sum(di.cantidad_devuelta) AS cant
                         FROM devolucion_items di JOIN devoluciones d ON d.id = di.devolucion_id
                        WHERE di.ticket_item_id_original = p.id AND d.estado <> 'CANCELADA' AND d.deleted_at IS NULL) ya ON true;
  IF v_malo THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: un renglón no es de esta venta o ya se devolvió' USING ERRCODE = '22023';
  END IF;

  -- TOTAL si con esto queda devuelta toda la venta.
  v_total := NOT EXISTS (
    SELECT 1 FROM ticket_items ti
     WHERE ti.ticket_id = p_ticket_origen AND NOT ti.cancelado
       AND ti.cantidad > COALESCE((SELECT sum(di.cantidad_devuelta) FROM devolucion_items di JOIN devoluciones d ON d.id = di.devolucion_id
                                    WHERE di.ticket_item_id_original = ti.id AND d.estado <> 'CANCELADA' AND d.deleted_at IS NULL), 0)
                       + COALESCE((SELECT (x->>'cantidad_devuelta')::numeric FROM jsonb_array_elements(v_items) x
                                    WHERE (x->>'ticket_item_id')::uuid = ti.id), 0));

  v_dev := crear_devolucion(p_ticket_origen, p_caja_id, p_turno_id,
    (CASE WHEN v_total THEN 'TOTAL' ELSE 'PARCIAL' END)::devolucion_alcance,
    'CAMBIO_TALLA'::devolucion_motivo, NULL, 'EFECTIVO'::devolucion_medio,
    p_autorizacion_pin_id, p_usuario_id, p_usuario_autorizo_id, v_items, true,
    v_tk.cliente_id, NULL, p_client_id_local);
  PERFORM confirmar_devolucion(v_dev, p_usuario_id);
  SELECT total_devuelto_mxn INTO v_regresa FROM devoluciones WHERE id = v_dev;

  -- abrir_ticket valida que el turno esté abierto en esa caja y en la sucursal de la venta.
  v_nuevo := abrir_ticket(v_tk.sucursal_id, p_caja_id, p_turno_id, 'PARA_LLEVAR'::modo_servicio,
                          v_tk.cliente_id, NULL, p_client_id_local, p_usuario_id);
  FOR v_l IN SELECT * FROM jsonb_array_elements(p_lleva) LOOP
    v_n := v_n + 1;
    PERFORM agregar_item_a_ticket(v_nuevo, (v_l->>'producto_id')::uuid, (v_l->>'cantidad')::numeric,
                                  NULL, '[]'::jsonb, p_client_id_local || '-' || v_n);
  END LOOP;
  SELECT total_mxn INTO v_lleva FROM tickets WHERE id = v_nuevo;
  -- 0196: una prenda en $0 dejaba una venta ABIERTA en cero, sin cobro posible.
  IF NOT (v_lleva > 0) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la prenda que se lleva no tiene precio' USING ERRCODE = '22023';
  END IF;

  IF LEAST(v_regresa, v_lleva) > 0 THEN
    PERFORM aplicar_pago(v_nuevo, 'EFECTIVO'::metodo_pago, LEAST(v_regresa, v_lleva), NULL, NULL, NULL, NULL, false,
                         'Cambio de la venta ' || v_tk.folio_completo, p_client_id_local || '-pago');
  END IF;

  RETURN jsonb_build_object('devolucion_id', v_dev, 'ticket_id', v_nuevo, 'regresa_mxn', v_regresa,
                            'lleva_mxn', v_lleva, 'diferencia_mxn', v_lleva - v_regresa);
END;
$$;

-- ── §3 Lo que la caja sube de existencias ────────────────────────────────────
-- La de la 0195 §3 (mismo contrato R3: {aplicados, errores, descartados}) con cambios "0196": la
-- caja solo genera VENTA y DEVOLUCION de un ticket; el usuario es del negocio; y un id que ya
-- existe se salta solo si es de este negocio (de otro, es error). sync_push_snapshot no cambia.
CREATE OR REPLACE FUNCTION _vim_aplicar_movimientos_producto(p_tenant uuid, p_movs jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_fila        jsonb;
  v_id          uuid;
  v_n           integer := 0;
  v_errores     jsonb := '[]'::jsonb;
  v_descartados jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_movs) IS DISTINCT FROM 'array' THEN
    RETURN jsonb_build_object('aplicados', 0, 'errores', '[]'::jsonb, 'descartados', '[]'::jsonb);
  END IF;
  FOR v_fila IN SELECT value FROM jsonb_array_elements(p_movs) ORDER BY value->>'creado_at' LOOP
    BEGIN
      IF (v_fila->>'tenant_id')::uuid IS DISTINCT FROM p_tenant THEN
        RAISE EXCEPTION 'movimiento de otro negocio';
      END IF;
      IF EXISTS (SELECT 1 FROM movimientos_producto WHERE id = (v_fila->>'id')::uuid) THEN
        IF EXISTS (SELECT 1 FROM movimientos_producto WHERE id = (v_fila->>'id')::uuid AND tenant_id = p_tenant) THEN CONTINUE; END IF;
        RAISE EXCEPTION 'el id ya existe en otro negocio';   -- 0196
      END IF;
      -- 0196
      IF v_fila->>'tipo' IS NULL OR v_fila->>'tipo' NOT IN ('VENTA', 'DEVOLUCION') OR NULLIF(v_fila->>'ticket_id', '') IS NULL THEN
        RAISE EXCEPTION 'la caja solo sube ventas y devoluciones de un ticket';
      END IF;
      IF NULLIF(v_fila->>'usuario_id', '') IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM usuarios_acceso ua WHERE ua.usuario_id = (v_fila->>'usuario_id')::uuid AND ua.tenant_id = p_tenant) THEN
        RAISE EXCEPTION 'el usuario no es de este negocio';
      END IF;
      v_id := NULL;
      INSERT INTO movimientos_producto SELECT * FROM jsonb_populate_record(NULL::movimientos_producto, v_fila)
        ON CONFLICT (id) DO NOTHING RETURNING id INTO v_id;
      IF v_id IS NOT NULL THEN v_n := v_n + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Producto de este negocio que ya no lleva existencias: descartado. De otro negocio: error.
      IF SQLERRM LIKE 'MOVIMIENTO_INVALIDO: el producto no lleva existencias%'
         AND EXISTS (SELECT 1 FROM productos WHERE id = (v_fila->>'producto_id')::uuid AND tenant_id = p_tenant) THEN
        v_descartados := v_descartados || to_jsonb(v_fila->>'id');
      ELSE
        v_errores := v_errores || jsonb_build_object('tabla', 'movimientos_producto', 'id', v_fila->>'id', 'error', SQLERRM);
      END IF;
    END;
  END LOOP;
  RETURN jsonb_build_object('aplicados', v_n, 'errores', v_errores, 'descartados', v_descartados);
END;
$fn$;
REVOKE ALL ON FUNCTION _vim_aplicar_movimientos_producto(uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- ── §4 Disparadores ──────────────────────────────────────────────────────────
-- El renglón de un ticket cobrado o CANCELADO no cambia de producto (0195 §1 + CANCELADO).
CREATE OR REPLACE FUNCTION trg_ticket_items_producto_fijo()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.producto_id IS DISTINCT FROM OLD.producto_id
     AND EXISTS (SELECT 1 FROM tickets t WHERE t.id = NEW.ticket_id AND t.estado_fiscal IN ('PAGADO', 'FACTURADO', 'CANCELADO')) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: no se cambia el producto de un renglón cobrado o cancelado' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- 0195 §2, ahora como su dueño: lee `tenants` sin depender de la RLS de quien abre el ticket.
CREATE OR REPLACE FUNCTION trg_tickets_tienda_sin_cocina()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM tenants t WHERE t.id = NEW.tenant_id AND t.vertical_principal = 'RETAIL') THEN
    NEW.envio_cocina_automatico := false;
  END IF;
  RETURN NEW;
END;
$$;
