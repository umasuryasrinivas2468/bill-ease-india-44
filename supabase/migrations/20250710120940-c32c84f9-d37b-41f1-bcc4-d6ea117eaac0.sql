
-- Add RLS policy to allow updating apps (for demo purposes, allowing all authenticated users)
-- In a production environment, you'd want more restrictive policies
CREATE POLICY "Allow updating apps for authenticated users" ON public.apps
  FOR UPDATE 
  USING (true)
  WITH CHECK (true);

-- Add RLS policy to allow inserting apps (for demo purposes, allowing all authenticated users)  
-- In a production environment, you'd want more restrictive policies
CREATE POLICY "Allow inserting apps for authenticated users" ON public.apps
  FOR INSERT 
  WITH CHECK (true);
