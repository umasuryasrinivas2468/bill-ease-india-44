
-- Create quotations table
CREATE TABLE IF NOT EXISTS quotations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  quotation_number TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_email TEXT,
  client_phone TEXT,
  client_address TEXT,
  quotation_date DATE NOT NULL,
  validity_period INTEGER NOT NULL DEFAULT 30, -- days
  items JSONB NOT NULL DEFAULT '[]',
  discount DECIMAL(10,2) DEFAULT 0,
  subtotal DECIMAL(12,2) NOT NULL,
  tax_amount DECIMAL(12,2) NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  terms_conditions TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE(user_id, quotation_number)
);

-- Create inventory table
CREATE TABLE IF NOT EXISTS inventory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  sku TEXT NOT NULL,
  category TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('goods', 'services')),
  purchase_price DECIMAL(10,2),
  selling_price DECIMAL(10,2) NOT NULL,
  stock_quantity INTEGER DEFAULT 0,
  reorder_level INTEGER DEFAULT 10,
  supplier_name TEXT,
  supplier_contact TEXT,
  supplier_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE(user_id, sku)
);

-- Create time_tracking table
CREATE TABLE IF NOT EXISTS time_tracking (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_name TEXT NOT NULL,
  client_name TEXT,
  task_description TEXT,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE,
  duration_minutes INTEGER,
  hourly_rate DECIMAL(10,2),
  total_amount DECIMAL(10,2),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Add additional fields to existing bank_details table
ALTER TABLE bank_details 
ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS bank_address TEXT,
ADD COLUMN IF NOT EXISTS swift_code TEXT,
ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'savings' CHECK (account_type IN ('savings', 'current', 'overdraft'));

-- Enable Row Level Security
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_tracking ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for quotations
CREATE POLICY "Users can only see their own quotations" ON quotations FOR ALL USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Create RLS policies for inventory
CREATE POLICY "Users can only see their own inventory" ON inventory FOR ALL USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Create RLS policies for time_tracking
CREATE POLICY "Users can only see their own time tracking" ON time_tracking FOR ALL USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_quotations_user_id ON quotations(user_id);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status);
CREATE INDEX IF NOT EXISTS idx_inventory_user_id ON inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_inventory_type ON inventory(type);
CREATE INDEX IF NOT EXISTS idx_time_tracking_user_id ON time_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_time_tracking_status ON time_tracking(status);

-- Create triggers for updated_at timestamps
CREATE TRIGGER update_quotations_updated_at BEFORE UPDATE ON quotations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inventory_updated_at BEFORE UPDATE ON inventory
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_time_tracking_updated_at BEFORE UPDATE ON time_tracking
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
