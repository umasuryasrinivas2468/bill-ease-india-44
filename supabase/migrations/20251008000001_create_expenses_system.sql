-- Create expense_categories table for categorizing expenses
CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  category_name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create expenses table
CREATE TABLE IF NOT EXISTS expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  vendor_id UUID REFERENCES vendors(id),
  vendor_name TEXT NOT NULL,
  expense_number TEXT NOT NULL UNIQUE,
  expense_date DATE NOT NULL,
  category_id UUID REFERENCES expense_categories(id),
  category_name TEXT NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL,
  payment_mode TEXT NOT NULL CHECK (payment_mode IN ('cash', 'bank', 'credit_card', 'debit_card', 'upi', 'cheque')),
  reference_number TEXT,
  bill_number TEXT,
  bill_attachment_url TEXT,
  notes TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'posted')),
  posted_to_ledger BOOLEAN DEFAULT FALSE,
  journal_id UUID, -- Will reference journals table when posted
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create expense_attachments table for storing multiple attachments
CREATE TABLE IF NOT EXISTS expense_attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id UUID REFERENCES expenses(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Insert default expense categories
INSERT INTO expense_categories (user_id, category_name, description, is_default) VALUES 
('system', 'Office Rent', 'Monthly office rental expenses', TRUE),
('system', 'Fuel & Transportation', 'Vehicle fuel and transportation costs', TRUE),
('system', 'Advertising & Marketing', 'Marketing and promotional expenses', TRUE),
('system', 'Office Supplies', 'Stationery and office equipment', TRUE),
('system', 'Professional Fees', 'Legal, CA, and consultant fees', TRUE),
('system', 'Utilities', 'Electricity, water, internet bills', TRUE),
('system', 'Travel & Accommodation', 'Business travel expenses', TRUE),
('system', 'Communication', 'Phone, internet, postage expenses', TRUE),
('system', 'Insurance', 'Business insurance premiums', TRUE),
('system', 'Repairs & Maintenance', 'Equipment and office maintenance', TRUE),
('system', 'Software & Subscriptions', 'Software licenses and subscriptions', TRUE),
('system', 'Printing & Stationery', 'Printing and paper costs', TRUE),
('system', 'Bank Charges', 'Banking fees and charges', TRUE),
('system', 'Entertainment', 'Client entertainment expenses', TRUE),
('system', 'Training & Development', 'Employee training costs', TRUE),
('system', 'Miscellaneous', 'Other business expenses', TRUE)
ON CONFLICT (category_name) DO NOTHING;

-- Enable Row Level Security
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_attachments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for expense_categories
CREATE POLICY "Users can see their own and default categories" ON expense_categories
  FOR ALL USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text) OR user_id = 'system');

-- Create RLS policies for expenses
CREATE POLICY "Users can only see their own expenses" ON expenses
  FOR ALL USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

-- Create RLS policies for expense_attachments
CREATE POLICY "Users can only see their own expense attachments" ON expense_attachments
  FOR ALL USING (
    expense_id IN (
      SELECT id FROM expenses WHERE user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
    )
  );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_vendor_id ON expenses(vendor_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_payment_mode ON expenses(payment_mode);
CREATE INDEX IF NOT EXISTS idx_expense_categories_user_id ON expense_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_expense_attachments_expense_id ON expense_attachments(expense_id);

-- Add triggers for updated_at columns
CREATE TRIGGER update_expense_categories_updated_at
    BEFORE UPDATE ON expense_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_expenses_updated_at
    BEFORE UPDATE ON expenses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to generate expense number
CREATE OR REPLACE FUNCTION generate_expense_number()
RETURNS TRIGGER AS $$
DECLARE
    next_num INTEGER;
    current_year TEXT;
    expense_num TEXT;
BEGIN
    -- Get current year
    current_year := EXTRACT(YEAR FROM NEW.expense_date)::TEXT;
    
    -- Get next sequence number for this user and year
    SELECT COALESCE(MAX(CAST(SUBSTRING(expense_number FROM 'EXP/' || current_year || '/([0-9]+)') AS INTEGER)), 0) + 1
    INTO next_num
    FROM expenses 
    WHERE user_id = NEW.user_id 
    AND EXTRACT(YEAR FROM expense_date) = EXTRACT(YEAR FROM NEW.expense_date);
    
    -- Generate expense number
    expense_num := 'EXP/' || current_year || '/' || LPAD(next_num::TEXT, 4, '0');
    
    NEW.expense_number := expense_num;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-generating expense numbers
CREATE TRIGGER generate_expense_number_trigger
    BEFORE INSERT ON expenses
    FOR EACH ROW
    WHEN (NEW.expense_number IS NULL OR NEW.expense_number = '')
    EXECUTE FUNCTION generate_expense_number();