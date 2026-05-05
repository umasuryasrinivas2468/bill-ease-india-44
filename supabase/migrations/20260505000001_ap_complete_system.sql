-- ============================================================================
-- Complete Accounts Payable (AP) system
-- Adds: cost centers, payment allocations (persisted bill<->payment matches),
-- AP audit log, accounting period locks, duplicate-bill prevention, and
-- vendor ledger / GST ITC reporting views.
-- ============================================================================

-- ── 1. Cost Centers ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cost_centers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'department' CHECK (type IN ('department', 'project', 'branch', 'team', 'product', 'other')),
  parent_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  description TEXT,
  budget_amount DECIMAL(14,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE(user_id, code)
);
CREATE INDEX IF NOT EXISTS idx_cost_centers_user ON cost_centers(user_id);

ALTER TABLE cost_centers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cost_centers_owner" ON cost_centers;
CREATE POLICY "cost_centers_owner" ON cost_centers FOR ALL USING (
  user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
);

-- Tag cost-center on bills and expenses (nullable so old rows survive)
ALTER TABLE purchase_bills ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;
ALTER TABLE expenses        ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;

-- ── 2. Persistent payment allocations ─────────────────────────────────────
-- Tracks WHICH bill was settled by WHICH payment or advance, with how much.
CREATE TABLE IF NOT EXISTS payment_allocations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  bill_id UUID NOT NULL REFERENCES purchase_bills(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('payment', 'advance')),
  source_id UUID NOT NULL,        -- vendor_bill_payments.id OR vendor_advances.id
  vendor_id UUID,
  amount DECIMAL(14,2) NOT NULL CHECK (amount > 0),
  allocation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_user_bill ON payment_allocations(user_id, bill_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_source    ON payment_allocations(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_vendor    ON payment_allocations(user_id, vendor_id);

ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payment_allocations_owner" ON payment_allocations;
CREATE POLICY "payment_allocations_owner" ON payment_allocations FOR ALL USING (
  user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
);

-- ── 3. AP Audit Log ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ap_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  actor_id TEXT,                  -- Clerk user who took the action
  actor_email TEXT,
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'bill', 'payment', 'advance', 'advance_adjustment', 'expense',
    'allocation', 'vendor', 'period_lock'
  )),
  entity_id UUID,
  action TEXT NOT NULL CHECK (action IN (
    'create', 'update', 'delete', 'post', 'reverse', 'approve', 'reject', 'lock', 'unlock'
  )),
  amount DECIMAL(14,2),
  reference TEXT,                 -- bill_number / payment ref / etc.
  before_json JSONB,
  after_json JSONB,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);
CREATE INDEX IF NOT EXISTS idx_ap_audit_user_date ON ap_audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ap_audit_entity    ON ap_audit_log(entity_type, entity_id);

ALTER TABLE ap_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ap_audit_owner" ON ap_audit_log;
CREATE POLICY "ap_audit_owner" ON ap_audit_log FOR ALL USING (
  user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
);

-- ── 4. Accounting period lock ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounting_periods (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  label TEXT,                     -- e.g. "FY24-25 Q1", "April 2026"
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'soft_closed', 'locked')),
  locked_at TIMESTAMP WITH TIME ZONE,
  locked_by TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  CHECK (period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS idx_acct_periods_user_range ON accounting_periods(user_id, period_start, period_end);

ALTER TABLE accounting_periods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "acct_periods_owner" ON accounting_periods;
CREATE POLICY "acct_periods_owner" ON accounting_periods FOR ALL USING (
  user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
);

-- Helper: returns TRUE when a date sits in a locked period for the given user.
CREATE OR REPLACE FUNCTION is_period_locked(p_user_id TEXT, p_date DATE)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM accounting_periods
    WHERE user_id = p_user_id
      AND status = 'locked'
      AND p_date BETWEEN period_start AND period_end
  );
$$;

-- Trigger guards: block writes on bills / payments / advances when their date sits in a locked period.
CREATE OR REPLACE FUNCTION enforce_period_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_date DATE;
  v_user TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_user := OLD.user_id;
    v_date := COALESCE(
      (to_jsonb(OLD) ->> 'bill_date')::date,
      (to_jsonb(OLD) ->> 'payment_date')::date,
      (to_jsonb(OLD) ->> 'advance_date')::date,
      (to_jsonb(OLD) ->> 'expense_date')::date
    );
  ELSE
    v_user := NEW.user_id;
    v_date := COALESCE(
      (to_jsonb(NEW) ->> 'bill_date')::date,
      (to_jsonb(NEW) ->> 'payment_date')::date,
      (to_jsonb(NEW) ->> 'advance_date')::date,
      (to_jsonb(NEW) ->> 'expense_date')::date
    );
  END IF;

  IF v_date IS NOT NULL AND is_period_locked(v_user, v_date) THEN
    RAISE EXCEPTION 'Cannot modify % – the accounting period covering % is locked.', TG_TABLE_NAME, v_date
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_period_lock_purchase_bills ON purchase_bills;
CREATE TRIGGER trg_period_lock_purchase_bills
  BEFORE INSERT OR UPDATE OR DELETE ON purchase_bills
  FOR EACH ROW EXECUTE FUNCTION enforce_period_lock();

DROP TRIGGER IF EXISTS trg_period_lock_expenses ON expenses;
CREATE TRIGGER trg_period_lock_expenses
  BEFORE INSERT OR UPDATE OR DELETE ON expenses
  FOR EACH ROW EXECUTE FUNCTION enforce_period_lock();

-- These tables exist only when the app has been used for vendor advances/payments.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vendor_bill_payments') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_period_lock_vendor_bill_payments ON vendor_bill_payments';
    EXECUTE 'CREATE TRIGGER trg_period_lock_vendor_bill_payments
      BEFORE INSERT OR UPDATE OR DELETE ON vendor_bill_payments
      FOR EACH ROW EXECUTE FUNCTION enforce_period_lock()';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vendor_advances') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_period_lock_vendor_advances ON vendor_advances';
    EXECUTE 'CREATE TRIGGER trg_period_lock_vendor_advances
      BEFORE INSERT OR UPDATE OR DELETE ON vendor_advances
      FOR EACH ROW EXECUTE FUNCTION enforce_period_lock()';
  END IF;
END $$;

-- ── 5. Duplicate bill prevention (vendor + bill_number per user) ──────────
-- A unique index lets the app fall back to a clean upsert error.
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_bills_vendor_billno
  ON purchase_bills(user_id, vendor_id, lower(bill_number))
  WHERE bill_number IS NOT NULL AND bill_number <> '';

-- ── 6. Vendor ledger view (running balance per vendor) ───────────────────
-- Combines bill (credit-side) entries, payments (debit-side), and advance
-- adjustments into one chronological feed for the Vendor Ledger UI.
-- Built dynamically so the migration is safe on installs where
-- vendor_bill_payments / advance_adjustments / vendor_advances haven't been
-- created yet. Each branch is included only when its source table exists.
DROP VIEW IF EXISTS v_vendor_ledger;

DO $build_vendor_ledger$
DECLARE
  v_sql TEXT := '';
  has_payments  BOOLEAN := EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vendor_bill_payments');
  has_adv_adj   BOOLEAN := EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'advance_adjustments');
  has_advances  BOOLEAN := EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vendor_advances');
  pay_ref_col   TEXT;
  adv_fk_col    TEXT;
BEGIN
  -- Bills branch (always present — purchase_bills exists in this app).
  v_sql := $sql$
    SELECT
      pb.user_id,
      pb.vendor_id,
      pb.vendor_name,
      pb.bill_date            AS txn_date,
      'bill'::text            AS txn_type,
      pb.bill_number          AS reference,
      pb.id                   AS source_id,
      0::numeric              AS debit,
      pb.total_amount         AS credit,
      CONCAT('Bill ', pb.bill_number) AS narration
    FROM purchase_bills pb
  $sql$;

  -- Payments branch — pick whichever reference column actually exists.
  IF has_payments THEN
    SELECT column_name INTO pay_ref_col
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vendor_bill_payments'
      AND column_name IN ('reference_number', 'payment_reference', 'reference')
    ORDER BY CASE column_name
      WHEN 'reference_number'  THEN 1
      WHEN 'payment_reference' THEN 2
      WHEN 'reference'         THEN 3 END
    LIMIT 1;

    v_sql := v_sql || ' UNION ALL ' || format($sql$
      SELECT
        vbp.user_id,
        pb.vendor_id,
        pb.vendor_name,
        COALESCE(vbp.payment_date, vbp.created_at::date) AS txn_date,
        'payment'::text         AS txn_type,
        %s                      AS reference,
        vbp.id                  AS source_id,
        vbp.amount              AS debit,
        0::numeric              AS credit,
        CONCAT('Payment for ', pb.bill_number) AS narration
      FROM vendor_bill_payments vbp
      JOIN purchase_bills pb ON pb.id = vbp.bill_id
    $sql$, COALESCE('vbp.' || quote_ident(pay_ref_col), 'NULL::text'));
  END IF;

  -- Advance adjustments branch — pick whichever FK column actually exists.
  IF has_adv_adj AND has_advances THEN
    SELECT column_name INTO adv_fk_col
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'advance_adjustments'
      AND column_name IN ('advance_id', 'vendor_advance_id')
    ORDER BY CASE column_name
      WHEN 'advance_id'         THEN 1
      WHEN 'vendor_advance_id'  THEN 2 END
    LIMIT 1;

    IF adv_fk_col IS NOT NULL THEN
      v_sql := v_sql || ' UNION ALL ' || format($sql$
        SELECT
          aa.user_id,
          va.vendor_id,
          va.vendor_name,
          aa.adjustment_date      AS txn_date,
          'advance_adjustment'::text AS txn_type,
          va.advance_number       AS reference,
          aa.id                   AS source_id,
          aa.amount               AS debit,
          0::numeric              AS credit,
          CONCAT('Advance ', va.advance_number, ' adjusted') AS narration
        FROM advance_adjustments aa
        JOIN vendor_advances va ON va.id = aa.%I
      $sql$, adv_fk_col);
    END IF;
  END IF;

  EXECUTE 'CREATE VIEW v_vendor_ledger AS ' || v_sql;
END $build_vendor_ledger$;

-- ── 7. GST Input Tax Credit (ITC) summary view ──────────────────────────
CREATE OR REPLACE VIEW v_gst_itc_summary AS
SELECT
  user_id,
  date_trunc('month', bill_date)::date AS period_month,
  vendor_name,
  vendor_gst_number,
  COUNT(*)                                 AS bill_count,
  SUM(amount)                              AS taxable_value,
  SUM(gst_amount)                          AS itc_available,
  SUM(total_amount)                        AS gross_value
FROM purchase_bills
WHERE gst_amount > 0
GROUP BY user_id, date_trunc('month', bill_date)::date, vendor_name, vendor_gst_number;

-- ── 8. Cost-center spend roll-up view ────────────────────────────────────
CREATE OR REPLACE VIEW v_cost_center_spend AS
SELECT
  cc.user_id,
  cc.id        AS cost_center_id,
  cc.code,
  cc.name,
  cc.budget_amount,
  COALESCE(SUM(pb.total_amount), 0) AS bill_spend,
  COALESCE((
    SELECT SUM(e.total_amount)
    FROM expenses e
    WHERE e.cost_center_id = cc.id
  ), 0) AS expense_spend,
  COALESCE(SUM(pb.total_amount), 0)
    + COALESCE((SELECT SUM(e.total_amount) FROM expenses e WHERE e.cost_center_id = cc.id), 0)
    AS total_spend
FROM cost_centers cc
LEFT JOIN purchase_bills pb ON pb.cost_center_id = cc.id
GROUP BY cc.user_id, cc.id, cc.code, cc.name, cc.budget_amount;

-- ── 9. Helpful keep-up-to-date trigger ───────────────────────────────────
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = TIMEZONE('utc', NOW()); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_cost_centers_updated ON cost_centers;
CREATE TRIGGER trg_cost_centers_updated
  BEFORE UPDATE ON cost_centers
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_periods_updated ON accounting_periods;
CREATE TRIGGER trg_periods_updated
  BEFORE UPDATE ON accounting_periods
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================================
-- End of AP system migration
-- ============================================================================
