-- ════════════════════════════════════════════════════════════════════════════
-- Brief items #1 (bill classification engine), #4 (inventory ↔ AP hardening),
-- #6 (payment management hardening). One migration so all three drop in
-- together — they touch overlapping objects (purchase_bills, inventory_movements,
-- vendor_bill_payments).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. CLASSIFICATION RULES TABLE (#1) ─────────────────────────────────────
-- Lookup table for "when I see vendor X / item-category Y / HSN Z, classify
-- the bill line as inventory | expense | asset | prepaid". The classifier
-- evaluates rules in priority order; first match wins. Falls back to
-- inventory.type or 'expense'.
CREATE TABLE IF NOT EXISTS bill_classification_rules (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      TEXT NOT NULL,
  match_type   TEXT NOT NULL CHECK (match_type IN ('vendor', 'category', 'hsn', 'item_name', 'item_type')),
  match_value  TEXT NOT NULL,
  classification TEXT NOT NULL CHECK (classification IN ('inventory', 'expense', 'asset', 'prepaid')),
  priority     INTEGER NOT NULL DEFAULT 100,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, match_type, match_value, is_active)
);
CREATE INDEX IF NOT EXISTS idx_classification_rules_user
  ON bill_classification_rules(user_id, priority DESC) WHERE is_active = TRUE;

ALTER TABLE bill_classification_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "classification_rules_owner" ON bill_classification_rules;
CREATE POLICY "classification_rules_owner" ON bill_classification_rules FOR ALL USING (
  user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
);

-- Header-level classification flag (still useful at the bill level for
-- filtering / reporting; per-line lives in the items JSONB as __classification).
ALTER TABLE purchase_bills
  ADD COLUMN IF NOT EXISTS classification TEXT
    CHECK (classification IN ('goods', 'expense', 'mixed', 'asset', 'prepaid')),
  ADD COLUMN IF NOT EXISTS asset_amount   NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prepaid_amount NUMERIC(14,2) DEFAULT 0;

-- View: vendor → most-common-classification, used by the classifier as a
-- fallback when no rule matches.
CREATE OR REPLACE VIEW v_vendor_classification_history AS
SELECT
  user_id,
  vendor_id,
  classification,
  COUNT(*) AS bill_count,
  ROW_NUMBER() OVER (
    PARTITION BY user_id, vendor_id ORDER BY COUNT(*) DESC
  ) AS rank
FROM purchase_bills
WHERE classification IS NOT NULL AND vendor_id IS NOT NULL
GROUP BY user_id, vendor_id, classification;

-- ── 2. INVENTORY ↔ AP HARDENING (#4) ───────────────────────────────────────
-- a) Reverse inventory_movements when their source bill is deleted/cancelled.
--    movements were already idempotent on (source_type, source_id) — the
--    service deletes-then-reinserts on bill UPDATE. We add a hard delete on
--    bill DELETE and a status='cancelled' check on UPDATE.
CREATE OR REPLACE FUNCTION reverse_bill_inventory_on_void()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM inventory_movements
     WHERE user_id = OLD.user_id
       AND source_type = 'purchase_bill'
       AND source_id   = OLD.id;
    DELETE FROM inventory_batches
     WHERE user_id = OLD.user_id
       AND source_type = 'purchase_bill'
       AND source_id   = OLD.id;
    RETURN OLD;
  END IF;

  -- Bill flipped to cancelled / void → wipe its movements
  IF TG_OP = 'UPDATE'
     AND lower(COALESCE(NEW.status, '')) IN ('cancelled', 'void', 'voided')
     AND lower(COALESCE(OLD.status, '')) NOT IN ('cancelled', 'void', 'voided') THEN
    DELETE FROM inventory_movements
     WHERE user_id = NEW.user_id
       AND source_type = 'purchase_bill'
       AND source_id   = NEW.id;
    DELETE FROM inventory_batches
     WHERE user_id = NEW.user_id
       AND source_type = 'purchase_bill'
       AND source_id   = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bill_inventory_void ON purchase_bills;
CREATE TRIGGER trg_bill_inventory_void
  AFTER UPDATE OR DELETE ON purchase_bills
  FOR EACH ROW EXECUTE FUNCTION reverse_bill_inventory_on_void();

-- b) Reverse the bill's journal entry when the bill is voided/cancelled.
--    Uses the engine's reverse_journal() RPC.
CREATE OR REPLACE FUNCTION reverse_bill_journal_on_void()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_journal_id UUID;
BEGIN
  IF TG_OP = 'UPDATE'
     AND lower(COALESCE(NEW.status, '')) IN ('cancelled', 'void', 'voided')
     AND lower(COALESCE(OLD.status, '')) NOT IN ('cancelled', 'void', 'voided') THEN
    SELECT id INTO v_journal_id
      FROM journals
     WHERE user_id = NEW.user_id
       AND source_type = 'bill'
       AND source_id = NEW.id
       AND COALESCE(is_reversed, FALSE) = FALSE
       AND status = 'posted'
     LIMIT 1;
    IF v_journal_id IS NOT NULL THEN
      PERFORM reverse_journal(v_journal_id, NULL, NULL,
        'Auto-reversal: bill ' || NEW.bill_number || ' cancelled', NULL);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bill_journal_void ON purchase_bills;
CREATE TRIGGER trg_bill_journal_void
  AFTER UPDATE ON purchase_bills
  FOR EACH ROW EXECUTE FUNCTION reverse_bill_journal_on_void();

-- c) inventory.stock_quantity + stock_value rebuilder. Used as a safety net
--    when manual SQL or partial failures leave the cache out of sync.
CREATE OR REPLACE FUNCTION rebuild_inventory_stock(p_user_id TEXT, p_item_id UUID DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE inventory inv
  SET
    stock_quantity = COALESCE(agg.qty,   0),
    stock_value    = COALESCE(agg.value, 0),
    average_cost   = CASE WHEN COALESCE(agg.qty,0) > 0 THEN agg.value / agg.qty ELSE inv.average_cost END
  FROM (
    SELECT
      item_id,
      SUM(COALESCE(quantity_in, 0) - COALESCE(quantity_out, 0))      AS qty,
      SUM(COALESCE(value_in,    0) - COALESCE(value_out,    0))      AS value
    FROM inventory_movements
    WHERE user_id = p_user_id
      AND (p_item_id IS NULL OR item_id = p_item_id)
    GROUP BY item_id
  ) agg
  WHERE inv.id = agg.item_id
    AND inv.user_id = p_user_id
    AND (p_item_id IS NULL OR inv.id = p_item_id);
END;
$$;

-- ── 3. PAYMENT MANAGEMENT HARDENING (#6) ───────────────────────────────────

-- a) Maintain purchase_bills.paid_amount + status from payment_allocations.
--    The app currently updates these manually on each payment write — a bug
--    in any path would silently drift the AP balance. The trigger keeps it
--    canonical.
CREATE OR REPLACE FUNCTION refresh_bill_payment_status(p_bill_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_bill purchase_bills%ROWTYPE;
  v_allocated NUMERIC := 0;
  v_status TEXT;
BEGIN
  SELECT * INTO v_bill FROM purchase_bills WHERE id = p_bill_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_allocated
    FROM payment_allocations
   WHERE bill_id = p_bill_id;

  v_status :=
    CASE
      WHEN v_allocated >= v_bill.total_amount - 0.01 THEN 'paid'
      WHEN v_allocated > 0                            THEN 'partially_paid'
      WHEN COALESCE(v_bill.due_date, CURRENT_DATE) < CURRENT_DATE THEN 'overdue'
      ELSE 'pending'
    END;

  UPDATE purchase_bills
     SET paid_amount = v_allocated,
         status      = v_status
   WHERE id = p_bill_id;
END;
$$;

CREATE OR REPLACE FUNCTION trg_refresh_bill_after_alloc()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_bill_payment_status(OLD.bill_id);
    RETURN OLD;
  ELSE
    PERFORM refresh_bill_payment_status(NEW.bill_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_alloc_refresh_bill ON payment_allocations;
CREATE TRIGGER trg_alloc_refresh_bill
  AFTER INSERT OR UPDATE OR DELETE ON payment_allocations
  FOR EACH ROW EXECUTE FUNCTION trg_refresh_bill_after_alloc();

-- b) Block over-allocation. Sum of allocations against a bill must not
--    exceed total_amount + 1 paisa tolerance.
CREATE OR REPLACE FUNCTION enforce_no_overallocation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_total       NUMERIC;
  v_allocated   NUMERIC;
  v_new_amount  NUMERIC;
BEGIN
  v_new_amount := NEW.amount;
  IF TG_OP = 'UPDATE' THEN
    -- Subtract the row's old amount before re-summing.
    v_new_amount := NEW.amount - OLD.amount;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_allocated
    FROM payment_allocations
   WHERE bill_id = NEW.bill_id;

  -- For UPDATE, v_allocated already contains the new value because the row
  -- has been written; we need to add back the delta to compare correctly.
  IF TG_OP = 'INSERT' THEN
    v_allocated := v_allocated + NEW.amount;
  END IF;

  SELECT total_amount INTO v_total FROM purchase_bills WHERE id = NEW.bill_id;
  IF v_total IS NULL THEN RETURN NEW; END IF;

  IF v_allocated > v_total + 0.01 THEN
    RAISE EXCEPTION
      'Over-allocation blocked: bill total %.2f, attempted total allocation %.2f',
      v_total, v_allocated
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_no_overallocation ON payment_allocations;
CREATE TRIGGER trg_no_overallocation
  BEFORE INSERT OR UPDATE ON payment_allocations
  FOR EACH ROW EXECUTE FUNCTION enforce_no_overallocation();

-- c) Block over-adjustment of vendor advances (sum of adjustments ≤ advance amount).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='advance_adjustments')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='vendor_advances') THEN
    EXECUTE $func$
      CREATE OR REPLACE FUNCTION enforce_no_overadjustment()
      RETURNS TRIGGER LANGUAGE plpgsql AS $body$
      DECLARE
        v_advance_amount NUMERIC;
        v_adjusted       NUMERIC;
        v_advance_id     UUID;
      BEGIN
        v_advance_id := COALESCE(NEW.advance_id, NEW.vendor_advance_id);
        IF v_advance_id IS NULL THEN RETURN NEW; END IF;

        SELECT amount INTO v_advance_amount FROM vendor_advances WHERE id = v_advance_id;
        IF v_advance_amount IS NULL THEN RETURN NEW; END IF;

        SELECT COALESCE(SUM(amount), 0) INTO v_adjusted
          FROM advance_adjustments
         WHERE COALESCE(advance_id, vendor_advance_id) = v_advance_id
           AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

        IF v_adjusted + NEW.amount > v_advance_amount + 0.01 THEN
          RAISE EXCEPTION
            'Advance over-adjustment: advance amount %.2f, attempted total %.2f',
            v_advance_amount, v_adjusted + NEW.amount
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $body$;
    $func$;

    EXECUTE 'DROP TRIGGER IF EXISTS trg_no_overadjustment ON advance_adjustments';
    EXECUTE 'CREATE TRIGGER trg_no_overadjustment
       BEFORE INSERT OR UPDATE ON advance_adjustments
       FOR EACH ROW EXECUTE FUNCTION enforce_no_overadjustment()';
  END IF;
END $$;

-- d) Idempotency on payments. (user_id, bill_id, payment_date, amount,
--    reference_number) — when reference_number is provided, treat it as the
--    natural key so retries don't double-post.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_bill_payment_idempotency
  ON vendor_bill_payments (user_id, bill_id, payment_date, amount, lower(reference_number))
  WHERE reference_number IS NOT NULL AND reference_number <> '';

-- e) Helper view: open AR/AP exposure to vendor (used by the AP dashboard).
DROP VIEW IF EXISTS v_bill_open_balance;
CREATE VIEW v_bill_open_balance AS
SELECT
  pb.user_id,
  pb.id                AS bill_id,
  pb.vendor_id,
  pb.vendor_name,
  pb.bill_number,
  pb.bill_date,
  pb.due_date,
  pb.total_amount,
  pb.paid_amount,
  GREATEST(pb.total_amount - pb.paid_amount, 0) AS open_amount,
  CASE
    WHEN pb.paid_amount >= pb.total_amount - 0.01 THEN 0
    WHEN COALESCE(pb.due_date, CURRENT_DATE) >= CURRENT_DATE THEN
      (pb.due_date - CURRENT_DATE)
    ELSE -(CURRENT_DATE - pb.due_date)
  END AS days_to_due,
  CASE
    WHEN pb.paid_amount >= pb.total_amount - 0.01 THEN 'paid'
    WHEN COALESCE(pb.due_date, CURRENT_DATE) < CURRENT_DATE THEN 'overdue'
    WHEN pb.paid_amount > 0 THEN 'partially_paid'
    ELSE 'open'
  END AS open_status
FROM purchase_bills pb
WHERE COALESCE(lower(pb.status), '') NOT IN ('cancelled', 'void', 'voided');

-- f) Vendor advance available pool (for "auto-adjust on payment" UI).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='vendor_advances') THEN
    EXECUTE 'DROP VIEW IF EXISTS v_vendor_advance_available';
    EXECUTE $sql$
      CREATE VIEW v_vendor_advance_available AS
      SELECT
        va.user_id,
        va.id              AS advance_id,
        va.vendor_id,
        va.vendor_name,
        va.advance_number,
        va.advance_date,
        va.amount          AS advance_amount,
        COALESCE(va.adjusted_amount, 0)  AS adjusted_amount,
        GREATEST(va.amount - COALESCE(va.adjusted_amount, 0), 0) AS available_amount,
        va.status
      FROM vendor_advances va
      WHERE COALESCE(va.status, 'active') NOT IN ('cancelled', 'void', 'closed')
        AND va.amount > COALESCE(va.adjusted_amount, 0)
    $sql$;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMENT ON FUNCTION refresh_bill_payment_status(UUID) IS
  'Recomputes purchase_bills.paid_amount + status from payment_allocations. Trigger fires on every allocation insert/update/delete so the bill is always self-consistent without app-side bookkeeping.';
COMMENT ON FUNCTION enforce_no_overallocation() IS
  'Blocks payment_allocations whose sum would exceed bill.total_amount. Tolerance ±0.01 to absorb rounding noise on rate × tax math.';
