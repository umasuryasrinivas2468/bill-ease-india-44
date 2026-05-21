-- ════════════════════════════════════════════════════════════════════════════
-- Capital Work-In-Progress (Module 8)
--
-- Tracks costs accumulating against a construction / build project before it
-- becomes a depreciable fixed asset. On capitalization, the service layer:
--   1) creates a fixed_assets row using accumulated cost as purchase_value
--   2) posts a journal Dr Fixed Asset / Cr CWIP Account
--   3) kicks off the depreciation schedule via depreciationService
--
-- Supports phased capitalization: a project can be capitalized in parts,
-- spawning multiple fixed_assets rows.
--
-- Source types added to journals:
--   cwip_addition / cwip_addition_reversal
--   cwip_capitalization
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
        'bill','bill_reversal','expense','expense_reversal',
        'payment','payment_reversal','advance','advance_reversal',
        'advance_adjustment','advance_adjustment_reversal',
        'invoice','invoice_reversal','payment_received','payment_received_reversal',
        'cash_memo','cash_memo_reversal','cogs','cogs_reversal',
        'inventory_adjustment',
        'customer_advance','customer_advance_reversal',
        'customer_advance_adjustment','customer_advance_adjustment_reversal',
        'credit_note','credit_note_reversal',
        'sales_return','sales_return_reversal',
        'debit_note','debit_note_reversal',
        'purchase_return','purchase_return_reversal',
        'payment_link','gst_payment','tds_payment',
        'accrual','accrual_reversal','recurring','opening_balance','manual','reversal',
        'asset_purchase','asset_purchase_reversal','asset_capitalization',
        'depreciation','depreciation_reversal','asset_impairment','asset_transfer',
        'asset_disposal','asset_disposal_reversal','asset_write_off',
        'asset_maintenance','asset_maintenance_reversal',
        'insurance_premium','insurance_premium_reversal',
        'insurance_claim','insurance_claim_reversal',
        'lease_recognition','lease_recognition_reversal',
        'lease_payment','lease_payment_reversal',
        'lease_termination','lease_termination_reversal',
        'lease_interest_accrual',
        -- CWIP (Module 8)
        'cwip_addition','cwip_addition_reversal',
        'cwip_capitalization',
        'loan_disbursement','loan_disbursement_reversal',
        'loan_emi','loan_emi_reversal','loan_interest_accrual','liability_settlement'
      )
    );
END $$;


CREATE TABLE IF NOT EXISTS cwip_projects (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     TEXT NOT NULL,
  cwip_code                   TEXT NOT NULL,
  name                        TEXT NOT NULL,
  description                 TEXT,

  -- Target asset shape (used at capitalization time)
  expected_asset_category_id  UUID,
  expected_useful_life_years  INTEGER DEFAULT 5,
  expected_depreciation_method TEXT DEFAULT 'SLM' CHECK (
    expected_depreciation_method IN ('SLM','WDV','None')
  ),
  budget_amount               NUMERIC(18,2) NOT NULL DEFAULT 0,

  -- Timeline
  start_date                  DATE NOT NULL,
  expected_completion_date    DATE,
  capitalized_on              DATE,

  -- Result
  fixed_asset_id              UUID REFERENCES fixed_assets(id) ON DELETE SET NULL,
  capitalization_journal_id   UUID,

  -- Aggregates (kept in sync by the service layer)
  total_accumulated_cost      NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_capitalized           NUMERIC(18,2) NOT NULL DEFAULT 0,

  status                      TEXT NOT NULL DEFAULT 'planning' CHECK (status IN (
                                'planning','in_progress','on_hold','capitalized','cancelled'
                              )),

  cost_center_id              UUID,
  branch_id                   TEXT,
  department                  TEXT,

  notes                       TEXT,
  document_url                TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  TEXT,

  CONSTRAINT uq_cwip_code UNIQUE (user_id, cwip_code)
);

CREATE INDEX IF NOT EXISTS idx_cwip_user   ON cwip_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_cwip_status ON cwip_projects(user_id, status);

ALTER TABLE cwip_projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cwip_rls ON cwip_projects;
CREATE POLICY cwip_rls ON cwip_projects
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);


CREATE TABLE IF NOT EXISTS cwip_costs (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                TEXT NOT NULL,
  cwip_id                UUID NOT NULL REFERENCES cwip_projects(id) ON DELETE CASCADE,

  cost_type              TEXT NOT NULL CHECK (cost_type IN (
                           'material','labour','contractor','consultancy','overhead','interest','transport','other'
                         )),
  cost_date              DATE NOT NULL,
  description            TEXT NOT NULL,

  amount                 NUMERIC(18,2) NOT NULL CHECK (amount >= 0),
  gst_amount             NUMERIC(18,2) NOT NULL DEFAULT 0,
  cgst_amount            NUMERIC(18,2) NOT NULL DEFAULT 0,
  sgst_amount            NUMERIC(18,2) NOT NULL DEFAULT 0,
  igst_amount            NUMERIC(18,2) NOT NULL DEFAULT 0,
  itc_eligible           BOOLEAN NOT NULL DEFAULT FALSE,        -- CWIP usually capitalises GST
  payment_mode           TEXT NOT NULL DEFAULT 'bank' CHECK (payment_mode IN ('cash','bank','credit')),

  vendor_id              UUID,
  vendor_name            TEXT,

  -- Optional source link (if this CWIP cost came from an existing bill/expense)
  source_type            TEXT CHECK (source_type IN ('bill','expense','manual') OR source_type IS NULL),
  source_id              UUID,

  -- Whether this cost has been included in a capitalization (phased)
  capitalized            BOOLEAN NOT NULL DEFAULT FALSE,
  capitalized_into       UUID REFERENCES fixed_assets(id) ON DELETE SET NULL,

  journal_id             UUID,
  notes                  TEXT,
  document_url           TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by             TEXT
);

CREATE INDEX IF NOT EXISTS idx_cwip_cost_user    ON cwip_costs(user_id, cost_date DESC);
CREATE INDEX IF NOT EXISTS idx_cwip_cost_project ON cwip_costs(cwip_id);
CREATE INDEX IF NOT EXISTS idx_cwip_cost_pending ON cwip_costs(user_id, cwip_id) WHERE capitalized = FALSE;

ALTER TABLE cwip_costs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cwip_cost_rls ON cwip_costs;
CREATE POLICY cwip_cost_rls ON cwip_costs
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);


-- updated_at trigger
CREATE OR REPLACE FUNCTION touch_cwip_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cwip_touch ON cwip_projects;
CREATE TRIGGER trg_cwip_touch
  BEFORE UPDATE ON cwip_projects
  FOR EACH ROW EXECUTE FUNCTION touch_cwip_updated_at();
