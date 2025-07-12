
import { useState, useEffect } from 'react';
import { useAuth } from '@/components/ClerkAuthProvider';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export const useSupabaseUser = () => {
  const { user: clerkUser } = useAuth();
  const [supabaseUser, setSupabaseUser] = useState<Tables<'users'> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSupabaseUser = async () => {
      if (!clerkUser?.id) {
        setSupabaseUser(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('clerk_id', clerkUser.id)
          .single();

        if (error) {
          console.error('Error fetching Supabase user:', error);
          setError(error.message);
        } else {
          setSupabaseUser(data);
          setError(null);
        }
      } catch (err) {
        console.error('Unexpected error:', err);
        setError('Failed to fetch user data');
      } finally {
        setLoading(false);
      }
    };

    fetchSupabaseUser();
  }, [clerkUser?.id]);

  return { supabaseUser, loading, error };
};
