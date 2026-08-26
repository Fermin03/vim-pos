-- ============================================================================
-- Crazy Burgers — el negocio de demostración de las capturas del sitio.
--
-- POR QUÉ UN TENANT INVENTADO Y NO EL DEL PILOTO
--
-- Las capturas van a una página pública. El fixture de desarrollo se llama
-- "Knock-Out Burger" con su sucursal y sus empleados reales, y eso es
-- información del negocio de un cliente: no está para que la publiquemos, ni
-- aunque él nos deje. Aquí todo es inventado —el nombre, el menú, la gente y
-- las cifras— y coherente con un día bueno de una hamburguesería de barrio.
--
-- Se ejecuta contra el Supabase LOCAL, nunca contra producción:
--   docker exec -i supabase_db_vim-pos psql -U postgres -d postgres \
--     < sitio-web/_capturas/semilla-demo.sql
--
-- Es idempotente: borra su propio tenant y lo vuelve a crear. Solo toca el
-- suyo, así que el fixture de desarrollo se queda como está.
--
-- CÓMO BORRA, Y POR QUÉ ASÍ
--
-- `DELETE FROM tenants` no funciona: 69 tablas apuntan a `tenants` con
-- RESTRICT, así que la primera sucursal ya lo bloquea. Borrarlas a mano en
-- orden de dependencias es una lista de 69 nombres que se rompe con la
-- siguiente migración.
--
-- En vez de eso se recorren TODAS las tablas que tengan una columna
-- `tenant_id` con los disparadores de clave foránea desactivados
-- (`session_replication_role = replica`, el mismo modo que usa
-- `sync_push_snapshot` en la 0056). Es seguro porque se borra el tenant
-- ENTERO: no queda ninguna fila apuntando a algo que ya no existe.
--
-- Requiere superusuario, que en el Supabase local sí eres. Contra producción
-- esto no corre — y no debe.
-- ============================================================================

-- ── Borrado previo del tenant de demostración ───────────────────────────────
DO $limpieza$
DECLARE
  v_tenant uuid := '9c3a71e0-0000-4000-8000-000000000001';
  t        record;
BEGIN
  SET session_replication_role = replica;

  FOR t IN
    SELECT c.table_schema, c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables tb
        ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
     WHERE c.column_name = 'tenant_id'
       AND c.table_schema = 'public'
       AND tb.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('DELETE FROM %I.%I WHERE tenant_id = $1', t.table_schema, t.table_name)
      USING v_tenant;
  END LOOP;

  DELETE FROM tenants WHERE id = v_tenant;

  SET session_replication_role = origin;
END
$limpieza$;

DO $$
DECLARE
  v_tenant  uuid := '9c3a71e0-0000-4000-8000-000000000001';
  v_suc     uuid := '9c3a71e0-0000-4000-8000-000000000002';
  v_caja    uuid := '9c3a71e0-0000-4000-8000-000000000003';
  v_turno   uuid := '9c3a71e0-0000-4000-8000-000000000004';
  v_ana     uuid := '9c3a71e0-0000-4000-8000-000000000010';
  v_beto    uuid := '9c3a71e0-0000-4000-8000-000000000011';
  v_duena   uuid := '9c3a71e0-0000-4000-8000-000000000013';
  v_disp    uuid := '9c3a71e0-0000-4000-8000-000000000012';
  v_rol_dis uuid;
  v_rol_caj uuid;
  v_rol_due uuid;
  v_plan    uuid;
  v_cat_ham uuid; v_cat_ali uuid; v_cat_beb uuid; v_cat_pos uuid;
  v_g_term  uuid; v_g_extra uuid;
  v_prod    uuid;
  v_ticket  uuid;
  v_hoy     date := current_date;
BEGIN
  -- El tenant ya lo borró el bloque de arriba. Aquí solo las cuentas, que
  -- viven en `auth` y no llevan tenant_id.
  DELETE FROM auth.users WHERE id IN (v_ana, v_beto, v_disp, v_duena);

  SELECT id INTO v_plan FROM planes WHERE codigo = 'QS';
  SELECT id INTO v_rol_caj FROM roles WHERE codigo = 'CAJERO' AND es_sistema = true;
  SELECT id INTO v_rol_dis FROM roles WHERE codigo = 'DISPOSITIVO' AND es_sistema = true;
  SELECT id INTO v_rol_due FROM roles WHERE codigo = 'DUENO' AND es_sistema = true;

  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal, plan_actual_id,
                       razon_social, rfc, regimen_fiscal, codigo_postal_fiscal)
  VALUES (v_tenant, 'crazy-burgers', 'Crazy Burgers', 'ACTIVO', 'QUICK_SERVICE', v_plan,
          'CRAZY BURGERS', 'CBU210415HM8', '612', '37000');

  INSERT INTO sucursales (id, tenant_id, codigo, nombre, ciudad, estado_geo)
  VALUES (v_suc, v_tenant, 'CB', 'Centro', 'León', 'Guanajuato');

  INSERT INTO cajas (id, tenant_id, sucursal_id, numero, nombre)
  VALUES (v_caja, v_tenant, v_suc, 1, 'Caja 01');

  -- ── Gente inventada ────────────────────────────────────────────────────────
  -- `usuarios_perfil` cuelga de `auth.users`, así que las cuentas van primero.
  -- Los PIN son de desarrollo y este tenant nunca sale del Supabase local.
  -- Los cuatro campos de token van en CADENA VACÍA, no en NULL, y no es un
  -- detalle: GoTrue los lee en `string` de Go, que no admite nulos, así que un
  -- NULL le devuelve 500 al intentar iniciar sesión. El síntoma es «No se pudo
  -- vincular. Revisa las credenciales» — que apunta a la contraseña y no tiene
  -- nada que ver con ella. El fixture de desarrollo (supabase/seed.sql) los
  -- pone vacíos por esta misma razón.
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data,
                          confirmation_token, recovery_token,
                          email_change_token_new, email_change) VALUES
    ('00000000-0000-0000-0000-000000000000', v_ana, 'authenticated', 'authenticated',
     'ana@crazyburgers.demo', crypt('demo1234', gen_salt('bf')), now(), now(), now(),
     '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_beto, 'authenticated', 'authenticated',
     'beto@crazyburgers.demo', crypt('demo1234', gen_salt('bf')), now(), now(), now(),
     '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_disp, 'authenticated', 'authenticated',
     'caja-9c3a71e0-0000-4000-8000-000000000003@dispositivos.vimpos.mx', crypt('demo-dispositivo', gen_salt('bf')), now(), now(), now(),
     '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_duena, 'authenticated', 'authenticated',
     'duena@crazyburgers.demo', crypt('demo1234', gen_salt('bf')), now(), now(), now(),
     '{"provider":"email","providers":["email"]}', '{}', '', '', '', '');

  INSERT INTO usuarios_perfil (id, nombre, pin_hash, estado) VALUES
    (v_ana,  'Ana Ruiz',     crypt('1234', gen_salt('bf')), 'ACTIVO'),
    (v_beto, 'Beto Salazar', crypt('5678', gen_salt('bf')), 'ACTIVO'),
    (v_disp, 'Caja 01',      NULL,                          'ACTIVO'),
    (v_duena,'Carla Méndez', crypt('9999', gen_salt('bf')), 'ACTIVO');
  INSERT INTO usuarios_acceso (usuario_id, tenant_id, sucursal_id, rol_id) VALUES
    (v_ana,  v_tenant, v_suc, v_rol_caj),
    (v_beto, v_tenant, v_suc, v_rol_caj),
    (v_disp, v_tenant, v_suc, v_rol_dis),
    (v_duena, v_tenant, NULL, v_rol_due);

  INSERT INTO tenant_folios_saldo (tenant_id, folios_base_mensuales, folios_base_consumidos,
                                   periodo_actual, saldo_paquetes)
  VALUES (v_tenant, 50, 12, date_trunc('month', v_hoy)::date, 250);

  -- ── Catálogo ───────────────────────────────────────────────────────────────
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion, activa)
  VALUES (v_tenant, 'Hamburguesas', 1, true) RETURNING id INTO v_cat_ham;
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion, activa)
  VALUES (v_tenant, 'Para acompañar', 2, true) RETURNING id INTO v_cat_ali;
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion, activa)
  VALUES (v_tenant, 'Bebidas', 3, true) RETURNING id INTO v_cat_beb;
  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion, activa)
  VALUES (v_tenant, 'Postres', 4, true) RETURNING id INTO v_cat_pos;

  INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, tasa_iva,
                         iva_incluido_en_precio, estado, visible_en_pos, orden_visualizacion)
  VALUES
    (v_tenant, v_cat_ham, 'Crazy Clásica',        129.00, 16, true, 'ACTIVO', true, 1),
    (v_tenant, v_cat_ham, 'Doble Queso',          169.00, 16, true, 'ACTIVO', true, 2),
    (v_tenant, v_cat_ham, 'BBQ Tocino',           179.00, 16, true, 'ACTIVO', true, 3),
    (v_tenant, v_cat_ham, 'Pollo Crispy',         149.00, 16, true, 'ACTIVO', true, 4),
    (v_tenant, v_cat_ham, 'Vegetariana',          139.00, 16, true, 'ACTIVO', true, 5),
    (v_tenant, v_cat_ali, 'Papas gajo',            65.00, 16, true, 'ACTIVO', true, 1),
    (v_tenant, v_cat_ali, 'Papas con queso',       85.00, 16, true, 'ACTIVO', true, 2),
    (v_tenant, v_cat_ali, 'Aros de cebolla',       75.00, 16, true, 'ACTIVO', true, 3),
    (v_tenant, v_cat_beb, 'Refresco 600 ml',       35.00, 16, true, 'ACTIVO', true, 1),
    (v_tenant, v_cat_beb, 'Limonada natural',      45.00, 16, true, 'ACTIVO', true, 2),
    (v_tenant, v_cat_beb, 'Cerveza artesanal',     69.00, 16, true, 'ACTIVO', true, 3),
    (v_tenant, v_cat_pos, 'Brownie con helado',    79.00, 16, true, 'ACTIVO', true, 1),
    (v_tenant, v_cat_pos, 'Malteada de fresa',     89.00, 16, true, 'ACTIVO', true, 2);

  -- ── Modificadores, que es lo que se ve en la captura del catálogo ──────────
  INSERT INTO grupos_modificadores (tenant_id, nombre, tipo_seleccion, naturaleza, orden_visualizacion)
  VALUES (v_tenant, 'Término de la carne', 'UNICA_OBLIGATORIA', 'PREPARACION', 1)
  RETURNING id INTO v_g_term;
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, precio_extra_mxn, orden_visualizacion) VALUES
    (v_tenant, v_g_term, 'Tres cuartos', 0, 1),
    (v_tenant, v_g_term, 'Término medio', 0, 2),
    (v_tenant, v_g_term, 'Bien cocida', 0, 3);

  INSERT INTO grupos_modificadores (tenant_id, nombre, tipo_seleccion, naturaleza, orden_visualizacion)
  VALUES (v_tenant, 'Extras', 'MULTIPLE_OPCIONAL', 'EXTRA', 2) RETURNING id INTO v_g_extra;
  INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, precio_extra_mxn, orden_visualizacion) VALUES
    (v_tenant, v_g_extra, 'Queso extra',     20.00, 1),
    (v_tenant, v_g_extra, 'Tocino',          25.00, 2),
    (v_tenant, v_g_extra, 'Aguacate',        22.00, 3),
    (v_tenant, v_g_extra, 'Jalapeños',       12.00, 4),
    (v_tenant, v_g_extra, 'Sin cebolla',      0.00, 5);

  -- Los dos grupos cuelgan de las hamburguesas.
  INSERT INTO productos_grupos_modificadores (tenant_id, producto_id, grupo_id, orden_visualizacion)
  SELECT v_tenant, p.id, g.id, g.orden_visualizacion
    FROM productos p
    CROSS JOIN grupos_modificadores g
   WHERE p.categoria_id = v_cat_ham AND g.tenant_id = v_tenant;

  -- ── Un turno abierto con ventas del día ────────────────────────────────────
  INSERT INTO turnos (id, tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable,
                      usuario_apertura_id, fondo_inicial_mxn)
  VALUES (v_turno, v_tenant, v_suc, v_caja, 'T-01', v_hoy, v_ana, 1500);

  -- ── Un día de ventas ───────────────────────────────────────────────────────
  --
  -- POR QUÉ HACEN FALTA VENTAS DE VERDAD
  --
  -- Sin ellas, tres capturas del sitio no se pueden tomar (el cobro, el ticket
  -- impreso y el corte Z) y las del panel salen con todo en cero, que no
  -- enseña nada de lo que el panel hace.
  --
  -- POR QUÉ SE INSERTA ASÍ Y NO CON LOS TOTALES YA PUESTOS
  --
  -- `tickets`, `ticket_items` y `pagos` tienen veinte disparadores encima que
  -- asignan el folio, recalculan subtotal/IVA/total y cierran el ticket cuando
  -- queda saldado. Escribir los totales a mano los pelearía y produciría un
  -- ticket que no cuadra con sus propias líneas — justo el defecto que estas
  -- capturas irían a publicar.
  --
  -- Así que se inserta como lo hace la caja: ticket vacío, líneas, y el pago al
  -- final. Los números salen del mismo código que en producción.
  DECLARE
    v_t         uuid;
    v_it        uuid;
    v_venta     record;
    v_linea     record;
  BEGIN
    FOR v_venta IN
      -- Las horas van HACIA ATRÁS desde ahora, no a horas fijas del día: hay
      -- una restricción (`fecha_pago_implica_apertura`) que exige que el pago
      -- no sea anterior a la apertura, y el disparador del pago escribe
      -- `now()`. Con horas fijas, cualquier venta posterior a la hora real de
      -- ejecución nacía pagada antes de abrirse y la semilla reventaba.
      SELECT * FROM (VALUES
        --  hace N h, modo,          método,           quién
        ( 11, 'PARA_LLEVAR',  'EFECTIVO',         v_ana),
        (  9, 'COMER_AQUI',   'TARJETA_DEBITO',   v_ana),
        (  7, 'COMER_AQUI',   'EFECTIVO',         v_beto),
        (  6, 'PARA_LLEVAR',  'TARJETA_CREDITO',  v_beto),
        (  5, 'APP_RAPPI',    'APP_RAPPI',        v_ana),
        (  3, 'COMER_AQUI',   'EFECTIVO',         v_ana),
        (  2, 'PARA_LLEVAR',  'TRANSFERENCIA',    v_beto),
        (  1, 'COMER_AQUI',   'TARJETA_DEBITO',   v_ana)
      ) AS x(hace, modo, metodo, usuario)
    LOOP
      INSERT INTO tickets (tenant_id, sucursal_id, caja_id, turno_id, dia_contable,
                           modo_servicio, usuario_apertura_id, fecha_apertura)
      VALUES (v_tenant, v_suc, v_caja, v_turno, v_hoy,
              v_venta.modo::modo_servicio, v_venta.usuario,
              now() - make_interval(hours => v_venta.hace))
      RETURNING id INTO v_t;

      -- Dos o tres líneas por ticket, tomadas del catálogo real para que los
      -- nombres y los precios del ticket impreso sean los del menú.
      FOR v_linea IN
        SELECT p.id, p.nombre, p.precio_base_mxn, p.tasa_iva, p.iva_incluido_en_precio,
               c.nombre AS categoria,
               1 + (v_venta.hace + row_number() OVER ()) % 2 AS cant
          FROM productos p
          JOIN categorias c ON c.id = p.categoria_id
         WHERE p.tenant_id = v_tenant
         ORDER BY (v_venta.hace * 7 + p.orden_visualizacion * 13) % 11
         LIMIT 2 + (v_venta.hace % 2)
      LOOP
        INSERT INTO ticket_items (tenant_id, ticket_id, producto_id, cantidad,
                                  producto_nombre_snapshot, precio_unitario_snapshot,
                                  tasa_iva_snapshot, iva_incluido_en_precio_snapshot,
                                  categoria_nombre_snapshot, orden_visualizacion)
        VALUES (v_tenant, v_t, v_linea.id, v_linea.cant,
                v_linea.nombre, v_linea.precio_base_mxn,
                v_linea.tasa_iva, v_linea.iva_incluido_en_precio,
                v_linea.categoria, 1)
        RETURNING id INTO v_it;
      END LOOP;

      -- El pago cierra el ticket: `trg_pagos_zz_cerrar_si_pagado` lo pasa a
      -- PAGADO solo si el monto cubre el total, así que se lee el total que ya
      -- calcularon los disparadores en vez de suponerlo.
      INSERT INTO pagos (tenant_id, sucursal_id, caja_id, turno_id, ticket_id,
                         dia_contable, metodo_pago, monto_mxn, usuario_id, fecha_pago)
      SELECT v_tenant, v_suc, v_caja, v_turno, v_t, v_hoy,
             v_venta.metodo::metodo_pago, t.total_mxn, v_venta.usuario,
             now() - make_interval(hours => v_venta.hace, mins => -12)
        FROM tickets t WHERE t.id = v_t;
    END LOOP;

    -- Repartir las ventas por el día.
    --
    -- El disparador del pago escribe `fecha_pago = now()`, así que las ocho
    -- caían en el mismo minuto y la gráfica de "ventas por hora" del panel
    -- salía con UNA barra solitaria — que en una captura de marketing dice lo
    -- contrario de lo que se quiere enseñar.
    --
    -- Se corrige después de insertar, no antes: durante la venta el valor
    -- correcto ES `now()`, y adelantarlo pelearía con la restricción que exige
    -- que el pago no preceda a la apertura. En modo réplica porque
    -- `trg_tickets_proteger_inmutables` protege esta columna, y con razón: en
    -- producción la hora de pago de un ticket no se toca jamás.
    SET session_replication_role = replica;
    UPDATE tickets t
       SET fecha_pago = t.fecha_apertura + interval '12 minutes'
     WHERE t.tenant_id = v_tenant AND t.fecha_pago IS NOT NULL;
    UPDATE pagos g
       SET fecha_pago = t.fecha_apertura + interval '12 minutes'
      FROM tickets t
     WHERE g.ticket_id = t.id AND g.tenant_id = v_tenant;
    SET session_replication_role = origin;
  END;

  RAISE NOTICE 'Crazy Burgers creado. Caja: caja-9c3a71e0-...-000000000003@dispositivos.vimpos.mx / demo-dispositivo. PIN de Ana: 1234. Panel: duena@crazyburgers.demo / demo1234';
END $$;
