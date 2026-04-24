import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// For Razorpay Tech Partner (OAuth) flow, signatures are HMAC'd with the
// partner client_secret, per Razorpay's Partner verifyPaymentSignature docs.
const RAZORPAY_PARTNER_CLIENT_SECRET = Deno.env.get(
  "RAZORPAY_PARTNER_CLIENT_SECRET",
)!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Constant-time string compare to avoid timing-attack leakage
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(RAZORPAY_PARTNER_CLIENT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${orderId}|${paymentId}`),
  );
  const hex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return safeEqual(hex, signature);
}

function jsonResp(body: Record<string, any>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      invoice_id,
      token,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = await req.json();

    if (
      !invoice_id ||
      !token ||
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return jsonResp(
        { success: false, error: "Missing required fields" },
        400,
      );
    }

    const valid = await verifyPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    );
    if (!valid) {
      console.warn(
        `[VerifyPayment] Invalid signature for payment ${razorpay_payment_id}`,
      );
      return jsonResp(
        { success: false, error: "Invalid payment signature" },
        400,
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Re-read invoice to compute the authoritative outstanding amount
    // (never trust client for money)
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("id, total_amount, paid_amount, status, payment_token")
      .eq("id", invoice_id)
      .eq("payment_token", token)
      .single();

    if (invErr || !invoice) {
      return jsonResp(
        { success: false, error: "Invalid invoice or token" },
        404,
      );
    }

    const outstanding = Number(invoice.total_amount) -
      Number(invoice.paid_amount || 0);

    const { data, error } = await supabase.rpc("confirm_invoice_payment", {
      p_invoice_id: invoice_id,
      p_token: token,
      p_razorpay_payment_id: razorpay_payment_id,
      p_amount: outstanding,
    });

    if (error) {
      console.error("[VerifyPayment] DB error:", error);
      return jsonResp({ success: false, error: error.message }, 500);
    }

    console.log(
      `[VerifyPayment] Confirmed ${razorpay_payment_id} for invoice ${invoice_id} (₹${outstanding})`,
    );
    return jsonResp({ success: true, ...data });
  } catch (err: any) {
    console.error("[VerifyPayment] Unhandled error:", err);
    return jsonResp(
      { success: false, error: err.message || "Internal server error" },
      500,
    );
  }
});
