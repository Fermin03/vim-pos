-- Smoke de la caja de tienda (spec 2026-10-15-giro-retail-design.md; migración 0195).
-- Sobre la semilla de dev. ROLLBACK. Ejecutar: cd desktop && npm run smokes -- smoke_caja_tienda.sql
\set ON_ERROR_STOP on
BEGIN;

-- Fixture: dos productos con existencias en la semilla (restaurante) y otro negocio con lo suyo.
DO $$
DECLARE v_t uuid := '99999999-0000-0000-0000-0000000000aa'; v_o uuid := 'c4c40000-0000-0000-0000-0000000000ee';
BEGIN
  INSERT INTO categorias (id, tenant_id, nombre) VALUES ('c4c40000-0000-0000-0000-0000000000c1', v_t, 'Tienda');
  INSERT INTO productos (id, tenant_id, nombre, categoria_id, precio_base_mxn, controla_existencias) VALUES
    ('c4c40000-0000-0000-0000-0000000000a1', v_t, 'Playera', 'c4c40000-0000-0000-0000-0000000000c1', 100, true),
    ('c4c40000-0000-0000-0000-0000000000a2', v_t, 'Gorra',   'c4c40000-0000-0000-0000-0000000000c1', 200, true);
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_o, 'tenant-0195', 'Otra tienda', 'INTERNO', 'QUICK_SERVICE');
  INSERT INTO tenant_limites (tenant_id, max_sucursales) VALUES (v_o, 5) ON CONFLICT (tenant_id) DO UPDATE SET max_sucursales = 5;
  INSERT INTO sucursales (id, tenant_id, codigo, nombre) VALUES ('c4c40000-0000-0000-0000-0000000000b2', v_o, 'RC4', 'Ajena');
  INSERT INTO categorias (id, tenant_id, nombre) VALUES ('c4c40000-0000-0000-0000-0000000000c2', v_o, 'Ajena');
  INSERT INTO productos (id, tenant_id, nombre, categoria_id, precio_base_mxn, controla_existencias)
  VALUES ('c4c40000-0000-0000-0000-0000000000e1', v_o, 'Ajena', 'c4c40000-0000-0000-0000-0000000000c2', 10, true);
END $$;

-- 1) Candados de la entrega 1.
DO $$
DECLARE
  v_t     uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc   uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja  uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria uuid := '99999999-0000-0000-0000-000000000001';
  v_pla   uuid := 'c4c40000-0000-0000-0000-0000000000a1';
  v_gor   uuid := 'c4c40000-0000-0000-0000-0000000000a2';
  v_turno uuid; v_tk uuid; v_it1 uuid; v_it2 uuid; v_tot numeric; v_ab uuid; v_ab_it uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maria::text, 'tenant_id', v_t::text)::text, true);
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_t, v_suc, v_caja, 'SMOKE-C4', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;

  v_tk  := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-c4-a', v_maria);
  v_it1 := agregar_item_a_ticket(v_tk, v_pla, 1, NULL, '[]'::jsonb, 'smoke-c4-a-1');
  v_it2 := agregar_item_a_ticket(v_tk, v_gor, 1, NULL, '[]'::jsonb, 'smoke-c4-a-2');
  v_ab  := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'smoke-c4-ab', v_maria);
  v_ab_it := agregar_item_a_ticket(v_ab, v_pla, 1, NULL, '[]'::jsonb, 'smoke-c4-ab-1');

  -- 1c) Cobrar un ticket con dos renglones de existencias sigue generando dos VENTA.
  SELECT total_mxn INTO v_tot FROM tickets WHERE id = v_tk;
  PERFORM aplicar_pago(v_tk, 'EFECTIVO'::metodo_pago, v_tot, v_tot, NULL, NULL, NULL, false, NULL, 'smoke-c4-a-pago');
  IF (SELECT count(*) FROM movimientos_producto WHERE ticket_id = v_tk AND tipo = 'VENTA') <> 2 THEN
    RAISE EXCEPTION '1c: debían ser dos VENTA'; END IF;

  -- 1a) En un ticket PAGADO el renglón no cambia de producto; en ABIERTO sí.
  BEGIN UPDATE ticket_items SET producto_id = v_gor WHERE id = v_it1;
        RAISE EXCEPTION '1a: cambió el producto de un renglón cobrado';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DATOS_INVALIDOS: no se cambia el producto de un renglón cobrado%' THEN RAISE; END IF; END;
  UPDATE ticket_items SET producto_id = v_gor WHERE id = v_ab_it;
  IF (SELECT producto_id FROM ticket_items WHERE id = v_ab_it) <> v_gor THEN RAISE EXCEPTION '1a: en ABIERTO debía cambiar'; END IF;

  -- 1b) Un movimiento del otro negocio no apunta a registros de este.
  BEGIN INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad, ticket_id)
        VALUES ('c4c40000-0000-0000-0000-0000000000ee', 'c4c40000-0000-0000-0000-0000000000b2',
                'c4c40000-0000-0000-0000-0000000000e1', 'ENTRADA', 1, v_tk);
        RAISE EXCEPTION '1b: aceptó un ticket ajeno';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'MOVIMIENTO_INVALIDO%' THEN RAISE; END IF; END;
  BEGIN INSERT INTO movimientos_producto (tenant_id, sucursal_id, producto_id, tipo, cantidad, ticket_item_id)
        VALUES ('c4c40000-0000-0000-0000-0000000000ee', 'c4c40000-0000-0000-0000-0000000000b2',
                'c4c40000-0000-0000-0000-0000000000e1', 'ENTRADA', 1, v_it1);
        RAISE EXCEPTION '1b: aceptó un renglón ajeno';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'MOVIMIENTO_INVALIDO%' THEN RAISE; END IF; END;
  RAISE NOTICE '1 candados OK';
END $$;

ROLLBACK;
