-- ════════════════════════════════════════════════════════════════════════════
-- Credit terms on purchase_orders
--
-- Adds standard Indian-trade credit-term fields to PO so the buyer-vendor
-- agreement is captured up-front. The bill that gets created against this
-- PO can inherit due_date / early-pay discount / late-pay penalty from
-- here without re-keying.
--
--   credit_terms_label             — preset label ("Net 30", "2/10 Net 30", etc.)
--   credit_days                    — net days (0 = due on receipt)
--   early_payment_discount_pct     — discount % if paid within early window
--   early_payment_discount_days    — early-pay window (days)
--   late_payment_penalty_pct       — penalty % per annum past due date
--
-- All idempotent.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS credit_terms_label          TEXT DEFAULT 'Net 30',
  ADD COLUMN IF NOT EXISTS credit_days                 INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS early_payment_discount_pct  NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS early_payment_discount_days INTEGER     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_payment_penalty_pct    NUMERIC(5,2) DEFAULT 0;

-- Sanity bounds so dashboards don't have to defend against junk data.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name='purchase_orders' AND constraint_name='po_credit_days_chk'
  ) THEN
    ALTER TABLE purchase_orders
      ADD CONSTRAINT po_credit_days_chk
      CHECK (credit_days >= 0 AND credit_days <= 365);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name='purchase_orders' AND constraint_name='po_discount_chk'
  ) THEN
    ALTER TABLE purchase_orders
      ADD CONSTRAINT po_discount_chk
      CHECK (
        (early_payment_discount_pct IS NULL OR early_payment_discount_pct BETWEEN 0 AND 50)
        AND (early_payment_discount_days IS NULL OR early_payment_discount_days BETWEEN 0 AND 90)
        AND (early_payment_discount_pct = 0 OR early_payment_discount_days > 0)
      );
  END IF;
END $$;

-- Auto-fill due_date from order_date + credit_days when caller leaves it blank
-- or stale. Keeps bills inherited from a PO consistent with the agreed terms.
CREATE OR REPLACE FUNCTION sync_po_due_date()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.order_date IS NOT NULL AND NEW.credit_days IS NOT NULL THEN
    -- Recompute when credit_days changed, or when due_date wasn't supplied.
    IF TG_OP = 'INSERT' AND NEW.due_date IS NULL THEN
      NEW.due_date := NEW.order_date + (NEW.credit_days || ' days')::interval;
    ELSIF TG_OP = 'UPDATE'
      AND (OLD.credit_days IS DISTINCT FROM NEW.credit_days
           OR OLD.order_date IS DISTINCT FROM NEW.order_date)
      AND NEW.due_date = OLD.due_date THEN
      NEW.due_date := NEW.order_date + (NEW.credit_days || ' days')::interval;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_po_due_date ON purchase_orders;
CREATE TRIGGER trg_po_due_date
  BEFORE INSERT OR UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION sync_po_due_date();

-- View: PO credit-terms summary for the dashboard.
DROP VIEW IF EXISTS v_po_credit_terms;
CREATE VIEW v_po_credit_terms AS
SELECT
  po.user_id,
  po.id              AS po_id,
  po.order_number,
  po.vendor_id,
  po.vendor_name,
  po.order_date,
  po.due_date,
  po.credit_terms_label,
  po.credit_days,
  po.early_payment_discount_pct,
  po.early_payment_discount_days,
  po.late_payment_penalty_pct,
  po.total_amount,
  CASE
    WHEN po.early_payment_discount_pct > 0 AND po.early_payment_discount_days > 0
      THEN po.total_amount * po.early_payment_discount_pct / 100
    ELSE 0
  END AS potential_early_savings,
  CASE
    WHEN po.due_date < CURRENT_DATE
      THEN po.total_amount * po.late_payment_penalty_pct / 100
           * GREATEST(0, CURRENT_DATE - po.due_date) / 365
    ELSE 0
  END AS accrued_late_penalty
FROM purchase_orders po
WHERE COALESCE(lower(po.status),'') NOT IN ('cancelled','void');

NOTIFY pgrst, 'reload schema';

COMMENT ON COLUMN purchase_orders.credit_terms_label IS
  'Display label for the credit terms (Net 30, 2/10 Net 30, Due on receipt, etc.). credit_days holds the actual net.';
COMMENT ON COLUMN purchase_orders.early_payment_discount_pct IS
  'Discount percent the vendor offers if invoice is paid within early_payment_discount_days. Common Indian trade terms: 2%/10 days net 30.';
