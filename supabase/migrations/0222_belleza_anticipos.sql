-- Belleza, entrega 2: anticipos de cita y corte (diseño 2026-10-18, ADR 0038).
--
-- §1 anticipos_cita: el dinero que la clienta deja al apartar. Suma al corte del turno que lo
--    RECIBE (como un abono a crédito, 0208), por método. Se resuelve una sola vez:
--    APLICADO (paga su venta con el método ANTICIPO), DEVUELTO o RETENIDO («Anticipo no
--    reembolsable»). Solo se escribe por RPC; un anticipo resuelto ya no cambia a mano. La única
--    vuelta atrás es del sistema: si la venta se cancela sin haberse pagado, o se cancela o se
--    devuelve regresando el dinero en efectivo o por el mismo método, lo APLICADO regresa a
--    VIGENTE (primero que cualquier otro medio) para cobrar la cita en otra venta. Con cortesía,
--    vale, nota de crédito o sin devolver dinero, sigue APLICADO.
-- §2 RPC: registrar_anticipo, anticipo_sugerido, pagar_con_anticipo, devolver_anticipo y
--    retener_anticipo (los dos piden venta.devolucion o su PIN, en un turno abierto de la caja);
--    cancelación y devoluciones.
-- §3 Guardia de pagos: ANTICIPO solo entra por pagar_con_anticipo y no se reabre ni se edita.
-- §4 Corte: calcular_efectivo_esperado, reporte_x y arquear_caja suman los anticipos recibidos;
--    ANTICIPO no se declara (el dinero ya se contó en el turno que lo recibió).
-- El anticipo no es renglón de venta: no da comisión. Los puntos los gana la venta completa al
-- pagarse (lealtad_acumular_por_ticket no mira el método, salvo CREDITO), no el anticipo.
-- Los restaurantes y las tiendas no cambian: sin anticipos, las sumas nuevas son 0.

-- ── §1 Tabla ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS anticipos_cita (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id           uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  caja_id               uuid NOT NULL REFERENCES cajas(id) ON DELETE RESTRICT,
  turno_id              uuid NOT NULL REFERENCES turnos(id) ON DELETE RESTRICT,   -- el turno que lo RECIBE
  cita_id               uuid NOT NULL REFERENCES citas(id) ON DELETE RESTRICT,
  metodo_pago           metodo_pago NOT NULL
                          CHECK (metodo_pago IN ('EFECTIVO', 'TARJETA_DEBITO', 'TARJETA_CREDITO', 'TRANSFERENCIA')),
  monto_mxn             numeric(12,2) NOT NULL CHECK (monto_mxn > 0),
  estado                text NOT NULL DEFAULT 'VIGENTE' CHECK (estado IN ('VIGENTE', 'APLICADO', 'DEVUELTO', 'RETENIDO')),
  ticket_id             uuid NULL REFERENCES tickets(id) ON DELETE RESTRICT,
  turno_resuelve_id     uuid NULL REFERENCES turnos(id) ON DELETE RESTRICT,
  referencia_devolucion text NULL,
  client_id_local       varchar(100) NULL,
  usuario_id            uuid NULL,
  resuelto_at           timestamptz NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT anticipos_cita_aplicado_con_ticket CHECK ((estado = 'APLICADO') = (ticket_id IS NOT NULL)),
  CONSTRAINT anticipos_cita_resuelto CHECK ((estado = 'VIGENTE') = (turno_resuelve_id IS NULL)),
  CONSTRAINT anticipos_cita_client_id_local_uq UNIQUE (tenant_id, client_id_local)
);
CREATE INDEX IF NOT EXISTS idx_anticipos_cita_cita ON anticipos_cita (cita_id);
CREATE INDEX IF NOT EXISTS idx_anticipos_cita_turno ON anticipos_cita (turno_id);
CREATE INDEX IF NOT EXISTS idx_anticipos_cita_turno_resuelve ON anticipos_cita (turno_resuelve_id) WHERE turno_resuelve_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_anticipos_cita_ticket ON anticipos_cita (ticket_id) WHERE ticket_id IS NOT NULL;
COMMENT ON TABLE anticipos_cita IS
  'Anticipo de una cita: suma al corte del turno que lo recibe; se aplica a la venta (ANTICIPO), se devuelve o se retiene. Solo se escribe por RPC (0222).';

DROP TRIGGER IF EXISTS trg_anticipos_cita_updated_at ON anticipos_cita;
CREATE TRIGGER trg_anticipos_cita_updated_at BEFORE UPDATE ON anticipos_cita
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE anticipos_cita ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anticipos_cita_lectura ON anticipos_cita;
CREATE POLICY anticipos_cita_lectura ON anticipos_cita FOR SELECT USING (tenant_id = current_tenant_id());
REVOKE ALL ON anticipos_cita FROM anon, authenticated;
GRANT SELECT ON anticipos_cita TO authenticated;

-- ── §2 RPC ──────────────────────────────────────────────────────────────────
-- SECURITY DEFINER acotadas a mano al negocio del JWT (molde de registrar_abono, 0208).

-- Turno ABIERTO de esa caja y de este negocio; si no, error.
CREATE OR REPLACE FUNCTION _anticipo_turno(p_tenant uuid, p_caja_id uuid, p_turno_id uuid)
RETURNS turnos
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE v_turno turnos%ROWTYPE;
BEGIN
  SELECT * INTO v_turno FROM turnos
   WHERE id = p_turno_id AND tenant_id = p_tenant AND caja_id = p_caja_id AND estado = 'ABIERTO';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el anticipo se mueve en un turno abierto de esta caja.' USING ERRCODE = '22023';
  END IF;
  RETURN v_turno;
END $$;
REVOKE ALL ON FUNCTION _anticipo_turno(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION registrar_anticipo(
  p_cita            uuid,
  p_monto           numeric,
  p_metodo          metodo_pago,
  p_caja_id         uuid,
  p_turno_id        uuid,
  p_client_id_local text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid := _agenda_tenant();
  v_monto  numeric(12,2) := round(p_monto, 2);
  v_turno  turnos%ROWTYPE;
  v_estado cita_estado;
  v_suc    uuid;
  v_id     uuid;
BEGIN
  IF length(p_client_id_local) > 100 THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el identificador del anticipo pasa de 100 caracteres.' USING ERRCODE = '22023';
  END IF;
  -- Idempotencia, atada a la cita.
  IF p_client_id_local IS NOT NULL THEN
    SELECT id INTO v_id FROM anticipos_cita
     WHERE tenant_id = v_tenant AND client_id_local = p_client_id_local AND cita_id = p_cita;
    IF FOUND THEN RETURN v_id; END IF;
    IF EXISTS (SELECT 1 FROM anticipos_cita WHERE tenant_id = v_tenant AND client_id_local = p_client_id_local) THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: ese identificador de anticipo ya es de otra cita.' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_metodo IS NULL OR p_metodo NOT IN ('EFECTIVO', 'TARJETA_DEBITO', 'TARJETA_CREDITO', 'TRANSFERENCIA') THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: un anticipo se recibe en efectivo, tarjeta o transferencia.' USING ERRCODE = '22023';
  END IF;
  IF v_monto IS NULL OR v_monto <= 0 THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el anticipo debe ser mayor a 0.' USING ERRCODE = '22023';
  END IF;
  v_turno := _anticipo_turno(v_tenant, p_caja_id, p_turno_id);

  -- La cita no cambia de estado mientras entra su anticipo (pagar_con_anticipo también la bloquea).
  SELECT estado, sucursal_id INTO v_estado, v_suc FROM citas WHERE id = p_cita AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la cita no existe.' USING ERRCODE = '22023';
  END IF;
  IF v_suc <> v_turno.sucursal_id THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el anticipo se recibe en una caja de la sucursal de la cita.' USING ERRCODE = '22023';
  END IF;
  IF v_estado NOT IN ('AGENDADA', 'EN_ESPERA') THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el anticipo se recibe en una cita por llegar o en espera.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO anticipos_cita (tenant_id, sucursal_id, caja_id, turno_id, cita_id, metodo_pago, monto_mxn,
                              client_id_local, usuario_id)
  VALUES (v_tenant, v_turno.sucursal_id, v_turno.caja_id, v_turno.id, p_cita, p_metodo, v_monto,
          p_client_id_local, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
COMMENT ON FUNCTION registrar_anticipo(uuid, numeric, metodo_pago, uuid, uuid, text) IS
  'Recibe el anticipo de una cita por llegar o en espera; suma al corte del turno que lo recibe (0222). Idempotente por client_id_local.';
REVOKE EXECUTE ON FUNCTION registrar_anticipo(uuid, numeric, metodo_pago, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION registrar_anticipo(uuid, numeric, metodo_pago, uuid, uuid, text) TO authenticated, service_role;

-- Lo que conviene pedir al apartar. TODO = el total de la cita; AL_FINAL = 0; ANTICIPO = por
-- servicio según su regla (un MONTO no pasa del precio del tramo).
CREATE OR REPLACE FUNCTION anticipo_sugerido(p_cita uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
  v_modo   text;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Sin negocio en la sesión.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM citas WHERE id = p_cita AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la cita no existe.' USING ERRCODE = '22023';
  END IF;
  SELECT agenda_cobro_modo INTO v_modo FROM configuracion_tenant WHERE tenant_id = v_tenant;
  IF v_modo IS NULL OR v_modo = 'AL_FINAL' THEN
    RETURN 0;
  END IF;
  IF v_modo = 'TODO' THEN
    RETURN (SELECT COALESCE(sum(precio_mxn), 0) FROM citas_servicios WHERE cita_id = p_cita AND tenant_id = v_tenant);
  END IF;
  RETURN (
    SELECT COALESCE(sum(CASE sa.anticipo_tipo
                          WHEN 'PORCENTAJE' THEN round(cs.precio_mxn * sa.anticipo_valor / 100, 2)
                          WHEN 'MONTO' THEN LEAST(sa.anticipo_valor, cs.precio_mxn)
                          ELSE 0 END), 0)::numeric(12,2)
      FROM citas_servicios cs
      LEFT JOIN servicios_agenda sa ON sa.producto_id = cs.producto_id AND sa.tenant_id = v_tenant
     WHERE cs.cita_id = p_cita AND cs.tenant_id = v_tenant);
END;
$$;
COMMENT ON FUNCTION anticipo_sugerido(uuid) IS
  'Anticipo sugerido de una cita según agenda_cobro_modo y la regla de cada servicio (0222).';
REVOKE EXECUTE ON FUNCTION anticipo_sugerido(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION anticipo_sugerido(uuid) TO authenticated, service_role;

-- Paga la venta con los anticipos VIGENTES de su cita, del más viejo al más nuevo, hasta lo que
-- falta por cobrar. Si un anticipo pasa de lo que falta, se parte: lo usado queda APLICADO y el
-- sobrante, en un renglón nuevo VIGENTE con el mismo turno y método (el corte suma lo mismo).
-- El dinero es de la clienta: se usa aunque la agenda esté apagada.
CREATE OR REPLACE FUNCTION pagar_con_anticipo(p_ticket_id uuid, p_cita_id uuid, p_client_id_local text)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant  uuid := current_tenant_id();
  v_t       tickets%ROWTYPE;
  v_monto   numeric(12,2);
  v_resto   numeric(12,2);
  v_parte   numeric(12,2);
  v_a       anticipos_cita%ROWTYPE;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Sin negocio en la sesión.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_t FROM tickets WHERE id = p_ticket_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la venta no existe.' USING ERRCODE = '22023';
  END IF;

  -- Idempotencia, atada a la venta (como pagar_con_saldo_favor).
  IF p_client_id_local IS NOT NULL THEN
    SELECT monto_mxn INTO v_monto FROM pagos
     WHERE tenant_id = v_tenant AND client_id_local = p_client_id_local AND ticket_id = p_ticket_id;
    IF FOUND THEN RETURN v_monto; END IF;
    IF EXISTS (SELECT 1 FROM pagos WHERE tenant_id = v_tenant AND client_id_local = p_client_id_local) THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: ese identificador de pago ya es de otra venta.' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Antes de tocar la cita: una venta pagada o cancelada no se cobra (y así no se toma el candado
  -- de la cita mientras cancelar_ticket_pagado la tiene en orden contrario).
  IF v_t.estado_fiscal NOT IN ('ABIERTO', 'BORRADOR') THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la venta no está abierta.' USING ERRCODE = '22023';
  END IF;
  IF v_t.turno_id IS NULL THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la venta no tiene turno; ábrela en un turno para cobrar con anticipo.' USING ERRCODE = '22023';
  END IF;

  -- El anticipo de una cita solo paga la venta de esa cita. Candados en orden cita → anticipos
  -- (el mismo de devolver_anticipo, retener_anticipo y _anticipo_regresar) ANTES de sumar: un
  -- anticipo que otra sesión devuelve o retiene no se cobra.
  PERFORM 1 FROM citas WHERE id = p_cita_id AND tenant_id = v_tenant AND ticket_id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la cita no está en esta venta.' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM anticipos_cita
   WHERE cita_id = p_cita_id AND tenant_id = v_tenant AND estado = 'VIGENTE'
   ORDER BY created_at, id FOR UPDATE;

  SELECT COALESCE(sum(monto_mxn), 0) INTO v_monto FROM anticipos_cita
   WHERE cita_id = p_cita_id AND tenant_id = v_tenant AND estado = 'VIGENTE';
  v_monto := LEAST(v_monto, v_t.total_mxn + COALESCE(v_t.propina_mxn, 0) - v_t.monto_pagado_mxn);
  IF v_monto <= 0 THEN
    RETURN 0;
  END IF;

  PERFORM set_config('vim.pago_anticipo', 'si', true);
  PERFORM aplicar_pago(p_ticket_id, 'ANTICIPO'::metodo_pago, v_monto, p_client_id_local := p_client_id_local);
  PERFORM set_config('vim.pago_anticipo', '', true);

  v_resto := v_monto;
  FOR v_a IN
    SELECT * FROM anticipos_cita
     WHERE cita_id = p_cita_id AND tenant_id = v_tenant AND estado = 'VIGENTE'
     ORDER BY created_at, id
     FOR UPDATE
  LOOP
    EXIT WHEN v_resto <= 0;
    v_parte := LEAST(v_resto, v_a.monto_mxn);
    IF v_parte < v_a.monto_mxn THEN
      INSERT INTO anticipos_cita (tenant_id, sucursal_id, caja_id, turno_id, cita_id, metodo_pago, monto_mxn,
                                  usuario_id, created_at)
      VALUES (v_a.tenant_id, v_a.sucursal_id, v_a.caja_id, v_a.turno_id, v_a.cita_id, v_a.metodo_pago,
              v_a.monto_mxn - v_parte, v_a.usuario_id, v_a.created_at);
    END IF;
    UPDATE anticipos_cita
       SET monto_mxn = v_parte, estado = 'APLICADO', ticket_id = p_ticket_id,
           turno_resuelve_id = v_t.turno_id, resuelto_at = now()
     WHERE id = v_a.id;
    v_resto := v_resto - v_parte;
  END LOOP;
  IF v_resto > 0 THEN   -- no debería pasar con los candados de arriba; si pasa, no se cobra
    RAISE EXCEPTION 'DATOS_INVALIDOS: el anticipo cambió mientras se cobraba; vuelve a intentarlo.' USING ERRCODE = '40001';
  END IF;
  RETURN v_monto;
END;
$$;
COMMENT ON FUNCTION pagar_con_anticipo(uuid, uuid, text) IS
  'Aplica los anticipos vigentes de la cita a su venta como pago ANTICIPO, hasta lo que falta por cobrar; el sobrante queda vigente (0222).';
REVOKE EXECUTE ON FUNCTION pagar_con_anticipo(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION pagar_con_anticipo(uuid, uuid, text) TO authenticated, service_role;

-- Devolver pide lo mismo que devolver una venta: el permiso venta.devolucion o una autorización
-- con PIN para este anticipo, con cualquier método. En efectivo sale del cajón del turno que
-- devuelve (DEVOLUCION_EFECTIVO); con tarjeta o transferencia solo se marca, con la referencia.
CREATE OR REPLACE FUNCTION devolver_anticipo(p_anticipo uuid, p_caja_id uuid, p_turno_id uuid, p_referencia text DEFAULT NULL,
                                             p_autorizacion_pin_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant  uuid := current_tenant_id();
  v_a       anticipos_cita%ROWTYPE;
  v_turno   turnos%ROWTYPE;
  v_ref     text := NULLIF(btrim(p_referencia), '');
  v_autorizo uuid;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Sin negocio en la sesión.' USING ERRCODE = '42501';
  END IF;
  -- Candados en orden cita → anticipo, como pagar_con_anticipo.
  PERFORM 1 FROM citas WHERE id = (SELECT cita_id FROM anticipos_cita WHERE id = p_anticipo AND tenant_id = v_tenant) FOR UPDATE;
  SELECT * INTO v_a FROM anticipos_cita WHERE id = p_anticipo AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el anticipo no existe.' USING ERRCODE = '22023';
  END IF;
  IF v_a.estado = 'DEVUELTO' THEN RETURN; END IF;   -- reintento
  IF v_a.estado <> 'VIGENTE' THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el anticipo ya se resolvió (%).', v_a.estado USING ERRCODE = '22023';
  END IF;
  IF v_a.metodo_pago <> 'EFECTIVO' AND v_ref IS NULL THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: falta la referencia de la devolución con tarjeta o transferencia.' USING ERRCODE = '22023';
  END IF;
  v_turno := _anticipo_turno(v_tenant, p_caja_id, p_turno_id);

  -- Molde de arquear_caja (0134): con autorización se consume; sin ella, solo quien tiene el permiso.
  IF p_autorizacion_pin_id IS NOT NULL THEN
    v_autorizo := consumir_autorizacion(p_autorizacion_pin_id, ARRAY['venta.devolucion'],
      p_anticipo, v_a.monto_mxn, NULL, false, v_tenant);
  ELSIF NOT usuario_actual_tiene_permiso('venta.devolucion') THEN
    RAISE EXCEPTION 'Devolver un anticipo requiere autorización (venta.devolucion).'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_a.metodo_pago = 'EFECTIVO' THEN
    INSERT INTO movimientos_caja (tenant_id, sucursal_id, caja_id, turno_id, tipo, monto_mxn, dia_contable,
                                  motivo, usuario_solicitante_id, usuario_autorizo_id, autorizacion_pin_id)
    VALUES (v_tenant, v_turno.sucursal_id, v_turno.caja_id, v_turno.id, 'DEVOLUCION_EFECTIVO', v_a.monto_mxn,
            v_turno.dia_contable,
            left('Anticipo devuelto · ' || (SELECT cliente_nombre FROM citas WHERE id = v_a.cita_id), 100),
            COALESCE(auth.uid(), v_turno.usuario_apertura_id), v_autorizo, p_autorizacion_pin_id);
  END IF;

  UPDATE anticipos_cita
     SET estado = 'DEVUELTO', turno_resuelve_id = v_turno.id, referencia_devolucion = v_ref, resuelto_at = now()
   WHERE id = v_a.id;
END;
$$;
COMMENT ON FUNCTION devolver_anticipo(uuid, uuid, uuid, text, uuid) IS
  'Devuelve un anticipo vigente con venta.devolucion (o su PIN): en efectivo sale del cajón del turno que devuelve; con tarjeta o transferencia exige referencia (0222).';
REVOKE EXECUTE ON FUNCTION devolver_anticipo(uuid, uuid, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION devolver_anticipo(uuid, uuid, uuid, text, uuid) TO authenticated, service_role;

-- Regresa a VIGENTE hasta p_monto (NULL = todo) de los anticipos APLICADOS a una venta, del más
-- nuevo al más viejo. Si un anticipo pasa de lo que falta, se parte: lo que sigue pagando la venta
-- queda APLICADO y lo que regresa nace VIGENTE con el mismo turno, método y fecha (el corte del
-- turno que lo recibió no cambia). Transición del sistema: la llaman el disparador de cancelación y
-- el de devoluciones, nunca la caja. Devuelve lo regresado.
CREATE OR REPLACE FUNCTION _anticipo_regresar(p_ticket uuid, p_monto numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total numeric(12,2);
  v_resto numeric(12,2);
  v_parte numeric(12,2);
  v_a     anticipos_cita%ROWTYPE;
BEGIN
  -- Candados en orden cita → anticipos, como pagar_con_anticipo, antes de sumar.
  PERFORM 1 FROM citas WHERE id IN (SELECT cita_id FROM anticipos_cita WHERE ticket_id = p_ticket AND estado = 'APLICADO')
   ORDER BY id FOR UPDATE;
  PERFORM 1 FROM anticipos_cita WHERE ticket_id = p_ticket AND estado = 'APLICADO' ORDER BY created_at DESC, id DESC FOR UPDATE;
  SELECT COALESCE(sum(monto_mxn), 0) INTO v_total FROM anticipos_cita WHERE ticket_id = p_ticket AND estado = 'APLICADO';
  v_total := LEAST(v_total, COALESCE(p_monto, v_total));
  IF v_total <= 0 THEN RETURN 0; END IF;
  v_resto := v_total;
  FOR v_a IN
    SELECT * FROM anticipos_cita WHERE ticket_id = p_ticket AND estado = 'APLICADO'
     ORDER BY created_at DESC, id DESC FOR UPDATE
  LOOP
    EXIT WHEN v_resto <= 0;
    v_parte := LEAST(v_resto, v_a.monto_mxn);
    IF v_parte < v_a.monto_mxn THEN
      UPDATE anticipos_cita SET monto_mxn = monto_mxn - v_parte WHERE id = v_a.id;
      INSERT INTO anticipos_cita (tenant_id, sucursal_id, caja_id, turno_id, cita_id, metodo_pago, monto_mxn,
                                  usuario_id, created_at)
      VALUES (v_a.tenant_id, v_a.sucursal_id, v_a.caja_id, v_a.turno_id, v_a.cita_id, v_a.metodo_pago,
              v_parte, v_a.usuario_id, v_a.created_at);
    ELSE
      UPDATE anticipos_cita
         SET estado = 'VIGENTE', ticket_id = NULL, turno_resuelve_id = NULL, resuelto_at = NULL
       WHERE id = v_a.id;
    END IF;
    v_resto := v_resto - v_parte;
  END LOOP;
  RETURN v_total - v_resto;   -- lo que de verdad regresó
END $$;
REVOKE ALL ON FUNCTION _anticipo_regresar(uuid, numeric) FROM PUBLIC, anon, authenticated, service_role;

-- Venta cancelada: lo que sigue APLICADO regresa a VIGENTE para cobrar la cita en otra venta si la
-- venta no se había pagado, o si la cancelación devolvió el dinero en efectivo o por el mismo
-- método (esa devolución ya regresó primero la parte del anticipo, trg_devolucion_pago_efectivo, y
-- aquí solo queda lo que no cubrió, p. ej. la propina). Con cortesía, vale, nota de crédito o sin
-- devolver dinero sigue APLICADO: la clienta ya recibió ese valor, o no se le regresa nada.
-- La fila de cancelaciones_ticket ya existe: este UPDATE lo hace su disparador AFTER INSERT (0104).
CREATE OR REPLACE FUNCTION tickets_cancelado_regresa_anticipo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.estado_fiscal NOT IN ('PAGADO', 'FACTURADO') OR EXISTS (
       SELECT 1 FROM cancelaciones_ticket c JOIN devoluciones d ON d.id = c.devolucion_id
        WHERE c.ticket_id = NEW.id AND d.estado = 'CONFIRMADA'
          AND d.medio_devolucion IN ('EFECTIVO', 'MISMO_METODO_PAGO')) THEN
    PERFORM _anticipo_regresar(NEW.id, NULL);
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION tickets_cancelado_regresa_anticipo() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_tickets_cancelado_regresa_anticipo ON tickets;
CREATE TRIGGER trg_tickets_cancelado_regresa_anticipo
  AFTER UPDATE OF estado_fiscal ON tickets
  FOR EACH ROW WHEN (NEW.estado_fiscal = 'CANCELADO' AND OLD.estado_fiscal IS DISTINCT FROM 'CANCELADO')
  EXECUTE FUNCTION tickets_cancelado_regresa_anticipo();

-- Devoluciones: lo devuelto va PRIMERO a la parte pagada con anticipo, que regresa VIGENTE a la
-- cita (no sale del cajón); solo el resto sigue el medio de siempre. Una venta sin ANTICIPO se
-- comporta igual que antes (lo regresado es 0).
-- _credito_devolucion: la de la 0211 (vigente). Cambio "0222": p_ya_regresado (lo que ya regresó
-- como anticipo) se descuenta de lo devuelto antes de bajar la deuda o regresar saldo a favor.
DROP FUNCTION IF EXISTS _credito_devolucion(uuid);
CREATE OR REPLACE FUNCTION _credito_devolucion(p_devolucion uuid, p_ya_regresado numeric DEFAULT 0)
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
  v_devuelto numeric(12,2);   -- 0222
BEGIN
  SELECT * INTO v_dev FROM devoluciones WHERE id = p_devolucion AND estado = 'CONFIRMADA';
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_devuelto := v_dev.total_devuelto_mxn - COALESCE(p_ya_regresado, 0);   -- 0222
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
    v_deuda := LEAST(v_devuelto, v_saldo);
    v_resto := v_devuelto - v_deuda;
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
    v_sf := LEAST(v_devuelto,
                  GREATEST(v_sf - COALESCE((SELECT sum(monto_mxn) FROM saldo_favor_movimientos
                                             WHERE ticket_id = v_t.id AND tipo = 'ENTRADA_CANCELACION'), 0), 0));
    v_resto := 0;
    IF v_dev.medio_devolucion = 'EFECTIVO' THEN v_resto := v_devuelto - v_sf; END IF;
  END IF;

  IF v_sf > 0 THEN
    INSERT INTO saldo_favor_movimientos (tenant_id, cliente_id, tipo, monto_mxn, ticket_id, turno_id, client_id_local)
    VALUES (v_t.tenant_id, v_t.cliente_id, 'ENTRADA_CANCELACION', v_sf, v_t.id, v_dev.turno_id, v_llave);
  END IF;
  RETURN v_resto;
END $$;
COMMENT ON FUNCTION _credito_devolucion(uuid, numeric) IS
  'Devolución confirmada de una venta a crédito o con saldo a favor: baja la deuda, regresa el saldo a favor y dice cuánto sale del cajón (0209, «mismo método» = efectivo en crédito: 0211, sin lo ya regresado como anticipo: 0222). NULL si no aplica. Solo la llama trg_devolucion_pago_efectivo.';
REVOKE ALL ON FUNCTION _credito_devolucion(uuid, numeric) FROM PUBLIC, anon, authenticated, service_role;

-- trg_devolucion_pago_efectivo: la de la 0209 (vigente). Cambios "0222": primero regresa la parte
-- del anticipo y el efectivo de siempre es lo devuelto menos eso.
CREATE OR REPLACE FUNCTION trg_devolucion_pago_efectivo() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_efectivo numeric(12,2);   -- 0209
  v_anticipo numeric(12,2) := 0;   -- 0222
BEGIN
  -- 0222: la parte pagada con anticipo regresa a la cita, no al cajón. Solo cuando la devolución
  -- reembolsa (efectivo o mismo método); con cortesía, vale o nota de crédito el anticipo sigue
  -- APLICADO y ese medio se comporta como siempre.
  IF TG_OP = 'UPDATE' AND OLD.estado <> 'CONFIRMADA' AND NEW.estado = 'CONFIRMADA'
     AND NEW.medio_devolucion IN ('EFECTIVO', 'MISMO_METODO_PAGO') THEN
    v_anticipo := _anticipo_regresar(NEW.ticket_original_id, NEW.total_devuelto_mxn);
  END IF;

  -- 0209: venta a crédito o con saldo a favor. Solo sale del cajón lo que _credito_devolucion diga.
  IF TG_OP = 'UPDATE' AND OLD.estado <> 'CONFIRMADA' AND NEW.estado = 'CONFIRMADA' THEN
    v_efectivo := _credito_devolucion(NEW.id, v_anticipo);
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
     AND NEW.medio_devolucion = 'EFECTIVO'
     AND NEW.total_devuelto_mxn - v_anticipo > 0 THEN   -- 0222
    -- Única consecuencia en caja: sale efectivo por el reembolso. El ticket original NO se toca.
    INSERT INTO movimientos_caja (
      tenant_id, sucursal_id, caja_id, turno_id,
      tipo, monto_mxn, dia_contable, motivo, usuario_solicitante_id
    ) VALUES (
      NEW.tenant_id, NEW.sucursal_id, NEW.caja_id, NEW.turno_id,
      'DEVOLUCION_EFECTIVO', NEW.total_devuelto_mxn - v_anticipo, NEW.dia_contable,   -- 0222
      'Devolución folio ' || NEW.folio_completo, NEW.usuario_solicitante_id
    );
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION trg_devolucion_pago_efectivo() FROM PUBLIC, anon, authenticated;

-- Retener («No llegó» o cancelación fuera del límite): el negocio se queda el anticipo. Pide lo
-- mismo que devolverlo: venta.devolucion (o su PIN) y un turno abierto de esa caja.
DROP FUNCTION IF EXISTS retener_anticipo(uuid, uuid);
CREATE OR REPLACE FUNCTION retener_anticipo(p_anticipo uuid, p_caja_id uuid, p_turno_id uuid,
                                            p_autorizacion_pin_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
  v_a      anticipos_cita%ROWTYPE;
  v_turno  turnos%ROWTYPE;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Sin negocio en la sesión.' USING ERRCODE = '42501';
  END IF;
  -- Candados en orden cita → anticipo, como pagar_con_anticipo.
  PERFORM 1 FROM citas WHERE id = (SELECT cita_id FROM anticipos_cita WHERE id = p_anticipo AND tenant_id = v_tenant) FOR UPDATE;
  SELECT * INTO v_a FROM anticipos_cita WHERE id = p_anticipo AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el anticipo no existe.' USING ERRCODE = '22023';
  END IF;
  IF v_a.estado = 'RETENIDO' THEN RETURN; END IF;   -- reintento
  IF v_a.estado <> 'VIGENTE' THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el anticipo ya se resolvió (%).', v_a.estado USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM citas WHERE id = v_a.cita_id AND estado IN ('NO_LLEGO', 'CANCELADA')) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: solo se retiene el anticipo de una cita cancelada o que no llegó.' USING ERRCODE = '22023';
  END IF;
  v_turno := _anticipo_turno(v_tenant, p_caja_id, p_turno_id);
  IF p_autorizacion_pin_id IS NOT NULL THEN
    PERFORM consumir_autorizacion(p_autorizacion_pin_id, ARRAY['venta.devolucion'],
      p_anticipo, v_a.monto_mxn, NULL, false, v_tenant);
  ELSIF NOT usuario_actual_tiene_permiso('venta.devolucion') THEN
    RAISE EXCEPTION 'Retener un anticipo requiere autorización (venta.devolucion).'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE anticipos_cita
     SET estado = 'RETENIDO', turno_resuelve_id = v_turno.id, resuelto_at = now()
   WHERE id = v_a.id;
END;
$$;
COMMENT ON FUNCTION retener_anticipo(uuid, uuid, uuid, uuid) IS
  'El negocio retiene el anticipo de una cita cancelada o que no llegó, con venta.devolucion (o su PIN) en un turno abierto de la caja: «Anticipo no reembolsable» en el corte del turno (0222).';
REVOKE EXECUTE ON FUNCTION retener_anticipo(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION retener_anticipo(uuid, uuid, uuid, uuid) TO authenticated, service_role;

-- ── §3 Guardia de pagos ─────────────────────────────────────────────────────
-- La de la 0211 (vigente) con ANTICIPO: solo entra por pagar_con_anticipo y, como el saldo a
-- favor, no cambia de método, monto ni venta, ni se cancela por fuera (el anticipo ya quedó
-- APLICADO a esa venta). Cambios marcados "0222".
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
      IF 'ANTICIPO' IN (OLD.metodo_pago, NEW.metodo_pago) THEN   -- 0222
        RAISE EXCEPTION 'DATOS_INVALIDOS: un pago con anticipo no cambia de forma de pago, ni otro pasa a anticipo. Cancela la venta y vuelve a cobrarla.'
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
    IF OLD.metodo_pago = 'ANTICIPO' THEN   -- 0222
      RAISE EXCEPTION 'DATOS_INVALIDOS: una venta pagada con anticipo no se reabre ni se le edita ese pago. Cancela la venta y vuelve a cobrarla.'
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
  IF NEW.metodo_pago = 'ANTICIPO' AND current_setting('vim.pago_anticipo', true) IS DISTINCT FROM 'si' THEN   -- 0222
    RAISE EXCEPTION 'DATOS_INVALIDOS: el anticipo se cobra con «Anticipo» (pagar_con_anticipo).'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION pagos_metodo_solo_por_rpc() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pagos_metodo_solo_por_rpc ON pagos;
CREATE TRIGGER trg_pagos_metodo_solo_por_rpc
  BEFORE INSERT ON pagos
  FOR EACH ROW WHEN (NEW.metodo_pago IN ('CREDITO', 'SALDO_FAVOR', 'ANTICIPO'))
  EXECUTE FUNCTION pagos_metodo_solo_por_rpc();
DROP TRIGGER IF EXISTS trg_pagos_metodo_solo_por_rpc_cambio ON pagos;
CREATE TRIGGER trg_pagos_metodo_solo_por_rpc_cambio
  BEFORE UPDATE ON pagos
  FOR EACH ROW WHEN (OLD.metodo_pago IN ('CREDITO', 'SALDO_FAVOR', 'ANTICIPO') OR NEW.metodo_pago IN ('CREDITO', 'SALDO_FAVOR', 'ANTICIPO'))
  EXECUTE FUNCTION pagos_metodo_solo_por_rpc();

-- ── §4 Corte ────────────────────────────────────────────────────────────────
-- calcular_efectivo_esperado: la de la 0208 (vigente) + los anticipos en efectivo que RECIBIÓ este
-- turno, en cualquier estado (lo devuelto en efectivo sale como DEVOLUCION_EFECTIVO del turno que
-- devuelve). Los pagos ANTICIPO no son EFECTIVO: no se cuentan dos veces.
CREATE OR REPLACE FUNCTION public.calcular_efectivo_esperado(p_turno_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_turno          turnos%ROWTYPE;
  v_pagos_efectivo numeric(12,2);
  v_movimientos    numeric(12,2);
  v_abonos         numeric(12,2);
  v_anticipos      numeric(12,2);
BEGIN
  SELECT * INTO v_turno FROM turnos WHERE id = p_turno_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(SUM(p.monto_mxn), 0) INTO v_pagos_efectivo
  FROM pagos p
  WHERE p.turno_id = p_turno_id
    AND p.metodo_pago = 'EFECTIVO'
    AND p.estado = 'APLICADO'
    AND p.deleted_at IS NULL;

  SELECT COALESCE(SUM(
    CASE
      WHEN tipo IN ('INYECCION_FONDO', 'AJUSTE_POSITIVO') THEN monto_mxn
      WHEN tipo IN ('SANGRIA', 'DEPOSITO', 'DEVOLUCION_EFECTIVO', 'PAGO_PROVEEDOR', 'AJUSTE_NEGATIVO') THEN -monto_mxn
      ELSE 0
    END
  ), 0) INTO v_movimientos
  FROM movimientos_caja
  WHERE turno_id = p_turno_id
    AND cancelado = false;   -- 0042: excluir movimientos cancelados

  -- 0208: abonos a crédito recibidos en efectivo en este turno.
  SELECT COALESCE(SUM(a.monto_mxn), 0) INTO v_abonos
  FROM abonos_credito a
  WHERE a.turno_id = p_turno_id
    AND a.tipo = 'ABONO'
    AND a.metodo_pago = 'EFECTIVO'
    AND a.estado = 'APLICADO';

  -- 0222: anticipos de cita recibidos en efectivo en este turno.
  SELECT COALESCE(SUM(a.monto_mxn), 0) INTO v_anticipos
  FROM anticipos_cita a
  WHERE a.turno_id = p_turno_id
    AND a.metodo_pago = 'EFECTIVO';

  RETURN v_turno.fondo_inicial_mxn + v_pagos_efectivo + v_movimientos + v_abonos + v_anticipos;
END;
$function$;

-- reporte_x: la de la 0209 (vigente). Cambios "0222": ANTICIPO fuera de lo que se declara, los
-- anticipos recibidos se declaran por método (como los abonos) y cuatro cifras informativas.
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
  v_con_anticipo numeric(12,2);
  v_anticipos    record;
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
        AND p.metodo_pago NOT IN ('CREDITO', 'SALDO_FAVOR', 'ANTICIPO')   -- 0208/0209/0222: no es dinero recibido aquí
        AND t.estado_fiscal IN ('PAGADO', 'FACTURADO')
      UNION ALL
      SELECT a.metodo_pago, a.monto_mxn                        -- 0208: abonos recibidos en el turno
      FROM abonos_credito a
      WHERE a.turno_id = p_turno_id
        AND a.tipo = 'ABONO'
        AND a.estado = 'APLICADO'
      UNION ALL
      SELECT a.metodo_pago, a.monto_mxn                        -- 0222: anticipos recibidos en el turno
      FROM anticipos_cita a
      WHERE a.turno_id = p_turno_id
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

  -- 0222: lo pagado con anticipo en el turno (informativo, no se declara).
  SELECT COALESCE(SUM(p.monto_mxn), 0) INTO v_con_anticipo
  FROM pagos p
  JOIN tickets t ON t.id = p.ticket_id
  WHERE p.turno_id = p_turno_id
    AND p.deleted_at IS NULL
    AND p.estado = 'APLICADO'
    AND p.metodo_pago = 'ANTICIPO'
    AND t.estado_fiscal IN ('PAGADO', 'FACTURADO');

  -- 0222: anticipos recibidos en el turno y los que el turno devolvió o retuvo (informativos).
  SELECT COALESCE(SUM(monto_mxn) FILTER (WHERE turno_id = p_turno_id), 0) AS recibidos,
         COALESCE(SUM(monto_mxn) FILTER (WHERE turno_resuelve_id = p_turno_id AND estado = 'DEVUELTO'), 0) AS devueltos,
         COALESCE(SUM(monto_mxn) FILTER (WHERE turno_resuelve_id = p_turno_id AND estado = 'RETENIDO'), 0) AS retenidos
    INTO v_anticipos
    FROM anticipos_cita
   WHERE turno_id = p_turno_id OR turno_resuelve_id = p_turno_id;

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
    'pagado_con_anticipo_mxn', v_con_anticipo,                 -- 0222
    'anticipos_recibidos_mxn', v_anticipos.recibidos,          -- 0222
    'anticipos_devueltos_mxn', v_anticipos.devueltos,          -- 0222
    'anticipos_retenidos_mxn', v_anticipos.retenidos,          -- 0222
    'devoluciones', v_devoluciones,
    'movimientos_caja', COALESCE(v_movimientos, '[]'::jsonb),

    'efectivo_esperado_mxn', v_efectivo_esperado
  );

  RETURN v_resultado;
END;
$$;

COMMENT ON FUNCTION reporte_x IS 'Lectura intermedia del turno (no cierra ni modifica nada). Idempotente. Devuelve jsonb listo para impresión o UI. 0157: tickets.lealtad_mxn. 0208: sin CREDITO en pagos_por_metodo, con abonos; ventas_a_credito_mxn. 0209: sin SALDO_FAVOR; pagado_con_saldo_favor_mxn. 0222: sin ANTICIPO, con anticipos recibidos; pagado_con_anticipo_mxn y anticipos_recibidos/devueltos/retenidos_mxn.';

-- arquear_caja: la de la 0209 (vigente). Cambio "0222": el esperado y las transacciones de cada
-- método no efectivo suman los anticipos que recibió el turno (reporte_x ya los pide declarar).
-- En EFECTIVO ya los suma calcular_efectivo_esperado.
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
      -- 0222: más los anticipos de cita recibidos con ese método.
      v_esperado := v_esperado + (SELECT COALESCE(SUM(monto_mxn), 0) FROM anticipos_cita
                                   WHERE turno_id = p_turno_id AND metodo_pago = v_metodo);
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
           AND metodo_pago = v_metodo AND estado = 'APLICADO')
      + (SELECT COUNT(*) FROM anticipos_cita                  -- 0222
         WHERE turno_id = p_turno_id AND metodo_pago = v_metodo),
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
