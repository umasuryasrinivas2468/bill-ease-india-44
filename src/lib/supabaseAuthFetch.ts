
/**
 * Custom fetch that automatically attaches the Clerk JWT to Supabase requests.
 * This is required for Supabase Row Level Security (RLS) to identify the user.
 *
 * It expects a Clerk JWT template named "supabase" to be configured in Clerk.
 */
export async function supabaseAuthFetch(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(init?.headers || {});
  let token: string | null = null;

  try {
    // Access Clerk from the global object
    const clerk = (window as any)?.Clerk;

    if (clerk?.session?.getToken) {
      token = await clerk.session.getToken({ template: 'supabase' }).catch(() => null);
    } else if (clerk?.getToken) {
      // Fallback for older Clerk APIs
      token = await clerk.getToken({ template: 'supabase' }).catch(() => null);
    }

    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
      // Helpful for debugging once:
      // console.debug('[supabaseAuthFetch] Attached Clerk JWT to request');
    } else {
      // console.debug('[supabaseAuthFetch] No Clerk token available for this request');
    }
  } catch (e) {
    // console.warn('[supabaseAuthFetch] Failed to attach Clerk token', e);
  }

  return fetch(input, { ...init, headers });
}
