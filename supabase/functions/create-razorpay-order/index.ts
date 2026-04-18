import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Secrets set via: supabase secrets set RAZORPAY_KEY_ID=rzp_live_xxx RAZORPAY_KEY_SECRET=xxx
const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID")!;
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { invoice_id, token, amount } = await req.json();

    if (!invoice_id || !token || !amount) {
      return new Response(
        JSON.stringify({ error: "invoice_id, token, and amount are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role to bypass RLS and read the invoice
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: invoice, error: dbError } = await supabase
      .from("invoices")
      .select("id, payment_token, razorpay_route_account_id, total_amount, status")
      .eq("id", invoice_id)
      .eq("payment_token", token)
      .single();

    if (dbError || !invoice) {
      return new Response(
        JSON.stringify({ error: "Invalid invoice or token" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (invoice.status === "paid") {
      return new Response(
        JSON.stringify({ error: "Invoice is already paid" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build Razorpay Order payload
    const amountPaise = Math.round(Number(amount) * 100);

    const orderPayload: Record<string, any> = {
      amount: amountPaise,
      currency: "INR",
      notes: {
        invoice_id,
        source: "aczen_bilz",
      },
    };

    // Razorpay Route: transfer money directly to vendor's linked account
    if (invoice.razorpay_route_account_id) {
      orderPayload.transfers = [
        {
          account: invoice.razorpay_route_account_id,
          amount: amountPaise,
          currency: "INR",
          on_hold: 0,
        },
      ];
      console.log(
        `[RazorpayOrder] Route transfer → ${invoice.razorpay_route_account_id} for ₹${amount}`
      );
    }

    // Create Razorpay Order via API
    const auth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);

    const rzpResp = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderPayload),
    });

    const rzpData = await rzpResp.json();

    if (!rzpResp.ok) {
      console.error("[RazorpayOrder] API error:", rzpData);
      return new Response(
        JSON.stringify({
          error: rzpData.error?.description || "Razorpay order creation failed",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[RazorpayOrder] Created order ${rzpData.id} for ₹${amount}`);

    return new Response(
      JSON.stringify({
        order_id: rzpData.id,
        amount: rzpData.amount,
        currency: rzpData.currency,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[RazorpayOrder] Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
