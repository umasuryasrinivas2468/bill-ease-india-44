-- =============================================================================
-- Roles that PostgREST + RLS rely on (Supabase-compatible).
--   anon           : unauthenticated requests
--   authenticated  : logged-in users (Clerk JWT with role=authenticated)
--   service_role   : backend (edge functions / node) - bypasses RLS
--   authenticator  : the LOGIN role PostgREST connects as; it SET ROLEs to the
--                    above based on the JWT 'role' claim.
-- Run as the postgres superuser. AUTHENTICATOR_PASSWORD is injected by the
-- bootstrap script (psql -v authenticator_password=...).
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD :'authenticator_password';
  ELSE
    ALTER ROLE authenticator WITH LOGIN PASSWORD :'authenticator_password';
  END IF;
END
$$;

-- authenticator may assume any of the request roles
GRANT anon, authenticated, service_role TO authenticator;

-- Schema usage
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
