-- ============================================================================
-- Fase 0 · Capa de compatibilidad "Supabase → Postgres plano"
-- ----------------------------------------------------------------------------
-- Las migraciones de VIM POS asumen la plataforma Supabase: schema `auth`
-- (users + jwt()/uid()), schema `storage` (objects + foldername) y los roles
-- anon/authenticated/service_role/supabase_auth_admin/authenticator.
-- Un Postgres embebido NO trae nada de esto. Este script lo provee UNA vez,
-- antes de correr las 53 migraciones. Es TODO el pegamento que hace falta.
-- ============================================================================

-- ---------- Roles estándar de Supabase ----------
DO $$ BEGIN CREATE ROLE anon           NOLOGIN NOINHERIT;                 EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated  NOLOGIN NOINHERIT;                 EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role   NOLOGIN NOINHERIT BYPASSRLS;       EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE supabase_auth_admin NOLOGIN NOINHERIT CREATEROLE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- authenticator: el rol de login con el que PostgREST se conecta y hace SET ROLE.
DO $$ BEGIN CREATE ROLE authenticator  LOGIN NOINHERIT PASSWORD 'postgres'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT anon, authenticated, service_role TO authenticator;
GRANT anon, authenticated, service_role, supabase_auth_admin TO postgres;

-- Uso de schemas (PostgREST expone `public`; el resto lo llaman las funciones).
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

-- ---------- Schema auth + shim de GoTrue ----------
CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role, postgres;

-- auth.users: subconjunto compatible con lo que inserta seed.sql y con las 169
-- FKs `REFERENCES auth.users(id)`. GoTrue tiene más columnas; estas bastan.
CREATE TABLE IF NOT EXISTS auth.users (
  instance_id         uuid,
  id                  uuid PRIMARY KEY,
  aud                 varchar(255),
  role                varchar(255),
  email               varchar(255),
  encrypted_password  varchar(255),
  email_confirmed_at  timestamptz,
  invited_at          timestamptz,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  raw_app_meta_data   jsonb DEFAULT '{}'::jsonb,
  raw_user_meta_data  jsonb DEFAULT '{}'::jsonb,
  is_super_admin      boolean,
  phone               text,
  -- Columnas internas de GoTrue que el seed normaliza a '' (GoTrue las lee NOT NULL).
  confirmation_token         varchar(255) DEFAULT '',
  recovery_token             varchar(255) DEFAULT '',
  email_change               varchar(255) DEFAULT '',
  email_change_token_new     varchar(255) DEFAULT '',
  email_change_token_current varchar(255) DEFAULT '',
  phone_change               varchar(255) DEFAULT '',
  phone_change_token         varchar(255) DEFAULT '',
  reauthentication_token     varchar(255) DEFAULT ''
);

-- auth.jwt(): claims que PostgREST publica en el GUC request.jwt.claims (idéntico a Supabase).
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim',  true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

CREATE OR REPLACE FUNCTION auth.email() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')::text
$$;

GRANT EXECUTE ON FUNCTION auth.jwt(), auth.uid(), auth.role(), auth.email()
  TO anon, authenticated, service_role;

-- ---------- Schema storage + shim mínimo (políticas CFDI de 0009) ----------
CREATE SCHEMA IF NOT EXISTS storage;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role, postgres;

CREATE TABLE IF NOT EXISTS storage.objects (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id  text,
  name       text,
  owner      uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  metadata   jsonb
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- storage.foldername(): parte el path por '/' y quita el archivo (igual que Supabase).
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[]
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE _parts text[];
BEGIN
  _parts := string_to_array(name, '/');
  RETURN _parts[1 : array_length(_parts, 1) - 1];
END $$;

-- pgcrypto vive en public en este bootstrap; gen_random_uuid() ya está disponible.
