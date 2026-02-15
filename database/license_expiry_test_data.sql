-- Test data for license expiry functionality
-- This script creates licenses with various expiry dates for testing

-- Clear existing test data first (optional)
DELETE FROM license WHERE email LIKE '%test%' OR email LIKE '%example%';

-- Insert test licenses with different expiry scenarios
INSERT INTO license (email, license_key, plan_type, due_date) VALUES
  -- Expired license (1 day ago) - USER BLOCKED
  ('expired@test.com', 'EXP-2025-001', 'starter', NOW() - INTERVAL '1 day'),
  
  -- Expiring today - POPUP SHOWN
  ('expiring-today@test.com', 'EXP-2025-002', 'growth', NOW()),
  
  -- Expired yesterday - USER BLOCKED
  ('expired-yesterday@test.com', 'EXP-2025-003', 'scale', NOW() - INTERVAL '1 day'),
  
  -- Valid license (30 days from now)
  ('valid@test.com', 'VAL-2025-001', 'growth', NOW() + INTERVAL '30 days'),
  
  -- Long-term valid license (1 year from now)
  ('longterm@test.com', 'LNG-2025-001', 'scale', NOW() + INTERVAL '1 year')
ON CONFLICT (email) DO UPDATE SET
  license_key = EXCLUDED.license_key,
  plan_type = EXCLUDED.plan_type,
  due_date = EXCLUDED.due_date,
  updated_at = NOW();

-- Update existing sample data to have various expiry dates
UPDATE license SET due_date = NOW() WHERE email = 'starter1@example.com'; -- Expires today - popup
UPDATE license SET due_date = NOW() + INTERVAL '60 days' WHERE email = 'growth1@example.com'; -- Valid
UPDATE license SET due_date = NOW() - INTERVAL '1 day' WHERE email = 'scale1@example.com'; -- Expired - blocked

-- Verify the test data
SELECT 
  email, 
  license_key, 
  plan_type, 
  due_date,
  CASE 
    WHEN due_date < CURRENT_DATE THEN 'EXPIRED (BLOCKED)'
    WHEN due_date = CURRENT_DATE THEN 'EXPIRES TODAY (POPUP)'
    ELSE 'VALID'
  END as status,
  EXTRACT(days FROM (due_date - NOW())) as days_until_expiry
FROM license 
ORDER BY due_date ASC;