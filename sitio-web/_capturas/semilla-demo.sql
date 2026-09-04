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
  -- La segunda caja existe para que las cuentas abiertas (mesas y comandas en
  -- cocina) cuelguen de OTRO turno: el cierre de Caja 01 solo se bloquea con
  -- las cuentas de su propio turno, y la captura del arqueo necesita cerrarlo.
  v_caja2   uuid := '9c3a71e0-0000-4000-8000-000000000005';
  v_turno2  uuid := '9c3a71e0-0000-4000-8000-000000000006';
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
  -- La fecha es la de León, no la del contenedor (UTC): de noche ya son «mañana» en UTC.
  v_hoy     date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_u_kg    uuid; v_u_pza uuid; v_u_l uuid;
  v_sec_salon uuid; v_sec_terraza uuid;
  v_liq     uuid;
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
  VALUES (v_caja,  v_tenant, v_suc, 1, 'Caja 01'),
         (v_caja2, v_tenant, v_suc, 2, 'Caja 02');

  -- ── Lo que el negocio tiene encendido ──────────────────────────────────────
  -- Inventario y apps de reparto, para que las capturas del panel enseñen
  -- algo; y el QR de autofactura en el ticket, que es lo que la página de
  -- facturación describe. Va ANTES de las ventas: el descuento de inventario
  -- solo corre si el módulo está activo cuando se paga el ticket.
  INSERT INTO configuracion_tenant (tenant_id, modulo_inventario_activo, modulo_apps_externas_activo,
                                    mostrar_qr_factura_ticket, pie_ticket)
  VALUES (v_tenant, true, true, true, '¡Gracias por su compra!')
  ON CONFLICT (tenant_id) DO UPDATE
     SET modulo_inventario_activo = true, modulo_apps_externas_activo = true,
         mostrar_qr_factura_ticket = true, pie_ticket = EXCLUDED.pie_ticket;

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

  -- ── Inventario: insumos con existencia y la receta de cada platillo ────────
  -- Con esto, cada venta que se pague abajo descuenta carne, pan y queso por el
  -- disparador de siempre, así que los movimientos de inventario del panel son
  -- los que generó el sistema y no un insert a mano.
  INSERT INTO unidades_medida (tenant_id, codigo, nombre, simbolo, dimension, es_unidad_base, es_sistema, activa, orden_visualizacion)
  VALUES (v_tenant, 'KG', 'Kilogramo', 'kg', 'MASA', true, false, true, 1) RETURNING id INTO v_u_kg;
  INSERT INTO unidades_medida (tenant_id, codigo, nombre, simbolo, dimension, es_unidad_base, es_sistema, activa, orden_visualizacion)
  VALUES (v_tenant, 'PZA', 'Pieza', 'pza', 'CANTIDAD', true, false, true, 2) RETURNING id INTO v_u_pza;
  INSERT INTO unidades_medida (tenant_id, codigo, nombre, simbolo, dimension, es_unidad_base, es_sistema, activa, orden_visualizacion)
  VALUES (v_tenant, 'L', 'Litro', 'L', 'VOLUMEN', true, false, true, 3) RETURNING id INTO v_u_l;

  INSERT INTO insumos (tenant_id, nombre, categoria, unidad_medida_id, costo_unitario_mxn,
                       stock_minimo_global, stock_critico_global, estado, proveedor_preferido_texto)
  VALUES
    (v_tenant, 'Carne molida de res',   'CARNICOS',     v_u_kg,  185.00, 8,   4,  'ACTIVO', 'Carnes del Bajío'),
    (v_tenant, 'Pan brioche',           'PANIFICACION', v_u_pza,   6.50, 60,  30, 'ACTIVO', 'Panadería La Espiga'),
    (v_tenant, 'Queso americano',       'LACTEOS',      v_u_kg,  160.00, 3,   1.5,'ACTIVO', 'Lala Foodservice'),
    (v_tenant, 'Tocino ahumado',        'CARNICOS',     v_u_kg,  210.00, 2,   1,  'ACTIVO', 'Carnes del Bajío'),
    (v_tenant, 'Pechuga de pollo',      'CARNICOS',     v_u_kg,  120.00, 4,   2,  'ACTIVO', 'Carnes del Bajío'),
    (v_tenant, 'Lechuga romana',        'VEGETALES',    v_u_kg,   32.00, 2,   1,  'ACTIVO', 'Central de Abasto'),
    (v_tenant, 'Jitomate',              'VEGETALES',    v_u_kg,   28.00, 3,   1.5,'ACTIVO', 'Central de Abasto'),
    (v_tenant, 'Cebolla blanca',        'VEGETALES',    v_u_kg,   22.00, 3,   1.5,'ACTIVO', 'Central de Abasto'),
    (v_tenant, 'Aguacate',              'VEGETALES',    v_u_kg,   65.00, 2,   1,  'ACTIVO', 'Central de Abasto'),
    (v_tenant, 'Papa gajo congelada',   'CONGELADOS',   v_u_kg,   48.00, 10,  5,  'ACTIVO', 'McCain'),
    (v_tenant, 'Aceite vegetal',        'ABARROTES',    v_u_l,    38.00, 10,  5,  'ACTIVO', 'Abarrotes Sánchez'),
    (v_tenant, 'Refresco 600 ml',       'BEBIDAS',      v_u_pza,  14.00, 48,  24, 'ACTIVO', 'Coca-Cola FEMSA'),
    (v_tenant, 'Cerveza artesanal',     'BEBIDAS',      v_u_pza,  32.00, 24,  12, 'ACTIVO', 'Cervecería Chela Libre'),
    (v_tenant, 'Helado de vainilla',    'LACTEOS',      v_u_l,    90.00, 4,   2,  'ACTIVO', 'Holanda'),
    (v_tenant, 'Vaso con tapa 16 oz',   'EMPAQUE',      v_u_pza,   2.40, 100, 50, 'ACTIVO', 'Desechables del Centro');

  -- Existencias al abrir. Las ventas de abajo las van bajando por el disparador
  -- de recetas, así que lo que se ve en la captura es lo que queda al final del
  -- día: el pan cerca del mínimo y el aguacate en rojo. Si el pan llegara a
  -- cero, TODAS las hamburguesas saldrían «AGOTADO» en la caja — pasó con 52
  -- piezas, que un día de 48 tickets se come antes de la cena.
  INSERT INTO insumo_stock_sucursal (tenant_id, insumo_id, sucursal_id, stock_actual, stock_minimo, stock_critico, alerta_actual, fecha_ultimo_movimiento, fecha_ultimo_conteo_fisico)
  SELECT v_tenant, i.id, v_suc,
         CASE i.nombre
           WHEN 'Carne molida de res' THEN 21.4   WHEN 'Pan brioche' THEN 130
           WHEN 'Queso americano' THEN 4.8        WHEN 'Tocino ahumado' THEN 3.1
           WHEN 'Pechuga de pollo' THEN 6.2       WHEN 'Lechuga romana' THEN 3.4
           WHEN 'Jitomate' THEN 5.1               WHEN 'Cebolla blanca' THEN 6.0
           WHEN 'Aguacate' THEN 3.2               WHEN 'Papa gajo congelada' THEN 18.5
           WHEN 'Aceite vegetal' THEN 14          WHEN 'Refresco 600 ml' THEN 96
           WHEN 'Cerveza artesanal' THEN 41       WHEN 'Helado de vainilla' THEN 6.5
           ELSE 340 END,
         i.stock_minimo_global, i.stock_critico_global,
         CASE i.nombre WHEN 'Pan brioche' THEN 'AMARILLA'::alerta_severidad
                       WHEN 'Aguacate' THEN 'ROJA'::alerta_severidad ELSE NULL END,
         now() - interval '3 hours', v_hoy - 1
    FROM insumos i WHERE i.tenant_id = v_tenant;

  -- Recetas: producto → insumos. Solo lo que se descuenta de verdad.
  INSERT INTO recetas (tenant_id, producto_id, version, activa)
  SELECT v_tenant, p.id, 1, true FROM productos p WHERE p.tenant_id = v_tenant;

  INSERT INTO receta_componentes (tenant_id, receta_id, insumo_id, cantidad, es_critico, orden_visualizacion)
  SELECT v_tenant, r.id, i.id, c.cant, c.critico, c.orden
    FROM (VALUES
      ('Crazy Clásica',      'Carne molida de res', 0.150, true,  1),
      ('Crazy Clásica',      'Pan brioche',         1,     true,  2),
      ('Crazy Clásica',      'Queso americano',     0.020, false, 3),
      ('Crazy Clásica',      'Lechuga romana',      0.030, false, 4),
      ('Crazy Clásica',      'Jitomate',            0.030, false, 5),
      ('Crazy Clásica',      'Cebolla blanca',      0.015, false, 6),
      ('Doble Queso',        'Carne molida de res', 0.300, true,  1),
      ('Doble Queso',        'Pan brioche',         1,     true,  2),
      ('Doble Queso',        'Queso americano',     0.050, true,  3),
      ('BBQ Tocino',         'Carne molida de res', 0.150, true,  1),
      ('BBQ Tocino',         'Pan brioche',         1,     true,  2),
      ('BBQ Tocino',         'Tocino ahumado',      0.040, true,  3),
      ('BBQ Tocino',         'Queso americano',     0.020, false, 4),
      ('Pollo Crispy',       'Pechuga de pollo',    0.160, true,  1),
      ('Pollo Crispy',       'Pan brioche',         1,     true,  2),
      ('Pollo Crispy',       'Lechuga romana',      0.030, false, 3),
      ('Vegetariana',        'Pan brioche',         1,     true,  1),
      ('Vegetariana',        'Aguacate',            0.080, true,  2),
      ('Vegetariana',        'Lechuga romana',      0.040, false, 3),
      ('Papas gajo',         'Papa gajo congelada', 0.200, true,  1),
      ('Papas gajo',         'Aceite vegetal',      0.030, false, 2),
      ('Papas con queso',    'Papa gajo congelada', 0.200, true,  1),
      ('Papas con queso',    'Queso americano',     0.040, true,  2),
      ('Aros de cebolla',    'Cebolla blanca',      0.150, true,  1),
      ('Aros de cebolla',    'Aceite vegetal',      0.030, false, 2),
      ('Refresco 600 ml',    'Refresco 600 ml',     1,     true,  1),
      ('Limonada natural',   'Vaso con tapa 16 oz', 1,     false, 1),
      ('Cerveza artesanal',  'Cerveza artesanal',   1,     true,  1),
      ('Brownie con helado', 'Helado de vainilla',  0.100, true,  1),
      ('Malteada de fresa',  'Helado de vainilla',  0.150, true,  1),
      ('Malteada de fresa',  'Vaso con tapa 16 oz', 1,     false, 2)
    ) AS c(producto, insumo, cant, critico, orden)
    JOIN productos p ON p.tenant_id = v_tenant AND p.nombre = c.producto
    JOIN recetas  r  ON r.producto_id = p.id
    JOIN insumos  i  ON i.tenant_id = v_tenant AND i.nombre = c.insumo;

  -- ── Comedor: dos secciones y diez mesas ────────────────────────────────────
  INSERT INTO secciones (tenant_id, sucursal_id, nombre, orden_visualizacion, activa)
  VALUES (v_tenant, v_suc, 'Salón', 1, true) RETURNING id INTO v_sec_salon;
  INSERT INTO secciones (tenant_id, sucursal_id, nombre, orden_visualizacion, activa)
  VALUES (v_tenant, v_suc, 'Terraza', 2, true) RETURNING id INTO v_sec_terraza;

  INSERT INTO mesas (tenant_id, sucursal_id, seccion_id, numero, nombre, capacidad, forma, posicion_x, posicion_y, activa)
  SELECT v_tenant, v_suc, CASE WHEN m.n <= 6 THEN v_sec_salon ELSE v_sec_terraza END,
         m.n::text, 'Mesa ' || m.n, m.cap, m.forma, m.x, m.y, true
    FROM (VALUES
      (1, 4, 'CUADRADA', 1, 1), (2, 4, 'CUADRADA', 2, 1), (3, 2, 'REDONDA', 3, 1),
      (4, 6, 'RECTANGULAR', 1, 2), (5, 4, 'CUADRADA', 2, 2), (6, 2, 'REDONDA', 3, 2),
      (7, 4, 'CUADRADA', 1, 3), (8, 4, 'CUADRADA', 2, 3), (9, 6, 'RECTANGULAR', 3, 3),
      (10, 2, 'REDONDA', 4, 3)
    ) AS m(n, cap, forma, x, y);

  -- ── Un turno abierto con ventas del día ────────────────────────────────────
  INSERT INTO turnos (id, tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable,
                      usuario_apertura_id, fondo_inicial_mxn)
  VALUES (v_turno,  v_tenant, v_suc, v_caja,  'T-01', v_hoy, v_ana,  1500),
         (v_turno2, v_tenant, v_suc, v_caja2, 'T-02', v_hoy, v_beto, 1000);

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
      --
      -- Un día de verdad: 48 tickets repartidos de mediodía a las diez de la
      -- noche, con la comida y la cena como picos. Las horas son de León
      -- (America/Mexico_City): el panel las pinta en hora local, y con la
      -- hora del contenedor (UTC) la gráfica salía con ventas de madrugada.
      -- Lo que todavía no ha pasado hoy no se vende: la semilla se puede
      -- correr a cualquier hora y solo aparece lo anterior a ese momento.
      SELECT x.hace AS hace, x.modo,
             CASE WHEN x.modo LIKE 'APP\_%' THEN x.modo ELSE x.metodo END AS metodo,
             x.usuario
        FROM (
          SELECT m.ahora - (h.hora * 60 + (g * 60 / h.n) + (g * 17) % 9)              AS hace,
                 (ARRAY['PARA_LLEVAR','COMER_AQUI','COMER_AQUI','PARA_LLEVAR','DRIVE_THRU','APP_RAPPI',
                        'COMER_AQUI','APP_UBEREATS','PARA_LLEVAR','COMER_AQUI','APP_RAPPI','APP_DIDI'])[1 + (h.hora * 7 + g * 3) % 12] AS modo,
                 (ARRAY['EFECTIVO','TARJETA_DEBITO','EFECTIVO','TARJETA_CREDITO','TRANSFERENCIA',
                        'EFECTIVO','TARJETA_DEBITO'])[1 + (h.hora * 5 + g) % 7]                    AS metodo,
                 CASE WHEN (h.hora + g) % 3 = 0 THEN v_beto ELSE v_ana END               AS usuario
            FROM (VALUES (12, 3), (13, 5), (14, 7), (15, 6), (16, 3), (17, 2),
                         (18, 2), (19, 4), (20, 6), (21, 6), (22, 4)) AS h(hora, n)
            CROSS JOIN LATERAL generate_series(0, h.n - 1) AS g
            -- Minuto del día en León. Si ya pasó la medianoche, el «día» de
            -- ventas es el de ayer: se suma un día para que las ventas de la
            -- tarde sigan cayendo hacia atrás desde ahora, en vez de no existir.
            CROSS JOIN (SELECT CASE WHEN x >= 750 THEN x ELSE x + 1440 END AS ahora
                          FROM (SELECT (extract(epoch FROM (now() AT TIME ZONE 'America/Mexico_City')
                                          - date_trunc('day', now() AT TIME ZONE 'America/Mexico_City')) / 60)::int AS x) q) m
        ) x
       WHERE x.hace >= 20
       ORDER BY x.hace DESC
    LOOP
      INSERT INTO tickets (tenant_id, sucursal_id, caja_id, turno_id, dia_contable,
                           modo_servicio, usuario_apertura_id, fecha_apertura)
      VALUES (v_tenant, v_suc, v_caja, v_turno, v_hoy,
              v_venta.modo::modo_servicio, v_venta.usuario,
              now() - make_interval(mins => v_venta.hace))
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
             now() - make_interval(mins => v_venta.hace - 12)
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

    -- Lo vendido hace rato ya salió de cocina. Al pagarse, cada ticket entró
    -- EN_COCINA por el disparador de envío automático; si se dejara así, la
    -- pantalla de cocina enseñaría cuarenta comandas atrasadas. Las
    -- transiciones se hacen en orden porque el validador no admite saltos.
    UPDATE tickets SET estado_cocina = 'LISTO'
     WHERE tenant_id = v_tenant AND estado_cocina = 'EN_COCINA';
    UPDATE tickets SET estado_cocina = 'ENTREGADO'
     WHERE tenant_id = v_tenant AND estado_cocina = 'LISTO';
    SET session_replication_role = replica;
    UPDATE tickets SET fecha_envio_cocina = fecha_apertura + interval '1 minute',
                       fecha_listo = fecha_apertura + interval '9 minutes',
                       fecha_entrega = fecha_apertura + interval '11 minutes'
     WHERE tenant_id = v_tenant AND estado_cocina = 'ENTREGADO';
    SET session_replication_role = origin;

    -- ── Lo que está pasando AHORA: comandas en cocina ──────────────────────
    -- Cinco pedidos recién cobrados en Caja 02, con término, extras y notas,
    -- que es lo que la pantalla de cocina tiene que enseñar. Uno ya está
    -- LISTO y espera a que lo recojan.
    FOR v_venta IN
      SELECT * FROM (VALUES
        --  hace min, modo,          cliente,     producto,        término,        extra,        nota
        ( 11, 'PARA_LLEVAR', 'Rodrigo',  'Doble Queso',   'Bien cocida',  'Tocino',     NULL),
        (  8, 'COMER_AQUI',  NULL,       'Crazy Clásica', 'Término medio','Queso extra','Sin cebolla'),
        (  6, 'DRIVE_THRU',  'Mariana',  'BBQ Tocino',    'Tres cuartos', NULL,         'Salsa aparte'),
        (  4, 'APP_RAPPI',   'Rappi',    'Pollo Crispy',  NULL,           'Aguacate',   NULL),
        (  2, 'PARA_LLEVAR', 'Luis',     'Crazy Clásica', 'Término medio',NULL,         'Para las 9:30')
      ) AS x(hace, modo, cliente, producto, termino, extra, nota)
    LOOP
      INSERT INTO tickets (tenant_id, sucursal_id, caja_id, turno_id, dia_contable, modo_servicio,
                           usuario_apertura_id, fecha_apertura, nombre_cliente)
      VALUES (v_tenant, v_suc, v_caja2, v_turno2, v_hoy, v_venta.modo::modo_servicio, v_beto,
              now() - make_interval(mins => v_venta.hace), v_venta.cliente)
      RETURNING id INTO v_t;

      INSERT INTO ticket_items (tenant_id, ticket_id, producto_id, cantidad, producto_nombre_snapshot,
                                precio_unitario_snapshot, tasa_iva_snapshot, iva_incluido_en_precio_snapshot,
                                categoria_nombre_snapshot, orden_visualizacion, nota_cocina)
      SELECT v_tenant, v_t, p.id, 1, p.nombre, p.precio_base_mxn, p.tasa_iva, p.iva_incluido_en_precio,
             c.nombre, 1, v_venta.nota
        FROM productos p JOIN categorias c ON c.id = p.categoria_id
       WHERE p.tenant_id = v_tenant AND p.nombre = v_venta.producto
      RETURNING id INTO v_it;

      INSERT INTO ticket_item_modificadores (tenant_id, ticket_item_id, opcion_modificador_id, grupo_id,
                                             grupo_nombre_snapshot, opcion_nombre_snapshot, precio_extra_snapshot,
                                             naturaleza_snapshot, cantidad, monto_total_mxn)
      SELECT v_tenant, v_it, o.id, g.id, g.nombre, o.nombre, o.precio_extra_mxn, g.naturaleza, 1, o.precio_extra_mxn
        FROM opciones_modificador o JOIN grupos_modificadores g ON g.id = o.grupo_id
       WHERE o.tenant_id = v_tenant AND o.nombre IN (v_venta.termino, v_venta.extra);

      -- Papas y refresco en los pedidos grandes.
      INSERT INTO ticket_items (tenant_id, ticket_id, producto_id, cantidad, producto_nombre_snapshot,
                                precio_unitario_snapshot, tasa_iva_snapshot, iva_incluido_en_precio_snapshot,
                                categoria_nombre_snapshot, orden_visualizacion)
      SELECT v_tenant, v_t, p.id, 1, p.nombre, p.precio_base_mxn, p.tasa_iva, p.iva_incluido_en_precio, c.nombre,
             2 + row_number() OVER ()
        FROM productos p JOIN categorias c ON c.id = p.categoria_id
       WHERE p.tenant_id = v_tenant AND p.nombre IN ('Papas gajo', 'Refresco 600 ml') AND v_venta.hace % 2 = 0;

      INSERT INTO pagos (tenant_id, sucursal_id, caja_id, turno_id, ticket_id, dia_contable, metodo_pago,
                         monto_mxn, usuario_id, fecha_pago)
      SELECT v_tenant, v_suc, v_caja2, v_turno2, v_t, v_hoy,
             CASE WHEN v_venta.modo LIKE 'APP\_%' THEN v_venta.modo::metodo_pago ELSE 'EFECTIVO'::metodo_pago END,
             t.total_mxn, v_beto, now()
        FROM tickets t WHERE t.id = v_t;

      -- El más viejo ya está listo.
      IF v_venta.hace = 11 THEN
        UPDATE tickets SET estado_cocina = 'LISTO' WHERE id = v_t;
      END IF;
    END LOOP;
    SET session_replication_role = replica;
    UPDATE tickets SET fecha_pago = fecha_apertura + interval '1 minute',
                       fecha_envio_cocina = fecha_apertura + interval '1 minute',
                       fecha_listo = CASE WHEN estado_cocina = 'LISTO' THEN now() - interval '2 minutes' END
     WHERE tenant_id = v_tenant AND turno_id = v_turno2 AND estado_fiscal = 'PAGADO';
    UPDATE pagos SET fecha_pago = now() - make_interval(mins => 1)
     WHERE tenant_id = v_tenant AND turno_id = v_turno2;
    SET session_replication_role = origin;

    -- ── Cuatro mesas ocupadas, con la cuenta abierta ───────────────────────
    -- El ticket nace BORRADOR, se le ponen productos y pasa a ABIERTO (ahí el
    -- disparador le da folio). Al asignarle la mesa, otro disparador la marca
    -- OCUPADA. Cuelgan del turno de Caja 02 por lo dicho arriba.
    FOR v_venta IN
      SELECT * FROM (VALUES
        --  mesa, hace min, productos
        ('2', 48, ARRAY['Doble Queso', 'Crazy Clásica', 'Papas con queso', 'Cerveza artesanal', 'Cerveza artesanal']),
        ('4', 75, ARRAY['BBQ Tocino', 'Pollo Crispy', 'Vegetariana', 'Aros de cebolla', 'Limonada natural', 'Refresco 600 ml', 'Brownie con helado']),
        ('5', 22, ARRAY['Crazy Clásica', 'Papas gajo', 'Malteada de fresa']),
        ('8', 12, ARRAY['Doble Queso', 'Refresco 600 ml'])
      ) AS x(mesa, hace, productos)
    LOOP
      INSERT INTO tickets (tenant_id, sucursal_id, caja_id, turno_id, dia_contable, modo_servicio,
                           usuario_apertura_id, mesero_id, fecha_apertura)
      VALUES (v_tenant, v_suc, v_caja2, v_turno2, v_hoy, 'MESA', v_beto, v_beto,
              now() - make_interval(mins => v_venta.hace))
      RETURNING id INTO v_t;

      INSERT INTO ticket_items (tenant_id, ticket_id, producto_id, cantidad, producto_nombre_snapshot,
                                precio_unitario_snapshot, tasa_iva_snapshot, iva_incluido_en_precio_snapshot,
                                categoria_nombre_snapshot, orden_visualizacion)
      SELECT v_tenant, v_t, p.id, 1, p.nombre, p.precio_base_mxn, p.tasa_iva, p.iva_incluido_en_precio, c.nombre, u.ord
        FROM unnest(v_venta.productos) WITH ORDINALITY AS u(nombre, ord)
        JOIN productos p ON p.tenant_id = v_tenant AND p.nombre = u.nombre
        JOIN categorias c ON c.id = p.categoria_id;

      UPDATE tickets SET estado_fiscal = 'ABIERTO' WHERE id = v_t;
      -- La mesa ya pidió: su comanda está en cocina, salvo la que acaba de sentarse.
      IF v_venta.hace > 15 THEN
        UPDATE tickets SET estado_cocina = 'EN_COCINA' WHERE id = v_t;
      END IF;

      INSERT INTO tickets_mesas (tenant_id, ticket_id, mesa_id, es_mesa_principal, fecha_asignacion, created_by)
      SELECT v_tenant, v_t, m.id, true, now() - make_interval(mins => v_venta.hace), v_beto
        FROM mesas m WHERE m.tenant_id = v_tenant AND m.numero = v_venta.mesa;
    END LOOP;
    SET session_replication_role = replica;
    UPDATE tickets SET fecha_envio_cocina = fecha_apertura + interval '4 minutes'
     WHERE tenant_id = v_tenant AND modo_servicio = 'MESA' AND estado_cocina = 'EN_COCINA';
    -- Las mesas más viejas ya recibieron su comida: la 5 sigue en cocina y la
    -- 8 acaba de sentarse y todavía no manda nada.
    UPDATE tickets SET estado_cocina = 'ENTREGADO', fecha_listo = fecha_apertura + interval '14 minutes',
                       fecha_entrega = fecha_apertura + interval '16 minutes'
     WHERE tenant_id = v_tenant AND modo_servicio = 'MESA' AND estado_cocina = 'EN_COCINA'
       AND fecha_apertura < now() - interval '40 minutes';
    SET session_replication_role = origin;

    -- ── Mermas y una compra, para que el inventario tenga historia ──────────
    INSERT INTO movimientos_inventario (tenant_id, sucursal_id, insumo_id, tipo, cantidad, costo_unitario_mxn,
                                        stock_antes, stock_despues, fecha, dia_contable,
                                        usuario_id, motivo, descripcion, proveedor_texto, factura_referencia)
    SELECT v_tenant, v_suc, i.id, m.tipo::movimiento_inventario_tipo, m.cant, i.costo_unitario_mxn,
           s.stock_actual + m.delta, s.stock_actual,
           now() - make_interval(hours => m.hace), v_hoy, v_duena, m.motivo, m.descripcion, m.proveedor, m.factura
      FROM (VALUES
        ('Pan brioche',         'MERMA',          6,    6,    'Caducado',           'Del lote del lunes',          NULL,               NULL,     7),
        ('Lechuga romana',      'MERMA',          0.8,  0.8,  'Se echó a perder',   NULL,                          NULL,               NULL,     6),
        ('Aguacate',            'MERMA',          1.2,  1.2,  'Maduro de más',      'No sirve para la vegetariana',NULL,               NULL,     5),
        ('Carne molida de res', 'ENTRADA_COMPRA', 12,   -12,  NULL,                 NULL,                          'Carnes del Bajío', 'F-2291', 9),
        ('Refresco 600 ml',     'ENTRADA_COMPRA', 48,   -48,  NULL,                 NULL,                          'Coca-Cola FEMSA',  'A-77310',9)
      ) AS m(insumo, tipo, cant, delta, motivo, descripcion, proveedor, factura, hace)
      JOIN insumos i ON i.tenant_id = v_tenant AND i.nombre = m.insumo
      JOIN insumo_stock_sucursal s ON s.insumo_id = i.id AND s.sucursal_id = v_suc;

    -- ── La liquidación de Rappi de hoy, cruzada contra los tickets ─────────
    -- Casi todo cuadra; un pedido llegó con 35 pesos de menos, uno no aparece
    -- en el depósito y hay un depósito sin ticket. Es lo que la pantalla de
    -- conciliación existe para marcar.
    INSERT INTO apps_liquidaciones (tenant_id, sucursal_id, app_externa, folio_liquidacion_app, periodo_inicio, periodo_fin,
                                    ingesta_metodo, ingesta_at, ingesta_por_id, estado, nota,
                                    total_ventas_brutas_mxn, total_liquidado_mxn, total_pos_mxn, diferencia_mxn, porcentaje_match)
    VALUES (v_tenant, v_suc, 'APP_RAPPI', 'RP-LIQ-' || to_char(v_hoy, 'YYYYMMDD'), v_hoy, v_hoy,
            'PEGADO', now() - interval '20 minutes', v_duena, 'CONCILIADA',
            'Pegada desde el reporte de la app', 0, 0, 0, 0, 0)
    RETURNING id INTO v_liq;

    INSERT INTO apps_liquidacion_items (tenant_id, liquidacion_id, folio_externo_app, fecha_orden_app, monto_venta_mxn,
                                        monto_comision_mxn, monto_propina_mxn, monto_neto_mxn, ticket_id_match,
                                        match_metodo, match_at, match_por_id, monto_diferencia_mxn, notas_match)
    SELECT v_tenant, v_liq, 'RP-' || (884120 + r.n), t.fecha_apertura,
           CASE WHEN r.n = 2 THEN t.total_mxn - 35 ELSE t.total_mxn END,
           round(t.total_mxn * 0.25, 2), 0,
           round((CASE WHEN r.n = 2 THEN t.total_mxn - 35 ELSE t.total_mxn END) * 0.75, 2),
           t.id, CASE WHEN r.n = 2 THEN 'MONTO_APROX' ELSE 'FOLIO_MONTO' END,
           now() - interval '20 minutes', v_duena,
           CASE WHEN r.n = 2 THEN -35 ELSE 0 END,
           CASE WHEN r.n = 2 THEN 'La app liquidó 35 pesos menos' END
      FROM (SELECT t.*, row_number() OVER (ORDER BY t.fecha_apertura) AS n
              FROM tickets t
             WHERE t.tenant_id = v_tenant AND t.modo_servicio = 'APP_RAPPI' AND t.estado_fiscal = 'PAGADO'
               AND t.turno_id = v_turno) AS r
      JOIN tickets t ON t.id = r.id
     WHERE r.n < (SELECT count(*) FROM tickets WHERE tenant_id = v_tenant AND modo_servicio = 'APP_RAPPI'
                                                 AND estado_fiscal = 'PAGADO' AND turno_id = v_turno);

    -- El depósito que no corresponde a ningún ticket.
    INSERT INTO apps_liquidacion_items (tenant_id, liquidacion_id, folio_externo_app, fecha_orden_app, monto_venta_mxn,
                                        monto_comision_mxn, monto_propina_mxn, monto_neto_mxn, monto_diferencia_mxn, notas_match)
    VALUES (v_tenant, v_liq, 'RP-884199', now() - interval '5 hours', 189.00, 47.25, 0, 141.75, 189.00,
            'Sin ticket en la caja');

    UPDATE apps_liquidaciones l
       SET total_ventas_brutas_mxn = s.brutas, total_comisiones_mxn = s.com,
           total_iva_comisiones_mxn = round(s.com * 0.16, 2), total_propinas_mxn = 0, total_ajustes_mxn = 0,
           total_liquidado_mxn = s.neto, total_pos_mxn = s.pos, diferencia_mxn = s.brutas - s.pos,
           porcentaje_match = round(100.0 * s.casados / GREATEST(s.renglones, 1), 1),
           conciliado_at = now() - interval '18 minutes', conciliado_por_id = v_duena
      FROM (SELECT sum(monto_venta_mxn) AS brutas, sum(monto_comision_mxn) AS com, sum(monto_neto_mxn) AS neto,
                   count(*) AS renglones, count(ticket_id_match) AS casados,
                   (SELECT coalesce(sum(total_mxn), 0) FROM tickets
                     WHERE tenant_id = v_tenant AND modo_servicio = 'APP_RAPPI' AND estado_fiscal = 'PAGADO'
                       AND turno_id = v_turno) AS pos
              FROM apps_liquidacion_items WHERE liquidacion_id = v_liq) s
     WHERE l.id = v_liq;
  END;

  RAISE NOTICE 'Crazy Burgers creado. Caja: caja-9c3a71e0-...-000000000003@dispositivos.vimpos.mx / demo-dispositivo. PIN de Ana: 1234. Panel: duena@crazyburgers.demo / demo1234';
END $$;
