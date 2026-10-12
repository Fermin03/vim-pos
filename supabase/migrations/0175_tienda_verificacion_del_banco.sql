-- 0175 · Tienda en línea: el pago que espera la verificación del banco (3D Secure).
--
-- Desde esta entrega la orden de Mercado Pago se crea con verificación «solo si hay riesgo». Cuando
-- su antifraude duda, en vez de rechazar (`high_risk`) le pide al cliente confirmar con su banco: la
-- orden queda `action_required` / `pending_challenge` y NO está cobrada ni rechazada. El pedido sigue
-- POR_PAGAR (invisible para la caja) mientras el cliente contesta. Aquí solo va lo que la base
-- necesita para eso; lo demás (cobrar, consultar, cancelar la orden) es de las funciones.
--
--   1) tienda_pagos.verificacion_at: cuándo se supo que el pago espera el reto del banco.
--   2) tienda_pago_verificacion(pago, orden): lo anota, con su orden, y le da al pago su plazo.
--   3) tienda_pagos_barrer: el pedido cuyo pago está en verificación no vence a los 5 minutos de
--      nacer, sino con el plazo de su pago (más un margen). Nada más cambia en ella.
--
-- EL PLAZO: 10 minutos desde que se mandó el cobro. Los 5 de siempre son para un cobro que Mercado
-- Pago no contestó, donde nadie tiene que hacer nada. Aquí el cliente tiene que recibir un mensaje o
-- abrir la aplicación de su banco, entrar y aprobar: 5 minutos contados desde que nació el pedido
-- dejan fuera a quien tarda en encontrar su token. Diez alcanzan y siguen siendo poco para un pedido
-- de comida. No depende del plazo de Mercado Pago (VISTO el 12 oct 2026: una orden abandonada seguía
-- igual 8 minutos después): al pasar el nuestro, la función CANCELA la orden allá (se puede: está
-- `action_required`), y entonces el pago queda RECHAZADO y el pedido cerrado «sin pago» por
-- tienda_pago_aplicar, que no cambia.
--
-- EL MARGEN: 2 minutos. Quien cierra bien un reto abandonado es la función (cancela la orden y aplica
-- el resultado). Lo de aquí es el respaldo por si la función no puede (Mercado Pago caído, token
-- rechazado): pasado plazo + margen el pedido vence como cualquier otro, su pago queda VENCIDO y la
-- conciliación de siempre sigue preguntando —y cancelando la orden en cuanto pueda—.
--
-- Compatibilidad: la función `tienda` desplegada hoy no llama a tienda_pago_verificacion ni crea
-- órdenes con verificación, así que nada cambia hasta desplegar la nueva; esta migración va ANTES.
-- No usa Vault ni pg_net de forma nueva: corre igual en el Postgres de la caja, donde tienda_pagos
-- está vacía.

ALTER TABLE tienda_pagos ADD COLUMN IF NOT EXISTS verificacion_at timestamptz NULL;
COMMENT ON COLUMN tienda_pagos.verificacion_at IS 'Cuándo se supo que la orden de este pago espera la verificación del banco (3D Secure). Con ella, vence_at es el plazo de la verificación y el pedido no vence antes.';

-- El pago espera el reto del banco. Anota la orden (si aún no tenía: mismas reglas que
-- tienda_pago_anotar) y alarga su plazo a 10 minutos desde que se mandó el cobro. UNA sola vez por
-- pago: repetirla no hace nada, así que insistir no compra más tiempo. Solo sobre un pago que sigue
-- esperando (CREADO) y cuya orden, si ya tiene una, es esa misma. No mueve estados ni el pedido.
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
REVOKE ALL ON FUNCTION tienda_pago_verificacion(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tienda_pago_verificacion(uuid, text) TO service_role;

-- tienda_pagos_barrer: cuerpo copiado ÍNTEGRO de 0173_tienda_pago_en_linea.sql §9. Un solo cambio,
-- en qué pedidos vencen: el que tiene su pago en verificación espera al plazo de ese pago más 2
-- minutos, en vez de vencer a los 5 de nacer. (CREATE OR REPLACE conserva sus permisos y el cron.)
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
       AND NOT EXISTS (SELECT 1 FROM tienda_pagos g
                        WHERE g.pedido_id = d.id AND NOT g.extra AND g.verificacion_at IS NOT NULL
                          AND g.vence_at > now() - interval '2 minutes')
    RETURNING d.id
  )
  SELECT array_agg(id) INTO v_ids FROM vencidos;
  UPDATE tienda_pagos SET estado = 'VENCIDO'
   WHERE pedido_id = ANY (v_ids) AND NOT extra AND estado = 'CREADO';

  BEGIN
    IF EXISTS (SELECT 1 FROM tienda_pagos g
                WHERE (g.estado = 'POR_DEVOLVER' AND (g.proximo_intento_at IS NULL OR g.proximo_intento_at <= now()))
                   -- Más ancho que tienda_pagos_tomar a propósito: quién toca de verdad lo decide ella.
                   OR (NOT g.extra AND g.conciliado_at IS NULL AND g.cobro_pedido_at IS NOT NULL
                       AND g.estado IN ('CREADO', 'VENCIDO')
                       AND g.cobro_pedido_at < now() - interval '20 seconds' AND g.vence_at > now() - interval '48 hours'
                       AND (g.estado <> 'VENCIDO' OR g.conciliaciones = 0 OR g.vence_at < now() - interval '1 hour')
                       AND (g.conciliacion_fallos < 3 OR g.consultado_at IS NULL OR g.consultado_at < now() - interval '1 hour'))) THEN
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
  'Vence los pedidos de la tienda que llevan más de 5 minutos sin que su cobro se confirme (los que esperan la verificación del banco, al pasar el plazo de su pago más 2 minutos) y, si hay devoluciones o pagos por conciliar, llama a tienda-webhook-mp (pg_net). No avisa a nadie. Cron cada minuto (nube). Devuelve cuántos pedidos venció.';
