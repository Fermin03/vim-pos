-- ============================================================================
-- Test de PRIVILEGIOS sobre funciones SECURITY DEFINER (SEC CN-002).
--
-- El caso real que atrapa: la migración 0045 recorrió con un bucle TODAS las funciones
-- SECURITY DEFINER de `public` y les hizo `GRANT EXECUTE ... TO authenticated`. La intención
-- era sacar a `anon`; el efecto colateral fue deshacer los `REVOKE ... FROM authenticated` que
-- 0006/0012/0014/0018 habían puesto a propósito. Nadie lo notó durante 18 migraciones porque
-- ninguna prueba miraba los privilegios — solo el comportamiento con service_role.
--
-- Estas funciones NO validan al llamante por dentro (o solo parcialmente): el GRANT ES el
-- control. Un empleado con su JWT normal podía llamar resetear_pin_empleado contra el uuid del
-- dueño —de su tenant o de otro— y quedarse con la cuenta.
--
-- Corregido en 0063. Este test evita la reincidencia: si alguien vuelve a otorgar en masa,
-- el job `rls-tests` del CI lo bloquea antes del merge.
--
-- Se corre con:  supabase test db
-- ============================================================================
begin;
select plan(4);

-- #1 — pgTAP cargado.
select has_extension('pgtap');

-- Funciones que SOLO puede ejecutar service_role (Edge Functions server-side).
-- Al añadir una nueva RPC exclusiva de service_role, agrégala aquí.
create temporary table _secdef_solo_service (fn text, motivo text) on commit drop;
insert into _secdef_solo_service (fn, motivo) values
  ('resetear_pin_empleado',      'cambia el pin_hash de cualquier usuario, sin chequeo de tenant en el GRANT'),
  ('crear_perfil_con_pin',       'crea perfil con PIN elegido por el llamante'),
  ('crear_tenant_con_owner',     'da de alta tenants y su dueño'),
  ('verificar_pin_login',        'permite fuerza bruta de PIN y bloqueo (DoS) de empleados'),
  ('verificar_autorizacion_pin', 'permite fuerza bruta del PIN de un supervisor'),
  ('sync_pull_snapshot',         'devuelve el snapshot del tenant, incluidos pin_hash y auth.users'),
  ('sync_push_snapshot',         'escribe verbatim la rebanada operativa, sin disparar triggers');

-- #2 — CRÍTICA: ninguna de ellas es ejecutable por `authenticated`.
select is_empty($$
  select p.oid::regprocedure::text as ejecutable_por_authenticated
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join _secdef_solo_service s on s.fn = p.proname
  where n.nspname = 'public'
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  order by 1
$$, 'Ninguna RPC exclusiva de service_role es ejecutable por authenticated (SEC CN-002)');

-- #3 — CRÍTICA: tampoco por `anon`.
select is_empty($$
  select p.oid::regprocedure::text as ejecutable_por_anon
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join _secdef_solo_service s on s.fn = p.proname
  where n.nspname = 'public'
    and has_function_privilege('anon', p.oid, 'EXECUTE')
  order by 1
$$, 'Ninguna RPC exclusiva de service_role es ejecutable por anon (SEC CN-002)');

-- #4 — La lista de arriba no se quedó obsoleta: todas existen de verdad en el esquema.
-- Sin esto, renombrar una función la sacaría del test en silencio y la dejaría sin cobertura.
select is_empty($$
  select s.fn as en_la_lista_pero_no_existe_en_el_esquema
  from _secdef_solo_service s
  where not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = s.fn
  )
  order by 1
$$, 'Toda función listada existe en el esquema (la lista no quedó obsoleta)');

select * from finish();
rollback;
