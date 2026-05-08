import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ═══════════════════════════════════════════════════════════════════
// cashfree-reverse-penny-drop
// - Bank account verification via Cashfree's Reverse Penny Drop (VRS v2)
//   create: POST /verification/reverse-penny-drop
//   status: GET  /verification/remitter/status
//   https://www.cashfree.com/docs/api-reference/vrs/v2/reverse-penny-drop
// - The user pays ₹1 from any UPI app (we hand them a QR + intent links);
//   on SUCCESS Cashfree returns name_at_bank, bank_account, ifsc, utr,
//   name_match_score, etc.
// - Single function with two actions:
//     POST { action: "create", verification_id, name? }
//     POST { action: "status", verification_id | ref_id }
// ═══════════════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CASHFREE_CLIENT_ID = (Deno.env.get("CASHFREE_CLIENT_ID") ?? "").trim();
const CASHFREE_CLIENT_SECRET = (Deno.env.get("CASHFREE_CLIENT_SECRET") ?? "").trim();
const CASHFREE_BASE_URL = (Deno.env.get("CASHFREE_BASE_URL") ?? "https://api.cashfree.com")
  .trim()
  .replace(/\/+$/, "");

function jsonResp(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cashfreeHeaders(): HeadersInit {
  return {
    "x-client-id": CASHFREE_CLIENT_ID,
    "x-client-secret": CASHFREE_CLIENT_SECRET,
    "Content-Type": "application/json",
  };
}

function misconfigured(): boolean {
  return !CASHFREE_CLIENT_ID || !CASHFREE_CLIENT_SECRET;
}

async function createRpd(payload: { verification_id: string; name?: string }) {
  const body: Record<string, unknown> = { verification_id: payload.verification_id };
  if (payload.name) body.name = payload.name;

  const resp = await fetch(`${CASHFREE_BASE_URL}/verification/reverse-penny-drop`, {
    method: "POST",
    headers: cashfreeHeaders(),
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

async function statusRpd(params: { verification_id?: string; ref_id?: string | number }) {
  const search = new URLSearchParams();
  if (params.ref_id != null) search.set("ref_id", String(params.ref_id));
  if (params.verification_id) search.set("verification_id", params.verification_id);
  const resp = await fetch(
    `${CASHFREE_BASE_URL}/verification/remitter/status?${search.toString()}`,
    { headers: cashfreeHeaders() },
  );
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResp({ success: false, error: "Method not allowed" }, 405);
  }

  if (misconfigured()) {
    return jsonResp(
      {
        success: false,
        error: "CASHFREE_CLIENT_ID / CASHFREE_CLIENT_SECRET not set on the edge function. Configure them via `supabase secrets set`.",
      },
      500,
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return jsonResp({ success: false, error: "Invalid JSON body" }, 400);
  }

  const action = String(payload.action ?? "").toLowerCase();

  try {
    if (action === "create") {
      const verification_id = payload.verification_id ? String(payload.verification_id) : "";
      if (!verification_id) {
        return jsonResp({ success: false, error: "verification_id is required" }, 400);
      }
      const result = await createRpd({
        verification_id,
        name: payload.name ? String(payload.name) : undefined,
      });
      if (!result.ok) {
        console.error("[cashfree-rpd create] non-OK", result.status, result.data);
        return jsonResp({ success: false, error: result.data }, result.status);
      }
      return jsonResp({ success: true, data: result.data });
    }

    if (action === "status") {
      const verification_id = payload.verification_id ? String(payload.verification_id) : undefined;
      const ref_id = payload.ref_id != null ? String(payload.ref_id) : undefined;
      if (!verification_id && !ref_id) {
        return jsonResp(
          { success: false, error: "verification_id or ref_id is required" },
          400,
        );
      }
      const result = await statusRpd({ verification_id, ref_id });
      if (!result.ok) {
        console.error("[cashfree-rpd status] non-OK", result.status, result.data);
        return jsonResp({ success: false, error: result.data }, result.status);
      }
      return jsonResp({ success: true, data: result.data });
    }

    return jsonResp(
      { success: false, error: `Unknown action "${action}". Use "create" or "status".` },
      400,
    );
  } catch (err) {
    console.error("[cashfree-rpd] error:", err);
    return jsonResp(
      { success: false, error: err instanceof Error ? err.message : "Internal error" },
      500,
    );
  }
});
