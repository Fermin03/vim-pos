-- ============================================================================
-- 0161 — Tienda en línea, entrega 1: la base.
-- Diseño: docs/superpowers/specs/2026-10-08-tienda-en-linea-design.md
--
-- La tienda propia del restaurante es UN CANAL MÁS del núcleo de pedidos (ADR 0011), no un
-- sistema paralelo: el pedido cae en delivery_pedidos, baja a la caja por el mismo sondeo y se
-- vuelve ticket con una función hermana de crear_ticket_desde_app.
--
-- Nada de esto se ve todavía: el complemento nace inactivo y ningún negocio tiene el interruptor.
-- ============================================================================

-- ── §1 delivery_pedidos admite el canal Tienda ───────────────────────────────
-- En canal TIENDA, `app` es el modo de servicio del ticket que resultará: DRIVE_THRU es el
-- Pick-up del POS y DELIVERY_PROPIO es Domicilio. Así delivery_enlazar_tickets (0096), que
-- empareja por `t.modo_servicio = p.app`, sirve sin tocarla.
ALTER TABLE delivery_pedidos
  ADD COLUMN IF NOT EXISTS canal            text NOT NULL DEFAULT 'APP' CHECK (canal IN ('APP', 'TIENDA')),
  ADD COLUMN IF NOT EXISTS cliente_email    citext NULL,
  ADD COLUMN IF NOT EXISTS tienda_cuenta_id uuid NULL,
  ADD COLUMN IF NOT EXISTS zona_envio_id    uuid NULL,
  ADD COLUMN IF NOT EXISTS direccion        jsonb NULL,
  ADD COLUMN IF NOT EXISTS pago_al_recibir  text NULL CHECK (pago_al_recibir IN ('EFECTIVO', 'TARJETA')),
  ADD COLUMN IF NOT EXISTS paga_con_mxn     numeric(12,2) NULL CHECK (paga_con_mxn IS NULL OR paga_con_mxn >= 0),
  ADD COLUMN IF NOT EXISTS seguimiento_hash text NULL;

-- SIN llave foránea a propósito en tienda_cuenta_id y zona_envio_id: esta tabla se espeja en la
-- caja, donde las cuentas de la tienda no existen y una zona recién creada en el admin puede no
-- haber bajado todavía. Una FK haría fallar el espejo entero, pedidos de Uber incluidos. Quien
-- valida la zona es fijar_envio_ticket, al crear el ticket.
COMMENT ON COLUMN delivery_pedidos.canal IS 'APP = Uber/DiDi/Rappi (ADR 0011). TIENDA = la tienda en línea del restaurante.';
COMMENT ON COLUMN delivery_pedidos.direccion IS 'Solo canal TIENDA a domicilio: calle, numero_exterior, numero_interior, colonia, codigo_postal, ciudad, estado, referencias.';
COMMENT ON COLUMN delivery_pedidos.seguimiento_hash IS 'SHA-256 del código del enlace de seguimiento. El código en claro no se guarda.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_pedidos_seguimiento
  ON delivery_pedidos (seguimiento_hash) WHERE seguimiento_hash IS NOT NULL;

ALTER TABLE delivery_pedidos ALTER COLUMN conexion_id DROP NOT NULL;

ALTER TABLE delivery_pedidos DROP CONSTRAINT IF EXISTS delivery_pedido_app_valida;
ALTER TABLE delivery_pedidos ADD CONSTRAINT delivery_pedido_app_valida CHECK (
     (canal = 'APP'    AND app IN ('APP_RAPPI', 'APP_UBEREATS', 'APP_DIDI') AND conexion_id IS NOT NULL)
  OR (canal = 'TIENDA' AND app IN ('DRIVE_THRU', 'DELIVERY_PROPIO')         AND conexion_id IS NULL));

-- Retención (0095): cuerpo copiado ÍNTEGRO de 0095_*.sql; se añaden las columnas de la tienda.
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
        repartidor_telefono  = NULL,
        cliente_email        = NULL,
        direccion            = NULL,
        seguimiento_hash     = NULL
    WHERE recibido_at < now() - make_interval(days => GREATEST(p_dias, 1))
      AND estado IN ('ENTREGADO', 'RECHAZADO', 'CANCELADO', 'EXPIRADO', 'LISTO', 'ERROR')
      AND (cliente_telefono IS NOT NULL OR cliente_telefono_pin IS NOT NULL OR direccion_texto IS NOT NULL
           OR payload_raw <> '{"anonimizado": true}'::jsonb OR repartidor_telefono IS NOT NULL OR repartidor_nombre IS NOT NULL
           OR cliente_email IS NOT NULL OR direccion IS NOT NULL OR seguimiento_hash IS NOT NULL
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
