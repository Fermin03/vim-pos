-- Smoke Tier1 Inventario: crear insumo + entrada de compra + verificar que el stock por sucursal
-- sube vía aplicar_movimiento_inventario. ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_dueno  uuid := '99999999-0000-0000-0000-0000000000e1';
  v_unidad uuid; v_insumo uuid; v_stock numeric;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno::text, 'tenant_id', v_tenant::text)::text, true);
  SELECT id INTO v_unidad FROM unidades_medida WHERE tenant_id=v_tenant AND codigo='KG' LIMIT 1;
  IF v_unidad IS NULL THEN RAISE EXCEPTION 'no hay unidad KG (seed 0035)'; END IF;

  INSERT INTO insumos(tenant_id, nombre, unidad_medida_id, categoria, costo_unitario_mxn, stock_minimo_global)
  VALUES (v_tenant, 'Carne molida', v_unidad, 'CARNICOS', 180, 5) RETURNING id INTO v_insumo;

  -- Entrada de 10 kg
  PERFORM aplicar_movimiento_inventario(v_tenant, v_suc, v_insumo, 'ENTRADA_COMPRA'::movimiento_inventario_tipo, 10, 180, v_dueno, 'Compra inicial');
  SELECT stock_actual INTO v_stock FROM insumo_stock_sucursal WHERE insumo_id=v_insumo AND sucursal_id=v_suc;
  RAISE NOTICE 'stock tras entrada de 10: % (esperado 10)', v_stock;
  IF v_stock <> 10 THEN RAISE EXCEPTION 'el stock no subió a 10'; END IF;

  -- Merma de 2
  PERFORM aplicar_movimiento_inventario(v_tenant, v_suc, v_insumo, 'MERMA'::movimiento_inventario_tipo, 2, NULL, v_dueno, 'Producto echado a perder');
  SELECT stock_actual INTO v_stock FROM insumo_stock_sucursal WHERE insumo_id=v_insumo AND sucursal_id=v_suc;
  RAISE NOTICE 'stock tras merma de 2: % (esperado 8)', v_stock;
  IF v_stock <> 8 THEN RAISE EXCEPTION 'la merma no bajó el stock a 8'; END IF;

  RAISE NOTICE 'SMOKE INVENTARIO OK: insumo creado + entrada 10 + merma 2 -> stock 8.';
END $$;
ROLLBACK;
