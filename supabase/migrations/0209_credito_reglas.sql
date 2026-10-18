-- Retail 2, entrega 2: reglas del crédito (diseño 2026-10-18).
--
-- §1 Una venta a crédito no gana puntos. §2 Con saldo de crédito no se factura (individual,
-- autofactura ni global); liquidada, sí. §3 Saldo a favor del cliente. §4 Cancelar o devolver una
-- venta a crédito: primero baja la deuda; lo ya abonado se devuelve en efectivo o queda a favor,
-- según configuracion_tenant.credito_abonos_al_cancelar. §5 Pagar con saldo a favor y su guardia.
-- §6 Corte: el saldo a favor no se declara; arquear_caja cuenta los abonos.
-- Una venta sin pagos CREDITO ni SALDO_FAVOR se comporta exactamente igual que antes.

-- ── §1 Lealtad ──────────────────────────────────────────────────────────────
-- La de la 0200 con la salida "0209".
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
  -- 0209: ni la venta a crédito.
  IF EXISTS (SELECT 1 FROM pagos WHERE ticket_id = p_ticket_id AND metodo_pago = 'CREDITO'
                                   AND estado = 'APLICADO' AND deleted_at IS NULL) THEN
    RETURN 0;
  END IF;
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

-- ── §2 Factura ──────────────────────────────────────────────────────────────
-- Invoker como ticket_lleva_premio (0158): el empleado solo ve su negocio; las definer, todo.
CREATE OR REPLACE FUNCTION ticket_con_credito_pendiente(p_ticket uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT credito_saldo_ticket(p_ticket) > 0;
$$;
COMMENT ON FUNCTION ticket_con_credito_pendiente(uuid) IS
  'TRUE si la venta todavía debe algo de su crédito. Esa venta no se factura hasta liquidarse (0209).';
REVOKE ALL ON FUNCTION ticket_con_credito_pendiente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION ticket_con_credito_pendiente(uuid) TO authenticated, service_role;

-- Molde de trg_cfdi_sin_premio (0158): el portal y el admin terminan en este INSERT.
CREATE OR REPLACE FUNCTION trg_cfdi_sin_credito_pendiente()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.tipo_comprobante = 'INGRESO' AND NEW.ticket_id IS NOT NULL AND ticket_con_credito_pendiente(NEW.ticket_id) THEN
    RAISE EXCEPTION 'Esta venta tiene saldo de crédito: se factura al liquidarse.'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION trg_cfdi_sin_credito_pendiente() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_tickets_cfdi_sin_credito_pendiente ON tickets_cfdi;
CREATE TRIGGER trg_tickets_cfdi_sin_credito_pendiente
  BEFORE INSERT ON tickets_cfdi
  FOR EACH ROW EXECUTE FUNCTION trg_cfdi_sin_credito_pendiente();

-- La de la 0082 (vigente) con la condición "0209". Conserva los grants de la 0132.
CREATE OR REPLACE FUNCTION ticket_autofacturable(p_ticket_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ticket   tickets%ROWTYPE;
  v_period   varchar(2);
  v_desde    date;
  v_hasta    date;
BEGIN
  SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket_id;
  IF NOT FOUND OR v_ticket.estado_fiscal <> 'PAGADO' THEN RETURN false; END IF;

  -- 0209: con saldo de crédito se factura al liquidarse.
  IF ticket_con_credito_pendiente(p_ticket_id) THEN RETURN false; END IF;

  -- ¿Ya tiene factura propia?
  IF EXISTS (
    SELECT 1 FROM tickets_cfdi
     WHERE ticket_id = p_ticket_id
       AND tipo_comprobante = 'INGRESO'
       AND estado_sat IN ('TIMBRADO', 'EN_PROCESO_CANCELACION')
  ) THEN RETURN false; END IF;

  -- ¿Ya lo ampara una global?
  IF EXISTS (SELECT 1 FROM cfdi_global_tickets WHERE ticket_id = p_ticket_id) THEN
    RETURN false;
  END IF;

  -- ¿Se cerró el periodo al que pertenece?
  SELECT COALESCE(e.periodicidad_global, '04') INTO v_period
    FROM tenant_cfdi_emisor e WHERE e.tenant_id = v_ticket.tenant_id;
  SELECT p.desde, p.hasta INTO v_desde, v_hasta
    FROM periodo_global_de(COALESCE(v_period, '04'), v_ticket.dia_contable) p;

  RETURN NOT EXISTS (
    SELECT 1 FROM cfdi_periodos_globales
     WHERE tenant_id = v_ticket.tenant_id
       AND desde = v_desde AND hasta = v_hasta
       AND estado IN ('EN_PROCESO', 'TIMBRADA', 'ERROR')
  );
END;
$$;

-- La de la 0158 (vigente) con la condición "0209".
CREATE OR REPLACE FUNCTION tickets_de_periodo_global(p_tenant_id uuid, p_desde date, p_hasta date)
RETURNS TABLE (ticket_id uuid, folio varchar, total_mxn numeric)
LANGUAGE sql
STABLE
AS $$
  SELECT t.id, t.folio_completo, t.total_mxn
    FROM tickets t
   WHERE t.tenant_id = p_tenant_id
     AND t.dia_contable BETWEEN p_desde AND p_hasta
     AND t.estado_fiscal = 'PAGADO'
     AND NOT EXISTS (
       SELECT 1 FROM tickets_cfdi c
        WHERE c.ticket_id = t.id
          AND c.tipo_comprobante = 'INGRESO'
          AND c.estado_sat IN ('TIMBRADO', 'EN_PROCESO_CANCELACION')
     )
     AND NOT EXISTS (SELECT 1 FROM cfdi_global_tickets g WHERE g.ticket_id = t.id)
     -- 0158: una cuenta que es solo un premio de lealtad no tiene ingreso que amparar.
     AND NOT (t.total_mxn = 0 AND ticket_lleva_premio(t.id))
     -- 0209: con saldo de crédito se factura al liquidarse.
     AND NOT ticket_con_credito_pendiente(t.id)
   ORDER BY t.dia_contable, t.folio_completo;
$$;

-- ── §3 Saldo a favor ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saldo_favor_movimientos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  cliente_id      uuid NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  tipo            text NOT NULL CHECK (tipo IN ('ENTRADA_CANCELACION', 'USO')),
  monto_mxn       numeric(12,2) NOT NULL CHECK (monto_mxn > 0),
  ticket_id       uuid NOT NULL REFERENCES tickets(id) ON DELETE RESTRICT,
  turno_id        uuid NULL REFERENCES turnos(id) ON DELETE RESTRICT,
  client_id_local varchar(100) NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saldo_favor_movimientos_client_id_local_uq UNIQUE (tenant_id, client_id_local)
);
CREATE INDEX IF NOT EXISTS idx_saldo_favor_cliente ON saldo_favor_movimientos (tenant_id, cliente_id);
CREATE INDEX IF NOT EXISTS idx_saldo_favor_ticket ON saldo_favor_movimientos (ticket_id);
COMMENT ON TABLE saldo_favor_movimientos IS
  'Saldo a favor del cliente: entra al cancelar una venta a crédito ya abonada (modo SALDO_FAVOR) y sale al pagar con él. Solo se escribe por RPC o disparador (0209).';

ALTER TABLE saldo_favor_movimientos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saldo_favor_movimientos_lectura ON saldo_favor_movimientos;
CREATE POLICY saldo_favor_movimientos_lectura ON saldo_favor_movimientos FOR SELECT
  USING (tenant_id = current_tenant_id());
REVOKE ALL ON saldo_favor_movimientos FROM anon, authenticated;
GRANT SELECT ON saldo_favor_movimientos TO authenticated;

CREATE OR REPLACE VIEW vw_saldo_favor_cliente WITH (security_invoker = true) AS
SELECT tenant_id,
       cliente_id,
       (COALESCE(sum(monto_mxn) FILTER (WHERE tipo = 'ENTRADA_CANCELACION'), 0)
        - COALESCE(sum(monto_mxn) FILTER (WHERE tipo = 'USO'), 0))::numeric(12,2) AS saldo_mxn
  FROM saldo_favor_movimientos
 GROUP BY tenant_id, cliente_id;
COMMENT ON VIEW vw_saldo_favor_cliente IS 'Saldo a favor por cliente (0209).';
REVOKE ALL ON vw_saldo_favor_cliente FROM anon, authenticated;
GRANT SELECT ON vw_saldo_favor_cliente TO authenticated;

-- ── §4 Cancelar o devolver una venta a crédito o pagada con saldo a favor ───
-- La llama trg_devolucion_pago_efectivo al confirmarse una devolución y devuelve cuánto sale del
-- cajón. NULL = la venta no tiene CREDITO ni SALDO_FAVOR: todo sigue como antes.
--   · Venta a crédito: lo devuelto baja primero la deuda (AJUSTE_CANCELACION, sin dinero); la
--     cancelación TOTAL la baja entera, propina incluida. Lo que queda ya se había abonado: con una
--     devolución en efectivo sale del cajón (modo EFECTIVO) o queda a favor (modo SALDO_FAVOR). Con
--     otro medio (cortesía, nota de crédito…) solo baja la deuda.
--   · Venta pagada (en parte) con saldo a favor: esa parte vuelve a saldo a favor en los dos modos,
--     nunca en efectivo (va primero); el resto sigue la regla de siempre (efectivo si el medio lo es).
-- Nadie la llama directo (sin EXECUTE para nadie): solo el disparador, que es SECURITY DEFINER. Es
-- idempotente por devolución (llave `devolucion:<id>`) y el negocio sale de la propia devolución.
-- Toma los mismos candados que registrar_abono (FOR UPDATE en clientes_credito), pagar_a_credito
-- y pagar_con_saldo_favor (consultivos por cliente): una cancelación y un abono o un pago con saldo
-- a favor del mismo cliente no leen el mismo saldo.
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
    IF v_dev.medio_devolucion <> 'EFECTIVO' OR v_resto <= 0 THEN
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
  'Devolución confirmada de una venta a crédito o con saldo a favor: baja la deuda, regresa el saldo a favor y dice cuánto sale del cajón (0209). NULL si no aplica. Solo la llama trg_devolucion_pago_efectivo.';
REVOKE ALL ON FUNCTION _credito_devolucion(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- La de la 0033 (vigente). Lo nuevo va antes y solo entra con CREDITO o SALDO_FAVOR; el resto, igual.
-- 0209: SECURITY DEFINER con search_path fijo, para que _credito_devolucion no se pueda llamar
-- directo. El INSERT del camino de siempre usa los datos de la devolución (ya validada por RLS al
-- confirmarla), como antes.
CREATE OR REPLACE FUNCTION trg_devolucion_pago_efectivo() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_efectivo numeric(12,2);   -- 0209
BEGIN
  -- 0209: venta a crédito o con saldo a favor. Solo sale del cajón lo que _credito_devolucion diga.
  IF TG_OP = 'UPDATE' AND OLD.estado <> 'CONFIRMADA' AND NEW.estado = 'CONFIRMADA' THEN
    v_efectivo := _credito_devolucion(NEW.id);
    IF v_efectivo IS NOT NULL THEN
      IF v_efectivo > 0 THEN
        INSERT INTO movimientos_caja (
          tenant_id, sucursal_id, caja_id, turno_id,
          tipo, monto_mxn, dia_contable, motivo, usuario_solicitante_id
        ) VALUES (
          NEW.tenant_id, NEW.sucursal_id, NEW.caja_id, NEW.turno_id,
          'DEVOLUCION_EFECTIVO', v_efectivo, NEW.dia_contable,
          'Devolución folio ' || NEW.folio_completo, NEW.usuario_solicitante_id
        );
      END IF;
      RETURN NEW;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.estado <> 'CONFIRMADA'
     AND NEW.estado = 'CONFIRMADA'
     AND NEW.medio_devolucion = 'EFECTIVO' THEN
    -- Única consecuencia en caja: sale efectivo por el reembolso. El ticket original NO se toca.
    INSERT INTO movimientos_caja (
      tenant_id, sucursal_id, caja_id, turno_id,
      tipo, monto_mxn, dia_contable, motivo, usuario_solicitante_id
    ) VALUES (
      NEW.tenant_id, NEW.sucursal_id, NEW.caja_id, NEW.turno_id,
      'DEVOLUCION_EFECTIVO', NEW.total_devuelto_mxn, NEW.dia_contable,
      'Devolución folio ' || NEW.folio_completo, NEW.usuario_solicitante_id
    );
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION trg_devolucion_pago_efectivo() FROM PUBLIC, anon, authenticated;

-- ── §5 Pagar con saldo a favor ──────────────────────────────────────────────
-- SECURITY DEFINER (molde de registrar_abono): el USO no lo escribe el cajero. El negocio se acota
-- a mano al del JWT. El saldo es dinero del cliente: se usa aunque el módulo esté apagado.
CREATE OR REPLACE FUNCTION pagar_con_saldo_favor(
  p_ticket_id       uuid,
  p_monto           numeric,
  p_client_id_local character varying DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
  v_t      tickets%ROWTYPE;
  v_monto  numeric(12,2) := round(p_monto, 2);
  v_saldo  numeric(12,2);
  v_pago   uuid;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Sin negocio en la sesión.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_t FROM tickets WHERE id = p_ticket_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la venta no existe.' USING ERRCODE = '22023';
  END IF;

  -- Idempotencia, atada a la venta (como pagar_a_credito).
  IF p_client_id_local IS NOT NULL THEN
    SELECT id INTO v_pago FROM pagos
     WHERE tenant_id = v_tenant AND client_id_local = p_client_id_local AND ticket_id = p_ticket_id;
    IF FOUND THEN RETURN v_pago; END IF;
    IF EXISTS (SELECT 1 FROM pagos WHERE tenant_id = v_tenant AND client_id_local = p_client_id_local) THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: ese identificador de pago ya es de otra venta.' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_monto IS NULL OR v_monto <= 0 THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el monto debe ser mayor a 0.' USING ERRCODE = '22023';
  END IF;
  IF v_t.cliente_id IS NULL THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: asigna un cliente para pagar con su saldo a favor.' USING ERRCODE = '22023';
  END IF;
  -- aplicar_pago también lo frena, pero sin un mensaje para la caja.
  IF v_monto > v_t.total_mxn + COALESCE(v_t.propina_mxn, 0) - v_t.monto_pagado_mxn THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el saldo a favor (%) pasa de lo que falta por cobrar (%).',
      v_monto, v_t.total_mxn + COALESCE(v_t.propina_mxn, 0) - v_t.monto_pagado_mxn USING ERRCODE = '22023';
  END IF;

  -- Dos pagos simultáneos del mismo cliente no gastan dos veces el mismo saldo.
  -- ponytail: candado consultivo por cliente (el cliente puede no tener fila en clientes_credito).
  PERFORM pg_advisory_xact_lock(hashtextextended('saldo_favor:' || v_t.cliente_id::text, 0));
  SELECT COALESCE(saldo_mxn, 0) INTO v_saldo FROM vw_saldo_favor_cliente
   WHERE tenant_id = v_tenant AND cliente_id = v_t.cliente_id;
  IF v_monto > COALESCE(v_saldo, 0) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el cliente tiene % a favor y se pidieron %.', COALESCE(v_saldo, 0), v_monto
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('vim.pago_saldo_favor', 'si', true);
  v_pago := aplicar_pago(p_ticket_id, 'SALDO_FAVOR'::metodo_pago, v_monto, p_client_id_local := p_client_id_local);
  PERFORM set_config('vim.pago_saldo_favor', '', true);

  -- El turno del USO es el del ticket, el mismo que aplicar_pago le pone al pago (no recibe otro).
  INSERT INTO saldo_favor_movimientos (tenant_id, cliente_id, tipo, monto_mxn, ticket_id, turno_id, client_id_local)
  VALUES (v_tenant, v_t.cliente_id, 'USO', v_monto, p_ticket_id, v_t.turno_id, p_client_id_local);
  RETURN v_pago;
END;
$$;
COMMENT ON FUNCTION pagar_con_saldo_favor(uuid, numeric, character varying) IS
  'Paga parte o toda una venta con el saldo a favor del cliente asignado, hasta su saldo (0209).';
REVOKE EXECUTE ON FUNCTION pagar_con_saldo_favor(uuid, numeric, character varying) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION pagar_con_saldo_favor(uuid, numeric, character varying) TO authenticated, service_role;

-- La guardia de la 0208 con SALDO_FAVOR: solo entra por pagar_con_saldo_favor y no cambia de ni a él.
CREATE OR REPLACE FUNCTION pagos_metodo_solo_por_rpc()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF 'SALDO_FAVOR' IN (OLD.metodo_pago, NEW.metodo_pago) THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: un pago con saldo a favor no cambia de forma de pago, ni otro pasa a saldo a favor. Cancela la venta y vuelve a cobrarla.'
        USING ERRCODE = '22023';
    END IF;
    RAISE EXCEPTION 'DATOS_INVALIDOS: una venta a crédito no cambia de forma de pago, ni otra pasa a crédito. Cancela la venta y vuelve a cobrarla.'
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

DROP TRIGGER IF EXISTS trg_pagos_metodo_solo_por_rpc ON pagos;
CREATE TRIGGER trg_pagos_metodo_solo_por_rpc
  BEFORE INSERT ON pagos
  FOR EACH ROW WHEN (NEW.metodo_pago IN ('CREDITO', 'SALDO_FAVOR'))
  EXECUTE FUNCTION pagos_metodo_solo_por_rpc();
DROP TRIGGER IF EXISTS trg_pagos_metodo_solo_por_rpc_cambio ON pagos;
CREATE TRIGGER trg_pagos_metodo_solo_por_rpc_cambio
  BEFORE UPDATE OF metodo_pago ON pagos
  FOR EACH ROW WHEN (OLD.metodo_pago IS DISTINCT FROM NEW.metodo_pago
                     AND (OLD.metodo_pago IN ('CREDITO', 'SALDO_FAVOR') OR NEW.metodo_pago IN ('CREDITO', 'SALDO_FAVOR')))
  EXECUTE FUNCTION pagos_metodo_solo_por_rpc();

-- ── §6 Corte ────────────────────────────────────────────────────────────────
-- reporte_x: cuerpo vigente de la 0208. Cambios "0209": SALDO_FAVOR fuera de lo que se declara
-- (no es dinero que entra al cajón) y pagado_con_saldo_favor_mxn, informativo.
CREATE OR REPLACE FUNCTION reporte_x(
  p_turno_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_tenant_id    uuid := current_tenant_id();
  v_turno        turnos%ROWTYPE;
  v_resultado    jsonb;
  v_pagos_metodo jsonb;
  v_tickets      jsonb;
  v_devoluciones jsonb;
  v_movimientos  jsonb;
  v_efectivo_esperado numeric(12,2);
  v_ventas_credito numeric(12,2);
  v_saldo_favor  numeric(12,2);
BEGIN
  SELECT * INTO v_turno FROM turnos WHERE id = p_turno_id AND tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turno % no existe o no pertenece al tenant', p_turno_id;
  END IF;

  -- ===== Pagos por método (suma de tickets PAGADO/FACTURADO del turno) =====
  SELECT jsonb_agg(jsonb_build_object(
    'metodo_pago', metodo_pago,
    'monto_total_mxn', monto_total,
    'cantidad_pagos', cantidad
  ) ORDER BY metodo_pago)
  INTO v_pagos_metodo
  FROM (
    SELECT
      x.metodo_pago,
      SUM(x.monto_mxn) AS monto_total,
      COUNT(*) AS cantidad
    FROM (
      SELECT p.metodo_pago, p.monto_mxn
      FROM pagos p
      JOIN tickets t ON t.id = p.ticket_id
      WHERE p.turno_id = p_turno_id
        AND p.deleted_at IS NULL
        AND p.estado = 'APLICADO'
        AND p.metodo_pago NOT IN ('CREDITO', 'SALDO_FAVOR')   -- 0208/0209: no es dinero recibido
        AND t.estado_fiscal IN ('PAGADO', 'FACTURADO')
      UNION ALL
      SELECT a.metodo_pago, a.monto_mxn                        -- 0208: abonos recibidos en el turno
      FROM abonos_credito a
      WHERE a.turno_id = p_turno_id
        AND a.tipo = 'ABONO'
        AND a.estado = 'APLICADO'
    ) x
    GROUP BY x.metodo_pago
  ) sub;

  -- 0208: lo vendido a crédito en el turno (informativo, no se declara).
  SELECT COALESCE(SUM(p.monto_mxn), 0) INTO v_ventas_credito
  FROM pagos p
  JOIN tickets t ON t.id = p.ticket_id
  WHERE p.turno_id = p_turno_id
    AND p.deleted_at IS NULL
    AND p.estado = 'APLICADO'
    AND p.metodo_pago = 'CREDITO'
    AND t.estado_fiscal IN ('PAGADO', 'FACTURADO');

  -- 0209: lo pagado con saldo a favor en el turno (informativo, no se declara).
  SELECT COALESCE(SUM(p.monto_mxn), 0) INTO v_saldo_favor
  FROM pagos p
  JOIN tickets t ON t.id = p.ticket_id
  WHERE p.turno_id = p_turno_id
    AND p.deleted_at IS NULL
    AND p.estado = 'APLICADO'
    AND p.metodo_pago = 'SALDO_FAVOR'
    AND t.estado_fiscal IN ('PAGADO', 'FACTURADO');

  -- ===== Tickets del turno =====
  SELECT jsonb_build_object(
    'total_tickets_abiertos',     COUNT(*) FILTER (WHERE estado_fiscal IN ('BORRADOR', 'ABIERTO')),
    'total_tickets_pagados',      COUNT(*) FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')),
    'total_tickets_cancelados',   COUNT(*) FILTER (WHERE estado_fiscal = 'CANCELADO'),
    'total_tickets_en_espera',    COUNT(*) FILTER (WHERE en_espera = true AND estado_fiscal = 'ABIERTO'),
    'subtotal_neto_mxn',          COALESCE(SUM(subtotal_mxn) FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')), 0),
    'iva_neto_mxn',               COALESCE(SUM(iva_mxn)      FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')), 0),
    'total_neto_mxn',             COALESCE(SUM(total_mxn)    FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')), 0),
    'descuentos_manuales_mxn',    COALESCE(SUM(descuentos_manuales_mxn) FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')), 0),
    'promociones_mxn',            COALESCE(SUM(promociones_mxn)        FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')), 0),
    'lealtad_mxn',                COALESCE(SUM(lealtad_mxn)            FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')), 0),  -- 0157
    'propina_total_mxn',          COALESCE(SUM(propina_mxn)                FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')), 0),
    'ticket_promedio_mxn',        COALESCE(AVG(total_mxn) FILTER (WHERE estado_fiscal IN ('PAGADO', 'FACTURADO')), 0)
  ) INTO v_tickets
  FROM tickets
  WHERE turno_id = p_turno_id
    AND deleted_at IS NULL;

  -- ===== Devoluciones del turno =====
  SELECT jsonb_build_object(
    'cantidad',      COUNT(*),
    'total_mxn',     COALESCE(SUM(total_devuelto_mxn), 0),
    'por_motivo',    COALESCE(jsonb_object_agg(motivo, count_motivo), '{}'::jsonb)
  ) INTO v_devoluciones
  FROM (
    SELECT
      motivo,
      total_devuelto_mxn,
      COUNT(*) OVER (PARTITION BY motivo) AS count_motivo
    FROM devoluciones
    WHERE turno_id = p_turno_id
      AND estado = 'CONFIRMADA'
      AND deleted_at IS NULL
  ) sub;

  -- ===== Movimientos de caja (inyecciones, retiros, depósitos, devoluciones efectivo) =====
  SELECT jsonb_agg(jsonb_build_object(
    'tipo', tipo,
    'cantidad', cantidad,
    'monto_total_mxn', monto_total
  ))
  INTO v_movimientos
  FROM (
    SELECT
      tipo,
      COUNT(*) AS cantidad,
      SUM(monto_mxn) AS monto_total
    FROM movimientos_caja
    WHERE turno_id = p_turno_id
    GROUP BY tipo
  ) sub;

  -- ===== Efectivo esperado en caja =====
  SELECT calcular_efectivo_esperado(p_turno_id) INTO v_efectivo_esperado;

  -- ===== Construir respuesta completa =====
  v_resultado := jsonb_build_object(
    'reporte_tipo', 'X',
    'turno_id', v_turno.id,
    'turno_estado', v_turno.estado,
    'sucursal_id', v_turno.sucursal_id,
    'caja_id', v_turno.caja_id,
    'usuario_apertura_id', v_turno.usuario_apertura_id,
    'fecha_apertura', v_turno.fecha_apertura,
    'fondo_apertura_mxn', v_turno.fondo_inicial_mxn,
    'fecha_consulta', now(),

    'tickets', v_tickets,
    'pagos_por_metodo', COALESCE(v_pagos_metodo, '[]'::jsonb),
    'ventas_a_credito_mxn', v_ventas_credito,                  -- 0208
    'pagado_con_saldo_favor_mxn', v_saldo_favor,               -- 0209
    'devoluciones', v_devoluciones,
    'movimientos_caja', COALESCE(v_movimientos, '[]'::jsonb),

    'efectivo_esperado_mxn', v_efectivo_esperado
  );

  RETURN v_resultado;
END;
$$;

COMMENT ON FUNCTION reporte_x IS 'Lectura intermedia del turno (no cierra ni modifica nada). Idempotente. Devuelve jsonb listo para impresión o UI. 0157: tickets.lealtad_mxn. 0208: sin CREDITO en pagos_por_metodo, con abonos; ventas_a_credito_mxn. 0209: sin SALDO_FAVOR; pagado_con_saldo_favor_mxn.';

-- arquear_caja: la de la 0134 (vigente). Cambio "0209": el esperado y las transacciones de cada
-- método suman los abonos a crédito que recibió el turno (reporte_x ya los pide declarar; sin esto
-- un abono con tarjeta salía como sobrante). En EFECTIVO ya los suma calcular_efectivo_esperado.
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
      -- 0209: más los abonos a crédito recibidos con ese método.
      v_esperado := v_esperado + (SELECT COALESCE(SUM(monto_mxn), 0) FROM abonos_credito
                                   WHERE turno_id = p_turno_id AND tipo = 'ABONO'
                                     AND metodo_pago = v_metodo AND estado = 'APLICADO');
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
       AND estado = 'APLICADO' AND deleted_at IS NULL)
      + (SELECT COUNT(*) FROM abonos_credito                  -- 0209
         WHERE turno_id = p_turno_id AND tipo = 'ABONO'
           AND metodo_pago = v_metodo AND estado = 'APLICADO'),
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
