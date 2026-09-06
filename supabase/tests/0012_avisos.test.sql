-- ============================================================================
-- Avisos a las cajas (spec 2026-09-04 §8, ADR 0014, migración 0106).
--
-- Lo que se protege: que un aviso llegue a quien le toca y solo mientras esté vigente, que un
-- aviso visto no vuelva a esa caja, que las lecturas queden registradas, y que un acuse
-- inventado no pueda tumbar el latido —que es lo que mantiene viva la señal de la caja.
--
-- Se corre con:  supabase test db
-- ============================================================================
begin;
select plan(14);

insert into tenants (id, codigo, nombre_comercial, vertical_principal, estado, plan_actual_id)
values ('eeeeeeee-0000-0000-0000-0000000000f0', 'avi-uno', 'Avisos Uno', 'QUICK_SERVICE', 'ACTIVO',
        (select id from planes where codigo = 'NEGOCIO')),
       ('ffffffff-0000-0000-0000-0000000000f0', 'avi-dos', 'Avisos Dos', 'QUICK_SERVICE', 'ACTIVO',
        (select id from planes where codigo = 'NEGOCIO'))
on conflict (id) do nothing;
insert into sucursales (id, tenant_id, codigo, nombre)
values ('eeeeeeee-0000-0000-0000-0000000000f1', 'eeeeeeee-0000-0000-0000-0000000000f0', 'A1', 'Suc A1')
on conflict (id) do nothing;
insert into configuracion_tenant (tenant_id) values ('eeeeeeee-0000-0000-0000-0000000000f0')
on conflict (tenant_id) do nothing;
insert into cajas (id, tenant_id, sucursal_id, numero, nombre)
values ('eeeeeeee-0000-0000-0000-0000000000f2', 'eeeeeeee-0000-0000-0000-0000000000f0',
        'eeeeeeee-0000-0000-0000-0000000000f1', 1, 'Caja A1');

-- #1/#2 tablas nuevas
select has_table('avisos_plataforma');
select has_table('avisos_lecturas');

-- #3 sin avisos, las directivas traen un array vacío (no null)
select is((resolver_directivas('eeeeeeee-0000-0000-0000-0000000000f0', 'eeeeeeee-0000-0000-0000-0000000000f2')->>'avisos'),
          '[]', 'sin avisos el array va vacío');

-- Un aviso para ESE cliente y otro global.
insert into avisos_plataforma (id, tenant_id, nivel, titulo, cuerpo)
values ('11111111-0000-0000-0000-0000000000f0', 'eeeeeeee-0000-0000-0000-0000000000f0', 'info', 'Solo para ti', 'Cuerpo A');
insert into avisos_plataforma (id, tenant_id, nivel, titulo, cuerpo, requiere_confirmacion)
values ('22222222-0000-0000-0000-0000000000f0', null, 'warning', 'Para todos', 'Cuerpo B', true);

-- #4 le llegan los dos
select is(jsonb_array_length(resolver_directivas('eeeeeeee-0000-0000-0000-0000000000f0', 'eeeeeeee-0000-0000-0000-0000000000f2')->'avisos'),
          2, 'llegan el suyo y el global');
-- #5 al OTRO cliente solo le llega el global
select is(jsonb_array_length(resolver_directivas('ffffffff-0000-0000-0000-0000000000f0', null)->'avisos'),
          1, 'al otro cliente solo le llega el global');

-- #6 el aviso lleva lo que el cajero necesita, y nada más
select is(((resolver_directivas('ffffffff-0000-0000-0000-0000000000f0', null)->'avisos'->0)
           - 'id' - 'nivel' - 'titulo' - 'cuerpo' - 'requiere_confirmacion' - 'vigente_hasta'),
          '{}'::jsonb, 'el aviso no lleva campos de más');

-- #7 un aviso vencido no llega
update avisos_plataforma set vigente_hasta = now() - interval '1 hour'
 where id = '11111111-0000-0000-0000-0000000000f0';
select is(jsonb_array_length(resolver_directivas('eeeeeeee-0000-0000-0000-0000000000f0', 'eeeeeeee-0000-0000-0000-0000000000f2')->'avisos'),
          1, 'un aviso vencido no llega');
update avisos_plataforma set vigente_hasta = null where id = '11111111-0000-0000-0000-0000000000f0';

-- #8 uno que aún no empieza tampoco
update avisos_plataforma set vigente_desde = now() + interval '1 day'
 where id = '11111111-0000-0000-0000-0000000000f0';
select is(jsonb_array_length(resolver_directivas('eeeeeeee-0000-0000-0000-0000000000f0', 'eeeeeeee-0000-0000-0000-0000000000f2')->'avisos'),
          1, 'un aviso futuro no llega todavía');
update avisos_plataforma set vigente_desde = now() - interval '1 minute'
 where id = '11111111-0000-0000-0000-0000000000f0';

-- #9/#10 el latido registra las lecturas que le manda la caja
select ok((caja_latido('eeeeeeee-0000-0000-0000-0000000000f2', '0.4.61', 'Windows 11', null,
                       array['11111111-0000-0000-0000-0000000000f0']::uuid[])) ? 'avisos',
          'el latido con acuses devuelve directivas');
select is((select count(*)::int from avisos_lecturas where aviso_id = '11111111-0000-0000-0000-0000000000f0'),
          1, 'la lectura quedó registrada');

-- #11 y ese aviso ya no vuelve a esa caja
select is(jsonb_array_length(resolver_directivas('eeeeeeee-0000-0000-0000-0000000000f0', 'eeeeeeee-0000-0000-0000-0000000000f2')->'avisos'),
          1, 'un aviso visto no vuelve a esa caja');

-- #12 el acuse SIN caja (POS web) también entra: caja_id es NULL y la clave lo permite
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '99999999-0000-0000-0000-0000000000e9',
                    'tenant_id', 'ffffffff-0000-0000-0000-0000000000f0',
                    'role', 'authenticated')::text, true);
select ok(marcar_aviso_visto('22222222-0000-0000-0000-0000000000f0'), 'el POS web puede acusar un aviso global');
-- #13 y no puede acusar uno que no le toca
select ok(NOT marcar_aviso_visto('11111111-0000-0000-0000-0000000000f0'), 'no puede acusar el aviso de otro negocio');
reset role;

-- #14 un id inventado en los acuses no revienta el latido
select lives_ok(
  $$ select caja_latido('eeeeeeee-0000-0000-0000-0000000000f2', '0.4.61', null, null,
                        array['99999999-9999-9999-9999-999999999999']::uuid[]) $$,
  'un acuse de un aviso inexistente se ignora');

select * from finish();
rollback;
