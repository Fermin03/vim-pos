-- ============================================================================
-- Café Tres Granos — negocio inventado para las capturas del giro Cafetería.
--
-- Misma receta que semilla-demo.sql (Crazy Burgers): solo Supabase LOCAL,
-- idempotente, borra y vuelve a crear SU tenant y nada más.
--
--   docker exec -i supabase_db_vim-pos psql -U postgres -d postgres -q \
--     < sitio-web/_capturas/semilla-cafeteria.sql
--
-- Caja:  caja-c0ffee00-0000-4000-8000-000000000003@dispositivos.vimpos.com.mx / demo-dispositivo
-- PIN:   Sofía Herrera 1234 · Panel: duena@tresgranos.demo / demo1234
-- ============================================================================

DO $limpieza$
DECLARE
  v_tenant uuid := 'c0ffee00-0000-4000-8000-000000000001';
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
  v_tenant uuid := 'c0ffee00-0000-4000-8000-000000000001';
  v_suc    uuid := 'c0ffee00-0000-4000-8000-000000000002';
  v_caja   uuid := 'c0ffee00-0000-4000-8000-000000000003';
  v_turno  uuid := 'c0ffee00-0000-4000-8000-000000000004';
  v_caj1   uuid := 'c0ffee00-0000-4000-8000-000000000010';
  v_caj2   uuid := 'c0ffee00-0000-4000-8000-000000000011';
  v_disp   uuid := 'c0ffee00-0000-4000-8000-000000000012';
  v_duena  uuid := 'c0ffee00-0000-4000-8000-000000000013';
  v_rol_dis uuid; v_rol_caj uuid; v_rol_due uuid; v_plan uuid;
  v_cat_caf uuid; v_cat_fra uuid; v_cat_te uuid; v_cat_pan uuid; v_cat_san uuid;
  v_g_tam uuid; v_g_lec uuid; v_g_ext uuid;
  v_hoy date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_t uuid; v_venta record; v_linea record;
  v_cli uuid;
BEGIN
  DELETE FROM auth.users WHERE id IN (v_caj1, v_caj2, v_disp, v_duena);

  SELECT id INTO v_plan    FROM planes WHERE codigo = 'CB';
  SELECT id INTO v_rol_caj FROM roles WHERE codigo = 'CAJERO' AND es_sistema;
  SELECT id INTO v_rol_dis FROM roles WHERE codigo = 'DISPOSITIVO' AND es_sistema;
  SELECT id INTO v_rol_due FROM roles WHERE codigo = 'DUENO' AND es_sistema;

  -- El juego de módulos sale de la misma función que usa el alta (ADR 0034).
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal, plan_actual_id,
                       razon_social, rfc, regimen_fiscal, codigo_postal_fiscal, operacion)
  VALUES (v_tenant, 'cafe-tres-granos', 'Café Tres Granos', 'ACTIVO', 'CAFETERIA', v_plan,
          'CAFE TRES GRANOS', 'CTG190822AB1', '612', '37000', juego_inicial_de_giro('CAFETERIA'));

  INSERT INTO sucursales (id, tenant_id, codigo, nombre, ciudad, estado_geo)
  VALUES (v_suc, v_tenant, 'TG', 'Jardines', 'León', 'Guanajuato');
  INSERT INTO cajas (id, tenant_id, sucursal_id, numero, nombre)
  VALUES (v_caja, v_tenant, v_suc, 1, 'Caja 01');

  -- Lealtad por sellos: el add-on dice que puede (va antes: la guardia de la
  -- configuración rechaza el interruptor sin add-on), el interruptor que quiere.
  INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
  SELECT v_tenant, a.id, v_hoy - 30, true, 0 FROM addons a WHERE a.codigo = 'LEALTAD';

  INSERT INTO configuracion_tenant (tenant_id, mostrar_qr_factura_ticket, pie_ticket,
                                    propina_sugerida_activa, modulo_lealtad_activo)
  VALUES (v_tenant, true, '¡Gracias! Junta 8 sellos y el siguiente café va por nuestra cuenta.', true, false)
  ON CONFLICT (tenant_id) DO UPDATE SET pie_ticket = EXCLUDED.pie_ticket,
     propina_sugerida_activa = true, mostrar_qr_factura_ticket = true;

  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  SELECT '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
         crypt(u.clave, gen_salt('bf')), now(), now(), now(),
         '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''
    FROM (VALUES (v_caj1, 'sofia@tresgranos.demo', 'demo1234'),
                 (v_caj2, 'diego@tresgranos.demo', 'demo1234'),
                 (v_disp, 'caja-c0ffee00-0000-4000-8000-000000000003@dispositivos.vimpos.com.mx', 'demo-dispositivo'),
                 (v_duena, 'duena@tresgranos.demo', 'demo1234')) AS u(id, email, clave);

  INSERT INTO usuarios_perfil (id, nombre, pin_hash, estado) VALUES
    (v_caj1,  'Sofía Herrera',  crypt('1234', gen_salt('bf')), 'ACTIVO'),
    (v_caj2,  'Diego Lara',     crypt('5678', gen_salt('bf')), 'ACTIVO'),
    (v_disp,  'Caja 01',        NULL,                          'ACTIVO'),
    (v_duena, 'Mariana Ortega', crypt('9999', gen_salt('bf')), 'ACTIVO');
  INSERT INTO usuarios_acceso (usuario_id, tenant_id, sucursal_id, rol_id) VALUES
    (v_caj1, v_tenant, v_suc, v_rol_caj), (v_caj2, v_tenant, v_suc, v_rol_caj),
    (v_disp, v_tenant, v_suc, v_rol_dis), (v_duena, v_tenant, NULL, v_rol_due);

  INSERT INTO tenant_folios_saldo (tenant_id, folios_base_mensuales, folios_base_consumidos, periodo_actual, saldo_paquetes)
  VALUES (v_tenant, 50, 7, date_trunc('month', v_hoy)::date, 100);

  -- ── Menú ──────────────────────────────────────────────────────────────────
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion, activa) VALUES (v_tenant, 'Café', 1, true) RETURNING id INTO v_cat_caf;
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion, activa) VALUES (v_tenant, 'Frappés', 2, true) RETURNING id INTO v_cat_fra;
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion, activa) VALUES (v_tenant, 'Té y más', 3, true) RETURNING id INTO v_cat_te;
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion, activa) VALUES (v_tenant, 'Pan dulce', 4, true) RETURNING id INTO v_cat_pan;
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion, activa) VALUES (v_tenant, 'Sándwiches', 5, true) RETURNING id INTO v_cat_san;

  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, tasa_iva, iva_incluido_en_precio, estado, visible_en_pos, orden_visualizacion)
  SELECT v_tenant, p.cat, p.nombre, p.precio, 16, true, 'ACTIVO', true, p.ord
    FROM (VALUES
      (v_cat_caf, 'Espresso', 38.00, 1), (v_cat_caf, 'Americano', 45.00, 2), (v_cat_caf, 'Capuchino', 58.00, 3),
      (v_cat_caf, 'Latte', 62.00, 4), (v_cat_caf, 'Flat white', 64.00, 5), (v_cat_caf, 'Moka', 68.00, 6),
      (v_cat_caf, 'Latte de vainilla', 72.00, 7), (v_cat_caf, 'Café de olla', 42.00, 8),
      (v_cat_caf, 'Chai latte', 66.00, 9), (v_cat_caf, 'Chocolate caliente', 60.00, 10),
      (v_cat_caf, 'Cold brew', 58.00, 11), (v_cat_caf, 'Carajillo de la casa', 95.00, 12),
      (v_cat_fra, 'Frappé moka', 78.00, 1), (v_cat_fra, 'Frappé caramelo', 78.00, 2),
      (v_cat_fra, 'Frappé galleta', 82.00, 3), (v_cat_fra, 'Frappé matcha', 85.00, 4),
      (v_cat_fra, 'Frappé taro', 85.00, 5), (v_cat_fra, 'Smoothie de frutos rojos', 75.00, 6),
      (v_cat_te, 'Té verde', 40.00, 1), (v_cat_te, 'Té de manzanilla', 38.00, 2), (v_cat_te, 'Tisana de frutos rojos', 45.00, 3),
      (v_cat_te, 'Matcha latte', 72.00, 4), (v_cat_te, 'Agua mineral', 30.00, 5), (v_cat_te, 'Jugo de naranja', 48.00, 6),
      (v_cat_pan, 'Concha', 22.00, 1), (v_cat_pan, 'Cuernito', 28.00, 2), (v_cat_pan, 'Croissant de mantequilla', 38.00, 3),
      (v_cat_pan, 'Rol de canela', 45.00, 4), (v_cat_pan, 'Panqué de elote', 40.00, 5), (v_cat_pan, 'Muffin de arándano', 42.00, 6),
      (v_cat_pan, 'Galleta de avena', 25.00, 7), (v_cat_pan, 'Brownie', 39.00, 8),
      (v_cat_san, 'Chapata de pollo al pesto', 95.00, 1), (v_cat_san, 'Panini caprese', 98.00, 2),
      (v_cat_san, 'Cuernito de jamón y queso', 72.00, 3), (v_cat_san, 'Bagel de salmón', 125.00, 4),
      (v_cat_san, 'Molletes', 70.00, 5), (v_cat_san, 'Sándwich de pavo', 89.00, 6)
    ) AS p(cat, nombre, precio, ord);

  -- ── Modificadores: tamaño, leche y extras ──────────────────────────────────
  INSERT INTO grupos_modificadores (tenant_id, nombre, tipo_seleccion, naturaleza, orden_visualizacion)
  VALUES (v_tenant, 'Tamaño', 'UNICA_OBLIGATORIA', 'NEUTRO', 1) RETURNING id INTO v_g_tam;
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, precio_extra_mxn, orden_visualizacion) VALUES
    (v_tenant, v_g_tam, 'Chico 12 oz', 0, 1), (v_tenant, v_g_tam, 'Mediano 16 oz', 10, 2), (v_tenant, v_g_tam, 'Grande 20 oz', 18, 3);

  INSERT INTO grupos_modificadores (tenant_id, nombre, tipo_seleccion, naturaleza, orden_visualizacion)
  VALUES (v_tenant, 'Tipo de leche', 'UNICA_OBLIGATORIA', 'SUSTITUCION', 2) RETURNING id INTO v_g_lec;
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, precio_extra_mxn, orden_visualizacion) VALUES
    (v_tenant, v_g_lec, 'Entera', 0, 1), (v_tenant, v_g_lec, 'Deslactosada', 0, 2), (v_tenant, v_g_lec, 'Almendra', 12, 3),
    (v_tenant, v_g_lec, 'Avena', 12, 4), (v_tenant, v_g_lec, 'Coco', 12, 5);

  INSERT INTO grupos_modificadores (tenant_id, nombre, tipo_seleccion, naturaleza, orden_visualizacion)
  VALUES (v_tenant, 'Extras', 'MULTIPLE_OPCIONAL', 'EXTRA', 3) RETURNING id INTO v_g_ext;
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, precio_extra_mxn, orden_visualizacion) VALUES
    (v_tenant, v_g_ext, 'Shot extra de espresso', 15, 1), (v_tenant, v_g_ext, 'Jarabe de vainilla', 10, 2),
    (v_tenant, v_g_ext, 'Jarabe de caramelo', 10, 3), (v_tenant, v_g_ext, 'Crema batida', 10, 4),
    (v_tenant, v_g_ext, 'Canela', 0, 5);

  -- Bebidas con leche: los tres grupos. Americano y cold brew: tamaño y extras.
  INSERT INTO productos_grupos_modificadores (tenant_id, producto_id, grupo_id, orden_visualizacion)
  SELECT v_tenant, p.id, g.id, g.orden_visualizacion
    FROM productos p CROSS JOIN grupos_modificadores g
   WHERE p.tenant_id = v_tenant AND g.tenant_id = v_tenant
     AND ((p.nombre IN ('Capuchino','Latte','Flat white','Moka','Latte de vainilla','Chai latte','Chocolate caliente',
                        'Matcha latte','Frappé moka','Frappé caramelo','Frappé galleta','Frappé matcha','Frappé taro'))
       OR (p.nombre IN ('Americano','Cold brew','Café de olla') AND g.id IN (v_g_tam, v_g_ext)));

  -- ── Lealtad: 8 sellos = un latte ─────────────────────────────────────────
  INSERT INTO lealtad_programa (tenant_id, mecanica, compra_minima_mxn, encendido_desde)
  VALUES (v_tenant, 'SELLOS', 40, now() - interval '30 days');
  INSERT INTO lealtad_premios (tenant_id, producto_id, costo)
  SELECT v_tenant, id, 8 FROM productos WHERE tenant_id = v_tenant AND nombre = 'Latte';
  INSERT INTO lealtad_premios (tenant_id, producto_id, costo)
  SELECT v_tenant, id, 5 FROM productos WHERE tenant_id = v_tenant AND nombre = 'Concha';

  -- El interruptor va después del programa: la guardia exige programa y premios.
  UPDATE configuracion_tenant SET modulo_lealtad_activo = true WHERE tenant_id = v_tenant;

  FOR v_venta IN SELECT * FROM (VALUES
      ('Lucía Fernández', '4775550101', 6), ('Andrés Gómez', '4775550102', 3),
      ('Valeria Ríos', '4775550103', 8), ('Jorge Castañeda', '4775550104', 1)) AS c(nombre, tel, sellos)
  LOOP
    INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_tenant, v_venta.nombre, v_venta.tel) RETURNING id INTO v_cli;
    INSERT INTO lealtad_movimientos (tenant_id, cliente_id, tipo, puntos, programa_version, sucursal_id, fecha, motivo)
    VALUES (v_tenant, v_cli, 'GANADO', v_venta.sellos, 1, v_suc, now() - interval '2 days', 'Compras anteriores');
    INSERT INTO lealtad_saldos (cliente_id, tenant_id, saldo, ultima_actividad)
    VALUES (v_cli, v_tenant, v_venta.sellos, now() - interval '2 days')
    ON CONFLICT (cliente_id) DO UPDATE SET saldo = EXCLUDED.saldo;
  END LOOP;

  -- ── Turno abierto y un día de ventas (mañana fuerte, como una cafetería) ──
  INSERT INTO turnos (id, tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn)
  VALUES (v_turno, v_tenant, v_suc, v_caja, 'T-01', v_hoy, v_caj1, 800);

  FOR v_venta IN
    SELECT x.hace, x.modo, x.metodo, x.usuario FROM (
      SELECT m.ahora - (h.hora * 60 + (g * 60 / h.n) + (g * 17) % 9) AS hace,
             (ARRAY['PARA_LLEVAR','COMER_AQUI','PARA_LLEVAR','COMER_AQUI','PARA_LLEVAR'])[1 + (h.hora * 7 + g * 3) % 5] AS modo,
             (ARRAY['EFECTIVO','TARJETA_DEBITO','TARJETA_CREDITO','EFECTIVO','TRANSFERENCIA','TARJETA_DEBITO'])[1 + (h.hora * 5 + g) % 6] AS metodo,
             CASE WHEN (h.hora + g) % 3 = 0 THEN v_caj2 ELSE v_caj1 END AS usuario
        FROM (VALUES (8, 6), (9, 7), (10, 5), (11, 4), (12, 3), (13, 4), (14, 3), (16, 3), (17, 4), (18, 3)) AS h(hora, n)
        CROSS JOIN LATERAL generate_series(0, h.n - 1) AS g
        CROSS JOIN (SELECT CASE WHEN x >= 750 THEN x ELSE x + 1440 END AS ahora
                      FROM (SELECT (extract(epoch FROM (now() AT TIME ZONE 'America/Mexico_City')
                                      - date_trunc('day', now() AT TIME ZONE 'America/Mexico_City')) / 60)::int AS x) q) m
    ) x WHERE x.hace >= 20 ORDER BY x.hace DESC
  LOOP
    INSERT INTO tickets (tenant_id, sucursal_id, caja_id, turno_id, dia_contable, modo_servicio, usuario_apertura_id, fecha_apertura)
    VALUES (v_tenant, v_suc, v_caja, v_turno, v_hoy, v_venta.modo::modo_servicio, v_venta.usuario, now() - make_interval(mins => v_venta.hace))
    RETURNING id INTO v_t;
    FOR v_linea IN
      SELECT p.id, p.nombre, p.precio_base_mxn, c.nombre AS categoria, 1 + (v_venta.hace + row_number() OVER ()) % 2 AS cant
        FROM productos p JOIN categorias c ON c.id = p.categoria_id
       WHERE p.tenant_id = v_tenant
       ORDER BY (v_venta.hace * 7 + p.orden_visualizacion * 13 + length(p.nombre)) % 17
       LIMIT 2 + (v_venta.hace % 2)
    LOOP
      INSERT INTO ticket_items (tenant_id, ticket_id, producto_id, cantidad, producto_nombre_snapshot, precio_unitario_snapshot,
                                tasa_iva_snapshot, iva_incluido_en_precio_snapshot, categoria_nombre_snapshot, orden_visualizacion)
      VALUES (v_tenant, v_t, v_linea.id, v_linea.cant, v_linea.nombre, v_linea.precio_base_mxn, 16, true, v_linea.categoria, 1);
    END LOOP;
    INSERT INTO pagos (tenant_id, sucursal_id, caja_id, turno_id, ticket_id, dia_contable, metodo_pago, monto_mxn, usuario_id, fecha_pago)
    SELECT v_tenant, v_suc, v_caja, v_turno, v_t, v_hoy, v_venta.metodo::metodo_pago, t.total_mxn, v_venta.usuario, now()
      FROM tickets t WHERE t.id = v_t;
  END LOOP;

  SET session_replication_role = replica;
  UPDATE tickets SET fecha_pago = fecha_apertura + interval '4 minutes' WHERE tenant_id = v_tenant AND fecha_pago IS NOT NULL;
  UPDATE pagos g SET fecha_pago = t.fecha_apertura + interval '4 minutes' FROM tickets t WHERE g.ticket_id = t.id AND g.tenant_id = v_tenant;
  UPDATE tickets SET estado_cocina = 'ENTREGADO', fecha_envio_cocina = fecha_apertura, fecha_listo = fecha_apertura + interval '3 minutes',
                     fecha_entrega = fecha_apertura + interval '4 minutes'
   WHERE tenant_id = v_tenant AND estado_cocina IS NOT NULL;
  SET session_replication_role = origin;

  INSERT INTO tenant_onboarding_estado (tenant_id, fase) VALUES (v_tenant, 'GO_LIVE')
  ON CONFLICT (tenant_id) DO UPDATE SET fase = 'GO_LIVE';

  RAISE NOTICE 'Café Tres Granos creado.';
END $$;
