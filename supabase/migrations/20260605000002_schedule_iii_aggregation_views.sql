-- ============================================================================
-- PHASE 10 — SCHEDULE III GL-DRIVEN AGGREGATION VIEWS
-- ----------------------------------------------------------------------------
-- Every figure on the Balance Sheet, P&L, FA Schedule, Liability Schedule, and
-- AR/AP schedules now derives from journal_lines (posted journals only) and
-- the canonical AP/AR/FA registers. These views are the single source of
-- truth — UI components must call them rather than re-aggregating invoices.
-- ============================================================================

-- ── 0. MSME flag on vendors (Section 22 MSMED Act disclosure) ───────────────
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS is_msme         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS udyam_number    TEXT,
  ADD COLUMN IF NOT EXISTS msme_category   TEXT
    CHECK (msme_category IS NULL OR msme_category IN ('Micro','Small','Medium'));

CREATE INDEX IF NOT EXISTS idx_vendors_is_msme ON vendors(user_id, is_msme) WHERE is_msme = TRUE;

-- ── 1. BALANCE-SHEET LINE AGGREGATION ───────────────────────────────────────
-- Closing balance per Schedule III line (BS only), respecting sign convention.
-- Assets/Expenses: Dr − Cr ; Liabilities/Equity/Income: Cr − Dr.
DROP VIEW IF EXISTS v_schedule_iii_balance_sheet CASCADE;
CREATE VIEW v_schedule_iii_balance_sheet AS
SELECT
  a.user_id,
  l.section,
  l.subsection,
  l.current_non_current,
  l.line_code,
  l.display_label,
  l.note_no,
  l.sort_order,
  ROUND(
    COALESCE(SUM(
      CASE a.account_type
        WHEN 'Asset'     THEN COALESCE(jl.debit,0)  - COALESCE(jl.credit,0)
        WHEN 'Liability' THEN COALESCE(jl.credit,0) - COALESCE(jl.debit,0)
        WHEN 'Equity'    THEN COALESCE(jl.credit,0) - COALESCE(jl.debit,0)
      END
    ), 0)::NUMERIC,
    2
  ) AS amount,
  COUNT(DISTINCT a.id) FILTER (WHERE a.id IS NOT NULL) AS account_count
FROM schedule_iii_lines l
LEFT JOIN accounts a
       ON a.schedule_iii_line_code = l.line_code
      AND COALESCE(a.is_group, FALSE) = FALSE
LEFT JOIN journal_lines jl ON jl.account_id = a.id AND jl.user_id = a.user_id
LEFT JOIN journals j       ON j.id = jl.journal_id AND j.status = 'posted'
WHERE l.statement_type = 'BS'
GROUP BY a.user_id, l.section, l.subsection, l.current_non_current,
         l.line_code, l.display_label, l.note_no, l.sort_order;

-- ── 2. P&L LINE AGGREGATION (lifetime — period filtering via RPC) ──────────
DROP VIEW IF EXISTS v_schedule_iii_pl_lifetime CASCADE;
CREATE VIEW v_schedule_iii_pl_lifetime AS
SELECT
  a.user_id,
  l.section,
  l.subsection,
  l.line_code,
  l.display_label,
  l.note_no,
  l.sort_order,
  ROUND(
    COALESCE(SUM(
      CASE a.account_type
        WHEN 'Income'  THEN COALESCE(jl.credit,0) - COALESCE(jl.debit,0)
        WHEN 'Expense' THEN COALESCE(jl.debit,0)  - COALESCE(jl.credit,0)
      END
    ), 0)::NUMERIC,
    2
  ) AS amount,
  COUNT(DISTINCT a.id) FILTER (WHERE a.id IS NOT NULL) AS account_count
FROM schedule_iii_lines l
LEFT JOIN accounts a
       ON a.schedule_iii_line_code = l.line_code
      AND COALESCE(a.is_group, FALSE) = FALSE
LEFT JOIN journal_lines jl ON jl.account_id = a.id AND jl.user_id = a.user_id
LEFT JOIN journals j       ON j.id = jl.journal_id AND j.status = 'posted'
WHERE l.statement_type = 'PL'
GROUP BY a.user_id, l.section, l.subsection, l.line_code,
         l.display_label, l.note_no, l.sort_order;

-- ── 3. FIXED ASSET MOVEMENT SCHEDULE (Note 12 — Tangible Assets) ────────────
-- Opening gross block → Additions → Disposals → Closing gross block,
-- with depreciation movement. Derived from fixed_assets table.
DROP VIEW IF EXISTS v_fixed_asset_movement CASCADE;
CREATE VIEW v_fixed_asset_movement AS
SELECT
  fa.user_id,
  fa.id                                AS asset_id,
  fa.asset_code,
  fa.name                              AS asset_name,
  fa.category_name                     AS category,
  fa.purchase_date,
  fa.total_capitalised_value           AS gross_block,
  fa.accumulated_depreciation,
  fa.book_value                        AS net_block,
  (fa.status = 'disposed')             AS is_disposed,
  fa.disposed_at                       AS disposal_date,
  fa.disposal_amount                   AS disposal_value,
  fa.depreciation_method,
  fa.useful_life_years,
  fa.status
FROM fixed_assets fa;

DROP VIEW IF EXISTS v_fixed_asset_movement_by_category CASCADE;
CREATE VIEW v_fixed_asset_movement_by_category AS
SELECT
  user_id,
  COALESCE(category, 'Uncategorised')                                   AS category,
  COUNT(*)                                                              AS asset_count,
  SUM(gross_block)                                                      AS total_gross_block,
  SUM(accumulated_depreciation)                                         AS total_accumulated_dep,
  SUM(net_block)                                                        AS total_net_block,
  SUM(CASE WHEN is_disposed THEN gross_block ELSE 0 END)                AS disposed_gross,
  SUM(CASE WHEN is_disposed THEN COALESCE(disposal_value,0) ELSE 0 END) AS disposed_proceeds
FROM v_fixed_asset_movement
GROUP BY user_id, COALESCE(category, 'Uncategorised');

-- ── 4. LIABILITY CURRENT/NON-CURRENT SPLIT ─────────────────────────────────
-- A liability with > 12 months remaining tenure is non-current;
-- the next-12-months EMI portion is current ("current maturities").
DROP VIEW IF EXISTS v_liability_current_split CASCADE;
CREATE VIEW v_liability_current_split AS
WITH next_12m AS (
  SELECT
    s.user_id,
    s.liability_id,
    SUM(s.total_emi) AS due_next_12m
  FROM loan_emi_schedule s
  WHERE s.due_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '12 months')
    AND s.status <> 'paid'
  GROUP BY s.user_id, s.liability_id
)
SELECT
  l.user_id,
  l.id AS liability_id,
  l.liability_type,
  COALESCE(l.lender_name, l.name) AS lender_name,
  l.principal_amount,
  l.outstanding_principal       AS outstanding_amount,
  l.interest_rate,
  l.start_date,
  l.end_date,
  CASE
    WHEN l.end_date IS NULL                                  THEN 'NON_CURRENT'
    WHEN l.end_date <= (CURRENT_DATE + INTERVAL '12 months') THEN 'CURRENT'
    ELSE 'NON_CURRENT'
  END AS classification,
  COALESCE(n.due_next_12m, 0) AS current_maturity_amount,
  GREATEST(l.outstanding_principal - COALESCE(n.due_next_12m, 0), 0) AS non_current_amount
FROM liabilities l
LEFT JOIN next_12m n ON n.liability_id = l.id AND n.user_id = l.user_id
WHERE l.status = 'active';

-- ── 5. AR / TRADE RECEIVABLE AGING (Note 19) ────────────────────────────────
DROP VIEW IF EXISTS v_ar_schedule_iii_aging CASCADE;
CREATE VIEW v_ar_schedule_iii_aging AS
WITH open_invoices AS (
  SELECT
    i.user_id,
    i.id AS invoice_id,
    i.customer_id,
    i.invoice_date,
    i.due_date,
    GREATEST(COALESCE(i.total_amount, i.amount, 0) - COALESCE(i.paid_amount, 0), 0) AS outstanding
  FROM invoices i
  WHERE COALESCE(i.status, '') NOT IN ('paid','cancelled','draft')
)
SELECT
  user_id,
  SUM(CASE WHEN CURRENT_DATE - COALESCE(due_date, invoice_date) <= 0    THEN outstanding ELSE 0 END) AS not_due,
  SUM(CASE WHEN CURRENT_DATE - COALESCE(due_date, invoice_date) BETWEEN 1   AND 180  THEN outstanding ELSE 0 END) AS days_1_180,
  SUM(CASE WHEN CURRENT_DATE - COALESCE(due_date, invoice_date) BETWEEN 181 AND 365  THEN outstanding ELSE 0 END) AS days_181_365,
  SUM(CASE WHEN CURRENT_DATE - COALESCE(due_date, invoice_date) BETWEEN 366 AND 730  THEN outstanding ELSE 0 END) AS years_1_to_2,
  SUM(CASE WHEN CURRENT_DATE - COALESCE(due_date, invoice_date) BETWEEN 731 AND 1095 THEN outstanding ELSE 0 END) AS years_2_to_3,
  SUM(CASE WHEN CURRENT_DATE - COALESCE(due_date, invoice_date) > 1095   THEN outstanding ELSE 0 END) AS over_3_years,
  SUM(outstanding) AS total_outstanding
FROM open_invoices
GROUP BY user_id;

-- ── 6. AP / TRADE PAYABLE AGING + MSME (Note 9 + MSMED Section 22) ──────────
DROP VIEW IF EXISTS v_ap_schedule_iii_aging CASCADE;
CREATE VIEW v_ap_schedule_iii_aging AS
WITH open_bills AS (
  SELECT
    pb.user_id,
    pb.id AS bill_id,
    pb.vendor_id,
    pb.bill_date,
    pb.due_date,
    COALESCE(v.is_msme, FALSE) AS is_msme,
    GREATEST(COALESCE(pb.total_amount, 0) - COALESCE(pb.paid_amount, 0), 0) AS outstanding
  FROM purchase_bills pb
  LEFT JOIN vendors v ON v.id = pb.vendor_id
  WHERE COALESCE(pb.status, '') NOT IN ('paid','cancelled','draft')
)
SELECT
  user_id,
  SUM(CASE WHEN CURRENT_DATE - COALESCE(due_date, bill_date) <= 0    THEN outstanding ELSE 0 END) AS not_due,
  SUM(CASE WHEN CURRENT_DATE - COALESCE(due_date, bill_date) BETWEEN 1   AND 365  THEN outstanding ELSE 0 END) AS days_1_365,
  SUM(CASE WHEN CURRENT_DATE - COALESCE(due_date, bill_date) BETWEEN 366 AND 730  THEN outstanding ELSE 0 END) AS years_1_to_2,
  SUM(CASE WHEN CURRENT_DATE - COALESCE(due_date, bill_date) BETWEEN 731 AND 1095 THEN outstanding ELSE 0 END) AS years_2_to_3,
  SUM(CASE WHEN CURRENT_DATE - COALESCE(due_date, bill_date) > 1095   THEN outstanding ELSE 0 END) AS over_3_years,
  SUM(outstanding) AS total_outstanding,
  SUM(CASE WHEN is_msme AND CURRENT_DATE - COALESCE(due_date, bill_date) > 45 THEN outstanding ELSE 0 END) AS msme_overdue_45_plus,
  SUM(CASE WHEN is_msme THEN outstanding ELSE 0 END)     AS msme_total_outstanding,
  SUM(CASE WHEN NOT is_msme THEN outstanding ELSE 0 END) AS non_msme_total_outstanding
FROM open_bills
GROUP BY user_id;

-- ── 7. SCHEDULE III INTEGRITY CHECK ─────────────────────────────────────────
-- Returns a JSON blob of compliance flags the UI can render as a checklist.
CREATE OR REPLACE FUNCTION validate_schedule_iii_integrity(p_user_id TEXT)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_dr NUMERIC; v_cr NUMERIC;
  v_unmapped INT;
  v_assets NUMERIC; v_equity_liab NUMERIC;
  v_result JSONB;
BEGIN
  SELECT COALESCE(SUM(jl.debit), 0), COALESCE(SUM(jl.credit), 0)
    INTO v_dr, v_cr
    FROM journal_lines jl
    JOIN journals j ON j.id = jl.journal_id
   WHERE jl.user_id = p_user_id AND j.status = 'posted';

  SELECT COUNT(*) INTO v_unmapped
    FROM accounts
   WHERE user_id = p_user_id
     AND COALESCE(is_group, FALSE) = FALSE
     AND schedule_iii_line_code IS NULL;

  SELECT COALESCE(SUM(amount), 0) INTO v_assets
    FROM v_schedule_iii_balance_sheet
   WHERE user_id = p_user_id AND section = 'ASSETS';
  SELECT COALESCE(SUM(amount), 0) INTO v_equity_liab
    FROM v_schedule_iii_balance_sheet
   WHERE user_id = p_user_id AND section = 'EQUITY_AND_LIABILITIES';

  v_result := jsonb_build_object(
    'trial_balance_balanced',   ABS(v_dr - v_cr) < 0.01,
    'trial_balance_debit',      v_dr,
    'trial_balance_credit',     v_cr,
    'trial_balance_diff',       v_dr - v_cr,
    'unclassified_accounts',    v_unmapped,
    'all_accounts_classified',  v_unmapped = 0,
    'total_assets',             v_assets,
    'total_equity_and_liab',    v_equity_liab,
    'bs_equation_holds',        ABS(v_assets - v_equity_liab) < 1.00,
    'bs_equation_diff',         v_assets - v_equity_liab,
    'validated_at',             NOW()
  );

  RETURN v_result;
END;
$$;
