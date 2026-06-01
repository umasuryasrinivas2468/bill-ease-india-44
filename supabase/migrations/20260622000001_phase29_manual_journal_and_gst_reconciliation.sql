-- ════════════════════════════════════════════════════════════════════════════
-- Phase 29 — Manual Journal Entry, GSTR-2A module, 3-way GST Reconciliation,
--            Sub-Ledger directory, and ITC Intelligence
--
-- Builds the user-facing consumption layer on top of Phase 28's journal-first
-- foundation. Adds:
--   * Header fields on `journals` for a full SME-grade JE form
--     (posting_date, voucher_type, reference_number, cost_center_id,
--      branch_id, project_id)
--   * `journal_attachments` table
--   * `gstr2a_uploads` + `gstr2a_invoices` + `gstr2b_invoices` (normalized
--     line-level tables — `gstr2b_uploads.raw_json` stays as audit trail)
--   * `post_manual_journal(...)` RPC — wraps `post_journal` with all the
--     pre-flight validations the user requested (balanced, unique number,
--     locked period, inactive ledger, leaf-only account)
--   * `get_gstr2a_dashboard(...)` — supplier purchase view
--   * `get_three_way_gst_reconciliation(...)` — Books vs 2A vs 2B diff
--   * `get_subledger_directory(...)` — every vendor + client with primary
--     ledger + sub-ledger leaf
--   * `set_party_primary_ledger(...)` — re-map a party to a different
--     control account (Trade Payables → Vendor Advances, etc.)
--   * `get_itc_intelligence(...)` — available / claimed / unclaimed /
--     blocked / leakage roll-up
--
-- Re-runnable. No data loss.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Journal header columns ───────────────────────────────────────────────
-- All nullable so legacy journals (existing rows + auto-generated journals
-- from invoices/bills/etc) keep working without backfill.
ALTER TABLE journals
  ADD COLUMN IF NOT EXISTS posting_date       DATE,
  ADD COLUMN IF NOT EXISTS voucher_type       TEXT,
  ADD COLUMN IF NOT EXISTS reference_number   TEXT,
  ADD COLUMN IF NOT EXISTS cost_center_id     UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS branch_id          UUID,
  ADD COLUMN IF NOT EXISTS project_id         UUID;

-- Voucher-type whitelist. Standard Tally-style codes; SMEs typically use
-- Payment / Receipt / Contra / Journal / Sales / Purchase / Credit Note /
-- Debit Note. Extra codes added for ERP completeness.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'journals' AND constraint_name = 'journals_voucher_type_chk'
  ) THEN
    ALTER TABLE journals
      ADD CONSTRAINT journals_voucher_type_chk CHECK (
        voucher_type IS NULL OR voucher_type IN (
          'Journal', 'Payment', 'Receipt', 'Contra',
          'Sales', 'Purchase', 'Credit Note', 'Debit Note',
          'Stock Journal', 'Adjustment', 'Opening Balance',
          'Depreciation', 'Provision', 'Reversal'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_journals_voucher_type
  ON journals (user_id, voucher_type)
  WHERE voucher_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_journals_reference_number
  ON journals (user_id, reference_number)
  WHERE reference_number IS NOT NULL;

-- ── 2. Journal attachments ──────────────────────────────────────────────────
-- One row per uploaded supporting document for a journal entry. Stores the
-- public URL (Supabase storage) plus minimal metadata.
CREATE TABLE IF NOT EXISTS journal_attachments (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  journal_id   UUID NOT NULL REFERENCES journals(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL,
  file_name    TEXT NOT NULL,
  file_url     TEXT NOT NULL,
  mime_type    TEXT,
  size_bytes   BIGINT,
  uploaded_by  TEXT,
  uploaded_at  TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE journal_attachments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'journal_attachments'
      AND policyname = 'journal_attachments_owner'
  ) THEN
    CREATE POLICY journal_attachments_owner ON journal_attachments
      FOR ALL USING (
        user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_journal_attachments_journal
  ON journal_attachments (journal_id);

-- ── 3. GSTR-2A normalized tables ────────────────────────────────────────────
-- The portal returns 2A data per supplier with nested invoices. We persist
-- it normalized so the recon engine can SUM-by quickly.
CREATE TABLE IF NOT EXISTS gstr2a_uploads (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id              TEXT NOT NULL,
  period               TEXT,                          -- YYYY-MM
  file_name            TEXT,
  uploaded_at          TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),

  -- Summary roll-up (denorm for fast list views)
  portal_invoice_count INTEGER DEFAULT 0,
  portal_taxable_value DECIMAL(14,2) DEFAULT 0,
  portal_total_igst    DECIMAL(14,2) DEFAULT 0,
  portal_total_cgst    DECIMAL(14,2) DEFAULT 0,
  portal_total_sgst    DECIMAL(14,2) DEFAULT 0,
  portal_total_cess    DECIMAL(14,2) DEFAULT 0,

  raw_json             JSONB,                         -- audit trail
  created_at           TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE gstr2a_uploads ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'gstr2a_uploads' AND policyname = 'gstr2a_uploads_owner'
  ) THEN
    CREATE POLICY gstr2a_uploads_owner ON gstr2a_uploads
      FOR ALL USING (
        user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_gstr2a_uploads_period
  ON gstr2a_uploads (user_id, period);

-- Per-invoice rows for 2A. Allows fast supplier-level + filing-status diffs.
CREATE TABLE IF NOT EXISTS gstr2a_invoices (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  upload_id       UUID REFERENCES gstr2a_uploads(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL,
  period          TEXT,
  supplier_gstin  TEXT,
  supplier_name   TEXT,
  invoice_number  TEXT,
  invoice_date    DATE,
  invoice_value   DECIMAL(14,2) DEFAULT 0,
  taxable_value   DECIMAL(14,2) DEFAULT 0,
  igst            DECIMAL(14,2) DEFAULT 0,
  cgst            DECIMAL(14,2) DEFAULT 0,
  sgst            DECIMAL(14,2) DEFAULT 0,
  cess            DECIMAL(14,2) DEFAULT 0,
  place_of_supply TEXT,
  filing_status   TEXT,                              -- 'Filed' / 'Pending' / 'Cancelled'
  filing_date     DATE,
  invoice_type    TEXT,                              -- 'B2B' / 'B2BA' / 'CDN' / etc.
  created_at      TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE gstr2a_invoices ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'gstr2a_invoices' AND policyname = 'gstr2a_invoices_owner'
  ) THEN
    CREATE POLICY gstr2a_invoices_owner ON gstr2a_invoices
      FOR ALL USING (
        user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_gstr2a_invoices_period
  ON gstr2a_invoices (user_id, period);
CREATE INDEX IF NOT EXISTS idx_gstr2a_invoices_supplier
  ON gstr2a_invoices (user_id, supplier_gstin);
CREATE INDEX IF NOT EXISTS idx_gstr2a_invoices_invoice
  ON gstr2a_invoices (user_id, invoice_number);

-- Per-invoice rows for 2B (normalized from the raw_json blob). Mirrors 2A
-- with the addition of an `itc_eligible` flag so the recon engine can route
-- ineligible ITC into the blocked bucket.
CREATE TABLE IF NOT EXISTS gstr2b_invoices (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  upload_id       UUID REFERENCES gstr2b_uploads(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL,
  period          TEXT,
  supplier_gstin  TEXT,
  supplier_name   TEXT,
  invoice_number  TEXT,
  invoice_date    DATE,
  invoice_value   DECIMAL(14,2) DEFAULT 0,
  taxable_value   DECIMAL(14,2) DEFAULT 0,
  igst            DECIMAL(14,2) DEFAULT 0,
  cgst            DECIMAL(14,2) DEFAULT 0,
  sgst            DECIMAL(14,2) DEFAULT 0,
  cess            DECIMAL(14,2) DEFAULT 0,
  itc_eligible    BOOLEAN DEFAULT TRUE,
  itc_reversed    BOOLEAN DEFAULT FALSE,
  invoice_type    TEXT,
  filing_status   TEXT,
  created_at      TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE gstr2b_invoices ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'gstr2b_invoices' AND policyname = 'gstr2b_invoices_owner'
  ) THEN
    CREATE POLICY gstr2b_invoices_owner ON gstr2b_invoices
      FOR ALL USING (
        user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_gstr2b_invoices_period
  ON gstr2b_invoices (user_id, period);
CREATE INDEX IF NOT EXISTS idx_gstr2b_invoices_supplier
  ON gstr2b_invoices (user_id, supplier_gstin);
CREATE INDEX IF NOT EXISTS idx_gstr2b_invoices_invoice
  ON gstr2b_invoices (user_id, invoice_number);

-- ── 4. Manual journal posting RPC with full validations ─────────────────────
-- Wraps `post_journal` (20260507) with the validations the UI needs:
--   * journal_number unique per user (auto-generated if blank)
--   * total debits = total credits (handled by post_journal too)
--   * journal_date / posting_date period not locked (handled by trigger but
--     this RPC also pre-checks so the error message is friendly)
--   * each account_id is_active AND is_group=FALSE (leaf) AND
--     allow_manual_journals=TRUE
--   * at least 2 lines, at least one debit + one credit
CREATE OR REPLACE FUNCTION post_manual_journal(
  p_user_id         TEXT,
  p_journal_number  TEXT,                            -- pass NULL or '' to auto-generate
  p_journal_date    DATE,
  p_posting_date    DATE,
  p_voucher_type    TEXT,
  p_reference_no    TEXT,
  p_narration       TEXT,
  p_cost_center_id  UUID,
  p_branch_id       UUID,
  p_project_id      UUID,
  p_notes           TEXT,
  p_lines           JSONB,                           -- same shape as post_journal.p_lines
  p_status          TEXT DEFAULT 'posted',
  p_posted_by       TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_journal_id      UUID;
  v_journal_number  TEXT;
  v_line_count      INTEGER;
  v_debit_count     INTEGER;
  v_credit_count    INTEGER;
  v_total_dr        NUMERIC;
  v_total_cr        NUMERIC;
  v_inactive_count  INTEGER;
  v_group_count     INTEGER;
  v_disallowed_cnt  INTEGER;
  v_exists          INTEGER;
BEGIN
  IF p_lines IS NULL OR jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'Journal must have at least 2 lines.'
      USING ERRCODE = '23514';
  END IF;

  -- Line aggregates from input payload.
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE COALESCE((line ->> 'debit')::numeric,  0) > 0),
    COUNT(*) FILTER (WHERE COALESCE((line ->> 'credit')::numeric, 0) > 0),
    COALESCE(SUM(COALESCE((line ->> 'debit')::numeric,  0)), 0),
    COALESCE(SUM(COALESCE((line ->> 'credit')::numeric, 0)), 0)
  INTO v_line_count, v_debit_count, v_credit_count, v_total_dr, v_total_cr
  FROM jsonb_array_elements(p_lines) AS line;

  IF v_debit_count = 0 OR v_credit_count = 0 THEN
    RAISE EXCEPTION 'Journal must have at least one debit and one credit line.'
      USING ERRCODE = '23514';
  END IF;

  IF abs(v_total_dr - v_total_cr) > 0.01 THEN
    RAISE EXCEPTION 'Unbalanced journal: total debit %, total credit %, diff %.',
      v_total_dr, v_total_cr, (v_total_dr - v_total_cr)
      USING ERRCODE = '23514';
  END IF;

  -- Validate all referenced accounts in one shot.
  WITH refs AS (
    SELECT DISTINCT (line ->> 'account_id')::uuid AS account_id
    FROM jsonb_array_elements(p_lines) AS line
    WHERE line ->> 'account_id' IS NOT NULL
  )
  SELECT
    COUNT(*) FILTER (WHERE a.is_active = FALSE),
    COUNT(*) FILTER (WHERE a.is_group   = TRUE),
    COUNT(*) FILTER (WHERE COALESCE(a.allow_manual_journals, TRUE) = FALSE)
  INTO v_inactive_count, v_group_count, v_disallowed_cnt
  FROM refs r
  JOIN accounts a ON a.id = r.account_id AND a.user_id = p_user_id;

  IF v_inactive_count > 0 THEN
    RAISE EXCEPTION 'Journal references % inactive ledger account(s). Activate them or pick a different account.', v_inactive_count
      USING ERRCODE = '23514';
  END IF;
  IF v_group_count > 0 THEN
    RAISE EXCEPTION 'Cannot post to group/control accounts (% line(s)). Pick a leaf ledger.', v_group_count
      USING ERRCODE = '23514';
  END IF;
  IF v_disallowed_cnt > 0 THEN
    RAISE EXCEPTION '% ledger account(s) are flagged "do not allow manual journals" (auto-posted only). Use the source module instead.', v_disallowed_cnt
      USING ERRCODE = '23514';
  END IF;

  -- Period-lock pre-check (also enforced by the journals trigger, but this
  -- gives the UI a cleaner error message).
  IF is_period_locked(p_user_id, p_journal_date) THEN
    RAISE EXCEPTION 'Period covering journal date % is locked. Unlock the period before posting.', p_journal_date
      USING ERRCODE = '23514';
  END IF;
  IF p_posting_date IS NOT NULL AND p_posting_date <> p_journal_date
     AND is_period_locked(p_user_id, p_posting_date) THEN
    RAISE EXCEPTION 'Period covering posting date % is locked.', p_posting_date
      USING ERRCODE = '23514';
  END IF;

  -- Resolve / generate journal number.
  IF p_journal_number IS NULL OR length(trim(p_journal_number)) = 0 THEN
    v_journal_number := COALESCE(p_voucher_type, 'JV') || '-' ||
                        to_char(COALESCE(p_journal_date, CURRENT_DATE), 'YYYYMM') || '-' ||
                        lpad(((extract(epoch FROM clock_timestamp())::bigint) % 1000000)::text, 6, '0');
  ELSE
    v_journal_number := trim(p_journal_number);
    SELECT COUNT(*) INTO v_exists FROM journals
     WHERE user_id = p_user_id AND journal_number = v_journal_number;
    IF v_exists > 0 THEN
      RAISE EXCEPTION 'Journal number % already exists for this user.', v_journal_number
        USING ERRCODE = '23505';
    END IF;
  END IF;

  -- Reuse the hardened post_journal helper for the actual insert. We pass
  -- source_type='manual' so the journal is correctly tagged and benefits
  -- from the idempotency / append-only guards.
  v_journal_id := post_journal(
    p_user_id         := p_user_id,
    p_journal_date    := p_journal_date,
    p_narration       := COALESCE(p_narration, ''),
    p_source_type     := 'manual',
    p_source_id       := NULL,
    p_idempotency_key := NULL,
    p_lines           := p_lines,
    p_journal_number  := v_journal_number,
    p_status          := COALESCE(p_status, 'posted'),
    p_posted_by       := p_posted_by,
    p_notes           := p_notes
  );

  -- Stamp the header fields that post_journal doesn't know about.
  UPDATE journals
     SET posting_date     = COALESCE(p_posting_date, p_journal_date),
         voucher_type     = COALESCE(p_voucher_type, 'Journal'),
         reference_number = p_reference_no,
         cost_center_id   = p_cost_center_id,
         branch_id        = p_branch_id,
         project_id       = p_project_id
   WHERE id = v_journal_id;

  -- Apply header-level cost center / branch / project to every line that
  -- did not specify its own (so reports rolled up by CC/branch/project work
  -- without the user filling each line).
  UPDATE journal_lines jl
     SET cost_center_id = COALESCE(jl.cost_center_id, p_cost_center_id),
         branch_id      = COALESCE(jl.branch_id,      p_branch_id),
         project_id     = COALESCE(jl.project_id,     p_project_id)
   WHERE jl.journal_id = v_journal_id;

  RETURN v_journal_id;
END;
$$;

GRANT EXECUTE ON FUNCTION post_manual_journal(
  TEXT, TEXT, DATE, DATE, TEXT, TEXT, TEXT, UUID, UUID, UUID, TEXT, JSONB, TEXT, TEXT
) TO anon, authenticated;

-- ── 5. List journals (with header + drilldown lines) ────────────────────────
CREATE OR REPLACE FUNCTION get_journals_list(
  p_user_id   TEXT,
  p_from_date DATE,
  p_to_date   DATE,
  p_voucher   TEXT DEFAULT NULL,
  p_search    TEXT DEFAULT NULL,
  p_limit     INTEGER DEFAULT 200
) RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH js AS (
    SELECT
      j.id,
      j.journal_number,
      j.journal_date,
      j.posting_date,
      j.voucher_type,
      j.reference_number,
      j.narration,
      j.status,
      j.is_reversed,
      j.source_type,
      j.source_id,
      j.total_debit,
      j.total_credit,
      j.cost_center_id,
      j.branch_id,
      j.project_id,
      j.created_at,
      (SELECT COUNT(*) FROM journal_lines jl WHERE jl.journal_id = j.id) AS line_count,
      (SELECT COUNT(*) FROM journal_attachments ja WHERE ja.journal_id = j.id) AS attachment_count
    FROM journals j
    WHERE j.user_id = p_user_id
      AND j.journal_date BETWEEN p_from_date AND p_to_date
      AND (p_voucher IS NULL OR j.voucher_type = p_voucher)
      AND (
        p_search IS NULL
        OR j.journal_number   ILIKE '%' || p_search || '%'
        OR j.reference_number ILIKE '%' || p_search || '%'
        OR j.narration        ILIKE '%' || p_search || '%'
      )
    ORDER BY j.journal_date DESC, j.created_at DESC
    LIMIT p_limit
  )
  SELECT jsonb_build_object(
    'from_date', p_from_date,
    'to_date',   p_to_date,
    'count',     (SELECT COUNT(*) FROM js),
    'journals',  COALESCE((SELECT jsonb_agg(to_jsonb(js)) FROM js), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_journals_list(TEXT, DATE, DATE, TEXT, TEXT, INTEGER) TO anon, authenticated;

-- ── 6. Sub-ledger directory + party re-mapping ──────────────────────────────
CREATE OR REPLACE FUNCTION get_subledger_directory(p_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH vendor_dir AS (
    SELECT
      'vendor'::text                      AS party_type,
      v.id                                AS party_id,
      v.name                              AS party_name,
      v.gstin                             AS gstin,
      v.primary_ledger_account_id         AS primary_ledger_id,
      pa.account_code                     AS primary_code,
      pa.account_name                     AS primary_name,
      v.subledger_account_id              AS subledger_id,
      sa.account_code                     AS subledger_code,
      sa.account_name                     AS subledger_name,
      COALESCE((
        SELECT SUM(jl.credit - jl.debit)
        FROM journal_lines jl
        JOIN journals j ON j.id = jl.journal_id AND j.status = 'posted'
        WHERE jl.user_id = p_user_id AND jl.vendor_id = v.id
      ), 0)                               AS balance
    FROM vendors v
    LEFT JOIN accounts pa ON pa.id = v.primary_ledger_account_id
    LEFT JOIN accounts sa ON sa.id = v.subledger_account_id
    WHERE v.user_id = p_user_id
  ),
  client_dir AS (
    SELECT
      'customer'::text                    AS party_type,
      c.id                                AS party_id,
      c.name                              AS party_name,
      c.gstin                             AS gstin,
      c.primary_ledger_account_id         AS primary_ledger_id,
      pa.account_code                     AS primary_code,
      pa.account_name                     AS primary_name,
      c.subledger_account_id              AS subledger_id,
      sa.account_code                     AS subledger_code,
      sa.account_name                     AS subledger_name,
      COALESCE((
        SELECT SUM(jl.debit - jl.credit)
        FROM journal_lines jl
        JOIN journals j ON j.id = jl.journal_id AND j.status = 'posted'
        WHERE jl.user_id = p_user_id AND jl.customer_id = c.id
      ), 0)                               AS balance
    FROM clients c
    LEFT JOIN accounts pa ON pa.id = c.primary_ledger_account_id
    LEFT JOIN accounts sa ON sa.id = c.subledger_account_id
    WHERE c.user_id = p_user_id
  ),
  control_options AS (
    SELECT account_type, jsonb_agg(
             jsonb_build_object(
               'id',           id,
               'account_code', account_code,
               'account_name', account_name,
               'account_type', account_type
             ) ORDER BY account_code
           ) AS opts
    FROM accounts
    WHERE user_id = p_user_id
      AND is_active = TRUE
      AND COALESCE(account_subgroup, '') IN (
        'Trade Payables', 'Vendor Advances', 'Trade Receivables', 'Customer Advances'
      )
    GROUP BY account_type
  )
  SELECT jsonb_build_object(
    'vendors',   COALESCE((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.party_name) FROM vendor_dir v), '[]'::jsonb),
    'customers', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.party_name) FROM client_dir c), '[]'::jsonb),
    'control_options', COALESCE((
      SELECT jsonb_object_agg(account_type, opts) FROM control_options
    ), '{}'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_subledger_directory(TEXT) TO anon, authenticated;

-- Re-map a vendor or customer to a different primary control account.
-- Use case: a Trade-Payables vendor becomes a Vendor-Advances party because
-- the engagement model changed. The sub-ledger leaf account stays the same.
CREATE OR REPLACE FUNCTION set_party_primary_ledger(
  p_user_id    TEXT,
  p_party_type TEXT,
  p_party_id   UUID,
  p_account_id UUID
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_account accounts%ROWTYPE;
BEGIN
  IF p_party_type NOT IN ('vendor', 'customer') THEN
    RAISE EXCEPTION 'party_type must be vendor or customer';
  END IF;
  SELECT * INTO v_account FROM accounts
   WHERE id = p_account_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found for this user';
  END IF;
  IF v_account.is_active = FALSE THEN
    RAISE EXCEPTION 'Account is inactive';
  END IF;

  IF p_party_type = 'vendor' THEN
    UPDATE vendors SET primary_ledger_account_id = p_account_id
     WHERE id = p_party_id AND user_id = p_user_id;
  ELSE
    UPDATE clients SET primary_ledger_account_id = p_account_id
     WHERE id = p_party_id AND user_id = p_user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION set_party_primary_ledger(TEXT, TEXT, UUID, UUID) TO anon, authenticated;

-- ── 7. GSTR-2A dashboard ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_gstr2a_dashboard(
  p_user_id TEXT,
  p_period  TEXT DEFAULT NULL                        -- YYYY-MM
)
RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_result JSONB;
  v_period TEXT := COALESCE(p_period, to_char(CURRENT_DATE, 'YYYY-MM'));
BEGIN
  WITH inv AS (
    SELECT * FROM gstr2a_invoices
     WHERE user_id = p_user_id AND period = v_period
  ),
  summary AS (
    SELECT
      COUNT(*)                                AS invoice_count,
      COALESCE(SUM(taxable_value), 0)         AS taxable_value,
      COALESCE(SUM(igst + cgst + sgst + cess), 0) AS total_gst,
      COALESCE(SUM(igst), 0)                  AS igst,
      COALESCE(SUM(cgst), 0)                  AS cgst,
      COALESCE(SUM(sgst), 0)                  AS sgst,
      COALESCE(SUM(cess), 0)                  AS cess,
      COUNT(*) FILTER (WHERE COALESCE(filing_status, '') = 'Filed')   AS filed_count,
      COUNT(*) FILTER (WHERE COALESCE(filing_status, '') <> 'Filed')  AS pending_count
    FROM inv
  ),
  by_supplier AS (
    SELECT
      COALESCE(supplier_gstin, '—')           AS gstin,
      COALESCE(supplier_name, '—')            AS supplier,
      COUNT(*)                                AS invoice_count,
      COALESCE(SUM(taxable_value), 0)         AS taxable_value,
      COALESCE(SUM(igst + cgst + sgst + cess), 0) AS total_gst,
      COUNT(*) FILTER (WHERE COALESCE(filing_status, '') = 'Filed')  AS filed_count,
      COUNT(*) FILTER (WHERE COALESCE(filing_status, '') <> 'Filed') AS pending_count
    FROM inv
    GROUP BY supplier_gstin, supplier_name
    ORDER BY total_gst DESC
  )
  SELECT jsonb_build_object(
    'period',     v_period,
    'summary',    (SELECT to_jsonb(summary) FROM summary),
    'suppliers',  COALESCE((SELECT jsonb_agg(to_jsonb(by_supplier)) FROM by_supplier), '[]'::jsonb),
    'invoices',   COALESCE((SELECT jsonb_agg(to_jsonb(inv) ORDER BY inv.invoice_date DESC NULLS LAST) FROM inv), '[]'::jsonb),
    'computed_at', NOW()
  ) INTO v_result;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_gstr2a_dashboard(TEXT, TEXT) TO anon, authenticated;

-- ── 8. Three-way GST Reconciliation: Books vs 2A vs 2B ──────────────────────
-- For each (supplier_gstin, invoice_number) key, returns the three legs and
-- a status code identifying where the discrepancy is. Books are sourced from
-- the existing `expenses` table (the GST capture layer for purchase bills).
CREATE OR REPLACE FUNCTION get_three_way_gst_reconciliation(
  p_user_id TEXT,
  p_period  TEXT
) RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH books AS (
    SELECT
      COALESCE(NULLIF(trim(e.vendor_gstin), ''), '—')      AS gstin,
      COALESCE(NULLIF(trim(e.vendor_name),  ''), 'Unknown') AS supplier,
      COALESCE(NULLIF(trim(e.invoice_number), ''),
               'EXP-' || substring(e.id::text, 1, 8))      AS invoice_number,
      e.expense_date                                       AS invoice_date,
      COALESCE(e.amount, 0)                                AS taxable_value,
      COALESCE(e.cgst, 0) + COALESCE(e.sgst, 0)
        + COALESCE(e.igst, 0) + COALESCE(e.cess, 0)        AS gst
    FROM expenses e
    WHERE e.user_id = p_user_id
      AND e.expense_date IS NOT NULL
      AND to_char(e.expense_date, 'YYYY-MM') = p_period
  ),
  twoa AS (
    SELECT
      COALESCE(NULLIF(trim(supplier_gstin), ''), '—')       AS gstin,
      COALESCE(NULLIF(trim(supplier_name),  ''), 'Unknown') AS supplier,
      COALESCE(NULLIF(trim(invoice_number), ''), '—')       AS invoice_number,
      invoice_date,
      taxable_value,
      igst + cgst + sgst + cess                              AS gst,
      filing_status
    FROM gstr2a_invoices
    WHERE user_id = p_user_id AND period = p_period
  ),
  twob AS (
    SELECT
      COALESCE(NULLIF(trim(supplier_gstin), ''), '—')       AS gstin,
      COALESCE(NULLIF(trim(supplier_name),  ''), 'Unknown') AS supplier,
      COALESCE(NULLIF(trim(invoice_number), ''), '—')       AS invoice_number,
      invoice_date,
      taxable_value,
      igst + cgst + sgst + cess                              AS gst,
      itc_eligible
    FROM gstr2b_invoices
    WHERE user_id = p_user_id AND period = p_period
  ),
  keys AS (
    SELECT gstin, invoice_number FROM books
    UNION
    SELECT gstin, invoice_number FROM twoa
    UNION
    SELECT gstin, invoice_number FROM twob
  ),
  joined AS (
    SELECT
      k.gstin,
      k.invoice_number,
      b.supplier      AS supplier_books,
      a.supplier      AS supplier_2a,
      v.supplier      AS supplier_2b,
      b.invoice_date  AS date_books,
      a.invoice_date  AS date_2a,
      v.invoice_date  AS date_2b,
      b.taxable_value AS tv_books,
      a.taxable_value AS tv_2a,
      v.taxable_value AS tv_2b,
      b.gst           AS gst_books,
      a.gst           AS gst_2a,
      v.gst           AS gst_2b,
      a.filing_status,
      v.itc_eligible,
      (b.gstin IS NOT NULL OR b.invoice_number IS NOT NULL) AS in_books_marker,
      (a.gstin IS NOT NULL OR a.invoice_number IS NOT NULL) AS in_2a_marker,
      (v.gstin IS NOT NULL OR v.invoice_number IS NOT NULL) AS in_2b_marker
    FROM keys k
    LEFT JOIN books b ON b.gstin = k.gstin AND b.invoice_number = k.invoice_number
    LEFT JOIN twoa  a ON a.gstin = k.gstin AND a.invoice_number = k.invoice_number
    LEFT JOIN twob  v ON v.gstin = k.gstin AND v.invoice_number = k.invoice_number
  ),
  diff AS (
    SELECT
      gstin,
      invoice_number,
      COALESCE(supplier_books, supplier_2a, supplier_2b) AS supplier,
      date_books, date_2a, date_2b,
      tv_books, tv_2a, tv_2b,
      gst_books, gst_2a, gst_2b,
      filing_status,
      itc_eligible,
      (supplier_books IS NOT NULL) AS in_books,
      (supplier_2a    IS NOT NULL) AS in_2a,
      (supplier_2b    IS NOT NULL) AS in_2b,
      CASE
        WHEN supplier_books IS NOT NULL AND supplier_2a IS NULL AND supplier_2b IS NULL
          THEN 'MISSING_IN_PORTAL'
        WHEN supplier_books IS NULL AND (supplier_2a IS NOT NULL OR supplier_2b IS NOT NULL)
          THEN 'MISSING_IN_BOOKS'
        WHEN supplier_2a IS NULL AND supplier_2b IS NOT NULL AND supplier_books IS NOT NULL
          THEN 'IN_2B_NOT_2A'
        WHEN supplier_2b IS NULL AND supplier_2a IS NOT NULL AND supplier_books IS NOT NULL
          THEN 'SUPPLIER_NOT_FILED'
        WHEN abs(COALESCE(gst_books, 0) - COALESCE(gst_2b, 0)) > 1
          THEN 'GST_MISMATCH'
        WHEN abs(COALESCE(tv_books, 0) - COALESCE(tv_2b, 0)) > 1
          THEN 'VALUE_MISMATCH'
        WHEN COALESCE(itc_eligible, TRUE) = FALSE
          THEN 'ITC_BLOCKED'
        ELSE 'MATCHED'
      END AS reco_status
    FROM joined
  ),
  dupes AS (
    SELECT
      gstin, invoice_number,
      COUNT(*) AS dup_count
    FROM books
    GROUP BY gstin, invoice_number
    HAVING COUNT(*) > 1
  ),
  summary AS (
    SELECT
      COUNT(*)                                                    AS total_rows,
      COUNT(*) FILTER (WHERE reco_status = 'MATCHED')             AS matched,
      COUNT(*) FILTER (WHERE reco_status = 'MISSING_IN_PORTAL')   AS missing_in_portal,
      COUNT(*) FILTER (WHERE reco_status = 'MISSING_IN_BOOKS')    AS missing_in_books,
      COUNT(*) FILTER (WHERE reco_status = 'IN_2B_NOT_2A')        AS in_2b_not_2a,
      COUNT(*) FILTER (WHERE reco_status = 'SUPPLIER_NOT_FILED')  AS supplier_not_filed,
      COUNT(*) FILTER (WHERE reco_status = 'GST_MISMATCH')        AS gst_mismatch,
      COUNT(*) FILTER (WHERE reco_status = 'VALUE_MISMATCH')      AS value_mismatch,
      COUNT(*) FILTER (WHERE reco_status = 'ITC_BLOCKED')         AS itc_blocked,
      COALESCE(SUM(gst_books), 0)                                 AS books_gst,
      COALESCE(SUM(gst_2a), 0)                                    AS gst_2a_total,
      COALESCE(SUM(gst_2b), 0)                                    AS gst_2b_total,
      (SELECT COUNT(*) FROM dupes)                                AS duplicate_invoices
    FROM diff
  )
  SELECT jsonb_build_object(
    'period',     p_period,
    'summary',    (SELECT to_jsonb(summary) FROM summary),
    'rows',       COALESCE((
      SELECT jsonb_agg(to_jsonb(diff) ORDER BY
        CASE diff.reco_status
          WHEN 'MISSING_IN_PORTAL'  THEN 1
          WHEN 'MISSING_IN_BOOKS'   THEN 2
          WHEN 'GST_MISMATCH'       THEN 3
          WHEN 'VALUE_MISMATCH'     THEN 4
          WHEN 'ITC_BLOCKED'        THEN 5
          WHEN 'IN_2B_NOT_2A'       THEN 6
          WHEN 'SUPPLIER_NOT_FILED' THEN 7
          ELSE 99
        END,
        diff.supplier
      ) FROM diff
    ), '[]'::jsonb),
    'duplicates', COALESCE((SELECT jsonb_agg(to_jsonb(dupes)) FROM dupes), '[]'::jsonb),
    'computed_at', NOW()
  ) INTO v_result;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_three_way_gst_reconciliation(TEXT, TEXT) TO anon, authenticated;

-- ── 9. ITC Intelligence ─────────────────────────────────────────────────────
-- Available / Claimed / Unclaimed / Blocked / Leakage at-a-glance, per FY.
-- Sources:
--   • Available  = SUM(gst_2b)                              (eligible portal ITC)
--   • Claimed    = SUM(itc) on Asset-type accounts with tax_type='itc'
--                  in journal_lines for the period            (books)
--   • Blocked    = SUM(2b GST where itc_eligible = FALSE)
--   • Unclaimed  = Available − Claimed − Blocked (>= 0)
--   • Leakage    = unmatched_books_only_gst (in books not in 2B)
CREATE OR REPLACE FUNCTION get_itc_intelligence(
  p_user_id     TEXT,
  p_fiscal_year TEXT                                  -- e.g. '2025-26'
) RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_fy_start DATE;
  v_fy_end   DATE;
  v_periods  TEXT[];
  v_result   JSONB;
BEGIN
  v_fy_start := make_date(substring(p_fiscal_year, 1, 4)::int, 4, 1);
  v_fy_end   := (make_date(substring(p_fiscal_year, 1, 4)::int + 1, 4, 1) - 1);

  WITH twob AS (
    SELECT
      COALESCE(SUM(igst + cgst + sgst + cess), 0)              AS available,
      COALESCE(SUM(igst + cgst + sgst + cess)
        FILTER (WHERE itc_eligible = FALSE), 0)                AS blocked
    FROM gstr2b_invoices
    WHERE user_id = p_user_id
      AND invoice_date BETWEEN v_fy_start AND v_fy_end
  ),
  claimed AS (
    SELECT COALESCE(SUM(jl.debit - jl.credit), 0)              AS claimed
    FROM journal_lines jl
    JOIN journals j ON j.id = jl.journal_id AND j.status = 'posted'
    JOIN accounts a ON a.id = jl.account_id
    WHERE jl.user_id = p_user_id
      AND jl.entry_date BETWEEN v_fy_start AND v_fy_end
      AND (jl.tax_type = 'itc'
           OR (a.account_type = 'Asset'
               AND (a.account_name ILIKE '%itc%'
                 OR a.account_name ILIKE '%input gst%'
                 OR a.account_name ILIKE '%input tax credit%')))
  ),
  books_gst AS (
    SELECT COALESCE(SUM(COALESCE(e.cgst, 0) + COALESCE(e.sgst, 0)
                       + COALESCE(e.igst, 0) + COALESCE(e.cess, 0)), 0) AS gst
    FROM expenses e
    WHERE e.user_id = p_user_id
      AND e.expense_date BETWEEN v_fy_start AND v_fy_end
  ),
  twob_total AS (
    SELECT COALESCE(SUM(igst + cgst + sgst + cess), 0) AS gst
    FROM gstr2b_invoices
    WHERE user_id = p_user_id
      AND invoice_date BETWEEN v_fy_start AND v_fy_end
  )
  SELECT jsonb_build_object(
    'fiscal_year', p_fiscal_year,
    'fy_start',    v_fy_start,
    'fy_end',      v_fy_end,
    'available',   (SELECT available FROM twob),
    'claimed',     (SELECT claimed FROM claimed),
    'blocked',     (SELECT blocked FROM twob),
    'unclaimed',   GREATEST(
      (SELECT available FROM twob) - (SELECT claimed FROM claimed) - (SELECT blocked FROM twob), 0
    ),
    'leakage',     GREATEST((SELECT gst FROM books_gst) - (SELECT gst FROM twob_total), 0),
    'computed_at', NOW()
  ) INTO v_result;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_itc_intelligence(TEXT, TEXT) TO anon, authenticated;

-- ── 10. Final: PostgREST schema reload ──────────────────────────────────────
NOTIFY pgrst, 'reload schema';

COMMENT ON COLUMN journals.posting_date     IS 'Effective posting date for accounting; defaults to journal_date when not provided.';
COMMENT ON COLUMN journals.voucher_type     IS 'Tally-style voucher classification: Journal / Payment / Receipt / Contra / Sales / Purchase / Credit Note / Debit Note / etc.';
COMMENT ON COLUMN journals.reference_number IS 'External reference (cheque #, bill #, ack #, etc.) — searchable.';
COMMENT ON COLUMN journals.cost_center_id   IS 'Header-level cost center. Cascades to lines that did not specify their own.';
COMMENT ON COLUMN journals.branch_id        IS 'Header-level branch. Cascades to lines.';
COMMENT ON COLUMN journals.project_id       IS 'Header-level project. Cascades to lines.';

COMMENT ON FUNCTION post_manual_journal IS
  'Manual JE entry: validates balance, unique number, unlocked period, active/leaf/manual-allowed accounts. Calls post_journal under the hood for idempotent insert.';
COMMENT ON FUNCTION get_three_way_gst_reconciliation IS
  'Books (expenses) vs GSTR-2A vs GSTR-2B diff for a YYYY-MM period. Returns per-row reco_status + roll-up counts.';
