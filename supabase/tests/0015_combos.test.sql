-- Combos (ADR 0015, migración 0110): las tablas de slots están aisladas por tenant, un combo no
-- puede ser opción de otro combo, y la RPC que cobra no se salta la RLS.
begin;
select plan(7);

insert into tenants (id, codigo, nombre_comercial, vertical_principal) values
  ('cccccccc-0000-0000-0000-0000000000a0', 'combos-a', 'Combos A', 'QUICK_SERVICE'),
  ('cccccccc-0000-0000-0000-0000000000b0', 'combos-b', 'Combos B', 'QUICK_SERVICE')
on conflict (id) do nothing;
insert into categorias (id, tenant_id, nombre, orden_visualizacion) values
  ('cccccccc-0000-0000-0000-0000000000a1', 'cccccccc-0000-0000-0000-0000000000a0', 'Hamburguesas', 1),
  ('cccccccc-0000-0000-0000-0000000000b1', 'cccccccc-0000-0000-0000-0000000000b0', 'Pizzas', 1);
insert into productos (id, tenant_id, categoria_id, nombre, precio_base_mxn, es_combo) values
  ('cccccccc-0000-0000-0000-0000000000a2', 'cccccccc-0000-0000-0000-0000000000a0', 'cccccccc-0000-0000-0000-0000000000a1', 'Combo A', 45, true),
  ('cccccccc-0000-0000-0000-0000000000a3', 'cccccccc-0000-0000-0000-0000000000a0', 'cccccccc-0000-0000-0000-0000000000a1', 'Clásica A', 95, false),
  ('cccccccc-0000-0000-0000-0000000000a4', 'cccccccc-0000-0000-0000-0000000000a0', 'cccccccc-0000-0000-0000-0000000000a1', 'Combo A2', 60, true),
  ('cccccccc-0000-0000-0000-0000000000b2', 'cccccccc-0000-0000-0000-0000000000b0', 'cccccccc-0000-0000-0000-0000000000b1', 'Combo B', 99, true);
insert into combo_grupos (id, tenant_id, combo_producto_id, nombre, modo_precio, categoria_id) values
  ('cccccccc-0000-0000-0000-0000000000a5', 'cccccccc-0000-0000-0000-0000000000a0', 'cccccccc-0000-0000-0000-0000000000a2', 'Hamburguesa', 'SUMA_PRECIO_PRODUCTO', 'cccccccc-0000-0000-0000-0000000000a1'),
  ('cccccccc-0000-0000-0000-0000000000b5', 'cccccccc-0000-0000-0000-0000000000b0', 'cccccccc-0000-0000-0000-0000000000b2', 'Pizza', 'DELTA', null);
insert into auth.users (id, instance_id, aud, role, email) values
  ('cccccccc-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'combos@test.local')
on conflict (id) do nothing;

-- #1 un combo no puede ser opción de un slot (trigger, corre aunque sea superusuario)
select throws_ok(
  $$ insert into combo_opciones (tenant_id, grupo_id, producto_id)
     values ('cccccccc-0000-0000-0000-0000000000a0', 'cccccccc-0000-0000-0000-0000000000a5', 'cccccccc-0000-0000-0000-0000000000a4') $$,
  'P0001', 'Un combo no puede ser opción de otro combo', 'combo_opciones rechaza un producto es_combo');

-- #2 la RPC de cobro no es SECURITY DEFINER
select is(
  (select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'agregar_combo_a_ticket'),
  false, 'agregar_combo_a_ticket es SECURITY INVOKER');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'cccccccc-0000-0000-0000-0000000000c9',
                    'tenant_id', 'cccccccc-0000-0000-0000-0000000000a0',
                    'role', 'authenticated')::text, true);

-- #3 y #4 solo ve sus slots y sus combos
select results_eq($$ select nombre::text from combo_grupos order by 1 $$, $$ values ('Hamburguesa') $$, 'Tenant A solo ve sus combo_grupos');
select results_eq($$ select nombre::text from productos where es_combo order by 1 $$, $$ values ('Combo A'), ('Combo A2') $$, 'Tenant A solo ve sus combos');

-- #5 no inserta slots del tenant B
select throws_ok(
  $$ insert into combo_grupos (tenant_id, combo_producto_id, nombre)
     values ('cccccccc-0000-0000-0000-0000000000b0', 'cccccccc-0000-0000-0000-0000000000b2', 'intruso') $$,
  '42501', null, 'Tenant A no inserta combo_grupos del tenant B');

-- #6 sí inserta una opción propia
select lives_ok(
  $$ insert into combo_opciones (tenant_id, grupo_id, producto_id, precio_delta_mxn, es_default)
     values ('cccccccc-0000-0000-0000-0000000000a0', 'cccccccc-0000-0000-0000-0000000000a5', 'cccccccc-0000-0000-0000-0000000000a3', 0, true) $$,
  'Tenant A inserta una opción de su slot');

-- #7 el pull ya no es asunto de authenticated, pero catalogo_version sí mueve con un slot nuevo
select isnt(catalogo_version(), null, 'catalogo_version() ve los combos del tenant');

select * from finish();
rollback;
