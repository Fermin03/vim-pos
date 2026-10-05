-- ============================================================================
-- 0155 · menús del catálogo: tablas, quién las escribe y la proyección a productos_sucursal
-- (lo que lee la caja). Las RPCs crear/actualizar/eliminar se prueban al final (tarea 2).
-- ============================================================================
begin;
select plan(53);

\set t         '99999999-0000-0000-0000-0000000000aa'
\set centro    '99999999-0000-0000-0000-0000000000bb'
\set norte     '37373737-0000-0000-0000-0000000000b2'
\set cajero    '99999999-0000-0000-0000-000000000001'
\set dueno     '99999999-0000-0000-0000-0000000000e1'
\set clas      'b0000000-0000-0000-0000-0000000000f1'
\set papas     'b0000000-0000-0000-0000-0000000000f2'
\set menu      '37373737-0000-0000-0000-0000000000a1'
\set otro      '37373737-0000-0000-0000-0000000000aa'
\set menu_otro '37373737-0000-0000-0000-0000000000a9'
\set suc_otro  '37373737-0000-0000-0000-0000000000b9'
\set nueva     '37373737-0000-0000-0000-0000000000b3'

-- SETUP (superusuario, sin request.path: las guardias no actúan)
insert into tenant_limites (tenant_id, max_sucursales) values (:'t', 5)
  on conflict (tenant_id) do update set max_sucursales = 5;
insert into sucursales (id, tenant_id, codigo, nombre) values (:'norte', :'t', 'KN', 'León Norte');
insert into tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  values (:'otro', 'tenant-0037', 'Otro negocio', 'INTERNO', 'QUICK_SERVICE');
insert into sucursales (id, tenant_id, codigo, nombre) values (:'suc_otro', :'otro', 'KO', 'Sucursal ajena');
insert into menus (id, tenant_id, nombre) values (:'menu', :'t', 'Menú Norte'), (:'menu_otro', :'otro', 'Ajeno');
insert into menu_productos (menu_id, producto_id, tenant_id, disponible, precio_mxn) values
  (:'menu', :'clas', :'t', true, 135), (:'menu', :'papas', :'t', false, 55);

-- 1) Estructura.
select has_table('public', 'menus', 'existe menus');
select col_is_pk('public', 'menu_productos', array['menu_id', 'producto_id'], 'la llave de menu_productos es (menú, producto)');
select col_not_null('public', 'menu_productos', 'precio_mxn', 'un menú propio siempre tiene precio');
select col_default_is('public', 'productos', 'en_menu_general', 'true', 'un producto nace en el menú General');

-- 2) Asignar el menú a Norte proyecta TODO el menú a productos_sucursal.
update sucursales set menu_id = :'menu' where id = :'norte';
select is((select precio_mxn from productos_sucursal where producto_id = :'clas' and sucursal_id = :'norte'), 135.00::numeric,
  'Norte cobra el precio de su menú');
select is((select disponible from productos_sucursal where producto_id = :'papas' and sucursal_id = :'norte'), false,
  'lo apagado en el menú no se vende en Norte');
select is((select count(*)::int from productos_sucursal where sucursal_id = :'centro'), 0,
  'Centro sigue en el General: sin filas');

-- 3) Cambiar una fila del menú se proyecta sola.
update menu_productos set precio_mxn = 140 where menu_id = :'menu' and producto_id = :'clas';
select is((select precio_mxn from productos_sucursal where producto_id = :'clas' and sucursal_id = :'norte'), 140.00::numeric,
  'cambiar el precio en el menú llega a la sucursal');

-- 4) Independencia: subir el precio en el General no toca el menú propio ni lo que cobra Norte.
update productos set precio_base_mxn = 125 where id = :'clas';
select is((select precio_mxn from menu_productos where menu_id = :'menu' and producto_id = :'clas'), 140.00::numeric,
  'el menú propio no sigue al General');
select is(precio_producto_en_sucursal(:'clas', :'norte'), 140.00::numeric, 'Norte sigue cobrando su precio');
select is(precio_producto_en_sucursal(:'clas', :'centro'), 125.00::numeric, 'Centro cobra el del General');

-- 5) Apagar en el General se proyecta a las sucursales del General, no a las de menú propio.
update productos set en_menu_general = false where id = :'clas';
select is(motivo_no_disponible_en_sucursal(:'clas', :'centro'), 'NO_SE_VENDE', 'apagado en el General: Centro no lo vende');
select is(motivo_no_disponible_en_sucursal(:'clas', :'norte'), null::text, 'Norte, con menú propio, lo sigue vendiendo');
update productos set en_menu_general = true where id = :'clas';

-- 6) La proyección no toca el agotado de la sucursal.
update productos_sucursal set agotado_manual = true where producto_id = :'clas' and sucursal_id = :'norte';
update menu_productos set precio_mxn = 141 where menu_id = :'menu' and producto_id = :'clas';
select is((select agotado_manual from productos_sucursal where producto_id = :'clas' and sucursal_id = :'norte'), true,
  'proyectar no borra el agotado de la sucursal');

-- 7) Volver al General: las filas regresan a lo general (no se borran).
update sucursales set menu_id = null where id = :'norte';
select is((select precio_mxn from productos_sucursal where producto_id = :'clas' and sucursal_id = :'norte'), null::numeric,
  'de vuelta en el General, el precio propio desaparece');
select is((select disponible from productos_sucursal where producto_id = :'papas' and sucursal_id = :'norte'), true,
  'y lo que estaba apagado en el menú vuelve a venderse');

-- 8) No se asigna el menú de otro negocio.
select throws_ok(
  format($$ update sucursales set menu_id = %L where id = %L $$, :'menu_otro', :'norte'),
  '23514', null, 'una sucursal no usa el menú de otro negocio');

-- Como el dueño, por REST (el panel).
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'dueno', 'role', 'authenticated', 'tenant_id', :'t')::text, true);
select set_config('request.path', '/sucursales', true);

-- 9) Ni el dueño cambia el menú de una sucursal por REST directo (solo las RPCs).
select throws_ok(
  format($$ update sucursales set menu_id = %L where id = %L $$, :'menu', :'norte'),
  '42501', null, 'el menú de una sucursal no se cambia por REST');

-- 10) Ni escribe por REST lo que proyecta el menú.
select set_config('request.path', '/productos_sucursal', true);
update productos_sucursal set precio_mxn = 1, disponible = false where producto_id = :'clas' and sucursal_id = :'norte';
select is((select precio_mxn from productos_sucursal where producto_id = :'clas' and sucursal_id = :'norte'), null::numeric,
  'por REST no se escribe el precio proyectado');
select is((select disponible from productos_sucursal where producto_id = :'clas' and sucursal_id = :'norte'), true,
  'por REST tampoco se escribe el disponible proyectado: conserva el anterior');

-- 11) Las RPCs bajo RLS: el dueño crea; la cajera no; nadie toca el menú de otro negocio.
select set_config('request.jwt.claims', json_build_object('sub', :'dueno', 'role', 'authenticated', 'tenant_id', :'t')::text, true);
select set_config('request.path', '/rpc/crear_menu', true);
select lives_ok(
  format($$ select crear_menu('Menú del dueño', array[%L]::uuid[]) $$, :'norte'),
  'el dueño crea un menú por RPC');
select throws_ok(
  format($$ select crear_menu('Con sucursal ajena', array[%L]::uuid[]) $$, :'suc_otro'),
  '22023', null, 'el dueño no asigna una sucursal de otro negocio');
select is((select count(*)::int from menus where tenant_id = :'otro'), 0, 'no ve los menús de otro negocio');
select throws_ok(
  format($$ select actualizar_menu(%L, 'Robado', array[]::uuid[]) $$, :'menu_otro'),
  '22023', null, 'no edita el menú de otro negocio');
select set_config('request.path', '/menus', true);
select throws_ok(
  format($$ insert into menus (tenant_id, nombre) values (%L, 'Por REST') $$, :'t'),
  '42501', null, 'los menús no se crean por REST directo');
select set_config('request.jwt.claims', json_build_object('sub', :'cajero', 'role', 'authenticated', 'tenant_id', :'t')::text, true);
select set_config('request.path', '/rpc/crear_menu', true);
select throws_ok(
  format($$ select crear_menu('De la cajera', array[%L]::uuid[]) $$, :'centro'),
  '42501', null, 'una cajera no crea menús');
select set_config('request.path', '/rpc/actualizar_menu', true);
select throws_ok(
  format($$ select actualizar_menu(%L, 'De la cajera', array[]::uuid[]) $$, :'menu'),
  '42501', null, 'una cajera no edita menús');
select set_config('request.path', '/rpc/eliminar_menu', true);
select throws_ok(
  format($$ select eliminar_menu(%L) $$, :'menu'),
  '42501', null, 'una cajera no elimina menús');

-- 12) Las filas de un menú por REST: la cajera no las toca.
select set_config('request.path', '/menu_productos', true);
select throws_ok(
  format($$ update menu_productos set precio_mxn = 1, disponible = false
             where producto_id = %L and menu_id = (select id from menus where tenant_id = %L and nombre = 'Menú del dueño') $$,
         :'clas', :'t'),
  '42501', null, 'una cajera no edita las filas de un menú por REST');
reset role;

-- 13) El dueño edita precio y disponible de su menú por REST, y se proyecta a la sucursal que lo usa.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'dueno', 'role', 'authenticated', 'tenant_id', :'t')::text, true);
select set_config('request.path', '/menu_productos', true);
select lives_ok(
  format($$ update menu_productos set precio_mxn = 160, disponible = false
             where producto_id = %L and menu_id = (select id from menus where tenant_id = %L and nombre = 'Menú del dueño') $$,
         :'clas', :'t'),
  'el dueño edita precio y disponible de una fila de su menú por REST');
select is((select precio_mxn from productos_sucursal where producto_id = :'clas' and sucursal_id = :'norte'), 160.00::numeric,
  'y el precio llega a la sucursal que usa el menú');
select is((select disponible from productos_sucursal where producto_id = :'clas' and sucursal_id = :'norte'), false,
  'y el disponible también');

-- 14) Las filas de un menú las crean la RPC y el trigger, no el cliente: ni insert ni delete por REST.
select throws_ok(
  format($$ insert into menu_productos (menu_id, producto_id, tenant_id, disponible, precio_mxn)
             values ((select id from menus where tenant_id = %L and nombre = 'Menú del dueño'), %L, %L, true, 1) $$,
         :'t', :'papas', :'t'),
  '42501', null, 'las filas de un menú no se insertan por REST');
select throws_ok(
  format($$ delete from menu_productos
             where producto_id = %L and menu_id = (select id from menus where tenant_id = %L and nombre = 'Menú del dueño') $$,
         :'papas', :'t'),
  '42501', null, 'las filas de un menú no se borran por REST');

-- 15) Una fila nueva de productos_sucursal por REST toma disponible y precio del menú, no del cliente.
-- Preparación (superusuario): papas con precio y estado propios en el menú, y sin fila en Norte.
reset role;
update menu_productos set precio_mxn = 77, disponible = false
 where producto_id = :'papas' and menu_id = (select id from menus where tenant_id = :'t' and nombre = 'Menú del dueño');
delete from productos_sucursal where producto_id = :'papas' and sucursal_id = :'norte';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'dueno', 'role', 'authenticated', 'tenant_id', :'t')::text, true);
select set_config('request.path', '/productos_sucursal', true);
insert into productos_sucursal (tenant_id, producto_id, sucursal_id, disponible, precio_mxn, agotado_manual)
  values (:'t', :'papas', :'norte', true, 1, true);
select is((select precio_mxn from productos_sucursal where producto_id = :'papas' and sucursal_id = :'norte'), 77.00::numeric,
  'fila nueva en una sucursal con menú: el precio sale del menú, no del cliente');
select is((select disponible from productos_sucursal where producto_id = :'papas' and sucursal_id = :'norte'), false,
  'fila nueva en una sucursal con menú: el disponible sale del menú, no del cliente');
select is((select agotado_manual from productos_sucursal where producto_id = :'papas' and sucursal_id = :'norte'), true,
  'fila nueva: el agotado_manual sí lo escribe el cliente');
-- Y en una sucursal del General (Centro): disponible = en_menu_general, precio nulo.
insert into productos_sucursal (tenant_id, producto_id, sucursal_id, disponible, precio_mxn, agotado_manual)
  values (:'t', :'papas', :'centro', false, 1, true);
select is((select disponible from productos_sucursal where producto_id = :'papas' and sucursal_id = :'centro'), true,
  'fila nueva en una sucursal del General: el disponible sale de en_menu_general');
select is((select precio_mxn from productos_sucursal where producto_id = :'papas' and sucursal_id = :'centro'), null::numeric,
  'fila nueva en una sucursal del General: el precio queda nulo (se cobra el base)');

-- 16) Un update por REST que lleva menu_id SIN cambio (como lo manda el panel al guardar la sucursal)
-- no se bloquea y sí guarda el resto de los campos.
select set_config('request.path', '/sucursales', true);
select lives_ok(
  format($$ update sucursales set nombre = 'León Norte (editada)', menu_id = menu_id where id = %L $$, :'norte'),
  'actualizar una sucursal mandando su menu_id sin cambio sigue funcionando por REST');
select is((select nombre from sucursales where id = :'norte'), 'León Norte (editada)',
  'y el cambio de nombre sí se guardó');

reset role;

-- 17) Una sucursal NUEVA nace proyectada: lo apagado en el General no se vende en ella. Sin esto,
-- «sin fila» se leería como «se vende al precio base» (0152).
update productos set en_menu_general = false where id = :'papas';
insert into sucursales (id, tenant_id, codigo, nombre) values (:'nueva', :'t', 'KS', 'León Sur');
select is(motivo_no_disponible_en_sucursal(:'papas', :'nueva'), 'NO_SE_VENDE',
  'una sucursal nueva no vende lo que el General tiene apagado');
select is(motivo_no_disponible_en_sucursal(:'clas', :'nueva'), null::text,
  'y sí vende lo que el General vende');

-- 18) Una sucursal que vuelve (restaurada o reactivada) trae al día lo que cambió mientras no estaba.
update sucursales set deleted_at = now() where id = :'nueva';
update productos set en_menu_general = false where id = :'clas';
update sucursales set deleted_at = null where id = :'nueva';
select is(motivo_no_disponible_en_sucursal(:'clas', :'nueva'), 'NO_SE_VENDE',
  'una sucursal restaurada no vende lo que el General apagó mientras estaba dada de baja');
update sucursales set activa = false where id = :'nueva';
update productos set en_menu_general = true where id = :'papas';
update sucursales set activa = true where id = :'nueva';
select is(motivo_no_disponible_en_sucursal(:'papas', :'nueva'), null::text,
  'una sucursal reactivada vende lo que el General encendió mientras estaba desactivada');
update productos set en_menu_general = true where id = :'clas';

-- 19) Renombrar un menú no le quita el suyo a una sucursal desactivada (el panel solo lista las activas).
update sucursales set activa = false where id = :'norte';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'dueno', 'role', 'authenticated', 'tenant_id', :'t')::text, true);
select set_config('request.path', '/rpc/actualizar_menu', true);
select lives_ok(
  format($$ select actualizar_menu((select id from menus where tenant_id = %L and nombre = 'Menú del dueño'), 'Menú renombrado', array[]::uuid[]) $$, :'t'),
  'el dueño renombra un menú cuya única sucursal está desactivada');
reset role;
select is((select m.nombre::text from sucursales s join menus m on m.id = s.menu_id where s.id = :'norte'), 'Menú renombrado',
  'la sucursal desactivada conserva su menú');
update sucursales set activa = true where id = :'norte';

-- 20) «General» es el nombre del catálogo base: ningún menú propio se llama así.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'dueno', 'role', 'authenticated', 'tenant_id', :'t')::text, true);
select set_config('request.path', '/rpc/crear_menu', true);
select throws_ok(
  format($$ select crear_menu('  GENERAL ', array[%L]::uuid[]) $$, :'centro'),
  '22023', 'Ese nombre es el del menú General. Elige otro.', 'no se crea un menú llamado General');
select throws_ok(
  format($$ select crear_menu('Menú   general', array[%L]::uuid[]) $$, :'centro'),
  '22023', 'Ese nombre es el del menú General. Elige otro.', 'ni «Menú General», con los espacios que sean');
select set_config('request.path', '/rpc/actualizar_menu', true);
select throws_ok(
  format($$ select actualizar_menu(%L, 'general', array[]::uuid[]) $$, :'menu'),
  '22023', 'Ese nombre es el del menú General. Elige otro.', 'ni se renombra un menú a General');
reset role;

-- 21) Un menú eliminado no se asigna: ni por la RPC ni escribiendo la sucursal.
update menus set deleted_at = now() where id = :'menu';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'dueno', 'role', 'authenticated', 'tenant_id', :'t')::text, true);
select set_config('request.path', '/rpc/actualizar_menu', true);
select throws_ok(
  format($$ select actualizar_menu(%L, 'Revivido', array[%L]::uuid[]) $$, :'menu', :'norte'),
  '22023', null, 'un menú eliminado no se edita ni se asigna por RPC');
reset role;
select throws_ok(
  format($$ update sucursales set menu_id = %L where id = %L $$, :'menu', :'centro'),
  '23514', null, 'un menú eliminado no se asigna a una sucursal');

-- 22) Alguien de otro negocio no lee las filas de los menús de este.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'dueno', 'role', 'authenticated', 'tenant_id', :'otro')::text, true);
select set_config('request.path', '/menu_productos', true);
select is((select count(*)::int from menu_productos), 0, 'otro negocio no ve las filas de menu_productos');

reset role;
select * from finish();
rollback;
