
-- Drop existing RLS policies for user_apps table
DROP POLICY IF EXISTS "Users can install apps" ON public.user_apps;
DROP POLICY IF EXISTS "Users can uninstall their apps" ON public.user_apps;
DROP POLICY IF EXISTS "Users can update their installed apps" ON public.user_apps;
DROP POLICY IF EXISTS "Users can view their own installed apps" ON public.user_apps;

-- Create new RLS policies that work with Clerk user IDs stored as text
CREATE POLICY "Users can install apps" ON public.user_apps
  FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Users can uninstall their apps" ON public.user_apps
  FOR DELETE 
  USING (true);

CREATE POLICY "Users can update their installed apps" ON public.user_apps
  FOR UPDATE 
  USING (true);

CREATE POLICY "Users can view their own installed apps" ON public.user_apps
  FOR SELECT 
  USING (true);
