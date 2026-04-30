# Supabase Migration Guide - Remove 3PL

## Overview
This guide shows you exactly what to do in Supabase to remove 3PL from your fee processing system.

---

## Option 1: Fresh Installation (Recommended if not in production)

If you haven't deployed the fee processing system yet, or can start fresh:

### Step 1: Run the Updated Schema
1. Open Supabase Dashboard
2. Go to **SQL Editor**
3. Click **New Query**
4. Copy and paste the entire content from `database/fee_processing_simple.sql`
5. Click **Run**

✅ This will create all tables without 3PL fields.

---

## Option 2: Migration (If you already have data)

If you've already deployed the old version with 3PL support:

### Step 1: Run Migration SQL

1. Open Supabase Dashboard
2. Go to **SQL Editor**
3. Click **New Query**
4. Copy and paste this migration:

```sql
-- ============================================================
-- Migration: Remove 3PL/Logistics from Fee Processing
-- ============================================================

-- 1. Remove logistics fee fields from fee_structures table
ALTER TABLE fee_structures 
  DROP COLUMN IF EXISTS logistics_fee_enabled CASCADE,
  DROP COLUMN IF EXISTS logistics_fee_type CASCADE,
  DROP COLUMN IF EXISTS logistics_fee_value CASCADE,
  DROP COLUMN IF EXISTS logistics_recipient_id CASCADE;

-- 2. Remove logistics_fee from transaction_fees table
ALTER TABLE transaction_fees 
  DROP COLUMN IF EXISTS logistics_fee CASCADE;

-- 3. Update recipient_type constraint on fee_recipients
ALTER TABLE fee_recipients 
  DROP CONSTRAINT IF EXISTS fee_recipients_recipient_type_check;

ALTER TABLE fee_recipients 
  ADD CONSTRAINT fee_recipients_recipient_type_check 
  CHECK (recipient_type IN ('platform', 'vendor', 'gateway'));

-- 4. Drop and recreate the calculate_transaction_fees function
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

-- 5. Update table comments
COMMENT ON TABLE fee_recipients IS 'Stores bank/UPI details for all fee recipients (platform, vendors, gateway)';

-- 6. Clean up any existing 3PL recipients (optional - only if you want to remove them)
-- Uncomment the line below if you want to delete existing 3PL recipients
-- DELETE FROM fee_recipients WHERE recipient_type = '3pl';

-- 7. Verify changes
SELECT 
  'Migration Complete!' as status,
  'Tables updated, 3PL fields removed' as message;
```

5. Click **Run**

### Step 2: Verify Migration

Run this query to verify everything is correct:

```sql
-- Check fee_structures columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'fee_structures' 
  AND column_name LIKE '%logistics%';
-- Should return 0 rows

-- Check transaction_fees columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'transaction_fees' 
  AND column_name LIKE '%logistics%';
-- Should return 0 rows

-- Check recipient_type constraint
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_name = 'fee_recipients_recipient_type_check';
-- Should show: (recipient_type IN ('platform', 'vendor', 'gateway'))

-- Check if function exists
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name = 'calculate_transaction_fees';
-- Should return 1 row
```

---

## Step 3: Redeploy Edge Functions

### 3.1 Deploy calculate-transaction-fees

1. Open your terminal
2. Navigate to your project directory
3. Run:

```bash
supabase functions deploy calculate-transaction-fees
```

### 3.2 Deploy process-payouts

```bash
supabase functions deploy process-payouts
```

### 3.3 Verify Deployment

Check in Supabase Dashboard:
1. Go to **Edge Functions**
2. You should see both functions listed
3. Check the deployment timestamp (should be recent)

---

## Step 4: Update Environment Variables (if needed)

If you're using Razorpay Payouts API, ensure these are set:

1. Go to **Project Settings** → **Edge Functions**
2. Add/verify these secrets:

```
RAZORPAY_KEY_ID=your_key_id
RAZORPAY_KEY_SECRET=your_key_secret
```

---

## Step 5: Test the Changes

### Test 1: Calculate Fees

Run this in SQL Editor:

```sql
-- Test fee calculation (replace with your actual user_id)
SELECT calculate_transaction_fees(
  'your_user_id',
  100000,  -- ₹100,000
  NULL     -- Use default fee structure
);
```

Expected result should NOT include `logistics_fee`:
```json
{
  "platform_fee": 2500,
  "gateway_fee": 2003,
  "other_fees": 0,
  "total_fees": 4503,
  "vendor_amount": 95497,
  "breakdown": [...]
}
```

### Test 2: Create Transaction Fee

Test via your application or use the edge function directly:

```bash
curl -X POST 'https://your-project.supabase.co/functions/v1/calculate-transaction-fees' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "invoiceId": "test-invoice-id",
    "userId": "your-user-id",
    "totalAmount": 100000
  }'
```

Expected response:
```json
{
  "success": true,
  "transaction_fee_id": "...",
  "total_amount": 100000,
  "fees": {
    "platform": 2500,
    "gateway": 2003,
    "other": 0,
    "total": 4503
  },
  "vendor_amount": 95497,
  "breakdown": [...]
}
```

Note: No `logistics` field in the response!

---

## Troubleshooting

### Issue 1: "column does not exist" error

**Problem**: Old code trying to access logistics_fee column

**Solution**: 
1. Make sure you redeployed both edge functions
2. Clear any cached code
3. Restart your local development server

### Issue 2: "constraint violation" when creating recipient

**Problem**: Trying to create recipient with type '3pl' or 'other'

**Solution**: 
1. Update your frontend code to only allow: 'platform', 'vendor', 'gateway'
2. Run the migration SQL to update the constraint

### Issue 3: Function returns logistics_fee

**Problem**: Old function still in database

**Solution**:
```sql
-- Force drop and recreate
DROP FUNCTION IF EXISTS calculate_transaction_fees(TEXT, DECIMAL, UUID) CASCADE;
-- Then run the CREATE FUNCTION from migration SQL above
```

---

## Rollback (If Needed)

If something goes wrong and you need to rollback:

```sql
-- Add back logistics fields (not recommended, but here if needed)
ALTER TABLE fee_structures 
  ADD COLUMN logistics_fee_enabled BOOLEAN DEFAULT false,
  ADD COLUMN logistics_fee_type TEXT CHECK (logistics_fee_type IN ('percentage', 'fixed', 'none')),
  ADD COLUMN logistics_fee_value DECIMAL(10, 2),
  ADD COLUMN logistics_recipient_id UUID REFERENCES fee_recipients(id);

ALTER TABLE transaction_fees 
  ADD COLUMN logistics_fee DECIMAL(12, 2) DEFAULT 0;

-- Update constraint
ALTER TABLE fee_recipients 
  DROP CONSTRAINT fee_recipients_recipient_type_check;

ALTER TABLE fee_recipients 
  ADD CONSTRAINT fee_recipients_recipient_type_check 
  CHECK (recipient_type IN ('platform', 'vendor', 'gateway', '3pl', 'other'));
```

---

## Summary Checklist

- [ ] Run migration SQL in Supabase SQL Editor
- [ ] Verify columns removed (run verification queries)
- [ ] Deploy `calculate-transaction-fees` function
- [ ] Deploy `process-payouts` function
- [ ] Test fee calculation
- [ ] Test transaction creation
- [ ] Update frontend code (if needed)
- [ ] Remove any 3PL-related UI components

---

## Need Help?

If you encounter any issues:

1. Check the Supabase logs:
   - Go to **Logs** → **Edge Functions**
   - Look for errors in recent deployments

2. Verify function code:
   - Go to **Edge Functions**
   - Click on function name
   - Check the code matches the updated version

3. Check database state:
   - Run the verification queries above
   - Ensure all logistics columns are gone

---

**Migration Date**: 2026-04-30
**Status**: Ready to deploy
**Estimated Time**: 10-15 minutes
