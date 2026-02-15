
-- Drop the existing invoices table and create a new one with better structure
DROP TABLE IF EXISTS public.invoices CASCADE;

-- Create new invoices table with proper structure
CREATE TABLE public.invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  invoice_number text NOT NULL,
  client_name text NOT NULL,
  client_email text,
  client_gst_number text,
  client_address text,
  amount numeric NOT NULL DEFAULT 0,
  gst_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  advance numeric DEFAULT 0,
  discount numeric DEFAULT 0,
  roundoff numeric DEFAULT 0,
  gst_rate numeric DEFAULT 18.00,
  from_email text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
  invoice_date date NOT NULL,
  due_date date NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  items_with_product_id jsonb DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamp with time zone DEFAULT timezone('utc', now()),
  updated_at timestamp with time zone DEFAULT timezone('utc', now())
);

-- Enable RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own invoices"
  ON public.invoices
  FOR SELECT
  USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

CREATE POLICY "Users can insert their own invoices"
  ON public.invoices
  FOR INSERT
  WITH CHECK (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

CREATE POLICY "Users can update their own invoices"
  ON public.invoices
  FOR UPDATE
  USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))
  WITH CHECK (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

CREATE POLICY "Users can delete their own invoices"
  ON public.invoices
  FOR DELETE
  USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

-- Temporary policy for anon users (for development)
CREATE POLICY "Allow anon to insert invoices (temp)"
  ON public.invoices
  FOR INSERT
  TO anon
  WITH CHECK (user_id LIKE 'user_%');

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc', now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_invoices_updated_at
    BEFORE UPDATE ON public.invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create index for better performance
CREATE INDEX idx_invoices_user_id ON public.invoices(user_id);
CREATE INDEX idx_invoices_status ON public.invoices(status);
CREATE INDEX idx_invoices_invoice_date ON public.invoices(invoice_date);
