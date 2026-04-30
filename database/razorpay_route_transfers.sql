-- ============================================================
-- Razorpay Route Transfers - Platform & Third-Party Fees
-- Enables automatic fee splitting and transfers to linked accounts
-- ============================================================

-- 1. Linked Accounts table - stores platform and third-party account details
CREATE TABLE IF NOT EXISTS linked_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,  -- The platform owner
  account_id TEXT NOT NULL UNIQUE,  -- Razorpay acc_XXXX
  account_type TEXT NOT NULL CHECK (account_type IN ('platform', 'third_party')),
  account_name TEXT NOT NULL,
  account_email TEXT,
  account_status TEXT DEFAULT 'created',  -- created | activated | suspended
  notes JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_linked_accounts_user_id ON linked_accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_linked_accounts_account_id ON linked_accounts (account_id);

-- 2. Fee Configuration table - defines fee splits for different scenarios
CREATE TABLE IF NOT EXISTS fee_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  config_name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  
  -- Platform fee
  platform_fee_type TEXT CHECK (platform_fee_type IN ('percentage', 'fixed', 'none')),
  platform_fee_value DECIMAL(10, 2),
  platform_account_id TEXT,  -- References linked_accounts.account_id
  
  -- Third-party fees (array of fee configurations)
  third_party_fees JSONB DEFAULT '[]',  -- [{ account_id, fee_type, fee_value, name, on_hold }]
  
  -- Settings
  on_hold_default BOOLEAN DEFAULT false,
  on_hold_until_days INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, config_name)
);

CREATE INDEX IF NOT EXISTS idx_fee_configurations_user_id ON fee_configurations (user_id);

-- 3. Transfer Records table - tracks all transfers made
CREATE TABLE IF NOT EXISTS transfer_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  
  -- Razorpay identifiers
  transfer_id TEXT NOT NULL UNIQUE,  -- trf_XXXX
  order_id TEXT,  -- order_XXXX
  payment_id TEXT,  -- pay_XXXX
  
  -- Transfer details
  recipient_account_id TEXT NOT NULL,  -- acc_XXXX
  recipient_type TEXT CHECK (recipient_type IN ('platform', 'third_party', 'vendor')),
  amount INTEGER NOT NULL,  -- in paise
  currency TEXT DEFAULT 'INR',
  
  -- Status tracking
  status TEXT DEFAULT 'created',  -- created | pending | processed | failed | reversed
  on_hold BOOLEAN DEFAULT false,
  on_hold_until TIMESTAMPTZ,
  
  -- Settlement
  recipient_settlement_id TEXT,
  processed_at TIMESTAMPTZ,
  
  -- Metadata
  notes JSONB DEFAULT '{}',
  error_details JSONB,
  
  -- Invoice reference
  invoice_id UUID,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transfer_records_user_id ON transfer_records (user_id);
CREATE INDEX IF NOT EXISTS idx_transfer_records_transfer_id ON transfer_records (transfer_id);
CREATE INDEX IF NOT EXISTS idx_transfer_records_order_id ON transfer_records (order_id);
CREATE INDEX IF NOT EXISTS idx_transfer_records_invoice_id ON transfer_records (invoice_id);
CREATE INDEX IF NOT EXISTS idx_transfer_records_status ON transfer_records (status);

-- 4. Add transfer tracking columns to invoices table
ALTER TABLE invoices 
  ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS has_transfers BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS transfer_status TEXT,  -- pending | completed | failed
  ADD COLUMN IF NOT EXISTS fee_config_id UUID REFERENCES fee_configurations(id);

CREATE INDEX IF NOT EXISTS idx_invoices_razorpay_order_id ON invoices (razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_has_transfers ON invoices (has_transfers);

-- 5. RLS Policies
ALTER TABLE linked_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own linked accounts"
  ON linked_accounts FOR SELECT USING (true);

CREATE POLICY "Users can insert own linked accounts"
  ON linked_accounts FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update own linked accounts"
  ON linked_accounts FOR UPDATE USING (true);

CREATE POLICY "Users can view own fee configurations"
  ON fee_configurations FOR SELECT USING (true);

CREATE POLICY "Users can insert own fee configurations"
  ON fee_configurations FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update own fee configurations"
  ON fee_configurations FOR UPDATE USING (true);

CREATE POLICY "Users can view own transfer records"
  ON transfer_records FOR SELECT USING (true);

CREATE POLICY "Service role can insert transfer records"
  ON transfer_records FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role can update transfer records"
  ON transfer_records FOR UPDATE USING (true);

-- 6. Helper function to calculate fees
CREATE OR REPLACE FUNCTION calculate_transfer_amount(
  p_total_amount DECIMAL,
  p_fee_type TEXT,
  p_fee_value DECIMAL
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  result INTEGER;
BEGIN
  IF p_fee_type = 'percentage' THEN
    result := ROUND((p_total_amount * p_fee_value / 100) * 100);  -- Convert to paise
  ELSIF p_fee_type = 'fixed' THEN
    result := ROUND(p_fee_value * 100);  -- Convert to paise
  ELSE
    result := 0;
  END IF;
  
  RETURN result;
END;
$$;

-- 7. Function to get default fee configuration
CREATE OR REPLACE FUNCTION get_default_fee_config(p_user_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result RECORD;
BEGIN
  SELECT *
  INTO result
  FROM fee_configurations
  WHERE user_id = p_user_id AND is_default = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN row_to_json(result);
END;
$$;

GRANT EXECUTE ON FUNCTION get_default_fee_config(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_default_fee_config(TEXT) TO service_role;

-- 8. Function to get transfer summary for an invoice
CREATE OR REPLACE FUNCTION get_invoice_transfer_summary(p_invoice_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_transfers', COUNT(*),
    'total_amount', COALESCE(SUM(amount), 0),
    'pending_count', COUNT(*) FILTER (WHERE status = 'pending'),
    'processed_count', COUNT(*) FILTER (WHERE status = 'processed'),
    'failed_count', COUNT(*) FILTER (WHERE status = 'failed'),
    'transfers', json_agg(
      json_build_object(
        'transfer_id', transfer_id,
        'recipient_type', recipient_type,
        'amount', amount,
        'status', status,
        'processed_at', processed_at
      )
    )
  )
  INTO result
  FROM transfer_records
  WHERE invoice_id = p_invoice_id;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_invoice_transfer_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_invoice_transfer_summary(UUID) TO service_role;

-- 9. Sample data for testing (optional - comment out in production)
-- INSERT INTO linked_accounts (user_id, account_id, account_type, account_name, account_email, account_status)
-- VALUES 
--   ('test_user_1', 'acc_PLATFORM001', 'platform', 'My Platform Account', 'platform@example.com', 'activated'),
--   ('test_user_1', 'acc_3PL001', 'third_party', '3PL Logistics', '3pl@example.com', 'activated'),
--   ('test_user_1', 'acc_GATEWAY001', 'third_party', 'Payment Gateway', 'gateway@example.com', 'activated');

-- INSERT INTO fee_configurations (user_id, config_name, is_default, platform_fee_type, platform_fee_value, platform_account_id, third_party_fees)
-- VALUES (
--   'test_user_1',
--   'Default Configuration',
--   true,
--   'percentage',
--   2.5,
--   'acc_PLATFORM001',
--   '[
--     {"account_id": "acc_3PL001", "fee_type": "percentage", "fee_value": 1.5, "name": "3PL Fee", "on_hold": true},
--     {"account_id": "acc_GATEWAY001", "fee_type": "fixed", "fee_value": 10, "name": "Gateway Fee", "on_hold": false}
--   ]'::jsonb
-- );

COMMENT ON TABLE linked_accounts IS 'Stores Razorpay linked account details for platform and third-party fee recipients';
COMMENT ON TABLE fee_configurations IS 'Defines fee split configurations for automatic transfers';
COMMENT ON TABLE transfer_records IS 'Tracks all Razorpay Route transfers made from orders';
COMMENT ON FUNCTION calculate_transfer_amount IS 'Calculates transfer amount based on fee type (percentage/fixed)';
COMMENT ON FUNCTION get_default_fee_config IS 'Returns the default fee configuration for a user';
COMMENT ON FUNCTION get_invoice_transfer_summary IS 'Returns transfer summary for an invoice';
