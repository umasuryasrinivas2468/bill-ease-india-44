
/**
 * Dynamically attach Clerk's JWT to every Supabase request so RLS can use the `sub` claim.
 * This works without React hooks by reading the global Clerk object.
 */

type FetchLike = typeof fetch;

async function tryGetClerkToken(): Promise<string | undefined> {
  try {
    const anyWindow = window as any;
    const Clerk = anyWindow?.Clerk;

    // Prefer session-scoped token if available
    const session = Clerk?.session;
    if (session?.getToken) {
      // Try a template token first if one is configured in Clerk; fall back to default
      const templateToken = await session.getToken({ template: 'supabase' }).catch(() => undefined);
      if (templateToken) return templateToken;

      const defaultToken = await session.getToken().catch(() => undefined);
      if (defaultToken) return defaultToken;
    }

    // Fallback: use the client-level getToken if present
    if (Clerk?.getToken) {
      const templateToken = await Clerk.getToken({ template: 'supabase' }).catch(() => undefined);
      if (templateToken) return templateToken;

      const defaultToken = await Clerk.getToken().catch(() => undefined);
      if (defaultToken) return defaultToken;
    }
  } catch (e) {
    console.warn('[supabaseAuthFetch] Could not retrieve Clerk token:', e);
  }
  return undefined;
}

export const supabaseAuthFetch: FetchLike = async (input: RequestInfo | URL, init?: RequestInit) => {
  const token = await tryGetClerkToken();

  const headers = new Headers(init?.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Optional: Identify client for debugging
  headers.set('X-Client-Name', 'aczen-bilz-web');

  return fetch(input, {
    ...init,
    headers,
  });
};
