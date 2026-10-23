-- ============================================================================
-- Boutique Amaranta — negocio inventado para las capturas del giro Tienda de ropa (RETAIL).
--
-- Misma receta que semilla-cafeteria.sql: solo Supabase LOCAL, idempotente, borra y vuelve a
-- crear SU tenant y nada más. Necesita las migraciones 0188–0223 (variantes, existencias,
-- crédito, cotizaciones). Volver a correrla también borra los tickets de prueba de la captura.
--
--   docker exec -i supabase_db_vim-pos psql -U postgres -d postgres -q \
--     < sitio-web/_capturas/semilla-tienda-ropa.sql
--
-- Caja:  caja-70a00000-0000-4000-8000-000000000003@dispositivos.vimpos.com.mx / demo-dispositivo
-- PIN:   Karla Méndez 1234 · Daniela (dueña) 9999 · Panel: duena@amaranta.demo / demo1234
-- ============================================================================

DO $limpieza$
DECLARE
  v_tenant uuid := '70a00000-0000-4000-8000-000000000001';
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

-- ── Negocio, sucursal, caja, personas y catálogo ─────────────────────────────
DO $$
DECLARE
  v_tenant uuid := '70a00000-0000-4000-8000-000000000001';
  v_suc    uuid := '70a00000-0000-4000-8000-000000000002';
  v_caja   uuid := '70a00000-0000-4000-8000-000000000003';
  v_caj1   uuid := '70a00000-0000-4000-8000-000000000010';
  v_caj2   uuid := '70a00000-0000-4000-8000-000000000011';
  v_disp   uuid := '70a00000-0000-4000-8000-000000000012';
  v_duena  uuid := '70a00000-0000-4000-8000-000000000013';
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
  VALUES (v_tenant, 'boutique-amaranta', 'Boutique Amaranta', 'ACTIVO', 'RETAIL', v_plan,
          'BOUTIQUE AMARANTA', 'BAM210514QX3', '612', '37000', juego_inicial_de_giro('RETAIL'));

  INSERT INTO sucursales (id, tenant_id, codigo, nombre, ciudad, estado_geo)
  VALUES (v_suc, v_tenant, 'CEN', 'Centro', 'León', 'Guanajuato');
  INSERT INTO cajas (id, tenant_id, sucursal_id, numero, nombre)
  VALUES (v_caja, v_tenant, v_suc, 1, 'Caja 01');

  INSERT INTO configuracion_tenant (tenant_id, mostrar_qr_factura_ticket, pie_ticket, propina_sugerida_activa)
  VALUES (v_tenant, true, 'Cambios de talla dentro de 30 días con tu ticket y la etiqueta puesta.', false)
  ON CONFLICT (tenant_id) DO UPDATE SET pie_ticket = EXCLUDED.pie_ticket, propina_sugerida_activa = false;

  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  SELECT '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
         crypt(u.clave, gen_salt('bf')), now(), now(), now(),
         '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''
    FROM (VALUES (v_caj1, 'karla@amaranta.demo', 'demo1234'),
                 (v_caj2, 'renata@amaranta.demo', 'demo1234'),
                 (v_disp, 'caja-70a00000-0000-4000-8000-000000000003@dispositivos.vimpos.com.mx', 'demo-dispositivo'),
                 (v_duena, 'duena@amaranta.demo', 'demo1234')) AS u(id, email, clave);

  INSERT INTO usuarios_perfil (id, nombre, pin_hash, estado) VALUES
    (v_caj1,  'Karla Méndez',      crypt('1234', gen_salt('bf')), 'ACTIVO'),
    (v_caj2,  'Renata Soto',       crypt('5678', gen_salt('bf')), 'ACTIVO'),
    (v_disp,  'Caja 01',           NULL,                          'ACTIVO'),
    (v_duena, 'Daniela Cervantes', crypt('9999', gen_salt('bf')), 'ACTIVO');
  INSERT INTO usuarios_acceso (usuario_id, tenant_id, sucursal_id, rol_id) VALUES
    (v_caj1, v_tenant, v_suc, v_rol_caj), (v_caj2, v_tenant, v_suc, v_rol_caj),
    (v_disp, v_tenant, v_suc, v_rol_dis), (v_duena, v_tenant, NULL, v_rol_due);

  INSERT INTO tenant_folios_saldo (tenant_id, folios_base_mensuales, folios_base_consumidos, periodo_actual, saldo_paquetes)
  VALUES (v_tenant, 50, 4, date_trunc('month', v_hoy)::date, 100);

  INSERT INTO proveedores (tenant_id, nombre, telefono) VALUES
    (v_tenant, 'Confecciones del Bajío', '4777102233'), (v_tenant, 'Textiles San Pancho', '3331809944');

  INSERT INTO categorias (id, tenant_id, nombre, orden_visualizacion, activa) VALUES
    ('70a00000-0000-4000-8000-0000000000c1', v_tenant, 'Blusas', 1, true),
    ('70a00000-0000-4000-8000-0000000000c2', v_tenant, 'Vestidos', 2, true),
    ('70a00000-0000-4000-8000-0000000000c3', v_tenant, 'Pantalones', 3, true),
    ('70a00000-0000-4000-8000-0000000000c4', v_tenant, 'Chamarras y suéteres', 4, true),
    ('70a00000-0000-4000-8000-0000000000c5', v_tenant, 'Accesorios', 5, true);

  -- Padres: llevan los ejes; las hijas (talla × color) salen de guardar_variantes, abajo.
  INSERT INTO productos (id, tenant_id, categoria_id, nombre, precio_base_mxn, clave_sat, tasa_iva, iva_incluido_en_precio,
                         estado, visible_en_pos, orden_visualizacion, variante_ejes)
  VALUES
    ('70a00000-0000-4000-8000-0000000000a1', v_tenant, '70a00000-0000-4000-8000-0000000000c1', 'Blusa de lino',        459, '53101902', 16, true, 'ACTIVO', true, 1, ARRAY['Talla','Color']),
    ('70a00000-0000-4000-8000-0000000000a2', v_tenant, '70a00000-0000-4000-8000-0000000000c1', 'Blusa de manga globo', 429, '53101902', 16, true, 'ACTIVO', true, 2, ARRAY['Talla','Color']),
    ('70a00000-0000-4000-8000-0000000000a3', v_tenant, '70a00000-0000-4000-8000-0000000000c2', 'Vestido midi floral',  789, '53102002', 16, true, 'ACTIVO', true, 1, ARRAY['Talla','Color']),
    ('70a00000-0000-4000-8000-0000000000a4', v_tenant, '70a00000-0000-4000-8000-0000000000c2', 'Vestido camisero',     719, '53102002', 16, true, 'ACTIVO', true, 2, ARRAY['Talla','Color']),
    ('70a00000-0000-4000-8000-0000000000a5', v_tenant, '70a00000-0000-4000-8000-0000000000c3', 'Jeans tiro alto',      649, '53101502', 16, true, 'ACTIVO', true, 1, ARRAY['Talla','Color']),
    ('70a00000-0000-4000-8000-0000000000a6', v_tenant, '70a00000-0000-4000-8000-0000000000c3', 'Pantalón palazzo',     559, '53101502', 16, true, 'ACTIVO', true, 2, ARRAY['Talla','Color']),
    ('70a00000-0000-4000-8000-0000000000a7', v_tenant, '70a00000-0000-4000-8000-0000000000c4', 'Chamarra de mezclilla',899, '53101802', 16, true, 'ACTIVO', true, 1, ARRAY['Talla','Color']),
    ('70a00000-0000-4000-8000-0000000000a8', v_tenant, '70a00000-0000-4000-8000-0000000000c4', 'Suéter tejido',        599, '53101802', 16, true, 'ACTIVO', true, 2, ARRAY['Talla','Color']);

  -- Accesorios sueltos: sin variantes, con existencias propias.
  INSERT INTO productos (id, tenant_id, categoria_id, nombre, codigo_interno, precio_base_mxn, costo_mxn, clave_sat, tasa_iva,
                         iva_incluido_en_precio, estado, visible_en_pos, orden_visualizacion, controla_existencias)
  VALUES
    ('70a00000-0000-4000-8000-0000000000b1', v_tenant, '70a00000-0000-4000-8000-0000000000c5', 'Bolsa tote',         'ACC-TOTE', 499, 210, '53121600', 16, true, 'ACTIVO', true, 1, true),
    ('70a00000-0000-4000-8000-0000000000b2', v_tenant, '70a00000-0000-4000-8000-0000000000c5', 'Cinturón trenzado',  'ACC-CINT', 259, 95,  '53102500', 16, true, 'ACTIVO', true, 2, true),
    ('70a00000-0000-4000-8000-0000000000b3', v_tenant, '70a00000-0000-4000-8000-0000000000c5', 'Mascada de seda',    'ACC-MASC', 319, 120, '53102500', 16, true, 'ACTIVO', true, 3, true),
    ('70a00000-0000-4000-8000-0000000000b4', v_tenant, '70a00000-0000-4000-8000-0000000000c5', 'Arracadas doradas',  'ACC-ARRA', 189, 60,  '54101600', 16, true, 'ACTIVO', true, 4, true);

  INSERT INTO tenant_onboarding_estado (tenant_id, fase) VALUES (v_tenant, 'GO_LIVE')
  ON CONFLICT (tenant_id) DO UPDATE SET fase = 'GO_LIVE';
END $$;

-- ── Variantes y existencias, como lo haría la dueña desde el panel ───────────
DO $$
DECLARE
  v_tenant uuid := '70a00000-0000-4000-8000-000000000001';
  v_suc    uuid := '70a00000-0000-4000-8000-000000000002';
  v_duena  uuid := '70a00000-0000-4000-8000-000000000013';
  v_prov   uuid;
  p record; v_filas jsonb; t text; c text; i int;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_duena, 'tenant_id', v_tenant)::text, true);

  FOR p IN SELECT * FROM (VALUES
      ('70a00000-0000-4000-8000-0000000000a1'::uuid, 'BLU-LIN', 459, 190, ARRAY['CH','M','G'],               ARRAY['Blanco','Arena','Negro']),
      ('70a00000-0000-4000-8000-0000000000a2'::uuid, 'BLU-GLO', 429, 175, ARRAY['CH','M','G'],               ARRAY['Rosa palo','Blanco']),
      ('70a00000-0000-4000-8000-0000000000a3'::uuid, 'VES-FLO', 789, 320, ARRAY['CH','M','G'],               ARRAY['Azul','Terracota']),
      ('70a00000-0000-4000-8000-0000000000a4'::uuid, 'VES-CAM', 719, 290, ARRAY['CH','M','G'],               ARRAY['Verde olivo','Beige']),
      ('70a00000-0000-4000-8000-0000000000a5'::uuid, 'JEA-ALT', 649, 260, ARRAY['3','5','7','9','11','13'],  ARRAY['Azul claro','Azul oscuro']),
      ('70a00000-0000-4000-8000-0000000000a6'::uuid, 'PAN-PAL', 559, 220, ARRAY['CH','M','G'],               ARRAY['Negro','Beige']),
      ('70a00000-0000-4000-8000-0000000000a7'::uuid, 'CHA-MEZ', 899, 380, ARRAY['CH','M','G','XG'],          ARRAY['Azul']),
      ('70a00000-0000-4000-8000-0000000000a8'::uuid, 'SUE-TEJ', 599, 240, ARRAY['CH','M','G'],               ARRAY['Crema','Verde olivo','Gris'])
    ) AS x(id, sku, precio, costo, tallas, colores)
  LOOP
    v_filas := '[]'::jsonb; i := 0;
    FOREACH c IN ARRAY p.colores LOOP
      FOREACH t IN ARRAY p.tallas LOOP
        i := i + 1;
        v_filas := v_filas || jsonb_build_array(jsonb_build_object(
          'valores', jsonb_build_object('Talla', t, 'Color', c),
          'codigo_interno', p.sku || '-' || t || '-' || upper(left(split_part(c, ' ', 1), 3) || left(split_part(c, ' ', 2), 1)),
          'generar_codigo', true, 'precio', p.precio, 'costo', p.costo,
          -- Existencias variadas: las medianas mandan, alguna se agotó y otra va de salida.
          'existencia_inicial', CASE WHEN (i * 7 + length(c)) % 11 = 0 THEN 0
                                     WHEN t IN ('M','7','9') THEN 8 + (i % 4)
                                     WHEN (i * 3) % 5 = 0 THEN 2
                                     ELSE 5 + (i % 3) END));
      END LOOP;
    END LOOP;
    PERFORM guardar_variantes(p.id, ARRAY['Talla','Color'], v_filas, v_suc);
  END LOOP;

  -- Accesorios: entran por «Recibir mercancía».
  SELECT id INTO v_prov FROM proveedores WHERE tenant_id = v_tenant AND nombre = 'Confecciones del Bajío';
  PERFORM recibir_mercancia(v_suc, v_prov, jsonb_build_array(
    jsonb_build_object('producto_id', '70a00000-0000-4000-8000-0000000000b1', 'cantidad', 8,  'costo', 210),
    jsonb_build_object('producto_id', '70a00000-0000-4000-8000-0000000000b2', 'cantidad', 12, 'costo', 95),
    jsonb_build_object('producto_id', '70a00000-0000-4000-8000-0000000000b3', 'cantidad', 2,  'costo', 120),
    jsonb_build_object('producto_id', '70a00000-0000-4000-8000-0000000000b4', 'cantidad', 15, 'costo', 60)), 'Factura CB-2291');

  -- Mínimos: dos por hija y por accesorio, para que salgan los avisos de «pocas».
  FOR p IN SELECT id FROM productos WHERE tenant_id = v_tenant AND controla_existencias AND deleted_at IS NULL LOOP
    PERFORM fijar_minimo_producto(v_suc, p.id, 2);
  END LOOP;

  -- Las existencias se ven con fecha de hace una semana, no de este minuto.
  SET session_replication_role = replica;
  UPDATE movimientos_producto SET creado_at = now() - interval '9 days' WHERE tenant_id = v_tenant;
  SET session_replication_role = origin;
END $$;

-- ── Turno abierto y una semana de ventas ─────────────────────────────────────
DO $$
DECLARE
  v_tenant uuid := '70a00000-0000-4000-8000-000000000001';
  v_suc    uuid := '70a00000-0000-4000-8000-000000000002';
  v_caja   uuid := '70a00000-0000-4000-8000-000000000003';
  v_turno  uuid := '70a00000-0000-4000-8000-000000000004';
  v_caj1   uuid := '70a00000-0000-4000-8000-000000000010';
  v_caj2   uuid := '70a00000-0000-4000-8000-000000000011';
  v_hoy date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_t uuid; v_n int := 0; v_dia int; v_k int; v_fecha timestamptz; v_l record; v_td uuid; v_ini timestamptz;
BEGIN
  -- Seis días atrás más hoy: cada día pasado con su turno, que se cierra al final del día; hoy
  -- queda el turno abierto con el que entra la caja.
  FOR v_dia IN REVERSE 6..0 LOOP
    v_ini := date_trunc('day', now() AT TIME ZONE 'America/Mexico_City') AT TIME ZONE 'America/Mexico_City' - make_interval(days => v_dia);
    v_td := CASE WHEN v_dia = 0 THEN v_turno ELSE gen_random_uuid() END;
    INSERT INTO turnos (id, tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fecha_apertura)
    VALUES (v_td, v_tenant, v_suc, v_caja, 'T-' || to_char(v_hoy - v_dia, 'MMDD'), v_hoy - v_dia, v_caj1, 1000,
            LEAST(v_ini + interval '10 hours', now() - interval '5 hours'));
    FOR v_k IN 1..(CASE WHEN v_dia = 0 THEN 4 ELSE 5 + (v_dia % 3) END) LOOP
      v_n := v_n + 1;
      v_fecha := v_ini + make_interval(hours => 11, mins => v_k * 67 + (v_n * 13) % 40);
      IF v_fecha > now() - interval '25 minutes' THEN CONTINUE; END IF;
      INSERT INTO tickets (tenant_id, sucursal_id, caja_id, turno_id, dia_contable, modo_servicio, usuario_apertura_id, fecha_apertura)
      VALUES (v_tenant, v_suc, v_caja, v_td,
              (v_fecha AT TIME ZONE 'America/Mexico_City')::date, 'PARA_LLEVAR', CASE WHEN v_n % 3 = 0 THEN v_caj2 ELSE v_caj1 END, v_fecha)
      RETURNING id INTO v_t;
      FOR v_l IN
        SELECT p.id, p.nombre, p.precio_base_mxn, c.nombre AS categoria
          FROM productos p JOIN categorias c ON c.id = p.categoria_id
         WHERE p.tenant_id = v_tenant AND p.controla_existencias AND p.deleted_at IS NULL
           -- Solo lo que tiene con qué venderse: la semilla no deja existencias negativas.
           AND EXISTS (SELECT 1 FROM producto_existencias e WHERE e.producto_id = p.id AND e.cantidad >= 4)
         ORDER BY md5(p.id::text || v_n::text)
         LIMIT 1 + (v_n % 3)
      LOOP
        INSERT INTO ticket_items (tenant_id, ticket_id, producto_id, cantidad, producto_nombre_snapshot, precio_unitario_snapshot,
                                  tasa_iva_snapshot, iva_incluido_en_precio_snapshot, categoria_nombre_snapshot, orden_visualizacion)
        VALUES (v_tenant, v_t, v_l.id, 1, v_l.nombre, v_l.precio_base_mxn, 16, true, v_l.categoria, 1);
      END LOOP;
      INSERT INTO pagos (tenant_id, sucursal_id, caja_id, turno_id, ticket_id, dia_contable, metodo_pago, monto_mxn, usuario_id, fecha_pago)
      SELECT v_tenant, v_suc, v_caja, t.turno_id, v_t, t.dia_contable,
             (ARRAY['TARJETA_DEBITO','EFECTIVO','TARJETA_CREDITO','TRANSFERENCIA'])[1 + v_n % 4]::metodo_pago,
             t.total_mxn, t.usuario_apertura_id, v_fecha + interval '3 minutes'
        FROM tickets t WHERE t.id = v_t;
    END LOOP;
    IF v_dia > 0 THEN
      SET session_replication_role = replica;
      UPDATE turnos SET estado = 'CERRADO', fecha_cierre = v_ini + interval '20 hours' WHERE id = v_td;
      SET session_replication_role = origin;
    END IF;
  END LOOP;

  SET session_replication_role = replica;
  UPDATE tickets SET fecha_pago = fecha_apertura + interval '3 minutes' WHERE tenant_id = v_tenant AND fecha_pago IS NOT NULL;
  UPDATE movimientos_producto m SET creado_at = t.fecha_apertura + interval '3 minutes'
    FROM tickets t WHERE m.ticket_id = t.id AND m.tenant_id = v_tenant;
  SET session_replication_role = origin;

  RAISE NOTICE 'Boutique Amaranta creada (% ventas).', v_n;
END $$;
