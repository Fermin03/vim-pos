-- ============================================================================
-- 0087 — `aplicar_promocion()`: la función que la 0008 dio por escrita.
--
-- EL HUECO
--
-- La 0008 dejó montado casi todo el carril de promociones: la tabla
-- `ticket_promociones_aplicadas` con su snapshot defensivo, el trigger que
-- recalcula los totales del ticket al insertar, el trigger que lleva la cuenta
-- de usos, y `evaluar_promociones_aplicables()` para saber cuáles vienen a
-- cuento. Hasta el comentario de esa función dice cómo se cierra el círculo:
--
--     «La app evalúa horarios, días de semana y cupones en JS y llama
--      aplicar_promocion() para confirmar.»
--
-- `aplicar_promocion()` NUNCA SE ESCRIBIÓ. Solo existe en ese comentario. Por
-- eso el panel deja registrar promociones y la caja no las conoce: no faltaba
-- la pantalla, faltaba el último eslabón de la base.
--
-- POR QUÉ NO SE REUSÓ `aplicar_descuento_manual`
--
-- Era la tentación obvia —los cuatro tipos que el panel sabe crear calzan casi
-- uno a uno con los del descuento manual— y habría sido un error, por dos
-- motivos que solo se ven mirando los reportes:
--
--   1. Ensuciaría la auditoría. «Descuentos por usuario» existe para detectar
--      abusos: un cajero que regala comida. Si cada 2x1 del martes entrara por
--      ahí, el reporte se llenaría de ruido legítimo y dejaría de servir para
--      lo único que sirve. La cuenta de un restaurante distingue lo que la casa
--      decidió promocionar de lo que un empleado descontó por su cuenta, y la
--      base ya tiene las dos columnas separadas: `promociones_mxn` y
--      `descuentos_manuales_mxn`.
--
--   2. Pediría PIN. `aplicar_descuento_manual` exige `autorizacion_pin_id`
--      porque un descuento a mano necesita que alguien lo autorice. Una
--      promoción ya viene autorizada: la registró el dueño en el panel. Pedir
--      la firma del gerente en cada ticket del martes convierte la promoción en
--      un estorbo, y a la tercera hora pico deja de usarse. La propia 0008 lo
--      dejó dicho en el comentario de la tabla: «NO requieren PIN».
--
-- LA BASE DE CÁLCULO, QUE ES LO ÚNICO DELICADO
--
-- Se usa el `total_mxn` VIGENTE del ticket: lo que el cliente debe en este
-- momento. Dos consecuencias buscadas:
--
--   · Dos promociones sobre el mismo ticket se aplican en cascada (la segunda
--     sobre el total ya rebajado), nunca sumando porcentajes sobre el bruto.
--     Así el total no puede irse por debajo de cero por acumulación, que es el
--     modo en que este tipo de cálculo se rompe de verdad.
--   · El monto queda congelado en el renglón. Si después se agrega un producto,
--     el recálculo del ticket NO reevalúa la promoción — el descuento sigue
--     siendo el que se pactó al aplicarla. Eso es deliberado: un descuento que
--     se mueve solo mientras el cajero teclea es imposible de explicarle al
--     cliente que está mirando la pantalla.
--
-- ALCANCE DE ESTA MIGRACIÓN
--
-- Solo `TICKET_COMPLETO`, que es lo único que el panel sabe crear hoy (ver
-- `apps/admin/app/lib/promociones.ts`: `alcance: "TICKET_COMPLETO"` fijo). Los
-- alcances por producto y por categoría se rechazan con un error explícito en
-- vez de aplicarse mal: una promoción que descuenta de más es peor que una que
-- no se deja aplicar.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- aplicar_promocion
--
-- Sin SECURITY DEFINER, igual que `aplicar_descuento_manual`: corre como quien
-- llama y bajo RLS, así que la caja solo puede tocar tickets de su tenant.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aplicar_promocion(
  p_ticket_id       uuid,
  p_promocion_id    uuid,
  p_client_id_local varchar DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id   uuid;
  v_estado      ticket_estado_fiscal;
  v_cliente_id  uuid;
  v_total       numeric(12,2);
  v_promo       record;
  v_monto       numeric(12,2);
  v_id          uuid;
BEGIN
  SELECT tenant_id, estado_fiscal, cliente_id, total_mxn
    INTO v_tenant_id, v_estado, v_cliente_id, v_total
    FROM tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket % no existe', p_ticket_id;
  END IF;

  -- Idempotencia por client_id_local, igual que el resto de operaciones de caja:
  -- si el envío se repite (reintento de red, sync), devuelve la misma fila en vez
  -- de descontar dos veces.
  IF p_client_id_local IS NOT NULL THEN
    SELECT id INTO v_id FROM ticket_promociones_aplicadas
     WHERE tenant_id = v_tenant_id AND client_id_local = p_client_id_local;
    IF FOUND THEN RETURN v_id; END IF;
  END IF;

  /* Un ticket cobrado ya no se toca. Sin esta guarda se le podría aplicar una
     promoción a una venta cerrada: el total cambiaría por debajo de un ticket ya
     impreso y ya cuadrado en el corte. */
  IF v_estado NOT IN ('BORRADOR', 'ABIERTO') THEN
    RAISE EXCEPTION 'El ticket ya está %; no se le pueden aplicar promociones', v_estado
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_promo FROM promociones
   WHERE id = p_promocion_id AND tenant_id = v_tenant_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La promoción no existe o no es de este negocio'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Se revalida en la base lo que la app ya filtró. No es desconfianza del
  -- cliente: entre que la caja pinta la lista y el cajero toca el botón pueden
  -- pasar minutos, y una promoción que venció o se pausó en ese hueco no debe
  -- entrar.
  IF v_promo.estado <> 'ACTIVA' THEN
    RAISE EXCEPTION 'La promoción "%" no está activa', v_promo.nombre
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_promo.fecha_inicio > now() OR (v_promo.fecha_fin IS NOT NULL AND v_promo.fecha_fin < now()) THEN
    RAISE EXCEPTION 'La promoción "%" no está vigente', v_promo.nombre
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_promo.max_usos_total IS NOT NULL AND v_promo.usos_actuales >= v_promo.max_usos_total THEN
    RAISE EXCEPTION 'La promoción "%" agotó sus usos', v_promo.nombre
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_promo.requiere_cliente_identificado AND v_cliente_id IS NULL THEN
    RAISE EXCEPTION 'La promoción "%" pide identificar al cliente', v_promo.nombre
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_promo.alcance <> 'TICKET_COMPLETO' THEN
    RAISE EXCEPTION 'Todavía no se aplican promociones de alcance % desde la caja', v_promo.alcance
      USING ERRCODE = 'feature_not_supported';
  END IF;

  /* La misma promoción, dos veces en un ticket, es siempre un doble clic o un
     reintento — nunca una intención. Se corta antes de descontar. */
  IF EXISTS (
    SELECT 1 FROM ticket_promociones_aplicadas
     WHERE ticket_id = p_ticket_id AND promocion_id = p_promocion_id
       AND cancelada_por_cajero = false
  ) THEN
    RAISE EXCEPTION 'La promoción "%" ya está aplicada a este ticket', v_promo.nombre
      USING ERRCODE = 'unique_violation';
  END IF;

  -- Monto, siempre sobre el total vigente y siempre acotado a él.
  v_monto := CASE v_promo.tipo
    WHEN 'PORCENTAJE'      THEN ROUND(v_total * LEAST(v_promo.valor_porcentaje, 100) / 100, 2)
    WHEN 'MONTO_FIJO'      THEN LEAST(v_promo.valor_monto_mxn, v_total)
    WHEN 'CORTESIA_TOTAL'  THEN v_total
    WHEN 'PRECIO_ESPECIAL' THEN GREATEST(v_total - v_promo.precio_especial_mxn, 0)
    ELSE NULL
  END;

  IF v_monto IS NULL THEN
    RAISE EXCEPTION 'El tipo de promoción % todavía no se aplica desde la caja', v_promo.tipo
      USING ERRCODE = 'feature_not_supported';
  END IF;

  -- Un ticket sin nada cobrable (o una promo que no descuenta) no se registra:
  -- dejaría un renglón de $0 en el ticket del cliente y en los reportes.
  IF v_monto <= 0 THEN
    RAISE EXCEPTION 'La promoción "%" no descuenta nada sobre este ticket', v_promo.nombre
      USING ERRCODE = 'check_violation';
  END IF;

  /* El insert dispara los dos triggers de la 0008: `trg_promo_apl_recalc`
     recalcula los totales del ticket y `trg_promo_apl_uso` incrementa
     `usos_actuales`. Por eso aquí no se toca `tickets` ni `promociones` a mano:
     hacerlo duplicaría el efecto. */
  INSERT INTO ticket_promociones_aplicadas (
    tenant_id, ticket_id, promocion_id,
    promocion_nombre_snapshot, promocion_tipo_snapshot, promocion_alcance_snapshot,
    valor_porcentaje_snapshot, valor_monto_snapshot, precio_especial_snapshot,
    monto_descontado_mxn, items_afectados,
    cumple_condiciones_snapshot, cliente_id, client_id_local
  ) VALUES (
    v_tenant_id, p_ticket_id, p_promocion_id,
    v_promo.nombre, v_promo.tipo, v_promo.alcance,
    v_promo.valor_porcentaje, v_promo.valor_monto_mxn, v_promo.precio_especial_mxn,
    v_monto, '{}',
    jsonb_build_object(
      'total_base_mxn', v_total,
      'aplicada_desde', 'caja',
      'evaluada_at', now()
    ),
    v_cliente_id, p_client_id_local
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION aplicar_promocion IS
  'Aplica una promoción de alcance TICKET_COMPLETO al ticket y devuelve el id de la aplicación. Revalida vigencia, usos y estado. NO pide PIN (la promoción ya viene autorizada desde el panel). El descuento se congela al aplicarse. Prometida por el comentario de evaluar_promociones_aplicables en la 0008 y escrita hasta la 0087.';

-- ---------------------------------------------------------------------------
-- cancelar_promocion_ticket
--
-- El caso real: el cliente la rechaza («no, hoy no quiero el 2x1, guárdamelo»),
-- o el cajero se equivoca de promoción.
--
-- NO borra la fila: la marca cancelada. El trigger de usos ya contempla esa
-- transición y devuelve el uso a la promoción. Borrarla dejaría un ticket cuyo
-- total cambió sin que nada explique por qué, que es justo lo que un corte de
-- caja no perdona.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cancelar_promocion_ticket(
  p_aplicacion_id uuid,
  p_motivo        text,
  p_usuario_id    uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_estado ticket_estado_fiscal;
BEGIN
  IF COALESCE(btrim(p_motivo), '') = '' THEN
    -- El CHECK de la tabla ya lo exige; se avisa aquí con un mensaje legible.
    RAISE EXCEPTION 'Indica por qué se quita la promoción'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT t.estado_fiscal INTO v_estado
    FROM ticket_promociones_aplicadas a
    JOIN tickets t ON t.id = a.ticket_id
   WHERE a.id = p_aplicacion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa promoción aplicada no existe';
  END IF;
  IF v_estado NOT IN ('BORRADOR', 'ABIERTO') THEN
    RAISE EXCEPTION 'El ticket ya está %; la promoción ya no se puede quitar', v_estado
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE ticket_promociones_aplicadas
     SET cancelada_por_cajero  = true,
         motivo_cancelacion    = btrim(p_motivo),
         usuario_que_cancelo_id = p_usuario_id,
         cancelada_at          = now()
   WHERE id = p_aplicacion_id
     AND cancelada_por_cajero = false;
END;
$$;

COMMENT ON FUNCTION cancelar_promocion_ticket IS
  'Quita una promoción de un ticket abierto marcándola cancelada (no la borra). Los triggers de la 0008 devuelven el uso y recalculan el total.';

-- ---------------------------------------------------------------------------
-- Permisos: los mismos que el resto de operaciones de caja.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION aplicar_promocion(uuid, uuid, varchar) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aplicar_promocion(uuid, uuid, varchar) TO authenticated, service_role;

REVOKE ALL ON FUNCTION cancelar_promocion_ticket(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cancelar_promocion_ticket(uuid, text, uuid) TO authenticated, service_role;
