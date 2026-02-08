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

-- Create policy to allow users to only see and modify their own data
CREATE POLICY "Users can view their own branding" ON user_branding
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own branding" ON user_branding
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own branding" ON user_branding
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own branding" ON user_branding
    FOR DELETE USING (auth.uid() = user_id);

-- Create function to update the updated_at column
CREATE OR REPLACE FUNCTION update_user_branding_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_user_branding_updated_at
    BEFORE UPDATE ON user_branding
    FOR EACH ROW
    EXECUTE FUNCTION update_user_branding_updated_at();