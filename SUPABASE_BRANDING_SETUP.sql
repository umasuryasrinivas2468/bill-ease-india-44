-- =============================================================================
-- SUPABASE BRANDING ASSETS SETUP
-- Copy and paste this entire code into your Supabase SQL Editor
-- =============================================================================

-- Drop old business_assets table if it exists (cleanup from previous system)
DROP TABLE IF EXISTS public.business_assets CASCADE;

-- Create simple branding table for logo and signature URLs
CREATE TABLE IF NOT EXISTS user_branding (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  logo_url TEXT,
  signature_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_user_branding_user_id ON user_branding(user_id);

-- Enable RLS (Row Level Security)
ALTER TABLE user_branding ENABLE ROW LEVEL SECURITY;

-- Create policies to allow users to only see and modify their own data
CREATE POLICY "Users can view their own branding" ON user_branding
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own branding" ON user_branding
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own branding" ON user_branding
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own branding" ON user_branding
    FOR DELETE USING (auth.uid() = user_id);

-- Create function to update the updated_at column automatically
CREATE OR REPLACE FUNCTION update_user_branding_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at column
CREATE TRIGGER update_user_branding_updated_at
    BEFORE UPDATE ON user_branding
    FOR EACH ROW
    EXECUTE FUNCTION update_user_branding_updated_at();

-- =============================================================================
-- VERIFICATION QUERIES (Optional - Run these to test)
-- =============================================================================

-- Check if table was created successfully
-- SELECT * FROM user_branding LIMIT 5;

-- Check if policies are working (should show no results for other users)
-- SELECT * FROM user_branding WHERE user_id != auth.uid();

-- =============================================================================
-- SETUP COMPLETE!
-- =============================================================================

-- The table is now ready to store:
-- 1. Logo URLs from onboarding and settings
-- 2. Signature URLs from onboarding and settings  
-- 3. User can only access their own branding data
-- 4. Automatic timestamps for created_at and updated_at
-- 5. Full CRUD operations with proper security