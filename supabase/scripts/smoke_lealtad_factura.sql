-- Smoke lealtad · factura (0158). Una cuenta con un premio de producto no admite factura individual
-- y sí entra en la global; una que es SOLO el premio (total $0) no entra en la global; un canje de
-- puntos por dinero se factura como siempre. Hace ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno  uuid; v_prod uuid; v_cli uuid; v_cfdi uuid;
  v_premio uuid; v_solo uuid; v_dinero uuid; v_item uuid; v_item2 uuid;
  v_hoy    date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_fallo  boolean;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_tenant, 'Ana Factura', '4770001581') RETURNING id INTO v_cli;
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-LFAC', v_hoy, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;
  SELECT id INTO v_prod FROM productos WHERE tenant_id = v_tenant AND nombre = 'Hamburguesa Clásica' LIMIT 1;

  -- A) Dos hamburguesas, una de premio: se cobra $120.
  v_premio := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-lfac-a', v_maria);
  PERFORM agregar_item_a_ticket(v_premio, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lfac-a1');
  v_item := agregar_item_a_ticket(v_premio, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lfac-a2');
  IF ticket_lleva_premio(v_premio) THEN RAISE EXCEPTION 'sin canje no hay premio'; END IF;
  INSERT INTO ticket_canjes_lealtad (id, tenant_id, ticket_id, cliente_id, ticket_item_id, puntos, monto_descontado_mxn)
  VALUES (gen_random_uuid(), v_tenant, v_premio, v_cli, v_item, 6, 120);
  IF NOT ticket_lleva_premio(v_premio) THEN RAISE EXCEPTION 'la cuenta con premio no se reconoce'; END IF;
  PERFORM aplicar_pago(v_premio, 'EFECTIVO'::metodo_pago, 120, 120);

  -- B) Una sola hamburguesa, y es el premio: queda pagada en $0.
  v_solo := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-lfac-b', v_maria);
  v_item2 := agregar_item_a_ticket(v_solo, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lfac-b1');
  INSERT INTO ticket_canjes_lealtad (id, tenant_id, ticket_id, cliente_id, ticket_item_id, puntos, monto_descontado_mxn)
  VALUES (gen_random_uuid(), v_tenant, v_solo, v_cli, v_item2, 6, 120);
  UPDATE tickets SET estado_fiscal = 'PAGADO', fecha_pago = now() WHERE id = v_solo;
  IF (SELECT total_mxn FROM tickets WHERE id = v_solo) <> 0 THEN
    RAISE EXCEPTION 'el caso B debe ser una cuenta pagada en $0, quedó en %', (SELECT total_mxn FROM tickets WHERE id = v_solo);
  END IF;

  -- C) Canje de puntos por dinero: $120 − $30 = $90.
  v_dinero := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-lfac-c', v_maria);
  PERFORM agregar_item_a_ticket(v_dinero, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lfac-c1');
  INSERT INTO ticket_canjes_lealtad (id, tenant_id, ticket_id, cliente_id, puntos, monto_descontado_mxn)
  VALUES (gen_random_uuid(), v_tenant, v_dinero, v_cli, 30, 30);
  PERFORM aplicar_pago(v_dinero, 'EFECTIVO'::metodo_pago, 90, 90);
  IF ticket_lleva_premio(v_dinero) THEN RAISE EXCEPTION 'un canje de dinero no es un premio'; END IF;

  -- 1) La cuenta con premio NO admite borrador de factura individual, y dice por qué.
  v_fallo := false;
  BEGIN
    v_cfdi := cfdi_crear_borrador(
      p_ticket_id := v_premio, p_tipo_comprobante := 'INGRESO'::cfdi_tipo_comprobante,
      p_receptor_rfc := 'XAXX010101000', p_receptor_razon_social := 'PUBLICO EN GENERAL',
      p_receptor_uso_cfdi := 'S01', p_receptor_codigo_postal := '37000', p_receptor_regimen_fiscal := '616',
      p_receptor_email := 'cliente@demo.mx', p_emisor_rfc := 'XAXX010101000',
      p_emisor_razon_social := 'VIM MARKETING SA DE CV', p_emisor_regimen_fiscal := '601',
      p_emisor_lugar_expedicion := '37000', p_metodo_pago_sat := 'PUE', p_forma_pago_sat := '01',
      p_pac_proveedor := 'FACTURAPI'::cfdi_proveedor_pac);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%premio de lealtad%' THEN RAISE EXCEPTION 'falló por otra razón: %', SQLERRM; END IF;
    v_fallo := true;
  END;
  IF NOT v_fallo THEN RAISE EXCEPTION 'una cuenta con premio admitió factura individual'; END IF;

  -- 2) La de canje de dinero SÍ.
  v_cfdi := cfdi_crear_borrador(
    p_ticket_id := v_dinero, p_tipo_comprobante := 'INGRESO'::cfdi_tipo_comprobante,
    p_receptor_rfc := 'XAXX010101000', p_receptor_razon_social := 'PUBLICO EN GENERAL',
    p_receptor_uso_cfdi := 'S01', p_receptor_codigo_postal := '37000', p_receptor_regimen_fiscal := '616',
    p_receptor_email := 'cliente@demo.mx', p_emisor_rfc := 'XAXX010101000',
    p_emisor_razon_social := 'VIM MARKETING SA DE CV', p_emisor_regimen_fiscal := '601',
    p_emisor_lugar_expedicion := '37000', p_metodo_pago_sat := 'PUE', p_forma_pago_sat := '01',
    p_pac_proveedor := 'FACTURAPI'::cfdi_proveedor_pac);
  IF v_cfdi IS NULL THEN RAISE EXCEPTION 'el canje de dinero dejó de ser facturable'; END IF;

  -- 3) La global del día: entra la del premio (hay $120 cobrados), entra la del canje de dinero (su
  --    borrador no está timbrado, así que no cuenta como factura propia), y NO entra la que es solo
  --    el premio ($0: no hay ingreso que amparar y sería un concepto en cero).
  IF NOT EXISTS (SELECT 1 FROM tickets_de_periodo_global(v_tenant, v_hoy, v_hoy) g WHERE g.ticket_id = v_premio) THEN
    RAISE EXCEPTION 'la cuenta con premio se quedó fuera de la global';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tickets_de_periodo_global(v_tenant, v_hoy, v_hoy) g WHERE g.ticket_id = v_dinero) THEN
    RAISE EXCEPTION 'la cuenta con canje de dinero se quedó fuera de la global';
  END IF;
  IF EXISTS (SELECT 1 FROM tickets_de_periodo_global(v_tenant, v_hoy, v_hoy) g WHERE g.ticket_id = v_solo) THEN
    RAISE EXCEPTION 'una cuenta de puro premio ($0) entró a la global';
  END IF;

  -- 4) Un canje revertido ya no cuenta como premio.
  UPDATE ticket_canjes_lealtad SET revertido = true, revertido_at = now() WHERE ticket_id = v_premio;
  IF ticket_lleva_premio(v_premio) THEN RAISE EXCEPTION 'un premio revertido sigue bloqueando la factura'; END IF;

  RAISE NOTICE 'SMOKE LEALTAD FACTURA OK';
END $$;
ROLLBACK;
