import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ═══════════════════════════════════════════════════════════════════
// check-payment-link-status
// - Queries Razorpay for current status of a payment link
// - Returns paid/unpaid/expired/cancelled
// ═══════════════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RAZORPAY_PARTNER_CLIENT_ID = Deno.env.get("RAZORPAY_PARTNER_CLIENT_ID")!;
const RAZORPAY_PARTNER_CLIENT_SECRET = Deno.env.get("RAZORPAY_PARTNER_CLIENT_SECRET")!;
const RAZORPAY_MODE = Deno.env.get("RAZORPAY_MODE") || "live";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function jsonResp(body: Record<string, any>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function refreshVendorToken(refreshToken: string) {
  const resp = await fetch("https://auth.razorpay.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: RAZORPAY_PARTNER_CLIENT_ID,
      client_secret: RAZORPAY_PARTNER_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      mode: RAZORPAY_MODE,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error_description || data.error || "Token refresh failed");
  }
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { userId, paymentLinkIds } = await req.json();

    if (!userId || !Array.isArray(paymentLinkIds) || paymentLinkIds.length === 0) {
      return jsonResp({ error: "userId and paymentLinkIds[] are required" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: settings } = await supabase
      .from("payment_settings")
      .select("razorpay_access_token, razorpay_refresh_token, razorpay_token_expires_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (!settings?.razorpay_access_token) {
      return jsonResp({ error: "Razorpay not connected" }, 400);
    }

    let accessToken = settings.razorpay_access_token;
    const expiresAt = settings.razorpay_token_expires_at
      ? new Date(settings.razorpay_token_expires_at)
      : null;
    const tokenStale = !expiresAt || expiresAt.getTime() - Date.now() < 5 * 60 * 1000;

    if (tokenStale && settings.razorpay_refresh_token) {
      try {
        const refreshed = await refreshVendorToken(settings.razorpay_refresh_token);
        accessToken = refreshed.access_token;
        const newExpiresAt = refreshed.expires_in
          ? new Date(Date.now() + Number(refreshed.expires_in) * 1000).toISOString()
          : null;
        await supabase
          .from("payment_settings")
          .update({
            razorpay_access_token: refreshed.access_token,
            razorpay_refresh_token: refreshed.refresh_token || settings.razorpay_refresh_token,
            razorpay_token_expires_at: newExpiresAt,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);
      } catch (err) {
        console.error("[CheckPaymentLink] token refresh failed:", err);
      }
    }

    const results: Record<string, any> = {};
    await Promise.all(
      paymentLinkIds.map(async (id: string) => {
        try {
          const r = await fetch(`https://api.razorpay.com/v1/payment_links/${id}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const d = await r.json();
          if (!r.ok) {
            results[id] = { status: "unknown", error: d.error?.description || "fetch failed" };
            return;
          }
          // Razorpay statuses: created, partially_paid, expired, cancelled, paid
          results[id] = {
            status: d.status,
            amount_paid: typeof d.amount_paid === "number" ? d.amount_paid / 100 : 0,
            amount: typeof d.amount === "number" ? d.amount / 100 : 0,
            short_url: d.short_url,
          };
          
          // Update the payment_links table
          if (d.status) {
            await supabase
              .from("payment_links")
              .update({
                status: d.status,
                amount_paid: typeof d.amount_paid === "number" ? d.amount_paid / 100 : 0,
                updated_at: new Date().toISOString(),
              })
              .eq("razorpay_link_id", id);
          }
        } catch (e: any) {
          results[id] = { status: "unknown", error: e.message };
        }
      })
    );

    return jsonResp({ success: true, results });
  } catch (err: any) {
    console.error("[CheckPaymentLink] error:", err);
    return jsonResp({ error: err.message || "Internal error" }, 500);
  }
});
