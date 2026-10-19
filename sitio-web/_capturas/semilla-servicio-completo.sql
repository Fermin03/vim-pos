-- ============================================================================
-- Casa Olivo — restaurante con meseros inventado para las capturas del giro
-- Restaurante (servicio completo): mapa de mesas, cuentas por mesa con su
-- mesero, comandas en cocina y el reporte de ventas por mesero.
--
-- Misma receta que semilla-demo.sql: solo Supabase LOCAL, idempotente, borra y
-- vuelve a crear SU tenant y nada más.
--
--   docker exec -i supabase_db_vim-pos psql -U postgres -d postgres -q \
--     < sitio-web/_capturas/semilla-servicio-completo.sql
--
-- Caja:  caja-f5000000-0000-4000-8000-000000000003@dispositivos.vimpos.com.mx / demo-dispositivo
-- PIN:   Fernanda Ruiz (caja) 1234 · Luis Ramírez (mesero) 2222
-- Panel: dueno@casaolivo.demo / demo1234
-- ============================================================================

DO $limpieza$
DECLARE
  v_tenant uuid := 'f5000000-0000-4000-8000-000000000001';
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
  v_tenant uuid := 'f5000000-0000-4000-8000-000000000001';
  v_suc    uuid := 'f5000000-0000-4000-8000-000000000002';
  v_caja   uuid := 'f5000000-0000-4000-8000-000000000003';
  v_turno  uuid := 'f5000000-0000-4000-8000-000000000004';
  v_cajera uuid := 'f5000000-0000-4000-8000-000000000010';
  v_luis   uuid := 'f5000000-0000-4000-8000-000000000011';
  v_paola  uuid := 'f5000000-0000-4000-8000-000000000014';
  v_hector uuid := 'f5000000-0000-4000-8000-000000000015';
  v_disp   uuid := 'f5000000-0000-4000-8000-000000000012';
  v_dueno  uuid := 'f5000000-0000-4000-8000-000000000013';
  v_rol_dis uuid; v_rol_caj uuid; v_rol_due uuid; v_plan uuid;
  v_cat_ent uuid; v_cat_fue uuid; v_cat_pos uuid; v_cat_beb uuid; v_cat_cop uuid;
  v_g_term uuid; v_g_guar uuid;
  v_sec_salon uuid; v_sec_terraza uuid;
  v_hoy date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_t uuid; v_venta record; v_linea record;
BEGIN
  DELETE FROM auth.users WHERE id IN (v_cajera, v_luis, v_paola, v_hector, v_disp, v_dueno);

  SELECT id INTO v_plan    FROM planes WHERE codigo = 'FS';
  SELECT id INTO v_rol_caj FROM roles WHERE codigo = 'CAJERO' AND es_sistema;
  SELECT id INTO v_rol_dis FROM roles WHERE codigo = 'DISPOSITIVO' AND es_sistema;
  SELECT id INTO v_rol_due FROM roles WHERE codigo = 'DUENO' AND es_sistema;

  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal, plan_actual_id,
                       razon_social, rfc, regimen_fiscal, codigo_postal_fiscal, operacion)
  VALUES (v_tenant, 'casa-olivo', 'Casa Olivo', 'ACTIVO', 'FULL_SERVICE', v_plan,
          'CASA OLIVO COCINA MEXICANA', 'COC170306KT4', '612', '37000', juego_inicial_de_giro('FULL_SERVICE'));

  INSERT INTO sucursales (id, tenant_id, codigo, nombre, ciudad, estado_geo)
  VALUES (v_suc, v_tenant, 'CO', 'Campestre', 'León', 'Guanajuato');
  INSERT INTO cajas (id, tenant_id, sucursal_id, numero, nombre)
  VALUES (v_caja, v_tenant, v_suc, 1, 'Caja 01');

  INSERT INTO configuracion_tenant (tenant_id, mostrar_qr_factura_ticket, pie_ticket, propina_sugerida_activa)
  VALUES (v_tenant, true, 'Gracias por acompañarnos. ¡Vuelve pronto!', true)
  ON CONFLICT (tenant_id) DO UPDATE SET pie_ticket = EXCLUDED.pie_ticket, propina_sugerida_activa = true;

  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  SELECT '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
         crypt(u.clave, gen_salt('bf')), now(), now(), now(),
         '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''
    FROM (VALUES (v_cajera, 'fernanda@casaolivo.demo', 'demo1234'),
                 (v_luis,   'luis@casaolivo.demo',     'demo1234'),
                 (v_paola,  'paola@casaolivo.demo',    'demo1234'),
                 (v_hector, 'hector@casaolivo.demo',   'demo1234'),
                 (v_disp,   'caja-f5000000-0000-4000-8000-000000000003@dispositivos.vimpos.com.mx', 'demo-dispositivo'),
                 (v_dueno,  'dueno@casaolivo.demo',    'demo1234')) AS u(id, email, clave);

  INSERT INTO usuarios_perfil (id, nombre, pin_hash, estado) VALUES
    (v_cajera, 'Fernanda Ruiz',  crypt('1234', gen_salt('bf')), 'ACTIVO'),
    (v_luis,   'Luis Ramírez',   crypt('2222', gen_salt('bf')), 'ACTIVO'),
    (v_paola,  'Paola Núñez',    crypt('3333', gen_salt('bf')), 'ACTIVO'),
    (v_hector, 'Héctor Salinas', crypt('4444', gen_salt('bf')), 'ACTIVO'),
    (v_disp,   'Caja 01',        NULL,                          'ACTIVO'),
    (v_dueno,  'Ricardo Olvera', crypt('9999', gen_salt('bf')), 'ACTIVO');
  INSERT INTO usuarios_acceso (usuario_id, tenant_id, sucursal_id, rol_id) VALUES
    (v_cajera, v_tenant, v_suc, v_rol_caj), (v_luis, v_tenant, v_suc, v_rol_caj),
    (v_paola,  v_tenant, v_suc, v_rol_caj), (v_hector, v_tenant, v_suc, v_rol_caj),
    (v_disp,   v_tenant, v_suc, v_rol_dis), (v_dueno, v_tenant, NULL, v_rol_due);

  INSERT INTO tenant_folios_saldo (tenant_id, folios_base_mensuales, folios_base_consumidos, periodo_actual, saldo_paquetes)
  VALUES (v_tenant, 50, 18, date_trunc('month', v_hoy)::date, 200);

  -- ── Menú ──────────────────────────────────────────────────────────────────
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion, activa) VALUES (v_tenant, 'Entradas', 1, true) RETURNING id INTO v_cat_ent;
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion, activa) VALUES (v_tenant, 'Platos fuertes', 2, true) RETURNING id INTO v_cat_fue;
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion, activa) VALUES (v_tenant, 'Postres', 3, true) RETURNING id INTO v_cat_pos;
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion, activa) VALUES (v_tenant, 'Bebidas', 4, true) RETURNING id INTO v_cat_beb;
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion, activa) VALUES (v_tenant, 'Coctelería', 5, true) RETURNING id INTO v_cat_cop;

  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, tasa_iva, iva_incluido_en_precio, estado, visible_en_pos, orden_visualizacion)
  SELECT v_tenant, p.cat, p.nombre, p.precio, 16, true, 'ACTIVO', true, p.ord
    FROM (VALUES
      (v_cat_ent, 'Guacamole con totopos', 135.00, 1), (v_cat_ent, 'Queso fundido con chorizo', 145.00, 2),
      (v_cat_ent, 'Sopa de tortilla', 95.00, 3), (v_cat_ent, 'Crema de elote', 89.00, 4),
      (v_cat_ent, 'Tostadas de atún', 165.00, 5), (v_cat_ent, 'Ensalada de la casa', 115.00, 6),
      (v_cat_ent, 'Sopes de cochinita', 110.00, 7), (v_cat_ent, 'Aguachile verde', 189.00, 8),
      (v_cat_fue, 'Arrachera a la parrilla', 295.00, 1), (v_cat_fue, 'Enchiladas suizas', 185.00, 2),
      (v_cat_fue, 'Mole poblano con pollo', 210.00, 3), (v_cat_fue, 'Pescado a la talla', 265.00, 4),
      (v_cat_fue, 'Pechuga rellena', 230.00, 5), (v_cat_fue, 'Costilla en salsa de tamarindo', 285.00, 6),
      (v_cat_fue, 'Pasta al chipotle', 175.00, 7), (v_cat_fue, 'Rib eye 400 g', 495.00, 8),
      (v_cat_fue, 'Chamorro al pibil', 310.00, 9), (v_cat_fue, 'Tacos de rib eye', 245.00, 10),
      (v_cat_pos, 'Flan napolitano', 75.00, 1), (v_cat_pos, 'Pastel de tres leches', 85.00, 2),
      (v_cat_pos, 'Churros con chocolate', 89.00, 3), (v_cat_pos, 'Pay de limón', 79.00, 4),
      (v_cat_beb, 'Agua de jamaica', 45.00, 1), (v_cat_beb, 'Limonada mineral', 52.00, 2),
      (v_cat_beb, 'Refresco', 42.00, 3), (v_cat_beb, 'Cerveza nacional', 55.00, 4),
      (v_cat_beb, 'Café americano', 45.00, 5), (v_cat_beb, 'Copa de vino tinto', 135.00, 6),
      (v_cat_cop, 'Margarita', 125.00, 1), (v_cat_cop, 'Mezcalita de maracuyá', 135.00, 2),
      (v_cat_cop, 'Paloma', 110.00, 3), (v_cat_cop, 'Carajillo', 140.00, 4)
    ) AS p(cat, nombre, precio, ord);

  INSERT INTO grupos_modificadores (tenant_id, nombre, tipo_seleccion, naturaleza, orden_visualizacion)
  VALUES (v_tenant, 'Término de la carne', 'UNICA_OBLIGATORIA', 'PREPARACION', 1) RETURNING id INTO v_g_term;
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, precio_extra_mxn, orden_visualizacion) VALUES
    (v_tenant, v_g_term, 'Rojo', 0, 1), (v_tenant, v_g_term, 'Término medio', 0, 2),
    (v_tenant, v_g_term, 'Tres cuartos', 0, 3), (v_tenant, v_g_term, 'Bien cocido', 0, 4);
  INSERT INTO grupos_modificadores (tenant_id, nombre, tipo_seleccion, naturaleza, orden_visualizacion)
  VALUES (v_tenant, 'Guarnición', 'UNICA_OBLIGATORIA', 'NEUTRO', 2) RETURNING id INTO v_g_guar;
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, precio_extra_mxn, orden_visualizacion) VALUES
    (v_tenant, v_g_guar, 'Arroz rojo', 0, 1), (v_tenant, v_g_guar, 'Puré de papa', 0, 2),
    (v_tenant, v_g_guar, 'Verduras asadas', 0, 3), (v_tenant, v_g_guar, 'Papas a la francesa', 0, 4);

  INSERT INTO productos_grupos_modificadores (tenant_id, producto_id, grupo_id, orden_visualizacion)
  SELECT v_tenant, p.id, g.id, g.orden_visualizacion
    FROM productos p CROSS JOIN grupos_modificadores g
   WHERE p.tenant_id = v_tenant AND g.tenant_id = v_tenant
     AND ((p.nombre IN ('Arrachera a la parrilla', 'Rib eye 400 g'))
       OR (g.id = v_g_guar AND p.nombre IN ('Pescado a la talla', 'Pechuga rellena', 'Costilla en salsa de tamarindo')));

  -- ── Comedor: salón y terraza ──────────────────────────────────────────────
  INSERT INTO secciones (tenant_id, sucursal_id, nombre, orden_visualizacion, activa)
  VALUES (v_tenant, v_suc, 'Salón', 1, true) RETURNING id INTO v_sec_salon;
  INSERT INTO secciones (tenant_id, sucursal_id, nombre, orden_visualizacion, activa)
  VALUES (v_tenant, v_suc, 'Terraza', 2, true) RETURNING id INTO v_sec_terraza;

  INSERT INTO mesas (tenant_id, sucursal_id, seccion_id, numero, nombre, capacidad, forma, posicion_x, posicion_y, activa)
  SELECT v_tenant, v_suc, CASE WHEN m.n <= 9 THEN v_sec_salon ELSE v_sec_terraza END,
         m.n::text, 'Mesa ' || m.n, m.cap, m.forma, m.x, m.y, true
    FROM (VALUES
      (1, 4, 'CUADRADA', 1, 1), (2, 4, 'CUADRADA', 2, 1), (3, 2, 'REDONDA', 3, 1), (4, 2, 'REDONDA', 4, 1),
      (5, 6, 'RECTANGULAR', 1, 2), (6, 4, 'CUADRADA', 2, 2), (7, 4, 'CUADRADA', 3, 2), (8, 8, 'RECTANGULAR', 4, 2),
      (9, 4, 'CUADRADA', 1, 3),
      -- La terraza va del 21 en adelante: la caja ordena por número como texto, y con 10-16 quedaba 1, 10, 11, 2…
      (21, 4, 'CUADRADA', 1, 1), (22, 4, 'CUADRADA', 2, 1), (23, 2, 'REDONDA', 3, 1), (24, 6, 'RECTANGULAR', 4, 1), (25, 4, 'CUADRADA', 5, 1)
    ) AS m(n, cap, forma, x, y);

  INSERT INTO turnos (id, tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn)
  VALUES (v_turno, v_tenant, v_suc, v_caja, 'T-01', v_hoy, v_cajera, 2000);

  -- ── Cuentas de mesa ya cobradas hoy, cada una con su mesero y su propina ──
  FOR v_venta IN
    SELECT x.hace, x.metodo, x.mesero, x.mesa FROM (
      SELECT m.ahora - (h.hora * 60 + (g * 60 / h.n) + (g * 17) % 9) AS hace,
             (ARRAY['TARJETA_CREDITO','EFECTIVO','TARJETA_DEBITO','TARJETA_CREDITO','EFECTIVO','TRANSFERENCIA'])[1 + (h.hora * 5 + g) % 6] AS metodo,
             (ARRAY[v_luis, v_paola, v_hector, v_luis, v_paola])[1 + (h.hora + g) % 5] AS mesero,
             1 + (h.hora * 3 + g * 5) % 9 AS mesa
        FROM (VALUES (9, 2), (10, 3), (11, 2), (12, 3), (13, 5), (14, 6), (15, 5), (16, 3), (17, 2), (18, 3), (19, 4), (20, 5), (21, 4)) AS h(hora, n)
        CROSS JOIN LATERAL generate_series(0, h.n - 1) AS g
        CROSS JOIN (SELECT CASE WHEN x >= 750 THEN x ELSE x + 1440 END AS ahora
                      FROM (SELECT (extract(epoch FROM (now() AT TIME ZONE 'America/Mexico_City')
                                      - date_trunc('day', now() AT TIME ZONE 'America/Mexico_City')) / 60)::int AS x) q) m
    ) x WHERE x.hace >= 90 ORDER BY x.hace DESC
  LOOP
    INSERT INTO tickets (tenant_id, sucursal_id, caja_id, turno_id, dia_contable, modo_servicio, usuario_apertura_id, mesero_id, fecha_apertura)
    VALUES (v_tenant, v_suc, v_caja, v_turno, v_hoy, 'MESA', v_venta.mesero, v_venta.mesero, now() - make_interval(mins => v_venta.hace))
    RETURNING id INTO v_t;
    FOR v_linea IN
      SELECT p.id, p.nombre, p.precio_base_mxn, c.nombre AS categoria, 1 + (v_venta.hace + row_number() OVER ()) % 2 AS cant
        FROM productos p JOIN categorias c ON c.id = p.categoria_id
       WHERE p.tenant_id = v_tenant
       ORDER BY (v_venta.hace * 7 + p.orden_visualizacion * 13 + length(p.nombre)) % 19
       LIMIT 3 + (v_venta.hace % 3)
    LOOP
      INSERT INTO ticket_items (tenant_id, ticket_id, producto_id, cantidad, producto_nombre_snapshot, precio_unitario_snapshot,
                                tasa_iva_snapshot, iva_incluido_en_precio_snapshot, categoria_nombre_snapshot, orden_visualizacion)
      VALUES (v_tenant, v_t, v_linea.id, v_linea.cant, v_linea.nombre, v_linea.precio_base_mxn, 16, true, v_linea.categoria, 1);
    END LOOP;
    INSERT INTO pagos (tenant_id, sucursal_id, caja_id, turno_id, ticket_id, dia_contable, metodo_pago, monto_mxn, usuario_id, fecha_pago)
    SELECT v_tenant, v_suc, v_caja, v_turno, v_t, v_hoy, v_venta.metodo::metodo_pago, t.total_mxn, v_cajera, now()
      FROM tickets t WHERE t.id = v_t;
  END LOOP;

  SET session_replication_role = replica;
  -- Propina entre 10 y 15 %, como deja la gente en un restaurante.
  UPDATE tickets SET propina_mxn = round(total_mxn * (0.10 + ((extract(minute FROM fecha_apertura))::int % 6) / 100.0), 0),
                     fecha_pago = fecha_apertura + interval '70 minutes'
   WHERE tenant_id = v_tenant AND fecha_pago IS NOT NULL;
  UPDATE pagos g SET fecha_pago = t.fecha_apertura + interval '70 minutes' FROM tickets t WHERE g.ticket_id = t.id AND g.tenant_id = v_tenant;
  UPDATE tickets SET estado_cocina = 'ENTREGADO', fecha_envio_cocina = fecha_apertura + interval '5 minutes',
                     fecha_listo = fecha_apertura + interval '22 minutes', fecha_entrega = fecha_apertura + interval '24 minutes'
   WHERE tenant_id = v_tenant AND estado_cocina IS NOT NULL;
  SET session_replication_role = origin;

  -- ── Lo que está pasando AHORA: siete mesas ocupadas ──────────────────────
  FOR v_venta IN
    SELECT * FROM (VALUES
      ('2',  62, v_luis,   4, ARRAY['Guacamole con totopos', 'Arrachera a la parrilla', 'Enchiladas suizas', 'Mole poblano con pollo', 'Agua de jamaica', 'Cerveza nacional', 'Cerveza nacional']),
      ('5',  38, v_paola,  6, ARRAY['Queso fundido con chorizo', 'Sopa de tortilla', 'Pescado a la talla', 'Costilla en salsa de tamarindo', 'Pasta al chipotle', 'Margarita', 'Limonada mineral']),
      ('7',  24, v_hector, 3, ARRAY['Tostadas de atún', 'Rib eye 400 g', 'Copa de vino tinto', 'Copa de vino tinto']),
      ('8',  15, v_luis,   8, ARRAY['Aguachile verde', 'Sopes de cochinita', 'Chamorro al pibil', 'Tacos de rib eye', 'Pechuga rellena', 'Mezcalita de maracuyá', 'Paloma', 'Refresco']),
      ('9',  9,  v_paola,  2, ARRAY['Crema de elote', 'Enchiladas suizas', 'Café americano']),
      ('21', 47, v_hector, 4, ARRAY['Ensalada de la casa', 'Arrachera a la parrilla', 'Mole poblano con pollo', 'Pastel de tres leches', 'Churros con chocolate']),
      ('24', 5,  v_luis,   5, ARRAY['Margarita', 'Margarita', 'Cerveza nacional'])
    ) AS x(mesa, hace, mesero, personas, productos)
  LOOP
    INSERT INTO tickets (tenant_id, sucursal_id, caja_id, turno_id, dia_contable, modo_servicio,
                         usuario_apertura_id, mesero_id, fecha_apertura)
    VALUES (v_tenant, v_suc, v_caja, v_turno, v_hoy, 'MESA', v_venta.mesero, v_venta.mesero,
            now() - make_interval(mins => v_venta.hace))
    RETURNING id INTO v_t;

    INSERT INTO ticket_items (tenant_id, ticket_id, producto_id, cantidad, producto_nombre_snapshot,
                              precio_unitario_snapshot, tasa_iva_snapshot, iva_incluido_en_precio_snapshot,
                              categoria_nombre_snapshot, orden_visualizacion, nota_cocina)
    SELECT v_tenant, v_t, p.id, u.cant, p.nombre, p.precio_base_mxn, p.tasa_iva, p.iva_incluido_en_precio, c.nombre, u.ord,
           CASE WHEN p.nombre = 'Enchiladas suizas' THEN 'Sin crema' WHEN p.nombre = 'Aguachile verde' THEN 'Poco picante' END
      -- Lo repetido va en un renglón con su cantidad, como lo captura la caja.
      FROM (SELECT nombre, count(*)::int AS cant, min(ord) AS ord FROM unnest(v_venta.productos) WITH ORDINALITY AS x(nombre, ord) GROUP BY nombre) AS u
      JOIN productos p ON p.tenant_id = v_tenant AND p.nombre = u.nombre
      JOIN categorias c ON c.id = p.categoria_id;

    -- Término y guarnición donde aplican, para que la comanda los enseñe.
    INSERT INTO ticket_item_modificadores (tenant_id, ticket_item_id, opcion_modificador_id, grupo_id,
                                           grupo_nombre_snapshot, opcion_nombre_snapshot, precio_extra_snapshot,
                                           naturaleza_snapshot, cantidad, monto_total_mxn)
    SELECT v_tenant, ti.id, o.id, g.id, g.nombre, o.nombre, 0, g.naturaleza, 1, 0
      FROM ticket_items ti
      JOIN productos_grupos_modificadores pg ON pg.producto_id = ti.producto_id
      JOIN grupos_modificadores g ON g.id = pg.grupo_id
      JOIN opciones_modificador o ON o.grupo_id = g.id
           AND o.nombre IN ('Término medio', 'Tres cuartos', 'Puré de papa', 'Verduras asadas')
           AND (g.id = v_g_guar OR o.nombre = CASE WHEN v_venta.hace % 2 = 0 THEN 'Término medio' ELSE 'Tres cuartos' END)
           AND (g.id = v_g_term OR o.nombre = CASE WHEN v_venta.hace % 2 = 0 THEN 'Puré de papa' ELSE 'Verduras asadas' END)
     WHERE ti.ticket_id = v_t;

    UPDATE tickets SET estado_fiscal = 'ABIERTO' WHERE id = v_t;
    -- La mesa que se acaba de sentar todavía no manda nada a cocina.
    IF v_venta.hace > 6 THEN
      UPDATE tickets SET estado_cocina = 'EN_COCINA' WHERE id = v_t;
    END IF;

    INSERT INTO tickets_mesas (tenant_id, ticket_id, mesa_id, es_mesa_principal, fecha_asignacion, created_by)
    SELECT v_tenant, v_t, m.id, true, now() - make_interval(mins => v_venta.hace), v_venta.mesero
      FROM mesas m WHERE m.tenant_id = v_tenant AND m.numero = v_venta.mesa;
  END LOOP;

  SET session_replication_role = replica;
  UPDATE tickets SET fecha_envio_cocina = fecha_apertura + interval '4 minutes'
   WHERE tenant_id = v_tenant AND estado_fiscal = 'ABIERTO' AND estado_cocina = 'EN_COCINA';
  -- Las mesas que llevan más de 40 minutos ya comieron; la 7 tiene su comanda lista.
  UPDATE tickets SET estado_cocina = 'ENTREGADO', fecha_listo = fecha_apertura + interval '20 minutes',
                     fecha_entrega = fecha_apertura + interval '22 minutes'
   WHERE tenant_id = v_tenant AND estado_fiscal = 'ABIERTO' AND estado_cocina = 'EN_COCINA'
     AND fecha_apertura < now() - interval '40 minutes';
  SET session_replication_role = origin;

  INSERT INTO tenant_onboarding_estado (tenant_id, fase) VALUES (v_tenant, 'GO_LIVE')
  ON CONFLICT (tenant_id) DO UPDATE SET fase = 'GO_LIVE';

  RAISE NOTICE 'Casa Olivo creado.';
END $$;
