-- Smoke lealtad · admin (0159). El add-on está activo en el catálogo; el cambio de plan concede y
-- retira la lealtad (y al retirarla apaga el interruptor del dueño); las vistas que usa el admin
-- traen sus columnas nuevas y las cifras del resumen cuadran. Hace ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_negocio uuid; v_esencial uuid; v_r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);

  -- §2 · el catálogo y el cambio de plan
  IF NOT (SELECT activo FROM addons WHERE codigo = 'LEALTAD') THEN
    RAISE EXCEPTION 'el add-on LEALTAD sigue inactivo en el catálogo';
  END IF;
  SELECT id INTO v_negocio  FROM planes WHERE codigo = 'NEGOCIO';
  SELECT id INTO v_esencial FROM planes WHERE codigo = 'ESENCIAL';
  -- Se parte de un negocio sin la lealtad concedida.
  UPDATE tenant_addons ta SET activo = false, fecha_fin = (now() AT TIME ZONE 'America/Mexico_City')::date
    FROM addons a WHERE a.id = ta.addon_id AND a.codigo = 'LEALTAD' AND ta.tenant_id = v_tenant AND ta.activo;

  v_r := _sincronizar_addons_del_plan(v_tenant, v_negocio, true);
  IF NOT (v_r->'concedidos') ? 'LEALTAD' THEN RAISE EXCEPTION 'subir a Negocio no concedió la lealtad: %', v_r; END IF;
  IF NOT tenant_addon_activo(v_tenant, 'LEALTAD') THEN RAISE EXCEPTION 'la lealtad no quedó concedida'; END IF;
  IF NOT (SELECT bool_and(ta.precio_mensual_mxn = 0 AND ta.incluido_en_plan) FROM tenant_addons ta JOIN addons a ON a.id = ta.addon_id
           WHERE ta.tenant_id = v_tenant AND a.codigo = 'LEALTAD' AND ta.activo) THEN
    RAISE EXCEPTION 'la lealtad incluida en el plan debe quedar a $0 y marcada como incluida';
  END IF;
  -- Repetir no la duplica ni la vuelve a contar.
  v_r := _sincronizar_addons_del_plan(v_tenant, v_negocio, true);
  IF (v_r->'concedidos') ? 'LEALTAD' THEN RAISE EXCEPTION 'conceder dos veces no es inocuo: %', v_r; END IF;

  -- El dueño la enciende (necesita programa) y al bajar a Esencial se retira y se apaga sola.
  INSERT INTO lealtad_programa (tenant_id, mecanica, porcentaje) VALUES (v_tenant, 'PUNTOS_DINERO', 5)
    ON CONFLICT (tenant_id) DO NOTHING;
  INSERT INTO configuracion_tenant (tenant_id, modulo_lealtad_activo) VALUES (v_tenant, true)
    ON CONFLICT (tenant_id) DO UPDATE SET modulo_lealtad_activo = true;
  IF NOT (modulos_efectivos(v_tenant)->'efectivos'->>'lealtad')::boolean THEN RAISE EXCEPTION 'la lealtad no quedó efectiva'; END IF;

  v_r := _sincronizar_addons_del_plan(v_tenant, v_esencial, true);
  IF NOT (v_r->'retirados') ? 'LEALTAD' THEN RAISE EXCEPTION 'bajar a Esencial no retiró la lealtad: %', v_r; END IF;
  IF (modulos_efectivos(v_tenant)->'permitidos'->>'lealtad')::boolean THEN RAISE EXCEPTION 'la lealtad sigue permitida tras bajar de plan'; END IF;
  IF (SELECT modulo_lealtad_activo FROM configuracion_tenant WHERE tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'al retirar la lealtad el interruptor del dueño debió apagarse';
  END IF;

  RAISE NOTICE 'SMOKE LEALTAD ADMIN §2 OK';
END $$;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_hoy    date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_turno uuid; v_prod uuid; v_ana uuid; v_luis uuid; v_t uuid; v_r jsonb; i int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_maria::text, 'tenant_id', v_tenant::text)::text, true);
  INSERT INTO lealtad_programa (tenant_id, mecanica, porcentaje, tope_compras_dia) VALUES (v_tenant, 'PUNTOS_DINERO', 5, 2)
    ON CONFLICT (tenant_id) DO UPDATE SET mecanica = 'PUNTOS_DINERO', porcentaje = 5, tope_compras_dia = 2;
  INSERT INTO clientes (tenant_id, nombre, apellido_paterno, telefono) VALUES (v_tenant, 'Ana', 'Resumen', '4770001591') RETURNING id INTO v_ana;
  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_tenant, 'Luis', '4770001592') RETURNING id INTO v_luis;
  UPDATE turnos SET estado = 'CERRADO', fecha_cierre = now() WHERE caja_id = v_caja AND estado = 'ABIERTO';
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-LADM', v_hoy, v_maria, 500, 'TOTAL') RETURNING id INTO v_turno;
  SELECT id INTO v_prod FROM productos WHERE tenant_id = v_tenant AND nombre = 'Hamburguesa Clásica' LIMIT 1;

  -- Movimientos a mano (como postgres): Ana gana 10 y 6 en dos cuentas de hoy, y canjea 5 tres veces con María.
  PERFORM lealtad_registrar_movimiento(NULL, v_tenant, v_ana, 'GANADO', 10, 1, gen_random_uuid(), v_suc, v_caja, v_maria);
  PERFORM lealtad_registrar_movimiento(NULL, v_tenant, v_ana, 'GANADO', 6, 1, gen_random_uuid(), v_suc, v_caja, v_maria);
  FOR i IN 1..3 LOOP
    PERFORM lealtad_registrar_movimiento(NULL, v_tenant, v_ana, 'CANJE', -5, 1, gen_random_uuid(), v_suc, v_caja, v_maria);
  END LOOP;
  PERFORM lealtad_registrar_movimiento(NULL, v_tenant, v_luis, 'GANADO', 4, 1, gen_random_uuid(), v_suc, v_caja, v_maria);

  -- §5 · resumen: emitido 20, canjeado 15, saldo vivo 1 + 4 = 5, dos clientes con saldo.
  v_r := lealtad_resumen(v_hoy, v_hoy, NULL);
  IF (v_r->>'emitido')::int <> 20 OR (v_r->>'canjeado')::int <> 15 THEN RAISE EXCEPTION 'resumen mal: %', v_r; END IF;
  IF (v_r->>'saldo_vivo')::int <> 5 OR (v_r->>'clientes_con_saldo')::int <> 2 THEN RAISE EXCEPTION 'saldos del resumen mal: %', v_r; END IF;
  -- Con una sucursal que no es, emitido y canjeado quedan en cero; el saldo es del negocio entero.
  v_r := lealtad_resumen(v_hoy, v_hoy, gen_random_uuid());
  IF (v_r->>'emitido')::int <> 0 OR (v_r->>'saldo_vivo')::int <> 5 THEN RAISE EXCEPTION 'filtro por sucursal mal: %', v_r; END IF;

  -- §5 · control: Ana llegó al tope (2 cuentas) hoy; hace falta que le pase 2 días para salir en la lista.
  v_r := lealtad_control(v_hoy, v_hoy);
  IF jsonb_array_length(v_r->'clientes_al_tope') <> 0 THEN RAISE EXCEPTION 'un solo día al tope no debe salir: %', v_r; END IF;
  PERFORM lealtad_registrar_movimiento(NULL, v_tenant, v_ana, 'GANADO', 1, 1, gen_random_uuid(), v_suc, v_caja, v_maria, p_fecha => now() - interval '1 day');
  PERFORM lealtad_registrar_movimiento(NULL, v_tenant, v_ana, 'GANADO', 1, 1, gen_random_uuid(), v_suc, v_caja, v_maria, p_fecha => now() - interval '1 day');
  v_r := lealtad_control(v_hoy - 1, v_hoy);
  IF (v_r->'clientes_al_tope'->0->>'dias_al_tope')::int <> 2 OR v_r->'clientes_al_tope'->0->>'cliente_nombre' <> 'Ana Resumen' THEN
    RAISE EXCEPTION 'clientes al tope mal: %', v_r;
  END IF;
  -- María hizo 3 canjes, todos a la misma clienta.
  IF (v_r->'cajeros'->0->>'canjes')::int <> 3 OR (v_r->'cajeros'->0->>'clientes')::int <> 1 OR (v_r->'cajeros'->0->>'del_cliente_top')::int <> 3 THEN
    RAISE EXCEPTION 'cajeros con canjes concentrados mal: %', v_r;
  END IF;

  -- §5 · el libro trae nombres, no solo ids.
  IF NOT EXISTS (SELECT 1 FROM vw_lealtad_movimientos WHERE cliente_nombre = 'Ana Resumen' AND tipo = 'CANJE' AND sucursal_nombre IS NOT NULL) THEN
    RAISE EXCEPTION 'vw_lealtad_movimientos no trae el nombre del cliente o de la sucursal';
  END IF;

  -- §4 · la lista de clientes trae el saldo del programa vigente; el de otra versión no cuenta.
  IF (SELECT lealtad_saldo FROM vw_clientes_lista WHERE id = v_ana) <> 3 THEN RAISE EXCEPTION 'saldo de Ana en la lista de clientes'; END IF;
  UPDATE lealtad_programa SET version = 2 WHERE tenant_id = v_tenant;
  IF (SELECT lealtad_saldo FROM vw_clientes_lista WHERE id = v_ana) <> 0 THEN RAISE EXCEPTION 'un saldo de otra versión del programa no debe mostrarse'; END IF;
  UPDATE lealtad_programa SET version = 1 WHERE tenant_id = v_tenant;

  -- §3 · el reporte del día suma el canje de una cuenta cobrada.
  v_t := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v_ana, NULL, 'smoke-ladm-1', v_maria);
  PERFORM agregar_item_a_ticket(v_t, v_prod, 1, NULL, '[]'::jsonb, 'smoke-ladm-1a');
  INSERT INTO ticket_canjes_lealtad (id, tenant_id, ticket_id, cliente_id, puntos, monto_descontado_mxn)
  VALUES (gen_random_uuid(), v_tenant, v_t, v_ana, 20, 20);
  PERFORM aplicar_pago(v_t, 'EFECTIVO'::metodo_pago, 100, 100);
  IF (SELECT lealtad_mxn FROM vw_estado_resultados_dia WHERE tenant_id = v_tenant AND sucursal_id = v_suc AND dia_contable = v_hoy) <> 20 THEN
    RAISE EXCEPTION 'vw_estado_resultados_dia no suma lealtad_mxn';
  END IF;

  RAISE NOTICE 'SMOKE LEALTAD ADMIN §3-§5 OK';
END $$;
ROLLBACK;
