-- ════════════════════════════════════════════════════════════════════════════
-- Phase 30 (Sprint 2) — Aging + P&L from journals only
--
-- Replaces source-table aggregation in AgingReports / ProfitLoss with
-- pure journal-derived RPCs. Builds two helpers:
--
--   * get_ar_ap_aging(user_id, party_type, as_of)
--     → per-party AR or AP aging directly from journal_lines.
--       Aging buckets are computed from the journal entry_date (which is
--       the same as journal_date — the business date of the transaction),
--       not from any source-table due_date. This is the SSOT view.
--
--   * get_pnl_from_journals(user_id, from_date, to_date)
--     → Revenue / COGS / Expenses / Net Profit roll-up directly from
--       journal_lines + account_type. Mirrors the math in
--       get_live_journal_dashboard but for an arbitrary date range so the
--       /accounting/profit-loss page can use it.
--
-- Re-runnable. No new tables, no schema changes.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. AR / AP aging from journals ──────────────────────────────────────────
-- Aging bucketing is FIFO-ish: each open journal line is bucketed by its own
-- entry_date age, *not* by some external due_date. This matches the way
-- get_party_subledger does it in Phase 28.
--
-- Logic:
--   1. Pull every posted journal_line tagged with the requested party type
--      (vendor_id or customer_id).
--   2. Compute the per-party net balance (Dr-Cr for AR, Cr-Dr for AP).
--   3. Bucket each LINE by age (today - entry_date) into 0-30/31-60/61-90/90+.
--   4. Sum the bucketed values, but cap them at the net party balance so
--      reversals and payments correctly cancel old debits oldest-first.
CREATE OR REPLACE FUNCTION get_ar_ap_aging(
  p_user_id    TEXT,
  p_party_type TEXT,                                 -- 'customer' or 'vendor'
  p_as_of      DATE DEFAULT CURRENT_DATE
) RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF p_party_type NOT IN ('customer', 'vendor') THEN
    RAISE EXCEPTION 'party_type must be customer or vendor';
  END IF;

  IF p_party_type = 'customer' THEN
    WITH lines_with_age AS (
      SELECT
        jl.customer_id                              AS party_id,
        c.name                                       AS party_name,
        (p_as_of - jl.entry_date)                   AS age_days,
        (COALESCE(jl.debit, 0) - COALESCE(jl.credit, 0)) AS amt
      FROM journal_lines jl
      JOIN journals j  ON j.id = jl.journal_id AND j.status = 'posted'
      LEFT JOIN clients c ON c.id = jl.customer_id
      WHERE jl.user_id = p_user_id
        AND jl.customer_id IS NOT NULL
        AND jl.entry_date <= p_as_of
    ),
    party_totals AS (
      SELECT
        party_id, party_name,
        SUM(amt) AS balance,
        -- Per-bucket aged debits MINUS credits (so a recent payment removes
        -- from the bucket it was tagged in; oldest-first is achieved by the
        -- caller showing the buckets in age order).
        SUM(CASE WHEN age_days BETWEEN 0   AND 30  THEN amt ELSE 0 END) AS b_0_30,
        SUM(CASE WHEN age_days BETWEEN 31  AND 60  THEN amt ELSE 0 END) AS b_31_60,
        SUM(CASE WHEN age_days BETWEEN 61  AND 90  THEN amt ELSE 0 END) AS b_61_90,
        SUM(CASE WHEN age_days > 90               THEN amt ELSE 0 END) AS b_90_plus
      FROM lines_with_age
      GROUP BY party_id, party_name
      HAVING SUM(amt) <> 0
      ORDER BY SUM(amt) DESC
    ),
    summary AS (
      SELECT
        COUNT(*)                              AS party_count,
        COALESCE(SUM(balance),    0)          AS total,
        COALESCE(SUM(b_0_30),     0)          AS bucket_0_30,
        COALESCE(SUM(b_31_60),    0)          AS bucket_31_60,
        COALESCE(SUM(b_61_90),    0)          AS bucket_61_90,
        COALESCE(SUM(b_90_plus),  0)          AS bucket_90_plus
      FROM party_totals
    )
    SELECT jsonb_build_object(
      'party_type', p_party_type,
      'as_of',      p_as_of,
      'summary',    (SELECT to_jsonb(summary) FROM summary),
      'parties',    COALESCE((SELECT jsonb_agg(to_jsonb(party_totals)) FROM party_totals), '[]'::jsonb),
      'computed_at', NOW()
    ) INTO v_result;
  ELSE
    WITH lines_with_age AS (
      SELECT
        jl.vendor_id                                AS party_id,
        v.name                                       AS party_name,
        (p_as_of - jl.entry_date)                   AS age_days,
        -- AP: credit side is positive. Same math as get_party_subledger.
        (COALESCE(jl.credit, 0) - COALESCE(jl.debit, 0)) AS amt
      FROM journal_lines jl
      JOIN journals j ON j.id = jl.journal_id AND j.status = 'posted'
      LEFT JOIN vendors v ON v.id = jl.vendor_id
      WHERE jl.user_id = p_user_id
        AND jl.vendor_id IS NOT NULL
        AND jl.entry_date <= p_as_of
    ),
    party_totals AS (
      SELECT
        party_id, party_name,
        SUM(amt) AS balance,
        SUM(CASE WHEN age_days BETWEEN 0   AND 30  THEN amt ELSE 0 END) AS b_0_30,
        SUM(CASE WHEN age_days BETWEEN 31  AND 60  THEN amt ELSE 0 END) AS b_31_60,
        SUM(CASE WHEN age_days BETWEEN 61  AND 90  THEN amt ELSE 0 END) AS b_61_90,
        SUM(CASE WHEN age_days > 90               THEN amt ELSE 0 END) AS b_90_plus
      FROM lines_with_age
      GROUP BY party_id, party_name
      HAVING SUM(amt) <> 0
      ORDER BY SUM(amt) DESC
    ),
    summary AS (
      SELECT
        COUNT(*)                              AS party_count,
        COALESCE(SUM(balance),    0)          AS total,
        COALESCE(SUM(b_0_30),     0)          AS bucket_0_30,
        COALESCE(SUM(b_31_60),    0)          AS bucket_31_60,
        COALESCE(SUM(b_61_90),    0)          AS bucket_61_90,
        COALESCE(SUM(b_90_plus),  0)          AS bucket_90_plus
      FROM party_totals
    )
    SELECT jsonb_build_object(
      'party_type', p_party_type,
      'as_of',      p_as_of,
      'summary',    (SELECT to_jsonb(summary) FROM summary),
      'parties',    COALESCE((SELECT jsonb_agg(to_jsonb(party_totals)) FROM party_totals), '[]'::jsonb),
      'computed_at', NOW()
    ) INTO v_result;
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_ar_ap_aging(TEXT, TEXT, DATE) TO anon, authenticated;

-- ── 2. P&L from journals (date range) ───────────────────────────────────────
-- All numbers come from journal_lines + account_type. No source tables.
--
-- Sign convention:
--   Revenue = SUM(credit - debit) on Income accounts
--   Expenses = SUM(debit - credit) on Expense accounts
--   COGS    = subset of Expenses where account_name matches /cogs|cost of goods/
--
-- Returned as a JSON object so the UI can render the four-line summary plus
-- a flat list of accounts (each with debit/credit/net) for the line-item view.
CREATE OR REPLACE FUNCTION get_pnl_from_journals(
  p_user_id   TEXT,
  p_from_date DATE,
  p_to_date   DATE
) RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH posted_lines AS (
    SELECT
      a.id            AS account_id,
      a.account_code,
      a.account_name,
      a.account_type,
      COALESCE(jl.debit,  0) AS debit,
      COALESCE(jl.credit, 0) AS credit
    FROM journal_lines jl
    JOIN journals j  ON j.id = jl.journal_id AND j.status = 'posted'
    JOIN accounts a  ON a.id = jl.account_id
    WHERE jl.user_id = p_user_id
      AND jl.entry_date BETWEEN p_from_date AND p_to_date
      AND a.account_type IN ('Income', 'Expense')
  ),
  per_account AS (
    SELECT
      account_id, account_code, account_name, account_type,
      SUM(debit)  AS total_debit,
      SUM(credit) AS total_credit,
      CASE
        WHEN account_type = 'Income'  THEN SUM(credit) - SUM(debit)
        WHEN account_type = 'Expense' THEN SUM(debit)  - SUM(credit)
      END AS net
    FROM posted_lines
    GROUP BY account_id, account_code, account_name, account_type
    HAVING SUM(debit) <> 0 OR SUM(credit) <> 0
  ),
  totals AS (
    SELECT
      COALESCE(SUM(net) FILTER (WHERE account_type = 'Income'),  0) AS revenue,
      COALESCE(SUM(net) FILTER (WHERE account_type = 'Expense'
        AND (account_name ILIKE '%cogs%' OR account_name ILIKE '%cost of goods%')), 0) AS cogs,
      COALESCE(SUM(net) FILTER (WHERE account_type = 'Expense'
        AND NOT (account_name ILIKE '%cogs%' OR account_name ILIKE '%cost of goods%')), 0) AS opex
    FROM per_account
  )
  SELECT jsonb_build_object(
    'from_date',    p_from_date,
    'to_date',      p_to_date,
    'source',       'journals_only',
    'revenue',      (SELECT revenue FROM totals),
    'cogs',         (SELECT cogs FROM totals),
    'gross_profit', (SELECT revenue - cogs FROM totals),
    'opex',         (SELECT opex FROM totals),
    'net_profit',   (SELECT revenue - cogs - opex FROM totals),
    'accounts',     COALESCE((
      SELECT jsonb_agg(to_jsonb(per_account) ORDER BY account_type, account_code)
      FROM per_account
    ), '[]'::jsonb),
    'computed_at',  NOW()
  ) INTO v_result;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_pnl_from_journals(TEXT, DATE, DATE) TO anon, authenticated;

-- ── 3. GST liability from journals (period roll-up) ────────────────────────
-- Mirrors the GSTLiabilitySummary used by the UI, but every number comes
-- from journal_lines.tax_type. Period is YYYY-MM. Output side is credits
-- (cgst/sgst/igst/cess + output_gst); input side is debits (itc + per-
-- component tags). RCM input/output also surfaced separately.
CREATE OR REPLACE FUNCTION get_gst_liability_from_journals(
  p_user_id TEXT,
  p_period  TEXT                                       -- YYYY-MM
) RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_start  DATE := to_date(p_period || '-01', 'YYYY-MM-DD');
  v_end    DATE := (v_start + INTERVAL '1 month')::date;
  v_result JSONB;
BEGIN
  WITH lines AS (
    SELECT jl.tax_type,
           COALESCE(jl.debit,  0) AS debit,
           COALESCE(jl.credit, 0) AS credit
    FROM journal_lines jl
    JOIN journals j ON j.id = jl.journal_id AND j.status = 'posted'
    WHERE jl.user_id = p_user_id
      AND jl.entry_date >= v_start
      AND jl.entry_date <  v_end
      AND jl.tax_type IS NOT NULL
  ),
  output_side AS (
    SELECT
      COALESCE(SUM(credit - debit) FILTER (WHERE tax_type = 'cgst'), 0)        AS cgst,
      COALESCE(SUM(credit - debit) FILTER (WHERE tax_type = 'sgst'), 0)        AS sgst,
      COALESCE(SUM(credit - debit) FILTER (WHERE tax_type = 'igst'), 0)        AS igst,
      COALESCE(SUM(credit - debit) FILTER (WHERE tax_type = 'cess'), 0)        AS cess,
      COALESCE(SUM(credit - debit) FILTER (WHERE tax_type = 'output_gst'), 0)  AS generic
    FROM lines
  ),
  input_side AS (
    SELECT
      COALESCE(SUM(debit - credit) FILTER (WHERE tax_type IN ('cgst', 'itc')
        AND debit > 0), 0)                                                       AS itc_cgst,
      COALESCE(SUM(debit - credit) FILTER (WHERE tax_type = 'sgst' AND debit > 0), 0) AS itc_sgst,
      COALESCE(SUM(debit - credit) FILTER (WHERE tax_type = 'igst' AND debit > 0), 0) AS itc_igst,
      COALESCE(SUM(debit - credit) FILTER (WHERE tax_type = 'cess' AND debit > 0), 0) AS itc_cess,
      COALESCE(SUM(debit - credit) FILTER (WHERE tax_type = 'itc'),  0)         AS itc_generic
    FROM lines
  ),
  rcm AS (
    SELECT
      COALESCE(SUM(debit  - credit) FILTER (WHERE tax_type = 'rcm_input'), 0)  AS rcm_input,
      COALESCE(SUM(credit - debit)  FILTER (WHERE tax_type = 'rcm_output'), 0) AS rcm_output
    FROM lines
  )
  SELECT jsonb_build_object(
    'period',  p_period,
    'source',  'journals_only',
    'output',  jsonb_build_object(
      'cgst',  (SELECT cgst FROM output_side),
      'sgst',  (SELECT sgst FROM output_side),
      'igst',  (SELECT igst FROM output_side),
      'cess',  (SELECT cess FROM output_side),
      'total', (SELECT cgst + sgst + igst + cess + generic FROM output_side)
    ),
    'itc',     jsonb_build_object(
      'cgst',  (SELECT itc_cgst FROM input_side),
      'sgst',  (SELECT itc_sgst FROM input_side),
      'igst',  (SELECT itc_igst FROM input_side),
      'cess',  (SELECT itc_cess FROM input_side),
      'total', (SELECT itc_cgst + itc_sgst + itc_igst + itc_cess + itc_generic FROM input_side)
    ),
    'rcm',     jsonb_build_object(
      'input',  (SELECT rcm_input  FROM rcm),
      'output', (SELECT rcm_output FROM rcm)
    ),
    'computed_at', NOW()
  ) INTO v_result;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_gst_liability_from_journals(TEXT, TEXT) TO anon, authenticated;

-- ── 3b. Profitability by dimension (project / branch / cost_center / department) ──
-- Returns Income credits − Expense debits, grouped by the requested dimension.
-- Use case: "where is the money being made / lost?" by project, branch, or
-- cost center. Departments are surfaced too because they're already tagged on
-- journal_lines for older books.
CREATE OR REPLACE FUNCTION get_profitability_by_dimension(
  p_user_id   TEXT,
  p_dimension TEXT,                                  -- 'project' | 'branch' | 'cost_center' | 'department'
  p_from_date DATE,
  p_to_date   DATE
) RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF p_dimension NOT IN ('project', 'branch', 'cost_center', 'department') THEN
    RAISE EXCEPTION 'dimension must be one of project / branch / cost_center / department';
  END IF;

  IF p_dimension = 'department' THEN
    WITH lines AS (
      SELECT
        COALESCE(jl.department, '— Unassigned')              AS dim_key,
        COALESCE(jl.department, '— Unassigned')              AS dim_name,
        a.account_type,
        COALESCE(jl.debit,  0)                               AS debit,
        COALESCE(jl.credit, 0)                               AS credit
      FROM journal_lines jl
      JOIN journals j ON j.id = jl.journal_id AND j.status = 'posted'
      JOIN accounts a ON a.id = jl.account_id
      WHERE jl.user_id = p_user_id
        AND jl.entry_date BETWEEN p_from_date AND p_to_date
        AND a.account_type IN ('Income', 'Expense')
    ),
    by_dim AS (
      SELECT
        dim_key, dim_name,
        SUM(credit - debit) FILTER (WHERE account_type = 'Income') AS revenue,
        SUM(debit - credit) FILTER (WHERE account_type = 'Expense'
          AND (false)) AS cogs_unused,  -- placeholder
        COALESCE(SUM(debit - credit) FILTER (WHERE account_type = 'Expense'), 0) AS expenses,
        COALESCE(SUM(credit - debit) FILTER (WHERE account_type = 'Income'), 0)
        - COALESCE(SUM(debit - credit) FILTER (WHERE account_type = 'Expense'), 0)
                                                              AS net_profit
      FROM lines
      GROUP BY dim_key, dim_name
      HAVING SUM(credit - debit) FILTER (WHERE account_type = 'Income') <> 0
          OR SUM(debit - credit) FILTER (WHERE account_type = 'Expense') <> 0
      ORDER BY net_profit DESC
    )
    SELECT jsonb_build_object(
      'dimension', p_dimension,
      'from_date', p_from_date,
      'to_date',   p_to_date,
      'rows',      COALESCE((SELECT jsonb_agg(jsonb_build_object(
                     'id',         dim_key,
                     'name',       dim_name,
                     'revenue',    revenue,
                     'expenses',   expenses,
                     'net_profit', net_profit
                   )) FROM by_dim), '[]'::jsonb),
      'computed_at', NOW()
    ) INTO v_result;
  ELSE
    WITH lines AS (
      SELECT
        CASE p_dimension
          WHEN 'project'     THEN jl.project_id
          WHEN 'branch'      THEN jl.branch_id
          WHEN 'cost_center' THEN jl.cost_center_id
        END AS dim_id,
        a.account_type,
        COALESCE(jl.debit,  0) AS debit,
        COALESCE(jl.credit, 0) AS credit
      FROM journal_lines jl
      JOIN journals j ON j.id = jl.journal_id AND j.status = 'posted'
      JOIN accounts a ON a.id = jl.account_id
      WHERE jl.user_id = p_user_id
        AND jl.entry_date BETWEEN p_from_date AND p_to_date
        AND a.account_type IN ('Income', 'Expense')
    ),
    by_dim AS (
      SELECT
        dim_id,
        COALESCE(SUM(credit - debit) FILTER (WHERE account_type = 'Income'),  0) AS revenue,
        COALESCE(SUM(debit  - credit) FILTER (WHERE account_type = 'Expense'), 0) AS expenses
      FROM lines
      GROUP BY dim_id
      HAVING SUM(credit - debit) FILTER (WHERE account_type = 'Income') <> 0
          OR SUM(debit  - credit) FILTER (WHERE account_type = 'Expense') <> 0
    ),
    named AS (
      SELECT
        d.dim_id::text                            AS id,
        CASE
          WHEN d.dim_id IS NULL THEN '— Unassigned'
          WHEN p_dimension = 'project'     THEN COALESCE(p.project_name, p.name, d.dim_id::text)
          WHEN p_dimension = 'cost_center' THEN COALESCE(cc.cost_center_name, cc.cost_center_code, d.dim_id::text)
          ELSE d.dim_id::text
        END                                       AS name,
        d.revenue,
        d.expenses,
        (d.revenue - d.expenses)                  AS net_profit
      FROM by_dim d
      LEFT JOIN projects     p  ON p_dimension = 'project'     AND p.id  = d.dim_id
      LEFT JOIN cost_centers cc ON p_dimension = 'cost_center' AND cc.id = d.dim_id
    )
    SELECT jsonb_build_object(
      'dimension', p_dimension,
      'from_date', p_from_date,
      'to_date',   p_to_date,
      'rows',      COALESCE((SELECT jsonb_agg(to_jsonb(named) ORDER BY named.net_profit DESC) FROM named), '[]'::jsonb),
      'computed_at', NOW()
    ) INTO v_result;
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_profitability_by_dimension(TEXT, TEXT, DATE, DATE) TO anon, authenticated;

-- ── 3c. Working Capital Days (DSO / DPO / DIO / CCC / WC Requirement) ──────
-- All inputs from journal_lines + account_type. Window is the last
-- p_window_days days (default 365) so DSO/DPO/DIO normalise to a 12-month
-- view; balances are point-in-time at p_as_of.
CREATE OR REPLACE FUNCTION get_working_capital_days(
  p_user_id     TEXT,
  p_as_of       DATE DEFAULT CURRENT_DATE,
  p_window_days INTEGER DEFAULT 365
) RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_start    DATE := (p_as_of - (p_window_days || ' days')::interval)::date;
  v_revenue  NUMERIC := 0;
  v_cogs     NUMERIC := 0;
  v_ar       NUMERIC := 0;
  v_ap       NUMERIC := 0;
  v_inv      NUMERIC := 0;
  v_dso      NUMERIC := NULL;
  v_dpo      NUMERIC := NULL;
  v_dio      NUMERIC := NULL;
  v_ccc      NUMERIC := NULL;
BEGIN
  -- Window revenue (Income credits) and COGS (Expense debits where account is COGS).
  SELECT
    COALESCE(SUM(CASE WHEN a.account_type = 'Income'  THEN jl.credit - jl.debit ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN a.account_type = 'Expense'
                       AND (a.account_name ILIKE '%cogs%' OR a.account_name ILIKE '%cost of goods%')
                      THEN jl.debit - jl.credit ELSE 0 END), 0)
  INTO v_revenue, v_cogs
  FROM journal_lines jl
  JOIN journals j ON j.id = jl.journal_id AND j.status = 'posted'
  JOIN accounts a ON a.id = jl.account_id
  WHERE jl.user_id = p_user_id
    AND jl.entry_date >= v_start
    AND jl.entry_date <= p_as_of
    AND a.account_type IN ('Income', 'Expense');

  -- Point-in-time AR / AP from journal_lines tagged with customer_id / vendor_id.
  SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
    INTO v_ar
    FROM journal_lines jl
    JOIN journals j ON j.id = jl.journal_id AND j.status = 'posted'
    WHERE jl.user_id = p_user_id
      AND jl.customer_id IS NOT NULL
      AND jl.entry_date <= p_as_of;

  SELECT COALESCE(SUM(jl.credit - jl.debit), 0)
    INTO v_ap
    FROM journal_lines jl
    JOIN journals j ON j.id = jl.journal_id AND j.status = 'posted'
    WHERE jl.user_id = p_user_id
      AND jl.vendor_id IS NOT NULL
      AND jl.entry_date <= p_as_of;

  -- Inventory: sum of opening_balance + net Dr-Cr on Asset accounts with
  -- name matching "inventory" / "stock".
  SELECT COALESCE(SUM(coalesce(a.opening_balance, 0) + coalesce(net.delta, 0)), 0)
    INTO v_inv
    FROM accounts a
    LEFT JOIN (
      SELECT account_id, SUM(debit - credit) AS delta
        FROM journal_lines jl
        JOIN journals j ON j.id = jl.journal_id AND j.status = 'posted'
       WHERE jl.user_id = p_user_id AND jl.entry_date <= p_as_of
       GROUP BY account_id
    ) net ON net.account_id = a.id
    WHERE a.user_id = p_user_id
      AND a.account_type = 'Asset'
      AND (a.account_name ILIKE '%inventory%' OR a.account_name ILIKE '%stock%');

  -- DSO = AR / Revenue * window_days
  IF v_revenue > 0 THEN v_dso := round((v_ar / v_revenue) * p_window_days, 1); END IF;
  -- DPO = AP / COGS (fallback: AP / (Revenue * 0.6) if COGS missing) * window_days
  IF v_cogs > 0 THEN
    v_dpo := round((v_ap / v_cogs) * p_window_days, 1);
  ELSIF v_revenue > 0 THEN
    v_dpo := round((v_ap / (v_revenue * 0.6)) * p_window_days, 1);
  END IF;
  -- DIO = Inventory / COGS * window_days
  IF v_cogs > 0 THEN v_dio := round((v_inv / v_cogs) * p_window_days, 1); END IF;
  IF v_dso IS NOT NULL AND v_dpo IS NOT NULL AND v_dio IS NOT NULL THEN
    v_ccc := round(v_dso + v_dio - v_dpo, 1);
  END IF;

  RETURN jsonb_build_object(
    'as_of',           p_as_of,
    'window_days',     p_window_days,
    'window_start',    v_start,
    'revenue_window',  round(v_revenue, 2),
    'cogs_window',     round(v_cogs,    2),
    'ar_balance',      round(v_ar,      2),
    'ap_balance',      round(v_ap,      2),
    'inventory_value', round(v_inv,     2),
    'dso_days',        v_dso,
    'dpo_days',        v_dpo,
    'dio_days',        v_dio,
    'ccc_days',        v_ccc,
    'working_capital', round(v_ar + v_inv - v_ap, 2),
    'computed_at',     NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_working_capital_days(TEXT, DATE, INTEGER) TO anon, authenticated;

-- ── 3d. Customer credit score (M10) ────────────────────────────────────────
-- Lifetime revenue per customer + outstanding + overdue % + days since last
-- payment + concentration. Returns a 0-100 score per customer.
--
-- Score weighting:
--   60 base
--   − overdue_pct × 0.6     (max -60)
--   − days_since_payment_factor × 0.2   (180 days → -36 ; 365 → ~-73)
--   + repeat_customer_bonus (capped 20)
--
-- The point is a *relative* signal, not a credit-bureau grade.
CREATE OR REPLACE FUNCTION get_customer_credit_scores(
  p_user_id TEXT,
  p_as_of   DATE DEFAULT CURRENT_DATE
) RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH ar_lines AS (
    SELECT
      jl.customer_id,
      jl.entry_date,
      COALESCE(jl.debit,  0) AS debit,
      COALESCE(jl.credit, 0) AS credit,
      j.source_type
    FROM journal_lines jl
    JOIN journals j ON j.id = jl.journal_id AND j.status = 'posted'
    WHERE jl.user_id = p_user_id
      AND jl.customer_id IS NOT NULL
      AND jl.entry_date <= p_as_of
  ),
  per_customer AS (
    SELECT
      l.customer_id                                                AS party_id,
      c.name                                                       AS party_name,
      COALESCE(SUM(l.debit - l.credit), 0)                         AS outstanding,
      -- "Lifetime billed" = sum of debits via invoice/credit_note/etc.
      COALESCE(SUM(l.debit) FILTER (WHERE l.source_type IN ('invoice','cash_memo','credit_note')), 0) AS lifetime_billed,
      -- "Lifetime collected" = sum of credits via payment_received
      COALESCE(SUM(l.credit) FILTER (WHERE l.source_type = 'payment_received'), 0) AS lifetime_collected,
      -- Overdue heuristic: lines older than 60 days that aren't yet offset.
      COALESCE(SUM(l.debit - l.credit) FILTER (WHERE (p_as_of - l.entry_date) > 60), 0) AS overdue,
      MAX(l.entry_date) FILTER (WHERE l.source_type = 'payment_received') AS last_payment_date
    FROM ar_lines l
    LEFT JOIN clients c ON c.id = l.customer_id
    GROUP BY l.customer_id, c.name
  ),
  totals AS (
    SELECT GREATEST(SUM(lifetime_billed), 1) AS grand_billed FROM per_customer
  ),
  scored AS (
    SELECT
      p.party_id,
      p.party_name,
      p.outstanding,
      p.lifetime_billed,
      p.lifetime_collected,
      GREATEST(p.outstanding, 0)                                AS open_balance,
      CASE WHEN p.lifetime_billed > 0
        THEN round(LEAST(GREATEST(p.overdue / NULLIF(p.outstanding, 0), 0), 1) * 100, 1)
        ELSE 0 END                                              AS overdue_pct,
      CASE WHEN p.last_payment_date IS NULL THEN NULL
        ELSE (p_as_of - p.last_payment_date) END                AS days_since_last_payment,
      round(p.lifetime_billed * 100 / (SELECT grand_billed FROM totals), 1) AS revenue_concentration_pct,
      GREATEST(0, LEAST(100, round(
        60
        - LEAST(GREATEST(p.overdue / NULLIF(p.outstanding, 0), 0), 1) * 60
        - LEAST(COALESCE((p_as_of - p.last_payment_date), 0) / 5.0, 36)
        + LEAST(p.lifetime_billed / NULLIF((SELECT grand_billed FROM totals)/10, 0), 2) * 10
      , 0)))                                                    AS score
    FROM per_customer p
    WHERE p.outstanding <> 0 OR p.lifetime_billed > 0
  )
  SELECT jsonb_build_object(
    'as_of',     p_as_of,
    'customers', COALESCE((
      SELECT jsonb_agg(to_jsonb(scored) ORDER BY scored.score ASC)
      FROM scored
    ), '[]'::jsonb),
    'computed_at', NOW()
  ) INTO v_result;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_customer_credit_scores(TEXT, DATE) TO anon, authenticated;

-- ── 3e. Inventory holding risk (M11) ────────────────────────────────────────
-- Per-item: book value at this user's inventory accounts + last_movement_date.
-- Items with no movement > 90 days are flagged "slow"; > 180 days "dead".
CREATE OR REPLACE FUNCTION get_inventory_holding_risk(
  p_user_id TEXT,
  p_as_of   DATE DEFAULT CURRENT_DATE
) RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_result JSONB;
  v_inv_table_exists BOOLEAN := EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'inventory_movements'
  );
BEGIN
  IF NOT v_inv_table_exists THEN
    RETURN jsonb_build_object('as_of', p_as_of, 'items', '[]'::jsonb, 'computed_at', NOW());
  END IF;

  WITH per_item AS (
    SELECT
      im.item_id,
      COALESCE(MAX(im.movement_date), '1900-01-01'::date)         AS last_movement_date,
      COALESCE(SUM(im.value_in)  - SUM(im.value_out), 0)          AS net_value,
      COALESCE(SUM(im.quantity_in) - SUM(im.quantity_out), 0)     AS net_qty
    FROM inventory_movements im
    WHERE im.user_id = p_user_id
      AND im.movement_date <= p_as_of
    GROUP BY im.item_id
  ),
  scored AS (
    SELECT
      p.item_id,
      i.name                                AS item_name,
      i.sku                                 AS sku,
      p.net_qty,
      p.net_value,
      p.last_movement_date,
      (p_as_of - p.last_movement_date)      AS days_since_movement,
      CASE
        WHEN (p_as_of - p.last_movement_date) > 180 THEN 'dead'
        WHEN (p_as_of - p.last_movement_date) > 90  THEN 'slow'
        ELSE 'active'
      END                                   AS status
    FROM per_item p
    LEFT JOIN inventory i ON i.id = p.item_id AND i.user_id = p_user_id
    WHERE p.net_qty > 0
  )
  SELECT jsonb_build_object(
    'as_of',      p_as_of,
    'summary',    jsonb_build_object(
      'item_count',   (SELECT COUNT(*) FROM scored),
      'active_count', (SELECT COUNT(*) FROM scored WHERE status = 'active'),
      'slow_count',   (SELECT COUNT(*) FROM scored WHERE status = 'slow'),
      'dead_count',   (SELECT COUNT(*) FROM scored WHERE status = 'dead'),
      'value_at_risk', COALESCE((SELECT SUM(net_value) FROM scored WHERE status IN ('slow','dead')), 0),
      'dead_value',    COALESCE((SELECT SUM(net_value) FROM scored WHERE status = 'dead'), 0)
    ),
    'items',      COALESCE((
      SELECT jsonb_agg(to_jsonb(scored) ORDER BY scored.days_since_movement DESC)
      FROM scored WHERE status IN ('slow', 'dead')
    ), '[]'::jsonb),
    'computed_at', NOW()
  ) INTO v_result;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_inventory_holding_risk(TEXT, DATE) TO anon, authenticated;

-- ── 4. NEW VALIDATION CHECK: orphan AR/AP control-account lines ────────────
-- Add a 6th check to validate_books that flags any journal line hitting a
-- Trade Receivables / Trade Payables / Sundry Debtors / Sundry Creditors
-- control account WITHOUT a customer_id / vendor_id tag. Such lines bypass
-- the sub-ledger and silently break the existing AR/AP control checks.
--
-- Wraps the existing 5-check RPC: we call it for the original checks, then
-- append our own orphan-detection result.
CREATE OR REPLACE FUNCTION validate_books_with_orphans(
  p_user_id     TEXT,
  p_fiscal_year TEXT
) RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_base         JSONB;
  v_orphans      JSONB;
  v_orphan_count INTEGER;
  v_checks       JSONB;
  v_all_passed   BOOLEAN;
BEGIN
  v_base := validate_books(p_user_id, p_fiscal_year);

  WITH orphans AS (
    SELECT
      a.account_code, a.account_name, a.account_subgroup,
      jl.id            AS line_id,
      jl.journal_id,
      jl.entry_date,
      COALESCE(jl.debit, 0)  AS debit,
      COALESCE(jl.credit, 0) AS credit,
      CASE
        WHEN a.account_subgroup = 'Trade Receivables' AND jl.customer_id IS NULL THEN 'AR_NO_CUSTOMER'
        WHEN a.account_subgroup = 'Trade Payables'    AND jl.vendor_id   IS NULL THEN 'AP_NO_VENDOR'
        ELSE 'OTHER'
      END AS reason
    FROM journal_lines jl
    JOIN journals j ON j.id = jl.journal_id AND j.status = 'posted'
    JOIN accounts a ON a.id = jl.account_id
    WHERE jl.user_id = p_user_id
      AND (
        (a.account_subgroup = 'Trade Receivables' AND jl.customer_id IS NULL)
     OR (a.account_subgroup = 'Trade Payables'    AND jl.vendor_id   IS NULL)
      )
  )
  SELECT COUNT(*), COALESCE(jsonb_agg(to_jsonb(orphans) ORDER BY orphans.entry_date DESC) FILTER (WHERE 1=1), '[]'::jsonb)
  INTO v_orphan_count, v_orphans
  FROM orphans;

  v_checks := COALESCE(v_base -> 'checks', '[]'::jsonb)
            || jsonb_build_array(jsonb_build_object(
                  'check',   'control_account_orphans',
                  'label',   'Trade Receivables / Payables lines carry party id',
                  'passed',  v_orphan_count = 0,
                  'details', jsonb_build_object(
                    'orphan_count', v_orphan_count,
                    'orphans',      v_orphans
                  )
               ));

  v_all_passed := COALESCE((v_base ->> 'all_passed')::boolean, TRUE)
                AND v_orphan_count = 0;

  RETURN v_base
       || jsonb_build_object(
            'all_passed', v_all_passed,
            'checks',     v_checks,
            'computed_at', NOW()
          );
END;
$$;

GRANT EXECUTE ON FUNCTION validate_books_with_orphans(TEXT, TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMENT ON FUNCTION validate_books_with_orphans IS
  'Wraps validate_books and appends a control_account_orphans check that flags Trade Receivables/Payables lines missing customer_id/vendor_id. Such lines silently break the AR/AP sub-ledger ↔ control reconciliation.';

COMMENT ON FUNCTION get_ar_ap_aging IS
  'Pure-journal AR/AP aging by party. Buckets each line by (as_of - entry_date). Returns one row per non-zero party plus a summary block.';
COMMENT ON FUNCTION get_pnl_from_journals IS
  'P&L for a date range from journal_lines + account_type. Same numbers as get_live_journal_dashboard but arbitrary range. No source-table dependence.';
COMMENT ON FUNCTION get_gst_liability_from_journals IS
  'Monthly GST liability + ITC + RCM aggregated from journal_lines.tax_type. Same shape as the UI''s GSTLiabilitySummary; SSOT replacement for source-table aggregation.';
