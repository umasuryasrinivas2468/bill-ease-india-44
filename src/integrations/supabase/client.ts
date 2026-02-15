// This file re-exports the centralized Supabase client that includes Clerk JWT authentication
// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export { supabase, getSupabaseClient, refreshSupabaseClient, updateSupabaseToken } from '@/lib/supabaseClient';