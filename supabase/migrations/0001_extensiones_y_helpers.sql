-- ============================================================================
-- 0001 — Extensiones y funciones helper base
-- Fuente: 07-ARQUITECTURA-TECNICA-PARTE-1A §2.3 (extensiones) y §8.1/8.2/8.5 (helpers).
-- Estas funciones NO dependen de ninguna tabla; por eso van primero.
-- (calcular_dia_contable y generar_folio_ticket referencian tablas → van con ellas.)
-- ============================================================================

-- ---------- Extensiones ----------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- hash de PIN (bcrypt) y gen_random_uuid
CREATE EXTENSION IF NOT EXISTS "unaccent";   -- búsqueda sin acentos
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- búsqueda por similitud (productos/clientes)
CREATE EXTENSION IF NOT EXISTS "citext";     -- emails case-insensitive

-- ---------- f_unaccent() — wrapper IMMUTABLE de unaccent ----------
-- unaccent() es STABLE, no IMMUTABLE → no puede usarse en columnas GENERATED STORED
-- ni en índices de expresión. Este wrapper (dict fijo) sí es inmutable. Úsese en
-- columnas de búsqueda normalizada e índices pg_trgm. (Fix de bug del doc 1B.)
CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$ SELECT unaccent($1) $$;
COMMENT ON FUNCTION f_unaccent(text) IS 'unaccent IMMUTABLE para columnas generadas / índices.';

-- ---------- current_tenant_id() (1A §8.1, D13) ----------
-- Extrae el tenant_id del JWT. Base de TODAS las políticas RLS.
-- El claim lo inyecta el Custom Access Token Hook (doc 1F §3) / la Edge Function pin-login.
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(auth.jwt() ->> 'tenant_id', '')::uuid;
$$;
COMMENT ON FUNCTION current_tenant_id() IS 'Tenant del usuario autenticado vía JWT claim. Base de RLS (D13).';

-- ---------- current_sucursal_id() (1A §8.2) ----------
CREATE OR REPLACE FUNCTION current_sucursal_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(auth.jwt() ->> 'sucursal_id', '')::uuid;
$$;
COMMENT ON FUNCTION current_sucursal_id() IS 'Sucursal activa del usuario vía JWT claim.';

-- ---------- set_updated_at() (1A §8.5) ----------
-- Trigger genérico: mantiene updated_at. Se ADJUNTA a cada tabla en su propia migración.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION set_updated_at() IS 'Trigger genérico de updated_at. Adjuntar por tabla con updated_at.';
