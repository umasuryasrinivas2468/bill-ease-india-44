-- ============================================================================
-- PHASE 20 — Ind AS DIVISION II (full BS / P&L+OCI engine)
-- ----------------------------------------------------------------------------
-- Builds on the Phase 19 scaffolding (reporting_division flag +
-- ind_as_line_code mappings) and delivers:
--   1. OCI line codes added to schedule_iii_lines master
--   2. is_oci + oci_classification flags on accounts
--   3. get_ind_as_balance_sheet  — Division II grouping
--      (Equity / Financial Liabs / Non-Financial Liabs / Financial Assets / Non-Financial Assets)
--   4. get_ind_as_profit_loss_and_oci — adds OCI section + Total Comprehensive Income
-- ============================================================================

-- ── 1. OCI tagging on accounts ─────────────────────────────────────────────
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS is_oci BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS oci_classification TEXT
    CHECK (oci_classification IS NULL OR oci_classification IN ('reclassifiable','non_reclassifiable'));

CREATE INDEX IF NOT EXISTS idx_accounts_is_oci ON accounts(user_id, is_oci) WHERE is_oci = TRUE;

-- ── 2. Add OCI lines to schedule_iii_lines master (Division II only) ───────
INSERT INTO schedule_iii_lines (line_code, section, subsection, display_label, statement_type, current_non_current, sort_order, note_no, default_account_type, ind_as_line_code, ind_as_subsection) VALUES
  -- Non-reclassifiable OCI items
  ('PL.OCI.NR.1', 'INCOME',   'OCI', 'Items that will not be reclassified to P&L',                       'PL', 'NA', 700, '35', 'Income',
                                     'INDAS.OCI.NR.HEADER',         'Other Comprehensive Income'),
  ('PL.OCI.NR.2', 'INCOME',   'OCI', '  Re-measurements of defined benefit plans (net of tax)',          'PL', 'NA', 705, '35', 'Income',
                                     'INDAS.OCI.NR.DBP',            'Other Comprehensive Income'),
  ('PL.OCI.NR.3', 'INCOME',   'OCI', '  Equity instruments through OCI (net of tax)',                    'PL', 'NA', 710, '35', 'Income',
                                     'INDAS.OCI.NR.EQUITY',         'Other Comprehensive Income'),
  ('PL.OCI.NR.4', 'INCOME',   'OCI', '  Revaluation surplus on PPE (net of tax)',                        'PL', 'NA', 715, '35', 'Income',
                                     'INDAS.OCI.NR.REVAL',          'Other Comprehensive Income'),
  -- Reclassifiable OCI items
  ('PL.OCI.R.1',  'INCOME',   'OCI', 'Items that may be reclassified to P&L',                            'PL', 'NA', 720, '35', 'Income',
                                     'INDAS.OCI.R.HEADER',          'Other Comprehensive Income'),
  ('PL.OCI.R.2',  'INCOME',   'OCI', '  Debt instruments through OCI (net of tax)',                      'PL', 'NA', 725, '35', 'Income',
                                     'INDAS.OCI.R.DEBT',            'Other Comprehensive Income'),
  ('PL.OCI.R.3',  'INCOME',   'OCI', '  Foreign currency translation reserve (net of tax)',              'PL', 'NA', 730, '35', 'Income',
                                     'INDAS.OCI.R.FCTR',            'Other Comprehensive Income'),
  ('PL.OCI.R.4',  'INCOME',   'OCI', '  Cash flow hedge reserve (net of tax)',                           'PL', 'NA', 735, '35', 'Income',
                                     'INDAS.OCI.R.HEDGE',           'Other Comprehensive Income')
ON CONFLICT (line_code) DO UPDATE SET
  display_label   = EXCLUDED.display_label,
  ind_as_line_code= EXCLUDED.ind_as_line_code,
  ind_as_subsection = EXCLUDED.ind_as_subsection,
  sort_order      = EXCLUDED.sort_order;

-- ── 3. BS-side OCI Reserve line (Other Equity component) ───────────────────
-- Under Ind AS, OCI accumulates in "Other Equity → OCI Reserve"
INSERT INTO schedule_iii_lines (line_code, section, subsection, display_label, statement_type, current_non_current, sort_order, note_no, default_account_type, ind_as_line_code, ind_as_subsection) VALUES
  ('BS.E.4',  'EQUITY_AND_LIABILITIES', 'Shareholders Funds', 'Other Comprehensive Income Reserve', 'BS', 'NA', 25, '3', 'Equity',
                                     'INDAS.E.OCI', 'Equity')
ON CONFLICT (line_code) DO UPDATE SET
  ind_as_line_code = EXCLUDED.ind_as_line_code,
  ind_as_subsection = EXCLUDED.ind_as_subsection,
  display_label = EXCLUDED.display_label;

-- ── 4. Ind AS BALANCE SHEET RPC (Division II presentation) ─────────────────
-- Groups by ind_as_subsection: Equity / Non-current Financial Liabilities /
-- Non-current Liabilities / Current Financial Liabilities / Current Liabilities /
-- Non-current Non-financial Assets / Non-current Financial Assets /
-- Current Financial Assets / Current Assets.
CREATE OR REPLACE FUNCTION get_ind_as_balance_sheet(
  p_user_id    TEXT,
  p_as_of      DATE DEFAULT CURRENT_DATE,
  p_prev_as_of DATE DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE v_result JSONB;
BEGIN
  WITH
  cur_bal AS (
    SELECT
      a.schedule_iii_line_code AS line_code,
      a.account_type,
      SUM(
        CASE a.account_type
          WHEN 'Asset'     THEN COALESCE(jl.debit,0)  - COALESCE(jl.credit,0)
          WHEN 'Liability' THEN COALESCE(jl.credit,0) - COALESCE(jl.debit,0)
          WHEN 'Equity'    THEN COALESCE(jl.credit,0) - COALESCE(jl.debit,0)
          WHEN 'Income'    THEN COALESCE(jl.credit,0) - COALESCE(jl.debit,0)
          WHEN 'Expense'   THEN COALESCE(jl.debit,0)  - COALESCE(jl.credit,0)
        END
      ) AS amount
    FROM accounts a
    LEFT JOIN journal_lines jl ON jl.account_id = a.id AND jl.user_id = a.user_id
    LEFT JOIN journals j ON j.id = jl.journal_id AND j.status = 'posted' AND j.journal_date <= p_as_of
    WHERE a.user_id = p_user_id
      AND COALESCE(a.is_group, FALSE) = FALSE
      AND a.schedule_iii_line_code IS NOT NULL
    GROUP BY a.schedule_iii_line_code, a.account_type
  ),
  cur_ret AS (
    SELECT 'BS.E.2'::TEXT AS line_code,
           COALESCE(SUM(CASE WHEN account_type = 'Income' THEN amount
                             WHEN account_type = 'Expense' THEN -amount
                             ELSE 0 END), 0) AS amount
    FROM cur_bal
  ),
  prev_bal AS (
    SELECT
      a.schedule_iii_line_code AS line_code,
      a.account_type,
      SUM(
        CASE a.account_type
          WHEN 'Asset'     THEN COALESCE(jl.debit,0)  - COALESCE(jl.credit,0)
          WHEN 'Liability' THEN COALESCE(jl.credit,0) - COALESCE(jl.debit,0)
          WHEN 'Equity'    THEN COALESCE(jl.credit,0) - COALESCE(jl.debit,0)
          WHEN 'Income'    THEN COALESCE(jl.credit,0) - COALESCE(jl.debit,0)
          WHEN 'Expense'   THEN COALESCE(jl.debit,0)  - COALESCE(jl.credit,0)
        END
      ) AS amount
    FROM accounts a
    LEFT JOIN journal_lines jl ON jl.account_id = a.id AND jl.user_id = a.user_id
    LEFT JOIN journals j ON j.id = jl.journal_id AND j.status = 'posted' AND j.journal_date <= p_prev_as_of
    WHERE p_prev_as_of IS NOT NULL
      AND a.user_id = p_user_id
      AND COALESCE(a.is_group, FALSE) = FALSE
      AND a.schedule_iii_line_code IS NOT NULL
    GROUP BY a.schedule_iii_line_code, a.account_type
  ),
  prev_ret AS (
    SELECT 'BS.E.2'::TEXT AS line_code,
           COALESCE(SUM(CASE WHEN account_type = 'Income' THEN amount
                             WHEN account_type = 'Expense' THEN -amount
                             ELSE 0 END), 0) AS amount
    FROM prev_bal
  ),
  cur_bs AS (
    SELECT line_code, amount FROM cur_bal WHERE account_type IN ('Asset','Liability','Equity')
    UNION ALL SELECT line_code, amount FROM cur_ret
  ),
  prev_bs AS (
    SELECT line_code, amount FROM prev_bal WHERE account_type IN ('Asset','Liability','Equity')
    UNION ALL SELECT line_code, amount FROM prev_ret
  ),
  cur_per_line  AS (SELECT line_code, ROUND(SUM(amount)::NUMERIC, 2) AS amount FROM cur_bs  GROUP BY line_code),
  prev_per_line AS (SELECT line_code, ROUND(SUM(amount)::NUMERIC, 2) AS amount FROM prev_bs GROUP BY line_code),
  rolled AS (
    SELECT
      l.line_code,
      -- Use Ind AS classification: section becomes a top-level grouping derived from ind_as_subsection
      CASE
        WHEN l.ind_as_subsection LIKE '%Asset%' THEN 'ASSETS'
        WHEN l.ind_as_subsection LIKE '%Liabilit%' THEN 'EQUITY_AND_LIABILITIES'
        WHEN l.ind_as_subsection = 'Equity' THEN 'EQUITY_AND_LIABILITIES'
        ELSE l.section
      END AS section,
      COALESCE(l.ind_as_subsection, l.subsection) AS subsection,
      l.current_non_current AS cnc,
      l.display_label,
      l.note_no,
      COALESCE(l.ind_as_sort_order, l.sort_order) AS sort_order,
      COALESCE(c.amount, 0) AS amount,
      CASE WHEN p_prev_as_of IS NOT NULL THEN COALESCE(p.amount, 0) ELSE NULL END AS prev_amount
    FROM schedule_iii_lines l
    LEFT JOIN cur_per_line  c ON c.line_code = l.line_code
    LEFT JOIN prev_per_line p ON p.line_code = l.line_code
    WHERE l.statement_type = 'BS'
      AND l.ind_as_line_code IS NOT NULL
  )
  SELECT jsonb_build_object(
    'division',     'Division_II',
    'as_of',        p_as_of,
    'prev_as_of',   p_prev_as_of,
    'comparative',  (p_prev_as_of IS NOT NULL),
    'sections', jsonb_agg(section_json ORDER BY section_order)
  ) INTO v_result
  FROM (
    SELECT
      section,
      MIN(sort_order) AS section_order,
      jsonb_build_object(
        'section', section,
        'total',        ROUND(SUM(amount)::NUMERIC, 2),
        'prev_total',   CASE WHEN p_prev_as_of IS NOT NULL THEN ROUND(SUM(prev_amount)::NUMERIC, 2) ELSE NULL END,
        'subsections', (
          SELECT jsonb_agg(sub_json ORDER BY sub_order)
            FROM (
              SELECT
                subsection,
                MIN(sort_order) AS sub_order,
                jsonb_build_object(
                  'subsection',          subsection,
                  'current_non_current', MIN(cnc),
                  'total',               ROUND(SUM(amount)::NUMERIC, 2),
                  'prev_total',          CASE WHEN p_prev_as_of IS NOT NULL THEN ROUND(SUM(prev_amount)::NUMERIC, 2) ELSE NULL END,
                  'lines', jsonb_agg(
                    jsonb_build_object(
                      'line_code',     line_code,
                      'label',         display_label,
                      'note_no',       note_no,
                      'amount',        amount,
                      'prev_amount',   prev_amount,
                      'current_non_current', cnc
                    ) ORDER BY sort_order
                  )
                ) AS sub_json
              FROM rolled r2
              WHERE r2.section = r.section
              GROUP BY subsection
            ) sub
          )
      ) AS section_json
    FROM rolled r
    GROUP BY section
  ) outer_q;

  RETURN COALESCE(v_result, jsonb_build_object(
    'division', 'Division_II', 'as_of', p_as_of, 'prev_as_of', p_prev_as_of,
    'sections', '[]'::jsonb));
END;
$$;

-- ── 5. Ind AS P&L + OCI RPC ────────────────────────────────────────────────
-- Returns separate sections: P&L, OCI (non-reclassifiable), OCI (reclassifiable),
-- Total Comprehensive Income.
CREATE OR REPLACE FUNCTION get_ind_as_profit_loss_and_oci(
  p_user_id      TEXT,
  p_period_start DATE,
  p_period_end   DATE,
  p_comparative  BOOLEAN DEFAULT FALSE
) RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_result JSONB;
  v_prev_start DATE := (p_period_start - INTERVAL '1 year')::DATE;
  v_prev_end   DATE := (p_period_end   - INTERVAL '1 year')::DATE;
BEGIN
  WITH curr AS (
    SELECT
      l.line_code, l.section, l.subsection, l.ind_as_subsection,
      l.display_label, l.note_no,
      COALESCE(l.ind_as_sort_order, l.sort_order) AS sort_order,
      ROUND(COALESCE(SUM(
        CASE a.account_type
          WHEN 'Income'  THEN COALESCE(jl.credit,0) - COALESCE(jl.debit,0)
          WHEN 'Expense' THEN COALESCE(jl.debit,0)  - COALESCE(jl.credit,0)
        END
      ), 0)::NUMERIC, 2) AS amount
    FROM schedule_iii_lines l
    LEFT JOIN accounts a
           ON a.schedule_iii_line_code = l.line_code
          AND a.user_id = p_user_id
          AND COALESCE(a.is_group, FALSE) = FALSE
    LEFT JOIN journal_lines jl ON jl.account_id = a.id AND jl.user_id = a.user_id
    LEFT JOIN journals j ON j.id = jl.journal_id AND j.status = 'posted'
                        AND j.journal_date BETWEEN p_period_start AND p_period_end
    WHERE l.statement_type = 'PL'
      AND l.ind_as_line_code IS NOT NULL
    GROUP BY l.line_code, l.section, l.subsection, l.ind_as_subsection,
             l.display_label, l.note_no, l.sort_order, l.ind_as_sort_order
  ),
  prev AS (
    SELECT
      l.line_code,
      ROUND(COALESCE(SUM(
        CASE a.account_type
          WHEN 'Income'  THEN COALESCE(jl.credit,0) - COALESCE(jl.debit,0)
          WHEN 'Expense' THEN COALESCE(jl.debit,0)  - COALESCE(jl.credit,0)
        END
      ), 0)::NUMERIC, 2) AS amount
    FROM schedule_iii_lines l
    LEFT JOIN accounts a
           ON a.schedule_iii_line_code = l.line_code
          AND a.user_id = p_user_id
          AND COALESCE(a.is_group, FALSE) = FALSE
    LEFT JOIN journal_lines jl ON jl.account_id = a.id AND jl.user_id = a.user_id
    LEFT JOIN journals j ON j.id = jl.journal_id AND j.status = 'posted'
                        AND j.journal_date BETWEEN v_prev_start AND v_prev_end
    WHERE l.statement_type = 'PL' AND p_comparative
      AND l.ind_as_line_code IS NOT NULL
    GROUP BY l.line_code
  ),
  merged AS (
    SELECT c.*, COALESCE(p.amount, 0) AS prev_amount
      FROM curr c LEFT JOIN prev p ON p.line_code = c.line_code
  ),
  -- Section classification per Ind AS Division II
  classified AS (
    SELECT
      *,
      CASE
        WHEN line_code LIKE 'PL.OCI.NR.%' THEN 'OCI_NON_RECLASSIFIABLE'
        WHEN line_code LIKE 'PL.OCI.R.%'  THEN 'OCI_RECLASSIFIABLE'
        WHEN section = 'INCOME'           THEN 'REVENUE'
        WHEN section = 'EXPENSES' AND line_code <> 'PL.E.8' THEN 'EXPENSES'
        WHEN line_code = 'PL.E.8'         THEN 'TAX'
        ELSE 'OTHER'
      END AS pl_section
    FROM merged
  )
  SELECT jsonb_build_object(
    'division',       'Division_II',
    'period_start',   p_period_start,
    'period_end',     p_period_end,
    'comparative',    p_comparative,
    'prev_start',     v_prev_start,
    'prev_end',       v_prev_end,
    -- Headline numbers
    'total_revenue',          (SELECT COALESCE(SUM(amount),0)      FROM classified WHERE pl_section = 'REVENUE'),
    'total_expenses',         (SELECT COALESCE(SUM(amount),0)      FROM classified WHERE pl_section = 'EXPENSES'),
    'profit_before_tax',
      (SELECT COALESCE(SUM(amount),0) FROM classified WHERE pl_section = 'REVENUE')
      - (SELECT COALESCE(SUM(amount),0) FROM classified WHERE pl_section = 'EXPENSES'),
    'tax_expense',            (SELECT ROUND(COALESCE(SUM(amount),0)::NUMERIC,2) FROM classified WHERE pl_section = 'TAX'),
    'profit_after_tax',
      (SELECT COALESCE(SUM(amount),0) FROM classified WHERE pl_section IN ('REVENUE'))
      - (SELECT COALESCE(SUM(amount),0) FROM classified WHERE pl_section IN ('EXPENSES','TAX')),
    -- OCI totals
    'oci_non_reclassifiable_total', (SELECT COALESCE(SUM(amount),0) FROM classified WHERE pl_section = 'OCI_NON_RECLASSIFIABLE'),
    'oci_reclassifiable_total',     (SELECT COALESCE(SUM(amount),0) FROM classified WHERE pl_section = 'OCI_RECLASSIFIABLE'),
    'total_oci',
      (SELECT COALESCE(SUM(amount),0) FROM classified WHERE pl_section IN ('OCI_NON_RECLASSIFIABLE','OCI_RECLASSIFIABLE')),
    -- Total Comprehensive Income
    'total_comprehensive_income',
      (
        (SELECT COALESCE(SUM(amount),0) FROM classified WHERE pl_section IN ('REVENUE'))
        - (SELECT COALESCE(SUM(amount),0) FROM classified WHERE pl_section IN ('EXPENSES','TAX'))
        + (SELECT COALESCE(SUM(amount),0) FROM classified WHERE pl_section IN ('OCI_NON_RECLASSIFIABLE','OCI_RECLASSIFIABLE'))
      ),
    -- Per-line detail grouped
    'profit_loss_lines', (
      SELECT jsonb_agg(jsonb_build_object(
        'line_code', line_code, 'section', section, 'subsection', subsection,
        'label', display_label, 'note_no', note_no,
        'amount', amount, 'prev_amount', prev_amount
      ) ORDER BY sort_order)
      FROM classified
      WHERE pl_section IN ('REVENUE','EXPENSES','TAX')
    ),
    'oci_lines', (
      SELECT jsonb_agg(jsonb_build_object(
        'line_code', line_code, 'classification', pl_section,
        'label', display_label, 'note_no', note_no,
        'amount', amount, 'prev_amount', prev_amount
      ) ORDER BY sort_order)
      FROM classified
      WHERE pl_section IN ('OCI_NON_RECLASSIFIABLE','OCI_RECLASSIFIABLE')
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ── 6. Auto-add OCI note to Notes to Accounts when Division II is active ───
CREATE OR REPLACE FUNCTION generate_oci_disclosure_note(p_user_id TEXT, p_fy TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO accounting_notes (user_id, fiscal_year, note_no, title, category, auto_body, display_order)
  VALUES (
    p_user_id, p_fy, '35', 'Other Comprehensive Income (Ind AS)', 'accounting_policy',
    E'### Items that will not be reclassified to Profit & Loss\n'
    '- **Re-measurements of defined benefit plans**: actuarial gains/losses on gratuity and similar plans, recognised in OCI per Ind AS 19.\n'
    '- **Equity instruments designated at FVOCI**: fair-value movements on equity investments where the irrevocable election to present in OCI has been made (Ind AS 109).\n'
    '- **Revaluation surplus on PPE**: gains on revaluation of property, plant & equipment recognised in OCI per Ind AS 16.\n\n'
    '### Items that may be reclassified to Profit & Loss\n'
    '- **Debt instruments at FVOCI**: fair-value movements on debt instruments held under the business model "hold to collect and sell" (Ind AS 109).\n'
    '- **Foreign currency translation reserve**: exchange differences on translating financial statements of foreign operations (Ind AS 21).\n'
    '- **Cash flow hedge reserve**: effective portion of changes in fair value of derivatives designated as cash flow hedges (Ind AS 109).\n\n'
    'Movement in each OCI component is presented under Other Equity in the Statement of Changes in Equity, and the closing balance flows into the "OCI Reserve" line under Equity.',
    35
  )
  ON CONFLICT (user_id, fiscal_year, note_no) DO UPDATE
    SET auto_body = EXCLUDED.auto_body, updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION get_ind_as_balance_sheet(TEXT, DATE, DATE)             TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_ind_as_profit_loss_and_oci(TEXT, DATE, DATE, BOOLEAN) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION generate_oci_disclosure_note(TEXT, TEXT)               TO authenticated, anon;
