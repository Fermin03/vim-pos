-- ============================================================================
-- 0164 — Tienda en línea, entrega 4: lo que la caja y el POS necesitan de la base.
-- Diseño: docs/superpowers/specs/2026-10-08-tienda-en-linea-design.md (§8, §3)
--
-- Tres cosas:
--   §1 tienda_reportar_estado: la caja instalada le cuenta a la nube en qué va un pedido de la
--      tienda (listo, entregado, cancelado) mirando su ticket local. Solo avanza.
--   §2 El aviso al celular del dueño cuando un pedido vence sin aceptar dice de dónde era:
--      delivery_avisar_expirados recibe el canal y delivery_marcar_expirados agrupa por él.
--   §3 tienda_sincronizar_estados_nube: los pedidos que se atienden desde el POS web (gestión NUBE)
--      no tienen caja que reporte; la nube mira su ticket y los pasa sola a listo, entregado o
--      cancelado. La llama delivery_marcar_expirados, que ya corre cada minuto.
-- Corre también en el Postgres embebido de la caja: no toca storage.*, cron.* ni net.* (el aviso
-- sigue protegido como en la 0097: sin pg_net o sin Vault se omite y marcar sigue funcionando).
-- ============================================================================

-- ── §1 La caja reporta el estado de un pedido de la tienda ───────────────────
-- La llama delivery-accion (acción `estado`) con el negocio de la sesión del dispositivo: por eso
-- recibe p_tenant y no se fía del id del pedido.
-- SOLO AVANZA: ACEPTADO/EN_PREPARACION < LISTO < ENTREGADO; CANCELADO desde cualquier estado vivo.
-- Un reporte que no avanza (repetido, tardío, o sobre un pedido ya terminado) no cambia nada y
-- devuelve el estado en que está: la caja reintenta sin miedo.
-- El motivo es de lista cerrada: tienda_seguimiento se lo enseña al cliente, así que aquí nunca se
-- guarda texto libre del cajero.
CREATE OR REPLACE FUNCTION tienda_reportar_estado(p_tenant uuid, p_pedido uuid, p_estado text, p_motivo text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actual text;
BEGIN
  IF p_estado IS NULL OR p_estado NOT IN ('LISTO', 'ENTREGADO', 'CANCELADO') THEN
    RAISE EXCEPTION 'ESTADO_INVALIDO: %', COALESCE(p_estado, 'NULL');
  END IF;

  SELECT estado INTO v_actual FROM delivery_pedidos
   WHERE id = p_pedido AND tenant_id = p_tenant AND canal = 'TIENDA'
     FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEDIDO_NO_EXISTE: %', COALESCE(p_pedido::text, 'NULL'); END IF;

  -- Entre paréntesis: sin ellos plpgsql corta el IF en el primer THEN del CASE.
  IF NOT (CASE p_estado
       WHEN 'LISTO'     THEN v_actual IN ('ACEPTADO', 'EN_PREPARACION')
       WHEN 'ENTREGADO' THEN v_actual IN ('ACEPTADO', 'EN_PREPARACION', 'LISTO')
       ELSE                  v_actual IN ('RECIBIDO', 'ACEPTADO', 'EN_PREPARACION', 'LISTO')
     END) THEN
    RETURN v_actual;
  END IF;

  UPDATE delivery_pedidos
     SET estado       = p_estado,
         listo_at     = CASE WHEN p_estado = 'LISTO' THEN now() ELSE listo_at END,
         entregado_at = CASE WHEN p_estado = 'ENTREGADO' THEN now() ELSE entregado_at END,
         cancelado_at = CASE WHEN p_estado = 'CANCELADO' THEN now() ELSE cancelado_at END,
         cancelado_por = CASE WHEN p_estado = 'CANCELADO' THEN 'RESTAURANTE' ELSE cancelado_por END,
         motivo_cancelacion = CASE
           WHEN p_estado <> 'CANCELADO' THEN motivo_cancelacion
           WHEN p_motivo IN ('AGOTADO', 'SATURADO', 'CERRADO', 'OTRO') THEN p_motivo
           ELSE 'OTRO' END
   WHERE id = p_pedido;
  RETURN p_estado;
END;
$$;
REVOKE ALL ON FUNCTION tienda_reportar_estado(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tienda_reportar_estado(uuid, uuid, text, text) TO service_role;
COMMENT ON FUNCTION tienda_reportar_estado IS
  'La caja reporta LISTO, ENTREGADO o CANCELADO de un pedido de la tienda en línea. Solo avanza; lo que no avanza devuelve el estado actual sin tocar nada. Solo service_role.';

-- ── §2 El aviso de vencidos dice de dónde era el pedido ──────────────────────
-- Cuerpo copiado ÍNTEGRO de 0097_*.sql; cambian la firma (p_canal), el título y a dónde lleva el
-- aviso. Su único llamador es delivery_marcar_expirados, aquí abajo.
DROP FUNCTION IF EXISTS delivery_avisar_expirados(uuid, uuid, integer);
CREATE OR REPLACE FUNCTION delivery_avisar_expirados(p_tenant uuid, p_sucursal uuid, p_n integer, p_canal text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_secreto  text := _vim_secreto('vim_interno');
  v_base     text := _vim_secreto('vim_functions_url');
  v_sucursal text;
  v_titulo   text;
  v_cuerpo   text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'delivery_avisar_expirados: sin pg_net, aviso omitido'; RETURN false;
  END IF;
  IF v_secreto IS NULL OR v_base IS NULL THEN
    RAISE NOTICE 'delivery_avisar_expirados: faltan secretos vim_interno / vim_functions_url en Vault, aviso omitido'; RETURN false;
  END IF;
  SELECT nombre INTO v_sucursal FROM sucursales WHERE id = p_sucursal;
  v_titulo := CASE WHEN p_canal = 'TIENDA' THEN 'Tienda en línea: pedido sin aceptar' ELSE 'Uber Eats: pedido sin aceptar' END;
  v_cuerpo := CASE WHEN p_n = 1 THEN '1 pedido venció sin aceptar' ELSE p_n || ' pedidos vencieron sin aceptar' END
              || COALESCE(' en ' || v_sucursal, '') || '. Revisa la caja.';
  EXECUTE format(
    'SELECT net.http_post(url := %L, body := %L::jsonb, headers := %L::jsonb, timeout_milliseconds := 5000)',
    rtrim(v_base, '/') || '/enviar-push',
    jsonb_build_object('tenant_id', p_tenant, 'titulo', v_titulo, 'cuerpo', v_cuerpo,
                       'url', CASE WHEN p_canal = 'TIENDA' THEN '/tienda' ELSE '/configuracion/integraciones' END)::text,
    jsonb_build_object('Content-Type', 'application/json', 'x-vim-interno', v_secreto)::text
  );
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'delivery_avisar_expirados: %', SQLERRM;
  RETURN false;
END $$;
REVOKE ALL ON FUNCTION delivery_avisar_expirados(uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delivery_avisar_expirados(uuid, uuid, integer, text) TO service_role;

-- ── §3 Los pedidos atendidos desde el POS web avanzan solos ──────────────────
-- Un pedido de gestión NUBE tiene su ticket en la nube y ninguna caja que reporte su estado: sin
-- esto se queda ACEPTADO para siempre (el POS lo lista como activo, y la retención de datos
-- personales —que no toca ACEPTADO— nunca lo alcanza).
-- MISMA REGLA que tienda_seguimiento (0162) y que estadoAReportar de la caja: ticket CANCELADO →
-- CANCELADO; PAGADO o FACTURADO → ENTREGADO; ticket impreso o con repartidor → LISTO. Si cambia
-- una, cambian las tres.
-- Se aplica con tienda_reportar_estado, que solo avanza: repetir la pasada no cambia nada.
-- Solo entran los pedidos cuyo estado calculado es distinto del guardado, así que el LIMIT nunca
-- deja a uno atorado detrás de otros que no tienen nada que decir.
-- ponytail: recorre delivery_pedidos entera, igual que el marcado de vencidos (la tabla no tiene
-- índice por estado). Índice parcial (canal, gestion, estado) cuando la tabla pese. Y solo mira
-- los pedidos de los últimos 7 días: una cuenta abierta más tiempo que eso no se pone al día.
CREATE OR REPLACE FUNCTION tienda_sincronizar_estados_nube() RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (
      SELECT p.tenant_id, p.id, p.estado, p.recibido_at,
             CASE
               WHEN t.estado_fiscal = 'CANCELADO' THEN 'CANCELADO'
               WHEN t.estado_fiscal IN ('PAGADO', 'FACTURADO') THEN 'ENTREGADO'
               WHEN t.ticket_impreso_at IS NOT NULL
                    OR EXISTS (SELECT 1 FROM delivery_asignaciones a WHERE a.ticket_id = t.id) THEN 'LISTO'
             END AS nuevo
        FROM delivery_pedidos p
        JOIN tickets t ON t.id = p.ticket_id AND t.tenant_id = p.tenant_id
       WHERE p.canal = 'TIENDA' AND p.gestion = 'NUBE'
         AND p.estado IN ('ACEPTADO', 'EN_PREPARACION', 'LISTO')
         AND p.recibido_at > now() - interval '7 days'
    ) x
    WHERE x.nuevo IS NOT NULL AND x.nuevo <> x.estado
    ORDER BY x.recibido_at
    LIMIT 200
  LOOP
    IF tienda_reportar_estado(r.tenant_id, r.id, r.nuevo, CASE WHEN r.nuevo = 'CANCELADO' THEN 'OTRO' END)
       IS DISTINCT FROM r.estado THEN
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION tienda_sincronizar_estados_nube() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tienda_sincronizar_estados_nube() TO service_role;
COMMENT ON FUNCTION tienda_sincronizar_estados_nube IS
  'Pasa a LISTO, ENTREGADO o CANCELADO los pedidos de la tienda atendidos desde el POS web (gestión NUBE) mirando su ticket, con la regla de tienda_seguimiento. Idempotente. La llama delivery_marcar_expirados cada minuto. Solo service_role.';

-- delivery_marcar_expirados: cuerpo copiado ÍNTEGRO de 0097_*.sql; cambian el bucle del aviso, que
-- ahora agrupa por sucursal Y canal (el canal se lee del pedido: la tabla temporal conserva su
-- forma, y si ya existiera en la sesión con la de la 0097 sigue sirviendo), y el paso final, que
-- pone al día los pedidos del POS web (§3).
CREATE OR REPLACE FUNCTION delivery_marcar_expirados() RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n integer := 0;
  r record;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _exp_pasada (id uuid, tenant_id uuid, sucursal_id uuid) ON COMMIT DROP;
  DELETE FROM _exp_pasada;

  WITH exp AS (
    UPDATE delivery_pedidos
    SET estado = 'EXPIRADO', cancelado_at = now(), motivo_cancelacion = 'Venció la ventana de aceptación'
    WHERE estado = 'RECIBIDO' AND vence_aceptacion IS NOT NULL AND vence_aceptacion < now()
    RETURNING id, tenant_id, sucursal_id, conexion_id, app, id_externo
  ), ev AS (
    INSERT INTO delivery_eventos (tenant_id, conexion_id, app, direccion, tipo, id_externo, procesado, error)
    SELECT tenant_id, conexion_id, app, 'SALIDA', 'expirado', id_externo, true, 'Pedido expirado sin aceptar' FROM exp
    RETURNING conexion_id
  ), cx AS (
    UPDATE delivery_conexiones c
    SET ultimo_error = 'Pedidos expirados sin aceptar: revisar la caja', ultimo_evento_at = now()
    WHERE c.id IN (SELECT conexion_id FROM ev)
    RETURNING c.id
  )
  INSERT INTO _exp_pasada (id, tenant_id, sucursal_id) SELECT id, tenant_id, sucursal_id FROM exp;

  SELECT count(*) INTO v_n FROM _exp_pasada;

  -- Un aviso por sucursal y canal con expirados nuevos (best-effort: nunca tira el marcado).
  FOR r IN SELECT e.tenant_id, e.sucursal_id, p.canal, count(*)::integer AS n
             FROM _exp_pasada e JOIN delivery_pedidos p ON p.id = e.id
            GROUP BY e.tenant_id, e.sucursal_id, p.canal LOOP
    PERFORM delivery_avisar_expirados(r.tenant_id, r.sucursal_id, r.n, r.canal);
  END LOOP;

  -- Los pedidos atendidos desde el POS web (§3). En su propio bloque: si falla, lo ya marcado como
  -- vencido se queda marcado y la siguiente pasada lo reintenta.
  BEGIN
    PERFORM tienda_sincronizar_estados_nube();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'tienda_sincronizar_estados_nube: %', SQLERRM;
  END;

  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION delivery_marcar_expirados() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delivery_marcar_expirados() TO service_role;
COMMENT ON FUNCTION delivery_marcar_expirados IS
  'Marca EXPIRADO los pedidos RECIBIDOS (de apps y de la tienda en línea) cuya ventana venció; deja evento y aviso en la conexión y manda push al dueño diciendo de qué canal eran (pg_net → enviar-push). Al final pone al día los pedidos de la tienda atendidos desde el POS web. Cron cada minuto (nube).';
