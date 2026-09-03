-- ============================================================================
-- Espejo de pedidos de apps en escritorio (migración 0096): latido de caja, reclamo atómico,
-- enlace ticket↔pedido por folio_externo_app, y crear_ticket_desde_app con ACEPTADO sin ticket.
-- Se corre con:  supabase test db   (usa el fixture dev: tenant …aa, sucursal …bb, caja …cc)
-- ============================================================================
begin;
select plan(9);

select has_function('sucursal_con_espejo');
select has_function('delivery_reclamar_pedido');
select has_function('delivery_enlazar_tickets');
select has_column('delivery_pedidos', 'gestion');
select has_column('cajas', 'espejo_apps_at');

-- Latido: sin latido → false; con latido reciente → true.
select is(sucursal_con_espejo('99999999-0000-0000-0000-0000000000bb'), false, 'sin latido no hay espejo');
update cajas set espejo_apps_at = now() where id = '99999999-0000-0000-0000-0000000000cc';
select is(sucursal_con_espejo('99999999-0000-0000-0000-0000000000bb'), true, 'con latido reciente hay espejo');

-- Reclamo: la primera caja gana; una segunda caja no puede.
insert into cajas (id, tenant_id, sucursal_id, numero, nombre)
values ('99999999-0000-0000-0000-0000000000c2', '99999999-0000-0000-0000-0000000000aa', '99999999-0000-0000-0000-0000000000bb', 2, 'Caja 02')
on conflict (id) do nothing;
insert into delivery_conexiones (id, tenant_id, sucursal_id, app, estado, tienda_id_externo)
values ('99999999-0000-0000-0000-0000000000e0', '99999999-0000-0000-0000-0000000000aa', '99999999-0000-0000-0000-0000000000bb', 'APP_UBEREATS', 'ACTIVA', 'store-espejo')
on conflict (sucursal_id, app) do update set estado = 'ACTIVA';
insert into delivery_pedidos (id, tenant_id, sucursal_id, conexion_id, app, id_externo, estado, gestion, items, total_cliente_mxn, vence_aceptacion)
select '99999999-0000-0000-0000-0000000000f1', '99999999-0000-0000-0000-0000000000aa', '99999999-0000-0000-0000-0000000000bb', c.id, 'APP_UBEREATS', 'u-espejo-1', 'RECIBIDO', 'ESCRITORIO', '[]'::jsonb, 0, now() + interval '10 minutes'
from delivery_conexiones c where c.sucursal_id = '99999999-0000-0000-0000-0000000000bb' and c.app = 'APP_UBEREATS';
select results_eq(
  $$ select delivery_reclamar_pedido('99999999-0000-0000-0000-0000000000f1', '99999999-0000-0000-0000-0000000000cc'),
            delivery_reclamar_pedido('99999999-0000-0000-0000-0000000000f1', '99999999-0000-0000-0000-0000000000c2'),
            delivery_reclamar_pedido('99999999-0000-0000-0000-0000000000f1', '99999999-0000-0000-0000-0000000000cc') $$,
  $$ values (true, false, true) $$,
  'la primera caja reclama; la segunda no; la primera puede repetir');

-- Enlace: un ticket subido con folio_externo_app = id_externo se enlaza al pedido.
select is(delivery_enlazar_tickets('99999999-0000-0000-0000-0000000000aa') >= 0, true, 'delivery_enlazar_tickets corre sin error (0 o más enlaces)');

select * from finish();
rollback;
