-- ============================================================================
-- 0133 · el dinero no se escribe por REST directo a la tabla.
--
-- Auditoría integral 30/09/2026 (B-1). Antes de la 0133 una sesión del negocio (el JWT de un
-- cajero) podía, hablándole a PostgREST directo, bajar el total de un ticket pagado, el monto de
-- un pago, el fondo del turno o el precio del menú, e insertar una cancelación o una devolución
-- sin PIN. Aquí se simula esa petición: rol `authenticated`, claims de la cajera María y
-- `request.path` como lo pone PostgREST ('/tabla' o '/rpc/funcion').
-- ============================================================================
begin;
select plan(26);

\set tenant '99999999-0000-0000-0000-0000000000aa'
\set suc    '99999999-0000-0000-0000-0000000000bb'
\set caja   '99999999-0000-0000-0000-0000000000cc'
\set caja2  '18181818-0000-0000-0000-0000000000c2'
\set maria  '99999999-0000-0000-0000-000000000001'
\set dueno  '99999999-0000-0000-0000-0000000000e1'

-- ----------------------------------------------------------------------------
-- SETUP (superusuario, sin request.path: el guardián no actúa)
-- ----------------------------------------------------------------------------
create temp table ctx (turno uuid, pagado uuid, abierto uuid, vacio uuid, pago uuid, item uuid, mov uuid, prod uuid);
grant all on ctx to authenticated;

insert into cajas (id, tenant_id, sucursal_id, numero, nombre) values (:'caja2', :'tenant', :'suc', 18, 'Caja 18');

do $$
declare
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno uuid; v_t1 uuid; v_t2 uuid; v_t3 uuid; v_prod uuid; v_pago uuid; v_item uuid; v_mov uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_maria, 'tenant_id', v_tenant)::text, true);
  update turnos set estado = 'CERRADO', fecha_cierre = now() where caja_id = v_caja and estado = 'ABIERTO';
  insert into turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
    values (v_tenant, v_suc, v_caja, 'T0018', current_date, v_maria, 500, 'TOTAL') returning id into v_turno;
  select id into v_prod from productos where tenant_id = v_tenant and nombre = 'Hamburguesa Clásica' limit 1;

  v_t1 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, null, null, 't0018-1', v_maria);
  perform agregar_item_a_ticket(v_t1, v_prod, 1, null, '[]'::jsonb, 't0018-1-i');
  v_pago := aplicar_pago(v_t1, 'EFECTIVO'::metodo_pago, 120, 200, null, null, null, false, null, 't0018-1-p');

  v_t2 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, null, null, 't0018-2', v_maria);
  perform agregar_item_a_ticket(v_t2, v_prod, 1, null, '[]'::jsonb, 't0018-2-i');
  select id into v_item from ticket_items where ticket_id = v_t2;

  v_t3 := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, null, null, 't0018-3', v_maria);

  insert into movimientos_caja (tenant_id, sucursal_id, caja_id, turno_id, dia_contable, tipo, monto_mxn, motivo, usuario_solicitante_id)
    values (v_tenant, v_suc, v_caja, v_turno, current_date, 'AJUSTE_POSITIVO', 50, 'fixture', v_maria) returning id into v_mov;

  insert into ctx values (v_turno, v_t1, v_t2, v_t3, v_pago, v_item, v_mov, v_prod);
end $$;

select is((select estado_fiscal::text from tickets where id = (select pagado from ctx)), 'PAGADO', 'fixture: ticket 1 PAGADO');

-- ----------------------------------------------------------------------------
-- COMO LA CAJERA, POR REST DIRECTO
-- ----------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"99999999-0000-0000-0000-000000000001","role":"authenticated","tenant_id":"99999999-0000-0000-0000-0000000000aa"}';
set local "request.path" to '/tickets';

-- Ataques del hallazgo (cada uno funcionaba antes de la 0133)
select throws_ok($$ update tickets set total_mxn = 1, estado_fiscal = 'CANCELADO' where id = (select pagado from ctx) $$,
  '42501', null, 'PATCH /tickets total/estado de un ticket PAGADO: rechazado');
select throws_ok($$ update pagos set monto_mxn = 1 where id = (select pago from ctx) $$,
  '42501', null, 'PATCH /pagos monto_mxn: rechazado');
-- (DELETE /pagos ya lo frenaba RLS —no hay política de borrado— y no llega al guardián; se
-- comprueba abajo que el pago sigue ahí.)
delete from pagos where id = (select pago from ctx);
select throws_ok($$ update turnos set fondo_inicial_mxn = 99999 where id = (select turno from ctx) $$,
  '42501', null, 'PATCH /turnos fondo_inicial_mxn: rechazado');
select throws_ok($$ update ticket_items set precio_unitario_snapshot = 0.01 where id = (select item from ctx) $$,
  '42501', null, 'PATCH /ticket_items precio: rechazado');
select throws_ok($$ update productos set precio_base_mxn = 0.01 where id = (select prod from ctx) $$,
  '42501', null, 'PATCH /productos precio por una cajera: rechazado');
select throws_ok($$ insert into cancelaciones_ticket (tenant_id, sucursal_id, caja_id, turno_id, ticket_id,
      ticket_total_snapshot, ticket_estado_fiscal_previo, motivo, autorizacion_pin_id, usuario_solicitante_id, usuario_autorizo_id)
    select '99999999-0000-0000-0000-0000000000aa', '99999999-0000-0000-0000-0000000000bb', '99999999-0000-0000-0000-0000000000cc',
           turno, pagado, 120, 'PAGADO', 'CLIENTE_DESISTIO', gen_random_uuid(),
           '99999999-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000001' from ctx $$,
  '42501', null, 'POST /cancelaciones_ticket: rechazado');
select throws_ok($$ insert into devoluciones (tenant_id, sucursal_id, caja_id, turno_id, ticket_original_id, alcance, motivo,
      medio_devolucion, total_devuelto_mxn, subtotal_devuelto_mxn, iva_devuelto_mxn, autorizacion_pin_id,
      usuario_solicitante_id, usuario_autorizo_id, estado)
    select '99999999-0000-0000-0000-0000000000aa', '99999999-0000-0000-0000-0000000000bb', '99999999-0000-0000-0000-0000000000cc',
           turno, pagado, 'TOTAL', 'OTRO', 'EFECTIVO', 5000, 4310.34, 689.66, gen_random_uuid(),
           '99999999-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000001', 'BORRADOR' from ctx $$,
  '42501', null, 'POST /devoluciones: rechazado');
select throws_ok($$ update movimientos_caja set monto_mxn = 5000 where id = (select mov from ctx) $$,
  '42501', null, 'PATCH /movimientos_caja después de registrado: rechazado');
select throws_ok($$ insert into movimientos_caja (tenant_id, sucursal_id, caja_id, turno_id, dia_contable, tipo, monto_mxn, motivo, usuario_solicitante_id)
    select '99999999-0000-0000-0000-0000000000aa', '99999999-0000-0000-0000-0000000000bb', '99999999-0000-0000-0000-0000000000cc',
           turno, current_date, 'AJUSTE_NEGATIVO', 300, 'x', '99999999-0000-0000-0000-000000000001' from ctx $$,
  '42501', null, 'POST /movimientos_caja de un tipo del sistema (sin PIN): rechazado');
select throws_ok($$ update tickets set cliente_id = null, nombre_cliente = 'otro' where id = (select pagado from ctx) $$,
  '42501', null, 'datos de la cuenta de un ticket PAGADO: rechazado');
select throws_ok($$ update tickets set deleted_at = now() where id = (select abierto from ctx) $$,
  '42501', null, 'borrar una cuenta con productos: rechazado');
select throws_ok($$ insert into turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id,
      fondo_inicial_mxn, fondo_modo, estado, efectivo_contado_mxn)
    values ('99999999-0000-0000-0000-0000000000aa', '99999999-0000-0000-0000-0000000000bb', '18181818-0000-0000-0000-0000000000c2',
            'T0018-X', current_date, '99999999-0000-0000-0000-000000000001', 500, 'TOTAL', 'CERRADO', 0) $$,
  '42501', null, 'POST /turnos ya cerrado y con cifras: rechazado');

-- pg_graphql entra por /rpc/graphql pero escribe tablas: cuenta como directo.
set local "request.path" to '/rpc/graphql';
select throws_ok($$ update pagos set monto_mxn = 1 where id = (select pago from ctx) $$,
  '42501', null, 'mutación por /rpc/graphql: rechazada');
set local "request.path" to '/tickets';

-- Lo que el POS sí hace directo sigue funcionando
select lives_ok($$ update tickets set nombre_cliente = 'Ana', nota_general = 'sin cebolla', nota_imprime_en_comanda = true,
                                      mesero_id = '99999999-0000-0000-0000-000000000001'
                   where id = (select abierto from ctx) $$,
  'datos de una cuenta ABIERTA (cobro.ts, mesero.ts): permitido');
select lives_ok($$ update ticket_items set enviado_cocina_at = now() where id = (select item from ctx) $$,
  'ticket_items.enviado_cocina_at (enviarACocina): permitido');
select lives_ok($$ update tickets set estado_cocina = 'EN_COCINA' where id = (select abierto from ctx) and estado_cocina = 'SIN_ENVIAR' $$,
  'tickets.estado_cocina (enviarACocina / KDS): permitido');
select lives_ok($$ update tickets set comanda_impresa_at = now() where id = (select pagado from ctx) $$,
  'tickets.comanda_impresa_at en un PAGADO (marcarComandaImpresa): permitido');
select lives_ok($$ update turnos set evento_comision_mxn = 150 where id = (select turno from ctx) $$,
  'turnos.evento_comision_mxn (registrarComisionEvento): permitido');
select lives_ok($$ update tickets set deleted_at = now(), deleted_by = '99999999-0000-0000-0000-000000000001' where id = (select vacio from ctx) $$,
  'borrar una cuenta vacía (borrarCuentaVacia): permitido');
select lives_ok($$ insert into turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
    values ('99999999-0000-0000-0000-0000000000aa', '99999999-0000-0000-0000-0000000000bb', '18181818-0000-0000-0000-0000000000c2',
            'T0018-OK', current_date, '99999999-0000-0000-0000-000000000001', 500, 'TOTAL') $$,
  'POST /turnos (abrirTurno): permitido');

-- El flujo legítimo por RPC no pasa por el guardián
set local "request.path" to '/rpc/aplicar_pago';
select lives_ok($$ select aplicar_pago((select abierto from ctx), 'EFECTIVO'::metodo_pago, 120, 120, null, null, null, false, null, 't0018-2-p') $$,
  'aplicar_pago por /rpc/: permitido');
select is((select estado_fiscal::text from tickets where id = (select abierto from ctx)), 'PAGADO',
  'y el ticket queda PAGADO');

-- El dueño sí administra el catálogo por REST (panel)
set local "request.jwt.claims" to '{"sub":"99999999-0000-0000-0000-0000000000e1","role":"authenticated","tenant_id":"99999999-0000-0000-0000-0000000000aa"}';
set local "request.path" to '/productos';
select lives_ok($$ update productos set precio_base_mxn = 125 where id = (select prod from ctx) $$,
  'el dueño cambia un precio desde el panel: permitido');

reset role;
select is((select total_mxn from tickets where id = (select pagado from ctx)), 120.00::numeric,
  'el total del ticket pagado no cambió');
select is((select monto_mxn from pagos where id = (select pago from ctx)), 120.00::numeric,
  'el pago sigue ahí y con su monto');

select * from finish();
rollback;
