-- ════════════════════════════════════════════════════════════════════════════
-- Brief item #16 — Performance + scalability pass.
-- Compound indexes on the hot paths exercised by the AP dashboard, aging
-- report, vendor ledger, GST returns, fraud detection, and approval queue.
-- All CREATE INDEX statements use IF NOT EXISTS for safe re-runs.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Dashboard hot path: open bills filtered by status/due_date/vendor ──────
CREATE INDEX IF NOT EXISTS idx_bills_user_due
  ON purchase_bills(user_id, due_date);

CREATE INDEX IF NOT EXISTS idx_bills_user_vendor_date
  ON purchase_bills(user_id, vendor_id, bill_date DESC);

-- Partial index — used by v_ap_aging / v_ap_dashboard / v_cash_outflow_forecast.
CREATE INDEX IF NOT EXISTS idx_bills_open
  ON purchase_bills(user_id, due_date)
  WHERE COALESCE(lower(status),'') NOT IN ('paid','cancelled','void','voided');

-- ── Vendor ledger / sub-ledger lookups ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_payments_user_vendor_date
  ON vendor_bill_payments(user_id, vendor_id, payment_date DESC);

CREATE INDEX IF NOT EXISTS idx_payments_bill
  ON vendor_bill_payments(user_id, bill_id);

CREATE INDEX IF NOT EXISTS idx_advances_user_vendor_date
  ON vendor_advances(user_id, vendor_id, advance_date DESC);

CREATE INDEX IF NOT EXISTS idx_advances_active
  ON vendor_advances(user_id, status)
  WHERE COALESCE(status,'active') NOT IN ('cancelled','void','closed');

-- ── Allocation lookups ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_alloc_bill
  ON payment_allocations(bill_id);

CREATE INDEX IF NOT EXISTS idx_alloc_user_date
  ON payment_allocations(user_id, allocation_date DESC);

-- ── Journal lines: dashboard queries always filter by user_id + entry_date ─
-- The (user_id, entry_date) index is the main work-horse for trial balance,
-- v_pnl_summary, v_balance_sheet, v_cash_flow.
CREATE INDEX IF NOT EXISTS idx_journal_lines_user_date
  ON journal_lines(user_id, entry_date);

CREATE INDEX IF NOT EXISTS idx_journal_lines_user_account_date
  ON journal_lines(user_id, account_id, entry_date);

-- Posted-only partial index (drops drafts; reports never read drafts)
CREATE INDEX IF NOT EXISTS idx_journals_posted_user_date
  ON journals(user_id, journal_date DESC)
  WHERE status = 'posted';

-- ── GST / ITC reports ──────────────────────────────────────────────────────
-- NOTE: We don't index TO_CHAR(date,'YYYY-MM') because TO_CHAR is STABLE,
-- not IMMUTABLE (locale-dependent), so PostgreSQL rejects it in an index
-- expression. The plain (user_id, bill_date) and (user_id, invoice_date)
-- indexes already cover monthly-grouping queries via the planner: a query
-- like
--    SELECT TO_CHAR(bill_date,'YYYY-MM'), SUM(...)
--      FROM purchase_bills WHERE user_id = ? GROUP BY 1
-- uses the user_id+bill_date index for the range scan and groups in memory.

CREATE INDEX IF NOT EXISTS idx_bills_itc_pending
  ON purchase_bills(user_id, bill_date)
  WHERE itc_status = 'pending';

-- ── Fraud / approvals queue ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fraud_user_severity_open
  ON fraud_alerts(user_id, severity, created_at DESC)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_approvals_user_pending
  ON approval_requests(user_id, requested_at DESC)
  WHERE status = 'pending';

-- ── Inventory rollups ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_inv_movements_user_date
  ON inventory_movements(user_id, movement_date DESC);

CREATE INDEX IF NOT EXISTS idx_inv_movements_item_date
  ON inventory_movements(user_id, item_id, movement_date DESC);

CREATE INDEX IF NOT EXISTS idx_inv_movements_source
  ON inventory_movements(user_id, source_type, source_id);

-- ── Audit log ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ap_audit_actor
  ON ap_audit_log(actor_id, created_at DESC) WHERE actor_id IS NOT NULL;

-- ── Recurring bills cron ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_recurring_active_due
  ON recurring_bills(next_due_date) WHERE is_active = TRUE;

-- ── Stats refresh on the hot tables so the planner sees the new indexes ───
ANALYZE purchase_bills;
ANALYZE vendor_bill_payments;
ANALYZE payment_allocations;
ANALYZE journal_lines;
ANALYZE journals;
ANALYZE inventory_movements;
ANALYZE fraud_alerts;
ANALYZE approval_requests;

NOTIFY pgrst, 'reload schema';

COMMENT ON INDEX idx_bills_open IS
  'Partial covering index — drives v_ap_aging / v_ap_dashboard. Skips paid/voided rows so the index stays small.';
COMMENT ON INDEX idx_journals_posted_user_date IS
  'Posted-only partial — used by trial balance / P&L / balance sheet / cash flow views. Drafts excluded since reports never read them.';
