-- ============================================================================
-- PHASE 10 — SCHEDULE III COMPLIANCE LAYER (Companies Act 2013, Indian GAAP)
-- ----------------------------------------------------------------------------
-- Tag every COA account with its Schedule III statement section + line code so
-- the Balance Sheet, P&L, Fixed Asset Schedule, and supporting disclosures can
-- all derive directly from the GL (ledger-first reporting) rather than from
-- invoice/expense aggregates. Enables real-time sync — any posted journal
-- immediately flows into Schedule III statements with no manual refresh.
-- ============================================================================

-- ── 1. SCHEDULE III CLASSIFICATION COLUMNS ──────────────────────────────────
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS schedule_iii_section TEXT
    CHECK (schedule_iii_section IS NULL OR schedule_iii_section IN (
      'EQUITY_AND_LIABILITIES', 'ASSETS', 'INCOME', 'EXPENSES'
    )),
  ADD COLUMN IF NOT EXISTS schedule_iii_subsection TEXT,
  ADD COLUMN IF NOT EXISTS schedule_iii_line_code TEXT,
  ADD COLUMN IF NOT EXISTS current_non_current TEXT
    CHECK (current_non_current IS NULL OR current_non_current IN ('CURRENT','NON_CURRENT','NA')),
  ADD COLUMN IF NOT EXISTS statement_type TEXT
    CHECK (statement_type IS NULL OR statement_type IN ('BS','PL','BOTH')),
  ADD COLUMN IF NOT EXISTS nature_of_account TEXT,
  ADD COLUMN IF NOT EXISTS is_msme_payable_account BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_related_party_account BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_accounts_sched_iii
  ON accounts(user_id, schedule_iii_section, schedule_iii_line_code);

COMMENT ON COLUMN accounts.schedule_iii_line_code IS
  'Granular Schedule III line: BS.E.1=Share Capital, BS.E.2=Reserves & Surplus, '
  'BS.NCL.1=Long-term Borrowings, BS.NCL.2=Deferred Tax Liability, '
  'BS.NCL.3=Other LT Liabilities, BS.NCL.4=LT Provisions, '
  'BS.CL.1=ST Borrowings, BS.CL.2=Trade Payables, BS.CL.3=Other CL, BS.CL.4=ST Provisions, '
  'BS.NCA.1=Tangible Assets, BS.NCA.2=Intangible Assets, BS.NCA.3=CWIP, '
  'BS.NCA.4=Non-current Investments, BS.NCA.5=Deferred Tax Asset, BS.NCA.6=LT Loans & Advances, '
  'BS.CA.1=Current Investments, BS.CA.2=Inventories, BS.CA.3=Trade Receivables, '
  'BS.CA.4=Cash & Bank, BS.CA.5=ST Loans & Advances, BS.CA.6=Other CA, '
  'PL.R.1=Revenue from Operations, PL.R.2=Other Income, '
  'PL.E.1=Cost of Materials Consumed, PL.E.2=Purchase of Stock-in-Trade, '
  'PL.E.3=Changes in Inventories, PL.E.4=Employee Benefit Expenses, '
  'PL.E.5=Finance Costs, PL.E.6=Depreciation & Amortisation, PL.E.7=Other Expenses, '
  'PL.E.8=Tax Expense';

-- ── 2. SCHEDULE III LINE MASTER TABLE ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS schedule_iii_lines (
  line_code         TEXT PRIMARY KEY,
  section           TEXT NOT NULL,
  subsection        TEXT NOT NULL,
  display_label     TEXT NOT NULL,
  statement_type    TEXT NOT NULL CHECK (statement_type IN ('BS','PL')),
  current_non_current TEXT CHECK (current_non_current IN ('CURRENT','NON_CURRENT','NA')),
  sort_order        INT  NOT NULL,
  note_no           TEXT,
  default_account_type TEXT
);

INSERT INTO schedule_iii_lines (line_code, section, subsection, display_label, statement_type, current_non_current, sort_order, note_no, default_account_type) VALUES
  -- Balance Sheet — Equity & Liabilities
  ('BS.E.1',   'EQUITY_AND_LIABILITIES', 'Shareholders Funds',       'Share Capital',                    'BS', 'NA',           10,  '2',  'Equity'),
  ('BS.E.2',   'EQUITY_AND_LIABILITIES', 'Shareholders Funds',       'Reserves & Surplus',               'BS', 'NA',           20,  '3',  'Equity'),
  ('BS.E.3',   'EQUITY_AND_LIABILITIES', 'Shareholders Funds',       'Money Received Against Share Warrants', 'BS', 'NA',     30,  '3',  'Equity'),
  ('BS.NCL.1', 'EQUITY_AND_LIABILITIES', 'Non-Current Liabilities',  'Long-term Borrowings',             'BS', 'NON_CURRENT',  100, '4',  'Liability'),
  ('BS.NCL.2', 'EQUITY_AND_LIABILITIES', 'Non-Current Liabilities',  'Deferred Tax Liabilities (Net)',   'BS', 'NON_CURRENT',  110, '5',  'Liability'),
  ('BS.NCL.3', 'EQUITY_AND_LIABILITIES', 'Non-Current Liabilities',  'Other Long-term Liabilities',      'BS', 'NON_CURRENT',  120, '6',  'Liability'),
  ('BS.NCL.4', 'EQUITY_AND_LIABILITIES', 'Non-Current Liabilities',  'Long-term Provisions',             'BS', 'NON_CURRENT',  130, '7',  'Liability'),
  ('BS.CL.1',  'EQUITY_AND_LIABILITIES', 'Current Liabilities',      'Short-term Borrowings',            'BS', 'CURRENT',      200, '8',  'Liability'),
  ('BS.CL.2',  'EQUITY_AND_LIABILITIES', 'Current Liabilities',      'Trade Payables',                   'BS', 'CURRENT',      210, '9',  'Liability'),
  ('BS.CL.3',  'EQUITY_AND_LIABILITIES', 'Current Liabilities',      'Other Current Liabilities',        'BS', 'CURRENT',      220, '10', 'Liability'),
  ('BS.CL.4',  'EQUITY_AND_LIABILITIES', 'Current Liabilities',      'Short-term Provisions',            'BS', 'CURRENT',      230, '11', 'Liability'),
  -- Balance Sheet — Assets
  ('BS.NCA.1', 'ASSETS',                 'Non-Current Assets',       'Tangible Assets',                  'BS', 'NON_CURRENT',  300, '12', 'Asset'),
  ('BS.NCA.2', 'ASSETS',                 'Non-Current Assets',       'Intangible Assets',                'BS', 'NON_CURRENT',  310, '12', 'Asset'),
  ('BS.NCA.3', 'ASSETS',                 'Non-Current Assets',       'Capital Work-in-Progress',         'BS', 'NON_CURRENT',  320, '12', 'Asset'),
  ('BS.NCA.4', 'ASSETS',                 'Non-Current Assets',       'Non-current Investments',          'BS', 'NON_CURRENT',  330, '13', 'Asset'),
  ('BS.NCA.5', 'ASSETS',                 'Non-Current Assets',       'Deferred Tax Assets (Net)',        'BS', 'NON_CURRENT',  340, '14', 'Asset'),
  ('BS.NCA.6', 'ASSETS',                 'Non-Current Assets',       'Long-term Loans & Advances',       'BS', 'NON_CURRENT',  350, '15', 'Asset'),
  ('BS.NCA.7', 'ASSETS',                 'Non-Current Assets',       'Other Non-current Assets',         'BS', 'NON_CURRENT',  360, '16', 'Asset'),
  ('BS.CA.1',  'ASSETS',                 'Current Assets',           'Current Investments',              'BS', 'CURRENT',      400, '17', 'Asset'),
  ('BS.CA.2',  'ASSETS',                 'Current Assets',           'Inventories',                      'BS', 'CURRENT',      410, '18', 'Asset'),
  ('BS.CA.3',  'ASSETS',                 'Current Assets',           'Trade Receivables',                'BS', 'CURRENT',      420, '19', 'Asset'),
  ('BS.CA.4',  'ASSETS',                 'Current Assets',           'Cash & Cash Equivalents',          'BS', 'CURRENT',      430, '20', 'Asset'),
  ('BS.CA.5',  'ASSETS',                 'Current Assets',           'Short-term Loans & Advances',      'BS', 'CURRENT',      440, '21', 'Asset'),
  ('BS.CA.6',  'ASSETS',                 'Current Assets',           'Other Current Assets',             'BS', 'CURRENT',      450, '22', 'Asset'),
  -- P&L — Revenue
  ('PL.R.1',   'INCOME',                 'Revenue',                  'Revenue from Operations',          'PL', 'NA',           500, '23', 'Income'),
  ('PL.R.2',   'INCOME',                 'Revenue',                  'Other Income',                     'PL', 'NA',           510, '24', 'Income'),
  -- P&L — Expenses
  ('PL.E.1',   'EXPENSES',               'Expenses',                 'Cost of Materials Consumed',       'PL', 'NA',           600, '25', 'Expense'),
  ('PL.E.2',   'EXPENSES',               'Expenses',                 'Purchase of Stock-in-Trade',       'PL', 'NA',           610, '25', 'Expense'),
  ('PL.E.3',   'EXPENSES',               'Expenses',                 'Changes in Inventories of FG, WIP & SIT', 'PL', 'NA',    620, '26', 'Expense'),
  ('PL.E.4',   'EXPENSES',               'Expenses',                 'Employee Benefit Expenses',        'PL', 'NA',           630, '27', 'Expense'),
  ('PL.E.5',   'EXPENSES',               'Expenses',                 'Finance Costs',                    'PL', 'NA',           640, '28', 'Expense'),
  ('PL.E.6',   'EXPENSES',               'Expenses',                 'Depreciation & Amortisation Expenses', 'PL', 'NA',       650, '29', 'Expense'),
  ('PL.E.7',   'EXPENSES',               'Expenses',                 'Other Expenses',                   'PL', 'NA',           660, '30', 'Expense'),
  ('PL.E.8',   'EXPENSES',               'Tax',                      'Tax Expense (Current + Deferred)', 'PL', 'NA',           670, '31', 'Expense')
ON CONFLICT (line_code) DO UPDATE SET
  section = EXCLUDED.section,
  subsection = EXCLUDED.subsection,
  display_label = EXCLUDED.display_label,
  statement_type = EXCLUDED.statement_type,
  current_non_current = EXCLUDED.current_non_current,
  sort_order = EXCLUDED.sort_order,
  note_no = EXCLUDED.note_no,
  default_account_type = EXCLUDED.default_account_type;

-- ── 3. AUTO-CLASSIFY EXISTING ACCOUNTS (heuristic backfill) ─────────────────
-- Maps each existing account to a Schedule III line based on name + group.
-- Idempotent: only updates rows where schedule_iii_line_code IS NULL.
CREATE OR REPLACE FUNCTION classify_account_schedule_iii(
  p_account_name TEXT,
  p_account_type TEXT,
  p_account_group TEXT,
  p_account_subgroup TEXT
) RETURNS TABLE (
  line_code TEXT,
  section TEXT,
  subsection TEXT,
  current_non_current TEXT,
  statement_type TEXT
) LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  n TEXT := lower(coalesce(p_account_name, ''));
  g TEXT := lower(coalesce(p_account_group, ''));
  s TEXT := lower(coalesce(p_account_subgroup, ''));
BEGIN
  -- EQUITY
  IF p_account_type = 'Equity' THEN
    IF n ~ '(share capital|equity capital|paid.up capital|capital account)' THEN
      RETURN QUERY SELECT 'BS.E.1', 'EQUITY_AND_LIABILITIES', 'Shareholders Funds', 'NA', 'BS';
    ELSE
      RETURN QUERY SELECT 'BS.E.2', 'EQUITY_AND_LIABILITIES', 'Shareholders Funds', 'NA', 'BS';
    END IF;
    RETURN;
  END IF;

  -- LIABILITIES
  IF p_account_type = 'Liability' THEN
    IF n ~ '(long.term loan|term loan|debenture|bond|secured loan|mortgage)' OR s ~ 'long.term' THEN
      RETURN QUERY SELECT 'BS.NCL.1', 'EQUITY_AND_LIABILITIES', 'Non-Current Liabilities', 'NON_CURRENT', 'BS';
    ELSIF n ~ 'deferred tax' THEN
      RETURN QUERY SELECT 'BS.NCL.2', 'EQUITY_AND_LIABILITIES', 'Non-Current Liabilities', 'NON_CURRENT', 'BS';
    ELSIF n ~ '(long.term provision|gratuity|leave encashment)' THEN
      RETURN QUERY SELECT 'BS.NCL.4', 'EQUITY_AND_LIABILITIES', 'Non-Current Liabilities', 'NON_CURRENT', 'BS';
    ELSIF n ~ '(short.term loan|working capital|cash credit|overdraft|bank borrowing|cc limit)' THEN
      RETURN QUERY SELECT 'BS.CL.1', 'EQUITY_AND_LIABILITIES', 'Current Liabilities', 'CURRENT', 'BS';
    ELSIF n ~ '(trade payable|accounts payable|sundry creditor|vendor payable|creditors)' OR g ~ 'payable' THEN
      RETURN QUERY SELECT 'BS.CL.2', 'EQUITY_AND_LIABILITIES', 'Current Liabilities', 'CURRENT', 'BS';
    ELSIF n ~ '(provision for tax|income tax payable|tds payable|gst payable|cgst output|sgst output|igst output|cess output|statutory)' THEN
      RETURN QUERY SELECT 'BS.CL.4', 'EQUITY_AND_LIABILITIES', 'Current Liabilities', 'CURRENT', 'BS';
    ELSE
      RETURN QUERY SELECT 'BS.CL.3', 'EQUITY_AND_LIABILITIES', 'Current Liabilities', 'CURRENT', 'BS';
    END IF;
    RETURN;
  END IF;

  -- ASSETS
  IF p_account_type = 'Asset' THEN
    IF n ~ '(land|building|plant|machinery|equipment|furniture|vehicle|computer|hardware|office equipment)' AND n !~ 'intangible' THEN
      RETURN QUERY SELECT 'BS.NCA.1', 'ASSETS', 'Non-Current Assets', 'NON_CURRENT', 'BS';
    ELSIF n ~ '(goodwill|software|patent|trademark|license|intangible|brand)' THEN
      RETURN QUERY SELECT 'BS.NCA.2', 'ASSETS', 'Non-Current Assets', 'NON_CURRENT', 'BS';
    ELSIF n ~ '(cwip|capital work.in.progress|work.in.progress.asset)' THEN
      RETURN QUERY SELECT 'BS.NCA.3', 'ASSETS', 'Non-Current Assets', 'NON_CURRENT', 'BS';
    ELSIF n ~ '(investment|mutual fund|equity invest|bonds held)' AND s !~ 'current' THEN
      RETURN QUERY SELECT 'BS.NCA.4', 'ASSETS', 'Non-Current Assets', 'NON_CURRENT', 'BS';
    ELSIF n ~ 'deferred tax asset' THEN
      RETURN QUERY SELECT 'BS.NCA.5', 'ASSETS', 'Non-Current Assets', 'NON_CURRENT', 'BS';
    ELSIF n ~ '(security deposit|long.term advance|long.term loan given)' THEN
      RETURN QUERY SELECT 'BS.NCA.6', 'ASSETS', 'Non-Current Assets', 'NON_CURRENT', 'BS';
    ELSIF n ~ '(inventory|stock in trade|raw material|finished good|wip|work in progress)' OR s ~ 'inventory' THEN
      RETURN QUERY SELECT 'BS.CA.2', 'ASSETS', 'Current Assets', 'CURRENT', 'BS';
    ELSIF n ~ '(trade receivable|accounts receivable|sundry debtor|customer receivable|debtors)' OR g ~ 'receivable' THEN
      RETURN QUERY SELECT 'BS.CA.3', 'ASSETS', 'Current Assets', 'CURRENT', 'BS';
    ELSIF n ~ '(cash|bank|petty cash|fd|fixed deposit|imprest|cash equivalent)' THEN
      RETURN QUERY SELECT 'BS.CA.4', 'ASSETS', 'Current Assets', 'CURRENT', 'BS';
    ELSIF n ~ '(input tax|cgst input|sgst input|igst input|tds receivable|vendor advance|prepaid|short.term loan|advance to)' THEN
      RETURN QUERY SELECT 'BS.CA.5', 'ASSETS', 'Current Assets', 'CURRENT', 'BS';
    ELSE
      RETURN QUERY SELECT 'BS.CA.6', 'ASSETS', 'Current Assets', 'CURRENT', 'BS';
    END IF;
    RETURN;
  END IF;

  -- INCOME (P&L)
  IF p_account_type = 'Income' THEN
    IF n ~ '(sales|revenue|service income|consulting|fees earned|professional fees|gross receipts|turnover)' THEN
      RETURN QUERY SELECT 'PL.R.1', 'INCOME', 'Revenue', 'NA', 'PL';
    ELSE
      RETURN QUERY SELECT 'PL.R.2', 'INCOME', 'Revenue', 'NA', 'PL';
    END IF;
    RETURN;
  END IF;

  -- EXPENSES (P&L)
  IF p_account_type = 'Expense' THEN
    IF n ~ '(raw material|material consumed|purchases|cost of material|opening stock|closing stock)' AND s ~ 'direct' THEN
      RETURN QUERY SELECT 'PL.E.1', 'EXPENSES', 'Expenses', 'NA', 'PL';
    ELSIF n ~ '(purchase of stock|trading purchases|stock.in.trade)' THEN
      RETURN QUERY SELECT 'PL.E.2', 'EXPENSES', 'Expenses', 'NA', 'PL';
    ELSIF n ~ '(change in inventor|inventory adjustment|stock variation)' THEN
      RETURN QUERY SELECT 'PL.E.3', 'EXPENSES', 'Expenses', 'NA', 'PL';
    ELSIF n ~ '(salary|wages|payroll|employee benefit|bonus|pf contribution|esi|gratuity expense|staff welfare)' THEN
      RETURN QUERY SELECT 'PL.E.4', 'EXPENSES', 'Expenses', 'NA', 'PL';
    ELSIF n ~ '(interest|finance cost|bank charge|loan processing|forex loss|exchange loss)' THEN
      RETURN QUERY SELECT 'PL.E.5', 'EXPENSES', 'Expenses', 'NA', 'PL';
    ELSIF n ~ '(depreciation|amortisation|amortization|impairment)' THEN
      RETURN QUERY SELECT 'PL.E.6', 'EXPENSES', 'Expenses', 'NA', 'PL';
    ELSIF n ~ '(tax expense|income tax|deferred tax expense|current tax)' THEN
      RETURN QUERY SELECT 'PL.E.8', 'EXPENSES', 'Tax', 'NA', 'PL';
    ELSE
      RETURN QUERY SELECT 'PL.E.7', 'EXPENSES', 'Expenses', 'NA', 'PL';
    END IF;
    RETURN;
  END IF;
END;
$$;

-- Backfill existing accounts (only those not yet classified)
CREATE OR REPLACE FUNCTION backfill_schedule_iii_classifications(p_user_id TEXT DEFAULT NULL)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  v_count INT := 0;
BEGIN
  WITH classified AS (
    SELECT
      a.id,
      c.line_code, c.section, c.subsection, c.current_non_current, c.statement_type
    FROM accounts a
    CROSS JOIN LATERAL classify_account_schedule_iii(
      a.account_name, a.account_type, a.account_group, a.account_subgroup
    ) c
    WHERE a.schedule_iii_line_code IS NULL
      AND COALESCE(a.is_group, FALSE) = FALSE
      AND (p_user_id IS NULL OR a.user_id = p_user_id)
  )
  UPDATE accounts a
     SET schedule_iii_line_code   = c.line_code,
         schedule_iii_section     = c.section,
         schedule_iii_subsection  = c.subsection,
         current_non_current      = c.current_non_current,
         statement_type           = c.statement_type
    FROM classified c
   WHERE a.id = c.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Run backfill for all users at migration time.
SELECT backfill_schedule_iii_classifications(NULL);

-- ── 4. NEW ACCOUNT TRIGGER — auto-classify on insert ────────────────────────
CREATE OR REPLACE FUNCTION accounts_auto_classify_trg()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_class RECORD;
BEGIN
  IF NEW.schedule_iii_line_code IS NULL AND COALESCE(NEW.is_group, FALSE) = FALSE THEN
    SELECT * INTO v_class FROM classify_account_schedule_iii(
      NEW.account_name, NEW.account_type, NEW.account_group, NEW.account_subgroup
    );
    NEW.schedule_iii_line_code  := v_class.line_code;
    NEW.schedule_iii_section    := v_class.section;
    NEW.schedule_iii_subsection := v_class.subsection;
    NEW.current_non_current     := v_class.current_non_current;
    NEW.statement_type          := v_class.statement_type;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_accounts_auto_classify ON accounts;
CREATE TRIGGER trg_accounts_auto_classify
  BEFORE INSERT OR UPDATE OF account_name, account_type, account_group, account_subgroup ON accounts
  FOR EACH ROW
  EXECUTE FUNCTION accounts_auto_classify_trg();
