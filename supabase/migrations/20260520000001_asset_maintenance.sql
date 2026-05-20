-- ════════════════════════════════════════════════════════════════════════════
-- Asset Maintenance Management (Module 1)
--
-- Adds maintenance schedules + maintenance event records on top of the
-- existing fixed_assets register. Maintenance expenses post a journal via
-- the standard journalEngine.postJournal RPC.
--
-- Tables created:
--   asset_maintenance_schedules  recurring service plans + AMC contracts
--   asset_maintenance_records    actual repair / service / AMC-renewal events
--
-- Source types added to journals:
--   asset_maintenance / asset_maintenance_reversal
-- ════════════════════════════════════════════════════════════════════════════

-- ── extend journals.source_type CHECK ───────────────────────────────────────
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
        'credit_note', 'credit_note_reversal',
        'sales_return', 'sales_return_reversal',
        'debit_note', 'debit_note_reversal',
        'purchase_return', 'purchase_return_reversal',
        'payment_link',
        'gst_payment',
        'tds_payment',
        'accrual', 'accrual_reversal',
        'recurring',
        'opening_balance',
        'manual',
        'reversal',
        -- Fixed Assets module
        'asset_purchase', 'asset_purchase_reversal',
        'asset_capitalization',
        'depreciation', 'depreciation_reversal',
        'asset_impairment',
        'asset_transfer',
        'asset_disposal', 'asset_disposal_reversal',
        'asset_write_off',
        -- Asset Maintenance (Module 1)
        'asset_maintenance', 'asset_maintenance_reversal',
        -- Liabilities / Loans module
        'loan_disbursement', 'loan_disbursement_reversal',
        'loan_emi', 'loan_emi_reversal',
        'loan_interest_accrual',
        'liability_settlement'
      )
    );
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- 1. Maintenance schedules
--
-- One row per recurring service plan or AMC contract on a given asset.
-- Ad-hoc one-off repairs do NOT need a schedule row — they post directly
-- to asset_maintenance_records with schedule_id = NULL.
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS asset_maintenance_schedules (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                TEXT NOT NULL,
  asset_id               UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,

  schedule_type          TEXT NOT NULL CHECK (schedule_type IN (
                           'service',       -- routine recurring service
                           'amc',           -- annual maintenance contract
                           'preventive',    -- preventive inspection
                           'calibration',   -- instrumentation calibration
                           'inspection'     -- statutory / safety inspection
                         )),
  title                  TEXT NOT NULL,
  description            TEXT,

  -- Vendor / service provider
  vendor_id              UUID,
  vendor_name            TEXT,

  -- Recurrence: NULL means non-recurring (e.g. an AMC contract that just
  -- has a fixed end_date). frequency_months drives next_due_date advancement.
  frequency_months       INTEGER CHECK (frequency_months IS NULL OR frequency_months > 0),

  -- AMC-specific fields (other schedule types may leave these NULL)
  amc_start_date         DATE,
  amc_end_date           DATE,
  amc_amount             NUMERIC(18,2) DEFAULT 0,
  amc_paid               BOOLEAN NOT NULL DEFAULT FALSE,

  -- Scheduling state
  next_due_date          DATE NOT NULL,
  last_serviced_on       DATE,
  reminder_days_before   INTEGER NOT NULL DEFAULT 7 CHECK (reminder_days_before >= 0),

  -- Cost-centre tagging for MIS slicing
  cost_center_id         UUID,
  branch_id              UUID,

  is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  notes                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by             TEXT
);

CREATE INDEX IF NOT EXISTS idx_maint_sched_user        ON asset_maintenance_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_maint_sched_asset       ON asset_maintenance_schedules(asset_id);
CREATE INDEX IF NOT EXISTS idx_maint_sched_due         ON asset_maintenance_schedules(user_id, next_due_date) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_maint_sched_amc_expiry  ON asset_maintenance_schedules(user_id, amc_end_date) WHERE schedule_type = 'amc' AND is_active = TRUE;

ALTER TABLE asset_maintenance_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS maint_sched_rls ON asset_maintenance_schedules;
CREATE POLICY maint_sched_rls ON asset_maintenance_schedules
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);


-- ════════════════════════════════════════════════════════════════════════════
-- 2. Maintenance records (actual events)
--
-- One row per real-world maintenance event: a repair, scheduled service,
-- AMC renewal, breakdown, inspection visit, etc.
--
-- When a record is saved with status='completed' and cost > 0, the service
-- layer posts a journal:
--   Dr Repairs & Maintenance Expense
--   Dr Input GST (when ITC eligible)
--   Cr Bank/Cash/AP
-- and stamps journal_id here.
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS asset_maintenance_records (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                TEXT NOT NULL,
  asset_id               UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  schedule_id            UUID REFERENCES asset_maintenance_schedules(id) ON DELETE SET NULL,

  record_type            TEXT NOT NULL CHECK (record_type IN (
                           'service','repair','amc_renewal','inspection','breakdown','calibration'
                         )),
  status                 TEXT NOT NULL DEFAULT 'completed' CHECK (status IN (
                           'scheduled','in_progress','completed','cancelled'
                         )),
  performed_on           DATE NOT NULL,

  -- Cost breakdown
  cost                   NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
  gst_amount             NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (gst_amount >= 0),
  cgst_amount            NUMERIC(18,2) NOT NULL DEFAULT 0,
  sgst_amount            NUMERIC(18,2) NOT NULL DEFAULT 0,
  igst_amount            NUMERIC(18,2) NOT NULL DEFAULT 0,
  itc_eligible           BOOLEAN NOT NULL DEFAULT TRUE,
  payment_mode           TEXT NOT NULL DEFAULT 'bank' CHECK (payment_mode IN ('cash','bank','credit')),

  -- Vendor / labour
  vendor_id              UUID,
  vendor_name            TEXT,
  labour_hours           NUMERIC(10,2),
  parts_replaced         TEXT,
  downtime_hours         NUMERIC(10,2),

  -- Tagging
  cost_center_id         UUID,
  branch_id              UUID,

  description            TEXT,
  notes                  TEXT,
  attachment_url         TEXT,

  -- Posted journal (NULL if no journal — e.g. zero-cost inspection)
  journal_id             UUID,
  -- Link back to the expense record if maintenance was logged via expenses
  expense_id             UUID,

  -- For recurring schedules: when this record completes a cycle, the
  -- service layer advances schedule.next_due_date and records it here.
  next_service_date      DATE,

  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by             TEXT
);

CREATE INDEX IF NOT EXISTS idx_maint_rec_user      ON asset_maintenance_records(user_id, performed_on DESC);
CREATE INDEX IF NOT EXISTS idx_maint_rec_asset     ON asset_maintenance_records(asset_id, performed_on DESC);
CREATE INDEX IF NOT EXISTS idx_maint_rec_schedule  ON asset_maintenance_records(schedule_id);
CREATE INDEX IF NOT EXISTS idx_maint_rec_journal   ON asset_maintenance_records(journal_id);

ALTER TABLE asset_maintenance_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS maint_rec_rls ON asset_maintenance_records;
CREATE POLICY maint_rec_rls ON asset_maintenance_records
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);


-- ── keep updated_at fresh ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_asset_maintenance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_maint_sched_touch ON asset_maintenance_schedules;
CREATE TRIGGER trg_maint_sched_touch
  BEFORE UPDATE ON asset_maintenance_schedules
  FOR EACH ROW EXECUTE FUNCTION touch_asset_maintenance_updated_at();

DROP TRIGGER IF EXISTS trg_maint_rec_touch ON asset_maintenance_records;
CREATE TRIGGER trg_maint_rec_touch
  BEFORE UPDATE ON asset_maintenance_records
  FOR EACH ROW EXECUTE FUNCTION touch_asset_maintenance_updated_at();


-- ── convenience view: maintenance cost rollup per asset ─────────────────────
-- Used by the asset detail "lifetime maintenance spend" pill and the
-- maintenance dashboard cost-per-asset chart.
CREATE OR REPLACE VIEW v_asset_maintenance_summary AS
SELECT
  r.user_id,
  r.asset_id,
  COUNT(*)                                              AS total_events,
  COUNT(*) FILTER (WHERE r.status = 'completed')        AS completed_events,
  COALESCE(SUM(CASE WHEN r.status = 'completed'
                    THEN r.cost + CASE WHEN r.itc_eligible THEN 0 ELSE r.gst_amount END
                    ELSE 0 END), 0)                     AS total_cost,
  COALESCE(SUM(CASE WHEN r.status = 'completed' AND r.record_type = 'repair'
                    THEN r.cost ELSE 0 END), 0)         AS total_repair_cost,
  MAX(r.performed_on) FILTER (WHERE r.status = 'completed') AS last_service_on,
  COALESCE(SUM(r.downtime_hours), 0)                    AS total_downtime_hours
FROM asset_maintenance_records r
GROUP BY r.user_id, r.asset_id;
