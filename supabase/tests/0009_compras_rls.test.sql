-- RLS cross-tenant de proveedores, compras, compra_lineas y proveedor_insumo_alias (ADR 0012).
begin;
select plan(6);

insert into tenants (id, codigo, nombre_comercial, vertical_principal)
values ('aaaaaaaa-0000-0000-0000-0000000000c0', 'rls-compras-a', 'Tenant A', 'QUICK_SERVICE'),
       ('bbbbbbbb-0000-0000-0000-0000000000c0', 'rls-compras-b', 'Tenant B', 'QUICK_SERVICE')
on conflict (id) do nothing;
insert into sucursales (id, tenant_id, codigo, nombre)
values ('aaaaaaaa-0000-0000-0000-0000000000c1', 'aaaaaaaa-0000-0000-0000-0000000000c0', 'CA', 'Suc A'),
       ('bbbbbbbb-0000-0000-0000-0000000000c1', 'bbbbbbbb-0000-0000-0000-0000000000c0', 'CB', 'Suc B')
on conflict (id) do nothing;
insert into proveedores (id, tenant_id, nombre)
values ('aaaaaaaa-0000-0000-0000-0000000000c2', 'aaaaaaaa-0000-0000-0000-0000000000c0', 'Prov A'),
       ('bbbbbbbb-0000-0000-0000-0000000000c2', 'bbbbbbbb-0000-0000-0000-0000000000c0', 'Prov B');
insert into auth.users (id, instance_id, aud, role, email)
values ('99999999-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-compras@test.local')
on conflict (id) do nothing;
insert into compras (tenant_id, sucursal_id, proveedor_id, fecha, subtotal_mxn, iva_mxn, total_mxn, usuario_id, dia_contable)
values ('aaaaaaaa-0000-0000-0000-0000000000c0', 'aaaaaaaa-0000-0000-0000-0000000000c1', 'aaaaaaaa-0000-0000-0000-0000000000c2', '2026-09-03', 100, 16, 116, '99999999-0000-0000-0000-0000000000c9', '2026-09-03'),
       ('bbbbbbbb-0000-0000-0000-0000000000c0', 'bbbbbbbb-0000-0000-0000-0000000000c1', 'bbbbbbbb-0000-0000-0000-0000000000c2', '2026-09-03', 200, 32, 232, '99999999-0000-0000-0000-0000000000c9', '2026-09-03');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '99999999-0000-0000-0000-0000000000c9',
                    'tenant_id', 'aaaaaaaa-0000-0000-0000-0000000000c0',
                    'role', 'authenticated')::text, true);

select results_eq($$ select nombre::text from proveedores order by 1 $$, $$ values ('Prov A') $$, 'Tenant A solo ve sus proveedores');
select results_eq($$ select subtotal_mxn::int from compras $$, $$ values (100) $$, 'Tenant A solo ve sus compras');
select throws_ok(
  $$ insert into proveedores (tenant_id, nombre) values ('bbbbbbbb-0000-0000-0000-0000000000c0', 'intruso') $$,
  '42501', NULL, 'Tenant A no inserta proveedores del tenant B');
-- El trigger BEFORE INSERT (folio) llama a generar_folio(), que hace SELECT sobre sucursales
-- bajo RLS: como el tenant A no ve la sucursal del tenant B, revienta antes con P0001 (no
-- llega a evaluarse el WITH CHECK de compras, que daría 42501). Sigue probando el aislamiento.
select throws_ok(
  $$ insert into compras (tenant_id, sucursal_id, proveedor_id, fecha, subtotal_mxn, iva_mxn, total_mxn, usuario_id, dia_contable)
     values ('bbbbbbbb-0000-0000-0000-0000000000c0', 'bbbbbbbb-0000-0000-0000-0000000000c1', 'bbbbbbbb-0000-0000-0000-0000000000c2', '2026-09-03', 1, 0, 1, '99999999-0000-0000-0000-0000000000c9', '2026-09-03') $$,
  'P0001', 'Sucursal bbbbbbbb-0000-0000-0000-0000000000c1 no existe o está eliminada', 'Tenant A no inserta compras del tenant B');
select is((select count(*)::int from compras), 1, 'La compra del tenant B no se insertó; tenant A sigue viendo solo la suya');
select is((select count(*)::int from proveedor_insumo_alias), 0, 'Alias vacío y legible por el tenant');

select * from finish();
rollback;
