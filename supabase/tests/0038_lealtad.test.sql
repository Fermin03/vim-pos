-- ============================================================================
-- 0156 · lealtad: cada negocio ve solo lo suyo, solo dueño o admin configura, nadie escribe el
-- libro ni los saldos a mano, y el interruptor exige add-on y programa.
-- ============================================================================
begin;
select plan(14);

\set t      '99999999-0000-0000-0000-0000000000aa'
\set cajero '99999999-0000-0000-0000-000000000001'
\set dueno  '99999999-0000-0000-0000-0000000000e1'
\set otro   '38383838-0000-0000-0000-0000000000aa'
\set cli    '38383838-0000-0000-0000-000000000001'
\set cli2   '38383838-0000-0000-0000-000000000002'

insert into tenants (id, codigo, nombre_comercial, estado, vertical_principal)
values (:'otro', 'tenant-0038', 'Otro negocio', 'INTERNO', 'QUICK_SERVICE');
insert into clientes (id, tenant_id, nombre, telefono) values
  (:'cli',  :'t',    'Ana Propia', '4770000381'),
  (:'cli2', :'otro', 'Beto Ajeno', '4770000382');
-- El seed no crea la fila de configuración del negocio de pruebas; sin ella los UPDATE de abajo
-- no tocarían ninguna fila y el interruptor nunca se ejercitaría.
insert into configuracion_tenant (tenant_id) values (:'t') on conflict (tenant_id) do nothing;
insert into lealtad_programa (tenant_id, mecanica, porcentaje) values (:'otro', 'PUNTOS_DINERO', 5);
insert into lealtad_saldos (tenant_id, cliente_id, saldo, programa_version) values
  (:'t', :'cli', 10, 1), (:'otro', :'cli2', 99, 1);

-- 1-2) Estructura.
select has_column('tickets', 'lealtad_mxn', 'tickets lleva el descuento por lealtad');
select isnt((select codigo_publico from clientes where id = :'cli'), null, 'todo cliente nace con código público');

-- 3) El módulo aparece en modulos_efectivos, apagado por omisión.
select is((select (modulos_efectivos(:'t') -> 'efectivos' ->> 'lealtad')::boolean), false, 'lealtad nace apagada');

-- Como el cajero.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'cajero', 'role', 'authenticated', 'tenant_id', :'t')::text, true);

-- 4-5) Ve lo de su negocio y no lo ajeno.
select is((select count(*)::int from lealtad_saldos), 1, 'el cajero ve solo los saldos de su negocio');
select is((select count(*)::int from lealtad_programa), 0, 'el programa de otro negocio no se ve');

-- 6-8) No configura ni escribe el libro ni los saldos.
select throws_ok(
  format($$ insert into lealtad_programa (tenant_id, mecanica) values (%L, 'SELLOS') $$, :'t'),
  '42501', null, 'un cajero no crea el programa');
select throws_ok(
  format($$ insert into lealtad_movimientos (tenant_id, cliente_id, tipo, puntos, programa_version) values (%L, %L, 'AJUSTE', 50, 1) $$, :'t', :'cli'),
  '42501', null, 'nadie escribe el libro a mano');
-- Sin GRANT de UPDATE: aquí no filtra RLS, lanza permiso denegado.
select throws_ok(
  format($$ update lealtad_saldos set saldo = 9999 where cliente_id = %L $$, :'cli'),
  '42501', null, 'nadie edita un saldo a mano');

-- 9) Tampoco enciende el módulo.
select throws_ok(
  format($$ update configuracion_tenant set modulo_lealtad_activo = true where tenant_id = %L $$, :'t'),
  '42501', null, 'un cajero no enciende la lealtad');

-- Como el dueño.
select set_config('request.jwt.claims', json_build_object('sub', :'dueno', 'role', 'authenticated', 'tenant_id', :'t')::text, true);

-- 10) Sin add-on no se enciende.
select throws_ok(
  format($$ update configuracion_tenant set modulo_lealtad_activo = true where tenant_id = %L $$, :'t'),
  '42501', null, 'sin el add-on no se enciende');

-- 11-12) El dueño crea su programa, nunca el de otro.
select lives_ok(
  format($$ insert into lealtad_programa (tenant_id, mecanica, porcentaje) values (%L, 'PUNTOS_DINERO', 5) $$, :'t'),
  'el dueño crea el programa');
select throws_ok(
  format($$ insert into lealtad_premios (tenant_id, producto_id, costo) select %L, id, 5 from productos limit 1 $$, :'otro'),
  '42501', null, 'el dueño no crea premios en otro negocio');

-- 13-14) Con add-on y programa, sí enciende, y queda efectivo.
reset role;
insert into tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn)
select :'t', id, (now() at time zone 'America/Mexico_City')::date, true, 100 from addons where codigo = 'LEALTAD';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'dueno', 'role', 'authenticated', 'tenant_id', :'t')::text, true);
select lives_ok(
  format($$ update configuracion_tenant set modulo_lealtad_activo = true where tenant_id = %L $$, :'t'),
  'con add-on y programa, el dueño enciende');
select is((select (modulos_efectivos(:'t') -> 'efectivos' ->> 'lealtad')::boolean), true, 'lealtad queda efectiva');

select * from finish();
rollback;
