
import { supabase } from '@/integrations/supabase/client';
import type { UserResource } from '@clerk/types';

export const syncUserWithSupabase = async (clerkUser: UserResource) => {
  try {
    const email = clerkUser.primaryEmailAddress?.emailAddress || '';
    const clerkId = clerkUser.id;

    // First try to find existing user by clerk_id
    const { data: existingByClerk } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_id', clerkId)
      .maybeSingle();

    if (existingByClerk) {
      // Update existing user
      const { data, error } = await supabase
        .from('users')
        .update({
          email,
          phone_number: clerkUser.primaryPhoneNumber?.phoneNumber || null,
          full_name: clerkUser.fullName || null,
          updated_at: new Date().toISOString(),
        })
        .eq('clerk_id', clerkId)
        .select()
        .single();

      if (error) {
        console.error('Error updating user in Supabase:', error);
        return { error };
      }
      return { data, error: null };
    }

    // Check if user exists by email (migrated user without clerk_id)
    const { data: existingByEmail } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingByEmail) {
      // Link existing email user to clerk_id
      const { data, error } = await supabase
        .from('users')
        .update({
          clerk_id: clerkId,
          phone_number: clerkUser.primaryPhoneNumber?.phoneNumber || null,
          full_name: clerkUser.fullName || null,
          updated_at: new Date().toISOString(),
        })
        .eq('email', email)
        .select()
        .single();

      if (error) {
        console.error('Error linking user in Supabase:', error);
        return { error };
      }
      return { data, error: null };
    }

    // Insert new user
    const { data, error } = await supabase
      .from('users')
      .insert({
        clerk_id: clerkId,
        email,
        phone_number: clerkUser.primaryPhoneNumber?.phoneNumber || null,
        full_name: clerkUser.fullName || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error inserting user in Supabase:', error);
      return { error };
    }

    console.log('User synced successfully:', data);
    return { data, error: null };
  } catch (error) {
    console.error('Unexpected error syncing user:', error);
    return { error };
  }
};
