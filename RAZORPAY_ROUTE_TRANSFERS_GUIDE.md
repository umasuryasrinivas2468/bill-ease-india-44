# Razorpay Route Transfers - Platform & Third-Party Fees

## Overview

This implementation enables automatic fee splitting and transfers using Razorpay's Route (Transfer) feature. When a payment is received, the system automatically:

1. Deducts platform fees
2. Deducts third-party fees (logistics, payment gateway, etc.)
3. Transfers remaining amount to the vendor
4. Tracks all transfers in the database
5. Updates status via webhooks

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Customer Payment                          │
│                      ₹100,000                                │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              Razorpay Order with Transfers                   │
│  • Platform Fee: ₹2,500 (2.5%)                              │
│  • 3PL Fee: ₹1,500 (1.5%)                                   │
│  • Gateway Fee: ₹500 (fixed)                                │
│  • Vendor Amount: ₹95,500                                   │
└────────────────────────────┬────────────────────────────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
                ▼                         ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│  Automatic Transfers     │  │  Webhook Updates         │
│  • To Platform Account   │  │  • transfer.processed    │
│  • To 3PL Account        │  │  • transfer.failed       │
│  • To Gateway Account    │  │  • transfer.reversed     │
│  • To Vendor Account     │  │                          │
└──────────────────────────┘  └──────────────────────────┘
```

---

## Database Schema

### 1. `linked_accounts` Table
Stores Razorpay linked account details for fee recipients.

```sql
CREATE TABLE linked_accounts (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL UNIQUE,  -- Razorpay acc_XXXX
  account_type TEXT CHECK (account_type IN ('platform', 'third_party')),
  account_name TEXT NOT NULL,
  account_email TEXT,
  account_status TEXT DEFAULT 'created',
  notes JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Example Data:**
```sql
INSERT INTO linked_accounts (user_id, account_id, account_type, account_name, account_email)
VALUES 
  ('user_123', 'acc_PLATFORM001', 'platform', 'My Platform', 'platform@example.com'),
  ('user_123', 'acc_3PL001', 'third_party', '3PL Logistics', '3pl@example.com'),
  ('user_123', 'acc_GATEWAY001', 'third_party', 'Payment Gateway', 'gateway@example.com');
```

### 2. `fee_configurations` Table
Defines fee split configurations.

```sql
CREATE TABLE fee_configurations (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  config_name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  
  -- Platform fee
  platform_fee_type TEXT CHECK (platform_fee_type IN ('percentage', 'fixed', 'none')),
  platform_fee_value DECIMAL(10, 2),
  platform_account_id TEXT,
  
  -- Third-party fees (JSON array)
  third_party_fees JSONB DEFAULT '[]',
  
  -- Settings
  on_hold_default BOOLEAN DEFAULT false,
  on_hold_until_days INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Example Data:**
```sql
INSERT INTO fee_configurations (
  user_id, 
  config_name, 
  is_default, 
  platform_fee_type, 
  platform_fee_value, 
  platform_account_id,
  third_party_fees
)
VALUES (
  'user_123',
  'E-commerce Configuration',
  true,
  'percentage',
  2.5,
  'acc_PLATFORM001',
  '[
    {
      "account_id": "acc_3PL001",
      "fee_type": "percentage",
      "fee_value": 1.5,
      "name": "3PL Logistics Fee",
      "on_hold": true
    },
    {
      "account_id": "acc_GATEWAY001",
      "fee_type": "fixed",
      "fee_value": 500,
      "name": "Payment Gateway Fee",
      "on_hold": false
    }
  ]'::jsonb
);
```

### 3. `transfer_records` Table
Tracks all transfers made.

```sql
CREATE TABLE transfer_records (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  transfer_id TEXT NOT NULL UNIQUE,  -- trf_XXXX
  order_id TEXT,
  payment_id TEXT,
  recipient_account_id TEXT NOT NULL,
  recipient_type TEXT CHECK (recipient_type IN ('platform', 'third_party', 'vendor')),
  amount INTEGER NOT NULL,  -- in paise
  currency TEXT DEFAULT 'INR',
  status TEXT DEFAULT 'created',
  on_hold BOOLEAN DEFAULT false,
  on_hold_until TIMESTAMPTZ,
  recipient_settlement_id TEXT,
  processed_at TIMESTAMPTZ,
  notes JSONB DEFAULT '{}',
  error_details JSONB,
  invoice_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Edge Functions

### 1. `create-order-with-transfers`

Creates a Razorpay order with automatic fee transfers.

**Request:**
```typescript
POST /functions/v1/create-order-with-transfers
{
  "invoiceId": "uuid",
  "userId": "user_123",
  "amount": 100000,
  "feeConfigId": "uuid",  // Optional, uses default if not provided
  "enableTransfers": true
}
```

**Response:**
```json
{
  "success": true,
  "order_id": "order_XXXX",
  "amount": 10000000,
  "currency": "INR",
  "public_token": "rzp_test_XXXX",
  "transfers_count": 4,
  "transfers": [
    {
      "id": "trf_PLATFORM001",
      "recipient": "acc_PLATFORM001",
      "amount": 250000,
      "status": "created",
      "notes": { "type": "platform_fee" }
    },
    {
      "id": "trf_3PL001",
      "recipient": "acc_3PL001",
      "amount": 150000,
      "status": "created",
      "on_hold": true,
      "notes": { "type": "third_party_fee", "name": "3PL Fee" }
    },
    {
      "id": "trf_GATEWAY001",
      "recipient": "acc_GATEWAY001",
      "amount": 50000,
      "status": "created",
      "notes": { "type": "third_party_fee", "name": "Gateway Fee" }
    },
    {
      "id": "trf_VENDOR001",
      "recipient": "acc_VENDOR001",
      "amount": 9550000,
      "status": "created",
      "notes": { "type": "vendor_payment" }
    }
  ]
}
```

### 2. `razorpay-transfer-webhook`

Handles Razorpay webhook events for transfers.

**Supported Events:**
- `transfer.processed` - Transfer completed successfully
- `transfer.failed` - Transfer failed
- `transfer.reversed` - Transfer was reversed

**Webhook Payload:**
```json
{
  "event": "transfer.processed",
  "payload": {
    "transfer": {
      "entity": {
        "id": "trf_XXXX",
        "status": "processed",
        "recipient": "acc_XXXX",
        "amount": 250000,
        "processed_at": 1663324917,
        "recipient_settlement_id": "setl_XXXX"
      }
    }
  }
}
```

---

## Frontend Integration

### TypeScript Types

```typescript
import type {
  LinkedAccount,
  FeeConfiguration,
  TransferRecord,
  TransferSummary,
} from '@/types/transfers';
```

### Service Usage

```typescript
import { transfersService } from '@/services/transfersService';

// Get linked accounts
const accounts = await transfersService.getLinkedAccounts(userId);

// Get fee configurations
const configs = await transfersService.getFeeConfigurations(userId);

// Create order with transfers
const order = await transfersService.createOrderWithTransfers({
  invoiceId: 'uuid',
  userId: 'user_123',
  amount: 100000,
  enableTransfers: true,
});

// Get transfer summary for invoice
const summary = await transfersService.getInvoiceTransferSummary(invoiceId);

// Calculate fee breakdown
const breakdown = transfersService.calculateTransferBreakdown(100000, feeConfig);
// Returns: { platformFee: 2500, thirdPartyFees: [...], vendorAmount: 95500 }
```

---

## Setup Instructions

### 1. Run Database Migrations

```bash
# Run the SQL migration
psql -h your-db-host -U postgres -d your-database -f database/razorpay_route_transfers.sql
```

Or in Supabase SQL Editor:
```sql
-- Copy and paste contents of database/razorpay_route_transfers.sql
```

### 2. Deploy Edge Functions

```bash
supabase functions deploy create-order-with-transfers
supabase functions deploy razorpay-transfer-webhook
```

### 3. Configure Environment Variables

Add to Supabase Edge Function secrets:

```bash
RAZORPAY_PARTNER_CLIENT_ID=your_client_id
RAZORPAY_PARTNER_CLIENT_SECRET=your_client_secret
RAZORPAY_MODE=live  # or "test"
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
```

### 4. Set Up Razorpay Webhook

1. Go to Razorpay Dashboard → Settings → Webhooks
2. Add new webhook URL: `https://your-project.supabase.co/functions/v1/razorpay-transfer-webhook`
3. Select events:
   - `transfer.processed`
   - `transfer.failed`
   - `transfer.reversed`
4. Copy the webhook secret and add to environment variables

### 5. Create Linked Accounts

```typescript
// Create platform account
await transfersService.createLinkedAccount({
  user_id: 'user_123',
  account_id: 'acc_PLATFORM001',  // From Razorpay
  account_type: 'platform',
  account_name: 'My Platform',
  account_email: 'platform@example.com',
  account_status: 'activated',
});

// Create third-party accounts
await transfersService.createLinkedAccount({
  user_id: 'user_123',
  account_id: 'acc_3PL001',
  account_type: 'third_party',
  account_name: '3PL Logistics',
  account_email: '3pl@example.com',
  account_status: 'activated',
});
```

### 6. Create Fee Configuration

```typescript
await transfersService.createFeeConfiguration({
  user_id: 'user_123',
  config_name: 'Default Configuration',
  is_default: true,
  platform_fee_type: 'percentage',
  platform_fee_value: 2.5,
  platform_account_id: 'acc_PLATFORM001',
  third_party_fees: [
    {
      account_id: 'acc_3PL001',
      fee_type: 'percentage',
      fee_value: 1.5,
      name: '3PL Fee',
      on_hold: true,
    },
    {
      account_id: 'acc_GATEWAY001',
      fee_type: 'fixed',
      fee_value: 500,
      name: 'Gateway Fee',
      on_hold: false,
    },
  ],
  on_hold_default: false,
  on_hold_until_days: 0,
});
```

---

## Usage Examples

### Example 1: Create Order with Default Fee Configuration

```typescript
const order = await transfersService.createOrderWithTransfers({
  invoiceId: invoice.id,
  userId: user.id,
  amount: 100000,  // ₹1,00,000
  enableTransfers: true,  // Uses default fee config
});

console.log(`Order created: ${order.order_id}`);
console.log(`Transfers: ${order.transfers_count}`);
```

**Result:**
- Platform fee: ₹2,500 (2.5%)
- 3PL fee: ₹1,500 (1.5%)
- Gateway fee: ₹500 (fixed)
- Vendor amount: ₹95,500

### Example 2: Create Order with Specific Fee Configuration

```typescript
const order = await transfersService.createOrderWithTransfers({
  invoiceId: invoice.id,
  userId: user.id,
  amount: 50000,  // ₹50,000
  feeConfigId: customConfig.id,
  enableTransfers: true,
});
```

### Example 3: Create Order Without Transfers

```typescript
const order = await transfersService.createOrderWithTransfers({
  invoiceId: invoice.id,
  userId: user.id,
  amount: 25000,  // ₹25,000
  enableTransfers: false,  // No fee splitting
});
```

### Example 4: View Transfer Summary

```typescript
const summary = await transfersService.getInvoiceTransferSummary(invoice.id);

console.log(`Total transfers: ${summary.total_transfers}`);
console.log(`Processed: ${summary.processed_count}`);
console.log(`Pending: ${summary.pending_count}`);
console.log(`Failed: ${summary.failed_count}`);

summary.transfers.forEach(transfer => {
  console.log(`${transfer.recipient_type}: ₹${transfer.amount / 100} - ${transfer.status}`);
});
```

---

## Important Notes

### Limitations

1. **Currency**: Only INR is supported
2. **Partial Payments**: Cannot create transfers on orders with `partial_payment` enabled
3. **International**: Transfers not available for international currencies
4. **Retries**: Failed transfers are retried automatically (max 3 times)

### On-Hold Transfers

Transfers can be put on hold for a specified period:

```typescript
{
  account_id: 'acc_3PL001',
  fee_type: 'percentage',
  fee_value: 1.5,
  name: '3PL Fee',
  on_hold: true,  // Hold the transfer
}
```

Use cases:
- Hold logistics fees until delivery confirmation
- Hold marketplace fees until order completion
- Escrow-like functionality

### Transfer Status Flow

```
created → pending → processed ✓
                  → failed ✗
                  → reversed ↩
```

---

## Monitoring & Debugging

### Check Transfer Status

```sql
SELECT 
  tr.transfer_id,
  tr.recipient_type,
  tr.amount / 100 as amount_inr,
  tr.status,
  tr.processed_at,
  la.account_name
FROM transfer_records tr
LEFT JOIN linked_accounts la ON tr.recipient_account_id = la.account_id
WHERE tr.invoice_id = 'your-invoice-id'
ORDER BY tr.created_at;
```

### View Failed Transfers

```sql
SELECT 
  transfer_id,
  recipient_account_id,
  amount / 100 as amount_inr,
  error_details,
  created_at
FROM transfer_records
WHERE status = 'failed'
ORDER BY created_at DESC;
```

### Check Fee Configuration

```sql
SELECT 
  config_name,
  is_default,
  platform_fee_type,
  platform_fee_value,
  third_party_fees,
  created_at
FROM fee_configurations
WHERE user_id = 'your-user-id';
```

---

## Testing

### Test Scenario 1: Basic Transfer

```typescript
// 1. Create fee configuration
const config = await transfersService.createFeeConfiguration({
  user_id: 'test_user',
  config_name: 'Test Config',
  is_default: true,
  platform_fee_type: 'percentage',
  platform_fee_value: 2,
  platform_account_id: 'acc_TEST_PLATFORM',
  third_party_fees: [],
});

// 2. Create order
const order = await transfersService.createOrderWithTransfers({
  invoiceId: testInvoice.id,
  userId: 'test_user',
  amount: 10000,  // ₹100
  enableTransfers: true,
});

// 3. Verify transfers
expect(order.transfers_count).toBe(2);  // Platform + Vendor
expect(order.transfers[0].amount).toBe(200);  // ₹2 platform fee
expect(order.transfers[1].amount).toBe(9800);  // ₹98 vendor amount
```

### Test Scenario 2: Multiple Third-Party Fees

```typescript
const config = await transfersService.createFeeConfiguration({
  user_id: 'test_user',
  config_name: 'Multi-Fee Config',
  is_default: true,
  platform_fee_type: 'percentage',
  platform_fee_value: 2.5,
  platform_account_id: 'acc_PLATFORM',
  third_party_fees: [
    { account_id: 'acc_3PL', fee_type: 'percentage', fee_value: 1.5, name: '3PL', on_hold: false },
    { account_id: 'acc_GATEWAY', fee_type: 'fixed', fee_value: 10, name: 'Gateway', on_hold: false },
  ],
});

const order = await transfersService.createOrderWithTransfers({
  invoiceId: testInvoice.id,
  userId: 'test_user',
  amount: 100000,  // ₹1,000
  enableTransfers: true,
});

// Verify: Platform (₹25) + 3PL (₹15) + Gateway (₹10) + Vendor (₹950) = ₹1,000
expect(order.transfers_count).toBe(4);
```

---

## Troubleshooting

### Issue: Transfers not created

**Check:**
1. Fee configuration exists and is valid
2. Linked accounts are activated
3. `enableTransfers` is set to `true`
4. Razorpay OAuth token has `read_write` scope

### Issue: Webhook not updating status

**Check:**
1. Webhook URL is correct
2. Webhook secret matches environment variable
3. Events are selected in Razorpay dashboard
4. Check Supabase function logs

### Issue: Transfer failed

**Check:**
1. Linked account is activated
2. Account has sufficient balance (for on-hold releases)
3. Check `error_details` in `transfer_records` table

---

## Security Considerations

1. **Webhook Signature Verification**: Always verify Razorpay webhook signatures
2. **RLS Policies**: Ensure users can only access their own data
3. **Service Role**: Use service role key only in edge functions
4. **Token Refresh**: Automatically refresh expired OAuth tokens
5. **Error Handling**: Never expose sensitive error details to frontend

---

## Next Steps

1. **UI Components**: Build admin UI for managing linked accounts and fee configurations
2. **Analytics**: Add dashboard for transfer analytics and revenue tracking
3. **Notifications**: Send email/SMS notifications on transfer completion
4. **Reconciliation**: Build reconciliation tools for accounting
5. **Reporting**: Generate fee reports for tax and accounting purposes

---

## Support

For issues or questions:
- Razorpay Route Documentation: https://razorpay.com/docs/route/
- Razorpay Support: https://razorpay.com/support/
- Supabase Documentation: https://supabase.com/docs
