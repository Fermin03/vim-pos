-- ============================================================================
-- Test RLS EXHAUSTIVO — cobertura sobre TODAS las tablas con tenant_id.
-- (Remediación Fase 6.) El test 0001 prueba el comportamiento cross-tenant sobre
-- 2 tablas; este recorre las ~81 tablas con `tenant_id` desde el catálogo y afirma,
-- por cada una, que la protección está puesta. Atrapa el olvido real: una tabla nueva
-- con tenant_id a la que se le olvidó habilitar RLS (fuga cross-tenant).
--
-- Dos afirmaciones:
--   1) CRÍTICA — ninguna tabla con tenant_id tiene RLS DESHABILITADO. RLS off + los
--      grants por defecto de Postgres = un JWT de tenant podría leer datos de otro.
--   2) Correctitud — ninguna tabla con tenant_id tiene RLS habilitado pero SIN política,
--      salvo la lista de excepciones (tablas deny-all a propósito, solo service_role).
--      Una tabla RLS-on sin política queda invisible para la app: suele ser el síntoma
--      de "habilité RLS pero olvidé la política del tenant".
--
-- Se corre con:  supabase test db
-- ============================================================================
begin;
select plan(4);

-- #1 — pgTAP cargado.
select has_extension('pgtap');

-- Tablas con tenant_id que están deny-all A PROPÓSITO (RLS forzado, sin política, solo
-- service_role). Documentar aquí cualquier tabla nueva de este tipo, con su justificación.
create temporary table _rls_exentas (tabla text) on commit drop;
insert into _rls_exentas (tabla) values
  ('super_admin_accesos');   -- SEC CN-002: bitácora de plataforma, solo service_role (mig. 0024).

-- #2 — CRÍTICA: ninguna tabla con tenant_id tiene RLS deshabilitado.
select is_empty($$
  select c.relname as tabla_con_tenant_id_SIN_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and exists (
      select 1 from information_schema.columns col
      where col.table_schema = 'public' and col.table_name = c.relname and col.column_name = 'tenant_id'
    )
    and c.relrowsecurity = false
  order by 1
$$, 'Toda tabla con tenant_id tiene ROW LEVEL SECURITY habilitado');

-- #3 — Correctitud: RLS habilitado con al menos una política (salvo las exentas).
select is_empty($$
  select c.relname as tabla_con_rls_SIN_politica
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and exists (
      select 1 from information_schema.columns col
      where col.table_schema = 'public' and col.table_name = c.relname and col.column_name = 'tenant_id'
    )
    and c.relrowsecurity = true
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
    and c.relname not in (select tabla from _rls_exentas)
  order by 1
$$, 'Toda tabla con tenant_id y RLS tiene al menos una política (o está exenta a propósito)');

-- #4 — CRÍTICA: toda vista vw_* declara security_invoker.
-- Sin esa opción la vista se ejecuta con los permisos de su DUEÑO (superusuario) y SALTA el RLS
-- de las tablas base: un tenant leería los datos de todos los demás a través de la vista. Es un
-- olvido fácil (la opción no se hereda ni se avisa) y silencioso: la vista "funciona" igual.
--
-- Se LEE el valor de la opción, no se busca la cadena "security_invoker=on" dentro de reloptions.
-- Es un booleano y Postgres lo guarda como lo recibió: `SET (security_invoker = on)` queda como
-- `on`, y `WITH (security_invoker = true)` queda como `true`. Significan lo mismo, pero la
-- comparación de texto solo reconocía una de las dos formas y marcaba como insegura una vista que
-- sí estaba protegida (`vw_cumplimiento_tiempos_delivery`, creada así en la 0078). El test llevaba
-- días en rojo por eso, y un test que grita sin motivo se acaba ignorando — que es justo lo peor
-- que le puede pasar a la comprobación que impide una fuga entre tenants.
select is_empty($$
  select c.relname as vista_SIN_security_invoker
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'v'
    and c.relname like 'vw\_%'
    and lower(coalesce(
      (select option_value from pg_options_to_table(c.reloptions) where option_name = 'security_invoker'),
      ''
    )) not in ('on', 'true')
  order by 1
$$, 'Toda vista vw_* declara security_invoker (respeta el RLS de sus tablas base)');

select * from finish();
rollback;
