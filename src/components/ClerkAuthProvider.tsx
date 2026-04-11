
import React, { createContext, useContext, useEffect } from 'react';
import { useUser, useAuth as useClerkAuth } from '@clerk/clerk-react';
import type { UserResource } from '@clerk/types';
import { syncUserWithSupabase } from '@/utils/userSync';

interface AuthContextType {
  user: UserResource | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoaded } = useUser();
  const { signOut: clerkSignOut } = useClerkAuth();

  // Sync user with Supabase when user is loaded and authenticated
  useEffect(() => {
    if (isLoaded && user) {
      console.log('User loaded, syncing with Supabase:', user.id);
      syncUserWithSupabase(user);
    }
  }, [user, isLoaded]);

  const signOut = async (): Promise<void> => {
    await clerkSignOut();
  };

  const value = {
    user: user || null,
    loading: !isLoaded,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
