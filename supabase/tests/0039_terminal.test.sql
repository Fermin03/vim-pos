-- ============================================================================
-- 0169 · terminal integrada: cada negocio ve solo lo suyo, nadie escribe desde el cliente, y los
-- tokens de Mercado Pago solo se alcanzan como service_role (viven en Vault).
-- ============================================================================
begin;
select plan(10);

\set t      '99999999-0000-0000-0000-0000000000aa'
\set cajero '99999999-0000-0000-0000-000000000001'
\set otro   '39393939-0000-0000-0000-0000000000aa'
\set con    '39393939-0000-0000-0000-000000000001'
\set con2   '39393939-0000-0000-0000-000000000002'

insert into tenants (id, codigo, nombre_comercial, estado, vertical_principal)
values (:'otro', 'tenant-0039', 'Otro negocio', 'INTERNO', 'QUICK_SERVICE');
insert into terminal_conexiones (id, tenant_id, cuenta_id_externo) values
  (:'con', :'t', '111'), (:'con2', :'otro', '222');
insert into terminal_cobros (id, tenant_id, sucursal_id, caja_id, conexion_id, ticket_id, monto_mxn)
select gen_random_uuid(), :'t', c.sucursal_id, c.id, :'con', gen_random_uuid(), 10
  from cajas c where c.tenant_id = :'t' limit 1;

-- 1-3) Los tokens: se guardan, se leen, se renuevan (como service_role, que es quien corre aquí).
select terminal_guardar_tokens(:'con', 'acc-1', 'ref-1', now() + interval '180 days');
select is((select access_token || '/' || refresh_token from terminal_leer_tokens(:'con')), 'acc-1/ref-1', 'los tokens se leen de Vault');
select terminal_guardar_tokens(:'con', 'acc-2', 'ref-2', now() + interval '180 days');
select is((select access_token || '/' || refresh_token from terminal_leer_tokens(:'con')), 'acc-2/ref-2', 'renovar reemplaza los dos');
select is((select count(*)::int from terminal_leer_tokens(:'con2') where access_token is not null), 0, 'otra conexión no trae los de esta');

-- Como el cajero.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'cajero', 'role', 'authenticated', 'tenant_id', :'t')::text, true);

-- 4-5) Ve lo de su negocio y no lo ajeno.
select is((select count(*)::int from terminal_conexiones), 1, 'solo la conexión de su negocio');
select is((select count(*)::int from terminal_cobros), 1, 'solo los cobros de su negocio');

-- 6-8) No escribe nada.
select throws_ok(
  format($$ insert into terminal_conexiones (tenant_id, cuenta_id_externo) values (%L, '333') $$, :'t'),
  '42501', null, 'el cliente no crea conexiones');
select throws_ok($$ update terminal_cobros set estado = 'APROBADO' $$, '42501', null, 'el cliente no aprueba un cobro');
select throws_ok($$ select count(*) from terminal_eventos $$, '42501', null, 'la bitácora de avisos no se lee');

-- 9-10) Ni alcanza los tokens.
select throws_ok(format($$ select * from terminal_leer_tokens(%L) $$, :'con'), '42501', null, 'el cliente no lee tokens');
select throws_ok(format($$ select terminal_guardar_tokens(%L, 'x', 'y', now()) $$, :'con'), '42501', null, 'el cliente no guarda tokens');

select * from finish();
rollback;
