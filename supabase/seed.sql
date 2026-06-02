-- seed.sql — catálogos del sistema (planes, folios, roles, subtipos, permisos). Fuente: 1A §9. Corre tras las migraciones (supabase db reset).

-- ============================================================================
-- §9.1 — Planes SaaS (catálogo del sistema, no por tenant)
-- timbres_cfdi_mensuales = base mensual NO acumulable (D96). El excedente se
-- cubre con paquetes prepagados (§9.1.bis). Folios base: 30/50/50/80/80/200.
-- ============================================================================
INSERT INTO planes (codigo, nombre, descripcion, vertical, precio_mensual_mxn, max_sucursales, timbres_cfdi_mensuales, features_incluidos, orden_visualizacion) VALUES
  ('FT',  'Foodtruck',
   'Foodtrucks, food bikes, puestos móviles. Operación offline robusta, captura ultra-rápida.',
   'FOODTRUCK', 399.00, 1, 30,
   '{"offline_robusto": true, "multi_evento": true, "captura_rapida": true}'::jsonb, 1),

  ('QS',  'Quick Service',
   'Hamburgueserías, taquerías, pizzerías. Mostrador y pickup, modos de servicio flexibles.',
   'QUICK_SERVICE', 999.00, 3, 50,
   '{"modos_servicio": true, "areas_cocina": true, "kds_basico": true}'::jsonb, 2),

  ('CB',  'Café & Bar',
   'Cafeterías, bares, cantinas. Cuentas abiertas en barra, operación híbrida.',
   'CAFE_BAR', 999.00, 3, 50,
   '{"cuentas_abiertas": true, "operacion_hibrida": true, "happy_hour": true}'::jsonb, 3),

  ('FS',  'Full Service',
   'Restaurantes con meseros, casual dining. Mesas, propinas, cuentas por mesero.',
   'FULL_SERVICE', 1299.00, 3, 80,
   '{"mesas": true, "cuentas_abiertas": true, "propinas": true, "asignacion_mesero": true}'::jsonb, 4),

  ('DK',  'Dark Kitchen',
   'Cocinas fantasma, operadores multi-marca. Apps externas, gestión multi-marca.',
   'DARK_KITCHEN', 1499.00, 2, 80,
   '{"multi_marca": true, "apps_externas": true, "consolidacion_canales": true}'::jsonb, 5),

  ('ENT', 'Enterprise',
   'Cadenas, franquiciantes. Multi-sucursal avanzado, reporteo central. (Fase 5)',
   'ENTERPRISE', 2499.00, NULL, 200,
   '{"multi_sucursal_avanzado": true, "reporteo_central": true, "franquicias": true}'::jsonb, 6);

-- ============================================================================
-- §9.1.bis — Paquetes de folios CFDI prepagados
-- Precio con descuento por volumen; costo VIM $0.50/folio vía Facturama Multiemisor.
-- ============================================================================
INSERT INTO folios_paquetes (codigo, nombre, cantidad_folios, precio_mxn, precio_por_folio, orden_visualizacion) VALUES
  ('PACK_100',  'Paquete 100 folios',   100,  200.00, 2.0000, 1),
  ('PACK_250',  'Paquete 250 folios',   250,  450.00, 1.8000, 2),
  ('PACK_500',  'Paquete 500 folios',   500,  750.00, 1.5000, 3),
  ('PACK_1000', 'Paquete 1,000 folios', 1000, 1300.00, 1.3000, 4),
  ('PACK_5000', 'Paquete 5,000 folios', 5000, 5000.00, 1.0000, 5);

-- ============================================================================
-- §9.2 — Roles base del sistema (tenant_id NULL = compartidos, es_sistema=true)
-- ============================================================================
INSERT INTO roles (id, tenant_id, codigo, nombre, descripcion, es_sistema, jerarquia, activo) VALUES
  (gen_random_uuid(), NULL, 'DUENO',     'Dueño',
   'Cuenta master del negocio. Acceso total inalterable.',
   true, 5, true),

  (gen_random_uuid(), NULL, 'ADMIN',     'Administrador',
   'Gerente o encargado de sucursal. Configura, autoriza, gestiona.',
   true, 4, true),

  (gen_random_uuid(), NULL, 'SUPERVISOR', 'Supervisor',
   'Jefe de turno. Autoriza cancelaciones, descuentos, sangrías.',
   true, 3, true),

  (gen_random_uuid(), NULL, 'CAJERO',    'Cajero / Operador',
   'Personal de caja. Abre turnos, vende, cobra. No autoriza.',
   true, 2, true),

  (gen_random_uuid(), NULL, 'PERSONAL',  'Personal / General',
   'Personal operativo sin acceso a caja. Cocina, mesa, delivery según subtipo.',
   true, 1, true),

  -- Rol de sistema reservado para las cuentas de dispositivo (caja/estación POS).
  -- Jerarquía 0, SIN permisos operativos: solo sostiene la app antes del PIN del
  -- empleado y porta tenant_id en su JWT (Parte 1F §1.1, D75). No se le asigna
  -- ninguna fila en rol_permisos (§9.5) — por diseño no puede operar.
  (gen_random_uuid(), NULL, 'DISPOSITIVO', 'Dispositivo',
   'Cuenta de caja/estación POS. Mantiene la sesión base del dispositivo; sin permisos operativos.',
   true, 0, true);

-- ============================================================================
-- §9.3 — Subtipos de personal sugeridos (tenant_id NULL = sistema)
-- ============================================================================
INSERT INTO subtipos_personal (tenant_id, codigo, nombre, descripcion, verticales_aplicables, capacidades, es_sistema, activo) VALUES
  (NULL, 'COCINERO', 'Cocinero',
   'Ver cola de cocina, marcar comandas como listas, reportar producto agotado.',
   ARRAY['QUICK_SERVICE', 'FOODTRUCK', 'FULL_SERVICE', 'CAFE_BAR', 'DARK_KITCHEN']::vertical_tipo[],
   '{"ver_cola_cocina": true, "marcar_listo": true, "reportar_agotado": true}'::jsonb,
   true, true),

  (NULL, 'AYUDANTE_COCINA', 'Ayudante de cocina',
   'Ver cola de cocina, NO puede marcar como listo (solo cocinero principal).',
   ARRAY['QUICK_SERVICE', 'FOODTRUCK', 'FULL_SERVICE', 'CAFE_BAR']::vertical_tipo[],
   '{"ver_cola_cocina": true, "marcar_listo": false}'::jsonb,
   true, true),

  (NULL, 'MESERO', 'Mesero',
   'Captura comanda asociada a mesa, gestiona cuentas abiertas, marca propinas.',
   ARRAY['FULL_SERVICE', 'CAFE_BAR']::vertical_tipo[],
   '{"capturar_comanda_mesa": true, "gestionar_cuenta_abierta": true, "marcar_propina": true}'::jsonb,
   true, true),

  (NULL, 'BARISTA', 'Barista',
   'Cola de barra, gestión de cocteles/bebidas, captura cuenta de barra.',
   ARRAY['CAFE_BAR']::vertical_tipo[],
   '{"ver_cola_barra": true, "capturar_cuenta_barra": true}'::jsonb,
   true, true),

  (NULL, 'HOST', 'Host / Hostess',
   'Gestión de reservaciones, asignación de mesas, recibimiento.',
   ARRAY['FULL_SERVICE']::vertical_tipo[],
   '{"gestionar_reservaciones": true, "asignar_mesa": true}'::jsonb,
   true, true),

  (NULL, 'RUNNER', 'Runner / Entrega en mostrador',
   'Ve pedidos listos, marca entregados, lleva pedidos del mostrador a la mesa.',
   ARRAY['QUICK_SERVICE', 'FOODTRUCK', 'CAFE_BAR']::vertical_tipo[],
   '{"ver_pedidos_listos": true, "marcar_entregado": true}'::jsonb,
   true, true),

  (NULL, 'REPARTIDOR', 'Repartidor (delivery propio)',
   'Recibe asignación de pedidos, marca en ruta y entregado, captura cobro al recibir.',
   ARRAY['QUICK_SERVICE', 'FOODTRUCK', 'CAFE_BAR', 'FULL_SERVICE']::vertical_tipo[],
   '{"recibir_asignacion_delivery": true, "marcar_en_ruta": true, "marcar_entregado_domicilio": true, "capturar_cobro_recibir": true}'::jsonb,
   true, true),

  (NULL, 'ARMADOR_DK', 'Armador (Dark Kitchen)',
   'Confirma pedidos de apps, gestiona empaque multi-marca, marca listos por canal.',
   ARRAY['DARK_KITCHEN']::vertical_tipo[],
   '{"confirmar_pedido_app": true, "gestionar_empaque_multi_marca": true, "marcar_listo_canal": true}'::jsonb,
   true, true),

  (NULL, 'GENERAL', 'Personal general',
   'Solo asistencia, sin funciones operativas específicas.',
   ARRAY['QUICK_SERVICE', 'FOODTRUCK', 'FULL_SERVICE', 'CAFE_BAR', 'DARK_KITCHEN', 'ENTERPRISE']::vertical_tipo[],
   '{"asistencia": true}'::jsonb,
   true, true);

-- ============================================================================
-- §9.4 — Permisos (catálogo). Cada permiso es un código `categoria.accion`.
-- ============================================================================
INSERT INTO permisos (codigo, nombre, descripcion, categoria, permite_autorizacion_pin, jerarquia_minima_pin) VALUES
  -- Autenticación
  ('auth.login_pin',              'Iniciar sesión con PIN', NULL, 'AUTENTICACION', false, NULL),
  ('auth.asistencia_registrar',   'Registrar entrada/salida laboral', NULL, 'AUTENTICACION', false, NULL),

  -- Turno
  ('turno.abrir',                 'Abrir turno de caja', NULL, 'TURNO', false, NULL),
  ('turno.cerrar_propio',         'Cerrar turno propio', NULL, 'TURNO', false, NULL),
  ('turno.validar_con_diferencia', 'Validar corte con diferencia (desbloquear caja)', NULL, 'TURNO', false, NULL),
  ('turno.cambio_cajero',         'Cambio de cajero sin cierre', NULL, 'TURNO', false, NULL),
  ('turno.forzar_cierre',         'Forzar cierre de turno (admin)', NULL, 'TURNO', false, NULL),

  -- Caja / Movimientos
  ('caja.sangria',                'Hacer retiro / sangría', NULL, 'CAJA', true, 3),
  ('caja.deposito',               'Hacer depósito a caja', NULL, 'CAJA', true, 3),
  ('caja.ajuste_admin',           'Ajuste manual de efectivo (admin)', NULL, 'CAJA', true, 4),

  -- Venta
  ('venta.registrar',             'Registrar venta y cobrar', NULL, 'VENTA', false, NULL),
  ('venta.cancelar_abierta',      'Cancelar ticket abierto', NULL, 'VENTA', false, NULL),
  ('venta.cancelar_pagada',       'Cancelar ticket ya pagado', NULL, 'VENTA', true, 3),
  ('venta.devolucion',            'Procesar devolución', NULL, 'VENTA', true, 3),
  ('venta.editar_post_cobro',     'Editar pedido después de cobrar', NULL, 'VENTA', true, 3),

  -- Descuentos (§14.7)
  ('descuento.manual_aplicar',    'Aplicar descuento manual (cualquier monto o %)', NULL, 'DESCUENTO', true, 3),
  ('descuento.cortesia_total',    'Aplicar cortesía 100% manual', NULL, 'DESCUENTO', true, 3),
  ('descuento.automatico_aceptar', 'Aceptar descuento automático configurado', NULL, 'DESCUENTO', false, NULL),

  -- Cocina
  ('cocina.marcar_listo',         'Marcar pedido como listo', NULL, 'COCINA', false, NULL),
  ('cocina.marcar_entregado',     'Marcar pedido como entregado', NULL, 'COCINA', false, NULL),
  ('cocina.reimprimir_comanda',   'Reimprimir comanda', NULL, 'COCINA', true, 3),
  ('cocina.reimprimir_ticket',    'Reimprimir ticket', NULL, 'COCINA', false, NULL),

  -- Delivery
  ('delivery.asignar_pedido',     'Asignar/aceptar pedido de delivery propio', NULL, 'COCINA', false, NULL),

  -- Configuración
  ('config.productos',            'Configurar productos del catálogo', NULL, 'CONFIGURACION', false, NULL),
  ('config.usuarios',             'Gestionar usuarios y roles', NULL, 'CONFIGURACION', false, NULL),
  ('config.fiscal',               'Modificar configuración fiscal', NULL, 'CONFIGURACION', false, NULL),
  ('config.promociones',          'Configurar promociones automáticas', NULL, 'CONFIGURACION', false, NULL),
  ('config.sucursal',             'Configurar sucursal (override)', NULL, 'CONFIGURACION', false, NULL),

  -- Reportes
  ('reporte.turno_propio',        'Ver reporte del turno propio', NULL, 'REPORTE', false, NULL),
  ('reporte.sucursal',            'Ver reportes de la sucursal', NULL, 'REPORTE', false, NULL),
  ('reporte.global',              'Ver reportes globales del negocio', NULL, 'REPORTE', false, NULL),
  ('reporte.auditoria',           'Ver bitácora de auditoría', NULL, 'REPORTE', false, NULL),

  -- Facturación
  ('factura.emitir',              'Emitir factura CFDI', NULL, 'CONFIGURACION', false, NULL),
  ('factura.cancelar',            'Cancelar factura CFDI', NULL, 'CONFIGURACION', false, NULL),
  ('factura.global_masiva',       'Emitir facturación global / masiva', NULL, 'CONFIGURACION', false, NULL),

  -- Plan SaaS
  ('saas.cambiar_plan',           'Cancelar/contratar plan SaaS', NULL, 'CONFIGURACION', false, NULL);

-- ============================================================================
-- §9.5 — Matriz rol_permisos (§2.2). Referencia roles y permisos por código.
-- ============================================================================
DO $$
DECLARE
  v_rol_dueno      uuid;
  v_rol_admin      uuid;
  v_rol_supervisor uuid;
  v_rol_cajero     uuid;
  v_rol_personal   uuid;
BEGIN
  SELECT id INTO v_rol_dueno      FROM roles WHERE codigo = 'DUENO'      AND es_sistema = true;
  SELECT id INTO v_rol_admin      FROM roles WHERE codigo = 'ADMIN'      AND es_sistema = true;
  SELECT id INTO v_rol_supervisor FROM roles WHERE codigo = 'SUPERVISOR' AND es_sistema = true;
  SELECT id INTO v_rol_cajero     FROM roles WHERE codigo = 'CAJERO'     AND es_sistema = true;
  SELECT id INTO v_rol_personal   FROM roles WHERE codigo = 'PERSONAL'   AND es_sistema = true;

  -- Dueño y Admin: todos los permisos (auto-grant via función)
  INSERT INTO rol_permisos (rol_id, permiso_id, concedido)
  SELECT v_rol_dueno, p.id, true FROM permisos p;

  INSERT INTO rol_permisos (rol_id, permiso_id, concedido)
  SELECT v_rol_admin, p.id, true FROM permisos p
  WHERE p.codigo NOT IN ('config.fiscal', 'saas.cambiar_plan');

  -- Supervisor: subset según matriz §2.2
  INSERT INTO rol_permisos (rol_id, permiso_id, concedido)
  SELECT v_rol_supervisor, p.id, true FROM permisos p
  WHERE p.codigo IN (
    'auth.login_pin', 'auth.asistencia_registrar',
    'turno.abrir', 'turno.cerrar_propio', 'turno.cambio_cajero',
    'caja.sangria', 'caja.deposito',
    'venta.registrar', 'venta.cancelar_abierta', 'venta.cancelar_pagada', 'venta.devolucion', 'venta.editar_post_cobro',
    'descuento.manual_aplicar', 'descuento.cortesia_total', 'descuento.automatico_aceptar',
    'cocina.marcar_listo', 'cocina.marcar_entregado', 'cocina.reimprimir_comanda', 'cocina.reimprimir_ticket',
    'delivery.asignar_pedido',
    'reporte.turno_propio'
  );

  -- Cajero: ventas básicas, NO autoriza solo
  INSERT INTO rol_permisos (rol_id, permiso_id, concedido)
  SELECT v_rol_cajero, p.id, true FROM permisos p
  WHERE p.codigo IN (
    'auth.login_pin', 'auth.asistencia_registrar',
    'turno.abrir', 'turno.cerrar_propio',
    'venta.registrar', 'venta.cancelar_abierta',
    'descuento.automatico_aceptar',
    'cocina.marcar_listo', 'cocina.marcar_entregado', 'cocina.reimprimir_ticket',
    'delivery.asignar_pedido',
    'reporte.turno_propio'
  );

  -- Personal: lo mínimo
  INSERT INTO rol_permisos (rol_id, permiso_id, concedido)
  SELECT v_rol_personal, p.id, true FROM permisos p
  WHERE p.codigo IN (
    'auth.login_pin', 'auth.asistencia_registrar',
    'cocina.marcar_listo', 'cocina.marcar_entregado',
    'delivery.asignar_pedido'
  );
END $$;

-- ============================================================================
-- Tenant interno Knock-Out (1A §9.6 / doc 12 §7)
-- Tenant interno MVP: estado 'INTERNO', vertical 'QUICK_SERVICE', plan 'QS'.
-- El usuario DUEÑO se crea aparte vía Supabase Auth y se vincula con
-- usuarios_acceso; el alta real va por crear_tenant_con_owner (doc 12).
-- Bloque comentado: depende de las migraciones de tenants/sucursales/cajas/
-- configuracion_tenant (1A §3–§5), aún no aterrizadas.
-- ============================================================================
-- -- Knock-Out Burger como primer tenant (interno)
-- INSERT INTO tenants (
--   codigo, nombre_comercial, estado, vertical_principal,
--   hora_cierre_dia_contable, timezone
-- ) VALUES (
--   'knockout', 'Knock-Out Burger', 'INTERNO', 'QUICK_SERVICE',
--   '03:00:00', 'America/Mexico_City'
-- );
--
-- -- Sucursal León Centro (única sucursal MVP)
-- WITH t AS (SELECT id FROM tenants WHERE codigo = 'knockout')
-- INSERT INTO sucursales (tenant_id, codigo, nombre, ciudad, estado_geo, pais)
-- SELECT t.id, 'K', 'León Centro', 'León', 'Guanajuato', 'México' FROM t;
--
-- -- Caja 01 (única caja MVP)
-- WITH s AS (SELECT id, tenant_id FROM sucursales WHERE codigo = 'K')
-- INSERT INTO cajas (tenant_id, sucursal_id, numero, nombre)
-- SELECT s.tenant_id, s.id, 1, 'Caja 01' FROM s;
--
-- -- Configuración Knock-Out (decisiones operativas cerradas)
-- WITH t AS (SELECT id FROM tenants WHERE codigo = 'knockout')
-- INSERT INTO configuracion_tenant (
--   tenant_id,
--   modos_servicio_activos, modo_servicio_default,
--   fondo_modo_captura,
--   modulo_delivery_propio_activo
-- )
-- SELECT
--   t.id,
--   ARRAY['PARA_LLEVAR', 'COMER_AQUI', 'DOMICILIO_PROPIO']::text[],  -- mix 50/27/23
--   'PARA_LLEVAR',                                                    -- default Knock-Out
--   'DENOMINACION',
--   true                                                              -- delivery propio activo MVP
-- FROM t;

-- ============================================================================
-- 🧪 FIXTURE DE DESARROLLO (solo local) — para probar el esqueleto de auth.
--    Crea Knock-Out + 1 cajero (María, PIN 1234). UUID fijo para pruebas.
--    seed.sql corre solo en `supabase db reset` local; NO va a cloud.
--    BORRAR este bloque antes de usar el flujo real crear_tenant_con_owner.
-- ============================================================================
DO $$
DECLARE
  v_maria   uuid := '99999999-0000-0000-0000-000000000001';
  v_dueno   uuid := '99999999-0000-0000-0000-0000000000e1';  -- DUEÑO (admin web)
  v_disp    uuid := '99999999-0000-0000-0000-0000000000d1';  -- cuenta de dispositivo (caja)
  v_tenant  uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc     uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja    uuid := '99999999-0000-0000-0000-0000000000cc';
  v_disp_email text := 'caja-99999999-0000-0000-0000-0000000000cc@dispositivos.vimpos.mx';

  -- ⚠️ FIXTURE LOCAL DEV — passwords leídas de variables de sesión Postgres.
  -- Defaults inocuos para evitar que GitHub Secret Scanning marque el archivo.
  -- Para customizar: psql -c "ALTER DATABASE postgres SET vim.dev_password = 'lo_que_sea'"
  -- O exportar PGOPTIONS antes de db reset.
  v_dev_password text := COALESCE(current_setting('vim.dev_password', true), 'change_me_local_dev_only');
BEGIN
  -- Usuario de auth (local dev). Si ya existe, no repetir.
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  VALUES ('00000000-0000-0000-0000-000000000000', v_maria, 'authenticated', 'authenticated',
          'maria@knockout.dev', crypt(v_dev_password, gen_salt('bf')),
          now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal, plan_actual_id)
  VALUES (v_tenant, 'knockout-dev', 'Knock-Out Burger', 'INTERNO', 'QUICK_SERVICE',
          (SELECT id FROM planes WHERE codigo = 'QS'));

  INSERT INTO sucursales (id, tenant_id, codigo, nombre)
  VALUES (v_suc, v_tenant, 'KC', 'León Centro');

  INSERT INTO cajas (id, tenant_id, sucursal_id, numero, nombre)
  VALUES (v_caja, v_tenant, v_suc, 1, 'Caja 01');

  INSERT INTO usuarios_perfil (id, nombre, pin_hash, estado)
  VALUES (v_maria, 'María G.', crypt('1234', gen_salt('bf')), 'ACTIVO');

  INSERT INTO usuarios_acceso (usuario_id, tenant_id, sucursal_id, rol_id)
  VALUES (v_maria, v_tenant, v_suc,
          (SELECT id FROM roles WHERE codigo = 'CAJERO' AND es_sistema = true));

  INSERT INTO tenant_folios_saldo (tenant_id, folios_base_mensuales, folios_base_consumidos,
                                   periodo_actual, saldo_paquetes)
  VALUES (v_tenant, 50, 0, date_trunc('month', now())::date, 0);

  -- ── Cuenta de dispositivo de la Caja 01 (Parte 1F §1.1 / §2.1) ──────────────
  -- Email sintético derivado del caja_id; password de DEV (en prod se provisiona
  -- en setup, doc 10). Rol DISPOSITIVO, sin PIN. Sostiene la sesión base antes
  -- del PIN del empleado y porta tenant_id en su JWT vía el Custom Access Token Hook.
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  VALUES ('00000000-0000-0000-0000-000000000000', v_disp, 'authenticated', 'authenticated',
          v_disp_email, crypt(v_dev_password, gen_salt('bf')),
          now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO usuarios_perfil (id, nombre, estado)
  VALUES (v_disp, 'Caja 01', 'ACTIVO');

  INSERT INTO usuarios_acceso (usuario_id, tenant_id, sucursal_id, rol_id)
  VALUES (v_disp, v_tenant, v_suc,
          (SELECT id FROM roles WHERE codigo = 'DISPOSITIVO' AND es_sistema = true));

  -- ── DUEÑO / admin web (F4) ──────────────────────────────────────────────────
  -- Login web por GoTrue (email/password). El hook le pone tipo_identidad='ADMIN_WEB'
  -- (rol DUENO). Acceso tenant-wide (sucursal_id NULL = todas las sucursales).
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  VALUES ('00000000-0000-0000-0000-000000000000', v_dueno, 'authenticated', 'authenticated',
          'dueno@knockout.dev', crypt(v_dev_password, gen_salt('bf')),
          now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO usuarios_perfil (id, nombre, estado)
  VALUES (v_dueno, 'Dueño Knock-Out', 'ACTIVO');

  INSERT INTO usuarios_acceso (usuario_id, tenant_id, sucursal_id, rol_id)
  VALUES (v_dueno, v_tenant, NULL,
          (SELECT id FROM roles WHERE codigo = 'DUENO' AND es_sistema = true));

  -- GoTrue escanea estas columnas de auth.users como string NO-nullable; al insertar
  -- a mano quedan en NULL y el grant de password revienta con "Database error querying
  -- schema". Normalizar a '' para que el login de dispositivo y el admin web corran.
  UPDATE auth.users
     SET confirmation_token = '', recovery_token = '', email_change = '',
         email_change_token_new = '', email_change_token_current = '',
         phone_change = '', phone_change_token = '', reauthentication_token = ''
   WHERE id IN (v_maria, v_disp, v_dueno);

  RAISE NOTICE 'FIXTURE DEV aplicado. María (PIN 1234) · dispositivo % · dueño dueno@knockout.dev. Password de auth (María/dispositivo/dueño): vim.dev_password (default: change_me_local_dev_only).', v_disp_email;
END $$;
