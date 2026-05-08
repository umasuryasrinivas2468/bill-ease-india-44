-- ════════════════════════════════════════════════════════════════════════════
-- Expenses schema repair (idempotent)
--
-- The original migration 20251008000001_create_expenses_system.sql was
-- partially applied in some environments — the tables exist but several of
-- the columns the application reads/writes are missing. Re-running that
-- migration is a no-op (CREATE TABLE IF NOT EXISTS), so we backfill the
-- missing columns here. Every statement uses IF NOT EXISTS so it is safe to
-- re-run on a fully-migrated database too.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE expense_categories
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS is_default  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_active   BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS reference_number    TEXT,
  ADD COLUMN IF NOT EXISTS bill_number         TEXT,
  ADD COLUMN IF NOT EXISTS bill_attachment_url TEXT,
  ADD COLUMN IF NOT EXISTS notes               TEXT,
  ADD COLUMN IF NOT EXISTS status              TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS posted_to_ledger    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS journal_id          UUID,
  ADD COLUMN IF NOT EXISTS created_at          TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ DEFAULT NOW();

-- Re-seed the default categories the app expects. We detect the user_id
-- column type at runtime because some environments declared it UUID and
-- others TEXT, so we can't hard-code a 'system' literal. Skipped if any
-- default category already exists.
DO $$
DECLARE
  uid_type TEXT;
  sentinel TEXT;
  cats     TEXT[][] := ARRAY[
    ['Office Rent',              'Monthly office rental expenses'],
    ['Fuel & Transportation',    'Vehicle fuel and transportation costs'],
    ['Advertising & Marketing',  'Marketing and promotional expenses'],
    ['Office Supplies',          'Stationery and office equipment'],
    ['Professional Fees',        'Legal, CA, and consultant fees'],
    ['Utilities',                'Electricity, water, internet, phone bills'],
    ['Communication',            'Mobile, telephone, internet bills'],
    ['Printing & Stationery',    'Printing and office stationery'],
    ['Repairs & Maintenance',    'Equipment and office maintenance'],
    ['Insurance',                'Business insurance premiums'],
    ['Software & Subscriptions', 'Software licences and SaaS subscriptions'],
    ['Travel & Accommodation',   'Business travel and hotel costs'],
    ['Entertainment',            'Client entertainment and meals'],
    ['Raw Materials',            'Raw materials and inputs for production'],
    ['Purchase of Goods',        'Goods purchased for resale or stock'],
    ['Freight & Cartage',        'Shipping, courier, and freight charges'],
    ['Miscellaneous',            'Other operating expenses']
  ];
  i        INTEGER;
BEGIN
  SELECT data_type INTO uid_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'expense_categories'
    AND column_name = 'user_id';

  -- Pick a sentinel value that satisfies the column's actual type.
  IF uid_type = 'uuid' THEN
    sentinel := '00000000-0000-0000-0000-000000000000';
  ELSE
    sentinel := 'system';
  END IF;

  -- Only seed when no default categories exist yet.
  IF NOT EXISTS (
    SELECT 1 FROM expense_categories WHERE is_default = TRUE
  ) THEN
    FOR i IN 1 .. array_length(cats, 1) LOOP
      -- Skip duplicates (category_name is UNIQUE in the original migration).
      IF NOT EXISTS (
        SELECT 1 FROM expense_categories WHERE category_name = cats[i][1]
      ) THEN
        EXECUTE format(
          'INSERT INTO expense_categories (user_id, category_name, description, is_default, is_active) VALUES (%L, %L, %L, TRUE, TRUE)',
          sentinel, cats[i][1], cats[i][2]
        );
      END IF;
    END LOOP;
  END IF;
END $$;
