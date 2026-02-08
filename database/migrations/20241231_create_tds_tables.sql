-- Create TDS Rules table
CREATE TABLE IF NOT EXISTS tds_rules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    rate_percentage DECIMAL(5,2) NOT NULL CHECK (rate_percentage >= 0 AND rate_percentage <= 100),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_user_category UNIQUE(user_id, category)
);

-- Create TDS Transactions table
CREATE TABLE IF NOT EXISTS tds_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id),
    invoice_id UUID REFERENCES invoices(id),
    tds_rule_id UUID REFERENCES tds_rules(id),
    transaction_amount DECIMAL(15,2) NOT NULL CHECK (transaction_amount > 0),
    tds_rate DECIMAL(5,2) NOT NULL CHECK (tds_rate >= 0 AND tds_rate <= 100),
    tds_amount DECIMAL(15,2) NOT NULL CHECK (tds_amount >= 0),
    net_payable DECIMAL(15,2) NOT NULL CHECK (net_payable >= 0),
    transaction_date DATE NOT NULL,
    vendor_name TEXT NOT NULL,
    vendor_pan TEXT,
    description TEXT,
    certificate_number TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure the calculation is correct
    CONSTRAINT check_tds_calculation CHECK (
        ABS(tds_amount - (transaction_amount * tds_rate / 100)) < 0.01
    ),
    CONSTRAINT check_net_payable CHECK (
        ABS(net_payable - (transaction_amount - tds_amount)) < 0.01
    )
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_tds_rules_user_id ON tds_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_tds_rules_category ON tds_rules(category);
CREATE INDEX IF NOT EXISTS idx_tds_rules_active ON tds_rules(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_tds_transactions_user_id ON tds_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_tds_transactions_date ON tds_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_tds_transactions_client_id ON tds_transactions(client_id);
CREATE INDEX IF NOT EXISTS idx_tds_transactions_tds_rule_id ON tds_transactions(tds_rule_id);
CREATE INDEX IF NOT EXISTS idx_tds_transactions_vendor_name ON tds_transactions(vendor_name);

-- Create update triggers for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE OR REPLACE TRIGGER update_tds_rules_updated_at 
    BEFORE UPDATE ON tds_rules 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_tds_transactions_updated_at 
    BEFORE UPDATE ON tds_transactions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert some default TDS rules (common Indian TDS categories)
INSERT INTO tds_rules (user_id, category, rate_percentage, description, created_at) 
SELECT 
    users.id as user_id,
    category,
    rate_percentage,
    description,
    NOW()
FROM users,
(VALUES 
    ('Professional Fees', 10.00, 'TDS on Professional or Technical Services - Section 194J'),
    ('Contractor Payments', 2.00, 'TDS on Contractor Payments - Section 194C'),
    ('Rent Payments', 10.00, 'TDS on Rent - Section 194I'),
    ('Commission and Brokerage', 5.00, 'TDS on Commission and Brokerage - Section 194H'),
    ('Interest Payments', 10.00, 'TDS on Interest other than Interest on Securities - Section 194A'),
    ('Salary', 0.00, 'TDS on Salary - Section 192'),
    ('Freight and Transport', 1.00, 'TDS on Freight and Transport - Section 194C'),
    ('Advertising', 2.00, 'TDS on Advertisement - Section 194C'),
    ('Insurance Premium', 5.00, 'TDS on Insurance Premium - Section 194D'),
    ('Other Services', 2.00, 'TDS on Other Services - Section 194J')
) AS default_rules(category, rate_percentage, description)
WHERE NOT EXISTS (
    SELECT 1 FROM tds_rules 
    WHERE tds_rules.user_id = users.id 
    AND tds_rules.category = default_rules.category
);

-- Enable Row Level Security (RLS)
ALTER TABLE tds_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE tds_transactions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own TDS rules" ON tds_rules FOR SELECT USING (auth.uid()::text = user_id::text);
CREATE POLICY "Users can insert their own TDS rules" ON tds_rules FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);
CREATE POLICY "Users can update their own TDS rules" ON tds_rules FOR UPDATE USING (auth.uid()::text = user_id::text);
CREATE POLICY "Users can delete their own TDS rules" ON tds_rules FOR DELETE USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can view their own TDS transactions" ON tds_transactions FOR SELECT USING (auth.uid()::text = user_id::text);
CREATE POLICY "Users can insert their own TDS transactions" ON tds_transactions FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);
CREATE POLICY "Users can update their own TDS transactions" ON tds_transactions FOR UPDATE USING (auth.uid()::text = user_id::text);
CREATE POLICY "Users can delete their own TDS transactions" ON tds_transactions FOR DELETE USING (auth.uid()::text = user_id::text);

-- Grant permissions
GRANT ALL ON tds_rules TO authenticated;
GRANT ALL ON tds_transactions TO authenticated;

-- Create view for TDS summary reports
CREATE OR REPLACE VIEW tds_summary_view AS
SELECT 
    t.user_id,
    DATE_TRUNC('month', t.transaction_date) as month_year,
    r.category,
    COUNT(*) as transaction_count,
    SUM(t.transaction_amount) as total_transaction_amount,
    SUM(t.tds_amount) as total_tds_deducted,
    SUM(t.net_payable) as total_net_payable,
    AVG(t.tds_rate) as avg_tds_rate
FROM tds_transactions t
LEFT JOIN tds_rules r ON t.tds_rule_id = r.id
GROUP BY t.user_id, DATE_TRUNC('month', t.transaction_date), r.category;

GRANT SELECT ON tds_summary_view TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE tds_rules IS 'Stores TDS rate configurations for different payment categories';
COMMENT ON TABLE tds_transactions IS 'Records all TDS transactions and calculations';
COMMENT ON VIEW tds_summary_view IS 'Aggregated view for TDS reporting and analytics';

COMMENT ON COLUMN tds_rules.category IS 'Type of payment (e.g., Professional Fees, Contractor Payments)';
COMMENT ON COLUMN tds_rules.rate_percentage IS 'TDS rate as percentage (0-100)';
COMMENT ON COLUMN tds_transactions.transaction_amount IS 'Original transaction amount before TDS deduction';
COMMENT ON COLUMN tds_transactions.tds_amount IS 'Amount deducted as TDS';
COMMENT ON COLUMN tds_transactions.net_payable IS 'Amount payable after TDS deduction';
COMMENT ON COLUMN tds_transactions.vendor_pan IS 'PAN number of the vendor (optional)';
COMMENT ON COLUMN tds_transactions.certificate_number IS 'TDS certificate number issued';