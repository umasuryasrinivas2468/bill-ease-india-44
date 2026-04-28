import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ═══════════════════════════════════════════════════════════════════
// razorpay-partner-authorize  (Custom Onboarding SDK – Step 4)
// Generates the Razorpay OAuth authorize URL for sub-merchant onboarding.
// When called with a previously-created submerchant_id (acc_xxx) it also
// computes an `onboarding_signature` so Razorpay accepts the KYC pre-fill.
//
// Required Supabase secrets:
//   RAZORPAY_PARTNER_CLIENT_ID
//   RAZORPAY_PARTNER_CLIENT_SECRET   (used to HMAC the onboarding_signature)
//   APP_URL          — must match the whitelisted redirect_uri in Razorpay
//   RAZORPAY_MODE    — "test" or "live"  (defaults to "live")
// ═══════════════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const RAZORPAY_PARTNER_CLIENT_ID = (Deno.env.get(
  "RAZORPAY_PARTNER_CLIENT_ID",
) || "").trim();
const RAZORPAY_PARTNER_CLIENT_SECRET = (Deno.env.get(
  "RAZORPAY_PARTNER_CLIENT_SECRET",
) || "").trim();
const APP_URL = (Deno.env.get("APP_URL") || "https://app.aczen.in").trim();
const RAZORPAY_MODE = (Deno.env.get("RAZORPAY_MODE") || "live").trim();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function jsonResp(body: Record<string, unknown>, status = 200) {
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

// HMAC-SHA256(`submerchant_id|timestamp`, client_secret) → hex.
// Razorpay's onboarding signature is a partner-side proof that the pre-filled
// account was provisioned by us, not forged by the user in the URL.
async function generateOnboardingSignature(
  submerchantId: string,
  timestamp: number,
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(RAZORPAY_PARTNER_CLIENT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(`${submerchantId}|${timestamp}`),
  );
  return Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { user_id, submerchant_id } = (await req.json()) as {
      user_id?: string;
      submerchant_id?: string;
    };
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
      return jsonResp(
        {
          error:
            "Razorpay account already linked. Disconnect first to re-onboard.",
          already_linked: true,
        },
        409,
      );
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
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", RAZORPAY_PARTNER_CLIENT_ID);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    // Custom Onboarding SDK requires write access to create payments/refunds.
    authorizeUrl.searchParams.set("scope", "read_write");
    authorizeUrl.searchParams.set("state", state);

    // Resolve which acc_xxx (if any) this onboarding is attached to. Prefer
    // the caller-supplied value; fall back to whatever we already saved.
    const accountId = submerchant_id || existing?.razorpay_account_id || null;

    if (accountId) {
      // Razorpay docs: pass the id WITHOUT the "acc_" prefix to the signature.
      const bareId = accountId.startsWith("acc_")
        ? accountId.slice(4)
        : accountId;
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = await generateOnboardingSignature(bareId, timestamp);
      authorizeUrl.searchParams.set("onboarding_signature", signature);
      // Razorpay requires the same submerchant id and timestamp the signature
      // was computed against, so redirects can validate it.
      authorizeUrl.searchParams.set("submerchant_id", bareId);
      authorizeUrl.searchParams.set("timestamp", String(timestamp));
    }

    console.log(
      `[PartnerAuthorize] user=${user_id} acc=${accountId ?? "none"} signed=${!!accountId}`,
    );

    return jsonResp({
      authorize_url: authorizeUrl.toString(),
      submerchant_id: accountId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[PartnerAuthorize] Unhandled:", err);
    return jsonResp({ error: message }, 500);
  }
});
