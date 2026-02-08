-- Create TDS master table
CREATE TABLE IF NOT EXISTS tds_master (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  section_code TEXT NOT NULL, -- e.g., 194C, 194J
  description TEXT,
  rate NUMERIC(5,2) NOT NULL DEFAULT 0, -- percentage
  threshold_amount DECIMAL(12,2) DEFAULT 0,
  payee_type TEXT CHECK (payee_type IN ('individual', 'company')) DEFAULT 'individual',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Add columns to vendors table to link TDS
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS linked_tds_section_id UUID REFERENCES tds_master(id),
  ADD COLUMN IF NOT EXISTS tds_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pan_required BOOLEAN DEFAULT FALSE;

-- Create tds_transactions table which records applied TDS on bills/payments/expenses
CREATE TABLE IF NOT EXISTS tds_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  related_type TEXT NOT NULL, -- 'expense' | 'purchase_bill' | 'payment' | etc.
  related_id UUID, -- reference to expense, purchase_bills, payments table id
  vendor_id UUID REFERENCES vendors(id),
  tds_master_id UUID REFERENCES tds_master(id),
  gross_amount DECIMAL(12,2) NOT NULL,
  tds_amount DECIMAL(12,2) NOT NULL,
  rate NUMERIC(5,2) NOT NULL,
  threshold_applied BOOLEAN DEFAULT FALSE,
  journal_id UUID, -- journal entry when posted
  status TEXT DEFAULT 'deducted' CHECK (status IN ('deducted', 'deposited', 'reversed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create tds_deposits table for marking deposits
CREATE TABLE IF NOT EXISTS tds_deposits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  tds_transaction_id UUID REFERENCES tds_transactions(id) ON DELETE CASCADE,
  deposit_date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  reference TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable Row Level Security
ALTER TABLE tds_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE tds_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tds_deposits ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can see their own tds master entries" ON tds_master
  FOR ALL USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

CREATE POLICY "Users can see their own tds transactions" ON tds_transactions
  FOR ALL USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

CREATE POLICY "Users can see their own tds deposits" ON tds_deposits
  FOR ALL USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tds_master_user_id ON tds_master(user_id);
CREATE INDEX IF NOT EXISTS idx_tds_transactions_user_id ON tds_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_tds_transactions_vendor_id ON tds_transactions(vendor_id);
CREATE INDEX IF NOT EXISTS idx_tds_transactions_related ON tds_transactions(related_type, related_id);
CREATE INDEX IF NOT EXISTS idx_tds_deposits_user_id ON tds_deposits(user_id);

-- Triggers to update updated_at
CREATE TRIGGER update_tds_master_updated_at
    BEFORE UPDATE ON tds_master
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tds_transactions_updated_at
    BEFORE UPDATE ON tds_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tds_deposits_updated_at
    BEFORE UPDATE ON tds_deposits
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
