-- Add tds_amount column to expenses table
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS tds_amount NUMERIC(12,2) DEFAULT 0;

-- Add tds_rule_id column to track which TDS rule was applied
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS tds_rule_id UUID REFERENCES tds_rules(id);