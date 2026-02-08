
-- Fix user_id columns to use text instead of uuid to support Clerk user IDs

-- Update invoices table
ALTER TABLE invoices 
ALTER COLUMN user_id TYPE text;

-- Update clients table  
ALTER TABLE clients
ALTER COLUMN user_id TYPE text;

-- If you have other tables with user_id, update them too
-- Example for any other tables:
-- ALTER TABLE other_table_name
-- ALTER COLUMN user_id TYPE text;
