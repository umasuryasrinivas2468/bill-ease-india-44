
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vhntnkvtzmerpdhousfr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZobnRua3Z0em1lcnBkaG91c2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgxMTEyMTEsImV4cCI6MjA2MzY4NzIxMX0.sQ5Xz5RrCrDJoJHpNC9RzqFNb05Qi4gsFL5PrntlV4k';

let supabaseClient: SupabaseClient | null = null;
let currentToken: string | null = null;

/**
 * Creates a custom fetch function that attaches the Clerk JWT token
 * to all Supabase requests as an Authorization Bearer token.
 */
const createAuthFetch = (token: string | null) => {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers || {});
    
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    
    return fetch(input, { ...init, headers });
  };
};

/**
 * Gets the current Clerk JWT token for Supabase authentication.
 * Uses the 'supabase' JWT template configured in Clerk.
 */
export const getClerkToken = async (): Promise<string | null> => {
  try {
    const clerk = (window as any)?.Clerk;
    
    if (!clerk) {
      console.debug('[supabaseClient] Clerk not available');
      return null;
    }

    // Wait for Clerk to be loaded
    if (!clerk.loaded) {
      await new Promise<void>((resolve) => {
        clerk.load().then(() => resolve()).catch(() => resolve());
      });
    }

    // Try different methods to get the token
    if (clerk.session?.getToken) {
      const token = await clerk.session.getToken({ template: 'supabase' });
      return token;
    } else if (clerk.getToken) {
      const token = await clerk.getToken({ template: 'supabase' });
      return token;
    }
    
    return null;
  } catch (e) {
    console.warn('[supabaseClient] Failed to get Clerk token:', e);
    return null;
  }
};

/**
 * Creates or recreates the Supabase client with the current auth token.
 * This should be called after login/logout to ensure the latest token is used.
 */
export const createSupabaseClient = (token: string | null): SupabaseClient => {
  currentToken = token;
  
  supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      fetch: createAuthFetch(token),
    },
    auth: {
      persistSession: false, // We're using Clerk for session management
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  
  return supabaseClient;
};

/**
 * Gets the current Supabase client instance.
 * Creates a new one if it doesn't exist.
 */
export const getSupabaseClient = (): SupabaseClient => {
  if (!supabaseClient) {
    supabaseClient = createSupabaseClient(null);
  }
  return supabaseClient;
};

/**
 * Refreshes the Supabase client with a fresh Clerk token.
 * Call this when you need to ensure the latest token is being used.
 */
export const refreshSupabaseClient = async (): Promise<SupabaseClient> => {
  const token = await getClerkToken();
  return createSupabaseClient(token);
};

/**
 * Updates the Supabase client with a new token.
 * Use this when the Clerk session changes.
 */
export const updateSupabaseToken = (token: string | null): SupabaseClient => {
  if (token !== currentToken) {
    return createSupabaseClient(token);
  }
  return getSupabaseClient();
};

// Initialize with null token - will be updated when Clerk loads
export const supabase = getSupabaseClient();

// Export for backwards compatibility
export default supabase;
