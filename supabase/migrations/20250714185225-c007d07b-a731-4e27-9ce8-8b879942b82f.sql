
-- Add country and currency fields to support India and Singapore
ALTER TABLE business_profiles 
ADD COLUMN country TEXT DEFAULT 'india',
ADD COLUMN currency TEXT DEFAULT 'INR';

-- Update the onboarding state to include country-specific fields
-- This will help track which country's format is being used
ALTER TABLE business_profiles 
ADD COLUMN gst_rate TEXT DEFAULT '18';

-- Create an index for better performance on country queries
CREATE INDEX IF NOT EXISTS idx_business_profiles_country ON business_profiles(country);

-- Update existing records to have default values
UPDATE business_profiles 
SET country = 'india', currency = 'INR' 
WHERE country IS NULL;
