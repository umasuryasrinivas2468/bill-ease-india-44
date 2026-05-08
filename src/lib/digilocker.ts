// ═══════════════════════════════════════════════════════════════════
// DigiLocker / MeriPehchaan OAuth helpers
//
// Handles PKCE (S256) verifier+challenge generation, authorize URL
// construction, sessionStorage persistence of the verifier across the
// redirect roundtrip, and the call to the `digilocker-oauth-exchange`
// edge function which holds the client_secret.
//
// Spec: Requester-MeriPehchaan-APISpecification-V2.3
// ═══════════════════════════════════════════════════════════════════

const AUTHORIZE_URL =
  'https://digilocker.meripehchaan.gov.in/public/oauth2/1/authorize';

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://vhntnkvtzmerpdhousfr.supabase.co';
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZobnRua3Z0em1lcnBkaG91c2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgxMTEyMTEsImV4cCI6MjA2MzY4NzIxMX0.sQ5Xz5RrCrDJoJHpNC9RzqFNb05Qi4gsFL5PrntlV4k';

// Public DigiLocker partner client id. Same value across users; the
// secret stays server-side in the edge function.
export const DIGILOCKER_CLIENT_ID =
  (import.meta.env.VITE_DIGILOCKER_CLIENT_ID as string | undefined) ||
  'OR395A6BB5';

// Where MeriPehchaan redirects after the user completes auth. Must
// match the URI registered with DigiLocker on the partner portal.
export const DIGILOCKER_REDIRECT_URI =
  (import.meta.env.VITE_DIGILOCKER_REDIRECT_URI as string | undefined) ||
  'https://www.app.aczen.in/dashboard';

const VERIFIER_STORAGE_KEY = 'digilocker.code_verifier';
const STATE_STORAGE_KEY = 'digilocker.state';

const UNRESERVED =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

function randomString(len: number): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < len; i++) out += UNRESERVED[bytes[i] % UNRESERVED.length];
  return out;
}

function base64UrlEncode(bytes: ArrayBuffer): string {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function sha256(input: string): Promise<ArrayBuffer> {
  const data = new TextEncoder().encode(input);
  return crypto.subtle.digest('SHA-256', data);
}

export interface AuthorizeRequest {
  // 'kyc' is the one used by Aczen — surfaced as such on the consent screen.
  purpose?: 'kyc' | 'verification' | 'compliance' | 'availing_services' | 'educational';
  // Which authentic content recognition to require. Aadhaar+PAN both
  // accepted by the spec; the existing prod URL passes "pan aadhaar".
  acr?: string;
}

export async function buildAuthorizeUrl(
  opts: AuthorizeRequest = {},
): Promise<string> {
  const verifier = randomString(64);
  const state = randomString(32);
  const challengeBytes = await sha256(verifier);
  const challenge = base64UrlEncode(challengeBytes);

  sessionStorage.setItem(VERIFIER_STORAGE_KEY, verifier);
  sessionStorage.setItem(STATE_STORAGE_KEY, state);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: DIGILOCKER_CLIENT_ID,
    redirect_uri: DIGILOCKER_REDIRECT_URI,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    scope: 'openid',
    acr: opts.acr ?? 'pan aadhaar',
    purpose: opts.purpose ?? 'kyc',
    // Signup-friendly defaults: send users without a DigiLocker account
    // straight to the signup screen and skip the username-pick step.
    dl_flow: 'signup',
    amr: 'aadhaar pan',
    ulsignup: 'Y',
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export interface PendingCallback {
  code: string;
  state: string;
}

// Pulls the OAuth callback parameters from the current URL. Returns
// null if nothing is present so the caller can no-op cheaply.
export function readCallbackFromUrl(): PendingCallback | null {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state) return null;
  return { code, state };
}

export function clearCallbackFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  url.searchParams.delete('error');
  url.searchParams.delete('error_description');
  window.history.replaceState({}, '', url.toString());
}

export function consumeStoredVerifier(): { verifier: string; state: string } | null {
  const verifier = sessionStorage.getItem(VERIFIER_STORAGE_KEY);
  const state = sessionStorage.getItem(STATE_STORAGE_KEY);
  if (!verifier || !state) return null;
  sessionStorage.removeItem(VERIFIER_STORAGE_KEY);
  sessionStorage.removeItem(STATE_STORAGE_KEY);
  return { verifier, state };
}

export interface DigiLockerKyc {
  digilockerid: string;
  fullName: string;
  pan: string;
  maskedAadhaar: string;
  drivingLicence: string;
  dob: string;
  gender: string;
  mobile: string;
  email: string;
  eaadhaar: string;
  referenceKey: string;
  consentValidTill: number | null;
  verifiedAt: string;
}

export async function exchangeCodeForKyc(
  code: string,
  codeVerifier: string,
): Promise<DigiLockerKyc> {
  const resp = await fetch(
    `${SUPABASE_URL}/functions/v1/digilocker-oauth-exchange`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ code, code_verifier: codeVerifier }),
    },
  );
  const result = await resp.json();
  if (!resp.ok || !result.kyc) {
    throw new Error(
      result?.details?.error_description ||
        result?.message ||
        result?.error ||
        'DigiLocker token exchange failed',
    );
  }
  return result.kyc as DigiLockerKyc;
}
