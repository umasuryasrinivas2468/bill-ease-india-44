-- ════════════════════════════════════════════════════════════════════════════
-- Asset Warranty & Insurance Tracking (Module 2)
--
-- Stores warranty periods, insurance policies, policy documents, and
-- insurance claim lifecycle linked to fixed_assets. Premium payments and
-- claim settlements post journals via the standard journalEngine RPC.
--
-- Tables created:
--   asset_warranties               warranty per asset (one row = one warranty)
--   asset_insurance_policies       policy per asset (asset may have many)
--   asset_insurance_claims         claim lifecycle against a policy
--
-- Source types added to journals:
--   insurance_premium / insurance_premium_reversal
--   insurance_claim   / insurance_claim_reversal
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
        -- Fixed Assets
        'asset_purchase', 'asset_purchase_reversal',
        'asset_capitalization',
        'depreciation', 'depreciation_reversal',
        'asset_impairment',
        'asset_transfer',
        'asset_disposal', 'asset_disposal_reversal',
        'asset_write_off',
        -- Maintenance (Module 1)
        'asset_maintenance', 'asset_maintenance_reversal',
        -- Warranty & Insurance (Module 2)
        'insurance_premium', 'insurance_premium_reversal',
        'insurance_claim',   'insurance_claim_reversal',
        -- Liabilities / Loans
        'loan_disbursement', 'loan_disbursement_reversal',
        'loan_emi', 'loan_emi_reversal',
        'loan_interest_accrual',
        'liability_settlement'
      )
    );
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- 1. Asset warranties
--
-- Captures manufacturer / extended warranty terms for an asset. Pure
-- record-keeping — no journal posting (warranty has no monetary entry of
-- its own; if you paid for an extended warranty, that's an expense or
-- insurance premium, handled in asset_insurance_policies).
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS asset_warranties (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                TEXT NOT NULL,
  asset_id               UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,

  warranty_type          TEXT NOT NULL DEFAULT 'manufacturer' CHECK (warranty_type IN (
                           'manufacturer','extended','third_party','seller'
                         )),
  provider_name          TEXT NOT NULL,
  provider_contact       TEXT,
  warranty_number        TEXT,

  start_date             DATE NOT NULL,
  end_date               DATE NOT NULL,

  coverage_terms         TEXT,
  exclusions             TEXT,
  claim_contact          TEXT,
  document_url           TEXT,

  reminder_days_before   INTEGER NOT NULL DEFAULT 30 CHECK (reminder_days_before >= 0),

  is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  notes                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by             TEXT,

  CONSTRAINT chk_warranty_dates CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_warranty_user    ON asset_warranties(user_id);
CREATE INDEX IF NOT EXISTS idx_warranty_asset   ON asset_warranties(asset_id);
CREATE INDEX IF NOT EXISTS idx_warranty_expiry  ON asset_warranties(user_id, end_date) WHERE is_active = TRUE;

ALTER TABLE asset_warranties ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS warranty_rls ON asset_warranties;
CREATE POLICY warranty_rls ON asset_warranties
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);


-- ════════════════════════════════════════════════════════════════════════════
-- 2. Insurance policies
--
-- One row per insurance policy on an asset. An asset may have multiple
-- policies (e.g. fire + theft + transit). Premium payment posts a journal:
--   Dr Insurance Expense
--   Dr Input GST (if ITC eligible)
--   Cr Bank / Cash / Accounts Payable
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS asset_insurance_policies (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                TEXT NOT NULL,
  asset_id               UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,

  policy_type            TEXT NOT NULL DEFAULT 'comprehensive' CHECK (policy_type IN (
                           'comprehensive','fire','theft','liability','transit','marine','health','other'
                         )),
  insurer_name           TEXT NOT NULL,
  vendor_id              UUID,
  broker_name            TEXT,
  policy_number          TEXT NOT NULL,

  coverage_amount        NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (coverage_amount >= 0),
  premium_amount         NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (premium_amount >= 0),
  gst_amount             NUMERIC(18,2) NOT NULL DEFAULT 0,
  cgst_amount            NUMERIC(18,2) NOT NULL DEFAULT 0,
  sgst_amount            NUMERIC(18,2) NOT NULL DEFAULT 0,
  igst_amount            NUMERIC(18,2) NOT NULL DEFAULT 0,
  itc_eligible           BOOLEAN NOT NULL DEFAULT TRUE,

  start_date             DATE NOT NULL,
  end_date               DATE NOT NULL,
  premium_due_date       DATE,

  premium_paid           BOOLEAN NOT NULL DEFAULT FALSE,
  payment_mode           TEXT NOT NULL DEFAULT 'bank' CHECK (payment_mode IN ('cash','bank','credit')),
  paid_on                DATE,
  journal_id             UUID,

  status                 TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
                           'active','lapsed','cancelled','renewed'
                         )),
  renewed_from_id        UUID REFERENCES asset_insurance_policies(id) ON DELETE SET NULL,

  claim_contact          TEXT,
  document_url           TEXT,
  reminder_days_before   INTEGER NOT NULL DEFAULT 30 CHECK (reminder_days_before >= 0),

  cost_center_id         UUID,
  branch_id              UUID,

  notes                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by             TEXT,

  CONSTRAINT chk_policy_dates CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_policy_user    ON asset_insurance_policies(user_id);
CREATE INDEX IF NOT EXISTS idx_policy_asset   ON asset_insurance_policies(asset_id);
CREATE INDEX IF NOT EXISTS idx_policy_expiry  ON asset_insurance_policies(user_id, end_date) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_policy_status  ON asset_insurance_policies(user_id, status);
CREATE INDEX IF NOT EXISTS idx_policy_journal ON asset_insurance_policies(journal_id);

ALTER TABLE asset_insurance_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS policy_rls ON asset_insurance_policies;
CREATE POLICY policy_rls ON asset_insurance_policies
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);


-- ════════════════════════════════════════════════════════════════════════════
-- 3. Insurance claims
--
-- Tracks claims against a policy. When settlement is received, the service
-- layer posts:
--   Dr Bank
--   Cr Insurance Claim Recovery (Income)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS asset_insurance_claims (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                TEXT NOT NULL,
  asset_id               UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  policy_id              UUID NOT NULL REFERENCES asset_insurance_policies(id) ON DELETE CASCADE,

  claim_number           TEXT NOT NULL,
  incident_date          DATE NOT NULL,
  claim_filed_date       DATE NOT NULL,
  claim_amount           NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (claim_amount >= 0),
  approved_amount        NUMERIC(18,2),
  settled_amount         NUMERIC(18,2),
  settled_on             DATE,
  payment_mode           TEXT DEFAULT 'bank' CHECK (payment_mode IN ('cash','bank')),

  status                 TEXT NOT NULL DEFAULT 'filed' CHECK (status IN (
                           'filed','under_review','approved','rejected','settled','partially_settled'
                         )),

  incident_description   TEXT,
  surveyor_name          TEXT,
  surveyor_contact       TEXT,
  rejection_reason       TEXT,

  document_url           TEXT,
  journal_id             UUID,

  cost_center_id         UUID,
  branch_id              UUID,

  notes                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by             TEXT
);

CREATE INDEX IF NOT EXISTS idx_claim_user    ON asset_insurance_claims(user_id, claim_filed_date DESC);
CREATE INDEX IF NOT EXISTS idx_claim_asset   ON asset_insurance_claims(asset_id);
CREATE INDEX IF NOT EXISTS idx_claim_policy  ON asset_insurance_claims(policy_id);
CREATE INDEX IF NOT EXISTS idx_claim_status  ON asset_insurance_claims(user_id, status);

ALTER TABLE asset_insurance_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS claim_rls ON asset_insurance_claims;
CREATE POLICY claim_rls ON asset_insurance_claims
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);


-- ── updated_at triggers ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_asset_coverage_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_warranty_touch ON asset_warranties;
CREATE TRIGGER trg_warranty_touch
  BEFORE UPDATE ON asset_warranties
  FOR EACH ROW EXECUTE FUNCTION touch_asset_coverage_updated_at();

DROP TRIGGER IF EXISTS trg_policy_touch ON asset_insurance_policies;
CREATE TRIGGER trg_policy_touch
  BEFORE UPDATE ON asset_insurance_policies
  FOR EACH ROW EXECUTE FUNCTION touch_asset_coverage_updated_at();

DROP TRIGGER IF EXISTS trg_claim_touch ON asset_insurance_claims;
CREATE TRIGGER trg_claim_touch
  BEFORE UPDATE ON asset_insurance_claims
  FOR EACH ROW EXECUTE FUNCTION touch_asset_coverage_updated_at();


-- ── coverage summary view ───────────────────────────────────────────────────
-- One row per asset summarising warranty + insurance posture, used by the
-- asset detail "coverage status" pill and the cross-asset coverage dashboard.
CREATE OR REPLACE VIEW v_asset_coverage_summary AS
WITH w AS (
  SELECT user_id, asset_id,
    MAX(end_date)                         AS warranty_until,
    BOOL_OR(end_date >= CURRENT_DATE
            AND is_active)                AS has_active_warranty
  FROM asset_warranties
  GROUP BY user_id, asset_id
),
p AS (
  SELECT user_id, asset_id,
    COUNT(*)                                                            AS active_policies,
    COALESCE(SUM(coverage_amount), 0)                                   AS total_coverage,
    COALESCE(SUM(premium_amount + gst_amount), 0)                       AS total_premium,
    MIN(end_date)                                                       AS next_policy_expiry,
    BOOL_OR(status = 'active' AND end_date >= CURRENT_DATE)              AS has_active_policy
  FROM asset_insurance_policies
  WHERE status IN ('active','renewed')
  GROUP BY user_id, asset_id
),
c AS (
  SELECT user_id, asset_id,
    COUNT(*)                                              AS total_claims,
    COUNT(*) FILTER (WHERE status IN ('filed','under_review','approved')) AS open_claims,
    COALESCE(SUM(settled_amount), 0)                       AS lifetime_settlement
  FROM asset_insurance_claims
  GROUP BY user_id, asset_id
)
SELECT
  fa.user_id,
  fa.id                        AS asset_id,
  w.warranty_until,
  COALESCE(w.has_active_warranty, FALSE)  AS has_active_warranty,
  COALESCE(p.active_policies, 0)          AS active_policies,
  COALESCE(p.total_coverage, 0)           AS total_coverage,
  COALESCE(p.total_premium, 0)            AS total_premium,
  p.next_policy_expiry,
  COALESCE(p.has_active_policy, FALSE)    AS has_active_policy,
  COALESCE(c.total_claims, 0)             AS total_claims,
  COALESCE(c.open_claims, 0)              AS open_claims,
  COALESCE(c.lifetime_settlement, 0)      AS lifetime_settlement
FROM fixed_assets fa
LEFT JOIN w ON w.user_id = fa.user_id AND w.asset_id = fa.id
LEFT JOIN p ON p.user_id = fa.user_id AND p.asset_id = fa.id
LEFT JOIN c ON c.user_id = fa.user_id AND c.asset_id = fa.id;
