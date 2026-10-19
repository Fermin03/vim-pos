-- Belleza, entrega 3: el anticipo de una reserva en línea se paga con Mercado Pago (la misma
-- cadena de la tienda, 0173/0175/0178) y queda como anticipo PAGO_EN_LINEA, sin caja ni turno.
--
-- §1 Esquema: tienda_pagos acepta un pago de cita (pedido_id o cita_id, uno solo); anticipos_cita
--    acepta PAGO_EN_LINEA sin caja ni turno y apunta a su pago (tienda_pago_id, sin llave foránea:
--    en la caja tienda_pagos está vacía y el pull baja el anticipo igual).
-- §2 La cadena del pago. El pedido sigue EXACTAMENTE igual: cada función redefinida conserva su
--    cuerpo vigente y solo gana una primera línea que manda el pago de cita a su propia función.
--    La cita hace el papel del pedido:
--      · espera su pago = AGENDADA (o EN_ESPERA) con pago_hasta;
--      · aprobado = anticipo VIGENTE PAGO_EN_LINEA por lo cobrado y pago_hasta en NULL;
--      · un NO seguro (descartar) borra SOLO el renglón del pago: la cita sigue apartada hasta
--        pago_hasta y reservar con la misma clave crea otro pago (otra orden);
--      · vence o se abandona el reto del banco = la cita se cancela «No se completó el pago»
--        (PAGO_VENCIDO), como el pedido EXPIRADO «Sin pago»; un aprobado tardío se devuelve.
--    No cambian (ya van por el id del pago y sirven igual a los dos): tienda_pago_tomar_cobro,
--    _anotar, _verificacion, tienda_pagos_tomar, tienda_pago_devolucion y _conciliacion.
-- §3 Reembolso: la clienta cancela en línea (a tiempo: lo exige agenda_cancelar_en_linea) → el
--    pago pasa a POR_DEVOLVER y el barrido lo devuelve. Cancelar desde la caja o el negocio NO
--    devuelve solo: lo decide la recepción con el anticipo (devolver = POR_DEVOLVER, sin cajón;
--    retener). Al quedar DEVUELTO, el anticipo VIGENTE pasa a DEVUELTO. Los correos de la tienda
--    (0176) no salen por un pago de cita.
-- §4 Anticipos: devolver_anticipo y retener_anticipo con PAGO_EN_LINEA (sin turno, sin referencia,
--    con permiso o PIN); reporte_x informa lo aplicado en línea. calcular_efectivo_esperado y
--    arquear_caja no cambian: cuentan anticipos por turno_id, y el de línea no tiene.
-- §5 Sync (0223): la caja copia cancelada_por; no crea anticipos en línea (salvo la parte que nace
--    de partir uno, dentro de lo cobrado) ni les cambia método.
-- §6 Reservar crea el pago de la cita; vencer no cancela una cita con un cobro en curso.
-- Corre también en la caja: allá tienda_pagos está vacía y lo de Mercado Pago no hace nada.

-- ── §1 Esquema ──────────────────────────────────────────────────────────────
ALTER TABLE tienda_pagos ALTER COLUMN pedido_id DROP NOT NULL;
ALTER TABLE tienda_pagos ADD COLUMN IF NOT EXISTS cita_id uuid NULL REFERENCES citas(id);
ALTER TABLE tienda_pagos DROP CONSTRAINT IF EXISTS tienda_pago_pedido_o_cita;
ALTER TABLE tienda_pagos ADD CONSTRAINT tienda_pago_pedido_o_cita CHECK (num_nonnulls(pedido_id, cita_id) = 1);
-- Un solo pago vivo (CREADO o APROBADO) por cita. Los que fallaron (RECHAZADO, VENCIDO, ABANDONADO)
-- se quedan: son los intentos de la cita (máximo 5) y lo que la conciliación sigue vigilando.
DROP INDEX IF EXISTS tienda_pagos_cita_uq;
CREATE UNIQUE INDEX tienda_pagos_cita_uq ON tienda_pagos (cita_id) WHERE NOT extra AND estado IN ('CREADO', 'APROBADO');
CREATE INDEX IF NOT EXISTS idx_tienda_pagos_cita ON tienda_pagos (cita_id) WHERE cita_id IS NOT NULL;
COMMENT ON COLUMN tienda_pagos.cita_id IS 'Pago del anticipo de una cita reservada en línea (0225). Exactamente uno de pedido_id y cita_id.';

-- El CHECK de método de la 0222 era anónimo: se busca por lo que dice y se repone con nombre.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'public.anticipos_cita'::regclass AND contype = 'c'
              AND pg_get_constraintdef(oid) LIKE '%TRANSFERENCIA%' LOOP
    EXECUTE format('ALTER TABLE anticipos_cita DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE anticipos_cita ALTER COLUMN caja_id DROP NOT NULL, ALTER COLUMN turno_id DROP NOT NULL;
ALTER TABLE anticipos_cita ADD COLUMN IF NOT EXISTS tienda_pago_id uuid NULL;
ALTER TABLE anticipos_cita
  DROP CONSTRAINT IF EXISTS anticipos_cita_metodo_valido,
  DROP CONSTRAINT IF EXISTS anticipos_cita_en_linea_sin_turno,
  DROP CONSTRAINT IF EXISTS anticipos_cita_resuelto;
ALTER TABLE anticipos_cita
  ADD CONSTRAINT anticipos_cita_metodo_valido
    CHECK (metodo_pago IN ('EFECTIVO', 'TARJETA_DEBITO', 'TARJETA_CREDITO', 'TRANSFERENCIA', 'PAGO_EN_LINEA')),
  -- Sin turno = en línea, y al revés: así nunca cuenta como recibido en un turno.
  ADD CONSTRAINT anticipos_cita_en_linea_sin_turno
    CHECK ((metodo_pago = 'PAGO_EN_LINEA') = (turno_id IS NULL) AND (turno_id IS NULL) = (caja_id IS NULL)),
  -- El de línea se puede resolver sin turno (lo devuelve Mercado Pago, o se retiene sin caja).
  ADD CONSTRAINT anticipos_cita_resuelto
    CHECK ((estado = 'VIGENTE') = (turno_resuelve_id IS NULL)
           OR (metodo_pago = 'PAGO_EN_LINEA' AND estado <> 'VIGENTE' AND turno_resuelve_id IS NULL));
COMMENT ON COLUMN anticipos_cita.tienda_pago_id IS 'PAGO_EN_LINEA: el tienda_pagos que lo cobró (0225). Sin llave foránea: en la caja tienda_pagos está vacía.';

-- ── §2 La cadena del pago ───────────────────────────────────────────────────
-- Cancela una cita que esperaba su pago y no lo tuvo («No se completó el pago»). Falso si ya no
-- esperaba (pagada, cancelada, cobrada…). La usan el barrido, abandonar y agenda_vencer_reservas.
CREATE OR REPLACE FUNCTION _agenda_cancelar_sin_pago(p_cita uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_c       citas;
  v_vecinos uuid[];
BEGIN
  SELECT * INTO v_c FROM citas WHERE id = p_cita FOR UPDATE;
  IF NOT FOUND OR v_c.estado <> 'AGENDADA' OR v_c.pago_hasta IS NULL
     OR EXISTS (SELECT 1 FROM anticipos_cita a WHERE a.cita_id = p_cita AND a.estado IN ('VIGENTE', 'APLICADO')) THEN
    RETURN false;
  END IF;
  v_vecinos := _agenda_vecinos(v_c.tenant_id, p_cita);
  UPDATE citas SET estado = 'CANCELADA', cancelada_motivo = 'No se completó el pago', cancelada_por = 'PAGO_VENCIDO'
   WHERE id = p_cita;
  PERFORM _agenda_remarcar(v_c.tenant_id, v_vecinos || ARRAY(SELECT id FROM citas_servicios WHERE cita_id = p_cita));
  RETURN true;
END;
$$;

-- tienda_pago_descartar, pago de cita: un NO seguro de Mercado Pago. El pago queda RECHAZADO (es un
-- intento de la cita; no se borra) y la cita sigue apartada hasta pago_hasta: reservar con la misma
-- clave da otro pago. Mismas dos formas que el pedido: CREADO sin orden, o ya RECHAZADO.
CREATE OR REPLACE FUNCTION _tienda_pago_descartar_cita(p_pago uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cita uuid;
BEGIN
  SELECT cita_id INTO v_cita FROM tienda_pagos WHERE id = p_pago AND NOT extra;
  IF NOT FOUND THEN RETURN false; END IF;
  -- Siempre la cita antes que el pago (como el pedido en la 0173).
  PERFORM 1 FROM citas WHERE id = v_cita FOR UPDATE;
  UPDATE tienda_pagos SET estado = 'RECHAZADO'
   WHERE id = p_pago AND aprobado_at IS NULL
     AND ((estado = 'CREADO' AND orden_id_externo IS NULL) OR estado = 'RECHAZADO');
  RETURN FOUND;
END;
$$;

-- tienda_pago_aplicar, pago de cita. Las mismas reglas que el pedido (0175), con la cita:
--   · APROBADO por el monto esperado y la cita esperando su pago → pago APROBADO, anticipo VIGENTE
--     PAGO_EN_LINEA por lo cobrado, y pago_hasta en NULL (ya no vence);
--   · aprobado tarde (la cita ya no espera: venció o se canceló) → POR_DEVOLVER, sin anticipo;
--   · de más (otra orden, otro monto) → renglón `extra` POR_DEVOLVER;
--   · RECHAZADO deja el pago RECHAZADO y la cita apartada: se paga otra vez con otro pago.
-- Devuelve {estado, pedido_estado: null, cita_estado, recien_aprobado}.
CREATE OR REPLACE FUNCTION _tienda_pago_aplicar_cita(
  p_pago uuid, p_resultado text, p_orden_id_externo text, p_monto numeric,
  p_tipo text, p_marca text, p_detalle text, p_pago_id_externo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cita     uuid;
  v_c        citas%ROWTYPE;
  v_g        tienda_pagos%ROWTYPE;
  v_aprobado boolean := false;
  v_suya     boolean;
  v_espera   boolean;
BEGIN
  SELECT cita_id INTO v_cita FROM tienda_pagos WHERE id = p_pago AND NOT extra;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAGO_NO_EXISTE: %', COALESCE(p_pago::text, 'NULL'); END IF;
  SELECT * INTO v_c FROM citas WHERE id = v_cita FOR UPDATE;
  SELECT * INTO v_g FROM tienda_pagos WHERE id = p_pago FOR UPDATE;
  v_suya := v_g.aprobado_at IS NULL AND (v_g.orden_id_externo IS NULL OR v_g.orden_id_externo = p_orden_id_externo);
  v_espera := v_c.estado = 'AGENDADA' AND v_c.pago_hasta IS NOT NULL;

  IF p_resultado = 'DEVUELTO' THEN
    UPDATE tienda_pagos SET estado = 'DEVUELTO', devuelto_at = COALESCE(devuelto_at, now()), ultimo_error = NULL
     WHERE cita_id = v_cita AND orden_id_externo = p_orden_id_externo
       AND estado IN ('APROBADO', 'POR_DEVOLVER', 'DEVOLUCION_FALLIDA');

  ELSIF p_resultado = 'RECHAZADO' THEN
    UPDATE tienda_pagos SET detalle = left(p_detalle, 80), conciliado_at = now(), ultimo_error = NULL
     WHERE id = p_pago AND estado = 'ABANDONADO' AND v_suya;
    UPDATE tienda_pagos SET estado = 'RECHAZADO', detalle = left(p_detalle, 80)
     WHERE id = p_pago AND estado = 'CREADO' AND v_suya;

  ELSIF EXISTS (SELECT 1 FROM tienda_pagos WHERE orden_id_externo = p_orden_id_externo AND aprobado_at IS NOT NULL) THEN
    NULL;   -- esa orden ya está aplicada: aviso repetido

  ELSIF (p_monto > 0) IS NOT TRUE THEN
    RAISE EXCEPTION 'PAGO_RESULTADO_INVALIDO: monto %', COALESCE(p_monto::text, 'NULL');

  ELSIF v_suya AND v_g.estado IN ('CREADO', 'RECHAZADO') AND v_espera AND p_monto = v_g.monto_mxn THEN
    UPDATE tienda_pagos
       SET estado = 'APROBADO', orden_id_externo = p_orden_id_externo, pago_id_externo = p_pago_id_externo,
           tipo_tarjeta = left(p_tipo, 20), marca = left(p_marca, 30), aprobado_at = now(), detalle = NULL, ultimo_error = NULL
     WHERE id = p_pago;
    INSERT INTO anticipos_cita (tenant_id, sucursal_id, cita_id, metodo_pago, monto_mxn, client_id_local, tienda_pago_id)
    VALUES (v_c.tenant_id, v_c.sucursal_id, v_cita, 'PAGO_EN_LINEA', p_monto, 'tienda-pago:' || p_pago, p_pago);
    UPDATE citas SET pago_hasta = NULL WHERE id = v_cita;
    v_aprobado := true;

  ELSIF v_suya AND v_g.estado IN ('CREADO', 'RECHAZADO', 'VENCIDO', 'ABANDONADO') AND p_monto = v_g.monto_mxn THEN
    -- Llegó tarde: la cita ya no espera su pago (venció o se canceló). Se devuelve.
    UPDATE tienda_pagos
       SET estado = 'POR_DEVOLVER', orden_id_externo = p_orden_id_externo, pago_id_externo = p_pago_id_externo,
           tipo_tarjeta = left(p_tipo, 20), marca = left(p_marca, 30), aprobado_at = now(), proximo_intento_at = NULL
     WHERE id = p_pago;

  ELSE
    UPDATE tienda_pagos SET orden_id_externo = NULL
     WHERE id = p_pago AND orden_id_externo = p_orden_id_externo AND aprobado_at IS NULL;
    INSERT INTO tienda_pagos (tenant_id, cita_id, conexion_id, monto_mxn, estado, extra, orden_id_externo, pago_id_externo,
                              tipo_tarjeta, marca, vence_at, aprobado_at)
    VALUES (v_g.tenant_id, v_cita, v_g.conexion_id, p_monto, 'POR_DEVOLVER', true, p_orden_id_externo, p_pago_id_externo,
            left(p_tipo, 20), left(p_marca, 30), v_g.vence_at, now());
  END IF;

  RETURN jsonb_build_object(
    'estado', (SELECT g.estado FROM tienda_pagos g WHERE g.id = p_pago),
    'pedido_estado', NULL,
    'cita_estado', (SELECT c.estado FROM citas c WHERE c.id = v_cita),
    'recien_aprobado', v_aprobado);
END;
$$;

-- tienda_pago_abandonar, pago de cita: el reto del banco se dejó. El pago queda ABANDONADO y
-- vigilado (como el del pedido); la cita sigue apartada hasta pago_hasta (se puede pagar otra vez).
CREATE OR REPLACE FUNCTION _tienda_pago_abandonar_cita(p_pago uuid, p_orden text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cita uuid;
BEGIN
  SELECT cita_id INTO v_cita FROM tienda_pagos WHERE id = p_pago AND NOT extra;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM citas WHERE id = v_cita FOR UPDATE;
  UPDATE tienda_pagos g
     SET estado = 'ABANDONADO',
         orden_id_externo = COALESCE(g.orden_id_externo, p_orden),
         verificacion_at = COALESCE(g.verificacion_at, now()),
         vence_at = CASE WHEN g.estado = 'CREADO' THEN now() ELSE g.vence_at END,
         conciliaciones = 0, conciliado_at = NULL, consultado_at = NULL
   WHERE g.id = p_pago AND NOT g.extra AND g.aprobado_at IS NULL AND g.estado IN ('CREADO', 'VENCIDO')
     AND COALESCE(g.orden_id_externo, p_orden) IS NOT NULL
     AND (g.orden_id_externo IS NOT NULL OR NOT EXISTS (SELECT 1 FROM tienda_pagos o WHERE o.orden_id_externo = p_orden));
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION _agenda_cancelar_sin_pago(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION _tienda_pago_descartar_cita(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION _tienda_pago_aplicar_cita(uuid, text, text, numeric, text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION _tienda_pago_abandonar_cita(uuid, text) FROM PUBLIC, anon, authenticated, service_role;

-- Las tres de la cadena con su cuerpo vigente (descartar: 0173; aplicar y abandonar: 0175). Único
-- cambio, marcado "0225": la línea que manda el pago de cita a su función. CREATE OR REPLACE
-- conserva sus permisos (solo service_role).
CREATE OR REPLACE FUNCTION tienda_pago_descartar(p_pago uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pedido uuid;
  v_estado text;
BEGIN
  IF EXISTS (SELECT 1 FROM tienda_pagos WHERE id = p_pago AND cita_id IS NOT NULL) THEN RETURN _tienda_pago_descartar_cita(p_pago); END IF;   -- 0225
  SELECT pedido_id INTO v_pedido FROM tienda_pagos WHERE id = p_pago AND NOT extra;
  IF NOT FOUND THEN RETURN false; END IF;
  -- Siempre el pedido antes que el pago: el mismo orden de candados en todas las funciones.
  SELECT estado INTO v_estado FROM delivery_pedidos
   WHERE id = v_pedido AND pagado_at IS NULL AND ticket_id IS NULL
     AND (estado = 'POR_PAGAR' OR (estado = 'EXPIRADO' AND motivo_cancelacion = 'Sin pago'))
     FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM tienda_pagos
    WHERE id = p_pago AND aprobado_at IS NULL
      AND ((v_estado = 'POR_PAGAR' AND estado = 'CREADO' AND orden_id_externo IS NULL)
           OR (v_estado = 'EXPIRADO' AND estado = 'RECHAZADO'))
      FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  -- Ningún otro renglón del pedido (una orden de más, por devolver) se pierde con él.
  IF EXISTS (SELECT 1 FROM tienda_pagos WHERE pedido_id = v_pedido AND extra) THEN RETURN false; END IF;
  DELETE FROM delivery_pedidos WHERE id = v_pedido;
  RETURN true;
END;
$$;

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
  IF EXISTS (SELECT 1 FROM tienda_pagos WHERE id = p_pago AND cita_id IS NOT NULL) THEN   -- 0225
    RETURN _tienda_pago_aplicar_cita(p_pago, p_resultado, p_orden_id_externo, p_monto, p_tipo, p_marca, p_detalle, p_pago_id_externo);
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
  IF EXISTS (SELECT 1 FROM tienda_pagos WHERE id = p_pago AND cita_id IS NOT NULL) THEN RETURN _tienda_pago_abandonar_cita(p_pago, p_orden); END IF;   -- 0225
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

-- tienda_pagos_barrer: cuerpo vigente de la 0175; se añade ("0225") el vencimiento de los pagos de cita.
CREATE OR REPLACE FUNCTION tienda_pagos_barrer() RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids     uuid[];
  v_secreto text;
  v_base    text;
  v_cita    uuid;   -- 0225
BEGIN
  -- 0225: el pago de una cita vence con su plazo (vence_at = el pago_hasta de la cita, o el de la
  -- verificación del banco si es más tarde): queda VENCIDO o ABANDONADO. La cita se cancela sin
  -- pago solo si además ya pasó su pago_hasta. Si después se aprueba, se devuelve. En su propio
  -- bloque: un error aquí no frena lo de los pedidos.
  BEGIN
    FOR v_cita IN SELECT DISTINCT g.cita_id FROM tienda_pagos g
                   WHERE g.cita_id IS NOT NULL AND NOT g.extra AND g.estado = 'CREADO' AND g.vence_at < now() LOOP
      PERFORM 1 FROM citas WHERE id = v_cita FOR UPDATE;
      UPDATE tienda_pagos
         SET estado = CASE WHEN verificacion_at IS NOT NULL AND orden_id_externo IS NOT NULL THEN 'ABANDONADO' ELSE 'VENCIDO' END
       WHERE cita_id = v_cita AND NOT extra AND estado = 'CREADO' AND vence_at < now();
      IF EXISTS (SELECT 1 FROM citas WHERE id = v_cita AND pago_hasta < now()) THEN PERFORM _agenda_cancelar_sin_pago(v_cita); END IF;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'tienda_pagos_barrer (citas): %', SQLERRM;
  END;

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
                   -- Un reto abandonado al que le toca consulta (o su último vistazo): el MISMO ritmo
                   -- de tienda_pagos_tomar, para no llamar a la función en balde cada minuto durante 48 horas.
                   OR (NOT g.extra AND g.estado = 'ABANDONADO' AND g.conciliado_at IS NULL
                       AND (g.consultado_at IS NULL OR g.consultado_at < now() - CASE
                              WHEN g.conciliacion_fallos >= 3 OR g.vence_at < now() - interval '30 minutes' THEN interval '1 hour'
                              ELSE interval '5 minutes' END))) THEN
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

-- ── §3 Reembolso ────────────────────────────────────────────────────────────
-- La clienta canceló en línea (a tiempo: agenda_cancelar_en_linea no deja otra cosa): su pago
-- aprobado se devuelve completo. Cancelar desde la caja o el negocio no devuelve solo: lo decide la
-- recepción con el anticipo (devolver_anticipo o retener_anticipo).
CREATE OR REPLACE FUNCTION citas_devolver_pago_en_linea()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE tienda_pagos SET estado = 'POR_DEVOLVER', proximo_intento_at = NULL
   WHERE cita_id = NEW.id AND NOT extra AND estado = 'APROBADO';
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_citas_devolver_pago_en_linea ON citas;
CREATE TRIGGER trg_citas_devolver_pago_en_linea
  AFTER UPDATE OF estado ON citas
  FOR EACH ROW
  WHEN (NEW.estado = 'CANCELADA' AND OLD.estado IS DISTINCT FROM NEW.estado AND NEW.cancelada_por = 'CLIENTA_EN_LINEA')
  EXECUTE FUNCTION citas_devolver_pago_en_linea();

-- La recepción devolvió un anticipo en línea (en la nube o en la caja, que lo sube por sync): el
-- dinero lo regresa Mercado Pago. Un disparador, y no una línea en devolver_anticipo, porque el
-- aplicador del sync también lo deja DEVUELTO.
CREATE OR REPLACE FUNCTION anticipos_cita_devolver_pago_en_linea()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE tienda_pagos SET estado = 'POR_DEVOLVER', proximo_intento_at = NULL
   WHERE id = _anticipo_pago_en_linea(NEW.cita_id) AND estado = 'APROBADO';
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_anticipos_cita_devolver_pago_en_linea ON anticipos_cita;
CREATE TRIGGER trg_anticipos_cita_devolver_pago_en_linea
  AFTER UPDATE OF estado ON anticipos_cita
  FOR EACH ROW
  WHEN (NEW.metodo_pago = 'PAGO_EN_LINEA' AND NEW.estado = 'DEVUELTO' AND OLD.estado IS DISTINCT FROM NEW.estado
        AND NEW.referencia_devolucion IS DISTINCT FROM 'EN_EFECTIVO')
  EXECUTE FUNCTION anticipos_cita_devolver_pago_en_linea();

-- El pago del anticipo en línea de una cita: el de su primer renglón con tienda_pago_id (las partes
-- que nacen al partirlo no lo copian).
CREATE OR REPLACE FUNCTION _anticipo_pago_en_linea(p_cita uuid)
RETURNS uuid
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT a.tienda_pago_id FROM anticipos_cita a
   WHERE a.cita_id = p_cita AND a.metodo_pago = 'PAGO_EN_LINEA' AND a.tienda_pago_id IS NOT NULL
   ORDER BY a.created_at, a.id LIMIT 1;
$$;
REVOKE ALL ON FUNCTION _anticipo_pago_en_linea(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- El pago de la cita quedó DEVUELTO (lo devolvimos, o el negocio desde su cuenta): su anticipo
-- vigente también. Lo ya aplicado o retenido no se toca.
CREATE OR REPLACE FUNCTION tienda_pagos_devuelto_anticipo()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Solo si es EL pago del anticipo: la devolución de un cobro tardío no toca el anticipo bueno.
  IF _anticipo_pago_en_linea(NEW.cita_id) = NEW.id THEN
    UPDATE anticipos_cita SET estado = 'DEVUELTO', resuelto_at = now()
     WHERE cita_id = NEW.cita_id AND metodo_pago = 'PAGO_EN_LINEA' AND estado = 'VIGENTE';
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_tienda_pagos_devuelto_anticipo ON tienda_pagos;
CREATE TRIGGER trg_tienda_pagos_devuelto_anticipo
  AFTER UPDATE OF estado ON tienda_pagos
  FOR EACH ROW
  WHEN (NEW.estado = 'DEVUELTO' AND OLD.estado IS DISTINCT FROM NEW.estado AND NEW.cita_id IS NOT NULL AND NOT NEW.extra)
  EXECUTE FUNCTION tienda_pagos_devuelto_anticipo();

-- El correo «te devolvimos tu pago» de la tienda (0176) es de pedidos: un pago de cita no lo dispara.
DROP TRIGGER IF EXISTS trg_tienda_pagos_correo_de_devolucion ON tienda_pagos;
CREATE TRIGGER trg_tienda_pagos_correo_de_devolucion
  AFTER UPDATE OF estado ON tienda_pagos
  FOR EACH ROW
  WHEN (NEW.estado = 'DEVUELTO' AND OLD.estado IS DISTINCT FROM NEW.estado AND NOT NEW.extra AND NEW.pedido_id IS NOT NULL)
  EXECUTE FUNCTION tienda_pagos_correo_de_devolucion();

REVOKE ALL ON FUNCTION citas_devolver_pago_en_linea() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION anticipos_cita_devolver_pago_en_linea() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION tienda_pagos_devuelto_anticipo() FROM PUBLIC, anon, authenticated, service_role;

-- ── §4 Anticipos ────────────────────────────────────────────────────────────
-- devolver_anticipo: la de la 0222 (vigente). Cambios "0225" para PAGO_EN_LINEA: no pide
-- referencia ni turno (si viene, se valida y se anota), no sale del cajón y su pago pasa a
-- POR_DEVOLVER (disparador de §3). Sigue pidiendo venta.devolucion o su PIN. Mercado Pago devuelve
-- la orden completa: si parte del anticipo ya pagó una venta, el sobrante se devuelve EN EFECTIVO del
-- turno que lo devuelve (como uno en efectivo; referencia 'EN_EFECTIVO') y el pago sigue APROBADO.
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
  v_efectivo boolean := false;   -- 0225
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
  IF v_a.metodo_pago NOT IN ('EFECTIVO', 'PAGO_EN_LINEA') AND v_ref IS NULL THEN   -- 0225
    RAISE EXCEPTION 'DATOS_INVALIDOS: falta la referencia de la devolución con tarjeta o transferencia.' USING ERRCODE = '22023';
  END IF;
  -- 0225: en línea, Mercado Pago devuelve la orden completa; si una parte ya pagó una venta, el
  -- sobrante sale en efectivo del cajón.
  v_efectivo := v_a.metodo_pago = 'PAGO_EN_LINEA' AND EXISTS (
       SELECT 1 FROM anticipos_cita WHERE cita_id = v_a.cita_id AND metodo_pago = 'PAGO_EN_LINEA' AND estado = 'APLICADO');
  IF v_efectivo THEN v_ref := 'EN_EFECTIVO'; END IF;
  IF v_a.metodo_pago <> 'PAGO_EN_LINEA' OR p_turno_id IS NOT NULL OR v_efectivo THEN   -- 0225: en línea (por MP) no hace falta turno
    v_turno := _anticipo_turno(v_tenant, p_caja_id, p_turno_id);
  END IF;

  -- Molde de arquear_caja (0134): con autorización se consume; sin ella, solo quien tiene el permiso.
  IF p_autorizacion_pin_id IS NOT NULL THEN
    v_autorizo := consumir_autorizacion(p_autorizacion_pin_id, ARRAY['venta.devolucion'],
      p_anticipo, v_a.monto_mxn, NULL, false, v_tenant);
  ELSIF NOT usuario_actual_tiene_permiso('venta.devolucion') THEN
    RAISE EXCEPTION 'Devolver un anticipo requiere autorización (venta.devolucion).'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_a.metodo_pago = 'EFECTIVO' OR v_efectivo THEN   -- 0225
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

-- retener_anticipo: la de la 0222 (vigente). Cambios "0225" para PAGO_EN_LINEA: sin turno (si
-- viene, se valida y se anota); no se retiene el de una cita que la clienta canceló en línea (ese se
-- devuelve solo) ni uno cuyo pago ya se está devolviendo.
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
  IF v_a.metodo_pago = 'PAGO_EN_LINEA' THEN   -- 0225
    IF EXISTS (SELECT 1 FROM citas WHERE id = v_a.cita_id AND cancelada_por = 'CLIENTA_EN_LINEA')
       OR EXISTS (SELECT 1 FROM tienda_pagos WHERE id = _anticipo_pago_en_linea(v_a.cita_id)
                   AND estado IN ('POR_DEVOLVER', 'DEVOLUCION_FALLIDA', 'DEVUELTO')) THEN
      RAISE EXCEPTION 'DATOS_INVALIDOS: este anticipo en línea se le devuelve a la clienta; no se puede retener.' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF v_a.metodo_pago <> 'PAGO_EN_LINEA' OR p_turno_id IS NOT NULL THEN   -- 0225: en línea no hace falta turno
    v_turno := _anticipo_turno(v_tenant, p_caja_id, p_turno_id);
  END IF;
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

-- reporte_x: la de la 0222 (vigente). Cambios "0225": anticipos_en_linea_aplicados_mxn, lo que el
-- turno aplicó de anticipos pagados en línea (solo informa: ese dinero no entró a ningún turno); y
-- devueltos/retenidos no mezclan lo de Mercado Pago (sí el sobrante devuelto en efectivo).
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
         -- 0225: lo de Mercado Pago no es del turno; solo cuenta el sobrante en línea devuelto en efectivo.
         COALESCE(SUM(monto_mxn) FILTER (WHERE turno_resuelve_id = p_turno_id AND estado = 'DEVUELTO'
                                           AND (metodo_pago <> 'PAGO_EN_LINEA' OR referencia_devolucion = 'EN_EFECTIVO')), 0) AS devueltos,
         COALESCE(SUM(monto_mxn) FILTER (WHERE turno_resuelve_id = p_turno_id AND estado = 'RETENIDO'
                                           AND metodo_pago <> 'PAGO_EN_LINEA'), 0) AS retenidos,
         COALESCE(SUM(monto_mxn) FILTER (WHERE turno_resuelve_id = p_turno_id AND estado = 'APLICADO'
                                           AND metodo_pago = 'PAGO_EN_LINEA'), 0) AS en_linea_aplicados   -- 0225
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
    'anticipos_en_linea_aplicados_mxn', v_anticipos.en_linea_aplicados,   -- 0225
    'devoluciones', v_devoluciones,
    'movimientos_caja', COALESCE(v_movimientos, '[]'::jsonb),

    'efectivo_esperado_mxn', v_efectivo_esperado
  );

  RETURN v_resultado;
END;
$$;
COMMENT ON FUNCTION reporte_x IS 'Lectura intermedia del turno (no cierra ni modifica nada). Idempotente. Devuelve jsonb listo para impresión o UI. 0157: tickets.lealtad_mxn. 0208: sin CREDITO en pagos_por_metodo, con abonos; ventas_a_credito_mxn. 0209: sin SALDO_FAVOR; pagado_con_saldo_favor_mxn. 0222: sin ANTICIPO, con anticipos recibidos; pagado_con_anticipo_mxn y anticipos_recibidos/devueltos/retenidos_mxn. 0225: anticipos_en_linea_aplicados_mxn.';

-- ── §5 Sync ─────────────────────────────────────────────────────────────────
-- _vim_aplicar_citas_caja: la de la 0223 (vigente). Cambio "0225": copia cancelada_por (la caja
-- pone CAJA al cancelar; sin esto la nube la vería sin dueño).
CREATE OR REPLACE FUNCTION _vim_aplicar_citas_caja(p_tenant uuid, p_citas jsonb, p_servicios jsonb,
                                                   p_pendientes uuid[] DEFAULT '{}')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_c       jsonb;
  v_s       jsonb;
  v_cita    uuid;
  v_tramo   uuid;
  v_cli     uuid;
  v_dueno   uuid;
  v_estado  cita_estado;
  v_activa  boolean;
  v_paso    boolean;   -- 0223
  v_tk_nube uuid;      -- 0223
  v_choca   uuid[];
  v_revisar uuid[] := '{}';
  v_tocadas uuid[] := '{}';
  v_k       integer;
  v_nc      integer := 0;
  v_ns      integer := 0;
  v_errores jsonb := '[]'::jsonb;
  v_conflictos jsonb := '[]'::jsonb;   -- 0223
BEGIN
  IF jsonb_typeof(p_citas) IS DISTINCT FROM 'array' THEN p_citas := '[]'::jsonb; END IF;
  IF jsonb_typeof(p_servicios) IS DISTINCT FROM 'array' THEN p_servicios := '[]'::jsonb; END IF;

  -- Un tramo viaja siempre con su cita.
  FOR v_s IN SELECT s.value FROM jsonb_array_elements(p_servicios) s
              WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_citas) c WHERE c.value->>'id' = s.value->>'cita_id') LOOP
    v_errores := v_errores || jsonb_build_object('tabla', 'citas_servicios', 'id', v_s->>'id', 'error', 'llegó sin su cita');
  END LOOP;

  FOR v_c IN SELECT value FROM jsonb_array_elements(p_citas) ORDER BY value->>'created_at' LOOP
    BEGIN
      v_cita := (v_c->>'id')::uuid;
      IF (v_c->>'tenant_id')::uuid IS DISTINCT FROM p_tenant THEN
        RAISE EXCEPTION 'fila de otro negocio';
      END IF;
      v_dueno := NULL; v_estado := NULL; v_tk_nube := NULL;
      SELECT tenant_id, estado, ticket_id INTO v_dueno, v_estado, v_tk_nube FROM citas WHERE id = v_cita;
      IF v_dueno IS DISTINCT FROM p_tenant AND v_dueno IS NOT NULL THEN
        RAISE EXCEPTION 'el id ya existe en otro negocio';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = (v_c->>'sucursal_id')::uuid AND tenant_id = p_tenant) THEN
        RAISE EXCEPTION 'sucursal de otro negocio';
      END IF;
      v_cli := (v_c->>'cliente_id')::uuid;
      IF v_cli IS NOT NULL THEN
        v_cli := COALESCE((SELECT cliente_id FROM clientes_alias WHERE alias_id = v_cli AND tenant_id = p_tenant), v_cli);
        v_c := v_c || jsonb_build_object('cliente_id', v_cli);
        IF NOT EXISTS (SELECT 1 FROM clientes WHERE id = v_cli AND tenant_id = p_tenant) THEN
          RAISE EXCEPTION 'cliente de otro negocio';
        END IF;
      END IF;
      IF v_c->>'ticket_id' IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM tickets WHERE id = (v_c->>'ticket_id')::uuid AND tenant_id = p_tenant) THEN
        RAISE EXCEPTION 'venta de otro negocio o que aún no sube';
      END IF;
      IF v_c->>'created_by' IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM usuarios_acceso WHERE usuario_id = (v_c->>'created_by')::uuid AND tenant_id = p_tenant) THEN
        v_c := v_c || '{"created_by": null}'::jsonb;
      END IF;
      -- 0223: lo permitido sobre una cerrada (ver el encabezado).
      v_paso := v_estado = 'TERMINADA' AND v_c->>'estado' = 'COBRADA';
      IF v_estado = 'COBRADA' AND (v_c->>'estado' = 'TERMINADA'
           OR (v_c->>'estado' = 'COBRADA' AND (v_c->>'ticket_id')::uuid IS DISTINCT FROM v_tk_nube)) THEN
        v_paso := EXISTS (SELECT 1 FROM tickets WHERE id = v_tk_nube AND estado_fiscal = 'CANCELADO');
        IF NOT v_paso AND v_tk_nube = ANY(p_pendientes) THEN
          RAISE EXCEPTION 'la cancelación de la venta aún no sube';
        END IF;
      END IF;
      -- 0223: la caja la cobró en una venta ya pagada en la nube, pero la nube la tiene cobrada en
      -- otra venta viva, cancelada o «No llegó». No es copia vieja: o se reintenta (la cancelación
      -- de la otra venta viene en otro lote) o es un conflicto final (_cita_cobro_en_conflicto).
      IF NOT COALESCE(v_paso, false) AND v_c->>'estado' = 'COBRADA'
         AND (v_estado IN ('CANCELADA', 'NO_LLEGO')
              OR (v_estado = 'COBRADA' AND (v_c->>'ticket_id')::uuid IS DISTINCT FROM v_tk_nube))
         AND EXISTS (SELECT 1 FROM tickets WHERE id = (v_c->>'ticket_id')::uuid AND estado_fiscal IN ('PAGADO', 'FACTURADO')) THEN
        IF _cita_cobro_en_conflicto(v_cita, (v_c->>'ticket_id')::uuid) THEN
          v_conflictos := v_conflictos || jsonb_build_object('tabla', 'citas', 'id', v_cita,
            'nube', v_estado, 'caja', 'COBRADA', 'error', 'cita cobrada en dos ventas');
          CONTINUE;
        END IF;
        RAISE EXCEPTION 'la cita ya se cobró en otra venta que aún no se cancela en la nube';
      END IF;
      IF v_estado IN ('TERMINADA', 'NO_LLEGO', 'CANCELADA', 'COBRADA') AND NOT COALESCE(v_paso, false) THEN
        CONTINUE;   -- cerrada en la nube: la copia de la caja no la reabre
      END IF;

      -- Lo que chocaba con sus tramos viejos se vuelve a revisar al final: si la cita se movió o se
      -- canceló, la otra pierde la marca.
      v_revisar := v_revisar || _agenda_vecinos(p_tenant, v_cita);
      -- Primero fuera los tramos de la nube: cambiar el estado no debe reactivar unos que se van.
      DELETE FROM citas_servicios WHERE cita_id = v_cita;
      INSERT INTO citas AS c SELECT * FROM jsonb_populate_record(NULL::citas, v_c || '{"empalme": false}'::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          sucursal_id = EXCLUDED.sucursal_id, cliente_id = EXCLUDED.cliente_id,
          cliente_nombre = EXCLUDED.cliente_nombre, cliente_telefono = EXCLUDED.cliente_telefono,
          cliente_email = EXCLUDED.cliente_email, estado = EXCLUDED.estado, canal = EXCLUDED.canal,
          inicia = EXCLUDED.inicia, termina = EXCLUDED.termina, llego_at = EXCLUDED.llego_at,
          nota = EXCLUDED.nota, cancelada_motivo = EXCLUDED.cancelada_motivo, updated_at = EXCLUDED.updated_at,
          cancelada_por = EXCLUDED.cancelada_por,   -- 0225
          ticket_id = COALESCE(EXCLUDED.ticket_id, c.ticket_id)   -- 0223
        WHERE c.tenant_id = p_tenant;
      SELECT estado NOT IN ('CANCELADA', 'NO_LLEGO', 'EN_ESPERA') INTO v_activa FROM citas WHERE id = v_cita;

      v_k := 0;
      FOR v_s IN SELECT value FROM jsonb_array_elements(p_servicios)
                  WHERE value->>'cita_id' = v_cita::text ORDER BY (value->>'orden')::integer LOOP
        v_tramo := (v_s->>'id')::uuid;
        IF (v_s->>'tenant_id')::uuid IS DISTINCT FROM p_tenant THEN
          RAISE EXCEPTION 'tramo %: fila de otro negocio', v_tramo;
        END IF;
        IF EXISTS (SELECT 1 FROM citas_servicios WHERE id = v_tramo AND tenant_id <> p_tenant) THEN
          RAISE EXCEPTION 'tramo %: el id ya existe en otro negocio', v_tramo;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM productos WHERE id = (v_s->>'producto_id')::uuid AND tenant_id = p_tenant) THEN
          RAISE EXCEPTION 'tramo %: producto de otro negocio', v_tramo;
        END IF;
        IF v_s->>'usuario_id' IS NOT NULL AND NOT EXISTS (
             SELECT 1 FROM usuarios_acceso WHERE usuario_id = (v_s->>'usuario_id')::uuid AND tenant_id = p_tenant) THEN
          RAISE EXCEPTION 'tramo %: colaborador de otro negocio', v_tramo;
        END IF;
        IF v_s->>'espacio_id' IS NOT NULL AND NOT EXISTS (
             SELECT 1 FROM espacios WHERE id = (v_s->>'espacio_id')::uuid AND tenant_id = p_tenant) THEN
          RAISE EXCEPTION 'tramo %: espacio de otro negocio', v_tramo;
        END IF;
        v_choca := CASE WHEN v_activa THEN _agenda_choques(p_tenant, v_cita, (v_s->>'usuario_id')::uuid, (v_s->>'espacio_id')::uuid,
                                                           (v_s->>'inicia')::timestamptz, (v_s->>'termina')::timestamptz) END;
        IF v_choca IS NOT NULL THEN
          UPDATE citas_servicios SET empalme = true WHERE id = ANY(v_choca) AND NOT empalme;
          v_revisar := v_revisar || v_choca;
        END IF;
        INSERT INTO citas_servicios
          SELECT * FROM jsonb_populate_record(NULL::citas_servicios, v_s || jsonb_build_object('empalme', v_choca IS NOT NULL));
        v_revisar := v_revisar || v_tramo;
        v_k := v_k + 1;
      END LOOP;
      v_tocadas := v_tocadas || v_cita;
      v_nc := v_nc + 1;
      v_ns := v_ns + v_k;
    EXCEPTION WHEN OTHERS THEN
      v_errores := v_errores || jsonb_build_object('tabla', 'citas', 'id', v_c->>'id', 'error', SQLERRM);
    END;
  END LOOP;

  -- La marca, recalculada sobre lo tocado ya con todo el envío aplicado.
  PERFORM _agenda_remarcar(p_tenant, v_revisar, v_tocadas);

  RETURN jsonb_build_object('citas', v_nc, 'citas_servicios', v_ns, 'errores', v_errores, 'conflictos', v_conflictos);
END;
$fn$;
REVOKE ALL ON FUNCTION _vim_aplicar_citas_caja(uuid, jsonb, jsonb, uuid[]) FROM PUBLIC, anon, authenticated;

-- _vim_aplicar_anticipos_caja: la de la 0223 (vigente). Cambios "0225" para PAGO_EN_LINEA: no
-- tiene caja ni turno; la caja no le cambia el método; y la caja no lo crea, salvo la parte que nace
-- de partirlo al cobrar (pagar_con_anticipo), mientras lo de la cita no pase de lo cobrado en línea.
CREATE OR REPLACE FUNCTION _vim_aplicar_anticipos_caja(p_tenant uuid, p_filas jsonb, p_pendientes uuid[] DEFAULT '{}')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_f       jsonb;
  v_id      uuid;
  v_ref     text;
  v_nube    anticipos_cita%ROWTYPE;
  v_tk_cita uuid;
  v_n       integer := 0;
  v_errores jsonb := '[]'::jsonb;
  v_conflictos jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_filas) IS DISTINCT FROM 'array' THEN
    RETURN jsonb_build_object('aplicados', 0, 'errores', '[]'::jsonb, 'conflictos', '[]'::jsonb);
  END IF;
  FOR v_f IN SELECT value FROM jsonb_array_elements(p_filas) ORDER BY value->>'created_at', value->>'id' LOOP
    BEGIN
      v_id := (v_f->>'id')::uuid;
      IF (v_f->>'tenant_id')::uuid IS DISTINCT FROM p_tenant THEN
        RAISE EXCEPTION 'fila de otro negocio';
      END IF;
      -- Candado de la cita primero (orden cita → anticipo, 0222); de paso valida que sea del negocio.
      SELECT ticket_id INTO v_tk_cita FROM citas WHERE id = (v_f->>'cita_id')::uuid AND tenant_id = p_tenant FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'cita de otro negocio o que aún no sube'; END IF;
      FOREACH v_ref IN ARRAY ARRAY['turno_id', 'turno_resuelve_id'] LOOP
        IF v_f->>v_ref IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM turnos WHERE id = (v_f->>v_ref)::uuid AND tenant_id = p_tenant) THEN
          RAISE EXCEPTION 'turno de otro negocio o que aún no sube';
        END IF;
      END LOOP;
      -- El turno que lo recibe es de su caja y su sucursal. 0225: el de línea no tiene ni caja ni turno.
      IF v_f->>'metodo_pago' IS DISTINCT FROM 'PAGO_EN_LINEA' THEN
        IF NOT EXISTS (SELECT 1 FROM turnos WHERE id = (v_f->>'turno_id')::uuid
                          AND caja_id = (v_f->>'caja_id')::uuid AND sucursal_id = (v_f->>'sucursal_id')::uuid) THEN
          RAISE EXCEPTION 'el turno no es de la caja y sucursal del anticipo';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM cajas WHERE id = (v_f->>'caja_id')::uuid AND tenant_id = p_tenant) THEN
          RAISE EXCEPTION 'caja de otro negocio';
        END IF;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = (v_f->>'sucursal_id')::uuid AND tenant_id = p_tenant) THEN
        RAISE EXCEPTION 'sucursal de otro negocio';
      END IF;
      IF v_f->>'ticket_id' IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM tickets WHERE id = (v_f->>'ticket_id')::uuid AND tenant_id = p_tenant) THEN
        RAISE EXCEPTION 'venta de otro negocio o que aún no sube';
      END IF;
      IF v_f->>'ticket_id' IS NOT NULL AND (v_f->>'ticket_id')::uuid IS DISTINCT FROM v_tk_cita THEN
        -- La cita quedó en conflicto final (ver §1): el anticipo también, o se reintentaría siempre.
        IF _cita_cobro_en_conflicto((v_f->>'cita_id')::uuid, (v_f->>'ticket_id')::uuid) THEN
          v_conflictos := v_conflictos || jsonb_build_object('tabla', 'anticipos_cita', 'id', v_id,
            'nube', (SELECT estado FROM anticipos_cita WHERE id = v_id), 'caja', v_f->>'estado',
            'error', 'la cita se cobró en dos ventas');
          CONTINUE;
        END IF;
        RAISE EXCEPTION 'la venta no es la de la cita (o el cambio de la cita aún no sube)';
      END IF;
      IF v_f->>'usuario_id' IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM usuarios_acceso WHERE usuario_id = (v_f->>'usuario_id')::uuid AND tenant_id = p_tenant) THEN
        v_f := v_f || '{"usuario_id": null}'::jsonb;
      END IF;

      v_nube := NULL;
      SELECT * INTO v_nube FROM anticipos_cita WHERE id = v_id FOR UPDATE;
      IF FOUND AND v_nube.tenant_id <> p_tenant THEN
        RAISE EXCEPTION 'el id ya existe en otro negocio';
      END IF;
      IF FOUND AND v_nube.cita_id IS DISTINCT FROM (v_f->>'cita_id')::uuid THEN
        RAISE EXCEPTION 'el anticipo es de otra cita';
      END IF;
      -- 0225: el anticipo en línea nace en la nube (tienda_pago_aplicar). La caja no le cambia el
      -- método ni lo crea; solo sube la parte que nace de partirlo al cobrar, dentro de lo cobrado.
      IF v_nube.id IS NOT NULL
         AND (v_nube.metodo_pago = 'PAGO_EN_LINEA') IS DISTINCT FROM (v_f->>'metodo_pago' = 'PAGO_EN_LINEA') THEN
        RAISE EXCEPTION 'un anticipo en línea no cambia de método';
      END IF;
      IF v_f->>'metodo_pago' = 'PAGO_EN_LINEA' THEN
        IF v_nube.id IS NULL AND (v_f->>'monto_mxn')::numeric
             + (SELECT COALESCE(sum(monto_mxn), 0) FROM anticipos_cita
                 WHERE cita_id = (v_f->>'cita_id')::uuid AND metodo_pago = 'PAGO_EN_LINEA')
             > COALESCE((SELECT monto_mxn FROM tienda_pagos
                          WHERE id = _anticipo_pago_en_linea((v_f->>'cita_id')::uuid)), 0) THEN
          RAISE EXCEPTION 'la caja no crea anticipos en línea';
        END IF;
        v_f := v_f || jsonb_build_object('tienda_pago_id', _anticipo_pago_en_linea((v_f->>'cita_id')::uuid));
      END IF;
      -- Resuelto en la nube: ver la precedencia en el encabezado.
      IF FOUND AND v_nube.estado <> 'VIGENTE'
         AND NOT (v_nube.estado = 'APLICADO'
                  AND (EXISTS (SELECT 1 FROM tickets WHERE id = v_nube.ticket_id AND estado_fiscal = 'CANCELADO')
                       OR EXISTS (SELECT 1 FROM devoluciones WHERE ticket_original_id = v_nube.ticket_id
                                     AND estado = 'CONFIRMADA' AND deleted_at IS NULL))) THEN
        IF v_nube.estado = 'APLICADO' AND v_nube.ticket_id = ANY(p_pendientes) THEN
          RAISE EXCEPTION 'la cancelación de la venta aún no sube';
        END IF;
        IF v_f->>'estado' = 'VIGENTE' THEN
          CONTINUE;   -- copia vieja: la nube conserva la suya y el pull se la baja a la caja
        END IF;
        IF v_f->>'estado' IS DISTINCT FROM v_nube.estado
           OR (v_f->>'ticket_id')::uuid IS DISTINCT FROM v_nube.ticket_id
           OR (SELECT caja_id FROM turnos WHERE id = (v_f->>'turno_resuelve_id')::uuid)
              IS DISTINCT FROM (SELECT caja_id FROM turnos WHERE id = v_nube.turno_resuelve_id) THEN
          v_conflictos := v_conflictos || jsonb_build_object('tabla', 'anticipos_cita', 'id', v_id,
            'nube', v_nube.estado, 'caja', v_f->>'estado', 'error', 'anticipo resuelto dos veces');
          CONTINUE;
        END IF;
      END IF;

      INSERT INTO anticipos_cita AS a SELECT * FROM jsonb_populate_record(NULL::anticipos_cita, v_f)
        ON CONFLICT (id) DO UPDATE SET
          metodo_pago = EXCLUDED.metodo_pago, monto_mxn = EXCLUDED.monto_mxn, estado = EXCLUDED.estado,
          ticket_id = EXCLUDED.ticket_id, turno_resuelve_id = EXCLUDED.turno_resuelve_id,
          referencia_devolucion = EXCLUDED.referencia_devolucion, resuelto_at = EXCLUDED.resuelto_at
        WHERE a.tenant_id = p_tenant;
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errores := v_errores || jsonb_build_object('tabla', 'anticipos_cita', 'id', v_f->>'id', 'error', SQLERRM);
    END;
  END LOOP;
  RETURN jsonb_build_object('aplicados', v_n, 'errores', v_errores, 'conflictos', v_conflictos);
END;
$fn$;
REVOKE ALL ON FUNCTION _vim_aplicar_anticipos_caja(uuid, jsonb, uuid[]) FROM PUBLIC, anon, authenticated;

-- ── §6 Reservar y vencer ────────────────────────────────────────────────────
-- El pago de la cita para cobrar ahora: {pago_id, total_a_pagar_mxn}, o {} si no hay.
--   · La cita espera su pago (AGENDADA con pago_hasta vivo): su pago CREADO; si no tiene (el
--     anterior fue un NO seguro, venció o se dejó el reto), nace otro por el anticipo, a la cuenta
--     que cobra en su sucursal, con vence_at = pago_hasta y la clave de freno de quien paga.
--     Máximo 5 intentos por cita (LIMITE_INTENTOS); con el freno por riesgo puesto, PAGO_EN_PAUSA.
--   · Ya pagada: su pago APROBADO (el reintento lo ve cobrado). Cancelada o sin anticipo: {}.
-- p_freno: tienda_pagos.freno_clave (0178), el HMAC de negocio + teléfono + IP que calcula la
-- función `tienda` (claveDeFreno); NULL = sin IP conocida, no frena.
DROP FUNCTION IF EXISTS _agenda_cita_pago(uuid, uuid);
CREATE OR REPLACE FUNCTION _agenda_cita_pago(p_tenant uuid, p_cita uuid, p_freno text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_c     citas%ROWTYPE;
  v_g     tienda_pagos%ROWTYPE;
  v_cx    uuid;
  v_monto numeric(12,2);
  v_hasta timestamptz;
BEGIN
  SELECT * INTO v_c FROM citas WHERE id = p_cita AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN '{}'::jsonb; END IF;
  SELECT * INTO v_g FROM tienda_pagos WHERE cita_id = p_cita AND NOT extra AND estado IN ('CREADO', 'APROBADO');
  IF v_g.id IS NULL AND v_c.estado = 'AGENDADA' AND v_c.pago_hasta > now() THEN
    IF (SELECT count(*) FROM tienda_pagos WHERE cita_id = p_cita AND NOT extra) >= 5 THEN
      RAISE EXCEPTION 'LIMITE_INTENTOS: Demasiados intentos de pago. Comunícate con el negocio.' USING ERRCODE = '22023';
    END IF;
    v_hasta := tienda_pago_frenado(p_freno);
    IF v_hasta IS NOT NULL THEN
      RAISE EXCEPTION 'PAGO_EN_PAUSA: %', v_hasta USING ERRCODE = '22023';
    END IF;
    v_cx := tienda_conexion_cobro(p_tenant, v_c.sucursal_id);
    v_monto := _anticipo_cita(p_tenant, p_cita);
    IF v_cx IS NOT NULL AND v_monto > 0 THEN
      INSERT INTO tienda_pagos (tenant_id, cita_id, conexion_id, monto_mxn, vence_at, freno_clave)
      VALUES (p_tenant, p_cita, v_cx, v_monto, v_c.pago_hasta, p_freno)
      RETURNING * INTO v_g;
    END IF;
  END IF;
  IF v_g.id IS NULL THEN RETURN '{}'::jsonb; END IF;
  RETURN jsonb_build_object('pago_id', v_g.id, 'total_a_pagar_mxn', to_char(v_g.monto_mxn, 'FM999999990.00'));
END;
$$;
REVOKE ALL ON FUNCTION _agenda_cita_pago(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;

-- agenda_reservar_en_linea: la de la 0224 (vigente). Cambio "0225": con anticipo, la respuesta
-- trae el pago para cobrarlo (pago_id, total_a_pagar_mxn), también al reintentar con la clave; y
-- `p.freno_clave` (opcional) va al pago para el freno por riesgo (0178).
CREATE OR REPLACE FUNCTION agenda_reservar_en_linea(p_tenant uuid, p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_uuid     CONSTANT text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_clave    text;
  v_suc      uuid;
  v_inicia   timestamptz;
  v_nombre   text;
  v_tel      text;
  v_email    text;
  v_id       uuid;
  v_cli      uuid;
  v_cadena   jsonb;
  v_codigo   text;
  v_termina  timestamptz;
  v_anticipo numeric(12,2);
  v_freno    text := NULLIF(p->>'freno_clave', '');   -- 0225
BEGIN
  -- La forma antes de cualquier cast: lo que llega mal es DATOS_INVALIDOS, no un error crudo.
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR jsonb_typeof(p->'cliente') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: faltan los datos de la reserva.' USING ERRCODE = '22023';
  END IF;
  v_clave := p->>'clave';
  IF v_clave IS NULL OR v_clave !~ '^[A-Za-z0-9_-]{8,64}$' THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: falta la clave de la reserva.' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p->>'sucursal_id', '') !~* v_uuid THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la sucursal no es válida.' USING ERRCODE = '22023';
  END IF;
  v_suc := (p->>'sucursal_id')::uuid;
  IF p->>'inicia' IS NULL THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: falta la hora de la cita.' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_inicia := (p->>'inicia')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la hora de la cita no es válida.' USING ERRCODE = '22023';
  END;
  v_nombre := NULLIF(btrim(p->'cliente'->>'nombre'), '');
  v_tel    := _telefono_10(p->'cliente'->>'telefono');
  v_email  := lower(NULLIF(btrim(p->'cliente'->>'email'), ''));
  -- 0225: la clave del freno por riesgo (HMAC de la función tienda), opcional.
  IF v_freno IS NOT NULL AND v_freno !~ '^[A-Za-z0-9_-]{40,64}$' THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: la clave de freno no es válida.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('cita_web:' || p_tenant || ':' || v_clave, 0));
  SELECT id INTO v_id FROM citas WHERE tenant_id = p_tenant AND client_id_local = 'web:' || v_clave;
  IF FOUND THEN
    RETURN jsonb_build_object('cita_id', v_id, 'codigo', NULL, 'anticipo_mxn', _anticipo_cita(p_tenant, v_id),
                              'resumen', _agenda_cita_resumen(v_id))
           || _agenda_cita_pago(p_tenant, v_id, v_freno);   -- 0225
  END IF;

  PERFORM _reservas_validar(p_tenant, v_suc, p->'servicios', v_inicia);
  IF v_nombre IS NULL OR char_length(v_nombre) > 150 THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: escribe tu nombre.' USING ERRCODE = '22023';
  END IF;
  IF v_tel !~ '^[0-9]{10}$' THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: el celular debe tener 10 dígitos.' USING ERRCODE = '22023';
  END IF;
  IF v_email IS NULL OR char_length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: escribe un correo válido.' USING ERRCODE = '22023';
  END IF;

  -- Un celular aparta a lo más 3 citas por llegar en el negocio. El candado por celular también
  -- ordena a dos reservas simultáneas del mismo número (el tope y el alta de la clienta).
  PERFORM pg_advisory_xact_lock(hashtextextended('cita_tel:' || p_tenant || ':' || v_tel, 0));
  IF (SELECT count(*) FROM citas c
       WHERE c.tenant_id = p_tenant AND c.estado = 'AGENDADA' AND c.inicia > now()
         AND _telefono_10(c.cliente_telefono) = v_tel) >= 3 THEN
    RAISE EXCEPTION 'LIMITE_RESERVAS: Ya tienes 3 citas apartadas; para más, comunícate con el negocio.' USING ERRCODE = '22023';
  END IF;

  v_cadena := _agenda_cadena(p_tenant, v_suc, v_inicia, p->'servicios');
  IF v_cadena IS NULL THEN
    RAISE EXCEPTION 'HUECO_OCUPADO: Ese horario ya no está disponible' USING ERRCODE = '23P01';
  END IF;

  -- La clienta: por celular (a 10 dígitos), o se crea. Una existente no se edita desde el sitio: la
  -- cita guarda lo que escribió. Si la caja la da de alta en el mismo instante (23505), se vuelve a
  -- buscar. A una bloqueada no se le dice por qué.
  FOR i IN 1..2 LOOP
    SELECT c.id INTO v_cli FROM clientes c
     WHERE c.tenant_id = p_tenant AND c.deleted_at IS NULL AND c.telefono IS NOT NULL
       AND _telefono_10(c.telefono) = v_tel
     ORDER BY c.created_at, c.id LIMIT 1;
    EXIT WHEN v_cli IS NOT NULL;
    BEGIN
      INSERT INTO clientes (tenant_id, nombre, telefono, email)
      VALUES (p_tenant, v_nombre, v_tel, v_email)
      RETURNING id INTO v_cli;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF i = 2 THEN RAISE; END IF;
    END;
  END LOOP;
  IF (SELECT estado = 'BLOQUEADO' FROM clientes WHERE id = v_cli) THEN
    RAISE EXCEPTION 'DATOS_INVALIDOS: No pudimos apartar tu cita. Comunícate con el negocio.' USING ERRCODE = '22023';
  END IF;

  v_codigo := rtrim(translate(encode(gen_random_bytes(16), 'base64'), '+/', '-_'), '=');
  INSERT INTO citas (tenant_id, sucursal_id, cliente_id, cliente_nombre, cliente_telefono, cliente_email,
                     estado, canal, inicia, termina, nota, client_id_local, enlace_hash, reservo_email)
  VALUES (p_tenant, v_suc, v_cli, v_nombre, v_tel, v_email,
          'AGENDADA', 'EN_LINEA', v_inicia, v_inicia + interval '1 minute',
          left(NULLIF(btrim(p->>'nota'), ''), 300), 'web:' || v_clave,
          encode(sha256(convert_to(v_codigo, 'UTF8')), 'hex'), v_email)
  RETURNING id INTO v_id;
  BEGIN
    v_termina := _agenda_tramos(p_tenant, v_id, v_suc, v_inicia, v_cadena);
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'HUECO_OCUPADO: Ese horario ya no está disponible' USING ERRCODE = '23P01';
  END;
  UPDATE citas SET termina = v_termina WHERE id = v_id;

  -- Con anticipo, el lugar se aparta 15 minutos mientras se paga; sin cobro en línea no se reserva.
  v_anticipo := _anticipo_cita(p_tenant, v_id);
  IF v_anticipo > 0 THEN
    IF tienda_conexion_cobro(p_tenant, v_suc) IS NULL THEN
      RAISE EXCEPTION 'PAGO_NO_DISPONIBLE: Este negocio no puede cobrar el anticipo en línea por ahora' USING ERRCODE = '22023';
    END IF;
    UPDATE citas SET pago_hasta = now() + interval '15 minutes' WHERE id = v_id;
  END IF;

  RETURN jsonb_build_object('cita_id', v_id, 'codigo', v_codigo, 'anticipo_mxn', v_anticipo,
                            'resumen', _agenda_cita_resumen(v_id))
         || _agenda_cita_pago(p_tenant, v_id, v_freno);   -- 0225
END;
$$;

-- agenda_vencer_reservas: la de la 0224 (vigente). Cambio "0225": una cita con un cobro en curso
-- (pago CREADO) no se vence aquí: la resuelve el barrido con el plazo de ese pago.
CREATE OR REPLACE FUNCTION agenda_vencer_reservas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r   record;
  v_n integer := 0;
BEGIN
  FOR r IN SELECT c.id FROM citas c
            WHERE c.pago_hasta < now() AND c.estado = 'AGENDADA'
              AND NOT EXISTS (SELECT 1 FROM anticipos_cita a WHERE a.cita_id = c.id AND a.estado IN ('VIGENTE', 'APLICADO'))
              AND NOT EXISTS (SELECT 1 FROM tienda_pagos g WHERE g.cita_id = c.id AND NOT g.extra AND g.estado = 'CREADO')
            FOR UPDATE SKIP LOCKED LOOP
    IF _agenda_cancelar_sin_pago(r.id) THEN v_n := v_n + 1; END IF;
  END LOOP;
  RETURN v_n;
END;
$$;
