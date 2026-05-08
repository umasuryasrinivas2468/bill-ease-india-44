-- ═══════════════════════════════════════════════════════════════════
-- Reverse Charge Mechanism (RCM) columns on expenses
-- Feature #12 — GST calculator module
--
-- Mirrors database/rcm_migration.sql, which lived outside this folder
-- and was never auto-applied. ExpenseForm writes these columns on every
-- create/update, so without them inserts fail with PostgREST schema
-- cache errors ("Could not find the 'is_rcm' column").
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS is_rcm            BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rcm_rate          NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rcm_amount        NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vendor_gst_status TEXT
    CHECK (vendor_gst_status IN ('registered', 'unregistered', 'composition', 'unknown'));

CREATE INDEX IF NOT EXISTS idx_expenses_rcm_user_date
  ON expenses (user_id, expense_date)
  WHERE is_rcm = TRUE;

COMMENT ON COLUMN expenses.is_rcm IS
  'TRUE when GST on this expense is payable by the buyer under Section 9(3)/9(4). Creates an RCM liability, not a vendor payable.';
COMMENT ON COLUMN expenses.rcm_amount IS
  'Total GST payable under RCM (CGST+SGST or IGST combined). Computed client-side from amount × rate.';
COMMENT ON COLUMN expenses.vendor_gst_status IS
  'registered | unregistered | composition | unknown — snapshot at entry time so later vendor edits don''t rewrite history.';

-- Force PostgREST to reload its schema cache so the new columns
-- become visible immediately without a restart.
NOTIFY pgrst, 'reload schema';
