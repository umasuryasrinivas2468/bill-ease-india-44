-- ════════════════════════════════════════════════════════════════════════════
-- Purchase Returns System (AP-side mirror of sales_returns).
--
-- Vendor Bill → Product Return → Debit Note → Inventory ↓ → AP ↓ → GST Reversal
--
-- Wires on top of the existing AP backbone:
--   * inventory_movements supports movement_type='purchase_return' and
--     auto-rolls stock_quantity / stock_value via refresh_inventory_rollup.
--   * postPurchaseBill (TS journal engine) currently posts:
--       Dr Inventory/Purchase + Dr ITC, Cr AP
--     The reversal we need (postDebitNote / postPurchaseReturn) is:
--       Dr AP, Cr Purchase Returns + Cr ITC reversal
--     — registered as a helper alongside this migration in journalEngine.ts.
--   * payment_allocations (AP) links payments/advances to bills. We extend
--     source_type to include 'debit_note' so settled debit notes appear there.
--
-- New tables:
--   purchase_returns        — header
--   purchase_return_items   — line items
--
-- Extended:
--   debit_notes (+ vendor_id, original_bill_id, return_id, outcome,
--                 utilized_amount, intra_state, cgst_amount, sgst_amount,
--                 igst_amount, place_of_supply, customer_id legacy column
--                 left untouched).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. purchase_returns ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_returns (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           TEXT NOT NULL,
  return_number     TEXT NOT NULL,
  return_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  bill_id           UUID NOT NULL REFERENCES purchase_bills(id) ON DELETE RESTRICT,
  bill_number       TEXT NOT NULL,
  vendor_id         UUID REFERENCES vendors(id) ON DELETE SET NULL,
  vendor_name       TEXT NOT NULL,
  vendor_email      TEXT,
  vendor_gst        TEXT,
  vendor_address    TEXT,

  return_type       TEXT NOT NULL DEFAULT 'partial'
    CHECK (return_type IN ('full', 'partial', 'item_wise')),
  reason            TEXT,
  notes             TEXT,

  -- Totals (rolled up from purchase_return_items)
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
  debit_note_id     UUID,                          -- FK added later if needed
  inventory_reduced NUMERIC(14,2) DEFAULT 0,       -- value of inventory removed
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

CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_returns_number
  ON purchase_returns(user_id, lower(return_number));
CREATE INDEX IF NOT EXISTS idx_purchase_returns_bill   ON purchase_returns(user_id, bill_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_vendor ON purchase_returns(user_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_status ON purchase_returns(user_id, status, return_date DESC);

ALTER TABLE purchase_returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "purchase_returns_owner" ON purchase_returns;
CREATE POLICY "purchase_returns_owner" ON purchase_returns FOR ALL USING (
  user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
);

DROP TRIGGER IF EXISTS update_purchase_returns_updated_at ON purchase_returns;
CREATE TRIGGER update_purchase_returns_updated_at
  BEFORE UPDATE ON purchase_returns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 2. purchase_return_items ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_return_items (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             TEXT NOT NULL,
  return_id           UUID NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
  product_id          UUID REFERENCES inventory(id) ON DELETE SET NULL,
  product_name        TEXT NOT NULL,
  hsn_sac             TEXT,

  quantity            NUMERIC(14,4) NOT NULL CHECK (quantity > 0),
  rate                NUMERIC(14,4) NOT NULL DEFAULT 0,
  amount              NUMERIC(14,2) NOT NULL DEFAULT 0,   -- quantity * rate
  gst_rate            NUMERIC(5,2)  NOT NULL DEFAULT 0,
  gst_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  uom                 TEXT DEFAULT 'pcs',

  -- Reason for return (vendor-side options differ from sales)
  condition           TEXT NOT NULL DEFAULT 'defective'
    CHECK (condition IN ('defective', 'damaged', 'wrong_item', 'excess', 'expired', 'other')),

  -- Snapshot
  original_quantity   NUMERIC(14,4),
  bill_line_key       TEXT,

  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pri_return  ON purchase_return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_pri_product ON purchase_return_items(user_id, product_id);

ALTER TABLE purchase_return_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "purchase_return_items_owner" ON purchase_return_items;
CREATE POLICY "purchase_return_items_owner" ON purchase_return_items FOR ALL USING (
  user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
);

-- ── 3. Roll-up trigger: keep header totals in sync with items ───────────────
CREATE OR REPLACE FUNCTION roll_purchase_return_totals()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_return_id UUID := COALESCE(NEW.return_id, OLD.return_id);
  v_sub   NUMERIC := 0;
  v_gst   NUMERIC := 0;
  v_tot   NUMERIC := 0;
  v_intra BOOLEAN;
BEGIN
  SELECT
    COALESCE(SUM(amount), 0),
    COALESCE(SUM(gst_amount), 0),
    COALESCE(SUM(total_amount), 0)
  INTO v_sub, v_gst, v_tot
  FROM purchase_return_items
  WHERE return_id = v_return_id;

  SELECT intra_state INTO v_intra FROM purchase_returns WHERE id = v_return_id;

  UPDATE purchase_returns
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

DROP TRIGGER IF EXISTS trg_roll_purchase_return_totals ON purchase_return_items;
CREATE TRIGGER trg_roll_purchase_return_totals
  AFTER INSERT OR UPDATE OR DELETE ON purchase_return_items
  FOR EACH ROW EXECUTE FUNCTION roll_purchase_return_totals();

-- ── 4. Validation trigger: cumulative return qty must not exceed bill qty ──
CREATE OR REPLACE FUNCTION check_purchase_return_quantity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_bill_id    UUID;
  v_user_id    TEXT;
  v_purchased  NUMERIC := 0;
  v_already    NUMERIC := 0;
BEGIN
  SELECT bill_id, user_id
    INTO v_bill_id, v_user_id
    FROM purchase_returns
   WHERE id = NEW.return_id;

  IF v_bill_id IS NULL OR NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Sum qty of matching product_id from the bill's items array. AP bills don't
  -- have an items_with_product_id mirror today, so just look at items.
  SELECT COALESCE(SUM((line ->> 'quantity')::numeric), 0) INTO v_purchased
    FROM purchase_bills b,
         jsonb_array_elements(COALESCE(b.items, '[]'::jsonb)) AS line
   WHERE b.id = v_bill_id
     AND (
       (line ->> 'product_id')::uuid = NEW.product_id
       OR (line ->> 'inventory_item_id')::uuid = NEW.product_id
       OR (line ->> 'item_id')::uuid = NEW.product_id
     );

  IF v_purchased <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(pri.quantity), 0) INTO v_already
    FROM purchase_return_items pri
    JOIN purchase_returns pr ON pr.id = pri.return_id
   WHERE pr.bill_id = v_bill_id
     AND pri.product_id = NEW.product_id
     AND pr.status <> 'cancelled'
     AND pri.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF v_already + NEW.quantity > v_purchased + 0.0001 THEN
    RAISE EXCEPTION 'Return quantity exceeds purchased quantity for product % (purchased=%, already returned=%, attempted=%)',
      NEW.product_id, v_purchased, v_already, NEW.quantity
      USING ERRCODE = '23514';
  END IF;

  IF NEW.original_quantity IS NULL THEN
    NEW.original_quantity := v_purchased;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_purchase_return_qty ON purchase_return_items;
CREATE TRIGGER trg_check_purchase_return_qty
  BEFORE INSERT OR UPDATE ON purchase_return_items
  FOR EACH ROW EXECUTE FUNCTION check_purchase_return_quantity();

-- ── 5. Period-lock guard on purchase_returns ────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_period_lock_purchase_returns()
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
    RAISE EXCEPTION 'Cannot modify purchase return — accounting period covering % is locked.', v_date
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_period_lock_purchase_returns ON purchase_returns;
CREATE TRIGGER trg_period_lock_purchase_returns
  BEFORE INSERT OR UPDATE OR DELETE ON purchase_returns
  FOR EACH ROW EXECUTE FUNCTION enforce_period_lock_purchase_returns();

-- ── 6. Extend debit_notes for return linkage + utilization tracking ────────
-- The legacy debit_notes table was modeled like a credit-note: it FK'd to
-- `invoices` and stored a `customer_id`. For AP usage we add the right AP
-- columns alongside (keeping legacy fields intact so existing rows survive).
ALTER TABLE debit_notes
  ADD COLUMN IF NOT EXISTS vendor_id        UUID REFERENCES vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS original_bill_id UUID REFERENCES purchase_bills(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS return_id        UUID REFERENCES purchase_returns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS outcome          TEXT
    CHECK (outcome IS NULL OR outcome IN ('refund', 'adjustment', 'replacement')),
  ADD COLUMN IF NOT EXISTS utilized_amount  NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cgst_amount      NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS sgst_amount      NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS igst_amount      NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS intra_state      BOOLEAN,
  ADD COLUMN IF NOT EXISTS place_of_supply  TEXT,
  ADD COLUMN IF NOT EXISTS cost_center_id   UUID REFERENCES cost_centers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_debit_notes_vendor  ON debit_notes(user_id, vendor_id)        WHERE vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_debit_notes_bill    ON debit_notes(user_id, original_bill_id) WHERE original_bill_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_debit_notes_return  ON debit_notes(user_id, return_id)        WHERE return_id IS NOT NULL;

CREATE OR REPLACE VIEW v_debit_note_balances AS
SELECT
  dn.id,
  dn.user_id,
  dn.debit_note_number,
  dn.debit_note_date,
  dn.vendor_name,
  dn.original_bill_id,
  dn.return_id,
  dn.outcome,
  dn.total_amount,
  dn.utilized_amount,
  GREATEST(dn.total_amount - dn.utilized_amount, 0) AS refundable_balance,
  dn.status
FROM debit_notes dn;

-- ── 7. Extend payment_allocations to accept debit_note settlements ──────────
DO $$
BEGIN
  PERFORM 1 FROM pg_constraint
   WHERE conrelid = 'payment_allocations'::regclass AND contype = 'c'
     AND conname = 'payment_allocations_source_type_check';
  IF FOUND THEN
    ALTER TABLE payment_allocations DROP CONSTRAINT payment_allocations_source_type_check;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE payment_allocations
  ADD CONSTRAINT payment_allocations_source_type_check
  CHECK (source_type IN ('payment', 'advance', 'debit_note'));

-- Trigger: when a payment_allocation of source_type='debit_note' lands, roll
-- debit_notes.utilized_amount + status to match the sum of allocations.
CREATE OR REPLACE FUNCTION roll_debit_note_utilization()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_dn_id UUID;
  v_used  NUMERIC;
  v_total NUMERIC;
BEGIN
  IF COALESCE(NEW.source_type, OLD.source_type) <> 'debit_note' THEN
    RETURN NULL;
  END IF;

  v_dn_id := COALESCE(NEW.source_id, OLD.source_id);

  SELECT COALESCE(SUM(amount), 0) INTO v_used
    FROM payment_allocations
   WHERE source_type = 'debit_note' AND source_id = v_dn_id;

  SELECT total_amount INTO v_total FROM debit_notes WHERE id = v_dn_id;
  IF v_total IS NULL THEN RETURN NULL; END IF;

  UPDATE debit_notes
     SET utilized_amount = LEAST(v_used, v_total),
         status = CASE
           WHEN v_used >= v_total - 0.01 THEN 'applied'
           ELSE                                 status
         END,
         updated_at = NOW()
   WHERE id = v_dn_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_roll_debit_note_util ON payment_allocations;
CREATE TRIGGER trg_roll_debit_note_util
  AFTER INSERT OR UPDATE OR DELETE ON payment_allocations
  FOR EACH ROW EXECUTE FUNCTION roll_debit_note_utilization();

-- ── 8. RPC: allocate a debit note / payment / advance to bills atomically ──
-- Mirrors allocate_payment_to_invoices on the AR side. Rejects over-allocation
-- and rolls the bill's paid_amount + status.
CREATE OR REPLACE FUNCTION allocate_payment_to_bills(
  p_user_id      TEXT,
  p_source_type  TEXT,         -- 'payment' | 'advance' | 'debit_note'
  p_source_id    UUID,
  p_vendor_id    UUID,
  p_allocations  JSONB,        -- [{bill_id, amount}]
  p_date         DATE DEFAULT CURRENT_DATE
) RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  alloc JSONB;
  v_count INTEGER := 0;
  v_bill RECORD;
  v_alloc_amount NUMERIC;
  v_total_allocated NUMERIC;
  v_new_status TEXT;
BEGIN
  FOR alloc IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_alloc_amount := (alloc ->> 'amount')::numeric;

    SELECT total_amount, paid_amount, due_date INTO v_bill
      FROM purchase_bills WHERE id = (alloc ->> 'bill_id')::uuid AND user_id = p_user_id;

    IF v_bill.total_amount IS NULL THEN
      RAISE EXCEPTION 'Bill % not found', (alloc ->> 'bill_id');
    END IF;
    IF COALESCE(v_bill.paid_amount, 0) + v_alloc_amount > v_bill.total_amount + 0.01 THEN
      RAISE EXCEPTION 'Allocation would overpay bill %: outstanding=% requested=%',
        (alloc ->> 'bill_id'),
        v_bill.total_amount - COALESCE(v_bill.paid_amount, 0),
        v_alloc_amount
        USING ERRCODE = '23514';
    END IF;

    INSERT INTO payment_allocations (
      user_id, bill_id, source_type, source_id, vendor_id, amount, allocation_date
    ) VALUES (
      p_user_id, (alloc ->> 'bill_id')::uuid, p_source_type, p_source_id, p_vendor_id, v_alloc_amount, p_date
    );

    -- Roll the bill's paid_amount + derive status.
    v_total_allocated := COALESCE(v_bill.paid_amount, 0) + v_alloc_amount;
    v_new_status := CASE
      WHEN v_total_allocated >= v_bill.total_amount - 0.01            THEN 'paid'
      WHEN v_total_allocated > 0                                       THEN 'partially_paid'
      WHEN v_bill.due_date IS NOT NULL AND v_bill.due_date < CURRENT_DATE THEN 'overdue'
      ELSE                                                                  'pending'
    END;

    UPDATE purchase_bills
       SET paid_amount = LEAST(v_total_allocated, total_amount),
           status      = v_new_status,
           updated_at  = NOW()
     WHERE id = (alloc ->> 'bill_id')::uuid AND user_id = p_user_id;

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- ── 9. journals.source_type — allow 'purchase_return' + 'debit_note' ────────
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
            'debit_note', 'debit_note_reversal',
            'purchase_return', 'purchase_return_reversal',
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

-- ── 10. Purchase Return Register view ───────────────────────────────────────
CREATE OR REPLACE VIEW v_purchase_return_register AS
SELECT
  pr.id,
  pr.user_id,
  pr.return_number,
  pr.return_date,
  pr.bill_id,
  pr.bill_number,
  pr.vendor_id,
  pr.vendor_name,
  pr.return_type,
  pr.outcome,
  pr.status,
  pr.subtotal,
  pr.gst_amount,
  pr.total_amount,
  pr.cgst_amount,
  pr.sgst_amount,
  pr.igst_amount,
  pr.inventory_reduced,
  pr.debit_note_id,
  dn.debit_note_number,
  dn.utilized_amount      AS debit_utilized,
  GREATEST(COALESCE(dn.total_amount, 0) - COALESCE(dn.utilized_amount, 0), 0) AS debit_refundable,
  pr.reason,
  pr.created_at
FROM purchase_returns pr
LEFT JOIN debit_notes dn ON dn.id = pr.debit_note_id;

-- ── 11. PostgREST schema reload ─────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

COMMENT ON TABLE purchase_returns IS
  'Purchase return header. Drafts trigger nothing; approved returns are linked to a debit_note + inventory_movements + journals by the service layer.';
COMMENT ON TABLE purchase_return_items IS
  'Purchase return line items. Quantity capped at original bill quantity by trg_check_purchase_return_qty.';
COMMENT ON COLUMN debit_notes.original_bill_id IS
  'Source purchase_bill the debit note was issued against (NULL for stand-alone debit notes).';
COMMENT ON COLUMN debit_notes.return_id IS
  'Source purchase_return that generated this debit note.';
COMMENT ON FUNCTION allocate_payment_to_bills IS
  'Atomic multi-bill allocation for payments / advances / debit notes. Rolls purchase_bills.paid_amount + status.';
COMMENT ON VIEW v_purchase_return_register IS
  'Purchase Return Register report. Joins returns to their debit note + refundable balance.';
