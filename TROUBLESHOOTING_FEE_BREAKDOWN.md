# Troubleshooting Fee Breakdown Not Showing

## 🔍 Quick Checks

### 1. Open Browser Console
Press `F12` or `Ctrl+Shift+I` (Windows) / `Cmd+Option+I` (Mac)

Look for messages starting with `[FeeBreakdown]`

---

## 🐛 Common Issues & Solutions

### Issue 1: "Calculating fees..." Stuck Forever

**Symptoms**: Loading spinner never stops

**Possible Causes**:
1. Edge function not deployed
2. Edge function crashed
3. Network error

**Solutions**:

```bash
# 1. Deploy the edge function
supabase functions deploy calculate-transaction-fees

# 2. Check if it's running
curl -X POST 'https://vhntnkvtzmerpdhousfr.supabase.co/functions/v1/calculate-transaction-fees' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -d '{"invoiceId":"test","userId":"test","totalAmount":10000}'
```

---

### Issue 2: Error Message Shows

**Symptoms**: Red error box appears

**Check the error message**:

#### "No fee structure found"
**Solution**: Create a default fee structure

```sql
-- In Supabase SQL Editor
-- First, create a recipient
INSERT INTO fee_recipients (user_id, recipient_type, recipient_name, is_active)
VALUES ('your_user_id', 'platform', 'Platform', true)
RETURNING id;

-- Then create fee structure (use the ID from above)
INSERT INTO fee_structures (
  user_id,
  structure_name,
  is_default,
  platform_fee_enabled,
  platform_fee_type,
  platform_fee_value,
  platform_recipient_id,
  gateway_fee_enabled,
  gateway_fee_type,
  gateway_fee_percentage,
  gateway_fee_fixed
) VALUES (
  'your_user_id',
  'Default',
  true,
  true,
  'percentage',
  2.5,
  'platform_recipient_id_from_above',
  true,
  'percentage_plus_fixed',
  2.0,
  3.0
);
```

#### "Failed to calculate fees"
**Solution**: Check edge function logs

```bash
# View logs
supabase functions logs calculate-transaction-fees
```

#### "relation does not exist"
**Solution**: Run the database migration

```sql
-- Run database/fee_processing_simple.sql in Supabase SQL Editor
```

---

### Issue 3: Component Not Rendering At All

**Symptoms**: No loading, no error, nothing

**Possible Causes**:
1. Component not imported
2. Component not added to page
3. React error

**Solutions**:

#### Check PayLink.tsx has the import:
```typescript
import FeeBreakdown from '@/components/FeeBreakdown';
```

#### Check PayLink.tsx has the component:
```typescript
<FeeBreakdown 
  totalAmount={balance} 
  userId={invoice.id} 
  className="mt-4"
  onFeesCalculated={(fees) => setServiceFees(fees)}
/>
```

#### Check React DevTools:
- Open React DevTools
- Look for `FeeBreakdown` component
- Check if it's mounted

---

### Issue 4: CORS Error

**Symptoms**: Console shows CORS error

**Solution**: Edge function needs CORS headers (already added)

Check `calculate-transaction-fees/index.ts` has:
```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
```

---

### Issue 5: RLS Blocking Access

**Symptoms**: "permission denied" or "row level security"

**Solution**: Disable RLS or use service role

```sql
-- Disable RLS
ALTER TABLE fee_recipients DISABLE ROW LEVEL SECURITY;
ALTER TABLE fee_structures DISABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_fees DISABLE ROW LEVEL SECURITY;
```

---

## 🧪 Manual Test

### Test Edge Function Directly:

```bash
curl -X POST 'https://vhntnkvtzmerpdhousfr.supabase.co/functions/v1/calculate-transaction-fees' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZobnRua3Z0em1lcnBkaG91c2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgxMTEyMTEsImV4cCI6MjA2MzY4NzIxMX0.sQ5Xz5RrCrDJoJHpNC9RzqFNb05Qi4gsFL5PrntlV4k' \
  -d '{
    "invoiceId": "test",
    "userId": "test_user",
    "totalAmount": 29500
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "transaction_fee_id": "...",
  "total_amount": 29500,
  "fees": {
    "platform": 737.5,
    "gateway": 593,
    "other": 0,
    "total": 1330.5
  },
  "vendor_amount": 28169.5,
  "breakdown": [...]
}
```

---

## 📋 Debugging Checklist

- [ ] Edge function deployed (`supabase functions deploy calculate-transaction-fees`)
- [ ] Database tables exist (run `database/fee_processing_simple.sql`)
- [ ] Fee structure created (at least one with `is_default = true`)
- [ ] RLS disabled or policies set correctly
- [ ] Browser console shows `[FeeBreakdown]` logs
- [ ] No CORS errors in console
- [ ] Component imported in PayLink.tsx
- [ ] Component rendered in PayLink.tsx
- [ ] React DevTools shows FeeBreakdown component

---

## 🔧 Quick Fix Script

Run this in Supabase SQL Editor to set up everything:

```sql
-- 1. Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_name IN ('fee_recipients', 'fee_structures', 'transaction_fees');
-- Should return 3 rows

-- 2. Check if fee structure exists
SELECT * FROM fee_structures WHERE is_default = true LIMIT 1;
-- Should return at least 1 row

-- 3. If no fee structure, create one
DO $$
DECLARE
  v_recipient_id UUID;
  v_user_id TEXT := 'default_user'; -- Change this to your user_id
BEGIN
  -- Create platform recipient
  INSERT INTO fee_recipients (user_id, recipient_type, recipient_name, is_active)
  VALUES (v_user_id, 'platform', 'Platform', true)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_recipient_id;

  -- Create default fee structure
  INSERT INTO fee_structures (
    user_id, structure_name, is_default,
    platform_fee_enabled, platform_fee_type, platform_fee_value, platform_recipient_id,
    gateway_fee_enabled, gateway_fee_type, gateway_fee_percentage, gateway_fee_fixed
  ) VALUES (
    v_user_id, 'Default', true,
    true, 'percentage', 2.5, v_recipient_id,
    true, 'percentage_plus_fixed', 2.0, 3.0
  )
  ON CONFLICT (user_id, structure_name) DO NOTHING;
END $$;

-- 4. Verify
SELECT 
  fs.structure_name,
  fs.platform_fee_value,
  fs.gateway_fee_percentage,
  fs.gateway_fee_fixed,
  fs.is_default
FROM fee_structures fs
WHERE fs.is_default = true;
```

---

## 🎯 Step-by-Step Debug Process

### Step 1: Check Browser Console
```
1. Open payment page
2. Press F12
3. Go to Console tab
4. Look for [FeeBreakdown] messages
5. Note any errors
```

### Step 2: Check Network Tab
```
1. Go to Network tab
2. Filter by "calculate-transaction-fees"
3. Check if request is made
4. Check response status (should be 200)
5. Check response body
```

### Step 3: Check Database
```sql
-- Check if fee structure exists
SELECT * FROM fee_structures WHERE is_default = true;

-- Check if function exists
SELECT routine_name FROM information_schema.routines 
WHERE routine_name = 'calculate_transaction_fees';
```

### Step 4: Test Edge Function
```bash
# Use curl or Postman to test directly
curl -X POST 'YOUR_SUPABASE_URL/functions/v1/calculate-transaction-fees' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -d '{"invoiceId":"test","userId":"test","totalAmount":10000}'
```

---

## 💡 Most Common Solution

**90% of the time, the issue is:**

1. **No fee structure created**
   - Solution: Run the SQL script above

2. **Edge function not deployed**
   - Solution: `supabase functions deploy calculate-transaction-fees`

3. **Wrong user_id**
   - Solution: Use actual user_id from your auth system

---

## 📞 Still Not Working?

### Share These Details:

1. **Browser Console Output**
   - Copy all `[FeeBreakdown]` messages

2. **Network Request**
   - Copy the request URL
   - Copy the request body
   - Copy the response

3. **Database Check**
   ```sql
   SELECT COUNT(*) FROM fee_structures WHERE is_default = true;
   ```

4. **Edge Function Status**
   ```bash
   supabase functions list
   ```

---

**Most likely issue**: No default fee structure exists in database!

**Quick fix**: Run the "Quick Fix Script" above in Supabase SQL Editor.
