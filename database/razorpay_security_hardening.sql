-- ============================================================
-- Razorpay Security Hardening
-- Run AFTER razorpay_payment_setup.sql and razorpay_vendor_onboarding.sql
-- ============================================================
--
-- Purpose:
--   Before this migration, confirm_invoice_payment was executable by the
--   `anon` role so PayLink.tsx could call it directly after Razorpay
--   Checkout returned. That meant anyone with a valid invoice+token could
--   mark an invoice paid with a fabricated razorpay_payment_id — we were
--   never verifying the Razorpay signature.
--
--   Now the verify-razorpay-payment Edge Function verifies the HMAC-SHA256
--   signature BEFORE calling confirm_invoice_payment, and it uses the
--   service-role key which bypasses these grants anyway. Revoking anon
--   closes the direct-RPC bypass.

REVOKE EXECUTE ON FUNCTION confirm_invoice_payment(UUID, TEXT, TEXT, NUMERIC) FROM anon;

-- get_invoice_for_payment remains anon-executable — it's read-only and
-- needed by the public /pay page to render the invoice summary.
