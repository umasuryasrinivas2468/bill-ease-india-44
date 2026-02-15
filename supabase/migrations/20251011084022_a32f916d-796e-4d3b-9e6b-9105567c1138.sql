-- Add TDS-related columns to vendors table
ALTER TABLE vendors 
ADD COLUMN IF NOT EXISTS pan text,
ADD COLUMN IF NOT EXISTS linked_tds_section_id uuid,
ADD COLUMN IF NOT EXISTS tds_enabled boolean DEFAULT false;

-- Create TDS Master table
CREATE TABLE IF NOT EXISTS tds_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  section_code text NOT NULL,
  description text,
  rate numeric NOT NULL,
  threshold_amount numeric NOT NULL DEFAULT 0,
  payee_type text NOT NULL CHECK (payee_type IN ('individual', 'company')),
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id, section_code)
);

-- Create TDS Rules table
CREATE TABLE IF NOT EXISTS tds_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  category text NOT NULL,
  rate_percentage numeric NOT NULL,
  threshold_amount numeric DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id, category)
);

-- Create TDS Transactions table
CREATE TABLE IF NOT EXISTS tds_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  client_id text,
  invoice_id uuid,
  tds_rule_id uuid REFERENCES tds_rules(id),
  transaction_amount numeric NOT NULL,
  tds_rate numeric NOT NULL,
  tds_amount numeric NOT NULL,
  net_payable numeric NOT NULL,
  transaction_date date NOT NULL,
  vendor_name text NOT NULL,
  vendor_pan text,
  description text,
  certificate_number text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CHECK (tds_amount = ROUND(transaction_amount * tds_rate / 100, 2)),
  CHECK (net_payable = ROUND(transaction_amount - tds_amount, 2))
);

-- Create TDS Deposits table
CREATE TABLE IF NOT EXISTS tds_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  tds_transaction_id uuid REFERENCES tds_transactions(id) ON DELETE CASCADE,
  deposit_date date NOT NULL,
  amount numeric NOT NULL,
  reference text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_tds_master_user_id ON tds_master(user_id);
CREATE INDEX IF NOT EXISTS idx_tds_rules_user_id ON tds_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_tds_transactions_user_id ON tds_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_tds_transactions_date ON tds_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_tds_deposits_user_id ON tds_deposits(user_id);

-- Enable RLS
ALTER TABLE tds_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE tds_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE tds_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tds_deposits ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tds_master
CREATE POLICY "Users can view their own TDS master records"
  ON tds_master FOR SELECT
  USING (user_id = (current_setting('request.jwt.claims'::text, true)::json ->> 'sub'::text));

CREATE POLICY "Users can insert their own TDS master records"
  ON tds_master FOR INSERT
  WITH CHECK (user_id = (current_setting('request.jwt.claims'::text, true)::json ->> 'sub'::text));

CREATE POLICY "Users can update their own TDS master records"
  ON tds_master FOR UPDATE
  USING (user_id = (current_setting('request.jwt.claims'::text, true)::json ->> 'sub'::text))
  WITH CHECK (user_id = (current_setting('request.jwt.claims'::text, true)::json ->> 'sub'::text));

CREATE POLICY "Users can delete their own TDS master records"
  ON tds_master FOR DELETE
  USING (user_id = (current_setting('request.jwt.claims'::text, true)::json ->> 'sub'::text));

-- RLS Policies for tds_rules
CREATE POLICY "Users can view their own TDS rules"
  ON tds_rules FOR SELECT
  USING (user_id = (current_setting('request.jwt.claims'::text, true)::json ->> 'sub'::text));

CREATE POLICY "Users can insert their own TDS rules"
  ON tds_rules FOR INSERT
  WITH CHECK (user_id = (current_setting('request.jwt.claims'::text, true)::json ->> 'sub'::text));

CREATE POLICY "Users can update their own TDS rules"
  ON tds_rules FOR UPDATE
  USING (user_id = (current_setting('request.jwt.claims'::text, true)::json ->> 'sub'::text))
  WITH CHECK (user_id = (current_setting('request.jwt.claims'::text, true)::json ->> 'sub'::text));

CREATE POLICY "Users can delete their own TDS rules"
  ON tds_rules FOR DELETE
  USING (user_id = (current_setting('request.jwt.claims'::text, true)::json ->> 'sub'::text));

-- RLS Policies for tds_transactions
CREATE POLICY "Users can view their own TDS transactions"
  ON tds_transactions FOR SELECT
  USING (user_id = (current_setting('request.jwt.claims'::text, true)::json ->> 'sub'::text));

CREATE POLICY "Users can insert their own TDS transactions"
  ON tds_transactions FOR INSERT
  WITH CHECK (user_id = (current_setting('request.jwt.claims'::text, true)::json ->> 'sub'::text));

CREATE POLICY "Users can update their own TDS transactions"
  ON tds_transactions FOR UPDATE
  USING (user_id = (current_setting('request.jwt.claims'::text, true)::json ->> 'sub'::text))
  WITH CHECK (user_id = (current_setting('request.jwt.claims'::text, true)::json ->> 'sub'::text));

CREATE POLICY "Users can delete their own TDS transactions"
  ON tds_transactions FOR DELETE
  USING (user_id = (current_setting('request.jwt.claims'::text, true)::json ->> 'sub'::text));

-- RLS Policies for tds_deposits
CREATE POLICY "Users can view their own TDS deposits"
  ON tds_deposits FOR SELECT
  USING (user_id = (current_setting('request.jwt.claims'::text, true)::json ->> 'sub'::text));

CREATE POLICY "Users can insert their own TDS deposits"
  ON tds_deposits FOR INSERT
  WITH CHECK (user_id = (current_setting('request.jwt.claims'::text, true)::json ->> 'sub'::text));

CREATE POLICY "Users can update their own TDS deposits"
  ON tds_deposits FOR UPDATE
  USING (user_id = (current_setting('request.jwt.claims'::text, true)::json ->> 'sub'::text))
  WITH CHECK (user_id = (current_setting('request.jwt.claims'::text, true)::json ->> 'sub'::text));

CREATE POLICY "Users can delete their own TDS deposits"
  ON tds_deposits FOR DELETE
  USING (user_id = (current_setting('request.jwt.claims'::text, true)::json ->> 'sub'::text));

-- Create updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tds_master_updated_at BEFORE UPDATE ON tds_master
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tds_rules_updated_at BEFORE UPDATE ON tds_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tds_transactions_updated_at BEFORE UPDATE ON tds_transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tds_deposits_updated_at BEFORE UPDATE ON tds_deposits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();