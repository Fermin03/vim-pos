-- Smoke compras (spec 2026-09-03 §4.1, §4.2): registrar_compra genera ENTRADA_COMPRA por línea,
-- actualiza existencias y costo promedio, guarda alias; anular_compra regresa existencias con
-- DEVOLUCION_PROVEEDOR sin tocar el costo promedio; el mismo cfdi_uuid no se registra dos veces.
-- registrar_compra valida que insumos/unidades de líneas y alias sean del negocio (la FK no pasa
-- por RLS). ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_dueno  uuid := '99999999-0000-0000-0000-0000000000e1';
  v_pza uuid; v_caja uuid; v_prov uuid; v_insumo uuid; v_c1 uuid; v_c2 uuid;
  v_stock numeric; v_costo numeric; v_folio text; v_estado text; v_n int; v_movs int; v_factor numeric;
  v_uuid uuid := 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  v_ajeno uuid; v_pza_ajena uuid;
BEGIN
  -- Fixture de otro negocio, insertada como postgres (superusuario, bypasea RLS) ANTES de fijar
  -- los claims del JWT de abajo: set_config solo afecta a current_tenant_id(), no al bypass.
  INSERT INTO tenants(id, codigo, nombre_comercial, vertical_principal)
  VALUES ('99999999-0000-0000-0000-0000000000ff', 'smoke-ajeno', 'Ajeno', 'QUICK_SERVICE') ON CONFLICT (id) DO NOTHING;
  SELECT id INTO v_pza_ajena FROM unidades_medida WHERE tenant_id=v_tenant AND codigo='PZA' LIMIT 1; -- reuse seed unit only to satisfy NOT NULL
  INSERT INTO insumos(tenant_id, nombre, unidad_medida_id, categoria, costo_unitario_mxn)
  VALUES ('99999999-0000-0000-0000-0000000000ff', 'Insumo ajeno', v_pza_ajena, 'OTROS', 1) RETURNING id INTO v_ajeno;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno::text, 'tenant_id', v_tenant::text)::text, true);
  SELECT id INTO v_pza  FROM unidades_medida WHERE tenant_id=v_tenant AND codigo='PZA' LIMIT 1;
  SELECT id INTO v_caja FROM unidades_medida WHERE tenant_id=v_tenant AND codigo='CAJ' LIMIT 1;
  IF v_pza IS NULL OR v_caja IS NULL THEN RAISE EXCEPTION 'faltan unidades PZA/CAJ (seed 0035)'; END IF;

  INSERT INTO proveedores(tenant_id, nombre, rfc) VALUES (v_tenant, 'Panificadora Smoke', 'PSM010101AB1') RETURNING id INTO v_prov;
  INSERT INTO insumos(tenant_id, nombre, unidad_medida_id, categoria, costo_unitario_mxn)
  VALUES (v_tenant, 'Pan brioche smoke', v_pza, 'PANIFICACION', 10) RETURNING id INTO v_insumo;

  -- 1) Compra de 2 cajas de 12 = 24 pzas a $12.50 (importe 300) desde XML, con alias.
  v_c1 := registrar_compra(jsonb_build_object(
    'sucursal_id', v_suc, 'proveedor_id', v_prov, 'fecha', '2026-09-03', 'referencia_documento', 'A 1234',
    'cfdi_uuid', v_uuid, 'origen', 'XML', 'notas', NULL, 'iva_mxn', 48.00,
    'lineas', jsonb_build_array(jsonb_build_object(
      'insumo_id', v_insumo, 'descripcion_origen', 'PAN BRIOCHE CAJA 12 PZ',
      'cantidad_capturada', 2, 'unidad_capturada_id', v_caja,
      'cantidad', 24, 'costo_unitario_mxn', 12.5, 'importe_mxn', 300.00)),
    'aliases', jsonb_build_array(jsonb_build_object(
      'clave_origen', 'PB-12', 'descripcion_origen', 'PAN BRIOCHE CAJA 12 PZ',
      'insumo_id', v_insumo, 'unidad_id', v_caja, 'factor', 12))));

  SELECT folio_completo, estado::text, total_mxn INTO v_folio, v_estado, v_costo FROM compras WHERE id=v_c1;
  RAISE NOTICE 'compra 1: folio % estado % total % (esperado K?-2026-…, CONFIRMADA, 348)', v_folio, v_estado, v_costo;
  IF v_folio IS NULL OR v_estado <> 'CONFIRMADA' OR v_costo <> 348 THEN RAISE EXCEPTION 'cabecera incorrecta'; END IF;

  SELECT stock_actual INTO v_stock FROM insumo_stock_sucursal WHERE insumo_id=v_insumo AND sucursal_id=v_suc;
  SELECT costo_unitario_mxn INTO v_costo FROM insumos WHERE id=v_insumo;
  RAISE NOTICE 'tras compra 1: stock % (24) costo % (12.5, promedio con stock 0)', v_stock, v_costo;
  IF v_stock <> 24 THEN RAISE EXCEPTION 'stock esperado 24'; END IF;
  IF round(v_costo, 2) <> 12.50 THEN RAISE EXCEPTION 'costo esperado 12.50, es %', v_costo; END IF;

  SELECT count(*) INTO v_movs FROM movimientos_inventario WHERE compra_id=v_c1 AND tipo='ENTRADA_COMPRA';
  IF v_movs <> 1 THEN RAISE EXCEPTION 'debe haber 1 ENTRADA_COMPRA ligada'; END IF;
  IF (SELECT movimiento_id FROM compra_lineas WHERE compra_id=v_c1) IS NULL THEN RAISE EXCEPTION 'la línea no guardó movimiento_id'; END IF;
  SELECT factor INTO v_factor FROM proveedor_insumo_alias WHERE proveedor_id=v_prov AND clave_origen='PB-12';
  IF v_factor <> 12 THEN RAISE EXCEPTION 'alias no guardado'; END IF;

  -- 2) Segunda compra manual: 24 pzas a $15 → promedio ponderado (24×12.5 + 24×15)/48 = 13.75
  v_c2 := registrar_compra(jsonb_build_object(
    'sucursal_id', v_suc, 'proveedor_id', v_prov, 'fecha', '2026-09-04', 'referencia_documento', 'Nota 7',
    'cfdi_uuid', NULL, 'origen', 'MANUAL', 'notas', 'sin factura',
    'lineas', jsonb_build_array(jsonb_build_object(
      'insumo_id', v_insumo, 'descripcion_origen', NULL,
      'cantidad_capturada', 24, 'unidad_capturada_id', v_pza,
      'cantidad', 24, 'costo_unitario_mxn', 15, 'importe_mxn', 360.00)),
    'aliases', '[]'::jsonb));
  SELECT costo_unitario_mxn INTO v_costo FROM insumos WHERE id=v_insumo;
  SELECT iva_mxn, total_mxn INTO v_factor, v_stock FROM compras WHERE id=v_c2;
  RAISE NOTICE 'tras compra 2: costo % (13.75) iva % (57.6) total % (417.6)', v_costo, v_factor, v_stock;
  IF round(v_costo, 2) <> 13.75 THEN RAISE EXCEPTION 'promedio esperado 13.75'; END IF;
  IF v_factor <> 57.60 OR v_stock <> 417.60 THEN RAISE EXCEPTION 'IVA 16%% por defecto mal calculado'; END IF;

  -- 3) Anular la segunda: stock vuelve a 24, costo promedio NO cambia, estado ANULADA.
  PERFORM anular_compra(v_c2, 'Se devolvió al proveedor');
  SELECT stock_actual INTO v_stock FROM insumo_stock_sucursal WHERE insumo_id=v_insumo AND sucursal_id=v_suc;
  SELECT costo_unitario_mxn INTO v_costo FROM insumos WHERE id=v_insumo;
  SELECT estado::text INTO v_estado FROM compras WHERE id=v_c2;
  SELECT count(*) INTO v_movs FROM movimientos_inventario WHERE compra_id=v_c2 AND tipo='DEVOLUCION_PROVEEDOR';
  RAISE NOTICE 'tras anular: stock % (24) costo % (13.75) estado % movs reversa % (1)', v_stock, v_costo, v_estado, v_movs;
  IF v_stock <> 24 OR round(v_costo,2) <> 13.75 OR v_estado <> 'ANULADA' OR v_movs <> 1 THEN RAISE EXCEPTION 'anulación incorrecta'; END IF;
  IF (SELECT movimiento_reversa_id FROM compra_lineas WHERE compra_id=v_c2) IS NULL THEN RAISE EXCEPTION 'la línea no guardó movimiento_reversa_id'; END IF;

  -- 4) Anular dos veces → error
  BEGIN
    PERFORM anular_compra(v_c2, 'otra vez');
    RAISE EXCEPTION 'debió fallar: ya anulada';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%ya está anulada%' THEN RAISE; END IF;
  END;

  -- 5) Mismo UUID → error con el folio de la compra existente
  BEGIN
    PERFORM registrar_compra(jsonb_build_object(
      'sucursal_id', v_suc, 'proveedor_id', v_prov, 'fecha', '2026-09-05', 'cfdi_uuid', v_uuid, 'origen', 'XML',
      'lineas', jsonb_build_array(jsonb_build_object('insumo_id', v_insumo, 'cantidad_capturada', 1,
        'unidad_capturada_id', v_pza, 'cantidad', 1, 'costo_unitario_mxn', 1, 'importe_mxn', 1)),
      'aliases', '[]'::jsonb));
    RAISE EXCEPTION 'debió fallar: uuid repetido';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%ya está registrada como la compra ' || v_folio || '%' THEN RAISE; END IF;
  END;

  -- 6) Sin líneas → error
  BEGIN
    PERFORM registrar_compra(jsonb_build_object('sucursal_id', v_suc, 'proveedor_id', v_prov, 'fecha', '2026-09-05',
      'origen', 'MANUAL', 'lineas', '[]'::jsonb, 'aliases', '[]'::jsonb));
    RAISE EXCEPTION 'debió fallar: sin líneas';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%al menos un insumo%' THEN RAISE; END IF;
  END;

  -- 7) Alias con insumo de otro negocio → error (la FK sola no lo impediría)
  BEGIN
    PERFORM registrar_compra(jsonb_build_object(
      'sucursal_id', v_suc, 'proveedor_id', v_prov, 'fecha', '2026-09-05', 'origen', 'MANUAL',
      'lineas', jsonb_build_array(jsonb_build_object('insumo_id', v_insumo, 'cantidad_capturada', 1,
        'unidad_capturada_id', v_pza, 'cantidad', 1, 'costo_unitario_mxn', 1, 'importe_mxn', 1)),
      'aliases', jsonb_build_array(jsonb_build_object(
        'clave_origen', 'AJENO-1', 'descripcion_origen', NULL,
        'insumo_id', v_ajeno, 'unidad_id', v_pza, 'factor', 1))));
    RAISE EXCEPTION 'debió fallar: alias con insumo de otro negocio';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%no es de tu negocio%' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'SMOKE COMPRAS OK';
END $$;
ROLLBACK;
