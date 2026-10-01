-- Smoke de la 0148 (ADR 0025): el inventario viene desde el plan Negocio, y UNA VENTA NUNCA FALLA
-- POR ESO. De punta a punta, con ventas, una cancelación y una devolución de verdad:
--
--   A. con el descuento encendido, dos ventas descuentan su receta;
--   B. el descuento se apaga (en la nube: VIM le niega el módulo y se apaga SOLO, y no se puede
--      volver a encender; en la caja: llega apagado por el pull);
--   C. una venta con receta se cobra igual y no mueve el inventario;
--   D. cancelar y devolver las ventas que SÍ descontaron regresa sus piezas aunque el descuento ya
--      esté apagado (la reversa sigue a la venta, no al interruptor); cancelar la que no descontó
--      no regresa nada;
--   E. con el descuento encendido otra vez, la venta vuelve a descontar.
--
-- Corre en dos sitios y hace LOS MISMOS FLUJOS en los dos: el CI contra Supabase local (la nube) y
-- `npm run smokes` en desktop/ contra el Postgres embebido (la caja instalada). Lo único que cambia
-- es B: en la caja el candado no actúa —allá manda lo que baja de la nube—, y eso también se
-- comprueba. Lo que depende del rol (el dueño por RLS, service_role, el push) está en pgTAP 0032/0033.
BEGIN;

DO $$
DECLARE
  v_t uuid := '99999999-0000-0000-0000-0000000000aa';   -- fixture: plan QS, que SÍ incluye inventario
  v_s uuid := '99999999-0000-0000-0000-0000000000bb';
  v_c uuid := '99999999-0000-0000-0000-0000000000cc';
  v_m uuid := '99999999-0000-0000-0000-000000000001';
  v_caja_instalada boolean := to_regclass('public._vim_migraciones') IS NOT NULL;
  v_pza uuid; v_insumo uuid; v_prod uuid; v_receta uuid; v_turno uuid;
  v_tk_c uuid; v_tk_d uuid; v_tk_sin uuid; v_tk uuid; v_item_d uuid; v_aut uuid; v_dev uuid;
  v_total numeric(12,2); v_fiscal text; v_n int; v_stock numeric;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_m::text, 'tenant_id', v_t::text)::text, true);

  -- ── Preparación: un producto con receta de 1 pieza, 10 en existencia, descuento encendido ──
  DELETE FROM tenant_feature_flags WHERE tenant_id = v_t AND flag_codigo = 'recetas';
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
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_c AND estado = 'ABIERTO';
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_t, v_s, v_c, 'PLAN-SMOKE', calcular_dia_contable(v_t), v_m, 500, 'TOTAL') RETURNING id INTO v_turno;

  -- ── A) Dos ventas con el descuento encendido: 10 → 8 ───────────────────────
  v_tk_c := abrir_ticket(v_s, v_c, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'plan-smoke-c', v_m);
  PERFORM agregar_item_a_ticket(v_tk_c, v_prod, 1, NULL, '[]'::jsonb, 'plan-smoke-item-c');
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_tk_c;
  PERFORM aplicar_pago(v_tk_c, 'EFECTIVO'::metodo_pago, v_total, v_total, NULL, NULL, NULL, false, NULL, 'plan-smoke-pago-c');
  v_tk_d := abrir_ticket(v_s, v_c, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'plan-smoke-d', v_m);
  v_item_d := agregar_item_a_ticket(v_tk_d, v_prod, 1, NULL, '[]'::jsonb, 'plan-smoke-item-d');
  PERFORM aplicar_pago(v_tk_d, 'EFECTIVO'::metodo_pago, v_total, v_total, NULL, NULL, NULL, false, NULL, 'plan-smoke-pago-d');
  SELECT stock_actual INTO v_stock FROM insumo_stock_sucursal WHERE insumo_id = v_insumo AND sucursal_id = v_s;
  IF v_stock <> 8 THEN RAISE EXCEPTION 'A: dos ventas con descuento debían dejar 8, quedó %', v_stock; END IF;

  -- ── B) El descuento se apaga ───────────────────────────────────────────────
  IF v_caja_instalada THEN
    -- En la caja la regla siempre dice que sí, haya la excepción local que haya: obedece el
    -- interruptor que le llega por el pull. Aquí "llega" apagado.
    INSERT INTO tenant_feature_flags (tenant_id, flag_codigo, activado, motivo) VALUES (v_t, 'recetas', false, 'smoke');
    IF NOT inventario_permitido(v_t) THEN RAISE EXCEPTION 'B (caja): el candado no debe actuar en la caja instalada'; END IF;
    IF NOT (SELECT modulo_inventario_activo FROM configuracion_tenant WHERE tenant_id = v_t) THEN
      RAISE EXCEPTION 'B (caja): una excepción local no debe apagar el interruptor: lo manda la nube';
    END IF;
    UPDATE configuracion_tenant SET modulo_inventario_activo = false WHERE tenant_id = v_t;
  ELSE
    -- En la nube: VIM le niega el módulo y el interruptor se apaga solo.
    INSERT INTO tenant_feature_flags (tenant_id, flag_codigo, activado, motivo) VALUES (v_t, 'recetas', false, 'smoke: sin inventario');
    IF inventario_permitido(v_t) THEN RAISE EXCEPTION 'B: con la excepción en contra no debía estar permitido'; END IF;
    IF (SELECT modulo_inventario_activo FROM configuracion_tenant WHERE tenant_id = v_t) THEN
      RAISE EXCEPTION 'B: al perder el módulo, el descuento debía apagarse solo';
    END IF;
    IF (modulos_efectivos(v_t)->'efectivos'->>'recetas')::boolean THEN RAISE EXCEPTION 'B: la directiva de la caja seguiría diciendo recetas=true'; END IF;
    -- Y no se puede volver a encender sin el módulo.
    BEGIN
      UPDATE configuracion_tenant SET modulo_inventario_activo = true WHERE tenant_id = v_t;
      RAISE EXCEPTION 'B: dejó encender el descuento sin el módulo';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'El inventario viene desde el plan Negocio%' THEN RAISE; END IF;
    END;
  END IF;

  -- ── C) Una venta con receta: se cobra y NO se mueve el inventario ──────────
  v_tk_sin := abrir_ticket(v_s, v_c, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'plan-smoke-sin', v_m);
  PERFORM agregar_item_a_ticket(v_tk_sin, v_prod, 2, NULL, '[]'::jsonb, 'plan-smoke-item-sin');
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_tk_sin;
  PERFORM aplicar_pago(v_tk_sin, 'EFECTIVO'::metodo_pago, v_total, v_total, NULL, NULL, NULL, false, NULL, 'plan-smoke-pago-sin');
  SELECT estado_fiscal::text INTO v_fiscal FROM tickets WHERE id = v_tk_sin;
  IF v_fiscal <> 'PAGADO' THEN RAISE EXCEPTION 'C: la venta sin inventario debía cobrarse; quedó %', v_fiscal; END IF;
  SELECT count(*) INTO v_n FROM movimientos_inventario WHERE ticket_id = v_tk_sin;
  IF v_n <> 0 THEN RAISE EXCEPTION 'C: con el descuento apagado no debía mover nada; hubo % movimiento(s)', v_n; END IF;
  SELECT stock_actual INTO v_stock FROM insumo_stock_sucursal WHERE insumo_id = v_insumo AND sucursal_id = v_s;
  IF v_stock <> 8 THEN RAISE EXCEPTION 'C: las existencias cambiaron (8 → %)', v_stock; END IF;

  -- ── D) Cancelación y devolución con el descuento YA apagado ────────────────
  -- Cancelar (con devolución de dinero) la venta que sí descontó: regresa su pieza.
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_tk_c;
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, monto_mxn, motivo)
  VALUES (v_t, v_s, v_c, v_turno, v_m, v_m, 'cancelar_ticket', 'venta.cancelar_pagada', 'ticket', v_tk_c, v_total, 'smoke plan')
  RETURNING id INTO v_aut;
  PERFORM cancelar_ticket_pagado(v_tk_c, v_c, v_turno, 'CLIENTE_DESISTIO'::cancelacion_motivo, NULL, v_aut,
                                 v_m, v_m, true, false, true, 'EFECTIVO'::devolucion_medio, NULL, NULL);
  SELECT estado_fiscal::text INTO v_fiscal FROM tickets WHERE id = v_tk_c;
  IF v_fiscal <> 'CANCELADO' THEN RAISE EXCEPTION 'D: la cancelación no debía fallar; el ticket quedó %', v_fiscal; END IF;
  SELECT stock_actual INTO v_stock FROM insumo_stock_sucursal WHERE insumo_id = v_insumo AND sucursal_id = v_s;
  IF v_stock <> 9 THEN RAISE EXCEPTION 'D: cancelar la venta que descontó debía regresar su pieza (9), quedó %', v_stock; END IF;

  -- Devolver la otra: también regresa.
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, monto_mxn, motivo)
  VALUES (v_t, v_s, v_c, v_turno, v_m, v_m, 'devolucion', 'venta.devolucion', 'ticket', v_tk_d, v_total, 'smoke plan')
  RETURNING id INTO v_aut;
  v_dev := crear_devolucion(
    p_ticket_original_id := v_tk_d, p_caja_id := v_c, p_turno_id := v_turno,
    p_alcance := 'TOTAL'::devolucion_alcance, p_motivo := 'PRODUCTO_DEFECTUOSO'::devolucion_motivo,
    p_motivo_texto := 'smoke', p_medio_devolucion := 'EFECTIVO'::devolucion_medio,
    p_autorizacion_pin_id := v_aut, p_usuario_solicitante_id := v_m, p_usuario_autorizo_id := v_m,
    p_items := jsonb_build_array(jsonb_build_object('ticket_item_id', v_item_d, 'cantidad_devuelta', 1)),
    p_reversar_inventario := true, p_nota := NULL);
  PERFORM confirmar_devolucion(v_dev, v_m);
  IF (SELECT estado FROM devoluciones WHERE id = v_dev) <> 'CONFIRMADA' THEN RAISE EXCEPTION 'D: la devolución no quedó CONFIRMADA'; END IF;
  SELECT stock_actual INTO v_stock FROM insumo_stock_sucursal WHERE insumo_id = v_insumo AND sucursal_id = v_s;
  IF v_stock <> 10 THEN RAISE EXCEPTION 'D: la devolución debía regresar su pieza (10), quedó %', v_stock; END IF;

  -- Cancelar la venta que NO descontó: no hay nada que regresar.
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_tk_sin;
  INSERT INTO autorizaciones_pin (tenant_id, sucursal_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                  accion, permiso_codigo, entidad_tipo, entidad_id, monto_mxn, motivo)
  VALUES (v_t, v_s, v_c, v_turno, v_m, v_m, 'cancelar_ticket', 'venta.cancelar_pagada', 'ticket', v_tk_sin, v_total, 'smoke plan')
  RETURNING id INTO v_aut;
  PERFORM cancelar_ticket_pagado(v_tk_sin, v_c, v_turno, 'CLIENTE_DESISTIO'::cancelacion_motivo, NULL, v_aut,
                                 v_m, v_m, true, false, true, 'EFECTIVO'::devolucion_medio, NULL, NULL);
  SELECT stock_actual INTO v_stock FROM insumo_stock_sucursal WHERE insumo_id = v_insumo AND sucursal_id = v_s;
  IF v_stock <> 10 THEN RAISE EXCEPTION 'D: cancelar una venta que no descontó no debía mover existencias (10), quedó %', v_stock; END IF;

  -- ── E) Con el descuento encendido otra vez, la venta descuenta ─────────────
  DELETE FROM tenant_feature_flags WHERE tenant_id = v_t AND flag_codigo = 'recetas';
  IF NOT inventario_permitido(v_t) THEN RAISE EXCEPTION 'E: sin la excepción manda el plan (QS), que lo incluye'; END IF;
  IF (SELECT modulo_inventario_activo FROM configuracion_tenant WHERE tenant_id = v_t) THEN
    RAISE EXCEPTION 'E: recuperar el permiso no debe encender el descuento: eso lo decide el dueño';
  END IF;
  UPDATE configuracion_tenant SET modulo_inventario_activo = true WHERE tenant_id = v_t;
  v_tk := abrir_ticket(v_s, v_c, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'plan-smoke-e', v_m);
  PERFORM agregar_item_a_ticket(v_tk, v_prod, 2, NULL, '[]'::jsonb, 'plan-smoke-item-e');
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_tk;
  PERFORM aplicar_pago(v_tk, 'EFECTIVO'::metodo_pago, v_total, v_total, NULL, NULL, NULL, false, NULL, 'plan-smoke-pago-e');
  SELECT count(*) INTO v_n FROM movimientos_inventario WHERE ticket_id = v_tk AND tipo = 'SALIDA_VENTA';
  IF v_n <> 1 THEN RAISE EXCEPTION 'E: con el descuento encendido esperaba 1 movimiento de venta, hubo %', v_n; END IF;
  SELECT stock_actual INTO v_stock FROM insumo_stock_sucursal WHERE insumo_id = v_insumo AND sucursal_id = v_s;
  IF v_stock <> 8 THEN RAISE EXCEPTION 'E: esperaba que bajaran 2 piezas (8), quedó %', v_stock; END IF;

  RAISE NOTICE '✅ smoke_inventario_plan (%): venta, cancelación y devolución sin el descuento no fallan; la reversa sigue a la venta',
    CASE WHEN v_caja_instalada THEN 'caja instalada' ELSE 'nube' END;
END $$;

ROLLBACK;
