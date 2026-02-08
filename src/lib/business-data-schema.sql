
-- Create business_profiles table for storing user business information
CREATE TABLE IF NOT EXISTS business_profiles (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  business_name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  gst_number TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create bank_details table for storing user banking information
CREATE TABLE IF NOT EXISTS bank_details (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  account_number TEXT NOT NULL,
  ifsc_code TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  branch_name TEXT,
  account_holder_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create business_assets table for storing logos and signatures
CREATE TABLE IF NOT EXISTS business_assets (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('logo', 'signature')),
  asset_data TEXT NOT NULL, -- Base64 encoded image data
  file_name TEXT,
  mime_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE(user_id, asset_type)
);

-- Enable Row Level Security
ALTER TABLE business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_assets ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can only see their own business profile" ON business_profiles;
DROP POLICY IF EXISTS "Users can only see their own bank details" ON bank_details;
DROP POLICY IF EXISTS "Users can only see their own business assets" ON business_assets;

-- Create RLS policies
CREATE POLICY "Users can only see their own business profile" ON business_profiles 
  FOR ALL USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

CREATE POLICY "Users can only see their own bank details" ON bank_details 
  FOR ALL USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

CREATE POLICY "Users can only see their own business assets" ON business_assets 
  FOR ALL USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_business_profiles_user_id ON business_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_details_user_id ON bank_details(user_id);
CREATE INDEX IF NOT EXISTS idx_business_assets_user_id ON business_assets(user_id);
CREATE INDEX IF NOT EXISTS idx_business_assets_type ON business_assets(asset_type);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_business_profiles_updated_at BEFORE UPDATE ON business_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bank_details_updated_at BEFORE UPDATE ON bank_details
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_business_assets_updated_at BEFORE UPDATE ON business_assets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Sample queries for inserting data
-- INSERT INTO business_profiles (user_id, business_name, owner_name, email, phone, gst_number, address, city, state, pincode) 
-- VALUES ('user_clerk_id', 'Aczen Tech', 'John Doe', 'john@aczen.com', '+91 9876543210', '22AAAAA0000A1Z5', '123 Business Street', 'Mumbai', 'Maharashtra', '400001');

-- INSERT INTO bank_details (user_id, account_number, ifsc_code, bank_name, branch_name, account_holder_name) 
-- VALUES ('user_clerk_id', '1234567890123456', 'SBIN0001234', 'State Bank of India', 'Mumbai Main', 'John Doe');

-- INSERT INTO business_assets (user_id, asset_type, asset_data, file_name, mime_type) 
-- VALUES ('user_clerk_id', 'logo', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEU...', 'logo.png', 'image/png');
