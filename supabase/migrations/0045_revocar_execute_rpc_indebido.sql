-- 0045 — Cerrar lints 0028/0029 (anon/authenticated pueden ejecutar funciones SECURITY DEFINER
-- vía /rest/v1/rpc). Endurecimiento: quitar de la API expuesta las funciones que no deben ser RPC.
--
-- IMPORTANTE: el privilegio EXECUTE por defecto de las funciones es a `PUBLIC` (rol que TODOS
-- heredan). Revocar solo de anon/authenticated no basta: hay que revocar de PUBLIC y volver a
-- otorgar explícitamente a quien sí debe.
--
--  1) Funciones de TRIGGER (retornan `trigger`): NUNCA deben llamarse por la API. Se revoca de
--     PUBLIC/anon/authenticated. Los triggers siguen disparándose (el mecanismo de trigger no
--     depende del privilegio EXECUTE del rol que hace el INSERT/UPDATE).
--  2) Funciones SECURITY DEFINER que NO son trigger: se revoca de PUBLIC y anon; se vuelve a
--     otorgar a `authenticated` y `service_role` (la app las llama firmado y validan autorización
--     internamente; el service_role las usa desde Edge Functions). Queda fuera `anon`.
--
-- DIFERIDO a propósito: extension_in_public (unaccent/pg_trgm/citext). Mover citext rompe 3
-- columnas que usan ese tipo y mover pg_trgm rompe índices trigram. Es hardening blando.

-- 1) Trigger functions → fuera de la API por completo
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prorettype = 'trigger'::regtype
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

-- 2) Funciones SECURITY DEFINER no-trigger → quitar de anon, mantener authenticated + service_role
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.prorettype <> 'trigger'::regtype
      AND p.proname <> 'custom_access_token_hook'  -- el auth hook no se toca
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;
