-- ═══════════════════════════════════════════════════════════════════
-- Razorpay Tech Partner OAuth migration
-- Replaces the Route Marketplace flow with OAuth-based sub-merchant onboarding
-- Run AFTER the earlier razorpay_* migrations
-- ═══════════════════════════════════════════════════════════════════

-- 1. OAuth token columns on payment_settings
ALTER TABLE payment_settings
  ADD COLUMN IF NOT EXISTS razorpay_access_token TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_public_token TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_token_expires_at TIMESTAMPTZ;

-- 2. Short-lived OAuth state (CSRF token) table
CREATE TABLE IF NOT EXISTS razorpay_oauth_states (
  state          TEXT        PRIMARY KEY,
  user_id        TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes')
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_expires
  ON razorpay_oauth_states(expires_at);

ALTER TABLE razorpay_oauth_states ENABLE ROW LEVEL SECURITY;

-- Only service role touches this table (edge functions use service role key).
-- No anon/authenticated policies = no access from the browser. Good.

-- 3. Clean-up function for expired states (safe to call from anywhere)
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_states()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  DELETE FROM razorpay_oauth_states WHERE expires_at < NOW();
$$;
