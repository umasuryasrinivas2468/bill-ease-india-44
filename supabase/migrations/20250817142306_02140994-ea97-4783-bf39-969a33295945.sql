
-- First, let's ensure RLS is enabled and create proper policies for the tables that need them

-- Enable RLS on tables that might not have it
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for invoices
DROP POLICY IF EXISTS "Users can select their own invoices" ON public.invoices;
DROP POLICY IF EXISTS "Users can insert their own invoices" ON public.invoices;
DROP POLICY IF EXISTS "Users can update their own invoices" ON public.invoices;
DROP POLICY IF EXISTS "Users can delete their own invoices" ON public.invoices;

CREATE POLICY "Users can select their own invoices" ON public.invoices
FOR SELECT USING (user_id = ((current_setting('request.jwt.claims', true))::json->>'sub'));

CREATE POLICY "Users can insert their own invoices" ON public.invoices
FOR INSERT WITH CHECK (user_id = ((current_setting('request.jwt.claims', true))::json->>'sub'));

CREATE POLICY "Users can update their own invoices" ON public.invoices
FOR UPDATE USING (user_id = ((current_setting('request.jwt.claims', true))::json->>'sub'))
WITH CHECK (user_id = ((current_setting('request.jwt.claims', true))::json->>'sub'));

CREATE POLICY "Users can delete their own invoices" ON public.invoices
FOR DELETE USING (user_id = ((current_setting('request.jwt.claims', true))::json->>'sub'));

-- Ensure credit_notes and debit_notes have proper policies (they should already exist but let's verify)
-- Update existing policies to use the correct Clerk auth format

DROP POLICY IF EXISTS "Users can select their own credit notes" ON public.credit_notes;
DROP POLICY IF EXISTS "Users can insert their own credit notes" ON public.credit_notes;
DROP POLICY IF EXISTS "Users can update their own credit notes" ON public.credit_notes;
DROP POLICY IF EXISTS "Users can delete their own credit notes" ON public.credit_notes;

CREATE POLICY "Users can select their own credit notes" ON public.credit_notes
FOR SELECT USING (user_id = ((current_setting('request.jwt.claims', true))::json->>'sub'));

CREATE POLICY "Users can insert their own credit notes" ON public.credit_notes
FOR INSERT WITH CHECK (user_id = ((current_setting('request.jwt.claims', true))::json->>'sub'));

CREATE POLICY "Users can update their own credit notes" ON public.credit_notes
FOR UPDATE USING (user_id = ((current_setting('request.jwt.claims', true))::json->>'sub'))
WITH CHECK (user_id = ((current_setting('request.jwt.claims', true))::json->>'sub'));

CREATE POLICY "Users can delete their own credit notes" ON public.credit_notes
FOR DELETE USING (user_id = ((current_setting('request.jwt.claims', true))::json->>'sub'));

DROP POLICY IF EXISTS "Users can select their own debit notes" ON public.debit_notes;
DROP POLICY IF EXISTS "Users can insert their own debit notes" ON public.debit_notes;
DROP POLICY IF EXISTS "Users can update their own debit notes" ON public.debit_notes;
DROP POLICY IF EXISTS "Users can delete their own debit notes" ON public.debit_notes;

CREATE POLICY "Users can select their own debit notes" ON public.debit_notes
FOR SELECT USING (user_id = ((current_setting('request.jwt.claims', true))::json->>'sub'));

CREATE POLICY "Users can insert their own debit notes" ON public.debit_notes
FOR INSERT WITH CHECK (user_id = ((current_setting('request.jwt.claims', true))::json->>'sub'));

CREATE POLICY "Users can update their own debit notes" ON public.debit_notes
FOR UPDATE USING (user_id = ((current_setting('request.jwt.claims', true))::json->>'sub'))
WITH CHECK (user_id = ((current_setting('request.jwt.claims', true))::json->>'sub'));

CREATE POLICY "Users can delete their own debit notes" ON public.debit_notes
FOR DELETE USING (user_id = ((current_setting('request.jwt.claims', true))::json->>'sub'));
