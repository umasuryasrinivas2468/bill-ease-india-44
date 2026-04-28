-- ============================================================================
-- Migration: Invoice + Expense Deep Features (#1 – #30, skipping #13)
-- Date: 2026-04-26
--
-- Covers schema for:
--   1.  Central Invoice Control Register   → invoices.* metadata columns
--   2.  Lifecycle Tracking Engine          → invoices.lifecycle_stage + events
--   3.  Collection Priority Engine         → derived view
--   4.  Invoice Risk Detector              → invoice_risk_flags
--   5.  Revenue Recognition Layer          → revenue_recognition_schedules
--   6.  Partial Payment Engine             → invoice_payments (with TDS)
--   7.  Smart Reminder Automation          → invoice_reminder_rules + log
--   8.  Customer Credit Exposure Meter     → clients.credit_limit + view
--   9.  Invoice Conversion Funnel          → derived view
--   10. Customer Billing Behavior Score    → derived view
--   11. Central Expense Intelligence       → expenses.* metadata
--   12. Cost Center Allocation Engine      → expense_cost_allocations
--   13. (skipped per request)
--   14. Expense Leakage Detector           → derived
--   15. Vendor Spend Analytics             → derived view
--   16. GST Input Credit Layer             → expenses.itc_eligible flag
--   17. Employee Expense Wallet            → expenses.employee_id
--   18. Budget Guardrail System            → budgets + budget_alerts
--   19. Subscription Cost Analyzer         → subscriptions
--   20. Expense Fraud Signals              → derived
--   21. Real Profit Engine                 → derived
--   22. Client Profitability Analyzer      → expenses.client_id link
--   23. Cash Conversion Cycle Dashboard    → derived
--   24. Burn vs Revenue Dashboard          → derived
--   25. Monthly Variance Engine            → derived
--   26-30. AI premium layer                → cfo_pulse_log + cfo_questions
--
-- Idempotent. Safe to re-run.
-- All new tables follow the existing Clerk JWT sub RLS pattern.
-- ============================================================================

-- ── 1. INVOICES: control register metadata ─────────────────────────────────
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS branch TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS created_by_name TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS last_updated_by TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER DEFAULT 30;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR';

-- ── 2. INVOICES: lifecycle tracking ────────────────────────────────────────
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT
  CHECK (lifecycle_stage IN ('draft','approved','sent','viewed','accepted','part_paid','paid','closed'))
  DEFAULT 'draft';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS approved_at  TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_at      TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS viewed_at    TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS accepted_at  TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS closed_at    TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS invoice_lifecycle_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  notes TEXT,
  actor TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_invoice ON invoice_lifecycle_events(invoice_id);
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_user ON invoice_lifecycle_events(user_id);

-- ── 4. INVOICE RISK FLAGS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_risk_flags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  flag_type TEXT NOT NULL CHECK (flag_type IN (
    'duplicate_number','wrong_gst_rate','negative_margin',
    'repeated_edits','wrong_gstin','high_value_unverified'
  )),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high')),
  details JSONB,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);
CREATE INDEX IF NOT EXISTS idx_risk_flags_user ON invoice_risk_flags(user_id);
CREATE INDEX IF NOT EXISTS idx_risk_flags_invoice ON invoice_risk_flags(invoice_id);

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS edit_count INTEGER DEFAULT 0;

-- ── 5. REVENUE RECOGNITION SCHEDULES ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS revenue_recognition_schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  contract_value DECIMAL(14,2) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  recognition_frequency TEXT NOT NULL CHECK (recognition_frequency IN ('monthly','quarterly','milestone')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);
CREATE TABLE IF NOT EXISTS revenue_recognition_periods (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id UUID NOT NULL REFERENCES revenue_recognition_schedules(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  recognized BOOLEAN DEFAULT FALSE,
  recognized_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_revrec_user ON revenue_recognition_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_revrec_periods_schedule ON revenue_recognition_periods(schedule_id);

-- ── 6. INVOICE PAYMENTS (partial / TDS / multi-receipt) ────────────────────
CREATE TABLE IF NOT EXISTS invoice_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  tds_deducted DECIMAL(14,2) DEFAULT 0,
  short_payment DECIMAL(14,2) DEFAULT 0,
  payment_mode TEXT,
  reference_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_user ON invoice_payments(user_id);

-- ── 7. SMART REMINDERS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_reminder_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('before_due','on_due','after_due','escalation')),
  offset_days INTEGER NOT NULL DEFAULT 0,
  channels TEXT[] NOT NULL DEFAULT ARRAY['email']::TEXT[],
  template TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);
CREATE TABLE IF NOT EXISTS invoice_reminder_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES invoice_reminder_rules(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued','sent','failed')),
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_reminder_rules_user ON invoice_reminder_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_reminder_log_invoice ON invoice_reminder_log(invoice_id);

-- ── 8. CLIENTS: credit limit (#8) ──────────────────────────────────────────
ALTER TABLE clients ADD COLUMN IF NOT EXISTS credit_limit DECIMAL(14,2) DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS risk_score INTEGER DEFAULT 50
  CHECK (risk_score BETWEEN 0 AND 100);

-- ── 11. EXPENSES: intelligence register columns ────────────────────────────
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS branch TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS employee_id TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS employee_name TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS gst_amount DECIMAL(14,2) DEFAULT 0;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS itc_eligible BOOLEAN DEFAULT TRUE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS cost_center TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

-- ── 12. EXPENSE COST CENTER ALLOCATIONS ────────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_cost_allocations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  cost_center TEXT NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  percent NUMERIC(5,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);
CREATE INDEX IF NOT EXISTS idx_cost_alloc_expense ON expense_cost_allocations(expense_id);
CREATE INDEX IF NOT EXISTS idx_cost_alloc_user ON expense_cost_allocations(user_id);

-- ── 18. BUDGETS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budgets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category_name TEXT,
  cost_center TEXT,
  department TEXT,
  period_type TEXT NOT NULL CHECK (period_type IN ('monthly','quarterly','yearly')) DEFAULT 'monthly',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  warn_at_percent NUMERIC(5,2) DEFAULT 80,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);
CREATE TABLE IF NOT EXISTS budget_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK (level IN ('warn_80','reached_100','overspend')),
  amount_at_alert DECIMAL(14,2),
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);
CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id);

-- ── 19. SUBSCRIPTIONS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  product_name TEXT NOT NULL,
  monthly_cost DECIMAL(14,2) NOT NULL,
  billing_cycle TEXT CHECK (billing_cycle IN ('monthly','quarterly','yearly')) DEFAULT 'monthly',
  next_renewal_date DATE,
  category TEXT,
  seats INTEGER,
  used_seats INTEGER,
  is_active BOOLEAN DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);

-- ── 26-30. AI / FOUNDER PULSE ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cfo_pulse_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  pulse_date DATE NOT NULL,
  metrics JSONB NOT NULL,
  alerts JSONB,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE(user_id, pulse_date)
);
CREATE TABLE IF NOT EXISTS cfo_questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT,
  context JSONB,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);
CREATE INDEX IF NOT EXISTS idx_pulse_user ON cfo_pulse_log(user_id);
CREATE INDEX IF NOT EXISTS idx_questions_user ON cfo_questions(user_id);

-- ── ENABLE RLS + POLICIES (Clerk JWT sub) ──────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'invoice_lifecycle_events',
    'invoice_risk_flags',
    'revenue_recognition_schedules',
    'revenue_recognition_periods',
    'invoice_payments',
    'invoice_reminder_rules',
    'invoice_reminder_log',
    'expense_cost_allocations',
    'budgets',
    'budget_alerts',
    'subscriptions',
    'cfo_pulse_log',
    'cfo_questions'
  ]) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      DROP POLICY IF EXISTS "%1$s_owner_all" ON %1$I;
      CREATE POLICY "%1$s_owner_all" ON %1$I FOR ALL
        USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))
        WITH CHECK (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));
    $f$, t);
  END LOOP;
END $$;

-- ── HELPFUL INDEXES ON EXISTING TABLES ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_invoices_lifecycle_stage ON invoices(lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_invoices_branch ON invoices(branch);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_expenses_branch ON expenses(branch);
CREATE INDEX IF NOT EXISTS idx_expenses_employee ON expenses(employee_id);
CREATE INDEX IF NOT EXISTS idx_expenses_cost_center ON expenses(cost_center);
CREATE INDEX IF NOT EXISTS idx_expenses_client ON expenses(client_id);

-- ── 9. CONVERSION FUNNEL VIEW ──────────────────────────────────────────────
-- Stage counts per user. Quotation → Sales Order → Invoice → Paid.
CREATE OR REPLACE VIEW vw_conversion_funnel AS
SELECT
  u AS user_id,
  (SELECT COUNT(*) FROM quotations  q  WHERE q.user_id = u) AS quotations_count,
  (SELECT COUNT(*) FROM sales_orders so WHERE so.user_id = u) AS sales_orders_count,
  (SELECT COUNT(*) FROM invoices    i  WHERE i.user_id = u) AS invoices_count,
  (SELECT COUNT(*) FROM invoices    i  WHERE i.user_id = u AND i.status = 'paid') AS paid_count
FROM (
  SELECT DISTINCT user_id AS u FROM invoices
  UNION SELECT DISTINCT user_id FROM quotations
) src;

-- ── 10. CUSTOMER BEHAVIOR SCORE VIEW ───────────────────────────────────────
CREATE OR REPLACE VIEW vw_customer_billing_behavior AS
SELECT
  i.user_id,
  i.client_name,
  COUNT(*) AS invoice_count,
  SUM(i.total_amount) AS total_billed,
  AVG(
    CASE
      WHEN i.status = 'paid' AND i.due_date IS NOT NULL
        THEN GREATEST(0, EXTRACT(EPOCH FROM (i.updated_at - i.due_date::timestamp)) / 86400)
      ELSE NULL
    END
  ) AS avg_payment_delay_days,
  SUM(CASE WHEN i.status IN ('overdue','partial','pending') THEN i.total_amount - COALESCE(i.paid_amount,0) ELSE 0 END) AS open_balance,
  COUNT(*) FILTER (WHERE i.lifecycle_stage = 'accepted') AS accepted_count
FROM invoices i
GROUP BY i.user_id, i.client_name;

-- ── 22. CLIENT PROFITABILITY VIEW ──────────────────────────────────────────
CREATE OR REPLACE VIEW vw_client_profitability AS
SELECT
  i.user_id,
  i.client_name,
  COALESCE(SUM(i.total_amount), 0) AS revenue,
  COALESCE((
    SELECT SUM(e.total_amount)
    FROM expenses e
    WHERE e.user_id = i.user_id
      AND e.client_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM clients c WHERE c.id = e.client_id AND c.name = i.client_name)
  ), 0) AS attributed_cost,
  COALESCE(SUM(i.total_amount), 0) - COALESCE((
    SELECT SUM(e.total_amount)
    FROM expenses e
    WHERE e.user_id = i.user_id
      AND e.client_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM clients c WHERE c.id = e.client_id AND c.name = i.client_name)
  ), 0) AS gross_margin
FROM invoices i
GROUP BY i.user_id, i.client_name;

-- ── 15. VENDOR SPEND VIEW ──────────────────────────────────────────────────
CREATE OR REPLACE VIEW vw_vendor_spend AS
SELECT
  e.user_id,
  e.vendor_name,
  COUNT(*) AS expense_count,
  SUM(e.total_amount) AS total_spend,
  SUM(e.total_amount) FILTER (WHERE e.expense_date >= (CURRENT_DATE - INTERVAL '30 days')) AS spend_last_30,
  SUM(e.total_amount) FILTER (WHERE e.expense_date >= (CURRENT_DATE - INTERVAL '60 days')
                                 AND e.expense_date <  (CURRENT_DATE - INTERVAL '30 days')) AS spend_prev_30,
  AVG(e.total_amount) AS avg_bill
FROM expenses e
GROUP BY e.user_id, e.vendor_name;

-- ── 25. MONTHLY VARIANCE VIEW ──────────────────────────────────────────────
CREATE OR REPLACE VIEW vw_monthly_variance AS
WITH inv AS (
  SELECT user_id, date_trunc('month', invoice_date::date) AS month, SUM(total_amount) AS revenue
  FROM invoices GROUP BY 1,2
),
exp AS (
  SELECT user_id, date_trunc('month', expense_date) AS month, SUM(total_amount) AS expenses,
         SUM(total_amount) FILTER (WHERE category_name = 'Office Rent') AS rent,
         SUM(total_amount) FILTER (WHERE category_name = 'Travel & Accommodation') AS travel
  FROM expenses GROUP BY 1,2
)
SELECT
  COALESCE(inv.user_id, exp.user_id) AS user_id,
  COALESCE(inv.month,   exp.month)   AS month,
  COALESCE(inv.revenue, 0)           AS revenue,
  COALESCE(exp.expenses, 0)          AS expenses,
  COALESCE(exp.rent, 0)              AS rent,
  COALESCE(exp.travel, 0)            AS travel
FROM inv FULL OUTER JOIN exp
  ON inv.user_id = exp.user_id AND inv.month = exp.month;
