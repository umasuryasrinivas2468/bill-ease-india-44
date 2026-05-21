-- ════════════════════════════════════════════════════════════════════════════
-- Asset Revaluation (Module 7)
--
-- Captures upward / downward fair-value revaluations to a fixed asset.
-- Each revaluation event records the before/after carrying amount and the
-- split between Revaluation Reserve (Equity) and Revaluation Loss/Gain (P&L).
--
-- Accounting convention (Ind AS 16 / AS 10 revaluation model):
--   Upward:
--     - First reverse any prior cumulative loss recognized in P&L (Income)
--     - Surplus over that goes to Revaluation Reserve (Equity)
--   Downward:
--     - First debit existing Revaluation Reserve on this asset (up to balance)
--     - Deficit beyond that goes to Revaluation Loss (Expense)
--
-- Service layer uses the "elimination method": after revaluation, the asset's
-- accumulated_depreciation is reset to 0 and total_capitalised_value is set
-- to the new fair value. Depreciation schedule is regenerated.
--
-- Source types added to journals:
--   asset_revaluation / asset_revaluation_reversal
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
        'cwip_addition','cwip_addition_reversal','cwip_capitalization',
        -- Revaluation (Module 7)
        'asset_revaluation','asset_revaluation_reversal',
        'loan_disbursement','loan_disbursement_reversal',
        'loan_emi','loan_emi_reversal','loan_interest_accrual','liability_settlement'
      )
    );
END $$;


-- ── Per-asset cumulative trackers ───────────────────────────────────────────
-- revaluation_reserve_balance: equity reserve attributable to this asset
--   (decremented on subsequent downward revaluation, reset at disposal).
-- cumulative_revaluation_loss: lifetime P&L loss recognized on this asset
--   (decremented on subsequent upward reversal).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fixed_assets' AND column_name = 'revaluation_reserve_balance'
  ) THEN
    ALTER TABLE fixed_assets ADD COLUMN revaluation_reserve_balance NUMERIC(18,2) NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fixed_assets' AND column_name = 'cumulative_revaluation_loss'
  ) THEN
    ALTER TABLE fixed_assets ADD COLUMN cumulative_revaluation_loss NUMERIC(18,2) NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fixed_assets' AND column_name = 'last_revalued_on'
  ) THEN
    ALTER TABLE fixed_assets ADD COLUMN last_revalued_on DATE;
  END IF;
END $$;


-- ── Revaluation event log ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_revaluations (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     TEXT NOT NULL,
  asset_id                    UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,

  revaluation_date            DATE NOT NULL,
  direction                   TEXT NOT NULL CHECK (direction IN ('upward','downward')),

  -- Before / after carrying amounts
  prev_gross_value            NUMERIC(18,2) NOT NULL,
  prev_accumulated_depreciation NUMERIC(18,2) NOT NULL,
  prev_book_value             NUMERIC(18,2) NOT NULL,
  new_fair_value              NUMERIC(18,2) NOT NULL CHECK (new_fair_value >= 0),
  revaluation_amount          NUMERIC(18,2) NOT NULL,   -- always positive; direction column gives sign

  -- Split between reserve (equity) and P&L
  reserve_impact              NUMERIC(18,2) NOT NULL DEFAULT 0,  -- + for upward; - for downward
  pl_impact                   NUMERIC(18,2) NOT NULL DEFAULT 0,  -- + for upward (reversal of loss); - for downward (loss)

  -- Updated useful life (for depreciation regen)
  remaining_useful_life_years NUMERIC(8,4),

  -- Documentation
  valuer_name                 TEXT,
  valuer_contact              TEXT,
  method                      TEXT CHECK (method IS NULL OR method IN (
                                'market','income','cost','dcf','independent','internal'
                              )),
  reason                      TEXT,
  document_url                TEXT,
  notes                       TEXT,

  journal_id                  UUID,
  reverts_revaluation_id      UUID REFERENCES asset_revaluations(id) ON DELETE SET NULL,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  TEXT
);

CREATE INDEX IF NOT EXISTS idx_reval_user  ON asset_revaluations(user_id, revaluation_date DESC);
CREATE INDEX IF NOT EXISTS idx_reval_asset ON asset_revaluations(asset_id, revaluation_date DESC);

ALTER TABLE asset_revaluations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reval_rls ON asset_revaluations;
CREATE POLICY reval_rls ON asset_revaluations
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);
