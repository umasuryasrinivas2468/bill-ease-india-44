-- ════════════════════════════════════════════════════════════════════════════
-- Brief items #3 (vendor sub-ledger — view already shipped in 20260507000001),
-- #14 (audit trail + period locking + RBAC), #15 (real-time reports rebuilt
-- on journal_lines).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. RBAC: roles, permissions, role assignments (#14) ────────────────────
-- Permissions are stored as a string array on role_definitions so callers
-- can do `'bill.create' = ANY(perms)` cheaply. App-layer guards check
-- v_user_permissions on each mutation.
CREATE TABLE IF NOT EXISTS role_definitions (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     TEXT NOT NULL,                   -- tenant owner (Clerk org / user)
  role_key    TEXT NOT NULL,                   -- e.g. 'admin', 'finance', 'staff', 'viewer'
  display_name TEXT NOT NULL,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, role_key)
);

CREATE TABLE IF NOT EXISTS user_role_assignments (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     TEXT NOT NULL,                 -- the AP-system "owner" user_id
  member_user_id TEXT NOT NULL,                -- Clerk user being granted access
  role_id       UUID NOT NULL REFERENCES role_definitions(id) ON DELETE CASCADE,
  granted_by    TEXT,
  granted_at    TIMESTAMPTZ DEFAULT NOW(),
  revoked_at    TIMESTAMPTZ,
  UNIQUE (tenant_id, member_user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_role_definitions_user
  ON role_definitions(user_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_member
  ON user_role_assignments(member_user_id) WHERE revoked_at IS NULL;

ALTER TABLE role_definitions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_role_assignments  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "role_def_owner" ON role_definitions;
CREATE POLICY "role_def_owner" ON role_definitions FOR ALL USING (
  user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
);
DROP POLICY IF EXISTS "role_assign_tenant" ON user_role_assignments;
CREATE POLICY "role_assign_tenant" ON user_role_assignments FOR ALL USING (
  tenant_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
  OR member_user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
);

-- View: a user's effective permissions across all assigned (non-revoked) roles.
DROP VIEW IF EXISTS v_user_permissions;
CREATE VIEW v_user_permissions AS
SELECT
  ura.tenant_id,
  ura.member_user_id,
  array_agg(DISTINCT perm ORDER BY perm) AS permissions
FROM user_role_assignments ura
JOIN role_definitions rd ON rd.id = ura.role_id AND rd.is_active = TRUE
CROSS JOIN LATERAL unnest(rd.permissions) AS perm
WHERE ura.revoked_at IS NULL
GROUP BY ura.tenant_id, ura.member_user_id;

-- Helper: callable from app or other triggers.
CREATE OR REPLACE FUNCTION user_has_permission(
  p_tenant_id TEXT, p_member_id TEXT, p_perm TEXT
) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
      FROM user_role_assignments ura
      JOIN role_definitions rd ON rd.id = ura.role_id AND rd.is_active = TRUE
     WHERE ura.tenant_id = p_tenant_id
       AND ura.member_user_id = p_member_id
       AND ura.revoked_at IS NULL
       AND p_perm = ANY (rd.permissions)
  ) OR p_tenant_id = p_member_id;  -- tenant owner has all permissions
$$;

-- Seed default roles for a user (called from app on first run if needed).
CREATE OR REPLACE FUNCTION seed_default_roles(p_user_id TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO role_definitions (user_id, role_key, display_name, permissions) VALUES
    (p_user_id, 'admin',   'Administrator',
       ARRAY['*']),
    (p_user_id, 'finance', 'Finance Manager',
       ARRAY['bill.create','bill.update','bill.post','bill.void','bill.approve',
             'payment.create','payment.update','payment.void','payment.approve',
             'expense.create','expense.update','expense.post','expense.approve',
             'vendor.create','vendor.update','journal.post','journal.reverse',
             'period.lock','period.unlock','report.view','dashboard.view']),
    (p_user_id, 'staff',   'Staff',
       ARRAY['bill.create','bill.update',
             'payment.create','payment.update',
             'expense.create','expense.update',
             'vendor.create','vendor.update','report.view','dashboard.view']),
    (p_user_id, 'viewer',  'Viewer',
       ARRAY['report.view','dashboard.view'])
  ON CONFLICT (user_id, role_key) DO NOTHING;
END;
$$;

-- ── 2. Append-only enforcement on ap_audit_log (#14) ───────────────────────
-- The log must never be rewritten. Block UPDATE / DELETE.
CREATE OR REPLACE FUNCTION ap_audit_append_only()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ap_audit_log is append-only — % blocked.', TG_OP
    USING ERRCODE = '23514';
END;
$$;

DROP TRIGGER IF EXISTS trg_ap_audit_append_only ON ap_audit_log;
CREATE TRIGGER trg_ap_audit_append_only
  BEFORE UPDATE OR DELETE ON ap_audit_log
  FOR EACH ROW EXECUTE FUNCTION ap_audit_append_only();

-- ── 3. Generic audit trigger for AP entities ───────────────────────────────
-- Drops a row into ap_audit_log on every INSERT / UPDATE / DELETE of the
-- tracked tables. before_json / after_json snapshots make point-in-time
-- reconstruction trivial. The app-side recordApAudit() call still works
-- (and is preferred for richer notes); this trigger catches anything that
-- bypasses the hooks (e.g. SQL admin patches, edge-function inserts).
CREATE OR REPLACE FUNCTION ap_auto_audit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_user      TEXT;
  v_entity    TEXT := TG_ARGV[0];
  v_action    TEXT;
  v_amount    NUMERIC;
  v_reference TEXT;
  v_before    JSONB;
  v_after     JSONB;
BEGIN
  v_action := lower(TG_OP);   -- insert | update | delete
  IF TG_OP = 'INSERT' THEN
    v_user      := NEW.user_id;
    v_after     := to_jsonb(NEW);
    v_amount    := COALESCE((v_after ->> 'total_amount')::numeric,
                            (v_after ->> 'amount')::numeric);
    v_reference := COALESCE(v_after ->> 'bill_number',
                            v_after ->> 'reference_number',
                            v_after ->> 'advance_number',
                            v_after ->> 'expense_number');
    v_action    := 'create';
  ELSIF TG_OP = 'UPDATE' THEN
    v_user      := NEW.user_id;
    v_before    := to_jsonb(OLD);
    v_after     := to_jsonb(NEW);
    v_amount    := COALESCE((v_after ->> 'total_amount')::numeric,
                            (v_after ->> 'amount')::numeric);
    v_reference := COALESCE(v_after ->> 'bill_number',
                            v_after ->> 'reference_number',
                            v_after ->> 'advance_number',
                            v_after ->> 'expense_number');
    v_action    := 'update';
  ELSE -- DELETE
    v_user      := OLD.user_id;
    v_before    := to_jsonb(OLD);
    v_amount    := COALESCE((v_before ->> 'total_amount')::numeric,
                            (v_before ->> 'amount')::numeric);
    v_reference := COALESCE(v_before ->> 'bill_number',
                            v_before ->> 'reference_number',
                            v_before ->> 'advance_number',
                            v_before ->> 'expense_number');
    v_action    := 'delete';
  END IF;

  INSERT INTO ap_audit_log (
    user_id, actor_id, entity_type, entity_id, action, amount, reference,
    before_json, after_json, notes
  )
  VALUES (
    v_user,
    NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''),
    v_entity,
    COALESCE((v_after ->> 'id')::uuid, (v_before ->> 'id')::uuid),
    v_action,
    v_amount,
    v_reference,
    v_before,
    v_after,
    'auto-trigger'
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- Wire the trigger to AP tables. Drop-then-create for idempotency.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='purchase_bills') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_bill ON purchase_bills';
    EXECUTE 'CREATE TRIGGER trg_audit_bill AFTER INSERT OR UPDATE OR DELETE ON purchase_bills
       FOR EACH ROW EXECUTE FUNCTION ap_auto_audit(''bill'')';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='vendor_bill_payments') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_payment ON vendor_bill_payments';
    EXECUTE 'CREATE TRIGGER trg_audit_payment AFTER INSERT OR UPDATE OR DELETE ON vendor_bill_payments
       FOR EACH ROW EXECUTE FUNCTION ap_auto_audit(''payment'')';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='vendor_advances') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_advance ON vendor_advances';
    EXECUTE 'CREATE TRIGGER trg_audit_advance AFTER INSERT OR UPDATE OR DELETE ON vendor_advances
       FOR EACH ROW EXECUTE FUNCTION ap_auto_audit(''advance'')';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='advance_adjustments') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_adj ON advance_adjustments';
    EXECUTE 'CREATE TRIGGER trg_audit_adj AFTER INSERT OR UPDATE OR DELETE ON advance_adjustments
       FOR EACH ROW EXECUTE FUNCTION ap_auto_audit(''advance_adjustment'')';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='expenses') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_expense ON expenses';
    EXECUTE 'CREATE TRIGGER trg_audit_expense AFTER INSERT OR UPDATE OR DELETE ON expenses
       FOR EACH ROW EXECUTE FUNCTION ap_auto_audit(''expense'')';
  END IF;
END $$;

-- ── 4. Reports rebuilt on journal_lines (#15) ──────────────────────────────

-- 4a. AP aging — buckets per vendor, sourced from open bills.
DROP VIEW IF EXISTS v_ap_aging;
CREATE VIEW v_ap_aging AS
WITH open_bills AS (
  SELECT
    pb.user_id,
    pb.vendor_id,
    pb.vendor_name,
    pb.id AS bill_id,
    pb.bill_number,
    pb.bill_date,
    pb.due_date,
    GREATEST(pb.total_amount - COALESCE(pb.paid_amount, 0), 0) AS open_amount,
    CURRENT_DATE - pb.due_date AS days_past_due
  FROM purchase_bills pb
  WHERE COALESCE(lower(pb.status),'') NOT IN ('paid','cancelled','void','voided')
    AND pb.total_amount > COALESCE(pb.paid_amount, 0) + 0.01
)
SELECT
  user_id,
  vendor_id,
  vendor_name,
  COUNT(*)                                                         AS bill_count,
  SUM(open_amount)                                                 AS total_open,
  SUM(CASE WHEN days_past_due <  0                          THEN open_amount ELSE 0 END) AS not_yet_due,
  SUM(CASE WHEN days_past_due BETWEEN  0 AND 30             THEN open_amount ELSE 0 END) AS bucket_0_30,
  SUM(CASE WHEN days_past_due BETWEEN 31 AND 60             THEN open_amount ELSE 0 END) AS bucket_31_60,
  SUM(CASE WHEN days_past_due BETWEEN 61 AND 90             THEN open_amount ELSE 0 END) AS bucket_61_90,
  SUM(CASE WHEN days_past_due > 90                          THEN open_amount ELSE 0 END) AS bucket_90_plus,
  MAX(days_past_due)                                               AS oldest_days
FROM open_bills
GROUP BY user_id, vendor_id, vendor_name;

-- 4b. Cash flow from journal_lines on bank/cash accounts.
DROP VIEW IF EXISTS v_cash_flow;
CREATE VIEW v_cash_flow AS
SELECT
  jl.user_id,
  TO_CHAR(jl.entry_date, 'YYYY-MM') AS period,
  a.account_name,
  SUM(COALESCE(jl.debit, 0))   AS inflow,
  SUM(COALESCE(jl.credit, 0))  AS outflow,
  SUM(COALESCE(jl.debit, 0) - COALESCE(jl.credit, 0)) AS net
FROM journal_lines jl
JOIN journals j ON j.id = jl.journal_id AND j.status = 'posted'
JOIN accounts a ON a.id = jl.account_id
WHERE a.account_type = 'Asset'
  AND lower(a.account_name) ~ '(bank|cash)'
GROUP BY jl.user_id, TO_CHAR(jl.entry_date, 'YYYY-MM'), a.account_name;

-- 4c. P&L from journal_lines.
DROP VIEW IF EXISTS v_pnl_summary;
CREATE VIEW v_pnl_summary AS
SELECT
  jl.user_id,
  TO_CHAR(jl.entry_date, 'YYYY-MM') AS period,
  a.id              AS account_id,
  a.account_code,
  a.account_name,
  a.account_type,
  CASE
    WHEN a.account_type = 'Income'  THEN SUM(COALESCE(jl.credit,0) - COALESCE(jl.debit,0))
    WHEN a.account_type = 'Expense' THEN SUM(COALESCE(jl.debit,0)  - COALESCE(jl.credit,0))
    ELSE 0
  END AS amount
FROM journal_lines jl
JOIN journals j ON j.id = jl.journal_id AND j.status = 'posted'
JOIN accounts a ON a.id = jl.account_id
WHERE a.account_type IN ('Income', 'Expense')
GROUP BY jl.user_id, TO_CHAR(jl.entry_date, 'YYYY-MM'),
         a.id, a.account_code, a.account_name, a.account_type;

-- 4d. Balance sheet from journal_lines + opening balance.
DROP VIEW IF EXISTS v_balance_sheet;
CREATE VIEW v_balance_sheet AS
SELECT
  a.user_id,
  a.id AS account_id,
  a.account_code,
  a.account_name,
  a.account_type,
  a.opening_balance,
  COALESCE(SUM(jl.debit),  0)   AS total_debit,
  COALESCE(SUM(jl.credit), 0)   AS total_credit,
  CASE a.account_type
    WHEN 'Asset'     THEN a.opening_balance + COALESCE(SUM(jl.debit  - jl.credit), 0)
    WHEN 'Liability' THEN a.opening_balance + COALESCE(SUM(jl.credit - jl.debit ), 0)
    WHEN 'Equity'    THEN a.opening_balance + COALESCE(SUM(jl.credit - jl.debit ), 0)
    ELSE 0
  END AS closing_balance
FROM accounts a
LEFT JOIN journal_lines jl ON jl.account_id = a.id
LEFT JOIN journals j       ON j.id = jl.journal_id AND j.status = 'posted'
WHERE a.is_active
  AND a.account_type IN ('Asset','Liability','Equity')
GROUP BY a.user_id, a.id, a.account_code, a.account_name, a.account_type, a.opening_balance;

-- 4e. Inventory valuation from movements.
DROP VIEW IF EXISTS v_inventory_valuation;
CREATE VIEW v_inventory_valuation AS
SELECT
  inv.user_id,
  inv.id                            AS item_id,
  inv.product_name,
  inv.type,
  inv.average_cost,
  inv.stock_quantity,
  inv.stock_value,
  COALESCE(inv.stock_quantity * inv.average_cost, 0) AS computed_value,
  inv.stock_value - COALESCE(inv.stock_quantity * inv.average_cost, 0) AS valuation_drift
FROM inventory inv
WHERE inv.user_id IS NOT NULL;

-- 4f. AP dashboard top-line — total payable, overdue, upcoming, advances.
DROP VIEW IF EXISTS v_ap_dashboard;
CREATE VIEW v_ap_dashboard AS
SELECT
  pb.user_id,
  COUNT(*) FILTER (WHERE COALESCE(lower(pb.status),'') NOT IN ('paid','cancelled','void','voided'))   AS open_bills,
  SUM(GREATEST(pb.total_amount - COALESCE(pb.paid_amount,0), 0))
    FILTER (WHERE COALESCE(lower(pb.status),'') NOT IN ('paid','cancelled','void','voided'))           AS total_payable,
  SUM(GREATEST(pb.total_amount - COALESCE(pb.paid_amount,0), 0))
    FILTER (WHERE pb.due_date < CURRENT_DATE
                  AND COALESCE(lower(pb.status),'') NOT IN ('paid','cancelled','void','voided'))       AS overdue_amount,
  SUM(GREATEST(pb.total_amount - COALESCE(pb.paid_amount,0), 0))
    FILTER (WHERE pb.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
                  AND COALESCE(lower(pb.status),'') NOT IN ('paid','cancelled','void','voided'))       AS upcoming_30d,
  COALESCE((
    SELECT SUM(va.amount - COALESCE(va.adjusted_amount,0))
      FROM vendor_advances va
     WHERE va.user_id = pb.user_id
       AND va.amount > COALESCE(va.adjusted_amount,0)
       AND COALESCE(va.status,'active') NOT IN ('cancelled','void','closed')
  ), 0) AS unadjusted_advances,
  SUM(pb.gst_amount) FILTER (WHERE pb.itc_status = 'pending')                                         AS itc_pending_value
FROM purchase_bills pb
GROUP BY pb.user_id;

-- 4g. Cash outflow forecast — open bills bucketed by upcoming due-date weeks.
DROP VIEW IF EXISTS v_cash_outflow_forecast;
CREATE VIEW v_cash_outflow_forecast AS
SELECT
  pb.user_id,
  date_trunc('week', pb.due_date)::date AS week_start,
  SUM(GREATEST(pb.total_amount - COALESCE(pb.paid_amount,0), 0)) AS forecast_amount,
  COUNT(*)                                                       AS bill_count
FROM purchase_bills pb
WHERE pb.due_date >= CURRENT_DATE
  AND pb.due_date <= CURRENT_DATE + INTERVAL '90 days'
  AND COALESCE(lower(pb.status),'') NOT IN ('paid','cancelled','void','voided')
GROUP BY pb.user_id, date_trunc('week', pb.due_date);

-- 4h. Vendor concentration — top 10 vendors by spend (last 12 months).
DROP VIEW IF EXISTS v_vendor_concentration;
CREATE VIEW v_vendor_concentration AS
SELECT
  pb.user_id,
  pb.vendor_id,
  pb.vendor_name,
  COUNT(*)             AS bill_count,
  SUM(pb.total_amount) AS spend_12m
FROM purchase_bills pb
WHERE pb.bill_date >= CURRENT_DATE - INTERVAL '12 months'
  AND COALESCE(lower(pb.status),'') NOT IN ('cancelled','void','voided')
GROUP BY pb.user_id, pb.vendor_id, pb.vendor_name;

-- ── 5. Index hygiene for report views ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bills_open_for_aging
  ON purchase_bills(user_id, due_date)
  WHERE COALESCE(lower(status),'') NOT IN ('paid','cancelled','void','voided');

CREATE INDEX IF NOT EXISTS idx_journal_lines_account_type_date
  ON journal_lines(account_id, entry_date);

CREATE INDEX IF NOT EXISTS idx_ap_audit_log_entity_date
  ON ap_audit_log(user_id, entity_type, entity_id, created_at DESC);

NOTIFY pgrst, 'reload schema';

COMMENT ON VIEW v_ap_aging IS
  'Per-vendor open balance bucketed by days past due (0-30/31-60/61-90/90+). Source = open purchase_bills.';
COMMENT ON VIEW v_pnl_summary IS
  'Per-account P&L by month, derived from posted journal_lines. Replaces ad-hoc SUM queries scattered across the app.';
COMMENT ON VIEW v_balance_sheet IS
  'Account balances (asset/liability/equity) at any point in time, derived from posted journal_lines + opening_balance.';
