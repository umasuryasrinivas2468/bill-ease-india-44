-- ============================================================================
-- PHASE 11 — SCHEDULE III DRILLDOWN
-- ----------------------------------------------------------------------------
-- Given a Schedule III line code (e.g. BS.CA.3 Trade Receivables) and a
-- period, return the contributing journal lines with source linkage so the
-- UI can present an accountant-friendly drilldown (account → journal →
-- source invoice/bill/expense).
-- ============================================================================

CREATE OR REPLACE FUNCTION get_schedule_iii_drilldown(
  p_user_id      TEXT,
  p_line_code    TEXT,
  p_period_start DATE DEFAULT NULL,    -- NULL = beginning of time
  p_period_end   DATE DEFAULT CURRENT_DATE,
  p_limit        INT  DEFAULT 200,
  p_offset       INT  DEFAULT 0
) RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_line     RECORD;
  v_lines    JSONB;
  v_total    NUMERIC;
  v_count    INT;
  v_dr_total NUMERIC;
  v_cr_total NUMERIC;
BEGIN
  SELECT line_code, section, subsection, display_label, statement_type, note_no
    INTO v_line
    FROM schedule_iii_lines
   WHERE line_code = p_line_code;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', format('Unknown line_code: %s', p_line_code));
  END IF;

  WITH src AS (
    SELECT
      j.id              AS journal_id,
      j.journal_number,
      j.journal_date,
      j.narration,
      j.source_type,
      j.source_id,
      a.id              AS account_id,
      a.account_code,
      a.account_name,
      a.account_type,
      jl.debit,
      jl.credit,
      CASE a.account_type
        WHEN 'Asset'     THEN COALESCE(jl.debit,0)  - COALESCE(jl.credit,0)
        WHEN 'Expense'   THEN COALESCE(jl.debit,0)  - COALESCE(jl.credit,0)
        WHEN 'Liability' THEN COALESCE(jl.credit,0) - COALESCE(jl.debit,0)
        WHEN 'Equity'    THEN COALESCE(jl.credit,0) - COALESCE(jl.debit,0)
        WHEN 'Income'    THEN COALESCE(jl.credit,0) - COALESCE(jl.debit,0)
      END               AS signed_amount,
      jl.vendor_id,
      jl.customer_id,
      jl.cost_center_id,
      jl.project_id,
      jl.branch_id,
      jl.department
    FROM journals j
    JOIN journal_lines jl ON jl.journal_id = j.id
    JOIN accounts a       ON a.id = jl.account_id
   WHERE a.user_id = p_user_id
     AND jl.user_id = p_user_id
     AND j.status = 'posted'
     AND a.schedule_iii_line_code = p_line_code
     AND COALESCE(a.is_group, FALSE) = FALSE
     AND (p_period_start IS NULL OR j.journal_date >= p_period_start)
     AND j.journal_date <= p_period_end
  ),
  totals AS (
    SELECT
      COUNT(*)                       AS row_count,
      COALESCE(SUM(debit),  0)::NUMERIC AS dr_total,
      COALESCE(SUM(credit), 0)::NUMERIC AS cr_total,
      COALESCE(SUM(signed_amount), 0)::NUMERIC AS net_amount
    FROM src
  ),
  page AS (
    SELECT * FROM src
    ORDER BY journal_date DESC, journal_number DESC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT
    t.row_count, t.dr_total, t.cr_total, t.net_amount,
    COALESCE(jsonb_agg(jsonb_build_object(
      'journal_id',     p.journal_id,
      'journal_number', p.journal_number,
      'journal_date',   p.journal_date,
      'narration',      p.narration,
      'source_type',    p.source_type,
      'source_id',      p.source_id,
      'account_id',     p.account_id,
      'account_code',   p.account_code,
      'account_name',   p.account_name,
      'debit',          ROUND(p.debit::NUMERIC, 2),
      'credit',         ROUND(p.credit::NUMERIC, 2),
      'signed_amount',  ROUND(p.signed_amount::NUMERIC, 2),
      'vendor_id',      p.vendor_id,
      'customer_id',    p.customer_id,
      'cost_center_id', p.cost_center_id,
      'project_id',     p.project_id,
      'branch_id',      p.branch_id,
      'department',     p.department
    ) ORDER BY p.journal_date DESC, p.journal_number DESC), '[]'::jsonb)
    INTO v_count, v_dr_total, v_cr_total, v_total, v_lines
  FROM totals t LEFT JOIN page p ON TRUE
  GROUP BY t.row_count, t.dr_total, t.cr_total, t.net_amount;

  -- If totals had 0 rows the GROUP BY produces no row; handle that:
  IF v_count IS NULL THEN
    v_count := 0; v_dr_total := 0; v_cr_total := 0; v_total := 0; v_lines := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'line_code',     v_line.line_code,
    'label',         v_line.display_label,
    'section',       v_line.section,
    'subsection',    v_line.subsection,
    'note_no',       v_line.note_no,
    'statement_type',v_line.statement_type,
    'period_start',  p_period_start,
    'period_end',    p_period_end,
    'row_count',     v_count,
    'debit_total',   v_dr_total,
    'credit_total',  v_cr_total,
    'net_amount',    v_total,
    'page_limit',    p_limit,
    'page_offset',   p_offset,
    'entries',       v_lines
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_schedule_iii_drilldown(TEXT, TEXT, DATE, DATE, INT, INT) TO authenticated, anon;
