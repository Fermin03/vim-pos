-- Smoke: cancelar una cuenta de mesa LIBERA la mesa. Dos casos, porque fallaban por motivos
-- distintos (ver 0104):
--   A) cuenta CON ítems (ABIERTO, con folio) → la cancelación funcionaba, pero la mesa se quedaba
--      OCUPADA: trg_cancelacion_marcar_ticket corría en modo réplica y apagaba trg_ticket_liberar_mesa.
--   B) cuenta VACÍA (BORRADOR, sin folio) → la cancelación ni siquiera pasaba:
--      cancelaciones_ticket.ticket_folio_snapshot era NOT NULL. Es la mesa que se abre por error.
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
  v_ticket uuid; v_auth uuid;
  v_estado_mesa text; v_estado_fiscal text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);

  UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=v_caja AND estado='ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable,
                     usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-MA', CURRENT_DATE, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;

  SELECT id INTO v_prod FROM productos WHERE tenant_id=v_tenant AND nombre='Hamburguesa Clásica' LIMIT 1;

  INSERT INTO mesas(tenant_id, sucursal_id, numero, nombre, capacidad, estado, forma)
  VALUES (v_tenant, v_suc, 81, 'Mesa 81', 4, 'LIBRE', 'CUADRADA') RETURNING id INTO v_mesa_a;
  INSERT INTO mesas(tenant_id, sucursal_id, numero, nombre, capacidad, estado, forma)
  VALUES (v_tenant, v_suc, 82, 'Mesa 82', 4, 'LIBRE', 'CUADRADA') RETURNING id INTO v_mesa_b;

  -- ── Caso A: cuenta de mesa CON ítems, abandonada y cancelada ───────────────
  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'MESA'::modo_servicio, NULL, NULL, 'ma-a-t', v_maria);
  PERFORM asignar_mesa_a_ticket(v_ticket, v_mesa_a, true, 'ma-a-asig');
  PERFORM agregar_item_a_ticket(v_ticket, v_prod, 1, NULL, '[]'::jsonb, 'ma-a-i');

  SELECT estado INTO v_estado_mesa FROM mesas WHERE id=v_mesa_a;
  IF v_estado_mesa <> 'OCUPADA' THEN RAISE EXCEPTION 'A: la mesa no se ocupó (%)', v_estado_mesa; END IF;

  INSERT INTO autorizaciones_pin(tenant_id, sucursal_id, caja_id, turno_id,
    usuario_solicitante_id, usuario_autorizo_id, accion, permiso_codigo, entidad_tipo, entidad_id, monto_mxn, motivo)
  VALUES (v_tenant, v_suc, v_caja, v_turno, v_maria, v_maria, 'cancelar_ticket', 'venta.cancelar_abierta', 'ticket', v_ticket, NULL, 'Mesa abandonada')
  RETURNING id INTO v_auth;

  PERFORM cancelar_ticket_pagado(
    p_ticket_id              := v_ticket,
    p_caja_id                := v_caja,
    p_turno_id               := v_turno,
    p_motivo                 := 'CLIENTE_DESISTIO'::cancelacion_motivo,
    p_motivo_texto           := 'Mesa abandonada con consumo',
    p_autorizacion_pin_id    := v_auth,
    p_usuario_solicitante_id := v_maria,
    p_usuario_autorizo_id    := v_maria,
    p_reversar_inventario    := true,
    p_cancelar_cfdi_sat      := false,
    p_devolver_dinero        := false,
    p_client_id_local        := 'ma-a-cancel'
  );

  SELECT estado_fiscal INTO v_estado_fiscal FROM tickets WHERE id=v_ticket;
  SELECT estado INTO v_estado_mesa FROM mesas WHERE id=v_mesa_a;
  RAISE NOTICE 'A (con items): ticket=% mesa=% (esperado CANCELADO / LIBRE)', v_estado_fiscal, v_estado_mesa;
  IF v_estado_fiscal <> 'CANCELADO' THEN RAISE EXCEPTION 'A: el ticket no quedó CANCELADO (%)', v_estado_fiscal; END IF;
  IF v_estado_mesa <> 'LIBRE' THEN RAISE EXCEPTION 'A: la mesa NO se liberó al cancelar (es %)', v_estado_mesa; END IF;

  -- ── Caso B: mesa abierta por error, cuenta VACÍA (BORRADOR sin folio) ──────
  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'MESA'::modo_servicio, NULL, NULL, 'ma-b-t', v_maria);
  PERFORM asignar_mesa_a_ticket(v_ticket, v_mesa_b, true, 'ma-b-asig');

  SELECT estado_fiscal INTO v_estado_fiscal FROM tickets WHERE id=v_ticket;
  IF v_estado_fiscal <> 'BORRADOR' THEN RAISE EXCEPTION 'B: esperaba BORRADOR, es %', v_estado_fiscal; END IF;

  INSERT INTO autorizaciones_pin(tenant_id, sucursal_id, caja_id, turno_id,
    usuario_solicitante_id, usuario_autorizo_id, accion, permiso_codigo, entidad_tipo, entidad_id, monto_mxn, motivo)
  VALUES (v_tenant, v_suc, v_caja, v_turno, v_maria, v_maria, 'cancelar_ticket', 'venta.cancelar_abierta', 'ticket', v_ticket, NULL, 'Mesa abierta por error')
  RETURNING id INTO v_auth;

  PERFORM cancelar_ticket_pagado(
    p_ticket_id              := v_ticket,
    p_caja_id                := v_caja,
    p_turno_id               := v_turno,
    p_motivo                 := 'PROBLEMA_OPERATIVO'::cancelacion_motivo,
    p_motivo_texto           := 'Mesa abierta por error, sin consumo',
    p_autorizacion_pin_id    := v_auth,
    p_usuario_solicitante_id := v_maria,
    p_usuario_autorizo_id    := v_maria,
    p_reversar_inventario    := true,
    p_cancelar_cfdi_sat      := false,
    p_devolver_dinero        := false,
    p_client_id_local        := 'ma-b-cancel'
  );

  SELECT estado_fiscal INTO v_estado_fiscal FROM tickets WHERE id=v_ticket;
  SELECT estado INTO v_estado_mesa FROM mesas WHERE id=v_mesa_b;
  RAISE NOTICE 'B (vacía): ticket=% mesa=% (esperado CANCELADO / LIBRE)', v_estado_fiscal, v_estado_mesa;
  IF v_estado_fiscal <> 'CANCELADO' THEN RAISE EXCEPTION 'B: el ticket no quedó CANCELADO (%)', v_estado_fiscal; END IF;
  IF v_estado_mesa <> 'LIBRE' THEN RAISE EXCEPTION 'B: la mesa NO se liberó al cancelar (es %)', v_estado_mesa; END IF;

  RAISE NOTICE 'SMOKE MESA ABANDONADA OK: cancelar una cuenta de mesa (con ítems y vacía) libera la mesa.';
END $$;
ROLLBACK;
