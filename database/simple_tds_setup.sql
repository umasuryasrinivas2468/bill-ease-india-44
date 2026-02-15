-- Simple TDS Tables Setup (Run this in Supabase SQL Editor)

-- Create TDS Rules table
CREATE TABLE IF NOT EXISTS tds_rules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    category TEXT NOT NULL,
    rate_percentage DECIMAL(5,2) NOT NULL CHECK (rate_percentage >= 0 AND rate_percentage <= 100),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create TDS Transactions table
CREATE TABLE IF NOT EXISTS tds_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    client_id UUID,
    invoice_id UUID,
    tds_rule_id UUID,
    transaction_amount DECIMAL(15,2) NOT NULL,
    tds_rate DECIMAL(5,2) NOT NULL,
    tds_amount DECIMAL(15,2) NOT NULL,
    net_payable DECIMAL(15,2) NOT NULL,
    transaction_date DATE NOT NULL,
    vendor_name TEXT NOT NULL,
    vendor_pan TEXT,
    description TEXT,
    certificate_number TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_tds_rules_user_id ON tds_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_tds_transactions_user_id ON tds_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_tds_transactions_date ON tds_transactions(transaction_date);

-- Enable Row Level Security
ALTER TABLE tds_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE tds_transactions ENABLE ROW LEVEL SECURITY;

-- Simple RLS policies (adjust based on your auth setup)
CREATE POLICY "Enable read access for authenticated users" ON tds_rules FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Enable insert for authenticated users" ON tds_rules FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable update for authenticated users" ON tds_rules FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable read access for authenticated users" ON tds_transactions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Enable insert for authenticated users" ON tds_transactions FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable update for authenticated users" ON tds_transactions FOR UPDATE USING (auth.role() = 'authenticated');