-- ============================================================================
-- 0147 · Extras por cantidad (ADR 0024): privilegios y lo que ve el dueño.
--
-- La lógica (precedencia, mismo día, en uso, cambio de plan) la cubre el smoke
-- `supabase/scripts/smoke_extras.sql`. Aquí va lo que el smoke —que corre como postgres— no puede
-- ver: que nada de esto se llame desde el navegador y que el dueño lea SUS extras y no los ajenos.
--
-- Se corre con:  supabase test db
-- ============================================================================
begin;
select plan(9);

-- 1) Las funciones que mueven el contrato: solo service_role.
select ok(not has_function_privilege('authenticated', 'fijar_extra_tenant(uuid, text, integer, numeric, text)', 'execute')
      and not has_function_privilege('anon', 'fijar_extra_tenant(uuid, text, integer, numeric, text)', 'execute')
      and has_function_privilege('service_role', 'fijar_extra_tenant(uuid, text, integer, numeric, text)', 'execute'),
  'fijar_extra_tenant: solo service_role');
select ok(not has_function_privilege('authenticated', '_extras_vigentes(uuid, text)', 'execute')
      and not has_function_privilege('anon', '_extras_vigentes(uuid, text)', 'execute')
      and not has_function_privilege('authenticated', '_retirar_extras_sin_limite(uuid)', 'execute')
      and not has_function_privilege('anon', '_retirar_extras_sin_limite(uuid)', 'execute'),
  'las internas de extras no se llaman desde el navegador');

-- 2) El catálogo trae los dos extras con el precio del sitio.
select results_eq(
  $$ select codigo::text, precio_mensual_mxn from addons where codigo in ('SUCURSAL_EXTRA', 'CAJA_EXTRA') order by codigo $$,
  $$ values ('CAJA_EXTRA', 249.00::numeric(10,2)), ('SUCURSAL_EXTRA', 599.00::numeric(10,2)) $$,
  'el catálogo trae caja adicional a $249 y sucursal adicional a $599');

-- Dos negocios en Esencial; el primero contrata una caja adicional.
insert into tenants (id, codigo, nombre_comercial, vertical_principal, estado, plan_actual_id) values
  ('ffffffff-0000-0000-0000-0000000031a0', 'extras-uno', 'Extras Uno', 'QUICK_SERVICE', 'ACTIVO', (select id from planes where codigo = 'ESENCIAL')),
  ('ffffffff-0000-0000-0000-0000000031b0', 'extras-dos', 'Extras Dos', 'QUICK_SERVICE', 'ACTIVO', (select id from planes where codigo = 'ESENCIAL'));
insert into sucursales (id, tenant_id, codigo, nombre) values
  ('ffffffff-0000-0000-0000-0000000031a1', 'ffffffff-0000-0000-0000-0000000031a0', 'E1', 'Centro');
insert into cajas (tenant_id, sucursal_id, numero, nombre)
values ('ffffffff-0000-0000-0000-0000000031a0', 'ffffffff-0000-0000-0000-0000000031a1', 1, 'Caja 1');
select lives_ok($$ select fijar_extra_tenant('ffffffff-0000-0000-0000-0000000031a0', 'CAJA_EXTRA', 1) $$, 'service_role contrata la caja adicional');

-- 3) Con sesión del dueño: ve su extra con su cantidad, su límite ya sumado, y puede crear la caja.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '99999999-0000-0000-0000-0000000031e1',
                    'tenant_id', 'ffffffff-0000-0000-0000-0000000031a0', 'role', 'authenticated')::text, true);
select results_eq(
  $$ select a.codigo::text, ta.cantidad, ta.precio_mensual_mxn
       from tenant_addons ta join addons a on a.id = ta.addon_id where ta.activo $$,
  $$ values ('CAJA_EXTRA', 1, 249.00::numeric(10,2)) $$,
  'el dueño lee su extra con cantidad y precio (Plan y pagos)');
select is((limites_efectivos('ffffffff-0000-0000-0000-0000000031a0')->>'max_cajas_por_sucursal'), '2',
  'el límite que ve el dueño ya lleva el extra');
select lives_ok($$ insert into cajas (tenant_id, sucursal_id, numero, nombre)
                   values ('ffffffff-0000-0000-0000-0000000031a0', 'ffffffff-0000-0000-0000-0000000031a1', 2, 'Caja 2') $$,
  'con el extra, el dueño crea su segunda caja');
select throws_ok($$ select fijar_extra_tenant('ffffffff-0000-0000-0000-0000000031a0', 'CAJA_EXTRA', 5) $$, '42501', null,
  'el dueño no puede ampliarse el contrato él solo');

-- 4) Otro negocio no ve los extras del primero.
select set_config('request.jwt.claims',
  json_build_object('sub', '99999999-0000-0000-0000-0000000031e2',
                    'tenant_id', 'ffffffff-0000-0000-0000-0000000031b0', 'role', 'authenticated')::text, true);
select is((select count(*)::int from tenant_addons), 0, 'otro negocio no ve los extras ajenos');
reset role;

select * from finish();
rollback;
