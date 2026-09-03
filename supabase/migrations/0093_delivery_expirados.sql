-- ============================================================================
-- 0093 — Pedidos de apps expirados (spec A6).
--
-- Un pedido RECIBIDO cuya ventana de aceptación pasó sin respuesta se marca EXPIRADO (la app ya lo
-- canceló de su lado) y se deja evento + aviso en la conexión. Barrido cada minuto con pg_cron
-- SOLO donde exista la extensión (nube): el Postgres embebido de escritorio no la tiene y tampoco
-- recibe pedidos de apps (llegan por la nube).
-- ============================================================================
CREATE OR REPLACE FUNCTION delivery_marcar_expirados() RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n integer := 0;
BEGIN
  WITH exp AS (
    UPDATE delivery_pedidos
    SET estado = 'EXPIRADO', cancelado_at = now(), motivo_cancelacion = 'Venció la ventana de aceptación'
    WHERE estado = 'RECIBIDO' AND vence_aceptacion IS NOT NULL AND vence_aceptacion < now()
    RETURNING id, tenant_id, conexion_id, app, id_externo
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
  SELECT count(*) INTO v_n FROM exp;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION delivery_marcar_expirados() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delivery_marcar_expirados() TO service_role;
COMMENT ON FUNCTION delivery_marcar_expirados IS
  'Marca EXPIRADO los pedidos de apps RECIBIDOS cuya ventana de aceptación venció; deja evento y aviso en la conexión. Cron cada minuto (nube).';

-- Alerta en POS y admin: expirados del día por sucursal. security_invoker: hereda el RLS de
-- delivery_pedidos (un tenant no ve los de otro).
CREATE OR REPLACE VIEW vw_delivery_expirados_hoy WITH (security_invoker = on) AS
SELECT tenant_id, sucursal_id, count(*)::integer AS n_expirados, max(cancelado_at) AS ultimo_expirado_at
FROM delivery_pedidos
WHERE estado = 'EXPIRADO' AND cancelado_at::date = CURRENT_DATE
GROUP BY tenant_id, sucursal_id;
GRANT SELECT ON vw_delivery_expirados_hoy TO authenticated, service_role;
COMMENT ON VIEW vw_delivery_expirados_hoy IS 'Pedidos de apps expirados hoy por sucursal (para la alerta en POS y admin). RLS heredado.';

-- Programación: solo donde pg_cron exista (Supabase nube). En escritorio no se hace nada.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'delivery-expirados') THEN
      PERFORM cron.unschedule('delivery-expirados');
    END IF;
    PERFORM cron.schedule('delivery-expirados', '* * * * *', 'SELECT public.delivery_marcar_expirados()');
  END IF;
END $$;
