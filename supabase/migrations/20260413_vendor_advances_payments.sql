-- Vendor Advances & Bill Payment System
-- Migration: Create tables for vendor advances, advance adjustments, and bill payments

-- 1. Vendor Advances table
CREATE TABLE IF NOT EXISTS vendor_advances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  org_id TEXT,
  vendor_id UUID NOT NULL REFERENCES vendors(id),
  vendor_name TEXT NOT NULL,
  advance_number TEXT NOT NULL,
  advance_date DATE NOT NULL,
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  payment_mode TEXT NOT NULL DEFAULT 'bank',
  reference_number TEXT,
  notes TEXT,
  adjusted_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  unadjusted_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'partially_adjusted', 'fully_adjusted')),
  journal_id UUID REFERENCES journals(id),
  attachment_url TEXT,
  attachment_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vendor_advances_user ON vendor_advances(user_id);
CREATE INDEX idx_vendor_advances_vendor ON vendor_advances(vendor_id);
CREATE INDEX idx_vendor_advances_status ON vendor_advances(user_id, status);
CREATE UNIQUE INDEX idx_vendor_advances_number ON vendor_advances(user_id, advance_number);

-- 2. Advance Adjustments table
CREATE TABLE IF NOT EXISTS advance_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  org_id TEXT,
  advance_id UUID NOT NULL REFERENCES vendor_advances(id),
  advance_number TEXT NOT NULL,
  bill_id UUID NOT NULL REFERENCES purchase_bills(id),
  bill_number TEXT NOT NULL,
  vendor_id UUID NOT NULL REFERENCES vendors(id),
  vendor_name TEXT NOT NULL,
  adjustment_date DATE NOT NULL,
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  journal_id UUID REFERENCES journals(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_advance_adjustments_user ON advance_adjustments(user_id);
CREATE INDEX idx_advance_adjustments_advance ON advance_adjustments(advance_id);
CREATE INDEX idx_advance_adjustments_bill ON advance_adjustments(bill_id);

-- 3. Vendor Bill Payments table
CREATE TABLE IF NOT EXISTS vendor_bill_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  org_id TEXT,
  bill_id UUID NOT NULL REFERENCES purchase_bills(id),
  bill_number TEXT NOT NULL,
  vendor_id UUID NOT NULL,
  vendor_name TEXT NOT NULL,
  payment_date DATE NOT NULL,
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  payment_mode TEXT NOT NULL DEFAULT 'bank',
  reference_number TEXT,
  payment_type TEXT NOT NULL DEFAULT 'direct' CHECK (payment_type IN ('direct', 'advance_adjustment')),
  advance_id UUID REFERENCES vendor_advances(id),
  advance_number TEXT,
  journal_id UUID REFERENCES journals(id),
  notes TEXT,
  attachment_url TEXT,
  attachment_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vendor_bill_payments_user ON vendor_bill_payments(user_id);
CREATE INDEX idx_vendor_bill_payments_bill ON vendor_bill_payments(bill_id);
CREATE INDEX idx_vendor_bill_payments_vendor ON vendor_bill_payments(vendor_id);

-- 4. Add paid_amount to purchase_bills if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_bills' AND column_name = 'paid_amount'
  ) THEN
    ALTER TABLE purchase_bills ADD COLUMN paid_amount NUMERIC(15,2) DEFAULT 0;
  END IF;
END $$;

-- 5. Enable RLS
ALTER TABLE vendor_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE advance_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_bill_payments ENABLE ROW LEVEL SECURITY;

-- RLS policies (user can only access their own data)
CREATE POLICY "Users can manage own vendor advances"
  ON vendor_advances FOR ALL USING (user_id = auth.uid()::text);

CREATE POLICY "Users can manage own advance adjustments"
  ON advance_adjustments FOR ALL USING (user_id = auth.uid()::text);

CREATE POLICY "Users can manage own vendor bill payments"
  ON vendor_bill_payments FOR ALL USING (user_id = auth.uid()::text);
