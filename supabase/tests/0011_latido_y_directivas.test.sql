-- ============================================================================
-- Latido de la caja y directivas (spec 2026-09-04 §6, ADR 0014, migración 0104).
--
-- Lo que se protege: que las directivas digan bloqueado SOLO a partir de la fecha, que el
-- latido selle versión y hora, que un tenant no lea las directivas de otro, y que el límite de
-- sucursales se aplique igual que el de cajas.
--
-- Se corre con:  supabase test db
-- ============================================================================
begin;
select plan(13);

insert into tenants (id, codigo, nombre_comercial, vertical_principal, estado, plan_actual_id)
values ('cccccccc-0000-0000-0000-0000000000e0', 'lat-uno', 'Latido Uno', 'QUICK_SERVICE', 'ACTIVO',
        (select id from planes where codigo = 'ESENCIAL'))
on conflict (id) do nothing;
insert into sucursales (id, tenant_id, codigo, nombre)
values ('cccccccc-0000-0000-0000-0000000000e1', 'cccccccc-0000-0000-0000-0000000000e0', 'L1', 'Suc L1')
on conflict (id) do nothing;
insert into configuracion_tenant (tenant_id) values ('cccccccc-0000-0000-0000-0000000000e0')
on conflict (tenant_id) do nothing;
insert into cajas (id, tenant_id, sucursal_id, numero, nombre)
values ('cccccccc-0000-0000-0000-0000000000e2', 'cccccccc-0000-0000-0000-0000000000e0',
        'cccccccc-0000-0000-0000-0000000000e1', 1, 'Caja L1');

-- #1/#2 columnas nuevas
select has_column('cajas', 'ultimo_latido');
select has_column('cajas', 'version_app');

-- #3 tenant activo: no bloqueado
select is((resolver_directivas('cccccccc-0000-0000-0000-0000000000e0', null)->'acceso'->>'bloqueado'),
          'false', 'un tenant activo no está bloqueado');

-- #4 suspendido con gracia futura: todavía NO bloquea
update tenants set estado = 'SUSPENDIDO', bloqueo_desde = now() + interval '2 days',
       bloqueo_mensaje = 'Pago pendiente'
 where id = 'cccccccc-0000-0000-0000-0000000000e0';
select is((resolver_directivas('cccccccc-0000-0000-0000-0000000000e0', null)->'acceso'->>'bloqueado'),
          'false', 'durante la gracia no bloquea');
-- #5 y lleva el mensaje para el cajero
select is((resolver_directivas('cccccccc-0000-0000-0000-0000000000e0', null)->'acceso'->>'mensaje'),
          'Pago pendiente', 'la directiva lleva el mensaje');

-- #6 pasada la fecha: bloquea
update tenants set bloqueo_desde = now() - interval '1 minute'
 where id = 'cccccccc-0000-0000-0000-0000000000e0';
select is((resolver_directivas('cccccccc-0000-0000-0000-0000000000e0', null)->'acceso'->>'bloqueado'),
          'true', 'pasada la fecha bloquea');

-- #7 sin bloqueo_desde no bloquea aunque esté suspendido (no hay fecha que cumplir)
update tenants set bloqueo_desde = null where id = 'cccccccc-0000-0000-0000-0000000000e0';
select is((resolver_directivas('cccccccc-0000-0000-0000-0000000000e0', null)->'acceso'->>'bloqueado'),
          'false', 'sin fecha de bloqueo no bloquea');
update tenants set estado = 'ACTIVO' where id = 'cccccccc-0000-0000-0000-0000000000e0';

-- #8/#9 las directivas traen módulos y límites ya resueltos
select is((resolver_directivas('cccccccc-0000-0000-0000-0000000000e0', null)->'modulos'->>'kds'),
          'true', 'las directivas traen los módulos efectivos');
select is((resolver_directivas('cccccccc-0000-0000-0000-0000000000e0', null)->'limites'->>'max_cajas_por_sucursal'),
          '1', 'las directivas traen los límites');

-- #10/#11 el latido sella hora y versión, y devuelve las directivas
select ok((caja_latido('cccccccc-0000-0000-0000-0000000000e2', '0.4.58', 'Windows 11', '10.0.0.5'::inet)) ? 'acceso',
          'el latido devuelve directivas');
select results_eq(
  $$ select version_app::text, (ultimo_latido is not null) from cajas where id = 'cccccccc-0000-0000-0000-0000000000e2' $$,
  $$ values ('0.4.58', true) $$,
  'el latido sella versión y hora');

-- #12 el límite de sucursales se aplica (Esencial da 1 y ya tiene una)
select throws_ok(
  $$ insert into sucursales (tenant_id, codigo, nombre)
     values ('cccccccc-0000-0000-0000-0000000000e0', 'L2', 'Suc L2') $$,
  'P0001', 'Tu plan permite 1 sucursal(es). Pide a VIM ampliar el límite.',
  'la segunda sucursal se rechaza');

-- #13 un tenant autenticado no lee las directivas de otro
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '99999999-0000-0000-0000-0000000000e9',
                    'tenant_id', 'dddddddd-0000-0000-0000-0000000000e0',
                    'role', 'authenticated')::text, true);
select is(mi_acceso(), null, 'mi_acceso de un tenant inexistente no devuelve nada ajeno');

select * from finish();
rollback;
