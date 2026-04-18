-- ============================================================
-- Razorpay Route Vendor Onboarding
-- Run this in your Supabase SQL Editor AFTER razorpay_payment_setup.sql
-- ============================================================ 

-- 1. Table to store each vendor's Razorpay Route linked-account info
CREATE TABLE IF NOT EXISTS payment_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,
  razorpay_account_id TEXT,              -- acc_XXXX from Razorpay Route
  razorpay_account_status TEXT DEFAULT 'not_created',  -- not_created | created | needs_clarification | under_review | activated | suspended
  razorpay_product_id TEXT,              -- route product ID
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_payment_settings_user_id ON payment_settings (user_id);

-- 3. RLS — users can only access their own row
ALTER TABLE payment_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payment settings"
  ON payment_settings FOR SELECT USING (true);

CREATE POLICY "Users can insert own payment settings"
  ON payment_settings FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update own payment settings"
  ON payment_settings FOR UPDATE USING (true);

-- 4. RPC: Get vendor's active Razorpay Route account ID (used by SharePaymentLinkDialog)
--    SECURITY DEFINER so it works for both authed and anon callers
CREATE OR REPLACE FUNCTION get_vendor_razorpay_account(p_user_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result RECORD;
BEGIN
  SELECT razorpay_account_id, razorpay_account_status
  INTO result
  FROM payment_settings
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN json_build_object('account_id', NULL, 'status', 'not_created');
  END IF;

  RETURN json_build_object(
    'account_id', result.razorpay_account_id,
    'status', result.razorpay_account_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_vendor_razorpay_account(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_vendor_razorpay_account(TEXT) TO authenticated;
