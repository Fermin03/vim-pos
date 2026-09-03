-- ============================================================================
-- 0095 — Retención mínima de datos personales de pedidos de apps (DPA 1.5 del contrato con
-- Uber, obligación C4). A los 30 días de cerrado un pedido se anonimizan el nombre, teléfono,
-- PIN y dirección del cliente de la app y se descarta el payload crudo; los importes, ítems y
-- fechas se conservan para conciliación y reportes. Corre a diario por pg_cron donde exista
-- (nube); el escritorio no lo necesita porque no guarda pedidos de apps propios.
-- Lo que promete el aviso de privacidad / términos ("se anonimizan a los 30 días") es esto.
-- ============================================================================
CREATE OR REPLACE FUNCTION delivery_anonimizar_pedidos_viejos(p_dias integer DEFAULT 30) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_n integer := 0;
BEGIN
  WITH anon AS (
    UPDATE delivery_pedidos
    SET cliente_nombre       = CASE WHEN cliente_nombre IS NULL THEN NULL ELSE 'Cliente de app' END,
        cliente_telefono     = NULL,
        cliente_telefono_pin = NULL,
        direccion_texto      = NULL,
        payload_raw          = '{"anonimizado": true}'::jsonb,   -- la columna es NOT NULL
        repartidor_nombre    = NULL,
        repartidor_telefono  = NULL
    WHERE recibido_at < now() - make_interval(days => GREATEST(p_dias, 1))
      AND estado IN ('ENTREGADO', 'RECHAZADO', 'CANCELADO', 'EXPIRADO', 'LISTO', 'ERROR')
      AND (cliente_telefono IS NOT NULL OR cliente_telefono_pin IS NOT NULL OR direccion_texto IS NOT NULL
           OR payload_raw <> '{"anonimizado": true}'::jsonb OR repartidor_telefono IS NOT NULL OR repartidor_nombre IS NOT NULL
           OR (cliente_nombre IS NOT NULL AND cliente_nombre <> 'Cliente de app'))
    RETURNING id
  )
  SELECT count(*) INTO v_n FROM anon;
  -- El payload de los webhooks también lleva datos del cliente: misma ventana.
  UPDATE delivery_eventos SET payload = '{"anonimizado": true}'::jsonb
  WHERE payload IS NOT NULL AND payload <> '{"anonimizado": true}'::jsonb
    AND created_at < now() - make_interval(days => GREATEST(p_dias, 1));
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION delivery_anonimizar_pedidos_viejos(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delivery_anonimizar_pedidos_viejos(integer) TO service_role;
COMMENT ON FUNCTION delivery_anonimizar_pedidos_viejos IS
  'Anonimiza los datos personales de pedidos de apps cerrados hace más de p_dias (30 por defecto) y vacía el payload de eventos viejos. Cron diario en la nube (DPA Uber 1.5).';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'delivery-retencion') THEN
      PERFORM cron.unschedule('delivery-retencion');
    END IF;
    -- 04:10 UTC = 22:10 hora del centro de México: fuera de servicio.
    PERFORM cron.schedule('delivery-retencion', '10 4 * * *', 'SELECT public.delivery_anonimizar_pedidos_viejos(30)');
  END IF;
END $$;
