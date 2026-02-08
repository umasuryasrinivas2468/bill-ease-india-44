-- Create Sales Orders, Purchase Orders, Receivables, and Payables system

-- Create vendors table for Purchase Orders
CREATE TABLE IF NOT EXISTS vendors (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    vendor_name TEXT NOT NULL,
    vendor_email TEXT,
    vendor_phone TEXT,
    vendor_gst TEXT,
    vendor_address TEXT,
    contact_person TEXT,
    payment_terms INTEGER DEFAULT 30, -- days
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(user_id, vendor_name)
);

-- Create sales_orders table
CREATE TABLE IF NOT EXISTS sales_orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    order_number TEXT NOT NULL,
    client_name TEXT NOT NULL,
    client_email TEXT,
    client_phone TEXT,
    client_gst TEXT,
    client_address TEXT,
    order_date DATE NOT NULL,
    due_date DATE NOT NULL,
    items JSONB NOT NULL DEFAULT '[]',
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount DECIMAL(10,2) DEFAULT 0,
    tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')),
    payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('paid', 'unpaid', 'partial')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(user_id, order_number)
);

-- Create purchase_orders table
CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    order_number TEXT NOT NULL,
    vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
    vendor_name TEXT NOT NULL,
    vendor_email TEXT,
    vendor_phone TEXT,
    vendor_gst TEXT,
    vendor_address TEXT,
    order_date DATE NOT NULL,
    due_date DATE NOT NULL,
    items JSONB NOT NULL DEFAULT '[]',
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount DECIMAL(10,2) DEFAULT 0,
    tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'received', 'cancelled')),
    payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('paid', 'unpaid', 'partial')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(user_id, order_number)
);

-- Create receivables table (tracks what customers owe us)
CREATE TABLE IF NOT EXISTS receivables (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT,
    customer_phone TEXT,
    related_sales_order_id UUID REFERENCES sales_orders(id) ON DELETE SET NULL,
    related_sales_order_number TEXT,
    invoice_number TEXT,
    amount_due DECIMAL(12,2) NOT NULL,
    amount_paid DECIMAL(12,2) DEFAULT 0,
    amount_remaining DECIMAL(12,2) NOT NULL,
    due_date DATE NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'overdue', 'paid', 'partial')),
    payment_date DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create payables table (tracks what we owe vendors)
CREATE TABLE IF NOT EXISTS payables (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    vendor_name TEXT NOT NULL,
    vendor_email TEXT,
    vendor_phone TEXT,
    related_purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
    related_purchase_order_number TEXT,
    bill_number TEXT,
    amount_due DECIMAL(12,2) NOT NULL,
    amount_paid DECIMAL(12,2) DEFAULT 0,
    amount_remaining DECIMAL(12,2) NOT NULL,
    due_date DATE NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'overdue', 'paid', 'partial')),
    payment_date DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable Row Level Security
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE receivables ENABLE ROW LEVEL SECURITY;
ALTER TABLE payables ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can only see their own vendors" ON vendors 
FOR ALL USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

CREATE POLICY "Users can only see their own sales_orders" ON sales_orders 
FOR ALL USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

CREATE POLICY "Users can only see their own purchase_orders" ON purchase_orders 
FOR ALL USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

CREATE POLICY "Users can only see their own receivables" ON receivables 
FOR ALL USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

CREATE POLICY "Users can only see their own payables" ON payables 
FOR ALL USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_vendors_user_id ON vendors(user_id);
CREATE INDEX IF NOT EXISTS idx_vendors_status ON vendors(status);

CREATE INDEX IF NOT EXISTS idx_sales_orders_user_id ON sales_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_status ON sales_orders(status);
CREATE INDEX IF NOT EXISTS idx_sales_orders_payment_status ON sales_orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_sales_orders_date ON sales_orders(order_date);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_user_id ON purchase_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_payment_status ON purchase_orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_date ON purchase_orders(order_date);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor_id ON purchase_orders(vendor_id);

CREATE INDEX IF NOT EXISTS idx_receivables_user_id ON receivables(user_id);
CREATE INDEX IF NOT EXISTS idx_receivables_status ON receivables(status);
CREATE INDEX IF NOT EXISTS idx_receivables_due_date ON receivables(due_date);
CREATE INDEX IF NOT EXISTS idx_receivables_sales_order_id ON receivables(related_sales_order_id);

CREATE INDEX IF NOT EXISTS idx_payables_user_id ON payables(user_id);
CREATE INDEX IF NOT EXISTS idx_payables_status ON payables(status);
CREATE INDEX IF NOT EXISTS idx_payables_due_date ON payables(due_date);
CREATE INDEX IF NOT EXISTS idx_payables_purchase_order_id ON payables(related_purchase_order_id);

-- Create triggers for updated_at timestamps
CREATE TRIGGER update_vendors_updated_at BEFORE UPDATE ON vendors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sales_orders_updated_at BEFORE UPDATE ON sales_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_purchase_orders_updated_at BEFORE UPDATE ON purchase_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_receivables_updated_at BEFORE UPDATE ON receivables
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payables_updated_at BEFORE UPDATE ON payables
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create functions to automatically update receivables/payables when orders are created/updated

-- Function to create receivable when sales order is confirmed
CREATE OR REPLACE FUNCTION create_receivable_from_sales_order()
RETURNS TRIGGER AS $$
BEGIN
    -- Only create receivable if status is confirmed and payment_status is not paid
    IF NEW.status = 'confirmed' AND NEW.payment_status != 'paid' THEN
        INSERT INTO receivables (
            user_id,
            customer_name,
            customer_email,
            customer_phone,
            related_sales_order_id,
            related_sales_order_number,
            amount_due,
            amount_remaining,
            due_date,
            status
        ) VALUES (
            NEW.user_id,
            NEW.client_name,
            NEW.client_email,
            NEW.client_phone,
            NEW.id,
            NEW.order_number,
            NEW.total_amount,
            NEW.total_amount,
            NEW.due_date,
            CASE 
                WHEN NEW.due_date < CURRENT_DATE THEN 'overdue'
                ELSE 'pending'
            END
        )
        ON CONFLICT DO NOTHING;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to create payable when purchase order is confirmed
CREATE OR REPLACE FUNCTION create_payable_from_purchase_order()
RETURNS TRIGGER AS $$
BEGIN
    -- Only create payable if status is confirmed and payment_status is not paid
    IF NEW.status = 'confirmed' AND NEW.payment_status != 'paid' THEN
        INSERT INTO payables (
            user_id,
            vendor_name,
            vendor_email,
            vendor_phone,
            related_purchase_order_id,
            related_purchase_order_number,
            amount_due,
            amount_remaining,
            due_date,
            status
        ) VALUES (
            NEW.user_id,
            NEW.vendor_name,
            NEW.vendor_email,
            NEW.vendor_phone,
            NEW.id,
            NEW.order_number,
            NEW.total_amount,
            NEW.total_amount,
            NEW.due_date,
            CASE 
                WHEN NEW.due_date < CURRENT_DATE THEN 'overdue'
                ELSE 'pending'
            END
        )
        ON CONFLICT DO NOTHING;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE TRIGGER create_receivable_trigger
    AFTER INSERT OR UPDATE ON sales_orders
    FOR EACH ROW EXECUTE FUNCTION create_receivable_from_sales_order();

CREATE TRIGGER create_payable_trigger
    AFTER INSERT OR UPDATE ON purchase_orders
    FOR EACH ROW EXECUTE FUNCTION create_payable_from_purchase_order();