-- ============================================================================
-- 0134 · una autorización PIN sirve para UNA acción, y el cobro con propina no se cierra antes.
--
-- Auditoría integral 30/09/2026 (B-2 … B-5). Antes de la 0134:
--   · cualquier autorización del negocio —de otro permiso, de otro ticket, vieja, ya usada, o
--     la que la cajera se da sola con 'venta.registrar'— servía para cancelar un ticket pagado,
--     y el cliente decía quién había autorizado;
--   · una sangría autorizada por $100 servía para varias, y se editaba después;
--   · el cobro dividido con propina cerraba el ticket al cubrir el total y la propina ya no se
--     podía cobrar; la propina se cambiaba con la cuenta cobrada; aplicar_pago aceptaba < 0.
-- Todo como la cajera María (rol authenticated) llamando RPCs por PostgREST.
-- ============================================================================
begin;
select plan(31);

\set tenant '99999999-0000-0000-0000-0000000000aa'
\set suc    '99999999-0000-0000-0000-0000000000bb'
\set caja   '99999999-0000-0000-0000-0000000000cc'
\set maria  '99999999-0000-0000-0000-000000000001'
\set diego  '99999999-0000-0000-0000-0000000000f1'
\set dueno  '99999999-0000-0000-0000-0000000000e1'
\set tenant_b '19191919-0000-0000-0000-0000000000aa'

-- ----------------------------------------------------------------------------
-- SETUP (superusuario)
-- ----------------------------------------------------------------------------
insert into tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  values (:'tenant_b', 'tenant-b-0019', 'Tenant B', 'ACTIVO', 'QUICK_SERVICE');

create temp table ctx (clave text primary key, id uuid);
grant all on ctx to authenticated;

do $$
declare
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno uuid; v_prod uuid; v_t uuid; i int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_maria, 'tenant_id', v_tenant)::text, true);
  update turnos set estado = 'CERRADO', fecha_cierre = now() where caja_id = v_caja and estado = 'ABIERTO';
  insert into turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
    values (v_tenant, v_suc, v_caja, 'T0019', current_date, v_maria, 500, 'TOTAL') returning id into v_turno;
  insert into ctx values ('turno', v_turno);
  select id into v_prod from productos where tenant_id = v_tenant and nombre = 'Hamburguesa Clásica' limit 1;

  -- pagado1, pagado2: cobrados ($120). abierto: 3 renglones de $120. propina: $120 sin cobrar.
  v_t := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, null, null, 't19-p1', v_maria);
  perform agregar_item_a_ticket(v_t, v_prod, 1, null, '[]'::jsonb, 't19-p1-i');
  perform aplicar_pago(v_t, 'EFECTIVO'::metodo_pago, 120, 120, null, null, null, false, null, 't19-p1-p');
  insert into ctx values ('pagado1', v_t);
  v_t := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, null, null, 't19-p2', v_maria);
  perform agregar_item_a_ticket(v_t, v_prod, 1, null, '[]'::jsonb, 't19-p2-i');
  perform aplicar_pago(v_t, 'EFECTIVO'::metodo_pago, 120, 120, null, null, null, false, null, 't19-p2-p');
  insert into ctx values ('pagado2', v_t);
  v_t := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, null, null, 't19-ab', v_maria);
  for i in 1..3 loop
    insert into ctx values ('item' || i, agregar_item_a_ticket(v_t, v_prod, 1, null, '[]'::jsonb, 't19-ab-' || i));
  end loop;
  insert into ctx values ('abierto', v_t);
  v_t := abrir_ticket(v_suc, v_caja, v_turno, 'PARA_LLEVAR'::modo_servicio, null, null, 't19-pr', v_maria);
  perform agregar_item_a_ticket(v_t, v_prod, 1, null, '[]'::jsonb, 't19-pr-i');
  insert into ctx values ('propina', v_t);
end $$;

-- Autorizaciones "como las deja verificar_autorizacion_pin": Diego (SUPERVISOR) autoriza a María.
create function pg_temp.aut(p_clave text, p_permiso text, p_entidad uuid, p_monto numeric,
                            p_tenant uuid default '99999999-0000-0000-0000-0000000000aa',
                            p_fecha timestamptz default now())
returns void language sql as $$
  with a as (
    insert into autorizaciones_pin (tenant_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                    accion, permiso_codigo, entidad_tipo, entidad_id, monto_mxn, motivo, fecha)
    values (p_tenant, '99999999-0000-0000-0000-0000000000cc', (select id from ctx where clave = 'turno'),
            '99999999-0000-0000-0000-000000000001', '99999999-0000-0000-0000-0000000000f1',
            'prueba', p_permiso, 'ticket', p_entidad, p_monto, 'prueba 0019', p_fecha)
    returning id)
  insert into ctx select p_clave, id from a;
$$;
create function pg_temp.id(p_clave text) returns uuid language sql stable as $$ select id from ctx where clave = p_clave $$;
grant execute on function pg_temp.id(text) to authenticated;

select pg_temp.aut('reimp',       'cocina.reimprimir_comanda', pg_temp.id('pagado1'), null);
select pg_temp.aut('cancel_otro', 'venta.cancelar_pagada',     pg_temp.id('pagado2'), null);
select pg_temp.aut('cancel_vieja','venta.cancelar_pagada',     pg_temp.id('pagado1'), null, :'tenant', now() - interval '11 minutes');
select pg_temp.aut('cancel_b',    'venta.cancelar_pagada',     pg_temp.id('pagado1'), null, :'tenant_b');
select pg_temp.aut('cancel_ok',   'venta.cancelar_pagada',     pg_temp.id('pagado1'), 120);
select pg_temp.aut('desc_libre',  'descuento.manual_aplicar',  pg_temp.id('abierto'), null);
select pg_temp.aut('desc_20',     'descuento.manual_aplicar',  pg_temp.id('abierto'), 20);
select pg_temp.aut('items_240',   'venta.cancelar_abierta',    pg_temp.id('abierto'), 240);
select pg_temp.aut('sangria_100', 'caja.sangria',              null, 100);

create function pg_temp.cancelar(p_ticket uuid, p_aut uuid) returns uuid language sql as $$
  select cancelar_ticket_pagado(p_ticket, '99999999-0000-0000-0000-0000000000cc', pg_temp.id('turno'),
    'CLIENTE_DESISTIO'::cancelacion_motivo, null, p_aut,
    '99999999-0000-0000-0000-000000000001', '99999999-0000-0000-0000-0000000000e1',  -- el cliente dice "autorizó el DUEÑO"
    true, false, true, 'EFECTIVO'::devolucion_medio, null, null);
$$;
grant execute on function pg_temp.cancelar(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- COMO LA CAJERA, POR /rpc/
-- ----------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"99999999-0000-0000-0000-000000000001","role":"authenticated","tenant_id":"99999999-0000-0000-0000-0000000000aa"}';
set local "request.path" to '/rpc/cancelar_ticket_pagado';


-- El ataque reproducido: la cajera se autoriza sola con un permiso que sí tiene...
select lives_ok($$ select registrar_autorizacion_propia('cancelar', 'venta.registrar', 'ticket',
    pg_temp.id('pagado1'), null, 'x', '99999999-0000-0000-0000-0000000000cc', pg_temp.id('turno')) $$,
  'la cajera se da una autorización de venta.registrar');
select throws_ok($$ select pg_temp.cancelar(pg_temp.id('pagado1'),
    (select id from autorizaciones_pin where permiso_codigo = 'venta.registrar' order by fecha desc limit 1)) $$,
  '42501', null, '…y ya no le sirve para cancelar un ticket PAGADO');
select throws_ok($$ select pg_temp.cancelar(pg_temp.id('pagado1'), pg_temp.id('reimp')) $$,
  '42501', null, 'una autorización de reimprimir comanda no cancela un ticket');
select throws_ok($$ select pg_temp.cancelar(pg_temp.id('pagado1'), pg_temp.id('cancel_otro')) $$,
  '42501', null, 'la autorización de cancelar OTRO ticket no sirve');
select throws_ok($$ select pg_temp.cancelar(pg_temp.id('pagado1'), pg_temp.id('cancel_vieja')) $$,
  '42501', null, 'una autorización de hace 11 minutos expiró');
select throws_ok($$ select pg_temp.cancelar(pg_temp.id('pagado1'), pg_temp.id('cancel_b')) $$,
  '42501', null, 'una autorización de otro negocio no sirve');
select throws_ok($$ select pg_temp.cancelar(pg_temp.id('pagado1'), null) $$,
  '42501', null, 'sin autorización no se cancela');
select is((select estado_fiscal::text from tickets where id = pg_temp.id('pagado1')), 'PAGADO',
  'tras los intentos, el ticket sigue PAGADO');

-- La autorización correcta sí cancela, y quién autorizó sale de ella, no del cliente.
select lives_ok($$ select pg_temp.cancelar(pg_temp.id('pagado1'), pg_temp.id('cancel_ok')) $$,
  'la autorización correcta cancela el ticket (con su devolución, en la misma transacción)');
select is((select estado_fiscal::text from tickets where id = pg_temp.id('pagado1')), 'CANCELADO', 'ticket CANCELADO');
select is((select usuario_autorizo_id::text from cancelaciones_ticket where ticket_id = pg_temp.id('pagado1')),
  '99999999-0000-0000-0000-0000000000f1', 'la cancelación registra a Diego (el de la autorización), no al dueño que mandó el cliente');
select is((select usuario_autorizo_id::text from devoluciones where ticket_original_id = pg_temp.id('pagado1')),
  '99999999-0000-0000-0000-0000000000f1', 'la devolución automática, también');
select throws_ok($$ select pg_temp.cancelar(pg_temp.id('pagado2'), pg_temp.id('cancel_ok')) $$,
  '42501', null, 'la autorización de un ticket no sirve para otro');

-- Uso único. Toda esta prueba es UNA transacción, y dentro de la misma transacción una
-- autorización sí se reusa (cancelar_ticket_pagado → crear_devolucion). Para simular la petición
-- siguiente se envejece la marca de uso, como si la hubiera dejado otra transacción.
set local "request.path" to '/rpc/aplicar_descuento_manual';
select lives_ok($$ select aplicar_descuento_manual(pg_temp.id('abierto'), null, 'MONTO_FIJO', 5, 'CLIENTE_FRECUENTE', null,
    pg_temp.id('desc_libre'), '99999999-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000001', null) $$,
  'un descuento con una autorización sin monto');
reset role;
update autorizaciones_pin set usada_at = usada_at - interval '1 second' where id = pg_temp.id('desc_libre');
set local role authenticated;
select throws_like($$ select aplicar_descuento_manual(pg_temp.id('abierto'), null, 'MONTO_FIJO', 5, 'CLIENTE_FRECUENTE', null,
    pg_temp.id('desc_libre'), '99999999-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000001', null) $$,
  '%ya se usó%', 'en la petición siguiente la misma autorización ya no sirve');

-- Descuento: el monto autorizado es un tope.
set local "request.path" to '/rpc/aplicar_descuento_manual';
select throws_ok($$ select aplicar_descuento_manual(pg_temp.id('abierto'), null, 'MONTO_FIJO', 50, 'CLIENTE_FRECUENTE', null,
    pg_temp.id('desc_20'), '99999999-0000-0000-0000-000000000001', '99999999-0000-0000-0000-0000000000e1', null) $$,
  '42501', null, 'una autorización de $20 no alcanza para $50 de descuento');
select lives_ok($$ select aplicar_descuento_manual(pg_temp.id('abierto'), null, 'MONTO_FIJO', 20, 'CLIENTE_FRECUENTE', null,
    pg_temp.id('desc_20'), '99999999-0000-0000-0000-000000000001', '99999999-0000-0000-0000-0000000000e1', null) $$,
  'sí para $20');
select throws_ok($$ select aplicar_descuento_manual(pg_temp.id('abierto'), null, 'MONTO_FIJO', 20, 'CLIENTE_FRECUENTE', null,
    pg_temp.id('desc_20'), '99999999-0000-0000-0000-000000000001', '99999999-0000-0000-0000-0000000000e1', null) $$,
  '42501', null, 'y no para un segundo descuento');

-- Cancelar varios renglones con UNA autorización (lo que hace modal-cancelar-items), hasta el monto.
set local "request.path" to '/rpc/cancelar_item_ticket';
select lives_ok($$ select cancelar_item_ticket(pg_temp.id('item1'), 'x', pg_temp.id('items_240')) $$, 'renglón 1 de 2 autorizados');
select lives_ok($$ select cancelar_item_ticket(pg_temp.id('item2'), 'x', pg_temp.id('items_240')) $$, 'renglón 2 de 2 autorizados');
select throws_ok($$ select cancelar_item_ticket(pg_temp.id('item3'), 'x', pg_temp.id('items_240')) $$,
  '42501', null, 'un tercer renglón pasa del monto autorizado');

-- Movimientos de caja: una sangría por autorización, y lo autorizado no se edita después.
set local "request.path" to '/movimientos_caja';
select lives_ok($$ insert into movimientos_caja (tenant_id, sucursal_id, caja_id, turno_id, dia_contable, tipo, monto_mxn, motivo,
                                                 usuario_solicitante_id, autorizacion_pin_id, usuario_autorizo_id)
    values ('99999999-0000-0000-0000-0000000000aa', '99999999-0000-0000-0000-0000000000bb', '99999999-0000-0000-0000-0000000000cc',
            pg_temp.id('turno'), current_date, 'SANGRIA', 100, 'x', '99999999-0000-0000-0000-000000000001',
            pg_temp.id('sangria_100'), '99999999-0000-0000-0000-0000000000e1') $$,
  'sangría de $100 con su autorización (movimientos.ts)');
select is((select usuario_autorizo_id::text from movimientos_caja where autorizacion_pin_id = pg_temp.id('sangria_100')),
  '99999999-0000-0000-0000-0000000000f1', 'el movimiento registra a Diego, no al dueño que mandó el cliente');
select throws_ok($$ insert into movimientos_caja (tenant_id, sucursal_id, caja_id, turno_id, dia_contable, tipo, monto_mxn, motivo,
                                                  usuario_solicitante_id, autorizacion_pin_id)
    values ('99999999-0000-0000-0000-0000000000aa', '99999999-0000-0000-0000-0000000000bb', '99999999-0000-0000-0000-0000000000cc',
            pg_temp.id('turno'), current_date, 'SANGRIA', 100, 'x', '99999999-0000-0000-0000-000000000001', pg_temp.id('sangria_100')) $$,
  '42501', null, 'la misma autorización no saca una segunda sangría');

-- Cobro dividido con propina: el ticket no se cierra hasta cubrir total + propina.
set local "request.path" to '/rpc/aplicar_pago';
select lives_ok($$ select establecer_propina_ticket(pg_temp.id('propina'), 18) $$, 'propina de $18');
select lives_ok($$ select aplicar_pago(pg_temp.id('propina'), 'EFECTIVO'::metodo_pago, 60, 60, null, null, null, false, null, null);
                   select aplicar_pago(pg_temp.id('propina'), 'TARJETA_DEBITO'::metodo_pago, 60, null, null, null, null, false, null, null) $$,
  'dos pagos de $60');
select is((select estado_fiscal::text from tickets where id = pg_temp.id('propina')), 'ABIERTO',
  'cubierto el total pero no la propina: sigue ABIERTO');
select lives_ok($$ select aplicar_pago(pg_temp.id('propina'), 'EFECTIVO'::metodo_pago, 18, 18, null, null, null, false, null, null) $$,
  'el pago de la propina entra');
select is((select estado_fiscal::text || ' ' || monto_pagado_mxn from tickets where id = pg_temp.id('propina')), 'PAGADO 138.00',
  'y ahora sí: PAGADO con 138');
select throws_ok($$ select establecer_propina_ticket(pg_temp.id('propina'), 0) $$,
  null, null, 'la propina de una cuenta PAGADA ya no se cambia');
select throws_ok($$ select aplicar_pago(pg_temp.id('abierto'), 'EFECTIVO'::metodo_pago, -500, null, null, null, null, false, null, null) $$,
  '23514', null, 'aplicar_pago rechaza montos negativos');

select * from finish();
rollback;
