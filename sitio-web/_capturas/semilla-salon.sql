-- ============================================================================
-- Salón Magnolia — negocio inventado para las capturas del giro Salón de belleza (SALON): colaboradoras, servicios con comisión y anticipo y las citas del día.
--
-- Misma receta que semilla-cafeteria.sql: solo Supabase LOCAL, idempotente, borra y vuelve a
-- crear SU tenant y nada más. Necesita las migraciones 0188–0223 (agenda, cobro, comisiones y
-- anticipos). Las citas se acomodan alrededor de la hora en que se corre (entre las 12:00 y las
-- 16:00 de hoy): las de antes ya están cobradas, la de ahora se está atendiendo y las de después
-- esperan. Volver a correrla también borra las ventas y anticipos de prueba de la captura.
--
--   docker exec -i supabase_db_vim-pos psql -U postgres -d postgres -q \
--     < sitio-web/_capturas/semilla-salon.sql
--
-- Caja:  caja-73a00000-0000-4000-8000-000000000003@dispositivos.vimpos.com.mx / demo-dispositivo
-- PIN:   Andrea Pérez 1234 · Mónica Salgado (dueño) 9999 · Panel: duena@magnolia.demo / demo1234
-- ============================================================================

DO $limpieza$
DECLARE
  v_tenant uuid := '73a00000-0000-4000-8000-000000000001';
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

-- ── Negocio, personas, servicios y agenda ────────────────────────────────────
DO $$
DECLARE
  v_tenant uuid := '73a00000-0000-4000-8000-000000000001';
  v_suc    uuid := '73a00000-0000-4000-8000-000000000002';
  v_hoy date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_plan uuid; v_rol_caj uuid; v_rol_dis uuid; v_rol_due uuid; v_rol_per uuid; v_tipo uuid;
BEGIN
  DELETE FROM auth.users WHERE id IN ('73a00000-0000-4000-8000-000000000010', '73a00000-0000-4000-8000-000000000012', '73a00000-0000-4000-8000-000000000013', '73a00000-0000-4000-8000-000000000020', '73a00000-0000-4000-8000-000000000021', '73a00000-0000-4000-8000-000000000022');

  SELECT id INTO v_plan    FROM planes WHERE codigo = 'NEGOCIO';
  SELECT id INTO v_rol_caj FROM roles WHERE codigo = 'CAJERO' AND es_sistema;
  SELECT id INTO v_rol_dis FROM roles WHERE codigo = 'DISPOSITIVO' AND es_sistema;
  SELECT id INTO v_rol_due FROM roles WHERE codigo = 'DUENO' AND es_sistema;
  SELECT id INTO v_rol_per FROM roles WHERE codigo = 'PERSONAL' AND es_sistema;

  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal, plan_actual_id,
                       razon_social, rfc, regimen_fiscal, codigo_postal_fiscal, operacion)
  VALUES (v_tenant, 'salon-magnolia', 'Salón Magnolia', 'ACTIVO', 'SALON', v_plan,
          'SALON MAGNOLIA', 'SMA200117KL5', '612', '37150', juego_inicial_de_giro('SALON'));
  INSERT INTO sucursales (id, tenant_id, codigo, nombre, ciudad, estado_geo)
  VALUES (v_suc, v_tenant, 'CEN', 'Centro', 'León', 'Guanajuato');
  INSERT INTO cajas (id, tenant_id, sucursal_id, numero, nombre) VALUES ('73a00000-0000-4000-8000-000000000003', v_tenant, v_suc, 1, 'Recepción');

  -- Sin propina sugerida; anticipo por servicio y comisiones por quincena.
  INSERT INTO configuracion_tenant (tenant_id, mostrar_qr_factura_ticket, pie_ticket, propina_sugerida_activa,
                                    agenda_cobro_modo, agenda_cancelar_horas, agenda_periodo_comisiones,
                                    agenda_comision_productos_pct)
  VALUES (v_tenant, true, 'Cancela o cambia tu cita con 24 horas de anticipación y se te regresa el anticipo.', false, 'ANTICIPO', 24, 'QUINCENAL', 10)
  ON CONFLICT (tenant_id) DO UPDATE SET pie_ticket = EXCLUDED.pie_ticket, propina_sugerida_activa = false,
     agenda_cobro_modo = EXCLUDED.agenda_cobro_modo, agenda_cancelar_horas = EXCLUDED.agenda_cancelar_horas,
     agenda_periodo_comisiones = 'QUINCENAL', agenda_comision_productos_pct = EXCLUDED.agenda_comision_productos_pct;

  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  SELECT '00000000-0000-0000-0000-000000000000', x.id, 'authenticated', 'authenticated', x.email,
         crypt(x.clave, gen_salt('bf')), now(), now(), now(),
         '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''
    FROM (VALUES ('73a00000-0000-4000-8000-000000000010'::uuid, 'andrea@magnolia.demo', 'demo1234'),
                 ('73a00000-0000-4000-8000-000000000012'::uuid, 'caja-73a00000-0000-4000-8000-000000000003@dispositivos.vimpos.com.mx', 'demo-dispositivo'),
                 ('73a00000-0000-4000-8000-000000000013'::uuid, 'duena@magnolia.demo', 'demo1234'),
                 ('73a00000-0000-4000-8000-000000000020'::uuid, 'fernanda@magnolia.demo', 'demo1234'),
                 ('73a00000-0000-4000-8000-000000000021'::uuid, 'ximena@magnolia.demo', 'demo1234'),
                 ('73a00000-0000-4000-8000-000000000022'::uuid, 'rocio@magnolia.demo', 'demo1234')) AS x(id, email, clave);

  INSERT INTO usuarios_perfil (id, nombre, pin_hash, estado) VALUES
    ('73a00000-0000-4000-8000-000000000010', 'Andrea Pérez', crypt('1234', gen_salt('bf')), 'ACTIVO'),
    ('73a00000-0000-4000-8000-000000000012', 'Recepción', NULL, 'ACTIVO'),
    ('73a00000-0000-4000-8000-000000000013', 'Mónica Salgado', crypt('9999', gen_salt('bf')), 'ACTIVO'),
    ('73a00000-0000-4000-8000-000000000020', 'Fernanda Ruiz', crypt('2001', gen_salt('bf')), 'ACTIVO'),
    ('73a00000-0000-4000-8000-000000000021', 'Ximena Lara', crypt('3112', gen_salt('bf')), 'ACTIVO'),
    ('73a00000-0000-4000-8000-000000000022', 'Rocío Méndez', crypt('4223', gen_salt('bf')), 'ACTIVO');
  INSERT INTO usuarios_acceso (usuario_id, tenant_id, sucursal_id, rol_id) VALUES
    ('73a00000-0000-4000-8000-000000000010', v_tenant, v_suc, v_rol_caj), ('73a00000-0000-4000-8000-000000000012', v_tenant, v_suc, v_rol_dis), ('73a00000-0000-4000-8000-000000000013', v_tenant, NULL, v_rol_due),
    ('73a00000-0000-4000-8000-000000000020', v_tenant, v_suc, v_rol_per),
    ('73a00000-0000-4000-8000-000000000021', v_tenant, v_suc, v_rol_per),
    ('73a00000-0000-4000-8000-000000000022', v_tenant, v_suc, v_rol_per);

  INSERT INTO tenant_folios_saldo (tenant_id, folios_base_mensuales, folios_base_consumidos, periodo_actual, saldo_paquetes)
  VALUES (v_tenant, 50, 5, date_trunc('month', v_hoy)::date, 100);

  INSERT INTO categorias (id, tenant_id, nombre, orden_visualizacion, activa) VALUES ('73a00000-0000-4000-8000-0000000000c1', v_tenant, 'Cabello', 1, true);
  INSERT INTO categorias (id, tenant_id, nombre, orden_visualizacion, activa) VALUES ('73a00000-0000-4000-8000-0000000000c2', v_tenant, 'Color', 2, true);
  INSERT INTO categorias (id, tenant_id, nombre, orden_visualizacion, activa) VALUES ('73a00000-0000-4000-8000-0000000000c3', v_tenant, 'Uñas', 3, true);
  INSERT INTO categorias (id, tenant_id, nombre, orden_visualizacion, activa) VALUES ('73a00000-0000-4000-8000-0000000000c4', v_tenant, 'Eventos', 4, true);
  INSERT INTO categorias (id, tenant_id, nombre, orden_visualizacion, activa) VALUES ('73a00000-0000-4000-8000-0000000000c5', v_tenant, 'Productos', 5, true);


  -- Servicios: un producto más su ficha de agenda (duración, espacio, comisión y anticipo).
  INSERT INTO productos (id, tenant_id, categoria_id, nombre, codigo_interno, precio_base_mxn, clave_sat, unidad_sat, tasa_iva,
                         iva_incluido_en_precio, estado, visible_en_pos, orden_visualizacion)
  VALUES ('73a00000-0000-4000-8000-0000000000a1', v_tenant, '73a00000-0000-4000-8000-0000000000c1', 'Corte de dama', 'S-CDA', 350, '85121800', 'E48', 16, true, 'ACTIVO', true, 1);
  INSERT INTO servicios_agenda (producto_id, tenant_id, duracion_min, tipo_espacio_id, comision_tipo, comision_valor, anticipo_tipo, anticipo_valor)
  VALUES ('73a00000-0000-4000-8000-0000000000a1', v_tenant, 45, NULL, 'PORCENTAJE', 40, NULL, NULL);
  INSERT INTO productos (id, tenant_id, categoria_id, nombre, codigo_interno, precio_base_mxn, clave_sat, unidad_sat, tasa_iva,
                         iva_incluido_en_precio, estado, visible_en_pos, orden_visualizacion)
  VALUES ('73a00000-0000-4000-8000-0000000000a2', v_tenant, '73a00000-0000-4000-8000-0000000000c1', 'Corte y peinado', 'S-CPE', 480, '85121800', 'E48', 16, true, 'ACTIVO', true, 2);
  INSERT INTO servicios_agenda (producto_id, tenant_id, duracion_min, tipo_espacio_id, comision_tipo, comision_valor, anticipo_tipo, anticipo_valor)
  VALUES ('73a00000-0000-4000-8000-0000000000a2', v_tenant, 60, NULL, 'PORCENTAJE', 40, NULL, NULL);
  INSERT INTO productos (id, tenant_id, categoria_id, nombre, codigo_interno, precio_base_mxn, clave_sat, unidad_sat, tasa_iva,
                         iva_incluido_en_precio, estado, visible_en_pos, orden_visualizacion)
  VALUES ('73a00000-0000-4000-8000-0000000000a3', v_tenant, '73a00000-0000-4000-8000-0000000000c2', 'Tinte de raíz', 'S-TRA', 750, '85121800', 'E48', 16, true, 'ACTIVO', true, 3);
  INSERT INTO servicios_agenda (producto_id, tenant_id, duracion_min, tipo_espacio_id, comision_tipo, comision_valor, anticipo_tipo, anticipo_valor)
  VALUES ('73a00000-0000-4000-8000-0000000000a3', v_tenant, 90, NULL, 'PORCENTAJE', 35, 'PORCENTAJE', 30);
  INSERT INTO productos (id, tenant_id, categoria_id, nombre, codigo_interno, precio_base_mxn, clave_sat, unidad_sat, tasa_iva,
                         iva_incluido_en_precio, estado, visible_en_pos, orden_visualizacion)
  VALUES ('73a00000-0000-4000-8000-0000000000a4', v_tenant, '73a00000-0000-4000-8000-0000000000c2', 'Balayage', 'S-BAL', 2200, '85121800', 'E48', 16, true, 'ACTIVO', true, 4);
  INSERT INTO servicios_agenda (producto_id, tenant_id, duracion_min, tipo_espacio_id, comision_tipo, comision_valor, anticipo_tipo, anticipo_valor)
  VALUES ('73a00000-0000-4000-8000-0000000000a4', v_tenant, 180, NULL, 'PORCENTAJE', 30, 'PORCENTAJE', 50);
  INSERT INTO productos (id, tenant_id, categoria_id, nombre, codigo_interno, precio_base_mxn, clave_sat, unidad_sat, tasa_iva,
                         iva_incluido_en_precio, estado, visible_en_pos, orden_visualizacion)
  VALUES ('73a00000-0000-4000-8000-0000000000a5', v_tenant, '73a00000-0000-4000-8000-0000000000c2', 'Alaciado con keratina', 'S-KER', 1800, '85121800', 'E48', 16, true, 'ACTIVO', true, 5);
  INSERT INTO servicios_agenda (producto_id, tenant_id, duracion_min, tipo_espacio_id, comision_tipo, comision_valor, anticipo_tipo, anticipo_valor)
  VALUES ('73a00000-0000-4000-8000-0000000000a5', v_tenant, 150, NULL, 'PORCENTAJE', 30, 'PORCENTAJE', 50);
  INSERT INTO productos (id, tenant_id, categoria_id, nombre, codigo_interno, precio_base_mxn, clave_sat, unidad_sat, tasa_iva,
                         iva_incluido_en_precio, estado, visible_en_pos, orden_visualizacion)
  VALUES ('73a00000-0000-4000-8000-0000000000a6', v_tenant, '73a00000-0000-4000-8000-0000000000c3', 'Manicure en gel', 'S-MAN', 380, '85121800', 'E48', 16, true, 'ACTIVO', true, 6);
  INSERT INTO servicios_agenda (producto_id, tenant_id, duracion_min, tipo_espacio_id, comision_tipo, comision_valor, anticipo_tipo, anticipo_valor)
  VALUES ('73a00000-0000-4000-8000-0000000000a6', v_tenant, 60, NULL, 'PORCENTAJE', 45, NULL, NULL);
  INSERT INTO productos (id, tenant_id, categoria_id, nombre, codigo_interno, precio_base_mxn, clave_sat, unidad_sat, tasa_iva,
                         iva_incluido_en_precio, estado, visible_en_pos, orden_visualizacion)
  VALUES ('73a00000-0000-4000-8000-0000000000a7', v_tenant, '73a00000-0000-4000-8000-0000000000c3', 'Pedicure spa', 'S-PED', 450, '85121800', 'E48', 16, true, 'ACTIVO', true, 7);
  INSERT INTO servicios_agenda (producto_id, tenant_id, duracion_min, tipo_espacio_id, comision_tipo, comision_valor, anticipo_tipo, anticipo_valor)
  VALUES ('73a00000-0000-4000-8000-0000000000a7', v_tenant, 60, NULL, 'PORCENTAJE', 45, NULL, NULL);
  INSERT INTO productos (id, tenant_id, categoria_id, nombre, codigo_interno, precio_base_mxn, clave_sat, unidad_sat, tasa_iva,
                         iva_incluido_en_precio, estado, visible_en_pos, orden_visualizacion)
  VALUES ('73a00000-0000-4000-8000-0000000000a8', v_tenant, '73a00000-0000-4000-8000-0000000000c4', 'Peinado para evento', 'S-PEI', 650, '85121800', 'E48', 16, true, 'ACTIVO', true, 8);
  INSERT INTO servicios_agenda (producto_id, tenant_id, duracion_min, tipo_espacio_id, comision_tipo, comision_valor, anticipo_tipo, anticipo_valor)
  VALUES ('73a00000-0000-4000-8000-0000000000a8', v_tenant, 60, NULL, 'PORCENTAJE', 40, 'PORCENTAJE', 50);
  INSERT INTO productos (id, tenant_id, categoria_id, nombre, codigo_interno, precio_base_mxn, clave_sat, unidad_sat, tasa_iva,
                         iva_incluido_en_precio, estado, visible_en_pos, orden_visualizacion)
  VALUES ('73a00000-0000-4000-8000-0000000000a9', v_tenant, '73a00000-0000-4000-8000-0000000000c4', 'Maquillaje social', 'S-MAQ', 900, '85121800', 'E48', 16, true, 'ACTIVO', true, 9);
  INSERT INTO servicios_agenda (producto_id, tenant_id, duracion_min, tipo_espacio_id, comision_tipo, comision_valor, anticipo_tipo, anticipo_valor)
  VALUES ('73a00000-0000-4000-8000-0000000000a9', v_tenant, 60, NULL, 'PORCENTAJE', 40, 'PORCENTAJE', 50);
  INSERT INTO productos (id, tenant_id, categoria_id, nombre, codigo_interno, precio_base_mxn, costo_mxn, clave_sat, tasa_iva,
                         iva_incluido_en_precio, estado, visible_en_pos, orden_visualizacion, controla_existencias)
  VALUES ('73a00000-0000-4000-8000-0000000000b1', v_tenant, '73a00000-0000-4000-8000-0000000000c5', 'Shampoo profesional 450 ml', 'P-SHA', 420, 189, '53131600', 16, true, 'ACTIVO', true, 1, true);
  INSERT INTO productos (id, tenant_id, categoria_id, nombre, codigo_interno, precio_base_mxn, costo_mxn, clave_sat, tasa_iva,
                         iva_incluido_en_precio, estado, visible_en_pos, orden_visualizacion, controla_existencias)
  VALUES ('73a00000-0000-4000-8000-0000000000b2', v_tenant, '73a00000-0000-4000-8000-0000000000c5', 'Tratamiento reparador 250 ml', 'P-TRA', 380, 171, '53131600', 16, true, 'ACTIVO', true, 2, true);

  -- Colaboradores: color en el calendario, horario de 9:00 a 21:00 toda la semana y todos hacen todos los servicios.
  INSERT INTO colaboradores_agenda (usuario_id, tenant_id, sucursal_id, color_hex, orden, sueldo_periodo_mxn)
  VALUES ('73a00000-0000-4000-8000-000000000020', v_tenant, v_suc, '#D9467A', 1, 2500);
  INSERT INTO horarios_colaborador (tenant_id, usuario_id, dia_semana, inicia, termina, comida_inicia, comida_termina)
  SELECT v_tenant, '73a00000-0000-4000-8000-000000000020', d, '09:00', '21:00', NULL, NULL FROM generate_series(0, 6) d;
  INSERT INTO colaboradores_agenda (usuario_id, tenant_id, sucursal_id, color_hex, orden, sueldo_periodo_mxn)
  VALUES ('73a00000-0000-4000-8000-000000000021', v_tenant, v_suc, '#7C5CD6', 2, 2500);
  INSERT INTO horarios_colaborador (tenant_id, usuario_id, dia_semana, inicia, termina, comida_inicia, comida_termina)
  SELECT v_tenant, '73a00000-0000-4000-8000-000000000021', d, '09:00', '21:00', NULL, NULL FROM generate_series(0, 6) d;
  INSERT INTO colaboradores_agenda (usuario_id, tenant_id, sucursal_id, color_hex, orden, sueldo_periodo_mxn)
  VALUES ('73a00000-0000-4000-8000-000000000022', v_tenant, v_suc, '#2E9C8A', 3, 3000);
  INSERT INTO horarios_colaborador (tenant_id, usuario_id, dia_semana, inicia, termina, comida_inicia, comida_termina)
  SELECT v_tenant, '73a00000-0000-4000-8000-000000000022', d, '09:00', '21:00', NULL, NULL FROM generate_series(0, 6) d;
  INSERT INTO servicio_colaborador (producto_id, usuario_id, tenant_id)
  SELECT sa.producto_id, ca.usuario_id, v_tenant FROM servicios_agenda sa CROSS JOIN colaboradores_agenda ca
   WHERE sa.tenant_id = v_tenant AND ca.tenant_id = v_tenant;

  INSERT INTO tenant_onboarding_estado (tenant_id, fase) VALUES (v_tenant, 'GO_LIVE')
  ON CONFLICT (tenant_id) DO UPDATE SET fase = 'GO_LIVE';
END $$;

-- ── Existencias de los productos de venta ────────────────────────────────────
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '73a00000-0000-4000-8000-000000000013', 'tenant_id', '73a00000-0000-4000-8000-000000000001')::text, true);
  PERFORM recibir_mercancia('73a00000-0000-4000-8000-000000000002', NULL, (SELECT jsonb_agg(jsonb_build_object('producto_id', id, 'cantidad', 12))
                                           FROM productos WHERE tenant_id = '73a00000-0000-4000-8000-000000000001' AND controla_existencias), 'Arranque');
END $$;

-- ── Ventas de los días anteriores de la quincena, con quién atendió cada servicio ──
DO $$
DECLARE
  v_tenant uuid := '73a00000-0000-4000-8000-000000000001';
  v_suc    uuid := '73a00000-0000-4000-8000-000000000002';
  v_caja   uuid := '73a00000-0000-4000-8000-000000000003';
  v_recep  uuid := '73a00000-0000-4000-8000-000000000010';
  v_colabs uuid[] := ARRAY['73a00000-0000-4000-8000-000000000020'::uuid, '73a00000-0000-4000-8000-000000000021'::uuid, '73a00000-0000-4000-8000-000000000022'::uuid];
  v_hoy date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_ini_q date := CASE WHEN extract(day FROM (now() AT TIME ZONE 'America/Mexico_City')) <= 15
                       THEN date_trunc('month', (now() AT TIME ZONE 'America/Mexico_City'))::date
                       ELSE date_trunc('month', (now() AT TIME ZONE 'America/Mexico_City'))::date + 15 END;
  v_dia date; v_td uuid; v_t uuid; v_n int := 0; v_k int; v_fecha timestamptz; v_s record; v_col uuid;
BEGIN
  -- Al menos tres días de historia aunque la quincena acabe de empezar.
  FOR v_dia IN SELECT generate_series(LEAST(v_ini_q, v_hoy - 3), v_hoy - 1, interval '1 day')::date LOOP
    v_td := gen_random_uuid();
    INSERT INTO turnos (id, tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fecha_apertura)
    VALUES (v_td, v_tenant, v_suc, v_caja, 'T-' || to_char(v_dia, 'MMDD'), v_dia, v_recep, 500,
            (v_dia + time '09:00') AT TIME ZONE 'America/Mexico_City');
    FOR v_k IN 1..(5 + (extract(day FROM v_dia)::int % 4)) LOOP
      v_n := v_n + 1;
      v_col := v_colabs[1 + v_n % array_length(v_colabs, 1)];
      v_fecha := (v_dia + time '10:00') AT TIME ZONE 'America/Mexico_City' + make_interval(mins => v_k * 70);
      INSERT INTO tickets (tenant_id, sucursal_id, caja_id, turno_id, dia_contable, modo_servicio, usuario_apertura_id, fecha_apertura)
      VALUES (v_tenant, v_suc, v_caja, v_td, v_dia, 'PARA_LLEVAR', v_recep, v_fecha) RETURNING id INTO v_t;
      FOR v_s IN
        SELECT p.id, p.nombre, p.precio_base_mxn, c.nombre AS categoria
          FROM productos p JOIN categorias c ON c.id = p.categoria_id
          JOIN servicios_agenda sa ON sa.producto_id = p.id
         WHERE p.tenant_id = v_tenant
         ORDER BY md5(p.id::text || v_n::text) LIMIT 1 + (v_n % 3 = 0)::int
      LOOP
        INSERT INTO ticket_items (tenant_id, ticket_id, producto_id, cantidad, producto_nombre_snapshot, precio_unitario_snapshot,
                                  tasa_iva_snapshot, iva_incluido_en_precio_snapshot, categoria_nombre_snapshot, orden_visualizacion, colaborador_id)
        VALUES (v_tenant, v_t, v_s.id, 1, v_s.nombre, v_s.precio_base_mxn, 16, true, v_s.categoria, 1, v_col);
      END LOOP;
      INSERT INTO pagos (tenant_id, sucursal_id, caja_id, turno_id, ticket_id, dia_contable, metodo_pago, monto_mxn, usuario_id, fecha_pago)
      SELECT v_tenant, v_suc, v_caja, v_td, v_t, v_dia,
             (ARRAY['TARJETA_DEBITO','EFECTIVO','TARJETA_CREDITO','TRANSFERENCIA'])[1 + v_n % 4]::metodo_pago,
             t.total_mxn, v_recep, v_fecha + interval '50 minutes'
        FROM tickets t WHERE t.id = v_t;
    END LOOP;
    SET session_replication_role = replica;
    UPDATE turnos SET estado = 'CERRADO', fecha_cierre = (v_dia + time '20:30') AT TIME ZONE 'America/Mexico_City' WHERE id = v_td;
    SET session_replication_role = origin;
  END LOOP;
  SET session_replication_role = replica;
  UPDATE tickets SET fecha_pago = fecha_apertura + interval '50 minutes' WHERE tenant_id = v_tenant AND fecha_pago IS NOT NULL;
  SET session_replication_role = origin;
END $$;

-- ── Hoy: turno abierto y las citas del día, por las mismas RPC que usa la caja ──
DO $$
DECLARE
  v_tenant uuid := '73a00000-0000-4000-8000-000000000001';
  v_suc    uuid := '73a00000-0000-4000-8000-000000000002';
  v_caja   uuid := '73a00000-0000-4000-8000-000000000003';
  v_turno  uuid := '73a00000-0000-4000-8000-000000000004';
  v_recep  uuid := '73a00000-0000-4000-8000-000000000010';
  v_colabs uuid[] := ARRAY['73a00000-0000-4000-8000-000000000020'::uuid, '73a00000-0000-4000-8000-000000000021'::uuid, '73a00000-0000-4000-8000-000000000022'::uuid];
  v_hoy date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  -- La hora base: la hora en punto de ahora, entre las 12:00 y las 16:00 de hoy.
  v_base timestamptz := (v_hoy + LEAST(GREATEST(date_trunc('hour', (now() AT TIME ZONE 'America/Mexico_City'))::time, time '12:00'), time '16:00'))
                        AT TIME ZONE 'America/Mexico_City';
  c record; v_cita uuid; v_cli uuid; v_serv jsonb; v_c citas%ROWTYPE; v_t uuid; v_x record; v_ant numeric;
BEGIN
  INSERT INTO turnos (id, tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fecha_apertura)
  VALUES (v_turno, v_tenant, v_suc, v_caja, 'T-' || to_char(v_hoy, 'MMDD'), v_hoy, v_recep, 500, v_base - interval '6 hours');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_recep, 'tenant_id', v_tenant)::text, true);
  FOR c IN SELECT * FROM (VALUES
      (-300, 'Daniela Ortiz', '4775551301', jsonb_build_array(jsonb_build_object('producto_id', (SELECT id FROM productos WHERE tenant_id = '73a00000-0000-4000-8000-000000000001' AND codigo_interno = 'S-CDA'), 'usuario_id', (ARRAY['73a00000-0000-4000-8000-000000000020'::uuid, '73a00000-0000-4000-8000-000000000021'::uuid, '73a00000-0000-4000-8000-000000000022'::uuid])[1])), false),
      (-270, 'Paola Gutiérrez', '4775551302', jsonb_build_array(jsonb_build_object('producto_id', (SELECT id FROM productos WHERE tenant_id = '73a00000-0000-4000-8000-000000000001' AND codigo_interno = 'S-MAN'), 'usuario_id', (ARRAY['73a00000-0000-4000-8000-000000000020'::uuid, '73a00000-0000-4000-8000-000000000021'::uuid, '73a00000-0000-4000-8000-000000000022'::uuid])[3])), false),
      (-240, 'Valeria Campos', '4775551303', jsonb_build_array(jsonb_build_object('producto_id', (SELECT id FROM productos WHERE tenant_id = '73a00000-0000-4000-8000-000000000001' AND codigo_interno = 'S-TRA'), 'usuario_id', (ARRAY['73a00000-0000-4000-8000-000000000020'::uuid, '73a00000-0000-4000-8000-000000000021'::uuid, '73a00000-0000-4000-8000-000000000022'::uuid])[2])), false),
      (-180, 'Sofía Navarro', '4775551304', jsonb_build_array(jsonb_build_object('producto_id', (SELECT id FROM productos WHERE tenant_id = '73a00000-0000-4000-8000-000000000001' AND codigo_interno = 'S-CPE'), 'usuario_id', (ARRAY['73a00000-0000-4000-8000-000000000020'::uuid, '73a00000-0000-4000-8000-000000000021'::uuid, '73a00000-0000-4000-8000-000000000022'::uuid])[1])), false),
      (-150, 'Mariana León', '4775551305', jsonb_build_array(jsonb_build_object('producto_id', (SELECT id FROM productos WHERE tenant_id = '73a00000-0000-4000-8000-000000000001' AND codigo_interno = 'S-PED'), 'usuario_id', (ARRAY['73a00000-0000-4000-8000-000000000020'::uuid, '73a00000-0000-4000-8000-000000000021'::uuid, '73a00000-0000-4000-8000-000000000022'::uuid])[3])), false),
      (-60, 'Regina Torres', '4775551306', jsonb_build_array(jsonb_build_object('producto_id', (SELECT id FROM productos WHERE tenant_id = '73a00000-0000-4000-8000-000000000001' AND codigo_interno = 'S-BAL'), 'usuario_id', (ARRAY['73a00000-0000-4000-8000-000000000020'::uuid, '73a00000-0000-4000-8000-000000000021'::uuid, '73a00000-0000-4000-8000-000000000022'::uuid])[2])), false),
      (-30, 'Lucía Herrera', '4775551307', jsonb_build_array(jsonb_build_object('producto_id', (SELECT id FROM productos WHERE tenant_id = '73a00000-0000-4000-8000-000000000001' AND codigo_interno = 'S-CDA'), 'usuario_id', (ARRAY['73a00000-0000-4000-8000-000000000020'::uuid, '73a00000-0000-4000-8000-000000000021'::uuid, '73a00000-0000-4000-8000-000000000022'::uuid])[1]), jsonb_build_object('producto_id', (SELECT id FROM productos WHERE tenant_id = '73a00000-0000-4000-8000-000000000001' AND codigo_interno = 'S-MAN'), 'usuario_id', (ARRAY['73a00000-0000-4000-8000-000000000020'::uuid, '73a00000-0000-4000-8000-000000000021'::uuid, '73a00000-0000-4000-8000-000000000022'::uuid])[3])), false),
      (75, 'Camila Vargas', '4775551308', jsonb_build_array(jsonb_build_object('producto_id', (SELECT id FROM productos WHERE tenant_id = '73a00000-0000-4000-8000-000000000001' AND codigo_interno = 'S-MAN'), 'usuario_id', (ARRAY['73a00000-0000-4000-8000-000000000020'::uuid, '73a00000-0000-4000-8000-000000000021'::uuid, '73a00000-0000-4000-8000-000000000022'::uuid])[3])), false),
      (60, 'Ana Sofía Ríos', '4775551309', jsonb_build_array(jsonb_build_object('producto_id', (SELECT id FROM productos WHERE tenant_id = '73a00000-0000-4000-8000-000000000001' AND codigo_interno = 'S-KER'), 'usuario_id', (ARRAY['73a00000-0000-4000-8000-000000000020'::uuid, '73a00000-0000-4000-8000-000000000021'::uuid, '73a00000-0000-4000-8000-000000000022'::uuid])[1])), true),
      (120, 'Fernanda Silva', '4775551310', jsonb_build_array(jsonb_build_object('producto_id', (SELECT id FROM productos WHERE tenant_id = '73a00000-0000-4000-8000-000000000001' AND codigo_interno = 'S-TRA'), 'usuario_id', (ARRAY['73a00000-0000-4000-8000-000000000020'::uuid, '73a00000-0000-4000-8000-000000000021'::uuid, '73a00000-0000-4000-8000-000000000022'::uuid])[2])), true),
      (150, 'Natalia Rocha', '4775551311', jsonb_build_array(jsonb_build_object('producto_id', (SELECT id FROM productos WHERE tenant_id = '73a00000-0000-4000-8000-000000000001' AND codigo_interno = 'S-PED'), 'usuario_id', (ARRAY['73a00000-0000-4000-8000-000000000020'::uuid, '73a00000-0000-4000-8000-000000000021'::uuid, '73a00000-0000-4000-8000-000000000022'::uuid])[3])), false),
      (210, 'Isabel Cruz', '4775551312', jsonb_build_array(jsonb_build_object('producto_id', (SELECT id FROM productos WHERE tenant_id = '73a00000-0000-4000-8000-000000000001' AND codigo_interno = 'S-PEI'), 'usuario_id', (ARRAY['73a00000-0000-4000-8000-000000000020'::uuid, '73a00000-0000-4000-8000-000000000021'::uuid, '73a00000-0000-4000-8000-000000000022'::uuid])[3]), jsonb_build_object('producto_id', (SELECT id FROM productos WHERE tenant_id = '73a00000-0000-4000-8000-000000000001' AND codigo_interno = 'S-MAQ'), 'usuario_id', (ARRAY['73a00000-0000-4000-8000-000000000020'::uuid, '73a00000-0000-4000-8000-000000000021'::uuid, '73a00000-0000-4000-8000-000000000022'::uuid])[3])), true),
      (240, 'Renata Fuentes', '4775551313', jsonb_build_array(jsonb_build_object('producto_id', (SELECT id FROM productos WHERE tenant_id = '73a00000-0000-4000-8000-000000000001' AND codigo_interno = 'S-CPE'), 'usuario_id', (ARRAY['73a00000-0000-4000-8000-000000000020'::uuid, '73a00000-0000-4000-8000-000000000021'::uuid, '73a00000-0000-4000-8000-000000000022'::uuid])[2])), false)
    ) AS x(minutos, cliente, tel, servicios, anticipo)
  LOOP
    INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_tenant, c.cliente, c.tel) RETURNING id INTO v_cli;
    v_cita := guardar_cita(jsonb_build_object('sucursal_id', v_suc, 'cliente_id', v_cli, 'cliente_telefono', c.tel,
                                              'inicia', v_base + make_interval(mins => c.minutos), 'servicios', c.servicios));
    SELECT * INTO v_c FROM citas WHERE id = v_cita;
    IF v_c.termina <= now() THEN
      -- Ya pasó: llegó, se atendió y se cobró, con quien la atendió en cada renglón.
      PERFORM atender_cita(v_cita);
      PERFORM terminar_cita(v_cita);
      INSERT INTO tickets (tenant_id, sucursal_id, caja_id, turno_id, dia_contable, modo_servicio, usuario_apertura_id, fecha_apertura, cliente_id)
      VALUES (v_tenant, v_suc, v_caja, v_turno, v_hoy, 'PARA_LLEVAR', v_recep, v_c.termina, v_cli) RETURNING id INTO v_t;
      FOR v_x IN SELECT cs.producto_id, cs.usuario_id, cs.precio_mxn, p.nombre, cat.nombre AS categoria
                   FROM citas_servicios cs JOIN productos p ON p.id = cs.producto_id JOIN categorias cat ON cat.id = p.categoria_id
                  WHERE cs.cita_id = v_cita ORDER BY cs.orden LOOP
        INSERT INTO ticket_items (tenant_id, ticket_id, producto_id, cantidad, producto_nombre_snapshot, precio_unitario_snapshot,
                                  tasa_iva_snapshot, iva_incluido_en_precio_snapshot, categoria_nombre_snapshot, orden_visualizacion, colaborador_id)
        VALUES (v_tenant, v_t, v_x.producto_id, 1, v_x.nombre, v_x.precio_mxn, 16, true, v_x.categoria, 1, v_x.usuario_id);
      END LOOP;
      PERFORM vincular_cita_ticket(v_cita, v_t);
      INSERT INTO pagos (tenant_id, sucursal_id, caja_id, turno_id, ticket_id, dia_contable, metodo_pago, monto_mxn, usuario_id, fecha_pago)
      SELECT v_tenant, v_suc, v_caja, v_turno, v_t, v_hoy, 'TARJETA_DEBITO', t.total_mxn, v_recep, now() FROM tickets t WHERE t.id = v_t;
    ELSIF v_c.inicia <= now() THEN
      PERFORM atender_cita(v_cita);
    ELSIF c.anticipo THEN
      v_ant := anticipo_sugerido(v_cita);
      IF v_ant > 0 THEN
        PERFORM registrar_anticipo(v_cita, v_ant, 'TRANSFERENCIA'::metodo_pago, v_caja, v_turno, NULL);
      END IF;
    END IF;
  END LOOP;

  -- Las ventas de las citas cobradas se ven a la hora en que terminó cada cita.
  SET session_replication_role = replica;
  UPDATE tickets t SET fecha_pago = t.fecha_apertura + interval '5 minutes'
   WHERE t.tenant_id = v_tenant AND t.turno_id = v_turno AND t.fecha_pago IS NOT NULL;
  UPDATE pagos g SET fecha_pago = t.fecha_pago FROM tickets t WHERE g.ticket_id = t.id AND t.turno_id = v_turno AND g.metodo_pago <> 'ANTICIPO';
  UPDATE citas SET llego_at = inicia - interval '5 minutes' WHERE tenant_id = v_tenant AND estado <> 'EN_ESPERA' AND llego_at IS NOT NULL;
  SET session_replication_role = origin;
  RAISE NOTICE 'Salón Magnolia creado.';
END $$;
