
-- Create UPI Collections table
CREATE TABLE IF NOT EXISTS upi_collections (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  reference_id TEXT NOT NULL UNIQUE,
  payer_upi TEXT NOT NULL,
  payee_account TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  purpose_message TEXT NOT NULL,
  expiry_time TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'expired')),
  decentro_txn_id TEXT,
  transaction_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable Row Level Security
ALTER TABLE upi_collections ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for UPI collections
CREATE POLICY "Users can only see their own UPI collections" ON upi_collections
  FOR ALL USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_upi_collections_user_id ON upi_collections(user_id);
CREATE INDEX IF NOT EXISTS idx_upi_collections_invoice_id ON upi_collections(invoice_id);
CREATE INDEX IF NOT EXISTS idx_upi_collections_reference_id ON upi_collections(reference_id);
CREATE INDEX IF NOT EXISTS idx_upi_collections_status ON upi_collections(status);
CREATE INDEX IF NOT EXISTS idx_upi_collections_expiry_time ON upi_collections(expiry_time);

-- Create trigger for updated_at
CREATE TRIGGER update_upi_collections_updated_at BEFORE UPDATE ON upi_collections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically expire old UPI requests
CREATE OR REPLACE FUNCTION expire_old_upi_requests()
RETURNS void AS $$
BEGIN
    UPDATE upi_collections 
    SET status = 'expired', updated_at = TIMEZONE('utc', NOW())
    WHERE status = 'pending' 
    AND expiry_time < TIMEZONE('utc', NOW());
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job to run the expiration function (if pg_cron is available)
-- SELECT cron.schedule('expire-upi-requests', '*/5 * * * *', 'SELECT expire_old_upi_requests();');
