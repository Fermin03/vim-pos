-- Retail 2, entrega 2: candados del crédito y del saldo a favor (revisión final, 2026-10-18).
--
-- §1 Un pago CREDITO o SALDO_FAVOR no se cancela, se borra, ni cambia de monto, venta o método por
--    fuera de las RPC (antes la guardia solo veía el método). Cierra también reabrir_ticket_pagado.
-- §2 A una venta con un pago CREDITO o SALDO_FAVOR no se le cambia ni se le quita el cliente.
-- §3 Cancelar una cuenta ABIERTA con pagos de saldo a favor los regresa a saldo a favor.
-- §4 Devolver con «Mismo método» una venta a crédito sigue la regla del efectivo.
-- Una venta sin pagos CREDITO ni SALDO_FAVOR (restaurantes) se comporta exactamente igual que antes.

-- ── §1 Guardia de pagos ─────────────────────────────────────────────────────
-- Reemplaza el comentario de la 0208 §6: la guardia de UPDATE de la 0208/0209 solo veía
-- `metodo_pago`, así que un PATCH a `estado`, `deleted_at` o `monto_mxn` (o reabrir_ticket_pagado,
-- 0201, que cancela todos los pagos) borraba la deuda o el uso del saldo a favor. Ahora el disparador
-- corre en CUALQUIER UPDATE de un pago CREDITO/SALDO_FAVOR y solo deja pasar lo que no toca el
-- dinero (nota, referencia, updated_*, conciliación).
-- Ningún camino legítimo actualiza esos pagos: pagar_a_credito y pagar_con_saldo_favor solo
-- insertan; cancelar_ticket_pagado y confirmar_devolucion no tocan `pagos` (la deuda baja con
-- AJUSTE_CANCELACION y el saldo regresa con ENTRADA_CANCELACION); el pago interno de un cambio
-- (0196) es EFECTIVO. Por eso no hace falta bandera de salida. En la caja el push y el pull van en
-- modo réplica y esto no corre: la caja ya validó en local.
-- La de la 0209 (vigente); cambia la rama de UPDATE.
CREATE OR REPLACE FUNCTION pagos_metodo_solo_por_rpc()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- 0211: lo que no toca el dinero pasa.
    IF NEW.metodo_pago IS NOT DISTINCT FROM OLD.metodo_pago
       AND NEW.monto_mxn IS NOT DISTINCT FROM OLD.monto_mxn
       AND NEW.ticket_id IS NOT DISTINCT FROM OLD.ticket_id
       AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
       AND NOT (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
       AND (NEW.estado IS NOT DISTINCT FROM OLD.estado OR NEW.estado::text IN ('APLICADO', 'CONCILIADO')) THEN
      RETURN NEW;
    END IF;
    IF NEW.metodo_pago IS DISTINCT FROM OLD.metodo_pago THEN
      IF 'SALDO_FAVOR' IN (OLD.metodo_pago, NEW.metodo_pago) THEN
        RAISE EXCEPTION 'DATOS_INVALIDOS: un pago con saldo a favor no cambia de forma de pago, ni otro pasa a saldo a favor. Cancela la venta y vuelve a cobrarla.'
          USING ERRCODE = '22023';
      END IF;
      RAISE EXCEPTION 'DATOS_INVALIDOS: una venta a crédito no cambia de forma de pago, ni otra pasa a crédito. Cancela la venta y vuelve a cobrarla.'
        USING ERRCODE = '22023';
    END IF;
    -- 0211: reabrir, anular o cambiar el monto.
    IF OLD.metodo_pago = 'SALDO_FAVOR' THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: una venta pagada con saldo a favor no se reabre ni se le edita ese pago. Cancela la venta y vuelve a cobrarla.'
        USING ERRCODE = '22023';
    END IF;
    RAISE EXCEPTION 'DATOS_INVALIDOS: una venta a crédito no se reabre ni se le edita el pago. Cancela la venta y vuelve a cobrarla.'
      USING ERRCODE = '22023';
  END IF;
  IF NEW.metodo_pago = 'CREDITO' AND current_setting('vim.pago_credito', true) IS DISTINCT FROM 'si' THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: una venta a crédito se cobra con «A crédito» (pagar_a_credito).'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.metodo_pago = 'SALDO_FAVOR' AND current_setting('vim.pago_saldo_favor', true) IS DISTINCT FROM 'si' THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el saldo a favor se cobra con «Saldo a favor» (pagar_con_saldo_favor).'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION pagos_metodo_solo_por_rpc() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pagos_metodo_solo_por_rpc_cambio ON pagos;
CREATE TRIGGER trg_pagos_metodo_solo_por_rpc_cambio
  BEFORE UPDATE ON pagos
  FOR EACH ROW WHEN (OLD.metodo_pago IN ('CREDITO', 'SALDO_FAVOR') OR NEW.metodo_pago IN ('CREDITO', 'SALDO_FAVOR'))
  EXECUTE FUNCTION pagos_metodo_solo_por_rpc();

-- ── §2 El cliente de una venta a crédito o con saldo a favor ────────────────
-- Cambiarlo movería la deuda (o el saldo a favor usado) a otra persona; quitarlo dejaría la
-- ENTRADA_CANCELACION sin cliente y la cancelación fallaría. Solo la UI lo filtraba. La fusión de
-- clientes (0156) y el sync van en modo réplica y no pasan por aquí.
CREATE OR REPLACE FUNCTION tickets_cliente_fijo_con_credito()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM pagos WHERE ticket_id = OLD.id AND metodo_pago IN ('CREDITO', 'SALDO_FAVOR')
                                   AND estado = 'APLICADO' AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: esta venta se cobró a crédito o con saldo a favor de su cliente: no se le cambia el cliente.'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION tickets_cliente_fijo_con_credito() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_tickets_cliente_fijo_con_credito ON tickets;
CREATE TRIGGER trg_tickets_cliente_fijo_con_credito
  BEFORE UPDATE OF cliente_id ON tickets
  FOR EACH ROW WHEN (OLD.cliente_id IS DISTINCT FROM NEW.cliente_id)
  EXECUTE FUNCTION tickets_cliente_fijo_con_credito();

-- ── §3 Cancelar una cuenta ABIERTA pagada en parte con saldo a favor ────────
-- Una cuenta sin cobrar del todo no tiene devolución al cancelarse (cancelar_ticket_pagado solo la
-- crea si estaba PAGADA), así que el USO se perdía. Cada pago SALDO_FAVOR regresa como
-- ENTRADA_CANCELACION, idempotente por la llave `cancelacion:<pago>`. Molde: 0204.
CREATE OR REPLACE FUNCTION trg_cancelacion_regresa_saldo_favor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.devolucion_id IS NULL AND NEW.ticket_estado_fiscal_previo::text NOT IN ('PAGADO', 'FACTURADO') THEN
    INSERT INTO saldo_favor_movimientos (tenant_id, cliente_id, tipo, monto_mxn, ticket_id, turno_id, client_id_local)
    SELECT p.tenant_id, t.cliente_id, 'ENTRADA_CANCELACION', p.monto_mxn, t.id, NEW.turno_id, 'cancelacion:' || p.id
      FROM pagos p JOIN tickets t ON t.id = p.ticket_id
     WHERE p.ticket_id = NEW.ticket_id AND p.tenant_id = NEW.tenant_id AND p.metodo_pago = 'SALDO_FAVOR'
       AND p.estado = 'APLICADO' AND p.deleted_at IS NULL
    ON CONFLICT (tenant_id, client_id_local) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION trg_cancelacion_regresa_saldo_favor() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_cancelaciones_regresa_saldo_favor ON cancelaciones_ticket;
CREATE TRIGGER trg_cancelaciones_regresa_saldo_favor
  AFTER INSERT ON cancelaciones_ticket
  FOR EACH ROW EXECUTE FUNCTION trg_cancelacion_regresa_saldo_favor();

-- ── §4 _credito_devolucion: «Mismo método» en una venta a crédito ───────────
-- La de la 0209 (vigente). En una venta a crédito el «mismo método» de lo ya abonado no es uno solo:
-- se trata igual que EFECTIVO y sigue credito_abonos_al_cancelar (efectivo o saldo a favor). Antes
-- el negocio se quedaba con lo abonado. Cambio marcado "0211".
CREATE OR REPLACE FUNCTION _credito_devolucion(p_devolucion uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dev     devoluciones%ROWTYPE;
  v_t       tickets%ROWTYPE;
  v_credito boolean;
  v_saldo   numeric(12,2);
  v_deuda   numeric(12,2);
  v_resto   numeric(12,2);
  v_sf      numeric(12,2);
  v_llave   varchar(100);
BEGIN
  SELECT * INTO v_dev FROM devoluciones WHERE id = p_devolucion AND estado = 'CONFIRMADA';
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v_t FROM tickets WHERE id = v_dev.ticket_original_id AND tenant_id = v_dev.tenant_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_credito := EXISTS (SELECT 1 FROM pagos WHERE ticket_id = v_t.id AND metodo_pago = 'CREDITO'
                                             AND estado = 'APLICADO' AND deleted_at IS NULL);
  SELECT COALESCE(sum(monto_mxn), 0) INTO v_sf FROM pagos
   WHERE ticket_id = v_t.id AND metodo_pago = 'SALDO_FAVOR' AND estado = 'APLICADO' AND deleted_at IS NULL;
  IF NOT v_credito AND v_sf = 0 THEN RETURN NULL; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('credito:' || v_t.cliente_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('saldo_favor:' || v_t.cliente_id::text, 0));
  PERFORM 1 FROM clientes_credito WHERE tenant_id = v_t.tenant_id AND cliente_id = v_t.cliente_id FOR UPDATE;

  v_llave := 'devolucion:' || v_dev.id;
  IF EXISTS (SELECT 1 FROM abonos_credito WHERE tenant_id = v_t.tenant_id AND client_id_local = v_llave)
     OR EXISTS (SELECT 1 FROM saldo_favor_movimientos WHERE tenant_id = v_t.tenant_id AND client_id_local = v_llave) THEN
    RETURN 0;
  END IF;

  IF v_credito THEN
    v_saldo := GREATEST(credito_saldo_ticket(v_t.id), 0);
    v_deuda := LEAST(v_dev.total_devuelto_mxn, v_saldo);
    v_resto := v_dev.total_devuelto_mxn - v_deuda;
    IF v_dev.alcance = 'TOTAL' THEN
      v_deuda := v_saldo;   -- la propina no viene en lo devuelto y también se debía
    END IF;
    IF v_deuda > 0 THEN
      INSERT INTO abonos_credito (tenant_id, sucursal_id, caja_id, turno_id, cliente_id, ticket_id,
                                  tipo, metodo_pago, monto_mxn, client_id_local, usuario_id)
      VALUES (v_t.tenant_id, v_dev.sucursal_id, v_dev.caja_id, v_dev.turno_id, v_t.cliente_id, v_t.id,
              'AJUSTE_CANCELACION', NULL, v_deuda, v_llave, COALESCE(auth.uid(), v_dev.usuario_solicitante_id));
    END IF;
    -- 0211: «Mismo método» cuenta como efectivo.
    IF v_dev.medio_devolucion NOT IN ('EFECTIVO', 'MISMO_METODO_PAGO') OR v_resto <= 0 THEN
      RETURN 0;
    END IF;
    IF (SELECT credito_abonos_al_cancelar FROM configuracion_tenant WHERE tenant_id = v_t.tenant_id) = 'EFECTIVO' THEN
      RETURN v_resto;
    END IF;
    v_sf := v_resto;   -- modo SALDO_FAVOR: lo abonado queda a favor
    v_resto := 0;
  ELSE
    IF v_dev.medio_devolucion NOT IN ('EFECTIVO', 'MISMO_METODO_PAGO') THEN
      RETURN 0;
    END IF;
    -- Lo pagado con saldo a favor que no se ha regresado ya (devoluciones anteriores de esta venta).
    v_sf := LEAST(v_dev.total_devuelto_mxn,
                  GREATEST(v_sf - COALESCE((SELECT sum(monto_mxn) FROM saldo_favor_movimientos
                                             WHERE ticket_id = v_t.id AND tipo = 'ENTRADA_CANCELACION'), 0), 0));
    v_resto := 0;
    IF v_dev.medio_devolucion = 'EFECTIVO' THEN v_resto := v_dev.total_devuelto_mxn - v_sf; END IF;
  END IF;

  IF v_sf > 0 THEN
    INSERT INTO saldo_favor_movimientos (tenant_id, cliente_id, tipo, monto_mxn, ticket_id, turno_id, client_id_local)
    VALUES (v_t.tenant_id, v_t.cliente_id, 'ENTRADA_CANCELACION', v_sf, v_t.id, v_dev.turno_id, v_llave);
  END IF;
  RETURN v_resto;
END $$;
COMMENT ON FUNCTION _credito_devolucion(uuid) IS
  'Devolución confirmada de una venta a crédito o con saldo a favor: baja la deuda, regresa el saldo a favor y dice cuánto sale del cajón (0209, «mismo método» = efectivo en crédito: 0211). NULL si no aplica. Solo la llama trg_devolucion_pago_efectivo.';
REVOKE ALL ON FUNCTION _credito_devolucion(uuid) FROM PUBLIC, anon, authenticated, service_role;
