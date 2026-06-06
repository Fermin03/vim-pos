-- Smoke F8 CFDI: ticket PAGADO → cfdi_crear_borrador → cfdi_marcar_timbrado (UUID mock,
-- como lo haría la Edge Function tras el PAC) → verifica estado_sat=TIMBRADO + movimiento SAT.
-- Simula el comportamiento del pipeline timbrar-cfdi con un PAC mock. ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno  uuid; v_ticket uuid; v_prod uuid; v_cfdi uuid;
  v_estado_fiscal text; v_estado_sat text; v_uuid text; v_movs int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);

  UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=v_caja AND estado='ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable,
                     usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-CFDI', CURRENT_DATE, v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;

  SELECT id INTO v_prod FROM productos WHERE tenant_id=v_tenant AND nombre='Hamburguesa Clásica' LIMIT 1;

  v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'COMER_AQUI'::modo_servicio, NULL, NULL, 'smoke-cfdi-1', v_maria);
  PERFORM agregar_item_a_ticket(v_ticket, v_prod, 1, NULL, '[]'::jsonb, 'smoke-cfdi-item');
  PERFORM aplicar_pago(v_ticket, 'EFECTIVO'::metodo_pago, 120, 120, NULL, NULL, NULL, false, NULL, 'smoke-cfdi-pago');

  SELECT estado_fiscal INTO v_estado_fiscal FROM tickets WHERE id=v_ticket;
  RAISE NOTICE 'ticket estado_fiscal: % (esperado PAGADO)', v_estado_fiscal;
  IF v_estado_fiscal <> 'PAGADO' THEN RAISE EXCEPTION 'ticket no quedó PAGADO'; END IF;

  -- 1) Crear borrador CFDI (lo hace el cliente/lib antes de pedir timbrado)
  v_cfdi := cfdi_crear_borrador(
    p_ticket_id               := v_ticket,
    p_tipo_comprobante        := 'INGRESO'::cfdi_tipo_comprobante,
    p_receptor_rfc            := 'XAXX010101000',           -- público en general / demo
    p_receptor_razon_social   := 'PUBLICO EN GENERAL',
    p_receptor_uso_cfdi       := 'S01',                      -- sin efectos fiscales
    p_receptor_codigo_postal  := '37150',
    p_receptor_regimen_fiscal := '616',
    p_receptor_email          := 'cliente@demo.mx',
    p_emisor_rfc              := 'VIMF030828Z07',
    p_emisor_razon_social     := 'VIM MARKETING SA DE CV',
    p_emisor_regimen_fiscal   := '601',
    p_emisor_lugar_expedicion := '37150',
    p_metodo_pago_sat         := 'PUE',
    p_forma_pago_sat          := '01',                       -- efectivo
    p_pac_proveedor           := 'FACTURAPI'::cfdi_proveedor_pac
  );
  SELECT estado_sat INTO v_estado_sat FROM tickets_cfdi WHERE id=v_cfdi;
  RAISE NOTICE 'CFDI borrador: % estado=% (esperado BORRADOR)', v_cfdi, v_estado_sat;
  IF v_estado_sat <> 'BORRADOR' THEN RAISE EXCEPTION 'CFDI no quedó BORRADOR'; END IF;

  -- 2) Timbrar (simula respuesta exitosa del PAC mock; en real lo llama la Edge Function)
  PERFORM cfdi_marcar_timbrado(
    p_cfdi_id            := v_cfdi,
    p_uuid_fiscal        := 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE',
    p_serie              := 'A',
    p_folio_fiscal       := 'F-0001',
    p_fecha_timbrado     := now(),
    p_fecha_emision      := now(),
    p_xml_storage_path   := 'cfdi/' || v_cfdi || '.xml',
    p_pdf_storage_path   := 'cfdi/' || v_cfdi || '.pdf',
    p_pac_referencia     := 'MOCK-PAC-REF-1',
    p_pac_costo_centavos := 0,
    p_request_payload    := jsonb_build_object('mock', true),
    p_response_payload   := jsonb_build_object('uuid', 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE', 'mock', true)
  );

  SELECT estado_sat, uuid_fiscal INTO v_estado_sat, v_uuid FROM tickets_cfdi WHERE id=v_cfdi;
  SELECT count(*) INTO v_movs FROM cfdi_sat_movimientos WHERE cfdi_id=v_cfdi AND evento='TIMBRADO_CONFIRMADO';
  RAISE NOTICE 'CFDI timbrado: estado=% uuid=% movimientos=%', v_estado_sat, v_uuid, v_movs;
  IF v_estado_sat <> 'TIMBRADO' THEN RAISE EXCEPTION 'CFDI no quedó TIMBRADO'; END IF;
  IF v_uuid IS NULL THEN RAISE EXCEPTION 'UUID fiscal no se guardó'; END IF;
  IF v_movs <> 1 THEN RAISE EXCEPTION 'no se registró el movimiento SAT'; END IF;

  RAISE NOTICE 'SMOKE CFDI OK: ticket PAGADO → borrador → TIMBRADO uuid=% (mock PAC).', v_uuid;
END $$;
ROLLBACK;
