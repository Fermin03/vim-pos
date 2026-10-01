-- Smoke 0143: periodos de factura global PENDIENTES (el aviso del panel).
--
-- Dos ventas pagadas → mientras su periodo sigue abierto NO salen; en cuanto `p_hoy` cae en el
-- periodo siguiente, salen agrupadas en su periodo, con las mismas reglas que usa timbrar-global.
--
-- `p_hoy` lo manda quien llama (el panel, en hora de México), así que el smoke no compara nada
-- contra CURRENT_DATE: toma el día contable que la venta guardó y se mueve a partir de él. Y cuenta
-- por DIFERENCIA, para no depender de las ventas que ya traiga la base. ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_prod   uuid; v_turno uuid; v_ticket uuid; v_cfdi uuid;
  v_dia    date;            -- día contable de las ventas del smoke
  v_desde  date; v_hasta date;   -- su periodo mensual
  v_manana date;            -- primer día del periodo siguiente: ahí el periodo ya cerró
  v_antes  int; v_n int; v_total numeric;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);
  SELECT id INTO v_prod FROM productos WHERE tenant_id=v_tenant AND nombre='Hamburguesa Clásica' LIMIT 1;

  INSERT INTO tenant_cfdi_emisor (tenant_id, rfc, facturama_issuer_ref, estado, periodicidad_global)
  VALUES (v_tenant, 'KOB010101AAA', 'KOB010101AAA', 'ACTIVO', '04')
  ON CONFLICT (tenant_id) DO UPDATE SET periodicidad_global = '04';

  UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=v_caja AND estado='ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable,
                     usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-GP', calcular_dia_contable(v_tenant, now()), v_maria, 500, 'TOTAL')
  RETURNING id INTO v_turno;

  -- Lo que ya hubiera pendiente en ese periodo antes de las ventas del smoke.
  v_dia := calcular_dia_contable(v_tenant, now());
  SELECT p.desde, p.hasta INTO v_desde, v_hasta FROM periodo_global_de('04', v_dia) p;
  v_manana := v_hasta + 1;
  SELECT COALESCE((SELECT n_tickets FROM periodos_globales_pendientes(v_tenant, v_manana) WHERE desde = v_desde), 0) INTO v_antes;

  FOR i IN 1..2 LOOP
    v_ticket := abrir_ticket(v_suc, v_caja, v_turno, 'COMER_AQUI'::modo_servicio, NULL, NULL, 'smoke-gp-' || i, v_maria);
    PERFORM agregar_item_a_ticket(v_ticket, v_prod, 1, NULL, '[]'::jsonb, 'smoke-gp-item-' || i);
    PERFORM aplicar_pago(v_ticket, 'EFECTIVO'::metodo_pago, 120, 120, NULL, NULL, NULL, false, NULL, 'smoke-gp-pago-' || i);
  END LOOP;
  IF (SELECT dia_contable FROM tickets WHERE id = v_ticket) <> v_dia THEN
    RAISE EXCEPTION 'el smoke asumió mal el día contable de la venta';
  END IF;

  -- 1) El periodo sigue abierto (hoy = el día de la venta, y hoy = su último día): no avisa.
  IF EXISTS (SELECT 1 FROM periodos_globales_pendientes(v_tenant, v_dia) WHERE desde = v_desde) THEN
    RAISE EXCEPTION 'el periodo vigente no debe salir como pendiente';
  END IF;
  IF EXISTS (SELECT 1 FROM periodos_globales_pendientes(v_tenant, v_hasta) WHERE desde = v_desde) THEN
    RAISE EXCEPTION 'el último día del periodo todavía no está cerrado';
  END IF;

  -- 2) Al día siguiente del cierre: sale, con sus dos ventas y sus límites exactos.
  SELECT n_tickets, total_mxn INTO v_n, v_total
    FROM periodos_globales_pendientes(v_tenant, v_manana) WHERE desde = v_desde AND hasta = v_hasta;
  RAISE NOTICE 'periodo % a %: % ventas pendientes (antes %), total %', v_desde, v_hasta, v_n, v_antes, v_total;
  IF v_n IS DISTINCT FROM v_antes + 2 OR v_total < 240 THEN
    RAISE EXCEPTION 'esperaba % ventas pendientes, hay % (total %)', v_antes + 2, v_n, v_total;
  END IF;

  -- 3) Sigue saliendo dos meses después (al dueño se le pasó), y deja de salir fuera de la ventana.
  IF NOT EXISTS (SELECT 1 FROM periodos_globales_pendientes(v_tenant, v_manana + 60) WHERE desde = v_desde) THEN
    RAISE EXCEPTION 'un periodo atrasado dos meses debe seguir avisándose';
  END IF;
  IF EXISTS (SELECT 1 FROM periodos_globales_pendientes(v_tenant, v_manana + 400) WHERE desde = v_desde) THEN
    RAISE EXCEPTION 'fuera de la ventana de búsqueda no debe salir';
  END IF;

  -- 4) Quincenal: las mismas ventas caen en SU quincena, con los límites de periodo_global_de.
  UPDATE tenant_cfdi_emisor SET periodicidad_global = '03' WHERE tenant_id = v_tenant;
  IF NOT EXISTS (
    SELECT 1 FROM periodos_globales_pendientes(v_tenant, v_manana) x, periodo_global_de('03', v_dia) q
     WHERE x.desde = q.desde AND x.hasta = q.hasta AND x.n_tickets >= 2
  ) THEN RAISE EXCEPTION 'quincenal: las ventas no salieron en su quincena'; END IF;
  UPDATE tenant_cfdi_emisor SET periodicidad_global = '04' WHERE tenant_id = v_tenant;

  -- 5) Una venta que ya ampara una global deja de contar (regla de tickets_de_periodo_global).
  INSERT INTO tickets_cfdi (tenant_id, es_global, emisor_rfc, emisor_razon_social, emisor_regimen_fiscal,
                            emisor_lugar_expedicion, subtotal_mxn, total_mxn, metodo_pago_sat, forma_pago_sat, pac_proveedor)
  VALUES (v_tenant, true, 'KOB010101AAA', 'X', '601', '37000', 1, 1, 'PUE', '01', 'FACTURAMA')
  RETURNING id INTO v_cfdi;
  INSERT INTO cfdi_global_tickets (cfdi_id, ticket_id, tenant_id) VALUES (v_cfdi, v_ticket, v_tenant);
  SELECT n_tickets INTO v_n FROM periodos_globales_pendientes(v_tenant, v_manana) WHERE desde = v_desde;
  IF v_n IS DISTINCT FROM v_antes + 1 THEN RAISE EXCEPTION 'con una venta amparada esperaba %, hay %', v_antes + 1, v_n; END IF;

  -- 6) Periodo en ERROR: se puede reintentar, sigue avisando. TIMBRADA o EN_PROCESO: ya no.
  INSERT INTO cfdi_periodos_globales (tenant_id, periodicidad, desde, hasta, estado)
  VALUES (v_tenant, '04', v_desde, v_hasta, 'ERROR')
  ON CONFLICT (tenant_id, desde, hasta) DO UPDATE SET estado = 'ERROR';
  IF NOT EXISTS (SELECT 1 FROM periodos_globales_pendientes(v_tenant, v_manana) WHERE desde = v_desde) THEN
    RAISE EXCEPTION 'un periodo en ERROR debe seguir saliendo';
  END IF;
  UPDATE cfdi_periodos_globales SET estado = 'EN_PROCESO' WHERE tenant_id = v_tenant AND desde = v_desde AND hasta = v_hasta;
  IF EXISTS (SELECT 1 FROM periodos_globales_pendientes(v_tenant, v_manana) WHERE desde = v_desde) THEN
    RAISE EXCEPTION 'un periodo EN_PROCESO no debe avisarse';
  END IF;
  UPDATE cfdi_periodos_globales SET estado = 'TIMBRADA' WHERE tenant_id = v_tenant AND desde = v_desde AND hasta = v_hasta;
  IF EXISTS (SELECT 1 FROM periodos_globales_pendientes(v_tenant, v_manana) WHERE desde = v_desde) THEN
    RAISE EXCEPTION 'un periodo TIMBRADA no debe avisarse';
  END IF;

  RAISE NOTICE '✅ periodos_globales_pendientes OK';
END $$;
ROLLBACK;
