-- ============================================================================
-- Test de PRIVILEGIOS sobre funciones SECURITY DEFINER (SEC CN-002).
--
-- El caso real que atrapa: la migración 0045 recorrió con un bucle TODAS las funciones
-- SECURITY DEFINER de `public` y les hizo `GRANT EXECUTE ... TO authenticated`. La intención
-- era sacar a `anon`; el efecto colateral fue deshacer los `REVOKE ... FROM authenticated` que
-- 0006/0012/0014/0018 habían puesto a propósito. Nadie lo notó durante 18 migraciones porque
-- ninguna prueba miraba los privilegios — solo el comportamiento con service_role.
--
-- Estas funciones NO validan al llamante por dentro (o solo parcialmente): el GRANT ES el
-- control. Un empleado con su JWT normal podía llamar resetear_pin_empleado contra el uuid del
-- dueño —de su tenant o de otro— y quedarse con la cuenta.
--
-- Corregido en 0063. Este test evita la reincidencia: si alguien vuelve a otorgar en masa,
-- el job `rls-tests` del CI lo bloquea antes del merge.
--
-- Se corre con:  supabase test db
-- ============================================================================
begin;
select plan(4);

-- #1 — pgTAP cargado.
select has_extension('pgtap');

-- Funciones que SOLO puede ejecutar service_role (Edge Functions server-side).
-- Al añadir una nueva RPC exclusiva de service_role, agrégala aquí.
create temporary table _secdef_solo_service (fn text, motivo text) on commit drop;
insert into _secdef_solo_service (fn, motivo) values
  ('resetear_pin_empleado',      'cambia el pin_hash de cualquier usuario, sin chequeo de tenant en el GRANT'),
  ('crear_perfil_con_pin',       'crea perfil con PIN elegido por el llamante'),
  ('crear_tenant_con_owner',     'da de alta tenants y su dueño'),
  ('alta_autoservicio',          'da de alta tenants del registro público y sella los términos (0142)'),
  ('verificar_pin_login',        'permite fuerza bruta de PIN y bloqueo (DoS) de empleados'),
  ('verificar_autorizacion_pin', 'permite fuerza bruta del PIN de un supervisor'),
  ('sync_pull_snapshot',         'devuelve el snapshot del tenant, incluidos pin_hash y auth.users'),
  ('sync_push_snapshot',         'escribe verbatim la rebanada operativa, sin disparar triggers'),
  ('registrar_pago_suscripcion', 'marca como pagado a cualquier negocio y le recorre la fecha de cobro (0130)'),
  ('activar_suscripcion',        'crea/expira suscripciones de cualquier negocio (0137, promoción en 0141)'),
  ('cambiar_plan_tenant',        'cambia plan, folios, add-ons y precio de cualquier negocio (0141)'),
  ('_sincronizar_addons_del_plan', 'concede o retira add-ons a $0 de cualquier negocio (0141)'),
  ('consumir_folio_cfdi',        'descuenta folios CFDI de cualquier negocio; solo lo usan las Edge Functions (0135)'),
  ('cfdi_marcar_timbrado',       'marca un ticket como facturado sin timbre real (0135)'),
  ('consumir_cupo',              'contador de límites de tasa de las funciones públicas (0136)'),
  ('eliminar_tenant',            'borra por completo a cualquier negocio cancelado, con sus cuentas (0144)'),
  ('eliminar_tenant_vista_previa', 'cuenta las filas y las cuentas de cualquier negocio (0144)'),
  ('anular_pago_suscripcion',    'anula el pago de cualquier negocio y lo deja con cobro vencido (0130)'),
  ('reclamar_bienvenida',        'marca como enviado el correo de bienvenida de cualquier negocio (0146)'),
  ('liberar_bienvenida',         'borra esa marca y permitiría reenviar el correo a discreción (0146)'),
  ('fijar_extra_tenant',         'amplía o reduce sucursales y cajas contratadas de cualquier negocio (0147)'),
  ('_extras_vigentes',           'lee los extras contratados de cualquier negocio (0147)'),
  ('_retirar_extras_sin_limite', 'cierra extras contratados de cualquier negocio (0147)'),
  ('_cajas_excedente',           'cuenta las cajas abiertas de cualquier negocio (0147)'),
  ('_inventario_apagar_si_no_permitido', 'apaga el descuento de inventario de cualquier negocio (0148)'),
  ('inventario_respetar_uso_previo', 'concede el módulo de inventario por excepción a negocios enteros (0148)'),
  ('lealtad_registrar_movimiento',  'escribe el libro y el saldo de lealtad de cualquier cliente (0156)'),
  ('lealtad_acumular_por_ticket',   'otorga puntos; solo la dispara el trigger de tickets (0156)'),
  ('lealtad_revertir_ganado_ticket','quita puntos; solo la disparan los triggers (0156)'),
  ('lealtad_saldo',                 'lee el saldo de cualquier cliente de cualquier negocio (0156)'),
  ('lealtad_canjear',               'descuenta saldo de lealtad; solo la Edge Function lealtad-canje (0156)'),
  ('lealtad_canje_datos',           'lee un canje de cualquier negocio (0156)'),
  ('lealtad_asentar_canje',         'pega un descuento a un ticket; solo el puente o la Edge Function (0156)'),
  ('lealtad_revertir_canje_ticket', 'devuelve saldo; el POS usa quitar_canje_lealtad (0156)'),
  ('lealtad_revertir_canje',        'devuelve saldo sin ticket; solo la red de seguridad (0156)'),
  ('lealtad_resolver_cliente',      'busca clientes por teléfono sin RLS (0156)'),
  ('lealtad_proceso_diario',        'vence saldos y revierte canjes de todos los negocios (0156)'),
  ('lealtad_vence_el',              'lee los meses de vencimiento de cualquier negocio; solo la llaman funciones definer (0156)'),
  ('tienda_horario_abierto',        'pieza de la tienda en línea; solo la Edge Function tienda (0162)'),
  ('tienda_estado_sucursal',        'dice si una sucursal de cualquier negocio recibe pedidos (0162)'),
  ('tienda_negocio',                'resuelve cualquier negocio por la dirección de su tienda (0162, 0163)'),
  ('tienda_menu',                   'lee el menú de cualquier negocio sin RLS (0162, 0165, 0168)'),
  ('tienda_cotizar',                'cotiza contra el catálogo de cualquier negocio sin RLS (0162)'),
  ('tienda_crear_pedido',           'crea pedidos en cualquier negocio; la frontera con el público (0162, 0167)'),
  ('tienda_seguimiento',            'lee un pedido de cualquier negocio por la huella de su enlace (0162, 0166)'),
  ('tienda_reportar_estado',        'mueve el estado de un pedido de la tienda de cualquier negocio (0164, 0167)'),
  ('tienda_encender_complemento',   'activa el complemento TIENDA y lo concede a $0 a todos los negocios cuyo plan lo incluye (0167)'),
  ('tienda_sincronizar_estados_nube', 'mueve estados de pedidos de todos los negocios; solo el cron (0164)'),
  ('tienda_cuenta_registrar',       'crea cuentas de clientes en cualquier negocio y les abre sesión (0166)'),
  ('tienda_cuenta_entrar',          'permite fuerza bruta de contraseñas y bloqueo (DoS) de cuentas de clientes (0166)'),
  ('tienda_sesion_cuenta',          'cambia una huella de sesión por el id de la cuenta (0166)'),
  ('tienda_cuenta_salir',           'cierra sesiones de clientes de cualquier negocio (0166)'),
  ('tienda_recuperar_pedir',        'crea enlaces de recuperación y dice si un correo tiene cuenta (0166)'),
  ('tienda_recuperar_aplicar',      'cambia la contraseña de una cuenta de cliente y le abre sesión (0166)'),
  ('tienda_cuenta_leer',            'lee los datos y las direcciones de cualquier cuenta de cliente (0166)'),
  ('tienda_cuenta_guardar',         'cambia los datos de cualquier cuenta de cliente (0166)'),
  ('tienda_cuenta_password',        'cambia la contraseña de una cuenta de cliente; el llamante no se valida (0166)'),
  ('tienda_direccion_guardar',      'escribe direcciones en cualquier cuenta de cliente (0166)'),
  ('tienda_direccion_borrar',       'borra direcciones de cualquier cuenta de cliente (0166)'),
  ('tienda_mis_pedidos',            'lee los pedidos de cualquier cuenta de cliente (0166)'),
  ('tienda_cuenta_eliminar',        'borra cuentas de clientes y desliga sus pedidos (0166)'),
  ('_tienda_password_ok',           'compara contraseñas y mueve el contador de bloqueo; solo la llaman funciones definer (0166)'),
  ('_tienda_abrir_sesion',          'abre una sesión para cualquier cuenta de cliente; solo la llaman funciones definer (0166)'),
  ('_tienda_direcciones',           'lee las direcciones de cualquier cuenta de cliente; solo la llaman funciones definer (0166)'),
  ('_tienda_estado_real',           'lee el ticket de un pedido sin RLS; solo la llaman funciones definer (0166)');

-- #2 — CRÍTICA: ninguna de ellas es ejecutable por `authenticated`.
select is_empty($$
  select p.oid::regprocedure::text as ejecutable_por_authenticated
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join _secdef_solo_service s on s.fn = p.proname
  where n.nspname = 'public'
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  order by 1
$$, 'Ninguna RPC exclusiva de service_role es ejecutable por authenticated (SEC CN-002)');

-- #3 — CRÍTICA: tampoco por `anon`.
select is_empty($$
  select p.oid::regprocedure::text as ejecutable_por_anon
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join _secdef_solo_service s on s.fn = p.proname
  where n.nspname = 'public'
    and has_function_privilege('anon', p.oid, 'EXECUTE')
  order by 1
$$, 'Ninguna RPC exclusiva de service_role es ejecutable por anon (SEC CN-002)');

-- #4 — La lista de arriba no se quedó obsoleta: todas existen de verdad en el esquema.
-- Sin esto, renombrar una función la sacaría del test en silencio y la dejaría sin cobertura.
select is_empty($$
  select s.fn as en_la_lista_pero_no_existe_en_el_esquema
  from _secdef_solo_service s
  where not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = s.fn
  )
  order by 1
$$, 'Toda función listada existe en el esquema (la lista no quedó obsoleta)');

select * from finish();
rollback;
