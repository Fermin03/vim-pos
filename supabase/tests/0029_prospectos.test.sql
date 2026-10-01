-- ============================================================================
-- 0145 · Prospectos de demo: la bandeja de /platform.
--
-- Lo que se protege: que la tabla siga cerrada al navegador (nombre y WhatsApp de personas que
-- todavía no son clientes), y que el seguimiento selle sus fechas en la base —la primera
-- respuesta no se pisa— sin que la aplicación tenga que acordarse.
--
-- Se corre con:  supabase test db
-- ============================================================================
begin;
select plan(11);

-- 1) Nadie con la llave pública ni con sesión de un negocio toca la tabla.
select ok(not has_table_privilege('anon', 'prospectos', 'select')
      and not has_table_privilege('anon', 'prospectos', 'insert')
      and not has_table_privilege('authenticated', 'prospectos', 'select')
      and not has_table_privilege('authenticated', 'prospectos', 'update')
      and not has_table_privilege('authenticated', 'prospectos', 'delete'),
  'prospectos: sin privilegios para anon ni authenticated');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.prospectos'::regclass),
  'prospectos: RLS habilitado y forzado');
select is((select count(*)::int from pg_policies
            where schemaname = 'public' and tablename = 'prospectos' and (qual <> 'false' or with_check <> 'false')),
  0, 'prospectos: ninguna política deja pasar a nadie');

insert into prospectos (id, nombre, whatsapp, negocio, cajas, sucursales)
values ('dddddddd-0000-0000-0000-000000000291', 'Ana Prueba', '4771234567', 'Tacos de Prueba', 1, 1);

-- 2) Una fila nueva nace en NUEVO y sin fechas de seguimiento.
select is((select estado from prospectos where id = 'dddddddd-0000-0000-0000-000000000291'), 'NUEVO', 'nace en NUEVO');
select ok((select atendido_en is null and estado_cambiado_en is null from prospectos where id = 'dddddddd-0000-0000-0000-000000000291'),
  'sin fechas de seguimiento hasta que alguien lo mueva');

-- 3) Una sesión de negocio no lo ve ni lo cambia.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '99999999-0000-0000-0000-000000000001',
                    'tenant_id', '99999999-0000-0000-0000-0000000000aa',
                    'role', 'authenticated')::text, true);
select throws_ok($$ select count(*) from prospectos $$, '42501', null, 'una sesión de negocio no lee prospectos');
select throws_ok($$ update prospectos set estado = 'GANADO' $$, '42501', null, 'ni los cambia');
reset role;

-- 4) Guardar solo la nota no mueve las fechas.
update prospectos set notas = 'le marco el lunes' where id = 'dddddddd-0000-0000-0000-000000000291';
select ok((select estado_cambiado_en is null from prospectos where id = 'dddddddd-0000-0000-0000-000000000291'),
  'una nota sin cambio de estado no sella nada');

-- 5) Al dejar de ser NUEVO se sellan las dos fechas…
update prospectos set estado = 'CONTACTADO' where id = 'dddddddd-0000-0000-0000-000000000291';
select ok((select atendido_en is not null and estado_cambiado_en is not null from prospectos where id = 'dddddddd-0000-0000-0000-000000000291'),
  'al contactarlo se sellan atendido_en y estado_cambiado_en');

-- 6) …y la primera respuesta no se pisa aunque vuelva a NUEVO y salga otra vez.
update prospectos set atendido_en = '2026-01-01T00:00:00Z' where id = 'dddddddd-0000-0000-0000-000000000291';
update prospectos set estado = 'NUEVO' where id = 'dddddddd-0000-0000-0000-000000000291';
update prospectos set estado = 'DEMO_AGENDADA' where id = 'dddddddd-0000-0000-0000-000000000291';
select is((select atendido_en from prospectos where id = 'dddddddd-0000-0000-0000-000000000291'),
  '2026-01-01T00:00:00Z'::timestamptz, 'atendido_en es la PRIMERA respuesta');

-- 7) La nota tiene tope.
select throws_ok($$ update prospectos set notas = repeat('x', 501) where id = 'dddddddd-0000-0000-0000-000000000291' $$,
  '23514', null, 'una nota de más de 500 caracteres la rechaza el CHECK');

select * from finish();
rollback;
