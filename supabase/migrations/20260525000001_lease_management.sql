-- ════════════════════════════════════════════════════════════════════════════
-- Lease Asset Management (Module 6)
--
-- Supports three lease kinds:
--   - 'operating'  short-term, simple Dr Rent Expense / Cr Bank per payment
--   - 'finance'    Ind AS 116 style: Dr Right-of-Use Asset / Cr Lease Liability
--                  at recognition; each payment splits into Dr Liability +
--                  Dr Interest Expense / Cr Bank using effective-interest
--   - 'rental'     short-term rental (treated like operating)
--
-- Tables:
--   lease_contracts          one row per agreement
--   lease_payment_schedule   per-period payment plan + amortisation
--
-- Source types added to journals:
--   lease_recognition  / lease_recognition_reversal
--   lease_payment      / lease_payment_reversal
--   lease_termination  / lease_termination_reversal
--   lease_interest_accrual
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'journals' AND constraint_name = 'journals_source_type_chk'
  ) THEN
    ALTER TABLE journals DROP CONSTRAINT journals_source_type_chk;
  END IF;

  ALTER TABLE journals
    ADD CONSTRAINT journals_source_type_chk CHECK (
      source_type IS NULL OR source_type IN (
        'bill','bill_reversal',
        'expense','expense_reversal',
        'payment','payment_reversal',
        'advance','advance_reversal',
        'advance_adjustment','advance_adjustment_reversal',
        'invoice','invoice_reversal',
        'payment_received','payment_received_reversal',
        'cash_memo','cash_memo_reversal',
        'cogs','cogs_reversal',
        'inventory_adjustment',
        'customer_advance','customer_advance_reversal',
        'customer_advance_adjustment','customer_advance_adjustment_reversal',
        'credit_note','credit_note_reversal',
        'sales_return','sales_return_reversal',
        'debit_note','debit_note_reversal',
        'purchase_return','purchase_return_reversal',
        'payment_link',
        'gst_payment',
        'tds_payment',
        'accrual','accrual_reversal',
        'recurring',
        'opening_balance',
        'manual',
        'reversal',
        'asset_purchase','asset_purchase_reversal',
        'asset_capitalization',
        'depreciation','depreciation_reversal',
        'asset_impairment',
        'asset_transfer',
        'asset_disposal','asset_disposal_reversal',
        'asset_write_off',
        'asset_maintenance','asset_maintenance_reversal',
        'insurance_premium','insurance_premium_reversal',
        'insurance_claim','insurance_claim_reversal',
        -- Lease (Module 6)
        'lease_recognition','lease_recognition_reversal',
        'lease_payment','lease_payment_reversal',
        'lease_termination','lease_termination_reversal',
        'lease_interest_accrual',
        'loan_disbursement','loan_disbursement_reversal',
        'loan_emi','loan_emi_reversal',
        'loan_interest_accrual',
        'liability_settlement'
      )
    );
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- 1. Lease contracts
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS lease_contracts (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                TEXT NOT NULL,
  lease_code             TEXT NOT NULL,

  lease_type             TEXT NOT NULL CHECK (lease_type IN ('operating','finance','rental')),
  name                   TEXT NOT NULL,
  description            TEXT,

  -- Optional link to a fixed asset (a finance lease creates a ROU asset record;
  -- operating leases generally won't have a corresponding fixed_assets row)
  asset_id               UUID REFERENCES fixed_assets(id) ON DELETE SET NULL,

  -- Counterparty
  lessor_name            TEXT NOT NULL,
  lessor_contact         TEXT,
  vendor_id              UUID,

  -- Lease term
  start_date             DATE NOT NULL,
  end_date               DATE NOT NULL,
  termination_date       DATE,
  CONSTRAINT chk_lease_dates CHECK (end_date >= start_date),

  -- Payment terms
  payment_frequency      TEXT NOT NULL DEFAULT 'monthly' CHECK (payment_frequency IN (
                           'monthly','quarterly','semi_annual','annual'
                         )),
  payment_amount         NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (payment_amount >= 0),
  gst_amount_per_period  NUMERIC(18,2) NOT NULL DEFAULT 0,
  itc_eligible           BOOLEAN NOT NULL DEFAULT TRUE,
  payments_in_advance    BOOLEAN NOT NULL DEFAULT FALSE,
  security_deposit       NUMERIC(18,2) NOT NULL DEFAULT 0,

  -- Finance-lease specifics (NULL for operating / rental)
  discount_rate_annual   NUMERIC(8,4),                  -- % e.g. 9.5000 for 9.5%
  rou_asset_value        NUMERIC(18,2),                 -- present value of payments
  opening_liability      NUMERIC(18,2),                 -- typically = rou_asset_value
  outstanding_liability  NUMERIC(18,2) DEFAULT 0,        -- decremented per payment

  -- Posted journals
  recognition_journal_id UUID,
  termination_journal_id UUID,

  -- Reminders / status
  reminder_days_before   INTEGER NOT NULL DEFAULT 5 CHECK (reminder_days_before >= 0),
  status                 TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
                           'draft','active','terminated','expired','cancelled'
                         )),

  -- Tagging
  cost_center_id         UUID,
  branch_id              TEXT,
  department             TEXT,

  document_url           TEXT,
  notes                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by             TEXT,

  CONSTRAINT uq_lease_code UNIQUE (user_id, lease_code)
);

CREATE INDEX IF NOT EXISTS idx_lease_user      ON lease_contracts(user_id);
CREATE INDEX IF NOT EXISTS idx_lease_status    ON lease_contracts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_lease_end       ON lease_contracts(user_id, end_date) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_lease_asset     ON lease_contracts(asset_id);

ALTER TABLE lease_contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lease_rls ON lease_contracts;
CREATE POLICY lease_rls ON lease_contracts
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);


-- ════════════════════════════════════════════════════════════════════════════
-- 2. Lease payment schedule (per-period amortisation)
--
-- For finance leases the principal/interest split is computed at activation
-- using the effective-interest method. For operating / rental, principal =
-- total_payment and interest = 0 (the journal still uses Dr Rent Expense).
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS lease_payment_schedule (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                TEXT NOT NULL,
  lease_id               UUID NOT NULL REFERENCES lease_contracts(id) ON DELETE CASCADE,

  period_index           INTEGER NOT NULL,
  due_date               DATE NOT NULL,

  total_payment          NUMERIC(18,2) NOT NULL DEFAULT 0,
  principal_portion      NUMERIC(18,2) NOT NULL DEFAULT 0,
  interest_portion       NUMERIC(18,2) NOT NULL DEFAULT 0,
  gst_amount             NUMERIC(18,2) NOT NULL DEFAULT 0,

  opening_liability      NUMERIC(18,2) NOT NULL DEFAULT 0,
  closing_liability      NUMERIC(18,2) NOT NULL DEFAULT 0,

  status                 TEXT NOT NULL DEFAULT 'planned' CHECK (status IN (
                           'planned','paid','skipped','adjusted'
                         )),
  paid_on                DATE,
  payment_mode           TEXT CHECK (payment_mode IS NULL OR payment_mode IN ('cash','bank','credit')),
  journal_id             UUID,
  posted_by              TEXT,
  notes                  TEXT,

  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_lease_period UNIQUE (lease_id, period_index)
);

CREATE INDEX IF NOT EXISTS idx_lease_sched_user_status ON lease_payment_schedule(user_id, status);
CREATE INDEX IF NOT EXISTS idx_lease_sched_lease      ON lease_payment_schedule(lease_id);
CREATE INDEX IF NOT EXISTS idx_lease_sched_due        ON lease_payment_schedule(user_id, due_date);

ALTER TABLE lease_payment_schedule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lease_sched_rls ON lease_payment_schedule;
CREATE POLICY lease_sched_rls ON lease_payment_schedule
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);


-- updated_at trigger
CREATE OR REPLACE FUNCTION touch_lease_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lease_touch ON lease_contracts;
CREATE TRIGGER trg_lease_touch
  BEFORE UPDATE ON lease_contracts
  FOR EACH ROW EXECUTE FUNCTION touch_lease_updated_at();


-- ── Convenience view: lease + outstanding ──────────────────────────────────
CREATE OR REPLACE VIEW v_lease_summary AS
SELECT
  l.id,
  l.user_id,
  l.lease_code,
  l.name,
  l.lease_type,
  l.lessor_name,
  l.status,
  l.start_date,
  l.end_date,
  l.payment_amount,
  l.payment_frequency,
  l.outstanding_liability,
  l.rou_asset_value,
  (SELECT MIN(due_date) FROM lease_payment_schedule s
     WHERE s.lease_id = l.id AND s.status = 'planned')                AS next_payment_due,
  (SELECT COUNT(*) FROM lease_payment_schedule s
     WHERE s.lease_id = l.id AND s.status = 'paid')                   AS payments_made,
  (SELECT COUNT(*) FROM lease_payment_schedule s
     WHERE s.lease_id = l.id AND s.status = 'planned')                AS payments_remaining,
  (SELECT COALESCE(SUM(total_payment), 0) FROM lease_payment_schedule s
     WHERE s.lease_id = l.id AND s.status = 'paid')                   AS lifetime_paid
FROM lease_contracts l;
