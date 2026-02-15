
-- Add product_id column to quotation items and update the items structure
-- This will allow proper linking between quotations and inventory items

ALTER TABLE quotations 
ADD COLUMN IF NOT EXISTS items_with_product_id jsonb DEFAULT '[]'::jsonb;

-- Update existing quotations to migrate data if needed
UPDATE quotations 
SET items_with_product_id = (
  SELECT jsonb_agg(
    item || jsonb_build_object('product_id', null)
  )
  FROM jsonb_array_elements(items) AS item
)
WHERE items_with_product_id = '[]'::jsonb AND items != '[]'::jsonb;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_quotations_items_product_id ON quotations USING GIN ((items_with_product_id));
CREATE INDEX IF NOT EXISTS idx_inventory_user_id ON inventory (user_id);
CREATE INDEX IF NOT EXISTS idx_inventory_product_name ON inventory (product_name);
