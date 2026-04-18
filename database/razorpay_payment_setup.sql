-- ============================================================
-- Razorpay Payment Integration Setup
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. Add payment columns to invoices table
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_token TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT;

-- 1b. Store each vendor's Razorpay Route linked-account ID
--     (the acc_XXXX from Razorpay Route → Linked Accounts)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS razorpay_route_account_id TEXT;

-- 2. Index for fast token lookups on the public payment page
CREATE INDEX IF NOT EXISTS idx_invoices_payment_token ON invoices (payment_token) WHERE payment_token IS NOT NULL;

-- 3. RPC: Fetch invoice for public payment page (no auth required)
--    SECURITY DEFINER bypasses RLS so the anon role can read the invoice
CREATE OR REPLACE FUNCTION get_invoice_for_payment(p_invoice_id UUID, p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'id', id,
    'invoice_number', invoice_number,
    'client_name', client_name,
    'client_email', client_email,
    'amount', amount,
    'gst_amount', gst_amount,
    'total_amount', total_amount,
    'paid_amount', COALESCE(paid_amount, 0),
    'status', status,
    'invoice_date', invoice_date,
    'due_date', due_date,
    'items', items,
    'gst_rate', COALESCE(gst_rate, 18),
    'notes', notes
  ) INTO result
  FROM invoices
  WHERE id = p_invoice_id
    AND payment_token = p_token;

  IF result IS NULL THEN
    RETURN json_build_object('error', 'Invoice not found or invalid link');
  END IF;

  RETURN result;
END;
$$;

-- 4. RPC: Confirm payment after Razorpay success callback
CREATE OR REPLACE FUNCTION confirm_invoice_payment(
  p_invoice_id UUID,
  p_token TEXT,
  p_razorpay_payment_id TEXT,
  p_amount NUMERIC
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
  new_paid NUMERIC;
  new_status TEXT;
BEGIN
  -- Verify invoice exists and token matches
  SELECT * INTO inv
  FROM invoices
  WHERE id = p_invoice_id
    AND payment_token = p_token;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invalid invoice or token');
  END IF;

  IF inv.status = 'paid' THEN
    RETURN json_build_object('success', false, 'error', 'Invoice is already paid');
  END IF;

  -- Prevent duplicate Razorpay payment IDs
  IF inv.razorpay_payment_id IS NOT NULL AND inv.razorpay_payment_id = p_razorpay_payment_id THEN
    RETURN json_build_object('success', false, 'error', 'Payment already recorded');
  END IF;

  -- Calculate new totals
  new_paid := COALESCE(inv.paid_amount, 0) + p_amount;
  new_status := CASE
    WHEN new_paid >= inv.total_amount THEN 'paid'
    ELSE 'partial'
  END;

  -- Update invoice
  UPDATE invoices
  SET paid_amount          = new_paid,
      status               = new_status,
      razorpay_payment_id  = p_razorpay_payment_id,
      updated_at           = NOW()
  WHERE id = p_invoice_id
    AND payment_token = p_token;

  RETURN json_build_object(
    'success', true,
    'new_status', new_status,
    'paid_amount', new_paid,
    'razorpay_payment_id', p_razorpay_payment_id
  );
END;
$$;

-- 5. Grant execute to the anon (public) role so unauthenticated visitors can pay
GRANT EXECUTE ON FUNCTION get_invoice_for_payment(UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION confirm_invoice_payment(UUID, TEXT, TEXT, NUMERIC) TO anon;
