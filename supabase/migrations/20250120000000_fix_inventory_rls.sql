-- Fix inventory RLS policy to match other tables
DROP POLICY IF EXISTS "Users can only see their own inventory" ON inventory;

-- Create correct RLS policy for inventory using auth.uid()
CREATE POLICY "Users can only see their own inventory" ON inventory 
  FOR ALL USING (auth.uid() = user_id);

-- Also fix quotations RLS policy to match
DROP POLICY IF EXISTS "Users can only see their own quotations" ON quotations;

-- Create correct RLS policy for quotations using auth.uid()
CREATE POLICY "Users can only see their own quotations" ON quotations 
  FOR ALL USING (auth.uid() = user_id);