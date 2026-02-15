# TDS (Tax Deducted at Source) Setup Guide

## ✅ **Backend NOT Required**
The TDS functionality is implemented entirely in the frontend using Supabase directly. No backend server needed!

## 🗄️ **Database Setup** (Run this in Supabase)

### Step 1: Go to your Supabase Project
1. Open https://supabase.com/dashboard
2. Select your project
3. Go to SQL Editor

### Step 2: Run the Simple Setup SQL
Copy and paste this SQL code in the SQL Editor:

```sql
-- Simple TDS Tables Setup
CREATE TABLE IF NOT EXISTS tds_rules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    category TEXT NOT NULL,
    rate_percentage DECIMAL(5,2) NOT NULL CHECK (rate_percentage >= 0 AND rate_percentage <= 100),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tds_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    client_id UUID,
    invoice_id UUID,
    tds_rule_id UUID,
    transaction_amount DECIMAL(15,2) NOT NULL,
    tds_rate DECIMAL(5,2) NOT NULL,
    tds_amount DECIMAL(15,2) NOT NULL,
    net_payable DECIMAL(15,2) NOT NULL,
    transaction_date DATE NOT NULL,
    vendor_name TEXT NOT NULL,
    vendor_pan TEXT,
    description TEXT,
    certificate_number TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tds_rules_user_id ON tds_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_tds_transactions_user_id ON tds_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_tds_transactions_date ON tds_transactions(transaction_date);

-- Enable Row Level Security
ALTER TABLE tds_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE tds_transactions ENABLE ROW LEVEL SECURITY;

-- Simple RLS policies
CREATE POLICY "Enable read access for authenticated users" ON tds_rules FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Enable insert for authenticated users" ON tds_rules FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable update for authenticated users" ON tds_rules FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable read access for authenticated users" ON tds_transactions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Enable insert for authenticated users" ON tds_transactions FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable update for authenticated users" ON tds_transactions FOR UPDATE USING (auth.role() = 'authenticated');

-- Insert default TDS categories for Indian compliance
INSERT INTO tds_rules (user_id, category, rate_percentage, description) 
SELECT 
    users.id as user_id,
    category,
    rate_percentage,
    description
FROM users,
(VALUES 
    ('Professional Fees', 10.00, 'TDS on Professional or Technical Services - Section 194J'),
    ('Contractor Payments', 2.00, 'TDS on Contractor Payments - Section 194C'),
    ('Rent Payments', 10.00, 'TDS on Rent - Section 194I'),
    ('Commission and Brokerage', 5.00, 'TDS on Commission and Brokerage - Section 194H'),
    ('Interest Payments', 10.00, 'TDS on Interest other than Interest on Securities - Section 194A'),
    ('Freight and Transport', 1.00, 'TDS on Freight and Transport - Section 194C'),
    ('Advertising', 2.00, 'TDS on Advertisement - Section 194C'),
    ('Other Services', 2.00, 'TDS on Other Services - Section 194J')
) AS default_rules(category, rate_percentage, description)
WHERE NOT EXISTS (
    SELECT 1 FROM tds_rules 
    WHERE tds_rules.user_id = users.id 
    AND tds_rules.category = default_rules.category
)
ON CONFLICT DO NOTHING;
```

## 🎯 **Features Implemented**

### ✅ TDS Setup & Management
- **TDS Rules Configuration**: Set TDS rates for different payment categories
- **Default Indian TDS Categories**: Pre-loaded with common TDS sections
- **Category Management**: Add, edit, and manage TDS categories
- **Rate Validation**: Ensures rates are between 0-100%

### ✅ TDS Calculation Engine
- **Auto-calculation**: TDS Amount = Transaction Amount × TDS Rate%
- **Net Payable**: Net Payable = Transaction Amount - TDS Amount
- **Real-time Updates**: Instant calculation as you type

### ✅ Transaction Management
- **Record TDS Transactions**: Complete transaction details
- **Vendor Information**: Store vendor names, PAN numbers
- **Certificate Tracking**: TDS certificate number management
- **Client Linking**: Optional linking to existing clients

### ✅ Comprehensive Reports
- **TDS Summary Reports**: Total TDS deducted, net payable amounts
- **Detailed Transaction History**: All TDS transactions with filters
- **Period-wise Reports**: Monthly, quarterly, yearly breakdowns
- **Category-wise Analysis**: TDS breakdown by payment categories
- **Export Options**: CSV/Excel export for government filing

### ✅ Compliance Features
- **Indian TDS Sections**: Based on Income Tax Act sections
- **Date Range Filtering**: Filter by custom date ranges
- **Certificate Management**: Track TDS certificates issued
- **PAN Recording**: Store vendor PAN information

## 🚀 **How to Use**

### 1. Access TDS Management
- Navigate to **CA Tools & Accounting** → **TDS Management** in the sidebar

### 2. Setup TDS Rules
- Go to **TDS Setup** tab
- Default Indian TDS categories are pre-loaded
- Add custom categories with specific rates
- Edit existing rates as needed

### 3. Record TDS Transactions
- Click **Record New Transaction** button
- Fill in transaction details:
  - Vendor name and PAN
  - Transaction amount
  - Select TDS category (auto-fills rate)
  - Transaction date
  - Optional: Certificate number, description

### 4. View Reports
- Go to **Reports** tab
- Filter by date range, period, or category
- View summary and detailed transaction lists
- Export data for filing

### 5. Generate Government Reports
- Use the export feature to download CSV/Excel files
- Data is formatted for easy government filing
- Includes all required fields for TDS returns

## 📊 **TDS Categories Pre-loaded**

| Category | Rate | Section | Description |
|----------|------|---------|-------------|
| Professional Fees | 10% | 194J | Technical/Professional Services |
| Contractor Payments | 2% | 194C | Contract Work |
| Rent Payments | 10% | 194I | Property Rent |
| Commission & Brokerage | 5% | 194H | Commission Payments |
| Interest Payments | 10% | 194A | Interest (non-securities) |
| Freight & Transport | 1% | 194C | Transportation Services |
| Advertising | 2% | 194C | Advertisement Expenses |
| Other Services | 2% | 194J | Other Professional Services |

## 🔧 **Technical Details**

- **Database**: Supabase PostgreSQL
- **Frontend Integration**: Direct Supabase client calls
- **Security**: Row Level Security (RLS) enabled
- **Real-time Updates**: React Query for data management
- **Type Safety**: Full TypeScript implementation
- **Validation**: Client and server-side validation

## 🎉 **Ready to Use!**

Once you run the SQL setup in Supabase, your TDS management system is fully functional!

The system is designed for Indian tax compliance and includes all common TDS scenarios businesses encounter.