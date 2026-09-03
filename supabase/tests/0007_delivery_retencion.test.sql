-- ============================================================================
-- Retención de datos personales de pedidos de apps (migración 0095, DPA Uber 1.5 / C4):
-- a los 30 días se anonimiza el cliente y se descarta el payload; los importes e ítems quedan.
-- Se corre con:  supabase test db
-- ============================================================================
begin;
select plan(6);

select has_function('delivery_anonimizar_pedidos_viejos');

insert into tenants (id, codigo, nombre_comercial, vertical_principal)
values ('eeeeeeee-0000-0000-0000-00000000000e', 'ret-e', 'Tenant E', 'QUICK_SERVICE') on conflict (id) do nothing;
insert into sucursales (id, tenant_id, codigo, nombre)
values ('eeeeeeee-0000-0000-0000-0000000000e1', 'eeeeeeee-0000-0000-0000-00000000000e', 'E1', 'Suc E') on conflict (id) do nothing;
insert into delivery_conexiones (id, tenant_id, sucursal_id, app, estado, tienda_id_externo)
values ('eeeeeeee-0000-0000-0000-0000000000c1', 'eeeeeeee-0000-0000-0000-00000000000e', 'eeeeeeee-0000-0000-0000-0000000000e1', 'APP_UBEREATS', 'ACTIVA', 'store-e');
insert into delivery_pedidos (id, tenant_id, sucursal_id, conexion_id, app, id_externo, estado, cliente_nombre, cliente_telefono, cliente_telefono_pin, direccion_texto, payload_raw, total_cliente_mxn, recibido_at) values
  ('eeeeeeee-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-00000000000e', 'eeeeeeee-0000-0000-0000-0000000000e1', 'eeeeeeee-0000-0000-0000-0000000000c1', 'APP_UBEREATS', 'u-viejo',   'ENTREGADO', 'Ana L.', '+52 477 000 0000', '1234', 'Calle 1', '{"x":1}'::jsonb, 250.00, now() - interval '31 days'),
  ('eeeeeeee-0000-0000-0000-0000000000a2', 'eeeeeeee-0000-0000-0000-00000000000e', 'eeeeeeee-0000-0000-0000-0000000000e1', 'eeeeeeee-0000-0000-0000-0000000000c1', 'APP_UBEREATS', 'u-reciente','ENTREGADO', 'Beto M.', '+52 477 111 1111', '5678', 'Calle 2', '{"x":2}'::jsonb, 120.00, now() - interval '2 days'),
  ('eeeeeeee-0000-0000-0000-0000000000a3', 'eeeeeeee-0000-0000-0000-00000000000e', 'eeeeeeee-0000-0000-0000-0000000000e1', 'eeeeeeee-0000-0000-0000-0000000000c1', 'APP_UBEREATS', 'u-activo',  'ACEPTADO',  'Caro R.', '+52 477 222 2222', '9999', 'Calle 3', '{"x":3}'::jsonb, 99.00,  now() - interval '40 days');

select is(delivery_anonimizar_pedidos_viejos(30), 1, 'anonimiza solo el pedido cerrado de más de 30 días');
select results_eq(
  $$ select cliente_nombre::text, cliente_telefono::text, cliente_telefono_pin::text, direccion_texto::text, payload_raw::text from delivery_pedidos where id_externo = 'u-viejo' $$,
  $$ values ('Cliente de app'::text, null::text, null::text, null::text, '{"anonimizado": true}'::text) $$,
  'el viejo queda sin datos personales (payload_raw es NOT NULL: queda el marcador)');
select results_eq(
  $$ select total_cliente_mxn::text from delivery_pedidos where id_externo = 'u-viejo' $$,
  $$ values ('250.00'::text) $$,
  'los importes se conservan');
select results_eq(
  $$ select cliente_telefono::text from delivery_pedidos where id_externo = 'u-reciente' $$,
  $$ values ('+52 477 111 1111'::text) $$,
  'el reciente no se toca');
select results_eq(
  $$ select cliente_telefono::text from delivery_pedidos where id_externo = 'u-activo' $$,
  $$ values ('+52 477 222 2222'::text) $$,
  'un pedido aún activo no se anonimiza aunque sea viejo');

select * from finish();
rollback;
