-- ============================================================================
-- 0140 · ajustes de la revisión de regresiones (auditoría integral 30/09/2026).
-- ============================================================================
begin;
select plan(7);

\set t      '99999999-0000-0000-0000-0000000000aa'
\set s      '99999999-0000-0000-0000-0000000000bb'
\set c      '99999999-0000-0000-0000-0000000000cc'
\set cajero '99999999-0000-0000-0000-000000000001'
\set super  '99999999-0000-0000-0000-0000000000f1'
\set papas  'b0000000-0000-0000-0000-0000000000f2'

create temp table ctx (turno uuid, ticket uuid, item uuid) on commit drop;
grant all on ctx to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'cajero', 'role', 'authenticated', 'tenant_id', :'t')::text, true);

-- 1–4) El guardián de la 0133 reconoce una RPC aunque la ruta conserve el prefijo del gateway.
select set_config('request.path', '/rpc/aplicar_pago', true);
select ok(not _es_escritura_rest_directa(), '/rpc/x es RPC');
select set_config('request.path', '/rest/v1/rpc/aplicar_pago', true);
select ok(not _es_escritura_rest_directa(), '/rest/v1/rpc/x también es RPC');
select set_config('request.path', '/rest/v1/tickets', true);
select ok(_es_escritura_rest_directa(), '/rest/v1/tickets es escritura directa');
select set_config('request.path', '/tickets', true);
select ok(_es_escritura_rest_directa(), '/tickets es escritura directa');

-- 5–7) Descuento fijo MAYOR que el renglón: el POS autoriza el monto topado (55) y la RPC lo acepta.
select set_config('request.path', '/rpc/abrir_ticket', true);
reset role;
update turnos set estado = 'CERRADO', fecha_cierre = now() where caja_id = :'c' and estado = 'ABIERTO';
insert into turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn)
  values (:'t', :'s', :'c', 'T-0024', current_date, :'cajero', 500) returning id as turno \gset
set local role authenticated;
insert into ctx (turno) values (:'turno');
update ctx set ticket = abrir_ticket(:'s', :'c', :'turno', 'PARA_LLEVAR', null, null, null, :'cajero');
update ctx set item = agregar_item_a_ticket(ticket, :'papas', 1, null, '[]'::jsonb, null);
select is((select total_item_mxn from ticket_items where id = (select item from ctx)), 55.00::numeric, 'renglón de $55');

reset role;
insert into autorizaciones_pin (id, tenant_id, usuario_solicitante_id, usuario_autorizo_id, accion,
                                permiso_codigo, entidad_tipo, entidad_id, monto_mxn, motivo)
select '24242424-0000-0000-0000-00000000a001', :'t', :'cajero', :'super', 'descuento_item',
       'descuento.manual_aplicar', 'ticket_item', item, 55, 'prueba 0024' from ctx;
set local role authenticated;
select set_config('request.path', '/rpc/aplicar_descuento_manual', true);

select lives_ok($$
  select aplicar_descuento_manual((select ticket from ctx), (select item from ctx), 'MONTO_FIJO', 60,
    'OTRO', 'prueba', '24242424-0000-0000-0000-00000000a001', null, null)
$$, 'un descuento fijo de $60 sobre un renglón de $55 se aplica con la autorización de $55');
select is((select monto_descontado_mxn from ticket_descuentos_manuales where ticket_item_id = (select item from ctx)),
  55.00::numeric, 'y queda registrado por lo que de verdad se descontó ($55)');

select * from finish();
rollback;
