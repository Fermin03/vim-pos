-- ============================================================================
-- Frutas y Abarrotes Doña Chela — negocio inventado para las capturas del giro Abarrotes y
-- fruterías (ABARROTES): fruta y verdura por kilo, abarrotes por pieza, clientes con crédito.
--
-- Misma receta que semilla-cafeteria.sql: solo Supabase LOCAL, idempotente, borra y vuelve a
-- crear SU tenant y nada más. Necesita las migraciones 0188–0223. Volver a correrla también
-- borra los tickets, abonos y cotizaciones de prueba de la captura.
--
--   docker exec -i supabase_db_vim-pos psql -U postgres -d postgres -q \
--     < sitio-web/_capturas/semilla-abarrotes.sql
--
-- Caja:  caja-72a00000-0000-4000-8000-000000000003@dispositivos.vimpos.com.mx / demo-dispositivo
-- PIN:   Toño Ruiz 1234 · Chela (dueña) 9999 · Panel: duena@donachela.demo / demo1234
-- ============================================================================

DO $limpieza$
DECLARE
  v_tenant uuid := '72a00000-0000-4000-8000-000000000001';
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
  v_tenant uuid := '72a00000-0000-4000-8000-000000000001';
  v_suc    uuid := '72a00000-0000-4000-8000-000000000002';
  v_caja   uuid := '72a00000-0000-4000-8000-000000000003';
  v_caj1   uuid := '72a00000-0000-4000-8000-000000000010';
  v_caj2   uuid := '72a00000-0000-4000-8000-000000000011';
  v_disp   uuid := '72a00000-0000-4000-8000-000000000012';
  v_duena  uuid := '72a00000-0000-4000-8000-000000000013';
  v_rol_dis uuid; v_rol_caj uuid; v_rol_due uuid; v_plan uuid;
  v_hoy date := (now() AT TIME ZONE 'America/Mexico_City')::date;
BEGIN
  DELETE FROM auth.users WHERE id IN (v_caj1, v_caj2, v_disp, v_duena);

  SELECT id INTO v_plan    FROM planes WHERE codigo = 'NEGOCIO';
  SELECT id INTO v_rol_caj FROM roles WHERE codigo = 'CAJERO' AND es_sistema;
  SELECT id INTO v_rol_dis FROM roles WHERE codigo = 'DISPOSITIVO' AND es_sistema;
  SELECT id INTO v_rol_due FROM roles WHERE codigo = 'DUENO' AND es_sistema;

  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal, plan_actual_id,
                       razon_social, rfc, regimen_fiscal, codigo_postal_fiscal, operacion)
  VALUES (v_tenant, 'abarrotes-dona-chela', 'Frutas y Abarrotes Doña Chela', 'ACTIVO', 'ABARROTES', v_plan,
          'GRACIELA MORALES TREJO', 'MOTG700312HG4', '612', '37480', juego_inicial_de_giro('ABARROTES'));

  INSERT INTO sucursales (id, tenant_id, codigo, nombre, ciudad, estado_geo)
  VALUES (v_suc, v_tenant, 'SMI', 'San Miguel', 'León', 'Guanajuato');
  INSERT INTO cajas (id, tenant_id, sucursal_id, numero, nombre)
  VALUES (v_caja, v_tenant, v_suc, 1, 'Caja 01');

  -- Crédito y cotizaciones: los enciende la dueña, sin costo.
  INSERT INTO configuracion_tenant (tenant_id, mostrar_qr_factura_ticket, pie_ticket, propina_sugerida_activa,
                                    modulo_credito_activo, modulo_cotizaciones_activo, cotizacion_vigencia_dias)
  VALUES (v_tenant, true, 'Gracias por su compra. Pedidos al 477 555 0142.', false, true, true, 15)
  ON CONFLICT (tenant_id) DO UPDATE SET pie_ticket = EXCLUDED.pie_ticket, propina_sugerida_activa = false,
     modulo_credito_activo = true, modulo_cotizaciones_activo = true, cotizacion_vigencia_dias = 15;

  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  SELECT '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
         crypt(u.clave, gen_salt('bf')), now(), now(), now(),
         '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''
    FROM (VALUES (v_caj1, 'tono@donachela.demo', 'demo1234'),
                 (v_caj2, 'mari@donachela.demo', 'demo1234'),
                 (v_disp, 'caja-72a00000-0000-4000-8000-000000000003@dispositivos.vimpos.com.mx', 'demo-dispositivo'),
                 (v_duena, 'duena@donachela.demo', 'demo1234')) AS u(id, email, clave);

  INSERT INTO usuarios_perfil (id, nombre, pin_hash, estado) VALUES
    (v_caj1,  'Toño Ruiz',          crypt('1234', gen_salt('bf')), 'ACTIVO'),
    (v_caj2,  'Mari Hernández',     crypt('5678', gen_salt('bf')), 'ACTIVO'),
    (v_disp,  'Caja 01',            NULL,                          'ACTIVO'),
    (v_duena, 'Graciela Morales',   crypt('9999', gen_salt('bf')), 'ACTIVO');
  INSERT INTO usuarios_acceso (usuario_id, tenant_id, sucursal_id, rol_id) VALUES
    (v_caj1, v_tenant, v_suc, v_rol_caj), (v_caj2, v_tenant, v_suc, v_rol_caj),
    (v_disp, v_tenant, v_suc, v_rol_dis), (v_duena, v_tenant, NULL, v_rol_due);

  INSERT INTO tenant_folios_saldo (tenant_id, folios_base_mensuales, folios_base_consumidos, periodo_actual, saldo_paquetes)
  VALUES (v_tenant, 50, 3, date_trunc('month', v_hoy)::date, 100);

  INSERT INTO proveedores (tenant_id, nombre, telefono) VALUES
    (v_tenant, 'Central de Abastos · bodega 14', '4777101414'), (v_tenant, 'Abarrotera del Centro', '4777204455');

  INSERT INTO categorias (id, tenant_id, nombre, orden_visualizacion, activa) VALUES
    ('72a00000-0000-4000-8000-0000000000c1', v_tenant, 'Verdura', 1, true),
    ('72a00000-0000-4000-8000-0000000000c2', v_tenant, 'Fruta', 2, true),
    ('72a00000-0000-4000-8000-0000000000c3', v_tenant, 'Abarrotes', 3, true),
    ('72a00000-0000-4000-8000-0000000000c4', v_tenant, 'Lácteos y huevo', 4, true),
    ('72a00000-0000-4000-8000-0000000000c5', v_tenant, 'Limpieza', 5, true);

  INSERT INTO productos (tenant_id, categoria_id, nombre, codigo_interno, precio_base_mxn, costo_mxn, clave_sat, tasa_iva,
                         iva_incluido_en_precio, estado, visible_en_pos, orden_visualizacion, controla_existencias, tipo_venta)
  SELECT v_tenant, ('72a00000-0000-4000-8000-0000000000c' || p.cat)::uuid, p.nombre, p.sku, p.precio, p.costo, p.sat, p.iva, true,
         'ACTIVO', true, p.ord, true, p.tipo::producto_tipo_venta
    FROM (VALUES
      -- Fruta y verdura: tasa 0, por kilo.
      (1, 'Jitomate saladet',   'V-JIT', 28.00, 17.00, '50405600', 0,  'PESO', 1),
      (1, 'Cebolla blanca',     'V-CEB', 24.00, 14.00, '50405500', 0,  'PESO', 2),
      (1, 'Papa blanca',        'V-PAP', 26.00, 15.00, '50405700', 0,  'PESO', 3),
      (1, 'Chile serrano',      'V-SER', 38.00, 22.00, '50405400', 0,  'PESO', 4),
      (1, 'Zanahoria',          'V-ZAN', 18.00, 10.00, '50405500', 0,  'PESO', 5),
      (1, 'Calabacita',         'V-CAL', 30.00, 18.00, '50405500', 0,  'PESO', 6),
      (1, 'Cilantro (manojo)',  'V-CIL', 8.00,  4.00,  '50405500', 0,  'UNIDAD', 7),
      (2, 'Aguacate hass',      'F-AGU', 72.00, 50.00, '50301500', 0,  'PESO', 1),
      (2, 'Limón sin semilla',  'F-LIM', 34.00, 20.00, '50301700', 0,  'PESO', 2),
      (2, 'Plátano tabasco',    'F-PLA', 22.00, 12.00, '50302500', 0,  'PESO', 3),
      (2, 'Manzana roja',       'F-MAN', 48.00, 30.00, '50301600', 0,  'PESO', 4),
      (2, 'Papaya maradol',     'F-PAP', 32.00, 18.00, '50303200', 0,  'PESO', 5),
      (2, 'Naranja para jugo',  'F-NAR', 16.00, 9.00,  '50301900', 0,  'PESO', 6),
      -- Abarrotes por pieza.
      (3, 'Arroz súper extra 1 kg',     'A-ARR-1',  32.00, 23.00, '50221000', 0,  'UNIDAD', 1),
      (3, 'Frijol pinto 1 kg',          'A-FRI-1',  42.00, 31.00, '50221000', 0,  'UNIDAD', 2),
      (3, 'Aceite vegetal 1 l',         'A-ACE-1',  46.00, 34.00, '50151500', 0,  'UNIDAD', 3),
      (3, 'Azúcar estándar 1 kg',       'A-AZU-1',  34.00, 25.00, '50161500', 0,  'UNIDAD', 4),
      (3, 'Sopa de pasta 200 g',        'A-SOP-200', 12.00, 7.50, '50192600', 0,  'UNIDAD', 5),
      (3, 'Atún en agua 140 g',         'A-ATU-140', 24.00, 16.00,'50121500', 0,  'UNIDAD', 6),
      (3, 'Café soluble 120 g',         'A-CAF-120', 89.00, 64.00,'50201700', 0,  'UNIDAD', 7),
      (4, 'Huevo blanco 18 piezas',     'L-HUE-18', 62.00, 48.00, '50131600', 0,  'UNIDAD', 1),
      (4, 'Leche entera 1 l',           'L-LEC-1',  29.00, 22.00, '50131700', 0,  'UNIDAD', 2),
      (4, 'Queso fresco',               'L-QUE',    140.00, 98.00,'50131800', 0,  'PESO',   3),
      (4, 'Crema 450 ml',               'L-CRE-450', 44.00, 32.00,'50131700', 0,  'UNIDAD', 4),
      (5, 'Detergente en polvo 1 kg',   'X-DET-1',  52.00, 36.00, '47131800', 16, 'UNIDAD', 1),
      (5, 'Cloro 1 l',                  'X-CLO-1',  21.00, 13.00, '47131800', 16, 'UNIDAD', 2),
      (5, 'Papel higiénico 4 rollos',   'X-PAP-4',  38.00, 26.00, '14111700', 16, 'UNIDAD', 3)
    ) AS p(cat, nombre, sku, precio, costo, sat, iva, tipo, ord);

  -- Clientes de la colonia; tres con crédito.
  INSERT INTO clientes (id, tenant_id, nombre, telefono) VALUES
    ('72a00000-0000-4000-8000-0000000000e1', v_tenant, 'Fonda La Güera', '4775550211'),
    ('72a00000-0000-4000-8000-0000000000e2', v_tenant, 'Lupita Ramírez', '4775550212'),
    ('72a00000-0000-4000-8000-0000000000e3', v_tenant, 'Cocina Económica Mary', '4775550213'),
    ('72a00000-0000-4000-8000-0000000000e4', v_tenant, 'Taquería El Güero', '4775550214'),
    ('72a00000-0000-4000-8000-0000000000e5', v_tenant, 'Don Ramiro Salas', '4775550215');
  INSERT INTO clientes_credito (tenant_id, cliente_id, limite_mxn, plazo_dias) VALUES
    (v_tenant, '72a00000-0000-4000-8000-0000000000e1', 4000, 15),
    (v_tenant, '72a00000-0000-4000-8000-0000000000e2', 1500, 15),
    (v_tenant, '72a00000-0000-4000-8000-0000000000e3', 6000, 30),
    (v_tenant, '72a00000-0000-4000-8000-0000000000e5', 800, 8);

  INSERT INTO tenant_onboarding_estado (tenant_id, fase) VALUES (v_tenant, 'GO_LIVE')
  ON CONFLICT (tenant_id) DO UPDATE SET fase = 'GO_LIVE';
END $$;

-- ── Existencias de arranque ──────────────────────────────────────────────────
DO $$
DECLARE
  v_tenant uuid := '72a00000-0000-4000-8000-000000000001';
  v_suc    uuid := '72a00000-0000-4000-8000-000000000002';
  v_duena  uuid := '72a00000-0000-4000-8000-000000000013';
  v_lineas jsonb; v_prov uuid; p record;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_duena, 'tenant_id', v_tenant)::text, true);
  SELECT id INTO v_prov FROM proveedores WHERE tenant_id = v_tenant AND nombre LIKE 'Central%';
  SELECT jsonb_agg(jsonb_build_object('producto_id', pr.id,
           'cantidad', CASE WHEN pr.tipo_venta = 'PESO' THEN 40 ELSE 30 END, 'costo', pr.costo_mxn))
    INTO v_lineas FROM productos pr WHERE pr.tenant_id = v_tenant;
  PERFORM recibir_mercancia(v_suc, v_prov, v_lineas, 'Nota 5521');
  FOR p IN SELECT id, tipo_venta FROM productos WHERE tenant_id = v_tenant LOOP
    PERFORM fijar_minimo_producto(v_suc, p.id, CASE WHEN p.tipo_venta = 'PESO' THEN 8 ELSE 6 END);
  END LOOP;
  SET session_replication_role = replica;
  UPDATE movimientos_producto SET creado_at = now() - interval '25 days' WHERE tenant_id = v_tenant;
  SET session_replication_role = origin;
END $$;

-- ── Turnos y ventas de contado de la última semana ───────────────────────────
DO $$
DECLARE
  v_tenant uuid := '72a00000-0000-4000-8000-000000000001';
  v_suc    uuid := '72a00000-0000-4000-8000-000000000002';
  v_caja   uuid := '72a00000-0000-4000-8000-000000000003';
  v_turno  uuid := '72a00000-0000-4000-8000-000000000004';
  v_caj1   uuid := '72a00000-0000-4000-8000-000000000010';
  v_caj2   uuid := '72a00000-0000-4000-8000-000000000011';
  v_hoy date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_t uuid; v_n int := 0; v_dia int; v_k int; v_fecha timestamptz; v_l record; v_td uuid; v_ini timestamptz;
BEGIN
  FOR v_dia IN REVERSE 6..0 LOOP
    v_ini := date_trunc('day', now() AT TIME ZONE 'America/Mexico_City') AT TIME ZONE 'America/Mexico_City' - make_interval(days => v_dia);
    v_td := CASE WHEN v_dia = 0 THEN v_turno ELSE gen_random_uuid() END;
    INSERT INTO turnos (id, tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fecha_apertura)
    VALUES (v_td, v_tenant, v_suc, v_caja, 'T-' || to_char(v_hoy - v_dia, 'MMDD'), v_hoy - v_dia, v_caj1, 800,
            LEAST(v_ini + interval '8 hours', now() - interval '7 hours'));
    FOR v_k IN 1..(CASE WHEN v_dia = 0 THEN 6 ELSE 9 END) LOOP
      v_n := v_n + 1;
      v_fecha := v_ini + make_interval(hours => 8, mins => v_k * 52 + (v_n * 11) % 30);
      IF v_fecha > now() - interval '25 minutes' THEN CONTINUE; END IF;
      INSERT INTO tickets (tenant_id, sucursal_id, caja_id, turno_id, dia_contable, modo_servicio, usuario_apertura_id, fecha_apertura)
      VALUES (v_tenant, v_suc, v_caja, v_td, v_hoy - v_dia, 'PARA_LLEVAR', CASE WHEN v_n % 3 = 0 THEN v_caj2 ELSE v_caj1 END, v_fecha)
      RETURNING id INTO v_t;
      FOR v_l IN
        SELECT p.id, p.nombre, p.precio_base_mxn, p.tasa_iva, p.tipo_venta, c.nombre AS categoria
          FROM productos p JOIN categorias c ON c.id = p.categoria_id
         WHERE p.tenant_id = v_tenant
         ORDER BY md5(p.id::text || v_n::text)
         LIMIT 2 + (v_n % 4)
      LOOP
        INSERT INTO ticket_items (tenant_id, ticket_id, producto_id, cantidad, producto_nombre_snapshot, precio_unitario_snapshot,
                                  tasa_iva_snapshot, iva_incluido_en_precio_snapshot, categoria_nombre_snapshot, orden_visualizacion)
        VALUES (v_tenant, v_t, v_l.id,
                CASE WHEN v_l.tipo_venta = 'PESO' THEN round((0.5 + ((v_n * 7 + length(v_l.nombre)) % 8) * 0.25)::numeric, 3) ELSE 1 + v_n % 2 END,
                v_l.nombre, v_l.precio_base_mxn, v_l.tasa_iva, true, v_l.categoria, 1);
      END LOOP;
      INSERT INTO pagos (tenant_id, sucursal_id, caja_id, turno_id, ticket_id, dia_contable, metodo_pago, monto_mxn, usuario_id, fecha_pago)
      SELECT v_tenant, v_suc, v_caja, t.turno_id, v_t, t.dia_contable,
             (ARRAY['EFECTIVO','EFECTIVO','TARJETA_DEBITO','EFECTIVO','TRANSFERENCIA'])[1 + v_n % 5]::metodo_pago,
             t.total_mxn, t.usuario_apertura_id, v_fecha + interval '2 minutes'
        FROM tickets t WHERE t.id = v_t;
    END LOOP;
    IF v_dia > 0 THEN
      SET session_replication_role = replica;
      UPDATE turnos SET estado = 'CERRADO', fecha_cierre = v_ini + interval '21 hours' WHERE id = v_td;
      SET session_replication_role = origin;
    END IF;
  END LOOP;

  SET session_replication_role = replica;
  UPDATE tickets SET fecha_pago = fecha_apertura + interval '2 minutes' WHERE tenant_id = v_tenant AND fecha_pago IS NOT NULL;
  UPDATE movimientos_producto m SET creado_at = t.fecha_apertura + interval '2 minutes'
    FROM tickets t WHERE m.ticket_id = t.id AND m.tenant_id = v_tenant;
  SET session_replication_role = origin;
  RAISE NOTICE 'Doña Chela: % ventas de contado.', v_n;
END $$;

-- ── Ventas a crédito y un abono, por las mismas RPC que usa la caja ──────────
-- Se hacen en el turno abierto y después se fechan atrás: una de la Fonda queda vencida (va al final:
-- con un vencido, la caja ya no le fía sin autorización).
DO $$
DECLARE
  v_tenant uuid := '72a00000-0000-4000-8000-000000000001';
  v_suc    uuid := '72a00000-0000-4000-8000-000000000002';
  v_caja   uuid := '72a00000-0000-4000-8000-000000000003';
  v_turno  uuid := '72a00000-0000-4000-8000-000000000004';
  v_caj1   uuid := '72a00000-0000-4000-8000-000000000010';
  v RECORD; v_t uuid; i record;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_caj1, 'tenant_id', v_tenant)::text, true);
  FOR v IN SELECT * FROM (VALUES
      ('72a00000-0000-4000-8000-0000000000e1'::uuid, 6,  ARRAY['V-JIT','F-AGU','L-QUE','A-ARR-1'],        ARRAY[6, 2, 1.25, 3]),
      ('72a00000-0000-4000-8000-0000000000e1'::uuid, 19, ARRAY['V-JIT','V-CEB','V-SER','F-LIM','A-ACE-1'], ARRAY[5, 4, 1.5, 3, 4]),
      ('72a00000-0000-4000-8000-0000000000e2'::uuid, 4,  ARRAY['L-HUE-18','L-LEC-1','A-AZU-1','F-PLA'],   ARRAY[1, 3, 1, 1.5]),
      ('72a00000-0000-4000-8000-0000000000e3'::uuid, 11, ARRAY['V-PAP','V-JIT','V-CAL','A-FRI-1','A-ACE-1','L-CRE-450'], ARRAY[10, 8, 4, 5, 6, 4]),
      ('72a00000-0000-4000-8000-0000000000e5'::uuid, 12, ARRAY['A-CAF-120','X-DET-1','X-PAP-4'],          ARRAY[1, 1, 2])
    ) AS x(cliente, dias, skus, cants)
  LOOP
    v_t := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, v.cliente, NULL, NULL, v_caj1);
    FOR i IN SELECT p.id, x.c FROM unnest(v.skus, v.cants) AS x(sku, c) JOIN productos p ON p.codigo_interno = x.sku AND p.tenant_id = v_tenant LOOP
      PERFORM agregar_item_a_ticket(v_t, i.id, i.c::numeric, NULL, '[]'::jsonb, NULL);
    END LOOP;
    PERFORM pagar_a_credito(v_t);
    SET session_replication_role = replica;
    UPDATE tickets SET fecha_apertura = now() - make_interval(days => v.dias, hours => 2),
                       fecha_pago = now() - make_interval(days => v.dias, hours => 2)
     WHERE id = v_t;
    UPDATE pagos SET fecha_pago = now() - make_interval(days => v.dias, hours => 2) WHERE ticket_id = v_t;
    SET session_replication_role = origin;
  END LOOP;

  -- La Fonda abonó $500 la semana pasada.
  PERFORM registrar_abono('72a00000-0000-4000-8000-0000000000e1', 500, 'EFECTIVO'::metodo_pago, v_caja, v_turno, NULL);
  SET session_replication_role = replica;
  UPDATE abonos_credito SET created_at = now() - interval '5 days' WHERE tenant_id = v_tenant;
  SET session_replication_role = origin;
  RAISE NOTICE 'Frutas y Abarrotes Doña Chela creada.';
END $$;
