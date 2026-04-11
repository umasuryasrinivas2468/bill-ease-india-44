-- Clean up orphaned user_apps data first
DELETE FROM user_apps WHERE app_id IS NOT NULL;

-- Create apps table for marketplace functionality
CREATE TABLE IF NOT EXISTS apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  icon_url TEXT,
  category TEXT NOT NULL,
  developer TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Add RLS policies for apps table (public read access since these are marketplace apps)
ALTER TABLE apps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active apps"
  ON apps FOR SELECT
  USING (is_active = true);

-- Add trigger for updated_at
CREATE TRIGGER update_apps_updated_at
  BEFORE UPDATE ON apps
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add foreign key constraint to user_apps table
ALTER TABLE user_apps
  ADD CONSTRAINT user_apps_app_id_fkey
  FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE;