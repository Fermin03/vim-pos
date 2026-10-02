-- ============================================================================
-- 0150 · anuncios de la pantalla del cliente: cada negocio ve solo los suyos, solo el dueño o el
-- admin los administra, hay un tope de 10 y bajan a la caja en el snapshot.
-- ============================================================================
begin;
select plan(12);

\set t      '99999999-0000-0000-0000-0000000000aa'
\set cajero '99999999-0000-0000-0000-000000000001'
\set dueno  '99999999-0000-0000-0000-0000000000e1'
\set otro   '34343434-0000-0000-0000-0000000000aa'
\set a1     '34343434-0000-0000-0000-000000000001'
\set ajeno  '34343434-0000-0000-0000-000000000002'

insert into tenants (id, codigo, nombre_comercial, estado, vertical_principal)
values (:'otro', 'tenant-0034', 'Otro negocio', 'INTERNO', 'QUICK_SERVICE');
insert into anuncios_pantalla (id, tenant_id, ruta, orden) values
  (:'a1',    :'t',    :'t'    || '/' || :'a1'    || '.jpg', 0),
  (:'ajeno', :'otro', :'otro' || '/' || :'ajeno' || '.jpg', 0);

-- 1) Los segundos tienen valor por omisión y límites.
select col_default_is('configuracion_tenant', 'pantalla_cliente_segundos', '8', 'los segundos por imagen son 8 por omisión');
select throws_ok(
  format($$ insert into configuracion_tenant (tenant_id, pantalla_cliente_segundos) values (%L, 2)
            on conflict (tenant_id) do update set pantalla_cliente_segundos = 2 $$, :'t'),
  '23514', null, 'menos de 3 segundos no se acepta');

-- 1b) El tiempo propio de un anuncio tiene los mismos límites.
select throws_ok(
  format($$ update anuncios_pantalla set segundos = 61 where id = %L $$, :'a1'),
  '23514', null, 'un anuncio no puede durar más de 60 segundos');

-- Como el cajero del negocio.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'cajero', 'role', 'authenticated', 'tenant_id', :'t')::text, true);

-- 2) Ve los de su negocio y no los ajenos.
select is((select count(*)::int from anuncios_pantalla), 1, 'el cajero ve solo los anuncios de su negocio');
select is((select count(*)::int from anuncios_pantalla where id = :'ajeno'), 0, 'el anuncio de otro negocio no se ve');

-- 3) Pero no los administra.
select throws_ok(
  format($$ insert into anuncios_pantalla (tenant_id, ruta) values (%L, %L) $$, :'t', :'t' || '/' || gen_random_uuid() || '.jpg'),
  '42501', null, 'un cajero no puede subir anuncios');

-- Como el dueño.
select set_config('request.jwt.claims', json_build_object('sub', :'dueno', 'role', 'authenticated', 'tenant_id', :'t')::text, true);

-- 4) El dueño sí, pero nunca en otro negocio.
select lives_ok(
  format($$ insert into anuncios_pantalla (tenant_id, ruta, orden) values (%L, %L, 1) $$, :'t', :'t' || '/' || gen_random_uuid() || '.jpg'),
  'el dueño sube un anuncio');
select throws_ok(
  format($$ insert into anuncios_pantalla (tenant_id, ruta) values (%L, %L) $$, :'otro', :'otro' || '/' || gen_random_uuid() || '.jpg'),
  '42501', null, 'el dueño no puede subir anuncios a otro negocio');

-- 5) Tope de 10 vivos: ya hay 2; entran 8 más y el undécimo se rechaza.
insert into anuncios_pantalla (tenant_id, ruta, orden)
select :'t', :'t' || '/' || gen_random_uuid() || '.jpg', 10 + g from generate_series(1, 8) g;
select throws_ok(
  format($$ insert into anuncios_pantalla (tenant_id, ruta) values (%L, %L) $$, :'t', :'t' || '/' || gen_random_uuid() || '.jpg'),
  'P0001', null, 'el undécimo anuncio se rechaza');

-- 6) El snapshot del pull los trae (lo llama service_role; aquí, el superusuario de la prueba).
reset role;
select is(
  (select jsonb_array_length(sync_pull_snapshot(:'t') -> 'anuncios_pantalla')), 10,
  'el snapshot de la caja trae los 10 anuncios del negocio');

-- 7) La ruta queda atada al negocio y al formato <uuid>.<ext> (la prueba corre como superusuario: el CHECK no depende de RLS).
select throws_ok(
  format($$ insert into anuncios_pantalla (tenant_id, ruta) values (%L, %L) $$, :'otro', :'t' || '/' || gen_random_uuid() || '.jpg'),
  '23514', null, 'una ruta que apunta a la carpeta de otro negocio se rechaza');
select throws_ok(
  format($$ insert into anuncios_pantalla (tenant_id, ruta) values (%L, %L) $$, :'otro', :'otro' || '/../x.jpg'),
  '23514', null, 'un nombre de archivo que no es <uuid>.<ext> se rechaza');

select * from finish();
rollback;
