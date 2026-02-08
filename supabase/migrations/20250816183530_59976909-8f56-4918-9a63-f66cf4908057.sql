
-- Create credit_notes table
CREATE TABLE IF NOT EXISTS credit_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  credit_note_number TEXT NOT NULL,
  original_invoice_id UUID REFERENCES invoices(id),
  client_name TEXT NOT NULL,
  client_email TEXT,
  client_gst_number TEXT,
  client_address TEXT,
  amount DECIMAL(12,2) NOT NULL,
  gst_amount DECIMAL(12,2) NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  credit_note_date DATE NOT NULL,
  reason TEXT,
  items JSONB NOT NULL DEFAULT '[]',
  status TEXT DEFAULT 'issued' CHECK (status IN ('issued', 'applied', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create debit_notes table
CREATE TABLE IF NOT EXISTS debit_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  debit_note_number TEXT NOT NULL,
  original_invoice_id UUID REFERENCES invoices(id),
  vendor_name TEXT NOT NULL,
  vendor_email TEXT,
  vendor_gst_number TEXT,
  vendor_address TEXT,
  amount DECIMAL(12,2) NOT NULL,
  gst_amount DECIMAL(12,2) NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  debit_note_date DATE NOT NULL,
  reason TEXT,
  items JSONB NOT NULL DEFAULT '[]',
  status TEXT DEFAULT 'issued' CHECK (status IN ('issued', 'applied', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create vendors table for managing vendor information
CREATE TABLE IF NOT EXISTS vendors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  gst_number TEXT,
  address TEXT,
  payment_terms INTEGER DEFAULT 30,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create purchase_bills table for accounts payable
CREATE TABLE IF NOT EXISTS purchase_bills (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  vendor_id UUID REFERENCES vendors(id),
  bill_number TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  vendor_email TEXT,
  vendor_gst_number TEXT,
  vendor_address TEXT,
  amount DECIMAL(12,2) NOT NULL,
  gst_amount DECIMAL(12,2) NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  bill_date DATE NOT NULL,
  due_date DATE NOT NULL,
  items JSONB NOT NULL DEFAULT '[]',
  status TEXT DEFAULT 'pending' CHECK (status IN ('paid', 'pending', 'overdue', 'partially_paid')),
  paid_amount DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Add RLS policies for credit_notes
ALTER TABLE credit_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only see their own credit notes" ON credit_notes FOR ALL USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

-- Add RLS policies for debit_notes
ALTER TABLE debit_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only see their own debit notes" ON debit_notes FOR ALL USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

-- Add RLS policies for vendors
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only see their own vendors" ON vendors FOR ALL USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

-- Add RLS policies for purchase_bills
ALTER TABLE purchase_bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only see their own purchase bills" ON purchase_bills FOR ALL USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

-- Add triggers for updated_at columns
CREATE TRIGGER update_credit_notes_updated_at
    BEFORE UPDATE ON credit_notes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_debit_notes_updated_at
    BEFORE UPDATE ON debit_notes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vendors_updated_at
    BEFORE UPDATE ON vendors
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_purchase_bills_updated_at
    BEFORE UPDATE ON purchase_bills
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
