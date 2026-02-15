-- Sample data for testing plan-based access control
-- This file contains test data for different plan types

-- Insert sample licenses for testing
INSERT INTO license (email, license_key, plan_type, due_date) VALUES
  -- Starter plan users
  ('starter1@example.com', 'STR-2025-001', 'starter', '2025-12-31'),
  ('starter2@example.com', 'STR-2025-002', 'starter', '2025-12-31'),
  
  -- Growth plan users
  ('growth1@example.com', 'GRW-2025-001', 'growth', '2025-12-31'),
  ('growth2@example.com', 'GRW-2025-002', 'growth', '2025-12-31'),
  
  -- Scale plan users
  ('scale1@example.com', 'SCL-2025-001', 'scale', '2025-12-31'),
  ('scale2@example.com', 'SCL-2025-002', 'scale', '2025-12-31')
ON CONFLICT (email) DO UPDATE SET
  license_key = EXCLUDED.license_key,
  plan_type = EXCLUDED.plan_type,
  due_date = EXCLUDED.due_date,
  updated_at = NOW();

-- Verify the data was inserted
SELECT 
  email, 
  license_key, 
  plan_type, 
  date_created, 
  due_date 
FROM license 
ORDER BY plan_type, email;