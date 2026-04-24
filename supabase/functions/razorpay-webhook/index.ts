import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Razorpay webhook endpoint. Configure in Razorpay Partner Dashboard → Webhooks
// (partner-level webhook catches events across all linked sub-merchants).
//   URL:    https://<project>.supabase.co/functions/v1/razorpay-webhook
//   Events: payment.captured, order.paid, account.under_review, account.needs_clarification, account.activated, account.suspended
//   Secret: same value as RAZORPAY_WEBHOOK_SECRET env var
//
// Supabase secrets to set:
//   supabase secrets set RAZORPAY_WEBHOOK_SECRET=xxxxxxxx

const RAZORPAY_WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyWebhookSignature(
  rawBody: string,
  signature: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(RAZORPAY_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const hex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return safeEqual(hex, signature);
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const signature = req.headers.get("x-razorpay-signature");
  if (!signature) {
    return new Response("Missing signature header", { status: 400 });
  }

  // IMPORTANT: must verify against the raw body bytes, not the parsed JSON
  const rawBody = await req.text();

  const valid = await verifyWebhookSignature(rawBody, signature);
  if (!valid) {
    console.warn("[Webhook] Invalid signature — rejecting");
    return new Response("Invalid signature", { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  console.log(`[Webhook] Event: ${event.event}`);

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ─ Account lifecycle events (Partner flow) ─
  // Keep payment_settings.razorpay_account_status in sync with Razorpay.
  if (event.event?.startsWith("account.")) {
    const account = event.payload?.account?.entity;
    const accountId = account?.id;
    if (!accountId) {
      return new Response("OK", { status: 200 });
    }
    // Map Razorpay event → our status enum
    const statusMap: Record<string, string> = {
      "account.under_review": "under_review",
      "account.needs_clarification": "needs_clarification",
      "account.activated": "activated",
      "account.suspended": "suspended",
    };
    const newStatus = statusMap[event.event];
    if (newStatus) {
      const { error } = await supabaseAdmin
        .from("payment_settings")
        .update({
          razorpay_account_status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("razorpay_account_id", accountId);
      if (error) {
        console.error(`[Webhook] account status update failed:`, error);
      } else {
        console.log(`[Webhook] ${accountId} → ${newStatus}`);
      }
    }
    return new Response("OK", { status: 200 });
  }

  // ─ Payment events ─
  if (event.event !== "payment.captured" && event.event !== "order.paid") {
    return new Response("OK", { status: 200 });
  }

  const payment = event.payload?.payment?.entity;
  if (!payment) {
    console.warn("[Webhook] No payment entity in event");
    return new Response("OK", { status: 200 });
  }

  const invoiceId: string | undefined = payment.notes?.invoice_id;
  const paymentId: string = payment.id;
  const amountInr = Number(payment.amount) / 100;

  if (!invoiceId) {
    console.warn(`[Webhook] payment ${paymentId} has no invoice_id in notes`);
    return new Response("OK", { status: 200 });
  }

  const supabase = supabaseAdmin;

  const { data: invoice, error: fetchErr } = await supabase
    .from("invoices")
    .select("id, payment_token, status, razorpay_payment_id, total_amount, paid_amount")
    .eq("id", invoiceId)
    .maybeSingle();

  if (fetchErr || !invoice) {
    console.warn(`[Webhook] invoice ${invoiceId} not found`);
    return new Response("OK", { status: 200 }); // ack to stop retries
  }

  // Idempotency — same payment_id already recorded
  if (invoice.razorpay_payment_id === paymentId && invoice.status === "paid") {
    console.log(`[Webhook] ${paymentId} already recorded; skipping`);
    return new Response("OK", { status: 200 });
  }

  if (!invoice.payment_token) {
    console.warn(`[Webhook] invoice ${invoiceId} has no payment_token`);
    return new Response("OK", { status: 200 });
  }

  // Use webhook-reported amount (Razorpay is authoritative) but cap at outstanding
  const outstanding = Number(invoice.total_amount) -
    Number(invoice.paid_amount || 0);
  const amountToRecord = Math.min(amountInr, outstanding);

  const { error: rpcErr } = await supabase.rpc("confirm_invoice_payment", {
    p_invoice_id: invoiceId,
    p_token: invoice.payment_token,
    p_razorpay_payment_id: paymentId,
    p_amount: amountToRecord,
  });

  if (rpcErr) {
    console.error(`[Webhook] confirm_invoice_payment failed:`, rpcErr);
    // Return 500 so Razorpay retries
    return new Response("DB error", { status: 500 });
  }

  console.log(
    `[Webhook] Confirmed ${paymentId} for invoice ${invoiceId} (₹${amountToRecord})`,
  );
  return new Response("OK", { status: 200 });
});
