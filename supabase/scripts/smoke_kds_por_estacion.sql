-- Smoke 0120 · KDS por estación (ADR 0018): cada estación marca LISTO lo suyo y la orden se cierra
-- sola cuando termina la última. También: el área de un renglón cae a la de su categoría cuando
-- el producto no tiene una propia, y el área nula ("General") se marca con p_area = NULL.
-- ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_burger uuid := 'b0000000-0000-0000-0000-0000000000f1';
  v_papas  uuid := 'b0000000-0000-0000-0000-0000000000f2';
  v_plancha uuid; v_freidora uuid; v_cat_guarn uuid;
  v_turno uuid; v_t1 uuid; v_t2 uuid;
  v_r jsonb; v_ec text; v_listo timestamptz; v_entrega timestamptz; v_area text; n integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);

  -- Dos estaciones. La hamburguesa tiene área propia (Plancha); las papas NO, y la toman de su
  -- categoría (Guarniciones → Freidora), como la comanda impresa.
  INSERT INTO areas_cocina(tenant_id, sucursal_id, nombre) VALUES (v_tenant, v_suc, 'Plancha') RETURNING id INTO v_plancha;
  INSERT INTO areas_cocina(tenant_id, sucursal_id, nombre) VALUES (v_tenant, v_suc, 'Freidora') RETURNING id INTO v_freidora;
  INSERT INTO categorias(tenant_id, nombre, area_cocina_id) VALUES (v_tenant, 'Guarniciones smoke', v_freidora) RETURNING id INTO v_cat_guarn;
  UPDATE productos SET area_cocina_id = v_plancha WHERE id = v_burger;
  UPDATE productos SET area_cocina_id = NULL, categoria_id = v_cat_guarn WHERE id = v_papas;

  UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=v_caja AND estado='ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable,
                     usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-KDS-EST', CURRENT_DATE, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;

  -- ── Orden 1: Plancha + Freidora ─────────────────────────────────────────────
  v_t1 := abrir_ticket(v_suc, v_caja, v_turno, 'COMER_AQUI'::modo_servicio, NULL, NULL, 'smoke-est-1', v_maria);
  PERFORM agregar_item_a_ticket(v_t1, v_burger, 1, NULL, '[]'::jsonb, 'smoke-est-1-burger');
  PERFORM agregar_item_a_ticket(v_t1, v_papas, 1, NULL, '[]'::jsonb, 'smoke-est-1-papas');
  PERFORM aplicar_pago(v_t1, 'EFECTIVO'::metodo_pago, 175, 175, NULL, NULL, NULL, false, NULL, 'smoke-est-1-pago');

  SELECT area_cocina_nombre_snapshot INTO v_area FROM ticket_items WHERE ticket_id=v_t1 AND producto_id=v_papas;
  RAISE NOTICE 'área de las papas (de su categoría): %', v_area;
  IF v_area IS DISTINCT FROM 'Freidora' THEN
    RAISE EXCEPTION 'el área no cayó a la de la categoría: %', v_area;
  END IF;

  -- Plancha termina primero: la orden sigue EN_COCINA y solo falta Freidora.
  v_r := marcar_listo_cocina(v_t1, 'Plancha');
  RAISE NOTICE 'Plancha marca listo: %', v_r;
  SELECT estado_cocina INTO v_ec FROM tickets WHERE id=v_t1;
  IF (v_r->>'cerrada')::boolean OR v_ec <> 'EN_COCINA' THEN
    RAISE EXCEPTION 'la orden se cerró con Freidora pendiente (estado %)', v_ec;
  END IF;
  IF (v_r->>'marcados')::int <> 1 OR v_r->'pendientes' <> '["Freidora"]'::jsonb THEN
    RAISE EXCEPTION 'marcados/pendientes inesperados: %', v_r;
  END IF;
  IF (SELECT listo_at FROM ticket_items WHERE ticket_id=v_t1 AND producto_id=v_papas) IS NOT NULL THEN
    RAISE EXCEPTION 'Plancha marcó también las papas de Freidora';
  END IF;

  -- Marcar otra vez la misma estación no hace nada.
  v_r := marcar_listo_cocina(v_t1, 'Plancha');
  IF (v_r->>'marcados')::int <> 0 OR (v_r->>'cerrada')::boolean THEN
    RAISE EXCEPTION 'segundo LISTO de Plancha cambió algo: %', v_r;
  END IF;

  -- Freidora termina: la orden se cierra sola, con los timestamps de siempre.
  v_r := marcar_listo_cocina(v_t1, 'Freidora');
  SELECT estado_cocina, fecha_listo, fecha_entrega INTO v_ec, v_listo, v_entrega FROM tickets WHERE id=v_t1;
  RAISE NOTICE 'Freidora marca listo: % → estado=%', v_r, v_ec;
  IF NOT (v_r->>'cerrada')::boolean OR v_ec <> 'ENTREGADO' OR v_listo IS NULL OR v_entrega IS NULL THEN
    RAISE EXCEPTION 'la orden no se cerró al terminar la última estación (estado %)', v_ec;
  END IF;

  -- Una estación que llega tarde a una orden ya cerrada no truena.
  v_r := marcar_listo_cocina(v_t1, 'Freidora');
  IF NOT (v_r->>'ok')::boolean OR NOT (v_r->>'cerrada')::boolean THEN
    RAISE EXCEPTION 'marcar una orden ya cerrada debió responder ok+cerrada: %', v_r;
  END IF;

  -- ── Orden 2: área "General" (nula) + cerrar todo de una vez ─────────────────
  UPDATE categorias SET area_cocina_id = NULL WHERE id = v_cat_guarn;
  v_t2 := abrir_ticket(v_suc, v_caja, v_turno, 'COMER_AQUI'::modo_servicio, NULL, NULL, 'smoke-est-2', v_maria);
  PERFORM agregar_item_a_ticket(v_t2, v_burger, 1, NULL, '[]'::jsonb, 'smoke-est-2-burger');
  PERFORM agregar_item_a_ticket(v_t2, v_papas, 1, NULL, '[]'::jsonb, 'smoke-est-2-papas');
  PERFORM aplicar_pago(v_t2, 'EFECTIVO'::metodo_pago, 175, 175, NULL, NULL, NULL, false, NULL, 'smoke-est-2-pago');

  v_r := marcar_listo_cocina(v_t2, NULL);
  RAISE NOTICE 'General (área nula) marca listo: %', v_r;
  IF (v_r->>'marcados')::int <> 1 OR v_r->'pendientes' <> '["Plancha"]'::jsonb THEN
    RAISE EXCEPTION 'p_area NULL debió marcar solo el renglón sin área: %', v_r;
  END IF;

  v_r := marcar_listo_cocina(v_t2, NULL, true);
  SELECT estado_cocina INTO v_ec FROM tickets WHERE id=v_t2;
  IF NOT (v_r->>'cerrada')::boolean OR v_ec <> 'ENTREGADO' THEN
    RAISE EXCEPTION 'p_todas no cerró la orden (estado %): %', v_ec, v_r;
  END IF;
  SELECT count(*) INTO n FROM ticket_items WHERE ticket_id=v_t2 AND listo_at IS NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'p_todas dejó % renglones sin marcar', n; END IF;

  RAISE NOTICE 'SMOKE KDS POR ESTACIÓN OK: cada estación marca lo suyo, la última cierra; área de categoría y General correctas.';
END $$;
ROLLBACK;
