# Fee Processing - Quick Start

## What You Get

A simple system to:
1. **Collect full payment** from customer
2. **Calculate fee breakdown** (platform, gateway, vendor)
3. **Process payouts separately** to each party
4. **Track everything** in database

---

## 5-Minute Setup

### 1. Run Migration (1 min)

```bash
# In Supabase SQL Editor
database/fee_processing_simple.sql
```

### 2. Deploy Functions (1 min)

```bash
supabase functions deploy calculate-transaction-fees
supabase functions deploy process-payouts
```

### 3. Add Recipients (2 min)

```typescript
import { feeProcessingService } from '@/services/feeProcessingService';

// Platform (you)
await feeProcessingService.createFeeRecipient({
  user_id: 'your_id',
  recipient_type: 'platform',
  recipient_name: 'My Platform',
  bank_account_number: '1234567890',
  bank_ifsc_code: 'HDFC0001234',
  is_active: true,
});

// Gateway (payment processor)
await feeProcessingService.createFeeRecipient({
  user_id: 'your_id',
  recipient_type: 'gateway',
  recipient_name: 'Razorpay',
  is_active: true,
});
```

### 4. Create Fee Structure (1 min)

```typescript
await feeProcessingService.createFeeStructure({
  user_id: 'your_id',
  structure_name: 'Default',
  is_default: true,
  
  platform_fee_enabled: true,
  platform_fee_type: 'percentage',
  platform_fee_value: 2.5,
  
  gateway_fee_enabled: true,
  gateway_fee_type: 'percentage_plus_fixed',
  gateway_fee_percentage: 2.0,
  gateway_fee_fixed: 3.0,
});
```

---

## Process Your First Transaction

```typescript
// 1. Customer pays ₹100,000
const amount = 100000;

// 2. Calculate fees
const fees = await feeProcessingService.calculateFees({
  invoiceId: invoice.id,
  userId: user.id,
  totalAmount: amount,
});

// Result:
// Platform: ₹2,500 (2.5%)
// Gateway: ₹2,003 (2% + ₹3)
// Vendor: ₹95,497

// 3. Create payout records
const payouts = await feeProcessingService.processPayouts({
  transactionFeeId: fees.transaction_fee_id,
  userId: user.id,
  payoutMethod: 'manual',
});

// 4. Process payouts manually via bank/UPI
// 5. Mark as completed
await feeProcessingService.updatePayoutStatus(payoutId, 'completed');
```

---

## Understanding the Entities

### Platform (You)
- Your commission
- Example: 2.5% = ₹2,500 on ₹100,000

### Vendor (Seller)
- Gets remaining amount
- Example: ₹95,497 after ₹4,503 fees

### Gateway (Razorpay)
- Payment processing
- Example: 2% + ₹3 = ₹2,003

---

## Example Calculation

```
Order: ₹100,000

Fees:
  Platform (2.5%):     ₹2,500
  Gateway (2% + ₹3):   ₹2,003
  ─────────────────────────
  Total Fees:          ₹4,503

Vendor Gets:           ₹95,497
```

---

## View Reports

```typescript
// Transaction fees
const fees = await feeProcessingService.getTransactionFees(userId);

// Payout summary
const summary = await feeProcessingService.getPayoutSummary(userId);

console.log(`Pending: ${summary.pending_count} (₹${summary.pending_amount})`);
console.log(`Completed: ${summary.completed_count} (₹${summary.completed_amount})`);
```

---

## Common Fee Structures

### E-commerce
```typescript
{
  platform_fee: '3%',
  gateway_fee: '2% + ₹3',
}
```

### Service Marketplace
```typescript
{
  platform_fee: '10%',
  gateway_fee: '2% + ₹3',
}
```

### Food Delivery
```typescript
{
  platform_fee: '15%',
  gateway_fee: '2% + ₹3',
}
```

---

## That's It!

You now have a complete fee processing system that:
- ✅ Calculates fees automatically
- ✅ Tracks all payouts
- ✅ Provides complete audit trail
- ✅ Supports multiple payout methods

**Full Guide**: See `FEE_PROCESSING_SIMPLE_GUIDE.md`
