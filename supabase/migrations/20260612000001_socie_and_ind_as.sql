-- ============================================================================
-- PHASE 19 — STATEMENT OF CHANGES IN EQUITY (SOCIE) + Ind AS DIVISION II
-- ----------------------------------------------------------------------------
-- 1. SOCIE engine — required under Schedule III for companies preparing
--    consolidated financial statements. Tracks movement in each equity
--    component (Share Capital, General Reserve, Retained Earnings, OCI Reserve)
--    between opening and closing balances.
--
-- 2. Ind AS Division II scaffolding — adds the alternative presentation
--    structure used by listed companies / Ind AS reporters (different sub-
--    section ordering, OCI line, financial assets/liabilities categorisation).
-- ============================================================================

-- ── 1. SOCIE RPC ────────────────────────────────────────────────────────────
-- For each equity account, compute:
--   opening_balance  = balance as of (period_start - 1 day)
--   p_l_for_period   = net income flowing to Reserves (only for BS.E.2)
--   movements        = sum of period journal entries (dividends, share issue, etc.)
--   closing_balance  = balance as of period_end
CREATE OR REPLACE FUNCTION get_statement_of_changes_in_equity(
  p_user_id      TEXT,
  p_period_start DATE,
  p_period_end   DATE
) RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_result JSONB;
  v_pat NUMERIC;
BEGIN
  -- Net income for the period (transfers to Reserves & Surplus during close)
  WITH pl AS (
    SELECT
      SUM(CASE a.account_type
            WHEN 'Income'  THEN COALESCE(jl.credit,0) - COALESCE(jl.debit,0)
            WHEN 'Expense' THEN -(COALESCE(jl.debit,0)  - COALESCE(jl.credit,0))
          END) AS pat
    FROM accounts a
    LEFT JOIN journal_lines jl ON jl.account_id = a.id AND jl.user_id = a.user_id
    LEFT JOIN journals j ON j.id = jl.journal_id AND j.status = 'posted'
                        AND j.journal_date BETWEEN p_period_start AND p_period_end
    WHERE a.user_id = p_user_id
      AND a.account_type IN ('Income','Expense')
      AND COALESCE(a.is_group, FALSE) = FALSE
  )
  SELECT COALESCE(pat, 0) INTO v_pat FROM pl;

  WITH equity_accounts AS (
    SELECT
      a.id,
      a.account_code,
      a.account_name,
      a.schedule_iii_line_code,
      l.display_label,
      l.sort_order,
      -- Opening (as of day before period_start)
      COALESCE((
        SELECT SUM(COALESCE(jl.credit,0) - COALESCE(jl.debit,0))
          FROM journal_lines jl
          JOIN journals j ON j.id = jl.journal_id
         WHERE jl.account_id = a.id
           AND jl.user_id = a.user_id
           AND j.status = 'posted'
           AND j.journal_date < p_period_start
      ), 0)::NUMERIC AS opening_balance,
      -- Net movement during the period (positive = increase, negative = decrease)
      COALESCE((
        SELECT SUM(COALESCE(jl.credit,0) - COALESCE(jl.debit,0))
          FROM journal_lines jl
          JOIN journals j ON j.id = jl.journal_id
         WHERE jl.account_id = a.id
           AND jl.user_id = a.user_id
           AND j.status = 'posted'
           AND j.journal_date BETWEEN p_period_start AND p_period_end
      ), 0)::NUMERIC AS period_movement,
      -- Closing (as of period_end)
      COALESCE((
        SELECT SUM(COALESCE(jl.credit,0) - COALESCE(jl.debit,0))
          FROM journal_lines jl
          JOIN journals j ON j.id = jl.journal_id
         WHERE jl.account_id = a.id
           AND jl.user_id = a.user_id
           AND j.status = 'posted'
           AND j.journal_date <= p_period_end
      ), 0)::NUMERIC AS closing_balance
    FROM accounts a
    LEFT JOIN schedule_iii_lines l ON l.line_code = a.schedule_iii_line_code
    WHERE a.user_id = p_user_id
      AND a.account_type = 'Equity'
      AND COALESCE(a.is_group, FALSE) = FALSE
  ),
  -- Inject retained earnings (PAT) as a movement onto BS.E.2 (Reserves & Surplus)
  -- since the actual closing journal may not have been posted in-period.
  with_pat AS (
    SELECT
      ea.*,
      CASE WHEN ea.schedule_iii_line_code = 'BS.E.2' THEN v_pat ELSE 0 END AS pat_share
    FROM equity_accounts ea
  )
  SELECT jsonb_build_object(
    'period_start', p_period_start,
    'period_end',   p_period_end,
    'pat_for_period', ROUND(v_pat::NUMERIC, 2),
    'components',
      jsonb_agg(
        jsonb_build_object(
          'account_id',         id,
          'account_code',       account_code,
          'account_name',       account_name,
          'line_code',          schedule_iii_line_code,
          'line_label',         display_label,
          'opening_balance',    ROUND(opening_balance::NUMERIC, 2),
          'profit_for_period',  ROUND(pat_share::NUMERIC, 2),
          'other_movements',    ROUND(period_movement::NUMERIC, 2),
          'closing_balance',    ROUND((opening_balance + period_movement + pat_share)::NUMERIC, 2)
        ) ORDER BY sort_order NULLS LAST, account_code
      ),
    'totals', jsonb_build_object(
      'opening_balance',   ROUND(SUM(opening_balance)::NUMERIC, 2),
      'profit_for_period', ROUND(v_pat::NUMERIC, 2),
      'other_movements',   ROUND(SUM(period_movement)::NUMERIC, 2),
      'closing_balance',   ROUND(SUM(opening_balance + period_movement + pat_share)::NUMERIC, 2)
    )
  ) INTO v_result
  FROM with_pat;

  RETURN COALESCE(v_result, jsonb_build_object(
    'period_start', p_period_start, 'period_end', p_period_end,
    'pat_for_period', 0, 'components', '[]'::jsonb,
    'totals', jsonb_build_object('opening_balance', 0, 'profit_for_period', 0, 'other_movements', 0, 'closing_balance', 0)
  ));
END;
$$;

-- ── 2. Ind AS Division II scaffolding ──────────────────────────────────────
-- Schedule III has TWO divisions:
--   Division I — companies preparing financials per Indian GAAP (current build)
--   Division II — companies required to follow Ind AS (Listed cos, large cos)
-- Division II has different sub-section ordering + OCI presentation + financial
-- instruments split. Phase 19 lays the foundation by adding the toggle and
-- alternative line codes; full Division II re-presentation comes later.

ALTER TABLE accounting_settings
  ADD COLUMN IF NOT EXISTS reporting_division TEXT NOT NULL DEFAULT 'Division_I'
    CHECK (reporting_division IN ('Division_I','Division_II'));

ALTER TABLE schedule_iii_lines
  ADD COLUMN IF NOT EXISTS ind_as_line_code TEXT,
  ADD COLUMN IF NOT EXISTS ind_as_subsection TEXT,
  ADD COLUMN IF NOT EXISTS ind_as_sort_order INT;

-- Map Indian GAAP lines to their Division II equivalents (approximate — full
-- Division II requires reclassifications a CA must review)
UPDATE schedule_iii_lines SET
  ind_as_line_code  = CASE line_code
    -- Equity (Division II: "Equity" section instead of "Shareholders Funds")
    WHEN 'BS.E.1'   THEN 'INDAS.E.1'   -- Equity Share Capital
    WHEN 'BS.E.2'   THEN 'INDAS.E.2'   -- Other Equity (includes Reserves + OCI + Retained Earnings)
    WHEN 'BS.E.3'   THEN 'INDAS.E.3'   -- Money received against share warrants
    -- Non-Current Liabilities — split into Financial + Other
    WHEN 'BS.NCL.1' THEN 'INDAS.NCL.FL.1'  -- Borrowings (financial liability)
    WHEN 'BS.NCL.2' THEN 'INDAS.NCL.TAX'   -- Deferred Tax Liabilities (Net)
    WHEN 'BS.NCL.3' THEN 'INDAS.NCL.OTH.1' -- Other Non-Current Liabilities
    WHEN 'BS.NCL.4' THEN 'INDAS.NCL.PROV'  -- Provisions
    -- Current Liabilities
    WHEN 'BS.CL.1'  THEN 'INDAS.CL.FL.1'   -- Borrowings (current)
    WHEN 'BS.CL.2'  THEN 'INDAS.CL.FL.2'   -- Trade Payables (with MSME / Others split)
    WHEN 'BS.CL.3'  THEN 'INDAS.CL.OTH'    -- Other Financial Liabilities + Other Current Liabilities
    WHEN 'BS.CL.4'  THEN 'INDAS.CL.PROV'   -- Provisions
    -- Non-Current Assets
    WHEN 'BS.NCA.1' THEN 'INDAS.NCA.PPE'   -- Property, Plant & Equipment
    WHEN 'BS.NCA.2' THEN 'INDAS.NCA.INT'   -- Intangible Assets
    WHEN 'BS.NCA.3' THEN 'INDAS.NCA.CWIP'  -- Capital Work-in-Progress
    WHEN 'BS.NCA.4' THEN 'INDAS.NCA.INV'   -- Investments
    WHEN 'BS.NCA.5' THEN 'INDAS.NCA.DTA'   -- Deferred Tax Assets
    WHEN 'BS.NCA.6' THEN 'INDAS.NCA.LOAN'  -- Loans (non-current)
    WHEN 'BS.NCA.7' THEN 'INDAS.NCA.OTH'   -- Other Non-Current Assets
    -- Current Assets
    WHEN 'BS.CA.1'  THEN 'INDAS.CA.INV'    -- Current Investments
    WHEN 'BS.CA.2'  THEN 'INDAS.CA.STOCK'  -- Inventories
    WHEN 'BS.CA.3'  THEN 'INDAS.CA.TRDR'   -- Trade Receivables
    WHEN 'BS.CA.4'  THEN 'INDAS.CA.CASH'   -- Cash & Cash Equivalents + Bank Balances Other
    WHEN 'BS.CA.5'  THEN 'INDAS.CA.LOAN'   -- Loans (current)
    WHEN 'BS.CA.6'  THEN 'INDAS.CA.OTH'    -- Other Current Assets
    -- P&L Revenue
    WHEN 'PL.R.1'   THEN 'INDAS.PL.REV.OPS'
    WHEN 'PL.R.2'   THEN 'INDAS.PL.REV.OTH'
    -- P&L Expenses
    WHEN 'PL.E.1'   THEN 'INDAS.PL.EXP.MAT'
    WHEN 'PL.E.2'   THEN 'INDAS.PL.EXP.PUR'
    WHEN 'PL.E.3'   THEN 'INDAS.PL.EXP.INV'
    WHEN 'PL.E.4'   THEN 'INDAS.PL.EXP.EMP'
    WHEN 'PL.E.5'   THEN 'INDAS.PL.EXP.FIN'
    WHEN 'PL.E.6'   THEN 'INDAS.PL.EXP.DEP'
    WHEN 'PL.E.7'   THEN 'INDAS.PL.EXP.OTH'
    WHEN 'PL.E.8'   THEN 'INDAS.PL.TAX'
    ELSE NULL
  END,
  ind_as_subsection = CASE
    -- Division II groups financial vs non-financial separately
    WHEN line_code LIKE 'BS.NCL.%' AND line_code IN ('BS.NCL.1') THEN 'Non-current Financial Liabilities'
    WHEN line_code LIKE 'BS.NCL.%'                                THEN 'Non-current Liabilities'
    WHEN line_code LIKE 'BS.CL.%'  AND line_code IN ('BS.CL.1','BS.CL.2') THEN 'Current Financial Liabilities'
    WHEN line_code LIKE 'BS.CL.%'                                 THEN 'Current Liabilities'
    WHEN line_code IN ('BS.NCA.1','BS.NCA.2','BS.NCA.3')          THEN 'Non-current Non-financial Assets'
    WHEN line_code = 'BS.NCA.4'                                    THEN 'Non-current Financial Assets'
    WHEN line_code LIKE 'BS.NCA.%'                                THEN 'Non-current Assets'
    WHEN line_code IN ('BS.CA.1','BS.CA.3','BS.CA.4','BS.CA.5')   THEN 'Current Financial Assets'
    WHEN line_code LIKE 'BS.CA.%'                                 THEN 'Current Assets'
    WHEN line_code LIKE 'BS.E.%'                                  THEN 'Equity'
    WHEN line_code LIKE 'PL.R.%'                                  THEN 'Income'
    WHEN line_code LIKE 'PL.E.%'                                  THEN 'Expenses'
    ELSE NULL
  END
WHERE ind_as_line_code IS NULL;

-- ── 3. Convenience: return the active division for a user ──────────────────
CREATE OR REPLACE FUNCTION get_reporting_division(p_user_id TEXT)
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT COALESCE(reporting_division, 'Division_I')
    FROM accounting_settings
   WHERE user_id = p_user_id
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_statement_of_changes_in_equity(TEXT, DATE, DATE) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_reporting_division(TEXT)                         TO authenticated, anon;
