-- Create delivery_challans table
CREATE TABLE IF NOT EXISTS public.delivery_challans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  challan_number TEXT NOT NULL,
  challan_date DATE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  customer_gst_number TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  delivery_status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  CONSTRAINT delivery_challans_user_id_challan_number_key UNIQUE(user_id, challan_number)
);

-- Enable RLS
ALTER TABLE public.delivery_challans ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can select their own delivery challans"
  ON public.delivery_challans FOR SELECT
  USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

CREATE POLICY "Users can insert their own delivery challans"
  ON public.delivery_challans FOR INSERT
  WITH CHECK (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

CREATE POLICY "Users can update their own delivery challans"
  ON public.delivery_challans FOR UPDATE
  USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))
  WITH CHECK (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

CREATE POLICY "Users can delete their own delivery challans"
  ON public.delivery_challans FOR DELETE
  USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

-- Create updated_at trigger
CREATE TRIGGER update_delivery_challans_updated_at
  BEFORE UPDATE ON public.delivery_challans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();