
import { useEffect, useState, useCallback } from 'react';
import { useUser, useSession } from '@clerk/clerk-react';
import { SupabaseClient } from '@supabase/supabase-js';
import { 
  getSupabaseClient, 
  updateSupabaseToken, 
  getClerkToken 
} from '@/lib/supabaseClient';

/**
 * Hook that provides a Supabase client that automatically updates
 * when the Clerk authentication state changes.
 * 
 * This ensures the Supabase client always has the latest JWT token
 * for authenticated requests.
 */
export const useSupabaseClient = () => {
  const { user, isLoaded: isUserLoaded } = useUser();
  const { session, isLoaded: isSessionLoaded } = useSession();
  const [client, setClient] = useState<SupabaseClient>(getSupabaseClient());
  const [isReady, setIsReady] = useState(false);

  const refreshClient = useCallback(async () => {
    if (!isUserLoaded || !isSessionLoaded) {
      return;
    }

    try {
      if (session) {
        // Get fresh token from Clerk
        const token = await session.getToken({ template: 'supabase' });
        const updatedClient = updateSupabaseToken(token);
        setClient(updatedClient);
        console.debug('[useSupabaseClient] Client updated with new token');
      } else {
        // No session, use anonymous client
        const updatedClient = updateSupabaseToken(null);
        setClient(updatedClient);
        console.debug('[useSupabaseClient] Client updated without token (anonymous)');
      }
      setIsReady(true);
    } catch (error) {
      console.error('[useSupabaseClient] Error refreshing client:', error);
      setIsReady(true);
    }
  }, [session, isUserLoaded, isSessionLoaded]);

  // Refresh client when auth state changes
  useEffect(() => {
    refreshClient();
  }, [refreshClient, user?.id, session?.id]);

  // Set up token refresh interval (tokens expire, so we need to refresh periodically)
  useEffect(() => {
    if (!session) return;

    // Refresh token every 50 minutes (Clerk tokens typically expire in 60 minutes)
    const intervalId = setInterval(async () => {
      try {
        const token = await session.getToken({ template: 'supabase' });
        updateSupabaseToken(token);
        console.debug('[useSupabaseClient] Token refreshed on interval');
      } catch (error) {
        console.error('[useSupabaseClient] Error refreshing token on interval:', error);
      }
    }, 50 * 60 * 1000); // 50 minutes

    return () => clearInterval(intervalId);
  }, [session]);

  return { 
    supabase: client, 
    isReady,
    refreshClient 
  };
};

export default useSupabaseClient;
