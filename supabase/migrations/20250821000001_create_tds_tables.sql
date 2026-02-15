-- Create TDS Rules table
CREATE TABLE IF NOT EXISTS tds_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  rate_percentage DECIMAL(5,2) NOT NULL CHECK (rate_percentage >= 0 AND rate_percentage <= 100),
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE(user_id, category)
);

-- Create TDS Transactions table to track TDS deductions
CREATE TABLE IF NOT EXISTS tds_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  tds_rule_id UUID REFERENCES tds_rules(id),
  transaction_amount DECIMAL(12,2) NOT NULL,
  tds_rate DECIMAL(5,2) NOT NULL,
  tds_amount DECIMAL(12,2) NOT NULL,
  net_payable DECIMAL(12,2) NOT NULL,
  transaction_date DATE NOT NULL,
  vendor_name TEXT NOT NULL,
  vendor_pan TEXT,
  description TEXT,
  certificate_number TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable Row Level Security
ALTER TABLE tds_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE tds_transactions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for TDS Rules
CREATE POLICY "Users can only see their own TDS rules" ON tds_rules FOR ALL USING (auth.uid() = user_id);

-- Create RLS policies for TDS Transactions
CREATE POLICY "Users can only see their own TDS transactions" ON tds_transactions FOR ALL USING (auth.uid() = user_id);

-- Insert default TDS rules for common categories
INSERT INTO tds_rules (user_id, category, rate_percentage, description) VALUES
(auth.uid(), 'Professional Fees', 10.00, 'TDS on Professional or Technical Services - Section 194J'),
(auth.uid(), 'Contractor Payments', 1.00, 'TDS on Payments to Contractors - Section 194C'),
(auth.uid(), 'Rent Payments', 10.00, 'TDS on Rent Payments - Section 194I'),
(auth.uid(), 'Commission and Brokerage', 5.00, 'TDS on Commission and Brokerage - Section 194H'),
(auth.uid(), 'Interest Payments', 10.00, 'TDS on Interest other than Interest on Securities - Section 194A'),
(auth.uid(), 'Salary', 0.00, 'TDS on Salary - Section 192')
ON CONFLICT (user_id, category) DO NOTHING;

-- Create indexes for better performance
CREATE INDEX idx_tds_rules_user_id ON tds_rules(user_id);
CREATE INDEX idx_tds_rules_category ON tds_rules(category);
CREATE INDEX idx_tds_transactions_user_id ON tds_transactions(user_id);
CREATE INDEX idx_tds_transactions_date ON tds_transactions(transaction_date);
CREATE INDEX idx_tds_transactions_invoice_id ON tds_transactions(invoice_id);

-- Create function to automatically calculate TDS
CREATE OR REPLACE FUNCTION calculate_tds(
  transaction_amt DECIMAL(12,2),
  tds_rate DECIMAL(5,2)
)
RETURNS TABLE(tds_amount DECIMAL(12,2), net_payable DECIMAL(12,2))
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ROUND(transaction_amt * tds_rate / 100, 2) as tds_amount,
    ROUND(transaction_amt - (transaction_amt * tds_rate / 100), 2) as net_payable;
END;
$$;