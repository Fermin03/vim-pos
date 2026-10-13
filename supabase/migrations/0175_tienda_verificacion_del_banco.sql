-- 0175 · Tienda en línea: el pago que espera la verificación del banco (3D Secure).
--
-- Desde esta entrega la orden de Mercado Pago se crea con verificación «solo si hay riesgo». Cuando
-- su antifraude duda, en vez de rechazar (`high_risk`) le pide al cliente confirmar con su banco: la
-- orden queda `action_required` / `pending_challenge` y NO está cobrada ni rechazada. El pedido sigue
-- POR_PAGAR (invisible para la caja) mientras el cliente contesta.
--
-- LO QUE MANDA EN ESTE DISEÑO (VERIFICADO el 12 y 13 oct 2026, documento 04): una orden que espera
-- el reto NO se puede cancelar en Mercado Pago (422) y sigue viva al menos 45 minutos con su
-- dirección: el cliente puede contestarlo tarde. Así que dejar un reto —porque el cliente tocó
-- «Cancelar» o porque pasó nuestro plazo— no puede depender de Mercado Pago:
--
--   · el pedido se cierra «sin pago» de NUESTRO lado y el cliente puede pagar otra vez enseguida
--     (otro pedido, otro pago, otra orden);
--   · el pago de ese intento queda ABANDONADO —estado nuevo: «el reto se dejó y su orden sigue viva
--     allá»— y se VIGILA hasta que la orden llegue a un final: cada 5 minutos la primera media hora,
--     luego cada hora, hasta 48 horas;
--   · si en ese tiempo aparece cobrada (el cliente contestó tarde), es un pago que llegó tarde: se
--     DEVUELVE entero, con la regla y el barrido de siempre. Si acaba rechazada, cancelada o
--     vencida, se da por conciliado. Mientras siga pendiente no es «posible cobro sin pedido» (no
--     hay cobro): no suma fallos ni manda correos. Si a las 48 horas sigue pendiente, sale una vez
--     como RETO_VIEJO y la función avisa a VIM;
--   · mientras se vigila, la cuenta de Mercado Pago no se puede desconectar: si se aprueba tarde
--     hay que poder devolverlo.
--
-- EL PLAZO: 10 minutos desde que se mandó el cobro. Los 5 de siempre son para un cobro que Mercado
-- Pago no contestó, donde nadie tiene que hacer nada. Aquí el cliente tiene que recibir un mensaje o
-- abrir la aplicación de su banco, entrar y aprobar: 5 minutos contados desde que nació el pedido
-- dejan fuera a quien tarda en encontrar su token. Diez alcanzan y siguen siendo poco para un pedido
-- de comida. Lo aplica la base sola (el barrido de cada minuto): no hace falta hablar con nadie.
--
-- Qué trae:
--   1) el estado ABANDONADO y la columna tienda_pagos.verificacion_at;
--   2) tienda_pago_verificacion (anota que el pago espera el reto y le da su plazo) y
--      tienda_pago_abandonar (deja el reto: cierra el pedido sin pago y el pago queda vigilado);
--   3) seis funciones de la 0173 con su cuerpo copiado ÍNTEGRO y los cambios que se dicen en cada una.
--
-- Compatibilidad: la función `tienda` desplegada hoy no crea órdenes con verificación ni llama a las
-- funciones nuevas, así que nada cambia hasta desplegar la nueva; esta migración va ANTES. No usa
-- Vault ni pg_net de forma nueva: corre igual en el Postgres de la caja, donde tienda_pagos está vacía.

ALTER TABLE tienda_pagos ADD COLUMN IF NOT EXISTS verificacion_at timestamptz NULL;
COMMENT ON COLUMN tienda_pagos.verificacion_at IS 'Cuándo se supo que la orden de este pago espera la verificación del banco (3D Secure). Con ella, vence_at es el plazo de la verificación y el pedido no vence antes.';

-- ABANDONADO: el cliente dejó el reto del banco (lo canceló, o pasó el plazo). No se cobró nada,
-- pero la orden sigue viva en Mercado Pago, que no la deja cancelar: se vigila hasta su final.
ALTER TABLE tienda_pagos DROP CONSTRAINT IF EXISTS tienda_pago_estado_valido;
ALTER TABLE tienda_pagos ADD CONSTRAINT tienda_pago_estado_valido CHECK (
  estado IN ('CREADO', 'APROBADO', 'RECHAZADO', 'VENCIDO', 'ABANDONADO', 'POR_DEVOLVER', 'DEVUELTO', 'DEVOLUCION_FALLIDA'));

-- ── §1 El pago espera el reto del banco ──────────────────────────────────────
-- Anota la orden (si aún no tenía: mismas reglas que tienda_pago_anotar) y alarga su plazo a 10
-- minutos desde que se mandó el cobro. UNA sola vez por pago: repetirla no hace nada, así que
-- insistir no compra más tiempo. Solo sobre un pago que sigue esperando (CREADO) y cuya orden, si
-- ya tiene una, es esa misma. No mueve estados ni el pedido.
-- La dirección del reto NO se guarda aquí ni en ningún lado: lleva un token del cliente.
CREATE OR REPLACE FUNCTION tienda_pago_verificacion(p_pago uuid, p_orden text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (p_orden ~ '^[A-Za-z0-9_-]{1,64}$') IS NOT TRUE THEN
    RAISE EXCEPTION 'PAGO_RESULTADO_INVALIDO: orden %', COALESCE(left(p_orden, 40), 'NULL');
  END IF;
  UPDATE tienda_pagos g
     SET orden_id_externo = p_orden,
         verificacion_at = now(),
         vence_at = GREATEST(g.vence_at, COALESCE(g.cobro_pedido_at, now()) + interval '10 minutes')
   WHERE g.id = p_pago AND NOT g.extra AND g.estado = 'CREADO' AND g.aprobado_at IS NULL
     AND g.verificacion_at IS NULL
     AND (g.orden_id_externo IS NULL OR g.orden_id_externo = p_orden)
     AND NOT EXISTS (SELECT 1 FROM tienda_pagos o WHERE o.orden_id_externo = p_orden AND o.id <> g.id);
END;
$$;
COMMENT ON FUNCTION tienda_pago_verificacion IS
  'El pago en línea espera la verificación del banco (3D Secure): anota su orden y le da 10 minutos desde que se mandó el cobro. Una vez por pago. Solo service_role.';

-- ── §2 Dejar el reto ─────────────────────────────────────────────────────────
-- El cliente tocó «Cancelar», o la función encontró un reto que nadie puede contestar. El pedido que
-- esperaba se cierra «sin pago» (nunca existió para la caja) y su pago queda ABANDONADO, con el reloj
-- de la vigilancia en cero. NO se borra nada: el renglón es lo único que sabe qué orden hay que
-- seguir mirando, y por él se devuelve si esa orden acaba cobrada.
--   · desde CREADO (el pedido espera): hace falta saber la orden —la que ya tiene anotada, o p_orden—;
--   · desde VENCIDO (el pedido ya venció y se descubre que su orden esperaba un reto): solo cambia
--     el pago, para que se vigile como lo que es en vez de darse por conciliado a la hora.
-- Verdadero = quedó abandonado. Falso = no era un pago que se pudiera dejar, y no se tocó nada.
-- El vencimiento del plazo NO pasa por aquí: lo hace tienda_pagos_barrer.
CREATE OR REPLACE FUNCTION tienda_pago_abandonar(p_pago uuid, p_orden text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pedido uuid;
  v_estado text;
BEGIN
  IF p_orden IS NOT NULL AND (p_orden ~ '^[A-Za-z0-9_-]{1,64}$') IS NOT TRUE THEN
    RAISE EXCEPTION 'PAGO_RESULTADO_INVALIDO: orden %', left(p_orden, 40);
  END IF;
  SELECT pedido_id INTO v_pedido FROM tienda_pagos WHERE id = p_pago AND NOT extra;
  IF NOT FOUND THEN RETURN false; END IF;
  -- Siempre el pedido antes que el pago: el mismo orden de candados en todas las funciones.
  SELECT estado INTO v_estado FROM delivery_pedidos WHERE id = v_pedido FOR UPDATE;
  UPDATE tienda_pagos g
     SET estado = 'ABANDONADO',
         orden_id_externo = COALESCE(g.orden_id_externo, p_orden),
         verificacion_at = COALESCE(g.verificacion_at, now()),
         vence_at = CASE WHEN g.estado = 'CREADO' THEN now() ELSE g.vence_at END,
         conciliaciones = 0, conciliado_at = NULL, consultado_at = NULL
   WHERE g.id = p_pago AND NOT g.extra AND g.aprobado_at IS NULL
     AND ((g.estado = 'CREADO' AND v_estado = 'POR_PAGAR') OR (g.estado = 'VENCIDO' AND v_estado = 'EXPIRADO'))
     AND COALESCE(g.orden_id_externo, p_orden) IS NOT NULL
     AND (g.orden_id_externo IS NOT NULL OR NOT EXISTS (SELECT 1 FROM tienda_pagos o WHERE o.orden_id_externo = p_orden));
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE delivery_pedidos
     SET estado = 'EXPIRADO', cancelado_at = now(), cancelado_por = 'TIMEOUT', motivo_cancelacion = 'Sin pago'
   WHERE id = v_pedido AND estado = 'POR_PAGAR';
  RETURN true;
END;
$$;
COMMENT ON FUNCTION tienda_pago_abandonar IS
  'El cliente dejó la verificación del banco (o nadie puede contestarla): cierra el pedido sin pago y deja el pago ABANDONADO, vigilado hasta que su orden de Mercado Pago llegue a un final. Solo service_role.';

REVOKE ALL ON FUNCTION tienda_pago_verificacion(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tienda_pago_verificacion(uuid, text) TO service_role;
REVOKE ALL ON FUNCTION tienda_pago_abandonar(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tienda_pago_abandonar(uuid, text) TO service_role;

-- ── §3 Lo que cambia de la 0173 ──────────────────────────────────────────────
-- Cada función va con su cuerpo copiado ÍNTEGRO de 0173_tienda_pago_en_linea.sql y solo el cambio
-- que se dice. CREATE OR REPLACE conserva sus permisos (0173 §9) y, en el barrido, su cron.

-- tienda_conexion_ocupada: un reto ABANDONADO que se sigue vigilando también ocupa la cuenta (como
-- un VENCIDO sin conciliar): si se aprueba tarde hay que poder devolverlo con sus tokens.
CREATE OR REPLACE FUNCTION tienda_conexion_ocupada(p_conexion uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_hasta timestamptz;
BEGIN
  IF EXISTS (SELECT 1 FROM tienda_pagos g
              WHERE g.conexion_id = p_conexion
                AND (g.estado IN ('CREADO', 'POR_DEVOLVER', 'DEVOLUCION_FALLIDA')
                     OR (g.estado IN ('VENCIDO', 'ABANDONADO') AND g.cobro_pedido_at IS NOT NULL AND g.conciliado_at IS NULL
                         AND g.vence_at > now() - interval '48 hours'))) THEN
    RETURN jsonb_build_object('motivo', 'PENDIENTES');
  END IF;
  SELECT max(g.aprobado_at) + interval '48 hours' INTO v_hasta
    FROM tienda_pagos g
   WHERE g.conexion_id = p_conexion AND g.estado = 'APROBADO' AND g.aprobado_at > now() - interval '48 hours';
  IF v_hasta IS NOT NULL THEN RETURN jsonb_build_object('motivo', 'RECIENTES', 'hasta', v_hasta); END IF;
  RETURN NULL;
END $$;

-- tienda_pago_aplicar: dos cambios.
--   · RECHAZADO sobre un pago ABANDONADO: su orden llegó a un final sin cobrarse; se anota el motivo
--     y se da por conciliado (deja de vigilarse). El pedido ya estaba cerrado.
--   · APROBADO sobre un pago ABANDONADO: llegó tarde, igual que sobre uno VENCIDO → POR_DEVOLVER.
CREATE OR REPLACE FUNCTION tienda_pago_aplicar(
  p_pago uuid, p_resultado text, p_orden_id_externo text, p_monto numeric,
  p_tipo text DEFAULT NULL, p_marca text DEFAULT NULL, p_detalle text DEFAULT NULL, p_pago_id_externo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pedido   uuid;
  v_p        delivery_pedidos%ROWTYPE;
  v_g        tienda_pagos%ROWTYPE;
  v_min      integer;
  v_aprobado boolean := false;
  v_suya     boolean;
BEGIN
  IF p_resultado IS NULL OR p_resultado NOT IN ('APROBADO', 'RECHAZADO', 'DEVUELTO')
     OR (p_orden_id_externo ~ '^[A-Za-z0-9_-]{1,64}$') IS NOT TRUE
     OR (p_pago_id_externo IS NOT NULL AND (p_pago_id_externo ~ '^[A-Za-z0-9_-]{1,64}$') IS NOT TRUE) THEN
    RAISE EXCEPTION 'PAGO_RESULTADO_INVALIDO: % / %', COALESCE(p_resultado, 'NULL'), COALESCE(left(p_orden_id_externo, 40), 'NULL');
  END IF;

  SELECT pedido_id INTO v_pedido FROM tienda_pagos WHERE id = p_pago AND NOT extra;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAGO_NO_EXISTE: %', COALESCE(p_pago::text, 'NULL'); END IF;
  -- Siempre el pedido antes que el pago: el mismo orden de candados en todas las funciones.
  SELECT * INTO v_p FROM delivery_pedidos WHERE id = v_pedido FOR UPDATE;
  SELECT * INTO v_g FROM tienda_pagos WHERE id = p_pago FOR UPDATE;
  -- ¿El renglón del pedido puede recibir ESTA orden? Sí si aún no tiene cobro y, si ya se le anotó
  -- una orden (quedó en revisión), es esta misma.
  v_suya := v_g.aprobado_at IS NULL AND (v_g.orden_id_externo IS NULL OR v_g.orden_id_externo = p_orden_id_externo);

  IF p_resultado = 'DEVUELTO' THEN
    -- Mercado Pago dice que esa orden ya se devolvió (la devolvimos nosotros, o el restaurante desde su cuenta).
    UPDATE tienda_pagos SET estado = 'DEVUELTO', devuelto_at = COALESCE(devuelto_at, now()), ultimo_error = NULL
     WHERE pedido_id = v_pedido AND orden_id_externo = p_orden_id_externo
       AND estado IN ('APROBADO', 'POR_DEVOLVER', 'DEVOLUCION_FALLIDA');

  ELSIF p_resultado = 'RECHAZADO' THEN
    -- La orden de un reto abandonado llegó a su final sin cobrarse: ya no hay nada que vigilar.
    UPDATE tienda_pagos SET detalle = left(p_detalle, 80), conciliado_at = now(), ultimo_error = NULL
     WHERE id = p_pago AND estado = 'ABANDONADO' AND v_suya;
    UPDATE tienda_pagos SET estado = 'RECHAZADO', detalle = left(p_detalle, 80)
     WHERE id = p_pago AND estado = 'CREADO' AND v_suya;
    -- Ya no hay nada que esperar: el pedido se cierra como «sin pago» (nunca existió para la caja).
    IF FOUND AND v_p.estado = 'POR_PAGAR' THEN
      UPDATE delivery_pedidos
         SET estado = 'EXPIRADO', cancelado_at = now(), cancelado_por = 'TIMEOUT', motivo_cancelacion = 'Sin pago'
       WHERE id = v_pedido;
    END IF;

  ELSIF EXISTS (SELECT 1 FROM tienda_pagos WHERE orden_id_externo = p_orden_id_externo AND aprobado_at IS NOT NULL) THEN
    NULL;   -- esa orden ya está aplicada: aviso repetido

  ELSIF (p_monto > 0) IS NOT TRUE THEN
    RAISE EXCEPTION 'PAGO_RESULTADO_INVALIDO: monto %', COALESCE(p_monto::text, 'NULL');

  ELSIF v_suya AND v_g.estado IN ('CREADO', 'RECHAZADO') AND v_p.estado = 'POR_PAGAR' AND p_monto = v_g.monto_mxn THEN
    SELECT c.minutos_aceptacion INTO v_min FROM tienda_config c WHERE c.tenant_id = v_p.tenant_id;
    UPDATE tienda_pagos
       SET estado = 'APROBADO', orden_id_externo = p_orden_id_externo, pago_id_externo = p_pago_id_externo,
           tipo_tarjeta = left(p_tipo, 20), marca = left(p_marca, 30), aprobado_at = now(), detalle = NULL, ultimo_error = NULL
     WHERE id = p_pago;
    -- Para el restaurante el pedido llega AHORA: desde aquí corre su ventana, y aquí se decide quién
    -- lo atiende (la caja pudo encenderse o apagarse mientras el cliente pagaba). A una caja solo si
    -- late una que sepa de pedidos pagados: a una anterior el espejo no se lo baja, y se quedaría
    -- sin nadie que lo atienda hasta vencer.
    UPDATE delivery_pedidos
       SET estado = 'RECIBIDO', pagado_at = now(), recibido_at = now(),
           vence_aceptacion = now() + make_interval(mins => COALESCE(v_min, 5)),
           gestion = CASE WHEN _tienda_caja_en_linea_viva(sucursal_id) THEN 'ESCRITORIO' ELSE 'NUBE' END,
           gestion_caja_id = NULL
     WHERE id = v_pedido;
    v_aprobado := true;

  ELSIF v_suya AND v_g.estado IN ('CREADO', 'RECHAZADO', 'VENCIDO', 'ABANDONADO') AND p_monto = v_g.monto_mxn THEN
    -- Llegó tarde: el pedido ya no espera pago (venció, o el cliente dejó el reto del banco y lo
    -- contestó después). Se devuelve.
    UPDATE tienda_pagos
       SET estado = 'POR_DEVOLVER', orden_id_externo = p_orden_id_externo, pago_id_externo = p_pago_id_externo,
           tipo_tarjeta = left(p_tipo, 20), marca = left(p_marca, 30), aprobado_at = now(), proximo_intento_at = NULL
     WHERE id = p_pago;

  ELSE
    -- Sobra: el pedido ya tiene su orden, o esta no es por el monto esperado. Se devuelve lo cobrado.
    -- Si era la orden anotada en el renglón del pedido (quedó en revisión y se aprobó por otro
    -- monto), se le quita de ahí: un renglón por orden.
    UPDATE tienda_pagos SET orden_id_externo = NULL
     WHERE id = p_pago AND orden_id_externo = p_orden_id_externo AND aprobado_at IS NULL;
    INSERT INTO tienda_pagos (tenant_id, pedido_id, conexion_id, monto_mxn, estado, extra, orden_id_externo, pago_id_externo,
                              tipo_tarjeta, marca, vence_at, aprobado_at)
    VALUES (v_g.tenant_id, v_pedido, v_g.conexion_id, p_monto, 'POR_DEVOLVER', true, p_orden_id_externo, p_pago_id_externo,
            left(p_tipo, 20), left(p_marca, 30), v_g.vence_at, now());
  END IF;

  RETURN jsonb_build_object(
    'estado', (SELECT g.estado FROM tienda_pagos g WHERE g.id = p_pago),
    'pedido_estado', (SELECT d.estado FROM delivery_pedidos d WHERE d.id = v_pedido),
    'recien_aprobado', v_aprobado);
END;
$$;

-- tienda_pagos_tomar: se añaden las dos tareas del reto abandonado (vigilarlo, y el último vistazo a
-- las 48 horas, RETO_VIEJO). Lo de DEVOLVER y CONCILIAR no cambia.
CREATE OR REPLACE FUNCTION tienda_pagos_tomar(p_max integer DEFAULT 10)
RETURNS TABLE (id uuid, tarea text, conexion_id uuid, orden_id_externo text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH toca AS (
    SELECT g.id FROM tienda_pagos g
     WHERE g.estado = 'POR_DEVOLVER' AND (g.proximo_intento_at IS NULL OR g.proximo_intento_at <= now())
       AND COALESCE(g.aprobado_at, g.created_at) <= now() - interval '1 minute'
     ORDER BY g.updated_at LIMIT GREATEST(p_max, 1) FOR UPDATE SKIP LOCKED
  ), tomados AS (
    UPDATE tienda_pagos g SET proximo_intento_at = now() + interval '2 minutes'
      FROM toca WHERE g.id = toca.id
    RETURNING g.id, g.conexion_id, g.orden_id_externo
  )
  SELECT t.id, 'DEVOLVER'::text, t.conexion_id, t.orden_id_externo FROM tomados t;

  RETURN QUERY
  WITH toca AS (
    SELECT g.id FROM tienda_pagos g
     -- Solo si el cobro llegó a mandarse: sin eso no hay nada que buscar en Mercado Pago.
     WHERE NOT g.extra AND g.conciliado_at IS NULL AND g.cobro_pedido_at IS NOT NULL
       AND g.vence_at > now() - interval '48 hours'
       AND ((g.estado = 'CREADO' AND g.cobro_pedido_at < now() - interval '20 seconds')
            OR (g.estado = 'VENCIDO' AND (g.conciliaciones = 0 OR g.vence_at < now() - interval '1 hour')))
       AND (g.consultado_at IS NULL OR g.consultado_at < now() - CASE
              WHEN g.conciliacion_fallos >= 3 THEN interval '1 hour'
              ELSE interval '45 seconds' END)
     ORDER BY g.consultado_at NULLS FIRST, g.created_at LIMIT GREATEST(p_max, 1) FOR UPDATE SKIP LOCKED
  ), tomados AS (
    UPDATE tienda_pagos g SET consultado_at = now()
      FROM toca WHERE g.id = toca.id
    RETURNING g.id, g.conexion_id, g.orden_id_externo
  )
  SELECT t.id, 'CONCILIAR'::text, t.conexion_id, t.orden_id_externo FROM tomados t;

  -- El reto del banco que se abandonó y cuya orden sigue viva en Mercado Pago: se vigila hasta que
  -- llegue a un final. Cada 5 minutos la primera media hora (es cuando el cliente todavía puede
  -- contestarlo tarde), luego una vez por hora, hasta 48 horas. Con tres consultas seguidas sin
  -- poder hacerse, una por hora (como arriba).
  RETURN QUERY
  WITH toca AS (
    SELECT g.id FROM tienda_pagos g
     WHERE NOT g.extra AND g.estado = 'ABANDONADO' AND g.conciliado_at IS NULL
       AND g.vence_at > now() - interval '48 hours'
       AND (g.consultado_at IS NULL OR g.consultado_at < now() - CASE
              WHEN g.conciliacion_fallos >= 3 OR g.vence_at < now() - interval '30 minutes' THEN interval '1 hour'
              ELSE interval '5 minutes' END)
     ORDER BY g.consultado_at NULLS FIRST, g.created_at LIMIT GREATEST(p_max, 1) FOR UPDATE SKIP LOCKED
  ), tomados AS (
    UPDATE tienda_pagos g SET consultado_at = now()
      FROM toca WHERE g.id = toca.id
    RETURNING g.id, g.conexion_id, g.orden_id_externo
  )
  SELECT t.id, 'CONCILIAR'::text, t.conexion_id, t.orden_id_externo FROM tomados t;

  -- A las 48 horas se deja de vigilar. Sale UNA vez (se da por conciliado al tomarlo) para que la
  -- función lo mire por última vez y, si la orden sigue pendiente, avise a VIM.
  RETURN QUERY
  WITH toca AS (
    SELECT g.id FROM tienda_pagos g
     WHERE NOT g.extra AND g.estado = 'ABANDONADO' AND g.conciliado_at IS NULL
       AND g.vence_at <= now() - interval '48 hours'
     ORDER BY g.vence_at LIMIT GREATEST(p_max, 1) FOR UPDATE SKIP LOCKED
  ), tomados AS (
    UPDATE tienda_pagos g SET conciliado_at = now(), consultado_at = now()
      FROM toca WHERE g.id = toca.id
    RETURNING g.id, g.conexion_id, g.orden_id_externo
  )
  SELECT t.id, 'RETO_VIEJO'::text, t.conexion_id, t.orden_id_externo FROM tomados t;
END;
$$;

-- tienda_pago_conciliacion: una consulta buena de un pago ABANDONADO también se cuenta (con la
-- primera, la función sabe que ya intentó cancelar la orden). No lo da por conciliado: eso lo hace
-- el final de su orden (tienda_pago_aplicar) o las 48 horas (tienda_pagos_tomar).
CREATE OR REPLACE FUNCTION tienda_pago_conciliacion(p_pago uuid, p_ok boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_fallos integer;
BEGIN
  IF p_ok THEN
    UPDATE tienda_pagos
       SET conciliacion_fallos = 0,
           conciliaciones = conciliaciones + CASE WHEN estado IN ('VENCIDO', 'ABANDONADO') THEN 1 ELSE 0 END,
           conciliado_at = CASE WHEN estado = 'VENCIDO' AND conciliaciones >= 1 THEN now() ELSE conciliado_at END
     WHERE id = p_pago;
    RETURN false;
  END IF;
  UPDATE tienda_pagos SET conciliacion_fallos = conciliacion_fallos + 1
   WHERE id = p_pago RETURNING conciliacion_fallos INTO v_fallos;
  RETURN COALESCE(v_fallos = 3, false);
END;
$$;

-- tienda_seguimiento: el pedido cerrado porque el reto del banco se dejó dice su motivo propio,
-- SIN_VERIFICAR, en vez de SIN_PAGO. `pago_estado` no cambia (SIN_PAGO: no se cobró nada; y si
-- después se aprueba tarde, DEVOLUCION_EN_PROCESO y DEVUELTO, como cualquier pago tardío).
CREATE OR REPLACE FUNCTION tienda_seguimiento(p_tenant uuid, p_seguimiento_hash text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_p      delivery_pedidos%ROWTYPE;
  v_g      tienda_pagos%ROWTYPE;
  v_estado text;
  v_envio_total numeric(12,2);
  v_en_linea boolean;
BEGIN
  IF p_seguimiento_hash IS NULL OR p_seguimiento_hash !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
  SELECT * INTO v_p FROM delivery_pedidos
   WHERE seguimiento_hash = p_seguimiento_hash AND tenant_id = p_tenant AND canal = 'TIENDA';
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_estado := _tienda_estado_real(v_p);
  v_envio_total := v_p.total_cliente_mxn - COALESCE(v_p.subtotal_mxn, v_p.total_cliente_mxn);
  v_en_linea := v_p.pago_al_recibir IS NOT DISTINCT FROM 'EN_LINEA';
  IF v_en_linea THEN
    SELECT * INTO v_g FROM tienda_pagos g WHERE g.pedido_id = v_p.id AND NOT g.extra;
  END IF;

  RETURN jsonb_build_object(
    'folio_corto', v_p.folio_corto,
    'modo', CASE v_p.app WHEN 'DELIVERY_PROPIO' THEN 'DOMICILIO' ELSE 'RECOGER' END,
    'estado', _tienda_estado_publico(v_estado, v_p.app::text),
    'motivo', CASE
      WHEN v_estado = 'EXPIRADO' AND v_en_linea AND v_p.pagado_at IS NULL AND v_g.estado = 'ABANDONADO' THEN 'SIN_VERIFICAR'
      WHEN v_estado = 'EXPIRADO' AND v_en_linea AND v_p.pagado_at IS NULL THEN 'SIN_PAGO'
      WHEN v_estado = 'EXPIRADO' THEN 'SIN_RESPUESTA'
      WHEN v_estado IN ('RECHAZADO', 'CANCELADO') THEN
        CASE WHEN upper(btrim(split_part(v_p.motivo_cancelacion, ':', 1))) IN ('AGOTADO', 'CERRADO', 'SATURADO', 'OTRO')
             THEN upper(btrim(split_part(v_p.motivo_cancelacion, ':', 1)))
             ELSE 'OTRO' END
      END,
    'renglones', _tienda_renglones(v_p.items),
    'subtotal_mxn', to_char(COALESCE(v_p.subtotal_mxn, v_p.total_cliente_mxn), 'FM999999990.00'),
    'envio_total_mxn', to_char(v_envio_total, 'FM999999990.00'),
    'total_mxn', to_char(v_p.total_cliente_mxn, 'FM999999990.00'),
    'pago', v_p.pago_al_recibir,
    'recibido_at', v_p.recibido_at,
    'sucursal', (SELECT jsonb_build_object('nombre', s.nombre, 'telefono', s.telefono)
                   FROM sucursales s WHERE s.id = v_p.sucursal_id))
    || CASE WHEN NOT v_en_linea THEN '{}'::jsonb ELSE jsonb_build_object(
      'pago_estado', CASE
        WHEN v_g.estado = 'APROBADO' THEN 'PAGADO'
        WHEN v_g.estado IN ('POR_DEVOLVER', 'DEVOLUCION_FALLIDA') THEN 'DEVOLUCION_EN_PROCESO'
        WHEN v_g.estado = 'DEVUELTO' THEN 'DEVUELTO'
        -- El cobro se mandó y no se sabe qué pasó (o venció y todavía no se le ha podido preguntar a
        -- Mercado Pago): no se afirma nada.
        WHEN v_p.estado = 'POR_PAGAR' THEN 'POR_CONFIRMAR'
        WHEN _tienda_pago_sin_confirmar(v_p.id) THEN 'POR_CONFIRMAR'
        ELSE 'SIN_PAGO' END,
      'propina_mxn', to_char(COALESCE(v_p.propina_mxn, 0), 'FM999999990.00'),
      'total_a_pagar_mxn', to_char(v_p.total_cliente_mxn + COALESCE(v_p.propina_mxn, 0), 'FM999999990.00')) END;
END;
$$;

-- tienda_pagos_barrer: dos cambios.
--   · el pedido cuyo pago espera la verificación no vence a los 5 minutos de nacer: vence con el
--     plazo de su pago, y ese pago queda ABANDONADO (no VENCIDO);
--   · un reto abandonado al que le toca consulta también hace que se llame a la función.
CREATE OR REPLACE FUNCTION tienda_pagos_barrer() RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids     uuid[];
  v_secreto text;
  v_base    text;
BEGIN
  WITH vencidos AS (
    UPDATE delivery_pedidos d
       SET estado = 'EXPIRADO', cancelado_at = now(), cancelado_por = 'TIMEOUT', motivo_cancelacion = 'Sin pago'
     WHERE d.estado = 'POR_PAGAR' AND d.created_at < now() - interval '5 minutes'
       -- El que espera la verificación del banco tiene el plazo de su pago, no los 5 minutos.
       AND NOT EXISTS (SELECT 1 FROM tienda_pagos g
                        WHERE g.pedido_id = d.id AND NOT g.extra AND g.verificacion_at IS NOT NULL
                          AND g.vence_at > now())
    RETURNING d.id
  )
  SELECT array_agg(id) INTO v_ids FROM vencidos;
  -- El pago cuyo reto nadie contestó queda ABANDONADO (su orden sigue viva en Mercado Pago y se
  -- vigila); el de siempre, VENCIDO.
  UPDATE tienda_pagos
     SET estado = CASE WHEN verificacion_at IS NOT NULL AND orden_id_externo IS NOT NULL THEN 'ABANDONADO' ELSE 'VENCIDO' END
   WHERE pedido_id = ANY (v_ids) AND NOT extra AND estado = 'CREADO';

  BEGIN
    IF EXISTS (SELECT 1 FROM tienda_pagos g
                WHERE (g.estado = 'POR_DEVOLVER' AND (g.proximo_intento_at IS NULL OR g.proximo_intento_at <= now()))
                   -- Más ancho que tienda_pagos_tomar a propósito: quién toca de verdad lo decide ella.
                   OR (NOT g.extra AND g.conciliado_at IS NULL AND g.cobro_pedido_at IS NOT NULL
                       AND g.estado IN ('CREADO', 'VENCIDO')
                       AND g.cobro_pedido_at < now() - interval '20 seconds' AND g.vence_at > now() - interval '48 hours'
                       AND (g.estado <> 'VENCIDO' OR g.conciliaciones = 0 OR g.vence_at < now() - interval '1 hour')
                       AND (g.conciliacion_fallos < 3 OR g.consultado_at IS NULL OR g.consultado_at < now() - interval '1 hour'))
                   -- Un reto abandonado que se sigue vigilando (o al que le toca su último vistazo).
                   OR (NOT g.extra AND g.estado = 'ABANDONADO' AND g.conciliado_at IS NULL
                       AND (g.consultado_at IS NULL OR g.consultado_at < now() - interval '5 minutes'))) THEN
      v_secreto := _vim_secreto('vim_interno');
      v_base    := _vim_secreto('vim_functions_url');
      IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') OR v_secreto IS NULL OR v_base IS NULL THEN
        -- Hay devoluciones o cobros por confirmar y nadie los va a atender. Queda a la vista: un
        -- renglón por hora en tienda_eventos (accion 'barrido:sin_configurar') y un WARNING en el
        -- log de Postgres. Un NOTICE no lo lee nadie.
        IF NOT EXISTS (SELECT 1 FROM tienda_eventos e
                        WHERE e.accion = 'barrido:sin_configurar' AND e.created_at > now() - interval '1 hour') THEN
          INSERT INTO tienda_eventos (accion, error, payload)
          VALUES ('barrido:sin_configurar', 'hay pagos en línea por devolver o por confirmar y el barrido no puede correr',
                  jsonb_build_object('pg_net', EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net'),
                                     'vim_interno', v_secreto IS NOT NULL, 'vim_functions_url', v_base IS NOT NULL));
        END IF;
        RAISE WARNING 'tienda_pagos_barrer: sin pg_net o sin los secretos vim_interno / vim_functions_url en Vault; hay pagos en línea sin atender';
      ELSE
        EXECUTE format(
          'SELECT net.http_post(url := %L, body := %L::jsonb, headers := %L::jsonb, timeout_milliseconds := 5000)',
          rtrim(v_base, '/') || '/tienda-webhook-mp',
          '{"barrido": true}',
          jsonb_build_object('Content-Type', 'application/json', 'x-vim-interno', v_secreto)::text);
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'tienda_pagos_barrer: %', SQLERRM;
  END;

  RETURN COALESCE(array_length(v_ids, 1), 0);
END;
$$;
COMMENT ON FUNCTION tienda_pagos_barrer IS
  'Vence los pedidos de la tienda que llevan más de 5 minutos sin que su cobro se confirme (los que esperan la verificación del banco, al pasar el plazo de su pago, que queda ABANDONADO y vigilado) y, si hay devoluciones, pagos por conciliar o retos abandonados por vigilar, llama a tienda-webhook-mp (pg_net). No avisa a nadie. Cron cada minuto (nube). Devuelve cuántos pedidos venció.';
