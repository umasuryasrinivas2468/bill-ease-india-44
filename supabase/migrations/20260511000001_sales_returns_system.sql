-- ════════════════════════════════════════════════════════════════════════════
-- Sales Returns System
--
-- Wires Sales Invoice → Return → Credit Note → Inventory ↑ → AR ↓ → GST reversal
-- on top of the existing AR + inventory backbone:
--   * inventory_movements already supports movement_type='sales_return' and
--     auto-rolls stock_quantity / stock_value via refresh_inventory_rollup.
--   * postCreditNote (TS journal engine) already books Sales Returns Dr +
--     Output GST Dr + AR Cr with customer sub-ledger tags.
--   * ar_payment_allocations carries persistent credit→invoice links.
--
-- New tables:
--   sales_returns          — header (invoice link, customer, totals, outcome)
--   sales_return_items     — line items (qty, condition, rate, gst)
--
-- New columns on credit_notes:
--   return_id, outcome, utilized_amount  (refundable_balance is computed)
--
-- Validation:
--   trg_check_sales_return_qty — prevents returning more than sold qty
--     (cumulative across all non-cancelled returns + this insert/update).
--
-- Roll-ups:
--   trg_roll_sales_return_totals — recomputes header totals from items.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. sales_returns ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_returns (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           TEXT NOT NULL,
  return_number     TEXT NOT NULL,
  return_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  invoice_id        UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  invoice_number    TEXT NOT NULL,                  -- snapshot for register
  customer_id       UUID REFERENCES clients(id) ON DELETE SET NULL,
  customer_name     TEXT NOT NULL,
  customer_email    TEXT,
  customer_gst      TEXT,
  customer_address  TEXT,

  return_type       TEXT NOT NULL DEFAULT 'partial'
    CHECK (return_type IN ('full', 'partial', 'item_wise')),
  reason            TEXT,
  notes             TEXT,

  -- Totals (rolled up from sales_return_items)
  subtotal          NUMERIC(14,2) NOT NULL DEFAULT 0,
  gst_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  cgst_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  sgst_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  igst_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  place_of_supply   TEXT,
  intra_state       BOOLEAN DEFAULT TRUE,

  -- Workflow
  status            TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'cancelled')),
  outcome           TEXT NOT NULL DEFAULT 'adjustment'
    CHECK (outcome IN ('refund', 'adjustment', 'replacement')),

  -- Post-approval linkage (filled by service layer)
  credit_note_id    UUID REFERENCES credit_notes(id) ON DELETE SET NULL,
  cogs_reversed     NUMERIC(14,2) DEFAULT 0,        -- value of inventory restored / COGS reversed
  approved_at       TIMESTAMPTZ,
  approved_by       TEXT,

  -- Sub-ledger tags
  cost_center_id    UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  project_id        UUID,
  branch_id         UUID,
  department        TEXT,

  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_returns_number
  ON sales_returns(user_id, lower(return_number));
CREATE INDEX IF NOT EXISTS idx_sales_returns_invoice  ON sales_returns(user_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_customer ON sales_returns(user_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_status   ON sales_returns(user_id, status, return_date DESC);

ALTER TABLE sales_returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sales_returns_owner" ON sales_returns;
CREATE POLICY "sales_returns_owner" ON sales_returns FOR ALL USING (
  user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
);

-- updated_at trigger
DROP TRIGGER IF EXISTS update_sales_returns_updated_at ON sales_returns;
CREATE TRIGGER update_sales_returns_updated_at
  BEFORE UPDATE ON sales_returns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 2. sales_return_items ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_return_items (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             TEXT NOT NULL,
  return_id           UUID NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
  product_id          UUID REFERENCES inventory(id) ON DELETE SET NULL,
  product_name        TEXT NOT NULL,
  hsn_sac             TEXT,

  quantity            NUMERIC(14,4) NOT NULL CHECK (quantity > 0),
  rate                NUMERIC(14,4) NOT NULL DEFAULT 0,
  amount              NUMERIC(14,2) NOT NULL DEFAULT 0,  -- quantity * rate
  gst_rate            NUMERIC(5,2)  NOT NULL DEFAULT 0,
  gst_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  uom                 TEXT DEFAULT 'pcs',

  condition           TEXT NOT NULL DEFAULT 'restockable'
    CHECK (condition IN ('restockable', 'damaged', 'scrap')),

  -- Snapshot from invoice so over-return validation is fast
  original_quantity   NUMERIC(14,4),
  invoice_line_key    TEXT,         -- matches a sortable key in the invoice's items array

  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sri_return  ON sales_return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_sri_product ON sales_return_items(user_id, product_id);

ALTER TABLE sales_return_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sales_return_items_owner" ON sales_return_items;
CREATE POLICY "sales_return_items_owner" ON sales_return_items FOR ALL USING (
  user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
);

-- ── 3. Roll-up trigger: keep header totals in sync with items ───────────────
CREATE OR REPLACE FUNCTION roll_sales_return_totals()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_return_id UUID := COALESCE(NEW.return_id, OLD.return_id);
  v_sub  NUMERIC := 0;
  v_gst  NUMERIC := 0;
  v_tot  NUMERIC := 0;
  v_intra BOOLEAN;
BEGIN
  SELECT
    COALESCE(SUM(amount), 0),
    COALESCE(SUM(gst_amount), 0),
    COALESCE(SUM(total_amount), 0)
  INTO v_sub, v_gst, v_tot
  FROM sales_return_items
  WHERE return_id = v_return_id;

  SELECT intra_state INTO v_intra FROM sales_returns WHERE id = v_return_id;

  UPDATE sales_returns
     SET subtotal     = ROUND(v_sub, 2),
         gst_amount   = ROUND(v_gst, 2),
         total_amount = ROUND(v_tot, 2),
         cgst_amount  = CASE WHEN COALESCE(v_intra, TRUE) THEN ROUND(v_gst / 2, 2) ELSE 0 END,
         sgst_amount  = CASE WHEN COALESCE(v_intra, TRUE) THEN ROUND(v_gst / 2, 2) ELSE 0 END,
         igst_amount  = CASE WHEN COALESCE(v_intra, TRUE) THEN 0 ELSE ROUND(v_gst, 2) END,
         updated_at   = NOW()
   WHERE id = v_return_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_roll_sales_return_totals ON sales_return_items;
CREATE TRIGGER trg_roll_sales_return_totals
  AFTER INSERT OR UPDATE OR DELETE ON sales_return_items
  FOR EACH ROW EXECUTE FUNCTION roll_sales_return_totals();

-- ── 4. Validation trigger: cumulative return qty must not exceed sold qty ───
-- Computes the sold quantity per (invoice_id, product_id) from the invoice's
-- items_with_product_id JSONB array, then ensures that prior approved+pending
-- return qty + this new line stays within the sold qty.
CREATE OR REPLACE FUNCTION check_sales_return_quantity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_invoice_id UUID;
  v_user_id    TEXT;
  v_sold       NUMERIC := 0;
  v_already    NUMERIC := 0;
BEGIN
  SELECT invoice_id, user_id
    INTO v_invoice_id, v_user_id
    FROM sales_returns
   WHERE id = NEW.return_id;

  IF v_invoice_id IS NULL OR NEW.product_id IS NULL THEN
    -- No invoice context (rare) or non-inventory line — skip qty check.
    RETURN NEW;
  END IF;

  -- Sum qty of matching product_id from the invoice's items array.
  SELECT COALESCE(SUM((line ->> 'quantity')::numeric), 0) INTO v_sold
    FROM invoices i,
         jsonb_array_elements(COALESCE(i.items_with_product_id, i.items, '[]'::jsonb)) AS line
   WHERE i.id = v_invoice_id
     AND (line ->> 'product_id')::uuid = NEW.product_id;

  IF v_sold <= 0 THEN
    RETURN NEW;  -- product not on this invoice; the UI shouldn't allow this
                 -- but we don't block server-side (legacy data may be sparse).
  END IF;

  -- Already returned for this invoice+product in other (non-cancelled) returns.
  SELECT COALESCE(SUM(sri.quantity), 0) INTO v_already
    FROM sales_return_items sri
    JOIN sales_returns sr ON sr.id = sri.return_id
   WHERE sr.invoice_id = v_invoice_id
     AND sri.product_id = NEW.product_id
     AND sr.status <> 'cancelled'
     AND sri.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF v_already + NEW.quantity > v_sold + 0.0001 THEN
    RAISE EXCEPTION 'Return quantity exceeds sold quantity for product % (sold=%, already returned=%, attempted=%)',
      NEW.product_id, v_sold, v_already, NEW.quantity
      USING ERRCODE = '23514';
  END IF;

  -- Stamp the original quantity if not set, for UI display.
  IF NEW.original_quantity IS NULL THEN
    NEW.original_quantity := v_sold;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_sales_return_qty ON sales_return_items;
CREATE TRIGGER trg_check_sales_return_qty
  BEFORE INSERT OR UPDATE ON sales_return_items
  FOR EACH ROW EXECUTE FUNCTION check_sales_return_quantity();

-- ── 5. Extend credit_notes for return linkage + utilization tracking ────────
ALTER TABLE credit_notes
  ADD COLUMN IF NOT EXISTS return_id        UUID REFERENCES sales_returns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS outcome          TEXT
    CHECK (outcome IS NULL OR outcome IN ('refund', 'adjustment', 'replacement')),
  ADD COLUMN IF NOT EXISTS utilized_amount  NUMERIC(14,2) NOT NULL DEFAULT 0;

-- refundable_balance: virtual column (use a view to compute on the fly so the
-- column type stays simple even when amount/utilized change via trigger).
CREATE OR REPLACE VIEW v_credit_note_balances AS
SELECT
  cn.id,
  cn.user_id,
  cn.credit_note_number,
  cn.credit_note_date,
  cn.client_name,
  cn.original_invoice_id,
  cn.return_id,
  cn.outcome,
  cn.total_amount,
  cn.utilized_amount,
  GREATEST(cn.total_amount - cn.utilized_amount, 0) AS refundable_balance,
  cn.status
FROM credit_notes cn;

CREATE INDEX IF NOT EXISTS idx_credit_notes_return  ON credit_notes(user_id, return_id) WHERE return_id IS NOT NULL;

-- Trigger: when an ar_payment_allocation row of source_type='credit_note' is
-- inserted/updated/deleted, roll credit_notes.utilized_amount + status to
-- match the sum of allocations.
CREATE OR REPLACE FUNCTION roll_credit_note_utilization()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_cn_id UUID;
  v_used  NUMERIC;
  v_total NUMERIC;
BEGIN
  -- Only act on credit_note allocations
  IF COALESCE(NEW.source_type, OLD.source_type) <> 'credit_note' THEN
    RETURN NULL;
  END IF;

  v_cn_id := COALESCE(NEW.source_id, OLD.source_id);

  SELECT COALESCE(SUM(amount), 0) INTO v_used
    FROM ar_payment_allocations
   WHERE source_type = 'credit_note' AND source_id = v_cn_id;

  SELECT total_amount INTO v_total FROM credit_notes WHERE id = v_cn_id;

  IF v_total IS NULL THEN RETURN NULL; END IF;

  UPDATE credit_notes
     SET utilized_amount = LEAST(v_used, v_total),
         status = CASE
           WHEN v_used >= v_total - 0.01 THEN 'applied'
           WHEN v_used > 0               THEN status  -- partially used: keep as 'issued'
           ELSE                                status
         END,
         updated_at = NOW()
   WHERE id = v_cn_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_roll_credit_note_util ON ar_payment_allocations;
CREATE TRIGGER trg_roll_credit_note_util
  AFTER INSERT OR UPDATE OR DELETE ON ar_payment_allocations
  FOR EACH ROW EXECUTE FUNCTION roll_credit_note_utilization();

-- ── 6. Sales Return Register view ───────────────────────────────────────────
CREATE OR REPLACE VIEW v_sales_return_register AS
SELECT
  sr.id,
  sr.user_id,
  sr.return_number,
  sr.return_date,
  sr.invoice_id,
  sr.invoice_number,
  sr.customer_id,
  sr.customer_name,
  sr.return_type,
  sr.outcome,
  sr.status,
  sr.subtotal,
  sr.gst_amount,
  sr.total_amount,
  sr.cgst_amount,
  sr.sgst_amount,
  sr.igst_amount,
  sr.cogs_reversed,
  sr.credit_note_id,
  cn.credit_note_number,
  cn.utilized_amount         AS credit_utilized,
  GREATEST(COALESCE(cn.total_amount, 0) - COALESCE(cn.utilized_amount, 0), 0) AS credit_refundable,
  sr.reason,
  sr.created_at
FROM sales_returns sr
LEFT JOIN credit_notes cn ON cn.id = sr.credit_note_id;

-- ── 7. Period-lock guard on sales_returns ───────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_period_lock_sales_returns()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_date DATE;
  v_user TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_user := OLD.user_id; v_date := OLD.return_date;
  ELSE
    v_user := NEW.user_id; v_date := NEW.return_date;
  END IF;

  IF v_date IS NOT NULL AND is_period_locked(v_user, v_date) THEN
    RAISE EXCEPTION 'Cannot modify sales return — accounting period covering % is locked.', v_date
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_period_lock_sales_returns ON sales_returns;
CREATE TRIGGER trg_period_lock_sales_returns
  BEFORE INSERT OR UPDATE OR DELETE ON sales_returns
  FOR EACH ROW EXECUTE FUNCTION enforce_period_lock_sales_returns();

-- ── 8. journals.source_type — allow 'sales_return' (and reversal) ───────────
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
            'sales_return', 'sales_return_reversal',
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

-- ── 9. PostgREST schema reload ──────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

COMMENT ON TABLE sales_returns IS
  'Sales return header. Drafts trigger nothing; approved returns are linked to a credit_note + inventory movements + journals by the service layer.';
COMMENT ON TABLE sales_return_items IS
  'Sales return line items. Quantity capped at original invoice quantity by trg_check_sales_return_qty.';
COMMENT ON COLUMN credit_notes.return_id IS
  'Source sales_return that generated this credit note (NULL for stand-alone credit notes).';
COMMENT ON COLUMN credit_notes.utilized_amount IS
  'Sum of ar_payment_allocations against this credit note. Auto-rolled by trg_roll_credit_note_util.';
COMMENT ON VIEW v_sales_return_register IS
  'Sales Return Register report. Joins returns to their credit note + refundable balance.';
