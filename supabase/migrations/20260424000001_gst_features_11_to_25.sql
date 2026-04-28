-- ============================================================================
-- Migration: GST Features #11 – #25
-- Date: 2026-04-24
--
-- Covers schema for:
--   11. Auto GST Calculator               → persisted CGST/SGST/IGST columns
--   12. Reverse Charge Calculator         → purchase_bills.is_rcm + itc_eligible
--   13. Output Tax Liability Dashboard    → indexes for monthly rollups
--   14. Net GST Payable Calculator        → (derived, no schema change needed)
--   15. Interest & Late Fee Calculator    → gst_return_filings
--   16. Multi-rate Invoice Tax Engine     → invoices.rate_buckets JSONB
--   17. Inclusive/Exclusive Toggle        → invoices.pricing_mode
--   18. Interstate vs Intrastate Logic    → invoices.place_of_supply + intra_state
--   19. Tax Rounding Engine               → (uses existing roundoff column)
--   20. Credit Note Tax Reversal          → cgst/sgst/igst on credit_notes
--   21. GSTR-1 Ready Sales Summary        → idx for grouping, tax meta on CNs
--   22. GSTR-3B Auto Summary              → (derived; filings persisted)
--   23. ITC Mismatch Alert Center         → gstr2b_uploads + itc_mismatches
--   24. Return Period Comparison          → monthly indexes
--   25. Tax Payment Planner               → gst_payments
--
-- Design notes:
--   * Idempotent. Safe to run on a fresh DB or on one that already has some
--     of these columns/tables from prior manual changes.
--   * All new tables inherit the existing RLS pattern (Clerk JWT sub claim).
--   * Old invoices/bills keep working — the tax columns are nullable and a
--     backfill step at the bottom populates them from the `items.__tax_meta`
--     JSON the app has been writing since feature #11 shipped.
-- ============================================================================

-- ── 1. INVOICES: persisted tax breakdown + place of supply + pricing mode ──
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS place_of_supply TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS seller_state TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS intra_state BOOLEAN;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pricing_mode TEXT
  CHECK (pricing_mode IN ('exclusive', 'inclusive'))
  DEFAULT 'exclusive';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS taxable_value DECIMAL(14,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cgst_amount DECIMAL(14,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sgst_amount DECIMAL(14,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS igst_amount DECIMAL(14,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cess_amount DECIMAL(14,2) DEFAULT 0;
-- Per-rate breakdown for multi-rate invoices (#16). Shape:
-- [{ "rate": 18, "taxable": 1000, "cgst": 90, "sgst": 90, "igst": 0, "total_tax": 180 }, ...]
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS rate_buckets JSONB;

-- ── 2. CREDIT NOTES: tax breakdown for reversal reporting (#20, #21) ──────
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS place_of_supply TEXT;
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS seller_state TEXT;
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS intra_state BOOLEAN;
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS cgst_amount DECIMAL(14,2) DEFAULT 0;
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS sgst_amount DECIMAL(14,2) DEFAULT 0;
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS igst_amount DECIMAL(14,2) DEFAULT 0;
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS cess_amount DECIMAL(14,2) DEFAULT 0;
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS taxable_value DECIMAL(14,2);

-- ── 3. DEBIT NOTES: tax breakdown ─────────────────────────────────────────
ALTER TABLE debit_notes ADD COLUMN IF NOT EXISTS place_of_supply TEXT;
ALTER TABLE debit_notes ADD COLUMN IF NOT EXISTS cgst_amount DECIMAL(14,2) DEFAULT 0;
ALTER TABLE debit_notes ADD COLUMN IF NOT EXISTS sgst_amount DECIMAL(14,2) DEFAULT 0;
ALTER TABLE debit_notes ADD COLUMN IF NOT EXISTS igst_amount DECIMAL(14,2) DEFAULT 0;

-- ── 4. PURCHASE BILLS: RCM + ITC eligibility + tax breakdown (#12, #22) ───
ALTER TABLE purchase_bills ADD COLUMN IF NOT EXISTS is_rcm BOOLEAN DEFAULT FALSE;
ALTER TABLE purchase_bills ADD COLUMN IF NOT EXISTS itc_eligible BOOLEAN DEFAULT TRUE;
ALTER TABLE purchase_bills ADD COLUMN IF NOT EXISTS place_of_supply TEXT;
ALTER TABLE purchase_bills ADD COLUMN IF NOT EXISTS cgst_amount DECIMAL(14,2) DEFAULT 0;
ALTER TABLE purchase_bills ADD COLUMN IF NOT EXISTS sgst_amount DECIMAL(14,2) DEFAULT 0;
ALTER TABLE purchase_bills ADD COLUMN IF NOT EXISTS igst_amount DECIMAL(14,2) DEFAULT 0;
ALTER TABLE purchase_bills ADD COLUMN IF NOT EXISTS vendor_gst_status TEXT
  CHECK (vendor_gst_status IN ('registered', 'unregistered', 'composition', 'unknown'))
  DEFAULT 'registered';

-- ── 5. GST RETURN FILINGS: GSTR-1 / GSTR-3B filings with penalty (#15) ────
-- One row per filed return. Penalty fields let the app cache the computed
-- interest/late fee at filing time, rather than recomputing on every load.
CREATE TABLE IF NOT EXISTS gst_return_filings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  return_type TEXT NOT NULL CHECK (return_type IN ('GSTR-1', 'GSTR-3B', 'GSTR-9', 'CMP-08')),
  period TEXT NOT NULL,                          -- YYYY-MM for monthly
  due_date DATE NOT NULL,
  filing_date DATE,                              -- null = unfiled
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'filed', 'cancelled')),
  is_nil_return BOOLEAN DEFAULT FALSE,

  -- Summary amounts (snapshot at filing time so reports stay stable)
  taxable_value DECIMAL(14,2) DEFAULT 0,
  tax_payable DECIMAL(14,2) DEFAULT 0,
  itc_claimed DECIMAL(14,2) DEFAULT 0,
  net_cash_paid DECIMAL(14,2) DEFAULT 0,

  -- Penalty (#15) — computed at filing time
  days_late INTEGER DEFAULT 0,
  interest_paid DECIMAL(14,2) DEFAULT 0,
  late_fee_paid DECIMAL(14,2) DEFAULT 0,
  total_penalty DECIMAL(14,2) DEFAULT 0,

  -- GSTN response metadata
  arn TEXT,                                      -- Acknowledgement Reference Number
  filed_payload JSONB,                           -- exact JSON uploaded (for audit)
  acknowledgement JSONB,                         -- GSTN response
  notes TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE (user_id, return_type, period)
);

ALTER TABLE gst_return_filings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'gst_return_filings'
      AND policyname = 'Users can manage their own GST return filings'
  ) THEN
    CREATE POLICY "Users can manage their own GST return filings"
      ON gst_return_filings FOR ALL
      USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));
  END IF;
END $$;

-- ── 6. GSTR-2B UPLOADS: audit trail for ITC mismatch runs (#23) ───────────
-- Storing the raw JSON means you can re-run the diff after later vendor edits
-- without having to re-download from the portal.
CREATE TABLE IF NOT EXISTS gstr2b_uploads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  period TEXT,                                   -- YYYY-MM extracted from JSON if present
  file_name TEXT,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),

  -- Summary (for quick display without re-parsing)
  portal_invoice_count INTEGER DEFAULT 0,
  portal_total_igst DECIMAL(14,2) DEFAULT 0,
  portal_total_cgst DECIMAL(14,2) DEFAULT 0,
  portal_total_sgst DECIMAL(14,2) DEFAULT 0,
  portal_total_cess DECIMAL(14,2) DEFAULT 0,

  -- Raw data (bounded — reject uploads > ~2 MB at the API layer)
  raw_json JSONB,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE gstr2b_uploads ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'gstr2b_uploads'
      AND policyname = 'Users can manage their own GSTR-2B uploads'
  ) THEN
    CREATE POLICY "Users can manage their own GSTR-2B uploads"
      ON gstr2b_uploads FOR ALL
      USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));
  END IF;
END $$;

-- ── 7. ITC MISMATCHES: persisted reconciliation results (#23) ─────────────
-- Row per mismatch. Users can mark `resolved = true` after fixing a book
-- entry or accepting a vendor's amendment.
CREATE TABLE IF NOT EXISTS itc_mismatches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  upload_id UUID REFERENCES gstr2b_uploads(id) ON DELETE CASCADE,
  period TEXT,
  invoice_number TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'MATCHED',
    'MISSING_IN_BOOKS',
    'MISSING_IN_PORTAL',
    'GSTIN_MISMATCH',
    'AMOUNT_MISMATCH'
  )),
  portal_supplier TEXT,
  portal_gstin TEXT,
  portal_gst DECIMAL(14,2),
  book_vendor TEXT,
  book_gstin TEXT,
  book_gst DECIMAL(14,2),
  gst_diff DECIMAL(14,2),
  note TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  resolution_note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE itc_mismatches ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'itc_mismatches'
      AND policyname = 'Users can manage their own ITC mismatches'
  ) THEN
    CREATE POLICY "Users can manage their own ITC mismatches"
      ON itc_mismatches FOR ALL
      USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));
  END IF;
END $$;

-- ── 8. GST PAYMENTS: actual cash paid to govt via challan (#25) ───────────
-- Separate from `gst_return_filings` because a period can have multiple
-- challans (DRC-03, additional payments, interest-only, etc.).
CREATE TABLE IF NOT EXISTS gst_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  period TEXT,                                   -- YYYY-MM return period this payment covers
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  challan_reference TEXT,                        -- CIN / CPIN
  payment_mode TEXT DEFAULT 'bank_transfer'
    CHECK (payment_mode IN ('bank_transfer', 'netbanking', 'upi', 'rtgs', 'cash_ledger', 'credit_ledger', 'other')),

  cgst_paid DECIMAL(14,2) DEFAULT 0,
  sgst_paid DECIMAL(14,2) DEFAULT 0,
  igst_paid DECIMAL(14,2) DEFAULT 0,
  cess_paid DECIMAL(14,2) DEFAULT 0,
  interest_paid DECIMAL(14,2) DEFAULT 0,
  late_fee_paid DECIMAL(14,2) DEFAULT 0,
  total_paid DECIMAL(14,2) GENERATED ALWAYS AS
    (cgst_paid + sgst_paid + igst_paid + cess_paid + interest_paid + late_fee_paid) STORED,

  filing_id UUID REFERENCES gst_return_filings(id) ON DELETE SET NULL,
  remarks TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE gst_payments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'gst_payments'
      AND policyname = 'Users can manage their own GST payments'
  ) THEN
    CREATE POLICY "Users can manage their own GST payments"
      ON gst_payments FOR ALL
      USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));
  END IF;
END $$;

-- ── 9. INDEXES for monthly rollups (#13, #21, #22, #24) ───────────────────
-- Most GST reports filter by user_id + date range. These compound indexes
-- make liability/period-comparison queries cheap.
CREATE INDEX IF NOT EXISTS idx_invoices_user_date
  ON invoices(user_id, invoice_date);
CREATE INDEX IF NOT EXISTS idx_credit_notes_user_date
  ON credit_notes(user_id, credit_note_date);
CREATE INDEX IF NOT EXISTS idx_debit_notes_user_date
  ON debit_notes(user_id, debit_note_date);
CREATE INDEX IF NOT EXISTS idx_purchase_bills_user_date
  ON purchase_bills(user_id, bill_date);
CREATE INDEX IF NOT EXISTS idx_purchase_bills_rcm
  ON purchase_bills(user_id, is_rcm) WHERE is_rcm = TRUE;

CREATE INDEX IF NOT EXISTS idx_gst_return_filings_user_period
  ON gst_return_filings(user_id, period);
CREATE INDEX IF NOT EXISTS idx_gstr2b_uploads_user_period
  ON gstr2b_uploads(user_id, period);
CREATE INDEX IF NOT EXISTS idx_itc_mismatches_user_upload
  ON itc_mismatches(user_id, upload_id);
CREATE INDEX IF NOT EXISTS idx_itc_mismatches_unresolved
  ON itc_mismatches(user_id, resolved) WHERE resolved = FALSE;
CREATE INDEX IF NOT EXISTS idx_gst_payments_user_period
  ON gst_payments(user_id, period);

-- ── 10. BACKFILL: populate new tax columns from existing __tax_meta JSON ──
-- Invoices created since feature #11 shipped have a __tax_meta object
-- embedded in items[]. Pull it back into typed columns so reports can stop
-- parsing JSON on every query.
UPDATE invoices
SET
  seller_state   = COALESCE(invoices.seller_state,
                             (meta->>'seller_state')::TEXT),
  place_of_supply = COALESCE(invoices.place_of_supply,
                              (meta->>'buyer_state')::TEXT),
  intra_state    = COALESCE(invoices.intra_state,
                             (meta->>'intra_state')::BOOLEAN),
  cgst_amount    = COALESCE(NULLIF(invoices.cgst_amount, 0),
                             (meta->>'cgst_amount')::DECIMAL),
  sgst_amount    = COALESCE(NULLIF(invoices.sgst_amount, 0),
                             (meta->>'sgst_amount')::DECIMAL),
  igst_amount    = COALESCE(NULLIF(invoices.igst_amount, 0),
                             (meta->>'igst_amount')::DECIMAL),
  pricing_mode   = COALESCE(invoices.pricing_mode,
                             (meta->>'pricing_mode')::TEXT,
                             'exclusive'),
  rate_buckets   = COALESCE(invoices.rate_buckets,
                             meta->'rate_buckets'),
  taxable_value  = COALESCE(invoices.taxable_value, invoices.amount)
FROM (
  SELECT id, item AS meta
  FROM invoices, jsonb_array_elements(
    CASE WHEN jsonb_typeof(items) = 'array' THEN items ELSE '[]'::jsonb END
  ) item
  WHERE item ? '__tax_meta'
) extracted
WHERE invoices.id = extracted.id;

-- Backfill place_of_supply from client when the invoice never persisted buyer_state.
UPDATE invoices i
SET place_of_supply = c.place_of_supply
FROM clients c
WHERE i.user_id = c.user_id
  AND i.client_name = c.name
  AND i.place_of_supply IS NULL
  AND c.place_of_supply IS NOT NULL;

-- Backfill taxable_value for legacy rows where it's still null.
UPDATE invoices
SET taxable_value = amount
WHERE taxable_value IS NULL;

-- Same backfill for credit_notes from their __tax_meta.
UPDATE credit_notes
SET
  seller_state    = COALESCE(credit_notes.seller_state,
                              (meta->>'seller_state')::TEXT),
  place_of_supply = COALESCE(credit_notes.place_of_supply,
                              (meta->>'buyer_state')::TEXT),
  intra_state     = COALESCE(credit_notes.intra_state,
                              (meta->>'intra_state')::BOOLEAN),
  cgst_amount     = COALESCE(NULLIF(credit_notes.cgst_amount, 0),
                              (meta->>'cgst_amount')::DECIMAL),
  sgst_amount     = COALESCE(NULLIF(credit_notes.sgst_amount, 0),
                              (meta->>'sgst_amount')::DECIMAL),
  igst_amount     = COALESCE(NULLIF(credit_notes.igst_amount, 0),
                              (meta->>'igst_amount')::DECIMAL),
  taxable_value   = COALESCE(credit_notes.taxable_value, credit_notes.amount)
FROM (
  SELECT id, item AS meta
  FROM credit_notes, jsonb_array_elements(
    CASE WHEN jsonb_typeof(items) = 'array' THEN items ELSE '[]'::jsonb END
  ) item
  WHERE item ? '__tax_meta'
) extracted
WHERE credit_notes.id = extracted.id;

-- ── 11. updated_at triggers for the new tables ────────────────────────────
CREATE OR REPLACE FUNCTION set_gst_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_gst_return_filings_updated_at'
  ) THEN
    CREATE TRIGGER trg_gst_return_filings_updated_at
      BEFORE UPDATE ON gst_return_filings
      FOR EACH ROW EXECUTE FUNCTION set_gst_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_itc_mismatches_updated_at'
  ) THEN
    CREATE TRIGGER trg_itc_mismatches_updated_at
      BEFORE UPDATE ON itc_mismatches
      FOR EACH ROW EXECUTE FUNCTION set_gst_updated_at();
  END IF;
END $$;

-- ── 12. VIEW: monthly output tax rollup (convenience for #13 / #24) ───────
-- Gives dashboards a one-line query for a period's output GST.
-- Wrap in CREATE OR REPLACE so re-running the migration is safe.
CREATE OR REPLACE VIEW v_gst_monthly_output AS
SELECT
  user_id,
  TO_CHAR(invoice_date, 'YYYY-MM')            AS period,
  SUM(taxable_value)                          AS taxable_value,
  SUM(cgst_amount)                            AS cgst,
  SUM(sgst_amount)                            AS sgst,
  SUM(igst_amount)                            AS igst,
  SUM(cess_amount)                            AS cess,
  SUM(gst_amount)                             AS total_gst,
  COUNT(*)                                    AS invoice_count
FROM invoices
WHERE status <> 'cancelled' OR status IS NULL
GROUP BY user_id, TO_CHAR(invoice_date, 'YYYY-MM');

CREATE OR REPLACE VIEW v_gst_monthly_itc AS
SELECT
  user_id,
  TO_CHAR(bill_date, 'YYYY-MM')               AS period,
  SUM(amount)                                 AS taxable_value,
  SUM(cgst_amount)                            AS cgst,
  SUM(sgst_amount)                            AS sgst,
  SUM(igst_amount)                            AS igst,
  SUM(gst_amount)                             AS total_gst,
  SUM(CASE WHEN is_rcm THEN gst_amount ELSE 0 END) AS rcm_gst,
  COUNT(*)                                    AS bill_count
FROM purchase_bills
WHERE itc_eligible IS DISTINCT FROM FALSE
GROUP BY user_id, TO_CHAR(bill_date, 'YYYY-MM');

-- ============================================================================
-- End of migration 20260424000001_gst_features_11_to_25
-- ============================================================================
