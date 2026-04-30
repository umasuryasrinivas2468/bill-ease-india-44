# Quick Start: Platform & Third-Party Fees

## 5-Minute Setup Guide

### Step 1: Run Database Migration (2 min)

```bash
# In Supabase SQL Editor, run:
database/razorpay_route_transfers.sql
```

Or via CLI:
```bash
psql -h your-db-host -U postgres -d your-database -f database/razorpay_route_transfers.sql
```

### Step 2: Deploy Edge Functions (1 min)

```bash
supabase functions deploy create-order-with-transfers
supabase functions deploy razorpay-transfer-webhook
```

### Step 3: Configure Webhook (1 min)

1. Go to Razorpay Dashboard → Settings → Webhooks
2. Add webhook: `https://your-project.supabase.co/functions/v1/razorpay-transfer-webhook`
3. Select events: `transfer.processed`, `transfer.failed`, `transfer.reversed`
4. Copy webhook secret

### Step 4: Set Environment Variables (1 min)

```bash
# In Supabase Dashboard → Edge Functions → Manage Secrets
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
```

---

## First Payment with Fees

### 1. Create Linked Accounts

```typescript
import { transfersService } from '@/services/transfersService';

// Platform account
await transfersService.createLinkedAccount({
  user_id: 'your_user_id',
  account_id: 'acc_PLATFORM001',  // From Razorpay
  account_type: 'platform',
  account_name: 'My Platform',
  account_status: 'activated',
});

// Third-party account (optional)
await transfersService.createLinkedAccount({
  user_id: 'your_user_id',
  account_id: 'acc_3PL001',
  account_type: 'third_party',
  account_name: '3PL Logistics',
  account_status: 'activated',
});
```

### 2. Create Fee Configuration

```typescript
await transfersService.createFeeConfiguration({
  user_id: 'your_user_id',
  config_name: 'Default Configuration',
  is_default: true,
  
  // Platform fee: 2.5%
  platform_fee_type: 'percentage',
  platform_fee_value: 2.5,
  platform_account_id: 'acc_PLATFORM001',
  
  // Third-party fees
  third_party_fees: [
    {
      account_id: 'acc_3PL001',
      fee_type: 'percentage',
      fee_value: 1.5,
      name: '3PL Fee',
      on_hold: false,
    }
  ],
});
```

### 3. Create Order with Transfers

```typescript
const order = await transfersService.createOrderWithTransfers({
  invoiceId: invoice.id,
  userId: user.id,
  amount: 100000,  // ₹1,00,000
  enableTransfers: true,
});

console.log('Order created:', order.order_id);
console.log('Transfers:', order.transfers_count);
```

**Result:**
- Platform gets: ₹2,500 (2.5%)
- 3PL gets: ₹1,500 (1.5%)
- Vendor gets: ₹96,000

---

## Common Scenarios

### Scenario 1: E-commerce Platform

```typescript
// Configuration
{
  platform_fee_type: 'percentage',
  platform_fee_value: 2.5,
  third_party_fees: [
    { name: 'Logistics', fee_type: 'percentage', fee_value: 1.5, on_hold: true },
    { name: 'Payment Gateway', fee_type: 'fixed', fee_value: 500 }
  ]
}

// For ₹100,000 order:
// Platform: ₹2,500
// Logistics: ₹1,500 (on hold until delivery)
// Gateway: ₹500
// Vendor: ₹95,500
```

### Scenario 2: Marketplace

```typescript
// Configuration
{
  platform_fee_type: 'percentage',
  platform_fee_value: 5,
  third_party_fees: [
    { name: 'Insurance', fee_type: 'fixed', fee_value: 300 }
  ]
}

// For ₹50,000 order:
// Platform: ₹2,500 (5%)
// Insurance: ₹300
// Vendor: ₹47,200
```

### Scenario 3: Service Platform

```typescript
// Configuration
{
  platform_fee_type: 'percentage',
  platform_fee_value: 10,
  third_party_fees: []
}

// For ₹25,000 order:
// Platform: ₹2,500 (10%)
// Vendor: ₹22,500
```

---

## Monitoring Transfers

### Check Transfer Status

```typescript
const summary = await transfersService.getInvoiceTransferSummary(invoiceId);

console.log(`Total: ${summary.total_transfers}`);
console.log(`Processed: ${summary.processed_count}`);
console.log(`Pending: ${summary.pending_count}`);
console.log(`Failed: ${summary.failed_count}`);
```

### View Transfer Details

```typescript
const transfers = await transfersService.getTransferRecords(userId, {
  invoiceId: invoice.id
});

transfers.forEach(t => {
  console.log(`${t.recipient_type}: ₹${t.amount / 100} - ${t.status}`);
});
```

---

## Testing

### Test Mode Setup

```bash
# Use test mode
RAZORPAY_MODE=test

# Use test linked accounts
account_id: 'acc_TEST_PLATFORM'
```

### Test Payment Flow

1. Create test order with transfers
2. Complete payment in Razorpay test mode
3. Check webhook logs in Supabase
4. Verify transfer_records table updated
5. Check invoice transfer_status

---

## Troubleshooting

### Issue: No transfers created

**Solution:**
- Check fee configuration exists
- Verify `enableTransfers: true`
- Ensure linked accounts are activated

### Issue: Webhook not working

**Solution:**
- Verify webhook URL is correct
- Check webhook secret matches
- View Supabase function logs

### Issue: Transfer failed

**Solution:**
- Check `error_details` in transfer_records
- Verify linked account is activated
- Check Razorpay dashboard for details

---

## Next Steps

1. ✅ Build admin UI for fee management
2. ✅ Add analytics dashboard
3. ✅ Integrate with AI command
4. ✅ Set up email notifications
5. ✅ Create reconciliation reports

---

## Quick Reference

### Calculate Fees

```typescript
const breakdown = transfersService.calculateTransferBreakdown(
  100000,  // Amount
  feeConfig
);

console.log('Platform:', breakdown.platformFee);
console.log('Third-party:', breakdown.thirdPartyFees);
console.log('Vendor:', breakdown.vendorAmount);
```

### Update Fee Configuration

```typescript
await transfersService.updateFeeConfiguration(configId, {
  platform_fee_value: 3.0,  // Change from 2.5% to 3%
});
```

### Get Default Configuration

```typescript
const config = await transfersService.getDefaultFeeConfiguration(userId);
```

---

## Support

- **Full Guide**: See `RAZORPAY_ROUTE_TRANSFERS_GUIDE.md`
- **Implementation**: See `PLATFORM_FEES_IMPLEMENTATION_SUMMARY.md`
- **Razorpay Docs**: https://razorpay.com/docs/route/

---

That's it! You're now ready to process platform and third-party fees automatically. 🎉
