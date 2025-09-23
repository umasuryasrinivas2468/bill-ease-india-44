# Execute This SQL in Your Supabase Dashboard

## Steps to Create License Table:

1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Copy and paste the SQL below:

```sql
-- Create license table for storing license keys
CREATE TABLE IF NOT EXISTS license (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    license_key VARCHAR(20) UNIQUE NOT NULL,
    plan_type VARCHAR(10) NOT NULL CHECK (plan_type IN ('starter', 'growth', 'scale')),
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    due_date TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create an index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_license_email ON license(email);

-- Create an index on license_key for faster lookups
CREATE INDEX IF NOT EXISTS idx_license_key ON license(license_key);

-- Add RLS (Row Level Security) policies if needed
ALTER TABLE license ENABLE ROW LEVEL SECURITY;

-- Allow public access for license generation (you can modify this as needed)
CREATE POLICY "Allow public read access" ON license
    FOR SELECT USING (true);

CREATE POLICY "Allow public insert access" ON license
    FOR INSERT WITH CHECK (true);
```

4. Click **Run** to execute the SQL
5. Your license table will be created and ready to use!

## Test Your License Pages:

After running the SQL, test your license generation at:

- **Starter Plan**: http://localhost:8080/starter.202512a
- **Growth Plan**: http://localhost:8080/growth.202514b  
- **Scale Plan**: http://localhost:8080/scale.202516c

## Features Implemented:

✅ **Centered License Generator** - Clean, simple form in the middle of the page  
✅ **One-Time Generation** - Users can only generate 1 license key per email  
✅ **Button Blocking** - Shows "Can't Generate New Key" after generation  
✅ **Alert Message** - Displays alert when trying to generate another key  
✅ **No Features/Sidebar** - Removed all plan features and sidebar navigation  
✅ **Custom URLs** - Updated to your specified URL patterns  
✅ **Plan-Specific Keys** - Starter (12), Growth (16), Scale (14) digit keys  
✅ **ACZ Prefix Format** - All keys start with ACZ + 5 alphabets + numbers