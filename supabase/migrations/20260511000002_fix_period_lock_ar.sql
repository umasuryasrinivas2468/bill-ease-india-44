-- ════════════════════════════════════════════════════════════════════════════
-- Fix: enforce_period_lock_ar() fails with
--   record "new" has no field "invoice_date"
-- when fired on tables other than `invoices`.
--
-- Cause: the original function used a CASE TG_TABLE_NAME expression with
-- explicit NEW.<field> references for every branch. plpgsql resolves *all*
-- field references against the actual row type at runtime, so when the
-- trigger fires on `credit_notes` (NEW is credit_notes rowtype), the
-- reference to NEW.invoice_date errors even though that branch isn't taken.
--
-- Fix: convert NEW/OLD to JSONB once and look the date column up by name.
-- No static field references → no row-type mismatch.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION enforce_period_lock_ar()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_date  DATE;
  v_user  TEXT;
  v_row   JSONB;
  v_field TEXT;
BEGIN
  v_field := CASE TG_TABLE_NAME
    WHEN 'invoices'                     THEN 'invoice_date'
    WHEN 'payment_received'             THEN 'payment_date'
    WHEN 'credit_notes'                 THEN 'credit_note_date'
    WHEN 'customer_advances'            THEN 'advance_date'
    WHEN 'customer_advance_adjustments' THEN 'adjustment_date'
    ELSE NULL
  END;

  IF TG_OP = 'DELETE' THEN
    v_row  := to_jsonb(OLD);
    v_user := OLD.user_id;
  ELSE
    v_row  := to_jsonb(NEW);
    v_user := NEW.user_id;
  END IF;

  IF v_field IS NOT NULL THEN
    v_date := NULLIF(v_row ->> v_field, '')::date;
  END IF;

  IF v_date IS NOT NULL AND is_period_locked(v_user, v_date) THEN
    RAISE EXCEPTION 'Cannot modify % — accounting period covering % is locked.', TG_TABLE_NAME, v_date
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
