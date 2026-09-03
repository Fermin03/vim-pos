-- ============================================================================
-- Pedidos de apps expirados (migración 0093, spec A6): la función marca solo los RECIBIDOS
-- vencidos, deja evento y aviso, y la vista de expirados de hoy respeta el RLS del tenant.
-- Se corre con:  supabase test db
-- ============================================================================
begin;
select plan(8);

select has_function('delivery_marcar_expirados');
select has_view('vw_delivery_expirados_hoy');

insert into tenants (id, codigo, nombre_comercial, vertical_principal)
values ('dddddddd-0000-0000-0000-00000000000d', 'exp-d', 'Tenant D', 'QUICK_SERVICE') on conflict (id) do nothing;
insert into sucursales (id, tenant_id, codigo, nombre)
values ('dddddddd-0000-0000-0000-0000000000d1', 'dddddddd-0000-0000-0000-00000000000d', 'D1', 'Suc D') on conflict (id) do nothing;
insert into delivery_conexiones (id, tenant_id, sucursal_id, app, estado, tienda_id_externo)
values ('dddddddd-0000-0000-0000-0000000000c1', 'dddddddd-0000-0000-0000-00000000000d', 'dddddddd-0000-0000-0000-0000000000d1', 'APP_UBEREATS', 'ACTIVA', 'store-d');
insert into delivery_pedidos (id, tenant_id, sucursal_id, conexion_id, app, id_externo, estado, vence_aceptacion, recibido_at) values
  ('dddddddd-0000-0000-0000-0000000000a1', 'dddddddd-0000-0000-0000-00000000000d', 'dddddddd-0000-0000-0000-0000000000d1', 'dddddddd-0000-0000-0000-0000000000c1', 'APP_UBEREATS', 'u-vencido',  'RECIBIDO', now() - interval '1 minute',  now() - interval '12 minutes'),
  ('dddddddd-0000-0000-0000-0000000000a2', 'dddddddd-0000-0000-0000-00000000000d', 'dddddddd-0000-0000-0000-0000000000d1', 'dddddddd-0000-0000-0000-0000000000c1', 'APP_UBEREATS', 'u-vigente',  'RECIBIDO', now() + interval '5 minutes', now()),
  ('dddddddd-0000-0000-0000-0000000000a3', 'dddddddd-0000-0000-0000-00000000000d', 'dddddddd-0000-0000-0000-0000000000d1', 'dddddddd-0000-0000-0000-0000000000c1', 'APP_UBEREATS', 'u-aceptado', 'ACEPTADO', now() - interval '1 minute',  now() - interval '12 minutes');

select is(delivery_marcar_expirados(), 1, 'marca exactamente el pedido vencido');
select results_eq(
  $$ select id_externo from delivery_pedidos where estado = 'EXPIRADO' and tenant_id = 'dddddddd-0000-0000-0000-00000000000d' $$,
  $$ values ('u-vencido'::text) $$,
  'el vigente y el aceptado no se tocan');
select results_eq(
  $$ select count(*)::int from delivery_eventos where tipo = 'expirado' and id_externo = 'u-vencido' $$,
  $$ values (1) $$,
  'deja evento de expiración');
select results_eq(
  $$ select ultimo_error from delivery_conexiones where id = 'dddddddd-0000-0000-0000-0000000000c1' $$,
  $$ values ('Pedidos expirados sin aceptar: revisar la caja'::text) $$,
  'avisa en la conexión');
select results_eq(
  $$ select n_expirados from vw_delivery_expirados_hoy where sucursal_id = 'dddddddd-0000-0000-0000-0000000000d1' $$,
  $$ values (1) $$,
  'la vista cuenta el expirado de hoy');

-- Otro tenant, por la vista, no ve nada (RLS heredado con security_invoker).
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '99999999-0000-0000-0000-000000000001',
                    'tenant_id', 'aaaaaaaa-0000-0000-0000-00000000000a',
                    'role', 'authenticated')::text, true);
select is_empty(
  $$ select * from vw_delivery_expirados_hoy where sucursal_id = 'dddddddd-0000-0000-0000-0000000000d1' $$,
  'otro tenant no ve los expirados por la vista');

select * from finish();
rollback;
