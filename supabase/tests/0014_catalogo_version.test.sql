-- ============================================================================
-- catalogo_version() — la señal de "el menú cambió" que sondea la caja (migración 0109).
--
-- Lo que se protege:
--   · que un tenant NO mida el menú de otro. Si lo midiera, cada alta de producto de un negocio
--     haría bajar el catálogo a las cajas de TODOS los demás, y de paso les diría a qué hora
--     trabaja la competencia;
--   · que un ALTA y un BORRADO muevan la versión. El borrado es el que se olvida: si no la
--     moviera, la caja seguiría vendiendo un producto que el dueño quitó del menú;
--   · que la función NO sea SECURITY DEFINER (regla dura #1). Toda su seguridad es la RLS de
--     quien llama; con DEFINER se la saltaría y cualquier dispositivo mediría a todo el mundo.
--
-- Nota de método: dentro de una transacción `now()` es constante, así que dos cambios seguidos
-- comparten updated_at y no se pueden comparar entre sí. Por eso cada caso usa un tenant con
-- fechas sembradas viejas y comprueba el salto contra ESAS, no contra el cambio anterior.
--
-- Se corre con:  supabase test db
-- ============================================================================
begin;
select plan(8);

\set tenant_a 'dddddddd-0000-0000-0000-0000000000a0'
\set tenant_b 'dddddddd-0000-0000-0000-0000000000b0'
\set tenant_c 'dddddddd-0000-0000-0000-0000000000c0'

-- ── SETUP (rol por defecto = superusuario → sin RLS, para sembrar) ──────────
insert into tenants (id, codigo, nombre_comercial, estado, vertical_principal) values
  (:'tenant_a', 'catver-a', 'Catálogo A', 'INTERNO', 'QUICK_SERVICE'),
  (:'tenant_b', 'catver-b', 'Catálogo B', 'INTERNO', 'QUICK_SERVICE'),
  (:'tenant_c', 'catver-c', 'Catálogo C', 'INTERNO', 'QUICK_SERVICE');

insert into categorias (id, tenant_id, nombre, orden_visualizacion) values
  ('dddddddd-0000-0000-0000-0000000000a1', :'tenant_a', 'Hamburguesas', 1),
  ('dddddddd-0000-0000-0000-0000000000b1', :'tenant_b', 'Pizzas', 1),
  ('dddddddd-0000-0000-0000-0000000000c1', :'tenant_c', 'Postres', 1);

insert into productos (id, tenant_id, categoria_id, nombre, precio_base_mxn) values
  ('dddddddd-0000-0000-0000-0000000000a2', :'tenant_a', 'dddddddd-0000-0000-0000-0000000000a1',
   'Doble con queso', 120.00),
  ('dddddddd-0000-0000-0000-0000000000b2', :'tenant_b', 'dddddddd-0000-0000-0000-0000000000b1',
   'Pepperoni', 180.00),
  ('dddddddd-0000-0000-0000-0000000000c2', :'tenant_c', 'dddddddd-0000-0000-0000-0000000000c1',
   'Flan', 45.00);

-- Fechas viejas y distintas por tenant. El trigger de updated_at solo corre en UPDATE, así que
-- este UPDATE directo a la columna sí se pisa a sí mismo — se hace en dos pasos por eso.
alter table categorias disable trigger trg_categorias_updated_at;
alter table productos  disable trigger trg_productos_updated_at;
update categorias set updated_at = '2026-01-01 09:00:00+00' where tenant_id = :'tenant_a';
update productos  set updated_at = '2026-01-01 10:00:00+00' where tenant_id = :'tenant_a';
update categorias set updated_at = '2026-06-01 09:00:00+00' where tenant_id = :'tenant_b';
update productos  set updated_at = '2026-06-01 10:00:00+00' where tenant_id = :'tenant_b';
update categorias set updated_at = '2026-02-01 09:00:00+00' where tenant_id = :'tenant_c';
update productos  set updated_at = '2026-02-01 10:00:00+00' where tenant_id = :'tenant_c';
alter table categorias enable trigger trg_categorias_updated_at;
alter table productos  enable trigger trg_productos_updated_at;

-- #1 la función existe, sin argumentos
select has_function('catalogo_version', array[]::text[], 'catalogo_version() existe');

-- #2 NO es SECURITY DEFINER
select is(
  (select p.prosecdef from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'catalogo_version'),
  false,
  'catalogo_version() es SECURITY INVOKER (no se salta la RLS)');

-- #3 anon no puede ni preguntar
select is(
  has_function_privilege('anon', 'public.catalogo_version()', 'EXECUTE'),
  false,
  'anon no puede ejecutar catalogo_version()');

-- ── COMO TENANT A ──────────────────────────────────────────────────────────
set local role authenticated;
set local "request.jwt.claims" to '{"role":"authenticated","tenant_id":"dddddddd-0000-0000-0000-0000000000a0"}';

-- #4 mide SU menú. El de B es de junio y es mayor: si se colara, ganaría y este test caería.
select is(catalogo_version(), '2026-01-01 10:00:00+00'::timestamptz,
          'el tenant A mide su propio menú, no el del vecino');

-- #5 un producto NUEVO mueve la versión — el caso que originó todo esto
insert into productos (tenant_id, categoria_id, nombre, precio_base_mxn)
values ('dddddddd-0000-0000-0000-0000000000a0', 'dddddddd-0000-0000-0000-0000000000a1',
        'Papas grandes', 60.00);
select is(
  catalogo_version(),
  (select updated_at from productos where nombre = 'Papas grandes'),
  'dar de alta un producto mueve la versión');

-- ── COMO TENANT C — el borrado ─────────────────────────────────────────────
set local "request.jwt.claims" to '{"role":"authenticated","tenant_id":"dddddddd-0000-0000-0000-0000000000c0"}';

-- #6 punto de partida conocido
select is(catalogo_version(), '2026-02-01 10:00:00+00'::timestamptz,
          'el tenant C parte de la fecha sembrada');

-- #7 borrar su único producto mueve la versión (la caja tiene que dejar de mostrarlo)
update productos set deleted_at = now()
 where id = 'dddddddd-0000-0000-0000-0000000000c2';
select ok(catalogo_version() > '2026-02-01 10:00:00+00'::timestamptz,
          'borrar un producto mueve la versión');

-- ── COMO TENANT B — el control ─────────────────────────────────────────────
-- Todo el movimiento anterior fue de A y de C. Si B lo viera, su caja bajaría el catálogo sin
-- que nadie hubiera tocado su menú.
set local "request.jwt.claims" to '{"role":"authenticated","tenant_id":"dddddddd-0000-0000-0000-0000000000b0"}';

-- #8
select is(catalogo_version(), '2026-06-01 10:00:00+00'::timestamptz,
          'el trajín de otros tenants no mueve la versión del tenant B');

reset role;
select * from finish();
rollback;
