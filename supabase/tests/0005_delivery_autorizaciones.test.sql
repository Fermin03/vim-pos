-- ============================================================================
-- Token temporal del dueño para activar tiendas de apps (migración 0092, spec F1b).
-- Deny-all para authenticated: ni siquiera su propio tenant lo lee. Solo service_role.
-- Se corre con:  supabase test db
-- ============================================================================
begin;
select plan(4);

select has_table('delivery_autorizaciones');

insert into tenants (id, codigo, nombre_comercial, vertical_principal)
values ('cccccccc-0000-0000-0000-00000000000c', 'rls-autoriz-c', 'Tenant C', 'QUICK_SERVICE')
on conflict (id) do nothing;

-- Como service_role (postgres) sí se escribe y se lee.
insert into delivery_autorizaciones (tenant_id, app, entorno, access_token, vence_at, creado_por)
values ('cccccccc-0000-0000-0000-00000000000c', 'APP_UBEREATS', 'sandbox', 'tok', now() + interval '1 day',
        '99999999-0000-0000-0000-000000000001');
select results_eq(
  $$ select count(*)::int from delivery_autorizaciones where tenant_id = 'cccccccc-0000-0000-0000-00000000000c' $$,
  $$ values (1) $$,
  'service_role escribe y lee');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '99999999-0000-0000-0000-000000000001',
                    'tenant_id', 'cccccccc-0000-0000-0000-00000000000c',
                    'role', 'authenticated')::text, true);

select throws_ok(
  $$ select 1 from delivery_autorizaciones $$,
  '42501', NULL,
  'authenticated no lee autorizaciones ni de su propio tenant');
select throws_ok(
  $$ insert into delivery_autorizaciones (tenant_id, app, entorno, access_token, vence_at, creado_por)
     values ('cccccccc-0000-0000-0000-00000000000c', 'APP_UBEREATS', 'sandbox', 'x', now(), '99999999-0000-0000-0000-000000000001') $$,
  '42501', NULL,
  'authenticated no escribe autorizaciones');

select * from finish();
rollback;
