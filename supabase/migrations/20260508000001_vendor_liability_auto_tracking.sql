-- ============================================================================
-- Vendor Liability Auto-Tracking
-- Line-item-level vendor liability ledger driven by invoice→PO matching.
-- Flow: PO created → invoice uploaded via expense-ocr → matched to PO →
-- vendor_liabilities rows created for invoiced products only. Partial
-- deliveries keep the PO open for the remaining quantity.
-- ============================================================================

-- ── 1. Extend expenses with PO link + match status ─────────────────────────
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS po_id UUID
  REFERENCES purchase_orders(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS po_number TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS po_match_status TEXT
  DEFAULT 'unlinked'
  CHECK (po_match_status IN ('unlinked', 'matched', 'partial', 'conflict'));
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS po_match_confidence TEXT
  CHECK (po_match_confidence IN ('high', 'medium', 'low'));

CREATE INDEX IF NOT EXISTS idx_expenses_po_id ON expenses(po_id);

-- ── 2. Per-line PO fulfillment tracking ────────────────────────────────────
-- purchase_orders.items is JSONB; track invoiced quantities in a parallel
-- JSONB keyed by item index. Shape:
--   [{ "item_index": 0, "ordered_qty": 10, "invoiced_qty": 7, "status": "partial" }, ...]
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS line_fulfillment JSONB
  DEFAULT '[]'::jsonb;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS fulfillment_status TEXT
  DEFAULT 'open'
  CHECK (fulfillment_status IN ('open', 'partial', 'fulfilled', 'short_closed'));

-- Opt-in flag: when TRUE (the new default), the legacy
-- create_payable_from_purchase_order trigger skips this PO so liability is
-- created from the matched invoice instead of the PO confirmation.
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS auto_liability_via_invoice BOOLEAN
  DEFAULT TRUE;

-- ── 3. Vendor liabilities ledger (line-item granularity) ───────────────────
CREATE TABLE IF NOT EXISTS vendor_liabilities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  vendor_name TEXT NOT NULL,
  expense_id UUID REFERENCES expenses(id) ON DELETE CASCADE,
  bill_number TEXT,
  po_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  po_number TEXT,
  po_line_index INTEGER,
  product_description TEXT,
  quantity NUMERIC(14,4) DEFAULT 0,
  unit_price NUMERIC(14,4) DEFAULT 0,
  amount NUMERIC(14,2) NOT NULL,
  tax_amount NUMERIC(14,2) DEFAULT 0,
  total_amount NUMERIC(14,2) NOT NULL,
  paid_amount NUMERIC(14,2) DEFAULT 0,
  outstanding_amount NUMERIC(14,2) GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'partial', 'paid', 'void')),
  source TEXT DEFAULT 'invoice_match'
    CHECK (source IN ('invoice_match', 'direct_invoice', 'manual')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX IF NOT EXISTS idx_vendor_liabilities_user_vendor ON vendor_liabilities(user_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_liabilities_po          ON vendor_liabilities(po_id);
CREATE INDEX IF NOT EXISTS idx_vendor_liabilities_expense     ON vendor_liabilities(expense_id);
CREATE INDEX IF NOT EXISTS idx_vendor_liabilities_status      ON vendor_liabilities(user_id, status);
CREATE INDEX IF NOT EXISTS idx_vendor_liabilities_due_date    ON vendor_liabilities(user_id, due_date);

ALTER TABLE vendor_liabilities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vendor_liabilities_owner" ON vendor_liabilities;
CREATE POLICY "vendor_liabilities_owner" ON vendor_liabilities FOR ALL USING (
  user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
);

DROP TRIGGER IF EXISTS trg_vendor_liabilities_updated ON vendor_liabilities;
CREATE TRIGGER trg_vendor_liabilities_updated
  BEFORE UPDATE ON vendor_liabilities
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ── 4. Recompute PO line fulfillment when a liability changes ──────────────
CREATE OR REPLACE FUNCTION refresh_po_fulfillment(p_po_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_items JSONB;
  v_fulfillment JSONB := '[]'::jsonb;
  v_item JSONB;
  v_idx INT;
  v_ordered NUMERIC;
  v_invoiced NUMERIC;
  v_line_status TEXT;
  v_overall TEXT := 'open';
  v_all_fulfilled BOOLEAN := TRUE;
  v_any_invoiced BOOLEAN := FALSE;
  v_line_count INT;
BEGIN
  IF p_po_id IS NULL THEN RETURN; END IF;
  SELECT items INTO v_items FROM purchase_orders WHERE id = p_po_id;
  IF v_items IS NULL THEN RETURN; END IF;

  v_line_count := jsonb_array_length(v_items);
  IF v_line_count = 0 THEN
    UPDATE purchase_orders
      SET line_fulfillment = '[]'::jsonb,
          fulfillment_status = 'open',
          updated_at = TIMEZONE('utc', NOW())
      WHERE id = p_po_id;
    RETURN;
  END IF;

  FOR v_idx IN 0 .. (v_line_count - 1) LOOP
    v_item := v_items -> v_idx;
    v_ordered := COALESCE((v_item ->> 'quantity')::numeric, 0);
    SELECT COALESCE(SUM(quantity), 0) INTO v_invoiced
      FROM vendor_liabilities
      WHERE po_id = p_po_id AND po_line_index = v_idx AND status <> 'void';

    IF v_ordered > 0 AND v_invoiced >= v_ordered THEN
      v_line_status := 'fulfilled';
    ELSIF v_invoiced > 0 THEN
      v_line_status := 'partial';
      v_all_fulfilled := FALSE;
    ELSE
      v_line_status := 'open';
      v_all_fulfilled := FALSE;
    END IF;
    IF v_invoiced > 0 THEN v_any_invoiced := TRUE; END IF;

    v_fulfillment := v_fulfillment || jsonb_build_object(
      'item_index',  v_idx,
      'ordered_qty', v_ordered,
      'invoiced_qty', v_invoiced,
      'status',      v_line_status
    );
  END LOOP;

  IF v_all_fulfilled THEN
    v_overall := 'fulfilled';
  ELSIF v_any_invoiced THEN
    v_overall := 'partial';
  END IF;

  UPDATE purchase_orders
    SET line_fulfillment = v_fulfillment,
        fulfillment_status = v_overall,
        updated_at = TIMEZONE('utc', NOW())
  WHERE id = p_po_id;
END $$;

CREATE OR REPLACE FUNCTION trg_refresh_po_fulfillment()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_po_fulfillment(OLD.po_id);
    RETURN OLD;
  END IF;
  PERFORM refresh_po_fulfillment(NEW.po_id);
  IF TG_OP = 'UPDATE' AND OLD.po_id IS DISTINCT FROM NEW.po_id THEN
    PERFORM refresh_po_fulfillment(OLD.po_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vendor_liab_po_fulfill ON vendor_liabilities;
CREATE TRIGGER trg_vendor_liab_po_fulfill
  AFTER INSERT OR UPDATE OR DELETE ON vendor_liabilities
  FOR EACH ROW EXECUTE FUNCTION trg_refresh_po_fulfillment();

-- ── 5. Gate the legacy auto-payable-on-PO-confirm trigger ──────────────────
-- Old behavior: confirming a PO created a payable for the FULL amount,
-- double-counting against the invoice-driven liability. POs that opt in
-- (auto_liability_via_invoice = TRUE, the new default) are skipped.
CREATE OR REPLACE FUNCTION create_payable_from_purchase_order()
RETURNS TRIGGER AS $$
BEGIN
  IF COALESCE(NEW.auto_liability_via_invoice, TRUE) THEN
    RETURN NEW;
  END IF;
  IF NEW.status = 'confirmed' AND NEW.payment_status != 'paid' THEN
    IF NOT EXISTS (SELECT 1 FROM payables WHERE related_purchase_order_id = NEW.id) THEN
      INSERT INTO payables (
        user_id, vendor_name, vendor_email, vendor_phone,
        related_purchase_order_id, related_purchase_order_number,
        amount_due, amount_remaining, due_date, status
      ) VALUES (
        NEW.user_id, NEW.vendor_name, NEW.vendor_email, NEW.vendor_phone,
        NEW.id, NEW.order_number,
        NEW.total_amount, NEW.total_amount, NEW.due_date,
        CASE WHEN NEW.due_date < CURRENT_DATE THEN 'overdue' ELSE 'pending' END
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 6. Vendor liability summary view ───────────────────────────────────────
DROP VIEW IF EXISTS v_vendor_liability_summary;
CREATE VIEW v_vendor_liability_summary AS
WITH liab AS (
  SELECT
    user_id, vendor_id, vendor_name,
    COUNT(*) FILTER (WHERE status <> 'void')                                AS liability_count,
    COALESCE(SUM(total_amount)        FILTER (WHERE status <> 'void'), 0)   AS total_invoiced,
    COALESCE(SUM(paid_amount)         FILTER (WHERE status <> 'void'), 0)   AS total_paid,
    COALESCE(SUM(outstanding_amount)  FILTER (WHERE status <> 'void'), 0)   AS total_outstanding,
    COALESCE(SUM(outstanding_amount)
             FILTER (WHERE status <> 'void' AND due_date < CURRENT_DATE), 0) AS overdue_outstanding
  FROM vendor_liabilities
  GROUP BY user_id, vendor_id, vendor_name
),
po_open AS (
  SELECT
    po.user_id, po.vendor_id, po.vendor_name,
    SUM(GREATEST(
      COALESCE(po.total_amount, 0)
        - COALESCE((SELECT SUM(vl.total_amount) FROM vendor_liabilities vl
                    WHERE vl.po_id = po.id AND vl.status <> 'void'), 0),
      0
    )) AS committed_open
  FROM purchase_orders po
  WHERE po.status NOT IN ('cancelled')
    AND COALESCE(po.fulfillment_status, 'open') <> 'fulfilled'
  GROUP BY po.user_id, po.vendor_id, po.vendor_name
),
vendor_universe AS (
  SELECT user_id, vendor_id, vendor_name FROM liab
  UNION
  SELECT user_id, vendor_id, vendor_name FROM po_open
)
SELECT
  v.user_id,
  v.vendor_id,
  v.vendor_name,
  COALESCE(l.liability_count, 0)     AS liability_count,
  COALESCE(l.total_invoiced, 0)      AS total_invoiced,
  COALESCE(l.total_paid, 0)          AS total_paid,
  COALESCE(l.total_outstanding, 0)   AS total_outstanding,
  COALESCE(l.overdue_outstanding, 0) AS overdue_outstanding,
  COALESCE(p.committed_open, 0)      AS committed_open,
  COALESCE(l.total_outstanding, 0) + COALESCE(p.committed_open, 0) AS net_liability
FROM vendor_universe v
LEFT JOIN liab    l ON l.user_id = v.user_id AND l.vendor_id IS NOT DISTINCT FROM v.vendor_id
LEFT JOIN po_open p ON p.user_id = v.user_id AND p.vendor_id IS NOT DISTINCT FROM v.vendor_id;

-- ── 7. RPC: apply payment to vendor_liabilities (FIFO by due_date) ─────────
CREATE OR REPLACE FUNCTION apply_payment_to_liabilities(
  p_user_id   TEXT,
  p_vendor_id UUID,
  p_amount    NUMERIC,
  p_payment_id UUID DEFAULT NULL
) RETURNS NUMERIC LANGUAGE plpgsql AS $$
DECLARE
  v_remaining NUMERIC := p_amount;
  v_row RECORD;
  v_apply NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN 0; END IF;

  FOR v_row IN
    SELECT id, outstanding_amount, total_amount, paid_amount
    FROM vendor_liabilities
    WHERE user_id = p_user_id
      AND vendor_id = p_vendor_id
      AND status IN ('open', 'partial')
      AND outstanding_amount > 0
    ORDER BY COALESCE(due_date, created_at::date) ASC, created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_apply := LEAST(v_remaining, v_row.outstanding_amount);
    UPDATE vendor_liabilities
      SET paid_amount = v_row.paid_amount + v_apply,
          status = CASE
            WHEN v_row.paid_amount + v_apply >= v_row.total_amount THEN 'paid'
            ELSE 'partial'
          END,
          updated_at = TIMEZONE('utc', NOW())
      WHERE id = v_row.id;
    v_remaining := v_remaining - v_apply;
  END LOOP;

  RETURN p_amount - v_remaining;
END $$;

-- ============================================================================
-- End vendor_liability_auto_tracking migration
-- ============================================================================
