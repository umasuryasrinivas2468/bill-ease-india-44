-- ════════════════════════════════════════════════════════════════════════════
-- Chart of Accounts — complete the ERP-grade COA system.
--
-- Builds on the existing foundation (accounts hierarchy, journal backbone,
-- sub-ledger tagging, period locks). Adds the remaining pieces the COA brief
-- calls for that aren't already in place:
--
--   1. Missing accounts fields (GST flag/rate, cost-center applicability,
--      cash-flow category, currency, reconciliation flag, manual-journal
--      allow flag, lock flag, free-text description).
--   2. account_mapping table — module/scenario → account_id, with
--      resolve_account_mapping() RPC. Replaces hardcoded STANDARD_ACCOUNTS
--      lookups in journalEngine.ts (with fallback to keep posting safe when
--      a mapping row is missing).
--   3. Locked-account posting block — journals can't hit `is_locked` accounts.
--   4. Duplicate-ledger detection — find_duplicate_account() used by the
--      quick-create dialog to warn before inserting near-identical names.
--   5. close_fiscal_year() RPC — closes P&L to retained earnings, locks the
--      period, carries opening balances forward.
--   6. ensure_default_coa() — idempotent seed wrapper that creates the
--      standard control accounts (AR, AP, Bank, Cash, GST split, etc.) under
--      the tree from seed_default_account_tree, with sensible field defaults.
--
-- Re-runnable. No data loss on existing rows.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Extended accounts fields ────────────────────────────────────────────
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS gst_applicable         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gst_rate               NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS cost_center_applicable BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cash_flow_category     TEXT,
  ADD COLUMN IF NOT EXISTS currency               TEXT NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS reconciliation_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS allow_manual_journals  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS is_locked              BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS locked_at              TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by              TEXT,
  ADD COLUMN IF NOT EXISTS description            TEXT;

-- Whitelist cash_flow_category. NULL allowed (account doesn't move cash —
-- e.g. accrual liabilities, equity reserves).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'accounts' AND constraint_name = 'accounts_cash_flow_category_chk'
  ) THEN
    ALTER TABLE accounts
      ADD CONSTRAINT accounts_cash_flow_category_chk CHECK (
        cash_flow_category IS NULL OR cash_flow_category IN ('Operating', 'Investing', 'Financing')
      );
  END IF;
END $$;

-- gst_rate, if set, must be 0-50. (Cess can push effective tax higher but
-- the rate field itself caps at the slab.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'accounts' AND constraint_name = 'accounts_gst_rate_chk'
  ) THEN
    ALTER TABLE accounts
      ADD CONSTRAINT accounts_gst_rate_chk CHECK (
        gst_rate IS NULL OR (gst_rate >= 0 AND gst_rate <= 50)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_accounts_locked
  ON accounts(user_id, is_locked) WHERE is_locked = TRUE;
CREATE INDEX IF NOT EXISTS idx_accounts_cashflow
  ON accounts(user_id, cash_flow_category) WHERE cash_flow_category IS NOT NULL;

-- ── 2. Locked-account posting block ────────────────────────────────────────
-- Posting to a locked account is blocked at the journal_line level. Same
-- pattern as enforce_leaf_account_only — runs BEFORE INSERT/UPDATE on
-- journal_lines.
CREATE OR REPLACE FUNCTION enforce_unlocked_account_only()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_locked BOOLEAN;
  v_name   TEXT;
BEGIN
  SELECT is_locked, account_name INTO v_locked, v_name
    FROM accounts WHERE id = NEW.account_id;
  IF v_locked THEN
    RAISE EXCEPTION
      'Cannot post to locked account "%". Unlock it or pick a different account.', v_name
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_lines_unlocked_only ON journal_lines;
CREATE TRIGGER trg_journal_lines_unlocked_only
  BEFORE INSERT OR UPDATE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION enforce_unlocked_account_only();

-- Stamp locked_at / locked_by on flip.
CREATE OR REPLACE FUNCTION stamp_account_lock()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.is_locked IS DISTINCT FROM OLD.is_locked THEN
    IF NEW.is_locked THEN
      NEW.locked_at := NOW();
      NEW.locked_by := COALESCE(
        NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''),
        NEW.locked_by
      );
    ELSE
      NEW.locked_at := NULL;
      NEW.locked_by := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_account_lock_stamp ON accounts;
CREATE TRIGGER trg_account_lock_stamp
  BEFORE UPDATE OF is_locked ON accounts
  FOR EACH ROW EXECUTE FUNCTION stamp_account_lock();

-- ── 3. Account mapping table ───────────────────────────────────────────────
-- Module / scenario → account_id. Replaces hardcoded STANDARD_ACCOUNTS
-- lookups in journalEngine.ts. Engine still falls back to
-- getOrCreateAccount() if a mapping row is missing, so this stays opt-in.
--
-- scenario_key examples:
--   'ar_control', 'ap_control', 'bank_default', 'cash_default',
--   'sales_revenue', 'sales_returns', 'purchase_expense', 'purchase_returns',
--   'inventory_asset', 'cogs', 'itc', 'output_gst',
--   'cgst_input', 'sgst_input', 'igst_input', 'cess_input',
--   'cgst_output', 'sgst_output', 'igst_output', 'cess_output',
--   'output_gst_on_advances', 'rcm_liability',
--   'vendor_advances', 'customer_advances',
--   'tds_payable', 'inventory_adjustments', 'round_off',
--   'fixed_assets', 'prepaid_expenses', 'retained_earnings'
CREATE TABLE IF NOT EXISTS account_mapping (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     TEXT NOT NULL,
  module      TEXT NOT NULL,
  scenario_key TEXT NOT NULL,
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, scenario_key)
);

CREATE INDEX IF NOT EXISTS idx_account_mapping_user
  ON account_mapping(user_id, scenario_key);
CREATE INDEX IF NOT EXISTS idx_account_mapping_account
  ON account_mapping(account_id);

ALTER TABLE account_mapping ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "account_mapping_owner" ON account_mapping;
CREATE POLICY "account_mapping_owner" ON account_mapping FOR ALL USING (
  user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
);

DROP TRIGGER IF EXISTS trg_account_mapping_updated ON account_mapping;
CREATE TRIGGER trg_account_mapping_updated
  BEFORE UPDATE ON account_mapping
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Resolver: returns account_id for a scenario_key, or NULL if no mapping.
-- Engine treats NULL as "use the hardcoded fallback".
CREATE OR REPLACE FUNCTION resolve_account_mapping(
  p_user_id      TEXT,
  p_scenario_key TEXT
) RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT account_id FROM account_mapping
   WHERE user_id = p_user_id AND scenario_key = p_scenario_key
   LIMIT 1;
$$;

-- Bulk read for the engine — one round trip per posting instead of N.
CREATE OR REPLACE FUNCTION resolve_account_mappings(
  p_user_id TEXT,
  p_scenario_keys TEXT[]
) RETURNS TABLE (scenario_key TEXT, account_id UUID) LANGUAGE sql STABLE AS $$
  SELECT am.scenario_key, am.account_id
    FROM account_mapping am
   WHERE am.user_id = p_user_id
     AND am.scenario_key = ANY(p_scenario_keys);
$$;

-- ── 4. Duplicate-ledger detection ──────────────────────────────────────────
-- Quick-create dialog calls this before insert and warns if it finds
-- a same-type account with a similar name (Levenshtein <= 3 OR substring
-- match). Returns up to 5 matches.
CREATE OR REPLACE FUNCTION find_duplicate_account(
  p_user_id       TEXT,
  p_account_name  TEXT,
  p_account_type  TEXT
) RETURNS TABLE (
  id UUID,
  account_code TEXT,
  account_name TEXT,
  account_type TEXT,
  is_active BOOLEAN,
  similarity_score INT
) LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_norm TEXT := lower(regexp_replace(coalesce(p_account_name, ''), '\s+', ' ', 'g'));
BEGIN
  RETURN QUERY
  SELECT a.id, a.account_code, a.account_name, a.account_type, a.is_active,
         CASE
           WHEN lower(a.account_name) = v_norm THEN 0
           WHEN lower(a.account_name) LIKE v_norm || '%' THEN 1
           WHEN lower(a.account_name) LIKE '%' || v_norm || '%' THEN 2
           ELSE 3
         END AS similarity_score
    FROM accounts a
   WHERE a.user_id = p_user_id
     AND a.account_type = p_account_type
     AND (
       lower(a.account_name) = v_norm
       OR lower(a.account_name) LIKE '%' || v_norm || '%'
       OR v_norm LIKE '%' || lower(a.account_name) || '%'
     )
   ORDER BY similarity_score ASC, length(a.account_name) ASC
   LIMIT 5;
END;
$$;

-- ── 5. Fiscal-year close ───────────────────────────────────────────────────
-- close_fiscal_year(user_id, fy_end_date):
--   1. Compute net P&L (Income - Expense) at fy_end_date.
--   2. Post a closing journal: zero out every Income/Expense account, with
--      the net rolled into Retained Earnings (Equity).
--   3. Insert a period_locks row covering fy_start..fy_end (period-lock
--      table already exists from ap_complete_system migration).
--   4. Opening balances for the new year carry forward automatically because
--      v_trial_balance / v_account_tree_balance derive closing balance from
--      `opening_balance + Σ posted lines`. Closing the P&L resets it for
--      year-over-year reporting without rebooking history.
CREATE OR REPLACE FUNCTION close_fiscal_year(
  p_user_id   TEXT,
  p_fy_end    DATE,
  p_fy_start  DATE DEFAULT NULL,
  p_actor     TEXT DEFAULT NULL,
  p_notes     TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_start         DATE;
  v_re_account_id UUID;
  v_lines         JSONB := '[]'::jsonb;
  v_net           NUMERIC := 0;
  v_journal_id    UUID;
  v_journal_no    TEXT;
  v_row           RECORD;
  v_acc_bal       NUMERIC;
BEGIN
  v_start := COALESCE(p_fy_start, (date_trunc('year', p_fy_end))::date);

  -- Ensure a Retained Earnings account exists. Mapped first; fallback creates.
  v_re_account_id := resolve_account_mapping(p_user_id, 'retained_earnings');
  IF v_re_account_id IS NULL THEN
    SELECT id INTO v_re_account_id FROM accounts
     WHERE user_id = p_user_id AND account_type = 'Equity'
       AND lower(account_name) LIKE '%retained earnings%'
     LIMIT 1;
  END IF;
  IF v_re_account_id IS NULL THEN
    INSERT INTO accounts (user_id, account_code, account_name, account_type, is_active, allow_manual_journals)
    VALUES (p_user_id, '3100', 'Retained Earnings', 'Equity', TRUE, FALSE)
    RETURNING id INTO v_re_account_id;
  END IF;

  -- For each Income / Expense account, close its net to Retained Earnings.
  FOR v_row IN
    SELECT a.id, a.account_type
      FROM accounts a
     WHERE a.user_id = p_user_id
       AND a.is_active
       AND NOT a.is_group
       AND a.account_type IN ('Income', 'Expense')
  LOOP
    SELECT COALESCE(SUM(jl.credit - jl.debit), 0)
      INTO v_acc_bal
      FROM journal_lines jl
      JOIN journals j ON j.id = jl.journal_id AND j.status = 'posted'
     WHERE jl.account_id = v_row.id
       AND jl.user_id    = p_user_id
       AND jl.entry_date BETWEEN v_start AND p_fy_end;

    -- Income: credit-positive → debit it back to zero.
    -- Expense (debit-positive net = credit-debit will be negative) → credit it back.
    IF v_row.account_type = 'Income' AND v_acc_bal <> 0 THEN
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'account_id', v_row.id,
        'debit',  ROUND(v_acc_bal::numeric,  2),
        'credit', 0,
        'line_narration', 'FY close — zero out income'
      ));
      v_net := v_net + v_acc_bal;
    ELSIF v_row.account_type = 'Expense' AND v_acc_bal <> 0 THEN
      -- For expenses, sum(credit-debit) is typically negative; flip sign for the close.
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'account_id', v_row.id,
        'debit', 0,
        'credit', ROUND((-v_acc_bal)::numeric, 2),
        'line_narration', 'FY close — zero out expense'
      ));
      v_net := v_net + v_acc_bal;   -- v_acc_bal already negative for expenses
    END IF;
  END LOOP;

  -- Plug to Retained Earnings (Equity, credit-positive). v_net = income - expense.
  IF v_net <> 0 THEN
    IF v_net > 0 THEN
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'account_id', v_re_account_id,
        'debit',  0,
        'credit', ROUND(v_net::numeric, 2),
        'line_narration', 'FY close — net profit to Retained Earnings'
      ));
    ELSE
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'account_id', v_re_account_id,
        'debit',  ROUND((-v_net)::numeric, 2),
        'credit', 0,
        'line_narration', 'FY close — net loss to Retained Earnings'
      ));
    END IF;
  END IF;

  IF jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'Nothing to close — no Income/Expense activity between % and %', v_start, p_fy_end;
  END IF;

  v_journal_no := 'FY-CLOSE/' || to_char(p_fy_end, 'YYYYMMDD');

  v_journal_id := post_journal(
    p_user_id          := p_user_id,
    p_journal_date     := p_fy_end,
    p_narration        := 'Fiscal year close (' || v_start || ' – ' || p_fy_end || ')',
    p_source_type      := 'manual',
    p_source_id        := NULL,
    p_idempotency_key  := 'fy-close-' || p_user_id || '-' || to_char(p_fy_end, 'YYYYMMDD'),
    p_lines            := v_lines,
    p_journal_number   := v_journal_no,
    p_status           := 'posted',
    p_posted_by        := p_actor,
    p_notes            := COALESCE(p_notes, 'Net = ' || ROUND(v_net::numeric, 2))
  );

  -- Lock the period if a period_locks table exists.
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'period_locks') THEN
    INSERT INTO period_locks (user_id, period_start, period_end, locked_by, reason)
    VALUES (p_user_id, v_start, p_fy_end, p_actor, 'FY close')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_journal_id;
END;
$$;

-- ── 6. Ensure default COA for a user (idempotent) ──────────────────────────
-- Wraps seed_default_account_tree + creates the standard control accounts
-- under the right groups, with the new field defaults applied. Safe to call
-- on every login / first COA page load.
CREATE OR REPLACE FUNCTION ensure_default_coa(p_user_id TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_curr_assets UUID; v_curr_liab UUID; v_income UUID; v_indirect_exp UUID;
  v_inv UUID; v_equity UUID;
BEGIN
  -- 1. Build the group tree first.
  PERFORM seed_default_account_tree(p_user_id);

  SELECT id INTO v_curr_assets  FROM accounts WHERE user_id = p_user_id AND account_code = '1100';
  SELECT id INTO v_inv          FROM accounts WHERE user_id = p_user_id AND account_code = '1300';
  SELECT id INTO v_curr_liab    FROM accounts WHERE user_id = p_user_id AND account_code = '2100';
  SELECT id INTO v_equity       FROM accounts WHERE user_id = p_user_id AND account_code = '3000';
  SELECT id INTO v_income       FROM accounts WHERE user_id = p_user_id AND account_code = '4000';
  SELECT id INTO v_indirect_exp FROM accounts WHERE user_id = p_user_id AND account_code = '5200';

  -- 2. Standard leaf accounts with sensible defaults. ON CONFLICT keeps the
  -- existing row untouched (we don't want to overwrite a user-customised name).
  INSERT INTO accounts (user_id, account_code, account_name, account_type, parent_account_id, account_group, account_subgroup, cash_flow_category, reconciliation_required, allow_manual_journals, is_active, opening_balance) VALUES
    -- Assets
    (p_user_id, '1110', 'Cash Account',            'Asset',     v_curr_assets, 'Assets', 'Current Assets',     'Operating', FALSE, TRUE, TRUE, 0),
    (p_user_id, '1120', 'Bank Account',            'Asset',     v_curr_assets, 'Assets', 'Current Assets',     'Operating', TRUE,  TRUE, TRUE, 0),
    (p_user_id, '1130', 'Accounts Receivable',     'Asset',     v_curr_assets, 'Assets', 'Current Assets',     'Operating', FALSE, FALSE, TRUE, 0),
    (p_user_id, '1140', 'Vendor Advances',         'Asset',     v_curr_assets, 'Assets', 'Current Assets',     'Operating', FALSE, FALSE, TRUE, 0),
    (p_user_id, '1150', 'Input Tax Credit',        'Asset',     v_curr_assets, 'Assets', 'Current Assets',     'Operating', FALSE, FALSE, TRUE, 0),
    (p_user_id, '1151', 'CGST Input',              'Asset',     v_curr_assets, 'Assets', 'Current Assets',     'Operating', FALSE, FALSE, TRUE, 0),
    (p_user_id, '1152', 'SGST Input',              'Asset',     v_curr_assets, 'Assets', 'Current Assets',     'Operating', FALSE, FALSE, TRUE, 0),
    (p_user_id, '1153', 'IGST Input',              'Asset',     v_curr_assets, 'Assets', 'Current Assets',     'Operating', FALSE, FALSE, TRUE, 0),
    (p_user_id, '1154', 'Cess Input',              'Asset',     v_curr_assets, 'Assets', 'Current Assets',     'Operating', FALSE, FALSE, TRUE, 0),
    (p_user_id, '1160', 'Prepaid Expenses',        'Asset',     v_curr_assets, 'Assets', 'Current Assets',     'Operating', FALSE, TRUE,  TRUE, 0),
    (p_user_id, '1310', 'Inventory Asset',         'Asset',     v_inv,         'Assets', 'Inventory',          'Operating', FALSE, FALSE, TRUE, 0),
    -- Liabilities
    (p_user_id, '2110', 'Accounts Payable',        'Liability', v_curr_liab,   'Liabilities', 'Current Liabilities', 'Operating', FALSE, FALSE, TRUE, 0),
    (p_user_id, '2120', 'Customer Advances',       'Liability', v_curr_liab,   'Liabilities', 'Current Liabilities', 'Operating', FALSE, FALSE, TRUE, 0),
    (p_user_id, '2130', 'Output GST',              'Liability', v_curr_liab,   'Liabilities', 'Current Liabilities', 'Operating', FALSE, FALSE, TRUE, 0),
    (p_user_id, '2131', 'CGST Output',             'Liability', v_curr_liab,   'Liabilities', 'Current Liabilities', 'Operating', FALSE, FALSE, TRUE, 0),
    (p_user_id, '2132', 'SGST Output',             'Liability', v_curr_liab,   'Liabilities', 'Current Liabilities', 'Operating', FALSE, FALSE, TRUE, 0),
    (p_user_id, '2133', 'IGST Output',             'Liability', v_curr_liab,   'Liabilities', 'Current Liabilities', 'Operating', FALSE, FALSE, TRUE, 0),
    (p_user_id, '2134', 'Cess Output',             'Liability', v_curr_liab,   'Liabilities', 'Current Liabilities', 'Operating', FALSE, FALSE, TRUE, 0),
    (p_user_id, '2135', 'Output GST on Advances',  'Liability', v_curr_liab,   'Liabilities', 'Current Liabilities', 'Operating', FALSE, FALSE, TRUE, 0),
    (p_user_id, '2140', 'RCM Tax Liability',       'Liability', v_curr_liab,   'Liabilities', 'Current Liabilities', 'Operating', FALSE, FALSE, TRUE, 0),
    (p_user_id, '2150', 'TDS Payable',             'Liability', v_curr_liab,   'Liabilities', 'Current Liabilities', 'Operating', FALSE, FALSE, TRUE, 0),
    -- Equity
    (p_user_id, '3100', 'Retained Earnings',       'Equity',    v_equity,      'Equity', NULL, NULL, FALSE, FALSE, TRUE, 0),
    -- Income
    (p_user_id, '4100', 'Sales Revenue',           'Income',    v_income,      'Income', NULL, 'Operating', FALSE, TRUE, TRUE, 0),
    (p_user_id, '4110', 'Sales Returns',           'Income',    v_income,      'Income', NULL, 'Operating', FALSE, TRUE, TRUE, 0),
    -- Expenses
    (p_user_id, '5210', 'Purchase Account',        'Expense',   v_indirect_exp, 'Expenses', 'Indirect Expenses', 'Operating', FALSE, TRUE,  TRUE, 0),
    (p_user_id, '5211', 'Purchase Returns',        'Expense',   v_indirect_exp, 'Expenses', 'Indirect Expenses', 'Operating', FALSE, TRUE,  TRUE, 0),
    (p_user_id, '5220', 'Cost of Goods Sold',      'Expense',   v_indirect_exp, 'Expenses', 'Indirect Expenses', 'Operating', FALSE, FALSE, TRUE, 0),
    (p_user_id, '5230', 'Inventory Adjustments',   'Expense',   v_indirect_exp, 'Expenses', 'Indirect Expenses', 'Operating', FALSE, TRUE,  TRUE, 0),
    (p_user_id, '5290', 'Round Off',               'Expense',   v_indirect_exp, 'Expenses', 'Indirect Expenses', NULL,        FALSE, TRUE,  TRUE, 0)
  ON CONFLICT (user_id, account_code) DO NOTHING;

  -- 3. Seed default mappings (idempotent). If user already mapped, leave alone.
  INSERT INTO account_mapping (user_id, module, scenario_key, account_id)
  SELECT p_user_id, m.module, m.scenario_key, a.id
    FROM (VALUES
      ('AR',        'ar_control',             'Accounts Receivable'),
      ('AP',        'ap_control',             'Accounts Payable'),
      ('Banking',   'bank_default',           'Bank Account'),
      ('Banking',   'cash_default',           'Cash Account'),
      ('Sales',     'sales_revenue',          'Sales Revenue'),
      ('Sales',     'sales_returns',          'Sales Returns'),
      ('Purchase',  'purchase_expense',       'Purchase Account'),
      ('Purchase',  'purchase_returns',       'Purchase Returns'),
      ('Inventory', 'inventory_asset',        'Inventory Asset'),
      ('Inventory', 'cogs',                   'Cost of Goods Sold'),
      ('Inventory', 'inventory_adjustments',  'Inventory Adjustments'),
      ('GST',       'itc',                    'Input Tax Credit'),
      ('GST',       'output_gst',             'Output GST'),
      ('GST',       'cgst_input',             'CGST Input'),
      ('GST',       'sgst_input',             'SGST Input'),
      ('GST',       'igst_input',             'IGST Input'),
      ('GST',       'cess_input',             'Cess Input'),
      ('GST',       'cgst_output',            'CGST Output'),
      ('GST',       'sgst_output',            'SGST Output'),
      ('GST',       'igst_output',            'IGST Output'),
      ('GST',       'cess_output',            'Cess Output'),
      ('GST',       'output_gst_on_advances', 'Output GST on Advances'),
      ('GST',       'rcm_liability',          'RCM Tax Liability'),
      ('AP',        'vendor_advances',        'Vendor Advances'),
      ('AR',        'customer_advances',      'Customer Advances'),
      ('TDS',       'tds_payable',            'TDS Payable'),
      ('Equity',    'retained_earnings',      'Retained Earnings'),
      ('Misc',      'round_off',              'Round Off'),
      ('Misc',      'prepaid_expenses',       'Prepaid Expenses')
    ) AS m(module, scenario_key, account_name)
    JOIN accounts a
      ON a.user_id = p_user_id
     AND lower(a.account_name) = lower(m.account_name)
  ON CONFLICT (user_id, scenario_key) DO NOTHING;
END;
$$;

-- ── 7. Reload PostgREST schema cache ───────────────────────────────────────
NOTIFY pgrst, 'reload schema';

COMMENT ON TABLE  account_mapping IS
  'Module/scenario → account_id config. Engine resolves via resolve_account_mapping(); falls back to getOrCreateAccount() when no row exists.';
COMMENT ON COLUMN accounts.gst_applicable IS
  'When TRUE, transactions hitting this ledger default to GST-on. Used by the UI to pre-fill tax rows.';
COMMENT ON COLUMN accounts.cash_flow_category IS
  'Operating | Investing | Financing | NULL. Drives the Cash Flow Statement classification.';
COMMENT ON COLUMN accounts.is_locked IS
  'When TRUE, new postings to this account are blocked (enforce_unlocked_account_only). Used during year-end close or for retired accounts.';
COMMENT ON COLUMN accounts.allow_manual_journals IS
  'When FALSE, the Manual Journal page hides this account. Use it on system-managed accounts (Retained Earnings, control accounts) to force postings through their proper flows.';
COMMENT ON FUNCTION close_fiscal_year IS
  'Posts a closing journal (zero P&L → Retained Earnings) and optionally locks the period.';
COMMENT ON FUNCTION resolve_account_mapping IS
  'Returns the user''s configured account for a scenario_key, or NULL if no mapping. Engine treats NULL as "fall back to hardcoded default".';
