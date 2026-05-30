-- ============================================================================
-- PHASE 27 — UNIFIED ENGINE RUNTIME
-- ----------------------------------------------------------------------------
-- Glue RPCs that breathe life into Phase 26's empty intelligence tables:
--
--   1. refresh_reconciliation_status — populates reconciliation_status for
--      all 6 domains (GST 2B, AR, AP, Inventory, Bank, TDS 26AS) by reading
--      books data + external sources already in the DB.
--   2. get_itc_dashboard — the dedicated ITC view called out in the brief:
--      total available / claimed / unclaimed / leakage + vendor filing risk.
--   3. route_expense — Expense Intelligence. Given an expense row, decides
--      whether to route as fixed_asset / inventory / prepaid / expense / cwip,
--      and writes an audit row to expense_routing_log.
--
-- Nothing in this migration creates new transactional tables — it only
-- aggregates from existing journal-first data.
-- ============================================================================

-- ── 1. RPC: refresh_reconciliation_status ──────────────────────────────────
-- Recomputes the 6 reconciliation domains for the user's most recent period.
-- Idempotent — UPSERTs into reconciliation_status (user_id, domain, period).
CREATE OR REPLACE FUNCTION refresh_reconciliation_status(p_user_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_period_mtd      TEXT := to_char(CURRENT_DATE, 'Mon-YYYY');
  v_mtd_start       DATE := date_trunc('month', CURRENT_DATE)::DATE;
  v_mtd_end         DATE := (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE;
  v_fy              TEXT := CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE)::INT >= 4
                                 THEN EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-' ||
                                      RIGHT((EXTRACT(YEAR FROM CURRENT_DATE)+1)::TEXT, 2)
                                 ELSE (EXTRACT(YEAR FROM CURRENT_DATE)-1)::TEXT || '-' ||
                                      RIGHT(EXTRACT(YEAR FROM CURRENT_DATE)::TEXT, 2)
                            END;
  v_fy_start        DATE;
  v_fy_end          DATE;
  v_books_gst       NUMERIC(18,2) := 0;
  v_portal_gst      NUMERIC(18,2) := 0;
  v_invoiced        NUMERIC(18,2) := 0;
  v_received        NUMERIC(18,2) := 0;
  v_billed          NUMERIC(18,2) := 0;
  v_paid            NUMERIC(18,2) := 0;
  v_stock_value     NUMERIC(18,2) := 0;
  v_ledger_value    NUMERIC(18,2) := 0;
  v_book_bal        NUMERIC(18,2) := 0;
  v_bank_bal        NUMERIC(18,2) := 0;
  v_open_bank       INT           := 0;
  v_books_tds       NUMERIC(18,2) := 0;
  v_portal_tds      NUMERIC(18,2) := 0;
  v_open_tds        INT           := 0;
  v_open_ar         INT           := 0;
  v_open_ap         INT           := 0;
  v_domains_run     INT           := 0;
BEGIN
  v_fy_start := make_date(SUBSTRING(v_fy FROM 1 FOR 4)::INT, 4, 1);
  v_fy_end   := make_date(SUBSTRING(v_fy FROM 1 FOR 4)::INT + 1, 3, 31);

  -- ── 1a. GST: Books vs GSTR-2B (current month) ───────────────────────────
  BEGIN
    SELECT COALESCE(SUM(COALESCE(cgst_amount,0) + COALESCE(sgst_amount,0) +
                        COALESCE(igst_amount,0) + COALESCE(cess_amount,0)), 0)
      INTO v_books_gst
    FROM expenses
    WHERE user_id = p_user_id
      AND expense_date BETWEEN v_mtd_start AND v_mtd_end;
  EXCEPTION WHEN undefined_column OR undefined_table THEN v_books_gst := 0;
  END;

  BEGIN
    SELECT COALESCE(SUM(portal_total_igst + portal_total_cgst + portal_total_sgst + portal_total_cess), 0)
      INTO v_portal_gst
    FROM gstr2b_uploads
    WHERE user_id = p_user_id
      AND COALESCE(period, '') = to_char(CURRENT_DATE, 'YYYY-MM');
  EXCEPTION WHEN undefined_column OR undefined_table THEN v_portal_gst := 0;
  END;

  INSERT INTO reconciliation_status (
    user_id, domain, period, books_amount, external_amount, matched_amount, match_pct, open_items, last_run_at
  ) VALUES (
    p_user_id, 'gst_2b', v_period_mtd, v_books_gst, v_portal_gst,
    LEAST(v_books_gst, v_portal_gst),
    CASE WHEN GREATEST(v_books_gst, v_portal_gst) > 0
         THEN ROUND((LEAST(v_books_gst, v_portal_gst) / GREATEST(v_books_gst, v_portal_gst)) * 100, 2)
         ELSE NULL END,
    0, NOW()
  )
  ON CONFLICT (user_id, domain, period) DO UPDATE
    SET books_amount = EXCLUDED.books_amount,
        external_amount = EXCLUDED.external_amount,
        matched_amount  = EXCLUDED.matched_amount,
        match_pct       = EXCLUDED.match_pct,
        last_run_at     = NOW();
  v_domains_run := v_domains_run + 1;

  -- ── 1b. AR: Invoices vs Receipts (FY-to-date) ───────────────────────────
  BEGIN
    SELECT COALESCE(SUM(amount_due), 0), COALESCE(SUM(amount_paid), 0),
           COUNT(*) FILTER (WHERE status <> 'paid')
      INTO v_invoiced, v_received, v_open_ar
    FROM receivables
    WHERE user_id = p_user_id
      AND created_at::DATE BETWEEN v_fy_start AND v_fy_end;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_invoiced := 0; v_received := 0; v_open_ar := 0;
  END;

  INSERT INTO reconciliation_status (
    user_id, domain, period, books_amount, external_amount, matched_amount, match_pct, open_items, last_run_at
  ) VALUES (
    p_user_id, 'ar', 'FY' || v_fy, v_invoiced, v_received, v_received,
    CASE WHEN v_invoiced > 0 THEN ROUND((v_received / v_invoiced) * 100, 2) ELSE NULL END,
    v_open_ar, NOW()
  )
  ON CONFLICT (user_id, domain, period) DO UPDATE
    SET books_amount = EXCLUDED.books_amount,
        external_amount = EXCLUDED.external_amount,
        matched_amount  = EXCLUDED.matched_amount,
        match_pct       = EXCLUDED.match_pct,
        open_items      = EXCLUDED.open_items,
        last_run_at     = NOW();
  v_domains_run := v_domains_run + 1;

  -- ── 1c. AP: Bills vs Payments (FY-to-date) ──────────────────────────────
  BEGIN
    SELECT COALESCE(SUM(amount_due), 0), COALESCE(SUM(amount_paid), 0),
           COUNT(*) FILTER (WHERE status <> 'paid')
      INTO v_billed, v_paid, v_open_ap
    FROM payables
    WHERE user_id = p_user_id
      AND created_at::DATE BETWEEN v_fy_start AND v_fy_end;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_billed := 0; v_paid := 0; v_open_ap := 0;
  END;

  INSERT INTO reconciliation_status (
    user_id, domain, period, books_amount, external_amount, matched_amount, match_pct, open_items, last_run_at
  ) VALUES (
    p_user_id, 'ap', 'FY' || v_fy, v_billed, v_paid, v_paid,
    CASE WHEN v_billed > 0 THEN ROUND((v_paid / v_billed) * 100, 2) ELSE NULL END,
    v_open_ap, NOW()
  )
  ON CONFLICT (user_id, domain, period) DO UPDATE
    SET books_amount = EXCLUDED.books_amount,
        external_amount = EXCLUDED.external_amount,
        matched_amount  = EXCLUDED.matched_amount,
        match_pct       = EXCLUDED.match_pct,
        open_items      = EXCLUDED.open_items,
        last_run_at     = NOW();
  v_domains_run := v_domains_run + 1;

  -- ── 1d. Inventory: Stock (book) vs Ledger movements ─────────────────────
  BEGIN
    -- "Stock" = inventory.stock_quantity × unit_cost (the book asset value)
    SELECT COALESCE(SUM(COALESCE(stock_quantity, 0) * COALESCE(unit_cost, 0)), 0)
      INTO v_stock_value
    FROM inventory
    WHERE user_id = p_user_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN v_stock_value := 0;
  END;

  BEGIN
    -- "Ledger" = sum of (qty_in − qty_out) × unit_cost across all movements
    SELECT COALESCE(SUM((COALESCE(quantity_in, 0) - COALESCE(quantity_out, 0)) * COALESCE(unit_cost, 0)), 0)
      INTO v_ledger_value
    FROM inventory_movements
    WHERE user_id = p_user_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN v_ledger_value := 0;
  END;

  INSERT INTO reconciliation_status (
    user_id, domain, period, books_amount, external_amount, matched_amount, match_pct, open_items, last_run_at
  ) VALUES (
    p_user_id, 'inventory', 'FY' || v_fy, v_stock_value, v_ledger_value,
    LEAST(v_stock_value, v_ledger_value),
    CASE WHEN GREATEST(v_stock_value, v_ledger_value) > 0
         THEN ROUND((LEAST(v_stock_value, v_ledger_value) / GREATEST(v_stock_value, v_ledger_value)) * 100, 2)
         ELSE NULL END,
    0, NOW()
  )
  ON CONFLICT (user_id, domain, period) DO UPDATE
    SET books_amount = EXCLUDED.books_amount,
        external_amount = EXCLUDED.external_amount,
        matched_amount  = EXCLUDED.matched_amount,
        match_pct       = EXCLUDED.match_pct,
        last_run_at     = NOW();
  v_domains_run := v_domains_run + 1;

  -- ── 1e. Bank: Books (matched journals) vs Statement ─────────────────────
  BEGIN
    SELECT COALESCE(SUM(credit), 0) - COALESCE(SUM(debit), 0),
           COALESCE(SUM(credit) FILTER (WHERE status = 'matched'), 0)
             - COALESCE(SUM(debit) FILTER (WHERE status = 'matched'), 0),
           COUNT(*) FILTER (WHERE status <> 'matched')
      INTO v_bank_bal, v_book_bal, v_open_bank
    FROM bank_statements
    WHERE user_id = p_user_id
      AND transaction_date BETWEEN v_mtd_start AND v_mtd_end;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_bank_bal := 0; v_book_bal := 0; v_open_bank := 0;
  END;

  INSERT INTO reconciliation_status (
    user_id, domain, period, books_amount, external_amount, matched_amount, match_pct, open_items, last_run_at
  ) VALUES (
    p_user_id, 'bank', v_period_mtd, v_book_bal, v_bank_bal, v_book_bal,
    CASE WHEN ABS(v_bank_bal) > 0 THEN ROUND((ABS(v_book_bal) / ABS(v_bank_bal)) * 100, 2) ELSE NULL END,
    v_open_bank, NOW()
  )
  ON CONFLICT (user_id, domain, period) DO UPDATE
    SET books_amount = EXCLUDED.books_amount,
        external_amount = EXCLUDED.external_amount,
        matched_amount  = EXCLUDED.matched_amount,
        match_pct       = EXCLUDED.match_pct,
        open_items      = EXCLUDED.open_items,
        last_run_at     = NOW();
  v_domains_run := v_domains_run + 1;

  -- ── 1f. TDS 26AS: Books vs 26AS (FY-to-date) ────────────────────────────
  BEGIN
    SELECT COALESCE(SUM(tds_amount), 0)
      INTO v_books_tds
    FROM tds_book_entries
    WHERE user_id = p_user_id AND fiscal_year = v_fy;
  EXCEPTION WHEN undefined_table OR undefined_column THEN v_books_tds := 0;
  END;

  BEGIN
    SELECT COALESCE(SUM(tds_amount), 0),
           COUNT(*) FILTER (WHERE COALESCE(match_status, 'unmatched') <> 'matched')
      INTO v_portal_tds, v_open_tds
    FROM tds_26as_entries
    WHERE user_id = p_user_id AND fiscal_year = v_fy;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_portal_tds := 0; v_open_tds := 0;
  END;

  INSERT INTO reconciliation_status (
    user_id, domain, period, books_amount, external_amount, matched_amount, match_pct, open_items, last_run_at
  ) VALUES (
    p_user_id, 'tds_26as', 'FY' || v_fy, v_books_tds, v_portal_tds,
    LEAST(v_books_tds, v_portal_tds),
    CASE WHEN GREATEST(v_books_tds, v_portal_tds) > 0
         THEN ROUND((LEAST(v_books_tds, v_portal_tds) / GREATEST(v_books_tds, v_portal_tds)) * 100, 2)
         ELSE NULL END,
    v_open_tds, NOW()
  )
  ON CONFLICT (user_id, domain, period) DO UPDATE
    SET books_amount = EXCLUDED.books_amount,
        external_amount = EXCLUDED.external_amount,
        matched_amount  = EXCLUDED.matched_amount,
        match_pct       = EXCLUDED.match_pct,
        open_items      = EXCLUDED.open_items,
        last_run_at     = NOW();
  v_domains_run := v_domains_run + 1;

  RETURN jsonb_build_object(
    'domains_refreshed', v_domains_run,
    'fiscal_year',       v_fy,
    'period_mtd',        v_period_mtd,
    'ran_at',            NOW()
  );
END;
$$;

-- ── 2. RPC: get_itc_dashboard ──────────────────────────────────────────────
-- Dedicated ITC view called out by the brief.
CREATE OR REPLACE FUNCTION get_itc_dashboard(
  p_user_id     TEXT,
  p_fiscal_year TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_fy              TEXT := COALESCE(p_fiscal_year,
                              CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE)::INT >= 4
                                   THEN EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-' ||
                                        RIGHT((EXTRACT(YEAR FROM CURRENT_DATE)+1)::TEXT, 2)
                                   ELSE (EXTRACT(YEAR FROM CURRENT_DATE)-1)::TEXT || '-' ||
                                        RIGHT(EXTRACT(YEAR FROM CURRENT_DATE)::TEXT, 2)
                              END);
  v_fy_start        DATE;
  v_fy_end          DATE;
  v_available       NUMERIC(18,2) := 0;
  v_claimed         NUMERIC(18,2) := 0;
  v_unclaimed       NUMERIC(18,2) := 0;
  v_blocked         NUMERIC(18,2) := 0;
  v_rcm             NUMERIC(18,2) := 0;
  v_reversed        NUMERIC(18,2) := 0;
  v_leakage         NUMERIC(18,2) := 0;
  v_by_component    JSONB := '[]'::jsonb;
  v_by_status       JSONB := '[]'::jsonb;
  v_vendor_risk     JSONB := '[]'::jsonb;
BEGIN
  v_fy_start := make_date(SUBSTRING(v_fy FROM 1 FOR 4)::INT, 4, 1);
  v_fy_end   := make_date(SUBSTRING(v_fy FROM 1 FOR 4)::INT + 1, 3, 31);

  SELECT
    COALESCE(SUM(gst_amount) FILTER (WHERE itc_status IN ('eligible','pending')), 0),
    COALESCE(SUM(gst_amount) FILTER (WHERE itc_status = 'claimed'), 0),
    COALESCE(SUM(gst_amount) FILTER (WHERE itc_status = 'pending'), 0),
    COALESCE(SUM(gst_amount) FILTER (WHERE itc_status = 'blocked'), 0),
    COALESCE(SUM(gst_amount) FILTER (WHERE itc_status = 'rcm'), 0),
    COALESCE(SUM(gst_amount) FILTER (WHERE itc_status = 'reversed'), 0)
  INTO v_available, v_claimed, v_unclaimed, v_blocked, v_rcm, v_reversed
  FROM itc_classifications
  WHERE user_id = p_user_id
    AND bill_date BETWEEN v_fy_start AND v_fy_end;

  v_leakage := GREATEST(v_available - v_claimed, 0);

  -- Breakdown by component (cgst/sgst/igst/utgst/cess)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'component', gst_component,
           'eligible',  eligible_amt,
           'claimed',   claimed_amt,
           'blocked',   blocked_amt
         ) ORDER BY gst_component), '[]'::jsonb)
    INTO v_by_component
  FROM (
    SELECT gst_component,
           COALESCE(SUM(gst_amount) FILTER (WHERE itc_status IN ('eligible','pending')), 0) AS eligible_amt,
           COALESCE(SUM(gst_amount) FILTER (WHERE itc_status = 'claimed'), 0)               AS claimed_amt,
           COALESCE(SUM(gst_amount) FILTER (WHERE itc_status = 'blocked'), 0)               AS blocked_amt
    FROM itc_classifications
    WHERE user_id = p_user_id AND bill_date BETWEEN v_fy_start AND v_fy_end
    GROUP BY gst_component
  ) t;

  -- Breakdown by status (for chart)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'status', itc_status, 'amount', total, 'count', cnt
         ) ORDER BY total DESC), '[]'::jsonb)
    INTO v_by_status
  FROM (
    SELECT itc_status, SUM(gst_amount) AS total, COUNT(*) AS cnt
    FROM itc_classifications
    WHERE user_id = p_user_id AND bill_date BETWEEN v_fy_start AND v_fy_end
    GROUP BY itc_status
  ) t;

  -- Vendor filing risk: vendors with unclaimed ITC for > 60 days
  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'vendor',        vendor_name,
             'unclaimed_itc', unclaimed,
             'bill_count',    cnt,
             'oldest_days',   oldest_days,
             'risk_level',    CASE
               WHEN oldest_days > 180 THEN 'critical'
               WHEN oldest_days > 90  THEN 'high'
               WHEN oldest_days > 60  THEN 'medium'
               ELSE 'low' END
           ) ORDER BY unclaimed DESC), '[]'::jsonb)
      INTO v_vendor_risk
    FROM (
      SELECT
        COALESCE(e.vendor, 'Unknown') AS vendor_name,
        SUM(ic.gst_amount)            AS unclaimed,
        COUNT(DISTINCT ic.bill_id)    AS cnt,
        (CURRENT_DATE - MIN(ic.bill_date))::INT AS oldest_days
      FROM itc_classifications ic
      LEFT JOIN expenses e ON e.id = ic.bill_id AND e.user_id = ic.user_id
      WHERE ic.user_id = p_user_id
        AND ic.bill_date BETWEEN v_fy_start AND v_fy_end
        AND ic.itc_status IN ('eligible','pending')
      GROUP BY COALESCE(e.vendor, 'Unknown')
      HAVING SUM(ic.gst_amount) > 0
      ORDER BY unclaimed DESC
      LIMIT 10
    ) t;
  EXCEPTION WHEN undefined_column OR undefined_table THEN v_vendor_risk := '[]'::jsonb;
  END;

  RETURN jsonb_build_object(
    'fiscal_year',     v_fy,
    'total_available', v_available,
    'claimed',         v_claimed,
    'unclaimed',       v_unclaimed,
    'blocked',         v_blocked,
    'rcm',             v_rcm,
    'reversed',        v_reversed,
    'leakage',         v_leakage,
    'by_component',    v_by_component,
    'by_status',       v_by_status,
    'vendor_risk',     v_vendor_risk,
    'generated_at',    NOW()
  );
END;
$$;

-- ── 3. RPC: route_expense ──────────────────────────────────────────────────
-- Expense Intelligence. Reads an expense row + user-supplied hints, decides
-- the routing (fixed_asset / inventory_purchase / prepaid_expense / expense /
-- cwip / blocked) and writes one audit row to expense_routing_log.
--
-- Routing rules:
--   * is_blocked_itc=true     → routed_as='blocked'
--   * inventory hint matches  → 'inventory_purchase'
--   * useful_life >= 1y AND
--     amount >= capitalization_threshold
--                             → 'fixed_asset'
--   * useful_life >= 1y AND
--     amount <  threshold     → 'expense' (below-threshold capex written off)
--   * prepaid_months > 1      → 'prepaid_expense'
--   * cwip hint               → 'cwip'
--   * else                    → 'expense'
CREATE OR REPLACE FUNCTION route_expense(
  p_user_id                  TEXT,
  p_expense_id               UUID,
  p_capitalization_threshold NUMERIC DEFAULT 5000,
  p_hints                    JSONB   DEFAULT '{}'::jsonb
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_exp        RECORD;
  v_amt        NUMERIC(18,2);
  v_category   TEXT;
  v_routed     TEXT;
  v_reason     TEXT;
  v_useful_life      INT     := COALESCE((p_hints->>'useful_life_months')::INT, 0);
  v_prepaid_months   INT     := COALESCE((p_hints->>'prepaid_months')::INT, 0);
  v_is_inventory     BOOLEAN := COALESCE((p_hints->>'is_inventory')::BOOLEAN, FALSE);
  v_is_cwip          BOOLEAN := COALESCE((p_hints->>'is_cwip')::BOOLEAN, FALSE);
  v_is_blocked_itc   BOOLEAN := COALESCE((p_hints->>'is_blocked_itc')::BOOLEAN, FALSE);
  v_gst_treatment    TEXT    := COALESCE(p_hints->>'gst_treatment', 'eligible_itc');
  v_cost_center      UUID    := NULLIF(p_hints->>'cost_center_id', '')::UUID;
  v_project          UUID    := NULLIF(p_hints->>'project_id', '')::UUID;
BEGIN
  BEGIN
    SELECT id, vendor, expense_date,
           COALESCE(category_name, '')      AS category,
           COALESCE(total_amount, amount)   AS amt,
           COALESCE(notes, '')              AS notes
      INTO v_exp
    FROM expenses
    WHERE id = p_expense_id AND user_id = p_user_id;
  EXCEPTION WHEN undefined_column OR undefined_table THEN
    RETURN jsonb_build_object('error', 'unsupported_schema');
  END;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'expense_not_found');
  END IF;

  v_amt      := COALESCE(v_exp.amt, 0);
  v_category := LOWER(COALESCE(v_exp.category, ''));

  -- Decision tree
  IF v_is_blocked_itc THEN
    v_routed := 'blocked';
    v_reason := 'GST input tax credit blocked (§17(5))';
  ELSIF v_is_inventory OR v_category ~* '(inventory|stock|raw material|goods)' THEN
    v_routed := 'inventory_purchase';
    v_reason := 'Routed to Inventory — increases stock on hand';
  ELSIF v_is_cwip THEN
    v_routed := 'cwip';
    v_reason := 'Capital Work in Progress — asset not yet ready for use';
  ELSIF v_useful_life >= 12 THEN
    IF v_amt >= p_capitalization_threshold THEN
      v_routed := 'fixed_asset';
      v_reason := 'Useful life ≥ 12 months and amount ≥ capitalization threshold (' ||
                  p_capitalization_threshold::TEXT || ')';
    ELSE
      v_routed := 'expense';
      v_reason := 'Useful life ≥ 12 months but amount below threshold — expensed';
    END IF;
  ELSIF v_prepaid_months > 1 THEN
    v_routed := 'prepaid_expense';
    v_reason := 'Prepaid for ' || v_prepaid_months::TEXT || ' months — to be amortized';
  ELSE
    v_routed := 'expense';
    v_reason := 'Standard period expense';
  END IF;

  -- Audit log row (one per call — caller can run multiple times for what-ifs)
  INSERT INTO expense_routing_log (
    user_id, expense_id, expense_date, amount, routed_as, routing_reason,
    cost_center_id, project_id, gst_treatment
  ) VALUES (
    p_user_id, p_expense_id, v_exp.expense_date, v_amt, v_routed, v_reason,
    v_cost_center, v_project, v_gst_treatment
  );

  RETURN jsonb_build_object(
    'expense_id',    p_expense_id,
    'routed_as',     v_routed,
    'reason',        v_reason,
    'amount',        v_amt,
    'gst_treatment', v_gst_treatment,
    'capitalization_threshold', p_capitalization_threshold
  );
END;
$$;

-- ── 4. Grants ──────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION refresh_reconciliation_status(TEXT)                          TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_itc_dashboard(TEXT, TEXT)                                TO authenticated, anon;
GRANT EXECUTE ON FUNCTION route_expense(TEXT, UUID, NUMERIC, JSONB)                    TO authenticated, anon;

COMMENT ON FUNCTION refresh_reconciliation_status IS
  'Phase 27: populates reconciliation_status table for all 6 domains (GST 2B, AR, AP, Inventory, Bank, TDS 26AS) by aggregating books vs external sources already in the DB.';

COMMENT ON FUNCTION get_itc_dashboard IS
  'Phase 27: dedicated ITC dashboard — total available / claimed / unclaimed / leakage + by-component, by-status, vendor filing risk.';

COMMENT ON FUNCTION route_expense IS
  'Phase 27: Expense Intelligence routing engine. Decides Fixed Asset / Inventory / Prepaid / Expense / CWIP / Blocked based on amount, useful life, category hints. Writes audit row to expense_routing_log.';
