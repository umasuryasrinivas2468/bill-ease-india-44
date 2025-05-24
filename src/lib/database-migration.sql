
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create clients table
CREATE TABLE IF NOT EXISTS clients (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  gst_number TEXT,
  address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT NOT NULL,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_email TEXT,
  client_gst_number TEXT,
  client_address TEXT,
  amount DECIMAL(12,2) NOT NULL,
  gst_amount DECIMAL(12,2) NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('paid', 'pending', 'overdue')),
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  items JSONB NOT NULL DEFAULT '[]',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create reports table for tracking monthly GST data
CREATE TABLE IF NOT EXISTS reports (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  total_sales DECIMAL(12,2) DEFAULT 0,
  total_gst DECIMAL(12,2) DEFAULT 0,
  cgst DECIMAL(12,2) DEFAULT 0,
  sgst DECIMAL(12,2) DEFAULT 0,
  igst DECIMAL(12,2) DEFAULT 0,
  b2b_sales DECIMAL(12,2) DEFAULT 0,
  b2c_sales DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE(user_id, month, year)
);

-- Create processed_documents table for CA tools
CREATE TABLE IF NOT EXISTS processed_documents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  original_file_url TEXT,
  processed_file_url TEXT,
  status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'error')),
  records_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable Row Level Security
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_documents ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can only see their own clients" ON clients;
DROP POLICY IF EXISTS "Users can only see their own invoices" ON invoices;
DROP POLICY IF EXISTS "Users can only see their own reports" ON reports;
DROP POLICY IF EXISTS "Users can only see their own documents" ON processed_documents;

-- Create RLS policies for TEXT user_id columns
CREATE POLICY "Users can only see their own clients" ON clients 
  FOR ALL USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

CREATE POLICY "Users can only see their own invoices" ON invoices 
  FOR ALL USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

CREATE POLICY "Users can only see their own reports" ON reports 
  FOR ALL USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

CREATE POLICY "Users can only see their own documents" ON processed_documents 
  FOR ALL USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');
