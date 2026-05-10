-- ════════════════════════════════════════════════════════════════════════════
-- AR Complete System — Slice 2: Reporting & dashboard views
--
-- Mirrors the AP view set (v_ap_aging, v_ap_dashboard, v_vendor_concentration,
-- v_cash_outflow_forecast) on the sell-side, plus invoice-register & customer
-- ledger views that the AR module needs for GSTR-1, ageing, and CA tie-out.
--
-- All views are journal-grounded where possible (so they show truth-of-record
-- balance-sheet data) with a fallback to the document tables for fields that
-- aren't in the GL (e.g. invoice line items for the register).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. v_customer_ledger — drill-down feed per customer ─────────────────────
-- Shows every AR-side document per customer in a chronological list with
-- running balance. Built on top of v_customer_subledger (already exists),
-- enriched with document-specific fields (invoice_number, due_date, etc.)
DROP VIEW IF EXISTS v_customer_ledger CASCADE;
CREATE VIEW v_customer_ledger AS
WITH all_txns AS (
  -- Invoices issued
  SELECT
    i.user_id,
    c.id            AS customer_id,
    COALESCE(c.name, i.client_name) AS customer_name,
    i.invoice_date  AS txn_date,
    'invoice'       AS txn_type,
    i.id            AS source_id,
    i.invoice_number AS reference,
    i.total_amount  AS debit,
    0::numeric      AS credit,
    i.status        AS status,
    i.due_date,
    i.notes
  FROM invoices i
  LEFT JOIN clients c
    ON c.user_id = i.user_id
   AND (i.customer_id = c.id OR (i.customer_id IS NULL AND c.name = i.client_name))
  WHERE COALESCE(i.status, 'pending') NOT IN ('cancelled')

  UNION ALL

  -- Payments received (against invoice)
  SELECT
    p.user_id,
    p.customer_id,
    p.customer_name,
    p.payment_date,
    'payment_received',
    p.id,
    COALESCE(p.reference_number, p.deposit_reference, ''),
    0::numeric,
    p.amount,
    p.status,
    NULL::date,
    p.notes
  FROM payment_received p
  WHERE COALESCE(p.payment_type, 'invoice_payment') = 'invoice_payment'
    AND p.status = 'received'

  UNION ALL

  -- Credit notes
  SELECT
    cn.user_id,
    NULL::uuid,
    cn.client_name,
    cn.credit_note_date,
    'credit_note',
    cn.id,
    cn.credit_note_number,
    0::numeric,
    cn.total_amount,
    cn.status,
    NULL::date,
    cn.reason
  FROM credit_notes cn
  WHERE cn.status <> 'cancelled'

  UNION ALL

  -- Customer advances received
  SELECT
    ca.user_id,
    ca.customer_id,
    ca.customer_name,
    ca.advance_date,
    'customer_advance',
    ca.id,
    ca.advance_number,
    0::numeric,
    ca.amount,
    ca.status,
    NULL::date,
    ca.description
  FROM customer_advances ca
  WHERE ca.status <> 'cancelled'

  UNION ALL

  -- Advance adjustments (clears AR)
  SELECT
    caa.user_id,
    caa.customer_id,
    caa.customer_name,
    caa.adjustment_date,
    'customer_advance_adjustment',
    caa.id,
    caa.invoice_number,
    0::numeric,
    caa.amount,
    'applied',
    NULL::date,
    caa.notes
  FROM customer_advance_adjustments caa
)
SELECT
  user_id, customer_id, customer_name,
  txn_date, txn_type, source_id, reference,
  debit, credit,
  (debit - credit) AS receivable_delta,
  status, due_date, notes
FROM all_txns
ORDER BY txn_date, txn_type;

-- ── 2. v_ar_aging — bucketed outstanding per customer ───────────────────────
DROP VIEW IF EXISTS v_ar_aging CASCADE;
CREATE VIEW v_ar_aging AS
WITH outstanding AS (
  SELECT
    i.user_id,
    COALESCE(i.client_name, '(no name)') AS customer_name,
    i.customer_id,
    i.id              AS invoice_id,
    i.invoice_number,
    i.invoice_date,
    i.due_date,
    i.total_amount,
    COALESCE(i.paid_amount, 0) AS paid_amount,
    GREATEST(i.total_amount - COALESCE(i.paid_amount, 0), 0) AS outstanding,
    i.status,
    CASE
      WHEN i.due_date IS NULL                              THEN -999
      ELSE (CURRENT_DATE - i.due_date)::int
    END AS days_overdue
  FROM invoices i
  WHERE COALESCE(i.status, 'pending') IN ('pending','partial','overdue','sent')
    AND i.total_amount - COALESCE(i.paid_amount, 0) > 0.01
)
SELECT
  user_id, customer_id, customer_name,
  invoice_id, invoice_number, invoice_date, due_date,
  total_amount, paid_amount, outstanding, status, days_overdue,
  CASE
    WHEN days_overdue <  0   THEN 'not_due'
    WHEN days_overdue <= 30  THEN 'overdue_0_30'
    WHEN days_overdue <= 60  THEN 'overdue_31_60'
    WHEN days_overdue <= 90  THEN 'overdue_61_90'
    ELSE                          'overdue_90_plus'
  END AS bucket
FROM outstanding;

-- ── 3. v_ar_aging_summary — bucketed totals per customer ────────────────────
DROP VIEW IF EXISTS v_ar_aging_summary CASCADE;
CREATE VIEW v_ar_aging_summary AS
SELECT
  user_id,
  customer_id,
  customer_name,
  COUNT(*)                                                            AS invoice_count,
  SUM(outstanding)                                                    AS total_outstanding,
  SUM(CASE WHEN bucket = 'not_due'         THEN outstanding ELSE 0 END) AS not_due,
  SUM(CASE WHEN bucket = 'overdue_0_30'    THEN outstanding ELSE 0 END) AS overdue_0_30,
  SUM(CASE WHEN bucket = 'overdue_31_60'   THEN outstanding ELSE 0 END) AS overdue_31_60,
  SUM(CASE WHEN bucket = 'overdue_61_90'   THEN outstanding ELSE 0 END) AS overdue_61_90,
  SUM(CASE WHEN bucket = 'overdue_90_plus' THEN outstanding ELSE 0 END) AS overdue_90_plus
FROM v_ar_aging
GROUP BY user_id, customer_id, customer_name;

-- ── 4. v_invoice_register — GSTR-1 ready sales summary ──────────────────────
-- One row per posted invoice with the tax breakdown. Used by GST returns and
-- by the AR dashboard's "Invoice Register" report.
DROP VIEW IF EXISTS v_invoice_register CASCADE;
CREATE VIEW v_invoice_register AS
SELECT
  i.user_id,
  i.id                  AS invoice_id,
  i.invoice_number,
  i.invoice_date,
  i.due_date,
  i.client_name,
  i.client_gst_number,
  i.client_address,
  i.place_of_supply,
  i.seller_state,
  COALESCE(i.intra_state, TRUE) AS intra_state,
  i.amount              AS taxable_value,
  COALESCE(i.cgst_amount, 0) AS cgst_amount,
  COALESCE(i.sgst_amount, 0) AS sgst_amount,
  COALESCE(i.igst_amount, 0) AS igst_amount,
  COALESCE(i.cess_amount, 0) AS cess_amount,
  i.gst_amount,
  i.total_amount,
  COALESCE(i.paid_amount, 0)                       AS paid_amount,
  GREATEST(i.total_amount - COALESCE(i.paid_amount, 0), 0) AS outstanding,
  i.status,
  i.lifecycle_stage,
  i.cost_center_id,
  i.project_id,
  i.branch_id,
  i.department,
  i.rate_buckets,
  i.items
FROM invoices i
WHERE COALESCE(i.status, 'pending') NOT IN ('draft','cancelled');

-- ── 5. v_collection_report — receipts per period/customer/mode ──────────────
DROP VIEW IF EXISTS v_collection_report CASCADE;
CREATE VIEW v_collection_report AS
SELECT
  pr.user_id,
  pr.customer_id,
  pr.customer_name,
  pr.payment_date,
  pr.payment_mode,
  pr.reference_number,
  pr.deposit_account,
  pr.amount,
  COALESCE(pr.bank_charges, 0)  AS bank_charges,
  COALESCE(pr.tax_deducted, 0)  AS tds,
  pr.payment_type,
  pr.status,
  date_trunc('month', pr.payment_date)::date AS month
FROM payment_received pr
WHERE pr.status = 'received';

-- ── 6. v_outstanding_report — open invoices snapshot ────────────────────────
DROP VIEW IF EXISTS v_outstanding_report CASCADE;
CREATE VIEW v_outstanding_report AS
SELECT
  user_id,
  customer_id,
  customer_name,
  invoice_id,
  invoice_number,
  invoice_date,
  due_date,
  total_amount,
  paid_amount,
  outstanding,
  status,
  days_overdue,
  bucket
FROM v_ar_aging
ORDER BY days_overdue DESC;

-- ── 7. v_customer_concentration — top customers by AR ───────────────────────
DROP VIEW IF EXISTS v_customer_concentration CASCADE;
CREATE VIEW v_customer_concentration AS
WITH totals AS (
  SELECT user_id, SUM(outstanding) AS grand_total FROM v_ar_aging GROUP BY user_id
)
SELECT
  s.user_id,
  s.customer_id,
  s.customer_name,
  s.invoice_count,
  s.total_outstanding,
  ROUND(100.0 * s.total_outstanding / NULLIF(t.grand_total, 0), 2) AS pct_of_total,
  s.overdue_0_30 + s.overdue_31_60 + s.overdue_61_90 + s.overdue_90_plus AS overdue_amount
FROM v_ar_aging_summary s
LEFT JOIN totals t USING (user_id);

-- ── 8. v_cash_inflow_forecast — receivables timeline ────────────────────────
-- Group outstanding by week of expected collection (due_date), used by the
-- working-capital / cash-flow page.
DROP VIEW IF EXISTS v_cash_inflow_forecast CASCADE;
CREATE VIEW v_cash_inflow_forecast AS
SELECT
  user_id,
  date_trunc('week', COALESCE(due_date, CURRENT_DATE))::date AS week,
  COUNT(*)              AS invoice_count,
  SUM(outstanding)      AS expected_inflow,
  SUM(CASE WHEN days_overdue > 0 THEN outstanding ELSE 0 END) AS overdue_portion
FROM v_ar_aging
GROUP BY user_id, date_trunc('week', COALESCE(due_date, CURRENT_DATE))
ORDER BY week;

-- ── 9. v_ar_dashboard — KPI strip for the AR Dashboard page ────────────────
DROP VIEW IF EXISTS v_ar_dashboard CASCADE;
CREATE VIEW v_ar_dashboard AS
SELECT
  i.user_id,
  COUNT(*) FILTER (WHERE COALESCE(i.status, 'pending') IN ('pending','partial','overdue','sent'))                       AS open_invoice_count,
  COUNT(*) FILTER (WHERE i.status = 'overdue')                                                                          AS overdue_count,
  COUNT(*) FILTER (WHERE i.status = 'paid')                                                                             AS paid_count,
  SUM(GREATEST(i.total_amount - COALESCE(i.paid_amount, 0), 0))
    FILTER (WHERE COALESCE(i.status, 'pending') IN ('pending','partial','overdue','sent'))                              AS total_outstanding,
  SUM(GREATEST(i.total_amount - COALESCE(i.paid_amount, 0), 0))
    FILTER (WHERE i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE
            AND COALESCE(i.status, 'pending') IN ('pending','partial','overdue','sent'))                                AS total_overdue,
  SUM(i.total_amount) FILTER (WHERE i.invoice_date >= date_trunc('month', CURRENT_DATE)::date)                          AS this_month_billed,
  SUM(COALESCE(i.paid_amount, 0)) FILTER (WHERE i.invoice_date >= date_trunc('month', CURRENT_DATE)::date)              AS this_month_collected,
  COUNT(DISTINCT NULLIF(i.client_name, ''))
    FILTER (WHERE COALESCE(i.status, 'pending') IN ('pending','partial','overdue','sent'))                              AS active_customer_count,
  -- Customer advances pending application
  (SELECT COALESCE(SUM(outstanding_amount), 0) FROM customer_advances ca
    WHERE ca.user_id = i.user_id AND ca.status IN ('open','partial'))                                                   AS unapplied_advances,
  -- Pending approvals on AR docs
  (SELECT COUNT(*) FROM approval_requests ar
    WHERE ar.user_id = i.user_id AND ar.status = 'pending'
      AND ar.entity_type IN ('invoice','credit_note','payment_received','customer_advance'))                            AS pending_approvals,
  -- Open AR-side fraud alerts
  (SELECT COUNT(*) FROM fraud_alerts fa
    WHERE fa.user_id = i.user_id AND fa.status = 'open'
      AND fa.entity_type IN ('invoice','payment_received','credit_note','customer_advance'))                            AS open_fraud_alerts
FROM invoices i
GROUP BY i.user_id;

-- ── 10. v_customer_balance — control-account tie-out ───────────────────────
-- For each customer: opening balance + invoices - payments - credit notes - advance adjustments.
-- Sum over all customers must equal the AR control-account balance in the trial
-- balance — this is the canonical CA tie-out check.
DROP VIEW IF EXISTS v_customer_balance CASCADE;
CREATE VIEW v_customer_balance AS
SELECT
  c.user_id,
  c.id              AS customer_id,
  c.name            AS customer_name,
  COALESCE(c.opening_balance, 0)                                                         AS opening_balance,
  COALESCE((SELECT SUM(total_amount) FROM invoices
             WHERE user_id = c.user_id
               AND COALESCE(status, 'pending') NOT IN ('cancelled','draft')
               AND (customer_id = c.id OR (customer_id IS NULL AND client_name = c.name))), 0) AS total_invoiced,
  COALESCE((SELECT SUM(amount) FROM payment_received
             WHERE user_id = c.user_id
               AND status = 'received'
               AND COALESCE(payment_type, 'invoice_payment') = 'invoice_payment'
               AND customer_id = c.id), 0)                                              AS total_received,
  COALESCE((SELECT SUM(total_amount) FROM credit_notes
             WHERE user_id = c.user_id
               AND status <> 'cancelled'
               AND client_name = c.name), 0)                                            AS total_credit_notes,
  COALESCE((SELECT SUM(amount) FROM customer_advance_adjustments
             WHERE user_id = c.user_id AND customer_id = c.id), 0)                       AS total_advance_adjusted
FROM clients c;

-- ── 11. v_invoice_register_with_journal — joined to GL for audit trail ──────
DROP VIEW IF EXISTS v_invoice_register_with_journal CASCADE;
CREATE VIEW v_invoice_register_with_journal AS
SELECT
  reg.*,
  j.id              AS journal_id,
  j.journal_number,
  j.posted_at,
  j.is_reversed
FROM v_invoice_register reg
LEFT JOIN journals j
  ON j.user_id = reg.user_id
 AND j.source_type = 'invoice'
 AND j.source_id   = reg.invoice_id;

-- ── 12. v_open_ar_fraud_alerts — AR slice of fraud_alerts with party name ──
DROP VIEW IF EXISTS v_open_ar_fraud_alerts CASCADE;
CREATE VIEW v_open_ar_fraud_alerts AS
SELECT
  fa.*,
  CASE fa.entity_type
    WHEN 'invoice'           THEN (SELECT i.client_name    FROM invoices i           WHERE i.id = fa.entity_id)
    WHEN 'payment_received'  THEN (SELECT p.customer_name  FROM payment_received p   WHERE p.id = fa.entity_id)
    WHEN 'credit_note'       THEN (SELECT cn.client_name   FROM credit_notes cn      WHERE cn.id = fa.entity_id)
    WHEN 'customer_advance'  THEN (SELECT ca.customer_name FROM customer_advances ca WHERE ca.id = fa.entity_id)
  END AS counterparty
FROM fraud_alerts fa
WHERE fa.status = 'open'
  AND fa.entity_type IN ('invoice','payment_received','credit_note','customer_advance')
ORDER BY
  CASE fa.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
  fa.created_at DESC;

-- ── 13. v_pending_ar_approvals — AR slice of approval_requests ──────────────
DROP VIEW IF EXISTS v_pending_ar_approvals CASCADE;
CREATE VIEW v_pending_ar_approvals AS
SELECT
  ar.id            AS request_id,
  ar.user_id,
  ar.entity_type,
  ar.entity_id,
  ar.reference,
  ar.amount,
  ar.required_levels,
  ar.current_level,
  ar.requested_by,
  ar.requested_at,
  CASE ar.entity_type
    WHEN 'invoice'           THEN (SELECT i.client_name    FROM invoices i           WHERE i.id = ar.entity_id)
    WHEN 'credit_note'       THEN (SELECT cn.client_name   FROM credit_notes cn      WHERE cn.id = ar.entity_id)
    WHEN 'payment_received'  THEN (SELECT p.customer_name  FROM payment_received p   WHERE p.id = ar.entity_id)
    WHEN 'customer_advance'  THEN (SELECT ca.customer_name FROM customer_advances ca WHERE ca.id = ar.entity_id)
  END AS counterparty,
  CASE ar.entity_type
    WHEN 'invoice'           THEN (SELECT i.invoice_date     FROM invoices i           WHERE i.id = ar.entity_id)
    WHEN 'credit_note'       THEN (SELECT cn.credit_note_date FROM credit_notes cn      WHERE cn.id = ar.entity_id)
    WHEN 'payment_received'  THEN (SELECT p.payment_date     FROM payment_received p   WHERE p.id = ar.entity_id)
    WHEN 'customer_advance'  THEN (SELECT ca.advance_date    FROM customer_advances ca WHERE ca.id = ar.entity_id)
  END AS entity_date,
  rul.level_perms  AS rule_perms
FROM approval_requests ar
LEFT JOIN approval_rules rul ON rul.id = ar.rule_id
WHERE ar.status = 'pending'
  AND ar.entity_type IN ('invoice','credit_note','payment_received','customer_advance');

-- ── 14. v_customer_profitability — revenue - COGS per customer ──────────────
DROP VIEW IF EXISTS v_customer_profitability CASCADE;
CREATE VIEW v_customer_profitability AS
SELECT
  c.user_id,
  c.id   AS customer_id,
  c.name AS customer_name,
  COALESCE((SELECT SUM(amount)        FROM invoices i
             WHERE i.user_id = c.user_id
               AND COALESCE(i.status,'pending') NOT IN ('cancelled','draft')
               AND (i.customer_id = c.id OR (i.customer_id IS NULL AND i.client_name = c.name))), 0) AS revenue,
  COALESCE((SELECT SUM(jl.debit) FROM journal_lines jl
             JOIN journals j ON j.id = jl.journal_id
             JOIN accounts a ON a.id = jl.account_id
             WHERE j.user_id = c.user_id
               AND j.status = 'posted'
               AND a.account_type = 'Expense'
               AND a.account_name ILIKE '%Cost of Goods Sold%'
               AND jl.customer_id = c.id), 0)                                                          AS cogs,
  COALESCE((SELECT SUM(total_amount) FROM credit_notes cn
             WHERE cn.user_id = c.user_id AND cn.status <> 'cancelled' AND cn.client_name = c.name), 0) AS returns_value
FROM clients c;

-- ── 15. PostgREST schema reload ─────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

COMMENT ON VIEW v_customer_ledger IS
  'Chronological feed per customer: invoices, receipts, credit notes, advances, advance adjustments. Drill-down for the Customer Ledger page.';
COMMENT ON VIEW v_ar_aging IS
  'One row per open invoice with days_overdue and bucket label.';
COMMENT ON VIEW v_ar_aging_summary IS
  'Customer-level rollup of v_ar_aging into 30/60/90+ day buckets.';
COMMENT ON VIEW v_invoice_register IS
  'GSTR-1 ready: one row per posted invoice with CGST/SGST/IGST/Cess split and place of supply.';
COMMENT ON VIEW v_ar_dashboard IS
  'KPI strip for the AR Dashboard. One row per user.';
COMMENT ON VIEW v_customer_balance IS
  'Control-account tie-out per customer: opening + invoices - receipts - credit notes - advance adjustments.';
COMMENT ON VIEW v_cash_inflow_forecast IS
  'Weekly receivables timeline for the working-capital page.';
