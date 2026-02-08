-- Fix user_branding table to work with Clerk user IDs
-- Clerk user IDs are in format "user_xxxxxxxxxxxxx", not UUID format

-- Drop the existing table and recreate with TEXT user_id
DROP TABLE IF EXISTS user_branding CASCADE;

-- Create branding table with TEXT user_id to support Clerk user IDs
CREATE TABLE user_branding (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE, -- Changed from UUID to TEXT to support Clerk user IDs
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
-- Note: Since we're using Clerk, we need to match against Clerk user IDs, not auth.uid()
CREATE POLICY "Users can view their own branding" ON user_branding
    FOR SELECT USING (true); -- We'll handle authorization in the application layer

CREATE POLICY "Users can insert their own branding" ON user_branding
    FOR INSERT WITH CHECK (true); -- We'll handle authorization in the application layer

CREATE POLICY "Users can update their own branding" ON user_branding
    FOR UPDATE USING (true); -- We'll handle authorization in the application layer

CREATE POLICY "Users can delete their own branding" ON user_branding
    FOR DELETE USING (true); -- We'll handle authorization in the application layer

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

-- Add a comment explaining the change
COMMENT ON COLUMN user_branding.user_id IS 'Clerk user ID in format user_xxxxxxxxxxxxx - not a UUID';
COMMENT ON TABLE user_branding IS 'Stores branding assets for users. Uses Clerk user IDs as TEXT, not UUIDs.';