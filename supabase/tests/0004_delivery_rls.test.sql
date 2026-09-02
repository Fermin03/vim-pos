-- ============================================================================
-- RLS de las tablas de delivery por apps (migración 0090, ADR 0011).
-- Dos tenants: cada uno ve solo sus conexiones, no puede insertar en el otro, y
-- `delivery_credenciales_app` (token de la aplicación de VIM) es deny-all para authenticated.
-- Se corre con:  supabase test db
-- ============================================================================
begin;
select plan(8);

select has_table('delivery_conexiones');
select has_table('delivery_pedidos');
select has_table('delivery_eventos');
select has_table('delivery_credenciales_app');

-- Fixture: dos tenants con una sucursal cada uno.
insert into tenants (id, codigo, nombre_comercial, vertical_principal)
values ('aaaaaaaa-0000-0000-0000-00000000000a', 'rls-delivery-a', 'Tenant A', 'QUICK_SERVICE'),
       ('bbbbbbbb-0000-0000-0000-00000000000b', 'rls-delivery-b', 'Tenant B', 'QUICK_SERVICE')
on conflict (id) do nothing;
insert into sucursales (id, tenant_id, codigo, nombre)
values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'A1', 'Suc A'),
       ('bbbbbbbb-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-00000000000b', 'B1', 'Suc B')
on conflict (id) do nothing;

insert into delivery_conexiones (tenant_id, sucursal_id, app, estado, tienda_id_externo)
values ('aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'APP_UBEREATS', 'ACTIVA', 'store-a'),
       ('bbbbbbbb-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-0000000000b1', 'APP_UBEREATS', 'ACTIVA', 'store-b');

-- Simular un JWT `authenticated` del tenant A.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '99999999-0000-0000-0000-000000000001',
                    'tenant_id', 'aaaaaaaa-0000-0000-0000-00000000000a',
                    'role', 'authenticated')::text, true);

select results_eq(
  $$ select tienda_id_externo from delivery_conexiones order by 1 $$,
  $$ values ('store-a') $$,
  'Tenant A solo ve su conexión');

-- throws_ok(sql, errcode, errmsg, descripción): el mensaje va NULL para aceptar cualquiera.
select throws_ok(
  $$ insert into delivery_conexiones (tenant_id, sucursal_id, app, estado, tienda_id_externo)
     values ('bbbbbbbb-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-0000000000b1', 'APP_UBEREATS', 'ACTIVA', 'x') $$,
  '42501', NULL,
  'Tenant A no puede insertar una conexión del tenant B');

select throws_ok(
  $$ select 1 from delivery_credenciales_app $$,
  '42501', NULL,
  'authenticated no lee credenciales de aplicación (sin GRANT)');

select throws_ok(
  $$ insert into delivery_credenciales_app (app, entorno, access_token, vence_at) values ('APP_UBEREATS','sandbox','t', now()) $$,
  '42501', NULL,
  'authenticated no escribe credenciales de aplicación');

select * from finish();
rollback;
