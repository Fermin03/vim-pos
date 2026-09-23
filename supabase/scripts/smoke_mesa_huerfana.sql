-- Smoke: una asignación de mesa HUÉRFANA (tickets_mesas sin liberar cuyo ticket ya es terminal)
-- no puede dejar la mesa inservible.
--
-- Es el estado en que quedaron las tres mesas de Knock-Out: lo dejó el bug de modo réplica que
-- arregló la 0104 (cancelar marcaba el ticket pero no soltaba la mesa). La 0104 impidió que
-- volviera a pasar, pero no reparó lo ya roto, y el daño tiene DOS caras según cómo quedara
-- `mesas.estado`:
--
--   A) mesa OCUPADA + asignación huérfana → la pantalla la deja entrar (hay ticket activo), pero
--      cancelar responde "Ticket ya está CANCELADO" y no hay ninguna otra salida. Callejón.
--   B) mesa LIBRE + asignación huérfana → se ve normal, y al sentar a alguien el INSERT choca
--      contra idx_tickets_mesas_mesa_activa (una sola asignación viva por mesa). La mesa no se
--      puede abrir nunca más.
--
-- ROLLBACK al final.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno  uuid; v_prod uuid;
  v_mesa_a uuid; v_mesa_b uuid;
  v_ticket uuid; v_ticket2 uuid; v_auth uuid;
  v_activo uuid; v_estado text; v_n integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);

  UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=v_caja AND estado='ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable,
                     usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-MH', CURRENT_DATE, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;

  SELECT id INTO v_prod FROM productos WHERE tenant_id=v_tenant AND nombre='Hamburguesa Clásica' LIMIT 1;

  INSERT INTO mesas(tenant_id, sucursal_id, numero, nombre, capacidad, estado, forma)
  VALUES (v_tenant, v_suc, 91, 'Mesa 91', 4, 'LIBRE', 'CUADRADA') RETURNING id INTO v_mesa_a;
  INSERT INTO mesas(tenant_id, sucursal_id, numero, nombre, capacidad, estado, forma)
  VALUES (v_tenant, v_suc, 92, 'Mesa 92', 4, 'LIBRE', 'CUADRADA') RETURNING id INTO v_mesa_b;

  -- ── Fabricar el daño: cuenta cancelada cuya mesa nunca se soltó ───────────────
  -- Se cancela de verdad y después se deshace la liberación, que es exactamente lo que dejaba el
  -- trigger cuando corría en modo réplica. Poner fecha_liberacion a NULL no dispara nada
  -- (trg_tickets_mesas_sync_estado solo reacciona a NULL → no-NULL).
  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'MESA'::modo_servicio, NULL, NULL, 'mh-t', v_maria);
  PERFORM asignar_mesa_a_ticket(v_ticket, v_mesa_a, true, 'mh-asig');
  PERFORM agregar_item_a_ticket(v_ticket, v_prod, 1, NULL, '[]'::jsonb, 'mh-i');

  INSERT INTO autorizaciones_pin(tenant_id, sucursal_id, caja_id, turno_id,
    usuario_solicitante_id, usuario_autorizo_id, accion, permiso_codigo, entidad_tipo, entidad_id, monto_mxn, motivo)
  VALUES (v_tenant, v_suc, v_caja, v_turno, v_maria, v_maria, 'cancelar_ticket', 'venta.cancelar_abierta',
          'ticket', v_ticket, NULL, 'Mesa huérfana')
  RETURNING id INTO v_auth;

  PERFORM cancelar_ticket_pagado(
    p_ticket_id              := v_ticket,
    p_caja_id                := v_caja,
    p_turno_id               := v_turno,
    p_motivo                 := 'CLIENTE_DESISTIO'::cancelacion_motivo,
    p_motivo_texto           := 'Mesa huérfana',
    p_autorizacion_pin_id    := v_auth,
    p_usuario_solicitante_id := v_maria,
    p_usuario_autorizo_id    := v_maria,
    p_reversar_inventario    := true,
    p_cancelar_cfdi_sat      := false,
    p_devolver_dinero        := false);

  UPDATE tickets_mesas SET fecha_liberacion = NULL, motivo_liberacion = NULL WHERE ticket_id = v_ticket;
  UPDATE mesas SET estado = 'OCUPADA' WHERE id = v_mesa_a;
  RAISE NOTICE 'daño fabricado: asignación huérfana sobre mesa 91 (OCUPADA)';

  -- ── A) La pantalla NO debe ofrecer una cuenta que ya está cancelada ───────────
  SELECT ticket_activo_id INTO v_activo FROM vw_mesas_estado_actual WHERE mesa_id = v_mesa_a;
  IF v_activo IS NOT NULL THEN
    RAISE EXCEPTION 'A: la vista sigue dando por activo un ticket CANCELADO (%) — la pantalla deja entrar a un callejón sin salida', v_activo;
  END IF;
  RAISE NOTICE 'A ok: la mesa ya no ofrece la cuenta cancelada';

  -- ── B) La mesa OCUPADA por una huérfana debe poder volver a usarse ────────────
  v_ticket2 := abrir_ticket(v_suc, v_caja, v_turno, 'MESA'::modo_servicio, NULL, NULL, 'mh-t2', v_maria);
  BEGIN
    PERFORM asignar_mesa_a_ticket(v_ticket2, v_mesa_a, true, 'mh-asig2');
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'B: la mesa quedó inservible, no se puede sentar a nadie: %', SQLERRM;
  END;

  SELECT estado INTO v_estado FROM mesas WHERE id = v_mesa_a;
  IF v_estado <> 'OCUPADA' THEN RAISE EXCEPTION 'B: la mesa no se ocupó con la cuenta nueva (%)', v_estado; END IF;

  SELECT count(*) INTO v_n FROM tickets_mesas WHERE mesa_id = v_mesa_a AND fecha_liberacion IS NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'B: quedan % asignaciones vivas en la mesa, debe ser exactamente 1', v_n; END IF;
  RAISE NOTICE 'B ok: la mesa se reutiliza y solo queda la asignación nueva';

  -- ── C) Misma huérfana pero con la mesa en LIBRE (el caso de las mesas 2 y 3) ──
  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'MESA'::modo_servicio, NULL, NULL, 'mh-t3', v_maria);
  PERFORM asignar_mesa_a_ticket(v_ticket, v_mesa_b, true, 'mh-asig3');
  PERFORM agregar_item_a_ticket(v_ticket, v_prod, 1, NULL, '[]'::jsonb, 'mh-i3');

  INSERT INTO autorizaciones_pin(tenant_id, sucursal_id, caja_id, turno_id,
    usuario_solicitante_id, usuario_autorizo_id, accion, permiso_codigo, entidad_tipo, entidad_id, monto_mxn, motivo)
  VALUES (v_tenant, v_suc, v_caja, v_turno, v_maria, v_maria, 'cancelar_ticket', 'venta.cancelar_abierta',
          'ticket', v_ticket, NULL, 'Mesa huérfana libre')
  RETURNING id INTO v_auth;

  PERFORM cancelar_ticket_pagado(
    p_ticket_id              := v_ticket,
    p_caja_id                := v_caja,
    p_turno_id               := v_turno,
    p_motivo                 := 'CLIENTE_DESISTIO'::cancelacion_motivo,
    p_motivo_texto           := 'Mesa huérfana libre',
    p_autorizacion_pin_id    := v_auth,
    p_usuario_solicitante_id := v_maria,
    p_usuario_autorizo_id    := v_maria,
    p_reversar_inventario    := true,
    p_cancelar_cfdi_sat      := false,
    p_devolver_dinero        := false);

  UPDATE tickets_mesas SET fecha_liberacion = NULL, motivo_liberacion = NULL WHERE ticket_id = v_ticket;
  UPDATE mesas SET estado = 'LIBRE' WHERE id = v_mesa_b;   -- se ve normal, pero está minada

  v_ticket2 := abrir_ticket(v_suc, v_caja, v_turno, 'MESA'::modo_servicio, NULL, NULL, 'mh-t4', v_maria);
  BEGIN
    PERFORM asignar_mesa_a_ticket(v_ticket2, v_mesa_b, true, 'mh-asig4');
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'C: una mesa que se ve LIBRE no se puede abrir: %', SQLERRM;
  END;
  RAISE NOTICE 'C ok: la mesa que se veía libre acepta cuenta nueva';

  RAISE NOTICE 'smoke_mesa_huerfana OK';
END $$;
ROLLBACK;
