-- ============================================================================
-- 0139 · descuento.override_precio existe y el costo de envío se cambia solo con PIN de verdad.
-- ============================================================================
begin;
select plan(9);

\set t      '99999999-0000-0000-0000-0000000000aa'
\set s      '99999999-0000-0000-0000-0000000000bb'
\set cajero '99999999-0000-0000-0000-000000000001'
\set super  '99999999-0000-0000-0000-0000000000f1'
\set dueno  '99999999-0000-0000-0000-0000000000e1'
\set zona   '23232323-0000-0000-0000-0000000000e1'

-- 1) El permiso que el POS pedía existe y lo tienen los mismos roles que el descuento manual.
select ok(exists (select 1 from permisos where codigo = 'descuento.override_precio' and permite_autorizacion_pin),
  'descuento.override_precio existe y admite PIN');
select is(
  (select array_agg(r.codigo order by r.codigo) from rol_permisos rp join roles r on r.id = rp.rol_id
     join permisos p on p.id = rp.permiso_id where p.codigo = 'descuento.override_precio'),
  (select array_agg(r.codigo order by r.codigo) from rol_permisos rp join roles r on r.id = rp.rol_id
     join permisos p on p.id = rp.permiso_id where p.codigo = 'descuento.manual_aplicar'),
  'override_precio lo tienen los mismos roles que descuento.manual_aplicar');

insert into zonas_envio (id, tenant_id, sucursal_id, nombre, costo_mxn) values (:'zona', :'t', :'s', 'Zona 0023', 30);
-- Autorización válida de override_precio para ESTA zona, pedida por el cajero y dada por el supervisor.
insert into autorizaciones_pin (id, tenant_id, usuario_solicitante_id, usuario_autorizo_id, accion,
                                permiso_codigo, entidad_tipo, entidad_id, monto_mxn, motivo)
values ('23232323-0000-0000-0000-00000000a001', :'t', :'cajero', :'super', 'editar_zona_envio',
        'descuento.override_precio', 'zona_envio', :'zona', 45, 'prueba 0023');
-- Una autorización de OTRO permiso (reimprimir comanda).
insert into autorizaciones_pin (id, tenant_id, usuario_solicitante_id, usuario_autorizo_id, accion,
                                permiso_codigo, motivo)
values ('23232323-0000-0000-0000-00000000a002', :'t', :'cajero', :'super', 'reimprimir',
        'cocina.reimprimir_comanda', 'prueba 0023');

-- Como el cajero.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'cajero', 'role', 'authenticated', 'tenant_id', :'t')::text, true);

-- 2) El UPDATE directo ya no pasa (antes cualquier empleado lo hacía sin PIN).
update zonas_envio set costo_mxn = 0 where id = :'zona';
select is((select costo_mxn from zonas_envio where id = :'zona'), 30.00::numeric,
  'un cajero ya no reprecia la zona con un UPDATE directo');

-- 3) Sin autorización, la RPC lo rechaza.
select throws_ok($$ select cambiar_costo_zona('23232323-0000-0000-0000-0000000000e1', 45, null) $$,
  '42501', null, 'sin autorización no se reprecia');
-- 4) Con una autorización de otro permiso, tampoco.
select throws_ok($$ select cambiar_costo_zona('23232323-0000-0000-0000-0000000000e1', 45, '23232323-0000-0000-0000-00000000a002') $$,
  '42501', null, 'una autorización de otro permiso no sirve');
-- 5) Con la correcta, sí.
select lives_ok($$ select cambiar_costo_zona('23232323-0000-0000-0000-0000000000e1', 45, '23232323-0000-0000-0000-00000000a001') $$,
  'con la autorización de override_precio se reprecia');
select is((select costo_mxn from zonas_envio where id = :'zona'), 45.00::numeric, 'el costo quedó en 45');
-- 6) Y es de un solo uso.
select throws_ok($$ select cambiar_costo_zona('23232323-0000-0000-0000-0000000000e1', 45, '23232323-0000-0000-0000-00000000a001') $$,
  '42501', null, 'la misma autorización no sirve dos veces');

-- 7) El dueño lo hace sin PIN (es lo mismo que el panel).
select set_config('request.jwt.claims', json_build_object('sub', :'dueno', 'role', 'authenticated', 'tenant_id', :'t')::text, true);
select lives_ok($$ select cambiar_costo_zona('23232323-0000-0000-0000-0000000000e1', 50, null) $$,
  'el dueño reprecia sin PIN');

select * from finish();
rollback;
