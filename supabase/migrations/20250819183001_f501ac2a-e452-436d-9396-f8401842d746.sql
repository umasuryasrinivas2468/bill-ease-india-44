
-- Add product_id column to items in invoices table to store inventory product references
-- This will allow invoices to track which inventory items were used
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS items_product_mapping jsonb DEFAULT '[]'::jsonb;

-- Add a comment to explain the new column
COMMENT ON COLUMN invoices.items_product_mapping IS 'Stores mapping of invoice items to inventory product IDs';
