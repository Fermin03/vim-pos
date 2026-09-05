-- ============================================================================
-- Módulos y límites por cliente (spec 2026-09-04 §5.4–5.5, ADR 0014, migración 0102).
--
-- Lo que se protege: que el panel de plataforma pueda decir qué módulos y qué límites tiene
-- cada cliente, que una excepción por flag mande sobre el plan (y venza), que el efectivo sea
-- permitido AND encendido por el dueño, que el candado de cajas rechace la caja de más, y que
-- un tenant autenticado no pueda leer los módulos de otro.
--
-- Se corre con:  supabase test db
-- ============================================================================
begin;
select plan(12);

-- Tenant de prueba en plan ESENCIAL (1 caja por sucursal, sin recetas).
insert into tenants (id, codigo, nombre_comercial, vertical_principal, plan_actual_id)
values ('aaaaaaaa-0000-0000-0000-0000000000d0', 'mod-esencial', 'Mod Esencial', 'QUICK_SERVICE',
        (select id from planes where codigo = 'ESENCIAL'))
on conflict (id) do nothing;
insert into sucursales (id, tenant_id, codigo, nombre)
values ('aaaaaaaa-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-0000000000d0', 'S1', 'Suc 1')
on conflict (id) do nothing;
insert into configuracion_tenant (tenant_id) values ('aaaaaaaa-0000-0000-0000-0000000000d0')
on conflict (tenant_id) do nothing;

-- #1 el plan ESENCIAL declara módulos
select ok((select features_incluidos ? 'modulos' from planes where codigo = 'ESENCIAL'), 'ESENCIAL trae modulos');
-- #2 un plan heredado también (nadie se queda sin nada)
select ok((select features_incluidos->'modulos'->>'recetas' = 'true' from planes where codigo = 'QS'), 'QS heredado tiene recetas');

-- #3/#4 permitidos según plan
select is((modulos_efectivos('aaaaaaaa-0000-0000-0000-0000000000d0')->'permitidos'->>'recetas'), 'false', 'ESENCIAL no permite recetas');
select is((modulos_efectivos('aaaaaaaa-0000-0000-0000-0000000000d0')->'permitidos'->>'kds'), 'true', 'ESENCIAL permite kds');

-- #5 excepción por flag enciende el permiso
insert into tenant_feature_flags (tenant_id, flag_codigo, activado, motivo)
values ('aaaaaaaa-0000-0000-0000-0000000000d0', 'recetas', true, 'cortesía de prueba');
select is((modulos_efectivos('aaaaaaaa-0000-0000-0000-0000000000d0')->'permitidos'->>'recetas'), 'true', 'flag permite recetas por excepción');

-- #6 efectivo = permitido AND encendido (recetas depende de modulo_inventario_activo)
select is((modulos_efectivos('aaaaaaaa-0000-0000-0000-0000000000d0')->'efectivos'->>'recetas'), 'false', 'recetas permitido pero apagado → no efectivo');
update configuracion_tenant set modulo_inventario_activo = true where tenant_id = 'aaaaaaaa-0000-0000-0000-0000000000d0';
-- #7
select is((modulos_efectivos('aaaaaaaa-0000-0000-0000-0000000000d0')->'efectivos'->>'recetas'), 'true', 'recetas encendido → efectivo');

-- #8 flag vencido no cuenta
update tenant_feature_flags set fecha_fin = now() - interval '1 day'
 where tenant_id = 'aaaaaaaa-0000-0000-0000-0000000000d0' and flag_codigo = 'recetas';
select is((modulos_efectivos('aaaaaaaa-0000-0000-0000-0000000000d0')->'permitidos'->>'recetas'), 'false', 'flag vencido no permite');

-- #9 límites del plan
select is((limites_efectivos('aaaaaaaa-0000-0000-0000-0000000000d0')->>'max_cajas_por_sucursal'), '1', 'ESENCIAL: 1 caja por sucursal');
-- #10 override por tenant_limites
insert into tenant_limites (tenant_id, max_cajas_por_sucursal, motivo)
values ('aaaaaaaa-0000-0000-0000-0000000000d0', 2, 'prueba');
select is((limites_efectivos('aaaaaaaa-0000-0000-0000-0000000000d0')->>'max_cajas_por_sucursal'), '2', 'override manda sobre el plan');

-- #11 trigger: con límite 2, la tercera caja falla
insert into cajas (tenant_id, sucursal_id, numero, nombre)
values ('aaaaaaaa-0000-0000-0000-0000000000d0', 'aaaaaaaa-0000-0000-0000-0000000000d1', 1, 'Caja 1');
insert into cajas (tenant_id, sucursal_id, numero, nombre)
values ('aaaaaaaa-0000-0000-0000-0000000000d0', 'aaaaaaaa-0000-0000-0000-0000000000d1', 2, 'Caja 2');
select throws_ok(
  $$ insert into cajas (tenant_id, sucursal_id, numero, nombre)
     values ('aaaaaaaa-0000-0000-0000-0000000000d0', 'aaaaaaaa-0000-0000-0000-0000000000d1', 3, 'Caja 3') $$,
  'P0001', 'Tu plan permite 2 caja(s) por sucursal. Pide a VIM ampliar el límite.', 'la tercera caja se rechaza');

-- #12 otro tenant autenticado no lee los módulos del primero (guard por claim)
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '99999999-0000-0000-0000-0000000000d9',
                    'tenant_id', 'bbbbbbbb-0000-0000-0000-0000000000d0',
                    'role', 'authenticated')::text, true);
select is(modulos_efectivos('aaaaaaaa-0000-0000-0000-0000000000d0'), null, 'otro tenant recibe NULL');

select * from finish();
rollback;
