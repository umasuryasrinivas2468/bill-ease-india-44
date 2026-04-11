
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useUser, useSession } from '@clerk/clerk-react';
import { SupabaseClient } from '@supabase/supabase-js';
import { 
  getSupabaseClient, 
  updateSupabaseToken,
  createSupabaseClient 
} from '@/lib/supabaseClient';

interface SupabaseContextType {
  supabase: SupabaseClient;
  isReady: boolean;
}

const SupabaseContext = createContext<SupabaseContextType | undefined>(undefined);

/**
 * Provider component that manages the Supabase client lifecycle
 * in sync with Clerk authentication state.
 * 
 * This ensures all child components have access to a properly
 * authenticated Supabase client.
 */
export const SupabaseAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoaded: isUserLoaded } = useUser();
  const { session, isLoaded: isSessionLoaded } = useSession();
  const [supabase, setSupabase] = useState<SupabaseClient>(getSupabaseClient());
  const [isReady, setIsReady] = useState(false);

  // Update Supabase client when Clerk session changes
  useEffect(() => {
    const updateClient = async () => {
      if (!isUserLoaded || !isSessionLoaded) {
        return;
      }

      try {
        if (session) {
          // Get fresh token from Clerk session
          const token = await session.getToken({ template: 'supabase' });
          
          if (token) {
            const newClient = updateSupabaseToken(token);
            setSupabase(newClient);
            console.log('[SupabaseAuthProvider] Supabase client updated with Clerk JWT');
          } else {
            console.warn('[SupabaseAuthProvider] No token returned from Clerk');
            const newClient = updateSupabaseToken(null);
            setSupabase(newClient);
          }
        } else {
          // User logged out - reset to anonymous client
          const newClient = updateSupabaseToken(null);
          setSupabase(newClient);
          console.log('[SupabaseAuthProvider] Supabase client reset (user logged out)');
        }
      } catch (error) {
        console.error('[SupabaseAuthProvider] Error updating Supabase client:', error);
        // Fall back to anonymous client on error
        const newClient = updateSupabaseToken(null);
        setSupabase(newClient);
      } finally {
        setIsReady(true);
      }
    };

    updateClient();
  }, [user?.id, session?.id, isUserLoaded, isSessionLoaded]);

  // Set up periodic token refresh
  useEffect(() => {
    if (!session) return;

    const refreshToken = async () => {
      try {
        const token = await session.getToken({ template: 'supabase' });
        if (token) {
          const newClient = updateSupabaseToken(token);
          setSupabase(newClient);
          console.debug('[SupabaseAuthProvider] Token refreshed');
        }
      } catch (error) {
        console.error('[SupabaseAuthProvider] Error refreshing token:', error);
      }
    };

    // Refresh every 50 minutes (tokens typically expire in 60 minutes)
    const intervalId = setInterval(refreshToken, 50 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, [session]);

  return (
    <SupabaseContext.Provider value={{ supabase, isReady }}>
      {children}
    </SupabaseContext.Provider>
  );
};

/**
 * Hook to access the authenticated Supabase client.
 * Must be used within a SupabaseAuthProvider.
 */
export const useSupabase = () => {
  const context = useContext(SupabaseContext);
  if (context === undefined) {
    throw new Error('useSupabase must be used within a SupabaseAuthProvider');
  }
  return context;
};

export default SupabaseAuthProvider;
