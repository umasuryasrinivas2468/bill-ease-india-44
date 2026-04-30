# Supabase Fresh Installation - Fee Processing System

## ⚠️ You're Starting Fresh (No Existing Tables)

Since the `fee_structures` table doesn't exist, you need to create everything from scratch.

---

## 🚀 Step 1: Create All Tables (2 minutes)

1. Open **Supabase Dashboard**
2. Go to **SQL Editor**
3. Click **New Query**
4. Open the file **`database/fee_processing_simple.sql`**
5. Copy **ALL** the content (the entire file)
6. Paste into Supabase SQL Editor
7. Click **Run**

This will create:
- ✅ `fee_recipients` table
- ✅ `fee_structures` table
- ✅ `transaction_fees` table
- ✅ `payout_records` table
- ✅ `calculate_transaction_fees` function
- ✅ `get_payout_summary` function
- ✅ All indexes and constraints
- ✅ Row Level Security policies

**Note**: This already has 3PL removed! No migration needed.

---

## 🚀 Step 2: Deploy Edge Functions (2 minutes)

Open your terminal and run:

```bash
# Deploy calculate fees function
supabase functions deploy calculate-transaction-fees

# Deploy payouts function
supabase functions deploy process-payouts
```

---

## ✅ Step 3: Verify Installation (1 minute)

In Supabase SQL Editor, run:

```sql
-- Check tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_name IN ('fee_recipients', 'fee_structures', 'transaction_fees', 'payout_records');
-- Should return 4 rows

-- Check functions exist
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name IN ('calculate_transaction_fees', 'get_payout_summary');
-- Should return 2 rows

-- Check recipient types (should NOT include '3pl' or 'other')
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_name = 'fee_recipients_recipient_type_check';
-- Should show: (recipient_type IN ('platform', 'vendor', 'gateway'))
```

---

## 🎯 Step 4: Create Your First Fee Structure (5 minutes)

Now you need to set up your fee structure. You can do this via:

### Option A: Using SQL (Quick)

```sql
-- 1. Create platform recipient (you)
INSERT INTO fee_recipients (
  user_id,
  recipient_type,
  recipient_name,
  recipient_email,
  bank_account_number,
  bank_ifsc_code,
  bank_account_holder_name,
  bank_name,
  is_active,
  is_verified
) VALUES (
  'your_user_id',  -- Replace with your actual user_id
  'platform',
  'My Platform',
  'finance@myplatform.com',
  '1234567890',
  'HDFC0001234',
  'My Platform Pvt Ltd',
  'HDFC Bank',
  true,
  true
) RETURNING id;
-- Copy the returned ID (platform_recipient_id)

-- 2. Create gateway recipient
INSERT INTO fee_recipients (
  user_id,
  recipient_type,
  recipient_name,
  recipient_email,
  is_active,
  is_verified
) VALUES (
  'your_user_id',  -- Replace with your actual user_id
  'gateway',
  'Razorpay',
  'settlements@razorpay.com',
  true,
  true
) RETURNING id;
-- Copy the returned ID (gateway_recipient_id)

-- 3. Create fee structure
INSERT INTO fee_structures (
  user_id,
  structure_name,
  is_default,
  
  -- Platform fee: 2.5%
  platform_fee_enabled,
  platform_fee_type,
  platform_fee_value,
  platform_recipient_id,
  
  -- Gateway fee: 2% + ₹3
  gateway_fee_enabled,
  gateway_fee_type,
  gateway_fee_percentage,
  gateway_fee_fixed,
  gateway_recipient_id,
  
  other_fees
) VALUES (
  'your_user_id',  -- Replace with your actual user_id
  'Default Fee Structure',
  true,
  
  -- Platform fee
  true,
  'percentage',
  2.5,
  'platform_recipient_id_from_step_1',  -- Replace with ID from step 1
  
  -- Gateway fee
  true,
  'percentage_plus_fixed',
  2.0,
  3.0,
  'gateway_recipient_id_from_step_2',  -- Replace with ID from step 2
  
  '[]'::jsonb
);
```

### Option B: Using Your Application (Recommended)

Use the `feeProcessingService` in your app:

```typescript
import { feeProcessingService } from '@/services/feeProcessingService';

// 1. Create platform recipient
const platformRecipient = await feeProcessingService.createFeeRecipient({
  user_id: 'your_user_id',
  recipient_type: 'platform',
  recipient_name: 'My Platform',
  recipient_email: 'finance@myplatform.com',
  bank_account_number: '1234567890',
  bank_ifsc_code: 'HDFC0001234',
  bank_account_holder_name: 'My Platform Pvt Ltd',
  bank_name: 'HDFC Bank',
  is_active: true,
  is_verified: true,
});

// 2. Create gateway recipient
const gatewayRecipient = await feeProcessingService.createFeeRecipient({
  user_id: 'your_user_id',
  recipient_type: 'gateway',
  recipient_name: 'Razorpay',
  recipient_email: 'settlements@razorpay.com',
  is_active: true,
  is_verified: true,
});

// 3. Create fee structure
const feeStructure = await feeProcessingService.createFeeStructure({
  user_id: 'your_user_id',
  structure_name: 'Default Fee Structure',
  is_default: true,
  
  // Platform fee: 2.5%
  platform_fee_enabled: true,
  platform_fee_type: 'percentage',
  platform_fee_value: 2.5,
  platform_recipient_id: platformRecipient.id,
  
  // Gateway fee: 2% + ₹3
  gateway_fee_enabled: true,
  gateway_fee_type: 'percentage_plus_fixed',
  gateway_fee_percentage: 2.0,
  gateway_fee_fixed: 3.0,
  gateway_recipient_id: gatewayRecipient.id,
  
  other_fees: [],
});

console.log('Fee structure created:', feeStructure);
```

---

## 🧪 Step 5: Test Fee Calculation (1 minute)

In Supabase SQL Editor:

```sql
-- Test with ₹100,000 order
SELECT calculate_transaction_fees(
  'your_user_id',  -- Replace with your actual user_id
  100000,
  NULL  -- Use default fee structure
);
```

**Expected Result:**
```json
{
  "platform_fee": 2500,
  "gateway_fee": 2003,
  "other_fees": 0,
  "total_fees": 4503,
  "vendor_amount": 95497,
  "breakdown": [
    {
      "type": "platform",
      "name": "Platform Fee",
      "amount": 2500,
      "calculation": "percentage: 2.5"
    },
    {
      "type": "gateway",
      "name": "Payment Gateway Fee",
      "amount": 2003,
      "calculation": "percentage_plus_fixed"
    }
  ],
  "fee_structure_id": "..."
}
```

✅ **No `logistics_fee` field!** The system is already 3PL-free!

---

## 📊 What You Have Now

### Tables Created:
1. ✅ `fee_recipients` - Stores bank details (platform, vendor, gateway only)
2. ✅ `fee_structures` - Fee calculation rules (no logistics fields)
3. ✅ `transaction_fees` - Fee breakdown per transaction (no logistics_fee)
4. ✅ `payout_records` - Tracks payouts

### Functions Created:
1. ✅ `calculate_transaction_fees` - Calculates fees (no logistics)
2. ✅ `get_payout_summary` - Returns payout statistics

### Edge Functions Deployed:
1. ✅ `calculate-transaction-fees` - API endpoint
2. ✅ `process-payouts` - API endpoint

---

## 🎯 Complete Checklist

- [ ] Run `database/fee_processing_simple.sql` in Supabase
- [ ] Verify tables created (4 tables)
- [ ] Verify functions created (2 functions)
- [ ] Deploy `calculate-transaction-fees` edge function
- [ ] Deploy `process-payouts` edge function
- [ ] Create platform recipient
- [ ] Create gateway recipient
- [ ] Create default fee structure
- [ ] Test fee calculation
- [ ] Celebrate! 🎉

---

## 📁 Files You Need

| File | Purpose |
|------|---------|
| `database/fee_processing_simple.sql` | **Run this first** - Creates all tables |
| `FEE_PROCESSING_QUICK_START.md` | Quick setup guide |
| `FEE_PROCESSING_SIMPLE_GUIDE.md` | Complete usage guide |
| `FEE_PROCESSING_EXPLAINED.md` | Detailed explanation |

---

## ⚠️ Important Notes

1. **No Migration Needed**: Since you're starting fresh, the system is already 3PL-free
2. **User ID**: Replace `'your_user_id'` with actual user IDs from your auth system
3. **Recipient Types**: Only 3 types allowed: `'platform'`, `'vendor'`, `'gateway'`
4. **Default Structure**: You need at least one fee structure marked as `is_default = true`

---

## 🆘 Troubleshooting

### Error: "relation does not exist"
**Solution**: Run `database/fee_processing_simple.sql` first

### Error: "function does not exist"
**Solution**: The SQL file creates functions automatically

### Error: "constraint violation"
**Solution**: Make sure recipient_type is one of: 'platform', 'vendor', 'gateway'

### Edge function deployment fails
**Solution**: Make sure you're in the project directory and Supabase CLI is installed

---

## ✅ Success!

You now have a complete fee processing system that:
- ✅ Handles platform fees (your commission)
- ✅ Handles gateway fees (payment processing)
- ✅ Calculates vendor payouts
- ✅ Tracks all transactions
- ✅ **No 3PL/logistics fees!**

**Total Setup Time**: ~10 minutes

---

**Next Steps**: See `FEE_PROCESSING_QUICK_START.md` for usage examples
