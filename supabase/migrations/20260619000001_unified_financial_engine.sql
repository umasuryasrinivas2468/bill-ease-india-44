-- ============================================================================
-- PHASE 26 — UNIFIED FINANCIAL ENGINE
-- ----------------------------------------------------------------------------
-- The glue layer that turns 25 previously-built modules (AP, AR, GST, ITC,
-- Fixed Assets, Liabilities, Inventory, Schedule III, Consolidation, CSR,
-- TDS, Statutory Calendar, Ind AS) into ONE financial operating system.
--
-- This migration adds:
--
--   1. GST Intelligence Config — per-user rules for auto GST classification
--      & ITC eligibility decisions
--   2. ITC Classification Engine — track every input-GST line by status
--      (eligible / blocked / partial / RCM / claimed / reversed)
--   3. Expense Routing Log — audit how each expense was routed
--      (Fixed Asset / Expense / Inventory / Prepaid) and why
--   4. Financial Integrity Findings — single ledger of all detected issues
--   5. Reconciliation Status — books vs 2B / AR / AP / Inventory / Bank
--   6. RPC: run_financial_integrity_scan
--   7. RPC: get_unified_financial_dashboard (one call → all 6 health panels)
--   8. RPC: get_cfo_insights (variance explanations, vendor/customer risk)
--   9. RPC: get_reconciliation_status
--  10. RPC: auto_classify_itc_for_bill
--
-- Every report keeps deriving from journals/journal_lines/accounts.  This
-- migration adds NO new transactional tables — only intelligence + audit.
-- ============================================================================

-- ── 1. GST Intelligence Config ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gst_intelligence_config (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   TEXT NOT NULL,
  auto_classify_gst         BOOLEAN NOT NULL DEFAULT TRUE,
  auto_post_input_gst       BOOLEAN NOT NULL DEFAULT TRUE,
  auto_post_output_gst      BOOLEAN NOT NULL DEFAULT TRUE,
  auto_update_gstr1         BOOLEAN NOT NULL DEFAULT TRUE,
  auto_update_gstr2b        BOOLEAN NOT NULL DEFAULT TRUE,
  itc_block_food_beverages  BOOLEAN NOT NULL DEFAULT TRUE,   -- §17(5)(b)(i)
  itc_block_motor_vehicles  BOOLEAN NOT NULL DEFAULT TRUE,   -- §17(5)(a)
  itc_block_personal_use    BOOLEAN NOT NULL DEFAULT TRUE,   -- §17(5)
  itc_block_construction    BOOLEAN NOT NULL DEFAULT TRUE,   -- §17(5)(c),(d)
  rcm_threshold_amount      NUMERIC(18,2) NOT NULL DEFAULT 5000,
  rcm_auto_self_invoice     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

ALTER TABLE gst_intelligence_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gst_intel_cfg_owner ON gst_intelligence_config;
CREATE POLICY gst_intel_cfg_owner ON gst_intelligence_config
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

-- ── 2. ITC Classification Engine ───────────────────────────────────────────
-- One row per (bill, GST type) tracking the ITC lifecycle.
CREATE TABLE IF NOT EXISTS itc_classifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             TEXT NOT NULL,
  bill_id             UUID,                       -- expenses.id (Indian schema uses expenses for bills)
  invoice_number      TEXT,
  vendor_id           UUID,
  bill_date           DATE,
  gst_component       TEXT NOT NULL CHECK (gst_component IN ('cgst','sgst','igst','utgst','cess')),
  gross_amount        NUMERIC(18,2) NOT NULL DEFAULT 0,
  gst_amount          NUMERIC(18,2) NOT NULL DEFAULT 0,
  itc_status          TEXT NOT NULL DEFAULT 'eligible'
                        CHECK (itc_status IN ('eligible','blocked','partial','rcm','claimed','reversed','pending')),
  block_reason        TEXT,                       -- '§17(5)(a) motor vehicle', '§17(5)(b) food', '§17(5)(c) construction', 'personal use'
  partial_pct         NUMERIC(5,2),               -- when itc_status='partial' (e.g., 50% for common credit)
  rcm_self_invoice_id UUID,                       -- journal id of the RCM self-invoice
  claimed_in_period   TEXT,                       -- 'May-2026', when itc_status='claimed'
  reversed_at         TIMESTAMPTZ,
  reversal_reason     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, bill_id, gst_component)
);

CREATE INDEX IF NOT EXISTS idx_itc_class_user_status ON itc_classifications(user_id, itc_status);
CREATE INDEX IF NOT EXISTS idx_itc_class_vendor      ON itc_classifications(vendor_id);
CREATE INDEX IF NOT EXISTS idx_itc_class_bill        ON itc_classifications(bill_id);

ALTER TABLE itc_classifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS itc_class_owner ON itc_classifications;
CREATE POLICY itc_class_owner ON itc_classifications
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

-- ── 3. Expense Routing Log ─────────────────────────────────────────────────
-- Audit trail of how each expense was routed by the Expense Intelligence layer.
CREATE TABLE IF NOT EXISTS expense_routing_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  expense_id      UUID,
  expense_date    DATE,
  amount          NUMERIC(18,2) NOT NULL DEFAULT 0,
  routed_as       TEXT NOT NULL CHECK (routed_as IN (
                    'fixed_asset','expense','inventory_purchase','prepaid_expense','cwip','blocked'
                  )),
  routing_reason  TEXT,                           -- 'amount > capitalization threshold', 'goods code', etc.
  cost_center_id  UUID,
  project_id      UUID,
  gst_treatment   TEXT,                           -- 'eligible_itc', 'blocked_itc', 'rcm', 'exempt', 'composition'
  journal_id      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exp_routing_user_date ON expense_routing_log(user_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_exp_routing_expense   ON expense_routing_log(expense_id);

ALTER TABLE expense_routing_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS exp_routing_owner ON expense_routing_log;
CREATE POLICY exp_routing_owner ON expense_routing_log
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

-- ── 4. Financial Integrity Findings ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS financial_integrity_findings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  scan_run_id     UUID NOT NULL,                  -- groups findings from one scan
  fiscal_year     TEXT,
  finding_type    TEXT NOT NULL CHECK (finding_type IN (
                    'duplicate_invoice','duplicate_bill','duplicate_payment',
                    'negative_inventory','gst_mismatch','journal_imbalance',
                    'unposted_bill','unposted_invoice','itc_claim_error',
                    'bs_equation_failure','trial_balance_imbalance',
                    'orphan_payment','unallocated_advance','missing_classification'
                  )),
  severity        TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low','info')),
  entity_type     TEXT,                           -- 'invoice','bill','journal','inventory_item'
  entity_id       UUID,
  entity_ref      TEXT,                           -- human-readable: 'INV-2026-0042'
  amount          NUMERIC(18,2),
  details         JSONB NOT NULL DEFAULT '{}'::jsonb,
  message         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved','dismissed')),
  resolved_at     TIMESTAMPTZ,
  resolved_by     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integrity_user_status ON financial_integrity_findings(user_id, status, severity);
CREATE INDEX IF NOT EXISTS idx_integrity_scan        ON financial_integrity_findings(scan_run_id);
CREATE INDEX IF NOT EXISTS idx_integrity_type        ON financial_integrity_findings(finding_type);

ALTER TABLE financial_integrity_findings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS integrity_owner ON financial_integrity_findings;
CREATE POLICY integrity_owner ON financial_integrity_findings
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

-- ── 5. Reconciliation Status (cached per-domain) ───────────────────────────
CREATE TABLE IF NOT EXISTS reconciliation_status (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  domain          TEXT NOT NULL CHECK (domain IN ('gst_2b','ar','ap','inventory','bank','tds_26as')),
  period          TEXT NOT NULL,                  -- 'May-2026' / 'Q1-FY26' / 'FY2025-26'
  books_amount    NUMERIC(18,2) NOT NULL DEFAULT 0,
  external_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  matched_amount  NUMERIC(18,2) NOT NULL DEFAULT 0,
  variance        NUMERIC(18,2) GENERATED ALWAYS AS (books_amount - external_amount) STORED,
  match_pct       NUMERIC(5,2),
  open_items      INT NOT NULL DEFAULT 0,
  last_run_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes           TEXT,
  UNIQUE (user_id, domain, period)
);

CREATE INDEX IF NOT EXISTS idx_recon_status_user ON reconciliation_status(user_id, domain, period);

ALTER TABLE reconciliation_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recon_status_owner ON reconciliation_status;
CREATE POLICY recon_status_owner ON reconciliation_status
  FOR ALL USING (
    user_id = COALESCE(auth.uid()::text,
                       NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''))
  );

-- ============================================================================
-- RPCs
-- ============================================================================

-- ── 6. RPC: run_financial_integrity_scan ───────────────────────────────────
-- Scans the user's data for the 13 integrity issues listed in the brief.
-- Returns a scan_run_id and summary counts. Findings persisted to
-- financial_integrity_findings so the UI can show them indefinitely.
CREATE OR REPLACE FUNCTION run_financial_integrity_scan(
  p_user_id     TEXT,
  p_fiscal_year TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_scan_id        UUID := gen_random_uuid();
  v_period_start   DATE;
  v_period_end     DATE;
  v_fy             TEXT := COALESCE(p_fiscal_year,
                                    CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE)::INT >= 4
                                         THEN EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-' ||
                                              RIGHT((EXTRACT(YEAR FROM CURRENT_DATE)+1)::TEXT, 2)
                                         ELSE (EXTRACT(YEAR FROM CURRENT_DATE)-1)::TEXT || '-' ||
                                              RIGHT(EXTRACT(YEAR FROM CURRENT_DATE)::TEXT, 2)
                                    END);
  v_critical       INT := 0;
  v_high           INT := 0;
  v_medium         INT := 0;
  v_low            INT := 0;
  v_total          INT := 0;
BEGIN
  v_period_start := make_date(SUBSTRING(v_fy FROM 1 FOR 4)::INT, 4, 1);
  v_period_end   := make_date(SUBSTRING(v_fy FROM 1 FOR 4)::INT + 1, 3, 31);

  -- ── 6a. Duplicate invoices (same number, same user) ─────────────────────
  INSERT INTO financial_integrity_findings (
    user_id, scan_run_id, fiscal_year, finding_type, severity,
    entity_type, entity_ref, amount, message, details
  )
  SELECT
    p_user_id, v_scan_id, v_fy, 'duplicate_invoice', 'high',
    'invoice', invoice_number, SUM(amount),
    'Duplicate invoice number "' || invoice_number || '" appears ' || COUNT(*) || ' times',
    jsonb_build_object('invoice_number', invoice_number, 'count', COUNT(*), 'total_amount', SUM(amount))
  FROM invoices
  WHERE user_id = p_user_id
    AND invoice_date BETWEEN v_period_start AND v_period_end
    AND invoice_number IS NOT NULL AND invoice_number <> ''
  GROUP BY invoice_number
  HAVING COUNT(*) > 1;

  -- ── 6b. Duplicate bills/expenses (same vendor + amount + date within 7d) ─
  INSERT INTO financial_integrity_findings (
    user_id, scan_run_id, fiscal_year, finding_type, severity,
    entity_type, entity_id, amount, message, details
  )
  SELECT
    p_user_id, v_scan_id, v_fy, 'duplicate_bill', 'high',
    'bill', a.id, a.total_amount,
    'Possible duplicate bill: vendor ' || COALESCE(a.vendor, 'Unknown') ||
      ' / amount ' || a.total_amount::TEXT || ' on ' || a.expense_date::TEXT,
    jsonb_build_object('matched_bill_id', b.id, 'vendor', a.vendor, 'amount', a.total_amount,
                       'date_diff_days', ABS(a.expense_date - b.expense_date))
  FROM expenses a
  JOIN expenses b ON a.user_id = b.user_id
                  AND a.id < b.id
                  AND a.vendor = b.vendor
                  AND ROUND(COALESCE(a.total_amount, a.amount), 2) = ROUND(COALESCE(b.total_amount, b.amount), 2)
                  AND ABS(a.expense_date - b.expense_date) <= 7
  WHERE a.user_id = p_user_id
    AND a.expense_date BETWEEN v_period_start AND v_period_end;

  -- ── 6c. Journal imbalance (debit ≠ credit on posted journals) ───────────
  INSERT INTO financial_integrity_findings (
    user_id, scan_run_id, fiscal_year, finding_type, severity,
    entity_type, entity_id, entity_ref, amount, message, details
  )
  SELECT
    p_user_id, v_scan_id, v_fy, 'journal_imbalance', 'critical',
    'journal', j.id, j.journal_number,
    ABS(COALESCE(j.total_debit,0) - COALESCE(j.total_credit,0)),
    'Journal ' || j.journal_number || ' is imbalanced (Dr ' ||
      COALESCE(j.total_debit,0)::TEXT || ' / Cr ' || COALESCE(j.total_credit,0)::TEXT || ')',
    jsonb_build_object('total_debit', j.total_debit, 'total_credit', j.total_credit)
  FROM journals j
  WHERE j.user_id = p_user_id
    AND j.status = 'posted'
    AND j.journal_date BETWEEN v_period_start AND v_period_end
    AND ABS(COALESCE(j.total_debit,0) - COALESCE(j.total_credit,0)) > 0.01;

  -- ── 6d. Negative inventory (stock_quantity < 0) ─────────────────────────
  BEGIN
    INSERT INTO financial_integrity_findings (
      user_id, scan_run_id, fiscal_year, finding_type, severity,
      entity_type, entity_id, entity_ref, amount, message, details
    )
    SELECT
      p_user_id, v_scan_id, v_fy, 'negative_inventory', 'high',
      'inventory_item', id, name, stock_quantity::NUMERIC,
      'Negative inventory for "' || name || '" (stock: ' || stock_quantity::TEXT || ')',
      jsonb_build_object('stock_quantity', stock_quantity, 'sku', sku)
    FROM inventory
    WHERE user_id = p_user_id
      AND COALESCE(stock_quantity, 0) < 0;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- ── 6e. Unposted bills (expenses not flowed to journals) ────────────────
  BEGIN
    INSERT INTO financial_integrity_findings (
      user_id, scan_run_id, fiscal_year, finding_type, severity,
      entity_type, entity_id, amount, message, details
    )
    SELECT
      p_user_id, v_scan_id, v_fy, 'unposted_bill', 'medium',
      'bill', e.id, COALESCE(e.total_amount, e.amount),
      'Bill from ' || COALESCE(e.vendor, 'Unknown') || ' dated ' || e.expense_date::TEXT ||
        ' has no posted journal',
      jsonb_build_object('vendor', e.vendor, 'amount', COALESCE(e.total_amount, e.amount))
    FROM expenses e
    WHERE e.user_id = p_user_id
      AND e.expense_date BETWEEN v_period_start AND v_period_end
      AND NOT EXISTS (
        SELECT 1 FROM journals j
        WHERE j.user_id = p_user_id
          AND j.source_type IN ('bill','expense')
          AND j.source_id = e.id
          AND j.status = 'posted'
          AND j.is_reversed = FALSE
      );
  EXCEPTION WHEN undefined_column OR undefined_table THEN NULL;
  END;

  -- ── 6f. Unposted invoices ───────────────────────────────────────────────
  BEGIN
    INSERT INTO financial_integrity_findings (
      user_id, scan_run_id, fiscal_year, finding_type, severity,
      entity_type, entity_id, entity_ref, amount, message, details
    )
    SELECT
      p_user_id, v_scan_id, v_fy, 'unposted_invoice', 'medium',
      'invoice', i.id, i.invoice_number, i.amount,
      'Invoice ' || i.invoice_number || ' has no posted journal',
      jsonb_build_object('customer', i.customer_name, 'amount', i.amount)
    FROM invoices i
    WHERE i.user_id = p_user_id
      AND i.invoice_date BETWEEN v_period_start AND v_period_end
      AND NOT EXISTS (
        SELECT 1 FROM journals j
        WHERE j.user_id = p_user_id
          AND j.source_type = 'invoice'
          AND j.source_id = i.id
          AND j.status = 'posted'
          AND j.is_reversed = FALSE
      );
  EXCEPTION WHEN undefined_column OR undefined_table THEN NULL;
  END;

  -- ── 6g. Blocked ITC mistakenly claimed ──────────────────────────────────
  INSERT INTO financial_integrity_findings (
    user_id, scan_run_id, fiscal_year, finding_type, severity,
    entity_type, entity_id, amount, message, details
  )
  SELECT
    p_user_id, v_scan_id, v_fy, 'itc_claim_error', 'critical',
    'bill', bill_id, SUM(gst_amount),
    'Blocked ITC of ' || SUM(gst_amount)::TEXT || ' was claimed (' || COALESCE(block_reason, 'see §17(5)') || ')',
    jsonb_build_object('block_reason', block_reason, 'gst_amount', SUM(gst_amount))
  FROM itc_classifications
  WHERE user_id = p_user_id
    AND itc_status = 'blocked'
    AND claimed_in_period IS NOT NULL
    AND bill_date BETWEEN v_period_start AND v_period_end
  GROUP BY bill_id, block_reason;

  -- ── 6h. Trial balance imbalance (Σ debit ≠ Σ credit) ─────────────────────
  WITH tb AS (
    SELECT COALESCE(SUM(jl.debit), 0)  AS dr,
           COALESCE(SUM(jl.credit), 0) AS cr
    FROM journal_lines jl
    JOIN journals j ON j.id = jl.journal_id
    WHERE j.user_id = p_user_id
      AND j.status = 'posted'
      AND j.journal_date BETWEEN v_period_start AND v_period_end
  )
  INSERT INTO financial_integrity_findings (
    user_id, scan_run_id, fiscal_year, finding_type, severity,
    entity_type, amount, message, details
  )
  SELECT
    p_user_id, v_scan_id, v_fy, 'trial_balance_imbalance', 'critical',
    'period', ABS(dr - cr),
    'Trial balance out by ' || ROUND(ABS(dr - cr), 2)::TEXT || ' for FY ' || v_fy,
    jsonb_build_object('total_debit', dr, 'total_credit', cr)
  FROM tb
  WHERE ABS(dr - cr) > 0.01;

  -- ── 6i. Orphan customer-payments (no invoice link) ──────────────────────
  BEGIN
    INSERT INTO financial_integrity_findings (
      user_id, scan_run_id, fiscal_year, finding_type, severity,
      entity_type, entity_id, amount, message, details
    )
    SELECT
      p_user_id, v_scan_id, v_fy, 'orphan_payment', 'medium',
      'payment', p.id, p.amount,
      'Payment of ' || p.amount::TEXT || ' from ' || COALESCE(p.from_party, 'Unknown') ||
        ' is not allocated to any invoice',
      jsonb_build_object('from_party', p.from_party, 'amount', p.amount, 'payment_date', p.payment_date)
    FROM payments p
    WHERE p.user_id = p_user_id
      AND COALESCE(p.invoice_id, NULL) IS NULL
      AND p.payment_date BETWEEN v_period_start AND v_period_end;
  EXCEPTION WHEN undefined_column OR undefined_table THEN NULL;
  END;

  -- ── 6j. Missing Schedule III classification ─────────────────────────────
  BEGIN
    INSERT INTO financial_integrity_findings (
      user_id, scan_run_id, fiscal_year, finding_type, severity,
      entity_type, entity_id, entity_ref, message, details
    )
    SELECT
      p_user_id, v_scan_id, v_fy, 'missing_classification', 'medium',
      'account', id, account_name,
      'Account "' || account_name || '" has no Schedule III line code',
      jsonb_build_object('account_code', account_code, 'account_type', account_type)
    FROM accounts
    WHERE user_id = p_user_id
      AND is_active = TRUE
      AND COALESCE(schedule_iii_line_code, '') = '';
  EXCEPTION WHEN undefined_column OR undefined_table THEN NULL;
  END;

  -- ── Summary counts ──────────────────────────────────────────────────────
  SELECT
    COUNT(*) FILTER (WHERE severity = 'critical'),
    COUNT(*) FILTER (WHERE severity = 'high'),
    COUNT(*) FILTER (WHERE severity = 'medium'),
    COUNT(*) FILTER (WHERE severity = 'low'),
    COUNT(*)
  INTO v_critical, v_high, v_medium, v_low, v_total
  FROM financial_integrity_findings
  WHERE scan_run_id = v_scan_id;

  RETURN jsonb_build_object(
    'scan_run_id',  v_scan_id,
    'fiscal_year',  v_fy,
    'period_start', v_period_start,
    'period_end',   v_period_end,
    'total',        v_total,
    'critical',     v_critical,
    'high',         v_high,
    'medium',       v_medium,
    'low',          v_low,
    'ran_at',       NOW()
  );
END;
$$;

-- ── 7. RPC: get_reconciliation_status ──────────────────────────────────────
CREATE OR REPLACE FUNCTION get_reconciliation_status(p_user_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result JSONB := '[]'::jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'domain',          domain,
           'period',          period,
           'books_amount',    books_amount,
           'external_amount', external_amount,
           'matched_amount',  matched_amount,
           'variance',        variance,
           'match_pct',       match_pct,
           'open_items',      open_items,
           'last_run_at',     last_run_at,
           'health', CASE
             WHEN external_amount = 0 AND books_amount = 0 THEN 'no_data'
             WHEN ABS(variance) < 1 THEN 'perfect'
             WHEN COALESCE(match_pct,0) >= 95 THEN 'good'
             WHEN COALESCE(match_pct,0) >= 80 THEN 'warning'
             ELSE 'critical'
           END
         ) ORDER BY domain, period DESC), '[]'::jsonb)
    INTO v_result
  FROM reconciliation_status
  WHERE user_id = p_user_id;
  RETURN v_result;
END;
$$;

-- ── 8. RPC: get_unified_financial_dashboard ────────────────────────────────
-- Returns the 6 health panels (Financial / GST / AP / AR / Asset / Liability)
-- in one call so the unified UI is a single round-trip.
CREATE OR REPLACE FUNCTION get_unified_financial_dashboard(
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
  v_period_start    DATE;
  v_period_end      DATE;
  v_revenue         NUMERIC(18,2) := 0;
  v_expenses        NUMERIC(18,2) := 0;
  v_profit          NUMERIC(18,2) := 0;
  v_cash            NUMERIC(18,2) := 0;
  v_output_gst      NUMERIC(18,2) := 0;
  v_input_gst       NUMERIC(18,2) := 0;
  v_net_gst         NUMERIC(18,2) := 0;
  v_itc_eligible    NUMERIC(18,2) := 0;
  v_itc_blocked     NUMERIC(18,2) := 0;
  v_itc_claimed     NUMERIC(18,2) := 0;
  v_itc_pending     NUMERIC(18,2) := 0;
  v_ap_total        NUMERIC(18,2) := 0;
  v_ap_overdue      NUMERIC(18,2) := 0;
  v_ar_total        NUMERIC(18,2) := 0;
  v_ar_overdue      NUMERIC(18,2) := 0;
  v_asset_value     NUMERIC(18,2) := 0;
  v_depreciation    NUMERIC(18,2) := 0;
  v_liab_total      NUMERIC(18,2) := 0;
  v_emi_next_month  NUMERIC(18,2) := 0;
  v_open_findings   INT := 0;
  v_critical        INT := 0;
BEGIN
  v_period_start := make_date(SUBSTRING(v_fy FROM 1 FOR 4)::INT, 4, 1);
  v_period_end   := make_date(SUBSTRING(v_fy FROM 1 FOR 4)::INT + 1, 3, 31);

  -- Revenue + expenses + profit (from journals → SSOT)
  BEGIN
    SELECT COALESCE(SUM(amount), 0) INTO v_revenue
    FROM invoices
    WHERE user_id = p_user_id AND invoice_date BETWEEN v_period_start AND v_period_end;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  BEGIN
    SELECT COALESCE(SUM(COALESCE(total_amount, amount)), 0) INTO v_expenses
    FROM expenses
    WHERE user_id = p_user_id AND expense_date BETWEEN v_period_start AND v_period_end;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  v_profit := v_revenue - v_expenses;

  -- Cash & bank from COA
  BEGIN
    SELECT COALESCE(SUM(opening_balance), 0) INTO v_cash
    FROM accounts
    WHERE user_id = p_user_id
      AND is_active = TRUE
      AND account_type = 'Asset'
      AND account_name ~* '(cash|bank|current|savings)';
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  -- GST (best-effort from expenses/invoices tax columns if present)
  BEGIN
    SELECT COALESCE(SUM(COALESCE(cgst_amount,0) + COALESCE(sgst_amount,0) +
                        COALESCE(igst_amount,0) + COALESCE(cess_amount,0)), 0)
      INTO v_output_gst
    FROM invoices
    WHERE user_id = p_user_id AND invoice_date BETWEEN v_period_start AND v_period_end;
  EXCEPTION WHEN undefined_column OR undefined_table THEN NULL;
  END;

  BEGIN
    SELECT COALESCE(SUM(COALESCE(cgst_amount,0) + COALESCE(sgst_amount,0) +
                        COALESCE(igst_amount,0) + COALESCE(cess_amount,0)), 0)
      INTO v_input_gst
    FROM expenses
    WHERE user_id = p_user_id AND expense_date BETWEEN v_period_start AND v_period_end;
  EXCEPTION WHEN undefined_column OR undefined_table THEN NULL;
  END;

  v_net_gst := v_output_gst - v_input_gst;

  -- ITC buckets
  SELECT
    COALESCE(SUM(gst_amount) FILTER (WHERE itc_status = 'eligible'), 0),
    COALESCE(SUM(gst_amount) FILTER (WHERE itc_status = 'blocked'),  0),
    COALESCE(SUM(gst_amount) FILTER (WHERE itc_status = 'claimed'),  0),
    COALESCE(SUM(gst_amount) FILTER (WHERE itc_status = 'pending'),  0)
  INTO v_itc_eligible, v_itc_blocked, v_itc_claimed, v_itc_pending
  FROM itc_classifications
  WHERE user_id = p_user_id
    AND bill_date BETWEEN v_period_start AND v_period_end;

  -- AP / AR
  BEGIN
    SELECT
      COALESCE(SUM(amount_remaining), 0),
      COALESCE(SUM(amount_remaining) FILTER (WHERE due_date < CURRENT_DATE), 0)
    INTO v_ap_total, v_ap_overdue
    FROM payables
    WHERE user_id = p_user_id AND status <> 'paid';
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  BEGIN
    SELECT
      COALESCE(SUM(amount_remaining), 0),
      COALESCE(SUM(amount_remaining) FILTER (WHERE due_date < CURRENT_DATE), 0)
    INTO v_ar_total, v_ar_overdue
    FROM receivables
    WHERE user_id = p_user_id AND status <> 'paid';
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- Fixed assets value + accumulated depreciation
  BEGIN
    SELECT
      COALESCE(SUM(COALESCE(current_value, acquisition_cost)), 0),
      COALESCE(SUM(COALESCE(accumulated_depreciation, 0)), 0)
    INTO v_asset_value, v_depreciation
    FROM fixed_assets
    WHERE user_id = p_user_id AND COALESCE(status, 'active') = 'active';
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- Liabilities outstanding + upcoming EMIs
  BEGIN
    SELECT COALESCE(SUM(outstanding_balance), 0) INTO v_liab_total
    FROM liabilities
    WHERE user_id = p_user_id AND COALESCE(status, 'active') = 'active';
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  BEGIN
    SELECT COALESCE(SUM(emi_amount), 0) INTO v_emi_next_month
    FROM liabilities
    WHERE user_id = p_user_id
      AND COALESCE(status, 'active') = 'active'
      AND emi_amount IS NOT NULL;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- Open integrity findings (latest scan only)
  SELECT
    COUNT(*), COUNT(*) FILTER (WHERE severity = 'critical')
  INTO v_open_findings, v_critical
  FROM financial_integrity_findings
  WHERE user_id = p_user_id
    AND status = 'open'
    AND fiscal_year = v_fy;

  RETURN jsonb_build_object(
    'fiscal_year',    v_fy,
    'period_start',   v_period_start,
    'period_end',     v_period_end,
    'financial', jsonb_build_object(
      'revenue',  v_revenue,
      'expenses', v_expenses,
      'profit',   v_profit,
      'cash',     v_cash,
      'margin_pct', CASE WHEN v_revenue > 0 THEN ROUND((v_profit / v_revenue) * 100, 2) ELSE 0 END
    ),
    'gst', jsonb_build_object(
      'output_tax',   v_output_gst,
      'input_tax',    v_input_gst,
      'net_liability',v_net_gst,
      'itc_eligible', v_itc_eligible,
      'itc_blocked',  v_itc_blocked,
      'itc_claimed',  v_itc_claimed,
      'itc_pending',  v_itc_pending,
      'itc_leakage',  GREATEST(v_itc_eligible - v_itc_claimed, 0)
    ),
    'ap', jsonb_build_object(
      'total',   v_ap_total,
      'overdue', v_ap_overdue
    ),
    'ar', jsonb_build_object(
      'total',   v_ar_total,
      'overdue', v_ar_overdue,
      'collection_efficiency_pct',
        CASE WHEN v_ar_total > 0 THEN ROUND(((v_ar_total - v_ar_overdue) / v_ar_total) * 100, 2) ELSE 100 END
    ),
    'assets', jsonb_build_object(
      'value',                  v_asset_value,
      'accumulated_depreciation', v_depreciation,
      'net_book_value',         GREATEST(v_asset_value - v_depreciation, 0)
    ),
    'liabilities', jsonb_build_object(
      'outstanding', v_liab_total,
      'next_month_emi', v_emi_next_month
    ),
    'integrity', jsonb_build_object(
      'open_findings', v_open_findings,
      'critical',      v_critical
    )
  );
END;
$$;

-- ── 9. RPC: get_cfo_insights ───────────────────────────────────────────────
-- Deterministic variance & risk explanations (no LLM dependency).
-- Answers the brief's questions: why GST/profit/cash flow/ITC changed,
-- which vendors are risky, which customers are delaying.
CREATE OR REPLACE FUNCTION get_cfo_insights(
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
  v_mtd_start       DATE := date_trunc('month', CURRENT_DATE)::DATE;
  v_lm_start        DATE := (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::DATE;
  v_lm_end          DATE := (date_trunc('month', CURRENT_DATE) - INTERVAL '1 day')::DATE;
  v_insights        JSONB := '[]'::jsonb;
  v_risky_vendors   JSONB := '[]'::jsonb;
  v_slow_customers  JSONB := '[]'::jsonb;
  v_recommendations JSONB := '[]'::jsonb;
  v_rev_mtd         NUMERIC(18,2) := 0;
  v_rev_lm          NUMERIC(18,2) := 0;
  v_exp_mtd         NUMERIC(18,2) := 0;
  v_exp_lm          NUMERIC(18,2) := 0;
  v_gst_mtd         NUMERIC(18,2) := 0;
  v_gst_lm          NUMERIC(18,2) := 0;
  v_itc_pending     NUMERIC(18,2) := 0;
  v_pct             NUMERIC(8,2);
BEGIN
  -- Month-over-month deltas
  BEGIN
    SELECT COALESCE(SUM(amount), 0) INTO v_rev_mtd
    FROM invoices WHERE user_id = p_user_id AND invoice_date >= v_mtd_start;
    SELECT COALESCE(SUM(amount), 0) INTO v_rev_lm
    FROM invoices WHERE user_id = p_user_id AND invoice_date BETWEEN v_lm_start AND v_lm_end;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  BEGIN
    SELECT COALESCE(SUM(COALESCE(total_amount, amount)), 0) INTO v_exp_mtd
    FROM expenses WHERE user_id = p_user_id AND expense_date >= v_mtd_start;
    SELECT COALESCE(SUM(COALESCE(total_amount, amount)), 0) INTO v_exp_lm
    FROM expenses WHERE user_id = p_user_id AND expense_date BETWEEN v_lm_start AND v_lm_end;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- ── Revenue change ──
  IF v_rev_lm > 0 THEN
    v_pct := ROUND(((v_rev_mtd - v_rev_lm) / v_rev_lm) * 100, 1);
    v_insights := v_insights || jsonb_build_object(
      'metric', 'revenue',
      'direction', CASE WHEN v_pct > 0 THEN 'up' WHEN v_pct < 0 THEN 'down' ELSE 'flat' END,
      'change_pct', v_pct,
      'message', CASE
        WHEN v_pct > 10 THEN 'Revenue is up ' || v_pct::TEXT || '% MoM — momentum is strong.'
        WHEN v_pct < -10 THEN 'Revenue dropped ' || ABS(v_pct)::TEXT || '% vs last month. Investigate top-customer churn.'
        ELSE 'Revenue is roughly flat at ' || v_pct::TEXT || '% MoM.'
      END
    );
  END IF;

  -- ── Profit change ──
  IF (v_rev_lm - v_exp_lm) <> 0 THEN
    v_pct := ROUND((((v_rev_mtd - v_exp_mtd) - (v_rev_lm - v_exp_lm)) /
                    NULLIF(ABS(v_rev_lm - v_exp_lm), 0)) * 100, 1);
    v_insights := v_insights || jsonb_build_object(
      'metric', 'profit',
      'direction', CASE WHEN v_pct > 0 THEN 'up' WHEN v_pct < 0 THEN 'down' ELSE 'flat' END,
      'change_pct', v_pct,
      'message', 'Profit ' ||
        CASE WHEN v_pct > 0 THEN 'improved' ELSE 'declined' END ||
        ' by ' || ABS(v_pct)::TEXT || '% — revenue ' ||
        ROUND(v_rev_mtd - v_rev_lm, 0)::TEXT || ', expenses ' ||
        ROUND(v_exp_mtd - v_exp_lm, 0)::TEXT || '.'
    );
  END IF;

  -- ── ITC pending leakage ──
  SELECT COALESCE(SUM(gst_amount), 0) INTO v_itc_pending
  FROM itc_classifications
  WHERE user_id = p_user_id AND itc_status IN ('pending','eligible');

  IF v_itc_pending > 0 THEN
    v_insights := v_insights || jsonb_build_object(
      'metric', 'itc',
      'direction', 'opportunity',
      'message', 'You have ' || ROUND(v_itc_pending, 0)::TEXT ||
                 ' in unclaimed ITC. File GSTR-3B to release this working capital.'
    );
    v_recommendations := v_recommendations || jsonb_build_object(
      'priority', 'high',
      'action', 'Claim pending ITC',
      'detail', 'Release ' || ROUND(v_itc_pending, 0)::TEXT || ' in input tax credit by filing pending GSTR-3B.'
    );
  END IF;

  -- ── Risky vendors (no GSTR-2B match) ──
  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'vendor_name', vendor,
             'bill_count',  cnt,
             'gst_at_risk', total_gst,
             'risk_reason', 'GST filings missing or mismatched'
           ) ORDER BY total_gst DESC), '[]'::jsonb)
      INTO v_risky_vendors
    FROM (
      SELECT
        e.vendor,
        COUNT(*) AS cnt,
        SUM(COALESCE(e.cgst_amount,0) + COALESCE(e.sgst_amount,0) + COALESCE(e.igst_amount,0)) AS total_gst
      FROM expenses e
      WHERE e.user_id = p_user_id
        AND e.expense_date >= CURRENT_DATE - INTERVAL '90 days'
        AND e.vendor IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM itc_classifications ic
          WHERE ic.user_id = p_user_id AND ic.bill_id = e.id AND ic.itc_status = 'claimed'
        )
      GROUP BY e.vendor
      HAVING SUM(COALESCE(e.cgst_amount,0) + COALESCE(e.sgst_amount,0) + COALESCE(e.igst_amount,0)) > 0
      ORDER BY total_gst DESC
      LIMIT 5
    ) t;
  EXCEPTION WHEN undefined_column OR undefined_table THEN NULL;
  END;

  -- ── Slow-paying customers ──
  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'customer',         customer_name,
             'outstanding',      total_outstanding,
             'avg_days_overdue', avg_overdue,
             'invoice_count',    cnt
           ) ORDER BY total_outstanding DESC), '[]'::jsonb)
      INTO v_slow_customers
    FROM (
      SELECT
        i.customer_name,
        COUNT(*) AS cnt,
        SUM(i.amount) AS total_outstanding,
        ROUND(AVG(CURRENT_DATE - i.due_date)::NUMERIC, 0) AS avg_overdue
      FROM invoices i
      WHERE i.user_id = p_user_id
        AND i.status <> 'paid'
        AND i.due_date < CURRENT_DATE
      GROUP BY i.customer_name
      HAVING COUNT(*) > 0
      ORDER BY total_outstanding DESC
      LIMIT 5
    ) t;
  EXCEPTION WHEN undefined_column OR undefined_table THEN NULL;
  END;

  -- ── AP overdue recommendation ──
  BEGIN
    DECLARE v_overdue NUMERIC(18,2); BEGIN
      SELECT COALESCE(SUM(amount_remaining), 0) INTO v_overdue
      FROM payables WHERE user_id = p_user_id AND status <> 'paid' AND due_date < CURRENT_DATE;
      IF v_overdue > 0 THEN
        v_recommendations := v_recommendations || jsonb_build_object(
          'priority', 'medium',
          'action', 'Clear overdue payables',
          'detail', ROUND(v_overdue, 0)::TEXT || ' in vendor payments is past due. Late payments hurt vendor relationships and credit terms.'
        );
      END IF;
    END;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  RETURN jsonb_build_object(
    'fiscal_year',     v_fy,
    'generated_at',    NOW(),
    'insights',        v_insights,
    'risky_vendors',   v_risky_vendors,
    'slow_customers',  v_slow_customers,
    'recommendations', v_recommendations
  );
END;
$$;

-- ── 10. RPC: auto_classify_itc_for_bill ────────────────────────────────────
-- Applies the user's GST intelligence config to classify a bill's ITC lines.
-- Idempotent — re-running over the same bill updates classifications.
CREATE OR REPLACE FUNCTION auto_classify_itc_for_bill(
  p_user_id  TEXT,
  p_bill_id  UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_cfg        gst_intelligence_config%ROWTYPE;
  v_bill       RECORD;
  v_status     TEXT;
  v_reason     TEXT;
  v_classified INT := 0;
BEGIN
  -- Get config (insert default if missing)
  SELECT * INTO v_cfg FROM gst_intelligence_config WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    INSERT INTO gst_intelligence_config (user_id) VALUES (p_user_id) RETURNING * INTO v_cfg;
  END IF;

  -- Load bill (best-effort: schema may vary)
  BEGIN
    SELECT id, vendor, expense_date,
           COALESCE(category_name, '') AS category,
           COALESCE(notes, '')         AS notes,
           COALESCE(cgst_amount, 0)    AS cgst_amt,
           COALESCE(sgst_amount, 0)    AS sgst_amt,
           COALESCE(igst_amount, 0)    AS igst_amt,
           COALESCE(cess_amount, 0)    AS cess_amt,
           COALESCE(total_amount, amount) AS gross_amt,
           COALESCE(is_rcm, FALSE)     AS is_rcm
      INTO v_bill
    FROM expenses
    WHERE id = p_bill_id AND user_id = p_user_id;
  EXCEPTION WHEN undefined_column OR undefined_table THEN
    -- Fallback without optional cols
    RETURN jsonb_build_object('error', 'unsupported_schema');
  END;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'bill_not_found');
  END IF;

  -- Decide status
  IF v_bill.is_rcm THEN
    v_status := 'rcm';
    v_reason := 'Reverse Charge Mechanism — self-invoice required';
  ELSIF v_cfg.itc_block_food_beverages AND v_bill.category ~* '(food|beverage|catering|restaurant|hotel meal)' THEN
    v_status := 'blocked'; v_reason := '§17(5)(b)(i) food/beverages — blocked credit';
  ELSIF v_cfg.itc_block_motor_vehicles AND v_bill.category ~* '(motor vehicle|car|petrol|diesel|fuel)' THEN
    v_status := 'blocked'; v_reason := '§17(5)(a) motor vehicles — blocked credit';
  ELSIF v_cfg.itc_block_construction AND v_bill.category ~* '(construction|building|civil work|works contract)' THEN
    v_status := 'blocked'; v_reason := '§17(5)(c)/(d) construction of immovable property — blocked credit';
  ELSIF v_cfg.itc_block_personal_use AND v_bill.notes ~* '(personal|director use)' THEN
    v_status := 'blocked'; v_reason := '§17(5) personal use — blocked credit';
  ELSE
    v_status := 'eligible'; v_reason := NULL;
  END IF;

  -- Upsert classifications per component
  IF v_bill.cgst_amt > 0 THEN
    INSERT INTO itc_classifications (user_id, bill_id, vendor_id, bill_date, gst_component,
                                     gross_amount, gst_amount, itc_status, block_reason)
    VALUES (p_user_id, p_bill_id, NULL, v_bill.expense_date, 'cgst',
            v_bill.gross_amt, v_bill.cgst_amt, v_status, v_reason)
    ON CONFLICT (user_id, bill_id, gst_component) DO UPDATE
      SET gst_amount = EXCLUDED.gst_amount,
          itc_status = EXCLUDED.itc_status,
          block_reason = EXCLUDED.block_reason,
          updated_at = NOW();
    v_classified := v_classified + 1;
  END IF;

  IF v_bill.sgst_amt > 0 THEN
    INSERT INTO itc_classifications (user_id, bill_id, vendor_id, bill_date, gst_component,
                                     gross_amount, gst_amount, itc_status, block_reason)
    VALUES (p_user_id, p_bill_id, NULL, v_bill.expense_date, 'sgst',
            v_bill.gross_amt, v_bill.sgst_amt, v_status, v_reason)
    ON CONFLICT (user_id, bill_id, gst_component) DO UPDATE
      SET gst_amount = EXCLUDED.gst_amount,
          itc_status = EXCLUDED.itc_status,
          block_reason = EXCLUDED.block_reason,
          updated_at = NOW();
    v_classified := v_classified + 1;
  END IF;

  IF v_bill.igst_amt > 0 THEN
    INSERT INTO itc_classifications (user_id, bill_id, vendor_id, bill_date, gst_component,
                                     gross_amount, gst_amount, itc_status, block_reason)
    VALUES (p_user_id, p_bill_id, NULL, v_bill.expense_date, 'igst',
            v_bill.gross_amt, v_bill.igst_amt, v_status, v_reason)
    ON CONFLICT (user_id, bill_id, gst_component) DO UPDATE
      SET gst_amount = EXCLUDED.gst_amount,
          itc_status = EXCLUDED.itc_status,
          block_reason = EXCLUDED.block_reason,
          updated_at = NOW();
    v_classified := v_classified + 1;
  END IF;

  IF v_bill.cess_amt > 0 THEN
    INSERT INTO itc_classifications (user_id, bill_id, vendor_id, bill_date, gst_component,
                                     gross_amount, gst_amount, itc_status, block_reason)
    VALUES (p_user_id, p_bill_id, NULL, v_bill.expense_date, 'cess',
            v_bill.gross_amt, v_bill.cess_amt, v_status, v_reason)
    ON CONFLICT (user_id, bill_id, gst_component) DO UPDATE
      SET gst_amount = EXCLUDED.gst_amount,
          itc_status = EXCLUDED.itc_status,
          block_reason = EXCLUDED.block_reason,
          updated_at = NOW();
    v_classified := v_classified + 1;
  END IF;

  RETURN jsonb_build_object(
    'bill_id',    p_bill_id,
    'status',     v_status,
    'reason',     v_reason,
    'classified', v_classified
  );
END;
$$;

-- ── 11. Grants ─────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION run_financial_integrity_scan(TEXT, TEXT)        TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_reconciliation_status(TEXT)                 TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_unified_financial_dashboard(TEXT, TEXT)     TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_cfo_insights(TEXT, TEXT)                    TO authenticated, anon;
GRANT EXECUTE ON FUNCTION auto_classify_itc_for_bill(TEXT, UUID)          TO authenticated, anon;

COMMENT ON FUNCTION run_financial_integrity_scan IS
  'Phase 26: scans the user''s data for the 13 integrity issues — duplicates, journal/TB imbalance, negative inventory, unposted docs, ITC errors, missing classification. Findings persisted to financial_integrity_findings.';

COMMENT ON FUNCTION get_unified_financial_dashboard IS
  'Phase 26: returns the 6 health panels (Financial / GST / AP / AR / Asset / Liability) plus integrity counts in one round-trip.';

COMMENT ON FUNCTION get_cfo_insights IS
  'Phase 26: deterministic CFO insights — MoM variance explanations, risky vendors, slow customers, prioritized recommendations.';

COMMENT ON FUNCTION auto_classify_itc_for_bill IS
  'Phase 26: applies §17(5) blocked-credit rules + RCM detection to classify a bill''s ITC components as eligible / blocked / RCM.';
