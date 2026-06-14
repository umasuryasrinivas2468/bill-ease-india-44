-- =============================================================================
-- Supabase-compatible `auth` helper schema.
-- Some RLS policies in supabase/migrations reference auth.uid()/auth.role()/
-- auth.jwt() (e.g. 20260527000001_asset_revaluation.sql). Most policies read
-- current_setting('request.jwt.claims')->>'sub' directly. Both paths work once
-- these functions exist and PostgREST sets the request.jwt.claims GUC.
--
-- NOTE: We deliberately do NOT recreate Supabase's auth.users table; user_id
-- columns are plain text Clerk IDs with no FK into auth, so nothing depends on
-- a users table. Clerk remains the identity provider.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

-- Full decoded JWT claims as jsonb (empty object if none).
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

-- The authenticated user's id (Clerk 'sub').
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  );
$$;

-- The role claim (anon / authenticated / service_role).
CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  );
$$;

-- Optional email helper (used by some policies / triggers if present).
CREATE OR REPLACE FUNCTION auth.email()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email');
$$;

GRANT EXECUTE ON FUNCTION auth.jwt(), auth.uid(), auth.role(), auth.email()
  TO anon, authenticated, service_role;
