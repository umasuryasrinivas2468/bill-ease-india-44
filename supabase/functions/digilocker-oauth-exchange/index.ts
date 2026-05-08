import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ═══════════════════════════════════════════════════════════════════
// digilocker-oauth-exchange
//
// Exchanges a DigiLocker OAuth `code` (from /oauth2/1/authorize) for an
// access_token + id_token, decodes the OpenID id_token JWT, and returns
// the verified KYC claims (name, pan, masked aadhaar, dob, mobile, email).
//
// The frontend cannot call DigiLocker's /token endpoint directly because
// it requires `client_secret`. This edge function holds the secret.
//
// Required Supabase secrets:
//   DIGILOCKER_CLIENT_ID
//   DIGILOCKER_CLIENT_SECRET
//   DIGILOCKER_REDIRECT_URI    — must match the URI registered with
//                                MeriPehchaan (e.g. https://app.aczen.in/dashboard)
//
// Spec reference: Requester-MeriPehchaan-APISpecification-V2.3, "Get
// Access Token (openid connect protocol)" — POST to /public/oauth2/2/token
// with grant_type=authorization_code + PKCE code_verifier.
// ═══════════════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TOKEN_URL =
  "https://digilocker.meripehchaan.gov.in/public/oauth2/2/token";

const CLIENT_ID = (Deno.env.get("DIGILOCKER_CLIENT_ID") || "").trim();
const CLIENT_SECRET = (Deno.env.get("DIGILOCKER_CLIENT_SECRET") || "").trim();
const REDIRECT_URI = (Deno.env.get("DIGILOCKER_REDIRECT_URI") || "").trim();

function jsonResp(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Decode a JWT payload (no signature verification — DigiLocker is a
// trusted issuer reached over HTTPS, so we trust the channel; signature
// verification would require fetching their JWKS).
function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("Malformed id_token");
  const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const json = atob(padded);
  return JSON.parse(json);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResp({ error: "method_not_allowed" }, 405);
  }

  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    return jsonResp(
      {
        error: "config_error",
        message:
          "DigiLocker credentials not configured. Set DIGILOCKER_CLIENT_ID, DIGILOCKER_CLIENT_SECRET, DIGILOCKER_REDIRECT_URI.",
      },
      500,
    );
  }

  let body: { code?: string; code_verifier?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResp({ error: "invalid_json" }, 400);
  }

  const { code, code_verifier } = body;
  if (!code || !code_verifier) {
    return jsonResp(
      { error: "missing_params", message: "code and code_verifier required" },
      400,
    );
  }

  const form = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    code_verifier,
  });

  let tokenJson: Record<string, unknown>;
  try {
    const resp = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const text = await resp.text();
    try {
      tokenJson = JSON.parse(text);
    } catch {
      return jsonResp(
        { error: "non_json_response", status: resp.status, body: text.slice(0, 500) },
        502,
      );
    }
    if (!resp.ok) {
      return jsonResp(
        { error: "digilocker_error", status: resp.status, details: tokenJson },
        resp.status,
      );
    }
  } catch (err) {
    return jsonResp(
      { error: "network_error", message: (err as Error).message },
      502,
    );
  }

  const idToken = tokenJson.id_token as string | undefined;
  let idClaims: Record<string, unknown> = {};
  if (idToken) {
    try {
      idClaims = decodeJwtPayload(idToken);
    } catch (err) {
      return jsonResp(
        { error: "id_token_parse_error", message: (err as Error).message },
        502,
      );
    }
  }

  // Map both top-level token response fields and id_token claims into
  // a normalised KYC payload the frontend can consume directly.
  const kyc = {
    digilockerid:
      (tokenJson.digilockerid as string | undefined) ??
      (idClaims.user_sso_id as string | undefined) ??
      "",
    fullName:
      (idClaims.given_name as string | undefined) ??
      (tokenJson.name as string | undefined) ??
      "",
    pan: (idClaims.pan_number as string | undefined) ?? "",
    maskedAadhaar: (idClaims.masked_aadhaar as string | undefined) ?? "",
    drivingLicence: (idClaims.driving_licence as string | undefined) ?? "",
    dob:
      (idClaims.birthdate as string | undefined) ??
      (tokenJson.dob as string | undefined) ??
      "",
    gender: (tokenJson.gender as string | undefined) ?? "",
    mobile: (idClaims.phone_number as string | undefined) ?? "",
    email: (idClaims.email as string | undefined) ?? "",
    eaadhaar: (tokenJson.eaadhaar as string | undefined) ?? "N",
    referenceKey: (tokenJson.reference_key as string | undefined) ?? "",
    consentValidTill: tokenJson.consent_valid_till ?? null,
    verifiedAt: new Date().toISOString(),
  };

  return jsonResp({ kyc });
});
