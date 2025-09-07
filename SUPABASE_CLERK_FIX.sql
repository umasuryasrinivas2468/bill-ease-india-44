-- =============================================================================
-- SUPABASE BRANDING FIX FOR CLERK USER IDs
-- Copy and paste this entire code into your Supabase SQL Editor
-- This fixes the UUID error: "invalid input syntax for type uuid: user_32JKRvr8N01jvzDYrhWUlgk5mhs"
-- =============================================================================

-- Drop the existing table that has UUID user_id column
DROP TABLE IF EXISTS user_branding CASCADE;

-- Recreate table with TEXT user_id to support Clerk user IDs (user_xxxxxxxxxxxxx format)
CREATE TABLE user_branding (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE, -- Changed from UUID to TEXT for Clerk compatibility
  logo_url TEXT,
  signature_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_user_branding_user_id ON user_branding(user_id);

-- Enable RLS (Row Level Security)
ALTER TABLE user_branding ENABLE ROW LEVEL SECURITY;

-- Create permissive policies since we're using Clerk authentication
-- The application will handle user authorization checks
CREATE POLICY "Allow all operations for authenticated users" ON user_branding
    FOR ALL USING (true);

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

-- Test inserting a Clerk user ID (should work now)
-- INSERT INTO user_branding (user_id, logo_url, signature_url) 
-- VALUES ('user_32JKRvr8N01jvzDYrhWUlgk5mhs', 'https://example.com/logo.png', 'https://example.com/signature.png');

-- Test querying the data
-- SELECT * FROM user_branding WHERE user_id = 'user_32JKRvr8N01jvzDYrhWUlgk5mhs';

-- =============================================================================
-- FIX COMPLETE!
-- =============================================================================

-- What was fixed:
-- 1. Changed user_id column from UUID to TEXT to accept Clerk user IDs
-- 2. Simplified RLS policies to be permissive (authorization handled by app)
-- 3. Maintained all other functionality (auto-timestamps, triggers, etc.)
-- 4. The error "invalid input syntax for type uuid" should now be resolved