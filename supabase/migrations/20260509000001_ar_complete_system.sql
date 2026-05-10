-- ════════════════════════════════════════════════════════════════════════════
-- AR Complete System — Slice 1: Schema foundation
-- Mirrors the AP build (20260505000001 + 20260507000005 + 20260508000001) on
-- the sell-side. Adds:
--
--   * 'partial' / 'sent' / 'cancelled' / 'draft' to invoices.status enum
--   * cost_center_id / project_id / branch_id / department on invoices,
--     payment_received, credit_notes
--   * customer_advances + customer_advance_adjustments tables
--   * ar_payment_allocations (persistent invoice↔receipt matches)
--   * ar_audit_log (immutable)
--   * ar_recurring_invoices + generate_ar_recurring_invoices RPC
--   * dunning_rules + dunning_log (reminder automation)
--   * Period-lock + auto-status triggers on AR docs
--   * Approval auto-queue triggers for AR (entity_type now includes invoice,
--     credit_note, payment_received, customer_advance)
--   * Fraud detection triggers on invoices + payment_received
--   * Account hierarchy bounds preserved (tags FK to cost_centers like AP)
--
-- Safe re-runnable. No data backfills required (paid_amount / lifecycle_stage
-- already populated by 20260411 / 20260426 migrations).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. invoices.status — broaden enum ───────────────────────────────────────
DO $$
BEGIN
  -- Drop the old CHECK (name varies across past migrations)
  PERFORM 1 FROM pg_constraint
   WHERE conrelid = 'invoices'::regclass AND contype = 'c' AND conname LIKE 'invoices_status_check%';
  IF FOUND THEN
    EXECUTE (
      SELECT 'ALTER TABLE invoices DROP CONSTRAINT ' || quote_ident(conname)
        FROM pg_constraint
       WHERE conrelid = 'invoices'::regclass AND contype = 'c' AND conname LIKE 'invoices_status_check%'
       LIMIT 1
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- table may not exist on a fresh install; skip
  NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='invoices') THEN
    EXECUTE $sql$
      ALTER TABLE invoices
        ADD CONSTRAINT invoices_status_chk CHECK (
          status IN ('draft','sent','pending','partial','paid','overdue','cancelled')
        )
    $sql$;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 2. customer_id FK + cost-center / project / branch tags on AR documents ─
-- The legacy `invoices` / `credit_notes` schema only has `client_name` (TEXT).
-- Adding `customer_id` (FK to `clients`) gives us the proper sub-ledger join
-- the AR engine relies on, while keeping `client_name` for back-compat.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='invoices') THEN
    ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS customer_id    UUID REFERENCES clients(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS project_id     UUID,
      ADD COLUMN IF NOT EXISTS branch_id      UUID,
      ADD COLUMN IF NOT EXISTS department     TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payment_received') THEN
    ALTER TABLE payment_received
      ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS project_id     UUID,
      ADD COLUMN IF NOT EXISTS branch_id      UUID,
      ADD COLUMN IF NOT EXISTS department     TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='credit_notes') THEN
    ALTER TABLE credit_notes
      ADD COLUMN IF NOT EXISTS customer_id    UUID REFERENCES clients(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS project_id     UUID,
      ADD COLUMN IF NOT EXISTS branch_id      UUID,
      ADD COLUMN IF NOT EXISTS department     TEXT;
  END IF;
END $$;

-- Backfill customer_id from clients.name → invoice.client_name match.
-- One-shot; later inserts must populate customer_id directly.
UPDATE invoices i
   SET customer_id = c.id
  FROM clients c
 WHERE i.user_id = c.user_id
   AND i.customer_id IS NULL
   AND i.client_name IS NOT NULL
   AND lower(c.name) = lower(i.client_name);

UPDATE credit_notes cn
   SET customer_id = c.id
  FROM clients c
 WHERE cn.user_id = c.user_id
   AND cn.customer_id IS NULL
   AND cn.client_name IS NOT NULL
   AND lower(c.name) = lower(cn.client_name);

CREATE INDEX IF NOT EXISTS idx_invoices_customer           ON invoices(user_id, customer_id)    WHERE customer_id    IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_cost_center        ON invoices(user_id, cost_center_id) WHERE cost_center_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_project            ON invoices(user_id, project_id)     WHERE project_id     IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_credit_notes_customer       ON credit_notes(user_id, customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_received_cost_center ON payment_received(user_id, cost_center_id) WHERE cost_center_id IS NOT NULL;

-- ── 3. customer_advances ────────────────────────────────────────────────────
-- Note: payment_received already supports payment_type='customer_advance', but
-- a dedicated table mirrors vendor_advances and gives us a clean place to track
-- the un-applied balance per advance (similar to vendor_advances).
CREATE TABLE IF NOT EXISTS customer_advances (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         TEXT NOT NULL,
  customer_id     UUID,
  customer_name   TEXT NOT NULL,
  advance_number  TEXT NOT NULL,
  advance_date    DATE NOT NULL,
  amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  applied_amount  NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (applied_amount >= 0),
  outstanding_amount NUMERIC(14,2) GENERATED ALWAYS AS (amount - applied_amount) STORED,
  payment_mode    TEXT,
  reference_number TEXT,
  deposit_account TEXT,
  tax_amount      NUMERIC(14,2) DEFAULT 0,             -- GST on advance, if any
  place_of_supply TEXT,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','partial','applied','refunded','cancelled')),
  cost_center_id  UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  project_id      UUID,
  branch_id       UUID,
  department      TEXT,
  source_payment_id UUID,                              -- optional FK to payment_received
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- UNIQUE on a lower() expression must be a separate index, not inline.
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_advances_number
  ON customer_advances(user_id, lower(advance_number));

CREATE INDEX IF NOT EXISTS idx_customer_advances_customer ON customer_advances(user_id, customer_id, status);
CREATE INDEX IF NOT EXISTS idx_customer_advances_status   ON customer_advances(user_id, status, advance_date);

ALTER TABLE customer_advances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customer_advances_owner" ON customer_advances;
CREATE POLICY "customer_advances_owner" ON customer_advances FOR ALL USING (
  user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
);

-- ── 4. customer_advance_adjustments ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_advance_adjustments (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         TEXT NOT NULL,
  advance_id      UUID NOT NULL REFERENCES customer_advances(id) ON DELETE RESTRICT,
  invoice_id      UUID REFERENCES invoices(id) ON DELETE RESTRICT,
  invoice_number  TEXT,
  customer_id     UUID,
  customer_name   TEXT,
  amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  adjustment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  cost_center_id  UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  project_id      UUID,
  branch_id       UUID,
  department      TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_caa_advance ON customer_advance_adjustments(user_id, advance_id);
CREATE INDEX IF NOT EXISTS idx_caa_invoice ON customer_advance_adjustments(user_id, invoice_id);

ALTER TABLE customer_advance_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customer_advance_adjustments_owner" ON customer_advance_adjustments;
CREATE POLICY "customer_advance_adjustments_owner" ON customer_advance_adjustments FOR ALL USING (
  user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
);

-- Roll-up trigger: keep customer_advances.applied_amount + status in sync.
CREATE OR REPLACE FUNCTION roll_customer_advance_applied()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_advance_id UUID := COALESCE(NEW.advance_id, OLD.advance_id);
  v_total NUMERIC;
  v_amount NUMERIC;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_total
    FROM customer_advance_adjustments
   WHERE advance_id = v_advance_id;

  SELECT amount INTO v_amount FROM customer_advances WHERE id = v_advance_id;

  UPDATE customer_advances
     SET applied_amount = v_total,
         status = CASE
           WHEN v_total <= 0          THEN 'open'
           WHEN v_total >= v_amount   THEN 'applied'
           ELSE                            'partial'
         END,
         updated_at = NOW()
   WHERE id = v_advance_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_caa_roll_applied ON customer_advance_adjustments;
CREATE TRIGGER trg_caa_roll_applied
  AFTER INSERT OR UPDATE OR DELETE ON customer_advance_adjustments
  FOR EACH ROW EXECUTE FUNCTION roll_customer_advance_applied();

-- ── 5. ar_payment_allocations ───────────────────────────────────────────────
-- Persists which invoice each payment line clears, replacing the JSONB
-- `payment_received.invoice_allocations` blob for canonical reporting.
-- The blob is kept for backwards compatibility but new code should write rows
-- here.
CREATE TABLE IF NOT EXISTS ar_payment_allocations (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       TEXT NOT NULL,
  invoice_id    UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  source_type   TEXT NOT NULL CHECK (source_type IN (
    'payment_received','credit_note','customer_advance_adjustment','manual'
  )),
  source_id     UUID NOT NULL,
  customer_id   UUID,
  amount        NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  allocation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arpa_invoice ON ar_payment_allocations(user_id, invoice_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_arpa_source
  ON ar_payment_allocations(user_id, source_type, source_id, invoice_id);

ALTER TABLE ar_payment_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ar_payment_allocations_owner" ON ar_payment_allocations;
CREATE POLICY "ar_payment_allocations_owner" ON ar_payment_allocations FOR ALL USING (
  user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
);

-- Roll-up trigger: refresh invoices.paid_amount + status from allocations.
-- Falls back to the existing `invoice_payments` table sum if no allocations.
CREATE OR REPLACE FUNCTION roll_invoice_paid_from_allocations()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_invoice_id UUID := COALESCE(NEW.invoice_id, OLD.invoice_id);
  v_paid NUMERIC;
  v_total NUMERIC;
  v_due DATE;
BEGIN
  -- Sum allocations + legacy invoice_payments (defensive)
  SELECT
    COALESCE((SELECT SUM(amount) FROM ar_payment_allocations WHERE invoice_id = v_invoice_id), 0)
    + COALESCE((SELECT SUM(amount) FROM invoice_payments    WHERE invoice_id = v_invoice_id), 0)
  INTO v_paid;

  SELECT total_amount, due_date INTO v_total, v_due FROM invoices WHERE id = v_invoice_id;

  UPDATE invoices
     SET paid_amount = LEAST(v_paid, v_total),
         status = CASE
           WHEN v_paid >= v_total - 0.01                                THEN 'paid'
           WHEN v_paid > 0                                              THEN 'partial'
           WHEN v_due IS NOT NULL AND v_due < CURRENT_DATE              THEN 'overdue'
           ELSE                                                              'pending'
         END,
         updated_at = NOW()
   WHERE id = v_invoice_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_arpa_roll_paid ON ar_payment_allocations;
CREATE TRIGGER trg_arpa_roll_paid
  AFTER INSERT OR UPDATE OR DELETE ON ar_payment_allocations
  FOR EACH ROW EXECUTE FUNCTION roll_invoice_paid_from_allocations();

-- ── 6. ar_audit_log ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ar_audit_log (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       TEXT NOT NULL,
  actor_id      TEXT,
  actor_email   TEXT,
  entity_type   TEXT NOT NULL CHECK (entity_type IN (
    'invoice','credit_note','payment_received','customer_advance',
    'customer_advance_adjustment','allocation','client','recurring_invoice',
    'dunning_rule','quotation','sales_order','delivery_challan'
  )),
  entity_id     UUID,
  action        TEXT NOT NULL CHECK (action IN (
    'create','update','delete','post','reverse','approve','reject',
    'send','cancel','adjust','allocate','remind'
  )),
  amount        NUMERIC(14,2),
  reference     TEXT,
  before_json   JSONB,
  after_json    JSONB,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ar_audit_user_time   ON ar_audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ar_audit_entity      ON ar_audit_log(user_id, entity_type, entity_id);

ALTER TABLE ar_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ar_audit_log_owner_read" ON ar_audit_log;
CREATE POLICY "ar_audit_log_owner_read" ON ar_audit_log FOR SELECT USING (
  user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
);
DROP POLICY IF EXISTS "ar_audit_log_owner_insert" ON ar_audit_log;
CREATE POLICY "ar_audit_log_owner_insert" ON ar_audit_log FOR INSERT WITH CHECK (
  user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
);

-- Append-only enforcement.
CREATE OR REPLACE FUNCTION ar_audit_log_append_only()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ar_audit_log is append-only — % blocked.', TG_OP USING ERRCODE = '23514';
END;
$$;
DROP TRIGGER IF EXISTS trg_ar_audit_log_append_only ON ar_audit_log;
CREATE TRIGGER trg_ar_audit_log_append_only
  BEFORE UPDATE OR DELETE ON ar_audit_log
  FOR EACH ROW EXECUTE FUNCTION ar_audit_log_append_only();

-- ── 7. ar_recurring_invoices + generator RPC ───────────────────────────────────
CREATE TABLE IF NOT EXISTS ar_recurring_invoices (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         TEXT NOT NULL,
  customer_id     UUID,
  customer_name   TEXT NOT NULL,
  customer_email  TEXT,
  customer_gst    TEXT,
  customer_address TEXT,
  template_name   TEXT NOT NULL,                  -- "Monthly retainer — Acme"
  amount          NUMERIC(14,2) NOT NULL,         -- taxable
  gst_rate        NUMERIC(5,2)  NOT NULL DEFAULT 18,
  place_of_supply TEXT,
  intra_state     BOOLEAN,
  cost_center_id  UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  project_id      UUID,
  branch_id       UUID,
  department      TEXT,
  notes           TEXT,
  items           JSONB DEFAULT '[]',
  payment_terms_days INTEGER DEFAULT 30,

  frequency       TEXT NOT NULL CHECK (frequency IN ('daily','weekly','monthly','quarterly','yearly')),
  interval_count  INTEGER NOT NULL DEFAULT 1,
  start_date      DATE NOT NULL,
  end_date        DATE,
  next_due_date   DATE NOT NULL,
  last_generated_date DATE,
  due_offset_days INTEGER DEFAULT 30,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  auto_post       BOOLEAN NOT NULL DEFAULT FALSE, -- FALSE = generate as draft

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ar_recurring_invoices_due
  ON ar_recurring_invoices(user_id, next_due_date) WHERE is_active = TRUE;

ALTER TABLE ar_recurring_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ar_recurring_invoices_owner" ON ar_recurring_invoices;
CREATE POLICY "ar_recurring_invoices_owner" ON ar_recurring_invoices FOR ALL USING (
  user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
);

CREATE OR REPLACE FUNCTION generate_ar_recurring_invoices(p_user_id TEXT DEFAULT NULL, p_as_of DATE DEFAULT CURRENT_DATE)
RETURNS TABLE(invoice_id UUID, recurring_id UUID, invoice_number TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  ri ar_recurring_invoices%ROWTYPE;
  v_inv_no TEXT;
  v_inv_id UUID;
  v_gst NUMERIC;
  v_total NUMERIC;
  v_cgst NUMERIC; v_sgst NUMERIC; v_igst NUMERIC;
  v_due DATE;
  v_next DATE;
  v_intra BOOLEAN;
BEGIN
  FOR ri IN
    SELECT * FROM ar_recurring_invoices
     WHERE is_active = TRUE
       AND next_due_date <= p_as_of
       AND (end_date IS NULL OR next_due_date <= end_date)
       AND (p_user_id IS NULL OR user_id = p_user_id)
  LOOP
    v_inv_no := substring(regexp_replace(ri.template_name, '\s+', '-', 'g') for 30)
                || '-' || to_char(ri.next_due_date, 'YYYYMMDD');
    v_gst   := round(ri.amount * ri.gst_rate / 100, 2);
    v_total := ri.amount + v_gst;
    v_due   := ri.next_due_date + (COALESCE(ri.due_offset_days, 30) || ' days')::interval;
    v_intra := COALESCE(ri.intra_state, TRUE);
    v_cgst  := CASE WHEN v_intra THEN round(v_gst / 2, 2) ELSE 0 END;
    v_sgst  := v_cgst;
    v_igst  := CASE WHEN v_intra THEN 0 ELSE v_gst END;

    -- Skip if already generated (idempotent on retry)
    IF EXISTS (
      SELECT 1 FROM invoices
       WHERE user_id = ri.user_id
         AND lower(invoice_number) = lower(v_inv_no)
    ) THEN
      NULL;
    ELSE
      INSERT INTO invoices (
        user_id, invoice_number, invoice_date, due_date,
        client_name, client_email, client_gst_number, client_address,
        amount, gst_amount, total_amount, gst_rate, items,
        place_of_supply, intra_state,
        cgst_amount, sgst_amount, igst_amount,
        taxable_value, status, lifecycle_stage,
        cost_center_id, project_id, branch_id, department,
        payment_terms_days, notes
      ) VALUES (
        ri.user_id, v_inv_no, ri.next_due_date, v_due,
        ri.customer_name, ri.customer_email, ri.customer_gst, ri.customer_address,
        ri.amount, v_gst, v_total, ri.gst_rate, ri.items,
        ri.place_of_supply, v_intra,
        v_cgst, v_sgst, v_igst,
        ri.amount,
        CASE WHEN ri.auto_post THEN 'pending' ELSE 'draft' END,
        CASE WHEN ri.auto_post THEN 'sent'    ELSE 'draft' END,
        ri.cost_center_id, ri.project_id, ri.branch_id, ri.department,
        ri.payment_terms_days,
        COALESCE(ri.notes,'') || E'\n[Auto-generated from recurring schedule ' || ri.id || ']'
      ) RETURNING id INTO v_inv_id;

      invoice_id := v_inv_id;
      recurring_id := ri.id;
      invoice_number := v_inv_no;
      RETURN NEXT;
    END IF;

    v_next := CASE ri.frequency
      WHEN 'daily'     THEN ri.next_due_date + (ri.interval_count || ' days')::interval
      WHEN 'weekly'    THEN ri.next_due_date + (ri.interval_count * 7 || ' days')::interval
      WHEN 'monthly'   THEN ri.next_due_date + (ri.interval_count || ' months')::interval
      WHEN 'quarterly' THEN ri.next_due_date + (ri.interval_count * 3 || ' months')::interval
      WHEN 'yearly'    THEN ri.next_due_date + (ri.interval_count || ' years')::interval
    END::date;

    UPDATE ar_recurring_invoices
       SET next_due_date       = v_next,
           last_generated_date = p_as_of,
           is_active           = CASE WHEN end_date IS NOT NULL AND v_next > end_date THEN FALSE ELSE is_active END,
           updated_at          = NOW()
     WHERE id = ri.id;
  END LOOP;
END;
$$;

-- ── 8. dunning_rules + dunning_log ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dunning_rules (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         TEXT NOT NULL,
  name            TEXT NOT NULL,
  trigger_offset_days INTEGER NOT NULL,            -- negative = before due, positive = after due
  channel         TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email','whatsapp','sms','in_app')),
  template_subject TEXT,
  template_body   TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  min_amount      NUMERIC(14,2) DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dunning_rules_user ON dunning_rules(user_id) WHERE is_active = TRUE;

ALTER TABLE dunning_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dunning_rules_owner" ON dunning_rules;
CREATE POLICY "dunning_rules_owner" ON dunning_rules FOR ALL USING (
  user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
);

CREATE TABLE IF NOT EXISTS dunning_log (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         TEXT NOT NULL,
  invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  rule_id         UUID REFERENCES dunning_rules(id) ON DELETE SET NULL,
  channel         TEXT,
  sent_at         TIMESTAMPTZ DEFAULT NOW(),
  status          TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('queued','sent','failed','bounced')),
  error_message   TEXT,
  payload         JSONB
);
CREATE INDEX IF NOT EXISTS idx_dunning_log_invoice ON dunning_log(user_id, invoice_id, sent_at DESC);

ALTER TABLE dunning_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dunning_log_owner" ON dunning_log;
CREATE POLICY "dunning_log_owner" ON dunning_log FOR ALL USING (
  user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
);

-- ── 9. Period-lock triggers on AR docs ──────────────────────────────────────
-- Mirrors the AP guard from 20260505000001. Uses the existing is_period_locked()
-- helper (same migration).
CREATE OR REPLACE FUNCTION enforce_period_lock_ar()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_date DATE;
  v_user TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_user := OLD.user_id;
    v_date := CASE TG_TABLE_NAME
      WHEN 'invoices'                       THEN OLD.invoice_date
      WHEN 'payment_received'               THEN OLD.payment_date
      WHEN 'credit_notes'                   THEN OLD.credit_note_date
      WHEN 'customer_advances'              THEN OLD.advance_date
      WHEN 'customer_advance_adjustments'   THEN OLD.adjustment_date
    END;
  ELSE
    v_user := NEW.user_id;
    v_date := CASE TG_TABLE_NAME
      WHEN 'invoices'                       THEN NEW.invoice_date
      WHEN 'payment_received'               THEN NEW.payment_date
      WHEN 'credit_notes'                   THEN NEW.credit_note_date
      WHEN 'customer_advances'              THEN NEW.advance_date
      WHEN 'customer_advance_adjustments'   THEN NEW.adjustment_date
    END;
  END IF;

  IF v_date IS NOT NULL AND is_period_locked(v_user, v_date) THEN
    RAISE EXCEPTION 'Cannot modify % — accounting period covering % is locked.', TG_TABLE_NAME, v_date
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'invoices','payment_received','credit_notes',
    'customer_advances','customer_advance_adjustments'
  ])
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_period_lock_%I ON %I', t, t);
      EXECUTE format(
        'CREATE TRIGGER trg_period_lock_%I BEFORE INSERT OR UPDATE OR DELETE ON %I '
        'FOR EACH ROW EXECUTE FUNCTION enforce_period_lock_ar()',
        t, t
      );
    END IF;
  END LOOP;
END $$;

-- ── 10. Auto-status derivation on invoices.paid_amount changes ──────────────
-- Without this, invoices set via the legacy invoice_payments path don't move to
-- 'partial' / 'paid' automatically. Triggers on paid_amount UPDATE.
CREATE OR REPLACE FUNCTION sync_invoice_status_from_paid()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_paid NUMERIC := COALESCE(NEW.paid_amount, 0);
  v_total NUMERIC := COALESCE(NEW.total_amount, 0);
BEGIN
  -- Don't override 'cancelled' or 'draft' explicitly set by the user.
  IF NEW.status IN ('cancelled','draft') THEN RETURN NEW; END IF;

  NEW.status := CASE
    WHEN v_paid >= v_total - 0.01                               THEN 'paid'
    WHEN v_paid > 0                                             THEN 'partial'
    WHEN NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE THEN 'overdue'
    ELSE                                                             COALESCE(NEW.status, 'pending')
  END;

  IF NEW.status = 'paid' AND NEW.lifecycle_stage IS NOT NULL AND NEW.lifecycle_stage <> 'closed' THEN
    NEW.lifecycle_stage := 'paid';
  ELSIF NEW.status = 'partial' AND NEW.lifecycle_stage IS NOT NULL THEN
    NEW.lifecycle_stage := 'part_paid';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='invoices') THEN
    DROP TRIGGER IF EXISTS trg_invoice_status_sync ON invoices;
    CREATE TRIGGER trg_invoice_status_sync
      BEFORE INSERT OR UPDATE OF paid_amount, total_amount, due_date ON invoices
      FOR EACH ROW EXECUTE FUNCTION sync_invoice_status_from_paid();
  END IF;
END $$;

-- ── 11. Approval rules — broaden entity_type to include AR ──────────────────
DO $$
BEGIN
  PERFORM 1 FROM pg_constraint
   WHERE conrelid = 'approval_rules'::regclass AND contype = 'c'
     AND conname = 'approval_rules_entity_type_check';
  IF FOUND THEN
    ALTER TABLE approval_rules DROP CONSTRAINT approval_rules_entity_type_check;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='approval_rules') THEN
    BEGIN
      ALTER TABLE approval_rules
        ADD CONSTRAINT approval_rules_entity_type_check CHECK (
          entity_type IN (
            'bill','expense','payment','advance','journal',
            'invoice','credit_note','payment_received','customer_advance'
          )
        );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- Auto-queue invoice approvals on insert (mirrors queue_bill_approval_if_needed)
CREATE OR REPLACE FUNCTION queue_invoice_approval_if_needed()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_rule approval_rules%ROWTYPE;
BEGIN
  SELECT * INTO v_rule
    FROM approval_rules
   WHERE user_id = NEW.user_id
     AND entity_type = 'invoice'
     AND is_active = TRUE
     AND COALESCE(NEW.total_amount, 0) >= min_amount
     AND (max_amount IS NULL OR COALESCE(NEW.total_amount, 0) <= max_amount)
   ORDER BY required_levels DESC, min_amount DESC
   LIMIT 1;

  IF NOT FOUND THEN RETURN NEW; END IF;

  INSERT INTO approval_requests (
    user_id, entity_type, entity_id, reference, amount,
    required_levels, current_level, rule_id, requested_by
  ) VALUES (
    NEW.user_id, 'invoice', NEW.id, NEW.invoice_number, NEW.total_amount,
    v_rule.required_levels, 1, v_rule.id,
    NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, '')
  )
  ON CONFLICT (entity_type, entity_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='invoices') THEN
    DROP TRIGGER IF EXISTS trg_invoice_approval_queue ON invoices;
    CREATE TRIGGER trg_invoice_approval_queue
      AFTER INSERT ON invoices
      FOR EACH ROW EXECUTE FUNCTION queue_invoice_approval_if_needed();
  END IF;
END $$;

-- ── 12. Fraud alerts — broaden alert_type, add AR triggers ──────────────────
DO $$
BEGIN
  PERFORM 1 FROM pg_constraint
   WHERE conrelid = 'fraud_alerts'::regclass AND contype = 'c'
     AND conname = 'fraud_alerts_alert_type_check';
  IF FOUND THEN
    ALTER TABLE fraud_alerts DROP CONSTRAINT fraud_alerts_alert_type_check;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='fraud_alerts') THEN
    BEGIN
      ALTER TABLE fraud_alerts
        ADD CONSTRAINT fraud_alerts_alert_type_check CHECK (alert_type IN (
          -- AP
          'duplicate_invoice','duplicate_gstin_invoice','price_spike','suspicious_payment_timing',
          'unregistered_with_gst','high_value_unapproved','round_amount','vendor_bank_change',
          'split_payment_evasion',
          -- AR additions
          'duplicate_customer_invoice','suspicious_discount','overpayment','duplicate_collection',
          'abnormal_credit_note','customer_credit_breach'
        ));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION detect_invoice_anomalies()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_dup_count INTEGER;
  v_credit_limit NUMERIC;
  v_outstanding NUMERIC;
  v_discount_pct NUMERIC;
BEGIN
  -- Duplicate customer invoice (same customer + invoice_number)
  SELECT COUNT(*) INTO v_dup_count
    FROM invoices
   WHERE user_id = NEW.user_id
     AND id <> NEW.id
     AND COALESCE(client_name, '') = COALESCE(NEW.client_name, '')
     AND lower(invoice_number) = lower(NEW.invoice_number);
  IF v_dup_count > 0 THEN
    INSERT INTO fraud_alerts (user_id, alert_type, severity, entity_type, entity_id, reference, amount, details)
    VALUES (NEW.user_id, 'duplicate_customer_invoice', 'high', 'invoice', NEW.id, NEW.invoice_number, NEW.total_amount,
      jsonb_build_object('client_name', NEW.client_name, 'matches', v_dup_count))
    ON CONFLICT (user_id, alert_type, entity_type, entity_id) DO NOTHING;
  END IF;

  -- Suspicious discount > 30% of taxable value
  IF COALESCE(NEW.discount, 0) > 0 AND COALESCE(NEW.amount, 0) > 0 THEN
    v_discount_pct := NEW.discount / NULLIF(NEW.amount + NEW.discount, 0) * 100;
    IF v_discount_pct > 30 THEN
      INSERT INTO fraud_alerts (user_id, alert_type, severity, entity_type, entity_id, reference, amount, details)
      VALUES (NEW.user_id, 'suspicious_discount', 'medium', 'invoice', NEW.id, NEW.invoice_number, NEW.discount,
        jsonb_build_object('discount_pct', round(v_discount_pct, 2), 'taxable_value', NEW.amount))
      ON CONFLICT (user_id, alert_type, entity_type, entity_id) DO NOTHING;
    END IF;
  END IF;

  -- Customer credit-limit breach: outstanding + new invoice > credit_limit.
  IF NEW.customer_id IS NOT NULL OR EXISTS (
    SELECT 1 FROM clients WHERE name = NEW.client_name AND user_id = NEW.user_id
  ) THEN
    SELECT credit_limit INTO v_credit_limit
      FROM clients
     WHERE user_id = NEW.user_id
       AND (id = NEW.customer_id OR (NEW.customer_id IS NULL AND name = NEW.client_name))
     LIMIT 1;

    IF v_credit_limit IS NOT NULL AND v_credit_limit > 0 THEN
      SELECT COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0) INTO v_outstanding
        FROM invoices
       WHERE user_id = NEW.user_id
         AND status IN ('pending','partial','overdue')
         AND COALESCE(client_name, '') = COALESCE(NEW.client_name, '');

      IF v_outstanding + NEW.total_amount > v_credit_limit THEN
        INSERT INTO fraud_alerts (user_id, alert_type, severity, entity_type, entity_id, reference, amount, details)
        VALUES (NEW.user_id, 'customer_credit_breach', 'high', 'invoice', NEW.id, NEW.invoice_number, NEW.total_amount,
          jsonb_build_object('credit_limit', v_credit_limit, 'outstanding', v_outstanding,
                             'new_invoice', NEW.total_amount, 'breach_by', v_outstanding + NEW.total_amount - v_credit_limit))
        ON CONFLICT (user_id, alert_type, entity_type, entity_id) DO NOTHING;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='invoices') THEN
    DROP TRIGGER IF EXISTS trg_invoice_fraud_detect ON invoices;
    CREATE TRIGGER trg_invoice_fraud_detect
      AFTER INSERT ON invoices
      FOR EACH ROW EXECUTE FUNCTION detect_invoice_anomalies();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION detect_payment_received_anomalies()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_dup_count INTEGER;
BEGIN
  -- Duplicate collection: same customer + amount + reference_number on same date
  IF NEW.reference_number IS NOT NULL AND length(NEW.reference_number) > 0 THEN
    SELECT COUNT(*) INTO v_dup_count
      FROM payment_received
     WHERE user_id = NEW.user_id
       AND id <> NEW.id
       AND COALESCE(customer_name, '') = COALESCE(NEW.customer_name, '')
       AND amount = NEW.amount
       AND payment_date = NEW.payment_date
       AND lower(COALESCE(reference_number,'')) = lower(NEW.reference_number);
    IF v_dup_count > 0 THEN
      INSERT INTO fraud_alerts (user_id, alert_type, severity, entity_type, entity_id, reference, amount, details)
      VALUES (NEW.user_id, 'duplicate_collection', 'high', 'payment_received', NEW.id, NEW.reference_number, NEW.amount,
        jsonb_build_object('matches', v_dup_count, 'customer', NEW.customer_name))
      ON CONFLICT (user_id, alert_type, entity_type, entity_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payment_received') THEN
    DROP TRIGGER IF EXISTS trg_payment_received_fraud_detect ON payment_received;
    CREATE TRIGGER trg_payment_received_fraud_detect
      AFTER INSERT ON payment_received
      FOR EACH ROW EXECUTE FUNCTION detect_payment_received_anomalies();
  END IF;
END $$;

-- ── 13. Helper RPC: allocate payment to invoices atomically ─────────────────
CREATE OR REPLACE FUNCTION allocate_payment_to_invoices(
  p_user_id      TEXT,
  p_source_type  TEXT,         -- 'payment_received' | 'credit_note' | 'customer_advance_adjustment'
  p_source_id    UUID,
  p_customer_id  UUID,
  p_allocations  JSONB,        -- [{invoice_id, amount}]
  p_date         DATE DEFAULT CURRENT_DATE
) RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  alloc JSONB;
  v_count INTEGER := 0;
  v_invoice RECORD;
  v_alloc_amount NUMERIC;
BEGIN
  FOR alloc IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_alloc_amount := (alloc ->> 'amount')::numeric;

    -- Reject if would over-allocate the invoice
    SELECT total_amount, paid_amount INTO v_invoice
      FROM invoices WHERE id = (alloc ->> 'invoice_id')::uuid AND user_id = p_user_id;
    IF v_invoice.total_amount IS NOT NULL
       AND COALESCE(v_invoice.paid_amount, 0) + v_alloc_amount > v_invoice.total_amount + 0.01 THEN
      RAISE EXCEPTION 'Allocation would overpay invoice %: outstanding=% requested=%',
        (alloc ->> 'invoice_id'),
        v_invoice.total_amount - COALESCE(v_invoice.paid_amount, 0),
        v_alloc_amount
        USING ERRCODE = '23514';
    END IF;

    INSERT INTO ar_payment_allocations (
      user_id, invoice_id, source_type, source_id, customer_id, amount, allocation_date
    ) VALUES (
      p_user_id, (alloc ->> 'invoice_id')::uuid, p_source_type, p_source_id, p_customer_id, v_alloc_amount, p_date
    )
    ON CONFLICT (user_id, source_type, source_id, invoice_id)
    DO UPDATE SET amount = EXCLUDED.amount;

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- ── 14. Backfill: tag legacy posted invoice/payment journals with customer_id
--       so v_customer_subledger picks them up. Defensive — does nothing on
--       fresh installs.
UPDATE journal_lines jl
   SET customer_id = c.id
  FROM journals j
  JOIN invoices i ON i.id = j.source_id
  JOIN clients  c ON c.user_id = i.user_id AND c.name = i.client_name
 WHERE jl.journal_id = j.id
   AND j.source_type = 'invoice'
   AND jl.customer_id IS NULL;

UPDATE journal_lines jl
   SET customer_id = c.id
  FROM journals j
  JOIN payment_received p ON p.id = j.source_id
  JOIN clients  c ON c.user_id = p.user_id AND c.id = p.customer_id
 WHERE jl.journal_id = j.id
   AND j.source_type = 'payment_received'
   AND jl.customer_id IS NULL;

-- ── 15. Extend journals.source_type CHECK to include 'credit_note' ─────────
DO $$
BEGIN
  PERFORM 1 FROM pg_constraint
   WHERE conrelid = 'journals'::regclass AND contype = 'c' AND conname = 'journals_source_type_chk';
  IF FOUND THEN
    ALTER TABLE journals DROP CONSTRAINT journals_source_type_chk;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='journals') THEN
    BEGIN
      ALTER TABLE journals
        ADD CONSTRAINT journals_source_type_chk CHECK (
          source_type IS NULL OR source_type IN (
            'bill', 'bill_reversal',
            'expense', 'expense_reversal',
            'payment', 'payment_reversal',
            'advance', 'advance_reversal',
            'advance_adjustment', 'advance_adjustment_reversal',
            'invoice', 'invoice_reversal',
            'payment_received', 'payment_received_reversal',
            'cash_memo', 'cash_memo_reversal',
            'cogs', 'cogs_reversal',
            'inventory_adjustment',
            'customer_advance', 'customer_advance_reversal',
            'customer_advance_adjustment', 'customer_advance_adjustment_reversal',
            'credit_note', 'credit_note_reversal',
            'payment_link',
            'gst_payment',
            'tds_payment',
            'accrual', 'accrual_reversal',
            'recurring',
            'opening_balance',
            'manual',
            'reversal'
          )
        );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- ── 16. PostgREST schema reload ─────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

COMMENT ON TABLE customer_advances IS
  'Customer advances received before invoice. applied_amount/outstanding_amount auto-rolled by adjustments trigger.';
COMMENT ON TABLE customer_advance_adjustments IS
  'Application of a customer advance to an invoice. Rolls advance.applied_amount + advance.status.';
COMMENT ON TABLE ar_payment_allocations IS
  'Persistent invoice↔receipt links. Replaces the JSONB blob on payment_received for canonical reporting.';
COMMENT ON TABLE ar_audit_log IS
  'Immutable AR audit trail. Mirrors ap_audit_log. Append-only enforced by trigger.';
COMMENT ON TABLE ar_recurring_invoices IS
  'Templates for periodic invoice generation. generate_ar_recurring_invoices() is the cron entry-point.';
COMMENT ON FUNCTION generate_ar_recurring_invoices IS
  'Cron entry-point. Creates draft/pending invoices for any ar_recurring_invoices due today, advances next_due_date.';
COMMENT ON FUNCTION allocate_payment_to_invoices IS
  'Atomic multi-invoice allocation. Rejects over-allocation. Roll-up trigger updates invoice.paid_amount + status.';
