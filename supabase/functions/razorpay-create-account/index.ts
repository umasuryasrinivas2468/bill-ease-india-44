import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ═══════════════════════════════════════════════════════════════════
// razorpay-create-account  (Custom Onboarding SDK – Step 3)
//
// Takes vendor-supplied KYC pre-fill data, mints a partner-level
// `client_credentials` bearer token, and creates a Razorpay sub-merchant
// account via /v2/accounts. The returned `acc_xxx` is stored on
// payment_settings so the subsequent OAuth authorize step can attach
// an onboarding_signature.
//
// Required Supabase secrets:
//   RAZORPAY_PARTNER_CLIENT_ID
//   RAZORPAY_PARTNER_CLIENT_SECRET
//   RAZORPAY_MODE   ("test" or "live", defaults to live)
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
const RAZORPAY_MODE = (Deno.env.get("RAZORPAY_MODE") || "live").trim();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function jsonResp(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Mint a partner-level access token for server-to-server onboarding APIs.
// Distinct from the per-vendor token we get via authorization_code grant.
async function getPartnerAccessToken(): Promise<string> {
  const resp = await fetch("https://auth.razorpay.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: RAZORPAY_PARTNER_CLIENT_ID,
      client_secret: RAZORPAY_PARTNER_CLIENT_SECRET,
      grant_type: "client_credentials",
      mode: RAZORPAY_MODE,
    }),
  });
  const data = await resp.json();
  if (!resp.ok || !data.access_token) {
    throw new Error(
      data.error_description ||
        data.error?.description ||
        data.error ||
        "Failed to mint partner access token",
    );
  }
  return data.access_token as string;
}

interface KycInput {
  email: string;
  phone: string;
  legal_business_name: string;
  business_type:
    | "proprietorship"
    | "partnership"
    | "private_limited"
    | "public_limited"
    | "llp"
    | "ngo"
    | "trust"
    | "society"
    | "huf"
    | "individual"
    | "not_yet_registered";
  contact_name?: string;
  customer_facing_business_name?: string;
  business_pan?: string;
  reference_id?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { user_id, kyc } = (await req.json()) as {
      user_id?: string;
      kyc?: KycInput;
    };

    if (!user_id) return jsonResp({ error: "user_id is required" }, 400);
    if (!kyc) return jsonResp({ error: "kyc payload is required" }, 400);

    if (
      !kyc.email ||
      !kyc.phone ||
      !kyc.legal_business_name ||
      !kyc.business_type
    ) {
      return jsonResp(
        {
          error:
            "email, phone, legal_business_name, and business_type are required",
        },
        400,
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Block re-creation if vendor is already linked
    const { data: existing } = await supabase
      .from("payment_settings")
      .select("razorpay_account_id, razorpay_access_token")
      .eq("user_id", user_id)
      .maybeSingle();

    if (existing?.razorpay_access_token) {
      return jsonResp(
        {
          error:
            "Razorpay account already linked. Disconnect first to re-onboard.",
          already_linked: true,
        },
        409,
      );
    }

    // If the user previously created a sub-merchant account but never finished
    // OAuth, reuse that acc_xxx instead of duplicating.
    if (existing?.razorpay_account_id) {
      return jsonResp({
        razorpay_account_id: existing.razorpay_account_id,
        reused: true,
      });
    }

    const partnerToken = await getPartnerAccessToken();

    const accountPayload: Record<string, unknown> = {
      email: kyc.email,
      phone: kyc.phone,
      legal_business_name: kyc.legal_business_name,
      business_type: kyc.business_type,
      type: "standard",
      reference_id: kyc.reference_id || user_id,
    };
    if (kyc.contact_name) accountPayload.contact_name = kyc.contact_name;
    if (kyc.customer_facing_business_name) {
      accountPayload.customer_facing_business_name =
        kyc.customer_facing_business_name;
    }
    if (kyc.business_pan) {
      accountPayload.legal_info = { pan: kyc.business_pan };
    }

    const acctResp = await fetch("https://api.razorpay.com/v2/accounts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${partnerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(accountPayload),
    });
    const acctData = await acctResp.json();

    if (!acctResp.ok) {
      console.error("[CreateAccount] Razorpay error:", acctData);
      return jsonResp(
        {
          error:
            acctData.error?.description ||
            acctData.error?.code ||
            "Razorpay account creation failed",
          razorpay_raw: acctData,
        },
        400,
      );
    }

    const accountId = acctData.id as string;
    if (!accountId || !accountId.startsWith("acc_")) {
      return jsonResp({ error: "Malformed account response from Razorpay" }, 500);
    }

    // Persist the acc_xxx so the authorize step can build onboarding_signature.
    const { error: upsertErr } = await supabase.from("payment_settings").upsert(
      {
        user_id,
        razorpay_account_id: accountId,
        razorpay_account_status: "created",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (upsertErr) {
      console.error("[CreateAccount] DB upsert error:", upsertErr);
      return jsonResp(
        { error: "Account created but failed to save locally" },
        500,
      );
    }

    console.log(
      `[CreateAccount] User ${user_id} → Razorpay account ${accountId}`,
    );

    return jsonResp({
      razorpay_account_id: accountId,
      status: acctData.status || "created",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[CreateAccount] Unhandled:", err);
    return jsonResp({ error: message }, 500);
  }
});
