
-- Create apps table to store available apps
CREATE TABLE public.apps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon_url TEXT,
  category TEXT NOT NULL DEFAULT 'business',
  developer TEXT,
  version TEXT DEFAULT '1.0.0',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create user_apps table to track installed apps per user
CREATE TABLE public.user_apps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  app_id UUID REFERENCES public.apps(id) ON DELETE CASCADE,
  installed_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  is_active BOOLEAN DEFAULT true,
  UNIQUE(user_id, app_id)
);

-- Enable Row Level Security
ALTER TABLE public.apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_apps ENABLE ROW LEVEL SECURITY;

-- RLS policies for apps table (public read access)
CREATE POLICY "Apps are publicly readable" ON public.apps
  FOR SELECT USING (true);

-- RLS policies for user_apps table (users can only see their own installed apps)
CREATE POLICY "Users can view their own installed apps" ON public.user_apps
  FOR SELECT USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

CREATE POLICY "Users can install apps" ON public.user_apps
  FOR INSERT WITH CHECK (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

CREATE POLICY "Users can uninstall their apps" ON public.user_apps
  FOR DELETE USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

CREATE POLICY "Users can update their installed apps" ON public.user_apps
  FOR UPDATE USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

-- Enable realtime for real-time updates
ALTER TABLE public.apps REPLICA IDENTITY FULL;
ALTER TABLE public.user_apps REPLICA IDENTITY FULL;

-- Add tables to realtime publication
ALTER publication supabase_realtime ADD TABLE public.apps;
ALTER publication supabase_realtime ADD TABLE public.user_apps;

-- Create trigger to update updated_at timestamp
CREATE TRIGGER update_apps_updated_at
  BEFORE UPDATE ON public.apps
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
