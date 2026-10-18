-- 0200 · Un cambio de talla no suma ni resta lealtad, ni lleva promociones (Giro RETAIL, R13 de Fermín, 18 oct).
-- El cambio no es una compra nueva: la venta original conserva lo que ganó y la venta del cambio no gana.
-- Mientras la venta del cambio está abierta, una promoción o un canje dejarían su pago interno cubriendo otra cosa.

-- «Ticket de un cambio» = el de la 0196 §1 sin mirar el estado: también cuando ya está cobrado o cancelado.
CREATE OR REPLACE FUNCTION _ticket_es_de_cambio(p_ticket uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM tickets t JOIN devoluciones d
        ON d.tenant_id = t.tenant_id AND d.client_id_local = t.client_id_local AND d.motivo = 'CAMBIO_TALLA'
     WHERE t.id = p_ticket AND t.client_id_local IS NOT NULL);
$$;
REVOKE EXECUTE ON FUNCTION _ticket_es_de_cambio(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION _ticket_es_de_cambio(uuid) TO authenticated;

-- La de la 0156 §4 con la salida "0200": la venta de un cambio no gana.
CREATE OR REPLACE FUNCTION lealtad_acumular_por_ticket(p_ticket_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_t       tickets%ROWTYPE;
  v_p       lealtad_programa%ROWTYPE;
  v_cargos  numeric(12,2);
  v_puntos  integer;
  v_hoy     date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_compras integer;
BEGIN
  SELECT * INTO v_t FROM tickets WHERE id = p_ticket_id;
  IF NOT FOUND OR v_t.cliente_id IS NULL THEN RETURN 0; END IF;
  -- Los pedidos de apps de delivery no ganan.
  IF v_t.modo_servicio::text LIKE 'APP\_%' THEN RETURN 0; END IF;
  -- 0200: la venta de un cambio de talla tampoco.
  IF _ticket_es_de_cambio(p_ticket_id) THEN RETURN 0; END IF;
  IF NOT COALESCE((SELECT modulo_lealtad_activo FROM configuracion_tenant WHERE tenant_id = v_t.tenant_id), false) THEN
    RETURN 0;
  END IF;
  SELECT * INTO v_p FROM lealtad_programa WHERE tenant_id = v_t.tenant_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  -- Idempotente: un ticket con ganado vivo no vuelve a ganar (FACTURADO→PAGADO, reintentos).
  IF lealtad_neto_ganado(p_ticket_id) > 0 THEN RETURN 0; END IF;

  -- Tope diario: tickets de HOY (hora de México) de este cliente que todavía tienen puntos vivos.
  -- Cuenta por neto, no por "sin reversa": un ticket con devolución parcial, o reabierto y vuelto a
  -- pagar, sigue reteniendo puntos y por eso sigue contando. Filtra por tenant para usar
  -- idx_lealtad_mov_cliente.
  SELECT count(DISTINCT m.ticket_id) INTO v_compras
    FROM lealtad_movimientos m
   WHERE m.tenant_id = v_t.tenant_id AND m.cliente_id = v_t.cliente_id AND m.tipo = 'GANADO'
     AND (m.fecha AT TIME ZONE 'America/Mexico_City')::date = v_hoy
     AND lealtad_neto_ganado(m.ticket_id) > 0;
  IF v_compras >= v_p.tope_compras_dia THEN RETURN 0; END IF;

  SELECT COALESCE(SUM(total_item_mxn), 0) INTO v_cargos
    FROM ticket_items WHERE ticket_id = p_ticket_id AND cancelado = false AND cargo_tipo IS NOT NULL;

  v_puntos := lealtad_puntos_por_compra(
    v_p.mecanica, GREATEST(v_t.total_mxn - v_cargos, 0), v_p.porcentaje, v_p.pesos_por_punto, v_p.compra_minima_mxn);
  IF v_puntos <= 0 THEN RETURN 0; END IF;

  PERFORM lealtad_registrar_movimiento(
    NULL, v_t.tenant_id, v_t.cliente_id, 'GANADO', v_puntos, v_p.version,
    p_ticket_id, v_t.sucursal_id, v_t.caja_id, auth.uid());
  RETURN v_puntos;
END $$;
REVOKE ALL ON FUNCTION lealtad_acumular_por_ticket(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION lealtad_acumular_por_ticket(uuid) TO service_role;

-- La de la 0156 §4 con la condición "0200": la devolución de un cambio de talla no revierte lo ganado.
CREATE OR REPLACE FUNCTION trg_devolucion_lealtad()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_total numeric(12,2);
BEGIN
  BEGIN
    IF TG_OP = 'UPDATE' AND OLD.estado <> 'CONFIRMADA' AND NEW.estado = 'CONFIRMADA'
       AND NEW.motivo IS DISTINCT FROM 'CAMBIO_TALLA' THEN   -- 0200
      SELECT total_mxn INTO v_total FROM tickets WHERE id = NEW.ticket_original_id;
      PERFORM lealtad_revertir_ganado_ticket(
        NEW.ticket_original_id,
        CASE WHEN COALESCE(v_total, 0) <= 0 THEN 1 ELSE LEAST(NEW.total_devuelto_mxn / v_total, 1) END);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'lealtad: no se pudo revertir lo ganado del ticket %: %', NEW.ticket_original_id, SQLERRM;
  END;
  RETURN NEW;
END $$;

-- Las dos puertas que faltaban a la venta abierta de un cambio, con el disparador de la 0196 §1:
-- aplicar_promocion y lealtad_asentar_canje terminan en estos INSERT.
DROP TRIGGER IF EXISTS trg_promociones_venta_de_cambio ON ticket_promociones_aplicadas;
CREATE TRIGGER trg_promociones_venta_de_cambio
  BEFORE INSERT ON ticket_promociones_aplicadas
  FOR EACH ROW EXECUTE FUNCTION trg_venta_de_cambio_fija('ticket_id');
DROP TRIGGER IF EXISTS trg_canjes_venta_de_cambio ON ticket_canjes_lealtad;
CREATE TRIGGER trg_canjes_venta_de_cambio
  BEFORE INSERT ON ticket_canjes_lealtad
  FOR EACH ROW EXECUTE FUNCTION trg_venta_de_cambio_fija('ticket_id');
