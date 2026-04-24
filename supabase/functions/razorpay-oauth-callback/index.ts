import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ═══════════════════════════════════════════════════════════════════
// razorpay-oauth-callback
// Called by the frontend /razorpay-callback page with { code, state }.
// Verifies state (CSRF), exchanges code → tokens, upserts payment_settings.
//
// Required Supabase secrets:
//   RAZORPAY_PARTNER_CLIENT_ID
//   RAZORPAY_PARTNER_CLIENT_SECRET
//   APP_URL            — same value used in authorize function
//   RAZORPAY_MODE      — "test" or "live"
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
const APP_URL = Deno.env.get("APP_URL") || "https://app.aczen.in";
const RAZORPAY_MODE = Deno.env.get("RAZORPAY_MODE") || "live";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
    const { code, state } = await req.json();
    if (!code || !state) {
      return jsonResp({ error: "code and state are required" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ─ Verify CSRF state (single-use) ─
    const { data: stateRow, error: stateErr } = await supabase
      .from("razorpay_oauth_states")
      .select("user_id, expires_at")
      .eq("state", state)
      .maybeSingle();

    if (stateErr || !stateRow) {
      console.warn(`[OAuthCallback] Unknown/expired state`);
      return jsonResp({ error: "Invalid or expired onboarding session" }, 400);
    }

    if (new Date(stateRow.expires_at) < new Date()) {
      await supabase.from("razorpay_oauth_states").delete().eq("state", state);
      return jsonResp({ error: "Onboarding session expired. Please try again." }, 400);
    }

    const userId: string = stateRow.user_id;

    // Consume the state token — one-time use
    await supabase.from("razorpay_oauth_states").delete().eq("state", state);

    // ─ Exchange code for tokens ─
    const redirectUri = `${APP_URL}/razorpay-callback`;
    const tokenResp = await fetch("https://auth.razorpay.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: RAZORPAY_PARTNER_CLIENT_ID,
        client_secret: RAZORPAY_PARTNER_CLIENT_SECRET,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
        mode: RAZORPAY_MODE,
      }),
    });

    const tokenData = await tokenResp.json();

    if (!tokenResp.ok) {
      console.error("[OAuthCallback] Token exchange failed:", JSON.stringify(tokenData));
      const rzError = tokenData.error_description ||
        (typeof tokenData.error === "string"
          ? tokenData.error
          : tokenData.error?.description || tokenData.error?.code) ||
        `Razorpay token exchange returned ${tokenResp.status}`;
      return jsonResp(
        {
          error: String(rzError),
          razorpay_raw: tokenData,
          status: tokenResp.status,
        },
        400,
      );
    }

    const {
      access_token,
      refresh_token,
      public_token,
      razorpay_account_id,
      expires_in, // seconds
    } = tokenData;

    if (!access_token || !razorpay_account_id) {
      console.error("[OAuthCallback] Malformed token response:", tokenData);
      return jsonResp({ error: "Malformed response from Razorpay" }, 500);
    }

    const expiresAt = expires_in
      ? new Date(Date.now() + Number(expires_in) * 1000).toISOString()
      : null;

    // ─ Save to payment_settings ─
    const { error: upsertErr } = await supabase
      .from("payment_settings")
      .upsert(
        {
          user_id: userId,
          razorpay_account_id,
          razorpay_access_token: access_token,
          razorpay_refresh_token: refresh_token,
          razorpay_public_token: public_token,
          razorpay_token_expires_at: expiresAt,
          razorpay_account_status: "activated", // OAuth success implies activation
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (upsertErr) {
      console.error("[OAuthCallback] DB upsert error:", upsertErr);
      return jsonResp({ error: "Failed to save payment settings" }, 500);
    }

    console.log(
      `[OAuthCallback] User ${userId} linked to Razorpay account ${razorpay_account_id}`,
    );

    return jsonResp({
      success: true,
      razorpay_account_id,
      status: "activated",
    });
  } catch (err: any) {
    console.error("[OAuthCallback] Unhandled:", err);
    return jsonResp({ error: err.message || "Internal error" }, 500);
  }
});
