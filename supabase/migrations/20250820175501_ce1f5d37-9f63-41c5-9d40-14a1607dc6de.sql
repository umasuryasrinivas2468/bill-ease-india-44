
-- TEMP fix: allow creating invoices without a Clerk JWT (anon role)
-- This permits inserting invoices as long as a plausible Clerk user_id is provided.
CREATE POLICY "Allow anon to insert invoices (temp)"
  ON public.invoices
  FOR INSERT
  TO anon
  WITH CHECK (user_id LIKE 'user_%');

-- TEMP fix: allow updating inventory stock without a Clerk JWT (anon role)
-- This permits updating inventory rows where user_id looks like a Clerk id pattern.
CREATE POLICY "Allow anon to update inventory stock (temp)"
  ON public.inventory
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (user_id LIKE 'user_%');
