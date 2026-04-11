
-- Add items_with_product_id column to invoices table for proper inventory linking
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS items_with_product_id jsonb DEFAULT '[]'::jsonb;

-- Update existing invoices to migrate data if needed
UPDATE invoices 
SET items_with_product_id = (
  SELECT jsonb_agg(
    item || jsonb_build_object('product_id', null)
  )
  FROM jsonb_array_elements(items) AS item
)
WHERE items_with_product_id = '[]'::jsonb AND items != '[]'::jsonb;

-- Update quotations status enum to include the new statuses
ALTER TABLE quotations 
DROP CONSTRAINT IF EXISTS quotations_status_check;

ALTER TABLE quotations 
ADD CONSTRAINT quotations_status_check 
CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'hold', 'expired'));

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_invoices_items_product_id ON invoices USING GIN ((items_with_product_id));
CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations (status);
CREATE INDEX IF NOT EXISTS idx_quotations_user_status ON quotations (user_id, status);
