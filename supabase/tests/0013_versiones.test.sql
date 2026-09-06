-- ============================================================================
-- Versiones de la caja (spec 2026-09-04 §9, ADR 0014, migración 0108).
--
-- Lo que se protege: que la recomendada sea la más alta PUBLICADA, que la comparación sea por
-- número y no por texto, que solo pueda haber una mínima, y que el bloqueo por versión solo se
-- anuncie cuando VIM lo encendió Y llegó su fecha.
--
-- Se corre con:  supabase test db
-- ============================================================================
begin;
select plan(12);

insert into tenants (id, codigo, nombre_comercial, vertical_principal, estado, plan_actual_id)
values ('aaaaaaaa-0000-0000-0000-00000000ff00', 'ver-uno', 'Versiones Uno', 'QUICK_SERVICE', 'ACTIVO',
        (select id from planes where codigo = 'NEGOCIO'))
on conflict (id) do nothing;
insert into configuracion_tenant (tenant_id) values ('aaaaaaaa-0000-0000-0000-00000000ff00')
on conflict (tenant_id) do nothing;

-- Aislamiento: la base de desarrollo puede traer versiones publicadas a mano. Se retiran dentro
-- de la transacción; el rollback las devuelve.
delete from versiones_caja;

-- #1 tabla nueva
select has_table('versiones_caja');

-- #2 sin versiones publicadas, el bloque va vacío pero existe
select is((resolver_directivas('aaaaaaaa-0000-0000-0000-00000000ff00', null)->>'version'), '{}',
          'sin versiones publicadas el bloque va vacío');

insert into versiones_caja (version, url, sha512, notas, fecha)
values ('0.4.60', 'https://github.com/x/y/releases/download/v0.4.60/a.exe', repeat('a', 128), 'vieja', '2026-09-06'),
       ('0.4.61', 'https://github.com/x/y/releases/download/v0.4.61/b.exe', repeat('b', 128), 'nueva', '2026-09-06');

-- #3 la recomendada es la más alta publicada
select is((resolver_directivas('aaaaaaaa-0000-0000-0000-00000000ff00', null)->'version'->>'recomendada'),
          '0.4.61', 'la recomendada es la más alta publicada');
-- #4 y lleva su url para que la caja pueda instalarla
select is((resolver_directivas('aaaaaaaa-0000-0000-0000-00000000ff00', null)->'version'->>'url'),
          'https://github.com/x/y/releases/download/v0.4.61/b.exe', 'la recomendada lleva su url');

-- #5 se ordena por NÚMERO, no por texto: como cadena '0.4.9' sería mayor que '0.4.61'
insert into versiones_caja (version, url, sha512, fecha)
values ('0.4.9', 'https://github.com/x/y/releases/download/v0.4.9/c.exe', repeat('c', 128), '2026-08-01');
select is((resolver_directivas('aaaaaaaa-0000-0000-0000-00000000ff00', null)->'version'->>'recomendada'),
          '0.4.61', 'ordena por número: 0.4.9 no supera a 0.4.61');
delete from versiones_caja where version = '0.4.9';

-- #6 una versión despublicada no se recomienda
update versiones_caja set publicada = false where version = '0.4.61';
select is((resolver_directivas('aaaaaaaa-0000-0000-0000-00000000ff00', null)->'version'->>'recomendada'),
          '0.4.60', 'una versión despublicada no se recomienda');
update versiones_caja set publicada = true where version = '0.4.61';

-- #7 sin mínima marcada, no hay mínima
select ok((resolver_directivas('aaaaaaaa-0000-0000-0000-00000000ff00', null)->'version'->>'minima') is null,
          'sin mínima marcada no se anuncia ninguna');

-- #8 se marca una mínima
update versiones_caja set es_minima = true where version = '0.4.61';
select is((resolver_directivas('aaaaaaaa-0000-0000-0000-00000000ff00', null)->'version'->>'minima'),
          '0.4.61', 'la mínima se anuncia');

-- #9 solo puede haber UNA mínima a la vez
select throws_ok(
  $$ update versiones_caja set es_minima = true where version = '0.4.60' $$,
  '23505', NULL, 'no puede haber dos versiones mínimas');

-- #10 por defecto la mínima NO bloquea
select is((resolver_directivas('aaaaaaaa-0000-0000-0000-00000000ff00', null)->'version'->>'bloquea_bajo_minima'),
          'false', 'la mínima no bloquea por defecto');

-- #11 encendido pero con fecha futura, tampoco
update versiones_caja set bloquea_bajo_minima = true, bloquea_desde = now() + interval '2 days'
 where version = '0.4.61';
select is((resolver_directivas('aaaaaaaa-0000-0000-0000-00000000ff00', null)->'version'->>'bloquea_bajo_minima'),
          'false', 'con fecha futura todavía no bloquea');

-- #12 pasada la fecha, sí
update versiones_caja set bloquea_desde = now() - interval '1 minute' where version = '0.4.61';
select is((resolver_directivas('aaaaaaaa-0000-0000-0000-00000000ff00', null)->'version'->>'bloquea_bajo_minima'),
          'true', 'pasada la fecha el bloqueo por versión se anuncia');

select * from finish();
rollback;
