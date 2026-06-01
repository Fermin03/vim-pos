-- ============================================================================
-- Test RLS cross-tenant — el chequeo de seguridad NO NEGOCIABLE (Guía §9, §13).
-- Verifica que un usuario autenticado de un tenant NO puede ver ni escribir
-- filas de otro tenant. Se corre con:  supabase test db
--
-- Cómo simula la sesión: fija el rol `authenticated` y el claim JWT
-- `request.jwt.claims` con el tenant_id; así `auth.jwt() ->> 'tenant_id'`
-- (base de todas las políticas RLS, doc 1A §8.1) resuelve al tenant simulado.
-- ============================================================================
begin;
select plan(8);

-- ¿pgTAP cargado? (cuenta como test #1)
select has_extension('pgtap');

-- --- IDs de prueba ---
\set tenant_a '11111111-1111-1111-1111-111111111111'
\set tenant_b '22222222-2222-2222-2222-222222222222'

-- ----------------------------------------------------------------------------
-- SETUP (rol por defecto = superusuario → RLS se omite para sembrar datos)
-- ----------------------------------------------------------------------------
insert into tenants (id, codigo, nombre_comercial, estado, vertical_principal) values
  (:'tenant_a', 'tenant-a', 'Tenant A', 'INTERNO', 'QUICK_SERVICE'),
  (:'tenant_b', 'tenant-b', 'Tenant B', 'INTERNO', 'QUICK_SERVICE');

-- tabla scoped por tenant, mínima en columnas obligatorias
insert into tenant_feature_flags (tenant_id, flag_codigo) values
  (:'tenant_a', 'beta_a'),
  (:'tenant_b', 'beta_b');

-- ----------------------------------------------------------------------------
-- COMO TENANT A (authenticated + claim tenant_a)
-- ----------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"role":"authenticated","tenant_id":"11111111-1111-1111-1111-111111111111"}';

-- 1) Solo ve SU propio tenant
select is(
  (select count(*)::int from tenants),
  1,
  'Tenant A ve exactamente 1 tenant (el suyo)'
);

-- 2) Y es el correcto
select is(
  (select codigo from tenants),
  'tenant-a',
  'El tenant visible para A es tenant-a'
);

-- 3) Solo ve SUS feature flags (no los de B)
select is(
  (select count(*)::int from tenant_feature_flags),
  1,
  'Tenant A ve solo su feature flag'
);

-- 4) Y es el suyo
select is(
  (select flag_codigo from tenant_feature_flags),
  'beta_a',
  'El flag visible para A es beta_a'
);

-- 5) NO puede INSERTAR una fila a nombre del tenant B (WITH CHECK lo bloquea)
select throws_ok(
  $$ insert into tenant_feature_flags (tenant_id, flag_codigo)
     values ('22222222-2222-2222-2222-222222222222', 'intruso') $$,
  '42501',  -- insufficient_privilege / RLS violation
  NULL,
  'Tenant A NO puede insertar filas del tenant B'
);

-- ----------------------------------------------------------------------------
-- COMO TENANT B (cambia el claim; rol sigue authenticated)
-- ----------------------------------------------------------------------------
set local "request.jwt.claims" to '{"role":"authenticated","tenant_id":"22222222-2222-2222-2222-222222222222"}';

-- 6) B ve solo su tenant
select is(
  (select codigo from tenants),
  'tenant-b',
  'Tenant B ve solo tenant-b (aislamiento simétrico)'
);

-- 7) B no ve los flags de A
select is(
  (select count(*)::int from tenant_feature_flags where flag_codigo = 'beta_a'),
  0,
  'Tenant B no ve los feature flags de A'
);

reset role;
select * from finish();
rollback;
