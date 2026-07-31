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
select plan(3);

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

select * from finish();
rollback;
