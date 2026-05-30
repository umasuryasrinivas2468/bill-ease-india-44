-- ============================================================================
-- PHASE 24 — TDS RECONCILIATION WITH FORM 26AS
-- ----------------------------------------------------------------------------
-- Reconciles TDS receivable in the books (clients deducting TDS on customer
-- invoices, banks deducting on FD interest, etc.) against Form 26AS — the
-- annual tax statement maintained by the IT department aggregating all TDS
-- deducted by all deductors against the assessee's PAN.
--
-- Why this matters:
--   • Books-vs-26AS mismatch is the #1 reason for ITR processing delays.
--   • If TDS is deducted but the deductor doesn't file their TDS return,
--     the credit doesn't appear in 26AS → assessee can't claim it.
--   • Quarterly reconciliation is best practice (don't wait till year-end).
-- ============================================================================

-- ── 1. Form 26AS imports (one row per quarterly Form 26AS entry) ───────────
CREATE TABLE IF NOT EXISTS tds_26as_entries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             TEXT NOT NULL,
  assessee_pan        TEXT NOT NULL,                  -- The user's company PAN
  fiscal_year         TEXT NOT NULL,                  -- '2025-26'
  quarter             TEXT NOT NULL CHECK (quarter IN ('Q1','Q2','Q3','Q4')),
  -- Deductor info
  deductor_name       TEXT NOT NULL,
  deductor_tan        TEXT NOT NULL,
  -- Section under which TDS deducted (e.g. 194C, 194J, 194I, 194A, 192)
  tds_section         TEXT,
  -- Payment & TDS amounts
  date_of_payment     DATE,
  amount_paid         NUMERIC(18,2) NOT NULL,
  tds_amount          NUMERIC(18,2) NOT NULL,
  -- Status of deductor's TDS return
  deductor_return_status TEXT CHECK (deductor_return_status IS NULL OR deductor_return_status IN (
                        'matched_with_oltas',           -- Most common: deductor paid TDS & filed return correctly
                        'provisional',                  -- Filed but not yet processed by ITD
                        'unmatched',                    -- TDS payment by deductor not found in OLTAS
                        'pending'
                      )),
  -- Source of this row (CSV import / manual entry)
  source              TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('csv_import','pdf_parse','manual','api')),
  import_batch_id     UUID,
  raw_data            JSONB,                          -- Original row payload for audit
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tds_26as_user_fy   ON tds_26as_entries(user_id, fiscal_year, quarter);
CREATE INDEX IF NOT EXISTS idx_tds_26as_tan       ON tds_26as_entries(user_id, deductor_tan);
CREATE INDEX IF NOT EXISTS idx_tds_26as_batch     ON tds_26as_entries(user_id, import_batch_id) WHERE import_batch_id IS NOT NULL;

ALTER TABLE tds_26as_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tds_26as_owner ON tds_26as_entries;
CREATE POLICY tds_26as_owner ON tds_26as_entries
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

-- ── 2. Book TDS entries (TDS deducted from amounts due to user/company) ────
-- Populated automatically from invoices.tax_deducted on the AR side (TDS the
-- customer is deducting before paying us — claimable as TDS receivable).
CREATE TABLE IF NOT EXISTS tds_book_entries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             TEXT NOT NULL,
  fiscal_year         TEXT NOT NULL,
  quarter             TEXT NOT NULL CHECK (quarter IN ('Q1','Q2','Q3','Q4')),
  -- Source document
  source_type         TEXT NOT NULL CHECK (source_type IN ('invoice','payment_received','manual','journal')),
  source_id           UUID,
  -- Counterparty (the deductor)
  customer_name       TEXT NOT NULL,
  customer_pan        TEXT,
  customer_tan        TEXT,
  -- Amounts
  invoice_date        DATE,
  invoice_amount      NUMERIC(18,2),
  tds_section         TEXT,
  tds_rate            NUMERIC(5,2),                   -- e.g. 10.00 for §194J
  tds_amount          NUMERIC(18,2) NOT NULL,
  -- Linkage to GL
  journal_id          UUID,
  description         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tds_book_user_fy ON tds_book_entries(user_id, fiscal_year, quarter);
CREATE INDEX IF NOT EXISTS idx_tds_book_tan     ON tds_book_entries(user_id, customer_tan);

ALTER TABLE tds_book_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tds_book_owner ON tds_book_entries;
CREATE POLICY tds_book_owner ON tds_book_entries
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

-- ── 3. Reconciliation matches (links book entries ↔ 26AS entries) ──────────
CREATE TABLE IF NOT EXISTS tds_reconciliation_matches (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             TEXT NOT NULL,
  book_entry_id       UUID REFERENCES tds_book_entries(id) ON DELETE CASCADE,
  entry_26as_id       UUID REFERENCES tds_26as_entries(id) ON DELETE CASCADE,
  match_type          TEXT NOT NULL CHECK (match_type IN ('auto','manual','review')),
  amount_diff         NUMERIC(18,2) NOT NULL DEFAULT 0,
  notes               TEXT,
  matched_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  matched_by          TEXT,
  UNIQUE (book_entry_id),
  UNIQUE (entry_26as_id)
);

CREATE INDEX IF NOT EXISTS idx_tds_match_user ON tds_reconciliation_matches(user_id);

ALTER TABLE tds_reconciliation_matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tds_match_owner ON tds_reconciliation_matches;
CREATE POLICY tds_match_owner ON tds_reconciliation_matches
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

-- ── 4. AUTO-POPULATE book entries from invoices.tax_deducted ──────────────
CREATE OR REPLACE FUNCTION refresh_tds_book_entries(
  p_user_id     TEXT,
  p_fiscal_year TEXT
) RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  v_count INT := 0;
  v_fy_start DATE; v_fy_end DATE;
BEGIN
  SELECT fy_start, fy_end INTO v_fy_start, v_fy_end FROM fy_bounds(p_fiscal_year);

  -- Wipe and rebuild book entries for this FY (idempotent)
  DELETE FROM tds_book_entries
    WHERE user_id = p_user_id AND fiscal_year = p_fiscal_year AND source_type = 'payment_received';

  -- Pull TDS from payment_received.tax_deducted (which captures customer TDS on collected payments)
  INSERT INTO tds_book_entries (
    user_id, fiscal_year, quarter, source_type, source_id,
    customer_name, customer_pan, customer_tan,
    invoice_date, invoice_amount, tds_amount, description
  )
  SELECT
    pr.user_id,
    p_fiscal_year,
    CASE
      WHEN pr.payment_date BETWEEN v_fy_start AND (v_fy_start + INTERVAL '3 months' - INTERVAL '1 day') THEN 'Q1'
      WHEN pr.payment_date BETWEEN (v_fy_start + INTERVAL '3 months') AND (v_fy_start + INTERVAL '6 months' - INTERVAL '1 day') THEN 'Q2'
      WHEN pr.payment_date BETWEEN (v_fy_start + INTERVAL '6 months') AND (v_fy_start + INTERVAL '9 months' - INTERVAL '1 day') THEN 'Q3'
      ELSE 'Q4'
    END AS quarter,
    'payment_received'::TEXT,
    pr.id,
    pr.customer_name,
    NULL,                                                    -- customer_pan: would come from clients table
    NULL,                                                    -- customer_tan: same
    pr.payment_date,
    pr.amount,
    pr.tax_deducted,
    COALESCE(pr.notes, 'TDS on payment received #' || pr.reference_number)
  FROM payment_received pr
  WHERE pr.user_id = p_user_id
    AND pr.payment_date BETWEEN v_fy_start AND v_fy_end
    AND pr.payment_type = 'invoice_payment'
    AND COALESCE(pr.tax_deducted, 0) > 0
    AND COALESCE(pr.status, 'received') <> 'cancelled';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ── 5. AUTO-MATCHING by TAN + amount ──────────────────────────────────────
-- Matches book entries to 26AS entries using customer_tan (preferred) or
-- customer_name (lower-case fuzzy) + amount within ₹10 tolerance.
CREATE OR REPLACE FUNCTION auto_match_tds(
  p_user_id     TEXT,
  p_fiscal_year TEXT
) RETURNS INT LANGUAGE plpgsql AS $$
DECLARE v_count INT := 0;
BEGIN
  -- Tier 1: Exact TAN + amount match (highest confidence)
  INSERT INTO tds_reconciliation_matches (user_id, book_entry_id, entry_26as_id, match_type, amount_diff)
  SELECT
    b.user_id, b.id, a.id, 'auto',
    ROUND((b.tds_amount - a.tds_amount)::NUMERIC, 2)
  FROM tds_book_entries b
  JOIN tds_26as_entries a
    ON a.user_id = b.user_id
   AND a.fiscal_year = b.fiscal_year
   AND a.deductor_tan = b.customer_tan
   AND ABS(b.tds_amount - a.tds_amount) <= 10
  WHERE b.user_id = p_user_id
    AND b.fiscal_year = p_fiscal_year
    AND b.customer_tan IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM tds_reconciliation_matches m WHERE m.book_entry_id = b.id)
    AND NOT EXISTS (SELECT 1 FROM tds_reconciliation_matches m WHERE m.entry_26as_id = a.id)
  ON CONFLICT (book_entry_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Tier 2: Fuzzy name + amount (lower confidence)
  INSERT INTO tds_reconciliation_matches (user_id, book_entry_id, entry_26as_id, match_type, amount_diff, notes)
  SELECT
    b.user_id, b.id, a.id, 'auto',
    ROUND((b.tds_amount - a.tds_amount)::NUMERIC, 2),
    'Fuzzy name match — please verify'
  FROM tds_book_entries b
  JOIN tds_26as_entries a
    ON a.user_id = b.user_id
   AND a.fiscal_year = b.fiscal_year
   AND lower(a.deductor_name) = lower(b.customer_name)
   AND ABS(b.tds_amount - a.tds_amount) <= 10
  WHERE b.user_id = p_user_id
    AND b.fiscal_year = p_fiscal_year
    AND NOT EXISTS (SELECT 1 FROM tds_reconciliation_matches m WHERE m.book_entry_id = b.id)
    AND NOT EXISTS (SELECT 1 FROM tds_reconciliation_matches m WHERE m.entry_26as_id = a.id)
  ON CONFLICT (book_entry_id) DO NOTHING;

  RETURN v_count;
END;
$$;

-- ── 6. RECONCILIATION RPC — returns matched / book-only / 26as-only buckets
CREATE OR REPLACE FUNCTION reconcile_tds_with_26as(
  p_user_id     TEXT,
  p_fiscal_year TEXT
) RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH
  book_total AS (
    SELECT COALESCE(SUM(tds_amount), 0) AS total, COUNT(*) AS cnt
      FROM tds_book_entries
     WHERE user_id = p_user_id AND fiscal_year = p_fiscal_year
  ),
  ttas_total AS (
    SELECT COALESCE(SUM(tds_amount), 0) AS total, COUNT(*) AS cnt
      FROM tds_26as_entries
     WHERE user_id = p_user_id AND fiscal_year = p_fiscal_year
  ),
  matched AS (
    SELECT
      m.id, m.amount_diff, m.match_type, m.notes,
      b.id          AS book_id,
      b.customer_name, b.customer_tan, b.tds_amount AS book_tds, b.invoice_date, b.quarter AS book_quarter,
      a.id          AS as26_id,
      a.deductor_name, a.deductor_tan, a.tds_amount AS as26_tds, a.date_of_payment, a.tds_section
    FROM tds_reconciliation_matches m
    JOIN tds_book_entries  b ON b.id = m.book_entry_id
    JOIN tds_26as_entries  a ON a.id = m.entry_26as_id
    WHERE m.user_id = p_user_id
      AND b.fiscal_year = p_fiscal_year
  ),
  book_only AS (
    SELECT b.* FROM tds_book_entries b
     WHERE b.user_id = p_user_id AND b.fiscal_year = p_fiscal_year
       AND NOT EXISTS (SELECT 1 FROM tds_reconciliation_matches m WHERE m.book_entry_id = b.id)
  ),
  as26_only AS (
    SELECT a.* FROM tds_26as_entries a
     WHERE a.user_id = p_user_id AND a.fiscal_year = p_fiscal_year
       AND NOT EXISTS (SELECT 1 FROM tds_reconciliation_matches m WHERE m.entry_26as_id = a.id)
  )
  SELECT jsonb_build_object(
    'fiscal_year',     p_fiscal_year,
    'book_total',      ROUND((SELECT total FROM book_total)::NUMERIC, 2),
    'book_count',      (SELECT cnt   FROM book_total),
    '26as_total',      ROUND((SELECT total FROM ttas_total)::NUMERIC, 2),
    '26as_count',      (SELECT cnt   FROM ttas_total),
    'matched_count',   (SELECT COUNT(*) FROM matched),
    'matched_book_total', ROUND(COALESCE((SELECT SUM(book_tds) FROM matched),0)::NUMERIC, 2),
    'matched_26as_total', ROUND(COALESCE((SELECT SUM(as26_tds) FROM matched),0)::NUMERIC, 2),
    'book_only_count', (SELECT COUNT(*) FROM book_only),
    'book_only_total', ROUND(COALESCE((SELECT SUM(tds_amount) FROM book_only),0)::NUMERIC, 2),
    '26as_only_count', (SELECT COUNT(*) FROM as26_only),
    '26as_only_total', ROUND(COALESCE((SELECT SUM(tds_amount) FROM as26_only),0)::NUMERIC, 2),
    'matched', (SELECT jsonb_agg(to_jsonb(matched.*) ORDER BY book_quarter, customer_name) FROM matched),
    'book_only', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'customer_name', customer_name, 'customer_tan', customer_tan,
        'tds_amount', tds_amount, 'invoice_date', invoice_date,
        'quarter', quarter, 'description', description
      ) ORDER BY quarter, customer_name) FROM book_only
    ),
    '26as_only', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'deductor_name', deductor_name, 'deductor_tan', deductor_tan,
        'tds_amount', tds_amount, 'date_of_payment', date_of_payment,
        'quarter', quarter, 'tds_section', tds_section, 'deductor_return_status', deductor_return_status
      ) ORDER BY quarter, deductor_name) FROM as26_only
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ── 7. Bulk-insert helper for CSV import ───────────────────────────────────
CREATE OR REPLACE FUNCTION import_26as_batch(
  p_user_id     TEXT,
  p_fiscal_year TEXT,
  p_assessee_pan TEXT,
  p_rows        JSONB             -- array of { quarter, deductor_name, deductor_tan, tds_section, date_of_payment, amount_paid, tds_amount, deductor_return_status }
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_batch_id UUID := gen_random_uuid();
  v_row JSONB;
  v_count INT := 0;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    INSERT INTO tds_26as_entries (
      user_id, assessee_pan, fiscal_year, quarter,
      deductor_name, deductor_tan, tds_section,
      date_of_payment, amount_paid, tds_amount,
      deductor_return_status, source, import_batch_id, raw_data
    ) VALUES (
      p_user_id, p_assessee_pan, p_fiscal_year,
      COALESCE(v_row ->> 'quarter', 'Q1'),
      v_row ->> 'deductor_name',
      v_row ->> 'deductor_tan',
      v_row ->> 'tds_section',
      NULLIF(v_row ->> 'date_of_payment', '')::DATE,
      COALESCE((v_row ->> 'amount_paid')::NUMERIC, 0),
      COALESCE((v_row ->> 'tds_amount')::NUMERIC, 0),
      v_row ->> 'deductor_return_status',
      'csv_import',
      v_batch_id,
      v_row
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'batch_id', v_batch_id,
    'rows_imported', v_count,
    'fiscal_year', p_fiscal_year
  );
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_tds_book_entries(TEXT, TEXT)        TO authenticated, anon;
GRANT EXECUTE ON FUNCTION auto_match_tds(TEXT, TEXT)                  TO authenticated, anon;
GRANT EXECUTE ON FUNCTION reconcile_tds_with_26as(TEXT, TEXT)         TO authenticated, anon;
GRANT EXECUTE ON FUNCTION import_26as_batch(TEXT, TEXT, TEXT, JSONB)  TO authenticated, anon;
