-- ============================================================================
-- 0148 · El inventario viene desde el plan Negocio (ADR 0025).
--
-- Lo que se protege:
--   · que un negocio sin el módulo no pueda escribir inventario (insumos, recetas, compras,
--     movimientos manuales) ni por la tabla ni por las RPC, con un mensaje que se entienda;
--   · que una VENTA nunca falle por eso: los movimientos que genera una venta pasan siempre, y el
--     interruptor del descuento no puede quedar encendido sin el módulo;
--   · que VIM pueda concederlo por excepción, y que al quitarla (o al bajar de plan) se apague solo;
--   · que quien ya tenía insumos o recetas conserve el módulo;
--   · que el sistema (service_role, el push de la caja, eliminar un negocio) no se tope con el candado.
--
-- Se corre con:  supabase test db   (la nube; en la caja instalada el candado no actúa)
-- ============================================================================
begin;
select plan(27);

-- Dos negocios: uno en Esencial (sin inventario) y uno en Negocio (con).
insert into tenants (id, codigo, nombre_comercial, vertical_principal, estado, plan_actual_id) values
  ('abababab-0000-0000-0000-0000000032a0', 'inv-esencial', 'Inv Esencial', 'QUICK_SERVICE', 'ACTIVO', (select id from planes where codigo = 'ESENCIAL')),
  ('abababab-0000-0000-0000-0000000032b0', 'inv-negocio',  'Inv Negocio',  'QUICK_SERVICE', 'ACTIVO', (select id from planes where codigo = 'NEGOCIO'));
insert into sucursales (id, tenant_id, codigo, nombre) values
  ('abababab-0000-0000-0000-0000000032a1', 'abababab-0000-0000-0000-0000000032a0', 'IE', 'Centro'),
  ('abababab-0000-0000-0000-0000000032b1', 'abababab-0000-0000-0000-0000000032b0', 'IN', 'Centro');
select sembrar_unidades_base('abababab-0000-0000-0000-0000000032a0');
select sembrar_unidades_base('abababab-0000-0000-0000-0000000032b0');
-- Un insumo que el de Esencial "ya tenía" (lo pone el sistema, que no pasa por el candado).
insert into insumos (id, tenant_id, nombre, unidad_medida_id, categoria, costo_unitario_mxn)
values ('abababab-0000-0000-0000-0000000032a2', 'abababab-0000-0000-0000-0000000032a0', 'Carne',
        (select id from unidades_medida where tenant_id = 'abababab-0000-0000-0000-0000000032a0' and codigo = 'KG' limit 1), 'CARNICOS', 180);

-- 1) La regla, y que coincida con modulos_efectivos (la lectura que usan el panel y la caja).
select is(inventario_permitido('abababab-0000-0000-0000-0000000032a0'), false, 'Esencial no incluye inventario');
select is(inventario_permitido('abababab-0000-0000-0000-0000000032b0'), true, 'Negocio sí');
select is(inventario_permitido('99999999-0000-0000-0000-0000000000aa'), true, 'un plan heredado (QS) lo conserva');
select ok(
  (select bool_and(inventario_permitido(t.id) = coalesce((modulos_efectivos(t.id)->'permitidos'->>'recetas')::boolean, false))
     from tenants t where t.id in ('abababab-0000-0000-0000-0000000032a0', 'abababab-0000-0000-0000-0000000032b0', '99999999-0000-0000-0000-0000000000aa')),
  'inventario_permitido dice lo mismo que modulos_efectivos().permitidos.recetas');

-- 2) El interruptor no se enciende sin el módulo (ni desde el sistema).
select throws_ok(
  $$ insert into configuracion_tenant (tenant_id, modulo_inventario_activo) values ('abababab-0000-0000-0000-0000000032a0', true) $$,
  'P0001', 'El inventario viene desde el plan Negocio. Escríbenos y lo activamos.', 'Esencial no puede encender el descuento');
insert into configuracion_tenant (tenant_id) values ('abababab-0000-0000-0000-0000000032a0');
select throws_ok(
  $$ update configuracion_tenant set modulo_inventario_activo = true where tenant_id = 'abababab-0000-0000-0000-0000000032a0' $$,
  'P0001', null, 'ni con un UPDATE');
select lives_ok(
  $$ update configuracion_tenant set modulo_delivery_activo = false where tenant_id = 'abababab-0000-0000-0000-0000000032a0' $$,
  'tocar OTRA columna de la configuración no se topa con el candado');
select lives_ok(
  $$ insert into configuracion_tenant (tenant_id, modulo_inventario_activo) values ('abababab-0000-0000-0000-0000000032b0', true) $$,
  'Negocio sí lo enciende');

-- 3) Con sesión del dueño de Esencial: escribir inventario se rechaza, por tabla y por RPC.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '99999999-0000-0000-0000-0000000032e1',
                    'tenant_id', 'abababab-0000-0000-0000-0000000032a0', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ insert into insumos (tenant_id, nombre, unidad_medida_id, categoria, costo_unitario_mxn)
     values ('abababab-0000-0000-0000-0000000032a0', 'Queso',
             (select id from unidades_medida where tenant_id = 'abababab-0000-0000-0000-0000000032a0' and codigo = 'KG' limit 1), 'LACTEOS', 90) $$,
  'P0001', 'El inventario viene desde el plan Negocio. Escríbenos y lo activamos.', 'crear un insumo se rechaza con el porqué');
select throws_ok(
  $$ update insumos set nombre = 'Carne molida' where id = 'abababab-0000-0000-0000-0000000032a2' $$,
  'P0001', null, 'editar un insumo también');
select throws_ok(
  $$ select aplicar_movimiento_inventario('abababab-0000-0000-0000-0000000032a0', 'abababab-0000-0000-0000-0000000032a1',
       'abababab-0000-0000-0000-0000000032a2', 'AJUSTE_POSITIVO'::movimiento_inventario_tipo, 5) $$,
  'P0001', null, 'un ajuste manual se rechaza');
select throws_ok(
  $$ select aplicar_movimiento_inventario('abababab-0000-0000-0000-0000000032a0', 'abababab-0000-0000-0000-0000000032a1',
       'abababab-0000-0000-0000-0000000032a2', 'MERMA'::movimiento_inventario_tipo, 1) $$,
  'P0001', null, 'una merma también');
select throws_ok(
  $$ insert into proveedores (tenant_id, nombre) values ('abababab-0000-0000-0000-0000000032a0', 'Carnes del Bajío') $$,
  'P0001', null, 'y un proveedor');

-- 4) LA VENTA NO FALLA: lo que genera una venta pasa aunque el negocio no tenga el módulo.
select lives_ok(
  $$ select aplicar_movimiento_inventario('abababab-0000-0000-0000-0000000032a0', 'abababab-0000-0000-0000-0000000032a1',
       'abababab-0000-0000-0000-0000000032a2', 'SALIDA_VENTA'::movimiento_inventario_tipo, 1) $$,
  'el descuento de una venta pasa');
select lives_ok(
  $$ select aplicar_movimiento_inventario('abababab-0000-0000-0000-0000000032a0', 'abababab-0000-0000-0000-0000000032a1',
       'abababab-0000-0000-0000-0000000032a2', 'REVERSA_CANCELACION'::movimiento_inventario_tipo, 1) $$,
  'y la reversa de una cancelación o devolución');
-- Leer lo que ya tenía sigue pudiendo: el candado es de escritura.
select is((select count(*)::int from insumos), 1, 'sus insumos se siguen leyendo');
-- No puede preguntar por el módulo de otro negocio.
select is(inventario_permitido('abababab-0000-0000-0000-0000000032b0'), false, 'un negocio no averigua el módulo de otro');
reset role;

-- 5) El de Negocio escribe sin problema.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '99999999-0000-0000-0000-0000000032e2',
                    'tenant_id', 'abababab-0000-0000-0000-0000000032b0', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ insert into insumos (tenant_id, nombre, unidad_medida_id, categoria, costo_unitario_mxn)
     values ('abababab-0000-0000-0000-0000000032b0', 'Queso',
             (select id from unidades_medida where tenant_id = 'abababab-0000-0000-0000-0000000032b0' and codigo = 'KG' limit 1), 'LACTEOS', 90) $$,
  'Negocio crea insumos');
reset role;
-- De aquí en adelante actúa el sistema, sin sesión de ningún negocio.
select set_config('request.jwt.claims', '', true);

-- 6) El sistema no se topa con el candado (push de la caja, eliminar negocio, service_role).
select lives_ok(
  $$ insert into movimientos_inventario (tenant_id, sucursal_id, insumo_id, tipo, cantidad, stock_antes, stock_despues, dia_contable)
     values ('abababab-0000-0000-0000-0000000032a0', 'abababab-0000-0000-0000-0000000032a1', 'abababab-0000-0000-0000-0000000032a2',
             'AJUSTE_POSITIVO', 1, 0, 1, (now() at time zone 'America/Mexico_City')::date) $$,
  'un rol del sistema escribe movimientos de un negocio sin módulo');
select lives_ok($$ delete from insumos where tenant_id = 'abababab-0000-0000-0000-0000000032b0' $$,
  'y borra insumos (eliminar un negocio no se atora)');

-- 7) Quien ya usaba inventario lo conserva: se le concede por los DATOS.
select is(inventario_respetar_uso_previo()->'concedidos', '["inv-esencial"]'::jsonb, 'al de Esencial con insumos se le concede por excepción');
select is(inventario_permitido('abababab-0000-0000-0000-0000000032a0'), true, 'y desde ahí lo tiene');
select is(inventario_respetar_uso_previo()->'concedidos', '[]'::jsonb, 'volver a correrla no concede dos veces');
select lives_ok(
  $$ update configuracion_tenant set modulo_inventario_activo = true where tenant_id = 'abababab-0000-0000-0000-0000000032a0' $$,
  'con la excepción ya puede encender el descuento');

-- 8) VIM le quita la excepción ("Según plan"): el interruptor se apaga solo.
delete from tenant_feature_flags where tenant_id = 'abababab-0000-0000-0000-0000000032a0' and flag_codigo = 'recetas';
select is((select modulo_inventario_activo from configuracion_tenant where tenant_id = 'abababab-0000-0000-0000-0000000032a0'), false,
  'al quitar la excepción el descuento se apaga');

-- 9) Bajar de plan también lo apaga; subir no lo enciende (eso lo decide el dueño).
update tenants set plan_actual_id = (select id from planes where codigo = 'ESENCIAL') where id = 'abababab-0000-0000-0000-0000000032b0';
select is((select modulo_inventario_activo from configuracion_tenant where tenant_id = 'abababab-0000-0000-0000-0000000032b0'), false,
  'al bajar a Esencial el descuento se apaga');
update tenants set plan_actual_id = (select id from planes where codigo = 'NEGOCIO') where id = 'abababab-0000-0000-0000-0000000032b0';
select is((select modulo_inventario_activo from configuracion_tenant where tenant_id = 'abababab-0000-0000-0000-0000000032b0'), false,
  'al volver a subir sigue apagado: lo enciende el dueño');

select * from finish();
rollback;
