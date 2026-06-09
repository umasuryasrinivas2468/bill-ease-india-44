-- ============================================================================
-- PHASE 33 - DOUBLE-ENTRY ACCOUNTING BACKBONE HARDENING
-- ----------------------------------------------------------------------------
-- Objective: make Aczen's accounting layer behave like a true ERP-grade
-- double-entry engine. Earlier phases already introduced journals, journal
-- lines, COA mappings, vendor/customer sub-ledgers, manual journals, GST
-- reconciliation, period locks, and journal-derived reports. This phase makes
-- those pieces enforceable and easier to consume:
--
--   1. Strong journal invariants: no orphan lines, no inactive-account posting,
--      no posted unbalanced journal, no zero-line posted journal.
--   2. Accounting settings section with FY, currency, posting, approval,
--      recurring, reversal, rounding, GST/TDS/TCS preferences.
--   3. ERP-grade default COA coverage and scenario mappings.
--   4. First-class sub-ledger support beyond vendors/customers.
--   5. Sub-ledger reconciliation and accounting health dashboard RPCs.
--   6. Journal templates, recurring journals, cloning, and approval scaffolding.
--
-- Re-runnable. No destructive changes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Journal and line hardening
-- ---------------------------------------------------------------------------

ALTER TABLE journals
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('draft','pending_approval','approved','rejected','cancelled')),
  ADD COLUMN IF NOT EXISTS approved_by TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cloned_from_journal_id UUID REFERENCES journals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversal_reason TEXT,
  ADD COLUMN IF NOT EXISTS reversal_of_journal_id UUID REFERENCES journals(id) ON DELETE SET NULL;

ALTER TABLE journal_lines
  ADD COLUMN IF NOT EXISTS subledger_entity_type TEXT
    CHECK (subledger_entity_type IS NULL OR subledger_entity_type IN (
      'customer','vendor','employee','loan','asset','project','branch','tax','other'
    )),
  ADD COLUMN IF NOT EXISTS subledger_entity_id UUID,
  ADD COLUMN IF NOT EXISTS tax_impact JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS notes TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'journal_lines_journal_id_present_chk'
  ) THEN
    ALTER TABLE journal_lines
      ADD CONSTRAINT journal_lines_journal_id_present_chk CHECK (journal_id IS NOT NULL) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'journal_lines_account_id_present_chk'
  ) THEN
    ALTER TABLE journal_lines
      ADD CONSTRAINT journal_lines_account_id_present_chk CHECK (account_id IS NOT NULL) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_journal_lines_subledger_entity
  ON journal_lines(user_id, subledger_entity_type, subledger_entity_id)
  WHERE subledger_entity_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_journals_approval_status
  ON journals(user_id, approval_status, status);

CREATE OR REPLACE FUNCTION enforce_journal_line_account_integrity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_account accounts%ROWTYPE;
  v_journal_user TEXT;
BEGIN
  SELECT user_id INTO v_journal_user FROM journals WHERE id = NEW.journal_id;
  IF v_journal_user IS NULL THEN
    RAISE EXCEPTION 'Journal line references a missing journal.' USING ERRCODE = '23503';
  END IF;

  SELECT * INTO v_account FROM accounts WHERE id = NEW.account_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journal line references a missing account.' USING ERRCODE = '23503';
  END IF;

  IF v_account.user_id <> v_journal_user THEN
    RAISE EXCEPTION 'Journal line account belongs to a different user/company.' USING ERRCODE = '23514';
  END IF;

  IF COALESCE(v_account.is_active, TRUE) = FALSE THEN
    RAISE EXCEPTION 'Cannot post to inactive account "%".', v_account.account_name USING ERRCODE = '23514';
  END IF;

  IF COALESCE(v_account.is_group, FALSE) = TRUE THEN
    RAISE EXCEPTION 'Cannot post to group/control account "%". Pick a leaf ledger.', v_account.account_name
      USING ERRCODE = '23514';
  END IF;

  NEW.user_id := COALESCE(NEW.user_id, v_journal_user);
  NEW.entry_date := COALESCE(NEW.entry_date, (SELECT journal_date FROM journals WHERE id = NEW.journal_id));

  IF NEW.vendor_id IS NOT NULL THEN
    NEW.subledger_entity_type := COALESCE(NEW.subledger_entity_type, 'vendor');
    NEW.subledger_entity_id := COALESCE(NEW.subledger_entity_id, NEW.vendor_id);
  ELSIF NEW.customer_id IS NOT NULL THEN
    NEW.subledger_entity_type := COALESCE(NEW.subledger_entity_type, 'customer');
    NEW.subledger_entity_id := COALESCE(NEW.subledger_entity_id, NEW.customer_id);
  ELSIF NEW.project_id IS NOT NULL THEN
    NEW.subledger_entity_type := COALESCE(NEW.subledger_entity_type, 'project');
    NEW.subledger_entity_id := COALESCE(NEW.subledger_entity_id, NEW.project_id);
  ELSIF NEW.branch_id IS NOT NULL THEN
    NEW.subledger_entity_type := COALESCE(NEW.subledger_entity_type, 'branch');
    NEW.subledger_entity_id := COALESCE(NEW.subledger_entity_id, NEW.branch_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_line_account_integrity ON journal_lines;
CREATE TRIGGER trg_journal_line_account_integrity
  BEFORE INSERT OR UPDATE OF journal_id, account_id, user_id, vendor_id, customer_id, project_id, branch_id
  ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION enforce_journal_line_account_integrity();

CREATE OR REPLACE FUNCTION enforce_posted_journal_integrity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_line_count INT;
  v_dr NUMERIC;
  v_cr NUMERIC;
BEGIN
  IF NEW.status = 'posted' THEN
    SELECT COUNT(*), COALESCE(SUM(COALESCE(debit,0)),0), COALESCE(SUM(COALESCE(credit,0)),0)
      INTO v_line_count, v_dr, v_cr
    FROM journal_lines
    WHERE journal_id = NEW.id;

    IF v_line_count < 2 THEN
      RAISE EXCEPTION 'A posted journal must have at least two journal lines.' USING ERRCODE = '23514';
    END IF;

    IF v_dr <= 0 OR v_cr <= 0 OR ABS(v_dr - v_cr) > 0.01 THEN
      RAISE EXCEPTION 'Cannot post unbalanced journal %. Debits %, credits %.',
        NEW.journal_number, v_dr, v_cr USING ERRCODE = '23514';
    END IF;

    IF NEW.approval_status IN ('draft','pending_approval','rejected','cancelled') THEN
      RAISE EXCEPTION 'Cannot post journal % while approval status is %.',
        NEW.journal_number, NEW.approval_status USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_posted_journal_integrity ON journals;
CREATE CONSTRAINT TRIGGER trg_posted_journal_integrity
  AFTER INSERT OR UPDATE OF status, approval_status, total_debit, total_credit
  ON journals
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_posted_journal_integrity();

-- ---------------------------------------------------------------------------
-- 2. Accounting settings section
-- ---------------------------------------------------------------------------

ALTER TABLE accounting_settings
  ADD COLUMN IF NOT EXISTS financial_year_start DATE,
  ADD COLUMN IF NOT EXISTS financial_year_end DATE,
  ADD COLUMN IF NOT EXISTS period_locking_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS year_end_close_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS default_currency TEXT NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS multi_currency_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS decimal_precision INT NOT NULL DEFAULT 2 CHECK (decimal_precision BETWEEN 0 AND 6),
  ADD COLUMN IF NOT EXISTS auto_numbering_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS rounding_rule TEXT NOT NULL DEFAULT 'nearest_rupee'
    CHECK (rounding_rule IN ('none','nearest_rupee','nearest_paisa','bankers','up','down')),
  ADD COLUMN IF NOT EXISTS auto_posting_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS manual_journal_approval_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS recurring_journals_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS reversal_requires_reason BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS gst_configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS tds_configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS tcs_configuration JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION ensure_accounting_settings(p_user_id TEXT)
RETURNS accounting_settings LANGUAGE plpgsql AS $$
DECLARE
  v_settings accounting_settings;
  v_start_year INT;
BEGIN
  v_start_year := CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE)::INT >= 4
                       THEN EXTRACT(YEAR FROM CURRENT_DATE)::INT
                       ELSE EXTRACT(YEAR FROM CURRENT_DATE)::INT - 1 END;

  INSERT INTO accounting_settings (
    user_id,
    financial_year_start,
    financial_year_end,
    default_currency,
    reporting_currency,
    default_valuation_method,
    rounding_off_method,
    rounding_rule
  )
  VALUES (
    p_user_id,
    make_date(v_start_year, 4, 1),
    make_date(v_start_year + 1, 3, 31),
    'INR',
    'INR',
    'FIFO',
    'nearest_rupee',
    'nearest_rupee'
  )
  ON CONFLICT (user_id) DO UPDATE
    SET financial_year_start = COALESCE(accounting_settings.financial_year_start, EXCLUDED.financial_year_start),
        financial_year_end   = COALESCE(accounting_settings.financial_year_end, EXCLUDED.financial_year_end),
        default_currency     = COALESCE(accounting_settings.default_currency, EXCLUDED.default_currency),
        reporting_currency   = COALESCE(accounting_settings.reporting_currency, EXCLUDED.reporting_currency)
  RETURNING * INTO v_settings;

  RETURN v_settings;
END;
$$;

GRANT EXECUTE ON FUNCTION ensure_accounting_settings(TEXT) TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- 3. ERP-grade COA seed extension and control account mappings
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION ensure_erp_grade_coa(p_user_id TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_curr_assets UUID; v_noncurr_assets UUID; v_curr_liab UUID; v_long_liab UUID;
  v_equity UUID; v_income UUID; v_expenses UUID;
BEGIN
  PERFORM ensure_default_coa(p_user_id);
  PERFORM ensure_subledger_control_accounts(p_user_id);
  PERFORM ensure_accounting_settings(p_user_id);

  SELECT id INTO v_curr_assets FROM accounts WHERE user_id = p_user_id AND account_code = '1100';
  SELECT id INTO v_noncurr_assets FROM accounts WHERE user_id = p_user_id AND account_code = '1200';

  SELECT id INTO v_curr_liab FROM accounts WHERE user_id = p_user_id AND account_code = '2100';
  SELECT id INTO v_long_liab FROM accounts WHERE user_id = p_user_id AND account_code = '2200';
  IF v_long_liab IS NULL THEN
    INSERT INTO accounts (user_id, account_code, account_name, account_type, is_group, account_group, account_subgroup, is_active)
    VALUES (p_user_id, '2200', 'Long-Term Liabilities', 'Liability', TRUE, 'Liabilities', 'Long-Term Liabilities', TRUE)
    ON CONFLICT (user_id, account_code) DO NOTHING;
    SELECT id INTO v_long_liab FROM accounts WHERE user_id = p_user_id AND account_code = '2200';
  END IF;

  SELECT id INTO v_equity FROM accounts WHERE user_id = p_user_id AND account_code = '3000';
  SELECT id INTO v_income FROM accounts WHERE user_id = p_user_id AND account_code = '4000';
  SELECT id INTO v_expenses FROM accounts WHERE user_id = p_user_id AND account_code = '5200';

  INSERT INTO accounts (
    user_id, account_code, account_name, account_type, parent_account_id,
    account_group, account_subgroup, cash_flow_category, reconciliation_required,
    allow_manual_journals, is_active, opening_balance, description
  ) VALUES
    (p_user_id, '1111', 'Cash in Hand', 'Asset', v_curr_assets, 'Assets', 'Current Assets', 'Operating', FALSE, TRUE, TRUE, 0, 'Cash held by the business.'),
    (p_user_id, '1112', 'Petty Cash', 'Asset', v_curr_assets, 'Assets', 'Current Assets', 'Operating', FALSE, TRUE, TRUE, 0, 'Imprest/petty cash ledger.'),
    (p_user_id, '1135', 'Trade Receivables', 'Asset', v_curr_assets, 'Assets', 'Trade Receivables', 'Operating', TRUE, FALSE, TRUE, 0, 'Receivable control account.'),
    (p_user_id, '1136', 'Employee Advances', 'Asset', v_curr_assets, 'Assets', 'Employee Advances', 'Operating', TRUE, TRUE, TRUE, 0, 'Employee advance sub-ledger control.'),
    (p_user_id, '1155', 'GST Input Credit', 'Asset', v_curr_assets, 'Assets', 'GST Input Credit', 'Operating', TRUE, FALSE, TRUE, 0, 'GST ITC control account.'),
    (p_user_id, '1156', 'TDS Receivable', 'Asset', v_curr_assets, 'Assets', 'TDS Receivable', 'Operating', TRUE, FALSE, TRUE, 0, 'Tax deducted by customers receivable.'),
    (p_user_id, '1157', 'TCS Receivable', 'Asset', v_curr_assets, 'Assets', 'TCS Receivable', 'Operating', TRUE, FALSE, TRUE, 0, 'Tax collected at source receivable.'),
    (p_user_id, '1175', 'Prepaid Expenses Control', 'Asset', v_curr_assets, 'Assets', 'Prepaid Expenses', 'Operating', TRUE, TRUE, TRUE, 0, 'Prepaid expense amortisation control.'),
    (p_user_id, '1510', 'Plant & Machinery', 'Asset', v_noncurr_assets, 'Assets', 'Property Plant and Equipment', 'Investing', TRUE, TRUE, TRUE, 0, 'Fixed asset category.'),
    (p_user_id, '1520', 'Furniture & Fixtures', 'Asset', v_noncurr_assets, 'Assets', 'Property Plant and Equipment', 'Investing', TRUE, TRUE, TRUE, 0, 'Fixed asset category.'),
    (p_user_id, '1530', 'Computers', 'Asset', v_noncurr_assets, 'Assets', 'Property Plant and Equipment', 'Investing', TRUE, TRUE, TRUE, 0, 'Fixed asset category.'),
    (p_user_id, '1540', 'Vehicles', 'Asset', v_noncurr_assets, 'Assets', 'Property Plant and Equipment', 'Investing', TRUE, TRUE, TRUE, 0, 'Fixed asset category.'),
    (p_user_id, '1550', 'Buildings', 'Asset', v_noncurr_assets, 'Assets', 'Property Plant and Equipment', 'Investing', TRUE, TRUE, TRUE, 0, 'Fixed asset category.'),
    (p_user_id, '1560', 'Land', 'Asset', v_noncurr_assets, 'Assets', 'Property Plant and Equipment', 'Investing', TRUE, TRUE, TRUE, 0, 'Fixed asset category.'),
    (p_user_id, '1570', 'Capital Work in Progress', 'Asset', v_noncurr_assets, 'Assets', 'CWIP', 'Investing', TRUE, TRUE, TRUE, 0, 'CWIP control account.'),
    (p_user_id, '1580', 'Intangible Assets', 'Asset', v_noncurr_assets, 'Assets', 'Intangible Assets', 'Investing', TRUE, TRUE, TRUE, 0, 'Intangible assets control.'),
    (p_user_id, '1590', 'Accumulated Depreciation', 'Asset', v_noncurr_assets, 'Assets', 'Accumulated Depreciation', 'Investing', TRUE, FALSE, TRUE, 0, 'Contra-asset depreciation control.'),
    (p_user_id, '2115', 'Trade Payables', 'Liability', v_curr_liab, 'Liabilities', 'Trade Payables', 'Operating', TRUE, FALSE, TRUE, 0, 'Payable control account.'),
    (p_user_id, '2136', 'GST Payable', 'Liability', v_curr_liab, 'Liabilities', 'GST Payable', 'Operating', TRUE, FALSE, TRUE, 0, 'GST output/control payable.'),
    (p_user_id, '2155', 'TCS Payable', 'Liability', v_curr_liab, 'Liabilities', 'TCS Payable', 'Operating', TRUE, FALSE, TRUE, 0, 'TCS payable control.'),
    (p_user_id, '2165', 'Salaries Payable', 'Liability', v_curr_liab, 'Liabilities', 'Accrued Expenses', 'Operating', TRUE, TRUE, TRUE, 0, 'Payroll accrual.'),
    (p_user_id, '2170', 'Expenses Payable', 'Liability', v_curr_liab, 'Liabilities', 'Accrued Expenses', 'Operating', TRUE, TRUE, TRUE, 0, 'Expense accrual.'),
    (p_user_id, '2180', 'Current Loan Liability', 'Liability', v_curr_liab, 'Liabilities', 'Current Loan Liability', 'Financing', TRUE, TRUE, TRUE, 0, 'Current loan portion.'),
    (p_user_id, '2210', 'Term Loans', 'Liability', v_long_liab, 'Liabilities', 'Long-Term Liabilities', 'Financing', TRUE, TRUE, TRUE, 0, 'Long term loans.'),
    (p_user_id, '2220', 'Lease Liabilities', 'Liability', v_long_liab, 'Liabilities', 'Lease Liabilities', 'Financing', TRUE, TRUE, TRUE, 0, 'Lease liability control.'),
    (p_user_id, '2230', 'Director Loans', 'Liability', v_long_liab, 'Liabilities', 'Director Loans', 'Financing', TRUE, TRUE, TRUE, 0, 'Director loan control.'),
    (p_user_id, '3110', 'Share Capital', 'Equity', v_equity, 'Equity', 'Share Capital', 'Financing', FALSE, TRUE, TRUE, 0, 'Equity capital.'),
    (p_user_id, '3120', 'Additional Capital', 'Equity', v_equity, 'Equity', 'Additional Capital', 'Financing', FALSE, TRUE, TRUE, 0, 'Additional owner/shareholder capital.'),
    (p_user_id, '3130', 'Reserves', 'Equity', v_equity, 'Equity', 'Reserves', NULL, FALSE, TRUE, TRUE, 0, 'General reserves.'),
    (p_user_id, '4120', 'Service Revenue', 'Income', v_income, 'Income', 'Operating Revenue', 'Operating', FALSE, TRUE, TRUE, 0, 'Service revenue.'),
    (p_user_id, '4200', 'Other Income', 'Income', v_income, 'Income', 'Other Income', 'Operating', FALSE, TRUE, TRUE, 0, 'Other income.'),
    (p_user_id, '4210', 'Interest Income', 'Income', v_income, 'Income', 'Other Income', 'Investing', FALSE, TRUE, TRUE, 0, 'Interest income.'),
    (p_user_id, '4220', 'Rental Income', 'Income', v_income, 'Income', 'Other Income', 'Operating', FALSE, TRUE, TRUE, 0, 'Rental income.'),
    (p_user_id, '5240', 'Salaries', 'Expense', v_expenses, 'Expenses', 'Employee Benefits', 'Operating', FALSE, TRUE, TRUE, 0, 'Salary expense.'),
    (p_user_id, '5250', 'Rent', 'Expense', v_expenses, 'Expenses', 'Operating Expenses', 'Operating', FALSE, TRUE, TRUE, 0, 'Rent expense.'),
    (p_user_id, '5260', 'Utilities', 'Expense', v_expenses, 'Expenses', 'Operating Expenses', 'Operating', FALSE, TRUE, TRUE, 0, 'Utilities.'),
    (p_user_id, '5270', 'Professional Fees', 'Expense', v_expenses, 'Expenses', 'Professional Fees', 'Operating', FALSE, TRUE, TRUE, 0, 'Professional fees.'),
    (p_user_id, '5280', 'Marketing', 'Expense', v_expenses, 'Expenses', 'Marketing', 'Operating', FALSE, TRUE, TRUE, 0, 'Marketing expense.'),
    (p_user_id, '5281', 'Travel', 'Expense', v_expenses, 'Expenses', 'Travel', 'Operating', FALSE, TRUE, TRUE, 0, 'Travel expense.'),
    (p_user_id, '5282', 'Depreciation', 'Expense', v_expenses, 'Expenses', 'Depreciation', 'Operating', FALSE, FALSE, TRUE, 0, 'Depreciation expense.'),
    (p_user_id, '5283', 'Interest Expense', 'Expense', v_expenses, 'Expenses', 'Finance Costs', 'Financing', FALSE, TRUE, TRUE, 0, 'Interest expense.'),
    (p_user_id, '5284', 'Repairs & Maintenance', 'Expense', v_expenses, 'Expenses', 'Repairs and Maintenance', 'Operating', FALSE, TRUE, TRUE, 0, 'Repairs and maintenance.'),
    (p_user_id, '5285', 'Software Subscriptions', 'Expense', v_expenses, 'Expenses', 'Software Subscriptions', 'Operating', FALSE, TRUE, TRUE, 0, 'Software subscriptions.')
  ON CONFLICT (user_id, account_code) DO UPDATE
    SET account_subgroup = COALESCE(accounts.account_subgroup, EXCLUDED.account_subgroup),
        cash_flow_category = COALESCE(accounts.cash_flow_category, EXCLUDED.cash_flow_category),
        reconciliation_required = accounts.reconciliation_required OR EXCLUDED.reconciliation_required,
        description = COALESCE(accounts.description, EXCLUDED.description);

  INSERT INTO account_mapping(user_id, module, scenario_key, account_id)
  SELECT p_user_id, m.module, m.scenario_key, a.id
  FROM (VALUES
    ('AR','receivable_control','Trade Receivables'),
    ('AP','payable_control','Trade Payables'),
    ('GST','gst_input_credit','GST Input Credit'),
    ('GST','gst_payable','GST Payable'),
    ('TDS','tds_receivable','TDS Receivable'),
    ('TCS','tcs_receivable','TCS Receivable'),
    ('TCS','tcs_payable','TCS Payable'),
    ('Inventory','inventory_control','Inventory Asset'),
    ('Assets','fixed_assets','Plant & Machinery'),
    ('Assets','accumulated_depreciation','Accumulated Depreciation'),
    ('Assets','depreciation_expense','Depreciation'),
    ('Loans','term_loans','Term Loans'),
    ('Loans','current_loan_liability','Current Loan Liability'),
    ('Accruals','expenses_payable','Expenses Payable'),
    ('Accruals','salaries_payable','Salaries Payable'),
    ('Accruals','deferred_revenue','Customer Advances'),
    ('Accruals','prepaid_expenses_control','Prepaid Expenses Control'),
    ('Suspense','suspense_account','Round Off')
  ) AS m(module, scenario_key, account_name)
  JOIN accounts a ON a.user_id = p_user_id AND lower(a.account_name) = lower(m.account_name)
  ON CONFLICT (user_id, scenario_key) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION ensure_erp_grade_coa(TEXT) TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- 4. First-class sub-ledger register for employees, loans, assets, projects,
--    branches and future party types.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS accounting_subledgers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  subledger_type TEXT NOT NULL CHECK (subledger_type IN (
    'customer','vendor','employee','loan','asset','project','branch','tax','other'
  )),
  entity_id UUID,
  entity_name TEXT NOT NULL,
  control_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  subledger_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, subledger_type, entity_id)
);

ALTER TABLE accounting_subledgers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS accounting_subledgers_owner ON accounting_subledgers;
CREATE POLICY accounting_subledgers_owner ON accounting_subledgers
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

CREATE INDEX IF NOT EXISTS idx_accounting_subledgers_control
  ON accounting_subledgers(user_id, control_account_id);
CREATE INDEX IF NOT EXISTS idx_accounting_subledgers_account
  ON accounting_subledgers(subledger_account_id);

DROP TRIGGER IF EXISTS trg_accounting_subledgers_updated ON accounting_subledgers;
CREATE TRIGGER trg_accounting_subledgers_updated
  BEFORE UPDATE ON accounting_subledgers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION sync_party_subledger_register(p_user_id TEXT)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  v_count INT := 0;
BEGIN
  INSERT INTO accounting_subledgers (
    user_id, subledger_type, entity_id, entity_name, control_account_id, subledger_account_id, metadata
  )
  SELECT
    v.user_id,
    'vendor',
    v.id,
    COALESCE(NULLIF(TRIM(v.company_name), ''), NULLIF(TRIM(v.name), ''), 'Vendor'),
    v.primary_ledger_account_id,
    v.subledger_account_id,
    jsonb_build_object('source_table','vendors')
  FROM vendors v
  WHERE v.user_id = p_user_id
  ON CONFLICT (user_id, subledger_type, entity_id) DO UPDATE
    SET entity_name = EXCLUDED.entity_name,
        control_account_id = EXCLUDED.control_account_id,
        subledger_account_id = EXCLUDED.subledger_account_id,
        updated_at = NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO accounting_subledgers (
    user_id, subledger_type, entity_id, entity_name, control_account_id, subledger_account_id, metadata
  )
  SELECT
    c.user_id,
    'customer',
    c.id,
    COALESCE(NULLIF(TRIM(c.display_name), ''), NULLIF(TRIM(c.company_name), ''), NULLIF(TRIM(c.name), ''), 'Customer'),
    c.primary_ledger_account_id,
    c.subledger_account_id,
    jsonb_build_object('source_table','clients')
  FROM clients c
  WHERE c.user_id = p_user_id
  ON CONFLICT (user_id, subledger_type, entity_id) DO UPDATE
    SET entity_name = EXCLUDED.entity_name,
        control_account_id = EXCLUDED.control_account_id,
        subledger_account_id = EXCLUDED.subledger_account_id,
        updated_at = NOW();

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION sync_party_subledger_register(TEXT) TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- 5. Reconciliation and health dashboard RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_subledger_reconciliation(
  p_user_id TEXT,
  p_as_of_date DATE DEFAULT CURRENT_DATE
) RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH control_balances AS (
    SELECT
      s.control_account_id,
      MAX(ca.account_code) AS control_code,
      MAX(ca.account_name) AS control_name,
      MAX(ca.account_type) AS control_type,
      COALESCE(SUM(
        CASE ca.account_type
          WHEN 'Asset' THEN COALESCE(jl.debit,0) - COALESCE(jl.credit,0)
          WHEN 'Expense' THEN COALESCE(jl.debit,0) - COALESCE(jl.credit,0)
          ELSE COALESCE(jl.credit,0) - COALESCE(jl.debit,0)
        END
      ), 0) AS control_balance
    FROM accounting_subledgers s
    JOIN accounts ca ON ca.id = s.control_account_id
    LEFT JOIN journal_lines jl ON jl.account_id = s.subledger_account_id
    LEFT JOIN journals j ON j.id = jl.journal_id
      AND j.status = 'posted'
      AND COALESCE(j.is_reversed, FALSE) = FALSE
      AND j.journal_date <= p_as_of_date
    WHERE s.user_id = p_user_id
      AND s.status = 'active'
      AND s.control_account_id IS NOT NULL
    GROUP BY s.control_account_id
  ),
  parent_rollup AS (
    SELECT
      cb.control_account_id,
      cb.control_code,
      cb.control_name,
      cb.control_type,
      cb.control_balance AS subledger_total,
      COALESCE((
        SELECT SUM(
          CASE a.account_type
            WHEN 'Asset' THEN COALESCE(jlx.debit,0) - COALESCE(jlx.credit,0)
            WHEN 'Expense' THEN COALESCE(jlx.debit,0) - COALESCE(jlx.credit,0)
            ELSE COALESCE(jlx.credit,0) - COALESCE(jlx.debit,0)
          END
        )
        FROM journal_lines jlx
        JOIN journals jx ON jx.id = jlx.journal_id
        JOIN accounts a ON a.id = jlx.account_id
        WHERE jx.user_id = p_user_id
          AND jx.status = 'posted'
          AND COALESCE(jx.is_reversed, FALSE) = FALSE
          AND jx.journal_date <= p_as_of_date
          AND (a.id = cb.control_account_id OR a.parent_account_id = cb.control_account_id)
      ), 0) AS control_rollup_balance
    FROM control_balances cb
  )
  SELECT jsonb_build_object(
    'as_of_date', p_as_of_date,
    'all_reconciled', COALESCE(BOOL_AND(ABS(control_rollup_balance - subledger_total) <= 1), TRUE),
    'controls', COALESCE(jsonb_agg(jsonb_build_object(
      'control_account_id', control_account_id,
      'control_code', control_code,
      'control_name', control_name,
      'control_type', control_type,
      'control_balance', ROUND(control_rollup_balance::numeric, 2),
      'subledger_total', ROUND(subledger_total::numeric, 2),
      'variance', ROUND((control_rollup_balance - subledger_total)::numeric, 2),
      'reconciled', ABS(control_rollup_balance - subledger_total) <= 1
    ) ORDER BY control_code), '[]'::jsonb),
    'computed_at', NOW()
  )
  INTO v_result
  FROM parent_rollup;

  RETURN COALESCE(v_result, jsonb_build_object(
    'as_of_date', p_as_of_date,
    'all_reconciled', TRUE,
    'controls', '[]'::jsonb,
    'computed_at', NOW()
  ));
END;
$$;

CREATE OR REPLACE FUNCTION get_accounting_health_dashboard(
  p_user_id TEXT,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT CURRENT_DATE
) RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_from DATE;
  v_to DATE := COALESCE(p_to_date, CURRENT_DATE);
  v_tb_dr NUMERIC := 0;
  v_tb_cr NUMERIC := 0;
  v_imbalanced_journals INT := 0;
  v_orphan_lines INT := 0;
  v_inactive_postings INT := 0;
  v_closed_period_postings INT := 0;
  v_subledger JSONB;
  v_gst JSONB;
  v_inv JSONB;
  v_checks JSONB := '[]'::jsonb;
  v_all BOOLEAN := TRUE;
BEGIN
  v_from := COALESCE(
    p_from_date,
    (SELECT COALESCE(financial_year_start, make_date(EXTRACT(YEAR FROM v_to)::int, 4, 1))
       FROM ensure_accounting_settings(p_user_id))
  );

  SELECT COALESCE(SUM(jl.debit),0), COALESCE(SUM(jl.credit),0)
    INTO v_tb_dr, v_tb_cr
  FROM journal_lines jl
  JOIN journals j ON j.id = jl.journal_id
  WHERE j.user_id = p_user_id
    AND j.status = 'posted'
    AND COALESCE(j.is_reversed, FALSE) = FALSE
    AND j.journal_date BETWEEN v_from AND v_to;

  SELECT COUNT(*) INTO v_imbalanced_journals
  FROM journals j
  WHERE j.user_id = p_user_id
    AND j.status = 'posted'
    AND COALESCE(j.is_reversed, FALSE) = FALSE
    AND j.journal_date BETWEEN v_from AND v_to
    AND ABS(COALESCE(j.total_debit,0) - COALESCE(j.total_credit,0)) > 0.01;

  SELECT COUNT(*) INTO v_orphan_lines
  FROM journal_lines jl
  LEFT JOIN journals j ON j.id = jl.journal_id
  WHERE jl.user_id = p_user_id AND j.id IS NULL;

  SELECT COUNT(*) INTO v_inactive_postings
  FROM journal_lines jl
  JOIN accounts a ON a.id = jl.account_id
  JOIN journals j ON j.id = jl.journal_id
  WHERE j.user_id = p_user_id
    AND j.status = 'posted'
    AND COALESCE(a.is_active, TRUE) = FALSE;

  SELECT COUNT(*) INTO v_closed_period_postings
  FROM journals j
  JOIN accounting_periods ap ON ap.user_id = j.user_id
    AND ap.status = 'locked'
    AND j.journal_date BETWEEN ap.period_start AND ap.period_end
  WHERE j.user_id = p_user_id
    AND j.status = 'posted'
    AND j.created_at > COALESCE(ap.locked_at, ap.updated_at, ap.created_at, '-infinity'::timestamptz);

  v_subledger := get_subledger_reconciliation(p_user_id, v_to);
  BEGIN
    v_gst := get_gstr2b_reconciliation(p_user_id, to_char(v_to, 'YYYY-MM'));
  EXCEPTION WHEN OTHERS THEN
    v_gst := jsonb_build_object('error', SQLERRM);
  END;

  BEGIN
    SELECT jsonb_build_object(
      'book_value', COALESCE(SUM(COALESCE(stock_quantity,0) * COALESCE(unit_cost,0)),0),
      'checked', TRUE
    ) INTO v_inv
    FROM inventory
    WHERE user_id = p_user_id;
  EXCEPTION WHEN OTHERS THEN
    v_inv := jsonb_build_object('checked', FALSE, 'note', SQLERRM);
  END;

  v_checks := v_checks || jsonb_build_object(
    'check','trial_balance',
    'label','Trial Balance Balanced',
    'passed', ABS(v_tb_dr - v_tb_cr) <= 0.01,
    'details', jsonb_build_object('debits', v_tb_dr, 'credits', v_tb_cr, 'variance', v_tb_dr - v_tb_cr)
  );
  IF ABS(v_tb_dr - v_tb_cr) > 0.01 THEN v_all := FALSE; END IF;

  v_checks := v_checks || jsonb_build_object(
    'check','journals_balanced',
    'label','Journals Balanced',
    'passed', v_imbalanced_journals = 0,
    'details', jsonb_build_object('imbalanced_journals', v_imbalanced_journals)
  );
  IF v_imbalanced_journals <> 0 THEN v_all := FALSE; END IF;

  v_checks := v_checks || jsonb_build_object(
    'check','orphan_lines',
    'label','No Orphan Journal Lines',
    'passed', v_orphan_lines = 0,
    'details', jsonb_build_object('orphan_lines', v_orphan_lines)
  );
  IF v_orphan_lines <> 0 THEN v_all := FALSE; END IF;

  v_checks := v_checks || jsonb_build_object(
    'check','inactive_account_postings',
    'label','No Posting To Inactive Accounts',
    'passed', v_inactive_postings = 0,
    'details', jsonb_build_object('inactive_postings', v_inactive_postings)
  );
  IF v_inactive_postings <> 0 THEN v_all := FALSE; END IF;

  v_checks := v_checks || jsonb_build_object(
    'check','closed_period_postings',
    'label','No Posting Into Closed Periods',
    'passed', v_closed_period_postings = 0,
    'details', jsonb_build_object('closed_period_postings', v_closed_period_postings)
  );
  IF v_closed_period_postings <> 0 THEN v_all := FALSE; END IF;

  v_checks := v_checks || jsonb_build_object(
    'check','subledger_reconciliation',
    'label','Sub-Ledgers Reconciled',
    'passed', COALESCE((v_subledger ->> 'all_reconciled')::boolean, TRUE),
    'details', v_subledger
  );
  IF COALESCE((v_subledger ->> 'all_reconciled')::boolean, TRUE) = FALSE THEN v_all := FALSE; END IF;

  RETURN jsonb_build_object(
    'from_date', v_from,
    'to_date', v_to,
    'all_passed', v_all,
    'checks', v_checks,
    'gst_reconciliation', v_gst,
    'inventory_reconciliation', v_inv,
    'computed_at', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_subledger_reconciliation(TEXT, DATE) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_accounting_health_dashboard(TEXT, DATE, DATE) TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- 6. Journal templates, recurring journals, cloning and approval helpers
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS journal_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  template_name TEXT NOT NULL,
  voucher_type TEXT NOT NULL DEFAULT 'Journal',
  narration_template TEXT,
  lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, template_name)
);

CREATE TABLE IF NOT EXISTS recurring_journal_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  template_id UUID REFERENCES journal_templates(id) ON DELETE SET NULL,
  rule_name TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily','weekly','monthly','quarterly','yearly')),
  next_run_date DATE NOT NULL,
  end_date DATE,
  auto_post BOOLEAN NOT NULL DEFAULT FALSE,
  approval_required BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed','cancelled')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE journal_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_journal_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS journal_templates_owner ON journal_templates;
CREATE POLICY journal_templates_owner ON journal_templates
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

DROP POLICY IF EXISTS recurring_journal_rules_owner ON recurring_journal_rules;
CREATE POLICY recurring_journal_rules_owner ON recurring_journal_rules
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

DROP TRIGGER IF EXISTS trg_journal_templates_updated ON journal_templates;
CREATE TRIGGER trg_journal_templates_updated
  BEFORE UPDATE ON journal_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_recurring_journal_rules_updated ON recurring_journal_rules;
CREATE TRIGGER trg_recurring_journal_rules_updated
  BEFORE UPDATE ON recurring_journal_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION approve_journal(
  p_journal_id UUID,
  p_approved_by TEXT
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE journals
     SET approval_status = 'approved',
         approved_by = p_approved_by,
         approved_at = NOW()
   WHERE id = p_journal_id;
END;
$$;

CREATE OR REPLACE FUNCTION clone_journal(
  p_journal_id UUID,
  p_journal_date DATE DEFAULT CURRENT_DATE,
  p_posted_by TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_orig journals%ROWTYPE;
  v_lines JSONB;
  v_new_id UUID;
BEGIN
  SELECT * INTO v_orig FROM journals WHERE id = p_journal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journal % not found', p_journal_id;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'account_id', account_id,
    'debit', COALESCE(debit,0),
    'credit', COALESCE(credit,0),
    'line_narration', line_narration,
    'vendor_id', vendor_id,
    'customer_id', customer_id,
    'cost_center_id', cost_center_id,
    'project_id', project_id,
    'branch_id', branch_id,
    'department', department,
    'tax_type', tax_type,
    'tax_impact', tax_impact,
    'notes', notes
  ) ORDER BY created_at), '[]'::jsonb)
  INTO v_lines
  FROM journal_lines
  WHERE journal_id = p_journal_id;

  v_new_id := post_journal(
    p_user_id := v_orig.user_id,
    p_journal_date := p_journal_date,
    p_narration := 'Clone of ' || v_orig.journal_number || ': ' || v_orig.narration,
    p_source_type := 'manual_clone',
    p_source_id := NULL,
    p_idempotency_key := NULL,
    p_lines := v_lines,
    p_journal_number := 'CLONE-' || v_orig.journal_number || '-' || to_char(clock_timestamp(), 'HH24MISSMS'),
    p_status := 'draft',
    p_posted_by := p_posted_by,
    p_notes := v_orig.notes
  );

  UPDATE journals
     SET cloned_from_journal_id = p_journal_id,
         posting_date = p_journal_date,
         voucher_type = COALESCE(v_orig.voucher_type, 'Journal'),
         reference_number = v_orig.reference_number,
         cost_center_id = v_orig.cost_center_id,
         branch_id = v_orig.branch_id,
         project_id = v_orig.project_id,
         approval_status = 'draft'
   WHERE id = v_new_id;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION approve_journal(UUID, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION clone_journal(UUID, DATE, TEXT) TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- 7. Final schema refresh and metadata
-- ---------------------------------------------------------------------------

NOTIFY pgrst, 'reload schema';

COMMENT ON FUNCTION get_accounting_health_dashboard IS
  'ERP-grade accounting health dashboard: TB, journal balance, orphan lines, inactive postings, closed-period postings, sub-ledger reconciliation, GST and inventory health.';
COMMENT ON FUNCTION get_subledger_reconciliation IS
  'Compares control account rollups against registered sub-ledger balances as of a date.';
COMMENT ON FUNCTION ensure_erp_grade_coa IS
  'Seeds/extends the default ERP-grade Indian COA and core scenario mappings.';
