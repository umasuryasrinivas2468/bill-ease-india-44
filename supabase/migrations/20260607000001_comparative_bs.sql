-- ============================================================================
-- PHASE 12 — COMPARATIVE BALANCE SHEET
-- ----------------------------------------------------------------------------
-- Replaces get_schedule_iii_balance_sheet with a version that also accepts an
-- optional previous-period as-of-date. Each line returns both current and
-- previous amounts so the UI can render side-by-side comparative columns.
-- Period-end totals + sectional rollups follow the same convention.
-- ============================================================================

DROP FUNCTION IF EXISTS get_schedule_iii_balance_sheet(TEXT, DATE);

CREATE OR REPLACE FUNCTION get_schedule_iii_balance_sheet(
  p_user_id    TEXT,
  p_as_of      DATE DEFAULT CURRENT_DATE,
  p_prev_as_of DATE DEFAULT NULL          -- NULL = no comparative column
) RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH
  -- Current-period balances per Schedule III line + account type
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
           COALESCE(SUM(
             CASE WHEN account_type = 'Income' THEN amount
                  WHEN account_type = 'Expense' THEN -amount
                  ELSE 0 END
           ), 0) AS amount
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
           COALESCE(SUM(
             CASE WHEN account_type = 'Income' THEN amount
                  WHEN account_type = 'Expense' THEN -amount
                  ELSE 0 END
           ), 0) AS amount
    FROM prev_bal
  ),
  -- Combine BS-tagged accounts with retained-earnings injection on BS.E.2
  cur_bs AS (
    SELECT line_code, amount FROM cur_bal WHERE account_type IN ('Asset','Liability','Equity')
    UNION ALL SELECT line_code, amount FROM cur_ret
  ),
  prev_bs AS (
    SELECT line_code, amount FROM prev_bal WHERE account_type IN ('Asset','Liability','Equity')
    UNION ALL SELECT line_code, amount FROM prev_ret
  ),
  cur_per_line AS (
    SELECT line_code, ROUND(SUM(amount)::NUMERIC, 2) AS amount FROM cur_bs GROUP BY line_code
  ),
  prev_per_line AS (
    SELECT line_code, ROUND(SUM(amount)::NUMERIC, 2) AS amount FROM prev_bs GROUP BY line_code
  ),
  rolled AS (
    SELECT
      l.line_code, l.section, l.subsection, l.current_non_current AS cnc,
      l.display_label, l.note_no, l.sort_order,
      COALESCE(c.amount, 0) AS amount,
      CASE WHEN p_prev_as_of IS NOT NULL THEN COALESCE(p.amount, 0) ELSE NULL END AS prev_amount
    FROM schedule_iii_lines l
    LEFT JOIN cur_per_line  c ON c.line_code  = l.line_code
    LEFT JOIN prev_per_line p ON p.line_code  = l.line_code
    WHERE l.statement_type = 'BS'
  )
  SELECT jsonb_build_object(
    'as_of',          p_as_of,
    'prev_as_of',     p_prev_as_of,
    'comparative',    (p_prev_as_of IS NOT NULL),
    'sections', jsonb_agg(section_json ORDER BY section_order)
  ) INTO v_result
  FROM (
    SELECT
      section,
      MIN(sort_order) AS section_order,
      jsonb_build_object(
        'section',      section,
        'total',        ROUND(SUM(amount)::NUMERIC, 2),
        'prev_total',   CASE WHEN p_prev_as_of IS NOT NULL THEN ROUND(SUM(prev_amount)::NUMERIC, 2) ELSE NULL END,
        'subsections',
        (
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
                    'line_code',           line_code,
                    'label',               display_label,
                    'note_no',             note_no,
                    'amount',              amount,
                    'prev_amount',         prev_amount,
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

  RETURN COALESCE(v_result, jsonb_build_object('as_of', p_as_of, 'prev_as_of', p_prev_as_of, 'sections', '[]'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION get_schedule_iii_balance_sheet(TEXT, DATE, DATE) TO authenticated, anon;
