-- ============================================================
-- Migration: Remove 3PL/Logistics from Fee Processing System
-- Run this in Supabase SQL Editor
-- ============================================================

-- Step 1: Remove logistics fee fields from fee_structures table
ALTER TABLE fee_structures 
  DROP COLUMN IF EXISTS logistics_fee_enabled CASCADE,
  DROP COLUMN IF EXISTS logistics_fee_type CASCADE,
  DROP COLUMN IF EXISTS logistics_fee_value CASCADE,
  DROP COLUMN IF EXISTS logistics_recipient_id CASCADE;

-- Step 2: Remove logistics_fee from transaction_fees table
ALTER TABLE transaction_fees 
  DROP COLUMN IF EXISTS logistics_fee CASCADE;

-- Step 3: Update recipient_type constraint on fee_recipients
ALTER TABLE fee_recipients 
  DROP CONSTRAINT IF EXISTS fee_recipients_recipient_type_check;

ALTER TABLE fee_recipients 
  ADD CONSTRAINT fee_recipients_recipient_type_check 
  CHECK (recipient_type IN ('platform', 'vendor', 'gateway'));

-- Step 4: Drop and recreate the calculate_transaction_fees function
DROP FUNCTION IF EXISTS calculate_transaction_fees(TEXT, DECIMAL, UUID);

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

-- Step 5: Update table comments
COMMENT ON TABLE fee_recipients IS 'Stores bank/UPI details for all fee recipients (platform, vendors, gateway)';
COMMENT ON TABLE fee_structures IS 'Defines how fees are calculated for different scenarios';
COMMENT ON TABLE transaction_fees IS 'Stores calculated fee breakdown for each transaction';
COMMENT ON TABLE payout_records IS 'Tracks actual payouts made to recipients';
COMMENT ON FUNCTION calculate_transaction_fees IS 'Calculates all fees for a transaction based on fee structure';

-- Step 6: (Optional) Clean up existing 3PL recipients
-- Uncomment the line below if you want to delete existing 3PL recipients
-- DELETE FROM fee_recipients WHERE recipient_type = '3pl';

-- Step 7: Verify migration
SELECT 
  'Migration Complete!' as status,
  '3PL fields removed successfully' as message,
  NOW() as completed_at;

-- Verification queries (run these to confirm changes)
SELECT 
  'fee_structures logistics columns' as check_name,
  COUNT(*) as count,
  CASE WHEN COUNT(*) = 0 THEN '✅ PASS' ELSE '❌ FAIL' END as result
FROM information_schema.columns 
WHERE table_name = 'fee_structures' 
  AND column_name LIKE '%logistics%'

UNION ALL

SELECT 
  'transaction_fees logistics columns' as check_name,
  COUNT(*) as count,
  CASE WHEN COUNT(*) = 0 THEN '✅ PASS' ELSE '❌ FAIL' END as result
FROM information_schema.columns 
WHERE table_name = 'transaction_fees' 
  AND column_name LIKE '%logistics%'

UNION ALL

SELECT 
  'calculate_transaction_fees function' as check_name,
  COUNT(*) as count,
  CASE WHEN COUNT(*) = 1 THEN '✅ PASS' ELSE '❌ FAIL' END as result
FROM information_schema.routines
WHERE routine_name = 'calculate_transaction_fees';
