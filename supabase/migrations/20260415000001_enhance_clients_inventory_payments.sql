-- ============================================================================
-- Migration: Enhance Clients, Inventory, Sales Orders, Invoices + Payment Received
-- ============================================================================

-- ── 1. CLIENTS: Add new fields ──────────────────────────────────────────────
ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_type TEXT DEFAULT 'business' CHECK (client_type IN ('business', 'individual'));
ALTER TABLE clients ADD COLUMN IF NOT EXISTS salutation TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'English';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS gst_treatment TEXT DEFAULT 'registered' CHECK (gst_treatment IN ('registered', 'unregistered', 'consumer', 'overseas', 'sez', 'deemed_export', 'composition'));
ALTER TABLE clients ADD COLUMN IF NOT EXISTS place_of_supply TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS pan TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tax_preference TEXT DEFAULT 'taxable' CHECK (tax_preference IN ('taxable', 'tax_exempt'));
ALTER TABLE clients ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS opening_balance DECIMAL(14,2) DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS payment_terms INTEGER DEFAULT 30;

-- ── 2. INVENTORY: Add HSN/SAC ──────────────────────────────────────────────
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS hsn_code TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS sac_code TEXT;

-- ── 3. SALES ORDERS: Add shipping address ──────────────────────────────────
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS shipping_address TEXT;

-- ── 4. INVOICES: Add shipping address (separate from client_address) ───────
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS shipping_address TEXT;

-- ── 5. PAYMENT RECEIVED table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_received (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('invoice_payment', 'customer_advance')),

  -- Common fields
  customer_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  bank_charges DECIMAL(14,2) DEFAULT 0,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference_number TEXT,
  payment_mode TEXT DEFAULT 'bank_transfer' CHECK (payment_mode IN ('cash', 'bank_transfer', 'cheque', 'upi', 'card', 'other')),
  deposit_account TEXT,
  deposit_reference TEXT,
  notes TEXT,

  -- Invoice Payment specific
  tax_deducted DECIMAL(14,2) DEFAULT 0,
  invoice_allocations JSONB DEFAULT '[]'::jsonb,
  attachments JSONB DEFAULT '[]'::jsonb,

  -- Customer Advance specific
  place_of_supply TEXT,
  description TEXT,
  tax_amount DECIMAL(14,2) DEFAULT 0,

  status TEXT DEFAULT 'received' CHECK (status IN ('received', 'cancelled', 'refunded')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- RLS
ALTER TABLE payment_received ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payment_received' AND policyname = 'Users can manage their own payments received'
  ) THEN
    CREATE POLICY "Users can manage their own payments received"
      ON payment_received FOR ALL
      USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payment_received_user ON payment_received(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_received_customer ON payment_received(customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_received_date ON payment_received(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payment_received_type ON payment_received(payment_type);
CREATE INDEX IF NOT EXISTS idx_inventory_hsn ON inventory(hsn_code);
CREATE INDEX IF NOT EXISTS idx_inventory_sac ON inventory(sac_code);
