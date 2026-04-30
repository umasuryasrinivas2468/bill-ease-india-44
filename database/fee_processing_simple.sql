-- ============================================================
-- Simple Fee Processing System
-- Collect full payment, then distribute fees separately
-- ============================================================

-- 1. Fee Recipients table - stores bank details for each party
CREATE TABLE IF NOT EXISTS fee_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,  -- The platform owner
  
  -- Recipient details
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('platform', 'vendor', 'gateway')),
  recipient_name TEXT NOT NULL,
  recipient_email TEXT,
  recipient_phone TEXT,
  
  -- Bank account details
  bank_account_number TEXT,
  bank_ifsc_code TEXT,
  bank_account_holder_name TEXT,
  bank_name TEXT,
  
  -- UPI details (alternative)
  upi_id TEXT,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_verified BOOLEAN DEFAULT false,
  
  -- Metadata
  notes JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fee_recipients_user_id ON fee_recipients (user_id);
CREATE INDEX IF NOT EXISTS idx_fee_recipients_type ON fee_recipients (recipient_type);

-- 2. Fee Structure table - defines how fees are calculated
CREATE TABLE IF NOT EXISTS fee_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  structure_name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  
  -- Platform fee
  platform_fee_enabled BOOLEAN DEFAULT true,
  platform_fee_type TEXT CHECK (platform_fee_type IN ('percentage', 'fixed', 'none')),
  platform_fee_value DECIMAL(10, 2),
  platform_recipient_id UUID REFERENCES fee_recipients(id),
  
  -- Gateway fee
  gateway_fee_enabled BOOLEAN DEFAULT false,
  gateway_fee_type TEXT CHECK (gateway_fee_type IN ('percentage', 'fixed', 'percentage_plus_fixed', 'none')),
  gateway_fee_percentage DECIMAL(5, 2),  -- e.g., 2.0 for 2%
  gateway_fee_fixed DECIMAL(10, 2),      -- e.g., 3.00 for ₹3
  gateway_recipient_id UUID REFERENCES fee_recipients(id),
  
  -- Other fees (custom)
  other_fees JSONB DEFAULT '[]',  -- [{ name, type, value, recipient_id }]
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, structure_name)
);

CREATE INDEX IF NOT EXISTS idx_fee_structures_user_id ON fee_structures (user_id);

-- 3. Transaction Fees table - stores calculated fees for each transaction
CREATE TABLE IF NOT EXISTS transaction_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  
  -- Transaction reference
  invoice_id UUID REFERENCES invoices(id),
  payment_id TEXT,  -- Razorpay payment_id
  order_id TEXT,    -- Razorpay order_id
  
  -- Amounts (all in rupees, not paise)
  total_amount DECIMAL(12, 2) NOT NULL,
  
  -- Fee breakdown
  platform_fee DECIMAL(12, 2) DEFAULT 0,
  gateway_fee DECIMAL(12, 2) DEFAULT 0,
  other_fees DECIMAL(12, 2) DEFAULT 0,
  total_fees DECIMAL(12, 2) DEFAULT 0,
  
  -- Vendor amount (what they receive)
  vendor_amount DECIMAL(12, 2) NOT NULL,
  
  -- Fee structure used
  fee_structure_id UUID REFERENCES fee_structures(id),
  fee_breakdown JSONB DEFAULT '{}',  -- Detailed breakdown
  
  -- Status
  status TEXT DEFAULT 'calculated' CHECK (status IN ('calculated', 'processing', 'completed', 'failed')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transaction_fees_user_id ON transaction_fees (user_id);
CREATE INDEX IF NOT EXISTS idx_transaction_fees_invoice_id ON transaction_fees (invoice_id);
CREATE INDEX IF NOT EXISTS idx_transaction_fees_status ON transaction_fees (status);

-- 4. Payout Records table - tracks actual payouts to recipients
CREATE TABLE IF NOT EXISTS payout_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  
  -- Transaction reference
  transaction_fee_id UUID REFERENCES transaction_fees(id),
  invoice_id UUID REFERENCES invoices(id),
  
  -- Recipient details
  recipient_id UUID REFERENCES fee_recipients(id),
  recipient_type TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  
  -- Payout details
  payout_amount DECIMAL(12, 2) NOT NULL,
  payout_method TEXT CHECK (payout_method IN ('bank_transfer', 'upi', 'razorpay_payout', 'manual', 'other')),
  
  -- Bank/UPI details (snapshot at time of payout)
  bank_account_number TEXT,
  bank_ifsc_code TEXT,
  upi_id TEXT,
  
  -- External reference (from payment gateway)
  external_payout_id TEXT,  -- Razorpay payout_id or bank reference
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  
  -- Timestamps
  initiated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  
  -- Error tracking
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- Metadata
  notes JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payout_records_user_id ON payout_records (user_id);
CREATE INDEX IF NOT EXISTS idx_payout_records_transaction_fee_id ON payout_records (transaction_fee_id);
CREATE INDEX IF NOT EXISTS idx_payout_records_recipient_id ON payout_records (recipient_id);
CREATE INDEX IF NOT EXISTS idx_payout_records_status ON payout_records (status);

-- 5. Add fee tracking columns to invoices
ALTER TABLE invoices 
  ADD COLUMN IF NOT EXISTS transaction_fee_id UUID REFERENCES transaction_fees(id),
  ADD COLUMN IF NOT EXISTS fees_calculated BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS payouts_completed BOOLEAN DEFAULT false;

-- 6. RLS Policies
ALTER TABLE fee_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own fee recipients"
  ON fee_recipients FOR SELECT USING (true);

CREATE POLICY "Users can manage own fee recipients"
  ON fee_recipients FOR ALL USING (true);

CREATE POLICY "Users can view own fee structures"
  ON fee_structures FOR SELECT USING (true);

CREATE POLICY "Users can manage own fee structures"
  ON fee_structures FOR ALL USING (true);

CREATE POLICY "Users can view own transaction fees"
  ON transaction_fees FOR SELECT USING (true);

CREATE POLICY "Service role can manage transaction fees"
  ON transaction_fees FOR ALL USING (true);

CREATE POLICY "Users can view own payout records"
  ON payout_records FOR SELECT USING (true);

CREATE POLICY "Service role can manage payout records"
  ON payout_records FOR ALL USING (true);

-- 7. Helper function to calculate fees
CREATE OR REPLACE FUNCTION calculate_transaction_fees(
  p_user_id TEXT,
  p_total_amount DECIMAL,
  p_fee_structure_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_structure RECORD;
  v_platform_fee DECIMAL := 0;
  v_gateway_fee DECIMAL := 0;
  v_other_fees DECIMAL := 0;
  v_total_fees DECIMAL := 0;
  v_vendor_amount DECIMAL;
  v_breakdown JSONB := '[]'::jsonb;
BEGIN
  -- Get fee structure (default if not specified)
  IF p_fee_structure_id IS NULL THEN
    SELECT * INTO v_structure
    FROM fee_structures
    WHERE user_id = p_user_id AND is_default = true
    LIMIT 1;
  ELSE
    SELECT * INTO v_structure
    FROM fee_structures
    WHERE id = p_fee_structure_id AND user_id = p_user_id;
  END IF;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'error', 'No fee structure found',
      'platform_fee', 0,
      'gateway_fee', 0,
      'other_fees', 0,
      'total_fees', 0,
      'vendor_amount', p_total_amount
    );
  END IF;

  -- Calculate platform fee
  IF v_structure.platform_fee_enabled THEN
    IF v_structure.platform_fee_type = 'percentage' THEN
      v_platform_fee := ROUND((p_total_amount * v_structure.platform_fee_value / 100), 2);
    ELSIF v_structure.platform_fee_type = 'fixed' THEN
      v_platform_fee := v_structure.platform_fee_value;
    END IF;
    
    v_breakdown := v_breakdown || jsonb_build_object(
      'type', 'platform',
      'name', 'Platform Fee',
      'amount', v_platform_fee,
      'calculation', v_structure.platform_fee_type || ': ' || v_structure.platform_fee_value
    );
  END IF;

  -- Calculate gateway fee
  IF v_structure.gateway_fee_enabled THEN
    IF v_structure.gateway_fee_type = 'percentage' THEN
      v_gateway_fee := ROUND((p_total_amount * v_structure.gateway_fee_percentage / 100), 2);
    ELSIF v_structure.gateway_fee_type = 'fixed' THEN
      v_gateway_fee := v_structure.gateway_fee_fixed;
    ELSIF v_structure.gateway_fee_type = 'percentage_plus_fixed' THEN
      v_gateway_fee := ROUND((p_total_amount * v_structure.gateway_fee_percentage / 100), 2) + v_structure.gateway_fee_fixed;
    END IF;
    
    v_breakdown := v_breakdown || jsonb_build_object(
      'type', 'gateway',
      'name', 'Payment Gateway Fee',
      'amount', v_gateway_fee,
      'calculation', v_structure.gateway_fee_type
    );
  END IF;

  -- Calculate other fees
  IF v_structure.other_fees IS NOT NULL AND jsonb_array_length(v_structure.other_fees) > 0 THEN
    DECLARE
      v_fee JSONB;
      v_fee_amount DECIMAL;
    BEGIN
      FOR v_fee IN SELECT * FROM jsonb_array_elements(v_structure.other_fees)
      LOOP
        IF v_fee->>'type' = 'percentage' THEN
          v_fee_amount := ROUND((p_total_amount * (v_fee->>'value')::DECIMAL / 100), 2);
        ELSIF v_fee->>'type' = 'fixed' THEN
          v_fee_amount := (v_fee->>'value')::DECIMAL;
        ELSE
          v_fee_amount := 0;
        END IF;
        
        v_other_fees := v_other_fees + v_fee_amount;
        
        v_breakdown := v_breakdown || jsonb_build_object(
          'type', 'other',
          'name', v_fee->>'name',
          'amount', v_fee_amount,
          'calculation', v_fee->>'type' || ': ' || v_fee->>'value'
        );
      END LOOP;
    END;
  END IF;

  -- Calculate totals
  v_total_fees := v_platform_fee + v_gateway_fee + v_other_fees;
  v_vendor_amount := p_total_amount - v_total_fees;

  RETURN json_build_object(
    'platform_fee', v_platform_fee,
    'gateway_fee', v_gateway_fee,
    'other_fees', v_other_fees,
    'total_fees', v_total_fees,
    'vendor_amount', v_vendor_amount,
    'breakdown', v_breakdown,
    'fee_structure_id', v_structure.id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_transaction_fees TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_transaction_fees TO service_role;

-- 8. Function to get payout summary
CREATE OR REPLACE FUNCTION get_payout_summary(p_user_id TEXT, p_date_from TIMESTAMPTZ DEFAULT NULL, p_date_to TIMESTAMPTZ DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'total_payouts', COUNT(*),
    'total_amount', COALESCE(SUM(payout_amount), 0),
    'pending_count', COUNT(*) FILTER (WHERE status = 'pending'),
    'pending_amount', COALESCE(SUM(payout_amount) FILTER (WHERE status = 'pending'), 0),
    'completed_count', COUNT(*) FILTER (WHERE status = 'completed'),
    'completed_amount', COALESCE(SUM(payout_amount) FILTER (WHERE status = 'completed'), 0),
    'failed_count', COUNT(*) FILTER (WHERE status = 'failed'),
    'failed_amount', COALESCE(SUM(payout_amount) FILTER (WHERE status = 'failed'), 0),
    'by_recipient_type', (
      SELECT json_object_agg(recipient_type, json_build_object('count', count, 'amount', amount))
      FROM (
        SELECT 
          recipient_type,
          COUNT(*) as count,
          COALESCE(SUM(payout_amount), 0) as amount
        FROM payout_records
        WHERE user_id = p_user_id
          AND (p_date_from IS NULL OR created_at >= p_date_from)
          AND (p_date_to IS NULL OR created_at <= p_date_to)
        GROUP BY recipient_type
      ) sub
    )
  )
  INTO v_result
  FROM payout_records
  WHERE user_id = p_user_id
    AND (p_date_from IS NULL OR created_at >= p_date_from)
    AND (p_date_to IS NULL OR created_at <= p_date_to);

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_payout_summary TO authenticated;

COMMENT ON TABLE fee_recipients IS 'Stores bank/UPI details for all fee recipients (platform, vendors, gateway)';
COMMENT ON TABLE fee_structures IS 'Defines how fees are calculated for different scenarios';
COMMENT ON TABLE transaction_fees IS 'Stores calculated fee breakdown for each transaction';
COMMENT ON TABLE payout_records IS 'Tracks actual payouts made to recipients';
COMMENT ON FUNCTION calculate_transaction_fees IS 'Calculates all fees for a transaction based on fee structure';
COMMENT ON FUNCTION get_payout_summary IS 'Returns payout summary statistics for a user';
