import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID")!;
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const rzpAuth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);

// ── Razorpay API helpers ──

async function rzpPost(path: string, body: Record<string, any>) {
  const resp = await fetch(`https://api.razorpay.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${rzpAuth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!resp.ok) {
    console.error(`[RZP] POST ${path} failed:`, data);
    throw new Error(data.error?.description || `Razorpay API error on ${path}`);
  }
  return data;
}

async function rzpGet(path: string) {
  const resp = await fetch(`https://api.razorpay.com${path}`, {
    headers: { Authorization: `Basic ${rzpAuth}` },
  });
  return await resp.json();
}

// ── Main handler ──

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json();
    const { user_id, action } = body;

    if (!user_id) {
      return jsonResp({ error: "user_id is required" }, 400);
    }

    // ── Check status of existing account ──
    if (action === "check_status") {
      return await handleCheckStatus(supabase, user_id);
    }

    // ── Create new Razorpay Route linked account ──
    return await handleCreateAccount(supabase, user_id, body);
  } catch (err: any) {
    console.error("[CreateRazorpayAccount] Error:", err);
    return jsonResp({ error: err.message || "Internal server error" }, 500);
  }
});

// ── Check activation status ──

async function handleCheckStatus(supabase: any, userId: string) {
  const { data: settings } = await supabase
    .from("payment_settings")
    .select("razorpay_account_id, razorpay_account_status")
    .eq("user_id", userId)
    .maybeSingle();

  if (!settings?.razorpay_account_id) {
    return jsonResp({ status: "not_created" });
  }

  // Fetch latest status from Razorpay
  const account = await rzpGet(`/v2/accounts/${settings.razorpay_account_id}`);
  const newStatus = account.status || settings.razorpay_account_status;

  // Update local status if changed
  if (newStatus !== settings.razorpay_account_status) {
    await supabase
      .from("payment_settings")
      .update({
        razorpay_account_status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
  }

  return jsonResp({
    account_id: settings.razorpay_account_id,
    status: newStatus,
  });
}

// ── Create linked account + stakeholder + request Route product ──

async function handleCreateAccount(supabase: any, userId: string, body: any) {
  const { business, bank } = body;

  if (!business || !bank) {
    return jsonResp({ error: "business and bank details are required" }, 400);
  }

  // Check if account already exists
  const { data: existing } = await supabase
    .from("payment_settings")
    .select("razorpay_account_id, razorpay_account_status")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing?.razorpay_account_id) {
    return jsonResp({
      account_id: existing.razorpay_account_id,
      status: existing.razorpay_account_status,
      message: "Account already exists",
    });
  }

  console.log(`[CreateRazorpayAccount] Creating for user ${userId}: ${business.legal_business_name}`);

  // Step 1: Create Razorpay linked account
  const account = await rzpPost("/v2/accounts", {
    email: business.email,
    phone: business.phone,
    legal_business_name: business.legal_business_name,
    business_type: business.business_type || "proprietorship",
    contact_name: business.contact_name,
    profile: {
      category: "services",
      subcategory: "professional_services",
      addresses: {
        registered: {
          street1: business.address?.street1 || "N/A",
          city: business.address?.city || "N/A",
          state: business.address?.state || "N/A",
          postal_code: business.address?.postal_code
            ? Number(business.address.postal_code)
            : 560001,
          country: business.address?.country || "IN",
        },
      },
    },
    legal_info: {
      ...(business.pan && { pan: business.pan }),
      ...(business.gst && { gst: business.gst }),
    },
    notes: {
      platform: "aczen_bilz",
      user_id: userId,
    },
  });

  const accountId = account.id;
  console.log(`[CreateRazorpayAccount] Account created: ${accountId}`);

  // Step 2: Create stakeholder (for KYC)
  try {
    await rzpPost(`/v2/accounts/${accountId}/stakeholders`, {
      name: business.contact_name,
      phone: { primary: business.phone },
      email: business.email,
    });
    console.log(`[CreateRazorpayAccount] Stakeholder created for ${accountId}`);
  } catch (err: any) {
    console.warn(`[CreateRazorpayAccount] Stakeholder creation warning: ${err.message}`);
    // Non-fatal — account still works, KYC may be delayed
  }

  // Step 3: Request Route product with bank settlement details
  let productId: string | null = null;
  try {
    const product = await rzpPost(`/v2/accounts/${accountId}/products`, {
      product_name: "route",
      requested_configuration: {
        payment_capture: "automatic",
        settlements: {
          account_number: bank.account_number,
          ifsc_code: bank.ifsc_code,
          beneficiary_name: bank.beneficiary_name,
        },
      },
    });
    productId = product.id || null;
    console.log(`[CreateRazorpayAccount] Route product requested: ${productId}`);
  } catch (err: any) {
    console.warn(`[CreateRazorpayAccount] Product config warning: ${err.message}`);
    // Non-fatal — can be configured later via Razorpay dashboard
  }

  // Step 4: Save to Supabase
  const { error: dbError } = await supabase.from("payment_settings").upsert(
    {
      user_id: userId,
      razorpay_account_id: accountId,
      razorpay_account_status: account.status || "created",
      razorpay_product_id: productId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (dbError) {
    console.error("[CreateRazorpayAccount] DB save error:", dbError);
    // Account was created in Razorpay even if DB save fails — log the ID
    return jsonResp({
      account_id: accountId,
      status: account.status || "created",
      warning: "Account created but failed to save locally. Contact support with account ID.",
    });
  }

  console.log(`[CreateRazorpayAccount] Saved. Account ${accountId} status: ${account.status}`);

  return jsonResp({
    account_id: accountId,
    status: account.status || "created",
    product_id: productId,
  });
}

// ── Utility ──

function jsonResp(body: Record<string, any>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
