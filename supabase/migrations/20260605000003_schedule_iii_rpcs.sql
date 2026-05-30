-- ============================================================================
-- PHASE 10 — SCHEDULE III PERIOD-AWARE RPCS
-- ----------------------------------------------------------------------------
-- get_schedule_iii_balance_sheet(user, as_of_date)
-- get_schedule_iii_profit_loss(user, period_start, period_end, comparative)
-- get_fixed_asset_schedule(user, fy_start, fy_end)
-- Returns nested JSON the React UI can render directly into Schedule III
-- statements with drilldown support (account_count + line_code preserved).
-- ============================================================================

-- ── 1. BALANCE SHEET RPC (as-of-date) ───────────────────────────────────────
CREATE OR REPLACE FUNCTION get_schedule_iii_balance_sheet(
  p_user_id   TEXT,
  p_as_of     DATE DEFAULT CURRENT_DATE
) RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH bal AS (
    SELECT
      a.user_id,
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
    LEFT JOIN journal_lines jl
           ON jl.account_id = a.id AND jl.user_id = a.user_id
    LEFT JOIN journals j
           ON j.id = jl.journal_id
          AND j.status = 'posted'
          AND j.journal_date <= p_as_of
    WHERE a.user_id = p_user_id
      AND COALESCE(a.is_group, FALSE) = FALSE
      AND a.schedule_iii_line_code IS NOT NULL
    GROUP BY a.user_id, a.schedule_iii_line_code, a.account_type
  ),
  retained AS (
    -- Net P&L (Income − Expense) flows to Reserves & Surplus
    SELECT 'BS.E.2' AS line_code, COALESCE(SUM(
      CASE WHEN account_type IN ('Income') THEN amount ELSE 0 END
      -
      CASE WHEN account_type IN ('Expense') THEN amount ELSE 0 END
    ), 0) AS amount
    FROM bal
  ),
  bs_lines AS (
    SELECT l.line_code, l.section, l.subsection, l.current_non_current,
           l.display_label, l.note_no, l.sort_order,
           COALESCE(b.amount, 0) AS amount
      FROM schedule_iii_lines l
      LEFT JOIN bal b ON b.line_code = l.line_code AND b.account_type IN ('Asset','Liability','Equity')
     WHERE l.statement_type = 'BS'

    UNION ALL
    -- Add retained earnings on top of any explicit Reserves & Surplus tagging
    SELECT l.line_code, l.section, l.subsection, l.current_non_current,
           l.display_label, l.note_no, l.sort_order,
           COALESCE(r.amount, 0) AS amount
      FROM schedule_iii_lines l
      JOIN retained r ON r.line_code = l.line_code
     WHERE l.line_code = 'BS.E.2'
  ),
  rolled AS (
    SELECT line_code, MIN(section) section, MIN(subsection) subsection,
           MIN(current_non_current) cnc, MIN(display_label) display_label,
           MIN(note_no) note_no, MIN(sort_order) sort_order,
           ROUND(SUM(amount)::NUMERIC, 2) AS amount
      FROM bs_lines GROUP BY line_code
  )
  SELECT jsonb_build_object(
    'as_of', p_as_of,
    'sections', jsonb_agg(section_json ORDER BY section_order)
  ) INTO v_result
  FROM (
    SELECT
      section,
      MIN(sort_order) AS section_order,
      jsonb_build_object(
        'section', section,
        'total',   ROUND(SUM(amount)::NUMERIC, 2),
        'subsections',
        (
          SELECT jsonb_agg(sub_json ORDER BY sub_order)
          FROM (
            SELECT subsection,
                   MIN(sort_order) AS sub_order,
                   jsonb_build_object(
                     'subsection', subsection,
                     'current_non_current', MIN(cnc),
                     'total', ROUND(SUM(amount)::NUMERIC, 2),
                     'lines', jsonb_agg(
                       jsonb_build_object(
                         'line_code',     line_code,
                         'label',         display_label,
                         'note_no',       note_no,
                         'amount',        amount,
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

  RETURN COALESCE(v_result, jsonb_build_object('as_of', p_as_of, 'sections', '[]'::jsonb));
END;
$$;

-- ── 2. PROFIT & LOSS RPC (period range with optional comparative) ──────────
CREATE OR REPLACE FUNCTION get_schedule_iii_profit_loss(
  p_user_id      TEXT,
  p_period_start DATE,
  p_period_end   DATE,
  p_comparative  BOOLEAN DEFAULT FALSE
) RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_result  JSONB;
  v_prev_start DATE := (p_period_start - INTERVAL '1 year')::DATE;
  v_prev_end   DATE := (p_period_end   - INTERVAL '1 year')::DATE;
BEGIN
  WITH curr AS (
    SELECT
      l.line_code, l.section, l.subsection, l.display_label,
      l.note_no, l.sort_order,
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
    LEFT JOIN journal_lines jl
           ON jl.account_id = a.id AND jl.user_id = a.user_id
    LEFT JOIN journals j
           ON j.id = jl.journal_id
          AND j.status = 'posted'
          AND j.journal_date BETWEEN p_period_start AND p_period_end
    WHERE l.statement_type = 'PL'
    GROUP BY l.line_code, l.section, l.subsection, l.display_label, l.note_no, l.sort_order
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
    LEFT JOIN journal_lines jl
           ON jl.account_id = a.id AND jl.user_id = a.user_id
    LEFT JOIN journals j
           ON j.id = jl.journal_id
          AND j.status = 'posted'
          AND j.journal_date BETWEEN v_prev_start AND v_prev_end
    WHERE l.statement_type = 'PL' AND p_comparative
    GROUP BY l.line_code
  ),
  merged AS (
    SELECT c.*, COALESCE(p.amount, 0) AS prev_amount
      FROM curr c LEFT JOIN prev p ON p.line_code = c.line_code
  )
  SELECT jsonb_build_object(
    'period_start',   p_period_start,
    'period_end',     p_period_end,
    'comparative',    p_comparative,
    'prev_start',     v_prev_start,
    'prev_end',       v_prev_end,
    'total_revenue',          (SELECT ROUND(COALESCE(SUM(amount),0)::NUMERIC,2)      FROM merged WHERE section = 'INCOME'),
    'total_revenue_prev',     (SELECT ROUND(COALESCE(SUM(prev_amount),0)::NUMERIC,2) FROM merged WHERE section = 'INCOME'),
    'total_expenses',         (SELECT ROUND(COALESCE(SUM(amount),0)::NUMERIC,2)      FROM merged WHERE section = 'EXPENSES' AND line_code <> 'PL.E.8'),
    'total_expenses_prev',    (SELECT ROUND(COALESCE(SUM(prev_amount),0)::NUMERIC,2) FROM merged WHERE section = 'EXPENSES' AND line_code <> 'PL.E.8'),
    'profit_before_tax',
      (SELECT COALESCE(SUM(amount),0) FROM merged WHERE section = 'INCOME')
      - (SELECT COALESCE(SUM(amount),0) FROM merged WHERE section = 'EXPENSES' AND line_code <> 'PL.E.8'),
    'tax_expense',            (SELECT ROUND(COALESCE(SUM(amount),0)::NUMERIC,2)      FROM merged WHERE line_code = 'PL.E.8'),
    'profit_after_tax',
      (SELECT COALESCE(SUM(amount),0) FROM merged WHERE section = 'INCOME')
      - (SELECT COALESCE(SUM(amount),0) FROM merged WHERE section = 'EXPENSES'),
    'lines', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'line_code',   line_code,
          'section',     section,
          'subsection',  subsection,
          'label',       display_label,
          'note_no',     note_no,
          'amount',      amount,
          'prev_amount', prev_amount
        ) ORDER BY sort_order
      )
      FROM merged
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ── 3. FIXED ASSET SCHEDULE RPC (FY-bound) ─────────────────────────────────
-- Returns category-wise movement for the financial year, plus per-asset rows.
CREATE OR REPLACE FUNCTION get_fixed_asset_schedule(
  p_user_id  TEXT,
  p_fy_start DATE,
  p_fy_end   DATE
) RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH categorised AS (
    SELECT
      COALESCE(category_name, 'Uncategorised') AS category,
      -- Opening = capitalised before FY start
      SUM(CASE WHEN COALESCE(capitalised_on, purchase_date) < p_fy_start
               THEN total_capitalised_value ELSE 0 END) AS opening_gross,
      -- Additions during FY
      SUM(CASE WHEN COALESCE(capitalised_on, purchase_date) BETWEEN p_fy_start AND p_fy_end
               THEN total_capitalised_value ELSE 0 END) AS additions,
      -- Disposals during FY (at gross block)
      SUM(CASE WHEN status = 'disposed' AND disposed_at BETWEEN p_fy_start AND p_fy_end
               THEN total_capitalised_value ELSE 0 END) AS disposals_gross,
      SUM(CASE WHEN status = 'disposed' AND disposed_at BETWEEN p_fy_start AND p_fy_end
               THEN COALESCE(disposal_amount,0) ELSE 0 END) AS disposal_proceeds,
      -- Accumulated dep (current)
      SUM(accumulated_depreciation) AS accum_dep,
      -- Net block
      SUM(book_value) AS closing_net,
      COUNT(*) AS asset_count
    FROM fixed_assets
    WHERE user_id = p_user_id
    GROUP BY COALESCE(category_name, 'Uncategorised')
  )
  SELECT jsonb_build_object(
    'fy_start',          p_fy_start,
    'fy_end',            p_fy_end,
    'total_opening',     ROUND(COALESCE(SUM(opening_gross),0)::NUMERIC,2),
    'total_additions',   ROUND(COALESCE(SUM(additions),0)::NUMERIC,2),
    'total_disposals',   ROUND(COALESCE(SUM(disposals_gross),0)::NUMERIC,2),
    'total_proceeds',    ROUND(COALESCE(SUM(disposal_proceeds),0)::NUMERIC,2),
    'total_accum_dep',   ROUND(COALESCE(SUM(accum_dep),0)::NUMERIC,2),
    'total_closing_net', ROUND(COALESCE(SUM(closing_net),0)::NUMERIC,2),
    'by_category', jsonb_agg(
      jsonb_build_object(
        'category',          category,
        'asset_count',       asset_count,
        'opening_gross',     ROUND(opening_gross::NUMERIC,2),
        'additions',         ROUND(additions::NUMERIC,2),
        'disposals_gross',   ROUND(disposals_gross::NUMERIC,2),
        'closing_gross',     ROUND((opening_gross + additions - disposals_gross)::NUMERIC,2),
        'accumulated_dep',   ROUND(accum_dep::NUMERIC,2),
        'closing_net_block', ROUND(closing_net::NUMERIC,2)
      ) ORDER BY category
    )
  ) INTO v_result
  FROM categorised;

  RETURN COALESCE(v_result, jsonb_build_object(
    'fy_start', p_fy_start, 'fy_end', p_fy_end,
    'total_opening', 0, 'total_additions', 0, 'total_disposals', 0,
    'total_proceeds', 0, 'total_accum_dep', 0, 'total_closing_net', 0,
    'by_category', '[]'::jsonb
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION get_schedule_iii_balance_sheet(TEXT, DATE) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_schedule_iii_profit_loss(TEXT, DATE, DATE, BOOLEAN) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_fixed_asset_schedule(TEXT, DATE, DATE) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION validate_schedule_iii_integrity(TEXT) TO authenticated, anon;
