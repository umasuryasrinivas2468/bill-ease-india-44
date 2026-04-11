
-- Create accounts table for Chart of Accounts
CREATE TABLE IF NOT EXISTS accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('Asset', 'Liability', 'Equity', 'Income', 'Expense')),
  opening_balance DECIMAL(12,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE(user_id, account_code)
);

-- Create journals table for journal entries
CREATE TABLE IF NOT EXISTS journals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  journal_number TEXT NOT NULL,
  journal_date DATE NOT NULL,
  narration TEXT NOT NULL,
  total_debit DECIMAL(12,2) DEFAULT 0,
  total_credit DECIMAL(12,2) DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'posted')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE(user_id, journal_number)
);

-- Create journal_lines table for individual debit/credit entries
CREATE TABLE IF NOT EXISTS journal_lines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  journal_id UUID REFERENCES journals(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  debit DECIMAL(12,2) DEFAULT 0,
  credit DECIMAL(12,2) DEFAULT 0,
  line_narration TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  CHECK (
    (debit > 0 AND credit = 0) OR 
    (credit > 0 AND debit = 0) OR 
    (debit = 0 AND credit = 0)
  )
);

-- Enable Row Level Security
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for accounts
CREATE POLICY "Users can only see their own accounts" ON accounts
  FOR ALL USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

-- Create RLS policies for journals
CREATE POLICY "Users can only see their own journals" ON journals
  FOR ALL USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

-- Create RLS policies for journal_lines
CREATE POLICY "Users can only see their own journal lines" ON journal_lines
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM journals j 
      WHERE j.id = journal_lines.journal_id 
      AND j.user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
    )
  );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_journals_user_id ON journals(user_id);
CREATE INDEX IF NOT EXISTS idx_journals_date ON journals(journal_date);
CREATE INDEX IF NOT EXISTS idx_journal_lines_journal_id ON journal_lines(journal_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account_id ON journal_lines(account_id);

-- Create triggers for updated_at
CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_journals_updated_at BEFORE UPDATE ON journals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to validate journal balance
CREATE OR REPLACE FUNCTION validate_journal_balance()
RETURNS TRIGGER AS $$
DECLARE
    journal_total_debit DECIMAL(12,2);
    journal_total_credit DECIMAL(12,2);
BEGIN
    -- Calculate totals for the journal
    SELECT 
        COALESCE(SUM(debit), 0),
        COALESCE(SUM(credit), 0)
    INTO journal_total_debit, journal_total_credit
    FROM journal_lines
    WHERE journal_id = COALESCE(NEW.journal_id, OLD.journal_id);
    
    -- Update journal totals
    UPDATE journals 
    SET 
        total_debit = journal_total_debit,
        total_credit = journal_total_credit
    WHERE id = COALESCE(NEW.journal_id, OLD.journal_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger to maintain journal balance
CREATE TRIGGER maintain_journal_balance
    AFTER INSERT OR UPDATE OR DELETE ON journal_lines
    FOR EACH ROW EXECUTE FUNCTION validate_journal_balance();

-- Insert default chart of accounts for new users
INSERT INTO accounts (user_id, account_code, account_name, account_type, opening_balance) VALUES
('default', '1000', 'Cash', 'Asset', 0),
('default', '1100', 'Accounts Receivable', 'Asset', 0),
('default', '1200', 'Inventory', 'Asset', 0),
('default', '1500', 'Equipment', 'Asset', 0),
('default', '2000', 'Accounts Payable', 'Liability', 0),
('default', '2100', 'Notes Payable', 'Liability', 0),
('default', '3000', 'Owner Equity', 'Equity', 0),
('default', '4000', 'Sales Revenue', 'Income', 0),
('default', '5000', 'Cost of Goods Sold', 'Expense', 0),
('default', '6000', 'Operating Expenses', 'Expense', 0)
ON CONFLICT (user_id, account_code) DO NOTHING;
