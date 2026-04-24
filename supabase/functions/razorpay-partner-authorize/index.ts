import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ═══════════════════════════════════════════════════════════════════
// razorpay-partner-authorize
// Generates the Razorpay OAuth authorize URL for sub-merchant onboarding.
// Stores a CSRF state token, redirects user to Razorpay hosted form.
//
// Required Supabase secrets:
//   RAZORPAY_PARTNER_CLIENT_ID
//   APP_URL           — e.g. https://aczenbilz.com  (used for redirect_uri)
//   RAZORPAY_MODE     — "test" or "live"            (defaults to "live")
// ═══════════════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const RAZORPAY_PARTNER_CLIENT_ID = Deno.env.get("RAZORPAY_PARTNER_CLIENT_ID")!;
const APP_URL = Deno.env.get("APP_URL") || "https://aczenbilz.com";
const RAZORPAY_MODE = Deno.env.get("RAZORPAY_MODE") || "live";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function jsonResp(body: Record<string, any>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// URL-safe random token via crypto.getRandomValues → base64url
function randomState(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { user_id } = await req.json();
    if (!user_id) {
      return jsonResp({ error: "user_id is required" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Block re-onboarding if already linked
    const { data: existing } = await supabase
      .from("payment_settings")
      .select("razorpay_account_id, razorpay_access_token")
      .eq("user_id", user_id)
      .maybeSingle();

    if (existing?.razorpay_access_token && existing?.razorpay_account_id) {
      return jsonResp({
        error: "Razorpay account already linked. Disconnect first to re-onboard.",
        already_linked: true,
      }, 409);
    }

    // Best-effort clean-up of old states (keeps the table from growing)
    await supabase.rpc("cleanup_expired_oauth_states");

    // Save a fresh CSRF state keyed to this user
    const state = randomState();
    const { error: stateErr } = await supabase
      .from("razorpay_oauth_states")
      .insert({ state, user_id });

    if (stateErr) {
      console.error("[PartnerAuthorize] state insert error:", stateErr);
      return jsonResp({ error: "Failed to prepare onboarding" }, 500);
    }

    // Build authorize URL — redirect_uri MUST match the whitelisted value in
    // Razorpay Partner Dashboard → Applications → your app (exact string match).
    const redirectUri = `${APP_URL.replace(/\/+$/, "")}/razorpay-callback`;
    const authorizeUrl = new URL("https://auth.razorpay.com/authorize");
    authorizeUrl.searchParams.set("client_id", RAZORPAY_PARTNER_CLIENT_ID);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("scope", "read_write");
    authorizeUrl.searchParams.set("state", state);
    // mode is optional — Razorpay infers from the client_id, but passing it is explicit
    authorizeUrl.searchParams.set("mode", RAZORPAY_MODE);

    console.log(`[PartnerAuthorize] Generated URL for user ${user_id}`);

    return jsonResp({ authorize_url: authorizeUrl.toString() });
  } catch (err: any) {
    console.error("[PartnerAuthorize] Unhandled:", err);
    return jsonResp({ error: err.message || "Internal error" }, 500);
  }
});
