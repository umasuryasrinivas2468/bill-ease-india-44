# Simple Fee Processing Guide

## Understanding the Entities

### 1. **Platform** (Your Company)
- **Who**: You - the marketplace/platform owner
- **Example**: If you run an e-commerce marketplace like Amazon or Flipkart
- **Fee**: Your commission for providing the platform
- **Typical Rate**: 2-5% of transaction value
- **Example**: On a ₹100,000 order, you charge ₹2,500 (2.5%)

### 2. **Vendor** (Seller/Service Provider)
- **Who**: The business selling products or providing services
- **Example**: A shop owner selling products on your platform
- **Gets**: Remaining amount after all fees are deducted
- **Example**: On ₹100,000 order with ₹4,503 total fees, vendor gets ₹95,497

### 3. **Payment Gateway** (Razorpay, Stripe, etc.)
- **Who**: Payment processor that handles the transaction
- **Examples**: Razorpay, Stripe, PayU, Paytm
- **Fee**: Transaction processing fee
- **Typical Rate**: 2% + ₹3 per transaction
- **Example**: On ₹100,000, gateway charges ₹2,003 (2% + ₹3)

---

## How It Works - Simple Flow

### Step 1: Customer Pays Full Amount
```
Customer pays ₹100,000
        ↓
Money goes to YOUR account (platform)
```

### Step 2: Calculate Fee Breakdown
```
Total: ₹100,000
  - Platform Fee (2.5%): ₹2,500
  - Gateway Fee (2% + ₹3): ₹2,003
  - Total Fees: ₹4,503
  = Vendor Gets: ₹95,497
```

### Step 3: Process Payouts Separately
```
From your account, pay:
  → Platform (you): ₹2,500 (keep it)
  → Gateway: ₹2,003 (auto-deducted usually)
  → Vendor: ₹95,497 (bank transfer/UPI)
```

---

## Real-World Example

### Scenario: E-commerce Order

**Order Details:**
- Product: Laptop
- Price: ₹50,000
- Customer: Rahul from Mumbai
- Vendor: TechStore (seller on your platform)

**Fee Structure:**
- Platform commission: 3%
- Payment gateway: 2% + ₹3

**Calculation:**
```
Order Amount: ₹50,000

Platform Fee: ₹50,000 × 3% = ₹1,500
Gateway Fee: (₹50,000 × 2%) + ₹3 = ₹1,003
Total Fees: ₹2,503

Vendor Gets: ₹50,000 - ₹2,503 = ₹47,497
```

**Payout Process:**
1. Customer pays ₹50,000 → Goes to your platform account
2. You keep ₹1,500 (platform fee)
3. Gateway auto-deducts ₹1,003
4. You pay TechStore ₹47,497 (via bank transfer/UPI)

---

## Database Setup

### 1. Run Migration

```bash
# In Supabase SQL Editor
database/fee_processing_simple.sql
```

This creates 4 tables:
- `fee_recipients` - Bank details for all parties
- `fee_structures` - Fee calculation rules
- `transaction_fees` - Fee breakdown for each order
- `payout_records` - Track actual payouts

### 2. Deploy Functions

```bash
supabase functions deploy calculate-transaction-fees
supabase functions deploy process-payouts
```

---

## Setup Your Fee Structure

### Step 1: Add Recipients

```typescript
import { feeProcessingService } from '@/services/feeProcessingService';

// 1. Add your platform account
await feeProcessingService.createFeeRecipient({
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

// 2. Add payment gateway (usually auto-deducted, but for tracking)
await feeProcessingService.createFeeRecipient({
  user_id: 'your_user_id',
  recipient_type: 'gateway',
  recipient_name: 'Razorpay',
  recipient_email: 'settlements@razorpay.com',
  is_active: true,
  is_verified: true,
});
```

### Step 2: Create Fee Structure

```typescript
await feeProcessingService.createFeeStructure({
  user_id: 'your_user_id',
  structure_name: 'E-commerce Default',
  is_default: true,
  
  // Platform fee: 2.5%
  platform_fee_enabled: true,
  platform_fee_type: 'percentage',
  platform_fee_value: 2.5,
  platform_recipient_id: 'platform_recipient_id',
  
  // Gateway fee: 2% + ₹3
  gateway_fee_enabled: true,
  gateway_fee_type: 'percentage_plus_fixed',
  gateway_fee_percentage: 2.0,
  gateway_fee_fixed: 3.0,
  gateway_recipient_id: 'gateway_recipient_id',
  
  // Other fees (optional)
  other_fees: [
    {
      name: 'Insurance',
      type: 'fixed',
      value: 100,
      recipient_id: 'insurance_recipient_id',
    }
  ],
});
```

---

## Processing a Transaction

### When Payment is Received

```typescript
// 1. Customer pays ₹100,000
const paymentAmount = 100000;

// 2. Calculate fees
const feeCalculation = await feeProcessingService.calculateFees({
  invoiceId: invoice.id,
  userId: user.id,
  totalAmount: paymentAmount,
  paymentId: razorpayPaymentId,
  orderId: razorpayOrderId,
});

console.log('Fee Breakdown:');
console.log(`Platform: ₹${feeCalculation.fees.platform}`);
console.log(`Gateway: ₹${feeCalculation.fees.gateway}`);
console.log(`Total Fees: ₹${feeCalculation.fees.total}`);
console.log(`Vendor Gets: ₹${feeCalculation.vendor_amount}`);

// 3. Process payouts (can be done immediately or scheduled)
const payouts = await feeProcessingService.processPayouts({
  transactionFeeId: feeCalculation.transaction_fee_id,
  userId: user.id,
  payoutMethod: 'manual',  // or 'razorpay_payout' for automatic
});

console.log(`Created ${payouts.payouts_created} payout records`);
```

### Result

```
Fee Breakdown:
Platform: ₹2,500
Gateway: ₹2,003
Total Fees: ₹4,503
Vendor Gets: ₹95,497

Created 3 payout records:
  1. Platform: ₹2,500 (pending)
  2. Gateway: ₹2,003 (pending)
  3. Vendor: ₹95,497 (pending)
```

---

## Payout Methods

### Method 1: Manual Payouts (Recommended for Start)

```typescript
// Mark payouts as pending, process manually via bank
await feeProcessingService.processPayouts({
  transactionFeeId: feeCalc.transaction_fee_id,
  userId: user.id,
  payoutMethod: 'manual',
});

// Later, after manual bank transfer, update status
await feeProcessingService.updatePayoutStatus(
  payoutId,
  'completed'
);
```

**Process:**
1. System calculates and creates payout records
2. You see pending payouts in admin panel
3. You manually transfer money via bank/UPI
4. You mark payout as completed in system

### Method 2: Automatic Payouts (via Razorpay Payouts API)

```typescript
// Automatically process via Razorpay
await feeProcessingService.processPayouts({
  transactionFeeId: feeCalc.transaction_fee_id,
  userId: user.id,
  payoutMethod: 'razorpay_payout',
});
```

**Process:**
1. System calculates fees
2. Automatically creates Razorpay payout requests
3. Money transferred automatically
4. Status updated via webhooks

---

## Viewing Reports

### Fee Summary

```typescript
// Get all transaction fees
const fees = await feeProcessingService.getTransactionFees(userId);

fees.forEach(fee => {
  console.log(`Invoice: ${fee.invoice_id}`);
  console.log(`Total: ₹${fee.total_amount}`);
  console.log(`Fees: ₹${fee.total_fees}`);
  console.log(`Vendor: ₹${fee.vendor_amount}`);
  console.log('---');
});
```

### Payout Summary

```typescript
// Get payout summary for last month
const summary = await feeProcessingService.getPayoutSummary(
  userId,
  '2024-01-01',
  '2024-01-31'
);

console.log(`Total Payouts: ${summary.total_payouts}`);
console.log(`Total Amount: ₹${summary.total_amount}`);
console.log(`Pending: ${summary.pending_count} (₹${summary.pending_amount})`);
console.log(`Completed: ${summary.completed_count} (₹${summary.completed_amount})`);

// By recipient type
console.log('By Type:');
Object.entries(summary.by_recipient_type).forEach(([type, data]) => {
  console.log(`  ${type}: ${data.count} payouts, ₹${data.amount}`);
});
```

---

## Common Scenarios

### Scenario 1: Percentage-Based Platform Fee

```typescript
{
  platform_fee_enabled: true,
  platform_fee_type: 'percentage',
  platform_fee_value: 3,  // 3%
}

// On ₹50,000 order: Platform gets ₹1,500
// On ₹100,000 order: Platform gets ₹3,000
```

### Scenario 2: Gateway Fee (Percentage + Fixed)

```typescript
{
  gateway_fee_enabled: true,
  gateway_fee_type: 'percentage_plus_fixed',
  gateway_fee_percentage: 2,  // 2%
  gateway_fee_fixed: 3,  // + ₹3
}

// On ₹50,000 order: Gateway gets ₹1,003 (₹1,000 + ₹3)
// On ₹100,000 order: Gateway gets ₹2,003 (₹2,000 + ₹3)
```

### Scenario 3: Multiple Other Fees

```typescript
{
  other_fees: [
    { name: 'Insurance', type: 'fixed', value: 100 },
    { name: 'Packaging', type: 'percentage', value: 0.5 },
    { name: 'Marketing', type: 'fixed', value: 200 },
  ]
}

// On ₹100,000 order:
// Insurance: ₹100
// Packaging: ₹500 (0.5%)
// Marketing: ₹200
// Total other fees: ₹800
```

---

## Advantages of This Approach

### ✅ Simple & Clear
- Easy to understand
- Full control over payouts
- No complex Razorpay Route setup needed

### ✅ Flexible
- Change fee structures anytime
- Add/remove recipients easily
- Support multiple payout methods

### ✅ Transparent
- Complete audit trail
- See exactly where money goes
- Easy reconciliation

### ✅ Scalable
- Handle any number of recipients
- Support different fee structures per category
- Batch process payouts

---

## Comparison with Razorpay Route

| Feature | Simple Approach | Razorpay Route |
|---------|----------------|----------------|
| **Setup** | Easy | Complex |
| **Control** | Full control | Limited |
| **Flexibility** | Very flexible | Fixed structure |
| **Payout Timing** | You decide | Automatic |
| **Cost** | No extra fees | Razorpay charges |
| **Audit Trail** | Complete | Limited |
| **Manual Override** | Easy | Difficult |

---

## Next Steps

1. ✅ Run database migration
2. ✅ Deploy edge functions
3. ✅ Add fee recipients
4. ✅ Create fee structure
5. ✅ Test with sample transaction
6. ✅ Build admin UI for managing payouts
7. ✅ Set up automated payout processing (optional)

---

## Support

- **Full Implementation**: See source code in `supabase/functions/`
- **Database Schema**: See `database/fee_processing_simple.sql`
- **TypeScript Types**: See `src/types/fees.ts`
- **Service Layer**: See `src/services/feeProcessingService.ts`
