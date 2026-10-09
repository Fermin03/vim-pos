-- Smoke lealtad · factura (0158). Una cuenta con un premio de producto no admite factura individual
-- y sí entra en la global; una que es SOLO el premio (total $0) no entra en la global; un canje de
-- puntos por dinero se factura como siempre. El candado solo frena eso: la nota de crédito (EGRESO)
-- de la cuenta con premio y una factura global (sin ticket) pasan. Hace ROLLBACK.
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
  v_abierta uuid; v_item3 uuid;
  v_pagado uuid; v_auth uuid; v_dev uuid; v_global uuid;
  -- El día CONTABLE, no la fecha del reloj: entre medianoche y la hora de cierre del negocio el
  -- ticket cae en el día anterior y la global de 'hoy' no lo traía (rojo solo de madrugada).
  v_hoy    date := calcular_dia_contable('99999999-0000-0000-0000-0000000000aa');
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
  v_pagado := agregar_item_a_ticket(v_premio, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lfac-a1');
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

  -- 4) El candado NO frena lo que no es una factura individual de ingreso.
  --    a) La nota de crédito (EGRESO) de la cuenta con premio: se devuelve la hamburguesa que sí se
  --       pagó y su borrador entra por el mismo camino que el admin (cfdi_crear_borrador).
  INSERT INTO autorizaciones_pin(tenant_id, sucursal_id, caja_id, turno_id,
    usuario_solicitante_id, usuario_autorizo_id, accion, permiso_codigo, entidad_tipo, entidad_id, motivo)
  VALUES (v_tenant, v_suc, v_caja, v_turno, v_maria, v_maria, 'devolucion', 'venta.devolucion', 'ticket', v_premio, 'Producto defectuoso')
  RETURNING id INTO v_auth;
  v_dev := crear_devolucion(
    p_ticket_original_id := v_premio, p_caja_id := v_caja, p_turno_id := v_turno,
    p_alcance := 'PARCIAL'::devolucion_alcance, p_motivo := 'PRODUCTO_DEFECTUOSO'::devolucion_motivo,
    p_motivo_texto := 'Devolución de smoke', p_medio_devolucion := 'EFECTIVO'::devolucion_medio,
    p_autorizacion_pin_id := v_auth, p_usuario_solicitante_id := v_maria, p_usuario_autorizo_id := v_maria,
    p_items := jsonb_build_array(jsonb_build_object('ticket_item_id', v_pagado, 'cantidad_devuelta', 1)),
    p_reversar_inventario := false, p_nota := 'Reembolso parcial');
  -- La afirmación solo vale si el premio sigue vivo en este momento.
  IF NOT ticket_lleva_premio(v_premio) THEN RAISE EXCEPTION 'el premio dejó de estar vivo antes de probar el EGRESO'; END IF;
  v_cfdi := NULL;
  BEGIN
    v_cfdi := cfdi_crear_borrador(
      p_ticket_id := v_premio, p_tipo_comprobante := 'EGRESO'::cfdi_tipo_comprobante,
      p_receptor_rfc := 'XAXX010101000', p_receptor_razon_social := 'PUBLICO EN GENERAL',
      p_receptor_uso_cfdi := 'G02', p_receptor_codigo_postal := '37000', p_receptor_regimen_fiscal := '616',
      p_receptor_email := 'cliente@demo.mx', p_emisor_rfc := 'XAXX010101000',
      p_emisor_razon_social := 'VIM MARKETING SA DE CV', p_emisor_regimen_fiscal := '601',
      p_emisor_lugar_expedicion := '37000', p_metodo_pago_sat := 'PUE', p_forma_pago_sat := '01',
      p_pac_proveedor := 'FACTURAPI'::cfdi_proveedor_pac, p_devolucion_id := v_dev);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%premio de lealtad%' THEN RAISE EXCEPTION 'el candado frenó la nota de crédito de una cuenta con premio'; END IF;
    RAISE EXCEPTION 'la nota de crédito falló por otra razón: %', SQLERRM;
  END;
  IF v_cfdi IS NULL OR NOT EXISTS (
    SELECT 1 FROM tickets_cfdi WHERE id = v_cfdi AND ticket_id = v_premio AND tipo_comprobante = 'EGRESO'
  ) THEN RAISE EXCEPTION 'la nota de crédito de la cuenta con premio no quedó guardada'; END IF;

  --    b) Una factura global: INGRESO sin ticket (misma inserción que smoke_global_pendientes.sql).
  BEGIN
    INSERT INTO tickets_cfdi (tenant_id, es_global, emisor_rfc, emisor_razon_social, emisor_regimen_fiscal,
                              emisor_lugar_expedicion, subtotal_mxn, total_mxn, metodo_pago_sat, forma_pago_sat, pac_proveedor)
    VALUES (v_tenant, true, 'KOB010101AAA', 'X', '601', '37000', 1, 1, 'PUE', '01', 'FACTURAMA')
    RETURNING id INTO v_global;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%premio de lealtad%' THEN RAISE EXCEPTION 'el candado frenó una factura global'; END IF;
    RAISE EXCEPTION 'la factura global falló por otra razón: %', SQLERRM;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM tickets_cfdi WHERE id = v_global AND es_global AND ticket_id IS NULL AND tipo_comprobante = 'INGRESO'
  ) THEN RAISE EXCEPTION 'la global de prueba no quedó como INGRESO sin ticket'; END IF;
  -- Y la global puede amparar a la cuenta con premio.
  INSERT INTO cfdi_global_tickets (cfdi_id, ticket_id, tenant_id) VALUES (v_global, v_premio, v_tenant);

  -- 5) Un premio revertido DESPUÉS de cobrar sigue siendo un premio: los totales de una cuenta
  --    cerrada no se recalculan, así que su renglón sigue en $0 (0159).
  UPDATE ticket_canjes_lealtad SET revertido = true, revertido_at = now() WHERE ticket_id = v_premio;
  IF (SELECT total_item_mxn FROM ticket_items WHERE id = v_item) <> 0 THEN
    RAISE EXCEPTION 'el smoke supone que una cuenta cobrada no se recalcula al revertir su canje';
  END IF;
  IF NOT ticket_lleva_premio(v_premio) THEN
    RAISE EXCEPTION 'un premio revertido tras el pago dejó de bloquear la factura (su renglón sigue en $0)';
  END IF;

  -- 6) En cambio, quitar el premio de una cuenta ABIERTA sí lo libera: ahí el renglón vuelve a su precio.
  v_abierta := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_cli, NULL, 'smoke-lfac-d', v_maria);
  v_item3 := agregar_item_a_ticket(v_abierta, v_prod, 1, NULL, '[]'::jsonb, 'smoke-lfac-d1');
  INSERT INTO ticket_canjes_lealtad (id, tenant_id, ticket_id, cliente_id, ticket_item_id, puntos, monto_descontado_mxn)
  VALUES (gen_random_uuid(), v_tenant, v_abierta, v_cli, v_item3, 6, 120);
  IF NOT ticket_lleva_premio(v_abierta) THEN RAISE EXCEPTION 'el premio vivo de la cuenta abierta no se reconoce'; END IF;
  UPDATE ticket_canjes_lealtad SET revertido = true, revertido_at = now() WHERE ticket_id = v_abierta;
  IF (SELECT total_item_mxn FROM ticket_items WHERE id = v_item3) <> 120 THEN
    RAISE EXCEPTION 'al quitar el premio de una cuenta abierta el renglón debió volver a $120';
  END IF;
  IF ticket_lleva_premio(v_abierta) THEN RAISE EXCEPTION 'un premio quitado de una cuenta abierta sigue contando'; END IF;

  RAISE NOTICE 'SMOKE LEALTAD FACTURA OK';
END $$;
ROLLBACK;
