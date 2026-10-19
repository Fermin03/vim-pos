-- ============================================================================
-- Vinatería La Barrica — negocio inventado para las capturas del giro Vinos y licores (VINOS).
--
-- Misma receta que semilla-cafeteria.sql: solo Supabase LOCAL, idempotente, borra y vuelve a
-- crear SU tenant y nada más. Necesita las migraciones 0188–0223. Volver a correrla también
-- borra los tickets y recepciones de prueba de la captura.
--
--   docker exec -i supabase_db_vim-pos psql -U postgres -d postgres -q \
--     < sitio-web/_capturas/semilla-vinos.sql
--
-- Caja:  caja-71a00000-0000-4000-8000-000000000003@dispositivos.vimpos.com.mx / demo-dispositivo
-- PIN:   Luis Ortega 1234 · Rodrigo (dueño) 9999 · Panel: dueno@labarrica.demo / demo1234
-- Los nombres de los productos son genéricos a propósito: ninguna marca real.
-- ============================================================================

DO $limpieza$
DECLARE
  v_tenant uuid := '71a00000-0000-4000-8000-000000000001';
  t record;
BEGIN
  SET session_replication_role = replica;
  FOR t IN
    SELECT c.table_schema, c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
     WHERE c.column_name = 'tenant_id' AND c.table_schema = 'public' AND tb.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('DELETE FROM %I.%I WHERE tenant_id = $1', t.table_schema, t.table_name) USING v_tenant;
  END LOOP;
  DELETE FROM tenants WHERE id = v_tenant;
  SET session_replication_role = origin;
END
$limpieza$;

DO $$
DECLARE
  v_tenant uuid := '71a00000-0000-4000-8000-000000000001';
  v_suc    uuid := '71a00000-0000-4000-8000-000000000002';
  v_caja   uuid := '71a00000-0000-4000-8000-000000000003';
  v_caj1   uuid := '71a00000-0000-4000-8000-000000000010';
  v_caj2   uuid := '71a00000-0000-4000-8000-000000000011';
  v_disp   uuid := '71a00000-0000-4000-8000-000000000012';
  v_dueno  uuid := '71a00000-0000-4000-8000-000000000013';
  v_rol_dis uuid; v_rol_caj uuid; v_rol_due uuid; v_plan uuid;
  v_hoy date := (now() AT TIME ZONE 'America/Mexico_City')::date;
BEGIN
  DELETE FROM auth.users WHERE id IN (v_caj1, v_caj2, v_disp, v_dueno);

  SELECT id INTO v_plan    FROM planes WHERE codigo = 'NEGOCIO';
  SELECT id INTO v_rol_caj FROM roles WHERE codigo = 'CAJERO' AND es_sistema;
  SELECT id INTO v_rol_dis FROM roles WHERE codigo = 'DISPOSITIVO' AND es_sistema;
  SELECT id INTO v_rol_due FROM roles WHERE codigo = 'DUENO' AND es_sistema;

  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal, plan_actual_id,
                       razon_social, rfc, regimen_fiscal, codigo_postal_fiscal, operacion)
  VALUES (v_tenant, 'vinateria-la-barrica', 'Vinatería La Barrica', 'ACTIVO', 'VINOS', v_plan,
          'VINATERIA LA BARRICA', 'VLB180903MN2', '612', '37160', juego_inicial_de_giro('VINOS'));

  INSERT INTO sucursales (id, tenant_id, codigo, nombre, ciudad, estado_geo)
  VALUES (v_suc, v_tenant, 'JDL', 'Jardines del Moral', 'León', 'Guanajuato');
  INSERT INTO cajas (id, tenant_id, sucursal_id, numero, nombre)
  VALUES (v_caja, v_tenant, v_suc, 1, 'Caja 01');

  INSERT INTO configuracion_tenant (tenant_id, mostrar_qr_factura_ticket, pie_ticket, propina_sugerida_activa)
  VALUES (v_tenant, true, 'Prohibida la venta de bebidas alcohólicas a menores de edad.', false)
  ON CONFLICT (tenant_id) DO UPDATE SET pie_ticket = EXCLUDED.pie_ticket, propina_sugerida_activa = false;

  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  SELECT '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
         crypt(u.clave, gen_salt('bf')), now(), now(), now(),
         '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''
    FROM (VALUES (v_caj1, 'luis@labarrica.demo', 'demo1234'),
                 (v_caj2, 'paty@labarrica.demo', 'demo1234'),
                 (v_disp, 'caja-71a00000-0000-4000-8000-000000000003@dispositivos.vimpos.com.mx', 'demo-dispositivo'),
                 (v_dueno, 'dueno@labarrica.demo', 'demo1234')) AS u(id, email, clave);

  INSERT INTO usuarios_perfil (id, nombre, pin_hash, estado) VALUES
    (v_caj1,  'Luis Ortega',      crypt('1234', gen_salt('bf')), 'ACTIVO'),
    (v_caj2,  'Paty Rangel',      crypt('5678', gen_salt('bf')), 'ACTIVO'),
    (v_disp,  'Caja 01',          NULL,                          'ACTIVO'),
    (v_dueno, 'Rodrigo Aranda',   crypt('9999', gen_salt('bf')), 'ACTIVO');
  INSERT INTO usuarios_acceso (usuario_id, tenant_id, sucursal_id, rol_id) VALUES
    (v_caj1, v_tenant, v_suc, v_rol_caj), (v_caj2, v_tenant, v_suc, v_rol_caj),
    (v_disp, v_tenant, v_suc, v_rol_dis), (v_dueno, v_tenant, NULL, v_rol_due);

  INSERT INTO tenant_folios_saldo (tenant_id, folios_base_mensuales, folios_base_consumidos, periodo_actual, saldo_paquetes)
  VALUES (v_tenant, 50, 6, date_trunc('month', v_hoy)::date, 100);

  INSERT INTO proveedores (tenant_id, nombre, telefono) VALUES
    (v_tenant, 'Distribuidora de Vinos del Bajío', '4777201188'), (v_tenant, 'Cervecera Regional', '4777305566'),
    (v_tenant, 'Mezcales de Oaxaca Mayoreo', '9515012233');

  INSERT INTO categorias (id, tenant_id, nombre, orden_visualizacion, activa) VALUES
    ('71a00000-0000-4000-8000-0000000000c1', v_tenant, 'Vino tinto', 1, true),
    ('71a00000-0000-4000-8000-0000000000c2', v_tenant, 'Vino blanco y rosado', 2, true),
    ('71a00000-0000-4000-8000-0000000000c3', v_tenant, 'Tequila y mezcal', 3, true),
    ('71a00000-0000-4000-8000-0000000000c4', v_tenant, 'Destilados', 4, true),
    ('71a00000-0000-4000-8000-0000000000c5', v_tenant, 'Cerveza', 5, true),
    ('71a00000-0000-4000-8000-0000000000c6', v_tenant, 'Botanas y hielo', 6, true);

  INSERT INTO productos (tenant_id, categoria_id, nombre, codigo_interno, precio_base_mxn, costo_mxn, clave_sat, tasa_iva,
                         iva_incluido_en_precio, estado, visible_en_pos, orden_visualizacion, controla_existencias)
  SELECT v_tenant, ('71a00000-0000-4000-8000-0000000000c' || p.cat)::uuid, p.nombre, p.sku, p.precio, p.costo, p.sat, 16, true,
         'ACTIVO', true, p.ord, true
    FROM (VALUES
      (1, 'Tinto Cabernet Sauvignon · Valle de Guadalupe 750 ml', 'VT-CAB-750', 389, 210, '50202203', 1),
      (1, 'Tinto Tempranillo · Valle de Parras 750 ml',           'VT-TEM-750', 329, 175, '50202203', 2),
      (1, 'Tinto Malbec · importado 750 ml',                       'VT-MAL-750', 299, 160, '50202203', 3),
      (1, 'Tinto Nebbiolo reserva 750 ml',                         'VT-NEB-750', 649, 380, '50202203', 4),
      (1, 'Tinto joven de la casa 750 ml',                         'VT-CAS-750', 189, 95,  '50202203', 5),
      (2, 'Blanco Sauvignon Blanc 750 ml',                         'VB-SAU-750', 319, 170, '50202203', 1),
      (2, 'Blanco Chardonnay 750 ml',                              'VB-CHA-750', 349, 185, '50202203', 2),
      (2, 'Rosado de Garnacha 750 ml',                             'VB-ROS-750', 279, 145, '50202203', 3),
      (2, 'Espumoso brut 750 ml',                                  'VB-ESP-750', 459, 250, '50202203', 4),
      (3, 'Tequila blanco 100% agave 750 ml',                      'TQ-BLA-750', 429, 240, '50202206', 1),
      (3, 'Tequila reposado 100% agave 750 ml',                    'TQ-REP-750', 519, 290, '50202206', 2),
      (3, 'Tequila añejo 100% agave 750 ml',                       'TQ-ANE-750', 789, 450, '50202206', 3),
      (3, 'Mezcal espadín joven 750 ml',                           'MZ-ESP-750', 549, 300, '50202206', 4),
      (3, 'Mezcal tobalá 750 ml',                                  'MZ-TOB-750', 1150, 700, '50202206', 5),
      (3, 'Raicilla de la sierra 750 ml',                          'RC-SIE-750', 690, 400, '50202206', 6),
      (4, 'Whisky escocés 12 años 750 ml',                         'DS-WHI-750', 899, 520, '50202206', 1),
      (4, 'Ron añejo 750 ml',                                      'DS-RON-750', 349, 190, '50202206', 2),
      (4, 'Ginebra seca 750 ml',                                   'DS-GIN-750', 559, 310, '50202206', 3),
      (4, 'Vodka 750 ml',                                          'DS-VOD-750', 299, 160, '50202206', 4),
      (4, 'Brandy 700 ml',                                         'DS-BRA-700', 279, 150, '50202206', 5),
      (5, 'Cerveza clara · six 355 ml',                            'CZ-CLA-6',   129, 88,  '50202201', 1),
      (5, 'Cerveza oscura · six 355 ml',                           'CZ-OSC-6',   139, 94,  '50202201', 2),
      (5, 'Cerveza artesanal IPA 355 ml',                          'CZ-IPA-1',   65,  38,  '50202201', 3),
      (5, 'Cerveza artesanal stout 355 ml',                        'CZ-STO-1',   69,  40,  '50202201', 4),
      (5, 'Caguama clara 1.2 l',                                   'CZ-CAG-12',  52,  36,  '50202201', 5),
      (6, 'Bolsa de hielo 5 kg',                                   'BT-HIE-5',   38,  18,  '50202301', 1),
      (6, 'Cacahuate japonés 200 g',                               'BT-CAC-200', 35,  19,  '50192100', 2),
      (6, 'Agua mineral 2 l',                                      'BT-MIN-2',   32,  17,  '50202301', 3),
      (6, 'Refresco de cola 2.5 l',                                'BT-REF-25',  45,  28,  '50202301', 4)
    ) AS p(cat, nombre, sku, precio, costo, sat, ord);

  INSERT INTO tenant_onboarding_estado (tenant_id, fase) VALUES (v_tenant, 'GO_LIVE')
  ON CONFLICT (tenant_id) DO UPDATE SET fase = 'GO_LIVE';
END $$;

-- ── Existencias: entran por «Recibir mercancía», con mínimos por producto ────
DO $$
DECLARE
  v_tenant uuid := '71a00000-0000-4000-8000-000000000001';
  v_suc    uuid := '71a00000-0000-4000-8000-000000000002';
  v_dueno  uuid := '71a00000-0000-4000-8000-000000000013';
  v_prov   uuid; v_lineas jsonb; p record;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno, 'tenant_id', v_tenant)::text, true);
  SELECT id INTO v_prov FROM proveedores WHERE tenant_id = v_tenant AND nombre LIKE 'Distribuidora%';

  -- Cantidad y mínimo por SKU. Los que quedan por debajo del mínimo son las alertas de la captura.
  SELECT jsonb_agg(jsonb_build_object('producto_id', pr.id, 'cantidad', x.cant, 'costo', pr.costo_mxn))
    INTO v_lineas
    FROM productos pr JOIN (VALUES
      ('VT-CAB-750', 18), ('VT-TEM-750', 14), ('VT-MAL-750', 24), ('VT-NEB-750', 2), ('VT-CAS-750', 36),
      ('VB-SAU-750', 12), ('VB-CHA-750', 10), ('VB-ROS-750', 9),  ('VB-ESP-750', 3),
      ('TQ-BLA-750', 20), ('TQ-REP-750', 22), ('TQ-ANE-750', 3),  ('MZ-ESP-750', 15), ('MZ-TOB-750', 2), ('RC-SIE-750', 1),
      ('DS-WHI-750', 9),  ('DS-RON-750', 16), ('DS-GIN-750', 4),  ('DS-VOD-750', 18), ('DS-BRA-700', 14),
      ('CZ-CLA-6', 60),   ('CZ-OSC-6', 30),   ('CZ-IPA-1', 40),   ('CZ-STO-1', 30),  ('CZ-CAG-12', 48),
      ('BT-HIE-5', 30),   ('BT-CAC-200', 40), ('BT-MIN-2', 24),   ('BT-REF-25', 24)) AS x(sku, cant)
      ON x.sku = pr.codigo_interno
   WHERE pr.tenant_id = v_tenant;
  PERFORM recibir_mercancia(v_suc, v_prov, v_lineas, 'Factura DVB-10433');

  FOR p IN SELECT pr.id, x.minimo FROM productos pr JOIN (VALUES
      ('VT-CAB-750', 12), ('VT-TEM-750', 8), ('VT-MAL-750', 8), ('VT-NEB-750', 3), ('VT-CAS-750', 12),
      ('VB-SAU-750', 6), ('VB-CHA-750', 6), ('VB-ROS-750', 6), ('VB-ESP-750', 4),
      ('TQ-BLA-750', 10), ('TQ-REP-750', 10), ('TQ-ANE-750', 4), ('MZ-ESP-750', 10), ('MZ-TOB-750', 3), ('RC-SIE-750', 3),
      ('DS-WHI-750', 4), ('DS-RON-750', 6), ('DS-GIN-750', 4), ('DS-VOD-750', 6), ('DS-BRA-700', 6),
      ('CZ-CLA-6', 36), ('CZ-OSC-6', 18), ('CZ-IPA-1', 24), ('CZ-STO-1', 12), ('CZ-CAG-12', 24),
      ('BT-HIE-5', 20), ('BT-CAC-200', 12), ('BT-MIN-2', 12), ('BT-REF-25', 12)) AS x(sku, minimo)
      ON x.sku = pr.codigo_interno WHERE pr.tenant_id = v_tenant
  LOOP
    PERFORM fijar_minimo_producto(v_suc, p.id, p.minimo);
  END LOOP;

  SET session_replication_role = replica;
  UPDATE movimientos_producto SET creado_at = now() - interval '8 days' WHERE tenant_id = v_tenant;
  SET session_replication_role = origin;
END $$;

-- ── Una semana de ventas (fin de semana fuerte) y el turno de hoy abierto ────
DO $$
DECLARE
  v_tenant uuid := '71a00000-0000-4000-8000-000000000001';
  v_suc    uuid := '71a00000-0000-4000-8000-000000000002';
  v_caja   uuid := '71a00000-0000-4000-8000-000000000003';
  v_turno  uuid := '71a00000-0000-4000-8000-000000000004';
  v_caj1   uuid := '71a00000-0000-4000-8000-000000000010';
  v_caj2   uuid := '71a00000-0000-4000-8000-000000000011';
  v_hoy date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_t uuid; v_n int := 0; v_dia int; v_k int; v_fecha timestamptz; v_l record; v_td uuid; v_ini timestamptz;
BEGIN
  FOR v_dia IN REVERSE 6..0 LOOP
    v_ini := date_trunc('day', now() AT TIME ZONE 'America/Mexico_City') AT TIME ZONE 'America/Mexico_City' - make_interval(days => v_dia);
    v_td := CASE WHEN v_dia = 0 THEN v_turno ELSE gen_random_uuid() END;
    INSERT INTO turnos (id, tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fecha_apertura)
    VALUES (v_td, v_tenant, v_suc, v_caja, 'T-' || to_char(v_hoy - v_dia, 'MMDD'), v_hoy - v_dia, v_caj1, 1500,
            LEAST(v_ini + interval '10 hours', now() - interval '5 hours'));
    FOR v_k IN 1..(CASE WHEN v_dia = 0 THEN 5 WHEN extract(isodow FROM v_hoy - v_dia) IN (5, 6) THEN 12 ELSE 7 END) LOOP
      v_n := v_n + 1;
      v_fecha := v_ini + make_interval(hours => 11, mins => v_k * 48 + (v_n * 13) % 30);
      IF v_fecha > now() - interval '25 minutes' THEN CONTINUE; END IF;
      INSERT INTO tickets (tenant_id, sucursal_id, caja_id, turno_id, dia_contable, modo_servicio, usuario_apertura_id, fecha_apertura)
      VALUES (v_tenant, v_suc, v_caja, v_td, v_hoy - v_dia, 'PARA_LLEVAR', CASE WHEN v_n % 3 = 0 THEN v_caj2 ELSE v_caj1 END, v_fecha)
      RETURNING id INTO v_t;
      FOR v_l IN
        SELECT p.id, p.nombre, p.precio_base_mxn, c.nombre AS categoria
          FROM productos p JOIN categorias c ON c.id = p.categoria_id
         WHERE p.tenant_id = v_tenant AND p.controla_existencias AND p.deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM producto_existencias e WHERE e.producto_id = p.id AND e.cantidad > e.minimo + 1)
         ORDER BY md5(p.id::text || v_n::text)
         LIMIT 1 + (v_n % 3)
      LOOP
        INSERT INTO ticket_items (tenant_id, ticket_id, producto_id, cantidad, producto_nombre_snapshot, precio_unitario_snapshot,
                                  tasa_iva_snapshot, iva_incluido_en_precio_snapshot, categoria_nombre_snapshot, orden_visualizacion)
        VALUES (v_tenant, v_t, v_l.id, CASE WHEN v_l.categoria IN ('Cerveza', 'Botanas y hielo') THEN 2 ELSE 1 END,
                v_l.nombre, v_l.precio_base_mxn, 16, true, v_l.categoria, 1);
      END LOOP;
      INSERT INTO pagos (tenant_id, sucursal_id, caja_id, turno_id, ticket_id, dia_contable, metodo_pago, monto_mxn, usuario_id, fecha_pago)
      SELECT v_tenant, v_suc, v_caja, t.turno_id, v_t, t.dia_contable,
             (ARRAY['EFECTIVO','TARJETA_DEBITO','TARJETA_CREDITO','EFECTIVO','TRANSFERENCIA'])[1 + v_n % 5]::metodo_pago,
             t.total_mxn, t.usuario_apertura_id, v_fecha + interval '2 minutes'
        FROM tickets t WHERE t.id = v_t;
    END LOOP;
    IF v_dia > 0 THEN
      SET session_replication_role = replica;
      UPDATE turnos SET estado = 'CERRADO', fecha_cierre = v_ini + interval '22 hours' WHERE id = v_td;
      SET session_replication_role = origin;
    END IF;
  END LOOP;

  SET session_replication_role = replica;
  UPDATE tickets SET fecha_pago = fecha_apertura + interval '2 minutes' WHERE tenant_id = v_tenant AND fecha_pago IS NOT NULL;
  UPDATE movimientos_producto m SET creado_at = t.fecha_apertura + interval '2 minutes'
    FROM tickets t WHERE m.ticket_id = t.id AND m.tenant_id = v_tenant;
  SET session_replication_role = origin;

  RAISE NOTICE 'Vinatería La Barrica creada (% ventas).', v_n;
END $$;
