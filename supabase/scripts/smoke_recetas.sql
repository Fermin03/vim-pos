-- Smoke recetas (spec 2026-09-03 §4.3, §3.6): guardar_receta crea/actualiza y reemplaza componentes;
-- el costo se recalcula al guardar y al editar el costo del insumo a mano. ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_dueno  uuid := '99999999-0000-0000-0000-0000000000e1';
  v_pza uuid; v_g uuid; v_carne uuid; v_pan uuid; v_prod uuid; v_receta uuid;
  v_costo numeric; v_n int; v_version int;
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
  SELECT id INTO v_pza FROM unidades_medida WHERE tenant_id=v_tenant AND codigo='PZA' LIMIT 1;
  SELECT id INTO v_g   FROM unidades_medida WHERE tenant_id=v_tenant AND codigo='G' LIMIT 1;
  IF v_pza IS NULL OR v_g IS NULL THEN RAISE EXCEPTION 'faltan unidades PZA/G (seed 0035)'; END IF;

  INSERT INTO insumos(tenant_id, nombre, unidad_medida_id, categoria, costo_unitario_mxn)
  VALUES (v_tenant, 'Carne smoke', v_g, 'CARNICOS', 0.18) RETURNING id INTO v_carne;      -- $0.18/g
  INSERT INTO insumos(tenant_id, nombre, unidad_medida_id, categoria, costo_unitario_mxn)
  VALUES (v_tenant, 'Pan smoke', v_pza, 'PANIFICACION', 4) RETURNING id INTO v_pan;

  SELECT id INTO v_prod FROM productos WHERE tenant_id=v_tenant AND deleted_at IS NULL LIMIT 1;
  IF v_prod IS NULL THEN RAISE EXCEPTION 'no hay producto seed'; END IF;
  DELETE FROM recetas WHERE producto_id = v_prod;

  -- 1) Crear: 150 g carne + 1 pan = 27 + 4 = 31
  v_receta := guardar_receta(v_prod, true, 'Plancha 3 min', jsonb_build_array(
    jsonb_build_object('insumo_id', v_carne, 'cantidad', 150, 'cantidad_capturada', 150, 'unidad_capturada_id', v_g, 'es_critico', true, 'notas', NULL, 'orden', 0),
    jsonb_build_object('insumo_id', v_pan,   'cantidad', 1,   'cantidad_capturada', 1,   'unidad_capturada_id', v_pza, 'es_critico', true, 'notas', NULL, 'orden', 1)));
  SELECT costo_total_mxn, version INTO v_costo, v_version FROM recetas WHERE id=v_receta;
  RAISE NOTICE 'costo tras crear: % (esperado 31) version % (esperado 1)', v_costo, v_version;
  IF v_costo <> 31 THEN RAISE EXCEPTION 'costo esperado 31, es %', v_costo; END IF;
  IF v_version <> 1 THEN RAISE EXCEPTION 'version esperada 1'; END IF;

  -- 2) Editar costo del insumo a mano → trigger nuevo recalcula: 150×0.20 + 4 = 34
  UPDATE insumos SET costo_unitario_mxn = 0.20 WHERE id = v_carne;
  SELECT costo_total_mxn INTO v_costo FROM recetas WHERE id=v_receta;
  RAISE NOTICE 'costo tras editar insumo: % (esperado 34)', v_costo;
  IF v_costo <> 34 THEN RAISE EXCEPTION 'el trigger de costo no recalculó (es %)', v_costo; END IF;

  -- 3) Reemplazar componentes: solo 2 panes = 8; version sube a 2
  PERFORM guardar_receta(v_prod, true, NULL, jsonb_build_array(
    jsonb_build_object('insumo_id', v_pan, 'cantidad', 2, 'cantidad_capturada', 2, 'unidad_capturada_id', v_pza, 'es_critico', false, 'notas', NULL, 'orden', 0)));
  SELECT costo_total_mxn, version INTO v_costo, v_version FROM recetas WHERE id=v_receta;
  SELECT count(*) INTO v_n FROM receta_componentes WHERE receta_id=v_receta;
  RAISE NOTICE 'tras reemplazar: costo % (8) componentes % (1) version % (2)', v_costo, v_n, v_version;
  IF v_costo <> 8 OR v_n <> 1 OR v_version <> 2 THEN RAISE EXCEPTION 'reemplazo de componentes incorrecto'; END IF;

  -- 4) Receta activa sin componentes → error
  BEGIN
    PERFORM guardar_receta(v_prod, true, NULL, '[]'::jsonb);
    RAISE EXCEPTION 'debió fallar: activa sin componentes';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%al menos un insumo%' THEN RAISE; END IF;
  END;

  -- 5) Pausada sin componentes → permitido
  PERFORM guardar_receta(v_prod, false, NULL, '[]'::jsonb);
  IF (SELECT activa FROM recetas WHERE id=v_receta) THEN RAISE EXCEPTION 'debió quedar pausada'; END IF;

  -- 6) Insumo de otro negocio → error (la FK sola no lo impediría)
  BEGIN
    PERFORM guardar_receta(v_prod, true, NULL, jsonb_build_array(
      jsonb_build_object('insumo_id', v_ajeno, 'cantidad', 1, 'cantidad_capturada', 1, 'unidad_capturada_id', v_pza, 'es_critico', true, 'notas', NULL, 'orden', 0)));
    RAISE EXCEPTION 'debió fallar: insumo de otro negocio';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%no es de tu negocio%' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'SMOKE RECETAS OK';
END $$;
ROLLBACK;
