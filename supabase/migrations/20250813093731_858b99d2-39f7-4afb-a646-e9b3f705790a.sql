
-- Create business_profiles table if not exists (enhanced)
CREATE TABLE IF NOT EXISTS public.business_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  business_name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  gst_number TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  country TEXT DEFAULT 'india',
  currency TEXT DEFAULT 'INR',
  gst_rate TEXT DEFAULT '18',
  is_import_export_applicable TEXT DEFAULT 'no',
  iec_number TEXT,
  lut_number TEXT,
  session_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Create bank_details table if not exists (enhanced)
CREATE TABLE IF NOT EXISTS public.bank_details (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_number TEXT NOT NULL,
  ifsc_code TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  branch_name TEXT,
  account_holder_name TEXT,
  session_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Create business_assets table if not exists (enhanced)
CREATE TABLE IF NOT EXISTS public.business_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  asset_type TEXT NOT NULL, -- 'logo' or 'signature'
  asset_data TEXT NOT NULL, -- URL or base64 data
  file_name TEXT,
  mime_type TEXT,
  session_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Enable RLS
ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_assets ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for business_profiles
DROP POLICY IF EXISTS "Users can only see their own business profile" ON public.business_profiles;
CREATE POLICY "Users can only see their own business profile" 
  ON public.business_profiles 
  FOR ALL 
  USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

-- Create RLS policies for bank_details
DROP POLICY IF EXISTS "Users can only see their own bank details" ON public.bank_details;
CREATE POLICY "Users can only see their own bank details" 
  ON public.bank_details 
  FOR ALL 
  USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

-- Create RLS policies for business_assets
DROP POLICY IF EXISTS "Users can only see their own business assets" ON public.business_assets;
CREATE POLICY "Users can only see their own business assets" 
  ON public.business_assets 
  FOR ALL 
  USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc', now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS update_business_profiles_updated_at ON public.business_profiles;
CREATE TRIGGER update_business_profiles_updated_at
    BEFORE UPDATE ON public.business_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_bank_details_updated_at ON public.bank_details;
CREATE TRIGGER update_bank_details_updated_at
    BEFORE UPDATE ON public.bank_details
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_business_assets_updated_at ON public.business_assets;
CREATE TRIGGER update_business_assets_updated_at
    BEFORE UPDATE ON public.business_assets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
