-- ════════════════════════════════════════════════════════════════════════════
-- Liability Deep-Dive (Phase 6: Modules 10-14)
--
-- Module 10 Classification Engine    columns + view classifying ST/LT, secured, statutory
-- Module 11 Interest Accrual          table for monthly accrual postings
-- Module 12 Forecasting               (no schema — service reads existing tables)
-- Module 13 Covenants & Compliance    liability_covenants + liability_covenant_checks
-- Module 14 Net Worth & Solvency      v_net_worth_snapshot view aggregating assets vs liabilities
-- ════════════════════════════════════════════════════════════════════════════

-- ── Module 10: classification columns on liabilities ───────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='liabilities' AND column_name='is_secured') THEN
    ALTER TABLE liabilities ADD COLUMN is_secured BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='liabilities' AND column_name='is_statutory') THEN
    ALTER TABLE liabilities ADD COLUMN is_statutory BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='liabilities' AND column_name='collateral_description') THEN
    ALTER TABLE liabilities ADD COLUMN collateral_description TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='liabilities' AND column_name='collateral_value') THEN
    ALTER TABLE liabilities ADD COLUMN collateral_value NUMERIC(18,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='liabilities' AND column_name='classification_override') THEN
    ALTER TABLE liabilities ADD COLUMN classification_override TEXT
      CHECK (classification_override IS NULL OR classification_override IN ('current','non_current'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='liabilities' AND column_name='last_accrued_through') THEN
    ALTER TABLE liabilities ADD COLUMN last_accrued_through DATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='liabilities' AND column_name='interest_payable_account_id') THEN
    ALTER TABLE liabilities ADD COLUMN interest_payable_account_id UUID REFERENCES accounts(id);
  END IF;
END $$;


-- v_liability_classification:
--   computes current (≤12 months) vs non-current portion of each liability.
--   For loans with an EMI schedule, splits using the EMI principal components.
--   For everything else: outstanding amount with classification by next_due_date
--   (or override when present).
CREATE OR REPLACE VIEW v_liability_classification AS
WITH next_12m AS (
  SELECT
    l.user_id,
    l.id AS liability_id,
    COALESCE(SUM(s.principal_component) FILTER (
      WHERE s.status IN ('planned','overdue','partial')
        AND s.due_date <= (CURRENT_DATE + INTERVAL '12 months')
    ), 0) AS current_from_emi
  FROM liabilities l
  LEFT JOIN loan_emi_schedule s ON s.liability_id = l.id AND s.user_id = l.user_id
  GROUP BY l.user_id, l.id
)
SELECT
  l.user_id,
  l.id                                  AS liability_id,
  l.liability_code,
  l.name,
  l.liability_type,
  l.is_secured,
  l.is_statutory,
  l.outstanding_principal,
  l.classification_override,
  -- Computed split
  CASE
    WHEN l.classification_override = 'current'    THEN l.outstanding_principal
    WHEN l.classification_override = 'non_current'THEN 0
    WHEN n.current_from_emi > 0                   THEN LEAST(n.current_from_emi, l.outstanding_principal)
    WHEN l.next_due_date IS NOT NULL
         AND l.next_due_date <= (CURRENT_DATE + INTERVAL '12 months')  THEN l.outstanding_principal
    ELSE 0
  END                                   AS current_portion,
  CASE
    WHEN l.classification_override = 'current'    THEN 0
    WHEN l.classification_override = 'non_current'THEN l.outstanding_principal
    WHEN n.current_from_emi > 0                   THEN GREATEST(0, l.outstanding_principal - n.current_from_emi)
    WHEN l.next_due_date IS NOT NULL
         AND l.next_due_date <= (CURRENT_DATE + INTERVAL '12 months')  THEN 0
    ELSE l.outstanding_principal
  END                                   AS non_current_portion,
  l.status                              AS liability_status
FROM liabilities l
LEFT JOIN next_12m n ON n.user_id = l.user_id AND n.liability_id = l.id
WHERE l.status IN ('active','restructured');


-- ── Module 11: interest accruals ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS liability_interest_accruals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             TEXT NOT NULL,
  liability_id        UUID NOT NULL REFERENCES liabilities(id) ON DELETE CASCADE,

  period_start        DATE NOT NULL,
  period_end          DATE NOT NULL,
  days_in_period      INT NOT NULL,

  opening_balance     NUMERIC(18,2) NOT NULL,
  annual_rate_pct     NUMERIC(8,4) NOT NULL,
  accrued_amount      NUMERIC(18,2) NOT NULL,

  status              TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('planned','posted','reversed')),
  journal_id          UUID,
  posted_by           TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (liability_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_accrual_user      ON liability_interest_accruals(user_id, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_accrual_liability ON liability_interest_accruals(liability_id, period_end);

ALTER TABLE liability_interest_accruals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS accrual_rls ON liability_interest_accruals;
CREATE POLICY accrual_rls ON liability_interest_accruals
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);


-- ── Module 13: covenants & compliance tracking ─────────────────────────────
CREATE TABLE IF NOT EXISTS liability_covenants (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                TEXT NOT NULL,
  liability_id           UUID NOT NULL REFERENCES liabilities(id) ON DELETE CASCADE,

  covenant_type          TEXT NOT NULL CHECK (covenant_type IN (
                           'financial_ratio','document_submission','payment_obligation',
                           'reporting_deadline','operational','negative_pledge','other'
                         )),
  title                  TEXT NOT NULL,
  description            TEXT,

  -- For financial-ratio covenants:
  metric                 TEXT,                -- e.g. 'debt_to_equity', 'current_ratio'
  threshold_operator     TEXT CHECK (threshold_operator IS NULL OR threshold_operator IN ('<','<=','>','>=','=')),
  threshold_value        NUMERIC(18,4),

  -- Cadence
  check_frequency        TEXT NOT NULL DEFAULT 'quarterly' CHECK (check_frequency IN (
                           'monthly','quarterly','semi_annual','annual','one_time'
                         )),
  next_check_due         DATE,
  reminder_days_before   INTEGER NOT NULL DEFAULT 14,

  is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  notes                  TEXT,
  document_url           TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by             TEXT
);

CREATE INDEX IF NOT EXISTS idx_cov_user        ON liability_covenants(user_id);
CREATE INDEX IF NOT EXISTS idx_cov_liability   ON liability_covenants(liability_id);
CREATE INDEX IF NOT EXISTS idx_cov_due         ON liability_covenants(user_id, next_check_due) WHERE is_active = TRUE;

ALTER TABLE liability_covenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cov_rls ON liability_covenants;
CREATE POLICY cov_rls ON liability_covenants
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);


CREATE TABLE IF NOT EXISTS liability_covenant_checks (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                TEXT NOT NULL,
  covenant_id            UUID NOT NULL REFERENCES liability_covenants(id) ON DELETE CASCADE,

  check_date             DATE NOT NULL,
  period_label           TEXT,                 -- e.g. 'Q2 FY26', 'Mar 2026'

  status                 TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                           'pending','met','breached','waived','not_applicable'
                         )),

  observed_value         NUMERIC(18,4),        -- for ratio covenants
  evidence_url           TEXT,
  remarks                TEXT,
  acknowledged_by        TEXT,
  acknowledged_on        DATE,

  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_covchk_user     ON liability_covenant_checks(user_id, check_date DESC);
CREATE INDEX IF NOT EXISTS idx_covchk_covenant ON liability_covenant_checks(covenant_id, check_date DESC);
CREATE INDEX IF NOT EXISTS idx_covchk_status   ON liability_covenant_checks(user_id, status);

ALTER TABLE liability_covenant_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS covchk_rls ON liability_covenant_checks;
CREATE POLICY covchk_rls ON liability_covenant_checks
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);


CREATE OR REPLACE FUNCTION touch_cov_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cov_touch ON liability_covenants;
CREATE TRIGGER trg_cov_touch BEFORE UPDATE ON liability_covenants
  FOR EACH ROW EXECUTE FUNCTION touch_cov_updated_at();


-- Enriched view used by /liabilities/covenants
CREATE OR REPLACE VIEW v_covenants_enriched AS
SELECT
  c.*,
  l.liability_code,
  l.name           AS liability_name,
  l.lender_name,
  (
    SELECT chk.status FROM liability_covenant_checks chk
    WHERE chk.covenant_id = c.id
    ORDER BY chk.check_date DESC LIMIT 1
  )                AS latest_status,
  (
    SELECT chk.check_date FROM liability_covenant_checks chk
    WHERE chk.covenant_id = c.id
    ORDER BY chk.check_date DESC LIMIT 1
  )                AS latest_check_date
FROM liability_covenants c
JOIN liabilities l ON l.id = c.liability_id AND l.user_id = c.user_id;


-- ── Module 14: net worth snapshot view ─────────────────────────────────────
-- Aggregates assets (active fixed assets at book_value + current bank/cash balances + AR + inventory)
-- and liabilities (active loans outstanding + AP + statutory).
-- This view is a CURRENT snapshot — pulls live data each query.
CREATE OR REPLACE VIEW v_net_worth_snapshot AS
WITH fa AS (
  SELECT user_id, COALESCE(SUM(book_value), 0) AS fixed_assets_value
  FROM fixed_assets
  WHERE status IN ('active','transferred')
  GROUP BY user_id
),
liab AS (
  SELECT user_id,
    COALESCE(SUM(outstanding_principal), 0)                                              AS total_debt,
    COALESCE(SUM(outstanding_principal) FILTER (WHERE is_secured = TRUE), 0)             AS secured_debt,
    COALESCE(SUM(outstanding_principal) FILTER (WHERE is_secured = FALSE), 0)            AS unsecured_debt,
    COALESCE(SUM(outstanding_principal) FILTER (WHERE is_statutory = TRUE), 0)           AS statutory_debt
  FROM liabilities
  WHERE status IN ('active','restructured')
  GROUP BY user_id
),
classification AS (
  SELECT user_id,
    COALESCE(SUM(current_portion), 0)                AS current_liabilities,
    COALESCE(SUM(non_current_portion), 0)            AS non_current_liabilities
  FROM v_liability_classification
  GROUP BY user_id
)
SELECT
  COALESCE(fa.user_id, liab.user_id, classification.user_id) AS user_id,
  COALESCE(fa.fixed_assets_value, 0)             AS fixed_assets_value,
  COALESCE(liab.total_debt, 0)                   AS total_debt,
  COALESCE(liab.secured_debt, 0)                 AS secured_debt,
  COALESCE(liab.unsecured_debt, 0)               AS unsecured_debt,
  COALESCE(liab.statutory_debt, 0)               AS statutory_debt,
  COALESCE(classification.current_liabilities, 0)     AS current_liabilities,
  COALESCE(classification.non_current_liabilities, 0) AS non_current_liabilities,
  COALESCE(fa.fixed_assets_value, 0) - COALESCE(liab.total_debt, 0) AS book_net_worth
FROM fa
FULL OUTER JOIN liab ON liab.user_id = fa.user_id
FULL OUTER JOIN classification ON classification.user_id = COALESCE(fa.user_id, liab.user_id);
