
import { supabase } from '@/integrations/supabase/client';
import type { UserResource } from '@clerk/types';

export const syncUserWithSupabase = async (clerkUser: UserResource) => {
  try {
    const userData = {
      clerk_id: clerkUser.id,
      email: clerkUser.primaryEmailAddress?.emailAddress || '',
      phone_number: clerkUser.primaryPhoneNumber?.phoneNumber || null,
      full_name: clerkUser.fullName || null,
    };

    console.log('Syncing user with Supabase:', userData);

    // Try to upsert the user (insert if new, update if exists)
    const { data, error } = await supabase
      .from('users')
      .upsert(userData, { 
        onConflict: 'clerk_id',
        ignoreDuplicates: false 
      })
      .select()
      .single();

    if (error) {
      console.error('Error syncing user with Supabase:', error);
      return { error };
    }

    console.log('User synced successfully:', data);
    return { data, error: null };
  } catch (error) {
    console.error('Unexpected error syncing user:', error);
    return { error };
  }
};
