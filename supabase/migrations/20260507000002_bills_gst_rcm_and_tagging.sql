-- ════════════════════════════════════════════════════════════════════════════
-- Brief items #5 (GST + ITC on bills, including RCM) and #7 (cost-center /
-- project / branch / department tagging on every AP transaction).
--
-- What's already in place from prior migrations (20260424 / 20260505 / 20260506):
--   purchase_bills: is_rcm, itc_eligible, place_of_supply, cgst/sgst/igst_amount,
--                   vendor_gst_status, cost_center_id
--   expenses:       is_rcm, rcm_rate, rcm_amount, vendor_gst_status, cost_center_id
--
-- What this migration adds:
--   1. RCM rate/amount columns on purchase_bills (mirror of expenses)
--   2. ITC lifecycle on purchase_bills (pending → claimed/reversed/blocked) with
--      claimed_period stamp so GSTR-3B reconciliation has a canonical state
--   3. seller_state + intra_state flag on purchase_bills (drives CGST+SGST vs IGST)
--   4. cess_amount on purchase_bills (some compensation cess on goods)
--   5. cost_center_id / project_id / branch_id / department on payments,
--      advances, advance_adjustments, vendor_bill_payments — closes #7's
--      "every AP transaction must support cost-center" requirement
--   6. compute_intrastate() helper + trigger to auto-set intra_state on bills
--   7. Views: v_gstr3b_inputs, v_vendor_gstin_compliance, v_itc_pipeline
--
-- All steps are idempotent — safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. RCM rate/amount columns on purchase_bills ───────────────────────────
-- Mirrors the columns already on `expenses` so the bill RCM calculator and
-- the expense RCM calculator share a shape and the journal engine can read
-- either source uniformly.
ALTER TABLE purchase_bills
  ADD COLUMN IF NOT EXISTS rcm_rate    NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rcm_amount  NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cess_amount NUMERIC(14,2) NOT NULL DEFAULT 0;

-- ── 2. ITC lifecycle on purchase_bills ─────────────────────────────────────
-- itc_status tracks where the ITC claim sits in its lifecycle:
--   pending   → bill booked, eligible, but not yet claimed in GSTR-3B
--   claimed   → claimed in a specific GSTR-3B period (itc_claimed_period set)
--   reversed  → claimed and later reversed (e.g. payment not made within 180 days,
--               or vendor did not file GSTR-1, or ineligible-on-review)
--   blocked   → ITC explicitly disallowed under section 17(5) (food, motor, club, etc.)
--   not_applicable → bill has no GST or vendor was unregistered & non-RCM
ALTER TABLE purchase_bills
  ADD COLUMN IF NOT EXISTS itc_status TEXT
    CHECK (itc_status IN ('pending', 'claimed', 'reversed', 'blocked', 'not_applicable'))
    DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS itc_claimed_period TEXT, -- 'YYYY-MM' GSTR-3B period
  ADD COLUMN IF NOT EXISTS itc_reversal_reason TEXT,
  ADD COLUMN IF NOT EXISTS itc_blocked_reason TEXT,
  ADD COLUMN IF NOT EXISTS seller_state TEXT,
  ADD COLUMN IF NOT EXISTS intra_state BOOLEAN;

-- Backfill itc_status from the boolean we already had:
--   * gst_amount = 0 OR vendor_gst_status = 'unregistered' (without RCM) → not_applicable
--   * itc_eligible = false → blocked
--   * else → pending
UPDATE purchase_bills
SET itc_status =
  CASE
    WHEN COALESCE(gst_amount, 0) = 0 AND COALESCE(is_rcm, FALSE) = FALSE
      THEN 'not_applicable'
    WHEN COALESCE(itc_eligible, TRUE) = FALSE
      THEN 'blocked'
    ELSE 'pending'
  END
WHERE itc_status IS NULL;

-- ── 3. compute_intrastate helper + auto-fill trigger ───────────────────────
-- Indian GST uses the first two digits of GSTIN as the state code.
-- Intra-state when seller and buyer are in the same state (CGST + SGST split);
-- inter-state otherwise (IGST only).
CREATE OR REPLACE FUNCTION gstin_state_code(p_gstin TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_gstin IS NULL OR length(p_gstin) < 2 THEN NULL
    ELSE substring(p_gstin from 1 for 2)
  END;
$$;

CREATE OR REPLACE FUNCTION compute_bill_intrastate()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_seller_code TEXT;
  v_buyer_code  TEXT;
  v_user_gstin  TEXT;
BEGIN
  -- Only auto-fill when caller hasn't set it explicitly.
  IF NEW.intra_state IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- The user (buyer) GSTIN lives on a settings/business-profile table,
  -- but to keep this migration self-contained we look it up from a
  -- user_settings table if present, otherwise fall back to seller_state /
  -- place_of_supply comparison.
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='user_settings') THEN
    EXECUTE 'SELECT business_gstin FROM user_settings WHERE user_id = $1 LIMIT 1'
      INTO v_user_gstin USING NEW.user_id;
  END IF;

  v_seller_code := gstin_state_code(NEW.vendor_gst_number);
  v_buyer_code  := gstin_state_code(v_user_gstin);

  IF v_seller_code IS NOT NULL AND v_buyer_code IS NOT NULL THEN
    NEW.intra_state := (v_seller_code = v_buyer_code);
  ELSIF NEW.seller_state IS NOT NULL AND NEW.place_of_supply IS NOT NULL THEN
    NEW.intra_state := (lower(NEW.seller_state) = lower(NEW.place_of_supply));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bills_intrastate ON purchase_bills;
CREATE TRIGGER trg_bills_intrastate
  BEFORE INSERT OR UPDATE OF vendor_gst_number, seller_state, place_of_supply
  ON purchase_bills
  FOR EACH ROW EXECUTE FUNCTION compute_bill_intrastate();

-- ── 4. Cost-center / project / branch / department on AP transactions ─────
-- Tag every AP write so journal_lines can carry the same tags via the
-- journal engine, and cost-center / project P&Ls are correct.

-- vendor_bill_payments
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='vendor_bill_payments') THEN
    EXECUTE 'ALTER TABLE vendor_bill_payments
      ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS project_id     UUID,
      ADD COLUMN IF NOT EXISTS branch_id      UUID,
      ADD COLUMN IF NOT EXISTS department     TEXT';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='vendor_advances') THEN
    EXECUTE 'ALTER TABLE vendor_advances
      ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS project_id     UUID,
      ADD COLUMN IF NOT EXISTS branch_id      UUID,
      ADD COLUMN IF NOT EXISTS department     TEXT';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='advance_adjustments') THEN
    EXECUTE 'ALTER TABLE advance_adjustments
      ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS project_id     UUID,
      ADD COLUMN IF NOT EXISTS branch_id      UUID,
      ADD COLUMN IF NOT EXISTS department     TEXT';
  END IF;
END $$;

-- Bills already have cost_center_id; add the rest.
ALTER TABLE purchase_bills
  ADD COLUMN IF NOT EXISTS project_id  UUID,
  ADD COLUMN IF NOT EXISTS branch_id   UUID,
  ADD COLUMN IF NOT EXISTS department  TEXT;

-- Expenses already have cost_center_id from prior migration.
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS project_id  UUID,
  ADD COLUMN IF NOT EXISTS branch_id   UUID,
  ADD COLUMN IF NOT EXISTS department  TEXT;

-- ── 5. Indexes for cost-center / project / RCM rollups ─────────────────────
CREATE INDEX IF NOT EXISTS idx_bills_cost_center
  ON purchase_bills(user_id, cost_center_id) WHERE cost_center_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bills_project
  ON purchase_bills(user_id, project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bills_itc_status
  ON purchase_bills(user_id, itc_status, bill_date);
CREATE INDEX IF NOT EXISTS idx_expenses_project
  ON expenses(user_id, project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_rcm_pending
  ON expenses(user_id, expense_date) WHERE is_rcm = TRUE;

-- ── 6. View: v_gstr3b_inputs ───────────────────────────────────────────────
-- One row per ITC-eligible bill, with the period (YYYY-MM) it should appear
-- in on GSTR-3B Table 4(A). RCM bills appear in Table 3.1(d). Reversed/
-- blocked rows are excluded.
DROP VIEW IF EXISTS v_gstr3b_inputs;
CREATE VIEW v_gstr3b_inputs AS
SELECT
  pb.user_id,
  TO_CHAR(pb.bill_date, 'YYYY-MM')   AS period,
  pb.id                              AS bill_id,
  pb.bill_number,
  pb.vendor_id,
  pb.vendor_name,
  pb.vendor_gst_number,
  pb.vendor_gst_status,
  pb.is_rcm,
  pb.itc_status,
  pb.itc_claimed_period,
  pb.amount                          AS taxable_value,
  pb.cgst_amount,
  pb.sgst_amount,
  pb.igst_amount,
  pb.cess_amount,
  pb.gst_amount                      AS total_tax,
  pb.intra_state,
  pb.cost_center_id,
  pb.project_id,
  -- 'all_other_itc' (4A.5) vs 'itc_reversed' (4B) vs 'rcm_self' (3.1d/4A.3)
  CASE
    WHEN pb.itc_status = 'reversed' THEN 'itc_reversed'
    WHEN pb.is_rcm                  THEN 'rcm_self'
    ELSE 'all_other_itc'
  END AS gstr3b_section
FROM purchase_bills pb
WHERE pb.itc_status IN ('pending', 'claimed', 'reversed')
  AND pb.gst_amount > 0;

-- ── 7. View: v_vendor_gstin_compliance ────────────────────────────────────
-- Surfaces vendors whose GSTIN status is questionable, so AP can flag them
-- before they create more ITC mismatches.
DROP VIEW IF EXISTS v_vendor_gstin_compliance;
CREATE VIEW v_vendor_gstin_compliance AS
SELECT
  v.user_id,
  v.id                               AS vendor_id,
  v.name                             AS vendor_name,
  v.gst_number,
  v.gst_treatment,
  COUNT(pb.id) FILTER (WHERE pb.bill_date >= CURRENT_DATE - INTERVAL '12 months') AS recent_bill_count,
  SUM(pb.gst_amount) FILTER (WHERE pb.bill_date >= CURRENT_DATE - INTERVAL '12 months') AS recent_itc_value,
  COUNT(*) FILTER (WHERE pb.itc_status = 'reversed')                       AS reversed_count,
  COUNT(*) FILTER (WHERE pb.vendor_gst_status = 'unregistered'
                     AND pb.gst_amount > 0
                     AND COALESCE(pb.is_rcm, FALSE) = FALSE)               AS suspicious_unregistered_with_gst,
  COUNT(*) FILTER (WHERE pb.vendor_gst_status = 'composition'
                     AND pb.itc_status = 'pending'
                     AND pb.gst_amount > 0)                                AS composition_with_itc,
  CASE
    WHEN v.gst_number IS NULL OR v.gst_number = '' THEN 'no_gstin'
    WHEN length(v.gst_number) <> 15                THEN 'malformed_gstin'
    WHEN v.gst_treatment = 'composition'           THEN 'composition'
    WHEN v.gst_treatment = 'unregistered'          THEN 'unregistered'
    ELSE 'ok'
  END AS compliance_flag
FROM vendors v
LEFT JOIN purchase_bills pb ON pb.vendor_id = v.id AND pb.user_id = v.user_id
GROUP BY v.user_id, v.id, v.name, v.gst_number, v.gst_treatment;

-- ── 8. View: v_itc_pipeline ───────────────────────────────────────────────
-- Aggregate of ITC by status × period for the AP / GST dashboard.
DROP VIEW IF EXISTS v_itc_pipeline;
CREATE VIEW v_itc_pipeline AS
SELECT
  user_id,
  TO_CHAR(bill_date, 'YYYY-MM') AS period,
  itc_status,
  COUNT(*)                      AS bill_count,
  SUM(amount)                   AS taxable_value,
  SUM(cgst_amount)              AS cgst,
  SUM(sgst_amount)              AS sgst,
  SUM(igst_amount)              AS igst,
  SUM(cess_amount)              AS cess,
  SUM(gst_amount)               AS total_itc
FROM purchase_bills
WHERE gst_amount > 0
GROUP BY user_id, TO_CHAR(bill_date, 'YYYY-MM'), itc_status;

-- ── 9. View: v_cost_center_pnl ─────────────────────────────────────────────
-- Cost-center P&L sourced from journal_lines (works for any account that
-- the engine has tagged with cost_center_id).
DROP VIEW IF EXISTS v_cost_center_pnl;
CREATE VIEW v_cost_center_pnl AS
SELECT
  jl.user_id,
  jl.cost_center_id,
  cc.code         AS cost_center_code,
  cc.name         AS cost_center_name,
  TO_CHAR(jl.entry_date, 'YYYY-MM') AS period,
  a.account_type,
  SUM(CASE WHEN a.account_type = 'Income'  THEN COALESCE(jl.credit,0) - COALESCE(jl.debit,0) ELSE 0 END) AS income,
  SUM(CASE WHEN a.account_type = 'Expense' THEN COALESCE(jl.debit,0)  - COALESCE(jl.credit,0) ELSE 0 END) AS expense,
  SUM(CASE WHEN a.account_type = 'Income'  THEN COALESCE(jl.credit,0) - COALESCE(jl.debit,0)
           WHEN a.account_type = 'Expense' THEN -(COALESCE(jl.debit,0) - COALESCE(jl.credit,0))
           ELSE 0 END) AS net
FROM journal_lines jl
JOIN journals j  ON j.id = jl.journal_id AND j.status = 'posted'
JOIN accounts a  ON a.id = jl.account_id
LEFT JOIN cost_centers cc ON cc.id = jl.cost_center_id
WHERE jl.cost_center_id IS NOT NULL
  AND a.account_type IN ('Income', 'Expense')
GROUP BY jl.user_id, jl.cost_center_id, cc.code, cc.name,
         TO_CHAR(jl.entry_date, 'YYYY-MM'), a.account_type;

-- ── 10. View: v_project_pnl (parallel to cost-center) ──────────────────────
DROP VIEW IF EXISTS v_project_pnl;
CREATE VIEW v_project_pnl AS
SELECT
  jl.user_id,
  jl.project_id,
  TO_CHAR(jl.entry_date, 'YYYY-MM') AS period,
  a.account_type,
  SUM(CASE WHEN a.account_type = 'Income'  THEN COALESCE(jl.credit,0) - COALESCE(jl.debit,0) ELSE 0 END) AS income,
  SUM(CASE WHEN a.account_type = 'Expense' THEN COALESCE(jl.debit,0)  - COALESCE(jl.credit,0) ELSE 0 END) AS expense,
  SUM(CASE WHEN a.account_type = 'Income'  THEN COALESCE(jl.credit,0) - COALESCE(jl.debit,0)
           WHEN a.account_type = 'Expense' THEN -(COALESCE(jl.debit,0) - COALESCE(jl.credit,0))
           ELSE 0 END) AS net
FROM journal_lines jl
JOIN journals j ON j.id = jl.journal_id AND j.status = 'posted'
JOIN accounts a ON a.id = jl.account_id
WHERE jl.project_id IS NOT NULL
  AND a.account_type IN ('Income', 'Expense')
GROUP BY jl.user_id, jl.project_id,
         TO_CHAR(jl.entry_date, 'YYYY-MM'), a.account_type;

NOTIFY pgrst, 'reload schema';

COMMENT ON COLUMN purchase_bills.itc_status IS
  'Lifecycle of ITC claim: pending (booked, not yet in 3B) → claimed (in itc_claimed_period) → reversed (e.g. 180-day rule, vendor non-filing) | blocked (S.17(5)) | not_applicable.';
COMMENT ON COLUMN purchase_bills.intra_state IS
  'TRUE = same-state CGST+SGST split, FALSE = inter-state IGST. Auto-derived from GSTIN state codes when possible.';
