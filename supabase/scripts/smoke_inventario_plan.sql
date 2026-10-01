-- Smoke de la 0148 (ADR 0025): el inventario viene desde el plan Negocio, y UNA VENTA NUNCA FALLA
-- POR ESO. De punta a punta, con una venta de verdad:
--
--   · un negocio con el descuento encendido pierde el módulo (VIM se lo niega) → el interruptor se
--     apaga solo;
--   · vende un producto CON receta → la venta se cobra igual y no se mueve el inventario;
--   · no puede volver a encender el descuento mientras no tenga el módulo;
--   · se lo devuelven → puede encenderlo y la siguiente venta sí descuenta.
--
-- Corre en dos sitios (CI contra Supabase local, y `npm run smokes` en desktop/ contra el Postgres
-- embebido de la caja). EN LA CAJA EL CANDADO NO ACTÚA —allá manda lo que baja de la nube—, así
-- que ahí se comprueba justo eso y nada más. Lo de roles (el dueño, por RLS) está en pgTAP 0032.
BEGIN;

DO $$
DECLARE
  v_t uuid := '99999999-0000-0000-0000-0000000000aa';   -- fixture: plan QS, que SÍ incluye inventario
  v_s uuid := '99999999-0000-0000-0000-0000000000bb';
  v_c uuid := '99999999-0000-0000-0000-0000000000cc';
  v_m uuid := '99999999-0000-0000-0000-000000000001';
  v_caja_instalada boolean := to_regclass('public._vim_migraciones') IS NOT NULL;
  v_pza uuid; v_insumo uuid; v_prod uuid; v_receta uuid; v_turno uuid; v_ticket uuid;
  v_total numeric(12,2); v_fiscal text; v_n int; v_antes numeric; v_despues numeric;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_m::text, 'tenant_id', v_t::text)::text, true);

  IF v_caja_instalada THEN
    -- En la caja la regla siempre dice que sí: obedece el interruptor que le llega por el pull.
    IF NOT inventario_permitido(v_t) THEN RAISE EXCEPTION 'en la caja instalada el candado no debe actuar'; END IF;
    INSERT INTO tenant_feature_flags (tenant_id, flag_codigo, activado, motivo) VALUES (v_t, 'recetas', false, 'smoke')
      ON CONFLICT (tenant_id, flag_codigo) DO UPDATE SET activado = false;
    IF NOT inventario_permitido(v_t) THEN RAISE EXCEPTION 'en la caja una excepción local no debe apagar nada'; END IF;
    INSERT INTO configuracion_tenant (tenant_id, modulo_inventario_activo) VALUES (v_t, true)
      ON CONFLICT (tenant_id) DO UPDATE SET modulo_inventario_activo = true;
    RAISE NOTICE '✅ smoke_inventario_plan (caja instalada): el candado no actúa; manda la nube';
    RETURN;
  END IF;

  -- ── Preparación: un producto con receta de 1 pieza, 10 en existencia, descuento encendido ──
  SELECT id INTO v_pza FROM unidades_medida WHERE tenant_id = v_t AND codigo = 'PZA' LIMIT 1;
  IF v_pza IS NULL THEN RAISE EXCEPTION 'no hay unidad PZA (seed 0035)'; END IF;
  SELECT id INTO v_prod FROM productos WHERE tenant_id = v_t AND deleted_at IS NULL ORDER BY nombre LIMIT 1;
  INSERT INTO insumos (tenant_id, nombre, unidad_medida_id, categoria, costo_unitario_mxn)
  VALUES (v_t, 'Pan plan-smoke', v_pza, 'OTROS', 5) RETURNING id INTO v_insumo;
  PERFORM aplicar_movimiento_inventario(v_t, v_s, v_insumo, 'ENTRADA_COMPRA'::movimiento_inventario_tipo, 10, 5, v_m, 'smoke');
  DELETE FROM receta_componentes WHERE receta_id IN (SELECT id FROM recetas WHERE producto_id = v_prod);
  DELETE FROM recetas WHERE producto_id = v_prod;
  INSERT INTO recetas (tenant_id, producto_id, activa) VALUES (v_t, v_prod, true) RETURNING id INTO v_receta;
  INSERT INTO receta_componentes (tenant_id, receta_id, insumo_id, cantidad) VALUES (v_t, v_receta, v_insumo, 1);
  INSERT INTO configuracion_tenant (tenant_id, modulo_inventario_activo) VALUES (v_t, true)
    ON CONFLICT (tenant_id) DO UPDATE SET modulo_inventario_activo = true;
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn)
  VALUES (v_t, v_s, v_c, 'PLAN-SMOKE', calcular_dia_contable(v_t), v_m, 500) RETURNING id INTO v_turno;

  -- ── 1) VIM le niega el módulo: el descuento se apaga solo ──────────────────
  DELETE FROM tenant_feature_flags WHERE tenant_id = v_t AND flag_codigo = 'recetas';
  INSERT INTO tenant_feature_flags (tenant_id, flag_codigo, activado, motivo) VALUES (v_t, 'recetas', false, 'smoke: sin inventario');
  IF inventario_permitido(v_t) THEN RAISE EXCEPTION 'con la excepción en contra no debía estar permitido'; END IF;
  IF (SELECT modulo_inventario_activo FROM configuracion_tenant WHERE tenant_id = v_t) THEN
    RAISE EXCEPTION 'al perder el módulo, el descuento debía apagarse solo';
  END IF;
  IF (modulos_efectivos(v_t)->'efectivos'->>'recetas')::boolean THEN RAISE EXCEPTION 'la directiva de la caja seguiría diciendo recetas=true'; END IF;

  -- ── 2) Vende un producto con receta: se cobra y NO se mueve el inventario ──
  SELECT stock_actual INTO v_antes FROM insumo_stock_sucursal WHERE insumo_id = v_insumo AND sucursal_id = v_s;
  v_ticket := abrir_ticket(v_s, v_c, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'plan-smoke-1', v_m);
  PERFORM agregar_item_a_ticket(v_ticket, v_prod, 2, NULL, '[]'::jsonb, 'plan-smoke-item-1');
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket;
  PERFORM aplicar_pago(v_ticket, 'EFECTIVO'::metodo_pago, v_total, v_total, NULL, NULL, NULL, false, NULL, 'plan-smoke-pago-1');
  SELECT estado_fiscal::text INTO v_fiscal FROM tickets WHERE id = v_ticket;
  IF v_fiscal <> 'PAGADO' THEN RAISE EXCEPTION 'la venta de un negocio sin inventario debía cobrarse; quedó %', v_fiscal; END IF;
  SELECT count(*) INTO v_n FROM movimientos_inventario WHERE ticket_id = v_ticket;
  IF v_n <> 0 THEN RAISE EXCEPTION 'sin el módulo no debía descontar nada; hubo % movimiento(s)', v_n; END IF;
  SELECT stock_actual INTO v_despues FROM insumo_stock_sucursal WHERE insumo_id = v_insumo AND sucursal_id = v_s;
  IF v_despues <> v_antes THEN RAISE EXCEPTION 'las existencias cambiaron (% → %) sin tener el módulo', v_antes, v_despues; END IF;

  -- ── 3) Sin el módulo no se puede volver a encender ─────────────────────────
  BEGIN
    UPDATE configuracion_tenant SET modulo_inventario_activo = true WHERE tenant_id = v_t;
    RAISE EXCEPTION 'dejó encender el descuento sin el módulo';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'El inventario viene desde el plan Negocio%' THEN RAISE; END IF;
  END;

  -- ── 4) Se lo devuelven ("Según plan"): lo enciende y la venta descuenta ────
  DELETE FROM tenant_feature_flags WHERE tenant_id = v_t AND flag_codigo = 'recetas';
  IF NOT inventario_permitido(v_t) THEN RAISE EXCEPTION 'sin la excepción manda el plan (QS), que lo incluye'; END IF;
  IF (SELECT modulo_inventario_activo FROM configuracion_tenant WHERE tenant_id = v_t) THEN
    RAISE EXCEPTION 'recuperar el permiso no debe encender el descuento: eso lo decide el dueño';
  END IF;
  UPDATE configuracion_tenant SET modulo_inventario_activo = true WHERE tenant_id = v_t;
  v_ticket := abrir_ticket(v_s, v_c, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'plan-smoke-2', v_m);
  PERFORM agregar_item_a_ticket(v_ticket, v_prod, 2, NULL, '[]'::jsonb, 'plan-smoke-item-2');
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket;
  PERFORM aplicar_pago(v_ticket, 'EFECTIVO'::metodo_pago, v_total, v_total, NULL, NULL, NULL, false, NULL, 'plan-smoke-pago-2');
  SELECT count(*) INTO v_n FROM movimientos_inventario WHERE ticket_id = v_ticket AND tipo = 'SALIDA_VENTA';
  IF v_n <> 1 THEN RAISE EXCEPTION 'con el módulo de vuelta esperaba 1 movimiento de venta, hubo %', v_n; END IF;
  SELECT stock_actual INTO v_despues FROM insumo_stock_sucursal WHERE insumo_id = v_insumo AND sucursal_id = v_s;
  IF v_antes - v_despues <> 2 THEN RAISE EXCEPTION 'esperaba que bajaran 2 piezas, bajaron %', v_antes - v_despues; END IF;

  RAISE NOTICE '✅ smoke_inventario_plan: sin módulo la venta se cobra sin descontar; con módulo, descuenta';
END $$;

ROLLBACK;
