-- Smoke de los reportes de inventario (0129): historial de movimientos (P-149) y costo de ventas
-- (P-150). Corre como postgres contra la BD sembrada, en transacción con ROLLBACK.
--
-- Arma su propio catálogo (productos e insumos "cv-smoke") para no depender de lo que traiga el
-- seed, y recorre los casos que decidieron el diseño del cálculo:
--   · una venta con el descuento de inventario APAGADO no tiene costo (y no es margen del 100 %);
--   · el consumo se reparte entre los renglones del ticket según la receta;
--   · el descuento a la cuenta completa baja la venta de cada renglón;
--   · una devolución que regresa al inventario resta venta, piezas y costo;
--   · un insumo que no tenía costo al vender se valúa con su costo actual y se reporta aparte;
--   · un insumo que sigue sin costo se marca;
--   · lo que se consumió con una receta que después cambió se reparte y se reporta aparte;
--   · el RLS: otro negocio no ve nada, ni por la vista ni por las funciones.
--
-- Las fechas se leen de los tickets que crea el propio smoke: NUNCA CURRENT_DATE contra fechas
-- de negocio (el servidor está en UTC y el día contable se calcula en México).
-- Uso: cd desktop && npm run smokes -- smoke_reportes_inventario.sql
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_t uuid := '99999999-0000-0000-0000-0000000000aa';
  v_s uuid := '99999999-0000-0000-0000-0000000000bb';
  v_c uuid := '99999999-0000-0000-0000-0000000000cc';
  v_m uuid := '99999999-0000-0000-0000-000000000001';
  v_cat uuid := 'a0000000-0000-0000-0000-0000000000c1';
  v_pza uuid;
  v_carne uuid; v_pan uuid; v_queso uuid; v_papa uuid; v_sal uuid; v_carne2 uuid;
  v_b uuid; v_p uuid; v_r uuid; v_d uuid;
  v_turno uuid; v_t1 uuid; v_t2 uuid; v_t3 uuid; v_t4 uuid; v_item_b uuid;
  v_auth uuid; v_dev uuid; v_total numeric; v_desde date; v_hasta date;
  v_f record; v_n int; v_suma numeric;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_m::text, 'tenant_id', v_t::text)::text, true);
  SELECT id INTO v_pza FROM unidades_medida WHERE tenant_id = v_t AND codigo = 'PZA' LIMIT 1;
  IF v_pza IS NULL THEN RAISE EXCEPTION 'falta la unidad PZA (seed 0035)'; END IF;

  -- Insumos: la sal nunca tiene costo; el queso no lo tiene al vender y lo gana después.
  INSERT INTO insumos (tenant_id, nombre, unidad_medida_id, categoria, costo_unitario_mxn) VALUES
    (v_t, 'Carne cv-smoke', v_pza, 'CARNICOS', 20) RETURNING id INTO v_carne;
  INSERT INTO insumos (tenant_id, nombre, unidad_medida_id, categoria, costo_unitario_mxn) VALUES
    (v_t, 'Pan cv-smoke', v_pza, 'PANIFICACION', 5) RETURNING id INTO v_pan;
  INSERT INTO insumos (tenant_id, nombre, unidad_medida_id, categoria, costo_unitario_mxn) VALUES
    (v_t, 'Queso cv-smoke', v_pza, 'LACTEOS', 0) RETURNING id INTO v_queso;
  INSERT INTO insumos (tenant_id, nombre, unidad_medida_id, categoria, costo_unitario_mxn) VALUES
    (v_t, 'Papa cv-smoke', v_pza, 'VEGETALES', 10) RETURNING id INTO v_papa;
  INSERT INTO insumos (tenant_id, nombre, unidad_medida_id, categoria, costo_unitario_mxn) VALUES
    (v_t, 'Sal cv-smoke', v_pza, 'CONDIMENTOS', 0) RETURNING id INTO v_sal;
  INSERT INTO insumos (tenant_id, nombre, unidad_medida_id, categoria, costo_unitario_mxn) VALUES
    (v_t, 'Carne nueva cv-smoke', v_pza, 'CARNICOS', 30) RETURNING id INTO v_carne2;

  -- Productos con IVA incluido al 16 %: 116 → 100 sin IVA, 58 → 50, 29 → 25, 232 → 200.
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, tasa_iva, iva_incluido_en_precio) VALUES
    (v_t, v_cat, 'Burger cv-smoke', 116, 16, true) RETURNING id INTO v_b;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, tasa_iva, iva_incluido_en_precio) VALUES
    (v_t, v_cat, 'Papas cv-smoke', 58, 16, true) RETURNING id INTO v_p;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, tasa_iva, iva_incluido_en_precio) VALUES
    (v_t, v_cat, 'Refresco cv-smoke', 29, 16, true) RETURNING id INTO v_r;
  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, tasa_iva, iva_incluido_en_precio) VALUES
    (v_t, v_cat, 'Doble cv-smoke', 232, 16, true) RETURNING id INTO v_d;

  -- Recetas. El refresco no tiene.
  PERFORM guardar_receta(v_b, true, NULL, jsonb_build_array(
    jsonb_build_object('insumo_id', v_carne, 'cantidad', 1, 'cantidad_capturada', 1, 'unidad_capturada_id', v_pza, 'es_critico', false, 'notas', NULL, 'orden', 0),
    jsonb_build_object('insumo_id', v_pan,   'cantidad', 1, 'cantidad_capturada', 1, 'unidad_capturada_id', v_pza, 'es_critico', false, 'notas', NULL, 'orden', 1),
    jsonb_build_object('insumo_id', v_queso, 'cantidad', 1, 'cantidad_capturada', 1, 'unidad_capturada_id', v_pza, 'es_critico', false, 'notas', NULL, 'orden', 2)));
  PERFORM guardar_receta(v_p, true, NULL, jsonb_build_array(
    jsonb_build_object('insumo_id', v_papa, 'cantidad', 1, 'cantidad_capturada', 1, 'unidad_capturada_id', v_pza, 'es_critico', false, 'notas', NULL, 'orden', 0),
    jsonb_build_object('insumo_id', v_sal,  'cantidad', 1, 'cantidad_capturada', 1, 'unidad_capturada_id', v_pza, 'es_critico', false, 'notas', NULL, 'orden', 1)));
  PERFORM guardar_receta(v_d, true, NULL, jsonb_build_array(
    jsonb_build_object('insumo_id', v_carne, 'cantidad', 2, 'cantidad_capturada', 2, 'unidad_capturada_id', v_pza, 'es_critico', false, 'notas', NULL, 'orden', 0),
    jsonb_build_object('insumo_id', v_pan,   'cantidad', 1, 'cantidad_capturada', 1, 'unidad_capturada_id', v_pza, 'es_critico', false, 'notas', NULL, 'orden', 1)));

  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_c AND estado = 'ABIERTO';
  INSERT INTO turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_t, v_s, v_c, 'SM-CV', calcular_dia_contable(v_t, now()), v_m, 500, 'TOTAL') RETURNING id INTO v_turno;

  -- 1) Descuento de inventario APAGADO: t1 vende una Burger sin dejar movimientos.
  INSERT INTO configuracion_tenant (tenant_id, modulo_inventario_activo) VALUES (v_t, false)
  ON CONFLICT (tenant_id) DO UPDATE SET modulo_inventario_activo = false;
  v_t1 := abrir_ticket(v_s, v_c, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'cv-smoke-t1', v_m);
  PERFORM agregar_item_a_ticket(v_t1, v_b, 1, NULL, '[]'::jsonb, 'cv-smoke-t1-b');
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_t1;
  PERFORM aplicar_pago(v_t1, 'EFECTIVO'::metodo_pago, v_total, v_total, NULL, NULL, NULL, false, NULL, 'cv-smoke-t1-pago');
  IF EXISTS (SELECT 1 FROM movimientos_inventario WHERE ticket_id = v_t1) THEN
    RAISE EXCEPTION 'con el descuento apagado t1 no debía dejar movimientos';
  END IF;

  -- 2) Encendido. t2: 2 Burger + 1 Papas + 1 Refresco (sin receta).
  UPDATE configuracion_tenant SET modulo_inventario_activo = true WHERE tenant_id = v_t;
  v_t2 := abrir_ticket(v_s, v_c, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'cv-smoke-t2', v_m);
  v_item_b := agregar_item_a_ticket(v_t2, v_b, 2, NULL, '[]'::jsonb, 'cv-smoke-t2-b');
  PERFORM agregar_item_a_ticket(v_t2, v_p, 1, NULL, '[]'::jsonb, 'cv-smoke-t2-p');
  PERFORM agregar_item_a_ticket(v_t2, v_r, 1, NULL, '[]'::jsonb, 'cv-smoke-t2-r');
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_t2;
  IF v_total <> 319 THEN RAISE EXCEPTION 't2: esperaba 319.00, es %', v_total; END IF;
  PERFORM aplicar_pago(v_t2, 'EFECTIVO'::metodo_pago, v_total, v_total, NULL, NULL, NULL, false, NULL, 'cv-smoke-t2-pago');

  -- 3) t3: 1 Papas con 20 % de descuento a la cuenta completa → cobra 46.40, vende 40 sin IVA.
  v_t3 := abrir_ticket(v_s, v_c, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'cv-smoke-t3', v_m);
  PERFORM agregar_item_a_ticket(v_t3, v_p, 1, NULL, '[]'::jsonb, 'cv-smoke-t3-p');
  INSERT INTO autorizaciones_pin (tenant_id, usuario_solicitante_id, usuario_autorizo_id, accion, permiso_codigo, motivo, caja_id, turno_id)
  VALUES (v_t, v_m, v_m, 'd', 'descuento.manual_aplicar', 't', v_c, v_turno) RETURNING id INTO v_auth;
  PERFORM aplicar_descuento_manual(v_t3, NULL, 'PORCENTAJE'::descuento_manual_tipo, 20, 'CLIENTE_FRECUENTE'::descuento_manual_motivo, '20', v_auth, v_m, v_m, 'cv-smoke-t3-desc');
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_t3;
  IF v_total <> 46.40 THEN RAISE EXCEPTION 't3: esperaba 46.40 con el 20 %%, es %', v_total; END IF;
  PERFORM aplicar_pago(v_t3, 'EFECTIVO'::metodo_pago, v_total, v_total, NULL, NULL, NULL, false, NULL, 'cv-smoke-t3-pago');

  -- 4) t4: 1 Doble (carne 2 + pan 1).
  v_t4 := abrir_ticket(v_s, v_c, v_turno, 'PARA_LLEVAR'::modo_servicio, NULL, NULL, 'cv-smoke-t4', v_m);
  PERFORM agregar_item_a_ticket(v_t4, v_d, 1, NULL, '[]'::jsonb, 'cv-smoke-t4-d');
  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_t4;
  PERFORM aplicar_pago(v_t4, 'EFECTIVO'::metodo_pago, v_total, v_total, NULL, NULL, NULL, false, NULL, 'cv-smoke-t4-pago');

  -- 5) Devolución de 1 de las 2 Burger de t2, de regreso al inventario (carne, pan y queso +1).
  -- 0134: con su propia autorización (venta.devolucion); la del descuento de t3 ya se usó.
  INSERT INTO autorizaciones_pin (tenant_id, usuario_solicitante_id, usuario_autorizo_id, accion, permiso_codigo, motivo, caja_id, turno_id)
  VALUES (v_t, v_m, v_m, 'devolucion', 'venta.devolucion', 't', v_c, v_turno) RETURNING id INTO v_auth;
  v_dev := crear_devolucion(v_t2, v_c, v_turno, 'PARCIAL'::devolucion_alcance, 'PRODUCTO_DEFECTUOSO'::devolucion_motivo, 'x',
    'EFECTIVO'::devolucion_medio, v_auth, v_m, v_m,
    jsonb_build_array(jsonb_build_object('ticket_item_id', v_item_b, 'cantidad_devuelta', 1)), true, NULL, NULL, 'cv-smoke-dev');
  PERFORM confirmar_devolucion(v_dev, v_m);
  SELECT count(*) INTO v_n FROM movimientos_inventario WHERE ticket_id = v_t2 AND tipo = 'REVERSA_CANCELACION';
  IF v_n <> 3 THEN RAISE EXCEPTION 'la devolución debía regresar 3 insumos, regresó %', v_n; END IF;

  -- 6) El queso gana costo DESPUÉS de venderse; 7) la receta del Doble cambia de carne a carne nueva.
  UPDATE insumos SET costo_unitario_mxn = 8 WHERE id = v_queso;
  PERFORM guardar_receta(v_d, true, NULL, jsonb_build_array(
    jsonb_build_object('insumo_id', v_pan,    'cantidad', 1, 'cantidad_capturada', 1, 'unidad_capturada_id', v_pza, 'es_critico', false, 'notas', NULL, 'orden', 0),
    jsonb_build_object('insumo_id', v_carne2, 'cantidad', 2, 'cantidad_capturada', 2, 'unidad_capturada_id', v_pza, 'es_critico', false, 'notas', NULL, 'orden', 1)));

  SELECT min(dia_contable), max(dia_contable) INTO v_desde, v_hasta FROM tickets WHERE id IN (v_t1, v_t2, v_t3, v_t4);
  -- Para los bloques de abajo, que corren con otro rol.
  PERFORM set_config('smoke_cv.desde', v_desde::text, true);
  PERFORM set_config('smoke_cv.hasta', v_hasta::text, true);

  -- ── P-150 ────────────────────────────────────────────────────────────────────────────────
  -- Burger: t1 (sin costo) + t2 neto de la devolución. Costo: carne 20 + pan 5 + queso 8, este
  -- último estimado con su costo actual porque al vender no tenía.
  SELECT * INTO v_f FROM reporte_costo_ventas(v_desde, v_hasta) WHERE producto_id = v_b;
  RAISE NOTICE 'Burger: %', row_to_json(v_f);
  IF v_f.unidades <> 2 OR v_f.venta_mxn <> 200 THEN RAISE EXCEPTION 'Burger: esperaba 2 piezas y $200, dio % y %', v_f.unidades, v_f.venta_mxn; END IF;
  IF v_f.unidades_con_costo <> 1 OR v_f.venta_con_costo_mxn <> 100 THEN
    RAISE EXCEPTION 'Burger: la venta de t1 (descuento apagado) no debía contar como costeada: % piezas, $%', v_f.unidades_con_costo, v_f.venta_con_costo_mxn;
  END IF;
  IF v_f.costo_mxn <> 33 OR v_f.costo_estimado_mxn <> 8 OR v_f.costo_repartido_mxn <> 0 THEN
    RAISE EXCEPTION 'Burger: esperaba costo 33 (8 estimado, 0 repartido), dio % (% / %)', v_f.costo_mxn, v_f.costo_estimado_mxn, v_f.costo_repartido_mxn;
  END IF;
  IF NOT v_f.tiene_receta OR v_f.insumo_sin_costo THEN RAISE EXCEPTION 'Burger: banderas de receta/costo incorrectas'; END IF;

  -- Papas: t2 (50) + t3 (50 × 0.8 = 40). La sal no tiene costo ni lo tuvo: se marca.
  SELECT * INTO v_f FROM reporte_costo_ventas(v_desde, v_hasta) WHERE producto_id = v_p;
  RAISE NOTICE 'Papas: %', row_to_json(v_f);
  IF v_f.unidades <> 2 OR v_f.venta_mxn <> 90 OR v_f.venta_con_costo_mxn <> 90 THEN
    RAISE EXCEPTION 'Papas: esperaba 2 piezas y $90 (el descuento de t3 repartido), dio % y %', v_f.unidades, v_f.venta_mxn;
  END IF;
  IF v_f.costo_mxn <> 20 OR NOT v_f.insumo_sin_costo THEN RAISE EXCEPTION 'Papas: esperaba costo 20 con la sal marcada sin costo, dio % / %', v_f.costo_mxn, v_f.insumo_sin_costo; END IF;

  -- Refresco: sin receta, sin costo — y no se lleva nada del consumo ajeno.
  SELECT * INTO v_f FROM reporte_costo_ventas(v_desde, v_hasta) WHERE producto_id = v_r;
  IF v_f.unidades <> 1 OR v_f.venta_mxn <> 25 OR v_f.tiene_receta OR v_f.unidades_con_costo <> 0 OR v_f.costo_mxn <> 0 THEN
    RAISE EXCEPTION 'Refresco: esperaba 1 pieza, $25, sin receta y sin costo, dio %', row_to_json(v_f);
  END IF;

  -- Doble: la carne salió con la receta vieja; hoy la receta pide carne nueva. Los 40 de carne se
  -- le reparten (es el único renglón de t4) y se reportan como repartidos.
  SELECT * INTO v_f FROM reporte_costo_ventas(v_desde, v_hasta) WHERE producto_id = v_d;
  RAISE NOTICE 'Doble: %', row_to_json(v_f);
  IF v_f.costo_mxn <> 45 OR v_f.costo_repartido_mxn <> 40 OR v_f.venta_con_costo_mxn <> 200 THEN
    RAISE EXCEPTION 'Doble: esperaba costo 45 con 40 repartidos, dio % / %', v_f.costo_mxn, v_f.costo_repartido_mxn;
  END IF;

  -- El costo total es exactamente lo que la venta sacó del inventario (neto de lo que regresó).
  SELECT sum(r.costo_mxn) INTO v_suma
    FROM reporte_costo_ventas(v_desde, v_hasta) r
   WHERE r.producto_id IN (v_b, v_p, v_r, v_d);
  IF v_suma <> 98 THEN RAISE EXCEPTION 'costo total: esperaba 98, dio %', v_suma; END IF;

  -- Otra sucursal: nada.
  SELECT count(*) INTO v_n FROM reporte_costo_ventas(v_desde, v_hasta, gen_random_uuid()) WHERE producto_id IN (v_b, v_p, v_r, v_d);
  IF v_n <> 0 THEN RAISE EXCEPTION 'con otra sucursal no debía salir nada, salieron %', v_n; END IF;

  -- ── P-149 ────────────────────────────────────────────────────────────────────────────────
  -- 9 salidas por venta (t2: 5, t3: 2, t4: 2) por $115, y 3 regresos por $25 (el queso regresó a $0).
  SELECT movimientos, costo_mxn INTO v_f FROM resumen_movimientos_inventario(v_desde, v_hasta, NULL, 'cv-smoke') WHERE tipo = 'SALIDA_VENTA';
  IF v_f.movimientos <> 9 OR v_f.costo_mxn <> 115 THEN RAISE EXCEPTION 'resumen SALIDA_VENTA: esperaba 9 / 115, dio % / %', v_f.movimientos, v_f.costo_mxn; END IF;
  SELECT movimientos, costo_mxn INTO v_f FROM resumen_movimientos_inventario(v_desde, v_hasta, NULL, 'cv-smoke') WHERE tipo = 'REVERSA_CANCELACION';
  IF v_f.movimientos <> 3 OR v_f.costo_mxn <> 25 THEN RAISE EXCEPTION 'resumen REVERSA: esperaba 3 / 25, dio % / %', v_f.movimientos, v_f.costo_mxn; END IF;
  -- La búsqueda es la del nombre del insumo: "papa" encuentra solo la papa (2 salidas).
  SELECT coalesce(sum(movimientos), 0) INTO v_n FROM resumen_movimientos_inventario(v_desde, v_hasta, NULL, 'papa cv-smoke');
  IF v_n <> 2 THEN RAISE EXCEPTION 'resumen con búsqueda "papa": esperaba 2, dio %', v_n; END IF;

  -- La vista: signo, folio del ticket y quién cobró (el descuento por venta no guarda usuario).
  SELECT count(*) INTO v_n FROM vw_movimientos_inventario
   WHERE tenant_id = v_t AND insumo_nombre LIKE '%cv-smoke' AND dia_contable BETWEEN v_desde AND v_hasta;
  IF v_n <> 12 THEN RAISE EXCEPTION 'vista: esperaba 12 movimientos, hay %', v_n; END IF;
  IF EXISTS (SELECT 1 FROM vw_movimientos_inventario
              WHERE tenant_id = v_t AND insumo_nombre LIKE '%cv-smoke'
                AND ((tipo = 'SALIDA_VENTA' AND signo <> -1) OR (tipo = 'REVERSA_CANCELACION' AND signo <> 1)
                     OR ticket_folio IS NULL OR usuario_id IS DISTINCT FROM v_m)) THEN
    RAISE EXCEPTION 'vista: signo, folio o usuario incorrectos';
  END IF;

  RAISE NOTICE 'OK reportes de inventario como postgres';
END $$;

-- ── Bajo RLS, como el dueño del negocio ──────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"99999999-0000-0000-0000-000000000001","tenant_id":"99999999-0000-0000-0000-0000000000aa","role":"authenticated"}';
DO $$
DECLARE
  v_desde date := current_setting('smoke_cv.desde')::date;
  v_hasta date := current_setting('smoke_cv.hasta')::date;
  v_n int; v_suma numeric;
BEGIN
  SELECT count(*) INTO v_n FROM vw_movimientos_inventario WHERE insumo_nombre LIKE '%cv-smoke' AND dia_contable BETWEEN v_desde AND v_hasta;
  IF v_n <> 12 THEN RAISE EXCEPTION 'RLS propio: la vista debía dar 12 movimientos, dio %', v_n; END IF;
  SELECT sum(costo_mxn) INTO v_suma FROM reporte_costo_ventas(v_desde, v_hasta) WHERE producto_nombre LIKE '%cv-smoke';
  IF v_suma <> 98 THEN RAISE EXCEPTION 'RLS propio: el costo debía dar 98, dio %', v_suma; END IF;
  RAISE NOTICE 'OK reportes de inventario bajo RLS del negocio';
END $$;

-- ── Bajo RLS, como OTRO negocio ─────────────────────────────────────────────────────────────
SET LOCAL "request.jwt.claims" = '{"sub":"99999999-0000-0000-0000-0000000000f1","tenant_id":"99999999-0000-0000-0000-0000000000ff","role":"authenticated"}';
DO $$
DECLARE
  v_desde date := current_setting('smoke_cv.desde')::date;
  v_hasta date := current_setting('smoke_cv.hasta')::date;
  v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM vw_movimientos_inventario WHERE insumo_nombre LIKE '%cv-smoke';
  IF v_n <> 0 THEN RAISE EXCEPTION 'FUGA: otro negocio ve % movimientos por la vista', v_n; END IF;
  SELECT count(*) INTO v_n FROM reporte_costo_ventas(v_desde, v_hasta) WHERE producto_nombre LIKE '%cv-smoke';
  IF v_n <> 0 THEN RAISE EXCEPTION 'FUGA: otro negocio ve % productos en el costo de ventas', v_n; END IF;
  SELECT count(*) INTO v_n FROM resumen_movimientos_inventario(v_desde, v_hasta, NULL, 'cv-smoke');
  IF v_n <> 0 THEN RAISE EXCEPTION 'FUGA: otro negocio ve % tipos en el resumen', v_n; END IF;
  RAISE NOTICE 'SMOKE REPORTES INVENTARIO OK';
END $$;

ROLLBACK;
