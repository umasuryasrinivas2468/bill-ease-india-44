-- ============================================================================
-- PHASE 13 — FINANCIAL YEAR CLOSING ENGINE
-- ----------------------------------------------------------------------------
-- close_financial_year(user, fy):
--   1. Computes per-account net for the FY (Income & Expense).
--   2. Posts a single year-end closing journal:
--        Dr (each Income account, by its net credit balance)
--        Cr (each Expense account, by its net debit balance)
--        Net P&L → Reserves & Surplus (Cr if profit, Dr if loss)
--   3. Locks the FY through the FY-end date via lock_financial_period.
-- Idempotent via the `source_type = 'fy_close'` index on journals.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_or_create_reserves_account(p_user_id TEXT)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_id UUID;
  v_parent UUID;
BEGIN
  SELECT id INTO v_id
    FROM accounts
   WHERE user_id = p_user_id
     AND COALESCE(is_group, FALSE) = FALSE
     AND schedule_iii_line_code = 'BS.E.2'
   ORDER BY display_order, account_code
   LIMIT 1;

  IF v_id IS NULL THEN
    SELECT id INTO v_parent
      FROM accounts
     WHERE user_id = p_user_id AND account_code = '3000'
     LIMIT 1;
    IF v_parent IS NULL THEN
      PERFORM seed_default_account_tree(p_user_id);
      SELECT id INTO v_parent FROM accounts WHERE user_id = p_user_id AND account_code = '3000' LIMIT 1;
    END IF;

    INSERT INTO accounts (user_id, account_code, account_name, account_type, parent_account_id,
                          account_group, account_subgroup, is_group, display_order,
                          schedule_iii_section, schedule_iii_subsection, schedule_iii_line_code,
                          current_non_current, statement_type)
    VALUES (p_user_id, '3100', 'Reserves & Surplus', 'Equity', v_parent,
            'Equity', 'Shareholders Funds', FALSE, 10,
            'EQUITY_AND_LIABILITIES', 'Shareholders Funds', 'BS.E.2', 'NA', 'BS')
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

-- ── Main RPC ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION close_financial_year(
  p_user_id   TEXT,
  p_fiscal_year TEXT
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_start DATE; v_end DATE;
  v_reserves_id UUID;
  v_lines JSONB := '[]'::jsonb;
  v_income_total NUMERIC := 0;
  v_expense_total NUMERIC := 0;
  v_pat NUMERIC;
  v_lock_through DATE;
  v_existing UUID;
  v_journal_id UUID;
  v_journal_number TEXT;
  v_idempotency_key TEXT;
  v_lock_id UUID;
BEGIN
  SELECT b.fy_start, b.fy_end INTO v_start, v_end FROM fy_bounds(p_fiscal_year) b;
  v_idempotency_key := 'fy_close_' || p_user_id || '_' || p_fiscal_year;

  -- Short-circuit if already closed
  SELECT id INTO v_existing
    FROM journals
   WHERE user_id = p_user_id
     AND source_type = 'fy_close'
     AND idempotency_key = v_idempotency_key
     AND is_reversed = FALSE
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'already_closed', TRUE,
      'journal_id',     v_existing,
      'fiscal_year',    p_fiscal_year
    );
  END IF;

  v_reserves_id := get_or_create_reserves_account(p_user_id);

  -- Build journal lines from per-account net for the FY
  WITH per_account AS (
    SELECT a.id AS account_id, a.account_type,
           SUM(COALESCE(jl.debit, 0))  AS dr,
           SUM(COALESCE(jl.credit, 0)) AS cr
      FROM accounts a
      JOIN journal_lines jl ON jl.account_id = a.id AND jl.user_id = a.user_id
      JOIN journals j       ON j.id = jl.journal_id AND j.status = 'posted'
                            AND j.journal_date BETWEEN v_start AND v_end
     WHERE a.user_id = p_user_id
       AND a.account_type IN ('Income','Expense')
       AND COALESCE(a.is_group, FALSE) = FALSE
     GROUP BY a.id, a.account_type
  ),
  closing_lines AS (
    SELECT
      account_id, account_type,
      CASE WHEN account_type = 'Income'  THEN (cr - dr) ELSE 0 END AS income_net,
      CASE WHEN account_type = 'Expense' THEN (dr - cr) ELSE 0 END AS expense_net
    FROM per_account
  )
  SELECT
    jsonb_agg(
      CASE
        WHEN account_type = 'Income' AND income_net <> 0 THEN
          jsonb_build_object('account_id', account_id, 'debit', ROUND(income_net::NUMERIC,2), 'credit', 0,
                             'line_narration', 'FY-end close: transfer Income to Reserves & Surplus')
        WHEN account_type = 'Expense' AND expense_net <> 0 THEN
          jsonb_build_object('account_id', account_id, 'debit', 0, 'credit', ROUND(expense_net::NUMERIC,2),
                             'line_narration', 'FY-end close: transfer Expense to Reserves & Surplus')
      END
    ) FILTER (WHERE (account_type='Income' AND income_net <> 0)
                 OR (account_type='Expense' AND expense_net <> 0)),
    COALESCE(SUM(income_net),  0),
    COALESCE(SUM(expense_net), 0)
    INTO v_lines, v_income_total, v_expense_total
  FROM closing_lines;

  v_pat := v_income_total - v_expense_total;

  IF v_lines IS NULL OR jsonb_array_length(v_lines) = 0 THEN
    RETURN jsonb_build_object(
      'closed',         FALSE,
      'reason',         'No income/expense activity in this fiscal year — nothing to close.',
      'fiscal_year',    p_fiscal_year,
      'fy_start',       v_start,
      'fy_end',         v_end
    );
  END IF;

  -- Balancing line: Reserves & Surplus
  -- If profit (income > expense), credit Reserves; if loss, debit Reserves.
  v_lines := v_lines || jsonb_build_array(
    jsonb_build_object(
      'account_id', v_reserves_id,
      'debit',  CASE WHEN v_pat < 0 THEN ROUND(ABS(v_pat)::NUMERIC,2) ELSE 0 END,
      'credit', CASE WHEN v_pat > 0 THEN ROUND(v_pat::NUMERIC,2) ELSE 0 END,
      'line_narration', 'FY-end close: Net profit/(loss) transferred to Reserves & Surplus'
    )
  );

  v_journal_number := 'FY-CLOSE-' || p_fiscal_year;

  -- Post the closing journal (idempotent via key)
  v_journal_id := post_journal(
    p_user_id        := p_user_id,
    p_journal_date   := v_end,
    p_narration      := 'Year-end closing for FY ' || p_fiscal_year || ' — transfer of Income & Expense balances to Reserves & Surplus',
    p_source_type    := 'fy_close',
    p_source_id      := NULL,
    p_idempotency_key:= v_idempotency_key,
    p_lines          := v_lines,
    p_journal_number := v_journal_number,
    p_status         := 'posted',
    p_posted_by      := p_user_id,
    p_notes          := format('Auto-generated FY close journal. PAT=%s', ROUND(v_pat::NUMERIC, 2))
  );

  -- Lock the period through FY-end (idempotent — silently skip if already locked)
  BEGIN
    v_lock_id := lock_financial_period(
      p_user_id, v_end, p_fiscal_year, 'Auto-lock on FY close ' || p_fiscal_year
    );
  EXCEPTION WHEN OTHERS THEN
    -- already locked through this date — that's fine
    v_lock_id := NULL;
  END;

  -- Refresh auto-notes after close
  PERFORM generate_default_notes(p_user_id, p_fiscal_year);

  RETURN jsonb_build_object(
    'closed',        TRUE,
    'fiscal_year',   p_fiscal_year,
    'fy_start',      v_start,
    'fy_end',        v_end,
    'journal_id',    v_journal_id,
    'journal_number',v_journal_number,
    'income_total',  ROUND(v_income_total::NUMERIC,  2),
    'expense_total', ROUND(v_expense_total::NUMERIC, 2),
    'pat',           ROUND(v_pat::NUMERIC, 2),
    'lock_id',       v_lock_id,
    'reserves_account_id', v_reserves_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION close_financial_year(TEXT, TEXT)              TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_or_create_reserves_account(TEXT)          TO authenticated, anon;
