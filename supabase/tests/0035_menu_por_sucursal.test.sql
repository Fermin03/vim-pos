-- ============================================================================
-- 0151 · menú por sucursal: la tabla, quién la escribe, la regla de precio y disponibilidad,
-- y el agotado del producto como «agotado en todas».
-- ============================================================================
begin;
select plan(25);

\set t         '99999999-0000-0000-0000-0000000000aa'
\set centro    '99999999-0000-0000-0000-0000000000bb'
\set norte     '35353535-0000-0000-0000-0000000000b2'
\set cajero    '99999999-0000-0000-0000-000000000001'
\set dueno     '99999999-0000-0000-0000-0000000000e1'
\set clas      'b0000000-0000-0000-0000-0000000000f1'
\set papas     'b0000000-0000-0000-0000-0000000000f2'
\set otro      '35353535-0000-0000-0000-0000000000aa'
\set suc_otro  '35353535-0000-0000-0000-0000000000b9'
\set cat_otro  '35353535-0000-0000-0000-0000000000c9'
\set prod_otro '35353535-0000-0000-0000-0000000000f9'

-- SETUP (superusuario, sin request.path: las guardias no actúan)
insert into tenant_limites (tenant_id, max_sucursales) values (:'t', 5)
  on conflict (tenant_id) do update set max_sucursales = 5;
insert into sucursales (id, tenant_id, codigo, nombre) values (:'norte', :'t', 'KN', 'León Norte');
insert into tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  values (:'otro', 'tenant-0035', 'Otro negocio', 'INTERNO', 'QUICK_SERVICE');
insert into sucursales (id, tenant_id, codigo, nombre) values (:'suc_otro', :'otro', 'OT', 'Otra');
insert into categorias (id, tenant_id, nombre) values (:'cat_otro', :'otro', 'Otra categoría');
insert into productos (id, tenant_id, categoria_id, nombre, precio_base_mxn)
  values (:'prod_otro', :'otro', :'cat_otro', 'Ajeno', 10);
insert into productos_sucursal (tenant_id, producto_id, sucursal_id, precio_mxn)
  values (:'otro', :'prod_otro', :'suc_otro', 12);

-- 1) La tabla y su llave.
select has_table('public', 'productos_sucursal', 'existe productos_sucursal');
select col_is_pk('public', 'productos_sucursal', array['producto_id', 'sucursal_id'], 'la llave es (producto, sucursal)');

-- 2) Sin fila = lo general.
select is(precio_producto_en_sucursal(:'clas', :'norte'), 120.00::numeric, 'sin fila, el precio es el general');
select is(motivo_no_disponible_en_sucursal(:'clas', :'norte'), null::text, 'sin fila, se vende');

-- 3) Precio propio en Norte; Centro sigue con el general.
insert into productos_sucursal (tenant_id, producto_id, sucursal_id, precio_mxn) values (:'t', :'clas', :'norte', 135);
select is(precio_producto_en_sucursal(:'clas', :'norte'), 135.00::numeric, 'con precio propio, cobra ese');
select is(precio_producto_en_sucursal(:'clas', :'centro'), 120.00::numeric, 'la otra sucursal sigue con el general');

-- 4) Apagado en Norte.
update productos_sucursal set disponible = false where producto_id = :'clas' and sucursal_id = :'norte';
select is(motivo_no_disponible_en_sucursal(:'clas', :'norte'), 'NO_SE_VENDE', 'apagado en Norte');
select is(motivo_no_disponible_en_sucursal(:'clas', :'centro'), null::text, 'en Centro se sigue vendiendo');

-- 5) Agotado por sucursal y el producto como «agotado en todas» (dos sucursales activas).
insert into productos_sucursal (tenant_id, producto_id, sucursal_id, agotado_manual) values (:'t', :'papas', :'centro', true);
select is(motivo_no_disponible_en_sucursal(:'papas', :'centro'), 'AGOTADO', 'agotado en Centro');
select is((select agotado_manual from productos where id = :'papas'), false,
  'agotado en una de dos sucursales: el producto NO queda agotado en todas');
insert into productos_sucursal (tenant_id, producto_id, sucursal_id, agotado_manual) values (:'t', :'papas', :'norte', true);
select is((select agotado_manual from productos where id = :'papas'), true,
  'agotado en las dos: el producto queda agotado en todas (lo leen las cajas sin actualizar)');
update productos_sucursal set agotado_manual = false where producto_id = :'papas' and sucursal_id = :'centro';
select is((select agotado_manual from productos where id = :'papas'), false,
  'al volver una, deja de estar agotado en todas');

-- 6) Pausar es global y gana.
update productos set estado = 'PAUSADO' where id = :'papas';
select is(motivo_no_disponible_en_sucursal(:'papas', :'centro'), 'PAUSADO', 'pausar es global y gana');
update productos set estado = 'ACTIVO' where id = :'papas';

-- 7) Coherencia: la sucursal tiene que ser del negocio del producto, y el negocio sale del producto.
select throws_ok(
  format($$ insert into productos_sucursal (tenant_id, producto_id, sucursal_id) values (%L, %L, %L) $$, :'t', :'clas', :'suc_otro'),
  '23514', null, 'no se apunta a la sucursal de otro negocio');
insert into productos_sucursal (tenant_id, producto_id, sucursal_id) values (:'otro', :'clas', :'centro');
select is((select tenant_id from productos_sucursal where producto_id = :'clas' and sucursal_id = :'centro'), :'t'::uuid,
  'el negocio de la fila sale del producto, no de lo que mande el cliente');

-- Como la cajera.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'cajero', 'role', 'authenticated', 'tenant_id', :'t')::text, true);

-- 8) Lee las de su negocio (la caja las necesita) y no las ajenas.
select is((select count(*)::int from productos_sucursal where tenant_id = :'otro'), 0, 'no se ven las filas de otro negocio');
select ok((select count(*) from productos_sucursal) > 0, 'la cajera lee las de su negocio');

-- 9) Por REST directo no las escribe.
select set_config('request.path', '/productos_sucursal', true);
select throws_ok(
  format($$ update productos_sucursal set precio_mxn = 1 where producto_id = %L and sucursal_id = %L $$, :'clas', :'norte'),
  '42501', null, 'una cajera no cambia el precio de una sucursal por REST');

-- Como el dueño, por REST (el panel).
select set_config('request.jwt.claims', json_build_object('sub', :'dueno', 'role', 'authenticated', 'tenant_id', :'t')::text, true);

-- 10) El dueño sí, salvo el agotado por inventario, y no borra.
select lives_ok(
  format($$ update productos_sucursal set precio_mxn = 140, agotado_automatico = true where producto_id = %L and sucursal_id = %L $$, :'clas', :'norte'),
  'el dueño cambia el precio de Norte desde el panel');
select is((select agotado_automatico from productos_sucursal where producto_id = :'clas' and sucursal_id = :'norte'), false,
  'pero el agotado por inventario no se escribe a mano');
select is((select precio_mxn from productos_sucursal where producto_id = :'clas' and sucursal_id = :'norte'), 140.00::numeric,
  'y el precio sí quedó');
select throws_ok(
  format($$ delete from productos_sucursal where producto_id = %L and sucursal_id = %L $$, :'clas', :'norte'),
  '42501', null, 'las filas no se borran: el pull de la caja no trae bajas');

reset role;

-- 11) Baja a la caja: la llave viaja en el snapshot, solo con filas del negocio, y avisa por catalogo_version().
select ok(
  (select count(*) from jsonb_array_elements(sync_pull_snapshot(:'t') -> 'productos_sucursal') e
    where e ->> 'sucursal_id' = :'norte') >= 1,
  'el menú de Norte baja a la caja en el snapshot');
select is(
  (select count(*)::int from jsonb_array_elements(sync_pull_snapshot(:'t') -> 'productos_sucursal') e
    where e ->> 'tenant_id' = :'otro'), 0,
  'y solo el del negocio');
select ok(pg_get_functiondef('catalogo_version()'::regprocedure) like '%productos_sucursal%',
  'un cambio en el menú de una sucursal cuenta como cambio de catálogo');

select * from finish();
rollback;
