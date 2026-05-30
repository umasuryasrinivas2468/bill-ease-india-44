-- ============================================================================
-- PHASE 11 — CASH FLOW STATEMENT ENGINE (Indirect Method, AS 3 / Ind AS 7)
-- ----------------------------------------------------------------------------
-- Generates a full Cash Flow Statement from posted journal entries using the
-- indirect method (start with PAT, adjust for non-cash items and working
-- capital changes). Activity classification (Operating / Investing /
-- Financing) is driven by Schedule III line tagging + cash_flow_category.
-- ============================================================================

-- ── 0. Extend cash_flow_category constraint to include 'Cash' ──────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
     WHERE table_name = 'accounts' AND constraint_name = 'accounts_cash_flow_category_chk'
  ) THEN
    ALTER TABLE accounts DROP CONSTRAINT accounts_cash_flow_category_chk;
  END IF;

  ALTER TABLE accounts
    ADD CONSTRAINT accounts_cash_flow_category_chk CHECK (
      cash_flow_category IS NULL OR cash_flow_category IN ('Operating','Investing','Financing','Cash')
    );
END $$;

-- ── 1. Cash-flow classifier (drives the indirect-method reclassification) ──
-- 'Cash'      → cash & cash-equivalent accounts (used for opening/closing cash).
-- 'Operating' → working capital + revenue/expense flows.
-- 'Investing' → purchase/sale of fixed assets, intangibles, investments.
-- 'Financing' → borrowings, share capital, dividends.
CREATE OR REPLACE FUNCTION classify_account_cash_flow(
  p_line_code TEXT,
  p_account_type TEXT
) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    -- Cash & cash equivalents (line code or by nature)
    WHEN p_line_code = 'BS.CA.4'  THEN 'Cash'
    -- Investing
    WHEN p_line_code IN ('BS.NCA.1','BS.NCA.2','BS.NCA.3','BS.NCA.4','BS.NCA.5','BS.NCA.6','BS.NCA.7','BS.CA.1') THEN 'Investing'
    -- Financing
    WHEN p_line_code IN ('BS.E.1','BS.E.2','BS.E.3','BS.NCL.1','BS.CL.1','PL.E.5') THEN 'Financing'
    -- Operating (rest of working capital + P&L)
    WHEN p_line_code IN ('BS.NCL.2','BS.NCL.3','BS.NCL.4','BS.CL.2','BS.CL.3','BS.CL.4',
                          'BS.CA.2','BS.CA.3','BS.CA.5','BS.CA.6') THEN 'Operating'
    WHEN p_line_code IN ('PL.R.1','PL.R.2','PL.E.1','PL.E.2','PL.E.3','PL.E.4','PL.E.6','PL.E.7','PL.E.8') THEN 'Operating'
    ELSE NULL
  END;
$$;

UPDATE accounts a
   SET cash_flow_category = classify_account_cash_flow(a.schedule_iii_line_code, a.account_type)
 WHERE a.cash_flow_category IS NULL
   AND a.schedule_iii_line_code IS NOT NULL
   AND COALESCE(a.is_group, FALSE) = FALSE;

-- Keep cash_flow_category in sync whenever an account's Schedule III line changes.
CREATE OR REPLACE FUNCTION accounts_sync_cash_flow_trg()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.schedule_iii_line_code IS NOT NULL
     AND (NEW.cash_flow_category IS NULL
          OR NEW.cash_flow_category IS DISTINCT FROM classify_account_cash_flow(NEW.schedule_iii_line_code, NEW.account_type)) THEN
    NEW.cash_flow_category := classify_account_cash_flow(NEW.schedule_iii_line_code, NEW.account_type);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_accounts_sync_cash_flow ON accounts;
CREATE TRIGGER trg_accounts_sync_cash_flow
  BEFORE INSERT OR UPDATE OF schedule_iii_line_code, account_type ON accounts
  FOR EACH ROW
  EXECUTE FUNCTION accounts_sync_cash_flow_trg();

-- ── 2. Balance helpers (closing balance as-of date + period totals) ────────
CREATE OR REPLACE FUNCTION bs_line_balance_as_of(p_user_id TEXT, p_line_code TEXT, p_as_of DATE)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(
    CASE a.account_type
      WHEN 'Asset'     THEN COALESCE(jl.debit,0)  - COALESCE(jl.credit,0)
      WHEN 'Liability' THEN COALESCE(jl.credit,0) - COALESCE(jl.debit,0)
      WHEN 'Equity'    THEN COALESCE(jl.credit,0) - COALESCE(jl.debit,0)
    END
  ), 0)::NUMERIC
  FROM accounts a
  LEFT JOIN journal_lines jl ON jl.account_id = a.id AND jl.user_id = a.user_id
  LEFT JOIN journals j       ON j.id = jl.journal_id AND j.status = 'posted' AND j.journal_date <= p_as_of
  WHERE a.user_id = p_user_id
    AND a.schedule_iii_line_code = p_line_code
    AND COALESCE(a.is_group, FALSE) = FALSE;
$$;

CREATE OR REPLACE FUNCTION pl_line_amount(p_user_id TEXT, p_line_code TEXT, p_start DATE, p_end DATE)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(
    CASE a.account_type
      WHEN 'Income'  THEN COALESCE(jl.credit,0) - COALESCE(jl.debit,0)
      WHEN 'Expense' THEN COALESCE(jl.debit,0)  - COALESCE(jl.credit,0)
    END
  ), 0)::NUMERIC
  FROM accounts a
  LEFT JOIN journal_lines jl ON jl.account_id = a.id AND jl.user_id = a.user_id
  LEFT JOIN journals j       ON j.id = jl.journal_id AND j.status = 'posted'
                            AND j.journal_date BETWEEN p_start AND p_end
  WHERE a.user_id = p_user_id
    AND a.schedule_iii_line_code = p_line_code
    AND COALESCE(a.is_group, FALSE) = FALSE;
$$;

-- ── 3. CASH FLOW STATEMENT RPC (indirect method) ───────────────────────────
CREATE OR REPLACE FUNCTION get_cash_flow_statement(
  p_user_id      TEXT,
  p_period_start DATE,
  p_period_end   DATE
) RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
  -- Period bounds for "delta" working-capital calc
  v_prev_end DATE := (p_period_start - INTERVAL '1 day')::DATE;

  -- P&L drivers
  v_pat              NUMERIC;
  v_pbt              NUMERIC;
  v_depreciation     NUMERIC;
  v_finance_costs    NUMERIC;
  v_other_income     NUMERIC;
  v_tax_expense      NUMERIC;

  -- Working capital deltas (closing − opening). For assets: +Δ = cash USED.
  v_d_receivables    NUMERIC;
  v_d_inventories    NUMERIC;
  v_d_st_loans_advs  NUMERIC;
  v_d_other_ca       NUMERIC;
  v_d_payables       NUMERIC;
  v_d_other_cl       NUMERIC;
  v_d_st_provisions  NUMERIC;

  -- Investing deltas
  v_d_tangible       NUMERIC;
  v_d_intangible     NUMERIC;
  v_d_cwip           NUMERIC;
  v_d_nc_invest      NUMERIC;
  v_d_lt_loans_advs  NUMERIC;

  -- Financing deltas
  v_d_share_capital  NUMERIC;
  v_d_lt_borrow      NUMERIC;
  v_d_st_borrow      NUMERIC;

  -- Cash
  v_open_cash        NUMERIC;
  v_close_cash       NUMERIC;

  v_operating        NUMERIC;
  v_investing        NUMERIC;
  v_financing        NUMERIC;
  v_net_change       NUMERIC;

  v_result           JSONB;
BEGIN
  -- P&L for the period
  v_other_income     := pl_line_amount(p_user_id, 'PL.R.2', p_period_start, p_period_end);
  v_depreciation     := pl_line_amount(p_user_id, 'PL.E.6', p_period_start, p_period_end);
  v_finance_costs    := pl_line_amount(p_user_id, 'PL.E.5', p_period_start, p_period_end);
  v_tax_expense      := pl_line_amount(p_user_id, 'PL.E.8', p_period_start, p_period_end);

  v_pbt :=
      pl_line_amount(p_user_id, 'PL.R.1', p_period_start, p_period_end)
    + v_other_income
    - pl_line_amount(p_user_id, 'PL.E.1', p_period_start, p_period_end)
    - pl_line_amount(p_user_id, 'PL.E.2', p_period_start, p_period_end)
    - pl_line_amount(p_user_id, 'PL.E.3', p_period_start, p_period_end)
    - pl_line_amount(p_user_id, 'PL.E.4', p_period_start, p_period_end)
    - v_finance_costs
    - v_depreciation
    - pl_line_amount(p_user_id, 'PL.E.7', p_period_start, p_period_end);

  v_pat := v_pbt - v_tax_expense;

  -- Working capital deltas (closing − opening)
  v_d_receivables   := bs_line_balance_as_of(p_user_id, 'BS.CA.3', p_period_end) - bs_line_balance_as_of(p_user_id, 'BS.CA.3', v_prev_end);
  v_d_inventories   := bs_line_balance_as_of(p_user_id, 'BS.CA.2', p_period_end) - bs_line_balance_as_of(p_user_id, 'BS.CA.2', v_prev_end);
  v_d_st_loans_advs := bs_line_balance_as_of(p_user_id, 'BS.CA.5', p_period_end) - bs_line_balance_as_of(p_user_id, 'BS.CA.5', v_prev_end);
  v_d_other_ca      := bs_line_balance_as_of(p_user_id, 'BS.CA.6', p_period_end) - bs_line_balance_as_of(p_user_id, 'BS.CA.6', v_prev_end);
  v_d_payables      := bs_line_balance_as_of(p_user_id, 'BS.CL.2', p_period_end) - bs_line_balance_as_of(p_user_id, 'BS.CL.2', v_prev_end);
  v_d_other_cl      := bs_line_balance_as_of(p_user_id, 'BS.CL.3', p_period_end) - bs_line_balance_as_of(p_user_id, 'BS.CL.3', v_prev_end);
  v_d_st_provisions := bs_line_balance_as_of(p_user_id, 'BS.CL.4', p_period_end) - bs_line_balance_as_of(p_user_id, 'BS.CL.4', v_prev_end);

  -- Investing deltas (closing − opening). +Δ in asset = cash spent (negative on CFS).
  v_d_tangible      := bs_line_balance_as_of(p_user_id, 'BS.NCA.1', p_period_end) - bs_line_balance_as_of(p_user_id, 'BS.NCA.1', v_prev_end);
  v_d_intangible    := bs_line_balance_as_of(p_user_id, 'BS.NCA.2', p_period_end) - bs_line_balance_as_of(p_user_id, 'BS.NCA.2', v_prev_end);
  v_d_cwip          := bs_line_balance_as_of(p_user_id, 'BS.NCA.3', p_period_end) - bs_line_balance_as_of(p_user_id, 'BS.NCA.3', v_prev_end);
  v_d_nc_invest     := bs_line_balance_as_of(p_user_id, 'BS.NCA.4', p_period_end) - bs_line_balance_as_of(p_user_id, 'BS.NCA.4', v_prev_end);
  v_d_lt_loans_advs := bs_line_balance_as_of(p_user_id, 'BS.NCA.6', p_period_end) - bs_line_balance_as_of(p_user_id, 'BS.NCA.6', v_prev_end);

  -- Financing deltas (closing − opening). +Δ in liability/equity = cash IN.
  v_d_share_capital := bs_line_balance_as_of(p_user_id, 'BS.E.1',   p_period_end) - bs_line_balance_as_of(p_user_id, 'BS.E.1',   v_prev_end);
  v_d_lt_borrow     := bs_line_balance_as_of(p_user_id, 'BS.NCL.1', p_period_end) - bs_line_balance_as_of(p_user_id, 'BS.NCL.1', v_prev_end);
  v_d_st_borrow     := bs_line_balance_as_of(p_user_id, 'BS.CL.1',  p_period_end) - bs_line_balance_as_of(p_user_id, 'BS.CL.1',  v_prev_end);

  -- Cash & cash-equivalents (line BS.CA.4)
  v_open_cash  := bs_line_balance_as_of(p_user_id, 'BS.CA.4', v_prev_end);
  v_close_cash := bs_line_balance_as_of(p_user_id, 'BS.CA.4', p_period_end);

  -- Operating: PBT + non-cash add-backs − non-operating items + working-capital changes − tax paid
  -- (Note: finance cost is added back here and shown again under Financing as interest paid.)
  v_operating :=
      v_pbt
    + v_depreciation
    + v_finance_costs
    - v_other_income
    + (- v_d_receivables)        -- Δ AR (increase = cash used)
    + (- v_d_inventories)        -- Δ Inventory
    + (- v_d_st_loans_advs)
    + (- v_d_other_ca)
    + v_d_payables               -- Δ AP (increase = cash freed)
    + v_d_other_cl
    + v_d_st_provisions
    - v_tax_expense;             -- Tax paid (approx = tax expense; refine later)

  -- Investing: cash spent on non-current assets / proceeds on disposal
  v_investing :=
      (- v_d_tangible)
    + (- v_d_intangible)
    + (- v_d_cwip)
    + (- v_d_nc_invest)
    + (- v_d_lt_loans_advs)
    + v_other_income;            -- Interest/dividend received treated as investing

  -- Financing: borrowings + share issue − finance cost paid
  v_financing :=
      v_d_share_capital
    + v_d_lt_borrow
    + v_d_st_borrow
    - v_finance_costs;

  v_net_change := v_operating + v_investing + v_financing;

  v_result := jsonb_build_object(
    'period_start',     p_period_start,
    'period_end',       p_period_end,
    'method',           'indirect',
    'opening_cash',     ROUND(v_open_cash::NUMERIC, 2),
    'closing_cash',     ROUND(v_close_cash::NUMERIC, 2),
    'net_change',       ROUND(v_net_change::NUMERIC, 2),
    'reconciliation_diff', ROUND((v_close_cash - v_open_cash - v_net_change)::NUMERIC, 2),
    'operating', jsonb_build_object(
      'total', ROUND(v_operating::NUMERIC, 2),
      'lines', jsonb_build_array(
        jsonb_build_object('label','Profit before Tax',                            'amount', ROUND(v_pbt::NUMERIC,2),                'group','start'),
        jsonb_build_object('label','Adjustments for non-cash & non-operating',     'amount', NULL,                                     'group','adjustments_header'),
        jsonb_build_object('label','  Depreciation & Amortisation',                'amount', ROUND(v_depreciation::NUMERIC,2),         'group','adjustments'),
        jsonb_build_object('label','  Finance Costs (reclassed to Financing)',     'amount', ROUND(v_finance_costs::NUMERIC,2),        'group','adjustments'),
        jsonb_build_object('label','  Less: Other Income (reclassed to Investing)','amount', ROUND((-v_other_income)::NUMERIC,2),       'group','adjustments'),
        jsonb_build_object('label','Operating Profit before Working Capital Changes',
                           'amount', ROUND((v_pbt + v_depreciation + v_finance_costs - v_other_income)::NUMERIC,2), 'group','subtotal'),
        jsonb_build_object('label','Changes in Working Capital',                   'amount', NULL,                                     'group','wc_header'),
        jsonb_build_object('label','  (Increase) / Decrease in Trade Receivables', 'amount', ROUND((-v_d_receivables)::NUMERIC,2),     'group','wc'),
        jsonb_build_object('label','  (Increase) / Decrease in Inventories',       'amount', ROUND((-v_d_inventories)::NUMERIC,2),     'group','wc'),
        jsonb_build_object('label','  (Increase) / Decrease in ST Loans & Advances','amount', ROUND((-v_d_st_loans_advs)::NUMERIC,2),   'group','wc'),
        jsonb_build_object('label','  (Increase) / Decrease in Other Current Assets','amount', ROUND((-v_d_other_ca)::NUMERIC,2),       'group','wc'),
        jsonb_build_object('label','  Increase / (Decrease) in Trade Payables',    'amount', ROUND(v_d_payables::NUMERIC,2),           'group','wc'),
        jsonb_build_object('label','  Increase / (Decrease) in Other Current Liabilities','amount', ROUND(v_d_other_cl::NUMERIC,2),    'group','wc'),
        jsonb_build_object('label','  Increase / (Decrease) in Short-term Provisions','amount', ROUND(v_d_st_provisions::NUMERIC,2),    'group','wc'),
        jsonb_build_object('label','Cash Generated from Operations',
                           'amount', ROUND((v_operating + v_tax_expense)::NUMERIC,2), 'group','subtotal'),
        jsonb_build_object('label','Less: Income Tax Paid',                        'amount', ROUND((-v_tax_expense)::NUMERIC,2),       'group','tax'),
        jsonb_build_object('label','Net Cash from Operating Activities',           'amount', ROUND(v_operating::NUMERIC,2),            'group','total')
      )
    ),
    'investing', jsonb_build_object(
      'total', ROUND(v_investing::NUMERIC, 2),
      'lines', jsonb_build_array(
        jsonb_build_object('label','Purchase of Tangible Assets',                  'amount', ROUND((-v_d_tangible)::NUMERIC,2),         'group','line'),
        jsonb_build_object('label','Purchase of Intangible Assets',                'amount', ROUND((-v_d_intangible)::NUMERIC,2),       'group','line'),
        jsonb_build_object('label','Capital Work-in-Progress (net)',               'amount', ROUND((-v_d_cwip)::NUMERIC,2),             'group','line'),
        jsonb_build_object('label','Purchase of Non-current Investments',          'amount', ROUND((-v_d_nc_invest)::NUMERIC,2),        'group','line'),
        jsonb_build_object('label','Long-term Loans & Advances given',             'amount', ROUND((-v_d_lt_loans_advs)::NUMERIC,2),    'group','line'),
        jsonb_build_object('label','Interest & Dividend Received (Other Income)',  'amount', ROUND(v_other_income::NUMERIC,2),          'group','line'),
        jsonb_build_object('label','Net Cash used in Investing Activities',        'amount', ROUND(v_investing::NUMERIC,2),             'group','total')
      )
    ),
    'financing', jsonb_build_object(
      'total', ROUND(v_financing::NUMERIC, 2),
      'lines', jsonb_build_array(
        jsonb_build_object('label','Proceeds from / (Repayment of) Long-term Borrowings',  'amount', ROUND(v_d_lt_borrow::NUMERIC,2),      'group','line'),
        jsonb_build_object('label','Proceeds from / (Repayment of) Short-term Borrowings', 'amount', ROUND(v_d_st_borrow::NUMERIC,2),      'group','line'),
        jsonb_build_object('label','Issue of Share Capital (net)',                          'amount', ROUND(v_d_share_capital::NUMERIC,2),  'group','line'),
        jsonb_build_object('label','Less: Finance Costs / Interest Paid',                   'amount', ROUND((-v_finance_costs)::NUMERIC,2), 'group','line'),
        jsonb_build_object('label','Net Cash from / (used in) Financing Activities',        'amount', ROUND(v_financing::NUMERIC,2),        'group','total')
      )
    )
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_cash_flow_statement(TEXT, DATE, DATE)             TO authenticated, anon;
GRANT EXECUTE ON FUNCTION bs_line_balance_as_of(TEXT, TEXT, DATE)               TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pl_line_amount(TEXT, TEXT, DATE, DATE)                TO authenticated, anon;
