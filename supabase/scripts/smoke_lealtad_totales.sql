-- Smoke lealtad · totales (0156 §5). Un canje de dinero baja el total y se reporta en lealtad_mxn;
-- un premio de producto deja su renglón en cero; revertir lo devuelve todo. Hace ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno  uuid; v_prod uuid; v_cli uuid; v_t uuid; v_item uuid; v_item2 uuid;
  v_canje  uuid := gen_random_uuid(); v_canje2 uuid := gen_random_uuid();
  r        tickets%ROWTYPE;
BEGIN
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_tenant, 'Ana Totales', '4770001562') RETURNING id INTO v_cli;
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-LTOT', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;
  SELECT id INTO v_prod FROM productos WHERE tenant_id = v_tenant AND nombre = 'Hamburguesa Clásica' LIMIT 1;

  v_t := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-ltot-1', v_maria);
  v_item  := agregar_item_a_ticket(v_t, v_prod, 1, NULL, '[]'::jsonb, 'smoke-ltot-i1');
  v_item2 := agregar_item_a_ticket(v_t, v_prod, 1, NULL, '[]'::jsonb, 'smoke-ltot-i2');
  SELECT * INTO r FROM tickets WHERE id = v_t;
  IF r.total_mxn <> 240 THEN RAISE EXCEPTION 'total inicial % (esperado 240)', r.total_mxn; END IF;

  -- 1) Canje de dinero: $40 sobre la cuenta.
  INSERT INTO ticket_canjes_lealtad (id, tenant_id, ticket_id, cliente_id, puntos, monto_descontado_mxn)
  VALUES (v_canje, v_tenant, v_t, v_cli, 40, 40);
  SELECT * INTO r FROM tickets WHERE id = v_t;
  IF r.total_mxn <> 200 THEN RAISE EXCEPTION 'total con canje % (esperado 200)', r.total_mxn; END IF;
  IF r.lealtad_mxn <> 40 THEN RAISE EXCEPTION 'lealtad_mxn % (esperado 40)', r.lealtad_mxn; END IF;
  IF r.promociones_mxn <> 0 OR r.descuentos_manuales_mxn <> 0 THEN RAISE EXCEPTION 'el canje se coló en otro carril'; END IF;

  -- 2) Revertirlo devuelve el total.
  UPDATE ticket_canjes_lealtad SET revertido = true, revertido_at = now() WHERE id = v_canje;
  SELECT * INTO r FROM tickets WHERE id = v_t;
  IF r.total_mxn <> 240 OR r.lealtad_mxn <> 0 THEN RAISE EXCEPTION 'revertir no devolvió el total: % / %', r.total_mxn, r.lealtad_mxn; END IF;

  -- 3) Premio de producto: el segundo renglón sale en cero y la cuenta queda en $120.
  INSERT INTO ticket_canjes_lealtad (id, tenant_id, ticket_id, cliente_id, ticket_item_id, puntos, monto_descontado_mxn)
  VALUES (v_canje2, v_tenant, v_t, v_cli, v_item2, 6, 120);
  SELECT * INTO r FROM tickets WHERE id = v_t;
  IF r.total_mxn <> 120 THEN RAISE EXCEPTION 'total con premio % (esperado 120)', r.total_mxn; END IF;
  IF r.lealtad_mxn <> 120 THEN RAISE EXCEPTION 'lealtad_mxn con premio % (esperado 120)', r.lealtad_mxn; END IF;
  IF (SELECT total_item_mxn FROM ticket_items WHERE id = v_item2) <> 0 THEN RAISE EXCEPTION 'el renglón premiado no quedó en cero'; END IF;
  IF (SELECT promocion_item_mxn FROM ticket_items WHERE id = v_item2) <> 120 THEN RAISE EXCEPTION 'el descuento del renglón no quedó donde el CFDI lo lee'; END IF;

  -- 4) La invariante que el CFDI deduce.
  IF (SELECT SUM(subtotal_bruto_mxn + monto_modificadores_mxn) FROM ticket_items WHERE ticket_id = v_t AND NOT cancelado)
     - (r.descuentos_manuales_mxn + r.promociones_mxn + r.lealtad_mxn) <> r.total_mxn THEN
    RAISE EXCEPTION 'la invariante renglones - descuentos = total se rompió';
  END IF;

  -- 5) Un canje mayor que la cuenta no la deja negativa ni reporta de más.
  UPDATE ticket_canjes_lealtad SET revertido = true WHERE id = v_canje2;
  INSERT INTO ticket_canjes_lealtad (id, tenant_id, ticket_id, cliente_id, puntos, monto_descontado_mxn)
  VALUES (gen_random_uuid(), v_tenant, v_t, v_cli, 999, 999);
  SELECT * INTO r FROM tickets WHERE id = v_t;
  IF r.total_mxn <> 0 OR r.lealtad_mxn <> 240 THEN RAISE EXCEPTION 'canje excedido: total % lealtad %', r.total_mxn, r.lealtad_mxn; END IF;

  RAISE NOTICE 'SMOKE LEALTAD TOTALES OK';
END $$;
ROLLBACK;
