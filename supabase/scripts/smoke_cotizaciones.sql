-- Smoke cotizaciones (retail 2, entrega 3; 0212). Hace ROLLBACK.
-- Ejecutar: cd desktop && npm run smokes -- smoke_cotizaciones.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_cat    uuid := 'c2120000-0000-0000-0000-0000000000c1';
  v_pa     uuid := 'c2120000-0000-0000-0000-0000000000a1';   -- $100 con IVA incluido
  v_pb     uuid := 'c2120000-0000-0000-0000-0000000000a2';   -- $80/kg, IVA por afuera
  v_padre  uuid; v_combo uuid;
  v_ana    uuid := 'c2120000-0000-0000-0000-000000000001';
  v_turno  uuid; v_tk uuid; j jsonb; j2 jsonb; v_c1 uuid; v_c2 uuid; v_tok text; v_n integer; v_ok boolean;
  v_rx jsonb; v_vp text; v_vc text; v_ca jsonb; v_mov integer; v_exi numeric; v_hoy date;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_t::text)::text, true);
  INSERT INTO categorias (id, tenant_id, nombre) VALUES (v_cat, v_t, 'Cotizaciones');
  INSERT INTO productos (id, tenant_id, nombre, categoria_id, precio_base_mxn, codigo_interno, clave_sat, unidad_sat)
  VALUES (v_pa, v_t, 'Botas', v_cat, 100, 'BOT-1', '53111600', 'H87');
  INSERT INTO productos (id, tenant_id, nombre, categoria_id, precio_base_mxn, iva_incluido_en_precio)
  VALUES (v_pb, v_t, 'Clavo a granel', v_cat, 80, false);
  INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, variante_ejes)
  VALUES (v_t, 'Playera', v_cat, 50, ARRAY['Talla']) RETURNING id INTO v_padre;
  INSERT INTO productos (tenant_id, nombre, categoria_id, precio_base_mxn, es_combo, clave_sat)
  VALUES (v_t, 'Paquete', v_cat, 150, true, '90101500') RETURNING id INTO v_combo;
  INSERT INTO clientes (id, tenant_id, nombre, apellido_paterno, telefono) VALUES (v_ana, v_t, 'Ana', 'Cotiza', '4770002121');
  INSERT INTO configuracion_tenant (tenant_id) VALUES (v_t) ON CONFLICT (tenant_id) DO NOTHING;
  INSERT INTO producto_existencias (tenant_id, sucursal_id, producto_id, cantidad) VALUES (v_t, v_suc, v_pb, 10)
    ON CONFLICT DO NOTHING;
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_t, v_suc, v_caja, 'SMOKE-COT', (now() AT TIME ZONE 'America/Mexico_City')::date, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;

  -- 1) Nace apagado: ni en modulos_efectivos ni en guardar.
  IF (SELECT cotizacion_vigencia_dias FROM configuracion_tenant WHERE tenant_id = v_t) <> 15 THEN
    RAISE EXCEPTION '1: la vigencia debía nacer en 15 días'; END IF;
  IF (modulos_efectivos(v_t)->'efectivos'->>'cotizaciones')::boolean IS DISTINCT FROM false
     OR (modulos_efectivos(v_t)->'permitidos'->>'cotizaciones')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION '1: cotizaciones debía nacer permitido y apagado: %', modulos_efectivos(v_t);
  END IF;
  BEGIN
    PERFORM guardar_cotizacion(v_suc, v_caja, NULL, jsonb_build_array(jsonb_build_object('producto_id', v_pa, 'cantidad', 1)), 'smoke-cot-0');
    RAISE EXCEPTION '1: guardó con el módulo apagado';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'DATOS_INVALIDOS:%' THEN RAISE; END IF;
  END;
  UPDATE configuracion_tenant SET modulo_cotizaciones_activo = true WHERE tenant_id = v_t;
  IF (modulos_efectivos(v_t)->'efectivos'->>'cotizaciones')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION '1: cotizaciones no se encendió'; END IF;

  -- Lo que una cotización no debe tocar.
  v_rx  := reporte_x(v_turno);
  SELECT md5(COALESCE(string_agg(v::text, '|' ORDER BY v::text), '')) INTO v_vp FROM vw_ventas_por_producto v;
  SELECT md5(COALESCE(string_agg(v::text, '|' ORDER BY v::text), '')) INTO v_vc FROM vw_ventas_por_categoria v;
  v_ca  := operacion_cuentas_abiertas(v_t);
  SELECT count(*) INTO v_mov FROM movimientos_producto WHERE tenant_id = v_t;
  SELECT cantidad INTO v_exi FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_pb;

  -- 2) Dos renglones; el precio del cliente se ignora.
  --    Botas 2 × 100 (IVA incluido): 200, IVA 27.59.  Clavo 1.250 × 80 (por afuera): 100 + 16 = 116.
  j := guardar_cotizacion(v_suc, v_caja, v_ana, jsonb_build_array(
         jsonb_build_object('producto_id', v_pa, 'cantidad', 2, 'precio_unitario', 1),
         jsonb_build_object('producto_id', v_pb, 'cantidad', 1.250)), 'smoke-cot-1');
  v_c1 := (j->>'id')::uuid;
  v_tok := j->>'token_publico';
  SELECT (now() AT TIME ZONE timezone)::date INTO v_hoy FROM tenants WHERE id = v_t;
  IF j->>'folio' NOT LIKE 'COT-%' THEN RAISE EXCEPTION '2: folio %', j->>'folio'; END IF;
  IF (j->>'total')::numeric <> 316 THEN RAISE EXCEPTION '2: total % (esperado 316)', j->>'total'; END IF;
  IF (j->>'vigente_hasta')::date <> v_hoy + 15 THEN RAISE EXCEPTION '2: vigencia %', j->>'vigente_hasta'; END IF;
  IF length(v_tok) < 24 OR v_tok !~ '^[A-Za-z0-9_-]+$' THEN RAISE EXCEPTION '2: token %', v_tok; END IF;
  SELECT to_jsonb(c) INTO j2 FROM cotizaciones c WHERE id = v_c1;
  IF (j2->>'estado') <> 'VIGENTE' OR (j2->>'iva_mxn')::numeric <> 43.59 OR (j2->>'subtotal_mxn')::numeric <> 272.41
     OR (j2->>'cliente_id')::uuid <> v_ana OR (j2->>'folio') <> (j->>'folio') THEN
    RAISE EXCEPTION '2: la cotización quedó %', j2;
  END IF;
  IF (SELECT precio_unitario_snapshot FROM cotizacion_items WHERE cotizacion_id = v_c1 AND producto_id = v_pa) <> 100 THEN
    RAISE EXCEPTION '2: se usó el precio del cliente'; END IF;
  SELECT to_jsonb(i) INTO j2 FROM cotizacion_items i WHERE cotizacion_id = v_c1 AND producto_id = v_pb;
  IF (j2->>'cantidad')::numeric <> 1.250 OR (j2->>'subtotal_bruto_mxn')::numeric <> 100
     OR (j2->>'iva_item_mxn')::numeric <> 16 OR (j2->>'total_item_mxn')::numeric <> 116 THEN
    RAISE EXCEPTION '2: el renglón a granel quedó %', j2;
  END IF;
  SELECT to_jsonb(i) INTO j2 FROM cotizacion_items i WHERE cotizacion_id = v_c1 AND producto_id = v_pa;
  IF (j2->>'iva_item_mxn')::numeric <> 27.59 OR (j2->>'producto_sku_snapshot') <> 'BOT-1'
     OR (j2->>'clave_sat_snapshot') <> '53111600' OR (j2->>'unidad_sat_snapshot') <> 'H87'
     OR (j2->>'orden_visualizacion')::int <> 1 THEN
    RAISE EXCEPTION '2: el renglón de botas quedó %', j2;
  END IF;

  -- 3) Idempotencia por client_id_local.
  j2 := guardar_cotizacion(v_suc, v_caja, v_ana, jsonb_build_array(
          jsonb_build_object('producto_id', v_pa, 'cantidad', 9)), 'smoke-cot-1');
  IF (j2->>'id')::uuid <> v_c1 OR (j2->>'total')::numeric <> 316 THEN RAISE EXCEPTION '3: no es idempotente: %', j2; END IF;
  IF (SELECT count(*) FROM cotizaciones WHERE tenant_id = v_t AND client_id_local = 'smoke-cot-1') <> 1 THEN
    RAISE EXCEPTION '3: duplicó la cotización'; END IF;

  -- 4) No mueve existencias ni entra a reportes ni a cuentas abiertas.
  IF (SELECT count(*) FROM movimientos_producto WHERE tenant_id = v_t) <> v_mov
     OR (SELECT cantidad FROM producto_existencias WHERE sucursal_id = v_suc AND producto_id = v_pb) <> v_exi THEN
    RAISE EXCEPTION '4: la cotización movió existencias'; END IF;
  IF reporte_x(v_turno) <> v_rx THEN RAISE EXCEPTION '4: reporte_x cambió'; END IF;
  IF (SELECT md5(COALESCE(string_agg(v::text, '|' ORDER BY v::text), '')) FROM vw_ventas_por_producto v) <> v_vp
     OR (SELECT md5(COALESCE(string_agg(v::text, '|' ORDER BY v::text), '')) FROM vw_ventas_por_categoria v) <> v_vc THEN
    RAISE EXCEPTION '4: los reportes de ventas cambiaron'; END IF;
  IF operacion_cuentas_abiertas(v_t) <> v_ca THEN RAISE EXCEPTION '4: apareció en cuentas abiertas'; END IF;

  -- 5) Rechazos: padre de variantes, combo, sin renglones, cantidad 0, producto ajeno al catálogo.
  FOR j2 IN SELECT x FROM unnest(ARRAY[
      jsonb_build_array(jsonb_build_object('producto_id', v_padre, 'cantidad', 1)),
      jsonb_build_array(jsonb_build_object('producto_id', v_combo, 'cantidad', 1)),
      '[]'::jsonb,
      jsonb_build_array(jsonb_build_object('producto_id', v_pa, 'cantidad', 0)),
      jsonb_build_array(jsonb_build_object('producto_id', gen_random_uuid(), 'cantidad', 1))]) x
  LOOP
    BEGIN
      PERFORM guardar_cotizacion(v_suc, v_caja, NULL, j2, NULL);
      RAISE EXCEPTION '5: aceptó %', j2;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'DATOS_INVALIDOS:%' THEN RAISE; END IF;
    END;
  END LOOP;

  -- 6) Cancelar: solo VIGENTE; repetir no truena.
  j2 := guardar_cotizacion(v_suc, v_caja, NULL, jsonb_build_array(jsonb_build_object('producto_id', v_pa, 'cantidad', 1)), 'smoke-cot-2');
  v_c2 := (j2->>'id')::uuid;
  IF j2->>'folio' = j->>'folio' THEN RAISE EXCEPTION '6: folio repetido'; END IF;
  PERFORM cancelar_cotizacion(v_c2);
  PERFORM cancelar_cotizacion(v_c2);
  IF (SELECT estado FROM cotizaciones WHERE id = v_c2) <> 'CANCELADA' THEN RAISE EXCEPTION '6: no se canceló'; END IF;

  -- 7) Convertir: con un ticket ABIERTO se rechaza; PAGADO pasa y es idempotente.
  v_tk := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_ana, NULL, 'smoke-cot-tk', v_maria);
  PERFORM agregar_item_a_ticket(v_tk, v_pa, 2, NULL, '[]'::jsonb, 'smoke-cot-tk-a');
  BEGIN
    PERFORM marcar_cotizacion_convertida(v_c1, v_tk);
    RAISE EXCEPTION '7: se convirtió con la venta abierta';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'DATOS_INVALIDOS:%' THEN RAISE; END IF;
  END;
  PERFORM aplicar_pago(v_tk, 'EFECTIVO'::metodo_pago, 200, 200);
  IF (SELECT estado_fiscal FROM tickets WHERE id = v_tk) <> 'PAGADO' THEN RAISE EXCEPTION '7: la venta no quedó PAGADO'; END IF;
  -- Una cancelada no se convierte.
  BEGIN
    PERFORM marcar_cotizacion_convertida(v_c2, v_tk);
    RAISE EXCEPTION '7: se convirtió una cancelada';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'DATOS_INVALIDOS:%' THEN RAISE; END IF;
  END;
  -- Vencida también vale.
  UPDATE cotizaciones SET vigente_hasta = v_hoy - 1 WHERE id = v_c1;
  PERFORM marcar_cotizacion_convertida(v_c1, v_tk);
  PERFORM marcar_cotizacion_convertida(v_c1, v_tk);
  IF (SELECT estado || ':' || ticket_id FROM cotizaciones WHERE id = v_c1) <> 'CONVERTIDA:' || v_tk THEN
    RAISE EXCEPTION '7: no quedó CONVERTIDA con su venta'; END IF;
  BEGIN
    PERFORM cancelar_cotizacion(v_c1);
    RAISE EXCEPTION '7: se canceló una convertida';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'DATOS_INVALIDOS:%' THEN RAISE; END IF;
  END;

  -- 8) Enlace público: lo impreso, sin ids; un token inventado da NULL; anon puede llamarla.
  j2 := cotizacion_publica(v_tok);
  IF j2 IS NULL OR j2->>'folio' <> j->>'folio' OR (j2->'totales'->>'total')::numeric <> 316
     OR j2->>'negocio' IS NULL OR j2->'sucursal'->>'nombre' IS NULL OR j2->>'cliente' <> 'Ana Cotiza'
     OR jsonb_array_length(j2->'renglones') <> 2 OR (j2->>'vigente_hasta')::date <> v_hoy - 1 THEN
    RAISE EXCEPTION '8: cotizacion_publica dio %', j2;
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(j2->'renglones') r WHERE NOT r ? 'unidad_sat') THEN
    RAISE EXCEPTION '8: un renglón sin unidad_sat: %', j2; END IF;
  IF j2::text ~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-' OR j2::text LIKE '%' || v_tok || '%' THEN
    RAISE EXCEPTION '8: cotizacion_publica filtró ids: %', j2; END IF;
  IF cotizacion_publica('no-existe-este-token-de-cotizacion') IS NOT NULL OR cotizacion_publica(NULL) IS NOT NULL THEN
    RAISE EXCEPTION '8: un token inventado devolvió algo'; END IF;
  -- Un cliente borrado ya no sale con su nombre.
  UPDATE clientes SET deleted_at = now() WHERE id = v_ana;
  IF cotizacion_publica(v_tok)->>'cliente' IS NOT NULL THEN
    RAISE EXCEPTION '8: salió el nombre de un cliente borrado: %', cotizacion_publica(v_tok); END IF;
  UPDATE clientes SET deleted_at = NULL WHERE id = v_ana;
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  IF cotizacion_publica(v_tok) IS NULL THEN RAISE EXCEPTION '8: anon no pudo leer el enlace'; END IF;
  v_ok := false;
  BEGIN
    PERFORM 1 FROM cotizaciones;
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION '8: anon leyó la tabla de cotizaciones'; END IF;
  RESET ROLE;
  RAISE NOTICE 'SMOKE COTIZACIONES 0212 OK';
END $$;

-- 0212 bajo RLS: el cajero guarda por RPC pero no escribe a mano ni apaga el módulo; otro negocio no ve nada.
DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_cajero uuid := '99999999-0000-0000-0000-000000000001';
  v_otro   uuid := 'c2120000-0000-0000-0000-0000000000ee';
  v_pa     uuid := 'c2120000-0000-0000-0000-0000000000a1';
  v_n integer; v_ok boolean; j jsonb;
BEGIN
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_otro, 'tenant-0212', 'Otra tienda', 'INTERNO', 'QUICK_SERVICE');

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cajero, 'role', 'authenticated', 'tenant_id', v_t)::text, true);

  SELECT count(*) INTO v_n FROM cotizaciones;
  IF v_n <> 2 THEN RAISE EXCEPTION 'R1: el cajero debía ver 2 cotizaciones, vio %', v_n; END IF;
  j := guardar_cotizacion(v_suc, v_caja, NULL, jsonb_build_array(jsonb_build_object('producto_id', v_pa, 'cantidad', 1)), 'smoke-cot-rls');
  IF (j->>'total')::numeric <> 100 THEN RAISE EXCEPTION 'R2: el cajero no guardó: %', j; END IF;

  v_ok := false;
  BEGIN
    INSERT INTO cotizaciones (tenant_id, sucursal_id, caja_id, folio, vigente_hasta, subtotal_mxn, iva_mxn, total_mxn)
    VALUES (v_t, v_suc, v_caja, 'COT-A-MANO', current_date, 0, 0, 0);
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'R3: un cajero escribió una cotización a mano'; END IF;
  v_ok := false;
  BEGIN
    UPDATE cotizaciones SET estado = 'CONVERTIDA';
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'R3: un cajero cambió una cotización a mano'; END IF;
  v_ok := false;
  BEGIN
    UPDATE configuracion_tenant SET modulo_cotizaciones_activo = false WHERE tenant_id = v_t;
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'R4: un cajero apagó las cotizaciones'; END IF;

  -- Otro negocio: no ve nada y no usa la sucursal ajena.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cajero, 'role', 'authenticated', 'tenant_id', v_otro)::text, true);
  IF (SELECT count(*) FROM cotizaciones) <> 0 OR (SELECT count(*) FROM cotizacion_items) <> 0 THEN
    RAISE EXCEPTION 'R5: otro negocio vio cotizaciones'; END IF;
  v_ok := false;
  BEGIN
    PERFORM guardar_cotizacion(v_suc, v_caja, NULL, jsonb_build_array(jsonb_build_object('producto_id', v_pa, 'cantidad', 1)), 'smoke-cot-ajeno');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%sucursal%' THEN v_ok := true; ELSE RAISE; END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'R6: guardó en la sucursal de otro negocio'; END IF;
  RESET ROLE;
  IF NOT (SELECT modulo_cotizaciones_activo FROM configuracion_tenant WHERE tenant_id = v_t) THEN
    RAISE EXCEPTION 'R4: el módulo se apagó'; END IF;
  RAISE NOTICE 'SMOKE COTIZACIONES 0212 RLS OK';
END $$;
ROLLBACK;
