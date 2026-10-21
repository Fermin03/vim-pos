-- Demo autoguiada de la caja (spec 2026-10-20-demo-autoguiada-design.md, ADR 0044).
--
-- Cada visitante de la demo pública recibe su propio Crazy Burgers: un tenant nuevo, clonado aquí,
-- en un proyecto de Supabase APARTE (solo para la demo). La Edge Function `demo-iniciar` llama a
-- `demo_clonar` con service_role; la caja llama a `demo_registrar_paso` con su sesión; pg_cron
-- llama cada hora a `demo_limpiar`.
--
-- En producción y en las cajas de escritorio esto queda inerte: la tabla vacía, `demo_clonar` y
-- `demo_limpiar` solo para service_role, y nadie las llama. El job de limpieza se programa también
-- en producción (pg_cron existe ahí), pero sin filas en `demo_sesiones` no borra nada.

-- ── §1 Sesiones de demo ──────────────────────────────────────────────────────
-- Una fila por tenant de demo: sirve de lista de qué borrar, de tope de demos vivas y de medición
-- (cuántas empezaron y en qué paso de los 17 se quedaron). Sin políticas: solo la tocan las
-- funciones de abajo.
CREATE TABLE IF NOT EXISTS demo_sesiones (
  tenant_id   uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  caja_id     uuid NOT NULL,
  ip          text,
  ultimo_paso smallint NOT NULL DEFAULT 1 CHECK (ultimo_paso BETWEEN 1 AND 17),
  creado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_demo_sesiones_creado_en ON demo_sesiones (creado_en);
ALTER TABLE demo_sesiones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON demo_sesiones FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE demo_sesiones IS
  'Tenants de la demo autoguiada: cuándo nacieron (para borrarlos a las 24 h) y el último paso de la guía que alcanzaron (0261, ADR 0044).';

-- ── §2 Clonar Crazy Burgers ─────────────────────────────────────────────────
-- Versión parametrizada de sitio-web/_capturas/semilla-demo.sql: negocio, sucursal, una caja,
-- gente, catálogo, modificadores y mesas. NO copia turnos, tickets, comandas, inventario, apps de
-- reparto, add-ons ni a la dueña (sería la misma contraseña en cada tenant).
--
-- Las cuentas van directo a auth.users como en la semilla, con los campos de token en '' y no en
-- NULL: GoTrue los lee como `string` de Go y con NULL responde 500 al iniciar sesión.
CREATE OR REPLACE FUNCTION demo_clonar(p_caja_id uuid, p_clave text, p_ip text)
RETURNS TABLE (tenant_id uuid, correo text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp   -- 'extensions' por crypt()/gen_salt() de pgcrypto
AS $$
#variable_conflict use_column
DECLARE
  c_tope    CONSTANT int := 300;
  v_tenant  uuid := gen_random_uuid();
  v_suc     uuid := gen_random_uuid();
  v_ana     uuid := gen_random_uuid();
  v_beto    uuid := gen_random_uuid();
  v_disp    uuid := gen_random_uuid();
  v_codigo  text;
  v_correo  text;
  v_plan    uuid;
  v_rol_caj uuid;
  v_rol_dis uuid;
  v_cat_ham uuid; v_cat_ali uuid; v_cat_beb uuid; v_cat_pos uuid;
  v_g_term  uuid; v_g_extra uuid;
  v_sec_salon uuid; v_sec_terraza uuid;
BEGIN
  IF p_caja_id IS NULL THEN RAISE EXCEPTION 'CAJA_REQUERIDA'; END IF;
  IF p_clave IS NULL OR length(p_clave) < 12 THEN RAISE EXCEPTION 'CLAVE_CORTA: 12 caracteres o más'; END IF;

  -- Dos llamadas a la vez no pasan juntas el tope.
  PERFORM pg_advisory_xact_lock(hashtext('demo_clonar'));
  IF (SELECT count(*) FROM demo_sesiones) >= c_tope THEN
    RAISE EXCEPTION 'DEMO_LLENA: hay % demos vivas', c_tope;
  END IF;

  -- Un plan ACTIVO (QS está inactivo en la nube desde la 0086). ESENCIAL si existe; si no —el
  -- Postgres del escritorio tiene otro catálogo—, el primero activo. Sin _sincronizar_addons_del_plan:
  -- la demo no lleva add-ons.
  SELECT id INTO v_plan FROM planes WHERE activo
   ORDER BY (codigo = 'ESENCIAL') DESC, orden_visualizacion, codigo LIMIT 1;
  SELECT id INTO v_rol_caj FROM roles WHERE codigo = 'CAJERO' AND es_sistema;
  SELECT id INTO v_rol_dis FROM roles WHERE codigo = 'DISPOSITIVO' AND es_sistema;
  IF v_plan IS NULL OR v_rol_caj IS NULL OR v_rol_dis IS NULL THEN
    RAISE EXCEPTION 'CATALOGO_INCOMPLETO: faltan planes activos o los roles CAJERO/DISPOSITIVO';
  END IF;

  v_codigo := 'demo-' || left(replace(v_tenant::text, '-', ''), 12);
  v_correo := 'caja-' || p_caja_id || '@dispositivos.vimpos.com.mx';

  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal, plan_actual_id,
                       razon_social, rfc, regimen_fiscal, codigo_postal_fiscal, operacion)
  VALUES (v_tenant, v_codigo, 'Crazy Burgers', 'ACTIVO', 'QUICK_SERVICE', v_plan,
          'CRAZY BURGERS', 'CBU210415HM8', '612', '37000',
          juego_inicial_de_giro('QUICK_SERVICE') || '{"kds":false,"meseros":false}'::jsonb);

  INSERT INTO sucursales (id, tenant_id, codigo, nombre, ciudad, estado_geo)
  VALUES (v_suc, v_tenant, 'CB', 'Centro', 'León', 'Guanajuato');

  INSERT INTO cajas (id, tenant_id, sucursal_id, numero, nombre)
  VALUES (p_caja_id, v_tenant, v_suc, 1, 'Caja 01');

  INSERT INTO configuracion_tenant (tenant_id, pie_ticket)
  VALUES (v_tenant, '¡Gracias por su compra!')
  ON CONFLICT (tenant_id) DO UPDATE SET pie_ticket = EXCLUDED.pie_ticket;

  -- ── Gente inventada ──
  -- Ana y Beto entran por PIN (pin-login firma su propio token), así que su contraseña de Auth
  -- es al azar y nadie la conoce. La de la caja es la que generó `demo-iniciar`.
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data,
                          confirmation_token, recovery_token,
                          email_change_token_new, email_change) VALUES
    ('00000000-0000-0000-0000-000000000000', v_ana, 'authenticated', 'authenticated',
     'ana+' || v_codigo || '@crazyburgers.demo', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), now(), now(),
     '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_beto, 'authenticated', 'authenticated',
     'beto+' || v_codigo || '@crazyburgers.demo', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), now(), now(),
     '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_disp, 'authenticated', 'authenticated',
     v_correo, crypt(p_clave, gen_salt('bf')), now(), now(), now(),
     '{"provider":"email","providers":["email"]}', '{"nombre":"Caja 01","tipo":"DISPOSITIVO"}', '', '', '', '');

  INSERT INTO usuarios_perfil (id, nombre, apellido_paterno, pin_hash, estado) VALUES
    (v_ana,  'Ana',     'Ruiz',    crypt('1234', gen_salt('bf')), 'ACTIVO'),
    (v_beto, 'Beto',    'Salazar', crypt('5678', gen_salt('bf')), 'ACTIVO'),
    (v_disp, 'Caja 01', NULL,      NULL,                          'ACTIVO');
  INSERT INTO usuarios_acceso (usuario_id, tenant_id, sucursal_id, rol_id) VALUES
    (v_ana,  v_tenant, v_suc, v_rol_caj),
    (v_beto, v_tenant, v_suc, v_rol_caj),
    (v_disp, v_tenant, v_suc, v_rol_dis);

  INSERT INTO tenant_folios_saldo (tenant_id, folios_base_mensuales, folios_base_consumidos,
                                   periodo_actual, saldo_paquetes)
  VALUES (v_tenant, 50, 0, date_trunc('month', (now() AT TIME ZONE 'America/Mexico_City'))::date, 0);

  -- ── Catálogo ──
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
    (v_tenant, v_cat_ham, 'Hawaiana',             159.00, 16, true, 'ACTIVO', true, 6),
    (v_tenant, v_cat_ham, 'Chipotle',             159.00, 16, true, 'ACTIVO', true, 7),
    (v_tenant, v_cat_ham, 'Arrachera',            189.00, 16, true, 'ACTIVO', true, 8),
    (v_tenant, v_cat_ham, 'Jalapeño',             155.00, 16, true, 'ACTIVO', true, 9),
    (v_tenant, v_cat_ham, 'Champiñones',          165.00, 16, true, 'ACTIVO', true, 10),
    (v_tenant, v_cat_ham, 'Triple Crazy',         219.00, 16, true, 'ACTIVO', true, 11),
    (v_tenant, v_cat_ham, 'Mini Crazy',            99.00, 16, true, 'ACTIVO', true, 12),
    (v_tenant, v_cat_ali, 'Papas gajo',            65.00, 16, true, 'ACTIVO', true, 1),
    (v_tenant, v_cat_ali, 'Papas con queso',       85.00, 16, true, 'ACTIVO', true, 2),
    (v_tenant, v_cat_ali, 'Aros de cebolla',       75.00, 16, true, 'ACTIVO', true, 3),
    (v_tenant, v_cat_beb, 'Refresco 600 ml',       35.00, 16, true, 'ACTIVO', true, 1),
    (v_tenant, v_cat_beb, 'Limonada natural',      45.00, 16, true, 'ACTIVO', true, 2),
    (v_tenant, v_cat_beb, 'Cerveza artesanal',     69.00, 16, true, 'ACTIVO', true, 3),
    (v_tenant, v_cat_pos, 'Brownie con helado',    79.00, 16, true, 'ACTIVO', true, 1),
    (v_tenant, v_cat_pos, 'Malteada de fresa',     89.00, 16, true, 'ACTIVO', true, 2);

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
    FROM productos p CROSS JOIN grupos_modificadores g
   WHERE p.categoria_id = v_cat_ham AND g.tenant_id = v_tenant;

  -- ── Comedor: dos secciones y diez mesas ──
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

  INSERT INTO demo_sesiones (tenant_id, caja_id, ip) VALUES (v_tenant, p_caja_id, p_ip);

  RETURN QUERY SELECT v_tenant, v_correo;
END;
$$;
COMMENT ON FUNCTION demo_clonar(uuid, text, text) IS
  'Clona Crazy Burgers en un tenant nuevo para un visitante de la demo autoguiada; devuelve el tenant y el correo de su caja. DEMO_LLENA con 300 demos vivas. Solo service_role (0261, ADR 0044).';
REVOKE ALL ON FUNCTION demo_clonar(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION demo_clonar(uuid, text, text) TO service_role;

-- ── §3 El paso de la guía al que llegó ─────────────────────────────────────
-- Solo avanza: recargar o repetir un paso no lo baja. Un tenant que no es de demo no tiene fila y
-- no pasa nada.
CREATE OR REPLACE FUNCTION demo_registrar_paso(p_paso smallint)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE demo_sesiones
     SET ultimo_paso = GREATEST(ultimo_paso, p_paso)
   WHERE tenant_id = nullif(auth.jwt() ->> 'tenant_id', '')::uuid;
$$;
COMMENT ON FUNCTION demo_registrar_paso(smallint) IS
  'La caja de la demo marca el último paso de la guía alcanzado (solo sube). Tenant del JWT (0261, ADR 0044).';
REVOKE ALL ON FUNCTION demo_registrar_paso(smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION demo_registrar_paso(smallint) TO authenticated, service_role;

-- ── §4 Limpieza nocturna ─────────────────────────────────────────────────────
-- Borra con eliminar_tenant (0144) —que sabe borrar un negocio entero con sus cuentas de Auth— y
-- cumple aquí sus condiciones: cancelado, sin días de gracia (bloqueo_desde ya pasado). La demo no
-- timbra CFDI, así que tampoco lo frena eso. eliminar_tenant pide un operador uuid; el de la
-- limpieza es el uuid nulo, y el motivo dice de dónde viene.
-- Una demo que no se deje borrar no detiene a las demás: queda en un WARNING y se reintenta mañana.
CREATE OR REPLACE FUNCTION demo_limpiar()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_sistema CONSTANT uuid := '00000000-0000-0000-0000-000000000000';
  v_id uuid;
  v_n  integer := 0;
BEGIN
  FOR v_id IN
    SELECT s.tenant_id FROM demo_sesiones s
     WHERE s.creado_en < now() - interval '24 hours'
     ORDER BY s.creado_en
     LIMIT 100   -- tope por corrida; corre cada hora: hasta 2,400 al día, más que el límite de 60/h
  LOOP
    BEGIN
      UPDATE tenants
         SET estado = 'CANCELADO', fecha_baja = now(), bloqueo_desde = now(),
             motivo_baja = 'Demo autoguiada vencida'
       WHERE id = v_id;
      PERFORM eliminar_tenant(v_id, 'Demo autoguiada vencida', c_sistema, 'ELIMINAR', NULL);
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'demo_limpiar: no se borró %: %', v_id, SQLERRM;
    END;
  END LOOP;
  RETURN v_n;
END;
$$;
COMMENT ON FUNCTION demo_limpiar() IS
  'Borra los tenants de la demo autoguiada de más de 24 h (hasta 100 por corrida) con eliminar_tenant. Devuelve cuántos borró. Solo service_role / pg_cron (0261, ADR 0044).';
REVOKE ALL ON FUNCTION demo_limpiar() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION demo_limpiar() TO service_role;

-- Programación: solo donde pg_cron exista (Supabase nube). En escritorio no se hace nada.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'demo-limpiar') THEN
      PERFORM cron.unschedule('demo-limpiar');
    END IF;
    PERFORM cron.schedule('demo-limpiar', '40 * * * *', 'SELECT public.demo_limpiar()');
  END IF;
END $$;
