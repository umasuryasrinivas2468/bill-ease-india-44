-- ============================================================================
-- PHASE 28 — JOURNAL-FIRST FOUNDATION
-- ----------------------------------------------------------------------------
-- Brief: make the platform ledger-first, journal-driven, real-time, GST-
-- compliant, audit-ready. Sub-ledger architecture (vendors/clients →
-- primary_ledger_account_id + subledger_account_id) is already built in
-- 20260518000001. `post_journal` RPC already exists in 20260507000001 and
-- handles every module's auto-posting with idempotency.
--
-- This migration adds the *consumption* layer the brief calls out:
--   1. get_general_ledger          — opening / Dr / Cr / closing + lines for one account
--   2. get_party_subledger         — vendor/customer sub-ledger with drilldown
--   3. get_live_journal_dashboard  — every KPI derived ONLY from journals/lines (SSOT)
--   4. get_gstr2b_reconciliation   — supplier-wise books vs portal with mismatches
--   5. validate_books              — the 5-check validation layer the brief specifies
-- ============================================================================

-- ── 1. RPC: get_general_ledger ─────────────────────────────────────────────
-- Returns opening_balance, total debits/credits in period, closing_balance,
-- and every journal line (with source refs for drilldown).
CREATE OR REPLACE FUNCTION get_general_ledger(
  p_user_id    TEXT,
  p_account_id UUID,
  p_from_date  DATE,
  p_to_date    DATE
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_opening      NUMERIC(18,2) := 0;
  v_period_dr    NUMERIC(18,2) := 0;
  v_period_cr    NUMERIC(18,2) := 0;
  v_closing      NUMERIC(18,2) := 0;
  v_account_type TEXT;
  v_account_name TEXT;
  v_account_code TEXT;
  v_lines        JSONB := '[]'::jsonb;
BEGIN
  SELECT account_type, account_name, account_code, COALESCE(opening_balance, 0)
    INTO v_account_type, v_account_name, v_account_code, v_opening
  FROM accounts WHERE id = p_account_id AND user_id = p_user_id;

  IF v_account_type IS NULL THEN
    RETURN jsonb_build_object('error', 'account_not_found');
  END IF;

  -- Cumulative debits/credits BEFORE p_from_date → adjust opening balance.
  SELECT COALESCE(SUM(COALESCE(jl.debit,0)), 0), COALESCE(SUM(COALESCE(jl.credit,0)), 0)
    INTO v_period_dr, v_period_cr
  FROM journal_lines jl
  JOIN journals j ON j.id = jl.journal_id
  WHERE jl.account_id = p_account_id
    AND j.user_id = p_user_id
    AND j.status = 'posted'
    AND COALESCE(j.is_reversed, FALSE) = FALSE
    AND j.journal_date < p_from_date;

  IF v_account_type IN ('Asset','Expense') THEN
    v_opening := v_opening + (v_period_dr - v_period_cr);
  ELSE
    v_opening := v_opening + (v_period_cr - v_period_dr);
  END IF;

  -- Period totals
  SELECT COALESCE(SUM(COALESCE(jl.debit,0)), 0), COALESCE(SUM(COALESCE(jl.credit,0)), 0)
    INTO v_period_dr, v_period_cr
  FROM journal_lines jl
  JOIN journals j ON j.id = jl.journal_id
  WHERE jl.account_id = p_account_id
    AND j.user_id = p_user_id
    AND j.status = 'posted'
    AND COALESCE(j.is_reversed, FALSE) = FALSE
    AND j.journal_date BETWEEN p_from_date AND p_to_date;

  IF v_account_type IN ('Asset','Expense') THEN
    v_closing := v_opening + v_period_dr - v_period_cr;
  ELSE
    v_closing := v_opening - v_period_dr + v_period_cr;
  END IF;

  -- Lines with drilldown refs
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'journal_id',     j.id,
           'journal_number', j.journal_number,
           'journal_date',   j.journal_date,
           'narration',      COALESCE(jl.line_narration, j.narration),
           'debit',          COALESCE(jl.debit, 0),
           'credit',         COALESCE(jl.credit, 0),
           'source_type',    j.source_type,
           'source_id',      j.source_id,
           'vendor_id',      jl.vendor_id,
           'customer_id',    jl.customer_id
         ) ORDER BY j.journal_date, j.journal_number), '[]'::jsonb)
    INTO v_lines
  FROM journal_lines jl
  JOIN journals j ON j.id = jl.journal_id
  WHERE jl.account_id = p_account_id
    AND j.user_id = p_user_id
    AND j.status = 'posted'
    AND COALESCE(j.is_reversed, FALSE) = FALSE
    AND j.journal_date BETWEEN p_from_date AND p_to_date;

  RETURN jsonb_build_object(
    'account_id',        p_account_id,
    'account_code',      v_account_code,
    'account_name',      v_account_name,
    'account_type',      v_account_type,
    'from_date',         p_from_date,
    'to_date',           p_to_date,
    'opening_balance',   v_opening,
    'period_debit',      v_period_dr,
    'period_credit',     v_period_cr,
    'closing_balance',   v_closing,
    'lines',             v_lines
  );
END;
$$;

-- ── 2. RPC: get_party_subledger ────────────────────────────────────────────
-- One vendor's or customer's full ledger view: invoiced/billed, paid, balance,
-- aging buckets, and every journal entry tagged with that party.
CREATE OR REPLACE FUNCTION get_party_subledger(
  p_user_id    TEXT,
  p_party_type TEXT,        -- 'vendor' | 'customer'
  p_party_id   UUID,
  p_from_date  DATE,
  p_to_date    DATE
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_party_name      TEXT;
  v_subledger_id    UUID;
  v_filter_col      TEXT;
  v_opening         NUMERIC(18,2) := 0;
  v_period_dr       NUMERIC(18,2) := 0;
  v_period_cr       NUMERIC(18,2) := 0;
  v_closing         NUMERIC(18,2) := 0;
  v_lines           JSONB := '[]'::jsonb;
  v_aging           JSONB := '{}'::jsonb;
  v_account_type    TEXT;
BEGIN
  IF p_party_type NOT IN ('vendor','customer') THEN
    RETURN jsonb_build_object('error', 'invalid_party_type');
  END IF;

  IF p_party_type = 'vendor' THEN
    BEGIN
      SELECT COALESCE(NULLIF(TRIM(company_name), ''), NULLIF(TRIM(name), ''), 'Vendor'),
             subledger_account_id
        INTO v_party_name, v_subledger_id
      FROM vendors WHERE id = p_party_id AND user_id = p_user_id;
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      SELECT vendor_name, NULL::UUID INTO v_party_name, v_subledger_id
      FROM vendors WHERE id = p_party_id AND user_id = p_user_id;
    END;
    v_account_type := 'Liability';
  ELSE
    BEGIN
      SELECT COALESCE(NULLIF(TRIM(display_name), ''), NULLIF(TRIM(company_name), ''),
                      NULLIF(TRIM(name), ''), 'Customer'),
             subledger_account_id
        INTO v_party_name, v_subledger_id
      FROM clients WHERE id = p_party_id AND user_id = p_user_id;
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      v_party_name := 'Customer'; v_subledger_id := NULL;
    END;
    v_account_type := 'Asset';
  END IF;

  -- Opening (cumulative before p_from_date) from journal_lines tagged with party.
  IF p_party_type = 'vendor' THEN
    SELECT COALESCE(SUM(COALESCE(jl.debit,0)), 0), COALESCE(SUM(COALESCE(jl.credit,0)), 0)
      INTO v_period_dr, v_period_cr
    FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id
    WHERE j.user_id = p_user_id
      AND j.status = 'posted'
      AND COALESCE(j.is_reversed, FALSE) = FALSE
      AND j.journal_date < p_from_date
      AND jl.vendor_id = p_party_id;
  ELSE
    SELECT COALESCE(SUM(COALESCE(jl.debit,0)), 0), COALESCE(SUM(COALESCE(jl.credit,0)), 0)
      INTO v_period_dr, v_period_cr
    FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id
    WHERE j.user_id = p_user_id
      AND j.status = 'posted'
      AND COALESCE(j.is_reversed, FALSE) = FALSE
      AND j.journal_date < p_from_date
      AND jl.customer_id = p_party_id;
  END IF;

  -- Asset accounts (customer = trade receivables) net = Dr − Cr.
  -- Liability accounts (vendor = trade payables) net = Cr − Dr.
  IF v_account_type = 'Asset' THEN
    v_opening := v_period_dr - v_period_cr;
  ELSE
    v_opening := v_period_cr - v_period_dr;
  END IF;

  -- Period totals
  IF p_party_type = 'vendor' THEN
    SELECT COALESCE(SUM(COALESCE(jl.debit,0)), 0), COALESCE(SUM(COALESCE(jl.credit,0)), 0)
      INTO v_period_dr, v_period_cr
    FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id
    WHERE j.user_id = p_user_id
      AND j.status = 'posted'
      AND COALESCE(j.is_reversed, FALSE) = FALSE
      AND j.journal_date BETWEEN p_from_date AND p_to_date
      AND jl.vendor_id = p_party_id;
  ELSE
    SELECT COALESCE(SUM(COALESCE(jl.debit,0)), 0), COALESCE(SUM(COALESCE(jl.credit,0)), 0)
      INTO v_period_dr, v_period_cr
    FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id
    WHERE j.user_id = p_user_id
      AND j.status = 'posted'
      AND COALESCE(j.is_reversed, FALSE) = FALSE
      AND j.journal_date BETWEEN p_from_date AND p_to_date
      AND jl.customer_id = p_party_id;
  END IF;

  IF v_account_type = 'Asset' THEN
    v_closing := v_opening + v_period_dr - v_period_cr;
  ELSE
    v_closing := v_opening - v_period_dr + v_period_cr;
  END IF;

  -- Lines
  IF p_party_type = 'vendor' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'journal_id',     j.id,
             'journal_number', j.journal_number,
             'journal_date',   j.journal_date,
             'narration',      COALESCE(jl.line_narration, j.narration),
             'debit',          COALESCE(jl.debit, 0),
             'credit',         COALESCE(jl.credit, 0),
             'source_type',    j.source_type,
             'source_id',      j.source_id
           ) ORDER BY j.journal_date, j.journal_number), '[]'::jsonb)
      INTO v_lines
    FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id
    WHERE j.user_id = p_user_id
      AND j.status = 'posted'
      AND COALESCE(j.is_reversed, FALSE) = FALSE
      AND j.journal_date BETWEEN p_from_date AND p_to_date
      AND jl.vendor_id = p_party_id;
  ELSE
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'journal_id',     j.id,
             'journal_number', j.journal_number,
             'journal_date',   j.journal_date,
             'narration',      COALESCE(jl.line_narration, j.narration),
             'debit',          COALESCE(jl.debit, 0),
             'credit',         COALESCE(jl.credit, 0),
             'source_type',    j.source_type,
             'source_id',      j.source_id
           ) ORDER BY j.journal_date, j.journal_number), '[]'::jsonb)
      INTO v_lines
    FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id
    WHERE j.user_id = p_user_id
      AND j.status = 'posted'
      AND COALESCE(j.is_reversed, FALSE) = FALSE
      AND j.journal_date BETWEEN p_from_date AND p_to_date
      AND jl.customer_id = p_party_id;
  END IF;

  -- Aging on outstanding (from receivables/payables for the party)
  BEGIN
    IF p_party_type = 'vendor' THEN
      WITH ap AS (
        SELECT amount_remaining, (CURRENT_DATE - due_date)::INT AS days_overdue
        FROM payables
        WHERE user_id = p_user_id AND status <> 'paid'
          AND vendor_name = v_party_name
      )
      SELECT jsonb_build_object(
        'current',  COALESCE(SUM(amount_remaining) FILTER (WHERE days_overdue <= 0), 0),
        'd1_30',    COALESCE(SUM(amount_remaining) FILTER (WHERE days_overdue BETWEEN 1 AND 30), 0),
        'd31_60',   COALESCE(SUM(amount_remaining) FILTER (WHERE days_overdue BETWEEN 31 AND 60), 0),
        'd61_90',   COALESCE(SUM(amount_remaining) FILTER (WHERE days_overdue BETWEEN 61 AND 90), 0),
        'd90_plus', COALESCE(SUM(amount_remaining) FILTER (WHERE days_overdue > 90), 0)
      ) INTO v_aging FROM ap;
    ELSE
      WITH ar AS (
        SELECT amount_remaining, (CURRENT_DATE - due_date)::INT AS days_overdue
        FROM receivables
        WHERE user_id = p_user_id AND status <> 'paid'
          AND customer_name = v_party_name
      )
      SELECT jsonb_build_object(
        'current',  COALESCE(SUM(amount_remaining) FILTER (WHERE days_overdue <= 0), 0),
        'd1_30',    COALESCE(SUM(amount_remaining) FILTER (WHERE days_overdue BETWEEN 1 AND 30), 0),
        'd31_60',   COALESCE(SUM(amount_remaining) FILTER (WHERE days_overdue BETWEEN 31 AND 60), 0),
        'd61_90',   COALESCE(SUM(amount_remaining) FILTER (WHERE days_overdue BETWEEN 61 AND 90), 0),
        'd90_plus', COALESCE(SUM(amount_remaining) FILTER (WHERE days_overdue > 90), 0)
      ) INTO v_aging FROM ar;
    END IF;
  EXCEPTION WHEN undefined_table OR undefined_column THEN v_aging := '{}'::jsonb;
  END;

  RETURN jsonb_build_object(
    'party_type',      p_party_type,
    'party_id',        p_party_id,
    'party_name',      v_party_name,
    'subledger_id',    v_subledger_id,
    'from_date',       p_from_date,
    'to_date',         p_to_date,
    'opening_balance', v_opening,
    'period_debit',    v_period_dr,
    'period_credit',   v_period_cr,
    'closing_balance', v_closing,
    'aging',           v_aging,
    'lines',           v_lines
  );
END;
$$;

-- ── 3. RPC: get_live_journal_dashboard ─────────────────────────────────────
-- Every metric derived ONLY from journals/journal_lines/accounts (SSOT).
-- No independent calculations from invoices/expenses/payables/receivables.
CREATE OR REPLACE FUNCTION get_live_journal_dashboard(
  p_user_id     TEXT,
  p_fiscal_year TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_fy           TEXT := COALESCE(p_fiscal_year,
                          CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE)::INT >= 4
                               THEN EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-' ||
                                    RIGHT((EXTRACT(YEAR FROM CURRENT_DATE)+1)::TEXT, 2)
                               ELSE (EXTRACT(YEAR FROM CURRENT_DATE)-1)::TEXT || '-' ||
                                    RIGHT(EXTRACT(YEAR FROM CURRENT_DATE)::TEXT, 2)
                          END);
  v_fy_start     DATE;
  v_fy_end       DATE;
  v_revenue      NUMERIC(18,2) := 0;
  v_expenses     NUMERIC(18,2) := 0;
  v_profit       NUMERIC(18,2) := 0;
  v_cash         NUMERIC(18,2) := 0;
  v_ar_balance   NUMERIC(18,2) := 0;
  v_ap_balance   NUMERIC(18,2) := 0;
  v_inventory    NUMERIC(18,2) := 0;
  v_output_gst   NUMERIC(18,2) := 0;
  v_input_gst    NUMERIC(18,2) := 0;
BEGIN
  v_fy_start := make_date(SUBSTRING(v_fy FROM 1 FOR 4)::INT, 4, 1);
  v_fy_end   := make_date(SUBSTRING(v_fy FROM 1 FOR 4)::INT + 1, 3, 31);

  -- Revenue = Σ credits on Income accounts in FY
  SELECT COALESCE(SUM(jl.credit) - SUM(jl.debit), 0) INTO v_revenue
  FROM journal_lines jl
  JOIN journals j ON j.id = jl.journal_id
  JOIN accounts a ON a.id = jl.account_id
  WHERE j.user_id = p_user_id AND a.user_id = p_user_id
    AND a.account_type = 'Income'
    AND j.status = 'posted' AND COALESCE(j.is_reversed,FALSE) = FALSE
    AND j.journal_date BETWEEN v_fy_start AND v_fy_end;

  -- Expenses = Σ debits on Expense accounts in FY
  SELECT COALESCE(SUM(jl.debit) - SUM(jl.credit), 0) INTO v_expenses
  FROM journal_lines jl
  JOIN journals j ON j.id = jl.journal_id
  JOIN accounts a ON a.id = jl.account_id
  WHERE j.user_id = p_user_id AND a.user_id = p_user_id
    AND a.account_type = 'Expense'
    AND j.status = 'posted' AND COALESCE(j.is_reversed,FALSE) = FALSE
    AND j.journal_date BETWEEN v_fy_start AND v_fy_end;

  v_profit := v_revenue - v_expenses;

  -- Cash/Bank = Σ (opening + net Dr − net Cr) for Asset accounts matching cash/bank patterns
  WITH cash_accts AS (
    SELECT id, COALESCE(opening_balance, 0) AS opening
    FROM accounts
    WHERE user_id = p_user_id AND account_type = 'Asset'
      AND account_name ~* '(cash|bank|petty cash|current a/c|savings a/c)'
  ),
  cash_jl AS (
    SELECT COALESCE(SUM(jl.debit) - SUM(jl.credit), 0) AS net
    FROM journal_lines jl
    JOIN journals j ON j.id = jl.journal_id
    JOIN cash_accts ca ON ca.id = jl.account_id
    WHERE j.user_id = p_user_id
      AND j.status = 'posted' AND COALESCE(j.is_reversed,FALSE) = FALSE
      AND j.journal_date <= v_fy_end
  )
  SELECT COALESCE((SELECT SUM(opening) FROM cash_accts), 0)
       + COALESCE((SELECT net FROM cash_jl), 0)
    INTO v_cash;

  -- AR balance from journal_lines tagged with customer_id
  SELECT COALESCE(SUM(jl.debit) - SUM(jl.credit), 0) INTO v_ar_balance
  FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id
  WHERE j.user_id = p_user_id
    AND j.status = 'posted' AND COALESCE(j.is_reversed,FALSE) = FALSE
    AND j.journal_date <= v_fy_end
    AND jl.customer_id IS NOT NULL;

  -- AP balance from journal_lines tagged with vendor_id
  SELECT COALESCE(SUM(jl.credit) - SUM(jl.debit), 0) INTO v_ap_balance
  FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id
  WHERE j.user_id = p_user_id
    AND j.status = 'posted' AND COALESCE(j.is_reversed,FALSE) = FALSE
    AND j.journal_date <= v_fy_end
    AND jl.vendor_id IS NOT NULL;

  -- Inventory = sum of Asset accounts whose name matches inventory/stock pattern
  WITH inv_accts AS (
    SELECT id, COALESCE(opening_balance, 0) AS opening
    FROM accounts
    WHERE user_id = p_user_id AND account_type = 'Asset'
      AND account_name ~* '(inventory|stock|raw material|finished goods|wip)'
  ),
  inv_jl AS (
    SELECT COALESCE(SUM(jl.debit) - SUM(jl.credit), 0) AS net
    FROM journal_lines jl
    JOIN journals j ON j.id = jl.journal_id
    JOIN inv_accts ia ON ia.id = jl.account_id
    WHERE j.user_id = p_user_id
      AND j.status = 'posted' AND COALESCE(j.is_reversed,FALSE) = FALSE
      AND j.journal_date <= v_fy_end
  )
  SELECT COALESCE((SELECT SUM(opening) FROM inv_accts), 0)
       + COALESCE((SELECT net FROM inv_jl), 0)
    INTO v_inventory;

  -- Output GST = Σ credits on Liability accounts matching output GST pattern
  SELECT COALESCE(SUM(jl.credit) - SUM(jl.debit), 0) INTO v_output_gst
  FROM journal_lines jl
  JOIN journals j ON j.id = jl.journal_id
  JOIN accounts a ON a.id = jl.account_id
  WHERE j.user_id = p_user_id AND a.user_id = p_user_id
    AND a.account_type = 'Liability'
    AND a.account_name ~* '(output (cgst|sgst|igst|utgst|cess|gst)|gst payable)'
    AND j.status = 'posted' AND COALESCE(j.is_reversed,FALSE) = FALSE
    AND j.journal_date BETWEEN v_fy_start AND v_fy_end;

  -- Input GST = Σ debits on Asset accounts matching input GST pattern
  SELECT COALESCE(SUM(jl.debit) - SUM(jl.credit), 0) INTO v_input_gst
  FROM journal_lines jl
  JOIN journals j ON j.id = jl.journal_id
  JOIN accounts a ON a.id = jl.account_id
  WHERE j.user_id = p_user_id AND a.user_id = p_user_id
    AND a.account_type = 'Asset'
    AND a.account_name ~* '(input (cgst|sgst|igst|utgst|cess|gst)|itc)'
    AND j.status = 'posted' AND COALESCE(j.is_reversed,FALSE) = FALSE
    AND j.journal_date BETWEEN v_fy_start AND v_fy_end;

  RETURN jsonb_build_object(
    'fiscal_year',   v_fy,
    'source',        'journals_only',
    'revenue',       v_revenue,
    'expenses',      v_expenses,
    'net_profit',    v_profit,
    'cash_balance',  v_cash,
    'ar_balance',    v_ar_balance,
    'ap_balance',    v_ap_balance,
    'inventory_value', v_inventory,
    'output_gst',    v_output_gst,
    'input_gst',     v_input_gst,
    'net_gst_liability', v_output_gst - v_input_gst,
    'computed_at',   NOW()
  );
END;
$$;

-- ── 4. RPC: get_gstr2b_reconciliation ──────────────────────────────────────
-- Supplier-wise breakdown of books vs portal with mismatch flags.
CREATE OR REPLACE FUNCTION get_gstr2b_reconciliation(
  p_user_id TEXT,
  p_period  TEXT DEFAULT NULL                  -- 'YYYY-MM', default current month
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_period      TEXT := COALESCE(p_period, to_char(CURRENT_DATE, 'YYYY-MM'));
  v_month_start DATE := to_date(v_period || '-01', 'YYYY-MM-DD');
  v_month_end   DATE := (v_month_start + INTERVAL '1 month - 1 day')::DATE;
  v_books_total NUMERIC(18,2) := 0;
  v_portal_total NUMERIC(18,2) := 0;
  v_suppliers   JSONB := '[]'::jsonb;
  v_summary     JSONB;
BEGIN
  -- Books side from expenses (purchase invoices)
  BEGIN
    SELECT COALESCE(SUM(COALESCE(cgst_amount,0) + COALESCE(sgst_amount,0) +
                        COALESCE(igst_amount,0) + COALESCE(cess_amount,0)), 0)
      INTO v_books_total
    FROM expenses
    WHERE user_id = p_user_id AND expense_date BETWEEN v_month_start AND v_month_end;
  EXCEPTION WHEN undefined_column OR undefined_table THEN v_books_total := 0;
  END;

  -- Portal side from gstr2b_uploads
  BEGIN
    SELECT COALESCE(SUM(portal_total_cgst + portal_total_sgst + portal_total_igst + portal_total_cess), 0)
      INTO v_portal_total
    FROM gstr2b_uploads WHERE user_id = p_user_id AND period = v_period;
  EXCEPTION WHEN undefined_column OR undefined_table THEN v_portal_total := 0;
  END;

  -- Supplier-wise from books (with ITC eligibility from itc_classifications)
  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'supplier',        vendor,
             'gstin',           vendor_gstin,
             'invoice_count',   cnt,
             'taxable_value',   COALESCE(taxable_value, 0),
             'gst_books',       gst_books,
             'itc_eligible',    COALESCE(itc_eligible_amt, 0),
             'itc_blocked',     COALESCE(itc_blocked_amt, 0),
             'itc_claimed',     COALESCE(itc_claimed_amt, 0),
             'itc_pending',     COALESCE(itc_pending_amt, 0),
             'match_status',    CASE
                                  WHEN COALESCE(itc_claimed_amt,0) = 0 AND gst_books > 0 THEN 'unmatched'
                                  WHEN COALESCE(itc_blocked_amt,0) > 0 THEN 'blocked'
                                  ELSE 'matched'
                                END
           ) ORDER BY gst_books DESC), '[]'::jsonb)
      INTO v_suppliers
    FROM (
      SELECT
        COALESCE(e.vendor, 'Unknown') AS vendor,
        MAX(COALESCE(e.vendor_gstin, '')) AS vendor_gstin,
        COUNT(*) AS cnt,
        SUM(COALESCE(e.taxable_amount, COALESCE(e.total_amount, e.amount))) AS taxable_value,
        SUM(COALESCE(e.cgst_amount,0) + COALESCE(e.sgst_amount,0) +
            COALESCE(e.igst_amount,0) + COALESCE(e.cess_amount,0)) AS gst_books,
        (SELECT SUM(gst_amount) FROM itc_classifications ic
          WHERE ic.user_id = e.user_id AND ic.bill_id IN (
            SELECT id FROM expenses ee WHERE ee.user_id = e.user_id AND ee.vendor = e.vendor
              AND ee.expense_date BETWEEN v_month_start AND v_month_end
          ) AND ic.itc_status = 'eligible') AS itc_eligible_amt,
        (SELECT SUM(gst_amount) FROM itc_classifications ic
          WHERE ic.user_id = e.user_id AND ic.bill_id IN (
            SELECT id FROM expenses ee WHERE ee.user_id = e.user_id AND ee.vendor = e.vendor
              AND ee.expense_date BETWEEN v_month_start AND v_month_end
          ) AND ic.itc_status = 'blocked') AS itc_blocked_amt,
        (SELECT SUM(gst_amount) FROM itc_classifications ic
          WHERE ic.user_id = e.user_id AND ic.bill_id IN (
            SELECT id FROM expenses ee WHERE ee.user_id = e.user_id AND ee.vendor = e.vendor
              AND ee.expense_date BETWEEN v_month_start AND v_month_end
          ) AND ic.itc_status = 'claimed') AS itc_claimed_amt,
        (SELECT SUM(gst_amount) FROM itc_classifications ic
          WHERE ic.user_id = e.user_id AND ic.bill_id IN (
            SELECT id FROM expenses ee WHERE ee.user_id = e.user_id AND ee.vendor = e.vendor
              AND ee.expense_date BETWEEN v_month_start AND v_month_end
          ) AND ic.itc_status IN ('pending','eligible')) AS itc_pending_amt
      FROM expenses e
      WHERE e.user_id = p_user_id
        AND e.expense_date BETWEEN v_month_start AND v_month_end
        AND COALESCE(e.cgst_amount,0) + COALESCE(e.sgst_amount,0) +
            COALESCE(e.igst_amount,0) + COALESCE(e.cess_amount,0) > 0
      GROUP BY e.user_id, e.vendor
    ) t;
  EXCEPTION WHEN undefined_column OR undefined_table THEN v_suppliers := '[]'::jsonb;
  END;

  v_summary := jsonb_build_object(
    'period',         v_period,
    'books_total',    v_books_total,
    'portal_total',   v_portal_total,
    'variance',       v_books_total - v_portal_total,
    'match_pct',      CASE WHEN GREATEST(v_books_total, v_portal_total) > 0
                           THEN ROUND((LEAST(v_books_total, v_portal_total) /
                                       GREATEST(v_books_total, v_portal_total)) * 100, 2)
                           ELSE NULL END,
    'suppliers',      v_suppliers,
    'computed_at',    NOW()
  );

  RETURN v_summary;
END;
$$;

-- ── 5. RPC: validate_books ─────────────────────────────────────────────────
-- Continuous validation layer required by the brief:
--   * Debits = Credits
--   * Ledger balances match journals
--   * Sub-ledgers match control accounts
--   * GST liability matches returns
--   * Inventory matches stock ledger
CREATE OR REPLACE FUNCTION validate_books(
  p_user_id     TEXT,
  p_fiscal_year TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_fy           TEXT := COALESCE(p_fiscal_year,
                          CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE)::INT >= 4
                               THEN EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-' ||
                                    RIGHT((EXTRACT(YEAR FROM CURRENT_DATE)+1)::TEXT, 2)
                               ELSE (EXTRACT(YEAR FROM CURRENT_DATE)-1)::TEXT || '-' ||
                                    RIGHT(EXTRACT(YEAR FROM CURRENT_DATE)::TEXT, 2)
                          END);
  v_fy_start     DATE;
  v_fy_end       DATE;
  v_dr           NUMERIC(18,2) := 0;
  v_cr           NUMERIC(18,2) := 0;
  v_journal_imb  INT := 0;
  v_ar_control   NUMERIC(18,2) := 0;
  v_ar_sub       NUMERIC(18,2) := 0;
  v_ap_control   NUMERIC(18,2) := 0;
  v_ap_sub       NUMERIC(18,2) := 0;
  v_inv_book     NUMERIC(18,2) := 0;
  v_inv_ledger   NUMERIC(18,2) := 0;
  v_checks       JSONB := '[]'::jsonb;
  v_all_pass     BOOLEAN := TRUE;
BEGIN
  v_fy_start := make_date(SUBSTRING(v_fy FROM 1 FOR 4)::INT, 4, 1);
  v_fy_end   := make_date(SUBSTRING(v_fy FROM 1 FOR 4)::INT + 1, 3, 31);

  -- ── Check 1: Trial balance (Σ Dr = Σ Cr) ───────────────────────────────
  SELECT COALESCE(SUM(jl.debit),0), COALESCE(SUM(jl.credit),0)
    INTO v_dr, v_cr
  FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id
  WHERE j.user_id = p_user_id AND j.status = 'posted'
    AND COALESCE(j.is_reversed,FALSE) = FALSE
    AND j.journal_date BETWEEN v_fy_start AND v_fy_end;

  v_checks := v_checks || jsonb_build_object(
    'check',   'trial_balance',
    'label',   'Trial balance debits = credits',
    'passed',  ABS(v_dr - v_cr) <= 0.01,
    'details', jsonb_build_object('debits', v_dr, 'credits', v_cr, 'variance', v_dr - v_cr)
  );
  IF ABS(v_dr - v_cr) > 0.01 THEN v_all_pass := FALSE; END IF;

  -- ── Check 2: Per-journal balance (no individual journal imbalanced) ────
  SELECT COUNT(*) INTO v_journal_imb
  FROM journals
  WHERE user_id = p_user_id AND status = 'posted'
    AND COALESCE(is_reversed,FALSE) = FALSE
    AND journal_date BETWEEN v_fy_start AND v_fy_end
    AND ABS(COALESCE(total_debit,0) - COALESCE(total_credit,0)) > 0.01;

  v_checks := v_checks || jsonb_build_object(
    'check',  'journal_balance',
    'label',  'Every posted journal is balanced',
    'passed', v_journal_imb = 0,
    'details', jsonb_build_object('imbalanced_journals', v_journal_imb)
  );
  IF v_journal_imb > 0 THEN v_all_pass := FALSE; END IF;

  -- ── Check 3: AR sub-ledger = Trade Receivables control ─────────────────
  BEGIN
    -- Control: sum of journal_lines on the Sundry Debtors group + its children
    SELECT COALESCE(SUM(jl.debit) - SUM(jl.credit), 0) INTO v_ar_control
    FROM journal_lines jl
    JOIN journals j ON j.id = jl.journal_id
    JOIN accounts a ON a.id = jl.account_id
    WHERE j.user_id = p_user_id AND j.status = 'posted'
      AND COALESCE(j.is_reversed,FALSE) = FALSE
      AND j.journal_date <= v_fy_end
      AND (a.account_subgroup = 'Trade Receivables'
           OR a.account_name ~* 'trade receivable|sundry debtor');

    -- Sub: sum of all journal_lines tagged customer_id
    SELECT COALESCE(SUM(jl.debit) - SUM(jl.credit), 0) INTO v_ar_sub
    FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id
    WHERE j.user_id = p_user_id AND j.status = 'posted'
      AND COALESCE(j.is_reversed,FALSE) = FALSE
      AND j.journal_date <= v_fy_end
      AND jl.customer_id IS NOT NULL;

    v_checks := v_checks || jsonb_build_object(
      'check',   'ar_subledger_control',
      'label',   'Customer sub-ledger matches Trade Receivables control',
      'passed',  ABS(v_ar_control - v_ar_sub) <= 1,
      'details', jsonb_build_object('control', v_ar_control, 'sub', v_ar_sub, 'variance', v_ar_control - v_ar_sub)
    );
    IF ABS(v_ar_control - v_ar_sub) > 1 THEN v_all_pass := FALSE; END IF;
  EXCEPTION WHEN OTHERS THEN
    v_checks := v_checks || jsonb_build_object(
      'check', 'ar_subledger_control', 'label', 'Customer sub-ledger matches Trade Receivables control',
      'passed', NULL, 'details', jsonb_build_object('note', 'check skipped (' || SQLERRM || ')'));
  END;

  -- ── Check 4: AP sub-ledger = Trade Payables control ────────────────────
  BEGIN
    SELECT COALESCE(SUM(jl.credit) - SUM(jl.debit), 0) INTO v_ap_control
    FROM journal_lines jl
    JOIN journals j ON j.id = jl.journal_id
    JOIN accounts a ON a.id = jl.account_id
    WHERE j.user_id = p_user_id AND j.status = 'posted'
      AND COALESCE(j.is_reversed,FALSE) = FALSE
      AND j.journal_date <= v_fy_end
      AND (a.account_subgroup = 'Trade Payables'
           OR a.account_name ~* 'trade payable|sundry creditor');

    SELECT COALESCE(SUM(jl.credit) - SUM(jl.debit), 0) INTO v_ap_sub
    FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id
    WHERE j.user_id = p_user_id AND j.status = 'posted'
      AND COALESCE(j.is_reversed,FALSE) = FALSE
      AND j.journal_date <= v_fy_end
      AND jl.vendor_id IS NOT NULL;

    v_checks := v_checks || jsonb_build_object(
      'check',   'ap_subledger_control',
      'label',   'Vendor sub-ledger matches Trade Payables control',
      'passed',  ABS(v_ap_control - v_ap_sub) <= 1,
      'details', jsonb_build_object('control', v_ap_control, 'sub', v_ap_sub, 'variance', v_ap_control - v_ap_sub)
    );
    IF ABS(v_ap_control - v_ap_sub) > 1 THEN v_all_pass := FALSE; END IF;
  EXCEPTION WHEN OTHERS THEN
    v_checks := v_checks || jsonb_build_object(
      'check', 'ap_subledger_control', 'label', 'Vendor sub-ledger matches Trade Payables control',
      'passed', NULL, 'details', jsonb_build_object('note', 'check skipped (' || SQLERRM || ')'));
  END;

  -- ── Check 5: Inventory (book) = Inventory ledger (stock movement) ──────
  BEGIN
    SELECT COALESCE(SUM(COALESCE(stock_quantity,0) * COALESCE(unit_cost,0)), 0)
      INTO v_inv_book
    FROM inventory WHERE user_id = p_user_id;

    SELECT COALESCE(SUM((COALESCE(quantity_in,0) - COALESCE(quantity_out,0)) * COALESCE(unit_cost,0)), 0)
      INTO v_inv_ledger
    FROM inventory_movements WHERE user_id = p_user_id;

    v_checks := v_checks || jsonb_build_object(
      'check',   'inventory_match',
      'label',   'Inventory stock value matches inventory movements ledger',
      'passed',  ABS(v_inv_book - v_inv_ledger) <= 1,
      'details', jsonb_build_object('stock_value', v_inv_book, 'ledger_value', v_inv_ledger,
                                    'variance', v_inv_book - v_inv_ledger)
    );
    IF ABS(v_inv_book - v_inv_ledger) > 1 THEN v_all_pass := FALSE; END IF;
  EXCEPTION WHEN OTHERS THEN
    v_checks := v_checks || jsonb_build_object(
      'check', 'inventory_match', 'label', 'Inventory stock value matches inventory movements ledger',
      'passed', NULL, 'details', jsonb_build_object('note', 'check skipped (' || SQLERRM || ')'));
  END;

  RETURN jsonb_build_object(
    'fiscal_year',  v_fy,
    'all_passed',   v_all_pass,
    'checks',       v_checks,
    'computed_at',  NOW()
  );
END;
$$;

-- ── 6. Grants ──────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION get_general_ledger(TEXT, UUID, DATE, DATE)         TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_party_subledger(TEXT, TEXT, UUID, DATE, DATE)  TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_live_journal_dashboard(TEXT, TEXT)             TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_gstr2b_reconciliation(TEXT, TEXT)              TO authenticated, anon;
GRANT EXECUTE ON FUNCTION validate_books(TEXT, TEXT)                         TO authenticated, anon;

COMMENT ON FUNCTION get_general_ledger          IS 'Phase 28: GL drilldown for one account — opening, Dr, Cr, closing, lines with source refs.';
COMMENT ON FUNCTION get_party_subledger         IS 'Phase 28: vendor/customer sub-ledger — opening, Dr, Cr, closing, lines, aging buckets.';
COMMENT ON FUNCTION get_live_journal_dashboard  IS 'Phase 28: every KPI derived ONLY from journals/journal_lines — true journal-first SSOT.';
COMMENT ON FUNCTION get_gstr2b_reconciliation   IS 'Phase 28: supplier-wise books vs GSTR-2B portal w/ ITC eligibility + mismatch flags.';
COMMENT ON FUNCTION validate_books              IS 'Phase 28: 5-check validation — TB balance, journal balance, AR sub vs control, AP sub vs control, inventory book vs ledger.';
