-- Create license table for storing license keys
CREATE TABLE IF NOT EXISTS license (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    license_key VARCHAR(20) UNIQUE NOT NULL,
    plan_type VARCHAR(10) NOT NULL CHECK (plan_type IN ('starter', 'growth', 'scale')),
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    due_date TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create an index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_license_email ON license(email);

-- Create an index on license_key for faster lookups
CREATE INDEX IF NOT EXISTS idx_license_key ON license(license_key);

-- Add RLS (Row Level Security) policies if needed
ALTER TABLE license ENABLE ROW LEVEL SECURITY;

-- Allow public access for license generation (you can modify this as needed)
CREATE POLICY "Allow public read access" ON license
    FOR SELECT USING (true);

CREATE POLICY "Allow public insert access" ON license
    FOR INSERT WITH CHECK (true);