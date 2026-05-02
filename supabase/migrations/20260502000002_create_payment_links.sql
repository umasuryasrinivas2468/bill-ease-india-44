-- Create payment_links table
CREATE TABLE IF NOT EXISTS payment_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  razorpay_link_id TEXT UNIQUE,
  user_id TEXT NOT NULL,
  vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  vendor_name TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  amount_paid DECIMAL(12,2) DEFAULT 0,
  description TEXT,
  url TEXT NOT NULL,
  status TEXT DEFAULT 'created',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable Row Level Security
ALTER TABLE payment_links ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for payment_links
CREATE POLICY "Users can only manage their own payment links" ON payment_links
  FOR ALL USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_payment_links_user_id ON payment_links(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_vendor_id ON payment_links(vendor_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_status ON payment_links(status);

-- Add triggers for updated_at columns
CREATE TRIGGER update_payment_links_updated_at
    BEFORE UPDATE ON payment_links
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
