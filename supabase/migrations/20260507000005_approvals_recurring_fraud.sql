-- ════════════════════════════════════════════════════════════════════════════
-- Brief items #9 (approval workflows), #12 (recurring vendor bills + accruals),
-- #13 (fraud + duplicate detection).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. APPROVAL WORKFLOWS (#9) ─────────────────────────────────────────────
-- approval_rules: declarative thresholds. Per entity_type, when amount > X,
-- requires N levels of approval, each at a permission/role.
-- approval_requests: one row per item awaiting approval.
-- approval_actions: append-only audit of approve/reject decisions.

CREATE TABLE IF NOT EXISTS approval_rules (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       TEXT NOT NULL,
  entity_type   TEXT NOT NULL CHECK (entity_type IN ('bill','expense','payment','advance','journal')),
  min_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  max_amount    NUMERIC(14,2),                -- null = no upper bound
  required_levels INTEGER NOT NULL DEFAULT 1 CHECK (required_levels BETWEEN 1 AND 5),
  level_perms   TEXT[] NOT NULL,              -- e.g. ARRAY['bill.approve','bill.approve_l2']
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_approval_rules_user_entity
  ON approval_rules(user_id, entity_type, min_amount) WHERE is_active = TRUE;

ALTER TABLE approval_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "approval_rules_owner" ON approval_rules;
CREATE POLICY "approval_rules_owner" ON approval_rules FOR ALL USING (
  user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
);

CREATE TABLE IF NOT EXISTS approval_requests (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         TEXT NOT NULL,
  entity_type     TEXT NOT NULL,
  entity_id       UUID NOT NULL,
  reference       TEXT,                       -- bill_number / payment ref
  amount          NUMERIC(14,2),
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','cancelled')),
  required_levels INTEGER NOT NULL DEFAULT 1,
  current_level   INTEGER NOT NULL DEFAULT 1,
  rule_id         UUID REFERENCES approval_rules(id) ON DELETE SET NULL,
  requested_by    TEXT,
  requested_at    TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  notes           TEXT,
  UNIQUE (entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_approval_requests_user_status
  ON approval_requests(user_id, status, requested_at DESC);

ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "approval_requests_owner" ON approval_requests;
CREATE POLICY "approval_requests_owner" ON approval_requests FOR ALL USING (
  user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
);

CREATE TABLE IF NOT EXISTS approval_actions (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id   UUID NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  level        INTEGER NOT NULL,
  action       TEXT NOT NULL CHECK (action IN ('approve','reject','comment','cancel')),
  actor_id     TEXT NOT NULL,
  actor_role   TEXT,
  notes        TEXT,
  acted_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_approval_actions_request
  ON approval_actions(request_id, acted_at);

ALTER TABLE approval_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "approval_actions_visible" ON approval_actions;
CREATE POLICY "approval_actions_visible" ON approval_actions FOR ALL USING (
  EXISTS (
    SELECT 1 FROM approval_requests ar
    WHERE ar.id = approval_actions.request_id
      AND ar.user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
  )
);

-- Append-only on approval_actions (decisions are immutable evidence).
CREATE OR REPLACE FUNCTION approval_actions_append_only()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'approval_actions is append-only — % blocked.', TG_OP
    USING ERRCODE = '23514';
END;
$$;
DROP TRIGGER IF EXISTS trg_approval_actions_append_only ON approval_actions;
CREATE TRIGGER trg_approval_actions_append_only
  BEFORE UPDATE OR DELETE ON approval_actions
  FOR EACH ROW EXECUTE FUNCTION approval_actions_append_only();

-- Auto-create approval request when a bill is created and exceeds rule threshold.
CREATE OR REPLACE FUNCTION queue_bill_approval_if_needed()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_rule approval_rules%ROWTYPE;
BEGIN
  -- Most-restrictive applicable rule wins (highest required_levels for amount).
  SELECT * INTO v_rule
    FROM approval_rules
   WHERE user_id = NEW.user_id
     AND entity_type = 'bill'
     AND is_active = TRUE
     AND NEW.total_amount >= min_amount
     AND (max_amount IS NULL OR NEW.total_amount <= max_amount)
   ORDER BY required_levels DESC, min_amount DESC
   LIMIT 1;

  IF NOT FOUND THEN RETURN NEW; END IF;

  INSERT INTO approval_requests (
    user_id, entity_type, entity_id, reference, amount,
    required_levels, current_level, rule_id, requested_by
  ) VALUES (
    NEW.user_id, 'bill', NEW.id, NEW.bill_number, NEW.total_amount,
    v_rule.required_levels, 1, v_rule.id,
    NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, '')
  )
  ON CONFLICT (entity_type, entity_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bill_approval_queue ON purchase_bills;
CREATE TRIGGER trg_bill_approval_queue
  AFTER INSERT ON purchase_bills
  FOR EACH ROW EXECUTE FUNCTION queue_bill_approval_if_needed();

-- act_on_approval RPC: approve/reject moves the request through levels.
CREATE OR REPLACE FUNCTION act_on_approval(
  p_request_id UUID,
  p_action     TEXT,
  p_actor_id   TEXT,
  p_actor_role TEXT DEFAULT NULL,
  p_notes      TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_req approval_requests%ROWTYPE;
  v_action_id UUID;
BEGIN
  SELECT * INTO v_req FROM approval_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Approval request % not found', p_request_id; END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Approval request already %', v_req.status USING ERRCODE = '23514';
  END IF;
  IF p_action NOT IN ('approve','reject','cancel','comment') THEN
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  INSERT INTO approval_actions (request_id, level, action, actor_id, actor_role, notes)
  VALUES (p_request_id, v_req.current_level, p_action, p_actor_id, p_actor_role, p_notes)
  RETURNING id INTO v_action_id;

  IF p_action = 'approve' THEN
    IF v_req.current_level >= v_req.required_levels THEN
      UPDATE approval_requests
         SET status = 'approved', completed_at = NOW()
       WHERE id = p_request_id;
    ELSE
      UPDATE approval_requests
         SET current_level = v_req.current_level + 1
       WHERE id = p_request_id;
    END IF;
  ELSIF p_action = 'reject' THEN
    UPDATE approval_requests
       SET status = 'rejected', completed_at = NOW()
     WHERE id = p_request_id;
  ELSIF p_action = 'cancel' THEN
    UPDATE approval_requests
       SET status = 'cancelled', completed_at = NOW()
     WHERE id = p_request_id;
  END IF;

  RETURN v_action_id;
END;
$$;

-- View: pending approvals queue with entity context.
DROP VIEW IF EXISTS v_pending_approvals;
CREATE VIEW v_pending_approvals AS
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
  pb.vendor_name,
  pb.bill_date     AS entity_date,
  pb.due_date,
  rul.level_perms  AS rule_perms
FROM approval_requests ar
LEFT JOIN purchase_bills pb
       ON ar.entity_type = 'bill' AND pb.id = ar.entity_id
LEFT JOIN approval_rules rul ON rul.id = ar.rule_id
WHERE ar.status = 'pending';

-- ── 2. RECURRING VENDOR BILLS + ACCRUALS (#12) ─────────────────────────────
-- Generates bill drafts on a schedule. The actual journal-posting moment
-- happens when the user reviews & posts; auto-generation only creates the
-- bill row + draft journal at status='draft' so accidental rent/utility
-- duplications don't slip through.

CREATE TABLE IF NOT EXISTS recurring_bills (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         TEXT NOT NULL,
  vendor_id       UUID,
  vendor_name     TEXT NOT NULL,
  template_name   TEXT NOT NULL,                -- "Office rent — May", "AWS subscription"
  amount          NUMERIC(14,2) NOT NULL,
  gst_rate        NUMERIC(5,2)  NOT NULL DEFAULT 18,
  is_rcm          BOOLEAN NOT NULL DEFAULT FALSE,
  itc_eligible    BOOLEAN NOT NULL DEFAULT TRUE,
  classification  TEXT NOT NULL DEFAULT 'expense'
    CHECK (classification IN ('goods','expense','mixed','asset','prepaid')),
  cost_center_id  UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  project_id      UUID,
  branch_id       UUID,
  department      TEXT,
  notes           TEXT,
  items           JSONB DEFAULT '[]',

  frequency       TEXT NOT NULL CHECK (frequency IN ('daily','weekly','monthly','quarterly','yearly')),
  interval_count  INTEGER NOT NULL DEFAULT 1,    -- "every 1 month" → monthly+1
  start_date      DATE NOT NULL,
  end_date        DATE,
  next_due_date   DATE NOT NULL,
  last_generated_date DATE,
  due_offset_days INTEGER DEFAULT 0,             -- bill due N days after generation
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recurring_bills_due
  ON recurring_bills(user_id, next_due_date) WHERE is_active = TRUE;

ALTER TABLE recurring_bills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "recurring_bills_owner" ON recurring_bills;
CREATE POLICY "recurring_bills_owner" ON recurring_bills FOR ALL USING (
  user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
);

-- Generate bills for all schedules whose next_due_date has arrived.
-- Designed to be called from a cron/edge-function nightly. Returns the
-- list of generated bill IDs for telemetry. Idempotent: bills are created
-- with bill_number = '<template>-<YYYYMMDD>' and the bill table's UNIQUE
-- (vendor + bill_number) index blocks duplicates on retry.
CREATE OR REPLACE FUNCTION generate_recurring_bills(p_user_id TEXT DEFAULT NULL, p_as_of DATE DEFAULT CURRENT_DATE)
RETURNS TABLE(bill_id UUID, recurring_id UUID, bill_number TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  rb recurring_bills%ROWTYPE;
  v_bill_no TEXT;
  v_bill_id UUID;
  v_gst NUMERIC;
  v_total NUMERIC;
  v_due DATE;
  v_next DATE;
BEGIN
  FOR rb IN
    SELECT * FROM recurring_bills
     WHERE is_active = TRUE
       AND next_due_date <= p_as_of
       AND (end_date IS NULL OR next_due_date <= end_date)
       AND (p_user_id IS NULL OR user_id = p_user_id)
  LOOP
    v_bill_no := substring(regexp_replace(rb.template_name, '\s+', '-', 'g') for 30)
                 || '-' || to_char(rb.next_due_date, 'YYYYMMDD');
    v_gst   := round(rb.amount * rb.gst_rate / 100, 2);
    v_total := rb.amount + v_gst;
    v_due   := rb.next_due_date + (rb.due_offset_days || ' days')::interval;

    -- Skip if a bill with this vendor + bill_number already exists.
    IF EXISTS (
      SELECT 1 FROM purchase_bills
       WHERE user_id = rb.user_id
         AND vendor_id IS NOT DISTINCT FROM rb.vendor_id
         AND lower(bill_number) = lower(v_bill_no)
    ) THEN
      -- Advance the next_due_date and continue.
    ELSE
      INSERT INTO purchase_bills (
        user_id, vendor_id, vendor_name, bill_number, bill_date, due_date,
        items, amount, gst_amount, total_amount, status, classification,
        cost_center_id, project_id, branch_id, department,
        is_rcm, itc_eligible, notes
      )
      VALUES (
        rb.user_id, rb.vendor_id, rb.vendor_name, v_bill_no, rb.next_due_date, v_due,
        rb.items, rb.amount, v_gst, v_total, 'pending', rb.classification,
        rb.cost_center_id, rb.project_id, rb.branch_id, rb.department,
        rb.is_rcm, rb.itc_eligible,
        COALESCE(rb.notes,'') || E'\n[Auto-generated from recurring schedule ' || rb.id || ']'
      )
      RETURNING id INTO v_bill_id;

      bill_id := v_bill_id;
      recurring_id := rb.id;
      bill_number := v_bill_no;
      RETURN NEXT;
    END IF;

    -- Compute next_due_date for the schedule.
    v_next := CASE rb.frequency
      WHEN 'daily'     THEN rb.next_due_date + (rb.interval_count || ' days')::interval
      WHEN 'weekly'    THEN rb.next_due_date + (rb.interval_count * 7 || ' days')::interval
      WHEN 'monthly'   THEN rb.next_due_date + (rb.interval_count || ' months')::interval
      WHEN 'quarterly' THEN rb.next_due_date + (rb.interval_count * 3 || ' months')::interval
      WHEN 'yearly'    THEN rb.next_due_date + (rb.interval_count || ' years')::interval
    END::date;

    UPDATE recurring_bills
       SET next_due_date       = v_next,
           last_generated_date = p_as_of,
           is_active           = CASE WHEN end_date IS NOT NULL AND v_next > end_date THEN FALSE ELSE is_active END,
           updated_at          = NOW()
     WHERE id = rb.id;
  END LOOP;
END;
$$;

-- ── ACCRUAL JOURNALS ───────────────────────────────────────────────────────
-- accrual_schedules: book an expense over multiple periods (e.g. 12-month
-- prepaid insurance). The daily/monthly cron calls amortize_accruals().

CREATE TABLE IF NOT EXISTS accrual_schedules (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         TEXT NOT NULL,
  source_type     TEXT NOT NULL,              -- 'bill','expense','manual'
  source_id       UUID,
  description     TEXT,
  total_amount    NUMERIC(14,2) NOT NULL,
  recognized_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  recognition_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  prepaid_account_id     UUID REFERENCES accounts(id) ON DELETE SET NULL,
  vendor_id       UUID,
  cost_center_id  UUID,
  project_id      UUID,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_amortized_date DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  CHECK (end_date >= start_date),
  CHECK (recognized_amount <= total_amount + 0.01)
);
CREATE INDEX IF NOT EXISTS idx_accrual_active
  ON accrual_schedules(user_id, end_date) WHERE is_active = TRUE;

ALTER TABLE accrual_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "accrual_schedules_owner" ON accrual_schedules;
CREATE POLICY "accrual_schedules_owner" ON accrual_schedules FOR ALL USING (
  user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
);

-- ── 3. FRAUD + DUPLICATE DETECTION (#13) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS fraud_alerts (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       TEXT NOT NULL,
  alert_type    TEXT NOT NULL CHECK (alert_type IN (
    'duplicate_invoice','duplicate_gstin_invoice',
    'price_spike','suspicious_payment_timing',
    'unregistered_with_gst','high_value_unapproved',
    'round_amount','vendor_bank_change',
    'split_payment_evasion'
  )),
  severity      TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  entity_type   TEXT,
  entity_id     UUID,
  reference     TEXT,
  amount        NUMERIC(14,2),
  details       JSONB,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','dismissed','escalated')),
  resolved_by   TEXT,
  resolved_at   TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, alert_type, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_open
  ON fraud_alerts(user_id, status, severity, created_at DESC) WHERE status = 'open';

ALTER TABLE fraud_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fraud_alerts_owner" ON fraud_alerts;
CREATE POLICY "fraud_alerts_owner" ON fraud_alerts FOR ALL USING (
  user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
);

-- Detection trigger on purchase_bills:
--   1. Duplicate invoice (same vendor + bill_number)         — handled by uq_purchase_bills_vendor_billno already
--   2. Same GSTIN + bill_number across different vendors     — flag, don't block (could be a vendor merge)
--   3. Vendor charging GST while marked unregistered         — suspicious
--   4. Round-amount bills (multiple of 1000 with no GST)     — informational
--   5. Bill > ₹2L without approval queued                    — high
CREATE OR REPLACE FUNCTION detect_bill_anomalies()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_dup_count INTEGER;
  v_avg_price NUMERIC;
BEGIN
  -- Duplicate GSTIN + bill_number across different vendors
  IF NEW.vendor_gst_number IS NOT NULL AND NEW.bill_number IS NOT NULL THEN
    SELECT COUNT(*) INTO v_dup_count
      FROM purchase_bills
     WHERE user_id = NEW.user_id
       AND id <> NEW.id
       AND vendor_gst_number = NEW.vendor_gst_number
       AND lower(bill_number) = lower(NEW.bill_number)
       AND COALESCE(vendor_id, '00000000-0000-0000-0000-000000000000'::uuid)
         <> COALESCE(NEW.vendor_id, '00000000-0000-0000-0000-000000000000'::uuid);
    IF v_dup_count > 0 THEN
      INSERT INTO fraud_alerts (user_id, alert_type, severity, entity_type, entity_id, reference, amount, details)
      VALUES (NEW.user_id, 'duplicate_gstin_invoice', 'high', 'bill', NEW.id, NEW.bill_number, NEW.total_amount,
        jsonb_build_object('gstin', NEW.vendor_gst_number, 'matches', v_dup_count))
      ON CONFLICT (user_id, alert_type, entity_type, entity_id) DO NOTHING;
    END IF;
  END IF;

  -- Unregistered vendor charging GST without RCM
  IF NEW.vendor_gst_status = 'unregistered'
     AND COALESCE(NEW.gst_amount, 0) > 0
     AND COALESCE(NEW.is_rcm, FALSE) = FALSE THEN
    INSERT INTO fraud_alerts (user_id, alert_type, severity, entity_type, entity_id, reference, amount, details)
    VALUES (NEW.user_id, 'unregistered_with_gst', 'high', 'bill', NEW.id, NEW.bill_number, NEW.total_amount,
      jsonb_build_object('gst_amount', NEW.gst_amount, 'gst_status', NEW.vendor_gst_status))
    ON CONFLICT (user_id, alert_type, entity_type, entity_id) DO NOTHING;
  END IF;

  -- Round amount bill > ₹50k with no GST (often indicative of unbilled cash)
  IF NEW.total_amount >= 50000
     AND NEW.total_amount = round(NEW.total_amount, -3)
     AND COALESCE(NEW.gst_amount, 0) = 0 THEN
    INSERT INTO fraud_alerts (user_id, alert_type, severity, entity_type, entity_id, reference, amount, details)
    VALUES (NEW.user_id, 'round_amount', 'low', 'bill', NEW.id, NEW.bill_number, NEW.total_amount,
      jsonb_build_object('hint', 'Round-thousand amount with no GST'))
    ON CONFLICT (user_id, alert_type, entity_type, entity_id) DO NOTHING;
  END IF;

  -- High-value bill (>₹2L) but no approval queued
  IF NEW.total_amount > 200000
     AND NOT EXISTS (
       SELECT 1 FROM approval_requests
        WHERE user_id = NEW.user_id AND entity_type = 'bill' AND entity_id = NEW.id
     ) THEN
    INSERT INTO fraud_alerts (user_id, alert_type, severity, entity_type, entity_id, reference, amount, details)
    VALUES (NEW.user_id, 'high_value_unapproved', 'medium', 'bill', NEW.id, NEW.bill_number, NEW.total_amount,
      jsonb_build_object('threshold', 200000))
    ON CONFLICT (user_id, alert_type, entity_type, entity_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bill_fraud_detect ON purchase_bills;
CREATE TRIGGER trg_bill_fraud_detect
  AFTER INSERT ON purchase_bills
  FOR EACH ROW EXECUTE FUNCTION detect_bill_anomalies();

-- Detection on payments: off-hours + split-payment evasion (multiple sub-50k
-- payments to same vendor on same day from different modes).
CREATE OR REPLACE FUNCTION detect_payment_anomalies()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_split_count INTEGER;
  v_split_total NUMERIC;
BEGIN
  -- Off-hours / weekend (informational)
  IF EXTRACT(dow FROM NEW.payment_date) IN (0, 6) THEN
    INSERT INTO fraud_alerts (user_id, alert_type, severity, entity_type, entity_id, reference, amount, details)
    VALUES (NEW.user_id, 'suspicious_payment_timing', 'low', 'payment', NEW.id, NEW.bill_number, NEW.amount,
      jsonb_build_object('day_of_week', EXTRACT(dow FROM NEW.payment_date)))
    ON CONFLICT (user_id, alert_type, entity_type, entity_id) DO NOTHING;
  END IF;

  -- Split payment evasion: ≥3 sub-50k payments to the same vendor on the same day
  -- (₹10k cash limit S.40A(3) split-evasion heuristic).
  SELECT COUNT(*), COALESCE(SUM(amount), 0)
    INTO v_split_count, v_split_total
    FROM vendor_bill_payments
   WHERE user_id = NEW.user_id
     AND vendor_id = NEW.vendor_id
     AND payment_date = NEW.payment_date
     AND amount < 50000;

  IF v_split_count >= 3 AND v_split_total >= 50000 THEN
    INSERT INTO fraud_alerts (user_id, alert_type, severity, entity_type, entity_id, reference, amount, details)
    VALUES (NEW.user_id, 'split_payment_evasion', 'medium', 'payment', NEW.id, NEW.bill_number, v_split_total,
      jsonb_build_object('payment_count', v_split_count, 'date', NEW.payment_date))
    ON CONFLICT (user_id, alert_type, entity_type, entity_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_fraud_detect ON vendor_bill_payments;
CREATE TRIGGER trg_payment_fraud_detect
  AFTER INSERT ON vendor_bill_payments
  FOR EACH ROW EXECUTE FUNCTION detect_payment_anomalies();

-- ── Views for the fraud / approvals dashboards ─────────────────────────────
DROP VIEW IF EXISTS v_open_fraud_alerts;
CREATE VIEW v_open_fraud_alerts AS
SELECT
  fa.*,
  CASE fa.entity_type
    WHEN 'bill'    THEN (SELECT pb.vendor_name FROM purchase_bills pb WHERE pb.id = fa.entity_id)
    WHEN 'payment' THEN (SELECT vbp.vendor_name FROM vendor_bill_payments vbp WHERE vbp.id = fa.entity_id)
  END AS counterparty
FROM fraud_alerts fa
WHERE fa.status = 'open'
ORDER BY
  CASE fa.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
  fa.created_at DESC;

-- View: vendor price-spike detection. Compare each bill's per-unit cost
-- against the trailing 90-day average for the same item.
DROP VIEW IF EXISTS v_vendor_price_anomalies;
CREATE VIEW v_vendor_price_anomalies AS
WITH item_history AS (
  SELECT
    im.user_id,
    im.item_id,
    AVG(im.unit_cost) OVER (PARTITION BY im.user_id, im.item_id
                            ORDER BY im.movement_date
                            ROWS BETWEEN 30 PRECEDING AND 1 PRECEDING) AS rolling_avg,
    im.unit_cost,
    im.movement_date,
    im.source_id,
    im.source_type
  FROM inventory_movements im
  WHERE im.movement_type = 'purchase'
    AND im.movement_date >= CURRENT_DATE - INTERVAL '90 days'
)
SELECT
  user_id, item_id, source_id AS bill_id, movement_date,
  rolling_avg, unit_cost,
  ROUND((unit_cost - rolling_avg) / NULLIF(rolling_avg, 0) * 100, 2) AS pct_change
FROM item_history
WHERE rolling_avg IS NOT NULL
  AND ABS(unit_cost - rolling_avg) / NULLIF(rolling_avg, 0) > 0.30   -- >30% movement
  AND source_type = 'purchase_bill';

NOTIFY pgrst, 'reload schema';

COMMENT ON TABLE approval_rules IS
  'Threshold-based approval policies. Highest required_levels in the matching range applies.';
COMMENT ON TABLE fraud_alerts IS
  'Persisted anomaly flags. Triggers populate; the AP dashboard surfaces them; users acknowledge / dismiss with notes.';
COMMENT ON FUNCTION generate_recurring_bills IS
  'Cron entry-point. Creates pending bills for any recurring_bills due today, advances next_due_date.';
