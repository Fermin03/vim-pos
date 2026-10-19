-- ============================================================================
-- Tacos Rueda Libre — food truck inventado para las capturas del giro Food
-- truck: menú corto, turnos abiertos en eventos y el reporte por evento.
--
-- La caja queda SIN turno abierto a propósito: la primera captura es abrir el
-- turno con el bloque de evento. Los turnos de días pasados (ya cerrados) dan
-- las sugerencias de evento y las ventas del reporte.
--
-- Misma receta que semilla-demo.sql: solo Supabase LOCAL, idempotente, borra y
-- vuelve a crear SU tenant y nada más.
--
--   docker exec -i supabase_db_vim-pos psql -U postgres -d postgres -q \
--     < sitio-web/_capturas/semilla-food-truck.sql
--
-- Caja:  caja-f7000000-0000-4000-8000-000000000003@dispositivos.vimpos.com.mx / demo-dispositivo
-- PIN:   Omar Treviño 1234 · Panel: dueno@ruedalibre.demo / demo1234
-- ============================================================================

DO $limpieza$
DECLARE
  v_tenant uuid := 'f7000000-0000-4000-8000-000000000001';
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
  v_tenant uuid := 'f7000000-0000-4000-8000-000000000001';
  v_suc    uuid := 'f7000000-0000-4000-8000-000000000002';
  v_caja   uuid := 'f7000000-0000-4000-8000-000000000003';
  v_omar   uuid := 'f7000000-0000-4000-8000-000000000010';
  v_disp   uuid := 'f7000000-0000-4000-8000-000000000012';
  v_dueno  uuid := 'f7000000-0000-4000-8000-000000000013';
  v_rol_dis uuid; v_rol_caj uuid; v_rol_due uuid; v_plan uuid;
  v_cat_tac uuid; v_cat_gri uuid; v_cat_agu uuid;
  v_g_sal uuid;
  v_hoy date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_turno uuid; v_t uuid; v_ev record; v_linea record; v_i int;
BEGIN
  DELETE FROM auth.users WHERE id IN (v_omar, v_disp, v_dueno);

  SELECT id INTO v_plan    FROM planes WHERE codigo = 'FT';
  SELECT id INTO v_rol_caj FROM roles WHERE codigo = 'CAJERO' AND es_sistema;
  SELECT id INTO v_rol_dis FROM roles WHERE codigo = 'DISPOSITIVO' AND es_sistema;
  SELECT id INTO v_rol_due FROM roles WHERE codigo = 'DUENO' AND es_sistema;

  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal, plan_actual_id,
                       razon_social, rfc, regimen_fiscal, codigo_postal_fiscal, operacion)
  VALUES (v_tenant, 'rueda-libre', 'Tacos Rueda Libre', 'ACTIVO', 'FOODTRUCK', v_plan,
          'OMAR TREVIÑO GARZA', 'TEGO880512JK3', '612', '37000', juego_inicial_de_giro('FOODTRUCK'));

  INSERT INTO sucursales (id, tenant_id, codigo, nombre, ciudad, estado_geo)
  VALUES (v_suc, v_tenant, 'RL', 'Camión', 'León', 'Guanajuato');
  INSERT INTO cajas (id, tenant_id, sucursal_id, numero, nombre)
  VALUES (v_caja, v_tenant, v_suc, 1, 'Camión');

  INSERT INTO configuracion_tenant (tenant_id, mostrar_qr_factura_ticket, pie_ticket, propina_sugerida_activa)
  VALUES (v_tenant, true, '¡Síguenos para saber dónde estamos mañana!', false)
  ON CONFLICT (tenant_id) DO UPDATE SET pie_ticket = EXCLUDED.pie_ticket;

  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  SELECT '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
         crypt(u.clave, gen_salt('bf')), now(), now(), now(),
         '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''
    FROM (VALUES (v_omar,  'omar@ruedalibre.demo',  'demo1234'),
                 (v_disp,  'caja-f7000000-0000-4000-8000-000000000003@dispositivos.vimpos.com.mx', 'demo-dispositivo'),
                 (v_dueno, 'dueno@ruedalibre.demo', 'demo1234')) AS u(id, email, clave);

  INSERT INTO usuarios_perfil (id, nombre, pin_hash, estado) VALUES
    (v_omar,  'Omar Treviño',   crypt('1234', gen_salt('bf')), 'ACTIVO'),
    (v_disp,  'Camión',         NULL,                          'ACTIVO'),
    (v_dueno, 'Daniela Garza',  crypt('9999', gen_salt('bf')), 'ACTIVO');
  INSERT INTO usuarios_acceso (usuario_id, tenant_id, sucursal_id, rol_id) VALUES
    (v_omar, v_tenant, v_suc, v_rol_caj), (v_disp, v_tenant, v_suc, v_rol_dis), (v_dueno, v_tenant, NULL, v_rol_due);

  INSERT INTO tenant_folios_saldo (tenant_id, folios_base_mensuales, folios_base_consumidos, periodo_actual, saldo_paquetes)
  VALUES (v_tenant, 50, 4, date_trunc('month', v_hoy)::date, 0);

  -- ── Menú corto, como el de un camión ─────────────────────────────────────
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion, activa) VALUES (v_tenant, 'Tacos', 1, true) RETURNING id INTO v_cat_tac;
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion, activa) VALUES (v_tenant, 'Gringas y más', 2, true) RETURNING id INTO v_cat_gri;
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion, activa) VALUES (v_tenant, 'Aguas', 3, true) RETURNING id INTO v_cat_agu;

  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, tasa_iva, iva_incluido_en_precio, estado, visible_en_pos, orden_visualizacion)
  SELECT v_tenant, p.cat, p.nombre, p.precio, 16, true, 'ACTIVO', true, p.ord
    FROM (VALUES
      (v_cat_tac, 'Taco al pastor', 22.00, 1), (v_cat_tac, 'Taco de asada', 26.00, 2), (v_cat_tac, 'Taco de suadero', 24.00, 3),
      (v_cat_tac, 'Taco campechano', 26.00, 4), (v_cat_tac, 'Taco de chorizo', 22.00, 5), (v_cat_tac, 'Taco de tripa', 28.00, 6),
      (v_cat_tac, 'Orden de 5 al pastor', 100.00, 7), (v_cat_tac, 'Taco de nopal', 20.00, 8),
      (v_cat_gri, 'Gringa de pastor', 65.00, 1), (v_cat_gri, 'Gringa de asada', 72.00, 2),
      (v_cat_gri, 'Quesadilla de harina', 45.00, 3), (v_cat_gri, 'Volcán', 38.00, 4), (v_cat_gri, 'Papa rellena', 85.00, 5),
      (v_cat_agu, 'Agua de horchata', 35.00, 1), (v_cat_agu, 'Agua de jamaica', 35.00, 2), (v_cat_agu, 'Agua de limón con chía', 35.00, 3),
      (v_cat_agu, 'Refresco de vidrio', 30.00, 4), (v_cat_agu, 'Agua natural', 20.00, 5)
    ) AS p(cat, nombre, precio, ord);

  INSERT INTO grupos_modificadores (tenant_id, nombre, tipo_seleccion, naturaleza, orden_visualizacion)
  VALUES (v_tenant, 'Cómo lo quieres', 'MULTIPLE_OPCIONAL', 'NEUTRO', 1) RETURNING id INTO v_g_sal;
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, precio_extra_mxn, orden_visualizacion) VALUES
    (v_tenant, v_g_sal, 'Con todo', 0, 1), (v_tenant, v_g_sal, 'Sin cebolla', 0, 2), (v_tenant, v_g_sal, 'Sin cilantro', 0, 3),
    (v_tenant, v_g_sal, 'Con piña', 0, 4), (v_tenant, v_g_sal, 'Con queso', 12, 5);
  INSERT INTO productos_grupos_modificadores (tenant_id, producto_id, grupo_id, orden_visualizacion)
  SELECT v_tenant, id, v_g_sal, 1 FROM productos WHERE tenant_id = v_tenant AND categoria_id = v_cat_tac;

  -- ── Turnos de días pasados, cada uno en su evento ────────────────────────
  FOR v_ev IN SELECT * FROM (VALUES
      (9, 'Mercado nocturno Valle del Campestre', 'FERIA',     'Stand 14, junto a la entrada', 40),
      (6, 'Festival de food trucks Parque Metropolitano', 'FESTIVAL', 'Comisión del 10 % al organizador', 55),
      (3, 'Boda en Hacienda San José', 'PRIVADO', 'Paquete para 120 invitados', 30),
      (1, 'Feria de León 2026', 'FERIA', 'Pabellón gastronómico, local 32', 60)
    ) AS e(dias, nombre, tipo, notas, tickets)
  LOOP
    v_turno := gen_random_uuid();
    INSERT INTO turnos (id, tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn,
                        evento_nombre, evento_tipo, evento_notas)
    VALUES (v_turno, v_tenant, v_suc, v_caja, 'T-' || lpad((5 - v_ev.dias)::text, 2, '0'), v_hoy - v_ev.dias, v_omar, 800,
            v_ev.nombre, v_ev.tipo, v_ev.notas);
    FOR v_i IN 1..v_ev.tickets LOOP
      INSERT INTO tickets (tenant_id, sucursal_id, caja_id, turno_id, dia_contable, modo_servicio, usuario_apertura_id)
      VALUES (v_tenant, v_suc, v_caja, v_turno, v_hoy - v_ev.dias, 'PARA_LLEVAR', v_omar) RETURNING id INTO v_t;
      FOR v_linea IN
        SELECT p.id, p.nombre, p.precio_base_mxn, c.nombre AS categoria,
               CASE WHEN c.id = v_cat_tac THEN 2 + (v_i + row_number() OVER ())::int % 4 ELSE 1 END AS cant
          FROM productos p JOIN categorias c ON c.id = p.categoria_id
         WHERE p.tenant_id = v_tenant
         ORDER BY (v_i * 7 + p.orden_visualizacion * 13 + length(p.nombre)) % 11
         LIMIT 2 + v_i % 2
      LOOP
        INSERT INTO ticket_items (tenant_id, ticket_id, producto_id, cantidad, producto_nombre_snapshot, precio_unitario_snapshot,
                                  tasa_iva_snapshot, iva_incluido_en_precio_snapshot, categoria_nombre_snapshot, orden_visualizacion)
        VALUES (v_tenant, v_t, v_linea.id, v_linea.cant, v_linea.nombre, v_linea.precio_base_mxn, 16, true, v_linea.categoria, 1);
      END LOOP;
      INSERT INTO pagos (tenant_id, sucursal_id, caja_id, turno_id, ticket_id, dia_contable, metodo_pago, monto_mxn, usuario_id, fecha_pago)
      SELECT v_tenant, v_suc, v_caja, v_turno, v_t, v_hoy - v_ev.dias,
             (ARRAY['EFECTIVO','EFECTIVO','TARJETA_DEBITO','TRANSFERENCIA'])[1 + v_i % 4]::metodo_pago, t.total_mxn, v_omar, now()
        FROM tickets t WHERE t.id = v_t;
    END LOOP;

    -- Al pasado (un disparador le pone a todo el día de hoy): el turno de ese día, abierto a las 6 de la tarde y cerrado a medianoche.
    SET session_replication_role = replica;
    UPDATE turnos SET fecha_apertura = (v_hoy - v_ev.dias + time '18:00') AT TIME ZONE 'America/Mexico_City',
                      estado = 'CERRADO', fecha_cierre = (v_hoy - v_ev.dias + time '23:50') AT TIME ZONE 'America/Mexico_City',
                      usuario_cierre_id = v_omar, dia_contable = v_hoy - v_ev.dias
     WHERE id = v_turno;
    UPDATE tickets t SET dia_contable = v_hoy - v_ev.dias, fecha_apertura = (v_hoy - v_ev.dias + time '18:10') AT TIME ZONE 'America/Mexico_City'
                                          + make_interval(mins => (q.n * 330 / v_ev.tickets)::int),
                         fecha_pago = (v_hoy - v_ev.dias + time '18:12') AT TIME ZONE 'America/Mexico_City'
                                          + make_interval(mins => (q.n * 330 / v_ev.tickets)::int),
                         estado_cocina = CASE WHEN t.estado_cocina IS NULL THEN NULL ELSE 'ENTREGADO'::ticket_estado_cocina END
      FROM (SELECT id, row_number() OVER (ORDER BY created_at, id) AS n FROM tickets WHERE turno_id = v_turno) q
     WHERE t.id = q.id;
    UPDATE pagos g SET fecha_pago = t.fecha_pago, dia_contable = v_hoy - v_ev.dias FROM tickets t WHERE g.ticket_id = t.id AND g.turno_id = v_turno;
    SET session_replication_role = origin;
  END LOOP;

  -- La comisión del organizador se captura al cerrar el turno; dos de los cuatro eventos la cobraron.
  SET session_replication_role = replica;
  UPDATE turnos t SET evento_comision_mxn = round(s.venta * c.pct, 2)
    FROM (SELECT turno_id, sum(total_mxn) AS venta FROM tickets WHERE tenant_id = v_tenant GROUP BY turno_id) s,
         (VALUES ('Festival de food trucks Parque Metropolitano', 0.10), ('Mercado nocturno Valle del Campestre', 0.08)) AS c(nombre, pct)
   WHERE t.id = s.turno_id AND t.evento_nombre = c.nombre;
  SET session_replication_role = origin;

  INSERT INTO tenant_onboarding_estado (tenant_id, fase) VALUES (v_tenant, 'GO_LIVE')
  ON CONFLICT (tenant_id) DO UPDATE SET fase = 'GO_LIVE';

  RAISE NOTICE 'Tacos Rueda Libre creado.';
END $$;
