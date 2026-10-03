-- ============================================================================
-- 0151 · reordenar anuncios en una sola operación y tiempo general solo para dueño/admin.
-- ============================================================================
begin;
select plan(13);

\set t      '99999999-0000-0000-0000-0000000000aa'
\set cajero '99999999-0000-0000-0000-000000000001'
\set dueno  '99999999-0000-0000-0000-0000000000e1'
\set otro   '35353535-0000-0000-0000-0000000000aa'
\set a1     '35353535-0000-0000-0000-000000000001'
\set a2     '35353535-0000-0000-0000-000000000002'
\set a3     '35353535-0000-0000-0000-000000000003'
\set baja   '35353535-0000-0000-0000-000000000004'
\set ajeno  '35353535-0000-0000-0000-000000000005'

insert into tenants (id, codigo, nombre_comercial, estado, vertical_principal)
values (:'otro', 'tenant-0035', 'Otro negocio', 'INTERNO', 'QUICK_SERVICE');
insert into anuncios_pantalla (id, tenant_id, ruta, orden, deleted_at) values
  (:'a1',    :'t',    :'t'    || '/' || :'a1'    || '.jpg', 0, null),
  (:'a2',    :'t',    :'t'    || '/' || :'a2'    || '.jpg', 10, null),
  (:'a3',    :'t',    :'t'    || '/' || :'a3'    || '.jpg', 20, null),
  (:'baja',  :'t',    :'t'    || '/' || :'baja'  || '.jpg', 30, now()),
  (:'ajeno', :'otro', :'otro' || '/' || :'ajeno' || '.jpg', 0, null);
-- (la fila de configuracion_tenant del negocio se crea más abajo: el primer caso necesita que no exista)

-- Como el cajero.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'cajero', 'role', 'authenticated', 'tenant_id', :'t')::text, true);

select throws_ok(
  format($$ select reordenar_anuncios(array[%L, %L]::uuid[]) $$, :'a2', :'a1'),
  '42501', null, 'un cajero no puede reordenar anuncios');

-- 5) Tiempo general: el cajero no lo cambia, pero sí otras columnas.
-- Sin fila previa (el negocio aún no ha configurado nada): un INSERT que trae un tiempo distinto del 8 por omisión también es cambiarlo.
select throws_ok(
  format($$ insert into configuracion_tenant (tenant_id, pantalla_cliente_segundos) values (%L, 12) $$, :'t'),
  '42501', null, 'un cajero no puede crear la fila con un tiempo distinto del de omisión');

reset role;
insert into configuracion_tenant (tenant_id) values (:'t') on conflict (tenant_id) do nothing;
set local role authenticated;

select throws_ok(
  format($$ update configuracion_tenant set pantalla_cliente_segundos = 12 where tenant_id = %L $$, :'t'),
  '42501', null, 'un cajero no puede cambiar el tiempo general de los anuncios');
-- Otra columna de verdad (no la del tiempo): el UPDATE pasa.
select lives_ok(
  format($$ update configuracion_tenant set combo_upsell_activo = not combo_upsell_activo where tenant_id = %L $$, :'t'),
  'un cajero sí cambia otra columna de configuracion_tenant');
-- El upsert exacto de apps/admin/app/lib/combos.ts (activarComboUpsell): INSERT ... ON CONFLICT DO UPDATE.
select lives_ok(
  format($$ insert into configuracion_tenant (tenant_id, combo_upsell_activo) values (%L, true)
            on conflict (tenant_id) do update set combo_upsell_activo = excluded.combo_upsell_activo $$, :'t'),
  'el upsert de combos de un cajero no se bloquea');

-- Como el dueño.
select set_config('request.jwt.claims', json_build_object('sub', :'dueno', 'role', 'authenticated', 'tenant_id', :'t')::text, true);

-- 2) Reordena tres anuncios: orden 0, 10, 20 en el orden dado.
select lives_ok(
  format($$ select reordenar_anuncios(array[%L, %L, %L]::uuid[]) $$, :'a3', :'a1', :'a2'),
  'el dueño reordena tres anuncios');
select is(
  (select array_agg(orden order by id) from anuncios_pantalla where id in (:'a1', :'a2', :'a3')),
  array[10, 20, 0],
  'a3 quedó en 0, a1 en 10 y a2 en 20');

-- 3) Un id de otro negocio: se rechaza y NO cambia nada (atómico).
select throws_ok(
  format($$ select reordenar_anuncios(array[%L, %L, %L]::uuid[]) $$, :'a1', :'a2', :'ajeno'),
  'P0002', null, 'un id de otro negocio rechaza la llamada');
select is(
  (select array_agg(orden order by id) from anuncios_pantalla where id in (:'a1', :'a2', :'a3')),
  array[10, 20, 0],
  'tras el rechazo ningún orden cambió');

-- 4) Un anuncio dado de baja tampoco cuenta como parte de la lista.
select throws_ok(
  format($$ select reordenar_anuncios(array[%L, %L, %L]::uuid[]) $$, :'a2', :'a1', :'baja'),
  'P0002', null, 'un anuncio dado de baja rechaza la llamada');
select is(
  (select orden from anuncios_pantalla where id = :'baja'), 30,
  'el anuncio dado de baja conserva su orden');

-- 5) Un id repetido: la lista no coincide con la de la base y se rechaza (cuenta DISTINTOS).
select throws_ok(
  format($$ select reordenar_anuncios(array[%L, %L, %L, %L]::uuid[]) $$, :'a1', :'a2', :'a3', :'a1'),
  'P0002', null, 'un id repetido rechaza la llamada');

-- 6) El dueño sí cambia el tiempo general.
select lives_ok(
  format($$ update configuracion_tenant set pantalla_cliente_segundos = 12 where tenant_id = %L $$, :'t'),
  'el dueño cambia el tiempo general de los anuncios');

select * from finish();
rollback;
