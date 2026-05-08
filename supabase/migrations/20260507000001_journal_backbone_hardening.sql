-- ════════════════════════════════════════════════════════════════════════════
-- Journal backbone hardening
-- Brief item #2 (journal-driven accounting) + foundation for #3, #7, #14, #15
--
-- Adds the missing pieces to make `journals` / `journal_lines` a true
-- general ledger that every AP/AR/inventory action flows through:
--
--   * Source-document linkage on `journals` (source_type / source_id /
--     idempotency_key) so we can drill journal → bill / payment / expense
--     and prevent duplicate postings on retry.
--   * Reversal pointer (reverses_journal_id / is_reversed) for amendments &
--     voids without violating the append-only rule.
--   * Sub-ledger tags on `journal_lines` (vendor_id, customer_id,
--     cost_center_id, project_id, branch_id, department, tax_type,
--     entry_date) so vendor / cost-center / project drill-throughs are
--     simple SUM-by queries instead of recomputing from source tables.
--   * Append-only enforcement on posted journals.
--   * Period-lock enforcement on `journals` (matches existing guard on
--     bills / expenses / payments / advances).
--   * v_trial_balance, v_gl_movements, v_vendor_subledger views grounded
--     in journal_lines — these become the single source of truth for
--     reports going forward.
--
-- Safe re-runnable. Backfills entry_date for existing rows.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Source linkage + reversal on journals ────────────────────────────────
ALTER TABLE journals
  ADD COLUMN IF NOT EXISTS source_type           TEXT,
  ADD COLUMN IF NOT EXISTS source_id             UUID,
  ADD COLUMN IF NOT EXISTS idempotency_key       TEXT,
  ADD COLUMN IF NOT EXISTS reverses_journal_id   UUID REFERENCES journals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_reversed           BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS posted_by             TEXT,
  ADD COLUMN IF NOT EXISTS posted_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notes                 TEXT;

-- Source-type whitelist. Kept liberal so future modules (recurring, accrual,
-- adjustment journal, RCM self-invoice, etc.) drop in without a migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'journals' AND constraint_name = 'journals_source_type_chk'
  ) THEN
    ALTER TABLE journals
      ADD CONSTRAINT journals_source_type_chk CHECK (
        source_type IS NULL OR source_type IN (
          'bill', 'bill_reversal',
          'expense', 'expense_reversal',
          'payment', 'payment_reversal',
          'advance', 'advance_reversal',
          'advance_adjustment', 'advance_adjustment_reversal',
          'invoice', 'invoice_reversal',
          'payment_received', 'payment_received_reversal',
          'cash_memo', 'cash_memo_reversal',
          'cogs', 'cogs_reversal',
          'inventory_adjustment',
          'customer_advance', 'customer_advance_reversal',
          'customer_advance_adjustment', 'customer_advance_adjustment_reversal',
          'payment_link',
          'gst_payment',
          'tds_payment',
          'accrual', 'accrual_reversal',
          'recurring',
          'opening_balance',
          'manual',
          'reversal'
        )
      );
  END IF;
END $$;

-- Idempotency: at most one journal per (user_id, source_type, source_id).
-- Lets the app safely retry posting after a network blip without creating
-- duplicate entries.
CREATE UNIQUE INDEX IF NOT EXISTS uq_journals_source
  ON journals (user_id, source_type, source_id)
  WHERE source_id IS NOT NULL AND source_type IS NOT NULL AND is_reversed = FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_journals_idempotency_key
  ON journals (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_journals_source_lookup
  ON journals (user_id, source_type, source_id)
  WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_journals_user_date
  ON journals (user_id, journal_date);

-- ── 2. Sub-ledger tags + denormalized date on journal_lines ─────────────────
-- Denormalized entry_date avoids joining journals on every line query.
-- Sub-ledger columns are nullable; legacy rows stay null and continue to
-- work for the trial balance & GL views.
ALTER TABLE journal_lines
  ADD COLUMN IF NOT EXISTS entry_date      DATE,
  ADD COLUMN IF NOT EXISTS user_id         TEXT,
  ADD COLUMN IF NOT EXISTS vendor_id       UUID,
  ADD COLUMN IF NOT EXISTS customer_id     UUID,
  ADD COLUMN IF NOT EXISTS cost_center_id  UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_id      UUID,
  ADD COLUMN IF NOT EXISTS branch_id       UUID,
  ADD COLUMN IF NOT EXISTS department      TEXT,
  ADD COLUMN IF NOT EXISTS tax_type        TEXT,
  ADD COLUMN IF NOT EXISTS source_type     TEXT,
  ADD COLUMN IF NOT EXISTS source_id       UUID;

-- tax_type whitelist matches the GST decomposition we'll write from the
-- engine: cgst / sgst / igst / cess / rcm_input / rcm_output / itc /
-- output_gst / tds. Null for non-tax lines.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'journal_lines' AND constraint_name = 'journal_lines_tax_type_chk'
  ) THEN
    ALTER TABLE journal_lines
      ADD CONSTRAINT journal_lines_tax_type_chk CHECK (
        tax_type IS NULL OR tax_type IN (
          'cgst', 'sgst', 'igst', 'cess',
          'rcm_input', 'rcm_output',
          'itc', 'output_gst',
          'tds', 'tcs'
        )
      );
  END IF;
END $$;

-- Backfill entry_date / user_id / source_type / source_id from parent journal.
UPDATE journal_lines jl
SET entry_date  = j.journal_date,
    user_id     = j.user_id,
    source_type = j.source_type,
    source_id   = j.source_id
FROM journals j
WHERE jl.journal_id = j.id
  AND (jl.entry_date IS NULL OR jl.user_id IS NULL);

-- Trigger keeps entry_date / user_id / source_type / source_id in sync with
-- the parent journal when a new line is inserted, so the engine doesn't have
-- to remember to populate them on every insert.
CREATE OR REPLACE FUNCTION sync_journal_line_denorm()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.entry_date IS NULL OR NEW.user_id IS NULL OR NEW.source_type IS NULL OR NEW.source_id IS NULL THEN
    SELECT
      COALESCE(NEW.entry_date,  j.journal_date),
      COALESCE(NEW.user_id,     j.user_id),
      COALESCE(NEW.source_type, j.source_type),
      COALESCE(NEW.source_id,   j.source_id)
    INTO NEW.entry_date, NEW.user_id, NEW.source_type, NEW.source_id
    FROM journals j WHERE j.id = NEW.journal_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_lines_denorm ON journal_lines;
CREATE TRIGGER trg_journal_lines_denorm
  BEFORE INSERT ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION sync_journal_line_denorm();

-- Indexes for the sub-ledger / cost-center / project drill-throughs.
CREATE INDEX IF NOT EXISTS idx_journal_lines_user_account_date
  ON journal_lines (user_id, account_id, entry_date);

CREATE INDEX IF NOT EXISTS idx_journal_lines_vendor
  ON journal_lines (user_id, vendor_id, entry_date)
  WHERE vendor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_journal_lines_customer
  ON journal_lines (user_id, customer_id, entry_date)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_journal_lines_cost_center
  ON journal_lines (user_id, cost_center_id, entry_date)
  WHERE cost_center_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_journal_lines_project
  ON journal_lines (user_id, project_id, entry_date)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_journal_lines_source
  ON journal_lines (user_id, source_type, source_id)
  WHERE source_id IS NOT NULL;

-- ── 3. Append-only enforcement on posted journals ───────────────────────────
-- Posted journals must not be edited/deleted in place. Amendments go through
-- a reversal journal (engine handles this). Drafts can still be modified.
CREATE OR REPLACE FUNCTION enforce_journal_append_only()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_status TEXT;
BEGIN
  IF TG_TABLE_NAME = 'journals' THEN
    IF TG_OP = 'DELETE' THEN
      IF OLD.status = 'posted' AND COALESCE(OLD.is_reversed, FALSE) = FALSE THEN
        RAISE EXCEPTION 'Posted journal % cannot be deleted. Reverse it instead.', OLD.journal_number
          USING ERRCODE = '23514';
      END IF;
      RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
      -- Allow status flip to 'posted' (draft → posted) and reversal flag flip;
      -- otherwise block changes to a posted journal's accounting fields.
      IF OLD.status = 'posted' THEN
        IF NEW.journal_date    <> OLD.journal_date
           OR NEW.total_debit  <> OLD.total_debit
           OR NEW.total_credit <> OLD.total_credit
           OR NEW.user_id      <> OLD.user_id THEN
          RAISE EXCEPTION 'Posted journal % is append-only — reverse and re-post to amend.', OLD.journal_number
            USING ERRCODE = '23514';
        END IF;
      END IF;
      RETURN NEW;
    END IF;
  ELSIF TG_TABLE_NAME = 'journal_lines' THEN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      SELECT status INTO v_status FROM journals
       WHERE id = COALESCE(OLD.journal_id, NEW.journal_id);
      IF v_status = 'posted' THEN
        RAISE EXCEPTION 'Cannot % a line on a posted journal — reverse the journal instead.', lower(TG_OP)
          USING ERRCODE = '23514';
      END IF;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journals_append_only ON journals;
CREATE TRIGGER trg_journals_append_only
  BEFORE UPDATE OR DELETE ON journals
  FOR EACH ROW EXECUTE FUNCTION enforce_journal_append_only();

DROP TRIGGER IF EXISTS trg_journal_lines_append_only ON journal_lines;
CREATE TRIGGER trg_journal_lines_append_only
  BEFORE UPDATE OR DELETE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION enforce_journal_append_only();

-- ── 4. Period lock enforcement on journals ──────────────────────────────────
-- Mirrors the guard already in place on bills/expenses/payments/advances
-- (see migration 20260505000001_ap_complete_system.sql). Without this,
-- callers could backdate a journal into a locked period and skirt audit.
CREATE OR REPLACE FUNCTION enforce_journal_period_lock()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF is_period_locked(OLD.user_id, OLD.journal_date) THEN
      RAISE EXCEPTION 'Cannot delete journal — period covering % is locked.', OLD.journal_date
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF is_period_locked(NEW.user_id, NEW.journal_date) THEN
    RAISE EXCEPTION 'Cannot post journal — period covering % is locked.', NEW.journal_date
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_period_lock_journals ON journals;
CREATE TRIGGER trg_period_lock_journals
  BEFORE INSERT OR UPDATE OR DELETE ON journals
  FOR EACH ROW EXECUTE FUNCTION enforce_journal_period_lock();

-- ── 5. Trial balance + GL movement views ────────────────────────────────────
-- v_trial_balance — running balance per account, type-aware sign:
--   Assets/Expenses → debit-positive
--   Liabilities/Equity/Income → credit-positive
DROP VIEW IF EXISTS v_trial_balance;
CREATE VIEW v_trial_balance AS
SELECT
  a.user_id,
  a.id                 AS account_id,
  a.account_code,
  a.account_name,
  a.account_type,
  a.opening_balance,
  COALESCE(SUM(jl.debit), 0)  AS total_debit,
  COALESCE(SUM(jl.credit), 0) AS total_credit,
  CASE a.account_type
    WHEN 'Asset'     THEN a.opening_balance + COALESCE(SUM(jl.debit - jl.credit), 0)
    WHEN 'Expense'   THEN a.opening_balance + COALESCE(SUM(jl.debit - jl.credit), 0)
    WHEN 'Liability' THEN a.opening_balance + COALESCE(SUM(jl.credit - jl.debit), 0)
    WHEN 'Equity'    THEN a.opening_balance + COALESCE(SUM(jl.credit - jl.debit), 0)
    WHEN 'Income'    THEN a.opening_balance + COALESCE(SUM(jl.credit - jl.debit), 0)
  END AS closing_balance
FROM accounts a
LEFT JOIN journal_lines jl ON jl.account_id = a.id
LEFT JOIN journals j       ON j.id = jl.journal_id AND j.status = 'posted'
WHERE a.is_active
GROUP BY a.user_id, a.id, a.account_code, a.account_name, a.account_type, a.opening_balance;

-- v_gl_movements — flat, queryable view of every posted line with all the
-- denorm columns needed by the GL drill-down UI and reports.
DROP VIEW IF EXISTS v_gl_movements;
CREATE VIEW v_gl_movements AS
SELECT
  jl.id              AS line_id,
  jl.user_id,
  jl.entry_date,
  j.id               AS journal_id,
  j.journal_number,
  j.narration        AS journal_narration,
  j.source_type,
  j.source_id,
  j.status           AS journal_status,
  a.id               AS account_id,
  a.account_code,
  a.account_name,
  a.account_type,
  jl.debit,
  jl.credit,
  jl.line_narration,
  jl.tax_type,
  jl.vendor_id,
  jl.customer_id,
  jl.cost_center_id,
  jl.project_id,
  jl.branch_id,
  jl.department
FROM journal_lines jl
JOIN journals j ON j.id = jl.journal_id
JOIN accounts a ON a.id = jl.account_id
WHERE j.status = 'posted';

-- v_vendor_subledger — chronological feed per vendor, sourced from
-- journal_lines (so payments / advances / adjustments / accruals all show
-- up automatically once tagged with vendor_id by the engine).
DROP VIEW IF EXISTS v_vendor_subledger;
CREATE VIEW v_vendor_subledger AS
SELECT
  jl.user_id,
  jl.vendor_id,
  v.name              AS vendor_name,
  jl.entry_date       AS txn_date,
  j.source_type       AS txn_type,
  j.journal_number,
  j.narration,
  jl.debit,
  jl.credit,
  (jl.credit - jl.debit) AS payable_delta, -- + = increases AP, - = decreases AP
  a.account_name,
  a.account_type
FROM journal_lines jl
JOIN journals j ON j.id = jl.journal_id
JOIN accounts a ON a.id = jl.account_id
LEFT JOIN vendors v ON v.id = jl.vendor_id
WHERE j.status = 'posted'
  AND jl.vendor_id IS NOT NULL;

-- v_customer_subledger — same, AR side.
DROP VIEW IF EXISTS v_customer_subledger;
DO $build_customer_subledger$
DECLARE
  has_clients BOOLEAN := EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clients');
BEGIN
  IF has_clients THEN
    EXECUTE $sql$
      CREATE VIEW v_customer_subledger AS
      SELECT
        jl.user_id,
        jl.customer_id,
        c.name              AS customer_name,
        jl.entry_date       AS txn_date,
        j.source_type       AS txn_type,
        j.journal_number,
        j.narration,
        jl.debit,
        jl.credit,
        (jl.debit - jl.credit) AS receivable_delta,
        a.account_name,
        a.account_type
      FROM journal_lines jl
      JOIN journals j  ON j.id = jl.journal_id
      JOIN accounts a  ON a.id = jl.account_id
      LEFT JOIN clients c ON c.id = jl.customer_id
      WHERE j.status = 'posted'
        AND jl.customer_id IS NOT NULL
    $sql$;
  END IF;
END $build_customer_subledger$;

-- ── 6. Helper: post a balanced journal in one round-trip (RPC) ──────────────
-- Atomic insert of journal + lines in a single RPC. The TS engine prefers the
-- RPC because it survives client retries cleanly: the unique
-- (user_id, source_type, source_id) index guarantees idempotency, and the
-- entire write is in one transaction so partial inserts can't leave
-- unbalanced journals behind.
CREATE OR REPLACE FUNCTION post_journal(
  p_user_id          TEXT,
  p_journal_date     DATE,
  p_narration        TEXT,
  p_source_type      TEXT,
  p_source_id        UUID,
  p_idempotency_key  TEXT,
  p_lines            JSONB,         -- [{account_id, debit, credit, line_narration, vendor_id, customer_id, cost_center_id, project_id, branch_id, department, tax_type}]
  p_journal_number   TEXT,
  p_status           TEXT DEFAULT 'posted',
  p_posted_by        TEXT DEFAULT NULL,
  p_notes            TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_journal_id UUID;
  v_total_debit  NUMERIC := 0;
  v_total_credit NUMERIC := 0;
  v_existing UUID;
BEGIN
  -- Idempotency short-circuit: if a journal already exists for this
  -- (user, source_type, source_id), return it instead of erroring.
  IF p_source_id IS NOT NULL AND p_source_type IS NOT NULL THEN
    SELECT id INTO v_existing
    FROM journals
    WHERE user_id = p_user_id
      AND source_type = p_source_type
      AND source_id = p_source_id
      AND is_reversed = FALSE
    LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing
    FROM journals
    WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key
    LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  -- Validate balance from the input payload.
  SELECT
    COALESCE(SUM((line ->> 'debit')::numeric),  0),
    COALESCE(SUM((line ->> 'credit')::numeric), 0)
  INTO v_total_debit, v_total_credit
  FROM jsonb_array_elements(p_lines) AS line;

  IF abs(v_total_debit - v_total_credit) > 0.01 THEN
    RAISE EXCEPTION 'Unbalanced journal: debits=% credits=%', v_total_debit, v_total_credit
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO journals (
    user_id, journal_number, journal_date, narration, status,
    total_debit, total_credit,
    source_type, source_id, idempotency_key,
    posted_by, posted_at, notes
  )
  VALUES (
    p_user_id, p_journal_number, p_journal_date, p_narration, p_status,
    round(v_total_debit::numeric,  2),
    round(v_total_credit::numeric, 2),
    p_source_type, p_source_id, p_idempotency_key,
    p_posted_by, CASE WHEN p_status = 'posted' THEN NOW() ELSE NULL END, p_notes
  )
  RETURNING id INTO v_journal_id;

  INSERT INTO journal_lines (
    journal_id, account_id, debit, credit, line_narration,
    user_id, entry_date, source_type, source_id,
    vendor_id, customer_id, cost_center_id, project_id, branch_id, department, tax_type
  )
  SELECT
    v_journal_id,
    (line ->> 'account_id')::uuid,
    NULLIF((line ->> 'debit')::numeric,  0),
    NULLIF((line ->> 'credit')::numeric, 0),
    line ->> 'line_narration',
    p_user_id,
    p_journal_date,
    p_source_type,
    p_source_id,
    (line ->> 'vendor_id')::uuid,
    (line ->> 'customer_id')::uuid,
    (line ->> 'cost_center_id')::uuid,
    (line ->> 'project_id')::uuid,
    (line ->> 'branch_id')::uuid,
    line ->> 'department',
    line ->> 'tax_type'
  FROM jsonb_array_elements(p_lines) AS line;

  RETURN v_journal_id;
END;
$$;

-- ── 7. Helper: reverse a posted journal (atomic) ────────────────────────────
-- Creates a swap-sign mirror journal, links both via reverses_journal_id,
-- and flags the original is_reversed=TRUE. Used for bill voids, payment
-- cancellations, expense amendments, etc.
CREATE OR REPLACE FUNCTION reverse_journal(
  p_journal_id        UUID,
  p_reversal_date     DATE DEFAULT NULL,
  p_reversal_number   TEXT DEFAULT NULL,
  p_reason            TEXT DEFAULT NULL,
  p_reversed_by       TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_orig journals%ROWTYPE;
  v_reversal_id UUID;
  v_date DATE;
  v_number TEXT;
BEGIN
  SELECT * INTO v_orig FROM journals WHERE id = p_journal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journal % not found', p_journal_id;
  END IF;
  IF v_orig.is_reversed THEN
    RAISE EXCEPTION 'Journal % is already reversed', v_orig.journal_number
      USING ERRCODE = '23514';
  END IF;
  IF v_orig.status <> 'posted' THEN
    RAISE EXCEPTION 'Only posted journals can be reversed (status=%)', v_orig.status
      USING ERRCODE = '23514';
  END IF;

  v_date   := COALESCE(p_reversal_date, CURRENT_DATE);
  v_number := COALESCE(p_reversal_number, v_orig.journal_number || '-REV');

  INSERT INTO journals (
    user_id, journal_number, journal_date, narration, status,
    total_debit, total_credit,
    source_type, source_id,
    reverses_journal_id, posted_by, posted_at, notes
  )
  VALUES (
    v_orig.user_id, v_number, v_date,
    'Reversal of ' || v_orig.journal_number || COALESCE(' — ' || p_reason, ''),
    'posted',
    v_orig.total_credit, v_orig.total_debit,    -- swapped
    COALESCE(v_orig.source_type, 'manual') || '_reversal',
    v_orig.source_id,
    v_orig.id, p_reversed_by, NOW(), p_reason
  )
  RETURNING id INTO v_reversal_id;

  -- Mirror lines with debit/credit swapped, copying all sub-ledger tags so
  -- the reversal nets out cleanly in vendor / cost-center / project rollups.
  INSERT INTO journal_lines (
    journal_id, account_id, debit, credit, line_narration,
    user_id, entry_date, source_type, source_id,
    vendor_id, customer_id, cost_center_id, project_id, branch_id, department, tax_type
  )
  SELECT
    v_reversal_id,
    jl.account_id,
    jl.credit,
    jl.debit,
    'Reversal: ' || COALESCE(jl.line_narration, ''),
    v_orig.user_id,
    v_date,
    COALESCE(v_orig.source_type, 'manual') || '_reversal',
    v_orig.source_id,
    jl.vendor_id, jl.customer_id, jl.cost_center_id,
    jl.project_id, jl.branch_id, jl.department, jl.tax_type
  FROM journal_lines jl
  WHERE jl.journal_id = p_journal_id;

  -- Flip the reversed flag on the original. This bypasses the append-only
  -- trigger because we're not changing accounting fields.
  UPDATE journals SET is_reversed = TRUE WHERE id = p_journal_id;

  RETURN v_reversal_id;
END;
$$;

-- ── 8. Force PostgREST schema reload so new columns/views are visible ───────
NOTIFY pgrst, 'reload schema';

COMMENT ON COLUMN journals.source_type IS
  'What document this journal records: bill, expense, payment, advance, advance_adjustment, invoice, etc. NULL for manual journals.';
COMMENT ON COLUMN journals.source_id IS
  'FK (semantic, not enforced) to the source document. Combined with source_type makes drill-through possible.';
COMMENT ON COLUMN journals.idempotency_key IS
  'Optional caller-provided key; unique per user. Lets the app retry posting without creating duplicates.';
COMMENT ON COLUMN journals.reverses_journal_id IS
  'When set, this journal is the reversal of the referenced journal. The original gets is_reversed=TRUE.';
COMMENT ON COLUMN journal_lines.entry_date IS
  'Denormalized from journals.journal_date so per-account / per-vendor queries can avoid the journals join.';
COMMENT ON COLUMN journal_lines.tax_type IS
  'GST decomposition tag: cgst|sgst|igst|cess|rcm_input|rcm_output|itc|output_gst|tds|tcs. NULL for non-tax lines.';
