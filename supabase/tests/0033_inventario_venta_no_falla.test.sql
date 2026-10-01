-- ============================================================================
-- 0148 · La venta, la cancelación y la devolución de un negocio SIN el módulo de inventario
-- no fallan — probado con los roles de verdad, no como superusuario.
--
--   · la cajera (rol authenticated, por RPC) vende, cancela y devuelve en un negocio al que VIM le
--     negó el módulo: todo pasa;
--   · una venta que SÍ descontó se cancela/devuelve DESPUÉS de apagarse el interruptor y las
--     existencias regresan (la reversa sigue a la venta, no al interruptor);
--   · una venta que NO descontó no "regresa" nada;
--   · `service_role` y el push de una caja (`sync_push_snapshot`) con movimientos de venta de ese
--     negocio entran sin error;
--   · lo que el candado SÍ cierra: escribir existencias directo por REST y fabricar un movimiento
--     "de venta" con un INSERT directo.
--
-- Se corre con:  supabase test db
-- ============================================================================
begin;
select plan(24);

create temp table ctx (clave text primary key, id uuid);
grant all on ctx to authenticated, service_role;
create function pg_temp.id(p_clave text) returns uuid language sql stable as $$ select id from ctx where clave = p_clave $$;
grant execute on function pg_temp.id(text) to authenticated, service_role;

-- ── SETUP (superusuario): el negocio del fixture CON inventario, vende tres veces descontando ──
do $$
declare
  v_t uuid := '99999999-0000-0000-0000-0000000000aa';
  v_s uuid := '99999999-0000-0000-0000-0000000000bb';
  v_c uuid := '99999999-0000-0000-0000-0000000000cc';
  v_m uuid := '99999999-0000-0000-0000-000000000001';
  v_pza uuid; v_insumo uuid; v_prod uuid; v_receta uuid; v_turno uuid; v_tk uuid; k text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_m, 'tenant_id', v_t)::text, true);
  delete from tenant_feature_flags where tenant_id = v_t and flag_codigo = 'recetas';
  select id into v_pza from unidades_medida where tenant_id = v_t and codigo = 'PZA' limit 1;
  select id into v_prod from productos where tenant_id = v_t and nombre = 'Hamburguesa Clásica' limit 1;
  insert into insumos (tenant_id, nombre, unidad_medida_id, categoria, costo_unitario_mxn)
    values (v_t, 'Pan 0033', v_pza, 'OTROS', 5) returning id into v_insumo;
  insert into insumo_stock_sucursal (tenant_id, insumo_id, sucursal_id, stock_actual) values (v_t, v_insumo, v_s, 10);
  delete from receta_componentes where receta_id in (select id from recetas where producto_id = v_prod);
  delete from recetas where producto_id = v_prod;
  insert into recetas (tenant_id, producto_id, activa) values (v_t, v_prod, true) returning id into v_receta;
  insert into receta_componentes (tenant_id, receta_id, insumo_id, cantidad) values (v_t, v_receta, v_insumo, 1);
  insert into configuracion_tenant (tenant_id, modulo_inventario_activo) values (v_t, true)
    on conflict (tenant_id) do update set modulo_inventario_activo = true;
  update turnos set estado = 'CERRADO', fecha_cierre = now() where caja_id = v_c and estado = 'ABIERTO';
  insert into turnos (tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
    values (v_t, v_s, v_c, 'T0033', current_date, v_m, 500, 'TOTAL') returning id into v_turno;
  insert into ctx values ('turno', v_turno), ('insumo', v_insumo), ('prod', v_prod);

  -- con_c (se cancelará) y con_d (se devolverá): vendidas CON descuento. Existencias: 10 → 8.
  foreach k in array array['con_c', 'con_d'] loop
    v_tk := abrir_ticket(v_s, v_c, v_turno, 'PARA_LLEVAR'::modo_servicio, null, null, 't33-' || k, v_m);
    insert into ctx values ('item_' || k, agregar_item_a_ticket(v_tk, v_prod, 1, null, '[]'::jsonb, 't33-i-' || k));
    perform aplicar_pago(v_tk, 'EFECTIVO'::metodo_pago, 120, 120, null, null, null, false, null, 't33-p-' || k);
    insert into ctx values (k, v_tk);
  end loop;
end $$;

select is((select stock_actual from insumo_stock_sucursal where insumo_id = pg_temp.id('insumo')), 8::numeric,
  'preparación: dos ventas con el módulo descontaron dos piezas');

-- VIM le niega el módulo: el interruptor se apaga solo.
insert into tenant_feature_flags (tenant_id, flag_codigo, activado, motivo)
values ('99999999-0000-0000-0000-0000000000aa', 'recetas', false, '0033: sin inventario');
select is((select modulo_inventario_activo from configuracion_tenant where tenant_id = '99999999-0000-0000-0000-0000000000aa'), false,
  'sin el módulo, el descuento quedó apagado');

-- Autorizaciones (Diego, supervisor, autoriza a María), como las deja verificar_autorizacion_pin.
create function pg_temp.aut(p_clave text, p_permiso text, p_entidad uuid, p_monto numeric) returns void language sql as $$
  with a as (
    insert into autorizaciones_pin (tenant_id, caja_id, turno_id, usuario_solicitante_id, usuario_autorizo_id,
                                    accion, permiso_codigo, entidad_tipo, entidad_id, monto_mxn, motivo)
    values ('99999999-0000-0000-0000-0000000000aa', '99999999-0000-0000-0000-0000000000cc', (select id from ctx where clave = 'turno'),
            '99999999-0000-0000-0000-000000000001', '99999999-0000-0000-0000-0000000000f1',
            'prueba', p_permiso, 'ticket', p_entidad, p_monto, 'prueba 0033')
    returning id)
  insert into ctx select p_clave, id from a;
$$;
select pg_temp.aut('aut_c', 'venta.cancelar_pagada', pg_temp.id('con_c'), 120);
select pg_temp.aut('aut_d', 'venta.devolucion', pg_temp.id('con_d'), 120);

-- ── 1) La cajera, con su sesión y por RPC, en un negocio SIN el módulo ─────────────────────────
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"99999999-0000-0000-0000-000000000001","role":"authenticated","tenant_id":"99999999-0000-0000-0000-0000000000aa"}';
set local "request.path" to '/rpc/aplicar_pago';

select lives_ok($$
  insert into ctx values ('sin', abrir_ticket('99999999-0000-0000-0000-0000000000bb', '99999999-0000-0000-0000-0000000000cc', pg_temp.id('turno'),
    'PARA_LLEVAR'::modo_servicio, null, null, 't33-sin', '99999999-0000-0000-0000-000000000001')) $$, 'abre una cuenta');
select lives_ok($$ select agregar_item_a_ticket(pg_temp.id('sin'), pg_temp.id('prod'), 1, null, '[]'::jsonb, 't33-i-sin') $$, 'agrega un producto CON receta');
select lives_ok($$ select aplicar_pago(pg_temp.id('sin'), 'EFECTIVO'::metodo_pago, 120, 120, null, null, null, false, null, 't33-p-sin') $$,
  'COBRA: la venta no falla por no tener inventario');
select is((select estado_fiscal::text from tickets where id = pg_temp.id('sin')), 'PAGADO', 'la venta quedó pagada');
select is((select count(*)::int from movimientos_inventario where ticket_id = pg_temp.id('sin')), 0, 'y no movió inventario');

-- Cancelación con devolución de dinero de una venta que SÍ descontó.
set local "request.path" to '/rpc/cancelar_ticket_pagado';
select lives_ok($$
  select cancelar_ticket_pagado(pg_temp.id('con_c'), '99999999-0000-0000-0000-0000000000cc', pg_temp.id('turno'),
    'CLIENTE_DESISTIO'::cancelacion_motivo, null, pg_temp.id('aut_c'),
    '99999999-0000-0000-0000-000000000001', '99999999-0000-0000-0000-0000000000f1',
    true, false, true, 'EFECTIVO'::devolucion_medio, null, null) $$,
  'CANCELA una venta pagada (con su devolución de dinero) sin el módulo');
select is((select estado_fiscal::text from tickets where id = pg_temp.id('con_c')), 'CANCELADO', 'el ticket quedó cancelado');
select is((select stock_actual from insumo_stock_sucursal where insumo_id = pg_temp.id('insumo')), 9::numeric,
  'y regresó la pieza que esa venta había descontado, aunque el interruptor ya esté apagado');

-- Devolución de otra venta que SÍ descontó.
set local "request.path" to '/rpc/crear_devolucion';
select lives_ok($$
  insert into ctx values ('dev', crear_devolucion(
    p_ticket_original_id := pg_temp.id('con_d'), p_caja_id := '99999999-0000-0000-0000-0000000000cc', p_turno_id := pg_temp.id('turno'),
    p_alcance := 'TOTAL'::devolucion_alcance, p_motivo := 'PRODUCTO_DEFECTUOSO'::devolucion_motivo,
    p_motivo_texto := 'fría', p_medio_devolucion := 'EFECTIVO'::devolucion_medio,
    p_autorizacion_pin_id := pg_temp.id('aut_d'),
    p_usuario_solicitante_id := '99999999-0000-0000-0000-000000000001', p_usuario_autorizo_id := '99999999-0000-0000-0000-0000000000f1',
    p_items := jsonb_build_array(jsonb_build_object('ticket_item_id', pg_temp.id('item_con_d'), 'cantidad_devuelta', 1)),
    p_reversar_inventario := true, p_nota := null)) $$, 'crea una DEVOLUCIÓN sin el módulo');
set local "request.path" to '/rpc/confirmar_devolucion';
select lives_ok($$ select confirmar_devolucion(pg_temp.id('dev'), '99999999-0000-0000-0000-000000000001') $$, 'y la confirma');
select is((select stock_actual from insumo_stock_sucursal where insumo_id = pg_temp.id('insumo')), 10::numeric,
  'la devolución también regresó su pieza');

-- ── 2) Lo que el candado SÍ cierra: escritura DIRECTA por REST ─────────────────────────────────
set local "request.path" to '/insumo_stock_sucursal';
select throws_ok($$ update insumo_stock_sucursal set stock_actual = 999 where insumo_id = pg_temp.id('insumo') $$,
  'P0001', 'El inventario viene desde el plan Negocio. Escríbenos y lo activamos.', 'no se escriben existencias directo por REST sin el módulo');
set local "request.path" to '/movimientos_inventario';
select throws_ok($$
  insert into movimientos_inventario (tenant_id, sucursal_id, insumo_id, tipo, cantidad, stock_antes, stock_despues, dia_contable)
  values ('99999999-0000-0000-0000-0000000000aa', '99999999-0000-0000-0000-0000000000bb', pg_temp.id('insumo'), 'SALIDA_VENTA', 1, 10, 9, current_date) $$,
  'P0001', null, 'ni se fabrica un movimiento "de venta" con un INSERT directo');
reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.path', '', true);

-- Una venta que NO descontó, cancelada: no "regresa" nada.
select pg_temp.aut('aut_s', 'venta.cancelar_pagada', pg_temp.id('sin'), 120);
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"99999999-0000-0000-0000-000000000001","role":"authenticated","tenant_id":"99999999-0000-0000-0000-0000000000aa"}';
set local "request.path" to '/rpc/cancelar_ticket_pagado';
select lives_ok($$
  select cancelar_ticket_pagado(pg_temp.id('sin'), '99999999-0000-0000-0000-0000000000cc', pg_temp.id('turno'),
    'CLIENTE_DESISTIO'::cancelacion_motivo, null, pg_temp.id('aut_s'),
    '99999999-0000-0000-0000-000000000001', '99999999-0000-0000-0000-0000000000f1',
    true, false, true, 'EFECTIVO'::devolucion_medio, null, null) $$, 'cancela la venta que no descontó');
select is((select stock_actual from insumo_stock_sucursal where insumo_id = pg_temp.id('insumo')), 10::numeric,
  'sin descuento original no hay nada que regresar');
reset role;
select set_config('request.path', '', true);

-- ── 3) El sistema, con SU rol: service_role y el push de una caja ──────────────────────────────
set local role service_role;
set local "request.jwt.claims" to '{"role":"service_role"}';
select lives_ok($$
  insert into ctx values ('ins_sr', gen_random_uuid());
  insert into insumos (id, tenant_id, nombre, unidad_medida_id, categoria, costo_unitario_mxn)
  values (pg_temp.id('ins_sr'), '99999999-0000-0000-0000-0000000000aa', 'Queso 0033',
          (select unidad_medida_id from insumos where id = pg_temp.id('insumo')), 'LACTEOS', 9) $$,
  'service_role escribe insumos de un negocio sin módulo');
select lives_ok($$ update insumo_stock_sucursal set stock_actual = 10 where insumo_id = pg_temp.id('insumo') $$,
  'y sus existencias');

insert into ctx values ('m1', gen_random_uuid()), ('m2', gen_random_uuid());
select lives_ok($$
  select sync_push_snapshot('99999999-0000-0000-0000-0000000000aa'::uuid, jsonb_build_object('movimientos_inventario', jsonb_build_array(
    jsonb_build_object('id', pg_temp.id('m1'), 'tenant_id', '99999999-0000-0000-0000-0000000000aa', 'sucursal_id', '99999999-0000-0000-0000-0000000000bb',
      'insumo_id', pg_temp.id('insumo'), 'tipo', 'SALIDA_VENTA', 'cantidad', 3, 'costo_unitario_mxn', 5, 'stock_antes', 10, 'stock_despues', 7,
      'fecha', now() - interval '2 min', 'dia_contable', current_date, 'usuario_id', '99999999-0000-0000-0000-000000000001', 'created_at', now()),
    jsonb_build_object('id', pg_temp.id('m2'), 'tenant_id', '99999999-0000-0000-0000-0000000000aa', 'sucursal_id', '99999999-0000-0000-0000-0000000000bb',
      'insumo_id', pg_temp.id('insumo'), 'tipo', 'REVERSA_CANCELACION', 'cantidad', 1, 'costo_unitario_mxn', 5, 'stock_antes', 7, 'stock_despues', 8,
      'fecha', now() - interval '1 min', 'dia_contable', current_date, 'usuario_id', '99999999-0000-0000-0000-000000000001', 'created_at', now())))) $$,
  'el push de una caja con movimientos de venta de un negocio sin módulo no revienta');
select is((select count(*)::int from movimientos_inventario where id in (pg_temp.id('m1'), pg_temp.id('m2'))), 2,
  'los dos movimientos de la caja entraron (nada queda en _errores para reintentar sin fin)');
select is((select stock_actual from insumo_stock_sucursal where insumo_id = pg_temp.id('insumo')), 8::numeric,
  'y la nube ajustó las existencias con ellos');
-- El mismo push otra vez (la caja reintenta): idempotente, sin error.
select lives_ok($$
  select sync_push_snapshot('99999999-0000-0000-0000-0000000000aa'::uuid, jsonb_build_object('movimientos_inventario', jsonb_build_array(
    jsonb_build_object('id', pg_temp.id('m1'), 'tenant_id', '99999999-0000-0000-0000-0000000000aa', 'sucursal_id', '99999999-0000-0000-0000-0000000000bb',
      'insumo_id', pg_temp.id('insumo'), 'tipo', 'SALIDA_VENTA', 'cantidad', 3, 'costo_unitario_mxn', 5, 'stock_antes', 10, 'stock_despues', 7,
      'fecha', now(), 'dia_contable', current_date, 'usuario_id', '99999999-0000-0000-0000-000000000001', 'created_at', now())))) $$,
  'reenviar el mismo movimiento tampoco');
select is((select stock_actual from insumo_stock_sucursal where insumo_id = pg_temp.id('insumo')), 8::numeric, 'ni mueve las existencias dos veces');
reset role;

select * from finish();
rollback;
