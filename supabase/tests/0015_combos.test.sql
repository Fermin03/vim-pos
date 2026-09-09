-- Combos (ADR 0015, migración 0110): las tablas de slots están aisladas por tenant, un combo no
-- puede ser opción de otro combo, y la RPC que cobra no se salta la RLS.
begin;
select plan(11);

insert into tenants (id, codigo, nombre_comercial, vertical_principal) values
  ('cccccccc-0000-0000-0000-0000000000a0', 'combos-a', 'Combos A', 'QUICK_SERVICE'),
  ('cccccccc-0000-0000-0000-0000000000b0', 'combos-b', 'Combos B', 'QUICK_SERVICE')
on conflict (id) do nothing;
insert into categorias (id, tenant_id, nombre, orden_visualizacion) values
  ('cccccccc-0000-0000-0000-0000000000a1', 'cccccccc-0000-0000-0000-0000000000a0', 'Hamburguesas', 1),
  ('cccccccc-0000-0000-0000-0000000000b1', 'cccccccc-0000-0000-0000-0000000000b0', 'Pizzas', 1);
insert into productos (id, tenant_id, categoria_id, nombre, precio_base_mxn, es_combo) values
  ('cccccccc-0000-0000-0000-0000000000a2', 'cccccccc-0000-0000-0000-0000000000a0', 'cccccccc-0000-0000-0000-0000000000a1', 'Combo A', 45, true),
  ('cccccccc-0000-0000-0000-0000000000a3', 'cccccccc-0000-0000-0000-0000000000a0', 'cccccccc-0000-0000-0000-0000000000a1', 'Clásica A', 95, false),
  ('cccccccc-0000-0000-0000-0000000000a4', 'cccccccc-0000-0000-0000-0000000000a0', 'cccccccc-0000-0000-0000-0000000000a1', 'Combo A2', 60, true),
  ('cccccccc-0000-0000-0000-0000000000a6', 'cccccccc-0000-0000-0000-0000000000a0', 'cccccccc-0000-0000-0000-0000000000a1', 'Doble A', 105, false),
  ('cccccccc-0000-0000-0000-0000000000b2', 'cccccccc-0000-0000-0000-0000000000b0', 'cccccccc-0000-0000-0000-0000000000b1', 'Combo B', 99, true);
insert into combo_grupos (id, tenant_id, combo_producto_id, nombre, modo_precio, categoria_id) values
  ('cccccccc-0000-0000-0000-0000000000a5', 'cccccccc-0000-0000-0000-0000000000a0', 'cccccccc-0000-0000-0000-0000000000a2', 'Hamburguesa', 'SUMA_PRECIO_PRODUCTO', 'cccccccc-0000-0000-0000-0000000000a1'),
  ('cccccccc-0000-0000-0000-0000000000b5', 'cccccccc-0000-0000-0000-0000000000b0', 'cccccccc-0000-0000-0000-0000000000b2', 'Pizza', 'DELTA', null);
insert into auth.users (id, instance_id, aud, role, email) values
  ('cccccccc-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'combos@test.local')
on conflict (id) do nothing;

-- #1 un combo no puede ser opción de un slot (trigger, corre aunque sea superusuario)
select throws_ok(
  $$ insert into combo_opciones (tenant_id, grupo_id, producto_id)
     values ('cccccccc-0000-0000-0000-0000000000a0', 'cccccccc-0000-0000-0000-0000000000a5', 'cccccccc-0000-0000-0000-0000000000a4') $$,
  'P0001', 'Un combo no puede ser opción de otro combo', 'combo_opciones rechaza un producto es_combo');

-- #2 el otro camino: marcar como combo un producto que ya es opción
insert into combo_opciones (tenant_id, grupo_id, producto_id)
  values ('cccccccc-0000-0000-0000-0000000000a0', 'cccccccc-0000-0000-0000-0000000000a5', 'cccccccc-0000-0000-0000-0000000000a3');
select throws_ok(
  $$ update productos set es_combo = true where id = 'cccccccc-0000-0000-0000-0000000000a3' $$,
  'P0001', 'El producto "Clásica A" es opción de un combo: no puede convertirse en combo',
  'productos rechaza es_combo=true si ya es opción de un slot');
delete from combo_opciones where producto_id = 'cccccccc-0000-0000-0000-0000000000a3';

-- #3 la RPC de cobro no es SECURITY DEFINER
select is(
  (select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'agregar_combo_a_ticket'),
  false, 'agregar_combo_a_ticket es SECURITY INVOKER');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'cccccccc-0000-0000-0000-0000000000c9',
                    'tenant_id', 'cccccccc-0000-0000-0000-0000000000a0',
                    'role', 'authenticated')::text, true);

-- #4 y #5 solo ve sus slots y sus combos
select results_eq($$ select nombre::text from combo_grupos order by 1 $$, $$ values ('Hamburguesa') $$, 'Tenant A solo ve sus combo_grupos');
select results_eq($$ select nombre::text from productos where es_combo order by 1 $$, $$ values ('Combo A'), ('Combo A2') $$, 'Tenant A solo ve sus combos');

-- #6 no inserta slots del tenant B
select throws_ok(
  $$ insert into combo_grupos (tenant_id, combo_producto_id, nombre)
     values ('cccccccc-0000-0000-0000-0000000000b0', 'cccccccc-0000-0000-0000-0000000000b2', 'intruso') $$,
  '42501', null, 'Tenant A no inserta combo_grupos del tenant B');

-- #7 sí inserta una opción propia
select lives_ok(
  $$ insert into combo_opciones (tenant_id, grupo_id, producto_id, precio_delta_mxn, es_default)
     values ('cccccccc-0000-0000-0000-0000000000a0', 'cccccccc-0000-0000-0000-0000000000a5', 'cccccccc-0000-0000-0000-0000000000a3', 0, true) $$,
  'Tenant A inserta una opción de su slot');

-- #8 el índice único parcial solo permite un es_default por slot
select throws_ok(
  $$ insert into combo_opciones (tenant_id, grupo_id, producto_id, precio_delta_mxn, es_default)
     values ('cccccccc-0000-0000-0000-0000000000a0', 'cccccccc-0000-0000-0000-0000000000a5', 'cccccccc-0000-0000-0000-0000000000a6', 0, true) $$,
  '23505', null, 'combo_opciones permite un solo es_default por slot');

-- #9 catalogo_version() (0109) también mide combo_grupos/combo_opciones: un slot nuevo es
-- "el menú cambió" tanto como un producto nuevo (0110 §3.3). Se compara contra un valor fijo
-- sembrado, no contra "no es null" — una fila en productos ya bastaría para eso y no probaría
-- que la función de verdad lee las tablas de combos.
reset role;
alter table combo_grupos disable trigger trg_combo_grupos_updated_at;
update combo_grupos set updated_at = '2099-01-01 00:00:00+00'
 where id = 'cccccccc-0000-0000-0000-0000000000a5';
alter table combo_grupos enable trigger trg_combo_grupos_updated_at;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'cccccccc-0000-0000-0000-0000000000c9',
                    'tenant_id', 'cccccccc-0000-0000-0000-0000000000a0',
                    'role', 'authenticated')::text, true);
select is(catalogo_version(), '2099-01-01 00:00:00+00'::timestamptz,
          'un slot de combo (combo_grupos) mueve catalogo_version()');

-- #10 y #11 la RPC de cobro no deja cruzar tenants: ni el combo ni sus componentes.
--
-- Hasta la revisión final este archivo solo comprobaba que agregar_combo_a_ticket no fuera
-- SECURITY DEFINER, que es la condición para que la RLS aplique, no una prueba de que aísla nada.
-- Su defensa real son los `p.tenant_id = v_tenant_id` que lleva encima del combo y encima de cada
-- componente: las FK de combo_grupos/combo_opciones apuntan a productos y categorías sin exigir
-- que el tenant coincida, así que un grupo puede acabar señalando a un producto de otro negocio.
--
-- Se corren como superusuario (RLS apagada) A PROPÓSITO: lo que se prueba es el predicado de la
-- función, no la RLS de las tablas —que ya se probó arriba—. Si alguien quitara esos predicados
-- confiando en que "la RLS ya lo cubre", estas dos aserciones se lo dirían.
reset role;

-- El ticket sale del fixture de desarrollo (tenant …aa, sucursal …bb, caja …cc, María …01) porque
-- un ticket necesita sucursal, caja y turno; los tenants cccccccc-* de arriba no los tienen.
select set_config('request.jwt.claims',
  json_build_object('sub', '99999999-0000-0000-0000-000000000001',
                    'tenant_id', '99999999-0000-0000-0000-0000000000aa')::text, true);
update turnos set estado = 'CERRADO', fecha_cierre = now()
 where caja_id = '99999999-0000-0000-0000-0000000000cc' and estado = 'ABIERTO';
insert into turnos (id, tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
values ('cccccccc-0000-0000-0000-0000000000d0', '99999999-0000-0000-0000-0000000000aa',
        '99999999-0000-0000-0000-0000000000bb', '99999999-0000-0000-0000-0000000000cc',
        'COMBOS-RLS', current_date, '99999999-0000-0000-0000-000000000001', 0, 'TOTAL');

-- Un combo propio del tenant …aa, para poder atacar solo por el componente en #11.
insert into categorias (id, tenant_id, nombre, orden_visualizacion) values
  ('cccccccc-0000-0000-0000-0000000000e1', '99999999-0000-0000-0000-0000000000aa', 'Combos RLS', 99);
insert into productos (id, tenant_id, categoria_id, nombre, precio_base_mxn, es_combo) values
  ('cccccccc-0000-0000-0000-0000000000e2', '99999999-0000-0000-0000-0000000000aa',
   'cccccccc-0000-0000-0000-0000000000e1', 'Combo RLS', 45, true);
insert into combo_grupos (id, tenant_id, combo_producto_id, nombre, modo_precio, categoria_id) values
  ('cccccccc-0000-0000-0000-0000000000e3', '99999999-0000-0000-0000-0000000000aa',
   'cccccccc-0000-0000-0000-0000000000e2', 'Principal', 'SUMA_PRECIO_PRODUCTO',
   'cccccccc-0000-0000-0000-0000000000e1');

create temporary table _combo_ticket on commit drop as
select abrir_ticket('99999999-0000-0000-0000-0000000000bb', '99999999-0000-0000-0000-0000000000cc',
                    'cccccccc-0000-0000-0000-0000000000d0', 'PARA_LLEVAR'::modo_servicio,
                    null, null, 'combos-rls-1', '99999999-0000-0000-0000-000000000001') as id;

-- #10 el combo de otro tenant. Sin el predicado, "Combo A" se encontraría y la función seguiría
-- hasta quejarse del slot ("requiere entre 1 y 1 selecciones"): por eso se afirma el mensaje exacto.
select throws_ok(
  $$ select agregar_combo_a_ticket((select id from _combo_ticket),
       'cccccccc-0000-0000-0000-0000000000a2', 1, '[]'::jsonb) $$,
  'P0001', 'El producto cccccccc-0000-0000-0000-0000000000a2 no es un combo de este negocio',
  'agregar_combo_a_ticket no mete en mi ticket un combo de otro tenant');

-- #11 el componente de otro tenant, dentro de un combo propio. Sin el predicado, "Clásica A" se
-- encontraría y el error sería otro ("no es opción del slot"), así que el mensaje discrimina.
select throws_ok(
  $$ select agregar_combo_a_ticket((select id from _combo_ticket),
       'cccccccc-0000-0000-0000-0000000000e2', 1,
       jsonb_build_array(jsonb_build_object(
         'grupo_id', 'cccccccc-0000-0000-0000-0000000000e3',
         'producto_id', 'cccccccc-0000-0000-0000-0000000000a3', 'cantidad', 1))) $$,
  'P0001', 'El producto cccccccc-0000-0000-0000-0000000000a3 no es válido como componente',
  'agregar_combo_a_ticket no acepta como componente un producto de otro tenant');

select * from finish();
rollback;
