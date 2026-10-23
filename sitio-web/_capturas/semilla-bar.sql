-- ============================================================================
-- Cantina La Tercera Ronda — bar inventado para las capturas del giro Bar:
-- cuentas a nombre en la barra, mesas, coctelería y propinas.
--
-- Misma receta que semilla-demo.sql: solo Supabase LOCAL, idempotente, borra y
-- vuelve a crear SU tenant y nada más.
--
--   docker exec -i supabase_db_vim-pos psql -U postgres -d postgres -q \
--     < sitio-web/_capturas/semilla-bar.sql
--
-- Caja:  caja-ba000000-0000-4000-8000-000000000003@dispositivos.vimpos.com.mx / demo-dispositivo
-- PIN:   Iván Cortés (barra) 1234 · Panel: dueno@tercerarond.demo / demo1234
-- ============================================================================

DO $limpieza$
DECLARE
  v_tenant uuid := 'ba000000-0000-4000-8000-000000000001';
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
  v_tenant uuid := 'ba000000-0000-4000-8000-000000000001';
  v_suc    uuid := 'ba000000-0000-4000-8000-000000000002';
  v_caja   uuid := 'ba000000-0000-4000-8000-000000000003';
  v_turno  uuid := 'ba000000-0000-4000-8000-000000000004';
  v_ivan   uuid := 'ba000000-0000-4000-8000-000000000010';
  v_karla  uuid := 'ba000000-0000-4000-8000-000000000011';
  v_disp   uuid := 'ba000000-0000-4000-8000-000000000012';
  v_dueno  uuid := 'ba000000-0000-4000-8000-000000000013';
  v_rol_dis uuid; v_rol_caj uuid; v_rol_due uuid; v_plan uuid;
  v_cat_cer uuid; v_cat_coc uuid; v_cat_mez uuid; v_cat_bot uuid; v_cat_sin uuid;
  v_g_mich uuid; v_g_sal uuid; v_g_mez uuid;
  v_sec uuid;
  v_hoy date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_t uuid; v_venta record; v_linea record;
BEGIN
  DELETE FROM auth.users WHERE id IN (v_ivan, v_karla, v_disp, v_dueno);

  SELECT id INTO v_plan    FROM planes WHERE codigo = 'CB';
  SELECT id INTO v_rol_caj FROM roles WHERE codigo = 'CAJERO' AND es_sistema;
  SELECT id INTO v_rol_dis FROM roles WHERE codigo = 'DISPOSITIVO' AND es_sistema;
  SELECT id INTO v_rol_due FROM roles WHERE codigo = 'DUENO' AND es_sistema;

  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal, plan_actual_id,
                       razon_social, rfc, regimen_fiscal, codigo_postal_fiscal, operacion)
  VALUES (v_tenant, 'la-tercera-ronda', 'Cantina La Tercera Ronda', 'ACTIVO', 'BAR', v_plan,
          'LA TERCERA RONDA', 'TRO200114QP7', '612', '37000', juego_inicial_de_giro('BAR'));

  INSERT INTO sucursales (id, tenant_id, codigo, nombre, ciudad, estado_geo)
  VALUES (v_suc, v_tenant, 'TR', 'Centro Histórico', 'León', 'Guanajuato');
  INSERT INTO cajas (id, tenant_id, sucursal_id, numero, nombre)
  VALUES (v_caja, v_tenant, v_suc, 1, 'Barra');

  INSERT INTO configuracion_tenant (tenant_id, mostrar_qr_factura_ticket, pie_ticket, propina_sugerida_activa)
  VALUES (v_tenant, true, 'Salud. Si tomas, no manejes.', true)
  ON CONFLICT (tenant_id) DO UPDATE SET pie_ticket = EXCLUDED.pie_ticket, propina_sugerida_activa = true;

  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  SELECT '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
         crypt(u.clave, gen_salt('bf')), now(), now(), now(),
         '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''
    FROM (VALUES (v_ivan,  'ivan@tercerarond.demo',  'demo1234'),
                 (v_karla, 'karla@tercerarond.demo', 'demo1234'),
                 (v_disp,  'caja-ba000000-0000-4000-8000-000000000003@dispositivos.vimpos.com.mx', 'demo-dispositivo'),
                 (v_dueno, 'dueno@tercerarond.demo', 'demo1234')) AS u(id, email, clave);

  INSERT INTO usuarios_perfil (id, nombre, pin_hash, estado) VALUES
    (v_ivan,  'Iván Cortés',     crypt('1234', gen_salt('bf')), 'ACTIVO'),
    (v_karla, 'Karla Mendoza',   crypt('5678', gen_salt('bf')), 'ACTIVO'),
    (v_disp,  'Barra',           NULL,                          'ACTIVO'),
    (v_dueno, 'Gerardo Ibarra',  crypt('9999', gen_salt('bf')), 'ACTIVO');
  INSERT INTO usuarios_acceso (usuario_id, tenant_id, sucursal_id, rol_id) VALUES
    (v_ivan, v_tenant, v_suc, v_rol_caj), (v_karla, v_tenant, v_suc, v_rol_caj),
    (v_disp, v_tenant, v_suc, v_rol_dis), (v_dueno, v_tenant, NULL, v_rol_due);

  INSERT INTO tenant_folios_saldo (tenant_id, folios_base_mensuales, folios_base_consumidos, periodo_actual, saldo_paquetes)
  VALUES (v_tenant, 50, 9, date_trunc('month', v_hoy)::date, 100);

  -- ── Carta ─────────────────────────────────────────────────────────────────
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion, activa) VALUES (v_tenant, 'Cervezas', 1, true) RETURNING id INTO v_cat_cer;
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion, activa) VALUES (v_tenant, 'Cocteles', 2, true) RETURNING id INTO v_cat_coc;
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion, activa) VALUES (v_tenant, 'Mezcal y tequila', 3, true) RETURNING id INTO v_cat_mez;
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion, activa) VALUES (v_tenant, 'Botanas', 4, true) RETURNING id INTO v_cat_bot;
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion, activa) VALUES (v_tenant, 'Sin alcohol', 5, true) RETURNING id INTO v_cat_sin;

  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, tasa_iva, iva_incluido_en_precio, estado, visible_en_pos, orden_visualizacion)
  SELECT v_tenant, p.cat, p.nombre, p.precio, 16, true, 'ACTIVO', true, p.ord
    FROM (VALUES
      (v_cat_cer, 'Cerveza clara', 55.00, 1), (v_cat_cer, 'Cerveza oscura', 55.00, 2),
      (v_cat_cer, 'IPA artesanal', 95.00, 3), (v_cat_cer, 'Stout artesanal', 98.00, 4),
      (v_cat_cer, 'Michelada', 85.00, 5), (v_cat_cer, 'Cubeta de 6', 290.00, 6),
      (v_cat_cer, 'Tarro de barril', 75.00, 7), (v_cat_cer, 'Pitcher de barril', 260.00, 8),
      (v_cat_coc, 'Margarita', 120.00, 1), (v_cat_coc, 'Mojito', 115.00, 2), (v_cat_coc, 'Paloma', 105.00, 3),
      (v_cat_coc, 'Carajillo', 135.00, 4), (v_cat_coc, 'Gin tonic', 140.00, 5), (v_cat_coc, 'Mezcalita de tamarindo', 125.00, 6),
      (v_cat_coc, 'Charro negro', 110.00, 7), (v_cat_coc, 'Aperol spritz', 145.00, 8),
      (v_cat_mez, 'Mezcal espadín', 95.00, 1), (v_cat_mez, 'Mezcal tobalá', 165.00, 2),
      (v_cat_mez, 'Tequila blanco', 85.00, 3), (v_cat_mez, 'Tequila reposado', 105.00, 4),
      (v_cat_mez, 'Raicilla', 120.00, 5), (v_cat_mez, 'Botella de tequila', 1150.00, 6),
      (v_cat_bot, 'Alitas (10 pzas)', 165.00, 1), (v_cat_bot, 'Nachos con queso', 125.00, 2),
      (v_cat_bot, 'Papas a la francesa', 85.00, 3), (v_cat_bot, 'Tostadas de ceviche', 135.00, 4),
      (v_cat_bot, 'Chicharrón preparado', 95.00, 5), (v_cat_bot, 'Cacahuates enchilados', 45.00, 6),
      (v_cat_sin, 'Refresco', 40.00, 1), (v_cat_sin, 'Agua mineral', 38.00, 2), (v_cat_sin, 'Limonada', 48.00, 3)
    ) AS p(cat, nombre, precio, ord);

  INSERT INTO grupos_modificadores (tenant_id, nombre, tipo_seleccion, naturaleza, orden_visualizacion)
  VALUES (v_tenant, 'Preparación', 'UNICA_OBLIGATORIA', 'PREPARACION', 1) RETURNING id INTO v_g_mich;
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, precio_extra_mxn, orden_visualizacion) VALUES
    (v_tenant, v_g_mich, 'Tradicional', 0, 1), (v_tenant, v_g_mich, 'Con clamato', 15, 2), (v_tenant, v_g_mich, 'Con tamarindo y chamoy', 20, 3);
  INSERT INTO grupos_modificadores (tenant_id, nombre, tipo_seleccion, naturaleza, orden_visualizacion)
  VALUES (v_tenant, 'Salsa', 'UNICA_OBLIGATORIA', 'NEUTRO', 2) RETURNING id INTO v_g_sal;
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, precio_extra_mxn, orden_visualizacion) VALUES
    (v_tenant, v_g_sal, 'BBQ', 0, 1), (v_tenant, v_g_sal, 'Búfalo', 0, 2), (v_tenant, v_g_sal, 'Mango habanero', 0, 3), (v_tenant, v_g_sal, 'Lemon pepper', 0, 4);
  INSERT INTO grupos_modificadores (tenant_id, nombre, tipo_seleccion, naturaleza, orden_visualizacion)
  VALUES (v_tenant, 'Para acompañar', 'MULTIPLE_OPCIONAL', 'EXTRA', 3) RETURNING id INTO v_g_mez;
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, precio_extra_mxn, orden_visualizacion) VALUES
    (v_tenant, v_g_mez, 'Naranja y sal de gusano', 0, 1), (v_tenant, v_g_mez, 'Sangrita', 15, 2), (v_tenant, v_g_mez, 'Doble', 60, 3);

  INSERT INTO productos_grupos_modificadores (tenant_id, producto_id, grupo_id, orden_visualizacion)
  SELECT v_tenant, p.id, g.id, 1
    FROM productos p JOIN grupos_modificadores g ON g.tenant_id = v_tenant
   WHERE p.tenant_id = v_tenant
     AND ((p.nombre = 'Michelada' AND g.id = v_g_mich)
       OR (p.nombre = 'Alitas (10 pzas)' AND g.id = v_g_sal)
       OR (p.categoria_id = v_cat_mez AND p.nombre <> 'Botella de tequila' AND g.id = v_g_mez));

  -- ── Mesas en el patio ─────────────────────────────────────────────────────
  INSERT INTO secciones (tenant_id, sucursal_id, nombre, orden_visualizacion, activa)
  VALUES (v_tenant, v_suc, 'Patio', 1, true) RETURNING id INTO v_sec;
  INSERT INTO mesas (tenant_id, sucursal_id, seccion_id, numero, nombre, capacidad, forma, posicion_x, posicion_y, activa)
  SELECT v_tenant, v_suc, v_sec, n::text, 'Mesa ' || n, 4, 'CUADRADA', n, 1, true FROM generate_series(1, 8) AS n;

  INSERT INTO turnos (id, tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn)
  VALUES (v_turno, v_tenant, v_suc, v_caja, 'T-01', v_hoy, v_ivan, 1500);

  -- ── Cuentas de barra ya cobradas, con propina ────────────────────────────
  FOR v_venta IN
    SELECT x.hace, x.metodo, x.nombre FROM (
      SELECT m.ahora - (h.hora * 60 + (g * 60 / h.n) + (g * 17) % 9) AS hace,
             (ARRAY['TARJETA_CREDITO','EFECTIVO','TARJETA_DEBITO','EFECTIVO','TRANSFERENCIA'])[1 + (h.hora * 5 + g) % 5] AS metodo,
             (ARRAY['Andrea','Beto','Carlos','Dani','Ernesto','Fer','Hugo','Ime','Jaime','Lalo','Memo','Nati'])[1 + (h.hora * 7 + g * 5) % 12] AS nombre
        FROM (VALUES (11, 2), (12, 3), (13, 4), (14, 5), (15, 4), (16, 5), (17, 6), (18, 7), (19, 8), (20, 8), (21, 9)) AS h(hora, n)
        CROSS JOIN LATERAL generate_series(0, h.n - 1) AS g
        CROSS JOIN (SELECT CASE WHEN x >= 750 THEN x ELSE x + 1440 END AS ahora
                      FROM (SELECT (extract(epoch FROM (now() AT TIME ZONE 'America/Mexico_City')
                                      - date_trunc('day', now() AT TIME ZONE 'America/Mexico_City')) / 60)::int AS x) q) m
    ) x WHERE x.hace >= 120 ORDER BY x.hace DESC
  LOOP
    INSERT INTO tickets (tenant_id, sucursal_id, caja_id, turno_id, dia_contable, modo_servicio, usuario_apertura_id, fecha_apertura, nombre_cliente)
    VALUES (v_tenant, v_suc, v_caja, v_turno, v_hoy, 'BARRA', v_ivan, now() - make_interval(mins => v_venta.hace), v_venta.nombre)
    RETURNING id INTO v_t;
    FOR v_linea IN
      SELECT p.id, p.nombre, p.precio_base_mxn, c.nombre AS categoria, 1 + (v_venta.hace + row_number() OVER ()) % 3 AS cant
        FROM productos p JOIN categorias c ON c.id = p.categoria_id
       WHERE p.tenant_id = v_tenant AND p.precio_base_mxn < 300
       ORDER BY (v_venta.hace * 7 + p.orden_visualizacion * 13 + length(p.nombre)) % 19
       LIMIT 2 + (v_venta.hace % 3)
    LOOP
      INSERT INTO ticket_items (tenant_id, ticket_id, producto_id, cantidad, producto_nombre_snapshot, precio_unitario_snapshot,
                                tasa_iva_snapshot, iva_incluido_en_precio_snapshot, categoria_nombre_snapshot, orden_visualizacion)
      VALUES (v_tenant, v_t, v_linea.id, v_linea.cant, v_linea.nombre, v_linea.precio_base_mxn, 16, true, v_linea.categoria, 1);
    END LOOP;
    INSERT INTO pagos (tenant_id, sucursal_id, caja_id, turno_id, ticket_id, dia_contable, metodo_pago, monto_mxn, usuario_id, fecha_pago)
    SELECT v_tenant, v_suc, v_caja, v_turno, v_t, v_hoy, v_venta.metodo::metodo_pago, t.total_mxn, v_ivan, now()
      FROM tickets t WHERE t.id = v_t;
  END LOOP;

  SET session_replication_role = replica;
  UPDATE tickets SET propina_mxn = round(total_mxn * 0.10, 0), fecha_pago = fecha_apertura + interval '95 minutes'
   WHERE tenant_id = v_tenant AND fecha_pago IS NOT NULL;
  UPDATE pagos g SET fecha_pago = t.fecha_apertura + interval '95 minutes' FROM tickets t WHERE g.ticket_id = t.id AND g.tenant_id = v_tenant;
  UPDATE tickets SET estado_cocina = 'ENTREGADO', fecha_envio_cocina = fecha_apertura, fecha_listo = fecha_apertura + interval '6 minutes',
                     fecha_entrega = fecha_apertura + interval '7 minutes'
   WHERE tenant_id = v_tenant AND estado_cocina IS NOT NULL;
  SET session_replication_role = origin;

  -- ── Lo que está abierto ahora: cuentas a nombre en la barra ──────────────
  FOR v_venta IN
    SELECT * FROM (VALUES
      ('Rodrigo',            96, ARRAY['IPA artesanal', 'IPA artesanal', 'Alitas (10 pzas)', 'Stout artesanal']),
      ('Mariana y Sofi',     71, ARRAY['Aperol spritz', 'Mojito', 'Nachos con queso', 'Aperol spritz']),
      ('Toño',               54, ARRAY['Michelada', 'Michelada', 'Chicharrón preparado']),
      ('Cumple de Pepe',     43, ARRAY['Cubeta de 6', 'Cubeta de 6', 'Mezcal espadín', 'Mezcal espadín', 'Mezcal espadín', 'Papas a la francesa', 'Alitas (10 pzas)']),
      ('Gaby',               28, ARRAY['Margarita', 'Tostadas de ceviche']),
      ('Los del futbol',     17, ARRAY['Pitcher de barril', 'Pitcher de barril', 'Nachos con queso', 'Cacahuates enchilados']),
      ('Jorge — chamarra azul', 6, ARRAY['Carajillo'])
    ) AS x(nombre, hace, productos)
  LOOP
    INSERT INTO tickets (tenant_id, sucursal_id, caja_id, turno_id, dia_contable, modo_servicio,
                         usuario_apertura_id, fecha_apertura, nombre_cliente)
    VALUES (v_tenant, v_suc, v_caja, v_turno, v_hoy, 'BARRA', v_ivan, now() - make_interval(mins => v_venta.hace), v_venta.nombre)
    RETURNING id INTO v_t;
    INSERT INTO ticket_items (tenant_id, ticket_id, producto_id, cantidad, producto_nombre_snapshot,
                              precio_unitario_snapshot, tasa_iva_snapshot, iva_incluido_en_precio_snapshot,
                              categoria_nombre_snapshot, orden_visualizacion)
    SELECT v_tenant, v_t, p.id, u.cant, p.nombre, p.precio_base_mxn, p.tasa_iva, p.iva_incluido_en_precio, c.nombre, u.ord
      -- Lo repetido va en un renglón con su cantidad, como lo captura la caja.
      FROM (SELECT nombre, count(*)::int AS cant, min(ord) AS ord FROM unnest(v_venta.productos) WITH ORDINALITY AS x(nombre, ord) GROUP BY nombre) AS u
      JOIN productos p ON p.tenant_id = v_tenant AND p.nombre = u.nombre
      JOIN categorias c ON c.id = p.categoria_id;
    UPDATE tickets SET estado_fiscal = 'ABIERTO' WHERE id = v_t;
  END LOOP;

  -- Y dos mesas del patio, que en un bar también se usan.
  FOR v_venta IN
    SELECT * FROM (VALUES
      ('3', 64, v_karla, ARRAY['Tarro de barril', 'Tarro de barril', 'Tarro de barril', 'Alitas (10 pzas)']),
      ('6', 33, v_karla, ARRAY['Paloma', 'Gin tonic', 'Mezcalita de tamarindo', 'Nachos con queso'])
    ) AS x(mesa, hace, mesero, productos)
  LOOP
    INSERT INTO tickets (tenant_id, sucursal_id, caja_id, turno_id, dia_contable, modo_servicio,
                         usuario_apertura_id, mesero_id, fecha_apertura)
    VALUES (v_tenant, v_suc, v_caja, v_turno, v_hoy, 'MESA', v_venta.mesero, v_venta.mesero, now() - make_interval(mins => v_venta.hace))
    RETURNING id INTO v_t;
    INSERT INTO ticket_items (tenant_id, ticket_id, producto_id, cantidad, producto_nombre_snapshot,
                              precio_unitario_snapshot, tasa_iva_snapshot, iva_incluido_en_precio_snapshot,
                              categoria_nombre_snapshot, orden_visualizacion)
    SELECT v_tenant, v_t, p.id, u.cant, p.nombre, p.precio_base_mxn, p.tasa_iva, p.iva_incluido_en_precio, c.nombre, u.ord
      -- Lo repetido va en un renglón con su cantidad, como lo captura la caja.
      FROM (SELECT nombre, count(*)::int AS cant, min(ord) AS ord FROM unnest(v_venta.productos) WITH ORDINALITY AS x(nombre, ord) GROUP BY nombre) AS u
      JOIN productos p ON p.tenant_id = v_tenant AND p.nombre = u.nombre
      JOIN categorias c ON c.id = p.categoria_id;
    UPDATE tickets SET estado_fiscal = 'ABIERTO' WHERE id = v_t;
    INSERT INTO tickets_mesas (tenant_id, ticket_id, mesa_id, es_mesa_principal, fecha_asignacion, created_by)
    SELECT v_tenant, v_t, m.id, true, now() - make_interval(mins => v_venta.hace), v_venta.mesero
      FROM mesas m WHERE m.tenant_id = v_tenant AND m.numero = v_venta.mesa;
  END LOOP;

  INSERT INTO tenant_onboarding_estado (tenant_id, fase) VALUES (v_tenant, 'GO_LIVE')
  ON CONFLICT (tenant_id) DO UPDATE SET fase = 'GO_LIVE';

  RAISE NOTICE 'Cantina La Tercera Ronda creada.';
END $$;
