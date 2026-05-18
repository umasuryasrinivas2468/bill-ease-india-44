-- ════════════════════════════════════════════════════════════════════════════
-- Fixed Assets & Liabilities Management System
--
-- Adds ERP-grade Fixed Assets + Liabilities/Loans modules wired into the
-- existing journal/COA backbone (postJournal RPC, accounts table, RLS, etc.).
--
-- Tables created:
--   fixed_asset_categories      master list of asset categories + defaults
--   fixed_assets                the asset register
--   asset_depreciation_schedule per-period depreciation plan & postings
--   asset_transactions          lifecycle event log (purchase, transfer, ...)
--   asset_audit_log             immutable audit trail
--   liabilities                 loans / credit lines / advances / tax / etc.
--   loan_emi_schedule           amortised EMI breakdown for loan liabilities
--   liability_audit_log         immutable audit trail
--
-- All tables follow the existing user_id TEXT (Clerk ID) + RLS pattern.
-- Journal source_type CHECK is extended so new postings validate.
-- ════════════════════════════════════════════════════════════════════════════

-- ── extend journals.source_type to allow asset & loan postings ──────────────
DO $$
BEGIN
  -- Drop and re-create with the union of old + new types.
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
        -- Liabilities / Loans module
        'loan_disbursement', 'loan_disbursement_reversal',
        'loan_emi', 'loan_emi_reversal',
        'loan_interest_accrual',
        'liability_settlement'
      )
    );
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Fixed asset categories (master list, per-user with global seeds)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS fixed_asset_categories (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     TEXT NOT NULL,
  name                        TEXT NOT NULL,
  code                        TEXT,
  default_useful_life_years   NUMERIC(6,2) NOT NULL DEFAULT 5,
  default_depreciation_method TEXT NOT NULL DEFAULT 'SLM' CHECK (default_depreciation_method IN ('SLM', 'WDV')),
  default_depreciation_rate   NUMERIC(6,3),   -- percentage; required for WDV
  default_salvage_percent     NUMERIC(6,3) DEFAULT 5,
  is_intangible               BOOLEAN NOT NULL DEFAULT FALSE,
  asset_account_name          TEXT,           -- default leaf-account-name template
  accum_dep_account_name      TEXT,
  dep_expense_account_name    TEXT,
  is_active                   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_fa_categories_user ON fixed_asset_categories(user_id);

ALTER TABLE fixed_asset_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fa_categories_rls ON fixed_asset_categories;
CREATE POLICY fa_categories_rls ON fixed_asset_categories
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);

-- ── per-user seeder for default categories ──
CREATE OR REPLACE FUNCTION seed_fixed_asset_categories(p_user_id TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO fixed_asset_categories (user_id, name, code, default_useful_life_years, default_depreciation_method, default_depreciation_rate, default_salvage_percent, is_intangible)
  VALUES
    (p_user_id, 'Machinery',          'MACH', 15, 'SLM',  6.33, 5,  FALSE),
    (p_user_id, 'Computers',          'COMP',  3, 'WDV', 40.00, 5,  FALSE),
    (p_user_id, 'Vehicles',           'VEHI',  8, 'WDV', 15.00, 5,  FALSE),
    (p_user_id, 'Furniture',          'FURN', 10, 'SLM',  9.50, 5,  FALSE),
    (p_user_id, 'Office Equipment',   'OFEQ',  5, 'WDV', 13.91, 5,  FALSE),
    (p_user_id, 'Land',               'LAND',  0, 'SLM',  0.00, 0,  FALSE),
    (p_user_id, 'Buildings',          'BLDG', 30, 'SLM',  3.17, 5,  FALSE),
    (p_user_id, 'Intangible Assets',  'INTG',  5, 'SLM', 20.00, 0,  TRUE),
    (p_user_id, 'Software',           'SOFT',  3, 'SLM', 33.33, 0,  TRUE)
  ON CONFLICT (user_id, name) DO NOTHING;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- 2. Fixed assets register
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS fixed_assets (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                       TEXT NOT NULL,
  asset_code                    TEXT NOT NULL,
  name                          TEXT NOT NULL,
  description                   TEXT,
  category_id                   UUID REFERENCES fixed_asset_categories(id) ON DELETE SET NULL,
  category_name                 TEXT,         -- denormalised for reporting
  -- Purchase details
  purchase_value                NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (purchase_value >= 0),
  gst_amount                    NUMERIC(18,2) NOT NULL DEFAULT 0,
  cgst_amount                   NUMERIC(18,2) NOT NULL DEFAULT 0,
  sgst_amount                   NUMERIC(18,2) NOT NULL DEFAULT 0,
  igst_amount                   NUMERIC(18,2) NOT NULL DEFAULT 0,
  gst_rate                      NUMERIC(6,3),
  itc_eligible                  BOOLEAN NOT NULL DEFAULT TRUE,
  total_capitalised_value       NUMERIC(18,2) NOT NULL DEFAULT 0,
  purchase_date                 DATE NOT NULL,
  capitalised_on                DATE,
  vendor_id                     UUID,
  vendor_name                   TEXT,
  source_type                   TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual','purchase_bill','expense','import')),
  source_id                     UUID,         -- e.g. purchase_bills.id or expenses.id
  -- Depreciation
  useful_life_years             NUMERIC(6,2) NOT NULL DEFAULT 5,
  depreciation_method           TEXT NOT NULL DEFAULT 'SLM' CHECK (depreciation_method IN ('SLM','WDV','None')),
  depreciation_rate             NUMERIC(6,3), -- annual %, used by WDV
  salvage_value                 NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (salvage_value >= 0),
  accumulated_depreciation      NUMERIC(18,2) NOT NULL DEFAULT 0,
  book_value                    NUMERIC(18,2) NOT NULL DEFAULT 0,
  last_depreciated_through      DATE,
  -- Location / tags
  location                      TEXT,
  branch_id                     TEXT,
  cost_center_id                UUID,
  custodian                     TEXT,
  serial_number                 TEXT,
  -- Status
  status                        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','disposed','written_off','transferred','impaired')),
  disposed_at                   DATE,
  disposal_amount               NUMERIC(18,2),
  profit_loss_on_disposal       NUMERIC(18,2),
  -- COA linkage (auto-created sub-ledger accounts)
  asset_account_id              UUID REFERENCES accounts(id),
  accum_dep_account_id          UUID REFERENCES accounts(id),
  dep_expense_account_id        UUID REFERENCES accounts(id),
  -- Misc
  notes                         TEXT,
  attachment_url                TEXT,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                    TEXT,
  UNIQUE (user_id, asset_code)
);

CREATE INDEX IF NOT EXISTS idx_fixed_assets_user           ON fixed_assets(user_id);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_status         ON fixed_assets(user_id, status);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_category       ON fixed_assets(user_id, category_id);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_source         ON fixed_assets(user_id, source_type, source_id);

ALTER TABLE fixed_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fixed_assets_rls ON fixed_assets;
CREATE POLICY fixed_assets_rls ON fixed_assets
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);

-- keep updated_at fresh
CREATE OR REPLACE FUNCTION touch_fixed_assets_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_fixed_assets_updated_at ON fixed_assets;
CREATE TRIGGER trg_fixed_assets_updated_at
  BEFORE UPDATE ON fixed_assets
  FOR EACH ROW EXECUTE FUNCTION touch_fixed_assets_updated_at();


-- ════════════════════════════════════════════════════════════════════════════
-- 3. Depreciation schedule (one row per period per asset)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS asset_depreciation_schedule (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                TEXT NOT NULL,
  asset_id               UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  period_index           INT NOT NULL,                      -- 1..N (monthly periods)
  period_start           DATE NOT NULL,
  period_end             DATE NOT NULL,
  fiscal_year            TEXT,                              -- e.g. '2025-26'
  opening_book_value     NUMERIC(18,2) NOT NULL,
  depreciation_amount    NUMERIC(18,2) NOT NULL,
  accumulated_after      NUMERIC(18,2) NOT NULL,
  closing_book_value     NUMERIC(18,2) NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','posted','skipped','adjusted')),
  journal_id             UUID,                              -- set when posted
  posted_at              TIMESTAMPTZ,
  posted_by              TEXT,
  manual_override        BOOLEAN NOT NULL DEFAULT FALSE,
  notes                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (asset_id, period_index)
);

CREATE INDEX IF NOT EXISTS idx_dep_schedule_user_status ON asset_depreciation_schedule(user_id, status);
CREATE INDEX IF NOT EXISTS idx_dep_schedule_asset       ON asset_depreciation_schedule(asset_id);
CREATE INDEX IF NOT EXISTS idx_dep_schedule_period      ON asset_depreciation_schedule(user_id, period_end);

ALTER TABLE asset_depreciation_schedule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dep_schedule_rls ON asset_depreciation_schedule;
CREATE POLICY dep_schedule_rls ON asset_depreciation_schedule
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);


-- ════════════════════════════════════════════════════════════════════════════
-- 4. Asset transactions (lifecycle event log)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS asset_transactions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            TEXT NOT NULL,
  asset_id           UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  transaction_type   TEXT NOT NULL CHECK (transaction_type IN (
                       'purchase','capitalization','depreciation','revaluation',
                       'transfer','impairment','disposal','write_off','adjustment'
                     )),
  transaction_date   DATE NOT NULL,
  amount             NUMERIC(18,2),
  from_location      TEXT,
  to_location        TEXT,
  journal_id         UUID,
  notes              TEXT,
  created_by         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_txn_asset ON asset_transactions(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_txn_user  ON asset_transactions(user_id, transaction_date DESC);

ALTER TABLE asset_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS asset_txn_rls ON asset_transactions;
CREATE POLICY asset_txn_rls ON asset_transactions
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);


-- ════════════════════════════════════════════════════════════════════════════
-- 5. Asset audit log (append-only, immutable)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS asset_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,
  asset_id      UUID REFERENCES fixed_assets(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,        -- created / updated / disposed / depreciated / impaired / transferred / write_off
  before_state  JSONB,
  after_state   JSONB,
  actor         TEXT,
  ip            TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_audit_user  ON asset_audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_asset_audit_asset ON asset_audit_log(asset_id);

ALTER TABLE asset_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS asset_audit_select ON asset_audit_log;
CREATE POLICY asset_audit_select ON asset_audit_log
  FOR SELECT USING (auth.uid()::text = user_id);
DROP POLICY IF EXISTS asset_audit_insert ON asset_audit_log;
CREATE POLICY asset_audit_insert ON asset_audit_log
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);
-- No UPDATE / DELETE policies — audit log is append-only.


-- ════════════════════════════════════════════════════════════════════════════
-- 6. Liabilities register
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS liabilities (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   TEXT NOT NULL,
  liability_code            TEXT NOT NULL,
  name                      TEXT NOT NULL,
  liability_type            TEXT NOT NULL CHECK (liability_type IN (
                              'loan','credit_line','vendor_advance','tax','long_term','short_term','other'
                            )),
  -- Counterparty
  lender_name               TEXT,
  lender_contact            TEXT,
  vendor_id                 UUID,
  -- Money
  principal_amount          NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (principal_amount >= 0),
  disbursed_amount          NUMERIC(18,2) NOT NULL DEFAULT 0,
  outstanding_principal     NUMERIC(18,2) NOT NULL DEFAULT 0,
  interest_rate             NUMERIC(7,4),   -- annual % (e.g. 9.5000)
  interest_type             TEXT DEFAULT 'reducing' CHECK (interest_type IN ('reducing','flat','none')),
  total_interest_accrued    NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_interest_paid       NUMERIC(18,2) NOT NULL DEFAULT 0,
  -- Schedule
  tenure_months             INT,
  emi_amount                NUMERIC(18,2),
  emi_day_of_month          INT CHECK (emi_day_of_month BETWEEN 1 AND 31),
  start_date                DATE,
  end_date                  DATE,
  next_due_date             DATE,
  -- Status
  status                    TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','closed','defaulted','restructured')),
  closed_at                 DATE,
  -- COA linkage
  liability_account_id      UUID REFERENCES accounts(id),
  interest_expense_account_id UUID REFERENCES accounts(id),
  -- Misc
  account_number            TEXT,
  notes                     TEXT,
  attachment_url            TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                TEXT,
  UNIQUE (user_id, liability_code)
);

CREATE INDEX IF NOT EXISTS idx_liabilities_user   ON liabilities(user_id);
CREATE INDEX IF NOT EXISTS idx_liabilities_type   ON liabilities(user_id, liability_type, status);
CREATE INDEX IF NOT EXISTS idx_liabilities_due    ON liabilities(user_id, next_due_date) WHERE status = 'active';

ALTER TABLE liabilities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS liabilities_rls ON liabilities;
CREATE POLICY liabilities_rls ON liabilities
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);

CREATE OR REPLACE FUNCTION touch_liabilities_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_liabilities_updated_at ON liabilities;
CREATE TRIGGER trg_liabilities_updated_at
  BEFORE UPDATE ON liabilities
  FOR EACH ROW EXECUTE FUNCTION touch_liabilities_updated_at();


-- ════════════════════════════════════════════════════════════════════════════
-- 7. Loan EMI schedule (one row per scheduled EMI)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS loan_emi_schedule (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             TEXT NOT NULL,
  liability_id        UUID NOT NULL REFERENCES liabilities(id) ON DELETE CASCADE,
  emi_number          INT NOT NULL,
  due_date            DATE NOT NULL,
  opening_balance     NUMERIC(18,2) NOT NULL,
  principal_component NUMERIC(18,2) NOT NULL,
  interest_component  NUMERIC(18,2) NOT NULL,
  total_emi           NUMERIC(18,2) NOT NULL,
  closing_balance     NUMERIC(18,2) NOT NULL,
  status              TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','paid','partial','skipped','overdue')),
  paid_amount         NUMERIC(18,2) NOT NULL DEFAULT 0,
  paid_on             DATE,
  journal_id          UUID,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (liability_id, emi_number)
);

CREATE INDEX IF NOT EXISTS idx_emi_user_due  ON loan_emi_schedule(user_id, due_date);
CREATE INDEX IF NOT EXISTS idx_emi_liability ON loan_emi_schedule(liability_id);
CREATE INDEX IF NOT EXISTS idx_emi_status    ON loan_emi_schedule(user_id, status);

ALTER TABLE loan_emi_schedule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS loan_emi_rls ON loan_emi_schedule;
CREATE POLICY loan_emi_rls ON loan_emi_schedule
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);


-- ════════════════════════════════════════════════════════════════════════════
-- 8. Liability audit log (append-only)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS liability_audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT NOT NULL,
  liability_id UUID REFERENCES liabilities(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,
  before_state JSONB,
  after_state  JSONB,
  actor        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_liab_audit_user      ON liability_audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_liab_audit_liability ON liability_audit_log(liability_id);

ALTER TABLE liability_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS liab_audit_select ON liability_audit_log;
CREATE POLICY liab_audit_select ON liability_audit_log
  FOR SELECT USING (auth.uid()::text = user_id);
DROP POLICY IF EXISTS liab_audit_insert ON liability_audit_log;
CREATE POLICY liab_audit_insert ON liability_audit_log
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);


-- ════════════════════════════════════════════════════════════════════════════
-- 9. Helper views for dashboards / reports
-- ════════════════════════════════════════════════════════════════════════════

-- Fixed asset register snapshot
CREATE OR REPLACE VIEW v_fixed_asset_register AS
SELECT
  fa.id,
  fa.user_id,
  fa.asset_code,
  fa.name,
  fa.category_name,
  fa.purchase_date,
  fa.purchase_value,
  fa.gst_amount,
  fa.total_capitalised_value,
  fa.vendor_name,
  fa.depreciation_method,
  fa.useful_life_years,
  fa.accumulated_depreciation,
  fa.book_value,
  fa.location,
  fa.status,
  fa.disposed_at,
  fa.profit_loss_on_disposal,
  COALESCE((
    SELECT MAX(period_end)
    FROM asset_depreciation_schedule s
    WHERE s.asset_id = fa.id AND s.status = 'posted'
  ), fa.capitalised_on) AS last_depreciated_through
FROM fixed_assets fa;

-- Upcoming EMIs across all liabilities (next 90 days)
CREATE OR REPLACE VIEW v_upcoming_emis AS
SELECT
  e.id,
  e.user_id,
  e.liability_id,
  l.name        AS liability_name,
  l.lender_name,
  e.emi_number,
  e.due_date,
  e.principal_component,
  e.interest_component,
  e.total_emi,
  e.status,
  (e.due_date - CURRENT_DATE) AS days_until_due
FROM loan_emi_schedule e
JOIN liabilities l ON l.id = e.liability_id
WHERE e.status IN ('planned','partial','overdue');

-- Net worth summary (per user)
CREATE OR REPLACE VIEW v_net_worth_summary AS
SELECT
  user_id,
  COALESCE(SUM(book_value) FILTER (WHERE status IN ('active','impaired')), 0) AS total_asset_book_value,
  COALESCE(SUM(total_capitalised_value) FILTER (WHERE status IN ('active','impaired')), 0) AS total_asset_cost,
  COALESCE(SUM(accumulated_depreciation) FILTER (WHERE status IN ('active','impaired')), 0) AS total_accum_depreciation
FROM fixed_assets
GROUP BY user_id;


-- ════════════════════════════════════════════════════════════════════════════
-- 10. Backfill: seed default categories for existing users (best-effort)
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  uid TEXT;
BEGIN
  FOR uid IN SELECT DISTINCT user_id FROM accounts WHERE user_id IS NOT NULL LOOP
    PERFORM seed_fixed_asset_categories(uid);
  END LOOP;
END $$;
