import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ═══════════════════════════════════════════════════════════════════
// create-razorpay-order (Partner OAuth flow)
// - Loads the vendor's OAuth access_token from payment_settings
// - Refreshes the token if expired (using refresh_token)
// - Creates a Razorpay Order on behalf of the vendor via Bearer auth
// - Returns order_id + public_token (frontend uses public_token as Checkout key)
//
// Required Supabase secrets:
//   RAZORPAY_PARTNER_CLIENT_ID
//   RAZORPAY_PARTNER_CLIENT_SECRET
//   RAZORPAY_MODE ("test" or "live")
// ═══════════════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const RAZORPAY_PARTNER_CLIENT_ID = Deno.env.get("RAZORPAY_PARTNER_CLIENT_ID")!;
const RAZORPAY_PARTNER_CLIENT_SECRET = Deno.env.get(
  "RAZORPAY_PARTNER_CLIENT_SECRET",
)!;
const RAZORPAY_MODE = Deno.env.get("RAZORPAY_MODE") || "live";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function jsonResp(body: Record<string, any>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Refresh the vendor's access token via the partner client creds.
// Returns the new tokens so callers can use them immediately AND persist them.
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
    throw new Error(
      data.error_description || data.error || "Token refresh failed",
    );
  }
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { invoice_id, token, amount } = await req.json();

    if (!invoice_id || !token || !amount) {
      return jsonResp(
        { error: "invoice_id, token, and amount are required" },
        400,
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ─ Load invoice + its vendor's payment settings ─
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("id, user_id, payment_token, total_amount, status")
      .eq("id", invoice_id)
      .eq("payment_token", token)
      .single();

    if (invErr || !invoice) {
      return jsonResp({ error: "Invalid invoice or token" }, 404);
    }

    if (invoice.status === "paid") {
      return jsonResp({ error: "Invoice is already paid" }, 400);
    }

    const { data: settings, error: settingsErr } = await supabase
      .from("payment_settings")
      .select(
        "razorpay_account_id, razorpay_access_token, razorpay_refresh_token, razorpay_public_token, razorpay_token_expires_at",
      )
      .eq("user_id", invoice.user_id)
      .maybeSingle();

    if (settingsErr || !settings?.razorpay_access_token) {
      return jsonResp(
        {
          error:
            "Vendor has not activated online payments yet. Please contact them.",
        },
        400,
      );
    }

    // ─ Refresh token if it's expired (or expires in the next 5 min) ─
    let accessToken = settings.razorpay_access_token;
    let publicToken = settings.razorpay_public_token;
    const expiresAt = settings.razorpay_token_expires_at
      ? new Date(settings.razorpay_token_expires_at)
      : null;
    const tokenStale = !expiresAt ||
      expiresAt.getTime() - Date.now() < 5 * 60 * 1000;

    if (tokenStale && settings.razorpay_refresh_token) {
      try {
        const refreshed = await refreshVendorToken(
          settings.razorpay_refresh_token,
        );
        accessToken = refreshed.access_token;
        publicToken = refreshed.public_token || publicToken;

        const newExpiresAt = refreshed.expires_in
          ? new Date(Date.now() + Number(refreshed.expires_in) * 1000)
            .toISOString()
          : null;

        await supabase
          .from("payment_settings")
          .update({
            razorpay_access_token: refreshed.access_token,
            razorpay_refresh_token: refreshed.refresh_token ||
              settings.razorpay_refresh_token,
            razorpay_public_token: publicToken,
            razorpay_token_expires_at: newExpiresAt,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", invoice.user_id);

        console.log(
          `[RazorpayOrder] Refreshed token for user ${invoice.user_id}`,
        );
      } catch (err: any) {
        console.error("[RazorpayOrder] Token refresh failed:", err);
        return jsonResp(
          {
            error:
              "Vendor's payment authorization has expired. They need to re-activate online payments.",
          },
          400,
        );
      }
    }

    // ─ Create Razorpay Order with vendor's Bearer token ─
    const amountPaise = Math.round(Number(amount) * 100);
    const orderPayload = {
      amount: amountPaise,
      currency: "INR",
      notes: {
        invoice_id,
        source: "aczen_bilz",
      },
    };

    const rzpResp = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderPayload),
    });

    const rzpData = await rzpResp.json();
    if (!rzpResp.ok) {
      console.error(
        `[RazorpayOrder] API error (${rzpResp.status}):`,
        rzpData,
      );

      // 401/403 with scope/auth errors usually mean the vendor's token was
      // issued with insufficient scope (e.g. read_only) or has been revoked.
      // Surface a specific "reconnect" message so the vendor knows what to do.
      const code = rzpData.error?.code || "";
      const desc = (rzpData.error?.description || "").toLowerCase();
      const scopeIssue =
        rzpResp.status === 401 ||
        rzpResp.status === 403 ||
        code === "BAD_REQUEST_ERROR" && /scope|unauthor|insufficient|access/.test(desc);

      if (scopeIssue) {
        return jsonResp(
          {
            error:
              "The vendor's payment authorization is missing the right permissions (read_write). Please ask them to disconnect and reconnect online payments in Settings → Payments.",
            needs_reconnect: true,
          },
          400,
        );
      }

      return jsonResp(
        {
          error: rzpData.error?.description || "Razorpay order creation failed",
        },
        400,
      );
    }

    console.log(
      `[RazorpayOrder] Created order ${rzpData.id} for ₹${amount} (vendor ${invoice.user_id})`,
    );

    return jsonResp({
      order_id: rzpData.id,
      amount: rzpData.amount,
      currency: rzpData.currency,
      public_token: publicToken, // frontend uses this as Checkout key
    });
  } catch (err: any) {
    console.error("[RazorpayOrder] Unhandled:", err);
    return jsonResp({ error: err.message || "Internal error" }, 500);
  }
});
